# Forge Monitoring System

## Overview

The Forge Monitoring System provides **read-only observability** into job execution. It allows operators to see what Forge is doing without any ability to control, modify, or influence job execution.

This is strictly an observation layer. It cannot start, stop, retry, or modify jobs.

## What Monitoring Shows

- **Job Status**: View queued, running, failed, and completed jobs
- **Event Timeline**: See the complete history of events for each job
- **Worker Status**: Monitor which workers are idle, busy, or offline
- **Failure Details**: View verbatim failure reasons when jobs fail
- **Metadata**: See burn-in presets, LUTs, and execution engines used

## What Monitoring Cannot Do

Monitoring explicitly **cannot**:

- Create new jobs
- Cancel or stop running jobs
- Retry failed jobs
- Modify job parameters
- Reorder the queue
- Delete job history
- Send commands to workers

This is intentional. Monitoring is observation, not control.

## How This Differs from Orchestration

| Aspect | Monitoring | Orchestration |
|--------|-----------|---------------|
| Purpose | Visibility | Control |
| Job Creation | ❌ | ✅ |
| Job Modification | ❌ | ✅ |
| Retry Logic | ❌ | ✅ |
| Queue Management | ❌ | ✅ |
| State Mutation | ❌ | ✅ |
| Read Access | ✅ | ✅ |

Monitoring answers "What happened?" and "What is happening?"
Orchestration answers "What should happen next?"

## Architecture

### Backend Components

```
backend/monitor/
├── event_model.py    # Immutable event and job record definitions
├── state_store.py    # Append-only SQLite persistence
├── heartbeat.py      # Worker liveness tracking
└── monitor_api.py    # Read-only HTTP endpoints
```

### Frontend Components

```
frontend/src/components/monitor/
├── MonitorDashboard.tsx   # Main dashboard view
├── JobListReadOnly.tsx    # Job list display
└── JobDetailReadOnly.tsx  # Job detail with event timeline
```

## State Model

### Job Record

Each job record includes:

| Field | Type | Description |
|-------|------|-------------|
| `job_id` | string | Unique identifier |
| `job_type` | enum | Currently only "proxy" |
| `engine` | enum | "resolve" or "ffmpeg" |
| `status` | enum | "queued", "running", "failed", "completed" |
| `start_time` | ISO 8601 | When job started |
| `end_time` | ISO 8601 | When job finished (nullable) |
| `failure_reason` | string | Verbatim error (nullable) |
| `burnin_preset_id` | string | Burn-in preset used (nullable) |
| `lut_id` | string | LUT applied (nullable) |
| `worker_id` | string | Which worker processed |
| `verification_run_id` | string | Verification context (nullable) |
| `source_path` | string | Input file path |
| `output_path` | string | Output file path |

### Terminal States

Jobs in **terminal states** (failed, completed) cannot be modified. This is enforced at the storage layer. Any attempt to update a terminal job is rejected.

### Events

Events are append-only records of what occurred:

| Event Type | Description |
|------------|-------------|
| `job_created` | Job was created |
| `engine_selected` | Execution engine was chosen |
| `execution_started` | Job began processing |
| `progress_update` | Coarse progress indicator |
| `execution_failed` | Job failed with error |
| `execution_completed` | Job finished successfully |

Events are immutable. Once recorded, they cannot be modified or deleted.

## API Endpoints

All endpoints are **GET only**. No POST, PUT, PATCH, or DELETE.

### Job Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /jobs` | List all jobs with optional filtering |
| `GET /jobs/active` | List queued and running jobs |
| `GET /jobs/failed` | List failed jobs |
| `GET /jobs/completed` | List completed jobs |
| `GET /jobs/stats` | Get aggregate statistics |
| `GET /jobs/{job_id}` | Get job detail with events |

### Worker Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /workers` | List all workers with status |
| `GET /workers/{worker_id}` | Get specific worker status |

### Event Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /events` | List recent events |
| `GET /events?job_id=...` | List events for specific job |

## Network Binding

### Default: Localhost Only

By default, the monitor API binds to `127.0.0.1:9876`. This means:

- Only accessible from the local machine
- Not visible on the network
- No authentication required (none implemented)

### LAN Exposure

To expose the API on the local network, set the environment variable:

```bash
FORGE_MONITOR_LAN=true
```

This binds to `0.0.0.0:9876`, making the API accessible to any device on the network.

