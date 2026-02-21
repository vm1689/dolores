# Dolores

Hands-free, AI-powered audio guide for The Metropolitan Museum of Art.

Built for **Google Hackathon NYC · February 2026**

## What It Does

- **Auto-detect artworks** — BLE iBeacons trigger narration the moment you walk up to a painting. No scanning, no typing.
- **AI docent conversation** — Interrupt the narration with your voice and talk to Dolores, a real-time AI guide powered by Gemini 2.5 Flash Live API over WebSocket.
- **Agentic vision** — Ask about a detail ("What's that blue shadow?") and Gemini 3 Flash autonomously crops and zooms into the relevant region of the artwork.

## How It Works

```
Walk up to a painting
  → Beacon detected → narration plays automatically
  → Speak during narration → AI docent connects instantly
  → Ask about a detail → artwork zooms to the relevant area
  → Walk to the next painting → cycle repeats
```

## Demo Artworks

| # | Artwork | Artist | Year | Medium | Beacon Major |
|---|---------|--------|------|--------|:------------:|
| 1 | The Great Wave off Kanagawa | Katsushika Hokusai | ca. 1830–32 | Polychrome woodblock print | `1` |
| 2 | Wheat Field with Cypresses | Vincent van Gogh | 1889 | Oil on canvas | `2` |

## Architecture

Two independent pipes run in parallel — voice never blocks vision:

```
┌─────────────────────────────────────────────────────────┐
│                       Dolores App                       │
│                                                         │
│  ┌───────────────────────┐  ┌────────────────────────┐  │
│  │   PIPE 1: Voice       │  │   PIPE 2: Zoom         │  │
│  │                       │  │                         │  │
│  │  Gemini 2.5 Flash     │  │  Gemini 3 Flash        │  │
│  │  Live API (native)    │  │  REST + code execution  │  │
│  │                       │  │                         │  │
│  │  WebSocket ↕ audio    │  │  POST image + question  │  │
│  │  16kHz PCM16 in       │  │  → PIL crop/zoom        │  │
│  │  24kHz PCM16 out      │  │  → cropped JPEG back    │  │
│  │                       │  │                         │  │
│  │  Bidirectional        │  │  Fire-and-forget        │  │
│  │  Stateful session     │  │  Stateless per-request  │  │
│  └───────────────────────┘  └────────────────────────┘  │
│            ▲                          ▲                  │
│            │ user transcription       │                  │
│            └──────── triggers ────────┘                  │
└─────────────────────────────────────────────────────────┘
```

**Why two pipes?** The Live API WebSocket doesn't support image input. Gemini 3 Flash handles vision via REST with code execution, while 2.5 Flash handles real-time voice. The zoom is a semantic enhancement — non-blocking, debounced 1.5s after user speech.

## Tech Stack

- **Swift / SwiftUI** — iOS 17.0+, pure SwiftUI views
- **CoreLocation** — BLE iBeacon ranging and monitoring
- **AVFoundation** — `AVAudioEngine` for real-time mic/speaker, `AVAudioPlayer` for narration
- **Gemini 2.5 Flash Live API** — Real-time voice conversation over WebSocket (voice: Aoede)
- **Gemini 3 Flash** — Vision analysis with Python code execution for image cropping
- **Met Open Access API** — Artwork metadata and images (with offline fallback)
- **OpenAI TTS** — Pre-generated announcement and narration audio
- Zero external dependencies

## Project Structure

```
Dolores/
├── DoloresApp.swift                 # App entry, beacon-triggered navigation + audio
├── Info.plist                       # API key, permissions, background modes
├── Models/
│   ├── Artwork.swift                # Data model, beacon-to-artwork catalog, fallback data
│   └── BeaconManager.swift          # iBeacon scanning, proximity tracking, region monitoring
├── Views/
│   ├── ScanningView.swift           # Home: pulse animation, beacon list, signal debug overlay
│   ├── PlayerView.swift             # Artwork image, metadata, audio controls, zoom overlay
│   └── ConversationOverlay.swift    # AI conversation: waveform, bouncing dots, live indicator
├── Services/
│   ├── AudioPlayerService.swift     # Narration playback, Now Playing, remote transport
│   ├── RealtimeService.swift        # Gemini Live WebSocket, audio engine, zoom, speech detection
│   └── MetAPIService.swift          # Met Collection API client with offline fallback
└── Resources/
    ├── announce_great_wave.mp3      # "You are now looking at..." intro
    ├── announce_wheat_field.mp3
    ├── great_wave.mp3               # Full narration (~1–2 min)
    ├── wheat_field.mp3
    ├── great_wave.jpg               # Bundled artwork image
    ├── wheat_field.jpg
    └── logo.svg                     # d + o = headphones logo
```

## Setup

### Prerequisites

- Xcode 15.0+
- [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`)
- Physical iPhone (beacons + mic don't work on simulator)

### Build & Run

```bash
xcodegen generate
open Dolores.xcodeproj
```

Select your iPhone, set your signing team, press Cmd+R.

### Gemini API Key

The app reads `GEMINI_API_KEY` from `Info.plist`. Replace the value with your own key from [Google AI Studio](https://aistudio.google.com/apikey).

### Beacon Configuration (Blue Charm BLE)

1. Install **KBeaconPro** on your phone
2. Connect to each beacon (default password: `0000000000000000`)
3. Configure under SLOT0 → iBeacon:

| Beacon | UUID | Major | Minor |
|--------|------|:-----:|:-----:|
| Great Wave | `E2C56DB5-DFFB-48D2-B060-D0F5A71096E0` | `1` | `1` |
| Wheat Field | `E2C56DB5-DFFB-48D2-B060-D0F5A71096E0` | `2` | `1` |

4. Save → Upload on each beacon

### Generate Audio

```bash
# Requires OPENAI_API_KEY environment variable
OPENAI_API_KEY=sk-... ./scripts/generate_audio_openai.sh
```

## Key Flows

### Beacon → Playback

```
Beacon enters immediate proximity (~2 ft)
  → App navigates to PlayerView
  → "You are now looking at [Title], by [Artist]. [Date]. [Medium]."
  → Full narration plays
  → Walk to next beacon → current audio stops, new begins
```

### Speech Detection → Conversation

```
Mic monitors during narration (RMS threshold 0.005)
  → User speaks → narration pauses
  → WebSocket opens to Gemini Live API
  → Rolling buffer (~3s) sent so first words aren't lost
  → Bidirectional audio streams
  → Barge-in supported: speak to interrupt AI mid-sentence
```

### Zoom Detail

```
User asks about a detail (e.g., "What's in the bottom left?")
  → Transcription captured from WebSocket
  → Debounced 1.5s for full sentence
  → REST POST: artwork JPEG + question → Gemini 3 Flash
  → Code execution: PIL crops to relevant ~30–50% region
  → Zoomed image overlaid on PlayerView with "ZOOMED" badge
```

## Design

- Dark theme (`#050508` background) for gallery atmosphere
- Met red accent (`#E1251B`) for branding
- Pulsing scan animation with signal strength indicators
- Conversation overlay with glassmorphism (`ultraThinMaterial`)
- Waveform bars and bouncing dots for AI state visualization
- Serif typography for artwork titles, sans-serif for metadata
- Logo: **d** and **o** form headphones connected by a headband

## License

Artwork data and images from [The Metropolitan Museum of Art Open Access API](https://metmuseum.github.io/) — CC0 Public Domain.
