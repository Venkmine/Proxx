# Awaire Proxy — Demo Checklist

**Purpose:** Ensure consistent, honest demonstrations of v1 capability.

---

## Demo Mode (V1 Stability Guardrails)

Before giving a demo, enable DEMO_MODE in the feature flags:

**File:** `frontend/src/config/featureFlags.ts`
```typescript
DEMO_MODE: true,  // Enable for demos
```

### What DEMO_MODE Does:

| Behavior | Effect |
|----------|--------|
| Hides Diagnostics Panel | `ALPHA_DIAGNOSTICS_ENABLED` suppressed |
| Hides StatusLog Details Toggle | Forces simple view, no verbose logs |
| Suppresses Raw Error Banners | Backend errors don't display as red banners |
| Shows Heartbeat Messages | "Encoding in progress… still working" every 15s |

### Why Use DEMO_MODE:

- **Prevents accidental footguns** — no raw error strings visible
- **Cleaner UI** — diagnostic details hidden from audience
- **Long encode reassurance** — heartbeat messages show activity without fake progress
- **Consistent experience** — same view for all demo sessions

**Remember to disable DEMO_MODE after the demo for development work.**

---

## What To Show

1. **Select a single source file** using the "Select Files" button
2. **Preview the clip** with playback controls (play, pause, seek)
3. **Apply a preset** — show how settings populate from preset
4. **Configure output** — codec, container, output directory
5. **Create job** — show job appearing in queue
6. **Start job** — show status transition: Pending → Encoding → Completed
7. **Reveal output** — use "Show in Finder" to open output location
8. **View diagnostics** — show metadata comparison (source vs output)

---

## What To Avoid

| Don't Show | Why |
|------------|-----|
| Drag & drop files | Not implemented — use button dialogs |
| Multi-clip jobs | Disabled in v1 — one clip per job |
| Progress percentage or ETA | Not reliable — status badge only |
| Overlay position editing | Removed — overlays are static preview |
| Retry or requeue failed jobs | Not implemented — create new job |
| Pause/resume execution | Not implemented — jobs run to completion |
| Watch folders | v2 feature — not shipped |
| Batch operations | v2 feature — one job at a time |

---

## Expected Questions and Correct Answers

### "Can I drag files onto the window?"
> Not in v1. We use the native file picker because it handles network paths reliably. Drag & drop had platform-specific bugs we couldn't fix in time.

### "Why doesn't it show progress percentage?"
> Progress estimation requires parsing FFmpeg output, which was unreliable across codec types. The status badge tells you what's actually happening without false precision.

### "Can I process multiple files at once?"
> v1 is one clip per job. This keeps the error reporting clear — if something fails, you know exactly which file failed. Batch support is planned for v2.

### "What if the job fails? Can I retry?"
> Create a new job. Failed jobs stay failed so you have a clear record of what was attempted. The job list is your audit trail.

### "Can I move the watermark/overlay?"
> Not in v1. Overlay positions are defined by presets. We removed the drag handles because the preview coordinate system didn't match FFmpeg output coordinates — what you saw wasn't what you got.

### "Where are my output files?"
> Click "Show in Finder" on a completed job. Output goes to the directory you selected in the output settings.

### "Can I pause a job mid-encode?"
> No. Jobs run to completion. This avoids a class of state machine bugs around resume and partial output.

### "What codecs are supported?"
> ProRes, DNxHR, and H.264. ProRes and DNxHR are recommended for editorial workflows. H.264 is available but warns about long-GOP limitations.

### "Can I use DaVinci Resolve as the engine?"
> Not in v1. FFmpeg is the sole execution engine. Resolve integration is on the roadmap but not shipped.

---

## Demo Flow (5 minutes)

1. **Launch app** (0:30) — point out queue panel and preview area
2. **Ingest clip** (0:45) — select file, show metadata populating
3. **Apply preset** (0:30) — select a preset, show settings update
4. **Create job** (0:15) — click Create, job appears in queue
5. **Execute** (1:30) — start job, watch status change, wait for completion
6. **Verify output** (1:00) — show in Finder, play output file
7. **Show diagnostics** (0:30) — click job to show source/output metadata

---

## V1 Explicit Non-Goals (Locked in Code)

The following features are **intentionally absent from V1** and protected by code guardrails:

| Feature | Why Not |
|---------|---------|
| Progress bars / percentages | FFmpeg progress parsing unreliable across codecs |
| ETA estimation | Inaccurate for variable bitrate content |
| Frame previews during encode | Adds complexity, potential for stale frames |
| Retry / requeue failed jobs | Creates ambiguous job history |
| Pause / resume execution | State machine complexity, partial output issues |
| Drag & drop file ingestion | Platform-specific bugs with network paths |
| Multi-clip batch jobs | Error isolation requires one clip per job |
| Overlay position editing | Preview coordinates don't match FFmpeg output |
| Watch folders | Autonomous ingestion is v2 scope |

**These are not bugs. They are deliberate scope constraints.**

See also: `docs/PRODUCT.md` section 7 for product-level non-goals.

---

## Debug Panel Access (DEV Mode Only)

The UI Event Log debug panel helps diagnose browse, preview, and job issues.

**Access Methods:**
- **Keyboard shortcut:** `Cmd+Alt+D` (Mac) or `Ctrl+Alt+D` (Windows/Linux)
  - Note: Changed from `Cmd+Shift+D` due to Electron/VSCode shortcut conflicts
- **Fallback button:** Small 🔍 icon in bottom-left corner (always visible in DEV mode)

**Features:**
- Last 100 UI events with timestamps
- Event type coloring (errors in red, success in green)
- Clear Log button to reset event history

---

**End of document**
