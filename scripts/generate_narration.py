#!/usr/bin/env python3
"""Generate narration audio using Gemini API with Aoede voice."""

import json
import base64
import subprocess
import urllib.request
import sys
import os

API_KEY = os.environ.get("GEMINI_API_KEY", "YOUR_GEMINI_API_KEY")
MODEL = "gemini-2.5-flash-preview-tts"
VOICE = "Aoede"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "Dolores", "Resources")

NARRATIONS = {
    "great_wave": {
        "title": "The Great Wave off Kanagawa",
        "artist": "Katsushika Hokusai",
        "prompt": """You are Dolores, a warm and knowledgeable art docent at The Metropolitan Museum of Art.
Read the following narration naturally, as if you're standing next to a visitor who just walked up to the artwork.
Speak warmly and conversationally, with gentle pauses between ideas. Do NOT add any extra commentary — read ONLY the text below, exactly as written:

Welcome. You're standing before "The Great Wave off Kanagawa" by Katsushika Hokusai — one of the most iconic images in all of art history.

This woodblock print was created around 1830, when Hokusai was about seventy years old. It's part of his series "Thirty-six Views of Mount Fuji."

Look at that enormous wave — see how it towers over three fishing boats, the men clinging on as the sea churns around them. And there, in the distance, Mount Fuji sits perfectly still. Small, calm, eternal — almost easy to miss beneath all that chaos.

What makes this print so striking is the tension between power and stillness. The raw force of nature against something unmovable.

Hokusai used Prussian blue here — a pigment recently imported from Europe — to get those vivid, deep blues you see. He was blending Japanese printmaking traditions with Western perspective techniques, creating something entirely new.

This image went on to influence the Impressionists, including Monet, and even inspired Debussy's orchestral piece "La Mer."

If you'd like to know more — about the technique, the history, or anything that catches your eye — just ask. I'm right here."""
    },
    "wheat_field": {
        "title": "Wheat Field with Cypresses",
        "artist": "Vincent van Gogh",
        "prompt": """You are Dolores, a warm and knowledgeable art docent at The Metropolitan Museum of Art.
Read the following narration naturally, as if you're standing next to a visitor who just walked up to the artwork.
Speak warmly and conversationally, with gentle pauses between ideas. Do NOT add any extra commentary — read ONLY the text below, exactly as written:

Welcome. You're looking at "Wheat Field with Cypresses" by Vincent van Gogh, painted in 1889.

Van Gogh created this during his stay at the Saint-Paul-de-Mausole asylum in Saint-Rémy-de-Provence — just months after his famous breakdown. But look at what he made from that difficult time.

See those swirling clouds rolling across the sky, and the golden wheat rippling below. Those dark cypress trees in the center — they rise up like flames, twisting with an almost living energy. Van Gogh himself called cypresses "beautiful as regards lines and proportions, like an Egyptian obelisk."

Everything here vibrates. Look closely at the brushstrokes — they're thick, rhythmic, almost sculptural. The wheat moves, the sky pulses, the cypresses reach upward. Nothing is still.

Van Gogh made several versions of this composition. He considered it among his best summer landscapes. This one — the version here at The Met — is the final one, completed in his studio.

What I find most remarkable is the serenity. Despite everything he was going through, there's a profound peace here. This is nature rendered not as it looks, but as it feels.

If anything catches your eye, or you'd like to know more, just ask. I'm right here."""
    }
}


def generate_audio(name, info):
    print(f"\n{'='*60}")
    print(f"Generating: {name} — {info['title']}")
    print(f"{'='*60}")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key={API_KEY}"

    payload = {
        "contents": [
            {
                "parts": [{"text": info["prompt"]}]
            }
        ],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "voiceConfig": {
                    "prebuiltVoiceConfig": {
                        "voiceName": VOICE
                    }
                }
            }
        }
    }

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST"
    )

    print("Calling Gemini API...")
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            result = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        print(f"ERROR {e.code}: {body}")
        return False

    # Extract audio data
    candidates = result.get("candidates", [])
    if not candidates:
        print("ERROR: No candidates in response")
        print(json.dumps(result, indent=2)[:500])
        return False

    parts = candidates[0].get("content", {}).get("parts", [])
    audio_part = None
    for part in parts:
        if "inlineData" in part:
            audio_part = part["inlineData"]
            break

    if not audio_part:
        print("ERROR: No audio data in response")
        print(json.dumps(result, indent=2)[:500])
        return False

    mime_type = audio_part.get("mimeType", "unknown")
    audio_b64 = audio_part["data"]
    audio_bytes = base64.b64decode(audio_b64)

    print(f"Got audio: {mime_type}, {len(audio_bytes)} bytes ({len(audio_bytes)/1024:.1f} KB)")

    # Save raw audio
    raw_path = os.path.join(OUTPUT_DIR, f"{name}_raw")
    if "wav" in mime_type:
        raw_path += ".wav"
    elif "mp3" in mime_type:
        raw_path += ".mp3"
    elif "pcm" in mime_type or "L16" in mime_type:
        raw_path += ".pcm"
    else:
        raw_path += ".raw"
        print(f"Unknown mime type: {mime_type}")

    with open(raw_path, "wb") as f:
        f.write(audio_bytes)
    print(f"Saved raw: {raw_path}")

    # Convert to MP3 using ffmpeg
    mp3_path = os.path.join(OUTPUT_DIR, f"{name}.mp3")

    # Build ffmpeg command based on format
    if "pcm" in mime_type or "L16" in mime_type:
        # Raw PCM — need to specify format
        # Parse sample rate from mime type if available
        rate = "24000"
        if "rate=" in mime_type:
            rate = mime_type.split("rate=")[1].split(";")[0].strip()
        cmd = [
            "ffmpeg", "-y",
            "-f", "s16le",
            "-ar", rate,
            "-ac", "1",
            "-i", raw_path,
            "-codec:a", "libmp3lame",
            "-q:a", "2",
            mp3_path
        ]
    else:
        # WAV/other — ffmpeg can auto-detect
        cmd = [
            "ffmpeg", "-y",
            "-i", raw_path,
            "-codec:a", "libmp3lame",
            "-q:a", "2",
            mp3_path
        ]

    print(f"Converting to MP3: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"ffmpeg error: {result.stderr}")
        return False

    # Get file size
    mp3_size = os.path.getsize(mp3_path)
    print(f"MP3 saved: {mp3_path} ({mp3_size/1024:.1f} KB)")

    # Clean up raw file
    os.remove(raw_path)
    print(f"Cleaned up raw file")

    return True


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    success = 0
    for name, info in NARRATIONS.items():
        if generate_audio(name, info):
            success += 1

    print(f"\n{'='*60}")
    print(f"Done: {success}/{len(NARRATIONS)} narrations generated")
    if success == len(NARRATIONS):
        print("All narrations generated successfully!")
    else:
        print("Some narrations failed — check errors above")


if __name__ == "__main__":
    main()
