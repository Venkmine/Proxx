# V2 Profile Selection UX

**Status:** Specification  
**Applies to:** V2+ deterministic operation only  
**Created:** 2025-12-29

> **See also:** [V2_PROFILE_SELECTION_AND_JOB_CREATION.md](V2_PROFILE_SELECTION_AND_JOB_CREATION.md) for the complete end-to-end contract from selection through job creation to failure reporting.

---

## Core Principle

**The UI is a chooser, not a control panel.**

The UI selects **intent**, not **execution**. Users select a `UserProxyProfile` that describes their goal. They never see codec names, container formats, bitrate calculations, FFmpeg flags, or engine choices. Canonical proxy profiles are an internal implementation detail and remain invisible to operators.

---

## What the UI Is Allowed to Show

### Permitted Elements

- `UserProxyProfile` name
- Short description / notes field
- Lifecycle state (`ACTIVE` / `DEPRECATED`)
- Visual warnings (deprecated profiles, organizational policy alerts)
- Optional grouping tags (e.g., "editorial", "delivery", "archive")

### Forbidden Elements

- Canonical proxy profile identifiers
- Codec names (H.264, ProRes, DNxHD, etc.)
- Container formats (MOV, MP4, MXF)
- Resolution calculations or pixel math
- Engine selection (FFmpeg, Resolve, Future Engine X)
- Command-line flags or technical parameters

### Response to Technical Inquiries

If a user asks "what exactly does this encode to?", the answer is:

> "See the output file or documentation."

The UI does not expose execution details.

---

## Selection Flow

> **Note:** For the complete selection → JobSpec creation flow including failure handling, see [V2_PROFILE_SELECTION_AND_JOB_CREATION.md](V2_PROFILE_SELECTION_AND_JOB_CREATION.md).

### UI Responsibilities

1. **Display `ACTIVE` UserProxyProfiles only**  
   Deprecated profiles may be shown separately with clear visual distinction but are not selectable.

2. **Accept single profile selection**  
   No multi-selection, no configuration, no overrides.

3. **Request job creation from system**  
   Pass selected profile to job creation layer.

4. **Display results**
   - Success: Job created, execution begins
   - Failure: Explicit error message from compilation layer

The UI does **not** participate in compilation, validation, or execution. It is purely a selection and display interface.

---

## Handling Deprecated Profiles

### Rules

- Deprecated profiles **MAY** be shown in the UI
- They **MUST** be visually marked (icon, color, label)
- They **MUST NOT** be selectable for new jobs
- Existing jobs that reference deprecated profiles remain valid and executable

### No Silent Substitution

If a deprecated profile is selected (edge case, race condition), the system **MUST** reject the job creation request with an explicit error. It does NOT silently substitute a newer profile.

---

## Error Presentation Rules

### Requirements

Errors **MUST**:
- State **WHY** compilation failed
- State **WHAT** constraint caused the failure
- **Never** suggest alternatives automatically

### Examples (Allowed)

- `"Profile 'HD_Editorial_LT' no longer compiles: max_resolution constraint incompatible with canonical registry."`
- `"Profile 'Legacy_ProRes_422' is deprecated and cannot be used for new jobs."`
- `"No canonical proxy profile matches the requested characteristics."`

### Examples (Forbidden)

- `"Profile failed. Try 'HD_Standard' instead."` ❌
- `"Automatically using fallback profile."` ❌

---

## Hard Non-Goals

This UX model explicitly **does NOT** support:

- Advanced settings panels
- Per-job overrides or tweaks
- Custom resolution fields
- Codec selection dropdowns
- Bitrate sliders
- Engine choice toggles
- Profile editing within the job creation UI
- Visibility into canonical proxy profile internals

### If Users Need Control

Users who require fine-grained control edit `UserProxyProfile` definitions outside the job creation UI. The UI is not a configuration surface.

---

## Relationship to V1 / Alpha UX

This specification **does NOT** apply to:
- V1 Alpha operator UI experimentation
- Pre-V2 prototypes or demos

This document governs **V2+ deterministic operation only**. No blending of paradigms. V1 and Alpha UX models are considered research artifacts and operate under different rules.

---

## Design Constraints

### Determinism

Every job creation flow results in:
- One canonical proxy profile selected
- Complete audit trail
- No ambiguity about what was requested

### Auditability

Job metadata includes:
- Which `UserProxyProfile` was selected
- When selection occurred
- Resolved canonical proxy profile

### Operator Safety

The UI prevents:
- Accidental misconfiguration
- Exposure to implementation complexity
- Selection of invalid or deprecated profiles

---

## Summary

The profile selection UX is intentionally minimal. It provides a curated list of **named intentions** (UserProxyProfiles), not a control panel for execution details. Operators choose what they want to achieve. The system determines how to execute it. This separation preserves determinism, auditability, and operational safety.
