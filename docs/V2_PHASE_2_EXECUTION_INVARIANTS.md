# V2 Phase-2 Execution Invariants

**Status:** NON-NEGOTIABLE CONSTRAINT DOCUMENT  
**Scope:** Execution semantics for all Proxx V2 and later phases  
**Enforcement:** No Phase-2 scaling, concurrency, persistence, UI, or orchestration change may violate these invariants  

---

## Declaration

These invariants define the immutable semantics of execution in Proxx V2 and all subsequent phases.

They are **NON-NEGOTIABLE**.

They apply to all Phase-2 and later work including but not limited to:
- Concurrency implementation
- Distributed execution
- Persistence layers
- UI/API design
- Orchestration logic
- Performance optimization
- Retry mechanisms
- Queue management
- Result aggregation
- Metric collection

No architectural change, no performance optimization, no user request, and no operational convenience justifies violating these invariants.

---

## What Execution IS

Execution is the deterministic transformation of a validated JobSpec into execution outputs according to a fixed algorithm.

**Execution is:**
- A pure function of JobSpec content
- Deterministic for a given JobSpec and engine
- Single-threaded within a job context
- Auditable through structured results
- Verifiable through output inspection

**Execution consists of:**
1. JobSpec validation
2. Engine selection based on JobSpec parameters
3. Sequential processing of all clips in JobSpec order
4. Output verification for each clip
5. Generation of ExecutionResult

This sequence is fixed. This sequence is atomic from the perspective of JobSpec semantics.

---

## What Execution is NOT

Execution is not orchestration.  
Execution is not retry logic.  
Execution is not scheduling.  
Execution is not optimization.  
Execution is not inference.  
Execution is not UI-driven.

Execution does not decide when to run.  
Execution does not decide whether to retry.  
Execution does not choose between equivalent configurations.  
Execution does not interpret user intent beyond JobSpec content.  
Execution does not respond to external state changes during execution.

---

## Execution Invariants (Hard Rules)

### Same Input → Same Behavior

For identical JobSpec content and identical engine version, execution behavior is identical.

**This means:**
- Same FFmpeg command is constructed
- Same clip order is processed
- Same validation rules are applied
- Same verification checks are performed
- Same failure semantics apply

**This forbids:**
- Time-based behavior variation
- Load-based behavior variation
- History-based behavior variation
- Environment-based behavior variation (beyond engine version)

### JobSpec Immutability

Once execution begins, the JobSpec being executed is immutable.

**This means:**
- No parameter can change during execution
- No clip list can be modified during execution
- No output path can change during execution
- No profile resolution can change during execution

**This forbids:**
- Reactive parameter adjustment
- Dynamic clip reordering
- Speculative optimization
- Progressive profile refinement

### No Hidden Defaults

Every parameter affecting execution behavior is explicit in the JobSpec or explicit in profile resolution.

**This means:**
- No implicit fallbacks
- No "smart defaults" based on content
- No inference from media properties beyond explicit analysis
- No environment variable influence on execution semantics

**This forbids:**
- "Helpful" parameter inference
- Codec auto-detection overriding JobSpec
- Quality adjustment based on source characteristics
- Bitrate optimization based on content analysis

### No Implicit Retries

Execution attempts exactly one run per clip.

**This means:**
- FFmpeg is invoked exactly once per clip
- Failure terminates execution immediately
- No automatic retry on transient errors
- No partial retry of failed segments

**This forbids:**
- Automatic retry on timeout
- Automatic retry on non-zero exit
- Speculative re-execution with different parameters
- Background retry attempts

### No Background Mutation

Execution does not modify any state outside of:
1. Creating output files in specified output directory
2. Writing to execution logs
3. Returning ExecutionResult

**This means:**
- No JobSpec modification
- No profile modification
- No shared cache updates
- No global state changes

**This forbids:**
- "Learning" from execution outcomes
- Profile refinement based on success rates
- Cache warming during execution
- Implicit queue manipulation

### No Time-Based Behavior

Execution behavior does not vary based on when it occurs.

**This means:**
- Same JobSpec executed now or later produces same outputs
- No time-of-day optimization
- No deadline-driven parameter changes
- No expiration of JobSpec validity (beyond media file existence)

**This forbids:**
- Priority-based parameter adjustment
- "Rush job" quality reduction
- Scheduled optimization strategies
- Time-window-specific behavior

### No Cross-Job Influence

Execution of Job A does not influence execution of Job B.

