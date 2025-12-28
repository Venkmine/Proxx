# V2 PHASE 1 LOCKED – Reliable Proxy Engine

**Status:** 🔒 FROZEN (No feature additions allowed)  
**Last Updated:** 28 December 2025  
**Branch:** `v2/reliable-proxy`

---

## Executive Summary

V2 Phase 1 is now **LOCKED** and **FROZEN** from feature additions. This document defines what Phase 1 supports, what it explicitly forbids, and the execution guarantees it provides.

Phase 1 focuses on **deterministic, auditable, fail-fast execution** of proxy jobs. It is designed as a reliable foundation for future automation, not as a complete production system.

---

## What V2 Phase 1 Supports

### ✅ Core Capabilities

#### 1. **JobSpec – Deterministic Job Specification**
- Complete, serializable job definitions independent of UI state
- Multi-clip support (ordered list of source media files)
- Comprehensive validation before execution
- JSON serialization for persistence and debugging

**File:** `backend/job_spec.py`

#### 2. **Headless Execution**
- Execute JobSpecs without UI involvement
- Sequential processing (one clip at a time)
- Synchronous execution (blocking)
- Complete audit trail for every clip

**File:** `backend/headless_execute.py`

#### 3. **Multi-Clip Sequential Processing**
- Process multiple source clips in deterministic order
- Fail-fast semantics: stop on first failure
- No implicit batching, grouping, or concurrency
- Each clip produces exactly one output file

#### 4. **Structured Results**
- **ClipExecutionResult**: Per-clip execution tracking with:
  - Source and output paths
  - FFmpeg command executed
  - Exit code and status
  - Output verification (exists + size > 0)
  - Failure reason (if failed)
  - Timing information

- **JobExecutionResult**: Job-level aggregation with:
  - All clip results (ordered)
  - Final job status (COMPLETED/FAILED/PARTIAL)
  - Job timing
  - Success/failure counts

**File:** `backend/execution_results.py`

#### 5. **Output Verification**
- Every clip output is verified before marking COMPLETED
- Checks: file exists AND size > 0 bytes
- Failures are explicit with reasons
- No silent failures

#### 6. **Output Name Uniqueness (Multi-Clip)**
- Multi-clip jobs MUST use `{index}` or `{source_name}` tokens
- Prevents silent overwrites
- Validation fails loudly if ambiguous naming detected
- Single-clip jobs exempt from this requirement

#### 7. **Validation**
Comprehensive pre-execution validation:
- Source files exist
- Output directory exists and is writable
- Codec/container combinations are valid
- Naming template tokens are resolvable
- FPS mode configuration is correct
- Multi-clip naming is unambiguous

---

## Execution Guarantees

V2 Phase 1 provides the following **INVARIANTS**:

1. **Determinism**: Same JobSpec always produces same execution order and output paths
2. **Fail-Fast**: First clip failure stops execution immediately
3. **Auditability**: Every execution produces complete ClipExecutionResult with command reconstruction
4. **Verification**: No clip marked COMPLETED without output file verification (exists + size > 0)
5. **Explicitness**: All failures have explicit reasons; no silent failures
6. **Ordering**: Source clips processed in order; results list preserves execution order
7. **Atomicity**: Each clip is independent; no shared state between clips
8. **No Overwrites**: Multi-clip jobs enforce unique output names at validation time

---

## What V2 Phase 1 Does NOT Support

### ❌ Explicit Non-Goals

The following features are **EXPLICITLY FORBIDDEN** in Phase 1. They are deferred to future phases or out of scope entirely.

#### 1. **❌ NO Concurrency**
- No parallel clip processing
- No async execution
- No threading or multiprocessing
- Sequential execution only

**Why:** Concurrency introduces complexity, race conditions, and non-determinism. Phase 1 prioritizes correctness and debuggability over speed.

**Future:** V2 Phase 2+ may add opt-in concurrency with explicit resource limits.

#### 2. **❌ NO Retries**
- No automatic retry on failure
- No retry backoff strategies
- No partial retry logic

**Why:** Retries add complexity and can mask underlying issues. Phase 1 assumes failures are deterministic and require operator intervention.

**Future:** V2 Phase 2+ may add opt-in retry policies with explicit limits.

#### 3. **❌ NO UI Integration**
- No real-time progress updates to UI
- No UI-driven execution
- No interactive controls during execution

**Why:** V2 is designed for headless, automation-first workflows. UI integration is V1's domain.

**Future:** V3+ may add optional UI integration hooks.

#### 4. **❌ NO Background Workers**
- No daemon processes
- No watch folder automation
- No background queue processing

**Why:** Background workers require process management, health monitoring, and recovery logic. Phase 1 is synchronous by design.

**Future:** V2 Phase 2+ may add optional background worker mode.

#### 5. **❌ NO Auto-Recovery**
- No crash recovery
- No resume-from-checkpoint
- No partial output salvage

**Why:** Recovery logic adds state management complexity. Phase 1 assumes clean starts and explicit re-execution.

**Future:** V2 Phase 2+ may add checkpoint-based recovery.

#### 6. **❌ NO Dynamic Resolution**
- No resolution inheritance from source
- No automatic aspect ratio calculation
- No codec auto-detection

**Why:** JobSpec must be fully specified and deterministic. All parameters are explicit.

**Future:** May add optional resolution analysis helpers (separate from execution).

