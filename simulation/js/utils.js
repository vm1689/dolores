// utils.js — Vector math, spatial hash, and helpers

class Vec2 {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    copy() { return new Vec2(this.x, this.y); }

    add(v) { return new Vec2(this.x + v.x, this.y + v.y); }
    sub(v) { return new Vec2(this.x - v.x, this.y - v.y); }
    mul(s) { return new Vec2(this.x * s, this.y * s); }

    len() { return Math.sqrt(this.x * this.x + this.y * this.y); }
    lenSq() { return this.x * this.x + this.y * this.y; }

    normalize() {
        const l = this.len();
        if (l < 0.0001) return new Vec2(0, 0);
        return new Vec2(this.x / l, this.y / l);
    }

    limit(max) {
        const l = this.len();
        if (l > max) return this.normalize().mul(max);
        return this.copy();
    }

    dist(v) { return this.sub(v).len(); }
    distSq(v) { return this.sub(v).lenSq(); }

    dot(v) { return this.x * v.x + this.y * v.y; }

    static lerp(a, b, t) {
        return new Vec2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
    }

    static fromAngle(angle) {
        return new Vec2(Math.cos(angle), Math.sin(angle));
    }
}

// Spatial hash for fast neighbor queries
class SpatialHash {
    constructor(cellSize) {
        this.cellSize = cellSize;
        this.cells = new Map();
    }

    clear() {
        this.cells.clear();
    }

    _key(x, y) {
        const cx = Math.floor(x / this.cellSize);
        const cy = Math.floor(y / this.cellSize);
        return `${cx},${cy}`;
    }

    insert(agent) {
        const key = this._key(agent.pos.x, agent.pos.y);
        if (!this.cells.has(key)) this.cells.set(key, []);
        this.cells.get(key).push(agent);
    }

    query(x, y, radius) {
        const results = [];
        const minCx = Math.floor((x - radius) / this.cellSize);
        const maxCx = Math.floor((x + radius) / this.cellSize);
        const minCy = Math.floor((y - radius) / this.cellSize);
        const maxCy = Math.floor((y + radius) / this.cellSize);

        for (let cx = minCx; cx <= maxCx; cx++) {
            for (let cy = minCy; cy <= maxCy; cy++) {
                const cell = this.cells.get(`${cx},${cy}`);
                if (cell) {
                    for (const agent of cell) {
                        const dx = agent.pos.x - x;
                        const dy = agent.pos.y - y;
                        if (dx * dx + dy * dy <= radius * radius) {
                            results.push(agent);
                        }
                    }
                }
            }
        }
        return results;
    }
}

// Check if point is inside a polygon (ray casting)
function pointInPolygon(px, py, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i][0], yi = polygon[i][1];
        const xj = polygon[j][0], yj = polygon[j][1];
        if (((yi > py) !== (yj > py)) &&
            (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
            inside = !inside;
        }
    }
    return inside;
}

// Random number between min and max
function rand(min, max) {
    return min + Math.random() * (max - min);
}

// Random integer between min and max (inclusive)
function randInt(min, max) {
    return Math.floor(rand(min, max + 1));
}

// Weighted random selection from array of {item, weight}
function weightedRandom(items) {
    const totalWeight = items.reduce((sum, i) => sum + i.weight, 0);
    let r = Math.random() * totalWeight;
    for (const entry of items) {
        r -= entry.weight;
        if (r <= 0) return entry.item;
    }
    return items[items.length - 1].item;
}

// Clamp value
function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

// Format seconds to mm:ss
function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// Generate ellipse polygon points
function ellipsePolygon(cx, cy, rx, ry, segments = 48) {
    const points = [];
    for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        points.push([cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)]);
    }
    return points;
}
