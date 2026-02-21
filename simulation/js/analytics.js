// analytics.js — Stats tracking and DOM updates

const Analytics = (() => {
    const stats = {
        totalSpawned: 0,
        totalExited: 0,
        currentOccupancy: 0,
        avgDuration: 0,
        totalDuration: 0,
        exhibitVisits: {},    // exhibitId -> { count, totalDwell, currentViewers }
        roomOccupancy: {},    // roomId -> { current, totalVisits }
    };

    function init() {
        // Initialize exhibit stats
        for (const exhibit of FLOORPLAN.exhibits) {
            stats.exhibitVisits[exhibit.id] = {
                name: exhibit.name,
                count: 0,
                totalDwell: 0,
                currentViewers: 0,
            };
        }
        // Initialize room stats
        for (const room of FLOORPLAN.rooms) {
            stats.roomOccupancy[room.id] = {
                name: room.name,
                current: 0,
                totalVisits: 0,
                isCorridor: room.isCorridor || false,
            };
        }
    }

    function update(visitors) {
        // Reset current counts
        for (const key in stats.exhibitVisits) {
            stats.exhibitVisits[key].currentViewers = 0;
        }
        for (const key in stats.roomOccupancy) {
            stats.roomOccupancy[key].current = 0;
        }

        let activeCount = 0;
        for (const v of visitors) {
            if (v.state === AgentState.DONE) continue;
            activeCount++;

            // Room occupancy
            if (stats.roomOccupancy[v.currentRoom]) {
                stats.roomOccupancy[v.currentRoom].current++;
            }

            // Exhibit viewing
            if (v.state === AgentState.VIEWING && v.currentTarget) {
                const es = stats.exhibitVisits[v.currentTarget.id];
                if (es) es.currentViewers++;
            }
        }

        stats.currentOccupancy = activeCount;
    }

    function recordExhibitVisit(exhibitId, dwellFrames) {
        const es = stats.exhibitVisits[exhibitId];
        if (es) {
            es.count++;
            es.totalDwell += dwellFrames / 60; // convert to seconds
        }
    }

    function recordVisitorSpawn() {
        stats.totalSpawned++;
    }

    function recordVisitorExit(duration) {
        stats.totalExited++;
        stats.totalDuration += duration;
        stats.avgDuration = stats.totalDuration / stats.totalExited;
    }

    function recordRoomEntry(roomId) {
        if (stats.roomOccupancy[roomId]) {
            stats.roomOccupancy[roomId].totalVisits++;
        }
    }

    function updateDOM() {
        // Overview — metrics grid (4 cells)
        const overviewEl = document.getElementById('stats-overview');
        if (overviewEl) {
            overviewEl.innerHTML = `
                <div class="metric"><span class="metric-value">${stats.currentOccupancy}</span><span class="metric-label">Occupancy</span></div>
                <div class="metric"><span class="metric-value">${stats.totalSpawned}</span><span class="metric-label">Total</span></div>
                <div class="metric"><span class="metric-value">${stats.totalExited}</span><span class="metric-label">Completed</span></div>
                <div class="metric"><span class="metric-value">${formatTime(stats.avgDuration)}</span><span class="metric-label">Avg Visit</span></div>
            `;
        }

        // Exhibit popularity — sorted by visit count
        const exhibitEl = document.getElementById('stats-exhibits');
        if (exhibitEl) {
            const sorted = Object.values(stats.exhibitVisits)
                .sort((a, b) => b.count - a.count);

            let html = '<table><thead><tr><th>#</th><th>Exhibit</th><th>Visits</th><th>Avg</th><th>Now</th></tr></thead><tbody>';
            sorted.forEach((e, i) => {
                const avgDwell = e.count > 0 ? formatTime(e.totalDwell / e.count) : '-';
                html += `<tr>
                    <td>${i + 1}</td>
                    <td class="exhibit-name">${e.name}</td>
                    <td>${e.count}</td>
                    <td>${avgDwell}</td>
                    <td>${e.currentViewers > 0 ? e.currentViewers : '-'}</td>
                </tr>`;
            });
            html += '</tbody></table>';
            exhibitEl.innerHTML = html;
        }

        // Room occupancy
        const roomEl = document.getElementById('stats-rooms');
        if (roomEl) {
            const galleries = Object.values(stats.roomOccupancy)
                .filter(r => !r.isCorridor)
                .sort((a, b) => b.current - a.current);

            let html = '<table><thead><tr><th>Room</th><th>Now</th><th>Total</th></tr></thead><tbody>';
            for (const r of galleries) {
                html += `<tr>
                    <td class="exhibit-name">${r.name}</td>
                    <td>${r.current}</td>
                    <td>${r.totalVisits}</td>
                </tr>`;
            }
            html += '</tbody></table>';
            roomEl.innerHTML = html;
        }
    }

    function reset() {
        stats.totalSpawned = 0;
        stats.totalExited = 0;
        stats.currentOccupancy = 0;
        stats.avgDuration = 0;
        stats.totalDuration = 0;
        for (const key in stats.exhibitVisits) {
            stats.exhibitVisits[key].count = 0;
            stats.exhibitVisits[key].totalDwell = 0;
            stats.exhibitVisits[key].currentViewers = 0;
        }
        for (const key in stats.roomOccupancy) {
            stats.roomOccupancy[key].current = 0;
            stats.roomOccupancy[key].totalVisits = 0;
        }
        updateDOM();
    }

    return {
        init, update, updateDOM, reset,
        recordExhibitVisit, recordVisitorSpawn,
        recordVisitorExit, recordRoomEntry, stats,
    };
})();
