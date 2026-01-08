# AWAIRE PROXY — QA PRINCIPLES

**Status:** Active
**Purpose:** Define how correctness, trust, and failure are verified
**Rule:** QA exists to prove the system does not lie.

---

## 1. What QA Means in Proxy

QA in Awaire Proxy is not about polish, coverage percentages, or release gates.

QA exists to answer three questions:

1. **Did the system do what the user explicitly asked?**
2. **Can the user prove what happened after the fact?**
3. **Did anything happen without intent or visibility?**

If any answer is unclear, QA has failed.

---

## 2. Definition of Success

### Clip-Level Success

A clip is successful if:

* An output file exists
* The output file is non-zero size
* The output matches the declared job settings
* Any deviations are explicitly logged

No subjective judgement. No “looks fine”.

---

### Job-Level Success

A job is successful if:

* All clips were attempted
* Failures did not block other clips
* Errors are visible, persistent, and inspectable
* No clip was skipped silently

Partial success is expected and acceptable.

---

## 3. Failure Is a First-Class Outcome

Proxy assumes failure is normal.

Examples:

* Corrupt media
* Unsupported codecs
* Disk full
* Permission errors
* Interrupted execution

Failures must be:

* Detectable from logs and filesystem alone
* Re-runnable without manual cleanup
* Impossible to miss in the UI

A hidden failure is worse than a loud one.

---

## 4. UI Truthfulness as a QA Surface

The UI is part of the QA surface.

QA explicitly checks that:

* The preview does not imply precision it cannot guarantee
* Spatial edits in the preview are the only source of spatial truth
* Mode restrictions are enforced, not advisory
* Disabled controls are genuinely inert
* Errors do not auto-dismiss or disappear

A UI that *appears* to work but lies is a QA failure.

---

### Delivery as Single Source of Truth

**The Delivery panel is the singular, authoritative source for all output delivery configuration.**

This is an architectural truth, not a suggestion:

* **Delivery configuration exists in exactly one UI location**
* **Sources define what to process**
* **Delivery defines where and how output is delivered**
* **Queue orchestrates execution**

The mental model is:

```
Sources → Delivery → Queue
```

Any UI element that appears to control output delivery but exists outside the Delivery panel is a **QA failure**.

#### QA Enforcement

Duplicate or ambiguous delivery controls are violations:

* ❌ **Multiple UI locations claiming to control output paths**
* ❌ **Settings that override Delivery configuration**
* ❌ **Implicit delivery behavior that bypasses Delivery intent**
* ❌ **Hidden delivery state not visible in Delivery panel**

This rule exists to prevent:
- Users configuring delivery in multiple places with conflicting intent
- Silent delivery behavior that contradicts explicit Delivery settings
- State fragmentation where "output" means different things in different contexts

#### Why This Matters

The previous "Output" mental model created ambiguity:
- Was "output" a source attribute, job attribute, or delivery attribute?
- Could multiple UI panels claim authority over output configuration?
- How would conflicts between competing output controls resolve?

The **Delivery single-source-of-truth** model eliminates ambiguity:
- Sources have NO delivery authority
- Delivery has COMPLETE delivery authority
- No other panel can override Delivery intent

This is a **guardrail**, not a feature. It prevents architectural regression.

---

### Intent-Driven QC

**QC is intent-driven, not component-driven.**

All QC validation derives from explicit human workflow intents defined in [UI_WORKFLOW_INTENTS.md](./UI_WORKFLOW_INTENTS.md). This ensures:
- QC validates what users actually expect, not what UI happens to show
- Automation traces to documented intents, not inferred behavior
- Disputes resolve by consulting intent definitions, not UI structure

### Automated UI QC

UI correctness for automated QC is defined in [UI_QC_BEHAVIOUR_SPEC.md](./UI_QC_BEHAVIOUR_SPEC.md) and [UI_QC_WORKFLOW.md](./UI_QC_WORKFLOW.md). These documents are authoritative for QC purposes.

> **Note:** QC now enforces **minimum usability requirements**, not just structural presence.
> Features must be functionally useful in their expected states, not merely visible.

