# Proxx

Deterministic media proxy generation for post-production workflows.

## What It Is

Proxx generates proxy media files from source footage using FFmpeg or DaVinci Resolve.

- **Deterministic:** Same input + same environment = same output
- **Auditable:** Complete execution trail in structured JSON
- **Fail-fast:** Explicit failures, no silent recovery
- **Operator-controlled:** No magic, no guessing, no retries

## What It Is NOT

- Not an ingest tool
- Not a media management system
- Not a workflow automation platform
- Not a transcoding service with smart defaults

## Quick Start

### Prerequisites

- Python 3.11 or later
- FFmpeg (required for standard formats)
- DaVinci Resolve (required for RAW formats only)

### Installation

```bash
# Clone repository
git clone https://github.com/your-org/proxx.git
cd proxx

# Install dependencies
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
```

### Running Proxx

Proxx provides three operator entrypoints:

#### 1. Validate a JobSpec

```bash
proxx validate job.json
```

Validates JobSpec JSON without executing. Exit code 0 = valid, non-zero = invalid.

#### 2. Execute a JobSpec

```bash
proxx run job.json
```

Executes a JobSpec. Result JSON written to stdout. Exit codes:
- 0 = success
- 1 = validation error
- 2 = execution error
- 3 = partial completion

#### 3. Watch Folder Mode

```bash
# Sequential processing (one job at a time)
proxx watch /path/to/watch_folder

# Concurrent processing (up to 4 jobs in parallel)
proxx watch /path/to/watch_folder --max-workers 4

# Process pending jobs once and exit
proxx watch /path/to/watch_folder --once

# Poll every 5 seconds instead of using filesystem events
proxx watch /path/to/watch_folder --poll-seconds 5
```

Watch folder structure:
```
watch_folder/
├── pending/      # Place JobSpec JSON files here
├── running/      # Jobs being processed (moved automatically)
├── completed/    # Successful jobs with result JSON
└── failed/       # Failed jobs with result JSON
```

## JobSpec

Proxx executes jobs defined in JobSpec JSON files.

Example JobSpec:
```json
{
  "jobspec_version": "1.0.0",
  "created_at": "2025-12-29T10:00:00Z",
  "sources": ["/path/to/source1.mov", "/path/to/source2.mov"],
  "output_dir": "/path/to/outputs",
  "output_name_template": "{source_name}_proxy",
  "codec": "h264",
  "container": "mp4",
  "fps_mode": "preserve_source",
  "proxy_profile": "offline_h264_1920x1080",
  "user_metadata": {
    "project": "Example Project",
    "operator": "jane.doe"
  }
}
```

See [backend/job_spec.py](backend/job_spec.py) for complete schema definition.

## Documentation

### Operator Documentation

- [V2_OPERATOR_RUNBOOK.md](docs/V2_OPERATOR_RUNBOOK.md) - **Start here:** How to run Proxx in supported deployment modes
- [V2_PACKAGING_AND_DEPLOYMENT.md](docs/V2_PACKAGING_AND_DEPLOYMENT.md) - Deployment modes and environment requirements
- [V2_WATCH_FOLDERS.md](docs/V2_WATCH_FOLDERS.md) - Watch folder semantics and concurrency model

### Architecture Documentation

- [V2_PHASE_1_LOCKED.md](docs/V2_PHASE_1_LOCKED.md) - Phase 1 capabilities and guarantees
- [V2_IMPLEMENTATION_READINESS.md](docs/V2_IMPLEMENTATION_READINESS.md) - Implementation gate criteria
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - System architecture and design decisions

### Development Documentation

- [docs/README.md](docs/README.md) - Legacy V1 documentation (for reference)

## Supported Deployment Modes

Proxx V2 supports three deployment modes with identical execution behavior:

1. **Local Operator Machine** - Interactive workstations
2. **Headless Worker Node** - Dedicated processing servers
3. **CI / Automation Runner** - Ephemeral environments (GitHub Actions, Jenkins, etc.)

See [V2_OPERATOR_RUNBOOK.md](docs/V2_OPERATOR_RUNBOOK.md) for detailed deployment instructions.

## Exit Codes

### CLI Commands

- **0:** Success
- **1:** Validation error (pre-execution)
- **2:** Execution error (FFmpeg/Resolve failure)
- **3:** Partial completion (some clips succeeded, some failed)
- **4:** System error (file not found, permissions, etc.)

### Watch Folder

- **0:** Shutdown via signal (normal)
- **1:** Fatal error (watch folder invalid, permissions, etc.)

## Result JSON

Every execution produces a structured result JSON with:

- Job status (COMPLETED / FAILED / PARTIAL)
- Per-clip execution details
- FFmpeg/Resolve commands executed
- Exit codes and timing information
- Failure reasons (if applicable)

Result JSON is written to:
- **CLI mode:** stdout
- **Watch folder mode:** `completed/<jobspec>.result.json` or `failed/<jobspec>.result.json`

## Failures

Proxx does NOT:
- Retry automatically
- Implement fallback paths
- Infer missing configuration
- Recover silently

All failures are explicit and loud. Operators must fix the root cause before resubmission.

See [V2_OPERATOR_RUNBOOK.md](docs/V2_OPERATOR_RUNBOOK.md) for failure handling procedures.

## Development

### Running Tests

```bash
# Unit tests
python -m pytest backend/tests/

# Full test suite
make verify-full
```

### Project Structure

```
proxx/
├── backend/              # Python execution engine
│   ├── cli.py           # CLI entrypoint
│   ├── job_spec.py      # JobSpec schema and validation
│   ├── execution_adapter.py  # Execution entrypoint
│   ├── execution_results.py  # Result structures
│   ├── headless_execute.py   # Execution implementation
│   └── v2/              # V2-specific modules
│       ├── watch_folder_runner.py  # Watch folder implementation
│       ├── proxy_profiles.py       # Canonical proxy profiles
│       └── source_capabilities.py  # Format detection and engine routing
├── docs/                # Documentation
├── frontend/            # Electron UI (legacy V1)
└── qa/                  # QA and verification system
```

## License

[License information]

## Support

For operational issues, see [V2_OPERATOR_RUNBOOK.md](docs/V2_OPERATOR_RUNBOOK.md).

For development questions, see architecture documentation in [docs/](docs/).

Proxx is designed for operators who understand their environment. It does not provide troubleshooting guidance beyond facts.
