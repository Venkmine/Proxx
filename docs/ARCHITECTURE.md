# PROXX — ARCHITECTURE OVERVIEW

This document describes the current technical structure of Proxx.
It is descriptive, not aspirational.

## High-Level Overview

Proxx is a desktop application composed of:

- An Electron-based desktop shell
- A React frontend
- A local Python backend service
- Local IPC over HTTP (localhost)

Resolve is not yet integrated at this stage.

## Components

### Frontend

- Electron provides the desktop runtime
- React renders the UI
- Frontend communicates with backend via HTTP
- No stateful business logic exists in the frontend yet
- Single page with health check demonstration

Location: `frontend/`

Structure:
```
frontend/
├─ electron/
│  ├─ main.ts           # Electron main process
│  └─ preload.ts        # Context bridge (currently empty)
├─ src/
│  ├─ App.tsx           # Root component with health check button
│  └─ main.tsx          # React entry point
├─ index.html
├─ package.json
├─ tsconfig.json
├─ tsconfig.electron.json
├─ tsconfig.node.json
└─ vite.config.ts
```

markdown
Copy code

### Backend

- Python FastAPI service
- Exposes minimal HTTP endpoints
- No persistent state
- No background workers
- No job engine

Location: `backend/`

Structure:
```
backend/
├─ app/
│  ├─ main.py           # FastAPI app initialization
│  └─ routes/
│     └─ health.py      # GET /health → {"status": "ok"}
├─ requirements.txt     # FastAPI, Uvicorn
└─ run_dev.sh           # Dev server launcher
```

Endpoints:
- `GET /` → Service info
- `GET /health` → Health check (status: ok)

markdown
Copy code

### IPC

- Localhost HTTP calls
## Execution Model

- Backend and frontend run as separate processes
- Backend: `./backend/run_dev.sh` starts uvicorn on port 8000
- Frontend: `npm run dev` in `frontend/` launches Electron + Vite
- Combined launcher: `./scripts/dev.sh` starts both services
- No lifecycle coupling beyond manual startupscaffolding.

## Data & State

- No database
- No persistent state
- No job tracking

All logic is currently stateless.

## Execution Model

- Frontend launches backend separately
- Backend runs independently
- No lifecycle coupling beyond manual startup

## Out of Scope (Current)

The following systems are intentionally not implemented yet:

- Resolve integration
- Preset system
- Metadata extraction
- Job engine
- Watch folders
- Monitoring server
- Multi-node execution

These will be documented when they exist.

## Update Policy

This document should be updated:
- When a new subsystem is added
- When execution model changes
- When IPC model changes

It should not be updated for minor refactors.