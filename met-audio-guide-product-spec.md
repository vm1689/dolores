# The Met Audio Guide — Product Specification

**Google Hackathon NYC · February 2026**

---

## Overview

A hands-free, beacon-powered audio guide app for The Metropolitan Museum of Art. Visitors walk through galleries with their phone — the app automatically detects nearby artworks via BLE beacons and plays rich audio narration without any manual input. No typing exhibit numbers. No scanning QR codes. Just walk and listen.

---

## Problem Statement

Current museum audio guide experiences are frustrating:

- **Manual number entry** — Visitors must find a small number label, open the app, type the number, and press play. This breaks immersion and creates friction at every single artwork.
- **Clunky rental devices** — Dedicated audio guide hardware is expensive ($5–7/rental), unhygienic, often out of battery, and requires queuing at pickup/return desks.
- **One-size-fits-all content** — Traditional guides offer a single narration track with no personalization for language, depth, or interest.

---

## Solution

A smartphone app that uses **Bluetooth Low Energy (BLE) beacons** placed next to each artwork to automatically trigger audio playback as visitors approach. Combined with the **Met Open Access API** for real artwork data and **Google Cloud Text-to-Speech** for dynamic narration.

---

## Target Users

| Segment | Description |
|---------|-------------|
| **Casual visitors** | First-time museumgoers who want context without reading every wall label |
| **Tourists** | International visitors who need multilingual audio (enabled via TTS) |
| **Repeat visitors** | Met members who want deeper dives into specific works |
| **Accessibility users** | Visually impaired visitors who benefit from automatic audio descriptions |

---

## Core Features

### 1. Beacon Detection & Auto-Play

The primary differentiator. The app continuously scans for BLE beacon signals in the background.

- **How it works:**
  - Each artwork has a small BLE beacon (iBeacon or Eddystone-UID protocol) mounted nearby
  - The beacon broadcasts a unique identifier every 100–300ms
  - The app detects the signal and measures RSSI (Received Signal Strength Indicator)
  - When the visitor enters the "near" proximity zone (~1–3 meters), the app automatically loads and plays the corresponding audio guide
  - When the visitor walks away (signal weakens), playback can optionally pause or continue

- **Proximity zones:**
  - **Immediate** (< 0.5m) — Trigger detailed mode
  - **Near** (0.5–3m) — Auto-play standard narration
  - **Far** (3–10m) — Show artwork in "nearby" list, don't auto-play

- **Beacon hardware:** Off-the-shelf BLE beacons (~$5–15 each), battery life 1–2 years on coin cell. Supports both iBeacon (Apple) and Eddystone (Google) protocols.

### 2. Audio Narration

Rich, museum-quality narration for each artwork.

- **Content:** Art-historical context including artist biography, technique, symbolism, historical significance, and viewing tips
- **Duration:** 3–4 minutes per artwork
- **Voice options (production):**
  - Pre-recorded human narration (highest quality)
  - Google Cloud Text-to-Speech (dynamic, multilingual, scalable)
- **Playback controls:** Play/pause, skip ±10 seconds, previous/next artwork, waveform scrubbing

### 3. Artwork Data (Met Open Access API)

Real-time artwork metadata pulled from the Met's public API.

- **Endpoint:** `https://collectionapi.metmuseum.org/public/collection/v1/objects/{objectID}`
- **Data used:** Title, artist, date, medium, dimensions, department, gallery number, credit line, high-resolution CC0 image
- **No API key required** — fully open access
- **492,000+ objects** available, with images for highlighted works

### 4. Expandable Transcript

Full text of the audio narration, synced with playback.

- Toggle open/closed below the player
- Supports accessibility (screen readers)
- Can be translated via Google Translate API for multilingual support

### 5. Collection Browser

A scrollable list of all artworks in the guided tour.

- Thumbnail, title, artist, gallery room, duration
- "Now playing" indicator for the current artwork
- Tap to jump to any artwork

