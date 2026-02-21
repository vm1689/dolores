// main.js — Animation loop, spawning, event wiring

const Simulation = (() => {
    let visitors = [];
    let spatialHash = new SpatialHash(CONFIG.SPATIAL_HASH_CELL);
    let frameCount = 0;
    let running = true;
    let timeScale = 1.0;
    let spawnRate = CONFIG.SPAWN_RATE_DEFAULT;
    let spawnAccum = 0;
    let animFrameId = null;
    let lastRooms = new Map(); // track room transitions

    async function init() {
        const canvas = document.getElementById('sim-canvas');
        Renderer.init(canvas);
        Analytics.init();
        Analytics.updateDOM();
        await Dolores.init();
        await Evolution.init();
        wireControls();
        fitCanvas();
        window.addEventListener('resize', fitCanvas);
        loop();
    }

    function fitCanvas() {
        const canvas = document.getElementById('sim-canvas');
        const container = document.getElementById('canvas-container');
        const padH = 32, padV = 32;
        const availW = container.clientWidth - padH;
        const availH = container.clientHeight - padV;
        const scaleX = availW / CONFIG.CANVAS_WIDTH;
        const scaleY = availH / CONFIG.CANVAS_HEIGHT;
        const scale = Math.min(scaleX, scaleY, 1); // never upscale
        canvas.style.transform = `scale(${scale})`;
    }

    function loop() {
        if (running) {
            update();
        }
        render();
        animFrameId = requestAnimationFrame(loop);
    }

    function update() {
        frameCount++;

        // Spawn new visitors
        spawnAccum += spawnRate * timeScale / 60;
        while (spawnAccum >= 1.0 && visitors.filter(v => v.state !== AgentState.DONE).length < CONFIG.MAX_VISITORS) {
            spawnVisitor();
            spawnAccum -= 1.0;
        }
        if (spawnAccum >= 1.0) spawnAccum = 0; // cap if at max

        // Rebuild spatial hash
        spatialHash.clear();
        for (const v of visitors) {
            if (v.state !== AgentState.DONE) {
                spatialHash.insert(v);
            }
        }

        // Update all visitors
        const simTime = frameCount / 60;
        for (const v of visitors) {
            const prevState = v.state;
            const prevTarget = v.currentTarget;

            v.update(spatialHash, timeScale);

            // Dolores: tick Q&A for viewing visitors
            if (v.state === AgentState.VIEWING) {
                Dolores.tickViewing(v, timeScale, simTime);
            }

            // Track exhibit visits (transition from VIEWING to something else)
            if (prevState === AgentState.VIEWING && v.state !== AgentState.VIEWING && prevTarget) {
                Analytics.recordExhibitVisit(prevTarget.id, v.lastViewDuration);
            }

            // Track visitor exits
            if (prevState !== AgentState.DONE && v.state === AgentState.DONE) {
                Analytics.recordVisitorExit(v.getDuration());
                Dolores.removeVisitor(v.id);
            }

            // Track room transitions
            const prevRoom = lastRooms.get(v.id);
            if (v.currentRoom !== prevRoom && v.state !== AgentState.DONE) {
                lastRooms.set(v.id, v.currentRoom);
                Analytics.recordRoomEntry(v.currentRoom);
            }
        }

        // Clean up DONE visitors periodically
        if (frameCount % 300 === 0) {
            visitors = visitors.filter(v => v.state !== AgentState.DONE);
        }

        // Heatmap accumulation
        if (frameCount % CONFIG.HEATMAP_UPDATE_INTERVAL === 0) {
            HeatmapGrid.accumulate(visitors);
            if (Renderer.getViewMode() === 'heatmap') {
                Renderer.updateHeatmapCanvas(HeatmapGrid);
            }
        }

        // Analytics + Dolores DOM update
        if (frameCount % CONFIG.ANALYTICS_UPDATE_INTERVAL === 0) {
            Analytics.update(visitors);
            Analytics.updateDOM();
            Dolores.updateDOM();
            Evolution.checkTrigger();
        }
    }

    function render() {
        Renderer.render(visitors, HeatmapGrid, Dolores.sessionStats.exhibitEmotions);
    }

    function spawnVisitor() {
        const v = new Visitor();
        v.spawnFrame = frameCount;
        visitors.push(v);
        lastRooms.set(v.id, 'entrance');
        Analytics.recordVisitorSpawn();
        Analytics.recordRoomEntry('entrance');
        Dolores.initVisitor(v.id);
    }

    function reset() {
        visitors = [];
        lastRooms.clear();
        frameCount = 0;
        spawnAccum = 0;
        _agentIdCounter = 0;
        HeatmapGrid.reset();
        Analytics.reset();
        Dolores.reset();
        Evolution.restoreOriginals();
        Dolores.updateDOM();
        Renderer.updateHeatmapCanvas(HeatmapGrid);
    }

    function wireControls() {
        // Play/Pause
        const playBtn = document.getElementById('btn-play');
        playBtn.addEventListener('click', () => {
            running = !running;
            playBtn.textContent = running ? 'Pause' : 'Play';
            playBtn.classList.toggle('paused', !running);
        });

        // Speed slider
        const speedSlider = document.getElementById('speed-slider');
        const speedLabel = document.getElementById('speed-value');
        speedSlider.addEventListener('input', () => {
            timeScale = parseFloat(speedSlider.value);
            speedLabel.textContent = timeScale.toFixed(1) + 'x';
        });

        // Spawn rate slider
        const spawnSlider = document.getElementById('spawn-slider');
        const spawnLabel = document.getElementById('spawn-value');
        spawnSlider.addEventListener('input', () => {
            spawnRate = parseFloat(spawnSlider.value);
            spawnLabel.textContent = spawnRate.toFixed(1) + '/s';
        });

        // Reset
        document.getElementById('btn-reset').addEventListener('click', reset);

        // View mode toggle — Heatmap button
        const modeBtn = document.getElementById('btn-mode');
        const emotionsBtn = document.getElementById('btn-emotions');

        function _setMode(mode) {
            Renderer.setViewMode(mode);
            modeBtn.classList.toggle('heatmap-active', mode === 'heatmap');
            emotionsBtn.classList.toggle('emotions-active', mode === 'emotions');
            if (mode === 'heatmap') {
                Renderer.updateHeatmapCanvas(HeatmapGrid);
            }
        }

        modeBtn.addEventListener('click', () => {
            _setMode(Renderer.getViewMode() === 'heatmap' ? 'dots' : 'heatmap');
        });

        emotionsBtn.addEventListener('click', () => {
            _setMode(Renderer.getViewMode() === 'emotions' ? 'dots' : 'emotions');
        });

        // Dolores DB controls
        document.getElementById('btn-export-qa').addEventListener('click', async () => {
            const data = await Dolores.getAllInteractions();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `dolores-qa-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
        });

        document.getElementById('btn-export-evo').addEventListener('click', async () => {
            const data = await Evolution.getAllEvolutions();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `evolution-history-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
        });

        document.getElementById('btn-clear-qa').addEventListener('click', async () => {
            await Dolores.clearDB();
            const el = document.getElementById('dolores-db-count');
            if (el) el.textContent = '0 stored interactions';
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT') return;

            switch (e.key) {
                case ' ':
                    e.preventDefault();
                    playBtn.click();
                    break;
                case '1':
                    _setMode('dots');
                    break;
                case '2':
                    _setMode('heatmap');
                    break;
                case '3':
                    _setMode('emotions');
                    break;
                case 'r':
                    reset();
                    break;
            }
        });
    }

    return { init };
})();

// Boot
window.addEventListener('DOMContentLoaded', () => {
    Simulation.init();
});
