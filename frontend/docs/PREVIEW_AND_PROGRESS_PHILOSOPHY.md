# Preview and Progress Philosophy

## Why Forge Does Not Play Media

Forge is a **deterministic proxy engine**, not a media browser or NLE.

### Design Principles

1. **Honesty over speculation**
   - The preview panel shows what Forge *knows*, not what it *guesses*.
   - Without actual decoding infrastructure, any frame preview would be misleading.
   - A black rectangle with accurate metadata is more honest than a speculative thumbnail.

2. **Determinism over convenience**
   - Media playback requires codec support, frame seeking, and color management.
   - Each of these introduces potential discrepancies between preview and output.
   - Forge outputs what FFmpeg produces, not what a web browser can render.

3. **No false confidence**
   - A working video player would imply Forge can handle the format.
   - In reality, Forge's capability is determined by FFmpeg, not the browser.
   - Showing "Unsupported" or error states creates confusion.

### What the Preview Panel Shows Instead

| State | Display |
|-------|---------|
| No source selected | Forge logo at 15% opacity |
| Source selected, awaiting validation | Black frame + filename + "Awaiting validation" |
| Preflight complete | Black frame + metadata (codec, resolution, fps, duration, audio) |
| Job running | Clip counter + elapsed time |
| Job completed | Completion status + output info |

---

## Why No ETA or Percentage Is Shown

### The Problem with Progress Estimation

1. **FFmpeg output is unpredictable**
   - Frame-level progress requires parsing FFmpeg stderr in real-time.
   - Variable bitrate content produces non-linear progress.
   - Two-pass encoding invalidates single-pass estimates.

2. **Users saw "80% complete" for 10 minutes**
   - Early prototypes showed interpolated percentages.
   - These were consistently wrong, eroding trust.
   - A stuck percentage is worse than no percentage.

3. **Wall-clock time is always accurate**
   - Elapsed time since job start is a *fact*, not an estimate.
   - Users can observe encoding rate over time.
   - No false promises, no disappointment.

### What Forge Shows Instead

- **Clip completion counter**: `3 / 12 clips` — updates only on actual completion
- **Elapsed time**: `01:23:45` — wall-clock since job start
- **Stalled warning**: Shown if no clip completes for 60 seconds

---

## Why Honesty Beats Animation

### Animation as Deception

Many encoding tools use animated spinners, pulsing indicators, and progress bars to create the *impression* of activity. This is problematic when:

- The animation continues even when the process is stuck
- Users cannot distinguish "working" from "frozen"
- Visual busyness masks actual failure states

### Forge's Approach

1. **Spinner only for running clips**
   - Spinner appears when encoding is active
   - Disappears immediately on completion or failure
   - No ambiguity about current state

2. **Subtle pulse, not distraction**
   - Running job header has a gentle pulse animation
   - Does not distract from reading actual status
   - Stops immediately on terminal state

3. **Stalled detection over hopeful spinning**
   - If 60 seconds pass without progress, show warning
   - Do not auto-cancel or retry (that's user's decision)
   - Honest: "This may be stuck"

---

## Summary

| Traditional Approach | Forge Approach |
|---------------------|----------------|
| Video preview player | Black frame with metadata |
| Progress percentage | Clip completion counter |
| ETA estimation | Elapsed wall-clock time |
| Infinite spinner | Stalled warning after 60s |
| Thumbnail extraction | No thumbnails |
| Animated progress bar | Static clip status updates |

**Credibility comes from accuracy, not animation.**
