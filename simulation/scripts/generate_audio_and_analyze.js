#!/usr/bin/env node
// generate_audio_and_analyze.js
// 1. Read Q&A bank
// 2. Translate ~40% of questions into other languages
// 3. Generate audio via macOS `say` with matching native voices
// 4. Send to Modulate batch API for emotion/accent/language detection
// 5. Save results as JSON

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT = path.resolve(__dirname, '..');
const AUDIO_DIR = path.join(PROJECT, 'audio', 'questions');
const RESULTS_FILE = path.join(PROJECT, 'audio', 'modulate_results.json');

const API_KEY = process.env.MODULATE_API_KEY || 'YOUR_MODULATE_API_KEY';
const BATCH_URL = 'https://modulate-prototype-apis.com/api/velma-2-stt-batch';

// Voice profiles — each with native language capability
const VOICE_PROFILES = [
    // English (~60%)
    { voice: 'Daniel', lang: 'en', locale: 'en_GB', label: 'British Male', speaksEnglish: true },
    { voice: 'Flo (English (UK))', lang: 'en', locale: 'en_GB', label: 'British Female', speaksEnglish: true },
    { voice: 'Samantha', lang: 'en', locale: 'en_US', label: 'American Female', speaksEnglish: true },
    { voice: 'Fred', lang: 'en', locale: 'en_US', label: 'American Male', speaksEnglish: true },
    { voice: 'Aman', lang: 'en', locale: 'en_IN', label: 'Indian Male', speaksEnglish: true },
    { voice: 'Karen', lang: 'en', locale: 'en_AU', label: 'Australian Female', speaksEnglish: true },
    // French (~8%)
    { voice: 'Thomas', lang: 'fr', locale: 'fr_FR', label: 'French Male', speaksEnglish: false },
    { voice: 'Amelie', lang: 'fr', locale: 'fr_CA', label: 'French-Canadian Female', speaksEnglish: false },
    // German (~7%)
    { voice: 'Anna', lang: 'de', locale: 'de_DE', label: 'German Female', speaksEnglish: false },
    // Dutch (~7%)
    { voice: 'Ellen', lang: 'nl', locale: 'nl_BE', label: 'Dutch Female', speaksEnglish: false },
    // Spanish (~7%)
    { voice: 'Monica', lang: 'es', locale: 'es_ES', label: 'Spanish Female', speaksEnglish: false },
    // Italian (~6%)
    { voice: 'Alice', lang: 'it', locale: 'it_IT', label: 'Italian Female', speaksEnglish: false },
    // Japanese (~5%)
    { voice: 'Kyoko', lang: 'ja', locale: 'ja_JP', label: 'Japanese Female', speaksEnglish: false },
];

// Common museum question translations — pre-translated phrases
// For non-English voices, we translate the question before TTS
const TRANSLATIONS = {
    fr: {
        "What": "Qu'est-ce que", "Why": "Pourquoi", "How": "Comment", "When": "Quand",
        "Where": "O\u00f9", "Who": "Qui", "Is": "Est-ce que", "Did": "Est-ce que",
        "Can you": "Pouvez-vous", "Tell me": "Dites-moi", "What does": "Que signifie",
        "I notice": "Je remarque", "This painting": "Ce tableau", "The colors": "Les couleurs",
        "Van Gogh": "Van Gogh", "painted": "a peint", "this": "ceci", "the": "le",
        "brushstrokes": "coups de pinceau", "canvas": "toile", "yellow": "jaune",
        "blue": "bleu", "dark": "sombre", "light": "lumi\u00e8re",
    },
    de: {
        "What": "Was", "Why": "Warum", "How": "Wie", "When": "Wann",
        "Where": "Wo", "Who": "Wer", "Is": "Ist", "Did": "Hat",
        "Can you": "K\u00f6nnen Sie", "Tell me": "Erz\u00e4hlen Sie mir",
        "This painting": "Dieses Gem\u00e4lde", "The colors": "Die Farben",
        "Van Gogh": "Van Gogh", "painted": "gemalt", "brushstrokes": "Pinselstriche",
    },
    nl: {
        "What": "Wat", "Why": "Waarom", "How": "Hoe", "When": "Wanneer",
        "Where": "Waar", "Who": "Wie", "Is": "Is", "Did": "Heeft",
        "Can you": "Kunt u", "Tell me": "Vertel me",
        "This painting": "Dit schilderij", "The colors": "De kleuren",
        "Van Gogh": "Van Gogh", "painted": "schilderde", "brushstrokes": "penseelstreken",
    },
    es: {
        "What": "Qu\u00e9", "Why": "Por qu\u00e9", "How": "C\u00f3mo", "When": "Cu\u00e1ndo",
        "Where": "D\u00f3nde", "Who": "Qui\u00e9n", "Is": "Es", "Did": "Hizo",
        "Can you": "Puede", "Tell me": "D\u00edgame",
        "This painting": "Esta pintura", "The colors": "Los colores",
        "Van Gogh": "Van Gogh", "painted": "pint\u00f3", "brushstrokes": "pinceladas",
    },
    it: {
        "What": "Che cosa", "Why": "Perch\u00e9", "How": "Come", "When": "Quando",
        "Where": "Dove", "Who": "Chi", "Is": "È", "Did": "Ha",
        "Can you": "Pu\u00f2", "Tell me": "Mi dica",
        "This painting": "Questo dipinto", "The colors": "I colori",
        "Van Gogh": "Van Gogh", "painted": "dipinse", "brushstrokes": "pennellate",
    },
    ja: {
        "What": "\u4f55", "Why": "\u306a\u305c", "How": "\u3069\u3046\u3084\u3063\u3066",
        "When": "\u3044\u3064", "Where": "\u3069\u3053\u3067",
        "Van Gogh": "\u30b4\u30c3\u30db", "painting": "\u7d75\u753b",
        "this painting": "\u3053\u306e\u7d75",
    },
};

