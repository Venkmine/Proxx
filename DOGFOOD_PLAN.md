# Proxx Dogfooding Plan
**Date:** 23 December 2025  
**Purpose:** Test truthfulness of all ingestion, queue, preview, overlay, and error handling systems before feature freeze lifts.

---

## ✅ Backend State Verification (Completed)

**Actual JobStatus States:**
```python
PENDING                   # Created, not yet started
RUNNING                   # At least one clip being processed
PAUSED                    # Paused by user, can resume
COMPLETED                 # All clips done, no failures/warnings
COMPLETED_WITH_WARNINGS   # All clips terminal, some failed/skipped/warned
FAILED                    # Job engine cannot continue
RECOVERY_REQUIRED         # Process restarted mid-execution, requires explicit resume
CANCELLED                 # Cancelled by operator (terminal)
```

**Actual TaskStatus States:**
```python
QUEUED      # Waiting to be processed
RUNNING     # Currently being processed
COMPLETED   # Successfully completed
SKIPPED     # Skipped (source offline, unsupported)
FAILED      # Failed during processing
```

**UI Alignment Check:** ✅ Frontend [StatusBadge.tsx](frontend/src/components/StatusBadge.tsx) supports all backend states.

---

## 🎯 Testing Philosophy

> **Test TRUTHFULNESS, not capability.**

For each test:
- What did I do?
- What did I expect?
- What actually happened?
- **Did the UI tell me the truth? (yes/no)**

Do NOT fix bugs during dogfooding. Document patterns, not solutions.

---

## 📦 Media Test Suite

**Location:** `/Users/leon.grant/projects/Proxx/test_media/dogfood/`

Required files (use REAL media, not synthetic test clips):

