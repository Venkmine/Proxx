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

### Timecode Modes

The transport bar provides three timecode display modes, selectable via the TC mode button:

| Mode | Label | Description |
|------|-------|-------------|
| **Source TC** | SRC | Timecode from source media metadata. Only available when source contains embedded timecode. May not align exactly with proxy playback position due to proxy generation. |
| **Preview TC** | PREV | Timecode derived from preview proxy playback position. This is the default mode. Represents approximate position in the media. |
| **Counter** | CTR | Simple elapsed counter from 00:00:00:00. Counts playback time from the start of the clip. |

**Mode Selection Notes:**
- Source TC mode is disabled (greyed out) when source metadata doesn't contain embedded timecode
- Mode selection persists for the session (stored in sessionStorage)
- Modes do NOT auto-switch — the user's selection is respected
- Click the timecode display to copy the current timecode to clipboard

### Transport Controls (v3)

Transport controls are organized into clip-level and time-level navigation, matching professional NLE behavior (Resolve, Avid, RV).

| Control | Visual | Action | Keyboard |
|---------|--------|--------|----------|
| Previous Clip | ⏮\| | Load previous clip in current job | Cmd+← |
| Frame Back | ⏮ | Step back ~1 frame | ← |
| Jump Back | < | Jump back by selected interval | Shift+← |
| Play/Pause | ⏯ | Toggle playback | Space or K (pause) or L (play) |
| Jump Forward | > | Jump forward by selected interval | Shift+→ |
| Frame Forward | ⏭ | Step forward ~1 frame | → |
| Next Clip | \|⏭ | Load next clip in current job | Cmd+→ |
| Mute Toggle | 🔊/🔇 | Mute/unmute audio | M |
| Timeline Scrubber | — | Seek to position | Drag |
| TC Mode | SRC/PREV/CTR | Select timecode mode | Click dropdown |
| Jump Interval | Jump: [5s ▼] | Select jump interval for </> buttons | Click dropdown |

### Transport Control Visibility Rules (INC-CTRL-001)

**Transport controls are ALWAYS VISIBLE when a source is loaded.**

This is a hardened invariant. Transport controls may be disabled (greyed out, non-interactive) but should never disappear while media is being displayed or prepared.

#### Visibility Logic

```typescript
// canShowTransportControls - deterministic, not gated on transient state
const canShowTransportControls = 
  state === 'source-loaded' && (
    // Video proxy loaded
    (previewMode === 'video' && tieredPreview?.video?.previewUrl) ||
    // Video loading (shows disabled state)
    tieredPreview?.videoLoading ||
    // Poster available (shows disabled state, waiting for video)
    tieredPreview?.poster?.posterUrl ||
    // Burst thumbnails available
    (tieredPreview?.burst?.thumbnails?.length > 0)
  )
```

#### Enabled vs Disabled

| State | Controls Visible | Controls Enabled | User Message |
|-------|-----------------|------------------|--------------|
| Video proxy ready | ✓ | ✓ | None (ready to play) |
| Video loading | ✓ | ✗ | "Preparing preview proxy…" |
| Poster only (no proxy) | ✓ | ✗ | "Playback requires preview proxy" |
| RAW without proxy | ✓ | ✗ | "RAW format — proxy not yet available" |
| No preview at all | ✗ | — | N/A (waiting for tiered preview) |

#### Why This Matters

Previously, transport controls were gated on `canPlayback && videoLoaded`, which caused them to disappear during preview tier transitions or when waiting for proxy generation. This was confusing — users saw controls appear and disappear seemingly at random.

The new design ensures:
1. **Predictability**: Controls are always in the same location
2. **Clarity**: Disabled state + message explains why playback isn't available
3. **Stability**: No visual flicker during state transitions

#### Debug Overlay

In development mode, set `VITE_FORGE_DEBUG_UI=true` to show a debug overlay with:
- `canShowTransportControls` state
- `transportEnabled` state
- Current `previewMode`
- Video loaded status

### Jump Interval Selector

The jump interval selector controls how far the `<` and `>` buttons move through time:

| Interval | Description |
|----------|-------------|
| 1 frame | Single frame step |
| 5 frames | 5-frame jump |
| 10 frames | 10-frame jump |
| 1 second | 1s time jump |
| **5 seconds** | Default setting |
| 10 seconds | 10s time jump |
| 30 seconds | 30s time jump |
| 60 seconds | 1 minute jump |
| 5 minutes | 5 minute jump |

The selected interval persists for the session (stored in `sessionStorage` as `monitor.jumpInterval`).

### Clip Navigation

Clip navigation buttons (`|<<` and `>>|`) move between clips within the current job:

