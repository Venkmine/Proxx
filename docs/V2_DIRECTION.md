# V2 Direction: Reliable Proxy Engine

## Chosen Direction

Proxx V2 prioritizes correctness, automation, and determinism over interactive editing capabilities. The system functions as a reliable proxy generation engine where the UI exists solely to configure jobs and observe execution—not to edit media. All creative decisions are made upstream; Proxx executes them faithfully and repeatably.

---

## Core V2 Goals

1. **Multi-clip jobs** — Process batches of clips in a single job with consistent settings
2. **Watch folders** — Automatic ingestion and processing of new media without manual intervention
3. **Deterministic naming** — Output filenames derive from inputs and settings via predictable rules
4. **Headless execution compatibility** — Full functionality via CLI/API without UI dependency
5. **Repeatable jobs** — Identical inputs produce identical outputs, always

---

## Explicit Non-Goals

The following are **out of scope** for V2:

- Interactive overlays or annotations
- Timeline scrubbing or frame-by-frame navigation
- Pixel-accurate preview matching final output
- Creative editing tools (trim, color grade, transitions)
- AI-driven corrections or automatic adjustments

These features belong in dedicated editing software. Proxx is not an editor.

---

## Preview Philosophy

**Preview is a comfort and validation surface only.**

- The rendered output file is authoritative
- Preview may be scaled, simplified, or approximate
- Preview exists to confirm job configuration, not to evaluate final quality
- Preview must always disclose its limitations to the operator

Any UI element displaying preview content must indicate that it is not a pixel-accurate representation of the output. Operators who require frame-accurate validation must inspect the output file directly.

---

## What V2 Will Build On From V1

- **Execution trace system** — Full audit trail of every operation
- **Invariant enforcement** — Hard failures on constraint violations
- **Observability and logging** — Structured logs, timing data, error context
- **Honest UI principles** — No hidden state, no silent failures, no fake progress

---

## What V2 Will Delete or Replace

| V1 Artifact | V2 Action |
|-------------|-----------|
| Single-clip restriction | Remove — multi-clip is default |
| Browse limitations | Remove — unrestricted folder access |
| Temporary guardrails blocking automation | Remove — headless-first design |
| Preview-centric UX assumptions | Replace — output-centric validation |

---

## Summary

V2 is a batch processing engine. It ingests, transforms, and outputs. The UI is a control panel, not a canvas. Reliability and repeatability are non-negotiable.
