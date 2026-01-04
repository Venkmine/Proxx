# UI Workflow Intents

> Version: 1.1.0  
> Last Updated: 2026-01-04

---

## Contract Statement

**This document is the authoritative definition of how Proxx is expected to behave from a human perspective.**

QC, automation, and UI verification **MUST** derive from this specification, not infer intent from UI structure.

All automated tests, visual verification loops, and acceptance criteria trace back to the intents defined here. If an intent is not documented, it is not contractually expected.

---

## QC Scope Separation

**UI QC and Execution QC are formally separated.**

| Scope | Responsibility | Environment | Validated By |
|-------|---------------|-------------|--------------|
| **UI QC** | UI workflow through job queuing | Electron + Playwright | INTENT_001 through INTENT_005 |
| **Usability QC** | Static layout and usability sanity | Electron + Playwright | INTENT_010 |
| **Execution QC** | Job processing through completion | Headless backend | INTENT_006 |

### Contract Boundary

```
┌──────────────────────────────────────────────────────────────────────┐
│                        QC SCOPE BOUNDARY                              │
├───────────────────────────────┬──────────────────────────────────────┤
│           UI QC               │         EXECUTION QC                 │
│    (Electron + Playwright)    │       (Headless Backend)             │
├───────────────────────────────┼──────────────────────────────────────┤
│ • Source file selection       │ • FFmpeg invocation                  │
│ • Source loading/preview      │ • Encoding progress                  │
│ • Job configuration UI        │ • Output file generation             │
│ • Job creation                │ • Job completion/failure             │
│ • Job visible in queue        │ • Post-processing                    │
│                               │                                      │
│ ENDS AT: system_queues_job    │ STARTS AT: system_processes_job     │
└───────────────────────────────┴──────────────────────────────────────┘
```

### Why This Separation?

1. **Determinism**: UI QC must be fast, deterministic, and non-interactive
2. **Dependencies**: Execution QC requires real FFmpeg, which may not be available in all environments
3. **Isolation**: UI bugs should not block execution testing, and vice versa
4. **Speed**: UI QC can complete in seconds; execution QC may take minutes

---

## Structure Definition

Each workflow intent follows this schema:

| Field | Description |
|-------|-------------|
| `intent_id` | Unique identifier (INTENT_NNN) |
| `human_goal` | Plain English description of what the user wants |
| `preconditions` | Required state before workflow begins |
| `action_sequence` | Semantic actions (not clicks) |
| `expected_state_transitions` | UI/system states traversed |
| `required_ui_evidence` | What must be visually verifiable |
| `acceptable_failures` | Failures that are handled gracefully |
| `hard_failures` | Failures that indicate broken contract |

---

## Workflow Intents

---

### INTENT_001 — Queue Delivery Proxy (Single File) — UI QC

#### Human Goal

> "I want to select a source file, configure it, and queue a delivery proxy job."

This is the **primary UI QC use case**. A user selects a source file, the system loads and analyzes it, the user creates a job, and the system queues it. **UI QC ends when the job is successfully queued.**

> ⚠️ **CONTRACT BOUNDARY**: This intent validates **UI workflow only**. Job processing (FFmpeg execution) is validated by INTENT_006.

#### Preconditions

- Application is running and idle
- No active jobs in progress
- User has a valid video file accessible on disk

#### Action Sequence

| Step | Action | Actor | QC Scope |
|------|--------|-------|----------|
| 1 | `user_selects_source_file` | User | UI QC |
| 2 | `user_creates_job` | User | UI QC |
| 3 | `system_queues_job` | System | UI QC ✅ BOUNDARY |

> **Note:** Steps 4-5 (`system_processes_job`, `job_completes`) are execution-scope, validated by INTENT_006.

#### Expected State Transitions

```
idle → source_loading → source_loaded → job_queued
```

| From State | To State | Trigger |
|------------|----------|---------|
| `idle` | `source_loading` | User selects source file |
| `source_loading` | `source_loaded` | System finishes probe/preview generation |
| `source_loaded` | `job_queued` | User clicks "Create Job" |

#### Required UI Evidence

| State | Evidence |
|-------|----------|
| `source_loading` | Loading indicator visible OR file path shown |
| `source_loaded` | Video player visible with first frame |
| `source_loaded` | Source metadata displayed (resolution, codec, duration) |
| `job_queued` | Job visible in queue panel |

#### Acceptable Failures

| Failure | Expected Behavior |
|---------|-------------------|
| Source file is corrupt | Error message displayed, user can select another file |
| Unsupported codec | Clear error explaining codec not supported |

#### Hard Failures

