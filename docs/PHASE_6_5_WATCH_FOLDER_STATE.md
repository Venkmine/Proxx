# PHASE 6.5: WATCH FOLDER STATE & SCALABILITY

**Status:** Implemented
**Purpose:** Improve watch folder clarity, scale, and operator confidence
**Constraint:** No execution semantics changes - detection + explicit "Create Jobs" model preserved

---

## Summary

This phase addresses operator visibility and scalability concerns in watch folders without enabling automation.

### Key Changes

1. **Status Clarity (A)**
   - Clear status indicator with visual light/badge
   - Explicit state labels: `Watching` | `Paused`
   - Action verbs on buttons: `Pause` | `Resume`
   - Status labels are read-only (not clickable)

2. **Counts-First Model (B)**
   - New `WatchFolderCounts` interface tracking:
     - `detected`: Total files detected since last reset
     - `staged`: Files eligible for job creation
     - `jobs_created`: Files converted into jobs
     - `completed`: Successful encodes
     - `failed`: Failed encodes (sticky)
   - Counts update deterministically
   - Counts survive UI refreshes (persisted in main process)

3. **File List Scaling (C)**
   - File list capped at 10 items (`MAX_STAGED_PREVIEW`)
   - "View staged files" optional drill-down button
   - Hidden files notice when files exceed cap
   - UI remains performant with 10,000+ files

4. **Create Jobs Semantics (D)**
   - Clear helper text: "📁 N files detected. Click Create Jobs to encode."
   - Button shows count: "Create Jobs (N)"
   - Staged count goes to zero after job creation
   - No silent transitions

5. **Panel Layout (E)**
   - Collapsed view: folder name, status, key counts
   - Expanded view: full counts, controls, optional file preview
   - Functional space increased without redesign

---

## Files Changed

### Types
- `frontend/src/types/watchFolders.ts`
  - Added `WatchFolderStatus` type
  - Added `WatchFolderCounts` interface
  - Extended `WatchFolder` with `status` and `counts`
  - Extended trace events for counts updates

### Backend (Electron)
- `frontend/electron/watchFolderService.ts`
  - Initialize counts on watch folder creation
  - Update `status` field on enable/disable
  - Increment counts on file detection
  - Track job creation, completion, failure
  - Added `recordJobCompleted`, `recordJobFailed`, `resetWatchFolderCounts`

### UI
- `frontend/src/components/WatchFoldersPanelV3.tsx` (NEW)
  - `StatusIndicator` component with visual light
  - `CountsDisplay` component (compact and full modes)
  - `StagedFilesPreview` with capped list
  - Helper text for Create Jobs action
  - Collapsed/expanded view modes

- `frontend/src/App.tsx`
  - Updated import to use `WatchFoldersPanelV3`

### Tests
- `qa/e2e/phase_6_5_watch_folder_state.spec.ts` (NEW)
  - Status clarity test
  - Counts update test
  - Large folder safety test
  - No automation regression test
  - Create Jobs semantics test

---

## End Conditions Verified

| Requirement | Status |
|------------|--------|
| Operators can tell if folder is active | ✓ Visual indicator + label |
| Operators can see pending work | ✓ Counts always visible |
| Create Jobs action is clear | ✓ Helper text + button label |
| Watch folders scale to facility level | ✓ Capped file list |
| Automation still OFF | ✓ No auto-execution |

---

## Running E2E Tests

```bash
cd qa/e2e
E2E_TEST=true npx playwright test phase_6_5_watch_folder_state.spec.ts
```

---

## Non-Goals (Explicitly Avoided)

- ❌ Auto-transcoding (future phase)
- ❌ Background execution
- ❌ Source folder mutation
- ❌ Weakening QC or Electron-only rules
- ❌ Unbounded file list rendering

---

## Next Phase

Phase 7 may enable auto-transcoding with explicit operator opt-in.
Current phase ensures the foundation is solid before automation.
