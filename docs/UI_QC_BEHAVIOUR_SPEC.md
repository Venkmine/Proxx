# UI QC Behaviour Specification

> **Status:** NORMATIVE  
> **Version:** 1.0.0  
> **Last Updated:** 2026-01-03

---

## Purpose

This document is the **authoritative source** for UI behaviour expected during automated QC.

**NORMATIVE STATUS:** This specification overrides all other documentation for QC purposes. If a feature is not defined here, QC **must ignore it**.

---

## Scope

This specification defines:
- Which UI features QC may judge
- When features should be visible or hidden
- When features should be enabled or disabled

This specification does **not** define:
- Visual appearance (colours, fonts, spacing)
- Interaction behaviour beyond visibility/enabled state
- Backend logic or data flow

---

## Feature Definitions

### player_area

**Description:** The central MonitorSurface component that displays source preview, job progress, or idle branding.

| Condition | State |
|-----------|-------|
| Visible when | `source_loaded`, `job_running`, `job_complete` |
| Hidden when | `idle` |
| Enabled when | N/A (passive display, not interactive) |

**Notes:**
- In `idle` state, the area displays Awaire logo at ~12% opacity. This is **not** considered a player/preview.
- The presence of the branded idle background is expected in `idle` — QC must not flag this as missing player.

---

### preview_controls

**Description:** Transport bar controls (play, pause, scrub) for video preview playback.

| Condition | State |
|-----------|-------|
| Visible when | `source_loaded` (and playback-capable source) |
| Hidden when | `idle`, `job_running`, `job_complete` |
| Enabled when | Visible and source supports playback |

**Notes:**
- Preview controls are disabled during `job_running` — no playback while encoding.
- Not all sources support playback (e.g., image sequences). Controls may be hidden for non-playable sources.

---

### progress_bar

**Description:** Horizontal bar showing job encoding progress.

| Condition | State |
|-----------|-------|
| Visible when | `job_running` |
| Hidden when | `idle`, `source_loaded`, `job_complete` |
| Enabled when | N/A (informational only) |

**Notes:**
- Progress bar is part of the job status display, not a standalone component.
- May show indeterminate state during certain encoding phases.

---

### create_job_button

**Description:** Primary action button to create/submit a delivery job.

| Condition | State |
|-----------|-------|
| Visible when | Always |
| Hidden when | Never |
| Enabled when | `source_loaded` (at least one source file selected) |
| Disabled when | `idle`, `job_running`, `job_complete` |

**Notes:**
- Button visibility is constant; only enabled state changes.
- Located in the left panel (job configuration area).

---

### queue_panel

**Description:** Right-side panel showing job queue and individual job statuses.

| Condition | State |
|-----------|-------|
| Visible when | Always |
| Hidden when | Never |
| Enabled when | N/A (always interactive) |

**Notes:**
- Shows "No jobs in queue" or "0" count when empty.
- Individual job cards within the panel may have their own states.

---

### status_panel

**Description:** Area within queue panel displaying current job status and stage information.

| Condition | State |
|-----------|-------|
| Visible when | `job_running`, `job_complete` (when a job is selected) |
| Hidden when | `idle`, `source_loaded` (no job selected) |
| Enabled when | N/A (informational only) |

**Notes:**
- Shows delivery stage (queued, starting, encoding, finalizing, completed, failed).
- Part of the job card within queue_panel.

---

### audit_banner

**Description:** Persistent banner showing audit/logging status or warnings.

| Condition | State |
|-----------|-------|
| Visible when | Audit warnings present |
| Hidden when | No audit warnings |
| Enabled when | N/A (informational only) |

**Notes:**
- Not expected to be visible in normal operation.
- QC should only flag presence if unexpected.

---

## QC Evaluation Rules

### What QC May Judge

1. **Feature visibility** — Is a defined feature visible/hidden as expected for the current state?
2. **Feature enabled state** — Is a defined feature enabled/disabled as expected?
3. **Layout integrity** — Are features clipped, overlapping, or overflowing?

### What QC Must Ignore

1. **Undefined features** — Any UI element not listed in this specification
2. **Visual styling** — Colours, fonts, shadows, animations
3. **Exact positioning** — Pixel-perfect placement (only relative positioning matters)
4. **Transient states** — Loading spinners, transition animations

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-03 | Initial specification based on v1 app behaviour |
