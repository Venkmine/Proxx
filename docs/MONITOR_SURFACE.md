# Monitor Surface — Design Rationale

## Overview

The **MonitorSurface** component replaces `VisualPreviewWorkspace` as the central visual element of Forge. It is a **monitor abstraction**, not a media player.

## Why "Monitor" and Not "Player"?

### The Monitor Metaphor

Professional post-production workflows use hardware monitors (Flanders, Sony BVM, etc.) as passive display surfaces. A monitor:

- **Displays** what the system sends to it
- **Does not control** playback, seeking, or transport
- **Reflects state** — it shows you what's happening, not what you can do

This is the design philosophy behind MonitorSurface.

### What This Means in Practice

| Aspect | Media Player | Monitor Surface |
|--------|--------------|-----------------|
| Primary role | Interactive media control | Passive state display |
| User interaction | Scrub, play, pause, seek | None (overlays are informational) |
| State source | Internal playback engine | Derived from app/job state |
| Visual states | Playing, paused, buffering | Idle, source-loaded, job-running, job-complete |
| Empty state | "Drop media here" | Branded idle (logo at 12% opacity) |

## Visual States

MonitorSurface implements exactly four states:

### 1. IDLE
- **Trigger**: No source selected, no job selected
- **Visual**: Dark neutral background (`#0a0b0d`) with Awaire logo at ~12% opacity, centered
- **Message**: None (the logo is the message)

### 2. SOURCE_LOADED  
- **Trigger**: Source files selected OR pending job selected
- **Visual**: Black 16:9 matte with metadata overlay (filename, codec, resolution, duration) bottom-left
- **Affordance**: Disabled scrub bar (3px visual-only, no interaction)

### 3. JOB_RUNNING
- **Trigger**: Selected job has status `RUNNING` or `PAUSED`
- **Visual**: Black 16:9 matte with encoding progress overlay centered
- **Content**: "Encoding clip X of Y", source → output transform, elapsed time
- **Animation**: Subtle pulse on encoding badge, spinner on progress indicator

### 4. JOB_COMPLETE
- **Trigger**: Selected job has status `COMPLETED` or `FAILED`
- **Visual**: Black 16:9 matte with completion summary overlay
- **Content**: Success/failure badge, output codec/resolution, output directory

## Full-Bleed Design

The monitor surface is designed to be the **visual anchor** of the application:

- **No card borders** — the monitor is not a panel, it's the canvas
- **No padding** — content area extends edge-to-edge within the zone
- **No nested panels** — overlays are positioned absolutely within the viewport
- **16:9 content area** — centered vertically and horizontally, maintains aspect ratio

## State Derivation

MonitorSurface does not manage its own state. State is derived from existing app/job state:

```typescript
const monitorState = useMemo((): MonitorState => {
  if (selectedJobId) {
    const job = jobs.find(j => j.id === selectedJobId)
    if (!job) return 'idle'
    const status = job.status.toUpperCase()
    if (status === 'RUNNING' || status === 'PAUSED') return 'job-running'
    if (status === 'COMPLETED' || status === 'FAILED') return 'job-complete'
    return 'source-loaded'  // PENDING job
  }
  if (selectedFiles.length > 0) return 'source-loaded'
  return 'idle'
}, [selectedJobId, jobs, selectedFiles])
```

This ensures:
- No new backend logic required
- State is always consistent with app state
- Visual transitions are immediate and obvious

## Relationship to Resolve/RV

Professional tools like DaVinci Resolve and SHOTGUN RV use similar patterns:

- **Resolve Viewer**: Full-bleed display area with overlay controls
- **RV Viewer**: Slate/frame display with metadata overlays

MonitorSurface brings this visual language to Forge without requiring actual playback implementation.

## Future Considerations

When/if frame extraction or thumbnail generation is added:
- The monitor viewport can display actual frames
- The state machine remains unchanged
- Overlays continue to work identically

The abstraction is designed to support future enhancement without API changes.

## Playback Mode Limitations

### Proxy Playback

When a preview proxy is successfully generated, MonitorSurface enters **Playback Mode**. This mode provides professional-style transport controls for reviewing source media. However, it's important to understand that:

1. **You are watching a proxy, not the source.** The preview proxy is a browser-safe H.264 transcode, not your original media. This is by design — many professional codecs (ProRes RAW, BRAW, R3D, etc.) cannot play in browsers.

2. **Visual quality is reduced.** Proxies are lower-resolution and lower-bitrate to ensure smooth playback in any browser.

3. **Audio may be simplified.** Multi-channel audio is mixed to stereo for preview.

### Frame Stepping Accuracy

**HTML5 video is NOT frame-accurate for all codecs.**

The transport controls include frame-step buttons (±1 frame), but these are **best-effort approximations**:

- The `video.currentTime` API does not guarantee frame-aligned seeking
- Different browsers have different seeking behavior
- The preview proxy codec affects seeking precision

This is a fundamental limitation of browser-based video playback, not a bug in Forge.

**For frame-accurate work**, use dedicated NLE software (DaVinci Resolve, Premiere Pro, etc.).

### Timecode Display

The timecode display (HH:MM:SS:FF) is derived from:
- `video.currentTime` (seconds)
- Source frame rate from metadata

The timecode is updated at ~60Hz via `requestAnimationFrame` for smooth visual feedback, but the underlying precision is limited by the video element.

### Transport Controls

| Control | Action | Keyboard |
|---------|--------|----------|
| Play/Pause | Toggle playback | Space |
| Step Back | Move back ~1 frame | ← |
| Step Forward | Move forward ~1 frame | → |
| Jump Back | Move back 1 second | Shift + ← |
| Jump Forward | Move forward 1 second | Shift + → |
| Mute Toggle | Mute/unmute audio | M |
| Scrubber | Seek to position | Drag |

## Files Modified

- `frontend/src/components/MonitorSurface.tsx` — Main monitor component
- `frontend/src/components/TransportBar.tsx` — Professional transport controls
- `frontend/src/hooks/usePlaybackClock.ts` — High-frequency timecode hook
- `frontend/src/components/WorkspaceLayout.tsx` — Updated center zone styling
- `frontend/src/App.tsx` — State derivation and component integration

## Related Documentation

- [PREVIEW_PROXY_PIPELINE.md](./PREVIEW_PROXY_PIPELINE.md)
- [PREVIEW_AND_PROGRESS_PHILOSOPHY.md](./PREVIEW_AND_PROGRESS_PHILOSOPHY.md)
- [ALPHA_REALITY.md](./ALPHA_REALITY.md)
