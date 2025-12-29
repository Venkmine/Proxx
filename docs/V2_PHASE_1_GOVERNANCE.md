# V2 Phase-1 Governance Policy

**Status**: FROZEN  
**Effective Date**: 29 December 2025  
**Enforcement**: Automated (CI/CD mandatory)  
**Authority**: Technical Lead + Code Review

---

## Executive Summary

Phase-1 of Proxx V2 is **FROZEN** as of this document's effective date.

Phase-1 represents a stable, tested, deterministic baseline for proxy generation.
It provides:
- Immutable JobSpec contracts
- Deterministic engine routing (FFmpeg vs Resolve)
- Synchronous, fail-fast execution
- Atomic filesystem semantics for watch folders
- Full audit trails for all operations

**Phase-1 SHALL NOT evolve further.** All future work (retries, concurrency, progress UI, etc.)
belongs in Phase-2 and beyond.

---

## What is Phase-1?

Phase-1 is the minimal viable implementation of V2's deterministic proxy engine.

### Phase-1 Capabilities (ALLOWED)

1. **JobSpec Creation and Validation**
   - Create immutable JobSpec from source media
   - Validate all paths, formats, and parameters
   - Serialize/deserialize JobSpec JSON

2. **Deterministic Execution**
   - Route jobs to FFmpeg or Resolve based on source format
   - Execute clips sequentially within each job
   - Generate proxies with explicit validation

3. **Result Capture**
   - Serialize ExecutionResult JSON
   - Preserve full audit trail (commands, timing, errors)
   - Persist partial results on failure

4. **Watch Folder Automation**
   - Scan pending/ folder for JobSpecs
   - Execute jobs with bounded concurrency (default: 1 worker)
   - Move results to completed/ or failed/ atomically

5. **CLI Operations**
   - Validate JobSpec files
   - Execute single jobs
   - Run watch folder mode

### Phase-1 Constraints (ENFORCED)

1. **No Retries**
   - Execution is fail-fast
   - Errors are terminal and explicit
   - No automatic recovery or fallback

2. **No Async/Await**
   - All execution is synchronous
   - No coroutines, no event loops
   - Simple threading.Thread with bounded workers only

3. **No Progress Callbacks**
   - Batch-oriented, headless operation
   - No real-time progress updates
   - Results available only after completion

4. **No Mutable JobSpec**
   - JobSpec is immutable after validation
   - No runtime modifications
   - Creation and execution are separate phases

5. **No Dynamic Configuration**
   - All configuration is explicit in JobSpec
   - No hidden config files or environment variables
   - Changes require new JobSpec

6. **No Direct Engine Invocation**
   - ALL execution flows through `execution_adapter.execute_jobspec()`
   - Engine functions are private (`_execute_with_*`)
   - No bypassing validation or audit trails

---

## What is Phase-2?

Phase-2 represents the NEXT evolution of V2, introducing features that require
more sophisticated error handling, concurrency, and user interaction.

### Phase-2 Features (PLANNED, NOT YET AUTHORIZED)

1. **Retry Logic**
   - Automatic retry of transient failures
   - Exponential backoff for network/resource errors
   - Configurable retry policies

2. **Advanced Concurrency**
   - Unbounded thread pools
   - Async/await for I/O operations
   - Dynamic worker scaling

3. **Progress UI**
   - Real-time progress callbacks
   - WebSocket updates to operator UI
   - Estimated time remaining

4. **Smart Error Recovery**
   - Automatic fallback strategies
   - Partial re-execution of failed jobs
   - Resource availability detection

5. **Dynamic Job Scheduling**
   - Priority queues
   - Job preemption
   - Resource-aware scheduling

6. **Hot Configuration Reload**
   - Update settings without restart
   - Dynamic profile switching
   - Runtime environment changes

---

## Authorization Requirements

### Phase-1 Changes (FORBIDDEN)

**No changes to Phase-1 code are authorized** except:
- Critical security patches
- Data loss prevention fixes
- Compliance with this governance policy

Any Phase-1 change MUST:
1. Be approved by Technical Lead in writing
2. Include regression tests proving zero behavior change
3. Update this document with justification
4. Pass all Phase-1 lock enforcement tests

### Phase-2 Changes (GATED)

Phase-2 work MUST:
1. Occur in separate modules (e.g., `backend/v2/phase2/`)
2. NOT modify Phase-1 modules
3. NOT change Phase-1 execution behavior
4. Include governance document updates
5. Pass all Phase-1 regression tests

