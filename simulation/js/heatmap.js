// heatmap.js — Grid accumulator with time decay and gradient rendering

const HeatmapGrid = (() => {
    const cellSize = CONFIG.HEATMAP_CELL_SIZE;
    const cols = Math.ceil(CONFIG.CANVAS_WIDTH / cellSize);
    const rows = Math.ceil(CONFIG.CANVAS_HEIGHT / cellSize);
    const data = new Float32Array(cols * rows);

    function accumulate(visitors) {
        // Decay existing values
        for (let i = 0; i < data.length; i++) {
            data[i] *= CONFIG.HEATMAP_DECAY;
        }

        // Add heat from each visitor
        for (const v of visitors) {
            if (v.state === AgentState.DONE) continue;

            const gx = Math.floor(v.pos.x / cellSize);
            const gy = Math.floor(v.pos.y / cellSize);

            if (gx >= 0 && gx < cols && gy >= 0 && gy < rows) {
                const idx = gy * cols + gx;
                data[idx] = Math.min(data[idx] + CONFIG.HEATMAP_ACCUMULATE, 1.0);

                // Spread to neighbors for smoother look
                const spread = CONFIG.HEATMAP_ACCUMULATE * 0.3;
                if (gx > 0) data[idx - 1] = Math.min(data[idx - 1] + spread, 1.0);
                if (gx < cols - 1) data[idx + 1] = Math.min(data[idx + 1] + spread, 1.0);
                if (gy > 0) data[idx - cols] = Math.min(data[idx - cols] + spread, 1.0);
                if (gy < rows - 1) data[idx + cols] = Math.min(data[idx + cols] + spread, 1.0);
            }
        }
    }

    function reset() {
        data.fill(0);
    }

    return { cols, rows, data, accumulate, reset };
})();
