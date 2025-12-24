# Dogfooding Quick Reference
**Fast reference for executing dogfooding tests.**  
**See [DOGFOOD_PLAN.md](DOGFOOD_PLAN.md) for full details.**

---

## Pre-Flight

- [ ] Run `./scripts/prepare_dogfood_media.sh`
- [ ] Copy REAL media to `test_media/dogfood/` (see README in that folder)
- [ ] Verify backend running: `curl http://127.0.0.1:8085/health`
- [ ] Verify frontend running: Open `http://localhost:3000`
- [ ] Clear old jobs: Delete all existing jobs in queue
- [ ] Open `DOGFOOD_FINDINGS.md` in editor for live note-taking

---

## Test Order (Run Sequentially)

### 1. Ingestion (15 min)
- Single file browse
- Folder ingestion
- Output directory missing
- Invalid path rejection
- External volume (slow I/O)

**Key question:** Nothing happens until confirm?

### 2. Queue (30 min)
- Single job execution
- **CRITICAL:** Concurrent execution (3 jobs, 2 workers)
- Pause & resume
- State transition guards
- Failure display
- Multiple failures

**Key question:** Does queue lie about what's running?

### 3. Preview (20 min)
- Preview sync (select different clips)
- Preview with no selection
- Overlay rendering in preview
- **CRITICAL:** Preview vs output comparison (frame-by-frame)

**Key question:** Does preview match output?

### 4. Overlay (25 min)
- Mixed scope (project + clip)
- Layer reordering
- Layer deletion
- Drag-to-position in preview

**Key question:** Do clip-scoped overlays isolate correctly?

### 5. Read-Only (10 min)
- Settings lock during running
- Overlay lock during running
- Preview overlay lock
- Lock after completion

**Key question:** Can I mutate ANYTHING while running/completed?

### 6. Failure Empathy (20 min)
- Missing output directory
- Empty folder
- Unsupported media
- File permissions
- Backend unavailable

**Key question:** Would user blame app or themselves?

### 7. Cold Start (15 min)
- Mid-job backend crash
- Restart with PENDING job
- Restart with COMPLETED job

**Key question:** Does recovery feel trustworthy?

---

## Exit Criteria

Stop when you can answer "yes" to:

- [ ] 10+ jobs back-to-back without surprises?
- [ ] No invariant banners during normal use?
- [ ] Failures feel boring?
- [ ] Can explain any outcome without guessing?
- [ ] Trust queue without watching nervously?
- [ ] **Stop feeling anxious after clicking Render?**

---

## Quick Issue Template

```markdown
### Issue #N: [Title]

**What I did:** [Steps]
**Expected:** [What should happen]
**Actual:** [What happened]
**UI Truth:** NO / PARTIAL / YES
**Pattern:** [Ingestion | Queue | Preview | Overlay | Error | Other]
```

---

## Known Alpha (Ignore Unless Catastrophic)

- Global drag-drop disabled
- Video preview generation unstable
- Image overlay execution stubbed
- No preview scrubbing (frame 0 only)

---

## After Completion

1. Review `DOGFOOD_FINDINGS.md`
2. Group by pattern (not by fix)
3. Report: "Dogfooding complete. Proceed to Preset Foundations."
4. **DO NOT FIX ANYTHING** (freeze rules)
