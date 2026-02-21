// agent.js — Visitor class: state machine, steering, target selection

const AgentState = {
    ENTERING: 'ENTERING',
    WALKING: 'WALKING',
    VIEWING: 'VIEWING',
    EXITING: 'EXITING',
    DONE: 'DONE',
};

let _agentIdCounter = 0;

class Visitor {
    constructor() {
        this.id = _agentIdCounter++;

        // Personality
        this.speedMult = 1.0 + (Math.random() - 0.5) * 2 * CONFIG.AGENT_SPEED_VARIANCE;
        this.patience = 0.3 + Math.random() * 0.7; // 0.3–1.0
        this.artInterest = 0.4 + Math.random() * 0.6; // 0.4–1.0
        this.targetVisitCount = randInt(CONFIG.TARGET_VISIT_MIN, CONFIG.TARGET_VISIT_MAX);

        // Amenity preferences (random per visitor)
        this.amenityQueue = [];       // [{id, pos, room}] — stops to make before galleries
        this.exitAmenityQueue = [];   // stops to make on the way out
        this._needsRestroom = Math.random() < CONFIG.AMENITY_RESTROOM_PROB;
        this._restroomDone = false;
        this._isAmenityStop = false;  // currently visiting an amenity

        this._buildAmenityPlan();

        // Position & movement
        this.pos = new Vec2(300, 100); // Spawn at top of entrance oval
        this.vel = new Vec2(0, 0);
        this.heading = 0;
        this.speed = CONFIG.AGENT_SPEED_BASE * this.speedMult;

        // State machine
        this.state = AgentState.ENTERING;
        this.path = [];
        this.pathIndex = 0;
        this.currentTarget = null; // exhibit object
        this.visitedExhibits = new Set();
        this.viewTimer = 0;
        this.lastViewDuration = 0; // actual dwell time in frames

        // Tracking
        this.spawnFrame = 0;
        this.totalFrames = 0;
        this.currentRoom = 'entrance';

        // Start: visit pre-gallery amenities or head to corridor
        this._startEntrance();
    }

    _buildAmenityPlan() {
        const amenities = FLOORPLAN.amenities;
        const store = amenities.find(a => a.id === 'store');
        const cafe = amenities.find(a => a.id === 'cafe');

        // Pre-gallery stops (café only on entry)
        if (Math.random() < CONFIG.AMENITY_CAFE_PROB) {
            this.amenityQueue.push(cafe);
        }

        // Store only on the way out (gift shop)
        if (Math.random() < CONFIG.AMENITY_GIFT_SHOP_EXIT_PROB) {
            this.exitAmenityQueue.push(store);
        }
    }

    _startEntrance() {
        if (this.amenityQueue.length > 0) {
            const stop = this.amenityQueue.shift();
            this._isAmenityStop = true;
            this._setPathTo(stop.pos.copy(), stop.room);
        } else {
            this._isAmenityStop = false;
            this._setPathTo(new Vec2(300, 260), 'corridor');
        }
    }

