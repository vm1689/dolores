// proxy.js — CORS proxy that invokes Claude Code's LLM for evolution
// Usage: node server/proxy.js
// No API key needed — uses the `claude` CLI (must be installed and authenticated)

const http = require('http');
const { spawn } = require('child_process');

const PORT = 3001;

const server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.method === 'POST' && req.url === '/api/evolve') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            handleEvolve(body, res);
        });
        return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
});

async function handleEvolve(body, res) {
    try {
        const data = JSON.parse(body);
        const prompt = buildPrompt(data);

        console.log(`[evolve] Evolution #${data.evolutionNumber} — invoking claude CLI...`);
        const result = await invokeClaude(prompt);

        // Extract JSON from response (Claude may wrap it in markdown code blocks)
        const jsonStr = extractJSON(result);
        const parsed = JSON.parse(jsonStr);

        console.log(`[evolve] Success — ${Object.keys(parsed.exhibitChanges || {}).length} exhibit changes`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(parsed));
    } catch (e) {
        console.error('[evolve] Error:', e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
    }
}

function buildPrompt(data) {
    const system = `You are the curator AI for the Van Gogh Museum simulation. Your job is to evolve exhibit descriptions and Q&A answers based on visitor interaction patterns.

Rules:
- Popular exhibits (high visit counts): add deeper detail, richer context, more vivid language
- Neglected exhibits (low visit counts): make descriptions more compelling with hooks and intriguing facts
- Adjust answer tone to match the dominant emotional patterns visitors show at each exhibit
- Keep descriptions under 300 characters
- Keep answers conversational and informative
- Return ONLY valid JSON, no markdown, no explanation

Return this exact JSON structure:
{
  "exhibitChanges": { "<exhibitId>": { "desc": "<new description>" } },
  "qaChanges": { "<exhibitId>": [{ "originalQ": "<question text>", "newA": "<evolved answer>" }] },
  "summary": "<one sentence describing what changed and why>"
}`;

    const user = `Evolution #${data.evolutionNumber}

Visit patterns (per exhibit):
${JSON.stringify(data.visitPatterns, null, 2)}

Q&A summary (top questions and emotions per exhibit):
${JSON.stringify(data.qaSummary, null, 2)}

Current exhibit descriptions:
${JSON.stringify(data.currentDescriptions, null, 2)}

Evolve the top 4 most-visited and bottom 2 least-visited exhibits. For each, update the description and evolve 1-2 Q&A answers to better match visitor emotional patterns.`;

    return system + '\n\n---\n\n' + user;
}

function invokeClaude(prompt) {
    return new Promise((resolve, reject) => {
        const proc = spawn('claude', ['-p', '--output-format', 'text'], {
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 120000,
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', d => stdout += d.toString());
        proc.stderr.on('data', d => stderr += d.toString());

        proc.on('close', code => {
            if (code !== 0) {
                reject(new Error(`claude exited with code ${code}: ${stderr}`));
            } else {
                resolve(stdout);
            }
        });

        proc.on('error', err => {
            reject(new Error(`Failed to invoke claude CLI: ${err.message}. Is claude installed?`));
        });

        proc.stdin.write(prompt);
        proc.stdin.end();
    });
}

function extractJSON(text) {
    // Try direct parse first
    try { JSON.parse(text); return text; } catch {}
    // Extract from markdown code block
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) return match[1].trim();
    // Find first { to last }
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1) return text.slice(start, end + 1);
    throw new Error('Could not extract JSON from Claude response');
}

server.listen(PORT, () => {
    console.log(`[proxy] Evolution proxy running on http://localhost:${PORT}`);
    console.log('[proxy] Using Claude Code CLI for LLM — no API key needed');
    console.log('[proxy] POST /api/evolve to trigger evolution');
});
