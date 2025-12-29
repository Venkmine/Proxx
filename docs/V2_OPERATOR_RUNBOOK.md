# V2 Operator Runbook

**Status:** Operational Reference  
**Updated:** 29 December 2025  
**For:** V2 Phase 1 and Phase 2

This document defines how to run Proxx V2 in supported deployment modes.

It does not describe troubleshooting procedures, optimization strategies, or future capabilities.

---

## Supported Deployment Modes

Proxx V2 supports three deployment modes. All modes share identical execution behavior.

### Mode A — Local Operator Machine

**Description:** Single workstation with interactive control.

**Preconditions:**
- FFmpeg installed and on PATH
- DaVinci Resolve installed (if processing RAW formats)
- Python 3.11 or later
- Filesystem is local or mounted with atomic rename support
- Write permissions on output directories

**Job Submission:**
- CLI: `proxx run <jobspec.json>`
- Watch folder: Place JobSpec JSON in `<watch_folder>/pending/`

**Result Location:**
- CLI: Result JSON written to stdout
- Watch folder: `<watch_folder>/completed/<jobspec>.result.json` (success) or `<watch_folder>/failed/<jobspec>.result.json` (failure)

**Failure Indicators:**
- CLI exits with non-zero code
- Watch folder moves JobSpec to `failed/` with result JSON
- Result JSON contains `"status": "FAILED"` or `"status": "PARTIAL"`
- Result JSON contains `validation_error` (pre-execution) or `failure_reason` per clip (execution)

**Operator Actions:**
- Review result JSON for failure details
- Verify FFmpeg/Resolve versions match requirements
- Check filesystem permissions and disk space
- Fix JobSpec errors and resubmit
- Do NOT retry without changing inputs

---

### Mode B — Headless Worker Node

**Description:** Dedicated processing server without interactive UI.

**Preconditions:**
- FFmpeg installed and on PATH
- DaVinci Resolve installed (if processing RAW formats)
- Python 3.11 or later
- Filesystem is local or mounted with atomic rename support
- Write permissions on output directories
- No interactive session required

**Job Submission:**
- CLI: `proxx run <jobspec.json>` (via script or automation)
- Watch folder: `proxx watch <watch_folder>` running as service/daemon

**Result Location:**
- CLI: Result JSON written to stdout, exit code indicates success/failure
- Watch folder: Result JSON in `completed/` or `failed/` subdirectories

**Failure Indicators:**
- Exit code non-zero
- Result JSON status is FAILED or PARTIAL
- Logs contain error messages (stderr)

**Operator Actions:**
- Monitor exit codes and result JSON status
- Collect logs for audit trail
- Alert on failures via external monitoring
- Do NOT retry automatically
- Fix root cause before resubmission

---

### Mode C — CI / Automation Runner

**Description:** Ephemeral execution environment (GitHub Actions, Jenkins, etc.).

**Preconditions:**
- FFmpeg installed in CI environment
- DaVinci Resolve installed (if processing RAW formats)
- Python 3.11 or later
- JobSpecs generated externally before execution
- Sufficient disk space for source + output media
- Artifacts explicitly preserved before teardown

**Job Submission:**
- Generate JobSpec programmatically or from template
- Execute via: `proxx run <jobspec.json>`
- Capture stdout (result JSON) and exit code

**Result Location:**
- Result JSON on stdout
- Exit code: 0 = success, non-zero = failure
- Archive result JSON and output media before environment teardown

**Failure Indicators:**
- Exit code non-zero
- Result JSON contains validation_error or clip-level failure_reason
- Output files not produced or size = 0 bytes

**Operator Actions:**
- Fail CI job on non-zero exit code
- Log result JSON for debugging
- Preserve partial outputs for analysis
- Fix JobSpec or environment before retry
- Do NOT implement automatic retries

---

## Mode Invariants

These rules apply to **all supported modes**:

- Execution engine behavior is identical
- Same JobSpec + same environment = same output
- No mode-specific optimizations
- No retry logic
- No silent fallback paths
- Exit codes and result JSON are authoritative

---

## Environment Variables

Proxx V2 does not use environment variables for execution control.

All execution parameters come from JobSpec JSON.

Optional environment variables (informational only):
- `PROXX_LOG_LEVEL`: Adjust logging verbosity (default: INFO)

**Critical:** Changing FFmpeg or Resolve versions changes output. This is an operator responsibility.

---

## JobSpec Submission

### Creating JobSpecs

JobSpecs are JSON files adhering to the schema defined in `backend/job_spec.py`.