### INTENT_010 — Non-negotiable Usability Gate

**UI changes MUST pass INTENT_010 before merge.**

INTENT_010 validates fundamental layout and usability requirements that affect all users:

| Check | Description |
|-------|-------------|
| No duplicate scrollbars | Left panel must have at most one scrollable container |
| Window resizable | Users must be able to resize the application window |
| No clipped buttons | All buttons must be fully visible at 1440×900 |
| No horizontal scrollbars | Main panels must not overflow horizontally |

#### Exit Code Mapping

| Severity | Exit Code | Meaning |
|----------|-----------|---------|
| PASS | 0 | All usability checks passed |
| HIGH | 1 | Blocking failure — UI is broken, cannot merge |
| MEDIUM | 2 | Warning — layout issue detected, fix recommended |

#### HIGH Severity Conditions

A failure is marked HIGH severity when:
- Window is non-resizable AND buttons are clipped
- Users have no workaround (cannot resize to see clipped elements)

#### Regression Prevention (Baseline Discipline)

INTENT_010 maintains **metric baselines** to detect regressions even when checks still pass:

- Baselines stored in `qa/qc_baselines/intent_010/`
- Metric drift is flagged in reports
- Update baselines with: `INTENT_010_UPDATE_BASELINE=1 npx playwright test intent_010_usability.spec.ts`

#### Property-Based Invariants

Beyond point checks, INTENT_010 validates **architectural invariants**:

| Invariant | Description |
|-----------|-------------|
| PANELS_NEVER_CLIP_BUTTONS | Buttons must stay within parent panel bounds |
| PANELS_NEVER_REQUIRE_HORIZONTAL_SCROLL | No panel should overflow horizontally |
| WINDOW_RESIZABLE_UNLESS_E2E | Window must be resizable (except in E2E mode) |
| NESTED_SCROLLABLES_LIMIT | Max 1 scrollable container per panel |

These are expressed as properties, not hardcoded selectors, making them resilient to DOM changes.

#### Human Confirmation Mode

For ambiguous failures, enable human-in-the-loop confirmation:

```bash
INTENT_010_HUMAN_CONFIRM=1 npx playwright test intent_010_usability.spec.ts
```

When enabled:
- Failures pause for human YES/NO review
- Human responses are stored alongside automated results
- ACCEPT overrides allow continuing despite automated failures
- REJECT confirms the automated failure

#### Enforcement

1. **Pre-merge gate**: INTENT_010 runs in CI and blocks merge on HIGH severity
2. **Fail-fast**: Only ONE failure is reported per run (fix sequentially)
3. **Human-readable reports**: See `artifacts/ui/visual/<run>/intent_010_usability_report.md`
4. **Consolidated summary**: See `artifacts/ui/visual/<run>/QC_SUMMARY.md`

#### Running Locally

```bash
cd qa/verify/ui/visual_regression
npx playwright test intent_010_usability.spec.ts

# With baseline update
INTENT_010_UPDATE_BASELINE=1 npx playwright test intent_010_usability.spec.ts

# With human confirmation
INTENT_010_HUMAN_CONFIRM=1 npx playwright test intent_010_usability.spec.ts
```

### INTENT_020 — Accessibility & Interaction Sanity

**UI changes affecting interactive elements MUST pass INTENT_020 before merge.**

INTENT_020 validates accessibility and interaction properties that ensure all users can effectively interact with the UI:

| Check | Severity | Description |
|-------|----------|-------------|
| Keyboard reachability | HIGH | All interactive elements must be reachable via Tab/Shift+Tab |
| Focus indicators visible | MEDIUM | Focus indicators must be visible (no outline:none without replacement) |
| Dead-click detection | HIGH | No visible button/link should be unresponsive to clicks |
| Invisible interactive elements | MEDIUM | No interactive elements with opacity:0 or zero size |
| Cursor/hitbox match | MEDIUM | Clickable area must match visible bounds |
| Focus trap validation | MEDIUM | Modals must contain focusable elements |

#### Property-Based Accessibility Invariants