1. **short_h264.mp4** — 5-10 sec H.264 (annoying codec, baseline profile)
2. **multi_clip_folder/** — Folder with 5-10 mixed clips
3. **long_form.mov** — 10-30 min ProRes or H.264
4. **mixed_resolution/** — Folder with 720p, 1080p, 4K, different codecs
5. **external_volume.mp4** — File on USB drive or network mount (slow I/O)
6. **broken_paths/** — Intentional failures:
   - `no_permissions.mp4` (chmod 000)
   - `missing_file.mp4` (referenced but doesn't exist)
   - `weird_filename_!@#$%^&*().mp4`
   - `unsupported.avi` (codec FFmpeg doesn't support)

**Goal:** Make the app uncomfortable, not successful.

---

## 🧪 Test Suite

### Test 1: Ingestion Truth Test

**Methods to test:**
- Browse ([CreateJobPanel](frontend/src/components/CreateJobPanel.tsx))
- Explicit Drop Zone ([IngestionConfirmDialog](frontend/src/components/IngestionConfirmDialog.tsx))

**Skip:** Global drag-drop (disabled due to crash risk)

**For each ingestion method:**

#### 1.1 Single File Ingestion
- [ ] Browse to `short_h264.mp4`
- [ ] Verify: Nothing happens until "Create Job" clicked
- [ ] Click "Create Job"
- [ ] Verify: Job appears in [QueueView](frontend/src/components/QueueView.tsx) immediately
- [ ] Verify: Job status = `PENDING`
- [ ] Verify: Clip count = 1
- [ ] **Did UI tell truth?** (yes/no)

#### 1.2 Folder Ingestion
- [ ] Browse to `multi_clip_folder/`
- [ ] Verify: [IngestionConfirmDialog](frontend/src/components/IngestionConfirmDialog.tsx) shows all clips found
- [ ] Verify: Clip count matches reality (spot-check folder manually)
- [ ] Confirm ingestion
- [ ] Verify: Job appears with correct clip count
- [ ] **Did UI tell truth?** (yes/no)

#### 1.3 Output Directory Missing
- [ ] Browse to `short_h264.mp4`
- [ ] Clear output directory field
- [ ] Click "Create Job"
- [ ] Verify: Inline validation error appears
- [ ] Verify: Error message is actionable (not technical jargon)
- [ ] Verify: Job does NOT appear in queue
- [ ] **Did UI tell truth?** (yes/no)

#### 1.4 Invalid Path
- [ ] Enter relative path: `./test.mp4`
- [ ] Click "Create Job"
- [ ] Verify: Validation error or backend rejection
- [ ] Verify: Error explains "absolute path required"
- [ ] **Did UI tell truth?** (yes/no)

#### 1.5 Network/External Volume (Slow I/O)
- [ ] Browse to `external_volume.mp4` on USB drive
- [ ] Confirm ingestion
- [ ] Observe: Does ingestion hang? Show progress? Timeout?
- [ ] **Did UI tell truth?** (yes/no)
- [ ] **Note:** Expected delay duration, actual delay, any UI feedback

---

### Test 2: Queue Honesty Test

**Backend Limits:** `MAX_CONCURRENT_WORKERS = 2` (hardcoded)

#### 2.1 Single Job Execution
- [ ] Create job with `short_h264.mp4`
- [ ] Click Start in [OperatorControlPanel](frontend/src/components/OperatorControlPanel.tsx)
- [ ] Verify: [JobGroup](frontend/src/components/JobGroup.tsx) status badge changes: `PENDING` → `RUNNING`
- [ ] Verify: Clip status changes: `QUEUED` → `RUNNING` → `COMPLETED`
- [ ] Verify: Job status changes: `RUNNING` → `COMPLETED`
- [ ] Verify: Timestamps (started_at, completed_at) appear in [JobDiagnosticsPanel](frontend/src/components/JobDiagnosticsPanel.tsx)
- [ ] **Did UI tell truth?** (yes/no)

#### 2.2 Concurrent Execution (Critical Test)
- [ ] Create 3 jobs: `long_form.mov` (Job 1), `long_form.mov` (Job 2), `short_h264.mp4` (Job 3)
- [ ] Start all 3 jobs rapidly
- [ ] **Expected:** Jobs 1 & 2 run, Job 3 queues
- [ ] Verify: Job 3 status badge shows `PENDING` or clear queued state (NOT `RUNNING`)
- [ ] Verify: Job 3 does NOT show running clips
- [ ] Wait for Job 1 or 2 to complete
- [ ] Verify: Job 3 starts immediately when slot frees
- [ ] **Did UI tell truth?** (yes/no)
- [ ] **If Job 3 showed "RUNNING" when not executing:** CRITICAL BUG — Write down

#### 2.3 Pause & Resume
- [ ] Start job with `long_form.mov`
- [ ] Wait for status = `RUNNING`, clip = `RUNNING`
- [ ] Click Pause
- [ ] Verify: Job status → `PAUSED`
- [ ] Verify: Currently running clip finishes before pause (semantic: "finish current clip")
- [ ] Verify: Pause button disappears, Resume button appears
- [ ] Click Resume
- [ ] Verify: Job status → `RUNNING`
- [ ] Verify: Next queued clip starts
- [ ] **Did UI tell truth?** (yes/no)

#### 2.4 State Transition Validation
- [ ] Create completed job (run `short_h264.mp4` to completion)
- [ ] Verify: Start button does NOT appear
- [ ] Attempt to change job via API (if accessible): try `COMPLETED` → `RUNNING`
- [ ] Verify: Backend rejects with error (check [JobDiagnosticsPanel](frontend/src/components/JobDiagnosticsPanel.tsx) or network tab)
- [ ] **Did UI tell truth?** (yes/no)

#### 2.5 Failure Display
- [ ] Create job with `broken_paths/missing_file.mp4`
- [ ] Start job
- [ ] Verify: Clip status → `FAILED`
- [ ] Verify: [ClipRow](frontend/src/components/ClipRow.tsx) shows failure reason
- [ ] Verify: Failure reason is actionable ("File not found: /path/to/missing_file.mp4", NOT stack trace)
- [ ] Verify: [JobDiagnosticsPanel](frontend/src/components/JobDiagnosticsPanel.tsx) shows last error
- [ ] **Did UI tell truth?** (yes/no)

#### 2.6 Multiple Failures
- [ ] Create job with `broken_paths/` folder (multiple broken files)
- [ ] Start job
- [ ] Verify: Some clips fail, others succeed
- [ ] Verify: Job status → `COMPLETED_WITH_WARNINGS` (not `FAILED`)
- [ ] Verify: Failed count matches reality
- [ ] Verify: "Retry Failed" button appears
- [ ] Click "Retry Failed"
- [ ] Verify: Failed clips reset to `QUEUED`
- [ ] **Did UI tell truth?** (yes/no)

---

### Test 3: Preview Trust Test

**Preview Component:** [VisualPreviewWorkspace](frontend/src/components/VisualPreviewWorkspace.tsx)

#### 3.1 Preview Sync During Job States
- [ ] Create job with `multi_clip_folder/` (5+ clips)
- [ ] Before starting: Select clip 3
- [ ] Verify: Preview shows clip 3 thumbnail (check filename in metadata)
- [ ] Start job
- [ ] While running: Select clip 1
- [ ] Verify: Preview switches to clip 1 thumbnail
- [ ] Wait for completion
- [ ] Select clip 5
- [ ] Verify: Preview shows clip 5 (or output, if preview video generated)
- [ ] **Did UI tell truth?** (yes/no)

#### 3.2 Preview with No Selection
- [ ] Clear job selection (click outside queue)
- [ ] Verify: Preview shows placeholder or "no selection" state
- [ ] Verify: No stale preview from previous selection
- [ ] **Did UI tell truth?** (yes/no)

#### 3.3 Overlay Rendering in Preview
- [ ] Create job with `short_h264.mp4`
- [ ] Add 3 overlays via [OverlayLayerStack](frontend/src/components/OverlayLayerStack.tsx):
   - Text overlay (top-left, "TEST TEXT")
   - Timecode overlay (bottom-right)
   - Metadata overlay (top-right, filename)
- [ ] Verify: All 3 overlays render in preview
- [ ] Disable middle overlay (timecode)
- [ ] Verify: Timecode disappears from preview
- [ ] Re-enable timecode
- [ ] Verify: Timecode reappears
- [ ] **Did UI tell truth?** (yes/no)

#### 3.4 Preview vs Output Comparison
**This is the most important test.**

- [ ] Create job with `short_h264.mp4`
- [ ] Add 5 overlays (mixed types: text, timecode, metadata)
- [ ] Screenshot preview with all overlays
- [ ] Start job and wait for completion
- [ ] Open rendered output in QuickTime/VLC
- [ ] Compare frame-by-frame — **Assert ONLY these 4 things:**
   - [ ] **Overlay POSITION:** Do positions match preview? (within a few pixels acceptable)
   - [ ] **Overlay ORDERING:** Is Z-order correct? (top layer on top)
   - [ ] **Overlay VISIBILITY:** Are enabled overlays present?
   - [ ] **Overlay ABSENCE:** Are disabled overlays absent?
- [ ] **Did preview match output?** (yes/no)
- [ ] **If mismatch:** Document specifics (position off by X pixels, layer 3 missing, wrong Z-order)

**CRITICAL: Preview is advisory, output is authoritative.**

**DO NOT treat these as failures:**
- Color differences (gamma, saturation, hue)
- Scaling differences (interpolation, sharpness)
- Pixel-perfect parity (rounding, subpixel positioning)

**Only escalate if differences are egregious** (e.g., overlay completely wrong position, wrong clip, missing entirely).

---

### Test 4: Overlay Integrity Test

**Component:** [OverlayLayerStack](frontend/src/components/OverlayLayerStack.tsx)

#### 4.1 Mixed Scope Overlays
- [ ] Create job with `multi_clip_folder/` (5+ clips)
- [ ] Add 2 project-scoped overlays:
   - Text: "PROJECT WATERMARK" (bottom-left)
   - Timecode (top-left)
- [ ] Select clip 3
- [ ] Add 1 clip-scoped overlay:
   - Text: "CLIP 3 ONLY" (center)
- [ ] Verify: Preview shows all 3 overlays when clip 3 selected
- [ ] Select clip 1
- [ ] Verify: Preview shows only 2 project-scoped overlays (no "CLIP 3 ONLY")
- [ ] Run job to completion
- [ ] Check outputs:
   - [ ] Clip 1 output: 2 overlays (project-scoped only)
   - [ ] Clip 3 output: 3 overlays (project + clip-scoped)
- [ ] **Did UI tell truth?** (yes/no)

#### 4.2 Layer Reordering
- [ ] Create job with `short_h264.mp4`
- [ ] Add 5 text overlays (different colors, same position: center)
- [ ] Note initial Z-order (top layer should be on top)
- [ ] Drag layer 5 to position 1 (bottom of stack)
- [ ] Verify: Preview updates immediately
- [ ] Verify: Layer 5 now behind all others
- [ ] Render job
- [ ] Verify: Output matches new Z-order
- [ ] **Did UI tell truth?** (yes/no)

#### 4.3 Layer Deletion
- [ ] Create job with 10 overlays
- [ ] Delete layer 5 (middle of stack)
- [ ] Verify: Confirmation dialog appears
- [ ] Confirm deletion
- [ ] Verify: Layer removed from stack UI
- [ ] Verify: Preview updates (layer 5 gone)
- [ ] Render job
- [ ] Verify: Layer 5 absent from output
- [ ] **Did UI tell truth?** (yes/no)

#### 4.4 Overlay Drag-to-Position (Alpha)
- [ ] Create job with `short_h264.mp4`
- [ ] Add text overlay: "DRAG ME"
- [ ] Drag overlay from center to top-right corner in preview
- [ ] Verify: Overlay moves in real-time
- [ ] Render job
- [ ] Verify: Output shows overlay in top-right (NOT center)
- [ ] **Did UI tell truth?** (yes/no)
- [ ] **Note:** This is alpha — document if broken, don't fix

---

### Test 5: Read-Only Enforcement Test

**Goal:** Verify ALL mutation paths blocked during running/completed jobs.

#### 5.1 Settings Lock During Execution
- [ ] Create job with `short_h264.mp4`
- [ ] Start job
- [ ] Verify: [DeliverControlPanel](frontend/src/components/DeliverControlPanel.tsx) shows lock icon (🔒)
- [ ] Verify: All settings inputs disabled (video codec, resolution, etc.)
- [ ] Verify: Tooltips or notices explain: "Settings locked - job is running"
- [ ] Try to change video codec
- [ ] Verify: Input does not respond
- [ ] **Did UI tell truth?** (yes/no)

#### 5.2 Overlay Lock During Execution
- [ ] Job still running from 5.1
- [ ] Verify: [OverlayLayerStack](frontend/src/components/OverlayLayerStack.tsx) drag handles disabled
- [ ] Try to drag layer
- [ ] Verify: Drag does not initiate
- [ ] Try to click "Add Overlay"
- [ ] Verify: Button disabled
- [ ] Try to delete layer
- [ ] Verify: Delete button disabled or confirmation blocked
- [ ] Verify: Read-only notice at bottom of stack: "Overlays locked - job is running"
- [ ] **Did UI tell truth?** (yes/no)

#### 5.3 Preview Overlay Lock
- [ ] Job still running from 5.1
- [ ] Verify: Overlay drag-to-position in [VisualPreviewWorkspace](frontend/src/components/VisualPreviewWorkspace.tsx) disabled
- [ ] Try to drag overlay in preview
- [ ] Verify: Overlay does not move
- [ ] **Did UI tell truth?** (yes/no)

#### 5.4 Lock After Completion
- [ ] Wait for job to complete (`COMPLETED`)
- [ ] Verify: Lock persists (settings still disabled)
- [ ] Verify: Lock icon still visible
- [ ] Verify: Read-only notices updated: "Settings locked - job is completed"
- [ ] **Did UI tell truth?** (yes/no)

---

### Test 6: Failure Empathy Test

**Question for EACH failure:**
> "If this happened to someone else, would they blame the app or themselves?"

#### 6.1 Missing Output Directory
- [ ] Browse to `short_h264.mp4`
- [ ] Leave output directory blank
- [ ] Click "Create Job"
- [ ] Verify: Error message appears INLINE (not global banner)
- [ ] Verify: Message says: "Output directory required" or similar (NOT "validation failed: required field missing")
- [ ] **Would user blame themselves?** (yes/no)

#### 6.2 Empty Folder Drop
- [ ] Create empty folder: `test_media/dogfood/empty/`
- [ ] Browse to `empty/`
- [ ] Verify: [IngestionConfirmDialog](frontend/src/components/IngestionConfirmDialog.tsx) shows "0 clips found"
- [ ] Verify: "Create Job" button disabled OR shows warning
- [ ] Verify: Message explains: "No supported media files found in folder"
- [ ] **Would user blame themselves?** (yes/no)

#### 6.3 Unsupported Media
- [ ] Browse to `broken_paths/unsupported.avi` (codec FFmpeg can't handle)
- [ ] Create job and start
- [ ] Verify: Clip fails with specific reason
- [ ] Verify: Failure reason mentions codec or format: "Unsupported codec: [codec_name]"
- [ ] Verify: Failure reason does NOT show FFmpeg error dump
- [ ] **Would user blame themselves?** (yes/no)

#### 6.4 File Permissions Error
- [ ] Create file with no read permissions:
   ```bash
   touch test_media/dogfood/no_permissions.mp4
   chmod 000 test_media/dogfood/no_permissions.mp4
   ```
- [ ] Browse to `no_permissions.mp4`
- [ ] Create job and start
- [ ] Verify: Clip fails with permission error
- [ ] Verify: Failure reason mentions permissions: "Permission denied: /path/to/no_permissions.mp4"
- [ ] **Would user blame themselves?** (yes/no)

#### 6.5 Backend Unavailable
- [ ] Start job
- [ ] Kill backend process: `pkill -f uvicorn`
- [ ] Observe: Global error banner appears
- [ ] Verify: Message explains: "Backend unavailable" or "Connection lost"
- [ ] Verify: Message does NOT show network error codes (ERR_CONNECTION_REFUSED, etc.)
- [ ] Restart backend
- [ ] Verify: Error banner dismisses automatically when reconnected
- [ ] **Would user blame themselves?** (yes/no)

---

### Test 7: Cold Start Honesty Test

**This tests the [Backup & Recovery Policy](docs/ALPHA_REALITY.md) in practice.**

#### 7.1 Mid-Job Backend Crash
- [ ] Create job with `long_form.mov`
- [ ] Start job
- [ ] Wait for 30-50% progress
- [ ] Kill backend: `pkill -9 -f uvicorn`
- [ ] Wait 5 seconds
- [ ] Restart backend: `./dev_launch.sh` or equivalent
- [ ] Restart frontend (refresh browser)
- [ ] **Observe:**
   - [ ] Does job appear in queue?
   - [ ] Job status = `RECOVERY_REQUIRED`?
   - [ ] Does [JobDiagnosticsPanel](frontend/src/components/JobDiagnosticsPanel.tsx) explain what happened?
   - [ ] Is Resume button offered?
   - [ ] Does Resume button actually work?
- [ ] Click Resume
- [ ] Verify: Job resumes from last completed clip (NOT from beginning)
- [ ] **Did UI tell truth?** (yes/no)

#### 7.2 Restart with PENDING Job
- [ ] Create job but do NOT start
- [ ] Kill backend
- [ ] Restart backend
- [ ] Restart frontend
- [ ] Verify: Job appears with status = `PENDING`
- [ ] Verify: Start button available
- [ ] **Did UI tell truth?** (yes/no)

#### 7.3 Restart with COMPLETED Job
- [ ] Run job to completion
- [ ] Kill backend
- [ ] Restart backend
- [ ] Restart frontend
- [ ] Verify: Job appears with status = `COMPLETED`
- [ ] Verify: Completed timestamp preserved
- [ ] Verify: Output files still accessible (if paths still valid)
- [ ] **Did UI tell truth?** (yes/no)

---

## 📝 Findings Log

**Location:** `/Users/leon.grant/projects/Proxx/DOGFOOD_FINDINGS.md`

For each issue found:

```markdown
### Issue #N: [Short Title]

**What I did:**
[Exact steps]

**What I expected:**
[Expected behavior]

**What actually happened:**
[Actual behavior]

**Did UI tell truth?** NO / PARTIALLY / YES

**Evidence:**
- Screenshot: [path or description]
- Job ID: [if applicable]
- Timestamp: [when it happened]

**Pattern notes:**
[What category of problem is this? Ingestion? Queue? Preview? Error messaging?]
```

---

## 🚪 Exit Criteria

Dogfooding is complete when:

- [ ] I can run 10+ jobs back-to-back without surprises
- [ ] No [InvariantBanner](frontend/src/components/InvariantBanner.tsx) violations during normal use
- [ ] Failures feel boring and explainable
- [ ] I can explain ANY job outcome without guessing
- [ ] I trust the queue without watching it nervously
- [ ] I trust outputs enough to NOT spot-check them
- [ ] **I stop feeling anxious after clicking "Render"**

---

## 🔒 Final Step

When all tests complete:

1. Review `DOGFOOD_FINDINGS.md`
2. Identify recurring patterns:
   - Recurring failure patterns
   - Recurring confusion points
   - Recurring "this surprised me" moments
3. **DO NOT FIX ANYTHING YET**
4. Report: "Dogfooding complete. Proceed to Preset Foundations."

---

## Known Limitations (Do Not Report)

These are **expected alpha limitations**, not bugs:

- Global drag-drop disabled (whitescreen crash risk)
- Video preview generation unstable
- Image overlay FFmpeg wiring missing (UI complete, execution stubbed)
- Preview scrubbing unavailable (frame 0 only)

**Only escalate if these:**
- Crash jobs
- Corrupt outputs
- Break unrelated features

Otherwise, document and proceed.
