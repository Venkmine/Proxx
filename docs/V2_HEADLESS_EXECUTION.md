# V2 Headless Execution

## Overview

Headless execution is a V2 Phase 1 feature that enables JobSpec-based transcoding without any UI involvement. This is a **parallel execution path** that lives alongside V1 flows—it does not replace or modify existing functionality.

## Why Headless Execution?

The V1 architecture tightly couples job execution to the UI layer:

1. Jobs are created via API endpoints triggered by user actions
2. Progress is reported via WebSocket to the frontend
3. Job state is managed through the UI-driven lifecycle

This works well for interactive use but creates barriers for automation:

- **Watch folders** cannot trigger jobs without UI
- **Batch processing** requires manual interaction
- **CI/CD pipelines** cannot integrate easily
- **Scripted workflows** need to go through the API

Headless execution breaks this coupling by providing a direct path from JobSpec to output file.

## Why UI is Not Involved

The headless path deliberately excludes UI concerns:

| Aspect | V1 (UI-Driven) | V2 Headless |
|--------|----------------|-------------|
| Job creation | API endpoint → Database → UI | Direct function call |
| Progress reporting | WebSocket → Frontend | None (synchronous) |
| State management | Database + UI polling | Return value only |
| Error handling | Displayed in UI | Exception/result object |
| Output location | UI-configured | JobSpec-defined |

This separation enables:

- **Simpler testing** — No mock API/WebSocket needed
- **Faster execution** — No database overhead
- **Predictable behavior** — Same inputs = same outputs
- **Composability** — Function can be called from anywhere

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      JobSpec (JSON)                         │
│  - sources, output_directory, codec, container, etc.        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  execute_job_spec()                         │
│  1. Validate JobSpec                                        │
│  2. Resolve output paths/tokens                             │
│  3. Build FFmpeg command                                    │
│  4. Execute subprocess                                      │
│  5. Return ExecutionResult                                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   ExecutionResult                           │
│  - job_id, ffmpeg_command, exit_code                        │
│  - stdout, stderr, output_path, output_exists               │
│  - started_at, completed_at                                 │
└─────────────────────────────────────────────────────────────┘
```

## Usage

### Programmatic

```python
from backend.headless_execute import execute_job_spec
from backend.job_spec import JobSpec

# Create a JobSpec
job_spec = JobSpec(
    sources=["/path/to/input.mov"],
    output_directory="/path/to/output",
    codec="prores_proxy",
    container="mov",
    resolution="half",
    naming_template="{source_name}_{codec}",
)

# Execute (raises JobSpecValidationError on validation failure)
result = execute_job_spec(job_spec)

# Check result
if result.success:
    print(f"Output: {result.output_path}")
else:
    print(f"Failed (exit {result.exit_code}): {result.stderr}")
```

### CLI

```bash
# Execute a JobSpec from JSON file
python -m backend.headless_execute /path/to/jobspec.json
```

Example JobSpec JSON:

```json
{
  "sources": ["/Users/editor/footage/interview_01.mov"],
  "output_directory": "/Users/editor/proxies",
  "codec": "prores_proxy",
  "container": "mov",
  "resolution": "half",
  "naming_template": "{source_name}_proxy"
}
```

## Enabling Watch Folders & Automation

With headless execution in place, future V2 phases can implement:

### Watch Folder Processing

```python
def process_watch_folder(folder: Path, job_template: JobSpec):
    for video_file in folder.glob("*.mov"):
        job_spec = JobSpec(
            sources=[str(video_file)],
            output_directory=str(job_template.output_directory),
            codec=job_template.codec,
            container=job_template.container,
            resolution=job_template.resolution,
            naming_template=job_template.naming_template,
        )
        result = execute_job_spec(job_spec)
        log_result(result)
```

### Batch Queue Processing

```python
def process_queue(job_specs: List[JobSpec]):
    results = []
    for job_spec in job_specs:
        result = execute_job_spec(job_spec)
        results.append(result)
    return results
```

### CI/CD Integration

```yaml
# GitHub Actions example
- name: Generate test proxies
  run: |
    python -m backend.headless_execute test_fixtures/proxy_job.json
```

## Error Handling

Headless execution follows explicit error handling:

| Error Type | Behavior |
|------------|----------|
| Validation failure | Raises `JobSpecValidationError` |
| FFmpeg not found | Raises `JobSpecValidationError` |
| FFmpeg execution failure | Returns `ExecutionResult` with `exit_code != 0` |
| Output not created | Returns `ExecutionResult` with `output_exists = False` |

**No retries** — Automation wrappers can implement their own retry logic.

**No error swallowing** — All failures are visible in the result.

## Constraints (V2 Phase 1)

- Single-source execution only (first source used if multiple provided)
- Synchronous execution (no async/parallel)
- No progress callbacks (full execution must complete)
- No integration with V1 database/job tracking

These constraints will be relaxed in subsequent V2 phases.

## File Locations

- **Implementation**: `backend/headless_execute.py`
- **JobSpec definition**: `backend/job_spec.py`
- **Documentation**: `docs/V2_HEADLESS_EXECUTION.md` (this file)

## Related Documents

- `backend/job_spec.py` — JobSpec dataclass definition
- V2 Phase 1 planning documents (internal)