INTENT_020 validates architectural invariants using semantic checks:

| Invariant | Description |
|-----------|-------------|
| KEYBOARD_REACHABILITY | Every visible interactive element has tabIndex >= 0 or is naturally focusable |
| FOCUS_INDICATORS_VISIBLE | Every focusable element has outline or alternative focus indicator |
| DEAD_CLICK_DETECTION | Every button/link has click handler or href |
| INVISIBLE_INTERACTIVE_DETECTION | No element with pointer-events has opacity:0 or zero size |
| CURSOR_HITBOX_MATCH | Clickable area within 10% of visual bounds |
| FOCUS_TRAP_VALIDATION | Modals contain focusable descendants |

These invariants are:
- **Deterministic**: Same state produces same result
- **CI-safe**: No human interaction required
- **Fail-fast**: First violation terminates with screenshot
- **Semantic-based**: Use ARIA roles and properties, not brittle selectors

#### Exit Code Mapping

| Severity | Exit Code | Meaning |
|----------|-----------|---------|
| PASS | 0 | All accessibility checks passed |
| HIGH | 1 | Blocking failure — keyboard or interaction broken |
| MEDIUM | 2 | Warning — accessibility issue detected, fix recommended |

#### HIGH Severity Conditions

A failure is marked HIGH severity when:
- Interactive elements are not keyboard reachable (blocks keyboard-only users)
- Visible buttons have no click handler (broken functionality)

#### Running Locally

```bash
cd qa/verify/ui/visual_regression
npx playwright test intent_020_accessibility.spec.ts
```

Results are stored in:
- `artifacts/ui/visual/<run>/intent_020_result.json` (structured data)
- `artifacts/ui/visual/<run>/intent_020_report.md` (human-readable report)

#### Integration with QC Loop

INTENT_020 is integrated into `run_qc_loop.mjs` Phase 4:
- Runs after INTENT_010 (usability gate)
- Takes precedence over other QC decisions
- Produces exit code based on severity
- Report included in QC_SUMMARY.md

### INTENT_030 — State & Store Integrity

**UI changes affecting state management MUST pass INTENT_030 before merge.**

INTENT_030 is a structural guardrail that prevents state fragmentation bugs by enforcing architectural invariants:

| Check | Severity | Description |
|-------|----------|-------------|
| Single ownership | HIGH | Each UI domain reads from ONE store only |
| No dual writes | MEDIUM | Single action must not mutate multiple stores |
| Deprecated store detection | HIGH | No writes to known deprecated stores |
| State transition visibility | MEDIUM | Every action causes logged transition or measurable delta |
| Read-after-write consistency | MEDIUM | UI indicators reflect store state within same tick/render |

#### Property-Based State Invariants

INTENT_030 validates store integrity using runtime inspection:

| UI QC (INTENT_030) | State integrity check results |
| Invariant | Description |
|-----------|-------------|
| SINGLE_OWNERSHIP | Sources read from sourceSelectionStore, presets from presetStore, etc. |
| NO_DUAL_WRITES | No action mutates both sourceSelection AND v2Mode stores |
| DEPRECATED_STORE_DETECTION | isBurnInsEditorOpen not used, no localStorage pollution |
| STATE_TRANSITION_VISIBILITY | State changes are explicit, not silent background updates |
| READ_AFTER_WRITE_CONSISTENCY | Source count in store matches DOM display immediately |

These invariants prevent "UI looks right but state is wrong" bugs.

#### Store Diagnostics

INTENT_030 exposes stores for inspection via `window.__ZUSTAND_STORES__` (QC mode only):
- Reads current store state without modification
- Compares store state with DOM rendering
- Detects store/UI consistency violations
- Identifies deprecated patterns

#### Exit Code Mapping

| Severity | Exit Code | Meaning |
|----------|-----------|---------|
| PASS | 0 | All state integrity checks passed |
| HIGH | 1 | Blocking failure — dual-write or deprecated store usage |
| MEDIUM | 2 | Warning — consistency issue detected |

#### HIGH Severity Conditions