- **Previous Clip (`|<<`)**: Load the previous clip in job order
- **Next Clip (`>>|`)**: Load the next clip in job order

**Clip Navigation Rules:**
1. Navigation uses job clip order (as defined by backend)
2. Failed or missing clips are skipped
3. Navigation clamps at first/last valid clip
4. On clip change:
   - Playback stops
   - Playhead resets to start
   - Monitor metadata updates
   - Queue highlight updates to match

**Disabled States:**
- `|<<` is disabled when at the first clip
- `>>|` is disabled when at the last clip
- Tooltips explain why buttons are disabled

### Queue ↔ Monitor Synchronization

The monitor and job queue are always synchronized:

**Queue → Monitor:**
- Clicking a clip row loads it into MonitorSurface
- The loaded clip is visually highlighted in the queue

**Monitor → Queue:**
- Using `|<<` / `>>|` updates:
  - The selected clip
  - The highlighted row in the queue
  - Status badge focus

There is one source of truth — no state duplication.

### J/K/L Shuttle Controls

Professional NLE-style shuttle controls are supported:

| Key | Action |
|-----|--------|
| **J** | Reverse/Jump back (HTML5 video doesn't support true reverse playback) |
| **K** | Pause (always pauses immediately) |
| **L** | Play forward. Press again for 2× speed. |

### Keyboard Shortcuts Summary

| Shortcut | Action |
|----------|--------|
| `Space` | Play / Pause |
| `J / K / L` | Shuttle reverse / pause / forward |
| `← / →` | ±1 frame |
| `Shift + ← / →` | Jump using selected interval |
| `Cmd + ← / →` | Previous / Next clip |
| `M` | Mute toggle |

### Click-to-Play Behavior

- **Single click** on the video canvas toggles play/pause
- **Double-click** toggles between Fit and 100% zoom modes
- Cursor changes to a subtle play/pause indicator on hover
- Clicks on the transport bar controls are not intercepted

### Zoom Modes

| Mode | Description |
|------|-------------|
| **Fit** | Video scales to fit within viewport, maintaining aspect ratio (default) |
| **100%** | Video displays at actual pixel resolution, scrollable if larger than viewport |

Toggle between modes by double-clicking the video canvas. A "100%" badge appears when in actual-size mode.

## Preview Playback Limitations

This section explicitly documents what preview playback **can and cannot do**.

### What Preview Playback IS

- A browser-based HTML5 video player for reviewing source media
- Playback of a transcoded H.264 proxy (not original source)
- Best-effort approximation of frame stepping and timecode
- Suitable for quick review, not frame-accurate work

### What Preview Playback IS NOT

- Frame-accurate playback (use Resolve, Premiere, or RV for that)
- Source-quality display (proxies are lower resolution/bitrate)
- A replacement for professional NLE software
- Capable of playing original codecs (ProRes RAW, BRAW, R3D, etc.)

### Specific Limitations

| Feature | Limitation |
|---------|------------|
| **Frame stepping** | Approximate. HTML5 `currentTime` is not frame-aligned. Precision depends on browser and codec. |
| **Timecode accuracy** | Derived from playback position × FPS. May drift from source TC. |
| **Source TC mode** | Requires embedded timecode in source. Offset is applied mathematically, not frame-aligned. |
| **Reverse playback** | Not supported by HTML5 video. J key jumps back instead. |
| **Audio** | Multi-channel mixed to stereo in proxy. |
| **Color accuracy** | sRGB browser rendering. Not color-managed. |

### When to Use Preview Playback

✅ Quick review of source content  
✅ Verifying audio sync  
✅ Rough position reference  
✅ Checking clip duration  

### When NOT to Use Preview Playback

❌ Frame-accurate QC  
❌ Critical color evaluation  
❌ Final approval workflows  
❌ Timecode-critical operations

## Files Modified

- `frontend/src/components/MonitorSurface.tsx` — Main monitor component
- `frontend/src/components/TransportBar.tsx` — Professional transport controls
- `frontend/src/hooks/usePlaybackClock.ts` — High-frequency timecode hook
- `frontend/src/components/WorkspaceLayout.tsx` — Updated center zone styling
- `frontend/src/App.tsx` — State derivation and component integration
- `frontend/tests/monitor_surface.spec.ts` — Playwright tests for transport control visibility (INC-CTRL-001)

## Related Documentation

- [PREVIEW_PROXY_PIPELINE.md](./PREVIEW_PROXY_PIPELINE.md)
- [PREVIEW_AND_PROGRESS_PHILOSOPHY.md](./PREVIEW_AND_PROGRESS_PHILOSOPHY.md)
- [ALPHA_REALITY.md](./ALPHA_REALITY.md)
