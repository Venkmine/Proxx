# MonitorSurface — Dual-Mode Preview System

## Overview

The MonitorSurface component implements a truthful preview system with two distinct operational modes. This design prioritizes UX honesty — controls are only shown when they actually function.

## Monitor Modes

### MODE A: Identification Mode

**When Active:**
- Source is loaded but playback is not supported
- Preflight has not completed
- Media format is not browser-compatible

**Visual Appearance:**
- Full-bleed, edge-to-edge monitor area
- 16:9 matte centered in viewport
- Metadata overlay showing:
  - Filename
  - Codec
  - Resolution
  - Frame Rate
  - Duration
  - File Size
- Explicit label: "Preview (Identification Only — Playback unavailable)"

**Controls:**
- NO scrub bar
- NO play button
- Cursor remains default arrow
- No interactive playback controls

### MODE B: Playback Mode

**When Active:**
- Source is a supported format (H.264, HEVC, VP8, VP9, AV1)
- File is in a playable container (.mp4, .m4v, .mov, .webm)
- Local file path is available for playback

**Visual Appearance:**
- Native HTML5 `<video>` element
- Working playback controls
- Metadata overlay (compact, above controls)

**Controls:**
- Play/Pause button
- Scrub bar with real-time position updates
- Timecode display (current / total)
- Mute toggle

**Keyboard Shortcuts:**
- `Space` → Play/Pause
- `←` → Seek -5 seconds
- `→` → Seek +5 seconds
- `M` → Toggle mute

## Playback Limitations

### Supported Formats

The browser's native `<video>` element can only play certain codecs. Supported codecs include:

| Codec | Container Support |
|-------|-------------------|
| H.264/AVC | .mp4, .m4v, .mov |
| HEVC/H.265 | .mp4, .mov (Safari) |
| VP8/VP9 | .webm |
| AV1 | .mp4, .webm |

### Unsupported Formats

The following formats **cannot be previewed** in the browser and will show Identification Mode only:

- **ProRes** (all variants: 422, 4444, RAW)
- **DNxHD/DNxHR**
- **CineForm**
- **REDCODE RAW**
- **ARRIRAW**
- **BRAW (Blackmagic RAW)**
- **Image sequences** (DPX, EXR, TIFF)
- **MXF containers** (regardless of codec)

These formats require professional video decoders not available in web browsers.

### Why Some Files Don't Play

1. **Codec not supported**: The video codec is not implemented in browser video decoders
2. **Container not recognized**: The file wrapper format is not understood by the browser
3. **No file path available**: Playback requires a local file path (Electron only)
4. **Preflight not completed**: The system has not verified the source is valid

## State Transitions

```
┌─────────────┐
│    IDLE     │  ← No source selected
└──────┬──────┘
       │ Source added
       ▼
┌─────────────────────┐
│   SOURCE_LOADED     │  ← Detect playback support
├──────────┬──────────┤
│ MODE A   │  MODE B  │
│ ID Only  │ Playback │
└──────────┴──────────┘
       │ Job starts
       ▼
┌─────────────┐
│ JOB_RUNNING │  ← Playback disabled
└──────┬──────┘
       │ Job completes
       ▼
┌─────────────┐
│ JOB_COMPLETE│  ← Show results
└─────────────┘
```

## Encoding State Behavior

When encoding is in progress (`JOB_RUNNING` state):
- Playback is automatically paused
- Playback controls are hidden
- A message is displayed: "Playback disabled while encoding is in progress"
- The encoding progress indicator is shown

This prevents any interference between playback and encoding operations.

## Implementation Notes

### No Fake Controls

This component follows the principle of **no fake affordances**:
- Disabled scrub bars are not shown
- Controls that cannot function are not rendered
- UI elements that look interactive must be interactive

### Automatic Mode Detection

The component automatically detects which mode to use based on:
1. File extension check against supported containers
2. Codec name check against browser-supported codecs
3. Verification that a file path is available

### Cleanup on Source Change

When the source changes:
- Video playback is paused
- Current time resets to 0
- Video element is properly cleaned up
- State is reset for the new source
