# Fabric Phase 1: Read-Only Ingestion

**Status:** Implemented  
**Date:** 2025-12-29

---

## Overview

Fabric is a read-only ingestion and querying layer for Proxx execution results.

**Fabric consumes facts. Fabric does not decide.**

---

## What Fabric Ingests

Fabric reads `JobExecutionResult` JSON files produced by Proxx's V2 execution engine.

For each job, Fabric captures:

- Job ID
- Final status (COMPLETED / FAILED / PARTIAL)
- Canonical proxy profile used
- Validation stage (if applicable)
- Validation error (if applicable)
- Execution engine used (ffmpeg / resolve)
- Resolve preset (if applicable)
- JobSpec version
- Start and completion timestamps
- Per-clip outputs with:
  - Source path
  - Output path
  - Output existence and size
  - Status and failure reason
  - Engine and profile metadata

---

## What Fabric Explicitly Ignores

Fabric does NOT capture:

- Execution state (running / pending / queued)
- Retry attempts or retry decisions
- Orchestration metadata
- User intent or preferences
- Derived health metrics
- "Insights" or recommendations

**If it's not in the JobExecutionResult JSON, Fabric doesn't know it.**

---

## Why Fabric is Read-Only

Fabric is a **consumer**, not a **producer**.

### Constraints

1. **No JobSpec mutation** - Fabric never modifies job specifications
2. **No retries** - Fabric never triggers re-execution
3. **No orchestration** - Fabric never decides what to run next
4. **No execution triggers** - Fabric never starts jobs
5. **No heuristics** - Fabric never infers missing data
6. **No "insights"** - Fabric never interprets what results mean

### Guarantees

- Ingestion is **idempotent**: re-ingesting same file produces same result
- Ingestion has **no side effects**: reading results never changes Proxx state
- Ingestion is **fail-loud**: malformed data is rejected with clear errors

---

## What Questions Fabric Can Answer

Fabric answers questions about **observed facts**:

✅ "Have we seen this fingerprint before?"  
✅ "What happened to job X?"  
✅ "Which jobs used profile Y?"  
✅ "Which outputs exist and why?"  
✅ "How many jobs failed with engine Z?"  
✅ "What was the execution duration for job X?"

---

## What Questions Fabric MUST NOT Answer

Fabric does NOT answer questions about **future actions**:

❌ "Should we retry this job?"  
❌ "What's the best profile to use?"  
❌ "Is this job healthy?"  
❌ "What should we do next?"  
❌ "Which jobs are likely to fail?"  
❌ "What's the recommended action?"

**Fabric observes. Humans decide.**

---

## Architecture

### Components

```
fabric/
  __init__.py         # Package declaration
  models.py           # Immutable data structures (IngestedJob, IngestedOutput)
  ingestion.py        # Read-only parsing of JobExecutionResult JSON
  index.py            # Simple in-memory indexes
  queries.py          # Read-only query API
```

### Data Flow

```
JobExecutionResult.json (Proxx)
        ↓
    ingestion.ingest_execution_result()
        ↓
    IngestedJob (immutable)
        ↓
    FabricIndex.add_job()
        ↓
    FabricQueries.get_*() → Facts
```

---

## Usage Example

```python
from fabric.ingestion import ingest_execution_result
from fabric.index import FabricIndex
from fabric.queries import FabricQueries

# Create index
index = FabricIndex()

# Ingest a result
job = ingest_execution_result("/path/to/proxx_job_abc123.json")
index.add_job(job)

# Query facts
queries = FabricQueries(index)

# Did this job succeed?
if queries.get_job("abc123").success:
    print("Job completed successfully")

# What jobs used this profile?
jobs = queries.get_jobs_by_profile("PRX_STD_H264")
print(f"Found {len(jobs)} jobs using PRX_STD_H264")

# What outputs were produced?
outputs = queries.get_outputs_for_job("abc123")
for output in outputs:
    print(f"{output.source_path} → {output.output_path}")
```

---

## Forbidden Patterns

The following patterns are **explicitly forbidden** in Fabric code:

### Execution Triggers

```python
# FORBIDDEN
def ingest_and_retry(path: str):
    job = ingest_execution_result(path)
    if job.final_status == "FAILED":
        trigger_retry(job.job_id)  # ❌ NO
```

### Mutation

```python
# FORBIDDEN
def repair_job(job: IngestedJob):
    if job.validation_error:
        job.validation_error = None  # ❌ NO (immutable)
        fix_and_rerun(job)           # ❌ NO (no execution)
```

### Inference

```python
# FORBIDDEN
def ingest_with_defaults(path: str):
    job = ingest_execution_result(path)
    if not job.engine_used:
        job.engine_used = "ffmpeg"  # ❌ NO (no guessing)
```

### Health Scoring

```python
# FORBIDDEN
def get_job_health_score(job_id: str) -> float:
    job = queries.get_job(job_id)
    return compute_health(job)  # ❌ NO (no interpretation)
```

---

## Testing

Tests are in `qa/test_fabric_ingestion.py`.

Tests verify:

- ✅ Successful ingestion of valid ExecutionResult
- ✅ Rejection of malformed results
- ✅ Idempotent ingestion
- ✅ Correct indexing
- ✅ No dependency on Proxx internals
- ✅ No mutation of ingested data

All tests use synthetic JSON. No real media files.

---

## Phase 1 Limitations

### Fingerprints

**Phase 1:** `fingerprint` field is always `None`  
**Reason:** Fingerprint verification not yet implemented in Proxx V2  
**Future:** Phase 2 will populate fingerprints from verification results

### Storage

**Phase 1:** In-memory index only  
**Future:** Phase 2 may add persistent storage (SQLite / JSON store)

### Retry Tracking

**Phase 1:** No retry tracking (one result per job_id)  
**Future:** Phase 3 may track multiple execution attempts

---

## Declarative Principles

Fabric is **declarative**:

- Fabric declares what it observes
- Fabric does not prescribe what to do
- Fabric provides facts for human or automated decision-making
- Fabric never contains policy or business logic

**Separation of concerns:**
- Proxx executes jobs
- Fabric observes results
- Humans (or future orchestrators) decide next actions

---

## No Roadmap

This document describes **Phase 1 as implemented**.

Future phases are not promised or implied.

If Fabric grows, it will be documented in new phase documents.

---

## Summary

**Fabric reads facts. That's it.**

- Ingests JobExecutionResult JSON
- Indexes immutable observations
- Enables querying and comparison
- Never influences execution

Fabric is a telescope, not a steering wheel.

---

END.
