# Test Plan — Awaire Proxy

## Overview

This document describes the test coverage for Awaire Proxy.

## Test Levels

### Level 1: Verify Proxy Fast

**Purpose:** Quick validation for development iteration.

**Scope:**
- Lint checks (ruff)
- Unit tests
- Schema validation
- Naming/path determinism

**Run time:** < 30 seconds

**When to run:**
- Before every commit
- During development
- In CI on every PR

### Level 2: Verify Proxy

**Purpose:** Full functional validation.

**Scope:**
- Everything in Fast
- Integration tests
- Watch folder simulation
- State transition correctness
- Metadata passthrough assertions

**Run time:** < 2 minutes

**When to run:**
- Before pushing to main
- In CI on main branch merges

### Level 3: Verify Proxy Full

**Purpose:** Complete validation including real transcodes.

**Scope:**
- Everything in Proxy
- Real FFmpeg E2E transcodes
- ffprobe output validation
- Restart/recovery scenarios
- Watermark verification
- Regression suite

**Run time:** 5-10 minutes

**When to run:**
- Before releases
- Nightly CI builds
- Manual validation

## UI Flow Testing

> **Status: Deferred**
>
> UI flow testing begins after v1 UI stabilisation is complete.
> The UI is currently being stabilised to make backend state visible and authoritative.
> Premature UI tests would be churn while the interface is still evolving.
>
> TODO: Add UI flow tests after stabilisation covering:
> - Job creation workflow
> - DeliverControlPanel state reflection
> - Selection context switching
> - Read-only mode for running/completed jobs
> - Empty state messaging

## Test Categories

### Unit Tests

| Module | Coverage |
|--------|----------|
| DeliverSettings | Defaults, validation, immutability |
| Naming | Token resolution, templates |
| Paths | Output path construction |
| Engine Mapping | Codec/engine combinations |

### Integration Tests

| Area | Coverage |
|------|----------|
| Job Creation | Lifecycle, state transitions |
| Watch Folder | Detection, exactly-once |
| Persistence | Save/load, recovery |

### E2E Tests

| Scenario | Coverage |
|----------|----------|
| Transcode | H.264, ProRes generation |
| Validation | ffprobe checks |
| Recovery | Restart survival |

## Coverage Goals

- Unit tests: > 80% of deliver/ module
- Integration tests: All job lifecycle states
- E2E tests: Primary codec/container combinations

## Running Tests

```bash
# Fast
make verify-fast

# Standard
make verify

# Full
make verify-full
```
