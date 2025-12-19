# PROXX — CURRENT FOCUS

## COMPLETED PHASES

- Phase 1 — Project scaffolding (Electron + React frontend, FastAPI backend, health check IPC)
- Phase 2 — Preset system foundations (data model, validation, in-memory registry)
- Phase 3 — Metadata engine foundations (extraction, validation, workflow flags)
- Phase 4 — Job engine foundations (job/task models, state transitions, orchestration)
- Phase 5 — Resolve integration foundations (discovery, validation, command preparation)
- Phase 6 — Execution pipeline (single clip)
- Phase 7 — Job execution (multi-clip, sequential)
- Phase 8 — Reporting & diagnostics (job/clip reports, CSV/JSON/TXT output)
- Phase 9 — Monitoring server (read-only job status visibility)
- Phase 10 — Watch folders & unattended ingestion (polling-based discovery, stability detection, job creation)
- Phase 11 — Preset application & execution automation (explicit binding, opt-in auto-execution, safety checks)
- Phase 12 — Persistence & recovery (SQLite storage, explicit save/load, RECOVERY_REQUIRED status, honest recovery detection)
- Phase 13 — Operator control & intent surfaces (CLI commands: resume, retry, cancel, rebind; explicit operator intent only)
- Phase 14 — Minimal operator UI (read-only job/clip visibility + explicit control buttons; HTTP control endpoints; confirmation-gated actions)
- Phase 15 — Manual job creation & operator ergonomics (explicit manual job creation, multi-select UI, filesystem utilities, path favorites)
- Phase 16 — Execution Engines (FFmpeg first) (engine abstraction, FFmpegEngine with subprocess, engine binding at job level, FIFO scheduler, UI engine selector)
- Phase 17 — Deliver Capability Model (full Resolve Deliver parity: DeliverSettings, VideoCapabilities, AudioCapabilities, FileCapabilities, MetadataCapabilities, OverlayCapabilities; engine mapping layer; metadata passthrough defaults ON; token-based naming; persistent Control Panel UI; 2-column layout with authoritative Deliver panel; presets initialize settings; jobs own settings; UI always reflects backend state)
- Phase 18 — Resolve Engine Integration
- Phase 19 — Queue Authority, Panel Rebalance, Keyboard Control, Error Correction (3-column layout: Source & Intake LEFT, Render Queue CENTER, Deliver RIGHT; Finder-style keyboard shortcuts: Cmd+Z/Cmd+Shift+Z undo/redo, Cmd+A select all, Esc clear, Delete removes; memory-only undo stack with floating toast; NO confirmation prompts anywhere; global drag & drop with full-viewport scrim; improved error handling preventing [object Object]; requeue job action; Coming next stubs for Watch Folders UI and Overlay Preview)

## ACTIVE PHASE

- Phase 20 — Stability & Polish

## BLOCKERS / OPEN QUESTIONS

- None yet