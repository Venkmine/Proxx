# Dogfooding Implementation Summary
**Date:** 23 December 2025  
**Status:** Ready to Execute

---

## What Was Created

### 1. Core Documentation

**[DOGFOOD_PLAN.md](DOGFOOD_PLAN.md)** — Master test plan (510 lines)
- Backend state verification (COMPLETED ✅)
- 7 comprehensive test suites (84 individual test cases)
- Media requirements and setup
- Exit criteria and completion protocol

**[DOGFOOD_FINDINGS.md](DOGFOOD_FINDINGS.md)** — Findings log
- Issue template for structured reporting
- Pattern tracking (recurring failures, confusion points, surprises)
- Test completion tracking

**[DOGFOOD_CHECKLIST.md](DOGFOOD_CHECKLIST.md)** — Quick reference
- Pre-flight checklist
- Test order with time estimates (total: ~2 hours)
- Exit criteria
- Quick issue template

### 2. Helper Scripts

**[scripts/prepare_dogfood_media.sh](scripts/prepare_dogfood_media.sh)**
- Creates test media directory structure
- Generates README with file requirements
- Executable (`chmod +x` applied)

**[scripts/dogfood_helper.sh](scripts/dogfood_helper.sh)**
- Health checks (backend/frontend)
- Job queue inspection
- Test media verification
- Backend log viewing
- State transition diagram
- Executable (`chmod +x` applied)

---

## Alignment with Freeze Rules

✅ **No new features** — Tests existing functionality only  
✅ **No UX polish** — Documents issues, doesn't fix them  
✅ **No refactors** — Zero code changes  
✅ **Bug fixes only if surfaced** — Document first, fix later if needed  
✅ **Diagnostics may extend** — All tests are diagnostic/observational  

---

## Backend State Verification (COMPLETED)

**Actual states confirmed:**

```python
# JobStatus (backend/app/jobs/models.py)
PENDING                   # Created, not yet started
RUNNING                   # At least one clip being processed
PAUSED                    # Paused by user, can resume
COMPLETED                 # All clips done, no failures/warnings
COMPLETED_WITH_WARNINGS   # All clips terminal, some failed/skipped/warned
FAILED                    # Job engine cannot continue
RECOVERY_REQUIRED         # Process restarted mid-execution
CANCELLED                 # Cancelled by operator (terminal)

# TaskStatus
QUEUED      # Waiting to be processed
RUNNING     # Currently being processed
COMPLETED   # Successfully completed
SKIPPED     # Skipped (source offline, unsupported)
FAILED      # Failed during processing
```

**UI alignment:** Frontend [StatusBadge.tsx](frontend/src/components/StatusBadge.tsx) supports all backend states ✅

**No fake states added** — Tests verify UI reflects reality, not aspirations ✅

---

## Corrections Applied

### 1. Backend State Naming ✅
- Verified actual states in `backend/app/jobs/models.py`
- Confirmed state transitions in `backend/app/jobs/state.py`
- Documented all states in plan (no assumptions)

### 2. Preview vs Output Comparison ✅
**Assertions limited to:**
- Overlay POSITION (within a few pixels)
- Overlay ORDERING (Z-order correctness)
- Overlay VISIBILITY (enabled overlays present)
- Overlay ABSENCE (disabled overlays absent)

**Explicitly excluded:**
- Color/gamma/saturation differences
- Scaling/interpolation differences
- Pixel-perfect parity

**Principle:** Preview is advisory, output is authoritative.

### 3. Image Overlays Caveat ✅
**Known alpha:** FFmpeg wiring missing (UI complete, execution stubbed)

**Only escalate if:**
- Crashes jobs
- Corrupts outputs
- Breaks unrelated overlays

Otherwise: document and proceed.

### 4. Concurrent Execution Test ✅
**Flagged as CRITICAL TEST**

**Backend limit:** `MAX_CONCURRENT_WORKERS = 2`