| Failure | Why It's a Contract Violation |
|---------|-------------------------------|
| Error occurs with no visible feedback | Silent failure violates trust |
| Source loads but player shows black/frozen | Preview pipeline broken |
| Job creation UI unresponsive | User cannot complete workflow |
| Job not visible in queue after creation | Queue state not reflected |

---

### INTENT_002 — Preview Without Delivery

#### Human Goal

> "I want to preview footage without creating a delivery job."

User loads a file to inspect it — check timecode, view frames, verify format — without generating any output.

#### Preconditions

- Application is running and idle
- User has a video file accessible on disk

#### Action Sequence

| Step | Action | Actor |
|------|--------|-------|
| 1 | `user_selects_source_file` | User |
| 2 | `system_loads_source` | System |
| 3 | `system_displays_preview` | System |
| 4 | `user_inspects_preview` | User |
| 5 | `user_exits_or_selects_new` | User |

#### Expected State Transitions

```
idle → source_loading → source_loaded → idle (on clear/new selection)
```

| From State | To State | Trigger |
|------------|----------|---------|
| `idle` | `source_loading` | User selects source file |
| `source_loading` | `source_loaded` | System finishes probe/preview generation |
| `source_loaded` | `idle` | User clears source or selects new file |

#### Required UI Evidence

| State | Evidence |
|-------|----------|
| `source_loaded` | Video player visible with first frame |
| `source_loaded` | Source metadata displayed |
| `source_loaded` | Playback controls available |
| `source_loaded` | Timecode visible (if present in source) |
| `source_loaded` | No automatic job creation |

#### Acceptable Failures

| Failure | Expected Behavior |
|---------|-------------------|
| Preview generation fails | Error shown, metadata still displayed if available |
| Codec not supported for preview | Message explaining preview unavailable |

#### Hard Failures

| Failure | Why It's a Contract Violation |
|---------|-------------------------------|
| Job created without user action | Violated preview-only intent |
| Source metadata wrong | Incorrect information displayed |
| Player shows different file | Wrong source loaded |
| Application crashes on preview | Stability failure |

---

### INTENT_003 — Backend Failure Feedback

#### Human Goal

> "I should understand why a job cannot start or why it failed."

When something goes wrong, the user must receive clear, actionable feedback. Failures must never be silent or ambiguous.

#### Preconditions

- Application is running
- User has performed an action that results in failure

#### Action Sequence

| Step | Action | Actor |
|------|--------|-------|
| 1 | `user_performs_action` | User |
| 2 | `system_encounters_failure` | System |
| 3 | `system_displays_error` | System |
| 4 | `user_reads_error` | User |
| 5 | `user_takes_corrective_action` (optional) | User |

#### Expected State Transitions

```
<any_state> → error_displayed → <user_acknowledged_or_recovered>
```

Errors do not change the underlying state machine — they overlay it with visible feedback.

#### Required UI Evidence

| Scenario | Evidence |
|----------|----------|
| Source load failure | Error message visible near source selection |
| Job creation blocked | Error explaining why (e.g., "No source loaded") |
| Job execution failure | Status shows "Failed" with reason |
| Backend unreachable | Connection error visible, not silent timeout |
| Validation failure | Specific field or setting highlighted |

#### Error Message Requirements

| Requirement | Description |
|-------------|-------------|
| Visible | Error must not auto-dismiss without user action |
| Specific | Error must name the problem, not generic "Something went wrong" |
| Actionable | Error should suggest what user can do (if applicable) |
| Persistent | Error must remain visible until acknowledged or resolved |
| Logged | Error must be captured in job log for post-mortem |

#### Acceptable Failures

| Failure | Expected Behavior |
|---------|-------------------|
| Network timeout | Retry prompt or manual retry available |
| Transient backend error | Error shown, retry possible |

#### Hard Failures

| Failure | Why It's a Contract Violation |
|---------|-------------------------------|
| Error occurs with no UI feedback | User cannot diagnose |
| Error message is generic/unhelpful | User cannot take action |
| Error auto-dismisses | User may miss it |
| UI shows success but logs show failure | System lied |
| Error blocks UI without explanation | User is stuck |

---

### INTENT_004 — Cancel Running Job

#### Human Goal

> "I want to stop a job that is currently processing."

User realizes they made a mistake or no longer need the output, and wants to cancel the in-progress work.

#### Preconditions

- Application is running
- At least one job is in `job_running` state

#### Action Sequence

| Step | Action | Actor |
|------|--------|-------|
| 1 | `user_locates_running_job` | User |
| 2 | `user_requests_cancel` | User |
| 3 | `system_stops_job` | System |
| 4 | `job_cancelled` | System |

#### Expected State Transitions

```
job_running → cancelling → job_cancelled
```