A failure is marked HIGH severity when:
- Multiple stores own same UI domain (single ownership violation)
- Writes to deprecated stores (isBurnInsEditorOpen, localStorage state)
- These patterns reintroduce the state fragmentation bugs we've already fixed

#### Running Locally

```bash
cd qa/verify/ui/visual_regression
npx playwright test intent_030_state_integrity.spec.ts
```

Results are stored in:
- `artifacts/ui/visual/<run>/intent_030_result.json` (structured data)
- `artifacts/ui/visual/<run>/intent_030_report.md` (human-readable report)

#### Integration with QC Loop

INTENT_030 is integrated into `run_qc_loop.mjs` Phase 4:
- Runs after INTENT_020 (accessibility gate)
- Takes precedence over other QC decisions
- Produces exit code based on severity
- Report included in QC_SUMMARY.md

#### Why This Matters

Recent bugs were caused by:
- UI reading from multiple sources (dual ownership)
- Background state changes without transitions (silent mutations)
- Deprecated store fields still being written (isBurnInsEditorOpen)

INTENT_030 makes future UI expansion (Settings panel, Watch Folders, etc.) safe by ensuring state remains single-source-of-truth.

### INTENT_040 — Settings Panel Sanity

**Settings panel reintroduction MUST pass INTENT_040 before merge.**

INTENT_040 is a structural safety gate that validates the Settings panel can be safely reintroduced without breaking existing functionality. This is about **structural safety**, NOT feature correctness.

| Check | Severity | Description |
|-------|----------|-------------|
| Render & toggle | HIGH | Settings panel can be opened and closed via UI control |
| Layout safety | HIGH | No clipped buttons, no overflow, no scrollbar conflicts while open |
| Accessibility safety | HIGH | Keyboard can open/close, focus management works |
| State integrity | HIGH | No deprecated store writes, no unintended mutations |
| Isolation | HIGH | No side effects on job/queue/source state |

#### Purpose: Controlled Reintroduction

The Settings panel was temporarily removed during Phase F layout simplification. INTENT_040 ensures it can be **safely brought back** without:
- Breaking the INTENT_010 layout invariants
- Violating INTENT_020 accessibility requirements
- Causing INTENT_030 state integrity violations
- Triggering unexpected side effects in other UI domains

#### What INTENT_040 Does NOT Check

This is NOT a feature correctness test:
- ❌ Does NOT validate individual settings behavior
- ❌ Does NOT test settings persistence
- ❌ Does NOT verify codec/container selections work
- ❌ Does NOT check settings application to jobs

Those checks come in **INTENT_041 — Settings State Correctness** (future work).

#### Property-Based Safety Invariants

INTENT_040 validates structural integrity using runtime checks:

| Invariant | Description |
|-----------|-------------|
| SETTINGS_RENDER_AND_TOGGLE | Panel element exists, toggle control works, focus managed |
| SETTINGS_LAYOUT_SAFETY | Reuses INTENT_010 checks (no overflow, no nested scrollbars) |
| SETTINGS_ACCESSIBILITY | Reuses INTENT_020 checks (keyboard nav, focus indicators) |
| SETTINGS_STATE_INTEGRITY | Reuses INTENT_030 checks (no store violations) |
| SETTINGS_ISOLATION | Opening Settings does NOT trigger job fetches, preview loads, or state mutations |

These invariants are:
- **Reusable**: Leverage existing INTENT_010/020/030 checks
- **Deterministic**: Same UI state produces same result
- **CI-safe**: No human interaction required
- **Fail-fast**: First violation terminates with screenshot

#### Exit Code Mapping

| Severity | Exit Code | Meaning |
|----------|-----------|---------|
| PASS | 0 | Settings panel is structurally safe |
| HIGH | 1 | Blocking failure — panel breaks layout/accessibility/state |
| MEDIUM | 2 | Warning — minor issue detected |

#### HIGH Severity Conditions