---

## Hackathon Demo — 3 Artworks

For the hackathon demo, the app features three iconic Met paintings chosen for visual variety, recognition factor, and NYC relevance:

| # | Artwork | Artist | Year | Gallery | Why |
|---|---------|--------|------|---------|-----|
| 1 | **The Great Wave off Kanagawa** | Katsushika Hokusai | c. 1831 | 231 | Most recognizable artwork in the world. Vivid blues print great. |
| 2 | **Washington Crossing the Delaware** | Emanuel Leutze | 1851 | 760 | Monumental American history. NYC judges may know it in person. |
| 3 | **Cypresses** | Vincent van Gogh | 1889 | 822 | Van Gogh is universally known. Thick brushstrokes are dramatic even in print. |

All three are **CC0 public domain** — legally printable at any size for physical demo props.

---

## Technical Architecture

```
┌──────────────┐     BLE signal      ┌──────────────────┐
│  BLE Beacon  │ ──────────────────► │  Visitor's Phone │
│  (per artwork)│   UUID broadcast    │                  │
└──────────────┘                      │  ┌────────────┐  │
                                      │  │ BLE Scanner │  │
                                      │  └──────┬─────┘  │
                                      │         │        │
                                      │         ▼        │
                                      │  ┌────────────┐  │
                                      │  │ Beacon →   │  │
                                      │  │ Artwork Map│  │
                                      │  └──────┬─────┘  │
                                      │         │        │
                                      │    ┌────┴────┐   │
                                      │    ▼         ▼   │
                                      │ ┌──────┐ ┌─────┐│
                                      │ │Met   │ │GCP  ││
                                      │ │API   │ │TTS  ││
                                      │ └──┬───┘ └──┬──┘│
                                      │    │        │   │
                                      │    ▼        ▼   │
                                      │  ┌────────────┐ │
                                      │  │  Audio     │ │
                                      │  │  Player UI │ │
                                      │  └────────────┘ │
                                      └──────────────────┘
```

### Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React / Flutter | UI, audio player, state management |
| **BLE Scanning** | Android `BluetoothLeScanner` / CoreBluetooth (iOS) | Detect beacon proximity |
| **Artwork Data** | Met Open Access API | Title, artist, images, metadata |
| **Audio** | Google Cloud Text-to-Speech API | Generate narration from transcripts |
| **Beacon Protocol** | iBeacon + Eddystone-UID (dual) | Cross-platform beacon compatibility |
| **Beacon Hardware** | Estimote / Minew / Kontakt.io | Physical BLE beacons (~$5–15 each) |

### Beacon Configuration

Each beacon is configured with:

```
Beacon ID:     B1 / B2 / B3
Protocol:      Eddystone-UID (Google) + iBeacon (Apple)
TX Power:      -12 dBm (optimized for ~3m range)
Interval:      200ms
Battery:       CR2477 coin cell (~18 months)
Mounting:      Adhesive, placed on wall next to artwork label
```

Beacon-to-artwork mapping:

```json
{
  "B1": { "objectID": 39799,  "title": "The Great Wave off Kanagawa" },
  "B2": { "objectID": 11417,  "title": "Washington Crossing the Delaware" },
  "B3": { "objectID": 436535, "title": "Cypresses" }
}
```

---

## User Flow

```
1. OPEN APP
   └─► Scan screen appears with Met branding
       └─► BLE scanner activates automatically

2. WALK TOWARD PAINTING
   └─► App detects beacon signal, shows it in "nearby" list
       └─► Signal strength bars indicate proximity

3. STAND NEAR PAINTING (~1–3m)
   └─► App auto-navigates to player screen
       └─► Artwork image + metadata loads from Met API
           └─► Audio narration begins playing automatically

4. LISTEN & EXPLORE
   ├─► Play / Pause / Skip ±10s / Scrub waveform
   ├─► Expand transcript to read along
   └─► Tap "Back" to see collection list

5. WALK TO NEXT PAINTING
   └─► New beacon detected → auto-transition to next artwork
```

