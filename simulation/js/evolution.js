// evolution.js — Self-learning system: evolves descriptions and Q&A based on visitor patterns
//
// Every EVOLUTION_THRESHOLD total exhibit visits, packages interaction data and calls
// the local proxy (which invokes Claude Code's LLM) to evolve exhibit descriptions
// and Q&A answers. Stores version history in IndexedDB. Reset restores originals.

const Evolution = (() => {

    // ================================================================
    //  STATE
    // ================================================================

    let originalExhibitDescs = {};   // exhibitId → original desc string
    let originalQuestionBank = {};   // exhibitId → deep copy of original Q&A array
    let lastTriggerTotal = 0;        // last total visits when evolution triggered
    let evolutionCount = 0;          // how many evolutions have occurred
    let isEvolving = false;          // prevent concurrent evolutions
    let db = null;

    const DB_NAME = 'EvolutionHistory';
    const DB_VERSION = 1;
    const STORE_NAME = 'evolutions';

    // ================================================================
    //  IndexedDB
    // ================================================================

    function openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (e) => {
                const database = e.target.result;
                if (!database.objectStoreNames.contains(STORE_NAME)) {
                    database.createObjectStore(STORE_NAME, {
                        keyPath: 'id',
                        autoIncrement: true,
                    });
                }
            };

            request.onsuccess = (e) => {
                db = e.target.result;
                resolve(db);
            };

            request.onerror = (e) => {
                console.error('Evolution DB error:', e.target.error);
                reject(e.target.error);
            };
        });
    }

    function _storeEvolution(record) {
        if (!db) return;
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).add(record);
    }

    function getAllEvolutions() {
        return new Promise((resolve) => {
            if (!db) { resolve([]); return; }
            const tx = db.transaction(STORE_NAME, 'readonly');
            const request = tx.objectStore(STORE_NAME).getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve([]);
        });
    }

    function _getLatestEvolution() {
        return new Promise((resolve) => {
            if (!db) { resolve(null); return; }
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.openCursor(null, 'prev');
            request.onsuccess = (e) => {
                const cursor = e.target.result;
                resolve(cursor ? cursor.value : null);
            };
            request.onerror = () => resolve(null);
        });
    }

    // ================================================================
    //  INIT — snapshot originals, restore last evolution if any
    // ================================================================

    async function init() {
        await openDB();

        // Snapshot originals before any evolution is applied
        for (const ex of FLOORPLAN.exhibits) {
            originalExhibitDescs[ex.id] = ex.desc;
        }
        for (const [id, qaArray] of Object.entries(QUESTION_BANK_DATA)) {
            originalQuestionBank[id] = JSON.parse(JSON.stringify(qaArray));
        }

        // Restore last evolution from IndexedDB (persist across page reloads)
        const latest = await _getLatestEvolution();
        if (latest) {
            _applyEvolution(latest.exhibitChanges, latest.qaChanges);
            evolutionCount = latest.evolutionNumber;
            lastTriggerTotal = latest.totalVisits;
            console.log(`[evolution] Restored evolution #${evolutionCount} from IndexedDB`);
        }

        updateDOM();
    }

    // ================================================================
    //  CHECK TRIGGER — called every update loop frame
    // ================================================================

    function checkTrigger() {
        if (isEvolving) return;

        // Sum total exhibit visits
        let totalVisits = 0;
        for (const key in Analytics.stats.exhibitVisits) {
            totalVisits += Analytics.stats.exhibitVisits[key].count;
        }

        const threshold = CONFIG.EVOLUTION_THRESHOLD;
        const nextTrigger = lastTriggerTotal + threshold;

        if (totalVisits >= nextTrigger && totalVisits > 0) {
            triggerEvolution(totalVisits);
        }
    }

    // ================================================================
    //  TRIGGER EVOLUTION — package data, call proxy, apply result
    // ================================================================

    async function triggerEvolution(totalVisits) {
        if (isEvolving) return;
        isEvolving = true;
        evolutionCount++;

        console.log(`[evolution] Triggering evolution #${evolutionCount} at ${totalVisits} total visits`);
        _setStatus('evolving');

        try {
            const payload = _buildPayload(totalVisits);
            const result = await _callClaude(payload);

            if (result.exhibitChanges || result.qaChanges) {
                _applyEvolution(result.exhibitChanges || {}, result.qaChanges || {});

                _storeEvolution({
                    evolutionNumber: evolutionCount,
                    timestamp: Date.now(),
                    totalVisits: totalVisits,
                    exhibitChanges: result.exhibitChanges || {},
                    qaChanges: result.qaChanges || {},
                    summary: result.summary || '',
                    inputSnapshot: payload,
                });

                lastTriggerTotal = totalVisits;
                _setStatus('success', result.summary);
                console.log(`[evolution] Applied evolution #${evolutionCount}: ${result.summary}`);
            } else {
                _setStatus('error', 'No changes returned');
            }
        } catch (e) {
            console.warn('[evolution] Skipped — proxy not available:', e.message);
            evolutionCount--; // rollback count
            lastTriggerTotal = totalVisits; // advance threshold so we don't retry immediately
            // Silently skip — proxy server isn't running, no need to show UI error
        }

        isEvolving = false;
    }

    // ================================================================
    //  BUILD PAYLOAD — package visitor data for Claude
    // ================================================================

    function _buildPayload(totalVisits) {
        // Visit patterns per exhibit
        const visitPatterns = {};
        for (const [id, data] of Object.entries(Analytics.stats.exhibitVisits)) {
            visitPatterns[id] = {
                name: data.name,
                visits: data.count,
                avgDwell: data.count > 0 ? (data.totalDwell / data.count).toFixed(1) : '0',
                currentViewers: data.currentViewers,
            };
        }

        // Q&A summary per exhibit (from Dolores session stats)
        const qaSummary = {};
        for (const [id, count] of Object.entries(Dolores.sessionStats.exhibitQuestions)) {
            const emotions = Dolores.sessionStats.exhibitEmotions[id] || {};
            const topEmotions = Object.entries(emotions)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([e, c]) => `${e}(${c})`);

            // Get top 5 asked questions for this exhibit from feed buffer
            const topQs = Dolores.feedBuffer
                .filter(f => f.exhibitId === id)
                .slice(0, 5)
                .map(f => f.question);

            qaSummary[id] = {
                totalQuestions: count,
                topEmotions,
                topQuestions: topQs,
            };
        }

        // Current descriptions
        const currentDescriptions = {};
        for (const ex of FLOORPLAN.exhibits) {
            currentDescriptions[ex.id] = ex.desc;
        }

        return {
            evolutionNumber: evolutionCount,
            totalVisits,
            visitPatterns,
            qaSummary,
            currentDescriptions,
        };
    }

    // ================================================================
    //  CALL CLAUDE — fetch to local proxy
    // ================================================================

    async function _callClaude(payload) {
        const url = CONFIG.EVOLUTION_PROXY_URL;

        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!resp.ok) {
            const err = await resp.json().catch(() => ({ error: resp.statusText }));
            throw new Error(err.error || `Proxy returned ${resp.status}`);
        }

        return resp.json();
    }

    // ================================================================
    //  APPLY EVOLUTION — mutate live data in place
    // ================================================================

    function _applyEvolution(exhibitChanges, qaChanges) {
        // Update exhibit descriptions
        for (const [id, changes] of Object.entries(exhibitChanges)) {
            const exhibit = FLOORPLAN.exhibits.find(e => e.id === id);
            if (exhibit && changes.desc) {
                exhibit.desc = changes.desc;
            }
        }

        // Update Q&A answers
        for (const [id, qChanges] of Object.entries(qaChanges)) {
            const bank = QUESTION_BANK_DATA[id];
            if (!bank) continue;

            for (const change of qChanges) {
                const qa = bank.find(item => item.q === change.originalQ);
                if (qa && change.newA) {
                    qa.a = change.newA;
                }
            }
        }
    }

    // ================================================================
    //  RESTORE ORIGINALS — called by Reset
    // ================================================================

    function restoreOriginals() {
        // Restore exhibit descriptions
        for (const ex of FLOORPLAN.exhibits) {
            if (originalExhibitDescs[ex.id]) {
                ex.desc = originalExhibitDescs[ex.id];
            }
        }

        // Restore question bank answers
        for (const [id, originalQA] of Object.entries(originalQuestionBank)) {
            if (QUESTION_BANK_DATA[id]) {
                QUESTION_BANK_DATA[id].length = 0;
                for (const item of originalQA) {
                    QUESTION_BANK_DATA[id].push(JSON.parse(JSON.stringify(item)));
                }
            }
        }

        // Reset trigger state (keep IndexedDB history)
        lastTriggerTotal = 0;
        evolutionCount = 0;
        isEvolving = false;

        updateDOM();
        console.log('[evolution] Restored original descriptions and Q&A');
    }

    // ================================================================
    //  DOM — evolution status indicator
    // ================================================================

    let statusTimeout = null;

    function _setStatus(state, message) {
        updateDOM(state, message);

        // Auto-clear success/error after 10s
        if (state === 'success' || state === 'error') {
            clearTimeout(statusTimeout);
            statusTimeout = setTimeout(() => updateDOM(), 10000);
        }
    }

    function updateDOM(state, message) {
        const el = document.getElementById('evolution-status');
        if (!el) return;

        if (state === 'evolving') {
            el.className = 'evolution-status evolving';
            el.innerHTML = '<span class="evo-pulse"></span> Evolving descriptions...';
        } else if (state === 'success') {
            el.className = 'evolution-status success';
            el.innerHTML = `<span class="evo-check">&#10003;</span> Evolution #${evolutionCount}${message ? ': ' + message : ''}`;
        } else if (state === 'error') {
            el.className = 'evolution-status error';
            el.innerHTML = `<span class="evo-x">&#10007;</span> Evolution failed${message ? ': ' + message : ''}`;
        } else if (evolutionCount > 0) {
            el.className = 'evolution-status idle';
            el.innerHTML = `<span class="evo-dot"></span> v${evolutionCount} active`;
        } else {
            el.className = 'evolution-status idle';
            el.innerHTML = '';
        }
    }

    // ================================================================
    //  PUBLIC API
    // ================================================================

    return {
        init,
        checkTrigger,
        triggerEvolution,
        restoreOriginals,
        getAllEvolutions,
        updateDOM,
    };
})();
