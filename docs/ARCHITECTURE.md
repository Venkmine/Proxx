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

## Job Engine

Phase 4 introduces the job orchestration system for batch media processing.

### Design Principles

- Jobs are collections of independent clip tasks
- One clip failing must never block other clips (warn-and-continue)
- Filesystem is authoritative (no premature validation)
- Jobs are resumable in principle (persistence deferred to Phase 6+)
- State modeling only—no execution, no persistence, no UI

### Job Model

A job represents a batch processing operation containing multiple clip tasks.

**Job Properties:**
- Unique ID (non-deterministic UUID)
- Created/started/completed timestamps
- Status: PENDING, RUNNING, PAUSED, COMPLETED, COMPLETED_WITH_WARNINGS, FAILED
- Collection of ClipTasks
- Summary counts: total, completed, skipped, failed, warnings

**ClipTask Properties:**
- Unique ID (non-deterministic UUID)
- Source path (absolute, not validated at creation)
- Status: QUEUED, RUNNING, COMPLETED, SKIPPED, FAILED
- Failure reason (if applicable)
- Warnings (non-blocking issues)
- Retry count (stub for future use)

Location: `backend/app/jobs/models.py`

### State Transitions

State transitions are strictly validated to ensure deterministic behavior.

**Job Transitions:**
- PENDING → RUNNING (start job)
- RUNNING → PAUSED (pause execution)
- PAUSED → RUNNING (resume execution)
- RUNNING → COMPLETED (all tasks completed successfully)
- RUNNING → COMPLETED_WITH_WARNINGS (all tasks terminal, some failed/skipped/warned)
- PENDING/RUNNING/PAUSED → FAILED (engine failure)

**Task Transitions:**
- QUEUED → RUNNING (start processing)
- RUNNING → COMPLETED (success)
- RUNNING → FAILED (processing failure)
- RUNNING → SKIPPED (skipped during processing)
- QUEUED → SKIPPED (early skip, e.g., validation failure)

Location: `backend/app/jobs/state.py`

### Job Status Aggregation

Job status is computed from task states using strict rules:

- **FAILED**: Only if the job engine itself cannot continue
- **COMPLETED**: All tasks in terminal states, no failures, no warnings
- **COMPLETED_WITH_WARNINGS**: All tasks in terminal states, but some failed/skipped/warned
- **RUNNING**: At least one task is running or queued
- **PAUSED**: Explicitly set by user
- **PENDING**: No tasks started yet

This enforces warn-and-continue semantics: clip failures produce COMPLETED_WITH_WARNINGS, not FAILED.

### Orchestration Engine

The JobEngine manages job lifecycle operations:

**Operations:**
- `create_job()`: Create job from source paths (no filesystem validation)
- `start_job()`: Transition from PENDING to RUNNING
- `pause_job()`: Pause execution (finish current clip, don't start new ones)
- `resume_job()`: Resume from PAUSED state
- `cancel_job()`: Mark job as FAILED safely
- `update_task_status()`: Update individual task state with validation
- `compute_job_status()`: Aggregate task states into job status
- `finalize_job()`: Compute final job status when all tasks are terminal

**Execution Stubs:**
- `_execute_task()`: Stub for Phase 5+ (Resolve/ffmpeg integration)
- `_process_job()`: Stub for Phase 5+ (task execution loop)

Location: `backend/app/jobs/engine.py`

### Registry

The job registry provides in-memory job tracking:

**Capabilities:**
- Add/retrieve jobs by ID
- List all jobs (sorted by creation time)
- Remove jobs
- Count total jobs

Location: `backend/app/jobs/registry.py`

### What Phase 4 Does NOT Include

- Actual transcoding or media execution
- Resolve integration
- Job persistence to disk
- Watch folders or scheduling
- Prioritization or queue management
- UI integration
- Metadata extraction (already exists in Phase 3)
- Preset application (handled in Phase 5+)

These will be added in future phases.

## Out of Scope (Current)

The following systems are intentionally not implemented yet:

- Resolve integration
- Job execution (transcoding, rendering)
- Job persistence
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