**This means:**
- Jobs are independent execution contexts
- No shared mutable state between jobs
- No coordination between concurrent jobs
- No resource arbitration affecting semantics

**This forbids:**
- Load balancing affecting job parameters
- Batch optimization across jobs
- Shared intermediate results
- Inter-job dependency injection

### No Heuristic Engine Switching

Engine selection is deterministic based on JobSpec parameters.

**This means:**
- Same JobSpec always selects same engine
- No fallback to alternative engines on failure
- No performance-based engine switching
- No availability-based engine switching

**This forbids:**
- "Try GPU, fall back to CPU"
- "Detect GPU failure, switch to proxy"
- "Load too high, use faster codec"
- Engine A timeout triggers Engine B attempt

---

## Scaling Constraints

Scaling mechanisms MUST preserve all execution invariants.

### Parallelism Must Not Change Semantics

Multiple workers executing multiple jobs concurrently produce the same per-job results as sequential execution.

**This means:**
- Job A executed alone produces identical results to Job A executed concurrently with Job B
- Worker count does not affect ExecutionResult content
- Scheduling order does not affect individual job outcomes

**This forbids:**
- Resource contention altering job behavior
- Cross-job optimization
- Parallel execution changing failure semantics

### Ordering Must Not Change Outcomes

The order in which jobs are claimed from a queue does not affect individual job results.

**This means:**
- Job A produces identical results whether processed first or last
- FIFO vs. LIFO vs. priority queue does not change ExecutionResult
- Dequeue order is an orchestration concern, not an execution concern

**This forbids:**
- Position-dependent parameter adjustment
- "Later jobs learn from earlier jobs"
- Ordering-dependent validation rules

### Failure of One Job Must Not Affect Others

Job A failure has no semantic impact on Job B execution.

**This means:**
- Job B proceeds normally regardless of Job A outcome
- No shared failure state
- No cascading parameter changes
- No cross-job retry triggers

**This forbids:**
- "Stop all jobs on first failure" (orchestration may do this, execution does not)
- "Adjust remaining jobs based on failure pattern"
- Shared resource exhaustion changing behavior (must fail explicitly)

### Shared-Nothing Execution Guarantee

Jobs do not communicate, coordinate, or share mutable state during execution.

**This means:**
- Each job has isolated execution context
- No inter-job synchronization points
- No shared intermediate files
- No cross-job caching

**This forbids:**
- Batch-level optimizations
- Shared preprocessing stages
- Inter-job result reuse
- Coordinated output generation

---

## Failure Semantics

Failure types and meanings are preserved across all scaling scenarios.

### Failure Types Are Preserved Verbatim

The classification of a failure (validation, execution, verification) does not change based on concurrency or orchestration context.

**This means:**
- FFmpeg timeout in single-worker mode is FFmpeg timeout in N-worker mode
- Validation failure semantics are identical across all queue implementations
- Failure reasons are execution-intrinsic, not context-dependent

**This forbids:**
- "Timeout in concurrent mode becomes resource exhaustion failure"
- "Validation failure reclassified as dispatch failure"
- Context-dependent error messages

### Retries Are Never Implicit

No component in the execution path automatically retries a failed operation.

**This means:**
- FFmpeg non-zero exit terminates execution
- Output verification failure is final
- Network errors are not retried
- Transient errors are not distinguished from permanent errors at execution level

**This forbids:**
- Automatic retry loops within execution
- Speculative re-execution
- Background retry attempts
- "Smart" retry logic based on error type

### Failure Meaning Cannot Change Under Scaling

A failure in single-worker mode has the same operational meaning in N-worker mode.

**This means:**
- Operator response to failure X is identical regardless of concurrency level
- Failure X always indicates the same root cause class
- Diagnostic information is consistent across execution contexts

**This forbids:**
- Scaling-dependent failure interpretation
- "This failure means different things in distributed mode"
- Context-sensitive failure recovery procedures

---

## Observability Guarantees

Execution observability is consistent and invariant across all scaling scenarios.

### ExecutionResult Is the Sole Source of Truth

The ExecutionResult structure completely describes execution outcome.

**This means:**
- No execution details are "implied" or "obvious"
- No external state is required to interpret results
- ExecutionResult alone is sufficient for audit
- Success/failure determination is unambiguous from ExecutionResult

**This forbids:**
- "Check logs to determine actual outcome"
- "Query database to see what really happened"
- "ExecutionResult says success but actually failed"
- Result fields whose meaning depends on external context

### Logs Are Supplemental Only