// Full question translations for non-English voices
// Use macOS `translate` shell or a simple word-swap approach
function translateQuestion(question, targetLang) {
    // Use macOS translate command if available, otherwise simple phrase swap
    try {
        // Try using macOS Shortcuts/translate via python
        const escaped = question.replace(/'/g, "\\'").replace(/"/g, '\\"');
        const pyCmd = `python3 -c "
import subprocess, json
text = '${escaped}'
lang_map = {'fr':'French','de':'German','nl':'Dutch','es':'Spanish','it':'Italian','ja':'Japanese'}
target = lang_map.get('${targetLang}', 'French')
# Use deep_translator if available
try:
    from deep_translator import GoogleTranslator
    result = GoogleTranslator(source='en', target='${targetLang}').translate(text)
    print(result)
except:
    print(text)
"`;
        const result = execSync(pyCmd, { timeout: 8000, encoding: 'utf8' }).trim();
        if (result && result !== question) return result;
    } catch (e) {
        // Fallback: basic word swap
    }

    // Fallback: simple prefix translation for key question words
    const dict = TRANSLATIONS[targetLang] || {};
    let translated = question;
    for (const [en, foreign] of Object.entries(dict)) {
        translated = translated.replace(new RegExp(`\\b${en}\\b`, 'g'), foreign);
    }
    return translated;
}

// Load Q&A bank
function loadQuestions() {
    const code = fs.readFileSync(path.join(PROJECT, 'js', 'question_bank.js'), 'utf8')
        .replace('const QUESTION_BANK_DATA', 'var QUESTION_BANK_DATA');
    eval(code);
    return QUESTION_BANK_DATA;
}

// Assign voice to each question — ~60% English, ~40% other languages
function assignVoice(artworkIndex, questionIndex) {
    const englishVoices = VOICE_PROFILES.filter(v => v.speaksEnglish);
    const foreignVoices = VOICE_PROFILES.filter(v => !v.speaksEnglish);

    // Use a deterministic but varied pattern
    const seed = artworkIndex * 31 + questionIndex * 7;
    const isForeign = (seed % 5) < 2; // 40% foreign

    if (isForeign) {
        return foreignVoices[seed % foreignVoices.length];
    } else {
        return englishVoices[seed % englishVoices.length];
    }
}

