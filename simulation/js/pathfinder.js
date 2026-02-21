// pathfinder.js — A* pathfinding on the waypoint graph

class MinHeap {
    constructor() {
        this.data = [];
    }

    push(item) {
        this.data.push(item);
        this._bubbleUp(this.data.length - 1);
    }

    pop() {
        const top = this.data[0];
        const last = this.data.pop();
        if (this.data.length > 0) {
            this.data[0] = last;
            this._sinkDown(0);
        }
        return top;
    }

    get size() { return this.data.length; }

    _bubbleUp(i) {
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (this.data[i].f < this.data[parent].f) {
                [this.data[i], this.data[parent]] = [this.data[parent], this.data[i]];
                i = parent;
            } else break;
        }
    }

    _sinkDown(i) {
        const n = this.data.length;
        while (true) {
            let smallest = i;
            const left = 2 * i + 1;
            const right = 2 * i + 2;
            if (left < n && this.data[left].f < this.data[smallest].f) smallest = left;
            if (right < n && this.data[right].f < this.data[smallest].f) smallest = right;
            if (smallest !== i) {
                [this.data[i], this.data[smallest]] = [this.data[smallest], this.data[i]];
                i = smallest;
            } else break;
        }
    }
}

const Pathfinder = {
    // A* from startId to goalId on the waypoint graph
    // Returns array of Vec2 positions (the path), or empty array if no path
    findPath(startId, goalId) {
        const graph = FLOORPLAN.waypointMap;
        const startNode = graph.get(startId);
        const goalNode = graph.get(goalId);
        if (!startNode || !goalNode) return [];
        if (startId === goalId) return [goalNode.pos.copy()];

        const openSet = new MinHeap();
        const gScore = new Map();
        const cameFrom = new Map();
        const closedSet = new Set();

        gScore.set(startId, 0);
        openSet.push({ id: startId, f: startNode.pos.dist(goalNode.pos) });

        while (openSet.size > 0) {
            const current = openSet.pop();

            if (current.id === goalId) {
                // Reconstruct path
                const path = [];
                let nodeId = goalId;
                while (nodeId) {
                    const node = graph.get(nodeId);
                    path.unshift(node.pos.copy());
                    nodeId = cameFrom.get(nodeId);
                }
                return path;
            }

            if (closedSet.has(current.id)) continue;
            closedSet.add(current.id);

            const node = graph.get(current.id);
            for (const neighbor of node.neighbors) {
                if (closedSet.has(neighbor.id)) continue;

                const tentativeG = gScore.get(current.id) + neighbor.dist;
                const prevG = gScore.get(neighbor.id);

                if (prevG === undefined || tentativeG < prevG) {
                    gScore.set(neighbor.id, tentativeG);
                    cameFrom.set(neighbor.id, current.id);
                    const nNode = graph.get(neighbor.id);
                    const f = tentativeG + nNode.pos.dist(goalNode.pos);
                    openSet.push({ id: neighbor.id, f });
                }
            }
        }

        return []; // No path found
    },

    // Find path from a position to a target position
    // First finds nearest waypoints, then A* between them
    findPathBetweenPositions(fromPos, toPos, fromRoom = null, toRoom = null) {
        const startWp = FLOORPLAN.nearestWaypoint(fromPos, fromRoom);
        const endWp = FLOORPLAN.nearestWaypoint(toPos, toRoom);

        if (!startWp || !endWp) return [];

        const waypointPath = this.findPath(startWp.id, endWp.id);

        if (waypointPath.length === 0) return [];

        // Prepend current position, append target position
        const fullPath = [fromPos.copy(), ...waypointPath, toPos.copy()];

        // Remove redundant points that are very close
        const cleaned = [fullPath[0]];
        for (let i = 1; i < fullPath.length; i++) {
            if (fullPath[i].dist(cleaned[cleaned.length - 1]) > 5) {
                cleaned.push(fullPath[i]);
            }
        }

        return cleaned;
    }
};