    update(spatialHash, timeScale) {
        if (this.state === AgentState.DONE) return;
        this.totalFrames++;
        this._spatialHash = spatialHash; // store ref for crowd checks

        switch (this.state) {
            case AgentState.ENTERING:
                this._followPath(spatialHash, timeScale);
                if (this._pathComplete()) {
                    if (this._isAmenityStop) {
                        // Dwell at amenity briefly
                        this.state = AgentState.VIEWING;
                        this.viewTimer = randInt(CONFIG.AMENITY_DWELL_MIN, CONFIG.AMENITY_DWELL_MAX);
                        this.lastViewDuration = 0;
                        this.currentTarget = null;
                        this._isAmenityStop = true;
                    } else {
                        this.state = AgentState.WALKING;
                        this._pickNextExhibit();
                    }
                }
                break;

            case AgentState.WALKING:
                this._followPath(spatialHash, timeScale);
                if (this._pathComplete()) {
                    if (this._isAmenityStop) {
                        // Arrived at amenity (restroom break / exit stop)
                        this.state = AgentState.VIEWING;
                        this.viewTimer = randInt(CONFIG.AMENITY_DWELL_MIN, CONFIG.AMENITY_DWELL_MAX);
                        this.lastViewDuration = 0;
                        this.currentTarget = null;
                    } else if (this.currentTarget) {
                        // Always view the painting once you arrive
                        this.state = AgentState.VIEWING;
                        this.viewTimer = randInt(CONFIG.VIEW_TIME_MIN, CONFIG.VIEW_TIME_MAX);
                        this.viewTimer = Math.floor(this.viewTimer * this.artInterest);
                        this.lastViewDuration = 0;
                        this.visitedExhibits.add(this.currentTarget.id);
                    } else {
                        this._pickNextExhibit();
                    }
                }
                break;

            case AgentState.VIEWING:
                this.viewTimer -= timeScale;
                this.lastViewDuration += timeScale;
                this.vel = this.vel.mul(0.9);

                if (this.viewTimer <= 0) {
                    if (this._isAmenityStop) {
                        this._isAmenityStop = false;
                        if (this.state === AgentState.VIEWING && this.amenityQueue.length > 0) {
                            // More pre-gallery amenities
                            this.state = AgentState.ENTERING;
                            this._startEntrance();
                        } else if (this.exitAmenityQueue.length > 0 && this.visitedExhibits.size >= this.targetVisitCount) {
                            // On exit path, more exit amenities
                            const stop = this.exitAmenityQueue.shift();
                            this._isAmenityStop = true;
                            this.state = AgentState.EXITING;
                            this._setPathTo(stop.pos.copy(), stop.room);
                        } else if (this.visitedExhibits.size >= this.targetVisitCount) {
                            // Done with exit amenities, head to exit
                            this.state = AgentState.EXITING;
                            this._setPathTo(new Vec2(300, 100), 'entrance');
                        } else if (this.visitedExhibits.size === 0) {
                            // Just finished pre-gallery amenities, enter galleries
                            this.state = AgentState.ENTERING;
                            this._isAmenityStop = false;
                            this._setPathTo(new Vec2(300, 260), 'corridor');
                        } else {
                            // Mid-visit amenity (restroom), continue exhibits
                            this.state = AgentState.WALKING;
                            this._pickNextExhibit();
                        }
                    } else if (this.visitedExhibits.size >= this.targetVisitCount) {
                        // Done with exhibits — check exit amenities
                        if (this.exitAmenityQueue.length > 0) {
                            const stop = this.exitAmenityQueue.shift();
                            this._isAmenityStop = true;
                            this.state = AgentState.WALKING;
                            this._setPathTo(stop.pos.copy(), stop.room);
                        } else {
                            this.state = AgentState.EXITING;
                            this._setPathTo(new Vec2(300, 100), 'entrance');
                        }
                    } else {
                        // Check for restroom break (once, mid-visit)
                        if (this._needsRestroom && !this._restroomDone && this.visitedExhibits.size >= 2) {
                            this._restroomDone = true;
                            const restroom = FLOORPLAN.amenities.find(a => a.id === 'restroom');
                            this._isAmenityStop = true;
                            this.state = AgentState.WALKING;
                            this._setPathTo(restroom.pos.copy(), restroom.room);
                        } else {
                            this.state = AgentState.WALKING;
                            this._pickNextExhibit();
                        }
                    }
                }
                break;

            case AgentState.EXITING:
                this._followPath(spatialHash, timeScale);
                if (this._pathComplete()) {
                    if (this._isAmenityStop) {
                        // Arrived at exit amenity, dwell
                        this.state = AgentState.VIEWING;
                        this.viewTimer = randInt(CONFIG.AMENITY_DWELL_MIN, CONFIG.AMENITY_DWELL_MAX);
                        this.lastViewDuration = 0;
                        this.currentTarget = null;
                    } else {
                        this.state = AgentState.DONE;
                    }
                }
                break;
        }

        // Update current room
        const room = FLOORPLAN.roomAt(this.pos.x, this.pos.y);
        if (room) this.currentRoom = room.id;
    }

    _countCrowdNear(pos) {
        if (!this._spatialHash) return 0;
        const nearby = this._spatialHash.query(pos.x, pos.y, CONFIG.CROWD_DETECT_RADIUS);
        let count = 0;
        for (const other of nearby) {
            if (other.id === this.id) continue;
            if (other.pos.dist(pos) < CONFIG.CROWD_DETECT_RADIUS) count++;
        }
        return count;
    }