**Watch for:**
- Job 3 enters clear waiting/queued state
- Job 3 starts immediately when slot frees
- No UI hallucination (showing "RUNNING" when it isn't)

**If lies detected:** Write down immediately — this is 2am production bug material.

### 5. Cold Start Honesty Test ✅
**Added as Test 7**

**Procedure:**
1. Start long job
2. Kill backend mid-execution
3. Restart app
4. Observe recovery state

**Verifies:**
- Job persists after restart
- State is honest (`RECOVERY_REQUIRED`)
- Diagnostics explain what happened
- Resume works (or is honestly disabled)

**Ties to:** [Backup & Recovery Policy](docs/ALPHA_REALITY.md)

---

## Test Suite Structure

### Test 1: Ingestion Truth (15 min)
- Browse & Drop Zone confirmation flows
- Output directory validation
- Path validation (absolute required)
- Slow I/O handling (external volumes)

**Key question:** Nothing happens until confirm?

### Test 2: Queue Honesty (30 min) 🔴 CRITICAL
- Single job execution
- **Concurrent execution (3 jobs, 2 workers limit)**
- Pause/resume semantic ("finish current clip")
- State transition guards
- Failure display (actionable messages)
- Multiple failures (COMPLETED_WITH_WARNINGS)

**Key question:** Does queue lie about what's running?

### Test 3: Preview Trust (20 min) 🔴 CRITICAL
- Preview sync with selection
- Overlay rendering
- **Preview vs output comparison (4 assertions only)**

**Key question:** Does preview match output?

### Test 4: Overlay Integrity (25 min)
- Mixed scope (project vs clip)
- Layer reordering (Z-order)
- Layer deletion
- Drag-to-position (alpha)

**Key question:** Do clip-scoped overlays isolate correctly?

### Test 5: Read-Only Enforcement (10 min)
- Settings lock during running/completed
- Overlay lock during running/completed
- Preview lock during running/completed
- Lock messaging ("Settings locked - job is running")

**Key question:** Can I mutate ANYTHING while running/completed?

### Test 6: Failure Empathy (20 min)
- Missing output directory
- Empty folder
- Unsupported media
- File permissions
- Backend unavailable

**Key question:** Would user blame app or themselves?

### Test 7: Cold Start Honesty (15 min)
- Mid-job backend crash → `RECOVERY_REQUIRED`
- Restart with PENDING job
- Restart with COMPLETED job

**Key question:** Does recovery feel trustworthy?

---

## Exit Criteria

**Dogfooding ends when:**

- [ ] 10+ jobs back-to-back without surprises
- [ ] No InvariantBanner violations during normal use
- [ ] Failures feel boring and explainable
- [ ] Can explain ANY job outcome without guessing
- [ ] Trust queue without watching nervously
- [ ] **Stop feeling anxious after clicking "Render"**

**Then:**
1. Review `DOGFOOD_FINDINGS.md`
2. Identify recurring patterns (not individual fixes)
3. Report: "Dogfooding complete. Proceed to Preset Foundations."
4. **DO NOT FIX ANYTHING YET** (freeze rules)

---

## How to Execute

### Pre-Flight
```bash
# 1. Prepare test media directory
./scripts/prepare_dogfood_media.sh

# 2. Copy REAL media files (follow prompts)

# 3. Verify setup
./scripts/dogfood_helper.sh check
./scripts/dogfood_helper.sh media

# 4. Clear old jobs
./scripts/dogfood_helper.sh jobs
# Delete manually via UI if needed

# 5. Open findings log for live note-taking
code DOGFOOD_FINDINGS.md
```

### During Testing
```bash
# Check health anytime
./scripts/dogfood_helper.sh check

# Inspect queue state
./scripts/dogfood_helper.sh jobs

# View backend logs
./scripts/dogfood_helper.sh logs

# Reference state transitions
./scripts/dogfood_helper.sh states
```

### Follow Test Order
See [DOGFOOD_CHECKLIST.md](DOGFOOD_CHECKLIST.md) for quick reference.  
See [DOGFOOD_PLAN.md](DOGFOOD_PLAN.md) for detailed procedures.

Total estimated time: **2 hours** (sequential execution)

---

## Known Alpha Limitations (Ignore Unless Catastrophic)

- Global drag-drop disabled (whitescreen crash risk)
- Video preview generation unstable
- Image overlay FFmpeg wiring missing
- Preview scrubbing unavailable (frame 0 only)

**Only escalate if these:**
- Crash jobs
- Corrupt outputs
- Break unrelated features

---

## Final Protocol

After completing all tests:

1. Review `DOGFOOD_FINDINGS.md`
2. Write **single summary note**:
   - Recurring failure patterns
   - Recurring confusion points
   - Recurring "this surprised me" moments
3. **DO NOT FIX ANYTHING YET**
4. Report: "Dogfooding complete. Proceed to Preset Foundations."

That's when **Option 1** (Preset System Foundations) becomes safe.

---

## Tools Reference

**Scripts:**
- `./scripts/prepare_dogfood_media.sh` — Setup test media structure
- `./scripts/dogfood_helper.sh` — Health checks, job inspection, diagnostics

**Documentation:**
- `DOGFOOD_PLAN.md` — Full test procedures (510 lines, 84 test cases)
- `DOGFOOD_CHECKLIST.md` — Quick reference (test order, issue template)
- `DOGFOOD_FINDINGS.md` — Live findings log (populate during execution)

**Key Components:**
- [StatusBadge.tsx](frontend/src/components/StatusBadge.tsx) — UI state rendering
- [JobGroup.tsx](frontend/src/components/JobGroup.tsx) — Job queue display
- [VisualPreviewWorkspace.tsx](frontend/src/components/VisualPreviewWorkspace.tsx) — Preview rendering
- [OverlayLayerStack.tsx](frontend/src/components/OverlayLayerStack.tsx) — Overlay management
- [JobDiagnosticsPanel.tsx](frontend/src/components/JobDiagnosticsPanel.tsx) — Diagnostic UI
- [backend/app/jobs/models.py](backend/app/jobs/models.py) — State definitions
- [backend/app/jobs/state.py](backend/app/jobs/state.py) — State transitions

---

## Implementation Status

✅ **Backend state verification** — Completed  
✅ **Test plan creation** — Completed  
✅ **Helper scripts** — Completed  
✅ **Documentation** — Completed  
✅ **Alignment with freeze rules** — Verified  
✅ **Corrections applied** — All 5 clarifications addressed  

**Next action:** Execute dogfooding tests (manual, requires real media)

---

**This implementation is complete and ready for execution.**  
**All tools, documentation, and verification are in place.**  
**No code changes made (freeze rules respected).**
