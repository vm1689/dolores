// renderer.js — Canvas drawing matching museum-floorplan.svg

const Renderer = (() => {
    let canvas, ctx;
    let floorCanvas, floorCtx;
    let heatCanvas, heatCtx;
    let viewMode = 'dots';

    // Centering transform — shift content so it sits with even margins
    // Content spans x=[100,600] y=[55,844]; canvas is 600x850
    const SCALE = 1.0;
    const CONTENT_CX = 350;   // world-space center of floor plan content
    const CONTENT_CY = 450;
    const CANVAS_CX = 300;    // screen-space center
    const CANVAS_CY = 425;
    // screen = world * SCALE + OFFSET  (at SCALE=1.0 this is just a translate)
    const OFFSET_X = CANVAS_CX - CONTENT_CX * SCALE;  // = -50
    const OFFSET_Y = CANVAS_CY - CONTENT_CY * SCALE;  // = -25

    function _applyTransform(c) {
        c.translate(OFFSET_X, OFFSET_Y);
        c.scale(SCALE, SCALE);
    }

    function init(canvasEl) {
        canvas = canvasEl;
        ctx = canvas.getContext('2d');
        canvas.width = CONFIG.CANVAS_WIDTH;
        canvas.height = CONFIG.CANVAS_HEIGHT;

        floorCanvas = document.createElement('canvas');
        floorCanvas.width = CONFIG.CANVAS_WIDTH;
        floorCanvas.height = CONFIG.CANVAS_HEIGHT;
        floorCtx = floorCanvas.getContext('2d');

        heatCanvas = document.createElement('canvas');
        heatCanvas.width = CONFIG.CANVAS_WIDTH;
        heatCanvas.height = CONFIG.CANVAS_HEIGHT;
        heatCtx = heatCanvas.getContext('2d');

        drawFloorPlan();
    }

    function setViewMode(m) { viewMode = m; }
    function getViewMode() { return viewMode; }

    // ===== STATIC FLOOR PLAN (drawn once to offscreen canvas at world coords) =====
    // The centering transform is applied only in render() when compositing.

    function drawFloorPlan() {
        const c = floorCtx;

        // Clear offscreen canvas
        c.clearRect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);

        // Room fill color (single source of truth)
        const roomFill = CONFIG.COLORS.ROOM_FILL;

        // 1. Fill central area first (covers gaps between gallery polygons)
        c.fillStyle = roomFill;
        c.fillRect(260, 250, 80, 500);

        // 2. Fill rooms on top
        for (const room of FLOORPLAN.rooms) {
            _fillPoly(c, room.polygon, room.fill || roomFill);
        }

        // 3. Draw the oval entrance specially
        _drawOvalEntrance(c);

        // 4. Draw walls from SVG
        _drawWalls(c);

        // 5. Draw staircases
        _drawStaircases(c);

        // 6. Draw exhibits on walls
        _drawExhibits(c);

        // 7. Room labels
        _drawRoomLabels(c);

        // 8. Title
        _drawTitles(c);
    }

    function _fillPoly(c, poly, fill) {
        c.beginPath();
        c.moveTo(poly[0][0], poly[0][1]);
        for (let i = 1; i < poly.length; i++) c.lineTo(poly[i][0], poly[i][1]);
        c.closePath();
        c.fillStyle = fill;
        c.fill();
    }

    // --- Oval entrance (Store / Café) ---

    function _drawOvalEntrance(c) {
        const roomFill = CONFIG.COLORS.ROOM_FILL;

        // Fill oval
        c.beginPath();
        c.ellipse(300, 160, 180, 70, 0, 0, Math.PI * 2);
        c.fillStyle = roomFill;
        c.fill();

        // Oval outline
        c.beginPath();
        c.ellipse(300, 160, 180, 70, 0, 0, Math.PI * 2);
        c.strokeStyle = CONFIG.COLORS.ROOM_STROKE;
        c.lineWidth = 3;
        c.stroke();

        // Divider (dashed line)
        c.beginPath();
        c.setLineDash([4, 4]);
        c.moveTo(300, 110);
        c.lineTo(300, 190);
        c.strokeStyle = CONFIG.COLORS.ROOM_STROKE;
        c.lineWidth = 1.5;
        c.stroke();
        c.setLineDash([]);

        // Labels
        c.font = 'bold 15px "Inter", sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = '#3d3d50';
        c.fillText('STORE', 210, 160);
        c.fillText('CAFÉ', 390, 160);

        // Restrooms box
        c.strokeStyle = CONFIG.COLORS.ROOM_STROKE;
        c.lineWidth = 1.5;
        c.strokeRect(420, 100, 60, 40);
        c.font = '11px "Inter", sans-serif';
        c.fillStyle = 'rgba(50, 50, 70, 0.8)';
        c.fillText('Restrooms', 520, 120);
    }

    // --- Walls matching SVG exactly ---

    function _drawWalls(c) {
        c.strokeStyle = CONFIG.COLORS.ROOM_STROKE;
        c.lineCap = 'round';

        // Thick walls (stroke-width 4 in SVG → 3 here)
        c.lineWidth = 3;

        // Vertical corridor walls
        _line(c, 260, 250, 260, 350);
        _line(c, 340, 250, 340, 460);

        // Left outer walls
        _polyline(c, [[260, 350], [100, 350], [100, 750], [400, 750]]);

        // Right outer walls
        _polyline(c, [[340, 460], [600, 460], [600, 750], [400, 750]]);

        // Interior walls (thinner)
        c.lineWidth = 2.5;

        // Left interior horizontal walls
        _line(c, 100, 500, 180, 500);
        _line(c, 100, 640, 220, 640);

        // Center divider (short wall segment, not fully enclosed)
        _line(c, 280, 500, 340, 500);

        // Right interior wall
        _line(c, 420, 610, 520, 610);
    }

    function _line(c, x1, y1, x2, y2) {
        c.beginPath();
        c.moveTo(x1, y1);
        c.lineTo(x2, y2);
        c.stroke();
    }

    function _polyline(c, pts) {
        c.beginPath();
        c.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
        c.stroke();
    }

    // --- Staircases ---

    function _drawStaircases(c) {
        // No staircases — single-floor layout
    }

    function _drawStairBlock(c, x, y, w, h, treads) {
        const roomFill = CONFIG.COLORS.ROOM_FILL;
        c.fillStyle = roomFill;
        c.fillRect(x, y, w, h);
        c.strokeStyle = CONFIG.COLORS.ROOM_STROKE;
        c.lineWidth = 1.5;
        c.strokeRect(x, y, w, h);
        c.strokeStyle = '#b0b0c0';
        c.lineWidth = 0.8;
        for (let i = 1; i <= treads; i++) {
            const ty = y + (i / (treads + 1)) * h;
            c.beginPath();
            c.moveTo(x, ty);
            c.lineTo(x + w, ty);
            c.stroke();
        }
    }

    // --- Exhibits on walls ---

    function _drawExhibits(c) {
        // Per-exhibit label offset from number circle: [dx, dy, textAlign]
        // Hand-tuned to avoid overlapping walls, other labels, or each other
        const LABEL_POS = {
            'potato_eaters':           [0, 15, 'center'],
            'sunflowers':              [14, 0, 'left'],
            'almond_blossom':          [0, 15, 'center'],
            'self_portrait_grey_hat':  [14, 0, 'left'],
            'irises':                  [0, -15, 'center'],
            'self_portrait_straw_hat': [0, -15, 'center'],
            'the_harvest':             [0, -15, 'center'],
            'the_bedroom':             [-14, 0, 'right'],
            'the_sower':               [0, 15, 'center'],
            'wheatfield_thunderclouds':[-14, 0, 'right'],
            'wheatfield_reaper':       [-14, 0, 'right'],
            'wheatfield_crows':        [0, 15, 'center'],
        };

        for (const ex of FLOORPLAN.exhibits) {
            const px = ex.pos.x, py = ex.pos.y;
            const nx = ex.wallNormal.x, ny = ex.wallNormal.y;

            // Frame rectangle (perpendicular to wallNormal)
            const frameW = 20, frameH = 3;

            c.save();
            c.translate(px, py);
            c.rotate(Math.atan2(ny, nx));
            c.fillStyle = '#7c6cf0';
            c.fillRect(-frameW / 2, -frameH / 2, frameW, frameH);
            c.fillStyle = '#5a4ad4';
            c.fillRect(-frameW / 2 + 2, -frameH / 2 + 0.5, frameW - 4, frameH - 1);
            c.strokeStyle = '#4a3ab8';
            c.lineWidth = 0.8;
            c.strokeRect(-frameW / 2, -frameH / 2, frameW, frameH);
            c.restore();

            // Exhibit number circle
            const viewX = px + nx * 20;
            const viewY = py + ny * 20;
            const exIdx = FLOORPLAN.exhibits.indexOf(ex) + 1;

            c.beginPath();
            c.arc(viewX, viewY, 10, 0, Math.PI * 2);
            c.fillStyle = '#fff';
            c.fill();
            c.strokeStyle = CONFIG.COLORS.ROOM_STROKE;
            c.lineWidth = 1.5;
            c.stroke();

            c.font = 'bold 11px "Inter", sans-serif';
            c.fillStyle = '#2a2a3a';
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText(exIdx, viewX, viewY);

            // Name label — positioned per exhibit to avoid overlaps
            const lp = LABEL_POS[ex.id] || [nx * 15, ny * 15, 'center'];
            c.font = '8px "Inter", sans-serif';
            c.fillStyle = 'rgba(40, 40, 60, 0.8)';
            c.textAlign = lp[2];
            c.textBaseline = 'middle';
            c.fillText(ex.name, viewX + lp[0], viewY + lp[1]);
        }
    }

    // --- Room labels ---

    function _drawRoomLabels(c) {
        // Room labels removed for cleaner look
    }

    // --- Titles ---

    function _drawTitles(c) {
        c.font = 'bold 18px "Inter", sans-serif';
        c.fillStyle = '#2a2a3a';
        c.textAlign = 'center';
        c.fillText('ENTRANCE / EXIT', 300, 55);

        c.font = 'bold 14px "Inter", sans-serif';
        c.fillStyle = '#2a2a3a';
        c.fillText('VAN GOGH MUSEUM', 300, 830);
        c.font = '10px "Inter", sans-serif';
        c.fillStyle = '#50506a';
        c.fillText('Amsterdam, Netherlands', 300, 844);
    }

    // ===== LIVE RENDERING (every frame) =====

    const EMOTION_HEX = {
        'Curious': '#5a9acf', 'Interested': '#5aafa0', 'Excited': '#dfb040',
        'Happy': '#d4a953', 'Calm': '#6aaf6a', 'Hopeful': '#7acf7a',
        'Proud': '#cfb05a', 'Affectionate': '#cf7aaf', 'Surprised': '#9a7acf',
        'Sad': '#7a8acf', 'Concerned': '#cf9a5a', 'Disappointed': '#cf6a5a',
        'Anxious': '#cf5a5a', 'Frustrated': '#cf4a4a', 'Afraid': '#af5a8a',
        'Confused': '#8a6abf', 'Amused': '#cfaf4a', 'Relieved': '#6abfaf',
        'Neutral': '#8a8a9a',
    };

    function render(visitors, heatmapGrid, emotionData) {
        // Clear main canvas with white background
        ctx.fillStyle = CONFIG.COLORS.BACKGROUND;
        ctx.fillRect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);

        // Apply centering transform — all content gets this ONCE
        ctx.save();
        _applyTransform(ctx);

        // Floor plan (offscreen canvas at world coords, transformed here)
        ctx.drawImage(floorCanvas, 0, 0);

        if (viewMode === 'heatmap' && heatmapGrid) {
            ctx.globalAlpha = 0.7;
            ctx.drawImage(heatCanvas, 0, 0);
            ctx.globalAlpha = 1.0;

            for (const v of visitors) {
                if (v.state === AgentState.DONE) continue;
                ctx.beginPath();
                ctx.arc(v.pos.x, v.pos.y, 2, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0,0,0,0.2)';
                ctx.fill();
            }
        } else if (viewMode === 'emotions') {
            for (const v of visitors) {
                if (v.state === AgentState.DONE) continue;
                ctx.beginPath();
                ctx.arc(v.pos.x, v.pos.y, 2, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0,0,0,0.15)';
                ctx.fill();
            }
            _drawEmotionOverlay(ctx, emotionData);
        } else {
            for (const v of visitors) {
                if (v.state === AgentState.DONE) continue;
                _drawVisitor(ctx, v);
            }
        }

        ctx.restore();
    }

    function _drawEmotionOverlay(c, emotionData) {
        if (!emotionData) return;

        for (const ex of FLOORPLAN.exhibits) {
            const emotions = emotionData[ex.id];
            if (!emotions) continue;

            const sorted = Object.entries(emotions).sort((a, b) => b[1] - a[1]);
            const total = sorted.reduce((s, [, v]) => s + v, 0);
            if (total === 0) continue;

            const cx = ex.pos.x + ex.wallNormal.x * 22;
            const cy = ex.pos.y + ex.wallNormal.y * 22;
            const radius = Math.min(14 + total * 1.5, 32);

            let startAngle = -Math.PI / 2;
            for (const [emotion, count] of sorted) {
                const sliceAngle = (count / total) * Math.PI * 2;
                c.beginPath();
                c.moveTo(cx, cy);
                c.arc(cx, cy, radius, startAngle, startAngle + sliceAngle);
                c.closePath();
                c.fillStyle = EMOTION_HEX[emotion] || EMOTION_HEX['Neutral'];
                c.globalAlpha = 0.85;
                c.fill();
                startAngle += sliceAngle;
            }
            c.globalAlpha = 1.0;

            c.beginPath();
            c.arc(cx, cy, radius, 0, Math.PI * 2);
            c.strokeStyle = 'rgba(0,0,0,0.15)';
            c.lineWidth = 1.5;
            c.stroke();

            const exIdx = FLOORPLAN.exhibits.indexOf(ex) + 1;
            c.beginPath();
            c.arc(cx, cy, 8, 0, Math.PI * 2);
            c.fillStyle = 'rgba(20,20,36,0.85)';
            c.fill();
            c.font = 'bold 8px "Inter", sans-serif';
            c.fillStyle = '#fff';
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText(exIdx, cx, cy);

            if (sorted.length > 0) {
                const dominant = sorted[0][0];
                const labelY = cy + radius + 10;
                c.font = 'bold 7px "Inter", sans-serif';
                c.fillStyle = EMOTION_HEX[dominant] || '#8a8a9a';
                c.textAlign = 'center';
                c.fillText(dominant, cx, labelY);
                c.font = '6px "Inter", sans-serif';
                c.fillStyle = 'rgba(50, 50, 70, 0.5)';
                c.fillText(`${total} Q`, cx, labelY + 9);
            }
        }
    }

    function _drawVisitor(c, v) {
        const color = v.getColor();
        const r = CONFIG.AGENT_RADIUS;

        c.beginPath();
        c.arc(v.pos.x, v.pos.y, r, 0, Math.PI * 2);
        c.fillStyle = color;
        c.fill();

        if (v.state === AgentState.WALKING || v.state === AgentState.ENTERING || v.state === AgentState.EXITING) {
            const hx = v.pos.x + Math.cos(v.heading) * r * 2;
            const hy = v.pos.y + Math.sin(v.heading) * r * 2;
            c.beginPath();
            c.moveTo(v.pos.x, v.pos.y);
            c.lineTo(hx, hy);
            c.strokeStyle = color;
            c.lineWidth = 1.2;
            c.stroke();
        }

        if (v.state === AgentState.VIEWING) {
            c.beginPath();
            c.arc(v.pos.x, v.pos.y, r + 2.5, 0, Math.PI * 2);
            c.strokeStyle = color;
            c.lineWidth = 0.8;
            c.globalAlpha = 0.4 + 0.3 * Math.sin(v.totalFrames * 0.08);
            c.stroke();
            c.globalAlpha = 1.0;
        }
    }

    // ===== HEATMAP =====

    function updateHeatmapCanvas(heatmapGrid) {
        const cellSize = CONFIG.HEATMAP_CELL_SIZE;
        const cols = heatmapGrid.cols;
        const rows = heatmapGrid.rows;
        const data = heatmapGrid.data;
        const gradient = CONFIG.HEATMAP_GRADIENT;

        const imageData = heatCtx.createImageData(CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);
        const pixels = imageData.data;

        for (let gy = 0; gy < rows; gy++) {
            for (let gx = 0; gx < cols; gx++) {
                const val = Math.min(data[gy * cols + gx], 1.0);
                if (val < 0.01) continue;

                let r = 0, g = 0, b = 0, a = 0;
                for (let i = 1; i < gradient.length; i++) {
                    if (val <= gradient[i][0]) {
                        const t = (val - gradient[i - 1][0]) / (gradient[i][0] - gradient[i - 1][0]);
                        const c0 = gradient[i - 1][1], c1 = gradient[i][1];
                        r = c0[0] + (c1[0] - c0[0]) * t;
                        g = c0[1] + (c1[1] - c0[1]) * t;
                        b = c0[2] + (c1[2] - c0[2]) * t;
                        a = c0[3] + (c1[3] - c0[3]) * t;
                        break;
                    }
                }

                const px0 = gx * cellSize, py0 = gy * cellSize;
                for (let py = py0; py < py0 + cellSize && py < CONFIG.CANVAS_HEIGHT; py++) {
                    for (let px = px0; px < px0 + cellSize && px < CONFIG.CANVAS_WIDTH; px++) {
                        const idx = (py * CONFIG.CANVAS_WIDTH + px) * 4;
                        pixels[idx] = r;
                        pixels[idx + 1] = g;
                        pixels[idx + 2] = b;
                        pixels[idx + 3] = a;
                    }
                }
            }
        }
        heatCtx.putImageData(imageData, 0, 0);
    }

    return { init, render, setViewMode, getViewMode, updateHeatmapCanvas, drawFloorPlan };
})();
