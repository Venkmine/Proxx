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

## 10. Test Media Policy (Repo Safety)

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

**End of document**

---
