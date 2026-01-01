# Preview Proxy Pipeline

## Overview

The Preview Proxy Pipeline enables honest, deterministic video playback in Forge's MonitorSurface. This system generates browser-safe proxy files for any source format, ensuring that playback always works without speculation or fake controls.

## Design Philosophy

### Core Principles

1. **UI NEVER attempts playback from original sources**
   - Original files may be in codecs browsers cannot decode (ProRes, XAVC, DNxHD, etc.)
   - Attempting direct playback would fail silently or produce errors

2. **ALL playback comes from preview-safe proxy files**
   - Every playable preview is an H.264/AAC MP4
   - Generated specifically for browser compatibility
   - Served via HTTP for reliable streaming

3. **Preview proxies are temporary, disposable, isolated from output jobs**
   - Stored in system temp directory (`/tmp/proxx_previews/`)
   - Never mixed with actual job outputs
   - Can be deleted at any time without data loss

4. **If preview proxy generation fails, UI falls back to Identification Mode**
   - Shows source metadata without playback controls
   - Displays clear, human-readable error message
   - Never shows fake or broken controls

5. **No speculative playback. No fake scrubbers. No guessing codec support.**
   - If we can't guarantee playback works, we don't show playback controls
   - This matches professional NLE behavior (Resolve, Premiere)

## Why This Matches Professional NLE Behavior

DaVinci Resolve and Adobe Premiere Pro both use proxy workflows:

- **Resolve**: Generates "Optimized Media" for timeline playback
- **Premiere**: Uses "Proxy Media" for smooth editing

Forge follows the same pattern:
- Source files remain untouched
- Lightweight proxies enable smooth UI interaction
- Proxies are transparent to the user

## Architecture

### Backend Components

```
backend/preview_proxy.py          # Core proxy generation logic
backend/app/routes/preview.py     # HTTP endpoints
/tmp/proxx_previews/              # Cache directory
```

### Frontend Components

```
frontend/src/hooks/usePreviewProxy.ts    # React hook for proxy state
frontend/src/components/MonitorSurface.tsx  # Display component
```

## API Endpoints

### POST /preview/generate

Generate a browser-safe preview proxy for a source file.

**Request:**
```json
{
  "source_path": "/absolute/path/to/source.mov"
}
```

**Success Response:**
```json
{
  "preview_url": "/preview/proxy/abc123/preview.mp4",
  "preview_path": "/tmp/proxx_previews/abc123/preview.mp4",
  "duration": 12.34,
  "resolution": "1280x720",
  "codec": "h264"
}
```

**Failure Response:**
```json
{
  "error": "Preview unavailable — proxy generation failed"
}
```

### GET /preview/proxy/{hash}/preview.mp4

Stream a preview proxy file. Supports HTTP range requests for seeking.

## Preview Proxy Specifications

| Property | Value |
|----------|-------|
| Container | MP4 |
| Video Codec | H.264 (main profile) |
| Audio Codec | AAC |
| Max Width | 1280px |
| Max Duration | 30 seconds |
| Max Frame Rate | 30 fps |
| Audio Channels | Stereo (2ch) |
| Audio Bitrate | 128 kbps |

## Flow Diagram

```
┌─────────────────┐
│  Source Selected │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Request Preview  │
│ POST /preview/   │
│ generate         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌─────────────────┐
│   Generating    │─────▶│  "Preparing     │
│   Proxy...      │      │   Preview..."   │
└────────┬────────┘      └─────────────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐ ┌────────┐
│Success │ │ Failed │
└───┬────┘ └───┬────┘
    │          │
    ▼          ▼
┌────────┐ ┌────────────────┐
│Playback│ │Identification  │
│ Mode   │ │Only Mode       │
└────────┘ │(shows error)   │
           └────────────────┘
```

## UI States

### 1. Preparing Preview
- Shown while proxy is being generated
- Spinner with "Preparing Preview..." text
- Source filename visible

### 2. Playback Mode
- Preview proxy loaded in `<video>` element
- Full transport controls (play, pause, scrub, mute)
- Duration reflects preview proxy (max 30s)

### 3. Identification Only Mode
- Shown when preview generation failed
- Displays source metadata (codec, resolution, fps, duration)
- Shows human-readable error message
- No fake controls

### 4. Job Running Overlay
- Shows dimmed preview proxy as background (if available)
- "Encoding clip X of Y" badge
- Source → Output codec transform indicator
- Elapsed time display

## Error Messages (UX Truthfulness)

The system provides specific, actionable error messages:

| Situation | Error Message |
|-----------|---------------|
| Source not found | "Preview unavailable — source file not found" |
| Unsupported format | "Preview unavailable — unsupported source format" |
| FFmpeg not installed | "FFmpeg not found — cannot generate preview proxy" |
| Generation failed | "Preview unavailable — proxy generation failed" |
| Timeout | "Preview unavailable — generation timed out" |

## Cache Management

### Cache Location
```
/tmp/proxx_previews/
├── {hash1}/
│   └── preview.mp4
├── {hash2}/
│   └── preview.mp4
└── ...
```

### Cache Key
Hash is generated from:
- Absolute source path
- Source file modification time (mtime)

This ensures cache invalidation when source files change.

### Cache Lifecycle

- **Creation**: On first preview request for a source
- **Reuse**: Subsequent requests for same source hit cache
- **Invalidation**: Source file modification invalidates cache
- **Cleanup**: TODO: Implement cleanup daemon for stale entries

### Manual Cache Clear

```bash
# Via API
curl -X POST http://localhost:8085/preview/cache/clear

# Direct filesystem
rm -rf /tmp/proxx_previews/*
```

## Testing Checklist

1. ✅ H.264 .mov plays correctly
2. ✅ ProRes .mov generates preview and plays
3. ✅ XAVC source generates preview and plays
4. ✅ Corrupt file fails gracefully with error message
5. ✅ MonitorSurface correctly switches modes
6. ✅ No job logic regression
7. ✅ Scrubbing works on preview
8. ✅ Controls disappear in Identification Mode
9. ✅ Job running overlay shows encoding status

## Future Improvements

- [ ] Cleanup daemon for stale preview proxies
- [ ] Progress callback during generation
- [ ] Multiple resolution previews for different UI contexts
- [ ] Preview for multi-clip selections (slideshow)
- [ ] Thumbnail extraction during proxy generation
