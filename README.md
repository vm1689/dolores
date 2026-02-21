# Dolores

## An AI Museum Agent That Gets Smarter With Every Visitor

We started with a simple question: what if a museum could listen, learn, and evolve?

Most audio guides are static. You press a number, hear the same script everyone else hears, and move on. We wanted something different. We wanted a guide that could sense how a visitor was feeling, respond to their actual questions, and then use that interaction data to improve itself over time.

That's how Dolores was born. She's an AI museum agent built around Van Gogh's collection at the Van Gogh Museum in Amsterdam. The system has three layers.

**The first is visitor-facing.** Dolores works as an emotion-aware audio guide. When a visitor asks a question about a painting, Modulate's voice intelligence API analyzes the emotional tone of their speech, and Google Gemini generates a response calibrated to that emotion. A visitor feeling sad in front of *The Potato Eaters* gets a different answer than one who's simply curious.

**The second layer is for curators.** A real-time canvas simulation visualizes how visitors move through galleries, where they linger, what they skip, and how crowds cluster. This gives curators a live read on exhibit performance without clipboard surveys.

**The third layer is what makes Dolores a self-improving agent.** The system observes patterns across visitor interactions: which paintings spark the most questions, what emotions surface most often, which answers fall flat. It feeds this data back through Claude to evolve exhibit descriptions and Q&A content automatically. Each wave of visitors makes the next wave's experience better.

Built for **Google Hackathon NYC** and **Modulate AI Hackathon** / February 2026

---

## How It Works

| | **Dolores iOS App** | **Visitor Flow Simulation** |
|---|---|---|
| **For** | Museum visitors | Museum curators |
| **What** | Hands-free AI audio guide triggered by BLE beacons | Browser-based crowd simulation of the Van Gogh Museum |
| **Why** | Replace static plaques with conversational AI | Optimize gallery layout, exhibit placement, and Dolores Q&A |
| **AI** | Gemini 2.5 Flash (voice) + Gemini 3 Flash (vision) + Modulate Velma-2 (emotion) | Claude (self-learning evolution of descriptions) |

---

## Dolores iOS App

```
Walk up to a painting
  -> Beacon detected -> narration plays automatically
  -> Speak during narration -> AI docent connects instantly
  -> Ask about a detail -> artwork zooms to the relevant area
  -> Walk to the next painting -> cycle repeats
```

### Architecture

Two independent pipes run in parallel — voice never blocks vision:

```
+-----------------------------------------------------------+
|                       Dolores App                          |
|                                                            |
|  +------------------------+  +-------------------------+   |
|  |   PIPE 1: Voice        |  |   PIPE 2: Zoom          |   |
|  |                        |  |                          |   |
|  |  Gemini 2.5 Flash      |  |  Gemini 3 Flash         |   |
|  |  Live API (WebSocket)  |  |  REST + code execution   |   |
|  |                        |  |                          |   |
|  |  16kHz PCM16 in        |  |  POST image + question   |   |
|  |  24kHz PCM16 out       |  |  -> PIL crop/zoom        |   |
|  |  Bidirectional audio   |  |  -> cropped JPEG back    |   |
|  +------------------------+  +-------------------------+   |
|            ^                          ^                    |
|            |   user transcription     |                    |
|            +--------- triggers -------+                    |
+-----------------------------------------------------------+
```

**Why two pipes?** The Live API WebSocket doesn't support image input. Gemini 3 Flash handles vision via REST with code execution, while 2.5 Flash handles real-time voice. The zoom is non-blocking, debounced 1.5s after user speech.

### Key Flows

**Beacon -> Playback:** Beacon enters immediate proximity (~2 ft) -> app navigates to PlayerView -> announcement plays -> full narration begins -> walk to next beacon and the cycle repeats.

**Speech -> Conversation:** Mic monitors during narration (RMS threshold) -> user speaks -> narration pauses -> WebSocket opens to Gemini Live API -> rolling buffer (~3s) sent so first words aren't lost -> bidirectional audio streams -> barge-in supported.

**Zoom Detail:** User asks about a visual detail -> transcription debounced 1.5s -> REST POST with artwork JPEG + question to Gemini 3 Flash -> code execution crops to relevant region -> zoomed image overlaid on player.

### Setup

```bash
# 1. Generate Xcode project
brew install xcodegen
xcodegen generate
open Dolores.xcodeproj

# 2. Add your Gemini API key in Dolores/Info.plist
#    Get one from https://aistudio.google.com/apikey

# 3. Build to a physical iPhone (beacons + mic need real hardware)
```

