# Phase 9A: Explicit Job Execution Control

**Version:** 9A  
**Status:** Implemented  
**Date:** January 2026

## Executive Summary

Phase 9A restores **explicit user control** over job execution. Jobs MUST NOT auto-execute on creation. The user must explicitly click "Start" to begin processing.

This is not a feature—it's a **fundamental safety invariant**.

---

## Core Invariants

### 1. Jobs MUST NOT Auto-Execute on Creation

When a job is created (via UI, watch folder, or API), it enters a **QUEUED** or **DRAFT** state. No FFmpeg or Resolve process is started. The job is inert until the user explicitly requests execution.

### 2. Watch Folders MUST NOT Bypass Execution Controls

Watch folders can **detect files** and **create jobs**, but they cannot **execute jobs**. The `auto_execute` flag is deprecated and ignored. All jobs created by watch folders have `execution_requested=False`.

### 3. No Background Execution Without User Gesture

There is no "smart automation" that starts jobs behind the user's back. Every execution trace must lead back to:
- A user clicking "Start" on a job
- A user clicking "Start Queue"
- A user explicitly enabling "auto-start" in settings (future Phase 9B)

### 4. No "Smart Defaults" That Start Jobs Implicitly

Default behavior is **inert**. The system never assumes the user wants to start processing.

---

## Mental Model for Editors

Think of Forge like a print queue or a render queue in After Effects:

1. **You add items to the queue** → Jobs are created in QUEUED state
2. **Nothing happens yet** → Jobs sit in queue, previews ready, settings visible
3. **You click "Render"** → Execution begins
4. **You can cancel or pause** → You're always in control

This is the professional workflow editors expect. No surprises.

---

## Technical Implementation

### Backend: `execution_requested` Field

```python
@dataclass
class JobSpec:
    # ... other fields ...
    
    # Phase 9A: Explicit Execution Control
    # Default is False - jobs are inert until user requests execution
    execution_requested: bool = False
```

### Backend: Enforcement in `execution_adapter.py`

The execution adapter checks `execution_requested` **BEFORE** any other validation:

```python
def execute_jobspec(jobspec: JobSpec) -> JobExecutionResult:
    # STEP 0: Phase 9A - Explicit Execution Control Enforcement
    if not jobspec.execution_requested:
        return JobExecutionResult(
            job_id=jobspec.job_id,
            final_status="BLOCKED",
            validation_error="Job execution not authorized...",
            validation_stage="execution-control",
        )
    
    # ... rest of execution flow ...
```

This is a **trust but verify** pattern. Even if the UI is compromised or buggy, the backend will not execute jobs without explicit authorization.

### Job Lifecycle States

```
DRAFT → QUEUED → RUNNING → COMPLETED
                    ↓
                 PAUSED
                    ↓
                CANCELLED
                    ↓
                 FAILED
```

- **DRAFT**: Job created, not yet in queue (future use)
- **QUEUED**: Job in queue, awaiting user action
- **RUNNING**: Job actively executing
- **PAUSED**: User paused execution (can resume)
- **COMPLETED**: All clips processed successfully
- **FAILED**: One or more clips failed
- **CANCELLED**: User cancelled before/during execution
- **BLOCKED**: Backend enforcement prevented execution

### Frontend: Queue Controls

The UI provides explicit controls:

**Global Queue Controls:**
- **Start Queue**: Begin processing queued jobs in order
- **Pause Queue**: Stop picking up new jobs (current job finishes)
- **Stop Queue**: Cancel all processing

**Per-Job Controls (always visible, never hover-only):**
- **Start**: Begin this specific job
- **Pause**: Pause this job
- **Cancel**: Cancel this job

**Multi-Select:**
- Shift+click for range selection
- Cmd/Ctrl+click for toggle selection
- Actions apply to selected jobs

---

## Why This Matters

### 1. Automation Safety

Watch folders can monitor terabytes of media. Auto-executing could consume all system resources or overwrite important files. Explicit control is essential.

### 2. Preview Before Commit

Users can review job settings, check output paths, and verify codec choices before committing to hours of rendering.

### 3. Resource Management

Users can prioritize jobs, batch similar work, and manage system load intentionally.

### 4. Error Recovery

If a job has incorrect settings, the user can fix it before wasting time on a failed render.

### 5. Professional Workflow

This matches the mental model from NLEs, DAWs, and other professional tools. Editors are in control.

---

## Enabling Safe Automation (Future: Phase 9B)

Phase 9A establishes the foundation. Phase 9B will add **opt-in automation**:

- "Auto-start watch folder jobs" setting (off by default)
- Scheduled queue start times
- API hooks for CI/CD pipelines

These features will be explicit user choices, not defaults.

---

## Test Requirements

All tests are in `backend/tests/test_phase_9a_execution_control.py`:

| Test Case | What It Verifies |
|-----------|-----------------|
| `test_jobspec_default_execution_requested_is_false` | JobSpec defaults to no-execute |
| `test_execution_adapter_blocks_when_execution_not_requested` | Backend enforcement works |
| `test_watch_folder_created_job_has_execution_requested_false` | Watch folders don't auto-execute |
| `test_execution_requested_roundtrips` | Field survives serialization |

**The Golden Rule:** If FFmpeg runs without the user clicking Start, the test fails.

---

## Files Changed

### Backend
- `job_spec.py`: Added `execution_requested` field
- `execution_adapter.py`: Added Step 0 enforcement check
- `execution/jobLifecycle.py`: Added DRAFT and PAUSED states
- `app/watchfolders/engine.py`: Deprecated auto_execute, no auto-execution

### Frontend
- `electron/watchFolderService.ts`: Updated to clarify no auto-execute
- `ui/screens/jobs_list/JobsList.tsx`: Added multi-select support
- `ui/screens/jobs_list/JobsList.types.ts`: Added multi-select props
- `ui/screens/jobs_list/JobsList.css`: Added multi-select styles
- `components/QueueExecutionControls.tsx`: New queue control components
- `components/QueueExecutionControls.css`: Queue control styling
- `hooks/useMultiSelect.ts`: Multi-select hook

### Tests
- `tests/test_phase_9a_execution_control.py`: 12 mandatory tests

---

## Summary

Phase 9A ensures that **the user is always in control of when work happens**. This is a foundational principle that enables safe automation in the future while preserving the professional workflow editors expect today.

**Nothing runs until the user says so.**
