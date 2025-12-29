# V2 Implementation Readiness Gate

## Purpose

This document is a **GATE**, not guidance.

No V2 UX or execution changes may begin unless ALL criteria defined in this document are met.

Failing a criterion means **STOP**, not "almost ready."

This gate protects V2 architectural integrity, determinism, and scope discipline.

---

## Readiness Checklist (Mandatory)

All items must evaluate to **YES** before implementation begins.

If any item is **NO** → implementation is **forbidden**.

### A) Architecture Locked

- [ ] **Canonical proxy profiles are immutable** — YES / NO  
  _If NO → implementation is forbidden._

- [ ] **UserProxyProfile compiler is deterministic** — YES / NO  
  _If NO → implementation is forbidden._

- [ ] **JobSpec schema is versioned and frozen** — YES / NO  
  _If NO → implementation is forbidden._

- [ ] **Execution engines are unaware of policy layer** — YES / NO  
  _If NO → implementation is forbidden._

- [ ] **Watch folder semantics are documented and frozen** — YES / NO  
  _If NO → implementation is forbidden._

### B) Failure Semantics Locked

- [ ] **Pre-job vs validation vs execution failures are defined** — YES / NO  
  _If NO → implementation is forbidden._

- [ ] **Ownership of each failure class is documented** — YES / NO  
  _If NO → implementation is forbidden._

- [ ] **No silent fallback paths exist** — YES / NO  
  _If NO → implementation is forbidden._

- [ ] **Result JSON is authoritative** — YES / NO  
  _If NO → implementation is forbidden._

### C) UX Boundaries Locked

- [ ] **UI selects intent only** — YES / NO  
  _If NO → implementation is forbidden._

- [ ] **UI cannot modify execution** — YES / NO  
  _If NO → implementation is forbidden._

- [ ] **UI cannot retry, override, or infer** — YES / NO  
  _If NO → implementation is forbidden._

- [ ] **Forbidden actions are explicitly documented** — YES / NO  
  _If NO → implementation is forbidden._

### D) Fabric Contract Locked

- [ ] **Fingerprinting inputs are defined** — YES / NO  
  _If NO → implementation is forbidden._

- [ ] **Canonical profile is identity key** — YES / NO  
  _If NO → implementation is forbidden._

- [ ] **User metadata is informational only** — YES / NO  
  _If NO → implementation is forbidden._

- [ ] **No perceptual or AI assumptions exist** — YES / NO  
  _If NO → implementation is forbidden._

### E) Operational Reality Locked

- [ ] **Supported deployment modes are defined** — YES / NO  
  _If NO → implementation is forbidden._

- [ ] **Unsupported environments are documented** — YES / NO  
  _If NO → implementation is forbidden._

- [ ] **Operator responsibilities are explicit** — YES / NO  
  _If NO → implementation is forbidden._

- [ ] **Git hygiene is enforced** — YES / NO  
  _If NO → implementation is forbidden._

---

## Explicit Implementation Green Light

Implementation MAY begin ONLY when:

- **All checklist items are YES**
- **No open architectural questions remain**
- **No spec documents are marked "draft"**
- **No Phase 1 invariants are violated**

**Partial implementation is not allowed.**

---

## What This Document Prevents

This gate explicitly prevents:

- **UI-first development** — UX cannot precede architecture freeze
- **Feature-driven drift** — Features cannot drive architectural decisions backward
- **Backfilling specs after code** — Specification follows reality, not vice versa
- **"Temporary" execution shortcuts** — No shortcuts survive to production
- **V1-style state coupling** — V2 does not inherit V1 architectural debt

---

## What This Document Does Not Do

Be explicit about what this gate is **not**:

- **Does not define tasks** — Tasks are defined elsewhere
- **Does not assign timelines** — Timelines are managed separately
- **Does not promise features** — Features are documented in functional specs
- **Does not mandate implementation** — Implementation remains optional

This is a gate, not a plan.

---

## Enforcement

This document is enforced by:

- Code review discipline
- Explicit sign-off requirements
- Git branch protection
- Architectural review prior to merge

No V2 implementation work merges to mainline without satisfying this gate.

---

_Document Version: 1.0_  
_Status: Active Gate_  
_Applies To: V2 implementation work only_
