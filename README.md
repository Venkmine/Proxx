# Forge

Deterministic media proxy generation for post-production workflows.

## What Forge Is

Forge generates proxy media files from source footage using FFmpeg or DaVinci Resolve.

- **Deterministic:** Same input + same environment = same output
- **Auditable:** Complete execution trail in structured JSON
- **Fail-fast:** Explicit failures, no silent recovery
- **Operator-controlled:** No magic, no guessing, no retries

## What Forge Is NOT

- Not an ingest tool
- Not a media management system
- Not a workflow automation platform
- Not a transcoding service with smart defaults

---

## Quick Start

### Prerequisites

- Python 3.11 or later
- FFmpeg (for standard formats: H.264, ProRes, DNxHD)
- DaVinci Resolve (for RAW formats: BRAW, R3D, ARRIRAW)

### Start Forge

```bash
python forge.py
```

This single command:
1. Prints Forge version
2. Runs all readiness checks
3. Reports READY or NOT READY
4. If NOT READY: lists blocking issues and exits
5. If READY: starts Forge services

### Readiness Check Only

```bash
# Terminal output
python forge.py --check

# JSON output
python forge.py --json
```

---

## Readiness Check

Before starting, Forge validates your environment:

| Check | Blocking | Description |
|-------|----------|-------------|
| `python_version` | ✔ | Python 3.11+ required |
| `ffmpeg_available` | | FFmpeg in PATH (for non-RAW formats) |
| `resolve_installed` | | DaVinci Resolve detected (for RAW formats) |
| `resolve_edition` | | Resolve Studio vs Free |
| `directories_writable` | ✔ | Working directory writable |
| `license_valid` | ✔ | License loaded and valid |
| `worker_capacity` | ✔ | At least one worker available |
| `monitoring_db` | | Database writable |

**Blocking checks** must pass for Forge to start.  
**Non-blocking checks** limit capabilities but don't prevent startup.

### If NOT READY

When Forge reports NOT READY, it will:
- List all blocking issues
- Provide remediation hints (text only)
- Exit with code 1
- **NOT** attempt auto-fixes
- **NOT** offer interactive prompts

Example:
```
  ✘ NOT READY

  2 blocking issue(s) must be resolved:
    • python_version: Python 3.9 detected, requires 3.11+
    • directories_writable: Cannot write to /readonly/path

  Forge will not start until these are fixed.
```

---

## Running Jobs

Once Forge is ready, use the CLI to execute jobs:

### Validate a JobSpec

```bash
proxx validate job.json
```

Validates JobSpec JSON without executing. Exit code 0 = valid.

### Execute a JobSpec

```bash
proxx run job.json
```

Executes a JobSpec. Result JSON written to stdout.

### Watch Folder Mode

```bash
proxx watch /path/to/watch_folder
```

Watch folder structure:
```
watch_folder/
├── pending/      # Place JobSpec JSON files here
├── running/      # Jobs being processed
├── completed/    # Successful jobs
└── failed/       # Failed jobs
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success (or READY) |
| 1 | Not ready / Validation error |
| 2 | Execution error |
| 3 | Partial completion |
| 4 | System error |

---

## Configuration

Copy `forge.env.example` to `.env` and modify as needed:

```bash
cp forge.env.example .env
```

Key variables:
- `FORGE_LICENSE_TYPE`: FREE | PRO | STUDIO
- `FORGE_LOG_LEVEL`: DEBUG | INFO | WARNING | ERROR

See `forge.env.example` for all options.

---

## Documentation

| Document | Description |
|----------|-------------|
| [CHANGELOG.md](CHANGELOG.md) | Version history |
| [docs/V2_OPERATOR_RUNBOOK.md](docs/V2_OPERATOR_RUNBOOK.md) | Operator procedures |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design |

---

## Principles

Forge will NEVER:
- Auto-install dependencies
- Auto-fix environment issues
- Retry failed jobs automatically
- Hide errors behind logs only
- Pretend partial readiness is acceptable

Forge will ALWAYS:
- Report explicit READY or NOT READY
- Exit cleanly if not ready
- Provide factual error messages
- Leave remediation to the operator

---

## License

See LICENSE file.
