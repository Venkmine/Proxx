# UI QC Loop

> Version: 1.1.0  
> Last Updated: 2026-01-04

## Overview

The UI QC Loop is a **reversible, closed-loop visual verification pipeline** where:
- **Sonnet/Opus** orchestrates execution and interprets results
- **GLM-4.6V** acts as the sole visual authority
- No UI claim is made without visual confirmation
- The loop can re-run after code changes with new questions

> **Note:** QC now enforces **minimum usability requirements**, not just structural presence.
> Features must be functionally useful in their expected states — idle branding where content is expected is a failure.

---

## Architectural Principle

```
╔═══════════════════════════════════════════════════════════════════╗
║                    ROLE SEPARATION (LOCKED)                        ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                    ║
║  SONNET / OPUS                      GLM-4.6V                       ║
║  ═════════════                      ════════                       ║
║  EXECUTOR + INTERPRETER             VISUAL WITNESS                 ║
║                                                                    ║
║  ✓ Runs tests                       ✓ Sees pixels                 ║
║  ✓ Captures screenshots             ✓ Answers questions           ║
║  ✓ Interprets GLM answers           ✓ Provides observations       ║
║  ✓ Makes pass/fail decisions                                      ║
║  ✓ Generates fix tasks              ✗ NO interpretation           ║
║                                     ✗ NO decision-making          ║
║  ✗ NEVER eyeballs UI directly       ✗ NO code context             ║
║                                                                    ║
║  NEITHER ROLE OVERLAPS                                             ║
╚═══════════════════════════════════════════════════════════════════╝
```

---

## The QC Loop