A failure is marked HIGH severity when:
- Settings toggle is missing or non-functional (users cannot access)
- Opening Settings breaks layout (buttons clipped, horizontal overflow)
- Opening Settings violates state integrity (dual-writes, deprecated stores)
- Opening Settings is not keyboard accessible (blocks keyboard users)
- Opening Settings causes job/queue mutations (isolation violation)

#### Running Locally

```bash
cd qa/verify/ui/visual_regression
npx playwright test intent_040_settings_sanity.spec.ts
```

Results are stored in:
- `artifacts/ui/visual/<run>/intent_040_result.json` (structured data)
- `artifacts/ui/visual/<run>/intent_040_report.md` (human-readable report)

#### Integration with QC Loop

INTENT_040 is integrated into `run_qc_loop.mjs` Phase 4:
- Runs after INTENT_030 (state integrity gate)
- Takes precedence over other QC decisions
- Produces exit code based on severity
- Report included in QC_SUMMARY.md

#### Implementation Requirements

For INTENT_040 to pass, the Settings panel implementation MUST:

1. **Have a toggle control**: `[data-testid="settings-toggle"]`
2. **Have a panel element**: `[data-testid="settings-panel"]`
3. **Be keyboard accessible**: Toggle has tabIndex >= 0 or is a button
4. **Manage focus**: Focus enters/exits panel appropriately
5. **Not break layout**: Pass INTENT_010 checks while open
6. **Not break accessibility**: Pass INTENT_020 checks while open
7. **Not violate state**: Pass INTENT_030 checks while open
8. **Be isolated**: No network calls, no DOM mutations outside Settings

#### Next Steps After INTENT_040

Once INTENT_040 passes:
1. Settings panel is officially "back" in the UI
2. Feature correctness can be validated in **INTENT_041**
3. Settings persistence can be added
4. Preset loading/saving can be wired up

### Action-Scoped QC

QC now reasons **per user action**, not just per screenshot. For each meaningful action (e.g., clicking "Create Job"):
- Backend signals are captured alongside visual state
- Screenshots are contextual evidence, not absolute verdicts
- Backend + UI correlation is required for judgement

See [QC_ACTION_TRACE.md](./QC_ACTION_TRACE.md) for the action trace schema.

### QC_SUMMARY.md — Consolidated Reporting

Every QC run produces a **QC_SUMMARY.md** that consolidates all results:

| Section | Contents |
|---------|----------|
| Executive Summary | SHIP / NO-SHIP / REVIEW recommendation |
| UI QC (INTENT_010) | Usability check results |
| UI QC (INTENT_020) | Accessibility check results |
| Baseline Regressions | Metric drift from baselines |
| Property Invariants | Invariant violations |
| Human Confirmations | Human review decisions |
| Playwright Execution | Test pass/fail counts |
| GLM Visual Analysis | AI-based visual verification (if enabled) |

The summary provides:
- **Blockers**: Issues that prevent shipping (exit code 1)
- **Warnings**: Non-blocking issues to review (exit code 2)
- **SHIP recommendation** when all checks pass

Generate manually:
```bash
node scripts/qc/generate_qc_summary.mjs --artifact-path <path>
```

### UI Visual Verification (MANDATORY)

**Any UI change requires Electron screenshots as evidence.**

Code-level reasoning is insufficient. A progress bar may exist in the DOM with correct CSS but still be invisible due to:
- Z-index conflicts
- Parent overflow clipping
- Incorrect positioning
- Insufficient contrast

**See [UI_VISUAL_VERIFICATION.md](./UI_VISUAL_VERIFICATION.md) for the complete policy.**

Key requirements:
* Screenshots must be captured from Electron (not browser)
* Screenshots must clearly show the claimed change
* Screenshots must be stored in `artifacts/ui/visual/`
* Missing screenshots = failed verification

---

## 5. Invariants as QA Mechanisms

Invariants are runtime assertions that protect architectural truths.

They:

* Detect invalid state transitions
* Prevent silent corruption
* Surface violations immediately
* Never auto-correct or guess intent

An invariant firing is not a crash.
It is a QA success revealing a trust breach.

---

## 6. Regression Philosophy

Every trust-breaking bug must result in:

* A regression test **or**
* A new invariant **or**
* Both

