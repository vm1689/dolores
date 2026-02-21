// config.js — Tunable constants for the Van Gogh Museum simulation

const CONFIG = {
    // Modulate API (Velma-2 STT with emotion detection)
    MODULATE_API_KEY: 'YOUR_MODULATE_API_KEY',
    MODULATE_STREAMING_URL: 'wss://modulate-prototype-apis.com/api/velma-2-stt-streaming',
    MODULATE_BATCH_URL: 'https://modulate-prototype-apis.com/api/velma-2-stt-batch',

    // Canvas (matches SVG viewBox 600x850)
    CANVAS_WIDTH: 600,
    CANVAS_HEIGHT: 850,

    // Agent movement
    AGENT_SPEED_BASE: 1.4,
    AGENT_SPEED_VARIANCE: 0.3,
    AGENT_RADIUS: 3,
    WAYPOINT_ARRIVAL_DIST: 8,
    EXHIBIT_ARRIVAL_DIST: 14,

    // Steering
    SEPARATION_RADIUS: 14,
    SEPARATION_WEIGHT: 1.2,
    SEEK_WEIGHT: 1.0,
    MAX_FORCE: 0.35,

    // Crowd avoidance
    CROWD_DETECT_RADIUS: 40,      // how far to look for crowd at an exhibit
    CROWD_FLEE_THRESHOLD: 4,      // if this many+ people near exhibit, skip it
    CROWD_PENALTY_WEIGHT: 0.15,   // penalty per nearby person in scoring
    WANDER_NOISE: 8,              // random px offset added to waypoints

    // Viewing behavior
    VIEW_TIME_MIN: 150,
    VIEW_TIME_MAX: 480,
    TARGET_VISIT_MIN: 7,
    TARGET_VISIT_MAX: 12,

    // Amenity visit probabilities (0–1)
    AMENITY_STORE_PROB: 0.30,
    AMENITY_CAFE_PROB: 0.25,
    AMENITY_RESTROOM_PROB: 0.15,
    AMENITY_GIFT_SHOP_EXIT_PROB: 0.35,  // visit store on way out
    AMENITY_DWELL_MIN: 15,
    AMENITY_DWELL_MAX: 45,

    // Spawning
    SPAWN_RATE_DEFAULT: 0.5,
    MAX_VISITORS: 120,

    // Heatmap
    HEATMAP_CELL_SIZE: 4,
    HEATMAP_DECAY: 0.997,
    HEATMAP_ACCUMULATE: 0.15,
    HEATMAP_UPDATE_INTERVAL: 4,

    // Analytics
    ANALYTICS_UPDATE_INTERVAL: 30,

    // Spatial hash
    SPATIAL_HASH_CELL: 24,

    // Colors
    COLORS: {
        BACKGROUND: '#ffffff',
        ROOM_FILL: '#f0f0f5',
        ROOM_STROKE: '#3d3d50',
        CORRIDOR_FILL: '#eaeaf0',
        EXHIBIT_MARKER: '#c0392b',
        EXHIBIT_LABEL: '#2c1810',
        AGENT_ENTERING: '#27ae60',
        AGENT_WALKING: '#3498db',
        AGENT_VIEWING: '#e67e22',
        AGENT_EXITING: '#95a5a6',
        DOOR: '#8B7355',
    },

    // Heatmap gradient stops
    HEATMAP_GRADIENT: [
        [0.0, [0, 0, 80, 0]],
        [0.15, [0, 0, 200, 60]],
        [0.3, [0, 180, 220, 120]],
        [0.5, [0, 220, 100, 160]],
        [0.7, [220, 220, 0, 200]],
        [0.85, [255, 140, 0, 230]],
        [1.0, [255, 30, 0, 255]],
    ],

    // Evolution (self-learning)
    EVOLUTION_THRESHOLD: 100,
    EVOLUTION_PROXY_URL: 'http://localhost:3001/api/evolve',
    EVOLUTION_MODEL: 'claude-sonnet-4-20250514',

    // Exhibit attraction weights (12 artworks, curator-weighted)
    EXHIBIT_WEIGHTS: {
        'The Potato Eaters': 0.72,
        'Sunflowers': 1.0,
        'Almond Blossom': 0.92,
        'Self-Portrait with Grey Felt Hat': 0.70,
        'Irises': 0.82,
        'Self-Portrait with Straw Hat': 0.65,
        'The Harvest': 0.68,
        'The Bedroom': 0.95,
        'The Sower': 0.75,
        'Wheatfield under Thunderclouds': 0.70,
        'Wheatfield with a Reaper': 0.72,
        'Wheatfield with Crows': 0.85,
    },
};
