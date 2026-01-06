# Proxx Development & QC Workflow (READ FIRST)

## Purpose of this document

This document exists to prevent context loss, rework, and accidental regressions when:
- Starting a new ChatGPT / Copilot session
- Handing work to a different AI model
- Returning to the project after time away

**This project is NOT developed by ad-hoc UI fixes.**  
All work follows an explicit, ordered QC-driven workflow.

If you are an AI assisting on this repo: **follow this document exactly**.

---

## Core Principle

> **Nothing gets fixed before it is safe to exist.**

UI work happens in layers:
1. Safety
2. Presence
3. Behaviour

Skipping layers causes regressions and wasted effort.

---

## The Three Phases of All Work

### Phase 1 — Safety (QC Guardrails)

Before any UI surface or feature is enabled, the following must already pass:

- **INTENT_001** – Core UI workflow sanity
- **INTENT_010** – Layout & resize robustness
- **INTENT_020** – Accessibility & interaction sanity
- **INTENT_030** – State & store integrity

These intents answer:
- Does it break layout?
- Does it break keyboard/mouse?
- Does it corrupt state?
- Does it interfere with other UI?

If something fails here:
- ❌ Do NOT debug feature behaviour
- ✅ Tighten or extend QC checks first

---

### Phase 2 — Presence (UI Can Exist Safely)

Once safety is proven, UI surfaces may be reintroduced **without fixing behaviour yet**.

Example:
- Settings panel
- Watch folders panel
- Overlays UI

This phase uses intents like:
- **INTENT_040** – Panel sanity (open/close, layout, accessibility, state isolation)

Rules:
- Buttons may do nothing
- Values may not persist
- Features may be incomplete

The **only question** is:
> Does this UI exist without harming the rest of the app?

---

### Phase 3 — Behaviour (Feature Correctness)

Only after a surface is safe to exist do we validate behaviour.

Examples:
- **INTENT_041** – Settings behaviour correctness
- Feature-specific intents for:
  - Watch folders
  - Presets
  - Queue editing
  - Batch workflows

Workflow:
1. Write the intent
2. Watch it fail
3. Fix until it passes
4. Stop

No ad-hoc fixes.

---

## What To Do When Something “Looks Broken”

Use this decision table:

| Observation | Action |
|------------|--------|
| Layout broken, clipped UI, scrollbars | INTENT_010 |
| Keyboard / focus / clicks broken | INTENT_020 |
| UI shows wrong state / resets | INTENT_030 |
| Feature doesn’t work | Write a behaviour intent |
| Multiple things broken | Fix safety first |

**Never fix behaviour before safety.**

---

## Model Usage Guidance (IMPORTANT)

When instructing Copilot / ChatGPT:

- **Claude Sonnet 4.5**
  - Designing intents
  - Writing QC tests
  - Architecture & reasoning
  - Preferred default

- **Claude Opus 4.5**
  - Large refactors
  - Multi-file UI changes
  - Heavy code generation
  - Use sparingly

Always specify the model explicitly in prompts.

---

## Rules for Copilot / AI Assistants

If you are an AI assisting this project:

- Do NOT redesign architecture unless asked
- Do NOT weaken existing QC rules
- Do NOT “just fix the UI”
- Do NOT skip intents
- Do NOT assume features should work

You must:
- Identify which phase applies
- Extend QC if needed
- Follow the ordered workflow

If unsure: **ask which intent applies before coding**.

---

## Why This Exists

This system exists to:
- Make UI changes safe
- Prevent regressions
- Reduce debugging time
- Allow confident expansion of features

Most projects never reach this point.
This one has.

Do not undo it.

---

## TL;DR

1. Safety first (QC)
2. Let UI exist
3. Then fix behaviour
4. Never skip steps

If you follow this, development stays boring and reliable.
That is the goal.