If a bug can reoccur silently, QA has failed to learn.

---

## 7. What QA Explicitly Does Not Do

QA does not:

* Judge creative intent
* Perform QC analysis
* Validate aesthetic outcomes
* “Fix” user mistakes
* Optimise performance

Those belong to other systems, later, if at all.

---

## 8. Verification Scope (Current Reality)

QA currently verifies:

* Job creation integrity
* Snapshot immutability
* Preview-to-state consistency
* Invariant enforcement
* FFmpeg execution success/failure reporting

QA does **not** yet verify:

* Watch folder behaviour
* Delivery specs
* Broadcast compliance
* AI-derived analysis

Those systems do not exist yet and are out of scope.

---

## 9. QA Posture

QA in Proxy is intentionally conservative.

If something is ambiguous, it is treated as incorrect.
If something is implicit, it is treated as suspicious.
If something is clever, it is treated as a risk.

This is not pessimism. It is professional paranoia.

---

## 10. Electron E2E as Single Source of Truth

### Rule

**Electron E2E tests are the single source of truth for "does Forge work?"**

The only definition of "working" is:

```
Electron app boots →
User presses buttons →
Job created →
Job queued →
Job executed →
Real output written
```

Anything else is noise.

### Enforcement

1. **Electron E2E tests MUST run BEFORE all other tests in CI**
   - If Electron cannot launch → CI fails immediately
   - Backend unit tests wait for E2E to pass

2. **Browser-only Playwright runs are FORBIDDEN for golden paths**
   - All golden path tests use `_electron` API
   - Tests that connect to Vite/localhost are rejected

3. **Guards prevent accidental browser testing:**
   - `global-setup.ts` validates E2E_TEST=true
   - `electron-guard.ts` validates window.__PRELOAD_RAN__
   - Tests fail if E2E_TARGET=browser/vite

### Sacred Test

The `sacred_meta_test.spec.ts` answers one question:

> "If a junior editor installs this app, can they run a job?"

This test:
- Runs FIRST in CI
- Launches real Electron
- Clicks real buttons
- Creates real jobs
- Produces real output
- Is allowed to be slow
- Is NOT allowed to be flaky

### QC_ACTION_TRACE

Every golden path test captures a QC_ACTION_TRACE artifact containing:

```
SELECT_SOURCE
CREATE_JOB
ADD_TO_QUEUE
EXECUTION_STARTED
EXECUTION_COMPLETED
```

If any step is missing → test fails.
This guarantees semantic correctness, not just visuals.

#### EXECUTION_STARTED Emission (NORMATIVE)

EXECUTION_STARTED **MUST** be emitted at the exact moment FFmpeg execution begins:

- Backend emits: `[QC_TRACE] EXECUTION_STARTED job_id=... source=... timestamp=...`
- This log line is written BEFORE `subprocess.run()` is called
- It is NOT inferred, NOT post-hoc, NOT optional
- See: `backend/headless_execute.py` line ~1075

The frontend test observes this via:
1. UI status indicators ("Running", "Encoding")
2. Job status elements (`[data-testid="job-status"]`)
3. Fast executions: EXECUTION_STARTED is recorded even if transient

This ensures the trace reflects reality, not lies.

### Buttons Must Do Something

Every clickable control in the Queue / Execution flow must cause:
- A visible UI change, OR
- A backend request, OR
- A state transition

If a button click produces no observable effect → test fails.

This prevents:
- Dead buttons
- Placeholder UI
- "Wired later" lies

---

## 11. Test Media Policy (Repo Safety)

### Rule

**Real media files MUST NEVER be committed to the repository.**

### Why

Real production media files:
- Are too large for Git (multi-GB files destroy clone/fetch performance)
- Contain proprietary content (legal/licensing risk)
- Are unnecessary (tests use synthetic fixtures)

### Enforcement

The repository enforces this rule at three layers:

1. **`.gitignore` blocks all common media extensions**
   - Video: `.mxf`, `.mov`, `.mp4`, `.r3d`, `.braw`, `.ari`, etc.
   - Audio: `.wav`, `.aif`, `.flac`, `.mp3`, etc.
   - RAW: `.dng`, `.dpx`, `.exr`, etc.

