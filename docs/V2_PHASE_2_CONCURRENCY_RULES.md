# V2 Phase-2 Concurrency Rules

**Status:** ARCHITECTURAL CONSTRAINT DOCUMENT  
**Scope:** Concurrency behavior rules for Proxx V2  
**Enforcement:** All future concurrent code MUST comply  

---

## Core Principle

**Concurrency is for throughput. Determinism is non-negotiable.**

Concurrent execution MAY occur between independent units of work.  
Concurrent execution MUST NOT alter observable behavior of any single unit.

---

## Concurrency Model

### Where Concurrency MAY Be Introduced

**Job-Level Parallelism:**
- Multiple JobSpecs MAY execute simultaneously
- Each job is an independent execution context
- Jobs do not communicate during execution
- Jobs do not share mutable state

**Worker-Level Parallelism:**
- Multiple workers MAY run simultaneously
- Each worker processes jobs independently
- Workers do not coordinate during job execution
- Workers MAY compete for unclaimed jobs (with atomic claim mechanism)

**I/O Parallelism Within Limits:**
- Concurrent reads from input media: ALLOWED
- Concurrent writes to distinct output paths: ALLOWED
- Concurrent writes to same output path: FORBIDDEN

### Where Concurrency MUST NOT Exist

**Within Single Job Execution:**
- Clips execute sequentially within a job
- FFmpeg processes execute one at a time per job
- Post-execution verification runs after execution completes
- No speculative or parallel clip processing

**During State Transitions:**
- Job state changes are atomic
- pending → processing: single atomic operation
- processing → complete/failed: single atomic operation
- No intermediate states visible to other actors

**Profile Resolution:**
- Profile lookup is a pure function
- No concurrent modification of profile definitions
- No race conditions in resolution logic

**Fingerprint Calculation:**
- Fingerprints are calculated from stable inputs
- No concurrent access to inputs during fingerprinting
- Fingerprint of a job is immutable once calculated

---

## Ordering Guarantees

### What MUST Remain Ordered

**Within a Single Job:**
1. JobSpec validation
2. Pre-execution checks
3. Clip 1 execution
4. Clip 2 execution (if present)
5. ... (all clips in order)
6. Post-execution verification
7. Result persistence
8. State transition to complete/failed

This order is inviolable. Logging reflects this order.

**Within Clip Execution:**
1. Input verification
2. FFmpeg command construction
3. FFmpeg execution
4. Output verification
5. Fingerprint calculation

**Failure Propagation:**
- Clip N failure prevents Clip N+1 execution
- Job failure prevents result file generation
- Verification failure marks job as failed, not complete

### What MAY Be Unordered

**Across Independent Jobs:**
- Job A and Job B may start in any order
- Job A and Job B may complete in any order
- Job A failure has no ordering relationship to Job B
- Log timestamps are the only ordering record

**Worker Startup:**
- Workers may start in any order
- Workers may claim jobs in any order
- No "primary" or "leader" worker concept

**Job Dispatch:**
- Jobs may be dispatched in any order
- No FIFO guarantee across jobs
- Operators may prioritize externally (not automatically)

### What Is Explicitly Undefined

**Completion Order:**
- Given jobs A, B, C started "simultaneously"
- Completion order is undefined
- System makes no promises about which finishes first

**Log Interleaving:**
- Logs from concurrent jobs may interleave
- Each log entry contains job ID
- Reconstruction requires filtering by job ID

**Failure Timing:**
- When multiple jobs fail concurrently
- Notification order is undefined
- Each failure is logged with timestamp

---

## Determinism Guarantees

### What Remains Deterministic

**Single Job Execution:**
- Same inputs → same outputs
- Same JobSpec → same FFmpeg commands
- Same media → same fingerprints
- Independent of concurrent activity

**Failure Conditions:**
- Same error conditions → same failure classification
- Same validation failure → same error message
- Reproducible given identical inputs

**Logging:**
- Same execution → same log entries (excluding timestamps)
- Log content is deterministic
- Log ordering within a job is deterministic

### What Becomes Non-Deterministic

**Nothing.**

Non-determinism is not introduced by concurrency.  
Concurrency affects WHEN things happen, not WHAT happens.

If concurrent execution produces different results than sequential execution,  
the concurrent implementation is incorrect.

