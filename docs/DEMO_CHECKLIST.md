# Awaire Proxy — Demo Checklist

**Purpose:** Ensure consistent, honest demonstrations of v1 capability.

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

**End of document**