    _pickNextExhibit() {
        const exhibits = FLOORPLAN.exhibits.filter(e => !this.visitedExhibits.has(e.id));

        if (exhibits.length === 0) {
            // All exhibits visited or none left — exit
            this.state = AgentState.EXITING;
            this._setPathTo(new Vec2(300, 100), 'entrance');
            return;
        }

        // Score each exhibit — attraction + light crowd awareness + randomness
        const scored = exhibits.map(e => {
            const weight = CONFIG.EXHIBIT_WEIGHTS[e.name] || 0.5;
            const dist = this.pos.dist(e.pos);
            const attraction = weight * this.artInterest;
            const distPenalty = (dist / 800) * 0.6;

            // Light crowd preference — gently favor less crowded exhibits
            const crowd = this._countCrowdNear(e.pos);
            const crowdPenalty = crowd * 0.05;

            // Random jitter for variety
            const jitter = Math.random() * 0.3;

            const score = attraction - distPenalty - crowdPenalty + jitter;
            return { item: e, weight: Math.max(score, 0.1) };
        });

        // Pick weighted random from top 3 candidates (bias toward best options)
        scored.sort((a, b) => b.weight - a.weight);
        const candidates = scored.slice(0, Math.min(3, scored.length));
        this.currentTarget = weightedRandom(candidates);

        // Walk to viewing position with slight random offset for natural spread
        const noise = CONFIG.WANDER_NOISE;
        const offsetX = (Math.random() - 0.5) * noise;
        const offsetY = (Math.random() - 0.5) * noise;
        const viewPos = this.currentTarget.pos.add(
            this.currentTarget.wallNormal.mul(22)
        ).add(new Vec2(offsetX, offsetY));
        this._setPathTo(viewPos, this.currentTarget.room);
    }

    _setPathTo(targetPos, targetRoom) {
        this.path = Pathfinder.findPathBetweenPositions(
            this.pos, targetPos, this.currentRoom, targetRoom
        );
        this.pathIndex = 0;

        // If pathfinding fails, create a simple direct path
        if (this.path.length === 0) {
            this.path = [this.pos.copy(), targetPos.copy()];
            this.pathIndex = 0;
        }

        // Add random noise to intermediate waypoints (not first/last)
        // so visitors don't all walk the exact same routes
        const noise = CONFIG.WANDER_NOISE;
        for (let i = 1; i < this.path.length - 1; i++) {
            this.path[i] = new Vec2(
                this.path[i].x + (Math.random() - 0.5) * noise,
                this.path[i].y + (Math.random() - 0.5) * noise
            );
        }
    }

    _followPath(spatialHash, timeScale) {
        if (this.pathIndex >= this.path.length) return;

        const target = this.path[this.pathIndex];
        const toTarget = target.sub(this.pos);
        const dist = toTarget.len();

        // Arrived at current waypoint?
        const arrivalDist = (this.pathIndex === this.path.length - 1)
            ? CONFIG.EXHIBIT_ARRIVAL_DIST
            : CONFIG.WAYPOINT_ARRIVAL_DIST;

        if (dist < arrivalDist) {
            this.pathIndex++;
            if (this.pathIndex >= this.path.length) return;
        }

        // Seek force
        const seekDir = toTarget.normalize();
        let steer = seekDir.mul(CONFIG.SEEK_WEIGHT);

        // Separation force
        const neighbors = spatialHash.query(
            this.pos.x, this.pos.y, CONFIG.SEPARATION_RADIUS
        );

        let sepForce = new Vec2(0, 0);
        let sepCount = 0;
        for (const other of neighbors) {
            if (other.id === this.id) continue;
            const diff = this.pos.sub(other.pos);
            const d = diff.len();
            if (d > 0 && d < CONFIG.SEPARATION_RADIUS) {
                sepForce = sepForce.add(diff.normalize().mul(1.0 / d));
                sepCount++;
            }
        }
        if (sepCount > 0) {
            sepForce = sepForce.mul(1.0 / sepCount).normalize().mul(CONFIG.SEPARATION_WEIGHT);
        }

        steer = steer.add(sepForce).limit(CONFIG.MAX_FORCE);

        // Apply steering
        this.vel = this.vel.add(steer).limit(this.speed * timeScale);
        this.pos = this.pos.add(this.vel);

        // Soft boundary — keep agents within museum outer walls
        this.pos.x = clamp(this.pos.x, 105, 595);
        this.pos.y = clamp(this.pos.y, 92, 745);

        // Update heading
        if (this.vel.len() > 0.1) {
            this.heading = Math.atan2(this.vel.y, this.vel.x);
        }
    }

    _pathComplete() {
        return this.pathIndex >= this.path.length;
    }

    getColor() {
        switch (this.state) {
            case AgentState.ENTERING: return CONFIG.COLORS.AGENT_ENTERING;
            case AgentState.WALKING: return CONFIG.COLORS.AGENT_WALKING;
            case AgentState.VIEWING: return CONFIG.COLORS.AGENT_VIEWING;
            case AgentState.EXITING: return CONFIG.COLORS.AGENT_EXITING;
            default: return '#888';
        }
    }

    getDuration() {
        return this.totalFrames / 60; // seconds
    }
}