### What Is Explicitly Undefined (Not Non-Deterministic)

**Ordering across jobs:**
- Not non-deterministic (would imply randomness)
- Undefined (not specified, not relied upon)
- Operators must not depend on cross-job ordering

---

## Back-Pressure & Saturation

### How Overload Is Detected

**Queue Depth:**
- Pending job count is observable
- High pending count indicates saturation
- Logged when thresholds are exceeded

**Worker Utilization:**
- Number of actively processing workers is observable
- All workers busy = system saturated
- Logged as warning when saturated

**Resource Exhaustion:**
- Disk space checked before job start
- Insufficient resources = job not started
- Logged with specific resource limitation

### What Happens When Limits Are Hit

**Job Queue Full:**
- New job submissions are REJECTED
- Rejection is immediate and explicit
- Error returned to caller with reason
- Job never enters pending state

**All Workers Busy:**
- New jobs remain in pending state
- No automatic scaling
- No job dropping
- Pending jobs wait indefinitely until worker available

**Resource Exhaustion:**
- Job is not started
- Job remains pending or is marked failed (depending on detection point)
- Explicit log entry with resource details
- No partial execution

### What NEVER Happens Automatically

**Silent Drops:**
- Jobs are never silently removed
- Failed jobs remain visible
- Pending jobs remain pending
- Every job has a terminal state

**Auto-Retries:**
- Failed jobs are not automatically retried
- Retry requires explicit operator action
- No "background retry" mechanism
- No retry limits (because no auto-retry)

**Quality Degradation:**
- No "fast mode" under pressure
- No reduced quality to clear queue
- No parameter changes based on load
- Spec is spec. Always.

**Job Reordering:**
- No priority elevation under pressure
- No starvation prevention
- No fairness algorithms
- Jobs execute when workers take them

**Automatic Scaling:**
- No worker auto-spawn
- No cloud scaling integration
- No load-based provisioning
- Operators provision. System uses.

---

## Race Condition Prevention

### Job Claiming

Job claim MUST be atomic:
- Check pending status
- Assign to worker
- Mark as processing

All three operations occur atomically or not at all.

Implementation options (to be chosen in implementation phase):
- Filesystem rename (atomic on POSIX)
- Database transaction
- Distributed lock with fencing token

### State File Updates

State files are never partially written:
- Write to temporary file
- Atomic rename to final location
- Read always sees complete state

### Output File Handling

Output paths are exclusive:
- Worker verifies output path is empty before start
- Worker fails if output exists
- No append, only create
- Collision = failure, not merge

---

## Phase-1 Compatibility

### Phase-1 Code Must Never Change

The following Phase-1 components are frozen:
- Single-job execution logic
- Clip-by-clip processing order
- Verification sequences
- Lock file semantics within a job

### Phase-2 Code Must Wrap, Not Replace

Concurrency code:
- Coordinates between Phase-1 execution instances
- Does not modify Phase-1 execution internals
- Treats each job execution as atomic black box
- Adds concurrency AROUND jobs, not WITHIN jobs

### Phase-1 Lock Enforcement Remains Valid

Job-level locks from Phase-1:
- Still prevent concurrent execution of same job
- Are acquired before Phase-1 code runs
- Are released after Phase-1 code completes
- Are respected by all concurrent workers

Phase-2 concurrency operates at job-dispatch level.  
Phase-1 locks operate at job-execution level.  
These are complementary, not conflicting.

---

## Testing Requirements

Concurrent code MUST pass:

1. **Sequential Equivalence Test:**
   - N jobs executed concurrently
   - Same N jobs executed sequentially
   - Results are identical (modulo timestamps)

2. **Failure Isolation Test:**
   - Job A fails
   - Concurrent Job B continues
   - Job B result unaffected

3. **Claim Atomicity Test:**
   - Two workers race for same job
   - Exactly one succeeds
   - The other sees "already claimed"

4. **Saturation Behavior Test:**
   - More jobs than workers
   - All jobs eventually complete
   - No jobs lost or duplicated

---

## Document Authority

This document constrains all Phase-2 concurrency implementation.

Code that violates these constraints:
- Must not be merged
- Must not be deployed
- Must be reverted if discovered

No exception process exists for these invariants.