---

## Design Language

| Element | Choice | Rationale |
|---------|--------|-----------|
| Background | `#050508` near-black | Gallery-like atmosphere, makes artwork pop |
| Primary accent | `#e1251b` Met red | Matches The Met's institutional branding |
| Per-artwork accent | Blue / Green / Green | Each painting gets its own color identity |
| Display font | Libre Baskerville | Elegant serif, museum-appropriate |
| UI font | Outfit | Clean geometric sans-serif for metadata |
| Layout | Single column, 430px max | Mobile-first, one-handed gallery use |
| Animations | Beacon pulse rings, slide-up reveals | Conveys "scanning" and "detection" clearly |

---

## Google Cloud Integration (Hackathon Bonus Points)

| Service | Use Case |
|---------|----------|
| **Cloud Text-to-Speech** | Generate natural audio narration from transcript text in 40+ languages |
| **Cloud Translation** | Translate transcripts for international visitors |
| **Firebase** | User analytics, artwork engagement tracking, A/B test narration styles |
| **Nearby Messages API** | Alternative beacon detection layer via Google Play Services |
| **Cloud Storage** | Cache generated audio files for offline playback |
| **Vertex AI** | Generate personalized narration based on visitor's interests / pace |

---

## Metrics & Success Criteria

| Metric | Target |
|--------|--------|
| Beacon detection latency | < 2 seconds from entering range |
| Audio auto-play latency | < 3 seconds from detection |
| Artwork data load time | < 1 second (Met API) |
| Battery drain (1-hour visit) | < 5% phone battery |
| Beacon battery life | > 12 months |
| User satisfaction (demo) | Judges say "wow, it just works" |

---

## Hackathon Demo Setup

### What to bring:
- **3 printed paintings** (poster size, The Great Wave / Washington Crossing / Cypresses)
- **3 BLE beacons** (pre-configured with B1, B2, B3 IDs)
- **1 Android phone** running the app
- **1 backup phone** (can act as a BLE beacon broadcaster if needed)
- **Easels or wall space** to mount the printed paintings ~3m apart

### Demo script:
1. Show the scan screen — "The app is scanning for beacons, no setup needed"
2. Walk toward The Great Wave — beacon appears in the list, signal strengthens
3. Step close — audio auto-plays, artwork loads with real Met data
4. Show transcript expanding, waveform scrubbing
5. Walk to Washington Crossing — seamless auto-transition
6. Open collection view — show all 3 artworks with current-playing indicator
7. Pitch: "Now imagine this across all 5,000 artworks at The Met"

### Fallback plan:
If BLE is unreliable in the venue, tap the beacon signal cards in the app UI to simulate proximity detection. The demo flow is identical.

---

## Future Roadmap

| Phase | Features |
|-------|----------|
| **v1.1** | Full Met collection (5,000+ on-view artworks), offline mode, favorites |
| **v1.2** | Multilingual TTS (Spanish, Mandarin, French, Japanese, Arabic) |
| **v1.3** | Personalized tours (AI-generated routes based on time + interests) |
| **v2.0** | AR overlay (point camera at painting for visual annotations) |
| **v2.1** | Social features (share favorites, group tours, visitor heatmaps) |
| **v3.0** | Multi-museum support (MoMA, Guggenheim, Whitney, Natural History) |

---

## Team

| Role | Responsibility |
|------|---------------|
| **Mobile Dev** | Android/Flutter app, BLE scanning, audio playback |
| **Frontend Dev** | React UI, Met API integration, player design |
| **Backend/Cloud** | Google Cloud TTS, Firebase analytics, beacon registry |

---

*Built for Google Hackathon NYC · February 2026*
*Artwork data: The Metropolitan Museum of Art Open Access API · CC0 Public Domain*
