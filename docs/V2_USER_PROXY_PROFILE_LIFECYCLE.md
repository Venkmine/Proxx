# V2 User Proxy Profile Lifecycle

## Overview

User proxy profiles are user-created configurations that compile into canonical proxy profiles. This document defines their lifecycle: how they are created, used, deprecated, and graduated.

Canonical profiles are immutable. User profiles evolve. This lifecycle ensures evolution happens without breaking determinism or corrupting history.

---

## States

A user proxy profile exists in exactly one of four states:

### 1. ACTIVE

| Property          | Value                                      |
|-------------------|--------------------------------------------|
| Compiles          | Yes                                        |
| Selectable        | Yes—can be used for new jobs               |
| Existing jobs     | Valid                                      |

The default state for newly created profiles that compile successfully.

### 2. DEPRECATED

| Property          | Value                                      |
|-------------------|--------------------------------------------|
| Compiles          | Yes                                        |
| Selectable        | No—cannot be selected for new jobs         |
| Existing jobs     | Remain valid                               |

Used when a profile should no longer be used but historical jobs must remain intact. Deprecation is a soft retirement.

### 3. INVALID

| Property          | Value                                      |
|-------------------|--------------------------------------------|
| Compiles          | No—fails to compile to canonical profile   |
| Selectable        | No—hard error if selected                  |
| Existing jobs     | Remain valid (they recorded canonical ID)  |

A profile becomes invalid when it can no longer compile. This may occur if:
- Referenced canonical profile was removed
- Profile definition contains structural errors
- Required fields are missing or malformed

Invalid profiles **must** report a clear error explaining why compilation fails.

### 4. GRADUATED

| Property          | Value                                      |
|-------------------|--------------------------------------------|
| Compiles          | Yes—but is now an alias                    |
| Selectable        | Yes—resolves to canonical profile          |
| Existing jobs     | Valid                                      |

A graduated profile has been promoted into the canonical registry. The user profile becomes an alias pointing to the new canonical profile ID. The canonical profile ID becomes authoritative for all purposes, including fingerprinting.

---

## Rules

### Profiles Never Mutate In Place

A profile's semantic meaning **must not** change after creation. If behavior must change:
- Create a new profile version
- Deprecate the old version (if appropriate)
- Never silently alter existing definitions

### Version Bumps Required

Any semantic change requires a version increment:
- Changed codec parameters
- Changed resolution logic
- Changed audio mapping

Cosmetic changes (notes, display name) do not require version bumps but also do not affect compilation.

### Job Recording

Jobs **must** record:

| Field                    | Purpose                                    |
|--------------------------|--------------------------------------------|
| Canonical proxy profile  | Authoritative transformation identity      |
| User profile origin      | Metadata—which user profile was selected   |

The canonical profile is used for fingerprinting and reproducibility. The user profile origin is metadata for audit and debugging.

### Execution Independence

Execution **never** depends on lifecycle state:
- A job does not check if a profile is deprecated
- A job does not behave differently for graduated profiles
- Execution uses the compiled canonical profile, period

Lifecycle state affects selection and validation, not execution.

---

## Graduation Criteria

A user profile may graduate to canonical status **only if**:

| Criterion               | Requirement                                |
|-------------------------|--------------------------------------------|
| Usage history           | Used successfully across multiple jobs     |
| Determinism             | Compiles to same canonical output always   |
| Applicability           | Broadly useful, not project-specific       |
| Approval                | Intentional manual decision                |

### Graduation Is Not Automatic

No profile graduates automatically. Graduation requires:
1. Explicit nomination
2. Review of usage patterns
3. Confirmation that the profile is general-purpose
4. Manual promotion into the canonical registry

Graduation is a deliberate act, not a threshold.

---

## Why This Exists

### Prevents Configuration Sprawl

Without lifecycle rules, user profiles accumulate indefinitely. States like DEPRECATED and INVALID allow cleanup without data loss.

### Preserves Determinism

Profiles never mutate. Jobs record canonical IDs. The same job definition always produces the same fingerprint, regardless of what happens to user profiles later.

### Allows Evolution Without Breaking History

New profiles can be created. Old profiles can be deprecated. Canonical profiles can be added. None of this rewrites history or invalidates past work.

### Keeps Fabric Sane at Scale

Fabric reasons about fingerprints. Fingerprints derive from canonical profiles. This lifecycle ensures user-facing flexibility does not compromise system-level consistency.

---

## Hard Non-Goals

The following are **prohibited**:

- No automatic migration of profiles between states
- No background rewriting of job records
- No silent profile replacement
- No heuristic profile matching
- No "close enough" compilation

**If it's ambiguous, it's an error.**

A profile either compiles or it does not. A profile is either selected or it is not. There is no fallback. There is no "best effort."

---

## State Transitions

```
┌──────────┐
│  ACTIVE  │ ←── (created, compiles)
└────┬─────┘
     │
     ├──────────────────┐
     │                  │
     ▼                  ▼
┌────────────┐    ┌───────────┐
│ DEPRECATED │    │ GRADUATED │
└────────────┘    └───────────┘
     │
     ▼
┌─────────┐
│ INVALID │ ←── (compilation fails)
└─────────┘
```

Notes:
- ACTIVE → DEPRECATED: Manual decision
- ACTIVE → GRADUATED: Manual promotion
- ACTIVE → INVALID: Compilation failure (automatic)
- DEPRECATED → INVALID: Compilation failure (automatic)
- INVALID → ACTIVE: Not permitted (create new profile instead)
- GRADUATED → any: Not permitted (canonical is immutable)

---

## Summary

| Concept                 | Rule                                                 |
|-------------------------|------------------------------------------------------|
| States                  | ACTIVE, DEPRECATED, INVALID, GRADUATED               |
| Mutation                | Prohibited—version bump instead                      |
| Job records             | Canonical ID (authoritative) + user origin (metadata)|
| Execution               | Uses canonical profile; ignores lifecycle state      |
| Graduation              | Manual, intentional, never automatic                 |
| Ambiguity               | Is an error                                          |