**Phase-2 authorization requires**:
- Technical design review
- Impact analysis on Phase-1 stability
- Rollback plan
- Documented upgrade path

---

## Common Accidental Violations

### ❌ "Just Add One Retry"

**Scenario**: FFmpeg fails intermittently. Developer adds retry logic to `execution_adapter.py`.

**Why Forbidden**: 
- Violates fail-fast principle
- Introduces non-determinism (same JobSpec, different results)
- Hides infrastructure problems
- Breaks audit trail (which attempt succeeded?)

**Correct Approach**:
- Fix infrastructure issue causing failures
- If retry is needed, implement in Phase-2 with full audit trail

### ❌ "Background Thread for Progress"

**Scenario**: Users want to see progress. Developer adds background thread to emit progress events.

**Why Forbidden**:
- Phase-1 is headless by design
- Background threads introduce race conditions
- Progress updates require mutable state
- Violates synchronous execution model

**Correct Approach**:
- Phase-1 users check results after completion
- Progress UI is a Phase-2 feature
- Design Phase-2 with proper event sourcing

### ❌ "Quick Fix: Modify JobSpec During Execution"

**Scenario**: Need to adjust output path based on runtime condition. Developer modifies JobSpec in-place.

**Why Forbidden**:
- JobSpec is immutable contract
- Breaks determinism
- Invalidates audit trail
- Creates hidden side effects

**Correct Approach**:
- JobSpec must be correct before execution
- If dynamic changes are needed, design Phase-2 with explicit mutations

### ❌ "Bypass Validation for Speed"

**Scenario**: Validation is slow. Developer calls `_execute_with_ffmpeg()` directly.

**Why Forbidden**:
- Skips validation guardrails
- Bypasses engine routing logic
- Breaks audit trail
- Creates security vulnerabilities

**Correct Approach**:
- Optimize validation, don't skip it
- ALL execution MUST flow through `execute_jobspec()`

### ❌ "Environment Variable for Config"

**Scenario**: Need different behavior in dev vs prod. Developer checks `os.environ["PROXX_MODE"]`.

**Why Forbidden**:
- Hidden configuration breaks determinism
- Same JobSpec produces different results
- Testing becomes non-reproducible
- Violates explicit configuration principle

**Correct Approach**:
- All configuration in JobSpec
- Environment-specific settings via different JobSpecs
- No hidden state or magic behavior

---

## Enforcement Mechanisms

### 1. Code-Level Enforcement

**Module**: `backend/v2/phase1_lock.py`

Provides:
- `assert_phase1_compliance()` - Runtime checks at entrypoints
- `check_module_compliance()` - Static analysis of source files
- `Phase1ViolationError` - Exception raised on violations

**Integration Points**:
- `execution_adapter.execute_jobspec()`
- `watch_folder_runner.run_watch_loop()`
- `cli.cmd_run()`
- `cli.cmd_watch()`

### 2. Regression Tests

**File**: `qa/test_v2_phase1_lock_enforcement.py`

Tests include:
- ✓ No forbidden keywords in Phase-1 modules
- ✓ No async/await in execution paths
- ✓ No direct engine invocation
- ✓ JobSpec is immutable
- ✓ No retry logic
- ✓ Bounded concurrency only
- ✓ No progress callbacks
- ✓ No mutable global state
- ✓ No hidden configuration
- ✓ No silent error suppression

### 3. CI/CD Integration

**Requirement**: All Phase-1 lock tests MUST pass before merge.

**Implementation**: `verify-v2` harness includes Phase-1 tests.

**Failure Response**:
- Pull requests are BLOCKED
- Developer notified of violation
- Technical Lead review required
- Governance policy cited

### 4. Code Review Checklist

Reviewers MUST check:
- [ ] Does this PR modify Phase-1 modules?
- [ ] If yes, is it a critical security/data loss fix?
- [ ] Do all Phase-1 lock tests pass?
- [ ] Is behavior change documented and justified?
- [ ] Has Technical Lead approved Phase-1 change?
- [ ] Are regression tests added for behavior change?

---

## Violation Response Protocol

### Automated Violations (CI Failure)

1. **Developer Notification**: CI failure with specific violation details
2. **Required Action**: Revert changes or move to Phase-2 modules
3. **Review**: Code review blocked until violation resolved
4. **Escalation**: If disagreement, Technical Lead decides

### Manual Violations (Code Review)

