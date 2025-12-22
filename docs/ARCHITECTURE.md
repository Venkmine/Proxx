INACTIVE — DOES NOT DESCRIBE CURRENT PRODUCT STATE (ALPHA)

PRODUCT_PROXY_V1.md

QA.md (Verify principles stay, “Definition of Done” does not)

NEXT_AFTER_V1.md

# Awaire Proxy — Architecture Overview

This document describes the current technical structure of Awaire Proxy.
It is descriptive, not aspirational.

## High-Level Overview

Awaire Proxy is a desktop application composed of:

- An Electron-based desktop shell
- A React frontend
- A local Python backend service
- Local IPC over HTTP (localhost)
- FFmpeg for media transcoding

## Components

### Frontend

- Electron provides the desktop runtime
- React renders the UI
- Frontend communicates with backend via HTTP
- State derives from backend, never the reverse

Location: `frontend/`

Structure:
```
frontend/
├── electron/
│   ├── main.ts           # Electron main process
│   └── preload.ts        # Context bridge
├── src/
│   ├── App.tsx           # Root component
│   ├── main.tsx          # React entry point
│   └── components/       # UI components
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

### Backend

- Python FastAPI service
- SQLite for persistence
- FFmpeg subprocess execution
- Watch folder scanning

Location: `backend/`

Structure:
```
backend/
├── app/
│   ├── main.py           # FastAPI app initialization
│   ├── cli/              # CLI commands
│   ├── deliver/          # Deliver capability model
│   ├── execution/        # FFmpeg execution engine
│   ├── jobs/             # Job engine
│   ├── metadata/         # Media metadata extraction
│   ├── monitoring/       # Job status server
│   ├── persistence/      # SQLite storage
│   ├── presets/          # Preset system
│   ├── reporting/        # Job/clip reports
│   ├── routes/           # HTTP endpoints
│   └── watchfolders/     # Watch folder scanning
├── requirements.txt
└── run_dev.sh
```

### Execution Engine

FFmpeg is the only supported execution engine.

The execution pipeline:
1. Job receives clips from watch folder or manual add
2. Each clip becomes a task
3. FFmpeg subprocess generates proxy
4. ffprobe validates output
5. Results reported

### Data Flow

```
Watch Folder → Job Registry → Task Queue → FFmpeg → Output + Report
                    ↓
              Persistence (SQLite)
                    ↓
              Monitoring Server → Frontend UI
```

## Execution Model

- Backend and frontend run as separate processes
- Backend: `uvicorn app.main:app` on port 8085
- Frontend: Vite dev server on port 5173, Electron shell
- Combined launcher: `./dev_launch.sh`

## Data & State

- SQLite database: `./awaire_proxy.db`
- Job state persisted across restarts
- Watch folder state tracked for exactly-once ingestion

## QA System

Verify is the QA framework. See `qa/` for implementation.

Verification levels:
- `verify proxy fast` — lint, unit tests, schema validation
- `verify proxy` — integration tests, watch folder simulation
- `verify proxy full` — real FFmpeg transcodes, ffprobe validation
