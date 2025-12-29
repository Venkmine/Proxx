# V2 Packaging and Deployment

**Status:** Operational Definition  
**Updated:** 29 December 2025

This document defines how Proxx V2 is packaged, deployed, and operated.

It does not describe installation procedures, roadmap features, or future capabilities.

---

## Supported Deployment Modes

Proxx V2 supports three deployment modes. All modes share the **same execution engine** with **identical deterministic behavior**.

### Mode A — Local Operator Machine

- Single workstation environment
- Human-triggered jobs via CLI or UI
- FFmpeg + optional Resolve installed locally
- Filesystem is local or mounted (SAN / NAS / LucidLink)
- Interactive monitoring and control

**Use case:** Post-production operator workstations, QC stations, supervised batch processing.

### Mode B — Headless Worker Node

- No interactive UI required
- Jobs triggered via CLI or watch folder
- Deterministic sequential execution
- Logs and result JSON are authoritative outputs
- Exit codes indicate success/failure

**Use case:** Dedicated processing servers, background workers, scheduled automation.

### Mode C — CI / Automation Runner

- Ephemeral execution environment
- JobSpecs generated externally
- Artifacts explicitly preserved before teardown
- Exit codes are the contract
- No persistent state assumed

**Use case:** GitHub Actions, Jenkins, GitLab CI, render farms, cloud batch processing.

---

### Mode Invariants

These rules apply to **all supported modes**:

- Execution engine behavior is identical
- Same JobSpec produces same output given same environment
- No mode-specific optimizations or shortcuts
- No behavior differences allowed

---

## Environment Assumptions

Proxx V2 requires the following environment guarantees:

### Required Dependencies

- **FFmpeg** version pinned per deployment
- **DaVinci Resolve** version pinned if Resolve proxies are used
- Python 3.11 or later

### Filesystem Requirements

- Atomic rename operations supported
- Stable paths during job execution
- Sufficient I/O bandwidth for media operations
- No concurrent writers to output directories

### Operational Assumptions

- Clock drift is irrelevant (timestamps are metadata only)
- Network availability is NOT required at runtime
- Serial execution per worker instance
- Explicit job completion signals (JSON + exit codes)

### Operator Responsibilities

- Pin FFmpeg version
- Pin Resolve version if used
- Verify filesystem atomicity guarantees
- Manage output directory permissions
- Handle dependency updates explicitly

**Critical:** Changing FFmpeg or Resolve versions can change outputs. This is an operator responsibility, not a system defect.

---

## What Is NOT Supported

Proxx V2 explicitly does not support:

### Environment Misconfigurations

- Mixed-version workers in the same logical pool
- Non-atomic filesystems (eventual consistency storage)
- Background auto-updates of FFmpeg or Resolve
- Cloud object storage pretending to be POSIX (S3FS, FUSE mounts)

### Unsafe Concurrency

- Concurrent writers to output directories
- Shared watch folders without external coordination
- Multiple workers processing overlapping JobSpecs

### Opaque Wrappers

- Execution inside "smart" media managers
- DAMs that intercept filesystem operations
- Auto-archiving systems
- Background indexing services

### Unsupported Does Not Mean Impossible

If your environment requires unsupported configurations, you must build a wrapper layer that enforces Proxx's assumptions.

---

## Support Boundaries

### What "Supported" Means

Proxx V2 guarantees:

- **Deterministic behavior** given a stable environment
- **Reproducibility** given pinned dependencies
- **Clear failure signals** when assumptions are violated
- **Exit codes** reflect actual execution state
- **JSON outputs** are parseable and schema-stable

### What "Supported" Does NOT Mean

Proxx V2 does not guarantee:

- Behavior stability across environment drift
- Silent adaptation to configuration changes
- Compatibility promises across major versions
- Recovery from external process interference
- Graceful degradation when assumptions are violated

### Failure Modes

When environment assumptions are violated:

- Jobs fail explicitly
- Error messages identify the violated assumption
- No partial outputs are written
- Exit codes are non-zero

**No silent failures. No best-effort execution.**

---

## Non-Goals

Proxx V2 explicitly does not provide:

- Auto-installers or setup wizards
- Self-updating binaries
- Dependency management
- Daemonization or process supervision
- Orchestration logic
- Job scheduling
- Multi-worker coordination
- Retry logic
- Progress estimation
- Rate limiting

**Proxx is an execution engine, not a platform.**

If you require these capabilities, build them as external wrappers.

---

## Deployment Architecture Patterns

### Pattern 1: Single Operator Workstation

```
[Operator] → [Proxx CLI/UI] → [FFmpeg/Resolve] → [Local Filesystem]
```

- Direct invocation
- Interactive feedback
- Manual job submission

### Pattern 2: Headless Worker Pool

```
[Job Queue] → [Watch Folder] → [Proxx Worker] → [FFmpeg/Resolve] → [Shared Storage]
                                      ↓
                              [Result JSON + Logs]
```

- External orchestrator feeds watch folder
- Worker processes serially
- Results signal completion

### Pattern 3: CI Pipeline

```
[CI Trigger] → [Ephemeral Runner] → [Proxx CLI] → [FFmpeg] → [Artifact Storage]
                                         ↓
                                [Exit Code + JSON]
```

- JobSpec generated by CI script
- Artifacts explicitly preserved
- Exit code determines pipeline success

---

## Version Coupling

### Execution Engine

- Proxx version pinned per deployment
- FFmpeg version pinned per deployment
- Resolve version pinned if used

### Expected Behavior

- Same versions → same outputs
- Different versions → possibly different outputs
- Version changes are explicit operator actions

### No Silent Updates

Proxx does not:

- Auto-detect dependency versions
- Adapt behavior to detected versions
- Warn about version mismatches

The operator is responsible for version management.

---

## Operational Contract

### Inputs

- Valid JobSpec JSON
- Accessible source media
- Writable output directory
- Available FFmpeg (+ Resolve if specified)

### Outputs

- Proxy media files
- Result JSON with per-task status
- Execution logs
- Exit code (0 = success, non-zero = failure)

### Execution Guarantees

- Tasks execute serially within a job
- No partial outputs on failure
- Atomic file operations
- Explicit error reporting

### No Implicit Behavior

- No auto-retry
- No fallback strategies
- No silent skipping
- No best-effort completion

---

## Integration Requirements

Systems integrating with Proxx must:

1. Generate valid JobSpec JSON
2. Ensure source media accessibility
3. Provide writable output directories
4. Parse result JSON for task outcomes
5. Handle non-zero exit codes
6. Manage dependency versions explicitly
7. Enforce single-writer guarantees

---

## Summary

Proxx V2 is a deterministic media processing engine designed for deployment in controlled environments.

It assumes stable dependencies, atomic filesystems, and serial execution.

It does not provide orchestration, scheduling, or resilience features.

It fails explicitly when assumptions are violated.

Operators are responsible for environment stability and version management.

---

**End of Document**