2. **Pre-commit hook validates file sizes**
   - Blocks any file >10MB from being staged
   - Forces explicit review of large files

3. **QA fixtures are generated at runtime**
   - `qa/fixtures/` contains ONLY generated synthetic media
   - Fixtures are excluded via `.gitignore`
   - Tests generate fixtures on-demand using FFmpeg

### If You Need Test Media

**Option 1: Synthetic Fixtures (Preferred)**
- Use `qa/fixtures/generate_fixture.py` to create test media
- Fixtures are generated at test runtime
- No manual media management required

**Option 2: External Media**
- Store real media outside the repo
- Reference via symlinks (symlinks ARE committed, targets are not)
- Document external media requirements in test docstrings
- Use environment variables for media paths

**Option 3: Small Samples**
- If absolutely necessary, commit tiny samples (<1MB)
- MUST be explicitly reviewed and approved
- MUST be synthetic or cleared for licensing

### What to Do If a Large File Was Committed

If a large media file was accidentally committed:

1. **Remove from Git history immediately:**
   ```bash
   git rm --cached path/to/large_file.mxf
   git commit --amend
   git push --force-with-lease
   ```

2. **Verify `.gitignore` blocks the extension**

3. **If already pushed to remote:**
   - Notify team before force-pushing
   - Consider `git filter-repo` for deep history cleanup

### What Counts as "Media"

Blocked formats:
- **Video:** MXF, MOV, MP4, AVI, MKV, R3D, BRAW, ARI, ARRI, DNG, DPX, EXR
- **Audio:** WAV, AIF, AIFF, FLAC, M4A, AAC, MP3, OGG
- **Image sequences:** DPX, EXR, DNG (bulk image sequences)

Allowed formats:
- **Tiny samples:** <1MB, synthetic, approved
- **Metadata:** JSON, CSV, TXT, XML (media descriptors, not media itself)
- **Code:** Python, JS, Markdown, YAML, etc.

---

## 12. Regression Tests

### Rule

**Every trust-breaking bug that reaches production MUST result in a regression test.**

Regression tests are different from golden path tests:
- **Golden path tests** verify expected behavior works
- **Regression tests** verify fixed bugs stay fixed

### Current Regression Tests

| Test | Bug Fixed | Invariant Enforced |
|------|-----------|-------------------|
| `regression_fifo_job_id.spec.ts` | Infinite FIFO resubmission loop | Backend job_id is authoritative |

### FIFO Job ID Contract (regression_fifo_job_id.spec.ts)

**Bug:** Frontend used client-generated `job_id` for API calls after job creation, but backend generates its own ID. This caused infinite 404 "Job not found" loops.

**Fix:** Use `createResult.job_id` from backend response for all subsequent API calls.

**Invariant:**
```
Client JobSpec.job_id → Draft tracking ONLY
Backend createResult.job_id → ALL API calls post-creation
```

**Run:**
```bash
cd qa/e2e && E2E_TEST=true npx playwright test regression_fifo_job_id.spec.ts
```

**Validates:**
- ✅ Backend `job_id` is captured from create response
- ✅ No "Job not found" 404 errors occur
- ✅ Job submit attempts ≤ 2 (no infinite loop)
- ✅ Output file exists

See: [FIFO_QUEUE_IMPLEMENTATION.md](../FIFO_QUEUE_IMPLEMENTATION.md) for full technical details.

---

## 13. Phase 5: End-to-End Workflow Truth Enforcement

Phase 5 establishes **complete coverage, permanence, and regression prevention** for all core user workflows via real Electron UI execution.

### Workflow Matrix Coverage