Required fields:
- `jobspec_version`: "1.0.0"
- `created_at`: ISO8601 timestamp
- `sources`: Array of source file paths (absolute or relative)
- `output_dir`: Absolute path to output directory
- `output_name_template`: Naming template with optional tokens
- `codec`: Target codec (e.g., "h264", "prores422hq")
- `container`: Target container (e.g., "mp4", "mov")
- `fps_mode`: "preserve_source", "force_23_976", or "force_<rate>"
- `proxy_profile`: Proxy profile identifier
- `user_metadata`: Optional key-value pairs (informational only)

### Validating JobSpecs

Before execution:
```bash
proxx validate <jobspec.json>
```

Validation checks:
- Source files exist
- Output directory exists and is writable
- Codec/container combinations are valid
- Naming tokens are resolvable
- Multi-clip naming is unambiguous (if multiple sources)

Exit code 0 = valid, non-zero = invalid.

---

## Execution Outputs

### Result JSON Structure

Every execution produces a result JSON:

```json
{
  "job_id": "unique-job-id",
  "jobspec_version": "1.0.0",
  "status": "COMPLETED" | "FAILED" | "PARTIAL",
  "started_at": "2025-12-29T10:00:00Z",
  "ended_at": "2025-12-29T10:05:00Z",
  "total_clips": 1,
  "successful_clips": 1,
  "failed_clips": 0,
  "clips": [
    {
      "source_path": "/path/to/source.mov",
      "output_path": "/path/to/output.mp4",
      "status": "COMPLETED" | "FAILED",
      "started_at": "2025-12-29T10:00:00Z",
      "ended_at": "2025-12-29T10:05:00Z",
      "ffmpeg_command": "ffmpeg -i ...",
      "exit_code": 0,
      "failure_reason": null | "validation_error" | "execution_error" | "output_missing"
    }
  ],
  "validation_error": null | "error message",
  "jobspec_fingerprint": "sha256:...",
  "execution_engine": "ffmpeg" | "resolve",
  "worker_id": null | 0,
  "concurrency_mode": "sequential" | "parallel"
}
```

### Status Semantics

- **COMPLETED:** All clips processed successfully, all outputs verified (exist + size > 0)
- **FAILED:** Pre-execution validation failed OR first clip failed (fail-fast)
- **PARTIAL:** Some clips completed, at least one failed

### Failure Reasons (Per Clip)

- **validation_error:** Source missing, output dir inaccessible, invalid config
- **execution_error:** FFmpeg/Resolve returned non-zero exit code
- **output_missing:** Engine succeeded but output file missing or size = 0
- **interrupted:** Runner was interrupted (watch folder only)

---

## Watch Folder Semantics

### Directory Structure

```
<watch_folder>/
├── pending/              # JobSpecs awaiting processing
│   └── job1.json
├── running/              # JobSpec(s) being processed
│   └── job2.json         # Only during active execution
├── completed/            # Successfully completed JobSpecs
│   ├── job0.json
│   └── job0.result.json  # Execution result alongside JobSpec
├── failed/               # Failed JobSpecs
│   ├── job_bad.json
│   └── job_bad.result.json
```

### Watch Folder Behavior

**Startup:**
- Any files in `running/` are moved to `failed/` with reason "runner interrupted"
- This handles crash recovery deterministically

**Execution (Phase 2: Bounded Concurrency):**
- Jobs dequeued from `pending/` in sorted filename order
- Up to N workers process jobs concurrently (default: 1)
- Each job executes synchronously internally (sequential clips)
- JobSpec moved to `running/` during execution
- On success: JobSpec + result JSON moved to `completed/`
- On failure: JobSpec + result JSON moved to `failed/`
- Fail-fast within each job: first clip error stops that job

**Concurrency Flags:**
```bash
proxx watch <folder>                    # Sequential (max-workers=1)
proxx watch <folder> --max-workers 4    # Parallel (4 concurrent jobs)
```

**Ordering Guarantees:**
- Jobs dequeued in deterministic sorted order
- Within each job, clips processed sequentially
- No cross-job dependencies or coordination

**Polling:**
```bash
proxx watch <folder> --poll-seconds 5   # Poll every 5 seconds
proxx watch <folder> --once             # Process pending jobs once and exit
```

---

## Failure Handling

### Pre-Execution Validation Failures

**Symptoms:**
- CLI exits immediately with validation error
- Watch folder moves JobSpec to `failed/` without `running/`
- Result JSON contains `validation_error` field

**Causes:**
- Source file missing
- Output directory missing or not writable
- Invalid codec/container combination
- Naming template tokens unresolvable
- Multi-clip job without index/source_name token

**Operator Action:**
- Fix JobSpec errors
- Verify filesystem paths and permissions
- Resubmit corrected JobSpec

---

### Execution Failures

**Symptoms:**
- CLI exits with non-zero code after execution starts
- Watch folder moves JobSpec to `failed/` after processing
- Result JSON contains clip-level `failure_reason`