Logs provide diagnostic detail but do not define execution outcomes.

**This means:**
- ExecutionResult and logs may diverge in detail level but never in conclusion
- Missing logs do not invalidate ExecutionResult
- Log parsing is not required to determine success/failure
- Logs enhance debugging but are not required for correctness

**This forbids:**
- "Job succeeded but logs show failure"
- "Parse logs to determine actual exit code"
- Logs as the authoritative record of execution state

### No Metric May Redefine Success/Failure

Metrics, dashboards, and aggregations reflect ExecutionResult content; they do not reinterpret it.

**This means:**
- Metric "success" matches ExecutionResult status COMPLETED
- Metric "failure" matches ExecutionResult status FAILED
- No derived metrics change the definition of successful execution

**This forbids:**
- "Job completed but metric shows failure"
- "Success rate calculated differently than ExecutionResult aggregation"
- Dashboard redefining what "completed" means

---

## Explicit Forbidden Changes

These changes violate execution invariants and are explicitly forbidden:

### Forbidden: Adaptive Quality Adjustment

**Example:** "Reduce bitrate automatically if job is taking too long."

**Violation:** No time-based behavior; JobSpec immutability.

### Forbidden: Heuristic Engine Fallback

**Example:** "Try GPU encoding, fall back to CPU on failure."

**Violation:** No heuristic engine switching; no implicit retries.

### Forbidden: Smart Retry Logic

**Example:** "Retry FFmpeg on timeout but not on codec error."

**Violation:** No implicit retries; failure types are preserved verbatim.

### Forbidden: Cross-Job Optimization

**Example:** "If Job A and Job B use same source, transcode once."

**Violation:** Shared-nothing execution guarantee; same input → same behavior.

### Forbidden: Load-Based Parameter Changes

**Example:** "Use faster preset when queue depth exceeds threshold."

**Violation:** No cross-job influence; JobSpec immutability.

### Forbidden: Priority-Driven Semantic Changes

**Example:** "High-priority jobs skip validation steps."

**Violation:** No time-based behavior; same input → same behavior.

### Forbidden: Partial Success States

**Example:** "Job partially succeeded: 3 of 5 clips completed."

**Violation:** No background mutation; failure propagation is immediate.

### Forbidden: Speculative Execution

**Example:** "Start next clip while previous clip is verifying."

**Violation:** Execution sequence is fixed; no speculation.

### Forbidden: Result Reinterpretation

**Example:** "Treat timeout as success if output file exists."

**Violation:** ExecutionResult is sole source of truth; failure meaning cannot change.

### Forbidden: Implicit Profile Updates

**Example:** "Update profile defaults based on success rate."

**Violation:** No background mutation; profile resolution is deterministic.

### Forbidden: Context-Dependent Validation

**Example:** "Relax validation rules during off-peak hours."

**Violation:** No time-based behavior; same input → same behavior.

### Forbidden: Metric-Driven Behavior Changes

**Example:** "If error rate exceeds 10%, switch to conservative settings."

**Violation:** No cross-job influence; execution is not optimization.

---

## Relationship to Existing Docs

This document extends and reinforces the following architectural constraints:

### V2_PHASE_1_LOCKED.md

**Relationship:** Phase-1 defines what execution does; this document defines what execution **is**.

**Key Connection:** Execution guarantees in Phase-1 are now invariants; they apply to all future phases.

### V2_PHASE_2_CONCURRENCY_RULES.md

**Relationship:** Concurrency rules define where parallelism may occur; this document defines what parallelism must preserve.

**Key Connection:** "Concurrency is for throughput. Determinism is non-negotiable." is restated here as execution invariants.

### V2_PHASE_2_FAILURE_MODEL.md

**Relationship:** Failure model defines failure classes and ownership; this document defines failure semantics invariance.

**Key Connection:** Failure types and meanings are execution-intrinsic; scaling cannot change them.

### OBSERVABILITY_PRINCIPLES.md

**Relationship:** Observability principles define system-wide transparency rules; this document applies them to execution.

**Key Connection:** ExecutionResult as sole source of truth; logs over guesses; no silent failure.

---

## Enforcement

These invariants are enforced through:

1. **Code Review:** All execution-touching changes reviewed against this document
2. **Testing:** Test suites verify invariant preservation across scaling scenarios
3. **Documentation:** All design docs reference and comply with these invariants
4. **Architecture Review:** Major changes undergo architectural review for invariant compliance

Violations are rejected immediately.

No exceptions.

---

**End of Document**
