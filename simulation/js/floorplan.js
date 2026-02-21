// floorplan.js — Museum architecture matching museum-floorplan.svg
//
// Layout from SVG (viewBox 600x850):
//   - Oval entrance at top with Store (left) / Café (right)
//   - Stairs down into vertical corridor
//   - Left galleries: upper (Ex 1,2), middle (Ex 3,4,5), lower (Ex 6)
//   - Right galleries: upper (Ex 11,12), mid-lower (Ex 9,10), bottom (Ex 7,8)
//   - Three staircases: entry stairs, left stairs, bottom stairs
//   - 12 exhibits on walls

const FLOORPLAN = (() => {

    // ========================================================
    //  ROOM POLYGONS  — approximate walkable zones
    // ========================================================

    // Entrance oval approximated as polygon (Store + Café)
    const ovalPts = [];
    for (let i = 0; i <= 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        ovalPts.push([300 + 180 * Math.cos(a), 160 + 70 * Math.sin(a)]);
    }

    const entrance = {
        id: 'entrance',
        name: 'Store / Café',
        floor: 0,
        polygon: ovalPts,
        fill: '#f0f0f5',
    };

    // Entry corridor (narrow vertical passage from stairs down)
    const corridor = {
        id: 'corridor',
        name: 'Corridor',
        floor: 0,
        polygon: [[260, 210], [340, 210], [340, 460], [260, 460]],
        fill: '#f0f0f5',
        isCorridor: true,
    };

    // Gallery A — upper left (Exhibits 1, 2)
    const galleryA = {
        id: 'gallery_a',
        name: 'Early Works',
        floor: 0,
        polygon: [[100, 350], [260, 350], [260, 500], [180, 500], [100, 500]],
        fill: '#f0f0f5',
    };

    // Gallery B — middle left (Exhibits 3, 4, 5)
    const galleryB = {
        id: 'gallery_b',
        name: 'Paris & Provence',
        floor: 0,
        polygon: [[100, 500], [280, 500], [280, 640], [220, 640], [100, 640]],
        fill: '#f0f0f5',
    };

    // Gallery C — lower left (Exhibit 6)
    const galleryC = {
        id: 'gallery_c',
        name: 'Masterworks I',
        floor: 0,
        polygon: [[100, 640], [400, 640], [400, 750], [100, 750]],
        fill: '#f0f0f5',
    };

    // Gallery D — right upper (Exhibits 11, 12)
    const galleryD = {
        id: 'gallery_d',
        name: 'Late Period',
        floor: 0,
        polygon: [[340, 460], [600, 460], [600, 610], [420, 610], [340, 610]],
        fill: '#f0f0f5',
    };

    // Gallery E — right lower (Exhibits 7, 8, 9, 10)
    const galleryE = {
        id: 'gallery_e',
        name: 'Masterworks II',
        floor: 0,
        polygon: [[340, 610], [600, 610], [600, 750], [400, 750], [340, 750]],
        fill: '#f0f0f5',
    };

    const rooms = [entrance, corridor, galleryA, galleryB, galleryC, galleryD, galleryE];

    // ========================================================
    //  AMENITIES — Store, Café, Restrooms (inside entrance oval)
    // ========================================================

    const amenities = [
        { id: 'store',     name: 'Store',     pos: new Vec2(210, 155), room: 'entrance' },
        { id: 'cafe',      name: 'Café',      pos: new Vec2(390, 155), room: 'entrance' },
        { id: 'restroom',  name: 'Restrooms', pos: new Vec2(420, 140), room: 'entrance' },
    ];

    // ========================================================
    //  DOORS  — openings in walls
    // ========================================================

    const doors = [
        // Corridor bottom → Gallery A (where corridor left wall ends at y=350)
        { pos: new Vec2(260, 390), axis: 'v', width: 60, between: ['corridor', 'gallery_a'] },
        // Gallery A → Gallery B (gap in wall at y=500 between x=180 and x=280)
        { pos: new Vec2(230, 500), axis: 'h', width: 80, between: ['gallery_a', 'gallery_b'] },
        // Gallery B → Gallery C (gap in wall at y=640 between x=220 and x=280)
        { pos: new Vec2(250, 640), axis: 'h', width: 50, between: ['gallery_b', 'gallery_c'] },
        // Corridor → Gallery D (where corridor right wall ends at y=460)
        { pos: new Vec2(340, 480), axis: 'v', width: 30, between: ['corridor', 'gallery_d'] },
        // Gallery D → Gallery E (gap in wall at y=610)
        { pos: new Vec2(380, 610), axis: 'h', width: 50, between: ['gallery_d', 'gallery_e'] },
        // Gallery D → Gallery E right side
        { pos: new Vec2(560, 610), axis: 'h', width: 50, between: ['gallery_d', 'gallery_e'] },
    ];

    // ========================================================
    //  STAIRCASES  — visual elements
    // ========================================================

    const staircases = [];

    // Keep backward compat — single staircase reference for renderer
    const staircase = staircases[0];

    // ========================================================
    //  EXHIBITS — 12 artworks on walls, matching SVG positions
    //
    //  pos: center of painting on wall
    //  wallNormal: direction from wall INTO the room (where viewer stands)
    //  viewPos in SVG = circle position (where numbered label sits)
    // ========================================================

    const exhibits = [
        // Exhibit 1 — top wall of Gallery A (viewer stands below)
        { id: 'potato_eaters', name: 'The Potato Eaters',
          year: 1885, period: 'Dutch Period',
          img: 'img/artworks/1_The Potato Eaters.jpg',
          desc: 'Van Gogh\'s first major masterpiece, depicting a peasant family sharing a simple meal of potatoes by lamplight. He deliberately painted their faces coarse and their hands bony to show the harsh dignity of rural life.',
          pos: new Vec2(190, 355), wallNormal: new Vec2(0, 1), room: 'gallery_a' },

        // Exhibit 2 — left wall of Gallery A (viewer stands to the right)
        { id: 'sunflowers', name: 'Sunflowers',
          year: 1889, period: 'Arles Period',
          img: 'img/artworks/2_Sunflowers.jpg',
          desc: 'One of Van Gogh\'s most iconic works, painted in radiant yellows to decorate the room of his friend Paul Gauguin. By contrasting fresh blooms with wilting ones, he wove in the symbolism of life\'s cycle.',
          pos: new Vec2(105, 425), wallNormal: new Vec2(1, 0), room: 'gallery_a' },

        // Exhibit 3 — top wall of Gallery B (viewer stands below)
        { id: 'almond_blossom', name: 'Almond Blossom',
          year: 1890, period: 'Saint-R\u00e9my Period',
          img: 'img/artworks/3_Almond Blossom.jpg',
          desc: 'Painted as a gift to celebrate the birth of his brother Theo\'s son, Vincent Willem. Large almond branches burst into bloom against a vivid blue sky \u2014 inspired by Japanese woodblock prints \u2014 symbolizing new life and hope.',
          pos: new Vec2(200, 505), wallNormal: new Vec2(0, 1), room: 'gallery_b' },

        // Exhibit 4 — left wall of Gallery B (viewer stands to the right)
        { id: 'self_portrait_grey_hat', name: 'Self-Portrait with Grey Felt Hat',
          year: 1887, period: 'Paris Period',
          img: 'img/artworks/4_ Self-Portrait with Grey Felt Hat.jpg',
          desc: 'One of Van Gogh\'s most celebrated self-portraits, painted with short, swirling pointillist-influenced brushstrokes in blues and oranges. It captures his psychological intensity and rapid stylistic evolution after encountering the French Impressionists.',
          pos: new Vec2(105, 585), wallNormal: new Vec2(1, 0), room: 'gallery_b' },

        // Exhibit 5 — bottom wall segment in Gallery B
        { id: 'irises', name: 'Irises',
          year: 1890, period: 'Saint-R\u00e9my Period',
          img: 'img/artworks/5_Irises-Vincent_van_Gogh.jpg',
          desc: 'A luminous still life of irises in a vase against a yellow background. Originally the flowers were purple, but the pigment faded to cobalt blue over time. The composition includes flowers slowly withering \u2014 a quiet meditation on the cycle of life.',
          pos: new Vec2(180, 637), wallNormal: new Vec2(0, -1), room: 'gallery_b' },

        // Exhibit 6 — south wall of Gallery C
        { id: 'self_portrait_straw_hat', name: 'Self-Portrait with Straw Hat',
          year: 1887, period: 'Paris Period',
          img: 'img/artworks/6_Self-Portrait with Straw Hat.jpg',
          desc: 'Painted during Van Gogh\'s Paris years, this self-portrait shows his experimentation with Impressionist color and technique. The straw hat and loose, vibrant brushwork reflect the lightened palette he developed after exposure to Monet and Seurat.',
          pos: new Vec2(220, 745), wallNormal: new Vec2(0, -1), room: 'gallery_c' },

        // Exhibit 7 — south wall of Gallery E
        { id: 'the_harvest', name: 'The Harvest',
          year: 1888, period: 'Arles Period',
          img: 'img/artworks/7_The Harvest.jpg',
          desc: 'A sweeping panorama of wheat fields near Arles glowing with blazing summer sun. Van Gogh described it as one of his best landscapes. Hayricks, farm carts, and tiny figures give the scene a monumental, almost biblical grandeur.',
          pos: new Vec2(480, 745), wallNormal: new Vec2(0, -1), room: 'gallery_e' },

        // Exhibit 8 — right wall of Gallery E (viewer stands to the left)
        { id: 'the_bedroom', name: 'The Bedroom',
          year: 1888, period: 'Arles Period',
          img: 'img/artworks/8_The Bedroom.jpg',
          desc: 'Van Gogh\'s intimate portrayal of his own bedroom in the Yellow House in Arles. He used bold, flat colors \u2014 blues, yellows, lilacs \u2014 to convey rest and calm. The tilted perspective and simplified forms feel both cozy and slightly dreamlike.',
          pos: new Vec2(595, 685), wallNormal: new Vec2(-1, 0), room: 'gallery_e' },

        // Exhibit 9 — top wall of Gallery E (viewer stands below)
        { id: 'the_sower', name: 'The Sower',
          year: 1888, period: 'Arles Period',
          img: 'img/artworks/9_The Sower.jpeg',
          desc: 'A farmer sowing seeds beneath a blazing sun with an almost supernatural yellow-green sky and purple field. Van Gogh gave the sower a saint-like quality, with the sun forming a halo behind his head \u2014 a symbol of faith and renewal.',
          pos: new Vec2(470, 615), wallNormal: new Vec2(0, 1), room: 'gallery_e' },

        // Exhibit 10 — right wall of Gallery D (viewer stands to the left)
        { id: 'wheatfield_thunderclouds', name: 'Wheatfield under Thunderclouds',
          year: 1890, period: 'Auvers-sur-Oise Period',
          img: 'img/artworks/10_Wheatfield under Thunderclouds.jpg',
          desc: 'Painted weeks before his death, this vast panorama of green wheat beneath a foreboding dark sky is one of Van Gogh\'s starkest works. He wrote to Theo that he was trying to express "sadness, extreme loneliness" in these Auvers wheatfields.',
          pos: new Vec2(595, 555), wallNormal: new Vec2(-1, 0), room: 'gallery_d' },

        // Exhibit 11 — top wall of Gallery D (right side)
        { id: 'wheatfield_reaper', name: 'Wheatfield with a Reaper',
          year: 1889, period: 'Saint-R\u00e9my Period',
          img: 'img/artworks/11_Wheatfield with a Reaper.jpg',
          desc: 'Painted from his asylum window, this sun-drenched canvas shows a lone figure harvesting wheat. Van Gogh saw the reaper as an image of death, but stressed there was "nothing sad in this death," as it takes place bathed in pure golden light.',
          pos: new Vec2(560, 475), wallNormal: new Vec2(0, 1), room: 'gallery_d' },

        // Exhibit 12 — top wall of Gallery D (left side)
        { id: 'wheatfield_crows', name: 'Wheatfield with Crows',
          year: 1890, period: 'Auvers-sur-Oise Period',
          img: 'img/artworks/12_Wheatfield with Crows.jpg',
          desc: 'Among Van Gogh\'s most famous paintings, depicting windswept yellow wheat under a churning dark sky, with black crows flying toward the viewer and a blood-red path cutting through the field before abruptly ending.',
          pos: new Vec2(470, 475), wallNormal: new Vec2(0, 1), room: 'gallery_d' },
    ];

    // ========================================================
    //  NAVIGATION GRAPH
    //  Follows the visitor pathway from the SVG:
    //  Entry → left galleries → bottom → right galleries → back
    // ========================================================

    const waypoints = [
        // Entrance
        { id: 'entrance_top',  pos: new Vec2(300, 130), room: 'entrance' },
        { id: 'entrance_bot',  pos: new Vec2(300, 210), room: 'entrance' },

        // Amenities (inside entrance oval)
        { id: 'store',         pos: new Vec2(210, 155), room: 'entrance' },
        { id: 'cafe',          pos: new Vec2(390, 155), room: 'entrance' },
        { id: 'restroom',      pos: new Vec2(420, 140), room: 'entrance' },

        // Corridor (top to bottom)
        { id: 'corr_top',      pos: new Vec2(300, 260), room: 'corridor' },
        { id: 'corr_mid',      pos: new Vec2(300, 350), room: 'corridor' },
        { id: 'corr_left',     pos: new Vec2(260, 390), room: 'corridor' },
        { id: 'corr_right',    pos: new Vec2(340, 460), room: 'corridor' },

        // Gallery A
        { id: 'ga_enter',      pos: new Vec2(230, 390), room: 'gallery_a' },
        { id: 'ga_center',     pos: new Vec2(180, 420), room: 'gallery_a' },
        { id: 'ga_south',      pos: new Vec2(180, 480), room: 'gallery_a' },

        // Gallery B
        { id: 'gb_enter',      pos: new Vec2(200, 520), room: 'gallery_b' },
        { id: 'gb_center',     pos: new Vec2(180, 560), room: 'gallery_b' },
        { id: 'gb_south',      pos: new Vec2(180, 620), room: 'gallery_b' },

        // Gallery C
        { id: 'gc_enter',      pos: new Vec2(200, 660), room: 'gallery_c' },
        { id: 'gc_center',     pos: new Vec2(250, 700), room: 'gallery_c' },
        { id: 'gc_south',      pos: new Vec2(350, 730), room: 'gallery_c' },

        // Gallery E (bottom right)
        { id: 'ge_south',      pos: new Vec2(460, 720), room: 'gallery_e' },
        { id: 'ge_center',     pos: new Vec2(520, 670), room: 'gallery_e' },
        { id: 'ge_west',       pos: new Vec2(420, 650), room: 'gallery_e' },

        // Gallery D (top right)
        { id: 'gd_enter',      pos: new Vec2(380, 490), room: 'gallery_d' },
        { id: 'gd_center',     pos: new Vec2(480, 520), room: 'gallery_d' },
        { id: 'gd_east',       pos: new Vec2(550, 540), room: 'gallery_d' },
        { id: 'gd_top',        pos: new Vec2(500, 480), room: 'gallery_d' },
    ];

    const edges = [
        // Entrance → Corridor
        ['entrance_top', 'entrance_bot'],
        ['entrance_bot', 'corr_top'],

        // Amenity connections (from entrance hub)
        ['entrance_top', 'store'],
        ['entrance_top', 'cafe'],
        ['cafe', 'restroom'],

        // Corridor connections
        ['corr_top', 'corr_mid'],
        ['corr_mid', 'corr_left'],
        ['corr_mid', 'corr_right'],

        // Corridor → Gallery A (left path)
        ['corr_left', 'ga_enter'],
        ['ga_enter', 'ga_center'],
        ['ga_center', 'ga_south'],

        // Gallery A → Gallery B
        ['ga_south', 'gb_enter'],
        ['gb_enter', 'gb_center'],
        ['gb_center', 'gb_south'],

        // Gallery B → Gallery C
        ['gb_south', 'gc_enter'],
        ['gc_enter', 'gc_center'],
        ['gc_center', 'gc_south'],

        // Gallery C → Gallery E (across bottom)
        ['gc_south', 'ge_south'],
        ['ge_south', 'ge_center'],
        ['ge_center', 'ge_west'],

        // Gallery E → Gallery D
        ['ge_west', 'gd_enter'],
        ['gd_enter', 'gd_center'],
        ['gd_center', 'gd_east'],
        ['gd_center', 'gd_top'],

        // Gallery D back to corridor
        ['gd_enter', 'corr_right'],
    ];

    // --- Build adjacency list ---
    const waypointMap = new Map();
    for (const wp of waypoints) {
        waypointMap.set(wp.id, { ...wp, neighbors: [] });
    }
    for (const [a, b] of edges) {
        const wpA = waypointMap.get(a);
        const wpB = waypointMap.get(b);
        if (wpA && wpB) {
            const dist = wpA.pos.dist(wpB.pos);
            wpA.neighbors.push({ id: b, dist });
            wpB.neighbors.push({ id: a, dist });
        }
    }

    function nearestWaypoint(pos, roomId = null) {
        let best = null, bestDist = Infinity;
        for (const [, wp] of waypointMap) {
            if (roomId && wp.room !== roomId) continue;
            const d = pos.dist(wp.pos);
            if (d < bestDist) { bestDist = d; best = wp; }
        }
        if (!best) {
            for (const [, wp] of waypointMap) {
                const d = pos.dist(wp.pos);
                if (d < bestDist) { bestDist = d; best = wp; }
            }
        }
        return best;
    }

    function roomAt(x, y) {
        for (const room of rooms) {
            if (pointInPolygon(x, y, room.polygon)) return room;
        }
        return null;
    }

    return {
        rooms, exhibits, amenities, waypoints, waypointMap, edges,
        doors, staircases, staircase, nearestWaypoint, roomAt,
    };
})();
