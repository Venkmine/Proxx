# Release v2.0.0-phase1

**Release Date:** 2025-12-29 21:50 UTC

**Release Tag:** `v2.0.0-phase1`

---

## What is INCLUDED

This release represents the frozen baseline for Proxx V2 Phase-1 and Fabric Phase-2:

### Proxx V2 Phase-1 (Deterministic Execution - FROZEN)
- Single-clip deterministic proxy generation
- FFmpeg and DaVinci Resolve engine support
- Proxy profile system for output configuration
- Watch folder automation
- Source format validation and engine routing
- Codec/container compatibility enforcement
- Output path resolution and naming templates

### Fabric Phase-1 (Ingestion - FROZEN)
- File ingestion and validation
- Settings snapshot isolation
- Source path normalization
- Engine capability routing

### Fabric Phase-2 (Persistence - FROZEN)
- Settings preset management
- Preset fingerprinting and isolation
- Job creation with immutable settings

---

## What is EXPLICITLY NOT INCLUDED

The following capabilities are **out of scope** for this release:

- Phase-2 execution scaling (multi-clip, batching)
- Retry mechanisms or failure recovery
- Concurrency beyond Phase-1 single-clip bounds
- Job orchestration or queue management
- State persistence beyond settings presets
- Dynamic execution routing
- Performance optimization beyond deterministic execution

---

## Phase-1 Governance

**Phase-1 is now FROZEN.**

All code and behavior captured in this release tag is considered stable and immutable.

### Change Authorization Rules

Any modifications to Phase-1 code **require explicit Phase-2 authorization** and must:

1. Maintain backward compatibility with existing Phase-1 contracts
2. Preserve deterministic execution semantics
3. Not introduce new behavior without architectural review
4. Document breaking changes in Phase-2 specifications

### Branching Policy

- Phase-2 work **MUST** branch from this tag (`v2.0.0-phase1`)
- This tag is **NEVER** rewritten or amended
- Emergency fixes to Phase-1 require a new patch release tag

---

## Documentation References

For detailed architectural context and phase boundaries:

- **Phase-1 Governance:** [docs/V2_PHASE_1_GOVERNANCE.md](docs/V2_PHASE_1_GOVERNANCE.md)
- **Phase-2 Architecture:** [docs/V2_PHASE_2_ARCHITECTURE.md](docs/V2_PHASE_2_ARCHITECTURE.md)
- **Phase-2 Failure Model:** [docs/V2_PHASE_2_FAILURE_MODEL.md](docs/V2_PHASE_2_FAILURE_MODEL.md)
- **Phase-2 Invariants:** [docs/V2_PHASE_2_INVARIANTS.md](docs/V2_PHASE_2_INVARIANTS.md)
- **Phase-2 Patterns:** [docs/V2_PHASE_2_PATTERNS.md](docs/V2_PHASE_2_PATTERNS.md)

---

## Immutability Commitment

This release tag represents an **immutable snapshot** of the codebase.

No commits may be added to this baseline. All future work proceeds from this known-good state.

---

**END OF RELEASE DOCUMENT**