**Beacon setup (Blue Charm BLE):** Install KBeaconPro, connect to each beacon, configure SLOT0 as iBeacon with UUID `E2C56DB5-DFFB-48D2-B060-D0F5A71096E0`, Major `1` or `2`, Minor `1`.

---

## Visitor Flow Simulation

A browser-based simulation of visitor movement through the Van Gogh Museum (12 artworks, 7 galleries). Visitors are autonomous agents with Boids-style steering, A* pathfinding, and personality traits that affect which artworks they visit and how long they stay.

### Features

- **Real-time canvas simulation** — agents enter, browse galleries, view artworks, visit amenities, and exit
- **Three view modes** — dot view (agent states), heatmap (traffic density), emotion overlay (Q&A sentiment)
- **Dolores Q&A simulation** — visitors "ask questions" at exhibits with emotion-tagged interactions via Modulate Velma-2
- **Self-learning evolution** — every 100 exhibit visits, Claude analyzes interaction patterns and evolves exhibit descriptions and Q&A answers
- **Analytics dashboard** — occupancy, exhibit popularity, average dwell times, live Q&A feed

### 12 Artworks

| # | Painting | Year | Gallery |
|---|----------|------|---------|
| 1 | The Potato Eaters | 1885 | Early Works |
| 2 | Sunflowers | 1889 | Early Works |
| 3 | Almond Blossom | 1890 | Paris & Provence |
| 4 | Self-Portrait with Grey Felt Hat | 1887 | Paris & Provence |
| 5 | Irises | 1890 | Paris & Provence |
| 6 | Self-Portrait with Straw Hat | 1887 | Masterworks I |
| 7 | The Harvest | 1888 | Masterworks II |
| 8 | The Bedroom | 1888 | Masterworks II |
| 9 | The Sower | 1888 | Masterworks II |
| 10 | Wheatfield under Thunderclouds | 1890 | Late Period |
| 11 | Wheatfield with a Reaper | 1889 | Late Period |
| 12 | Wheatfield with Crows | 1890 | Late Period |

### Self-Learning System

```
Visitors interact with exhibits (view, ask questions, express emotions)
  -> Every 100 total exhibit visits, data is packaged
  -> Claude analyzes: which exhibits are popular/neglected, what emotions dominate
  -> Exhibit descriptions rewritten (popular ones get depth, neglected ones get hooks)
  -> Q&A answers adapt to visitor emotional patterns
  -> Changes stored in IndexedDB with full version history
  -> Reset restores originals; reload restores last evolution
```

### Setup

```bash
# Just open in a browser
open simulation/index.html

# For self-learning evolution (optional):
node simulation/server/proxy.js
```

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `1` | Dot view |
| `2` | Heatmap view |
| `3` | Emotion overlay |
| `R` | Reset simulation |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **iOS App** | Swift / SwiftUI, iOS 17.0+, zero external dependencies |
| **Voice AI** | Gemini 2.5 Flash Live API — real-time bidirectional audio over WebSocket |
| **Vision AI** | Gemini 3 Flash — image analysis with Python code execution for cropping |
| **Emotion Detection** | Modulate Velma-2 STT — voice emotion, accent, and language analysis |
| **Self-Learning** | Claude — evolves exhibit descriptions and Q&A from visitor patterns |
| **Beacon Hardware** | CoreLocation BLE iBeacon ranging and monitoring |
| **Audio** | AVFoundation (`AVAudioEngine` real-time, `AVAudioPlayer` narration) |
| **Artwork Data** | Met Open Access API with offline fallback |
| **Simulation** | HTML5 Canvas, Boids steering, A* pathfinding, IndexedDB |

## Project Structure

```
dolores/
├── Dolores/                    # iOS app source (Swift)
│   ├── Models/                 #   Artwork data, beacon manager
│   ├── Views/                  #   Scanning, player, conversation UI
│   ├── Services/               #   Gemini voice/vision, audio, Met API
│   └── Resources/              #   Artwork images, narration audio
├── Dolores.xcodeproj/
├── scripts/                    # Audio generation utilities
├── simulation/                 # Van Gogh Museum visitor simulation
│   ├── js/                     #   Agent, renderer, pathfinder, analytics, etc.
│   ├── css/
│   ├── server/                 #   Claude proxy for self-learning
│   ├── img/artworks/           #   12 Van Gogh paintings
│   └── index.html
└── README.md
```

## License

Artwork data and images from [The Metropolitan Museum of Art Open Access API](https://metmuseum.github.io/) — CC0 Public Domain. Van Gogh paintings are in the public domain.