```
┌─────────────────────────────────────────────────────────────────────┐
│                          QC LOOP PHASES                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  PHASE 1                PHASE 2                PHASE 3               │
│  EXECUTION              VISUAL JUDGMENT        INTERPRETATION        │
│  ──────────             ──────────────         ─────────────         │
│  Run Electron           Send to GLM            Read GLM report       │
│  Run Playwright         Ask questions          Apply rules           │
│  Capture screenshots    Get answers            Classify:             │
│  Save artifacts         Save report            - VERIFIED_OK         │
│                                                - VERIFIED_NOT_OK     │
│       │                      │                 - QC_INVALID          │
│       ▼                      ▼                      │                │
│  artifacts/              glm_report.json            ▼                │
│  └── ui/visual/                              qc_interpretation.json  │
│      └── <timestamp>/                                                │
│          ├── *.png                                  │                │
│          └── execution_metadata.json                ▼                │
│                                                                      │
│                         PHASE 4: DECISION                            │
│                         ─────────────────                            │
│                                                                      │
│  ┌─────────────┐   ┌─────────────────┐   ┌───────────────┐          │
│  │ VERIFIED_OK │   │ VERIFIED_NOT_OK │   │  QC_INVALID   │          │
│  │ Exit 0      │   │ Exit 1          │   │  Exit 2       │          │
│  │ QC Pass     │   │ Generate fix    │   │  Re-run       │          │
│  │             │   │ tasks           │   │  required     │          │
│  └─────────────┘   └─────────────────┘   └───────────────┘          │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Intent-Driven QC

**QC is intent-driven, not component-driven.**

All visual verification derives from explicit human workflow intents defined in [UI_WORKFLOW_INTENTS.md](./UI_WORKFLOW_INTENTS.md). The QC loop validates that:
- Each documented intent can be fulfilled end-to-end
- UI evidence matches intent requirements
- Failures are classified per intent's acceptable/hard failure definitions

---

## UI QC vs Execution QC

**UI QC and Execution QC are formally separated.**

```
┌─────────────────────────────────────────────────────────────────────┐
│                     QC SCOPE BOUNDARY                                │
├─────────────────────────────┬───────────────────────────────────────┤
│          UI QC              │         EXECUTION QC                  │
│   (This document)           │    (INTENT_006, headless)             │
├─────────────────────────────┼───────────────────────────────────────┤
│ Electron + Playwright       │ Backend only (no UI)                  │
│ Visual verification (GLM)   │ FFmpeg execution                      │
│ Non-interactive (mocked)    │ Real file I/O                         │
│ Fast, deterministic         │ May take minutes                      │
├─────────────────────────────┼───────────────────────────────────────┤
│ ENDS AT: system_queues_job  │ STARTS AT: system_processes_job      │
└─────────────────────────────┴───────────────────────────────────────┘
```

### Why This Separation?

| Concern | Explanation |
|---------|-------------|
| **Determinism** | UI QC must be fast, repeatable, and non-interactive |
| **Dependencies** | Execution QC requires real FFmpeg, which may not be available |
| **Isolation** | UI bugs should not block execution testing, and vice versa |
| **Speed** | UI QC completes in seconds; execution may take minutes |

### UI QC Terminal State

- **Terminal action**: `system_queues_job`
- **Terminal state**: `job_queued`
- **Success criteria**: Job visible in queue panel

Execution-scope actions (`system_processes_job`, `job_completes`) are **skipped** by the intent runner in UI QC mode. They are validated by INTENT_006.

---

## Action-Scoped QC

In addition to scenario-based visual QC, the loop now supports **action-scoped QC** for individual user actions.

### Key Differences

| Aspect | Scenario QC | Action QC |
|--------|-------------|-----------|
| Scope | Full test scenario | Single user action |
| Screenshots | Multiple, per phase | One, post-settle |
| Backend correlation | None | Required |
| Verdict granularity | Per scenario | Per action |

### How It Works

For each instrumented action (e.g., `click_create_job`):
1. **Prior state** is recorded from UI
2. **Backend signals** are captured (job created? error reason?)
3. **UI settles** before screenshot (spinner, error, or timeout)
4. **Single screenshot** captured with DOM snapshot
5. **Correlated verdict** considers both backend + UI

### Action Outcomes

- `VERIFIED_OK` — Backend succeeded, UI matches expected state
- `VERIFIED_NOT_OK` — Backend or UI failed unexpectedly
- `BLOCKED_PRECONDITION` — Backend unavailable (not a UI bug)

See [QC_ACTION_TRACE.md](./QC_ACTION_TRACE.md) for the full schema.

---

## Phase Details

### Phase 1: Execution

**Script:** `scripts/qc/run_visual_qc.mjs`

**Actions:**
1. Generate timestamp for run
2. Create artifact directory
3. Launch Playwright with Electron
4. Run visual regression tests
5. Capture screenshots at each state
6. Write execution metadata

**Outputs:**
```
artifacts/ui/visual/<timestamp>/
├── <test-name>/
│   ├── idle.png
│   ├── job_started.png
│   └── progress_visible.png
├── execution_metadata.json
└── phase1_output.json
```

**Exit Codes:**
- `0` = Tests completed successfully
- `1` = Test failure (non-splash related)
- `2` = QC_INVALID (splash screen timeout)

**Splash-Aware Readiness Gate:**

⚠️ **CRITICAL**: Phase 1 includes a mandatory readiness gate to prevent splash-contaminated screenshots.

Before EVERY screenshot capture:
1. **Wait for splash dismissal** (up to 30 seconds)
   - Uses strict DOM detection: `data-testid="splash-screen"`
   - Checks for removal OR CSS hiding (display:none, visibility:hidden, opacity:0)
2. **Assert splash is gone** before capturing
   - If splash still visible → Test fails immediately
   - Captures `SPLASH_ONLY.png` as evidence
   - Marks QC run as INVALID

**Why This Gate Exists:**

GLM-4.6V **cannot** interpret whether a splash screen "should" be visible because:
- Splash screens are transient startup states, not application UI
- No way to know if visibility = "app not ready" vs "intentional design"
- Visual QC requires ACTUAL app UI, not startup artifacts

**Consequence of Splash Timeout:**
- Phase 1 exits with code `2` (QC_INVALID)
- Entire QC run is marked INVALID
- Phase 2 (GLM analysis) is SKIPPED
- Evidence captured in `SPLASH_ONLY.png` + DOM snapshot

**Common Causes:**
- App startup > 30 seconds (performance issue)
- Splash dismissal logic broken
- Backend/dependencies unavailable
- Test environment misconfiguration

### Phase 2: Visual Judgment

**Script:** `scripts/qc/run_glm_visual_judge.mjs`

**Actions:**
1. Load question set (versioned)
2. Collect all screenshots from artifacts
3. For each screenshot:
   - Convert to base64
   - Send to GLM-4.6V with questions
   - Parse structured response
4. Write GLM report

**Outputs:**
```
artifacts/ui/visual/<timestamp>/
└── glm_report.json
```

**GLM Report Structure:**
```json
{
  "version": "1.0.0",
  "phase": "VISUAL_JUDGMENT",
  "generatedAt": "2026-01-03T12:00:00Z",
  "questionSet": { "version": "v1", ... },
  "results": [
    {
      "screenshot": "idle.png",
      "answers": {
        "splash_visible": "no",
        "player_area_visible": "yes",
        ...
      },
      "observations": "The interface shows..."
    }
  ]
}
```

### Phase 3: Interpretation

**Script:** `scripts/qc/interpret_glm_report.mjs`

**Actions:**
1. Load GLM report
2. Load interpretation rules (versioned)
3. For each screenshot:
   - Check QC invalid conditions
   - Check critical failures
   - Check required visibility
   - Classify result
4. Aggregate across screenshots
5. Generate fix tasks if needed
6. Write interpretation report

**Classification Logic:**
```
QC_INVALID when:
  splash_visible=yes AND player_area_visible=no AND queue_panel_visible=no
  → App not fully loaded, screenshot unusable

