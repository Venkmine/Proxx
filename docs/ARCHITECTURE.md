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

## Metadata Engine

Phase 3 introduces the metadata extraction and validation system.

### Design Principles

- Metadata extraction is read-only and non-destructive
- ffprobe (from ffmpeg) is used for all extraction
- Missing metadata is explicitly represented (None or empty)
- Unknown values are never silently guessed
- Failures produce structured warnings, not crashes
- Filesystem is authoritative for identity metadata

### Metadata Scope

The metadata engine extracts and represents:

**Identity:**
- Filename, full path, parent folder

**Time:**
- Duration, frame rate, timecode start (if present)
- Drop-frame flag, VFR flag

**Image:**
- Resolution, aspect ratio, bit depth, chroma subsampling

**Codec/Container:**
- Container format, codec name, profile/level
- GOP type (intra vs long-GOP)

**Audio:**
- Channel count, sample rate (if audio tracks exist)

**Workflow Flags:**
- Supported/unsupported status
- Skip reason (human-readable)
- Validation warnings (non-blocking)

### Data Models

All metadata is represented using Pydantic models with strict validation.

Models:
- `MediaMetadata`: Root metadata object
- `MediaIdentity`: File identity information
- `MediaTime`: Time-related metadata
- `MediaImage`: Image/video metadata
- `MediaCodec`: Codec and container information
- `MediaAudio`: Audio metadata (optional)

Location: `backend/app/metadata/models.py`

### Extraction

Extraction is performed via ffprobe subprocess calls:
- JSON output format for reliable parsing
- Graceful failure handling with structured errors
- No caching or persistence
- Safe to run on arbitrary folders

Main entry point: `extract_metadata(filepath)`

Location: `backend/app/metadata/extractors.py`

### Validation

Validation provides sanity checking and recommendations:
- Identifies unsupported files early
- Flags unusual parameters (VFR, uncommon frame rates, etc.)
- Produces human-readable skip reasons
- Classifies editorial-friendliness
- Generates processing recommendations

Utilities:
- `validate_metadata()`: Sanity checks
- `is_editorial_friendly()`: Editorial suitability check
- `get_processing_recommendation()`: Human-readable recommendation
- `summarize_metadata()`: Text summary for logging

Location: `backend/app/metadata/validators.py`

### What Phase 3 Does NOT Include

- Metadata persistence to disk
- Metadata caching
- Resolve integration
- Job engine integration
- Preset application
- Transcoding or media modification
- UI integration

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