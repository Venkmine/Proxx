# Awaire Proxy — Current Status

## v1.0 — Initial Release

Awaire Proxy v1.0 is a standalone, boring, reliable watch-folder proxy generator.

### Core Features

- ✅ Watch folder ingestion
- ✅ Exactly-once file detection
- ✅ FFmpeg proxy generation
- ✅ Job queue with reordering
- ✅ Metadata passthrough
- ✅ Reporting (CSV/JSON/TXT)
- ✅ Restart recovery
- ✅ Operator UI

### QA System

- ✅ Verify framework implemented
- ✅ Unit tests
- ✅ Integration tests
- ✅ E2E tests with real FFmpeg
- ✅ Definition of Done enforced

### Out of Scope

- ❌ Resolve integration (quarantined in `backend/_future/`)
- ❌ Ingest/copy tooling
- ❌ Checksums
- ❌ Automation chains
- ❌ Federation
- ❌ Enterprise features

## Running Verify

```bash
make verify-fast    # Lint + unit tests
make verify         # + integration tests
make verify-full    # + E2E transcodes
```
