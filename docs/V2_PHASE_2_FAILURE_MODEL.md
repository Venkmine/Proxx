# V2 Phase-2 Failure Model

**Status:** ARCHITECTURAL CONSTRAINT DOCUMENT  
**Scope:** Failure semantics for Proxx V2 scaled execution  
**Enforcement:** All future failure handling code MUST comply  

---

## Core Principle

**Every failure is explicit, owned, and auditable.**

There is no "best effort."  
There is no "graceful degradation."  
There is no "eventually consistent."

A job succeeds completely, or it fails explicitly.

---

## Failure Classes

### Pre-Dispatch Failures

**Definition:** Failures occurring before a job is assigned to a worker.

**Examples:**
- JobSpec validation failure
- Profile resolution failure  
- Input media not found
- Output path not writable
- Insufficient disk space detected at submission

**Ownership:** Job submission layer.

**Persistence Requirements:**
- Job file created with `status: failed`
- Error details in `error` field
- No execution artifacts exist
- Failure logged with job ID

**Operator Visibility:**
- Job appears in failed state
- Error message explains cause
- No ambiguity about whether execution was attempted

**Retry Eligibility:**
- Yes, operator may retry
- Retry creates a NEW job
- Original failed job remains unchanged
- New job has new job ID

---

### Dispatch Failures

**Definition:** Failures occurring during job assignment to a worker.

**Examples:**
- Job claimed but worker died before starting
- Worker rejected job after claim (resource exhaustion)
- Claim race lost (job already taken)
- Network failure during claim (distributed workers)

**Ownership:** Coordination layer.

**Persistence Requirements:**
- Job state reflects actual status
- If claimed but not started: job marked as `failed` with dispatch error
- If claim race lost: job remains `pending` for other workers
- Partial claims are not valid states

**Operator Visibility:**
- Failed dispatch is visible as job failure
- Claim race is invisible (job just stays pending)
- Worker identity logged at claim time

**Retry Eligibility:**
- Dispatch failure: Yes, operator may retry
- Claim race: Not a failure, job continues to next worker
- Dead worker: Job marked failed, operator retries explicitly

---

### Execution Failures

**Definition:** Failures occurring during job processing by a worker.

**Examples:**
- FFmpeg non-zero exit
- FFmpeg timeout
- Output file not created
- Corrupted output detected
- Worker crash during execution
- Disk full during write

**Ownership:** Worker executing the job.

**Persistence Requirements:**
- Job marked `failed` upon any execution failure
- Partial outputs may exist (not cleaned automatically)
- FFmpeg stderr captured and logged
- Exit code recorded
- Failure point identified (which clip, which stage)

**Operator Visibility:**
- Job status: `failed`
- Error field: specific failure description
- Logs: complete execution trace up to failure
- Partial outputs: visible in filesystem (operator decides cleanup)

**Retry Eligibility:**
- Yes, operator may retry
- Retry is new job, not "resume"
- No automatic resume from partial state
- Partial outputs from failed job are not inputs to retry

---

### Post-Execution Verification Failures

**Definition:** Failures occurring after encoding completes but before job marked successful.

**Examples:**
- Output file exists but is zero bytes
- Output file exists but is truncated
- Fingerprint calculation failed
- Output does not match expected codec
- Verification script returned error

**Ownership:** Verification layer (within worker).

**Persistence Requirements:**
- Job marked `failed`
- Output files preserved (for diagnosis)
- Verification details logged
- Distinction from execution failure is clear in logs

**Operator Visibility:**
- Job status: `failed`
- Error type: `verification_failed`
- Specific verification that failed
- Output files remain for inspection

**Retry Eligibility:**
- Yes, operator may retry
- Output files from failed job are not trusted
- Retry produces new outputs, does not verify old ones

---

## Failure Ownership Matrix

| Failure Class | Owned By | Logged By | Persisted By |
|--------------|----------|-----------|--------------|
| Pre-Dispatch | Submission layer | Submission layer | Submission layer |
| Dispatch | Coordination layer | Coordination layer | Coordination layer |
| Execution | Worker | Worker | Worker |
| Verification | Worker | Worker | Worker |

No failure is unowned.  
No failure is logged without persistence.  
No failure is persisted without logging.

---

## Retry Semantics

### Retries Are NEVER Implicit

The system does not retry automatically:
- Not after timeout
- Not after FFmpeg failure
- Not after network error
- Not after worker crash
- Not after verification failure
- Not ever

A failed job stays failed. An operator decides what happens next.

### Who May Trigger Retries

**Operators:** Yes
- Via explicit action (API call, CLI command, UI action)
- Must specify which failed job to retry
- May modify parameters before retry (creating new JobSpec)

**The System:** No
- No automatic retry logic
- No retry queues
- No "retry after N seconds"
- No "retry up to M times"

**External Schedulers:** Yes, if explicitly integrated
- Scheduler calls submission API
- Scheduler creates new job
- Scheduler is responsible for retry policy
- Proxx logs new job, not "retry of old job"

### What Metadata Must Be Preserved

When an operator retries a job:
- New job ID is generated
- New job references old job ID in `retried_from` field (optional)
- Original JobSpec is preserved (unless operator modifies)
- Original failure remains unchanged
- Original logs remain unchanged

