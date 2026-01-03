# UI QC Workflow States

> **Status:** NORMATIVE  
> **Version:** 1.0.0  
> **Last Updated:** 2026-01-03

---

## Purpose

This document defines the **workflow states** used by automated QC to determine expected UI behaviour.

**NORMATIVE STATUS:** This specification overrides all other documentation for QC purposes. Only states defined here are valid for QC evaluation.

---

## Workflow States

### idle

**Description:** Application launched, no source files selected, no job in progress.

| Aspect | Value |
|--------|-------|
| Trigger | App launch OR all sources cleared |
| Exit when | User selects source file(s) |

**Expected Visible Features:**
- `queue_panel`
- `create_job_button` (disabled)

**Expected Hidden/Inactive Features:**
- `player_area` (shows branded idle — logo at ~12% opacity)
- `progress_bar`
- `preview_controls`
- `status_panel`

**Allowed User Actions:**
- Select source file(s)
- View empty queue

**Forbidden Expectations:**
- Player/preview content is **not expected** in idle — the branded background is correct.
- Progress bar is **never visible** in idle.

---

### source_loaded

**Description:** One or more source files are selected, no job executing.

| Aspect | Value |
|--------|-------|
| Trigger | User selects source file(s) OR pending job selected |
| Exit when | User clicks "Create Job" (→ job_running) OR clears selection (→ idle) |

**Expected Visible Features:**
- `player_area` (showing source metadata/poster)
- `queue_panel`
- `create_job_button` (enabled)
- `preview_controls` (if source supports playback)
- `zoom_controls`

**Expected Hidden/Inactive Features:**
- `progress_bar`
- `status_panel` (unless pending job selected)

**MINIMUM USABILITY REQUIREMENTS (QC ENFORCED):**
- `player_area` MUST be visible (not idle branding)
- `zoom_controls` MUST be visible
- `create_job_button` MUST be enabled unless backend-blocked (with explanation)

**Allowed User Actions:**
- Configure job settings
- Create/submit job
- Preview source (if supported)
- Clear selection

**Forbidden Expectations:**
- Progress bar is **never visible** in source_loaded (no job running).
- Status panel shows no job stage information.
- Player area showing only idle branding ("FORGE") is a **QC FAILURE**.

---

### job_running

**Description:** A delivery job is currently executing.

| Aspect | Value |
|--------|-------|
| Trigger | Job status becomes `RUNNING` |
| Exit when | Job status becomes `COMPLETED`, `FAILED`, or `CANCELLED` (→ job_complete) |

**Expected Visible Features:**
- `player_area` (showing job progress overlay)
- `queue_panel`
- `progress_bar`
- `status_panel` (showing delivery stage)
- `create_job_button` (disabled)
- `zoom_controls` (visible but may be disabled)

**Expected Hidden/Inactive Features:**
- `preview_controls` (playback disabled during encoding)

**MINIMUM USABILITY REQUIREMENTS (QC ENFORCED):**
- `progress_bar` MUST be visible (determinate or indeterminate)
- `status_panel` MUST reflect active processing state
- Absence of visual progress feedback is a **QC FAILURE**

**Allowed User Actions:**
- View progress
- View queue
- (Cancel job — if implemented)

**Forbidden Expectations:**
- Preview controls are **not interactive** during encoding.
- Create Job button is **not enabled** during encoding.
- Missing progress indicator is a **QC FAILURE**.

---

### job_complete

**Description:** Job has finished executing (success or failure).

| Aspect | Value |
|--------|-------|
| Trigger | Job status becomes `COMPLETED`, `FAILED`, or `CANCELLED` |
| Exit when | User clears job OR selects new source (→ source_loaded or idle) |

**Expected Visible Features:**
- `player_area` (showing completion summary)
- `queue_panel`
- `status_panel` (showing final status: completed/failed)
- `create_job_button` (disabled unless source still selected)

**Expected Hidden/Inactive Features:**
- `progress_bar` (job no longer running)
- `preview_controls`

**Allowed User Actions:**
- View completion status
- Review job in queue
- Start new job (select new sources)

**Forbidden Expectations:**
- Progress bar is **never visible** after job completes.
- Completed/failed status must **not regress** to running.

---

## State Transitions

```
┌─────────────┐
│    idle     │
└──────┬──────┘
       │ Source selected
       ▼
┌─────────────────┐
│  source_loaded  │◄────────┐
└────────┬────────┘         │
         │ Create Job       │ New source / clear job
         ▼                  │
┌─────────────────┐         │
│   job_running   │         │
└────────┬────────┘         │
         │ Job finishes     │
         ▼                  │
┌─────────────────┐         │
│  job_complete   │─────────┘
└─────────────────┘
```

### Transition Table

| From | To | Trigger |
|------|----|---------|
| `idle` | `source_loaded` | User selects source file(s) |
| `source_loaded` | `idle` | User clears all sources |
| `source_loaded` | `job_running` | User creates job AND job starts running |
| `job_running` | `job_complete` | Job reaches terminal state (COMPLETED/FAILED/CANCELLED) |
| `job_complete` | `source_loaded` | User selects new source |
| `job_complete` | `idle` | User clears job and sources |

---

## QC Usage

### Determining Current State

QC must infer the workflow state from observable evidence:

1. **Check for progress bar** — If visible, state is `job_running`
2. **Check for completion status** — If job shows COMPLETED/FAILED, state is `job_complete`
3. **Check for player content** — If source metadata visible, state is `source_loaded`
4. **Default** — If only branded idle visible, state is `idle`

### Validating State

Once state is determined, validate visible features against the Behaviour Spec:
- Features listed as "Expected Visible" for that state must be visible
- Features listed as "Expected Hidden" must not be visible
- Features not defined in the Behaviour Spec must be ignored

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-03 | Initial specification based on v1 app behaviour |
