# V2 Watch Folder Runner

Deterministic watch-folder automation for JobSpec JSON files with atomic filesystem semantics and bounded concurrency.

## Overview

The watch folder runner is a deterministic processor for V2 JobSpec files. It uses standard OS filesystem primitives (atomic `rename()`) and explicit state transitions for reliable, auditable automation.

**V2 Phase 2** adds optional bounded concurrency while preserving all Phase 1 guarantees.

### Core Principles

1. **Use boring, battle-tested filesystem behavior only**
2. **No retries, no guessing, no silent recovery**
3. **JobSpec is the only source of truth**
4. **UI must never control execution**
5. **Output correctness beats convenience**
6. **Concurrency is opt-in and bounded** (Phase 2)

---

## Folder Structure

```
watch/
├── pending/              # JobSpecs awaiting processing
│   └── job1.json         # Drop JobSpec files here
├── running/              # Currently processing (max N workers)
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
| `running/` | JobSpecs being processed (up to N workers active at once) |
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
| Mixed RAW + non-RAW sources | Moved to `failed/` with reason |
| Unsupported format | Moved to `failed/` with reason |

**The runner will never attempt "best guess" execution.** Invalid specs fail fast and explicitly.

---

## Camera RAW Handling

The watch folder runner automatically routes camera RAW formats to DaVinci Resolve.

### Automatic Engine Routing

When a JobSpec is processed, the runner inspects each source file:

1. **Standard formats** (H.264, ProRes, DNxHD, etc.) → FFmpeg engine
2. **Camera RAW formats** (ARRIRAW, REDCODE, BRAW, etc.) → Resolve engine
3. **Unknown codecs** (ffprobe returns `codec_name="unknown"`) → Resolve engine

This routing is **automatic and deterministic**. There is no user override.

### Supported Camera RAW Formats

| Format | Extensions/Containers | Camera Examples |
|--------|----------------------|-----------------|
| ARRIRAW | `.ari`, `.mxf` | Alexa, Alexa Mini, Alexa 35 |
| REDCODE | `.r3d` | RED DSMC, V-RAPTOR, Komodo |
| Blackmagic RAW | `.braw` | BMPCC, URSA Mini Pro |
| Sony X-OCN | `.mxf` | Venice, FX6, FX9 |
| Canon Cinema RAW Light | `.crm` | C70, C300 III, C500 II |
| Panasonic V-RAW | `.vraw` | VariCam |
| Nikon N-RAW | `.nev`, `.mov` | Z8, Z9 |
| DJI RAW | `.mov`, `.dng` | Zenmuse X7, Inspire 3 |
| ProRes RAW | `.mov` | Various (sensor RAW, not standard ProRes) |
| CinemaDNG | `.dng` | Various (frame sequences) |

### Mixed Job Rejection

A job **cannot contain both RAW and non-RAW sources**:

```
❌ REJECTED (different engines required):
  job_mixed.json:
    sources:
      - /media/clip_001.r3d    (REDCODE → Resolve)
      - /media/clip_002.mov    (ProRes → FFmpeg)
    
  Result: Moved to failed/ with MixedEngineError
```

**Solution:** Split into separate jobs by engine:

```
✅ Job A (Resolve engine):
  - clip_001.r3d
  
✅ Job B (FFmpeg engine):
  - clip_002.mov
```

Or transcode RAW to intermediate codec first:

```
✅ Single Job (FFmpeg engine):
  - clip_001_transcode.mov  (ProRes exported from Resolve)
  - clip_002.mov
```

### Result Metadata for RAW Jobs

When a job is routed to Resolve, the result JSON includes engine information:

```json
{
  "job_id": "raw_job_123",
  "final_status": "COMPLETED",
  "execution_engine": "resolve",
  "clips": [
    {
      "source_path": "/media/A001_C001.r3d",
      "resolved_output_path": "/media/proxies/A001_C001_proxy.mov",
      "status": "COMPLETED",
      "engine": "resolve"
    }
  ],
  "_metadata": {
    "engine_routing_reason": "Source codec 'redcode' requires DaVinci Resolve"
  }
}
```

See [docs/ENGINE_CAPABILITIES.md](docs/ENGINE_CAPABILITIES.md) for the complete camera/RAW format matrix.

---

## Quick Start

```bash
# Single scan (process all pending, then exit)
python -m backend.v2.watch_folder_runner ./watch --once

# Continuous polling (every 2 seconds)
python -m backend.v2.watch_folder_runner ./watch

# Custom poll interval
python -m backend.v2.watch_folder_runner ./watch --poll-seconds 10

