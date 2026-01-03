# GLM Visual QC Interface

> Version: 1.0.0  
> Last Updated: 2026-01-03

## Purpose

This document defines the **question interface** between the orchestrator (Sonnet/Opus) and the visual witness (GLM-4.6V). It is the contract that governs what questions can be asked and how answers must be formatted.

## Precondition: Screenshot Validity

⚠️ **CRITICAL REQUIREMENT**: All screenshots sent to GLM-4.6V **MUST** be taken from a fully-loaded application state.

### The Splash Screen Problem

**GLM-4.6V cannot interpret whether a splash screen "should" be visible** because:
- Splash screens are transient startup states, not application UI
- There is no way to know if splash visibility indicates "app not ready" vs "intentional design"
- Visual QC requires ACTUAL application UI, not startup artifacts

### Executor Responsibility

The executor (Playwright test harness) MUST:
1. **Wait for splash dismissal** before ANY screenshot capture
2. **Use strict DOM-based detection** (`data-testid="splash-screen"`)
3. **Timeout after 30 seconds** if splash never dismisses
4. **Mark QC as INVALID** if splash timeout occurs
5. **Never send splash-visible screenshots to GLM**

### Consequence of Violation

If a screenshot is taken while splash is visible:
- The entire QC run is **INVALID**
- GLM analysis is **SKIPPED**
- Exit code 2 (QC_INVALID) is returned
- Evidence is captured in `SPLASH_ONLY.png`

This is NOT a GLM failure - it is an executor precondition failure.

---

## Architectural Principle

```
┌─────────────────────────────────────────────────────────────────┐
│                    VISUAL QC ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐         ┌─────────────────┐                │
│  │  SONNET/OPUS    │         │   GLM-4.6V      │                │
│  │  EXECUTOR +     │ ──────► │   VISUAL        │                │
│  │  INTERPRETER    │         │   WITNESS       │                │
│  └─────────────────┘         └─────────────────┘                │
│                                                                  │
│  - Orchestrates QC loop       - Sees pixels only                │
│  - Interprets GLM answers     - Answers questions               │
│  - Makes decisions            - No interpretation               │
│  - NEVER sees UI directly     - NEVER makes decisions           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Question Set Versioning

Question sets are versioned to ensure:
- **Reproducibility**: Old runs remain interpretable
- **Evolution**: Questions can be added/modified
- **Compatibility**: Version is recorded in every GLM report

### Version Format

```
scripts/qc/question_sets/
├── v1.json      ← Initial release
├── v2.json      ← Future updates
└── ...
```

### Version Schema

```json
{
  "version": "v1",
  "description": "Purpose of this question set",
  "created": "2026-01-03",
  "questions": [
    {
      "id": "unique_identifier",
      "question": "Visually answerable question text",
      "type": "boolean",
      "significance": "Why this question matters",
      "category": "layout|controls|job_state|error_state|app_state"
    }
  ],
  "interpretation_hints": {
    "critical_failures": ["question_ids_that_cause_failure"],
    "required_for_pass": ["question_ids_required_to_be_yes"]
  }
}
```

---

## V1 Question Set

### Questions

| ID | Question | Type | Significance |
|----|----------|------|--------------|
| `splash_visible` | Is there a splash screen or loading screen visible that covers most of the window? | boolean | Splash presence may indicate app not fully loaded |
| `progress_bar_visible` | Is there a horizontal progress bar visible anywhere in the interface? | boolean | Progress bar visibility during jobs |
| `queue_panel_visible` | Is there a queue or job list panel visible on the left or right side? | boolean | Queue panel layout verification |
| `player_area_visible` | Is there a video player or preview area visible in the center? | boolean | Main content area visibility |
| `zoom_controls_visible` | Are there zoom controls (buttons with + or -, or a slider) visible near the player area? | boolean | Zoom control accessibility |
| `ui_elements_clipped` | Are any UI elements cut off, clipped, or extending beyond the visible window boundaries? | boolean | Layout overflow detection |
| `error_message_visible` | Is there any error message, warning banner, or red-colored alert visible? | boolean | Error state detection |
| `primary_action_button` | Is there a prominent action button (like "Start", "Render", or "Add") visible? | boolean | Primary CTA visibility |

### Interpretation Rules (V1)

```
VERIFIED_OK when:
  - player_area_visible = yes
  - ui_elements_clipped = no
  - error_message_visible = no

VERIFIED_NOT_OK when:
  - ui_elements_clipped = yes, OR
  - error_message_visible = yes, OR
  - player_area_visible = no (required element missing)

QC_INVALID when:
  - splash_visible = yes AND player_area_visible = no AND queue_panel_visible = no
  - (indicates app not fully loaded, screenshot not usable)
```

---

## Question Design Rules

### Questions MUST be:

1. **Visually answerable** — Can be determined from pixels alone
2. **Binary or short factual** — "yes/no" or single-word answers
3. **Unambiguous** — Clear criteria for yes/no
4. **Observable** — Based on what IS visible, not what SHOULD be
5. **Atomic** — One question = one thing to check

### Questions MUST NOT:

1. **Require inference** — "Does the UI look correct?"
2. **Be subjective** — "Is the layout pleasing?"
3. **Require DOM knowledge** — "Is the element using flexbox?"
4. **Be compound** — "Is A visible AND is B visible?"
5. **Require context** — "Is this the expected state after clicking?"

### Examples

✅ **Good Questions:**
- "Is a progress bar visible?"
- "Is there any red-colored text visible?"
- "Is the window split into two panels?"

❌ **Bad Questions:**
- "Does the progress bar work correctly?"
- "Is the layout implemented properly?"
- "Should there be a zoom control here?"

---

## GLM Response Format

### Request Format

```json
{
  "model": "glm-4v-plus",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "image_url",
          "image_url": { "url": "data:image/png;base64,..." }
        },
        {
          "type": "text",
          "text": "Questions to answer..."
        }
      ]
    }
  ],
  "temperature": 0.1
}
```

### Expected Response Format

```json
{
  "answers": {
    "splash_visible": "yes" | "no",
    "progress_bar_visible": "yes" | "no",
    "queue_panel_visible": "yes" | "no",
    "player_area_visible": "yes" | "no",
    "zoom_controls_visible": "yes" | "no",
    "ui_elements_clipped": "yes" | "no",
    "error_message_visible": "yes" | "no",
    "primary_action_button": "yes" | "no"
  },
  "observations": "Brief factual description (2-3 sentences)"
}
```

---

## Adding New Questions

### Process

1. Create new version file: `scripts/qc/question_sets/v2.json`
2. Include all existing questions (for backward compatibility)
3. Add new questions with unique IDs
4. Update interpretation rules if needed
5. Document changes in this file

### Backward Compatibility

- Old GLM reports remain valid
- Interpretation rules can be re-run with new rules
- New questions will be "missing" in old reports (handled gracefully)

---

## API Configuration

### Environment Variables

```bash
GLM_API_KEY=your-api-key-here
```

### Endpoint

```
https://open.bigmodel.cn/api/paas/v4/chat/completions
```

### Model

```
glm-4v-plus (Vision-capable model)
```

---

## Future Question Sets (Roadmap)

### V2 (Planned)
- Job state questions (encoding, pending, complete)
- Timeline/scrubber visibility
- Preset panel visibility

### V3 (Planned)
- Multi-window support
- Modal/dialog detection
- Keyboard focus indicators
