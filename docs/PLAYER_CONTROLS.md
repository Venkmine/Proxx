# Player Controls & Keyboard Shortcuts

> **Version:** 1.0.0  
> **Last Updated:** 2026-01-10

## Overview

This document describes the transport controls, keyboard shortcuts, timecode input rules, and metadata display features in the Forge preview player.

---

## Keyboard Shortcuts

The following shortcuts are available when the player is focused and no text input field is active:

### Playback Controls

| Shortcut | Action | Notes |
|----------|--------|-------|
| `Space` | Play / Pause | Toggle playback |
| `K` | Pause | Stop playback |
| `J` | Reverse | Jump backward (repeated press increases speed) |
| `L` | Forward | Start playback (repeated press increases speed up to 2×) |

### Navigation

| Shortcut | Action | Notes |
|----------|--------|-------|
| `←` | Step back 1 frame | When paused, moves one frame |
| `→` | Step forward 1 frame | When paused, moves one frame |
| `Shift + ←` | Jump backward | Uses selected jump interval |
| `Shift + →` | Jump forward | Uses selected jump interval |
| `Cmd/Ctrl + ←` | Previous clip | Navigate to previous clip in job |
| `Cmd/Ctrl + →` | Next clip | Navigate to next clip in job |
| `Home` | Go to start | Jump to beginning of clip |
| `End` | Go to end | Jump to one frame before end |

### Marks (Future)

| Shortcut | Action | Notes |
|----------|--------|-------|
| `I` | Mark In | Set in-point (logged to console, UI pending) |
| `O` | Mark Out | Set out-point (logged to console, UI pending) |

### Audio

| Shortcut | Action | Notes |
|----------|--------|-------|
| `M` | Mute / Unmute | Toggle audio mute |

---

## Jump Intervals

The jump interval dropdown offers predefined intervals:

- 1 frame, 5 frames, 10 frames
- 1 second, 5 seconds, 10 seconds, 30 seconds
- 1 minute, 5 minutes, 10 minutes
- 1 hour

The selected interval persists across sessions via localStorage.

### Custom Intervals

For custom intervals beyond the presets, you can:
1. Select the closest preset
2. Use frame stepping for fine control
3. Use timecode input to jump to exact positions

---

## Timecode Input

### Auto-Format Rules

The timecode input supports multiple input formats:

| Input | Result | Notes |
|-------|--------|-------|
| `00:00:01:00` | `00:00:01:00` | Standard SMPTE format |
| `00000100` | `00:00:01:00` | 8 digits auto-formatted |
| `100` | `00:00:01:00` | Left-padded to 8 digits |
| `1234` | `00:00:12:34` | Interpreted as MMSS:FF |
| `123456` | `00:12:34:56` | Interpreted as MMSS:FF with hours |

### Input Behavior

1. **Single click** on timecode: Cycles through display modes (SRC → REC → Counter)
2. **Double click** on timecode: Opens edit mode for direct timecode entry
3. **Enter** in edit mode: Commits the timecode and seeks to that position
4. **Escape** in edit mode: Cancels editing without seeking

### Validation

- Minutes and seconds must be 0-59
- Frames must be within the source's frame rate (e.g., 0-23 for 24fps)
- Invalid timecodes are rejected with a console warning

### Timecode Modes

| Mode | Label | Description |
|------|-------|-------------|
| Source TC | `SRC` | Timecode from media metadata (if available) |
| Recording TC | `REC` | Recording timecode from 00:00:00:00 |
| Counter | (dot) | Preview playback position |

---

## Jog Wheel

The jog wheel provides fine-grained scrubbing control:

- **Sensitivity:** 0.05 seconds per pixel (much finer than regular scrub)
- **Visual feedback:** Wheel rotates proportionally to movement
- **Activation:** Click and drag horizontally
- **Use case:** Frame-accurate positioning for QC review

### Jog vs Scrub Comparison

| Control | Sensitivity | Use Case |
|---------|-------------|----------|
| Timeline Scrub | 1:1 with playhead | Quick navigation |
| Jog Wheel | 0.05× (20× slower) | Fine positioning |
| Frame Step | ±1 frame | Frame-accurate |

---

## Zoom Controls

- **Fit:** Content scales to fill the viewport (default)
- **100%:** Content displays at native resolution
- **Toggle:** Double-click on the video area

---

## Metadata Panel

The metadata panel displays structured information about the selected source file.

### Location

The panel is positioned in the left panel area, below the source files list.

### Sections

| Section | Contents |
|---------|----------|
| Clip Details | Filename, format, duration, size, bitrate, frames, TC start |
| Video | Codec, resolution, pixel format, frame rate, color space |
| Audio | Codec, sample rate, channels, layout, bitrate |
| Camera | Make, model, lens, ISO, shutter, aperture (when available) |
| Technical | Encoder, creation time, handler, RAW type |
| XMP | XMP availability status (read-only) |

### Metadata Sources

1. **Primary:** ffprobe JSON output
2. **Secondary:** exiftool for camera metadata
3. **XMP:** Sidecar file reading (embedding NOT supported)

### XMP Support

**Reading XMP:**
- ✅ Sidecar file parsing (.xmp files alongside media)
- ✅ Embedded XMP extraction via ffprobe/exiftool
- Status: Planned

**Embedding XMP:**
- ❌ Not supported (high risk, requires careful file format handling)
- Status: Not planned for initial release

---

## RAW Sample Testing

For QC verification, RAW samples are located at:
```
/Users/leon.grant/projects/Proxx/forge-tests/samples/RAW
```

Subdirectories include:
- ARRI, ARRI35, ARRICORE
- BLACKMAGIC, Canon, DJI
- Nikon, Panasonic, Phantom
- PRORES, PRORES_RAW, R3D
- SONY, Samsung, iPhone

### RAW Playback Behavior

1. RAW files require Preview Proxy generation for playback
2. Transport controls are visible but disabled until proxy is ready
3. Delivery jobs do NOT require preview generation
4. Error states are displayed honestly (no fake thumbnails)