1. **Reviewer Flags**: Cite this document and specific constraint
2. **Developer Response**: Justify change OR move to Phase-2
3. **Technical Lead Review**: Final authority on Phase-1 changes
4. **Documentation**: Update governance document if policy changes

### Post-Merge Violations (Regression)

1. **Immediate Revert**: Phase-1 behavior change reverted automatically
2. **Root Cause Analysis**: How did violation slip through?
3. **Test Enhancement**: Add regression tests to prevent recurrence
4. **Process Update**: Update code review checklist

---

## Governance Authority

### Technical Lead Responsibilities

- Approve all Phase-1 changes
- Authorize Phase-2 feature development
- Resolve disputes about policy interpretation
- Update this document when policy evolves

### Developer Responsibilities

- Read and understand this policy before modifying V2 code
- Run Phase-1 lock tests locally before pushing
- Flag potential violations in code review
- Propose policy updates if constraints are invalid

### Code Reviewer Responsibilities

- Enforce this policy in all V2 PRs
- Reject PRs that violate Phase-1 constraints
- Escalate disputed violations to Technical Lead
- Ensure regression tests cover behavior changes

---

## Policy Evolution

This policy is LIVING and can evolve, but changes require:

1. **Technical Lead Approval** (in writing, with justification)
2. **Team Review** (async discussion, 48-hour minimum)
3. **Documentation Update** (this file + commit message)
4. **Test Updates** (regression tests for new constraints)

### Amendment History

| Date | Change | Justification | Approved By |
|------|--------|---------------|-------------|
| 2025-12-29 | Initial policy | Freeze Phase-1, enable Phase-2 development | Tech Lead |

---

## Quick Reference

### "Can I modify this file?"

| File | Phase-1? | Modifications Allowed? |
|------|----------|------------------------|
| `execution_adapter.py` | YES | ❌ No (except critical fixes) |
| `job_spec.py` | YES | ❌ No (except critical fixes) |
| `execution_results.py` | YES | ❌ No (except critical fixes) |
| `v2/watch_folder_runner.py` | YES | ❌ No (except critical fixes) |
| `v2/phase1_lock.py` | YES | ❌ No (except to add constraints) |
| `cli.py` | YES | ❌ No (except critical fixes) |
| `v2/phase2/*` | NO | ✅ Yes (Phase-2 development) |
| `headless_execute.py` | YES | ❌ No (except critical fixes) |

### "Can I add this feature?"

| Feature | Phase-1? | Action Required |
|---------|----------|-----------------|
| Retry logic | NO | Move to Phase-2 modules |
| Async/await | NO | Move to Phase-2 modules |
| Progress callbacks | NO | Move to Phase-2 modules |
| New validation rule | YES | Add with regression tests |
| New proxy profile | YES | Add with regression tests |
| JobSpec field mutation | NO | Move to Phase-2 or redesign |
| Direct engine call | NO | Never allowed |
| Hidden config file | NO | Never allowed |

---

## Appendix: Phase-1 Module List

### Critical Phase-1 Modules (FROZEN)

```
backend/
├── execution_adapter.py       # Single execution entrypoint
├── job_spec.py                # Immutable JobSpec contract
├── execution_results.py       # Result serialization
├── headless_execute.py        # Private engine implementations
├── cli.py                     # Operator entrypoints
└── v2/
    ├── phase1_lock.py         # Enforcement layer
    └── watch_folder_runner.py # Automation orchestrator
```

### Phase-1 Test Modules (FROZEN BEHAVIOR)

```
qa/
├── test_v2_phase1_lock_enforcement.py  # Regression guards
└── [existing V2 tests...]              # Behavior contracts
```

### Phase-1 Documentation (REFERENCE)

```
docs/
├── V2_PHASE_1_GOVERNANCE.md   # This document
├── ARCHITECTURE.md            # System design
└── CONSTRAINTS.md             # Technical constraints
```

---

## Contact

**Questions about this policy?**
- Review: Read ARCHITECTURE.md and CONSTRAINTS.md first
- Discuss: Async team discussion (GitHub issues)
- Escalate: Technical Lead (for approval decisions)

**Reporting Violations:**
- Automated: CI will catch and block
- Manual: Flag in code review with citation
- Post-merge: Immediate revert + RCA

---

**This document is the authoritative source for Phase-1 governance.**  
**All V2 development MUST comply with this policy.**  
**Phase-1 is FROZEN. Phase-2 is GATED. No exceptions.**
