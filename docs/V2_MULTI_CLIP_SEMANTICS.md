# V2 Multi-Clip Semantics

**Status:** Implemented in V2 Phase 1 Step 3  
**Date:** 2025-12-28

## Overview

JobSpec now supports multiple source clips through the `sources` field. This document explains the design decisions, execution semantics, and rationale for the sequential-first approach.

## Key Design Principles

### 1. Deterministic Ordering
- `sources` is an **ordered list** of source file paths
- Execution order is **preserved** and deterministic
- Same JobSpec input → same execution order → same results
- No implicit grouping, shuffling, or re-ordering

### 2. Sequential Execution (Phase 1)
Multi-clip jobs execute **one source at a time** without concurrency:
- Simplifies implementation and debugging
- Eliminates thread safety and resource contention issues
- Enables clear causality and reproducibility
- Provides a stable foundation for future concurrency

### 3. Independent Outputs
Each source produces **exactly one output file**:
- No batching or merging logic
- Naming tokens resolve per-source deterministically
- `{index}` token provides stable indexing: 000, 001, 002...
- `{source_name}` resolves to each source's filename

### 4. Fail-Fast with Partial Results
When a source fails:
- Execution stops immediately (no wasted resources)
- Partial results are returned (completed + failed source)
- CLI exits non-zero if any clip fails
- All results are logged for debugging

## Execution Flow

```
JobSpec with sources: [A.mov, B.mov, C.mov]
         ↓
   Validate entire JobSpec
         ↓
   Process sequentially:
         ↓
   [1/3] Execute A.mov → COMPLETED (a_proxy.mov)
         ↓
   [2/3] Execute B.mov → COMPLETED (b_proxy.mov)
         ↓
   [3/3] Execute C.mov → FAILED (exit code 1)
         ↓
   Return partial results: [SUCCESS, SUCCESS, FAILED]
         ↓
   CLI exits non-zero (failure detected)
```

## Why Sequential First?

### Advantages of Sequential Execution
1. **Simplicity:** No locks, no queues, no thread pools
2. **Debuggability:** Clear causality, no race conditions
3. **Predictability:** Same input always produces same behavior
4. **Resource Control:** Single FFmpeg process at a time (no CPU/memory contention)
5. **Foundation:** Easy to add concurrency later without breaking existing behavior

### When Concurrency Will Be Added (V2 Phase 2+)
Future phases may introduce:
- Configurable parallelism (`max_concurrent_jobs` setting)
- Watch folder batch processing
- Thread pool execution for independent sources
- Partial progress reporting for long-running jobs

**Critical:** Concurrency will be **opt-in** and backward-compatible. Sequential execution remains the default.

## CLI Behavior

### Single-Source JobSpec
```bash
$ python -m backend.headless_execute single_job.json
[SUCCESS] Job abc123 (12.3s) → /output/clip_proxy.mov
  Output: /output/clip_proxy.mov
  Duration: 12.3s
```

### Multi-Source JobSpec
```bash
$ python -m backend.headless_execute multi_job.json

Multi-Clip Job: def456
Total Clips: 3
Processed: 2/3

[1/3] COMPLETED clip_a.mov (10.2s)
     → /output/clip_a_proxy.mov
[2/3] FAILED clip_b.mov (2.1s)
     Exit Code: 1
     Last stderr:
       [error] Invalid codec parameters
       [error] Conversion failed

Result: One or more clips failed
```

Exit code: 0 if all clips succeed, non-zero otherwise.

## Enabling Future Automation

This design enables watch folder processing and batch automation:

### Watch Folder Example (Future)
```python
# Hypothetical watch folder agent
while True:
    new_clips = scan_watch_folder()
    if new_clips:
        job_spec = JobSpec(
            sources=new_clips,  # Multi-clip batch
            output_directory="/output",
            codec="prores_proxy",
            container="mov",
            resolution="half",
            naming_template="{source_name}_proxy",
        )
        results = execute_multi_job_spec(job_spec)
        log_results(results)
```

### CI/CD Integration Example (Future)
```bash
# Generate JobSpec from test dataset
generate_test_jobspec.py --sources test_clips/*.mov > test_job.json

# Execute batch
python -m backend.headless_execute test_job.json

# Check exit code for CI pass/fail
echo $?
```

## API Contract

### `execute_multi_job_spec(job_spec: JobSpec) -> List[ExecutionResult]`

**Input:**
- `job_spec`: JobSpec with one or more sources

**Output:**
- List of `ExecutionResult`, one per source (may be partial if stopped early)

**Behavior:**
1. Validates entire JobSpec once (raises `JobSpecValidationError` on failure)
2. Iterates `sources` in order
3. For each source:
   - Creates a per-source JobSpec view
   - Executes using `execute_job_spec` (synchronous)
   - Captures `ExecutionResult`
4. Stops on first failure (fail-fast)
5. Returns all results (successful + failed)

**No Exceptions on Execution Failure:**
- Execution failures do NOT raise exceptions
- Check `result.success` or `result.exit_code` for each result

## Testing Multi-Clip Jobs

### Example JobSpec (3 sources)
```json
{
  "job_id": "test001",
  "sources": [
    "/input/clip_a.mov",
    "/input/clip_b.mov",
    "/input/clip_c.mov"
  ],
  "output_directory": "/output",
  "codec": "prores_proxy",
  "container": "mov",
  "resolution": "half",
  "naming_template": "{source_name}_proxy_{index}",
  "fps_mode": "same-as-source",
  "created_at": "2025-12-28T12:00:00Z"
}
```

### Expected Outputs
```
/output/clip_a_proxy_000.mov
/output/clip_b_proxy_001.mov
/output/clip_c_proxy_002.mov
```

## Summary

- **Multi-clip support:** Sequential execution of ordered sources
- **No concurrency yet:** Simplicity and determinism first
- **Fail-fast:** Stop on first failure, return partial results
- **Deterministic tokens:** {index}, {source_name} resolve per-source
- **Foundation for automation:** Enables watch folders, CI/CD, batch processing
- **Backward compatible:** Single-source jobs work unchanged

Concurrency is intentionally deferred to V2 Phase 2+ to avoid premature complexity.
