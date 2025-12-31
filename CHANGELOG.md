# Changelog

All notable changes to Forge are documented in this file.

This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2025-12-31

### Added

- **First-run readiness check**: Forge validates environment before starting
  - Python version check (3.11+ required)
  - FFmpeg availability check
  - DaVinci Resolve detection (installed, edition)
  - Directory writability check
  - License validation
  - Worker capacity check
  - Monitoring database check

- **Single entrypoint**: `python forge.py` starts Forge
  - Prints version
  - Runs readiness checks
  - Reports READY or NOT READY
  - Exits cleanly if not ready

- **Readiness report**: Structured output for diagnostics
  - Terminal format with ✔/✘ symbols
  - JSON format for API/automation
  - Blocking vs non-blocking check distinction

- **Frontend readiness panel**: `FirstRunStatus.tsx`
  - Displays readiness state on first launch
  - Read-only, no actions
  - Dismissible once READY

- **API endpoint**: `/api/readiness`
  - Returns JSON readiness report
  - Used by frontend status panel

- **Configuration**: `forge.env.example`
  - Example environment configuration
  - All variables optional with defaults

### Core Engine

- Deterministic proxy generation via FFmpeg
- DaVinci Resolve integration for RAW formats (BRAW, R3D, ARRIRAW)
- JobSpec-driven execution model
- Watch folder automation
- Structured execution results (JSON)

### Supported Formats

- Standard: H.264, ProRes, DNxHD via FFmpeg
- RAW: BRAW, R3D, ARRIRAW via DaVinci Resolve

### Deployment Modes

- Local operator machine
- Headless worker node
- CI/automation runner

---

## [Unreleased]

No unreleased changes.
