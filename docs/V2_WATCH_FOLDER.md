# V2 Watch Folder Runner

Minimal, deterministic watch-folder automation for JobSpec JSON files.

## Overview

The watch folder runner is a simple, sequential processor for V2 JobSpec files. It is **NOT** a daemon product—it is a deterministic runner suitable for TechOps use and future service wrapping.

### Design Principles

1. **DETERMINISTIC**: Same input folder always produces same behavior
2. **IDEMPOTENT**: Safe to re-run; never re-executes processed JobSpecs
3. **SEQUENTIAL**: No concurrency; process one JobSpec at a time
4. **EXPLICIT**: Failures are preserved as `.result.json` with status=FAILED
5. **AUDITABLE**: Manifest tracks SHA256 hashes for change detection

---

## Quick Start

```bash
# Single scan (process all pending, then exit)
python -m backend.watch_folder_runner ./jobs --once

# Continuous polling (every 2 seconds)
python -m backend.watch_folder_runner ./jobs

# Custom poll interval
python -m backend.watch_folder_runner ./jobs --poll-seconds 10
```

---

## Folder Structure

After running the watch folder processor, your folder will have this structure:

```
watch_folder/
├── job1.json                    # Pending JobSpec (will be processed)
├── job2.json                    # Pending JobSpec
├── job1.result.json             # Execution result (created after processing)
├── processed/                   # Successfully completed JobSpecs
│   └── job0.json               # Moved here after COMPLETED
├── failed/                      # Failed JobSpecs
│   └── job_bad.json            # Moved here after FAILED
└── processed_manifest.json      # SHA256 hashes for idempotency
```

### File Types

| File | Description |
|------|-------------|
| `*.json` | Pending JobSpec files to be processed |
| `*.result.json` | Execution results (sibling to original JobSpec location) |
| `processed/*.json` | JobSpecs that completed successfully |
| `failed/*.json` | JobSpecs that failed execution |
| `processed_manifest.json` | Idempotency tracking manifest |

---

## Idempotency Rules

The runner ensures safe re-runs through these rules:

### Skip Conditions

A JobSpec is **skipped** if:

1. **Result file exists**: `<jobspec_name>.result.json` already exists
2. **Manifest hash match**: The path + SHA256 hash is already in the manifest

### Re-process Conditions

A JobSpec is **re-processed** if:

1. **File modified**: The SHA256 hash differs from the manifest entry
2. **No prior record**: Not in manifest and no result file exists

### Manifest Structure

```json
{
  "version": 1,
  "entries": {
    "/absolute/path/to/job.json": {
      "sha256": "abc123...",
      "processed_at": "2025-12-28T12:00:00+00:00",
      "result_status": "COMPLETED"
    }
  }
}
```

---

## Result File Format

Each processed JobSpec produces a `.result.json` file:

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
    "jobspec_path": "/path/to/original/job.json",
    "result_written_at": "2025-12-28T12:00:05+00:00",
    "trace_path": null
  }
}
```

### Status Values

| Status | Meaning |
|--------|---------|
| `COMPLETED` | All clips processed successfully |
| `FAILED` | At least one clip failed (fail-fast) |
| `PARTIAL` | Validation failed before execution |

---

## Failure Handling

### Explicit Failure Preservation

- Failed JobSpecs **always** get a `.result.json` with `final_status: "FAILED"`
- The `failure_reason` field in each clip explains what went wrong
- JobSpecs are moved to `./failed/` after processing

### Failure Reasons

Common failure reasons in `ClipExecutionResult`:

- `"FFmpeg not found. Install FFmpeg to use headless execution."`
- `"FFmpeg exited with code N"`
- `"Output file does not exist or has zero size"`
- `"Execution timed out after 3600 seconds"`

---

## CLI Reference

```
usage: watch_folder_runner.py [-h] [--once] [--poll-seconds N] folder

V2 Watch Folder Runner - Process JobSpec JSON files

positional arguments:
  folder             Directory containing JobSpec JSON files to process

options:
  -h, --help         show this help message and exit
  --once             Perform a single scan and exit (don't poll)
  --poll-seconds N   Seconds between folder scans (default: 2)
```

### Examples

```bash
# Watch folder with default 2s polling
python -m backend.watch_folder_runner ./my_jobs

# Single scan and exit (good for cron jobs)
python -m backend.watch_folder_runner ./my_jobs --once

# Slower polling for production use
python -m backend.watch_folder_runner ./my_jobs --poll-seconds 30
```

---

## How to Reset

To reprocess all JobSpecs (start fresh):

```bash
# Delete manifest and move files back
rm ./jobs/processed_manifest.json
rm ./jobs/*.result.json
mv ./jobs/processed/*.json ./jobs/
mv ./jobs/failed/*.json ./jobs/

# Then run again
python -m backend.watch_folder_runner ./jobs --once
```

Or reset just specific files:

```bash
# Remove a specific result to allow reprocessing
rm ./jobs/my_job.result.json

# Move failed job back for retry
mv ./jobs/failed/my_job.json ./jobs/
```

---

## Integration Examples

### Cron Job (Single Scan)

```cron
# Process watch folder every 5 minutes
*/5 * * * * cd /path/to/proxx && python -m backend.watch_folder_runner /path/to/jobs --once
```

### Systemd Service (Continuous)

```ini
[Unit]
Description=Proxx V2 Watch Folder Runner
After=network.target

[Service]
Type=simple
WorkingDirectory=/path/to/proxx
ExecStart=/path/to/python -m backend.watch_folder_runner /path/to/jobs --poll-seconds 10
Restart=always

[Install]
WantedBy=multi-user.target
```

### Docker/Script Wrapper

```bash
#!/bin/bash
cd /app
exec python -m backend.watch_folder_runner /data/jobs --poll-seconds 5
```

---

## Constraints

- **No V1 code modified**: This is V2-only
- **No concurrency**: Sequential processing only
- **No UI**: Headless operation
- **No filesystem events**: Uses polling (no inotify/FSEvents)
- **Determinism over convenience**: Explicit behavior, no magic

---

## Troubleshooting

### JobSpec Not Being Processed

1. Check if `.result.json` already exists (remove to reprocess)
2. Check if path+hash is in `processed_manifest.json`
3. Verify the JSON is valid: `python -m json.tool job.json`

### FFmpeg Errors

1. Ensure FFmpeg is installed: `which ffmpeg`
2. Check the `.result.json` for the exact `ffmpeg_command` and `failure_reason`
3. Run the command manually to debug

### Manifest Corruption

If `processed_manifest.json` is corrupted:

```bash
# Delete and restart (will reprocess everything)
rm processed_manifest.json
```

---

## V2 Phase 1 Context

This runner is part of V2 Phase 1 (Reliable Proxy Engine). It provides:

- Watch folder automation for headless JobSpec execution
- Foundation for future daemon/service architecture
- TechOps-friendly CLI for scripted workflows
- CI/CD integration capability

It does NOT:

- Replace the V1 execution path
- Add UI components
- Implement real-time filesystem watching (deferred to V2 Phase 2+)
- Support parallel/concurrent execution
