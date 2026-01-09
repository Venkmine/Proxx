# QC Action Trace Schema

> **Status:** NORMATIVE  
> **Version:** 1.0.0  
> **Last Updated:** 2026-01-03

---

## Purpose

This document defines the schema for **action-scoped QC traces**. Each trace represents a complete lifecycle of a single user action, from intent through backend outcome to final UI state.

**NORMATIVE REQUIREMENT:** QC verdicts MUST be evaluated per action, not per screenshot.

---

## Design Principles

1. **Action-centric** — One trace per meaningful user action
2. **Correlated** — Backend signals + UI state evaluated together
3. **Contextual** — Screenshots capture settled state, not transitions
4. **Honest** — Backend failures are BLOCKED_PRECONDITION, not UI failures

---

## Action Trace Schema

```typescript
interface ActionTrace {
  /**
   * Stable identifier for this action type.
   * Examples: "click_create_job", "click_cancel_job", "select_source"
   */
  action_id: string;
  
  /**
   * Unique identifier for this specific trace instance.
   * Format: <action_id>_<timestamp>
   */
  trace_id: string;
  
  /**
   * ISO timestamp when action was initiated.
   */
  timestamp: string;
  
  /**
   * Workflow state BEFORE action was taken.
   * Must match a state from UI_QC_WORKFLOW.md.
   */
  prior_workflow_state: 'idle' | 'source_loaded' | 'job_running' | 'job_complete';
  
  /**
   * Expected state transition per UI_QC_WORKFLOW.md.
   * Example: { from: 'source_loaded', to: 'job_running' }
   */
  expected_transition: {
    from: string;
    to: string;
    trigger: string;
  };
  
  /**
   * Captured facts from backend response.
   * NOT interpretation — raw signals only.
   */
  backend_signals: BackendSignals;
  
  /**
   * Paths to visual evidence captured AFTER UI settled.
   */
  visual_snapshot: {
    screenshot_path: string;
    dom_snapshot_path?: string;
    captured_at: string;
    settle_trigger: 'spinner_appeared' | 'error_banner' | 'state_change' | 'timeout';
  };
  
  /**
   * Reference to GLM analysis of the visual snapshot.
   */
  glm_observation_ref: {
    report_path: string;
    screenshot_id: string;
    answers: Record<string, string>;
  };
  
  /**
   * Final QC outcome for this action.
   */
  qc_outcome: 'VERIFIED_OK' | 'VERIFIED_NOT_OK' | 'BLOCKED_PRECONDITION';
  
  /**
   * Human-readable reason for the outcome.
   */
  qc_reason: string;
  
  /**
   * Detailed breakdown of evaluation.
   */
  evaluation_details: {
    backend_ok: boolean;
    ui_matches_spec: boolean;
    spec_violations?: string[];
  };
}

interface BackendSignals {
  /**
   * Action-specific signals.
   * For "click_create_job":
   */
  job_created?: boolean;
  job_id?: string;
  error_reason?: string;
  error_category?: 'precondition' | 'backend' | 'validation' | 'unknown';
  
  /**
   * Execution engine availability.
   */
  execution_engine?: {
    ffmpeg_available: boolean;
    resolve_available: boolean;
  };
  
  /**
   * Response timing.
   */
  response_time_ms: number;
}
```

---

## Supported Actions (v1)

### click_create_job

| Field | Value |
|-------|-------|
| **action_id** | `click_create_job` |
| **Prior state** | `source_loaded` |
| **Expected transition** | `source_loaded` → `job_running` |
| **Trigger** | User clicks "Create Job" button |

**Backend signals captured:**
- `job_created` — Did backend accept and create the job?
- `job_id` — If created, the job identifier
- `error_reason` — If failed, why?
- `error_category` — Is this a precondition failure or UI bug?
- `execution_engine` — Is FFmpeg/Resolve available?

**UI settle conditions (wait for any):**
1. Job status spinner appears
2. Error banner appears
3. Queue panel updates with new job
4. Timeout (10 seconds)

---

## QC Outcome Evaluation Rules

### For action: click_create_job

```
IF backend_signals.job_created == false
   AND error_category IN ['precondition', 'backend']:
   → qc_outcome = BLOCKED_PRECONDITION
   → reason = "Backend unavailable or precondition not met: {error_reason}"

IF backend_signals.job_created == false
   AND error_category NOT IN ['precondition', 'backend']:
   → qc_outcome = VERIFIED_NOT_OK
   → reason = "Job creation failed unexpectedly: {error_reason}"

IF backend_signals.job_created == true
   AND UI violates UI_QC_BEHAVIOUR_SPEC.md for 'job_running' state:
   → qc_outcome = VERIFIED_NOT_OK
   → reason = "UI does not match expected state: {violations}"

IF backend_signals.job_created == true
   AND UI matches UI_QC_BEHAVIOUR_SPEC.md for 'job_running' state:
   → qc_outcome = VERIFIED_OK
   → reason = "Action completed successfully, UI reflects expected state"
```

**CRITICAL:** This logic overrides screenshot-only judgement. A screenshot showing "no progress bar" is VERIFIED_OK if the backend never created a job due to precondition failure.

---

## Artifact Structure

```
artifacts/ui/actions/<timestamp>/
├── <action_id>/
│   ├── action_trace.json      ← Full trace schema
│   ├── screenshot.png         ← Visual snapshot (post-settle)
│   ├── dom_snapshot.json      ← DOM state (optional)
│   └── glm_analysis.json      ← GLM observation for this action
└── action_summary.json        ← Aggregated outcomes for all actions
```

---

## Integration with Existing QC

Action-scoped QC **extends** existing scenario-based QC:

| Aspect | Scenario QC | Action QC |
|--------|-------------|-----------|
| Scope | Full test scenario | Single user action |
| Screenshots | Multiple, per phase | One, post-settle |
| Backend correlation | None | Required |
| Verdict granularity | Per scenario | Per action |

Both systems contribute to the final `qc_decision.json`.

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.1 | 2026-01-09 | Added UI_BRANDING_SINGLE_LOGO_ENFORCED |
| 1.0.0 | 2026-01-03 | Initial schema with click_create_job support |

---

## QC Actions Registry

### UI_BRANDING_SINGLE_LOGO_ENFORCED

**Action:** Single Forge logo enforcement  
**Timestamp:** 2026-01-09  
**Verification:**
- Source code: 1 logo reference (App.tsx header only)
- Production bundle: 1 logo reference  
- Removed from: SplashScreen, MonitorSurface, VisualPreviewWorkspace, Queue empty state
- Replaced with: Text-only branding ("Forge" wordmark, neutral typography)

**Verdict:** ✅ COMPLIANT — Single-logo rule enforced across entire UI
