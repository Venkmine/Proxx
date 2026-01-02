# Playback Capability Probe — Deterministic FFmpeg Detection

## Overview

Proxx uses a **deterministic FFmpeg-based probe** to determine if media files can be played back in the browser. This is THE SINGLE SOURCE OF TRUTH for playback decisions.

We do NOT guess based on:
- Codec names
- Container formats  
- File extensions
- Allowlists/blocklists

We DO test reality:
- Can FFmpeg actually decode at least one video frame?

## Probe Methodology

### Command

```bash
ffmpeg -v error -i INPUT -map 0:v:0 -frames:v 1 -f null -
```

### Exit Code Interpretation

| Exit Code | stderr Content | Capability | Meaning |
|-----------|----------------|------------|---------|
| 0 | (any) | `PLAYABLE` | FFmpeg can decode video frames |
| Non-zero | "Stream map '0:v:0' matches no streams" | `NO_VIDEO` | No video stream in file |
| Non-zero | Decode error | `METADATA_ONLY` | Video stream exists but can't decode (RAW, etc.) |
| N/A | Timeout/Exception | `ERROR` | Probe failed |

### Timeout

- **3 seconds max** (hard limit)
- Never retries
- Never guesses

## API

### Endpoint

```
POST /playback/probe
```

### Request

```json
{
  "path": "/absolute/path/to/media.mxf"
}
```

### Response

```json
{
  "capability": "PLAYABLE | METADATA_ONLY | NO_VIDEO | ERROR",
  "engine": "ffmpeg",
  "probe_ms": 183,
  "message": "Human readable explanation"
}
```

### Cache Endpoints

```
GET /playback/cache/stats   → { entries, capabilities }
POST /playback/cache/clear  → { cleared: N }
```

## Caching

Results are cached by:
- File path (resolved absolute path)
- File size
- File mtime

Cache is **in-memory only** — cleared on backend restart.

## Capability States

| Capability | Meaning | UI Behavior |
|------------|---------|-------------|
| `PLAYABLE` | FFmpeg can decode frames | Full playback + controls enabled |
| `METADATA_ONLY` | Video stream exists but can't decode | Poster/burst only, controls visible but disabled, message: "Playback unavailable — requires Resolve" |
| `NO_VIDEO` | No video stream | No playback, explicit message |
| `ERROR` | Probe failed | No playback, error message |

## Frontend Integration

### Centralized Routing

All playback decisions go through:

```typescript
// frontend/src/utils/playbackCapability.ts
import { deriveUIState, probePlaybackCapability } from '../utils/playbackCapability'

const result = await probePlaybackCapability(path)
const uiState = deriveUIState(result.capability)

// uiState contains:
// - canMountVideo: boolean
// - transportEnabled: boolean
// - transportVisible: boolean
// - canShowPoster: boolean
// - canShowBurst: boolean
// - canGenerateProxy: boolean
// - disabledMessage: string | null
// - isRawFormat: boolean
```

### MonitorSurface Rules

1. Transport controls are **always visible** when source is loaded
2. Enabled state depends **only** on playback capability
3. RAW files that fail probe show: "Playback unavailable — requires Resolve"
4. No spinners, no retries, no hidden state

## Preview Pipeline Interaction

### Tier Order

1. **Poster frame** — Always allowed
2. **Burst thumbnails** — Optional, non-blocking
3. **Video playback** — ONLY if probe = PLAYABLE (or proxy generated)

### RAW Files

- NEVER auto-generate preview video
- User must explicitly request proxy generation
- Even then, playback only enabled after proxy passes probe

## Logging

All probe operations log with prefix `[PLAYBACK PROBE]`:

```
[PLAYBACK PROBE] path=/path/to/file.mxf capability=PLAYABLE ms=182
[PLAYBACK PROBE] path=/path/to/raw.r3d capability=METADATA_ONLY ms=245 (decode failed)
[PLAYBACK PROBE] Cache cleared (5 entries)
```

## Debug Overlay

When `VITE_FORGE_DEBUG_UI=true`, MonitorSurface shows:
- Probe capability (with color coding)
- Transport visibility/enabled state
- Preview mode
- Source type (RAW/NON-RAW)
- Probe timing

## Testing

### CLI Script

```bash
# Single file
python backend/test_playback_probe.py /path/to/media.mp4

# Directory (batch test)
python backend/test_playback_probe.py /path/to/media/folder

# Glob pattern
python backend/test_playback_probe.py "/path/to/media/*.mxf"

# JSON output
python backend/test_playback_probe.py --json /path/to/file.mp4

# No cache (for benchmarking)
python backend/test_playback_probe.py --no-cache /path/to/folder
```

### Unit Tests

```bash
cd backend
pytest tests/test_playback_probe.py -v
```

### Expected Results by Format

| Format | Expected Capability |
|--------|---------------------|
| H.264 MP4 | PLAYABLE |
| ProRes MOV | PLAYABLE |
| DNxHD MXF | PLAYABLE |
| ARRIRAW (.ari) | METADATA_ONLY |
| RED (.r3d) | METADATA_ONLY |
| BRAW (.braw) | METADATA_ONLY |
| ProRes RAW | METADATA_ONLY |
| Audio-only | NO_VIDEO |

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          MonitorSurface                              │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  useTieredPreview hook                                        │  │
│  │                                                               │  │
│  │  probePlayback() ────────┐                                    │  │
│  └──────────────────────────│────────────────────────────────────┘  │
│                             │                                        │
│                             ▼                                        │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  playbackCapability.ts                                        │  │
│  │                                                               │  │
│  │  probePlaybackCapability() ──── POST /playback/probe ─────┐  │  │
│  │  deriveUIState() ◄────────────────────────────────────────│  │  │
│  └───────────────────────────────────────────────────────────│──┘  │
└──────────────────────────────────────────────────────────────│──────┘
                                                               │
                                                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       Backend (FastAPI)                              │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  /playback/probe route                                        │  │
│  │                                                               │  │
│  │  probe_playback_capability() ──────────────────────────┐     │  │
│  └────────────────────────────────────────────────────────│─────┘  │
│                                                           │         │
│  ┌────────────────────────────────────────────────────────│─────┐  │
│  │  playback_probe.py                                      │     │  │
│  │                                                         │     │  │
│  │  Cache ◄─── (path, size, mtime) key                     │     │  │
│  │                                                         ▼     │  │
│  │  FFmpeg subprocess ─────── decode 1 frame ─────► Result       │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## Files

| File | Purpose |
|------|---------|
| `backend/playback_probe.py` | Core probe module with FFmpeg subprocess |
| `backend/app/routes/playback.py` | API endpoint |
| `backend/test_playback_probe.py` | CLI test script |
| `backend/tests/test_playback_probe.py` | Unit tests |
| `frontend/src/utils/playbackCapability.ts` | Centralized UI routing |
| `frontend/src/hooks/useTieredPreview.ts` | Hook that calls probe |
| `frontend/src/components/MonitorSurface.tsx` | UI consumer |

## Non-Negotiables

- No codec allowlists
- No guessing
- No UI optimism
- No silent fallbacks
- Playback == proven decode