// Generate audio file using macOS say
function generateAudio(text, voiceName, outputPath) {
    const aiffPath = outputPath.replace('.wav', '.aiff');
    const escaped = text.replace(/"/g, '\\"').replace(/`/g, '');
    try {
        execSync(`say -v "${voiceName}" -o "${aiffPath}" "${escaped}"`, { timeout: 15000 });
        execSync(`afconvert -f WAVE -d LEI16 "${aiffPath}" "${outputPath}"`, { timeout: 10000 });
        try { fs.unlinkSync(aiffPath); } catch(e) {}
        return true;
    } catch (e) {
        console.error(`TTS failed: ${e.message.slice(0, 100)}`);
        try { fs.unlinkSync(aiffPath); } catch(e) {}
        return false;
    }
}

// Send audio to Modulate batch API
async function analyzeWithModulate(audioPath) {
    const fileData = fs.readFileSync(audioPath);
    const fileName = path.basename(audioPath);

    const formData = new FormData();
    formData.append('upload_file', new Blob([fileData], { type: 'audio/wav' }), fileName);
    formData.append('speaker_diarization', 'true');
    formData.append('emotion_signal', 'true');
    formData.append('accent_signal', 'true');

    try {
        const resp = await fetch(BATCH_URL, {
            method: 'POST',
            headers: { 'X-API-Key': API_KEY },
            body: formData,
        });

        if (!resp.ok) {
            const errText = await resp.text();
            console.error(`Modulate ${resp.status}: ${errText.slice(0, 150)}`);
            return null;
        }

        return await resp.json();
    } catch (e) {
        console.error(`Modulate error: ${e.message}`);
        return null;
    }
}

// Main pipeline
async function main() {
    // Check if deep_translator is available
    let hasTranslator = false;
    try {
        execSync('python3 -c "from deep_translator import GoogleTranslator"', { timeout: 5000 });
        hasTranslator = true;
        console.log('deep_translator available — will use Google Translate for foreign languages\n');
    } catch {
        console.log('deep_translator not found — installing...\n');
        try {
            execSync('pip3 install deep_translator', { timeout: 30000 });
            hasTranslator = true;
            console.log('Installed deep_translator successfully\n');
        } catch {
            console.log('Could not install deep_translator — will use basic word-swap translations\n');
        }
    }

    const qbank = loadQuestions();
    const artworks = Object.keys(qbank);
    const results = {};
    let totalGenerated = 0;
    let totalAnalyzed = 0;
    let langCounts = {};

    console.log(`Processing ${artworks.length} artworks, 360 questions total...\n`);

    for (let ai = 0; ai < artworks.length; ai++) {
        const artId = artworks[ai];
        const questions = qbank[artId];
        results[artId] = [];
        console.log(`\n=== ${artId} (${questions.length} questions) ===`);

        for (let i = 0; i < questions.length; i++) {
            const qa = questions[i];
            const profile = assignVoice(ai, i);
            const filename = `${artId}_q${String(i + 1).padStart(2, '0')}_${profile.lang}.wav`;
            const audioPath = path.join(AUDIO_DIR, filename);

            // Translate if non-English voice
            let spokenText = qa.q;
            let spokenLang = 'en';
            if (!profile.speaksEnglish) {
                spokenText = translateQuestion(qa.q, profile.lang);
                spokenLang = profile.lang;
            }

            langCounts[spokenLang] = (langCounts[spokenLang] || 0) + 1;

            process.stdout.write(`  [${i + 1}/${questions.length}] ${profile.label} (${spokenLang})... `);

            // Step 1: Generate audio
            const ok = generateAudio(spokenText, profile.voice, audioPath);
            if (!ok) {
                results[artId].push({
                    question_en: qa.q, question_spoken: spokenText,
                    answer: qa.a, tagged_emotion: qa.emotion,
                    voice: profile.label, spoken_lang: spokenLang,
                    file: filename, modulate: null,
                });
                console.log('SKIP (TTS failed)');
                continue;
            }
            totalGenerated++;

            // Step 2: Send to Modulate
            const modResult = await analyzeWithModulate(audioPath);
            totalAnalyzed++;

            const entry = {
                question_en: qa.q,
                question_spoken: spokenText,
                answer: qa.a,
                tagged_emotion: qa.emotion,
                voice: profile.label,
                spoken_lang: spokenLang,
                file: filename,
                modulate: modResult ? {
                    text: modResult.text || '',
                    duration_ms: modResult.duration_ms || 0,
                    utterances: (modResult.utterances || []).map(u => ({
                        text: u.text,
                        emotion: u.emotion || null,
                        accent: u.accent || null,
                        language: u.language || null,
                        speaker: u.speaker || null,
                    })),
                } : null,
            };

            results[artId].push(entry);

            const detected = modResult?.utterances?.[0]?.emotion || 'N/A';
            const accent = modResult?.utterances?.[0]?.accent || 'N/A';
            const detectedLang = modResult?.utterances?.[0]?.language || 'N/A';
            console.log(`emotion=${detected}, accent=${accent}, lang=${detectedLang}`);

            // Save progress every 10
            if (totalAnalyzed % 10 === 0) {
                fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
            }
        }
    }

    // Final save
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));

    console.log(`\n========================================`);
    console.log(`Audio generated: ${totalGenerated}`);
    console.log(`Modulate analyzed: ${totalAnalyzed}`);
    console.log(`Results saved to: ${RESULTS_FILE}`);

    console.log(`\nLanguage distribution (spoken):`);
    Object.entries(langCounts).sort((a, b) => b[1] - a[1])
        .forEach(([l, c]) => console.log(`  ${l}: ${c} (${(c / 360 * 100).toFixed(0)}%)`));

    // Emotion summary
    const emotionCounts = {};
    for (const artId of artworks) {
        for (const r of results[artId]) {
            const e = r.modulate?.utterances?.[0]?.emotion;
            if (e) emotionCounts[e] = (emotionCounts[e] || 0) + 1;
        }
    }
    console.log(`\nModulate detected emotions:`);
    Object.entries(emotionCounts).sort((a, b) => b[1] - a[1])
        .forEach(([e, c]) => console.log(`  ${e}: ${c}`));

    // Accent summary
    const accentCounts = {};
    for (const artId of artworks) {
        for (const r of results[artId]) {
            const a = r.modulate?.utterances?.[0]?.accent;
            if (a) accentCounts[a] = (accentCounts[a] || 0) + 1;
        }
    }
    console.log(`\nModulate detected accents:`);
    Object.entries(accentCounts).sort((a, b) => b[1] - a[1])
        .forEach(([a, c]) => console.log(`  ${a}: ${c}`));
}

main().catch(console.error);