**Causes:**
- FFmpeg/Resolve returned non-zero exit code
- Output file not created or size = 0
- Disk space exhausted
- Codec not supported by installed FFmpeg/Resolve version

**Operator Action:**
- Review `ffmpeg_command` in result JSON
- Run FFmpeg command manually for debugging
- Check disk space and filesystem health
- Verify FFmpeg/Resolve version compatibility
- Fix environment or JobSpec and resubmit

---

### Partial Completion

**Symptoms:**
- Result JSON status = "PARTIAL"
- Some clips completed, some failed
- Partial outputs preserved

**Causes:**
- Fail-fast behavior: first clip error stops job
- Mixed format jobs with engine routing conflicts

**Operator Action:**
- Identify failed clip from result JSON
- Fix failure cause
- Create new JobSpec for failed clips only
- Do NOT retry entire job if some clips succeeded

---

## What Operators Must NOT Do

The following actions are **forbidden**:

- **Retry automatically without fixing root cause**  
  Retrying the same JobSpec will produce the same failure.

- **Modify JobSpec during execution**  
  JobSpec is immutable. Create a new JobSpec instead.

- **Infer missing configuration**  
  All parameters must be explicit in JobSpec.

- **Implement silent fallback paths**  
  Failures must be loud and visible.

- **Use unsupported deployment modes**  
  Only modes A, B, C are supported.

- **Override execution engine selection**  
  Engine routing is deterministic based on source formats.

- **Retry failed clips within the same job**  
  Create a new JobSpec for retries.

- **Modify pending JobSpecs in watch folder**  
  Risk of race conditions. Remove and resubmit instead.

---

## Version Pinning

Proxx V2 does not pin FFmpeg or Resolve versions.

Operators MUST pin versions explicitly at deployment time.

**Recommended:**
- Use Docker images with pinned FFmpeg version
- Pin Resolve version in install scripts
- Document versions in deployment manifest
- Test outputs when upgrading versions

**Critical:** Output differences due to version changes are NOT bugs. They are expected behavior.

---

## Exit Codes

### CLI Exit Codes

- **0:** Success (all clips completed, outputs verified)
- **1:** Validation error (pre-execution failure)
- **2:** Execution error (FFmpeg/Resolve failure)
- **3:** Partial completion (some clips succeeded, some failed)
- **4:** System error (permissions, disk space, etc.)

### Watch Folder Exit Codes

- **0:** Shutdown via signal (normal)
- **1:** Fatal error (watch folder path invalid, permissions issue)

---

## Logs and Audit Trail

### Log Locations

- **CLI:** stderr
- **Watch folder:** stdout + stderr
- **Result JSON:** Authoritative execution record

### What Logs Contain

- JobSpec fingerprint
- Execution engine selected
- FFmpeg/Resolve command executed
- Exit codes
- Timing information
- Failure reasons

### What Logs Do NOT Contain

- FFmpeg/Resolve stdout (not captured by default)
- Progress information (no progress tracking)
- Retry attempts (no retries)

---

## Concurrency Model (Phase 2)

### Worker Slots

- Default: 1 worker (sequential)
- Configurable: `--max-workers N`
- Each worker processes one job at a time
- Jobs dequeued in sorted order

### Failure Isolation

- One job failing does NOT stop other running jobs
- Each job fails fast independently on first clip error
- Result JSON contains worker_id for debugging

### No Dynamic Scaling

- Worker count fixed at startup
- No auto-scaling
- No load balancing
- No job stealing

---

## Operator Checklist

Before running Proxx V2:

- [ ] FFmpeg installed and on PATH
- [ ] Resolve installed (if processing RAW formats)
- [ ] Python 3.11+ installed
- [ ] Output directories exist with write permissions
- [ ] Source files accessible from worker environment
- [ ] Filesystem supports atomic renames
- [ ] FFmpeg/Resolve versions pinned and documented
- [ ] Monitoring configured for exit codes and result JSON
- [ ] Logs collection configured
- [ ] Disk space monitored

---

## Support Boundaries

Proxx V2 provides:
- Deterministic execution
- Explicit failure reporting
- Structured result JSON
- Exit codes

Proxx V2 does NOT provide:
- Automatic retries
- Error recovery
- Troubleshooting guidance beyond facts
- Optimization recommendations
- Version management

---

## Further Reading

- [V2_PACKAGING_AND_DEPLOYMENT.md](V2_PACKAGING_AND_DEPLOYMENT.md) - Deployment modes and environment assumptions
- [V2_PHASE_1_LOCKED.md](V2_PHASE_1_LOCKED.md) - Phase 1 capabilities and guarantees
- [V2_WATCH_FOLDERS.md](V2_WATCH_FOLDERS.md) - Watch folder semantics and concurrency
- [backend/job_spec.py](../backend/job_spec.py) - JobSpec schema and validation

---

**END OF RUNBOOK**
