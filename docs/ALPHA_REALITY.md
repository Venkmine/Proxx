# Awaire Proxy — Alpha Reality (v0.x)

STATUS: ACTIVE AUTHORITY

This document overrides all other PRODUCT, V1, QA, and CONSTRAINT documents.
Other documents are informational only until ALPHA is complete.

This document is the highest authority during Alpha.

If any other document, test, comment, or prompt conflicts with this file,
THIS FILE WINS.

## Product Stage
- Status: ALPHA (v0.x)
- This product is NOT v1
- No shipping guarantees
- UX, feature scope, and behaviour are fluid

## Core Intent (Alpha)
Awaire Proxy Alpha exists to discover:
- The correct UX for proxy generation
- The correct mental model for users
- Which features actually matter

Speed of learning > correctness
Clarity of UI > completeness
Honesty > promises

## Rules for Alpha Development

### UX Rules
- If a feature does not work, it must be hidden or removed
- “Coming soon” UI is forbidden
- Features may be removed without replacement
- Incomplete UI-only features are allowed if clearly scoped

### Feature Rules
- Presets are optional
- Watch folders may exist in backend but MUST NOT appear in UI
- Colour management, LUTs, watermarking may be UI-only
- No v1 constraints apply

### Testing Rules (Critical)
Verify exists to:
- Catch crashes
- Catch regressions in *current* behaviour
- Prove the golden path works

Verify MUST NOT:
- Enforce future behaviour
- Enforce v1 contracts
- Block UX refactors

If a test blocks learning, the test is wrong.

### Documentation Rules
The following docs are NOT authoritative during Alpha:
- PRODUCT_PROXY_V1.md
- NEXT_AFTER_V1.md
- Any “Definition of Done” claiming completeness

These may be referenced for inspiration only.

## Alpha Exit Criteria (not v1)
Alpha ends when:
- Core UX stabilises
- Users can complete jobs intuitively
- Feature set stops changing weekly

Only then do v1 rules apply.