| Workflow | Test File | Buttons Pressed | Output Verified |
|----------|-----------|-----------------|-----------------|
| WF-01: Single clip → proxy | `workflow_matrix.spec.ts` | select-files, create-job, add-to-queue | ✓ Output file exists, non-zero size |
| WF-02: Multiple clips → proxy | `workflow_matrix.spec.ts` | select-files (x2), create-job, add-to-queue | ✓ All outputs exist |
| WF-04: Invalid output path → blocked | `workflow_matrix.spec.ts` | select-files, set invalid path | ✓ Blocked, no output |
| WF-07: Queue > 1 job → FIFO | `workflow_matrix.spec.ts` | create-job (x2), add-to-queue | ✓ FIFO order verified |
| WF-08: Cancel running job | `workflow_matrix.spec.ts` | create-job, add-to-queue, cancel | ✓ Job cancelled state |
| WF-09: Delete queued job | `workflow_matrix.spec.ts` | create-job, delete | ✓ Job removed from queue |
| WF-10: Execution failure → visible | `workflow_matrix.spec.ts` | create invalid job | ✓ Error classified and visible |

### Button Coverage Audit

The `button_coverage_audit.spec.ts` test enforces **Zero Dead UI**:

- Scans all visible buttons in Electron UI
- Verifies each button either:
  - Emits a QC_ACTION_TRACE event, OR
  - Causes a backend request, OR
  - Changes visible UI state
- Reports:
  - **Active buttons**: Functional with observable effects
  - **Disabled with reason**: Intentionally disabled with documented reason
  - **Dead buttons**: No effect (requires fixing or removal)

### QC_ACTION_TRACE Invariants (NORMATIVE)

The following invariants are enforced in all E2E tests via `assertTraceInvariants()`:

1. **EXECUTION_COMPLETED requires EXECUTION_STARTED**
   - Cannot claim completion without starting
   - Violation: `TRACE_INVARIANT_VIOLATION`

2. **EXECUTION_STARTED must precede EXECUTION_COMPLETED**
   - Time travel is not allowed
   - Timestamps are authoritative

3. **Output file without EXECUTION_STARTED is a hard failure**
   - Files cannot appear without traced execution
   - Observability cannot be bypassed

4. **EXECUTION_STARTED without output is classified**
   - Allowed for failure cases
   - Must be visible and inspectable

### Lifecycle vs Reality Cross-Check

The `lifecycle_crosscheck.spec.ts` test enforces truth convergence:

| Lifecycle State | Filesystem Reality | Result |
|----------------|-------------------|--------|
| COMPLETE | Output exists, non-zero | ✓ Valid |
| COMPLETE | No output file | ✗ FAIL |
| COMPLETE | Output empty (0 bytes) | ✗ FAIL |
| FAILED | No output | ✓ Valid |
| FAILED | Partial output exists | ⚠ Warning |
| RUNNING | FFmpeg process active | ✓ Valid |
| RUNNING | No FFmpeg process | ⚠ Warning (timing) |

### QC Truth Guarantees

After Phase 5 implementation, the following guarantees are enforced:

1. **QC traces cannot lie**
   - EXECUTION_STARTED emitted at exact moment of FFmpeg launch
   - EXECUTION_COMPLETED emitted after FFmpeg exits
   - Events not inferred from UI text or post-hoc analysis

2. **Lifecycle cannot contradict filesystem**
   - COMPLETE state always has output file
   - Output file always has non-zero size
   - RUNNING state has active FFmpeg process

3. **Execution cannot be "inferred"**
   - Events emitted from backend, not UI observation
   - Timestamps are authoritative
   - Order is guaranteed: STARTED → COMPLETED

### CI Enforcement

1. **Electron E2E runs first** - Unit tests blocked until E2E passes
2. **Sacred test is mandatory** - CI fails if sacred test fails
3. **Artifacts uploaded** - QC_ACTION_TRACE JSON, execution timeline, output metadata
4. **Failed E2E blocks merge** - Green CI = "a human can run a job"

### Running Phase 5 Tests

```bash
# Sacred test only (minimum viable workflow)
make verify-sacred

# All 10 workflow tests
make verify-workflow-matrix

# Button coverage audit (zero dead UI)
make verify-button-audit

# Lifecycle truth crosscheck
make verify-lifecycle

# ALL Phase 5 tests
make verify-phase5
```

