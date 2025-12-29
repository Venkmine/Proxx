# V2 Phase-2 Scaling Architecture

**Status:** ARCHITECTURAL CONSTRAINT DOCUMENT  
**Scope:** Scaling behavior rules for Proxx V2  
**Enforcement:** All future scaling code MUST comply  

---

## Core Principle

**Scaling increases THROUGHPUT, not INTELLIGENCE.**

Scaling is the ability to process more work in parallel. It is NOT:
- Smarter decision-making
- Adaptive behavior
- Self-healing logic
- Quality optimization

A scaled system produces identical results to an unscaled system, faster.

---

## Invariants

### Scaling Must Not Change JobSpec Meaning

A JobSpec executed on 1 worker or 100 workers:
- Produces the same output files
- Produces the same execution logs
- Produces the same fingerprints
- Fails for the same reasons

If scaling changes what a JobSpec means, the scaling is broken.

### Scaling Must Not Change Execution Results

Given identical:
- Input media
- JobSpec
- Profile configuration

The output MUST be byte-identical regardless of:
- Number of workers
- Worker assignment
- Execution order across jobs
- Time of execution

### Scaling Must Not Introduce Hidden State

All state MUST be:
- Visible in logs
- Persisted to disk
- Queryable by operators

Forbidden hidden state:
- In-memory queues without persistence
- Worker-local caches that affect behavior
- Coordinator state not reflected in job files
- "Soft" state that recovers differently than it fails

---

## Allowed Scaling Axes

### Parallel JobSpec Execution: ALLOWED

Multiple JobSpecs MAY execute concurrently if:
- Each JobSpec operates on independent media
- No shared output paths between concurrent jobs
- Each job has isolated working directories
- Failure of one job does not affect another

### Parallel Clip Execution Within a Job: FORBIDDEN (Phase-2)

A single JobSpec with multiple clips:
- Executes clips sequentially
- Maintains deterministic ordering
- Logs in clip order

Rationale: Clip-level parallelism introduces ordering complexity that Phase-2 does not address.

### Distributed Workers: ALLOWED WITH CONSTRAINTS

Workers MAY run on separate machines if:
- Filesystem access is consistent (shared storage or explicit copy)
- No worker depends on another worker's in-progress state
- All coordination happens through persistent job files
- Worker identity is logged with every action

---

## Forbidden Scaling Axes

### JobSpec Mutation: FORBIDDEN

A JobSpec MUST NOT be modified after creation:
- No "optimized" rewrites
- No automatic profile substitution
- No parameter inference
- No splitting or merging of jobs

The JobSpec that enters execution is the JobSpec that executes.

### Dynamic Profile Resolution: FORBIDDEN

Profile resolution happens at JobSpec creation time:
- Profile names resolve to profile definitions ONCE
- Resolved profiles are frozen into the JobSpec
- No runtime profile lookup
- No "latest profile" semantics

### Heuristic Retries: FORBIDDEN

The system does not retry based on:
- Error message patterns
- Historical success rates
- Time of day
- Worker load

Retries are explicit operator actions, never automatic.

### Adaptive Encoding: FORBIDDEN

Encoding parameters MUST NOT change based on:
- Content analysis
- Available resources
- Previous job outcomes
- Network conditions

The JobSpec specifies exact encoding. The system executes exactly that.

---

## Execution Topology

### Single JobSpec → Multiple Workers: FORBIDDEN

A JobSpec is an atomic unit of work:
- One worker claims a job
- That worker executes all clips
- That worker writes all outputs
- That worker reports final status

Job splitting across workers is not supported.

### Worker Isolation Rules

Each worker:
- Has exclusive access to its claimed jobs
- Does not read state from other workers
- Does not write to paths owned by other workers
- Fails independently without cascading

### Shared-Nothing Requirements

Workers share:
- Input media (read-only)
- Profile definitions (read-only, resolved at JobSpec creation)
- Output storage (write to non-overlapping paths)

Workers do NOT share:
- Working directories
- Process state
- Partial outputs
- Error recovery logic

### Filesystem Constraints

For distributed execution:
- Input media must be accessible to assigned worker
- Output path must be writable by assigned worker
- Job state files must be on shared storage OR replicated
- No reliance on local filesystem for coordination

---

## Non-Goals

These are explicitly NOT objectives of Phase-2 scaling:

### "Smart" Scheduling
- No load-based job routing
- No affinity rules
- No capability matching
- Jobs go to workers. Workers execute. Done.

### Auto-Healing
- No automatic job reassignment
- No worker health scoring
- No graceful degradation
- Failure is failure. Operators decide what happens.

### Adaptive Quality
- No quality/speed tradeoffs
- No "fast mode" under load
- No degraded output to meet deadlines
- The spec says what quality. That quality happens or fails.

### Resource Optimization
- No memory-based batching
- No CPU-aware scheduling
- No network-aware routing
- Resources are provisioned. Jobs use them or fail.

---

## Phase-1 Compatibility

### Phase-1 Code Must Never Change

The following Phase-1 components are frozen:
- `ProfileSpec` class and validation
- `JobSpec` structure and serialization
- `ExecutionResult` semantics
- Single-job execution path
- Fingerprint calculation logic

### Phase-2 Code Must Wrap, Not Replace

Scaling code:
- Calls Phase-1 execution, does not reimplement
- Adds coordination around Phase-1, not inside
- Treats Phase-1 as a black box per-job
- Inherits all Phase-1 validation and logging

### Phase-1 Lock Enforcement Remains Valid

The Phase-1 execution lock:
- Still prevents concurrent execution of same job
- Still logs lock acquisition/release
- Still fails if lock cannot be acquired
- Is not bypassed by scaling infrastructure

Phase-2 coordination happens BEFORE job dispatch, not during execution.

---

## Verification

A scaling implementation is correct if:

1. Single-job execution produces identical results scaled or unscaled
2. All job outcomes are visible in persistent storage
3. No job disappears silently
4. No job produces different output based on scale
5. Operators can reconstruct full history from logs
6. Removing scaling code restores single-worker behavior exactly

---

## Document Authority

This document constrains all Phase-2 scaling implementation.

Code that violates these constraints:
- Must not be merged
- Must not be deployed
- Must be reverted if discovered

No exception process exists for these invariants.