| From State | To State | Trigger |
|------------|----------|---------|
| `job_running` | `cancelling` | User clicks cancel |
| `cancelling` | `job_cancelled` | System confirms stop |

#### Required UI Evidence

| State | Evidence |
|-------|----------|
| `job_running` | Cancel button/action visible |
| `cancelling` | Cancellation in progress indicator |
| `job_cancelled` | Status shows "Cancelled" |
| `job_cancelled` | Partial output cleaned or clearly marked |

#### Acceptable Failures

| Failure | Expected Behavior |
|---------|-------------------|
| Cancel takes time | Cancellation indicator shown during wait |
| Partial output remains | Clearly marked as incomplete |

#### Hard Failures

| Failure | Why It's a Contract Violation |
|---------|-------------------------------|
| Cancel button missing during job | User cannot stop job |
| Job continues after cancel acknowledged | System ignored user |
| Status shows "Cancelled" but job still runs | UI lied |
| Partial output unmarked and appears complete | Corrupted output |

---

### INTENT_005 — Queue Multiple Jobs

#### Human Goal

> "I want to queue multiple files for processing and have them run sequentially."

User has several files to process and wants to set them up without waiting for each to complete.

#### Preconditions

- Application is running
- User has multiple valid video files

#### Action Sequence

| Step | Action | Actor |
|------|--------|-------|
| 1 | `user_selects_source_file` | User |
| 2 | `user_creates_job` | User |
| 3 | Repeat steps 1-2 for additional files | User |
| 4 | `system_processes_queue` | System |
| 5 | `all_jobs_complete` | System |

#### Expected State Transitions

```
idle → (source_loaded → job_queued)* → queue_processing → all_complete
```

Jobs transition individually while queue state is maintained.

#### Required UI Evidence

| State | Evidence |
|-------|----------|
| Queue populated | All queued jobs visible in job list |
| Queue processing | Current job shows progress, others show "Queued" |
| Individual completion | Completed jobs show success/failure status |
| All complete | Clear indication queue is finished |

#### Acceptable Failures

| Failure | Expected Behavior |
|---------|-------------------|
| One job fails | Other jobs continue, failed job marked |
| Source rejected | Error shown, user can continue with other files |

#### Hard Failures

| Failure | Why It's a Contract Violation |
|---------|-------------------------------|
| Queue stops on single failure | Cascade failure unacceptable |
| Job order changes unexpectedly | Unpredictable behavior |
| Jobs disappear from queue | Lost work |
| Completed jobs not distinguishable | User cannot verify |

---

## Execution QC Intents

> **These intents validate backend job execution, not UI workflow.**
> They run headless (no Electron, no Playwright) and require real FFmpeg.

---

### INTENT_006 — Execute Job Headless (Backend Only) — Execution QC

#### Human Goal

> "I want to verify that a queued job executes correctly and produces valid output."

This intent validates the **execution pipeline** — FFmpeg invocation, progress tracking, output generation, and job completion. It does NOT test UI.

> ⚠️ **CONTRACT BOUNDARY**: This intent starts where UI QC ends. It assumes a job is already queued.

#### Preconditions

- Job is already queued (via API or previous INTENT_001 run)
- FFmpeg is available and functional
- Sufficient disk space for output
- Test media file is valid and accessible

#### Execution Environment

| Aspect | Value |
|--------|-------|
| Electron | ❌ Not used |
| Playwright | ❌ Not used |
| UI | ❌ No UI interaction |
| Backend | ✅ Direct API/CLI invocation |
| FFmpeg | ✅ Required |

#### Action Sequence

| Step | Action | Actor | QC Scope |
|------|--------|-------|----------|
| 1 | `backend_starts_job` | System | Execution QC |
| 2 | `system_processes_job` | System | Execution QC |
| 3 | `job_completes` | System | Execution QC |
| 4 | `output_validated` | System | Execution QC |

#### Expected Outcomes

| Outcome | Validation |
|---------|------------|
| Job runs | FFmpeg process started |
| Progress reported | Progress events emitted |
| Output exists | Output file created at expected path |
| Output valid | Output file is playable/valid media |
| Job marked complete | Job status = "complete" |

#### Acceptable Failures

| Failure | Expected Behavior |
|---------|-------------------|
| Source file corrupt | Job fails with clear error |
| Disk full | Job fails with explicit error, partial output cleaned |
| FFmpeg timeout | Job fails with timeout error |

#### Hard Failures

| Failure | Why It's a Contract Violation |
|---------|-------------------------------|
| Job hangs indefinitely | No timeout/recovery |
| Output file missing on success | System lied about completion |
| Output file corrupt on success | Validation not performed |
| Progress never reported | No observability |
| Error swallowed silently | No error propagation |

