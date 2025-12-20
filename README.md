# Awaire Proxy

Boring, reliable, watch-folder proxy generator.

## What It Does

Awaire Proxy does exactly one thing well:
- Watches one or more folders
- Detects new media deterministically
- Enqueues each file exactly once
- Generates proxy media using FFmpeg
- Preserves metadata by default
- Never overwrites outputs
- Survives restarts without duplication
- Fails loudly and visibly when something goes wrong

## What It Does NOT Do

- No ingest/copy tooling
- No checksums
- No Resolve integration
- No automation chains
- No federation
- No enterprise features

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- FFmpeg installed and on PATH
- pnpm

### Development Setup

```bash
# Start both backend and frontend
./dev_launch.sh
```

Or manually:

```bash
# Terminal 1: Backend
cd backend
source ../.venv/bin/activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8085

# Terminal 2: Frontend
cd frontend
pnpm install
pnpm dev
```

### Verify (QA)

All QA runs through the Verify system:

```bash
# Fast checks (lint, unit tests, schema validation)
make verify-fast

# Standard verification (+ integration tests)
make verify

# Full verification (+ E2E with real FFmpeg transcodes)
make verify-full
```

Or directly:

```bash
python -m qa.verify.verify proxy fast
python -m qa.verify.verify proxy
python -m qa.verify.verify proxy full
```

## Project Structure

```
awaire-proxy/
├── backend/           # Python FastAPI service
│   └── app/          # Application code
├── frontend/         # Electron + React UI
├── qa/               # Verify QA system
│   ├── verify/       # QA runner
│   ├── proxy/        # Test suites
│   ├── fixtures/     # Test media
│   └── docs/         # QA documentation
├── docs/             # Product documentation
└── scripts/          # Development utilities
```

## Releases

No feature is "done" unless `verify proxy fast` passes.  
No release is allowed unless `verify proxy full` passes.

## Documentation

- [docs/PRODUCT.md](docs/PRODUCT.md) — Product definition
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — System design
- [docs/CONSTRAINTS.md](docs/CONSTRAINTS.md) — Hard constraints
- [qa/docs/definition_of_done.md](qa/docs/definition_of_done.md) — QA requirements

## Clean Break Notice

Version 1.0 introduces a clean break from previous localStorage data:
- Old `fabric_*` and `proxx_*` keys are ignored
- No migration of legacy data
- Fresh start for all settings and preferences
