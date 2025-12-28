# V2 Watch Folder Runner

Deterministic watch-folder automation for JobSpec JSON files with atomic filesystem semantics.

## Overview

The watch folder runner is a deterministic, sequential processor for V2 JobSpec files. It uses standard OS filesystem primitives (atomic `rename()`) and explicit state transitions for reliable, auditable automation.

### Core Principles

1. **Use boring, battle-tested filesystem behavior only**
2. **No retries, no guessing, no silent recovery**
3. **JobSpec is the only source of truth**
4. **UI must never control execution**
5. **Output correctness beats convenience**

---

## Folder Structure

```
watch/
├── pending/              # JobSpecs awaiting processing
│   └── job1.json         # Drop JobSpec files here
├── running/              # Currently processing (max 1 at a time)
│   └── job2.json         # Only present during active execution
├── completed/            # Successfully completed JobSpecs
│   ├── job0.json         # The original JobSpec
│   └── job0.result.json  # Execution result
└── failed/               # Failed JobSpecs
    ├── job_bad.json
    └── job_bad.result.json
```

### Folder Purposes

| Folder | Purpose |
|--------|---------|
| `pending/` | Drop new JobSpec JSON files here for processing |
| `running/` | Single JobSpec being processed (atomic transition from pending/) |
| `completed/` | JobSpecs that executed successfully (with result files) |
| `failed/` | JobSpecs that failed for any reason (with result files) |

---

## Lifecycle Transitions

```
                  ┌──────────────┐
                  │   pending/   │ ◄── Drop JobSpec here
                  │   job.json   │
                  └──────┬───────┘
                         │
                    atomic_move()
                         │
                  ┌──────▼───────┐
                  │   running/   │ ◄── Max 1 job at a time
                  │   job.json   │
                  └──────┬───────┘
                         │
                  validate + execute
                         │
              ┌──────────┴──────────┐
              │                     │
        (success)              (failure)
              │                     │
      ┌───────▼───────┐     ┌───────▼───────┐
      │  completed/   │     │    failed/    │
      │   job.json    │     │   job.json    │
      │   job.result  │     │   job.result  │
      └───────────────┘     └───────────────┘
```

### State Transition Rules

1. **Only `.json` files in `pending/` are considered** (not `.result.json`)
2. **Files are moved using atomic `os.rename()` only**
3. **Before processing: validate all source files exist**
4. **Result JSON is ALWAYS written**, even on failure
5. **No file is processed unless it is provably complete**

---

## JobSpec Contract Validation

Watch folders accept **only valid JobSpecs** with strict contract enforcement:

| Validation | Failure Behavior |
|------------|------------------|
| Missing `jobspec_version` | Moved to `failed/` with reason |
| Version mismatch | Moved to `failed/` with reason |
| Unknown fields in JSON | Moved to `failed/` with reason |
| Invalid enum values | Moved to `failed/` with reason |
| Missing source files | Moved to `failed/` with reason |

**The runner will never attempt "best guess" execution.** Invalid specs fail fast and explicitly.

---

## Quick Start

```bash
# Single scan (process all pending, then exit)
python -m backend.v2.watch_folder_runner ./watch --once

# Continuous polling (every 2 seconds)
python -m backend.v2.watch_folder_runner ./watch

# Custom poll interval
python -m backend.v2.watch_folder_runner ./watch --poll-seconds 10
```

---

## Startup/Restart Behavior

On startup, the runner performs crash recovery:

```
On startup:
  - Scan running/ for any leftover JobSpecs
  - Move each to failed/ with reason "runner interrupted"
  - Write .result.json with recovery metadata
```

This handles the case where the runner was killed mid-execution. **There is no attempt to resume or retry** - the job is explicitly marked as failed.

### Recovery Result Example

```json
{
  "job_id": "abc12345",
  "final_status": "FAILED",
  "clips": [],
  "_recovery": {
    "reason": "runner interrupted",
    "recovered_at": "2025-12-28T12:00:00+00:00",
    "original_path": "/path/to/watch/running/job.json"
  }
}
```

---

## Execution Rules

| Rule | Description |
|------|-------------|
| **Synchronous only** | One job at a time, no background processing |
| **Sequential only** | Jobs processed in sorted filename order |
| **Fail-fast** | Stop on first clip error within a job |
| **No retries** | Failed jobs stay in failed/ |
| **Preserve artifacts** | Partial outputs are kept on failure |

---

## Output Guarantees

1. **Output file must exist AND be > 0 bytes** before a clip can be COMPLETED
2. **No silent overwrite** - naming collisions are hard failures
3. **Result JSON is ALWAYS written**, even on validation failures
4. **Atomic moves only** - no partial file copies

---

## Result File Format

Each processed JobSpec produces a `.result.json` alongside it:

```json
{
  "job_id": "abc12345",
  "final_status": "COMPLETED",
  "clips": [
    {
      "source_path": "/path/to/source.mov",
      "resolved_output_path": "/path/to/output/proxy.mov",
      "status": "COMPLETED",
      "exit_code": 0,
      "output_exists": true,
      "output_size_bytes": 12345678,
      "ffmpeg_command": ["ffmpeg", "-i", "..."],
      "started_at": "2025-12-28T12:00:00+00:00",
      "completed_at": "2025-12-28T12:00:05+00:00",
      "duration_seconds": 5.0
    }
  ],
  "started_at": "2025-12-28T12:00:00+00:00",
  "completed_at": "2025-12-28T12:00:05+00:00",
  "duration_seconds": 5.0,
  "_metadata": {
    "jobspec_path": "/path/to/watch/running/job.json",
    "result_written_at": "2025-12-28T12:00:05+00:00"
  }
}
```

