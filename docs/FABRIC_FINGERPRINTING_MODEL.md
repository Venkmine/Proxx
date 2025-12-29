# Fabric Fingerprinting Model

## Purpose

Fabric fingerprints answer one question:

> "Have we effectively seen this media before, in a meaningful way?"

Fingerprinting relies on **normalization**. Proxx provides that normalization by producing deterministic proxy outputs from variable source media.

A fingerprint is not a hash of content. It is a stable identity derived from intrinsic source properties and the canonical transformation applied.

---

## Fingerprint Inputs (V1)

A Fabric fingerprint is derived **only** from:

### Source Media Intrinsic Identifiers

| Property        | Description                          |
|-----------------|--------------------------------------|
| Codec family    | e.g., H.264, ProRes, DNxHD           |
| Frame size      | Width × Height in pixels             |
| Frame rate      | Frames per second (exact rational)   |
| Duration        | Total media duration                 |
| Audio layout    | Channel count and configuration      |
| Container type  | e.g., MXF, MOV, MP4                  |

### Canonical Proxy Profile ID

The profile identifier from the canonical registry, e.g.:

- `proxy_prores_proxy`
- `proxy_h264_web`
- `proxy_dnxhd_36`

---

## Excluded From Fingerprint

The following are **explicitly excluded**:

| Excluded Property       | Reason                                              |
|-------------------------|-----------------------------------------------------|
| UserProxyProfile name   | User profiles are aliases; canon is authoritative   |
| User notes              | Metadata, not transformation identity               |
| UI settings             | Presentation layer, not execution                   |
| Output filename         | Arbitrary, user-controlled                          |
| Timestamps              | Execution timing is not identity                    |
| Execution engine choice | FFmpeg version, hardware—implementation detail      |

### Why User Profiles Are Excluded

User profiles compile into canonical profiles. Two different user profiles that compile to the same canonical profile produce identical transformations. The fingerprint must reflect **what was done**, not **who requested it** or **what they called it**.

If user profile names were included:
- Identical outputs would get different fingerprints
- Fabric would treat duplicates as distinct
- Determinism would be violated

The canonical profile ID is the single source of truth for transformation identity.

---

## Fingerprint Stability Invariants

These invariants **must** hold:

1. **Same source + same canonical profile → same fingerprint**
   - Regardless of when, where, or by whom the job was run

2. **Different user profiles compiling to same canon → same fingerprint**
   - User profile names are not semantically meaningful

3. **Fingerprints survive:**
   - Reprocessing the same source
   - Relocating output files
   - Renaming output files
   - Re-encoding via the same canonical profile

4. **Fingerprint changes require:**
   - Different source media intrinsics, OR
   - Different canonical profile

Nothing else may cause a fingerprint to change.

---

## Explicit Non-Goals

This specification **does not** address:

| Non-Goal               | Explanation                                         |
|------------------------|-----------------------------------------------------|
| Perceptual hashing     | No frame-by-frame content analysis                  |
| Content similarity     | No "looks like" or "sounds like" matching           |
| AI analysis            | No scene detection, no classification               |
| QC judgement           | No quality assessment, no pass/fail                 |
| Deduplication logic    | Fingerprint is identity; dedup is policy            |

**This is identity, not intelligence.**

Fabric uses fingerprints to reason about what has been produced. It does not use fingerprints to judge quality or detect near-duplicates.

---

## Hard Non-Goals

The following are **prohibited**:

- No automatic migration of fingerprints
- No background rewriting of job records
- No silent profile replacement
- No heuristic fingerprint merging
- No "close enough" matching

**If it's ambiguous, it's an error.**

A fingerprint either matches exactly or it does not match. There is no partial match. There is no fuzzy match. There is no "probably the same."

---

## Summary

| Concept                  | Rule                                                |
|--------------------------|-----------------------------------------------------|
| Fingerprint derives from | Source intrinsics + canonical profile ID            |
| User profile names       | Excluded—they are aliases, not identity             |
| Stability                | Same inputs → same fingerprint, always              |
| Scope                    | Identity only—no intelligence, no policy            |
