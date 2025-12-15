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

## Resolve Integration

Phase 5 introduces the Resolve integration boundary for capability detection and command preparation.

### Design Principles

- Resolve Studio is required for v1.x
- Resolve is treated as an external system
- Proxx must survive Resolve being missing, misconfigured, or crashing
- Discovery and validation produce explicit, human-readable failure reasons
- Command preparation is decoupled from execution
- Phase 5 is detection-only—no rendering, no execution, no media modification

### Module Structure

Location: `backend/app/resolve/`

Structure:
```
resolve/
├─ __init__.py         # Public API exports
├─ errors.py           # Resolve-specific exceptions
├─ models.py           # Capability and command descriptor models
├─ discovery.py        # Installation path detection
├─ validation.py       # Studio vs Free validation
└─ commands.py         # Render command descriptor preparation
```

### Discovery

Resolve installation discovery uses platform-specific default paths with optional environment variable overrides.

**Platform Defaults:**
- **macOS**: `/Applications/DaVinci Resolve/DaVinci Resolve.app`
- **Windows**: `C:\Program Files\Blackmagic Design\DaVinci Resolve\`

**Optional Environment Overrides:**
- `PROXX_RESOLVE_PATH`: Override Resolve installation path
- `PROXX_RESOLVE_SCRIPT_API_PATH`: Override scripting API path (advanced)

Environment variables are NOT required for normal operation. They provide an escape hatch for non-standard installations in facility environments.

**Discovery Process:**
1. Check `PROXX_RESOLVE_PATH` environment variable (if set)
2. Check platform-specific default path
3. Detect scripting API path (platform-specific)
4. Detect version string (best-effort, may return None)
5. Return `ResolveInstallation` with detected paths and metadata

**Failure Mode:**
If Resolve is not found, `discover_resolve()` raises `ResolveNotFoundError` with human-readable message including expected paths.

Location: `backend/app/resolve/discovery.py`

### Validation

Capability validation checks whether a discovered Resolve installation meets requirements.

**Checks Performed:**
- Scripting API path exists
- Studio vs Free license detection (best-effort, may be inconclusive)

**Studio License Detection:**
Phase 5 uses optimistic detection (assume Studio until proven otherwise). Robust license detection is deferred to execution time (Phase 6+) when the API is actually invoked. Attempting to use restricted API on Free version will fail explicitly at that point.

**Version Enforcement:**
Phase 5 does NOT enforce minimum version requirements. Version detection is performed (if possible), but all versions are accepted. Version gating may be added in Phase 6+ once execution paths exist.

**Validation Result:**
`validate_resolve_capability()` returns `ResolveCapability` indicating:
- `is_available`: True if Resolve can be used, False otherwise
- `installation`: Detected installation info
- `failure_reason`: Human-readable explanation if not available

This function does NOT raise exceptions—it returns structured status for safe inspection.

Location: `backend/app/resolve/validation.py`

### Command Descriptors

Command descriptors are abstract representations of Resolve render operations WITHOUT execution logic.

**ResolveCommandDescriptor:**
- `source_path`: Absolute path to source media
- `output_path`: Absolute path to target output
- `render_preset_id`: Optional reference to global preset ID
- `invocation_type`: How Resolve would be invoked ('script' or 'cli')

**Preparation:**
`prepare_render_command()` creates command descriptors without:
- Validating source file existence
- Validating preset existence
- Requiring Resolve to be installed
- Applying render settings
- Executing anything

This enables:
- Dry-run inspection
- Command serialization for future execution
- Testing without Resolve installed
- Clean separation between preparation and execution

**Important Distinction:**
Command descriptors are NOT concrete execution commands. They are structural data for Phase 6+ execution pipelines to consume. They do NOT contain:
- Project creation logic
- Media import logic
- Preset application tied to jobs

Think of them as "what would be invoked" rather than "how to invoke it."

Location: `backend/app/resolve/commands.py`

### Error Hierarchy

All Resolve errors inherit from `ResolveError`:
- `ResolveNotFoundError`: Resolve not found at expected paths
- `ResolveFreeDetectedError`: Resolve Free detected instead of Studio
- `ResolveValidationError`: Installation validation failed

These errors are NOT fatal to the application. They indicate that Resolve operations cannot proceed, but Proxx continues running.

Location: `backend/app/resolve/errors.py`

### What Phase 5 Does NOT Include

- Rendering or transcoding
- Media modification
- Job execution
- Preset application
- Concrete Resolve API usage
- Project/timeline creation
- Media import logic
- Render progress monitoring
- Resolve state modification

Execution pipelines will be implemented in Phase 6+.

## Execution Pipeline (Single Clip)

Phase 6 introduces the single-clip execution pipeline for end-to-end rendering.

### Design Principles

- Execute exactly one clip in isolation (no job loops, no multi-clip orchestration)
- Filesystem is authoritative for all validation
- Resolve is allowed to crash (failures are explicit and non-blocking)
- Partial success must be reported honestly
- Execution must never block the process indefinitely
- Warn-and-continue semantics apply to all failure modes
- Engine integration is deferred to Phase 7

### Module Structure

Location: `backend/app/execution/`

Structure:
```
execution/
├─ __init__.py         # Public API exports
├─ errors.py           # Execution-specific exceptions
├─ results.py          # ExecutionResult and ExecutionStatus models
├─ runner.py           # Single-clip execution pipeline
├─ resolve_api.py      # Resolve Python API wrapper
└─ paths.py            # Output path generation
```

### Execution Pipeline

The single-clip execution pipeline processes one clip through all stages:

**Pipeline Stages:**

1. **Pre-flight Validation:**
   - Source path exists and is readable
   - Output destination is writable
   - Resolve Studio is available

2. **Preset Resolution:**
   - Retrieve global preset by ID
   - Resolve codec preset reference
   - Resolve duplicates preset for overwrite behavior

3. **Metadata Extraction:**
   - Extract metadata via ffprobe
   - Check if file is supported
   - Collect warnings (VFR, long-GOP, etc.)

4. **Output Path Generation:**
   - Generate output path using stub pattern: `{source_name}_{codec}.{ext}`
   - Handle filename collision (overwrite or generate unique suffix)
   - Ensure output directory exists

5. **Resolve Render Invocation:**
   - Import Resolve Python API
   - Create temporary project (project-per-render strategy)
   - Import source media
   - Create timeline
   - Apply codec settings
   - Submit render job
   - Monitor render progress with timeout
   - Cleanup project

6. **Post-flight Verification:**
   - Output file exists
   - Output file size > 0
   - Output path matches expectation

7. **Result Classification:**
   - SUCCESS: Render completed, output verified
   - SUCCESS_WITH_WARNINGS: Render completed but with non-blocking warnings
   - FAILED: Execution failed at any stage (with explicit reason)

**Entry Point:** `execute_single_clip(source_path, global_preset_id, preset_registry, output_base_dir)`

Location: `backend/app/execution/runner.py`

### Resolve API Wrapper

The Resolve API wrapper provides low-level Resolve Python API invocation for rendering.

**Strategy:**
- **Project-per-render**: Each render creates and deletes a temporary project for clean isolation
- **Timeout handling**: Renders time out after 5 minutes minimum or 2x realtime (whichever is greater)
- **Subprocess-free**: Uses Resolve Python API directly (no CLI subprocess calls)

**Process:**
1. Discover Resolve installation
2. Validate Studio license (optimistic detection)
3. Import DaVinciResolveScript module (dynamic sys.path injection)
4. Create temporary project with timestamp-based name
5. Import source media into media pool
6. Create timeline from imported clip
7. Set render settings (codec, container, output path)
8. Add render job to queue
9. Start rendering and monitor progress (1-second poll interval)
10. Delete project on completion or failure

**Failure Modes:**
- Resolve not found → PreFlightCheckError
- Free detected → PreFlightCheckError
- API import failed → PreFlightCheckError
- Project creation failed → ResolveExecutionError
- Media import failed → Render failure (returned as False + error message)
- Timeline creation failed → Render failure
- Render timeout → Render failure
- Render job failed/cancelled → Render failure

Location: `backend/app/execution/resolve_api.py`

### Output Path Generation

Output path generation creates filesystem paths for rendered clips based on presets and metadata.

**Phase 6 Implementation:**
- **Stub pattern**: `{source_name}_{codec}.{ext}`
- Full pattern engine with variables (resolution, timecode, date, etc.) deferred to Phase 7+

**Filename Safety:**
- Invalid characters replaced with underscore
- Leading/trailing spaces and dots stripped
- Empty names replaced with "output"

**Collision Handling:**
- If `overwrite_existing` is True: Use original path (overwrite)
- If `overwrite_existing` is False: Append numeric suffix (`_001`, `_002`, etc.)
- Safety limit: 999 iterations before raising error

Location: `backend/app/execution/paths.py`

### Execution Results

All execution outcomes are represented as structured `ExecutionResult` objects.

**ExecutionStatus Enum:**
- `SUCCESS`: Render completed, output verified
- `SUCCESS_WITH_WARNINGS`: Render completed but with non-blocking warnings
- `FAILED`: Execution failed at any stage

**ExecutionResult Properties:**
- `status`: Final execution status
- `source_path`: Source media file processed
- `output_path`: Output file path (if succeeded)
- `started_at`: Execution start timestamp
- `completed_at`: Execution completion timestamp
- `warnings`: List of non-blocking warnings
- `failure_reason`: Human-readable failure reason (if failed)

**Methods:**
- `duration_seconds()`: Calculate execution duration
- `summary()`: Human-readable summary line

Location: `backend/app/execution/results.py`

### Failure Modes Handled

All failure modes are non-blocking to the application:

**Pre-flight Failures:**
- Source file missing
- Source file not readable
- Source is directory, not file
- Output directory not writable
- Permission denied
- Resolve not installed
- Resolve Free detected
- Global preset not found
- Codec preset not found

**Extraction Failures:**
- Metadata extraction failed
- Unsupported media format
- ffprobe not available

**Execution Failures:**
- Resolve API import failed
- Resolve not running
- Project creation failed
- Media import failed
- Timeline creation failed
- Render timeout exceeded
- Render job failed/cancelled

**Verification Failures:**
- Output file not created
- Output file zero bytes

All failures produce structured `ExecutionResult` with `status=FAILED` and explicit `failure_reason`. The application continues running after any failure.

### Error Hierarchy

All execution errors inherit from `ExecutionError`:
- `PreFlightCheckError`: Pre-flight validation failed
- `ResolveExecutionError`: Resolve execution failed
- `OutputVerificationError`: Output verification failed

Location: `backend/app/execution/errors.py`

### What Phase 6 Does NOT Include

- Multi-clip execution
- Job orchestration (no task loops)
- Engine integration (no wire-up to job engine)
- Parallel execution
- Background workers
- Persistence
- UI integration
- Watch folders
- Retries beyond one attempt
- Scheduling or prioritization
- Full pattern engine (only stub pattern)
- Watermark application
- Scaling preset application
- Progress reporting to UI

Engine integration and multi-clip orchestration will be implemented in Phase 7.

## Out of Scope (Current)

The following systems are intentionally not implemented yet:

- Multi-clip job execution (Phase 7)
- Job persistence (Phase 7+)
- Watch folders (Phase 7+)
- Monitoring server (Phase 7+)
- Multi-node execution (Phase 8+)

These will be documented when they exist.

## Update Policy

This document should be updated:
- When a new subsystem is added
- When execution model changes
- When IPC model changes

It should not be updated for minor refactors.