### Status Values

| Status | Meaning |
|--------|---------|
| `COMPLETED` | All clips processed successfully, outputs verified |
| `FAILED` | At least one clip failed (fail-fast) |
| `PARTIAL` | Validation failed before execution could start |

---

## Failure Modes

### Explicit Failure Handling

| Failure Type | Behavior |
|--------------|----------|
| Invalid JSON | → `failed/` with parse error in result |
| Invalid JobSpec | → `failed/` with validation error |
| Missing sources | → `failed/` with missing file list |
| FFmpeg error | → `failed/` with exit code and stderr |
| Output not created | → `failed/` with verification error |
| Runner crash | → On restart, `running/` → `failed/` |

### Common Failure Reasons

```
"Missing source files: /path/to/missing.mov"
"FFmpeg not found. Install FFmpeg to use headless execution."
"FFmpeg exited with code 1"
"Output file does not exist or has zero size"
"runner interrupted"
```

---

## CLI Reference

```
usage: watch_folder_runner.py [-h] [--once] [--poll-seconds N] folder

V2 Watch Folder Runner - Deterministic JobSpec automation

positional arguments:
  folder             Root watch directory (contains pending/, running/, etc.)

options:
  -h, --help         show this help message and exit
  --once             Perform a single scan and exit (don't poll)
  --poll-seconds N   Seconds between folder scans (default: 2)
```

### Examples

```bash
# Continuous watch with default 2s polling
python -m backend.v2.watch_folder_runner ./watch

# Single scan for cron jobs or CI
python -m backend.v2.watch_folder_runner ./watch --once

# Slower polling for production
python -m backend.v2.watch_folder_runner ./watch --poll-seconds 30
```

---

## How to Reset

### Reprocess All Jobs

```bash
# Move everything back to pending
mv ./watch/completed/*.json ./watch/pending/ 2>/dev/null || true
mv ./watch/failed/*.json ./watch/pending/ 2>/dev/null || true

# Delete all result files
rm -f ./watch/completed/*.result.json
rm -f ./watch/failed/*.result.json

# Run again
python -m backend.v2.watch_folder_runner ./watch --once
```

### Retry a Failed Job

```bash
# Move specific job back to pending
mv ./watch/failed/my_job.json ./watch/pending/

# Delete the result file
rm -f ./watch/failed/my_job.result.json

# Run again
python -m backend.v2.watch_folder_runner ./watch --once
```

---

## Integration Examples

### Cron Job (Single Scan)

```cron
# Process watch folder every 5 minutes
*/5 * * * * cd /path/to/proxx && python -m backend.v2.watch_folder_runner /path/to/watch --once
```

### Systemd Service (Continuous)

```ini
[Unit]
Description=Proxx V2 Watch Folder Runner
After=network.target

[Service]
Type=simple
WorkingDirectory=/path/to/proxx
ExecStart=/path/to/python -m backend.v2.watch_folder_runner /path/to/watch --poll-seconds 10
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### Docker Entrypoint

```bash
#!/bin/bash
cd /app
exec python -m backend.v2.watch_folder_runner /data/watch --poll-seconds 5
```

---

## Explicit Non-Goals

These are **intentionally not implemented** in V2 Phase 1:

- ❌ No UI controls
- ❌ No progress bars
- ❌ No pause/cancel
- ❌ No AI readiness detection
- ❌ No cloud services
- ❌ No proprietary SDKs
- ❌ No FSEvents/inotify (polling only for Phase 1)
- ❌ No concurrent execution
- ❌ No retry logic

---

## Troubleshooting

### JobSpec Not Being Processed

1. Verify file is in `pending/` (not root folder)
2. Verify file ends in `.json` (not `.result.json`)
3. Check if duplicate exists in `running/`
4. Verify JSON is valid: `python -m json.tool job.json`

### FFmpeg Errors

1. Ensure FFmpeg is installed: `which ffmpeg`
2. Check the `.result.json` for exact `ffmpeg_command`
3. Run the command manually to debug
4. Check `failure_reason` in clip results

### Job Stuck in running/

This should not happen under normal operation. If it does:

```bash
# Manually move to failed
mv ./watch/running/stuck_job.json ./watch/failed/

# Or restart the runner (it will auto-recover)
python -m backend.v2.watch_folder_runner ./watch --once
```

---

## V2 Phase 1 Context

This runner is part of V2 Phase 1 (Reliable Proxy Engine). It provides:

- ✅ Deterministic watch folder automation
- ✅ Atomic filesystem state transitions
- ✅ Explicit crash recovery
- ✅ Complete audit trail via result files
- ✅ Foundation for future service architecture
- ✅ CI/CD integration capability

Future phases may add:

- Real-time filesystem watching (FSEvents/inotify)
- Concurrent execution
- Priority queuing
- Remote job submission