VERIFIED_NOT_OK when:
  ui_elements_clipped=yes OR
  error_message_visible=yes OR
  player_area_visible=no
  → Critical failure detected

VERIFIED_OK when:
  All critical checks pass
  → QC passed
```

**Outputs:**
```
artifacts/ui/visual/<timestamp>/
└── qc_interpretation.json
```

### Phase 4: Decision

**Script:** `scripts/qc/run_qc_loop.mjs` (orchestrator)

**Decision Matrix:**

| Classification | Exit Code | Action |
|----------------|-----------|--------|
| VERIFIED_OK | 0 | QC Pass, no action |
| VERIFIED_NOT_OK | 1 | Fix tasks generated |
| QC_INVALID | 2 | Re-run required |

---

## Reversibility

The system supports running phases independently:

### Re-run GLM on existing screenshots
```bash
node scripts/qc/run_qc_loop.mjs --skip-execution \
  --artifact-path artifacts/ui/visual/2026-01-03T12-00-00
```

### Re-run interpretation with updated rules
```bash
node scripts/qc/run_qc_loop.mjs --skip-execution --skip-glm \
  --artifact-path artifacts/ui/visual/2026-01-03T12-00-00 \
  --rules v2
```

### Compare before/after
```bash
node scripts/qc/diff_glm_reports.mjs \
  artifacts/ui/visual/2026-01-03T12-00-00 \
  artifacts/ui/visual/2026-01-03T14-00-00
```

---

## Why Visual Authority is Externalized

### Problem: LLMs Cannot "See" UI

When an LLM reads code like:
```tsx
<ProgressBar visible={true} />
```

It cannot verify:
- Whether CSS actually displays the element
- Whether z-index hides it behind another element
- Whether overflow clips it
- Whether the Electron window renders it

### Solution: GLM as Visual Witness

GLM-4.6V sees the **rendered pixels**, not the code. It answers factual questions about what is visible, providing ground truth that code inspection cannot.

### Why Sonnet/Opus Must Never Eyeball UI

1. **No visual perception** — Text-based models cannot see images
2. **Hallucination risk** — May claim to see things based on code
3. **Separation of concerns** — Executor should not be validator
4. **Reproducibility** — GLM provides consistent visual analysis

---

## Failure Propagation

```
Phase 1 fails → No screenshots → Cannot proceed
                └─► Check Electron build
                └─► Check test configuration

Phase 2 fails → GLM API error → Retry or investigate
                └─► Check GLM_API_KEY
                └─► Check network connectivity
                └─► Check image encoding