#### Execution Evidence Schema

Execution QC validates these evidence requirements:

| Evidence | Type | Requirement |
|----------|------|-------------|
| `output_exists` | boolean | Output file was created |
| `output_size_bytes` | number | File size > 0 |
| `output_duration_seconds` | number | Media duration > 0 |
| `exit_code` | number | FFmpeg exit code = 0 |
| `error_propagated` | boolean | Errors surfaced correctly |

#### Invocation

```bash
# Run execution QC with default fixture
node scripts/qc/run_execution_qc.mjs

# Run with specific fixture
node scripts/qc/run_execution_qc.mjs --fixture single_proxy

# Output result to JSON
node scripts/qc/run_execution_qc.mjs --output /tmp/exec_qc_result.json
```

#### Available Fixtures

| Fixture | Description |
|---------|-------------|
| `single_proxy` | Generate a single ProRes proxy from test media |

---

## Usability QC Intents

> **These intents validate static layout and usability issues, not workflow.**
> They perform NO file selection, NO backend calls, and NO job creation.

---

### INTENT_010 — Basic Usability & Layout Sanity — Usability QC

#### Human Goal

> "I want to verify the app has no obvious layout bugs at standard resolution."

This intent validates **static usability** — layout issues that would frustrate users regardless of workflow. It performs NO file selection, NO backend calls, and NO job creation.

> ⚠️ **SCOPE BOUNDARY**: This intent validates layout only. It does not test any workflow or backend behavior.

#### Preconditions

- Application is running and idle
- Window geometry is 1440x900 (standard QC resolution)
- No source file loaded
- No backend interaction required

#### Execution Environment

| Aspect | Value |
|--------|-------|
| Electron | ✅ Required |
| Playwright | ✅ Required |
| Backend | ❌ Not used |
| File Selection | ❌ Not used |
| Job Creation | ❌ Not used |

#### Checks Performed

| Check | Description | Failure Condition |
|-------|-------------|-------------------|
| No duplicate scrollbars in left panel | Nested scrollable containers create double scrollbars | >1 nested scrollable element with overflow-y: scroll/auto |
| App window is resizable | Window should allow user resize unless explicitly locked | BrowserWindow.isResizable() returns false |
| No buttons visually clipped at 1440x900 | All buttons must be fully visible | Any button bounding box extends beyond viewport |
| No horizontal scrollbars in main panels | Horizontal scroll indicates layout overflow | Any main panel has scrollWidth > clientWidth |

#### Action Sequence

| Step | Action | Actor |
|------|--------|-------|
| 1 | `launch_electron` | System |
| 2 | `wait_for_app_ready` | System |
| 3 | `check_no_duplicate_scrollbars` | QC |
| 4 | `check_window_resizable` | QC |
| 5 | `check_no_clipped_buttons` | QC |
| 6 | `check_no_horizontal_scrollbars` | QC |

#### Required Evidence

| Check | Evidence |
|-------|----------|
| Each check | Screenshot captured at time of check |
| Result | JSON result file with pass/fail per check |

#### Fail-Fast Behavior

This intent uses **fail-fast** behavior:
- If ANY check fails, mark VERIFIED_NOT_OK immediately
- Capture screenshot at failure point
- Stop remaining checks
- Exit with failure

#### Hard Failures

| Failure | Why It's a Contract Violation |
|---------|-------------------------------|
| Duplicate scrollbars in left panel | Creates confusing nested scroll behavior |
| Window not resizable | Restricts user control over workspace |
| Buttons clipped at 1440x900 | Users cannot see or click essential controls |
| Horizontal scrollbars in main panels | Indicates content overflow / broken layout |

#### Invocation

```bash
# Run usability QC
cd qa/verify/ui/visual_regression
npx playwright test intent_010_usability.spec.ts

# With headed mode for debugging
npx playwright test intent_010_usability.spec.ts --headed
```

---

## Cross-Reference

This document is referenced by:

- [QA.md](./QA.md) — QA principles derive from workflow intents
- [UI_QC_LOOP.md](./UI_QC_LOOP.md) — Visual verification validates intent fulfillment
- [UI_QC_BEHAVIOUR_SPEC.md](./UI_QC_BEHAVIOUR_SPEC.md) — Behavior specs implement intents
- [UI_QC_WORKFLOW.md](./UI_QC_WORKFLOW.md) — QC workflow tests intents

---

## Governance

| Aspect | Rule |
|--------|------|
| Authority | This document is authoritative for expected behavior |
| Changes | New intents require justification and review |
| Automation | All QC automation must trace to an intent |
| Disputes | If automation passes but intent fails, automation is wrong |
