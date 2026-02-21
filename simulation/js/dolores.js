// dolores.js — Dolores audio guide: Q&A simulation + IndexedDB persistence
//
// Simulates visitors using the Dolores app while viewing artworks.
// Each question/answer pair is stored in IndexedDB for persistence.
//
// Architecture mirrors the real Dolores app:
//   - Beacon proximity triggers narration (here: visitor enters VIEWING state)
//   - Visitor speaks → question fires (here: random chance per frame while viewing)
//   - Gemini responds with context-aware answer
//   - Optional zoom detail captured

const Dolores = (() => {

    // ================================================================
    //  QUESTION BANK — loaded from question_bank.js (540+ curated Q&A)
    // ================================================================

    const QUESTION_BANK = QUESTION_BANK_DATA;

    // ================================================================
    //  QUESTION CATEGORIES (for analytics)
    // ================================================================

    const CATEGORIES = ['technique', 'history', 'subject', 'context', 'detail'];

    // ================================================================
    //  MODULATE EMOTION LOOKUP — loaded from modulate_results.json
    //  Hybrid: prefer Modulate-detected emotion when non-Neutral,
    //  fall back to tagged emotion from question bank
    // ================================================================

    let modulateEmotionLookup = {}; // key: "exhibitId::question_en" → detected emotion

    async function _loadModulateEmotions() {
        try {
            const resp = await fetch('audio/modulate_results.json');
            if (!resp.ok) return;
            const data = await resp.json();
            for (const [exhibitId, entries] of Object.entries(data)) {
                for (const entry of entries) {
                    const detected = entry.modulate?.utterances?.[0]?.emotion;
                    if (detected && detected !== 'Neutral') {
                        const key = `${exhibitId}::${entry.question_en}`;
                        modulateEmotionLookup[key] = detected;
                    }
                }
            }
            const count = Object.keys(modulateEmotionLookup).length;
            console.log(`Loaded ${count} Modulate non-neutral emotions`);
        } catch (e) {
            console.warn('Could not load Modulate emotions:', e.message);
        }
    }

    function _resolveEmotion(exhibitId, questionText, taggedEmotion) {
        // Hybrid: Modulate detection takes priority when non-Neutral
        const key = `${exhibitId}::${questionText}`;
        const modulateEmotion = modulateEmotionLookup[key];
        if (modulateEmotion) return modulateEmotion;
        return taggedEmotion || 'Neutral';
    }

    // ================================================================
    //  IndexedDB — persistent Q&A storage
    // ================================================================

    const DB_NAME = 'DoloresVanGogh';
    const DB_VERSION = 1;
    const STORE_NAME = 'interactions';
    let db = null;

    function openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, {
                        keyPath: 'id',
                        autoIncrement: true,
                    });
                    store.createIndex('exhibitId', 'exhibitId', { unique: false });
                    store.createIndex('visitorId', 'visitorId', { unique: false });
                    store.createIndex('category', 'category', { unique: false });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    store.createIndex('simTimestamp', 'simTimestamp', { unique: false });
                }
            };

            request.onsuccess = (e) => {
                db = e.target.result;
                resolve(db);
            };

            request.onerror = (e) => {
                console.error('Dolores DB error:', e.target.error);
                reject(e.target.error);
            };
        });
    }

    function storeInteraction(record) {
        if (!db) return;
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).add(record);
    }

    function getAllInteractions() {
        return new Promise((resolve) => {
            if (!db) { resolve([]); return; }
            const tx = db.transaction(STORE_NAME, 'readonly');
            const request = tx.objectStore(STORE_NAME).getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve([]);
        });
    }

    function getInteractionCount() {
        return new Promise((resolve) => {
            if (!db) { resolve(0); return; }
            const tx = db.transaction(STORE_NAME, 'readonly');
            const request = tx.objectStore(STORE_NAME).count();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(0);
        });
    }

    function clearDB() {
        return new Promise((resolve) => {
            if (!db) { resolve(); return; }
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).clear();
            tx.oncomplete = () => resolve();
        });
    }

    // No external API needed — all questions are pre-generated by Claude Code's
    // own LLM at build time. This is zero-cost at runtime and uses the best model.

    // ================================================================
    //  SIMULATION ENGINE
    // ================================================================

    // Per-visitor Dolores state (keyed by visitor ID)
    const visitorDoloresState = new Map();

    // Recent Q&A feed (in-memory ring buffer for sidebar display)
    const feedBuffer = [];
    const FEED_MAX = 50;

    // Session stats
    const sessionStats = {
        totalQuestions: 0,
        categoryCount: {},  // category → count
        emotionCount: {},   // emotion → count
        exhibitQuestions: {}, // exhibitId → count
        exhibitEmotions: {}, // exhibitId → { emotion → count }
        zoomRequests: 0,
    };

    function initVisitor(visitorId) {
        visitorDoloresState.set(visitorId, {
            hasApp: Math.random() < 0.7,     // 70% of visitors have the app
            askedThisExhibit: false,
            questionCooldown: 0,              // frames until next question allowed
            questionsAsked: new Set(),        // track used Q indices per exhibit
        });
    }

    function removeVisitor(visitorId) {
        visitorDoloresState.delete(visitorId);
    }

    // Called every frame for each visitor in VIEWING state
    function tickViewing(visitor, timeScale, simTime) {
        const state = visitorDoloresState.get(visitor.id);
        if (!state || !state.hasApp) return;
        if (!visitor.currentTarget) return;

        state.questionCooldown -= timeScale;
        if (state.questionCooldown > 0) return;

        // Chance to ask a question: ~2% per frame while viewing, scaled by art interest
        const askChance = 0.02 * visitor.artInterest * timeScale;
        if (Math.random() > askChance) return;

        const exhibitId = visitor.currentTarget.id;

        // Cooldown: at least 3 seconds (180 frames) before next question
        state.questionCooldown = 180;
        state.askedThisExhibit = true;

        _tryBankQuestion(state, visitor, exhibitId, simTime);
    }

    function _tryBankQuestion(state, visitor, exhibitId, simTime) {
        const bank = QUESTION_BANK[exhibitId];
        if (!bank || bank.length === 0) return;

        const available = bank.filter((_, i) => !state.questionsAsked.has(`${exhibitId}_${i}`));
        if (available.length === 0) return;

        const idx = Math.floor(Math.random() * available.length);
        const qa = available[idx];
        const bankIdx = bank.indexOf(qa);
        state.questionsAsked.add(`${exhibitId}_${bankIdx}`);

        _recordQA(qa, visitor, exhibitId, simTime, 'curated');
    }

    function _recordQA(qa, visitor, exhibitId, simTime, source) {
        const emotion = _resolveEmotion(exhibitId, qa.q, qa.emotion);
        const record = {
            visitorId: visitor.id,
            exhibitId: exhibitId,
            exhibitName: visitor.currentTarget ? visitor.currentTarget.name : exhibitId,
            room: visitor.currentRoom,
            question: qa.q,
            answer: qa.a,
            emotion: emotion,
            category: qa.category || 'subject',
            hasZoom: !!qa.zoom,
            source: source,
            timestamp: Date.now(),
            simTimestamp: simTime,
        };

        storeInteraction(record);

        sessionStats.totalQuestions++;
        sessionStats.categoryCount[record.category] = (sessionStats.categoryCount[record.category] || 0) + 1;
        sessionStats.emotionCount[emotion] = (sessionStats.emotionCount[emotion] || 0) + 1;
        sessionStats.exhibitQuestions[exhibitId] = (sessionStats.exhibitQuestions[exhibitId] || 0) + 1;
        // Per-exhibit emotion tracking
        if (!sessionStats.exhibitEmotions[exhibitId]) sessionStats.exhibitEmotions[exhibitId] = {};
        sessionStats.exhibitEmotions[exhibitId][emotion] = (sessionStats.exhibitEmotions[exhibitId][emotion] || 0) + 1;
        if (record.hasZoom) sessionStats.zoomRequests++;

        feedBuffer.unshift(record);
        if (feedBuffer.length > FEED_MAX) feedBuffer.pop();
    }

    // Reset for when the simulation resets
    function reset() {
        visitorDoloresState.clear();
        feedBuffer.length = 0;
        sessionStats.totalQuestions = 0;
        sessionStats.categoryCount = {};
        sessionStats.emotionCount = {};
        sessionStats.exhibitQuestions = {};
        sessionStats.exhibitEmotions = {};
        sessionStats.zoomRequests = 0;
    }

    // ================================================================
    //  DOM RENDERING — sidebar feed + stats
    // ================================================================

    function updateDOM() {
        _updateFeed();
        _updateDoloresStats();
    }

    function _updateFeed() {
        const el = document.getElementById('dolores-feed');
        if (!el) return;

        if (feedBuffer.length === 0) {
            el.innerHTML = '<div class="empty-text">Waiting for visitors to ask questions...</div>';
            return;
        }

        // Show last 8 interactions
        const recent = feedBuffer.slice(0, 8);
        let html = '';
        for (const r of recent) {
            const catClass = `cat-${r.category}`;
            const zoomBadge = r.hasZoom ? '<span class="zoom-badge">ZOOM</span>' : '';
            const emotionTag = r.emotion ? _emotionBadge(r.emotion) : '';
            html += `<div class="feed-item">
                <div class="feed-header">
                    <span class="feed-exhibit">${r.exhibitName}</span>
                    <span class="feed-cat ${catClass}">${r.category}</span>
                    ${emotionTag}
                    ${zoomBadge}
                </div>
                <div class="feed-q">Visitor #${r.visitorId}: "${r.question}"</div>
                <div class="feed-a">${r.answer}</div>
            </div>`;
        }
        el.innerHTML = html;
    }

    // Emotion color mapping
    const EMOTION_COLORS = {
        'Curious':       { bg: 'rgba(37, 99, 235, 0.08)', fg: '#2563eb' },
        'Interested':    { bg: 'rgba(13, 148, 136, 0.08)', fg: '#0d9488' },
        'Excited':       { bg: 'rgba(202, 138, 4, 0.08)',  fg: '#a16207' },
        'Happy':         { bg: 'rgba(234, 88, 12, 0.08)',  fg: '#c2410c' },
        'Calm':          { bg: 'rgba(22, 163, 74, 0.08)',  fg: '#16a34a' },
        'Hopeful':       { bg: 'rgba(22, 163, 74, 0.08)',  fg: '#15803d' },
        'Proud':         { bg: 'rgba(202, 138, 4, 0.08)',  fg: '#a16207' },
        'Affectionate':  { bg: 'rgba(219, 39, 119, 0.08)', fg: '#be185d' },
        'Surprised':     { bg: 'rgba(124, 108, 240, 0.08)',fg: '#7c6cf0' },
        'Sad':           { bg: 'rgba(99, 102, 241, 0.08)', fg: '#4f46e5' },
        'Concerned':     { bg: 'rgba(234, 88, 12, 0.08)',  fg: '#ea580c' },
        'Disappointed':  { bg: 'rgba(220, 38, 38, 0.08)',  fg: '#dc2626' },
        'Anxious':       { bg: 'rgba(220, 38, 38, 0.08)',  fg: '#b91c1c' },
        'Frustrated':    { bg: 'rgba(220, 38, 38, 0.08)',  fg: '#991b1b' },
        'Afraid':        { bg: 'rgba(219, 39, 119, 0.08)', fg: '#9d174d' },
        'Confused':      { bg: 'rgba(124, 108, 240, 0.08)',fg: '#6d28d9' },
        'Amused':        { bg: 'rgba(202, 138, 4, 0.08)',  fg: '#b45309' },
        'Relieved':      { bg: 'rgba(13, 148, 136, 0.08)', fg: '#0f766e' },
        'Neutral':       { bg: 'rgba(0, 0, 0, 0.04)',      fg: '#6b7280' },
    };

    function _emotionBadge(emotion) {
        const c = EMOTION_COLORS[emotion] || EMOTION_COLORS['Neutral'];
        return `<span class="emotion-badge" style="background:${c.bg};color:${c.fg}">${emotion}</span>`;
    }

    function _updateDoloresStats() {
        const el = document.getElementById('dolores-stats');
        if (!el) return;

        // Top questioned exhibits
        const topExhibits = Object.entries(sessionStats.exhibitQuestions)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        const exhibitNames = {};
        for (const ex of FLOORPLAN.exhibits) exhibitNames[ex.id] = ex.name;

        let topHtml = '';
        for (const [id, count] of topExhibits) {
            topHtml += `<div class="stat-row"><span>${exhibitNames[id] || id}</span><span class="stat-value">${count}</span></div>`;
        }

        // Category breakdown
        let catHtml = '';
        for (const cat of CATEGORIES) {
            const count = sessionStats.categoryCount[cat] || 0;
            if (count > 0) {
                catHtml += `<span class="feed-cat cat-${cat}">${cat} ${count}</span> `;
            }
        }

        el.innerHTML = `
            <div class="stat-row"><span>Total Questions</span><span class="stat-value">${sessionStats.totalQuestions}</span></div>
            <div class="dolores-categories">${catHtml}</div>
            <div class="dolores-top-label">Most Asked About</div>
            ${topHtml}
        `;

        // Emotion distribution
        const emotionEl = document.getElementById('emotion-distribution');
        if (emotionEl) {
            const sorted = Object.entries(sessionStats.emotionCount)
                .sort((a, b) => b[1] - a[1]);

            if (sorted.length === 0) {
                emotionEl.innerHTML = '<div class="empty-text">Waiting for Q&A data...</div>';
            } else {
                const total = sessionStats.totalQuestions || 1;
                let html = '<div class="emotion-bars">';
                for (const [emotion, count] of sorted) {
                    const pct = Math.round((count / total) * 100);
                    const c = EMOTION_COLORS[emotion] || EMOTION_COLORS['Neutral'];
                    html += `<div class="emotion-bar-row">
                        <span class="emotion-label" style="color:${c.fg}">${emotion}</span>
                        <div class="emotion-bar-track">
                            <div class="emotion-bar-fill" style="width:${pct}%;background:${c.fg}"></div>
                        </div>
                        <span class="emotion-count">${count}</span>
                    </div>`;
                }
                html += '</div>';
                emotionEl.innerHTML = html;
            }
        }

        // Per-exhibit emotion breakdown
        const exhibitEmotionEl = document.getElementById('exhibit-emotions');
        if (exhibitEmotionEl) {
            const topEx = Object.entries(sessionStats.exhibitQuestions)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 6);

            if (topEx.length === 0) {
                exhibitEmotionEl.innerHTML = '<div class="empty-text">Waiting for Q&A data...</div>';
            } else {
                let html = '';
                for (const [exId] of topEx) {
                    const emotions = sessionStats.exhibitEmotions[exId] || {};
                    const topEmotions = Object.entries(emotions)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 3);
                    if (topEmotions.length === 0) continue;
                    const badges = topEmotions.map(([e, c]) => _emotionBadge(e) + `<span class="emotion-tiny-count">${c}</span>`).join(' ');
                    html += `<div class="exhibit-emotion-row">
                        <span class="exhibit-emotion-name">${exhibitNames[exId] || exId}</span>
                        <div class="exhibit-emotion-badges">${badges}</div>
                    </div>`;
                }
                exhibitEmotionEl.innerHTML = html;
            }
        }
    }

    // ================================================================
    //  PUBLIC API
    // ================================================================

    async function init() {
        await openDB();
        await _loadModulateEmotions();
        // Load persisted count for display
        const count = await getInteractionCount();
        if (count > 0) {
            const el = document.getElementById('dolores-db-count');
            if (el) el.textContent = `${count} stored interactions`;
        }
    }

    return {
        init,
        initVisitor,
        removeVisitor,
        tickViewing,
        reset,
        updateDOM,
        clearDB,
        getAllInteractions,
        getInteractionCount,
        sessionStats,
        feedBuffer,
        QUESTION_BANK,
    };
})();