## Security Implications of LAN Exposure

**Warning**: Exposing the monitor API on a network has security implications:

1. **No Authentication**: Anyone on the network can view job data
2. **Path Exposure**: Source and output file paths are visible
3. **Worker Info**: Worker hostnames and IDs are exposed
4. **No Encryption**: Traffic is unencrypted HTTP

### When LAN Exposure is Acceptable

- Trusted studio/facility networks
- Air-gapped environments
- Development/testing scenarios

### When LAN Exposure is Not Acceptable

- Public networks
- Shared office spaces
- Cloud deployments without additional security layers

### Future Considerations

Authentication is not implemented in this version. If LAN exposure becomes a production requirement, consider:

- Reverse proxy with authentication
- VPN for network access
- API key implementation (future)

## Running the Monitor

### Start the API Server

```bash
cd backend
python -m monitor.monitor_api
```

Or with LAN exposure:

```bash
FORGE_MONITOR_LAN=true python -m monitor.monitor_api
```

### Access the API

```bash
# Health check
curl http://127.0.0.1:9876/health

# List jobs
curl http://127.0.0.1:9876/jobs

# Get job detail
curl http://127.0.0.1:9876/jobs/{job_id}
```

### Frontend Dashboard

The monitoring dashboard is available at the `/monitor` route when the frontend is running.

## Integration with Job Execution

The monitoring system is **passive**. Job execution code must explicitly record events and update job state. Example integration:

```python
from monitor.state_store import get_store
from monitor.event_model import (
    EventType, ExecutionEngine, JobRecord, JobStatus, JobType, MonitorEvent
)
from monitor.heartbeat import start_heartbeat

# Start heartbeat for this worker
emitter = start_heartbeat()

# Create job record when job starts
store = get_store()
job = JobRecord(
    job_id=job_id,
    job_type=JobType.PROXY,
    engine=None,  # Set when engine is selected
    status=JobStatus.QUEUED,
    start_time=datetime.now(timezone.utc).isoformat(),
    end_time=None,
    failure_reason=None,
    burnin_preset_id=preset_id,
    lut_id=lut_id,
    worker_id=emitter.worker_id,
    verification_run_id=None,
    source_path=source,
    output_path=None
)
store.create_job(job)
emitter.set_current_job(job_id)

# Record engine selection
store.record_event(MonitorEvent.create(
    EventType.ENGINE_SELECTED,
    job_id=job_id,
    worker_id=emitter.worker_id,
    payload={"engine": "resolve"}
))

# Update status when running
store.update_job_status(job_id, JobStatus.RUNNING, engine=ExecutionEngine.RESOLVE)

# On completion
store.update_job_status(
    job_id, 
    JobStatus.COMPLETED,
    end_time=datetime.now(timezone.utc).isoformat(),
    output_path=output
)
emitter.set_current_job(None)

# On failure
store.update_job_status(
    job_id,
    JobStatus.FAILED,
    end_time=datetime.now(timezone.utc).isoformat(),
    failure_reason=str(error)
)
emitter.set_current_job(None)
```

## Desktop Notifications (Optional)

If implemented, desktop notifications are:

- **Informational only**: Show job completion or failure
- **Not actionable**: No buttons, no retry options
- **Non-blocking**: Do not interrupt workflow

## UI Design Principles

The monitoring UI follows these principles:

1. **Factual tone**: No encouragement, no reassurance, no "everything is fine"
2. **Prominent failures**: Failed jobs are visually distinct and sorted first
3. **Read-only**: No action buttons, no inline edits
4. **Complete timeline**: Full event history for each job
5. **Verbatim errors**: Failure reasons shown exactly as recorded

## Storage

The state store uses SQLite with:

- **WAL mode**: For concurrent read performance
- **Append-only semantics**: No deletes, no updates after terminal state
- **Crash recovery**: SQLite durability guarantees

Database location: `forge_monitor.db` in the working directory.

## Limitations

1. **No real-time push**: Frontend polls every 5 seconds
2. **No authentication**: Trust-based access
3. **No aggregation**: Raw data only, no "smart" summarization
4. **Local storage**: Single database file, no distributed storage

## Version History

- **1.0.0**: Initial implementation
  - Append-only state store
  - Read-only HTTP API
  - Browser-based dashboard
  - Worker heartbeat tracking
