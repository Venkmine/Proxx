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

## Preset System

Phase 2 introduces the foundational preset system as pure data structures and validation.

### Design Principles

- Presets are pure data with no side effects
- Category presets represent single concerns
- Global presets compose category presets by reference
- Validation is strict, deterministic, and explicit
- No persistence, file I/O, or execution in Phase 2

### Category Presets

A category preset:
- Represents exactly one concern (codec, scaling, watermark, naming, etc.)
- Is reusable across multiple global presets
- Has no knowledge of other categories
- Validates its own fields strictly
- Rejects unknown fields

Categories implemented:
- `CODEC`: Output codec configuration (ProRes, DNxHR, DNxHD)
- `SCALING`: Resolution and scaling behavior
- `WATERMARK`: Watermark application rules
- `NAMING`: File naming patterns (stub)
- `FOLDER_OUTPUT`: Output folder configuration (stub)
- `EXCLUSIONS`: File exclusion rules (stub)
- `DUPLICATES`: Duplicate handling (stub)
- `QUEUE`: Queue behavior (stub)
- `REPORTING`: Report generation (stub)

Location: `backend/app/presets/schemas.py`

### Global Presets

A global preset:
- References exactly one category preset per category
- Contains NO inline category configuration
- Acts as a recipe, not a blob
- Validates that all referenced presets exist

Validation enforces:
- All required categories must be present
- No unknown categories allowed
- No duplicate category references
- All referenced presets must exist in registry

Location: `backend/app/presets/models.py`

### Registry

The preset registry is an in-memory store used for validation only.

Responsibilities:
- Store category presets by category and ID
- Store global presets by ID
- Validate referential integrity when global presets are added
- Prevent duplicate IDs within categories

Location: `backend/app/presets/registry.py`

### Validation

All validation uses Pydantic models with:
- Explicit error messages
- No silent coercion
- No defaults beyond schema-level safety
- Deterministic behavior

Custom error types:
- `PresetValidationError`: Base exception for all validation failures
- `UnknownCategoryError`: Unknown category referenced
- `DuplicateCategoryError`: Category referenced multiple times
- `MissingCategoryError`: Required category missing
- `PresetNotFoundError`: Referenced preset does not exist

Location: `backend/app/presets/errors.py`

### What Phase 2 Does NOT Include

- Preset persistence to disk
- Preset loading from files
- UI for preset management
- Preset application/execution
- Resolve integration
- Metadata handling
- Job engine integration

These will be added in future phases.

## Out of Scope (Current)

The following systems are intentionally not implemented yet:

- Resolve integration
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