# Concurrent processing (up to 4 jobs at once)
python -m backend.v2.watch_folder_runner ./watch --max-workers 4
```

---

## Concurrency Model (V2 Phase 2)

Phase 2 introduces **bounded, deterministic concurrency** as an opt-in feature.

### Worker Slots

```
┌─────────────────────────────────────────────────────────────────┐
│                    Watch Folder Runner                          │
│                                                                 │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│   │ Worker 1 │  │ Worker 2 │  │ Worker 3 │  │ Worker 4 │       │
│   │  (busy)  │  │  (busy)  │  │  (idle)  │  │  (idle)  │       │
│   └────┬─────┘  └────┬─────┘  └──────────┘  └──────────┘       │
│        │              │                                         │
│        ▼              ▼                                         │
│   ┌─────────┐   ┌─────────┐                                    │
│   │ job_a   │   │ job_b   │   pending: [job_c, job_d, ...]     │
│   │ running │   │ running │                                    │
│   └─────────┘   └─────────┘                                    │
└─────────────────────────────────────────────────────────────────┘
```

### How It Works

| Aspect | Behavior |
|--------|----------|
| **Worker count** | Fixed at startup via `--max-workers N` (default: 1) |
| **Job ordering** | Jobs dequeued in sorted filename order (deterministic) |
| **Clip execution** | Each job still processes clips sequentially |
| **Failure isolation** | One job failing does NOT stop other running jobs |
| **No dynamic scaling** | Worker count never changes during execution |

### Determinism Guarantees

The concurrency model preserves all Phase 1 determinism guarantees:

1. **Ordered dequeuing**: Jobs are picked from `pending/` in sorted filename order
2. **No skips**: Every pending job is eventually processed (if runner continues)
3. **No duplicates**: Each job is processed exactly once
4. **Preserved semantics**: Clips within a job are still sequential and fail-fast
5. **Auditable metadata**: Result JSON includes `worker_id` and `worker_started_at`

### Failure Semantics

```
┌─────────────────────────────────────────────────────────────────┐
│  Scenario: job_a fails while job_b is running                  │
│                                                                 │
│  job_a → FAILS → moved to failed/ with result                  │
│  job_b → CONTINUES → completes normally → moved to completed/  │
│  job_c → WAITS → processed when worker slot becomes available  │
│                                                                 │
│  Runner does NOT crash. Summary shows accurate counts.         │
└─────────────────────────────────────────────────────────────────┘
```

### CLI Usage

```bash
# Sequential (Phase 1 behavior, default)
python -m backend.v2.watch_folder_runner ./watch --max-workers 1

# 2 concurrent workers
python -m backend.v2.watch_folder_runner ./watch --max-workers 2

# 4 concurrent workers with slower polling
python -m backend.v2.watch_folder_runner ./watch --max-workers 4 --poll-seconds 10
```

### Result Metadata

With concurrency enabled, result JSONs include worker tracking:

```json
{
  "job_id": "abc12345",
  "final_status": "COMPLETED",
  "clips": [...],
  "_metadata": {
    "jobspec_path": "/path/to/watch/running/job.json",
    "result_written_at": "2025-12-28T12:00:05+00:00",
    "worker_id": 2,
    "worker_started_at": "2025-12-28T12:00:00+00:00"
  }
}
```

### Concurrency Non-Goals

These are **explicitly NOT implemented** in Phase 2:

- ❌ No dynamic scaling (worker count is fixed)
- ❌ No priority queuing (sorted filename order only)
- ❌ No work stealing between workers
- ❌ No retry on failure
- ❌ No concurrent clip processing within a job
- ❌ No cluster distribution

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
| **Bounded concurrency** | Up to N jobs run at once (default: 1) |
| **Deterministic ordering** | Jobs processed in sorted filename order |
| **Sequential clips** | Clips within a job are still sequential |
| **Fail-fast (per job)** | Stop on first clip error within a job |
| **Failure isolation** | Other running jobs continue on failure |
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
usage: watch_folder_runner.py [-h] [--once] [--poll-seconds N] [--max-workers N] folder

V2 Watch Folder Runner - Deterministic JobSpec automation

positional arguments:
  folder             Root watch directory (contains pending/, running/, etc.)

options:
  -h, --help         show this help message and exit
  --once             Perform a single scan and exit (don't poll)
  --poll-seconds N   Seconds between folder scans (default: 2)
  --max-workers N    Maximum concurrent workers (default: 1)
```

### Examples

```bash
# Continuous watch with default 2s polling (sequential)
python -m backend.v2.watch_folder_runner ./watch

# Single scan for cron jobs or CI
python -m backend.v2.watch_folder_runner ./watch --once

# Slower polling for production
python -m backend.v2.watch_folder_runner ./watch --poll-seconds 30

# Concurrent processing with 4 workers
python -m backend.v2.watch_folder_runner ./watch --max-workers 4

# Single concurrent scan
python -m backend.v2.watch_folder_runner ./watch --once --max-workers 4
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

These are **intentionally not implemented** in V2 Phase 2:

- ❌ No UI controls
- ❌ No progress bars
- ❌ No pause/cancel
- ❌ No AI readiness detection
- ❌ No cloud services
- ❌ No proprietary SDKs
- ❌ No FSEvents/inotify (polling only for now)
- ❌ No retry logic
- ❌ No dynamic worker scaling
- ❌ No concurrent clips within a job

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

## V2 Phase 2 Context

This runner is part of V2 Phase 2 (Bounded Deterministic Concurrency). It provides:

- ✅ Deterministic watch folder automation
- ✅ Atomic filesystem state transitions
- ✅ Explicit crash recovery
- ✅ Complete audit trail via result files
- ✅ Foundation for future service architecture
- ✅ CI/CD integration capability
- ✅ Bounded concurrent execution (opt-in)
- ✅ Worker metadata tracking

Future phases may add:

- Real-time filesystem watching (FSEvents/inotify)
- Priority queuing
- Remote job submission
- Concurrent clip processing within jobs