Phase 3 fails → Parse error → Check GLM response format
                └─► Review glm_report.json
                └─► Update parsing logic if needed

Phase 4: QC_INVALID → App not loaded → Re-run after fix
         └─► Increase wait times
         └─► Check backend connectivity
         └─► Verify Electron startup

Phase 4: VERIFIED_NOT_OK → UI issues → Apply fixes, re-run
         └─► Review qc_interpretation.json
         └─► Check fixTasks array
         └─► Apply suggested fixes
```

---

## Commands

### pnpm Scripts

```bash
# Full QC loop
pnpm run qc:loop

# Phase 1 only (execution)
pnpm run qc:visual

# Phase 2 only (GLM analysis)
pnpm run qc:visual:glm -- <artifact-path>

# Compare reports
pnpm run qc:diff -- <old-path> <new-path>
```

### Direct Scripts

```bash
# Full loop with options
node scripts/qc/run_qc_loop.mjs [options]

# Options:
#   --skip-execution       Use existing screenshots
#   --skip-glm             Use existing GLM report
#   --artifact-path <path> Specify artifact directory
#   --question-set <ver>   GLM question version (default: v1)
#   --rules <ver>          Interpretation rules (default: v1)
#   --dry-run              Show plan without executing
```

---

## Artifacts

All artifacts are preserved with timestamps:

```
artifacts/ui/visual/
└── 2026-01-03T12-00-00-000Z/
    ├── <test-name>/
    │   ├── idle.png
    │   ├── job_started.png
    │   └── progress_visible.png
    ├── execution_metadata.json
    ├── phase1_output.json
    ├── glm_report.json
    ├── phase2_output.json
    ├── qc_interpretation.json
    ├── phase3_output.json
    └── qc_decision.json
```

---

## Sample Outputs

### glm_report.json (Sample)
```json
{
  "version": "1.0.0",
  "phase": "VISUAL_JUDGMENT",
  "generatedAt": "2026-01-03T12:00:00.000Z",
  "artifactPath": "artifacts/ui/visual/2026-01-03T12-00-00",
  "questionSet": {
    "version": "v1",
    "questionCount": 8
  },
  "results": [
    {
      "screenshot": "idle.png",
      "answers": {
        "splash_visible": "no",
        "progress_bar_visible": "no",
        "queue_panel_visible": "yes",
        "player_area_visible": "yes",
        "zoom_controls_visible": "yes",
        "ui_elements_clipped": "no",
        "error_message_visible": "no",
        "primary_action_button": "yes"
      },
      "observations": "The interface displays a split layout with a queue panel on the left and a video player area in the center. Zoom controls are visible below the player. A prominent 'Start' button is visible.",
      "apiDuration": 2341
    }
  ],
  "summary": {
    "totalScreenshots": 1,
    "processedSuccessfully": 1,
    "processingErrors": 0
  }
}
```

### qc_interpretation.json (Sample)
```json
{
  "version": "1.0.0",
  "phase": "INTERPRETATION",
  "generatedAt": "2026-01-03T12:00:05.000Z",
  "rulesVersion": "v1",
  "overall": {
    "overall": "VERIFIED_OK",
    "reason": "All screenshots passed verification",
    "confidence": "high"
  },
  "screenshots": [
    {
      "screenshot": "idle.png",
      "classification": "VERIFIED_OK",
      "reason": "All critical checks passed",
      "findings": [
        { "id": "player_area", "visible": true, "required": true }
      ]
    }
  ],
  "summary": {
    "total": 1,
    "verified_ok": 1,
    "verified_not_ok": 0,
    "qc_invalid": 0
  },
  "fixTasks": []
}
```

---

## Environment Setup

### Required Environment Variables

```bash
# GLM API access (GLM-4.6V visual model)
export GLM_API_KEY=a4bee94a75af4be7a4b2685228ff2d29.ADO4pKcjuxR7RD6k

# Optional: Custom artifact path
export VISUAL_QC_ARTIFACT_DIR=/path/to/artifacts
```

### Prerequisites

1. Electron app built: `cd frontend && pnpm run electron:build`
2. GLM API key configured
3. Test media files available (for job creation tests)