#### 7. **❌ NO V1 Code Modification**
- V1 execution paths are UNTOUCHED
- V1 UI remains unchanged
- V2 is a parallel path, not a replacement

**Why:** V1 is production-stable. V2 is experimental and must not break existing workflows.

---

## Supported Codecs and Containers

Phase 1 supports a **fixed set** of codec/container combinations:

### ProRes
- `prores_proxy`, `prores_lt`, `prores_standard`, `prores_hq`, `prores_4444`
- Containers: `mov` only

### H.264/H.265
- `h264`, `h265`, `hevc`
- Containers: `mp4`, `mov`, `mkv`

### DNxHD/DNxHR
- `dnxhd`, `dnxhr`
- Containers: `mov`, `mxf`

### Other
- `vp9`: `webm`, `mkv`
- `av1`: `mp4`, `mkv`, `webm`

**No custom codecs or containers are supported in Phase 1.**

---

## Supported Naming Tokens

Naming templates support the following tokens:

- `{source_name}` – Source filename without extension
- `{source_ext}` – Source file extension (no dot)
- `{job_id}` – JobSpec job_id (8-char hex)
- `{date}` – Current date (YYYYMMDD)
- `{time}` – Current time (HHMMSS)
- `{index}` – Clip index (000, 001, 002...)
- `{codec}` – Output codec name
- `{resolution}` – Target resolution string

**Multi-clip jobs MUST use `{index}` or `{source_name}`** to ensure unique output names.

---

## Failure Modes and Error Handling

### Validation Failures
- Raised as `JobSpecValidationError` before execution starts
- No partial execution
- No cleanup required

### Execution Failures
- Captured in `ClipExecutionResult.status = "FAILED"`
- Explicit `failure_reason` provided
- Job stops immediately (fail-fast)
- Partial results returned

### FFmpeg Errors
- Non-zero exit codes captured
- stderr preserved in result
- No automatic retry

### Missing Output
- Verified after execution
- Missing/zero-size outputs marked FAILED
- Explicit failure reason: "Output file does not exist or has zero size"

---

## API Stability

### Stable (Frozen)
- `JobSpec` dataclass structure
- `ClipExecutionResult` and `JobExecutionResult` dataclasses
- `execute_multi_job_spec()` function signature
- Validation semantics
- Fail-fast behavior
- Output verification requirements

### Internal (May Change)
- FFmpeg command construction details
- Path resolution logic
- Token substitution implementation

**Contract:** External callers should use `JobSpec` and check `JobExecutionResult`. Internal helpers may be refactored without notice.

---

## Testing Requirements

Phase 1 includes **minimal regression testing** to verify:

1. Valid JobSpec execution produces output files
2. ClipExecutionResult schema is correct
3. Deterministic output path resolution
4. Fail-fast behavior on first clip failure
5. Multi-clip naming validation rejects ambiguous templates

**No comprehensive test suite.** Phase 1 assumes manual validation and dogfooding.

---

## Future Phases (Out of Scope for Phase 1)

### V2 Phase 2+ (Tentative)
- Opt-in concurrency with resource limits
- Retry policies with backoff
- Checkpoint-based recovery
- Background worker mode (watch folders)
- Progress reporting hooks

### V3+ (Speculative)
- UI integration
- Real-time preview
- Interactive controls
- Web API

---

## Migration Path

### From V1
- V1 is unaffected; continues to work unchanged
- V2 is opt-in via `JobSpec` creation
- No automatic migration

### To Future Phases
- Phase 1 JobSpecs will remain compatible
- Result formats may be extended (backwards-compatible)
- Internal execution may be optimized (contracts preserved)

---

## Known Limitations

1. **No Progress Updates**: Execution is blocking with no intermediate feedback
2. **No Resume**: Failed jobs must be re-executed from scratch
3. **No Resource Limits**: No CPU/memory/disk quotas enforced
4. **No Timeout Configuration**: Hardcoded 1-hour timeout per clip
5. **No Logging Infrastructure**: Results written to output directory only
6. **No Metrics**: No execution time tracking beyond individual jobs

---

## Maintenance Policy

**V2 Phase 1 is FROZEN.**

### Allowed Changes
- Bug fixes that preserve contracts
- Documentation improvements
- Test additions (no test refactors)

### Forbidden Changes
- New features
- API changes
- Behavior changes (unless fixing bugs)
- Refactoring (unless critical for bug fix)

### Breaking Changes
- Must be approved by project lead
- Must document migration path
- Must increment phase number (Phase 2)

---

## Related Files

- `backend/job_spec.py` – JobSpec dataclass and validation
- `backend/headless_execute.py` – Execution engine
- `backend/execution_results.py` – Result dataclasses
- `qa/test_v2_phase1_regression.py` – Regression test suite (minimal)

---

## Changelog

### 2025-12-28 – Phase 1 Locked
- Added `ClipExecutionResult` and `JobExecutionResult`
- Enforced output name uniqueness for multi-clip jobs
- Added per-clip output verification (exists + size > 0)
- Documented execution guarantees and non-goals
- Froze Phase 1 from feature additions

### Earlier
- Multi-clip sequential execution
- JobSpec validation
- Headless execution engine

---

## Contact

Questions about Phase 1 scope or future phases?  
**See:** `DOGFOOD_PLAN.md`, `README.md`

**Do not add features to Phase 1 without explicit approval.**

---

🔒 **END OF V2 PHASE 1 SPECIFICATION** 🔒