The retry is a NEW job. It inherits specification, not history.

### How Retries Affect Fingerprints

**Fingerprints are not affected.**

- Fingerprint is calculated from output media
- Same input + same spec = same output = same fingerprint
- Retry that succeeds has same fingerprint as if first run succeeded
- Failed jobs have no fingerprint (no valid output)

Fingerprints are facts about outputs, not facts about execution history.

---

## Failure Propagation

### Within a Job

Clip failure → Job failure
- Clip 1 fails → Job fails
- Clip 2 is not attempted
- Partial outputs from Clip 1 may exist

Verification failure → Job failure
- Encoding completed
- Verification failed
- Job marked failed
- Outputs exist but are not trusted

### Across Jobs

**No propagation.**

- Job A failure has no effect on Job B
- No "dependent job" concept in Phase-2
- No job chaining
- No cascading failures

### To Operators

All failures are visible:
- In job status
- In job error field
- In system logs
- In any monitoring integration

Failures are never:
- Suppressed
- Aggregated into "partial success"
- Hidden behind "warnings"
- Deferred for later notification

---

## Failure State Machine

```
                ┌─────────────────┐
                │    PENDING      │
                └────────┬────────┘
                         │
          ┌──────────────┼──────────────┐
          │              │              │
          ▼              ▼              │
   ┌─────────────┐  ┌─────────────┐     │
   │   FAILED    │  │ PROCESSING  │     │
   │(pre-dispatch)│  └──────┬──────┘     │
   └─────────────┘         │             │
                    ┌──────┼──────┐      │
                    │      │      │      │
                    ▼      ▼      ▼      │
             ┌──────────┐ ┌──────────┐   │
             │ COMPLETE │ │  FAILED  │   │
             └──────────┘ │(execution)│   │
                          └──────────┘   │
                                         │
        (claim race: stays pending) ◄────┘
```

States are terminal or progressing:
- PENDING → PROCESSING (on claim)
- PENDING → FAILED (on pre-dispatch failure)
- PROCESSING → COMPLETE (on success)
- PROCESSING → FAILED (on any failure)

No backwards transitions.  
No "retry" state.  
No "queued for retry" state.

---

## Orphaned Job Handling

### Definition

A job is orphaned when:
- It is in PROCESSING state
- The worker that claimed it is no longer alive
- No progress has been made for extended time

### Detection

Orphan detection MUST be explicit:
- Heartbeat timeout from worker
- External health check failure
- Operator inspection

Orphan detection MUST NOT be automatic recovery:
- Detection logs the condition
- Detection may notify operators
- Detection does NOT reassign the job

### Resolution

Operators resolve orphans:
- Mark job as FAILED (manual)
- Investigate worker failure
- Retry job explicitly if appropriate

The system does not "heal" orphans automatically.

---

## Non-Goals

These are explicitly NOT objectives of the failure model:

### Auto-Healing
- Failed jobs are not automatically retried
- Orphaned jobs are not automatically reassigned
- Crashed workers are not automatically replaced
- Failure is failure. Humans decide.

### Partial Success
- A job with 5 clips where 4 succeed is FAILED
- "4/5 clips completed" is not a success state
- No "best effort" completion
- All or nothing.

### Silent Recovery
- No recovery without logging
- No "fixed it in the background"
- No state changes without operator visibility
- If it happened, it's logged.

### Failure Aggregation
- No "X% of jobs failed today"
- Each failure is individual
- No statistical smoothing
- No "acceptable failure rate"

### Deferred Failure
- No "will notify later"
- No "queued for analysis"
- Failure is immediate and visible
- Logging is synchronous with failure

---

## Phase-1 Compatibility

### Phase-1 Code Must Never Change

The following Phase-1 failure handling is frozen:
- FFmpeg exit code interpretation
- Output verification logic
- Error message generation
- Failure logging format

### Phase-2 Code Must Wrap, Not Replace

Phase-2 failure handling:
- Adds failure classes (dispatch failures)
- Does not redefine Phase-1 failure semantics
- Calls Phase-1 verification, adds coordination-level failures
- Phase-1 failure in Phase-2 context is still a failure

### Phase-1 Lock Enforcement Remains Valid

Phase-1 locks prevent concurrent execution failure:
- Lock acquisition failure is a dispatch failure
- Lock is released on any exit (success or failure)
- Lock state is logged

Phase-2 coordination does not bypass Phase-1 locking.

---

## Logging Requirements

Every failure MUST log:

1. **Timestamp:** When the failure occurred (ISO 8601)
2. **Job ID:** Which job failed
3. **Failure Class:** Pre-dispatch, dispatch, execution, verification
4. **Failure Reason:** Specific error message
5. **Worker ID:** Which worker was involved (if applicable)
6. **State Transition:** Previous state → failed

Every failure log entry MUST be written before:
- Job state file is updated
- Any response is returned
- Worker moves to next job

Logging failure is itself a failure:
- If logging fails, job fails
- Job is not marked complete if logging failed
- Logging is not "best effort"

---

## Document Authority

This document constrains all Phase-2 failure handling implementation.

Code that violates these constraints:
- Must not be merged
- Must not be deployed
- Must be reverted if discovered

No exception process exists for these invariants.
