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

## Reporting & Diagnostics

Phase 8 introduces job and clip-level reporting for post-execution analysis.

### Design Principles

- Reports are first-class outputs, not optional extras
- Reporting is observational only—no mutation of job or task state
- Reports capture execution truth from existing state (Job, ClipTask, ExecutionResult)
- Machine-readable (CSV, JSON) and human-readable (TXT) formats
- Reports written to disk alongside job outputs
- Timestamped filenames prevent collisions
- Silence is a failure mode—everything that happened must be recorded

### Module Structure

Location: `backend/app/reporting/`

```
reporting/
├─ __init__.py
├─ models.py        # Immutable report data structures
├─ writers.py       # CSV, JSON, TXT report writers
├─ diagnostics.py   # Environment and system info capture
└─ errors.py        # Reporting-specific errors
```

### Report Data Models

All report models are immutable and derived from existing state at job completion.

**ClipReport** (Immutable):
- Task ID, source path
- Final status (COMPLETED, FAILED, SKIPPED)
- Failure reason and warnings
- Output path, file size, execution duration
- Timestamps (started_at, completed_at)

**JobReport** (Immutable):
- Job ID, final status
- Timing (created_at, started_at, completed_at, duration)
- Summary counts (total, completed, failed, skipped, warnings)
- Collection of ClipReports
- DiagnosticsInfo

**DiagnosticsInfo**:
- Proxx version (git commit hash or fallback)
- Python version, OS version, hostname
- Resolve path, version, Studio license status
- Report generation timestamp

Location: `backend/app/reporting/models.py`

### Report Generation

Reports are generated at job completion via `JobEngine.execute_job()`.

**Execution Flow:**
1. `JobEngine.execute_job()` called with job and preset
2. Job execution proceeds via `_process_job()` (Phase 7 logic)
3. ExecutionResults collected during execution (stored in dict keyed by task_id)
4. After job finalization, `_generate_job_reports()` invoked
5. ClipReports constructed with metadata from ExecutionResults (output paths, durations, sizes)
6. JobReport built with aggregated job state and diagnostics
7. Reports written to disk in three formats

**Report Outputs:**
- `proxx_job_{job_id}_{timestamp}.csv` — Clip-level details in spreadsheet format
- `proxx_job_{job_id}_{timestamp}.json` — Full structured data for machine parsing
- `proxx_job_{job_id}_{timestamp}.txt` — Human-readable summary

Reports written to `output_base_dir` (same location as rendered clips).

Location: `backend/app/jobs/engine.py` (integration), `backend/app/reporting/writers.py` (output)

### Diagnostics Capture

System environment captured at report generation time:

- **Proxx version**: Git commit hash via `git rev-parse --short HEAD` (fallback: hardcoded "0.1.0")
- **Python version**: `sys.version_info`
- **OS version**: `platform.platform()` (e.g., "macOS-14.1.1-arm64")
- **Hostname**: `platform.node()`
- **Resolve info**: Path, version (currently "unknown"—stubbed in Phase 5), Studio license

Diagnostics are non-blocking—failures captured in report without aborting generation.

Location: `backend/app/reporting/diagnostics.py`

### Report Writers

Three format writers implemented:

**CSV Writer** (`write_csv_report`):
- One header row
- One row per clip
- Columns: task_id, source_path, status, output_path, output_size_bytes, execution_duration_seconds, failure_reason, warnings, timestamps
- Warnings joined with semicolons for single-cell storage

**JSON Writer** (`write_json_report`):
- Full JobReport model serialized to JSON
- Pretty-printed with 2-space indentation
- Datetime objects serialized to ISO 8601 strings

**TXT Writer** (`write_text_report`):
- Human-readable multi-line summary
- Sections: Job summary, diagnostics, clip details
- Durations formatted (e.g., "2m 34.5s")
- File sizes formatted (e.g., "1.2 GB")
- Full clip-by-clip breakdown with warnings and failures highlighted

All writers handle collisions via timestamped filenames.

Location: `backend/app/reporting/writers.py`

### Error Handling

Custom error types:
- `ReportingError`: Base exception for reporting failures
- `ReportWriteError`: Failed to write report to disk

Reporting errors do NOT abort job execution—they are logged but non-blocking.

Location: `backend/app/reporting/errors.py`

### Integration with JobEngine

Reporting integrated into `JobEngine.execute_job()`:

```python
def execute_job(
    job: Job,
    global_preset_id: str,
    preset_registry: PresetRegistry,
    output_base_dir: Optional[str] = None,
    generate_reports: bool = True,
) -> Optional[Dict[str, Path]]:
    # Start job and execute all tasks
    self.start_job(job)
    execution_results = self._process_job(...)
    
    # Generate reports if requested
    if generate_reports:
        return self._generate_job_reports(job, execution_results, output_base_dir)
    
    return None
```

**Key Details:**
- `_process_job()` now returns `Dict[str, ExecutionResult]` (keyed by task_id)
- ExecutionResults provide output paths, durations, file sizes for ClipReports
- Reports derived from Job/ClipTask state + ExecutionResult metadata
- No mutation of Job or ClipTask models—reporting is read-only
- Default behavior: reports always generated (can be disabled)

### What Phase 8 Does NOT Include

- Report persistence or archiving (reports are fire-and-forget)
- Report serving via API (no HTTP endpoints)
- UI integration for report viewing
- PDF report generation
- Email/notification system
- Real-time progress reporting (WebSocket)
- Report aggregation across multiple jobs
- Failure pattern analysis or ML insights
- Retry logic based on reports
- Job persistence beyond report artifacts

These may be added in future phases.

## Monitoring Server (Read-Only)

Phase 9 introduces a read-only HTTP monitoring server for remote job status visibility.

### Design Principles

- Strictly read-only—no mutation of jobs, tasks, presets, or execution state
- Observation only—no control operations (start, stop, pause, retry)
- Trusted LAN access—no authentication required
- Crash-independent—monitoring failure does not affect job execution
- Filesystem scanning for reports—no in-memory report tracking required
- Explicit errors—missing data returns clear messages, never silent failures

### Module Structure

Location: `backend/app/monitoring/`

Structure:
```
monitoring/
├─ __init__.py         # Module exports
├─ server.py           # FastAPI router with endpoints
├─ models.py           # Response schemas
├─ queries.py          # Read-only JobRegistry access layer
├─ errors.py           # Monitoring-specific exceptions
└─ utils.py            # Report discovery and path formatting
```

### Endpoints

All endpoints return JSON responses.

**GET /monitor/health**
- Health check endpoint
- Returns: `{"status": "ok"}`

**GET /monitor/jobs**
- List all known jobs with summary information
- Jobs sorted by creation time (newest first)
- Returns: `JobListResponse` with job summaries (ID, status, timestamps, progress counts)

**GET /monitor/jobs/{job_id}**
- Retrieve detailed information about a specific job
- Includes all clip task details, timestamps, warnings, and failure reasons
- Returns: `JobDetail` with complete job state
- Raises 404 if job not found

**GET /monitor/jobs/{job_id}/reports**
- Retrieve references to all report files for a specific job
- Scans filesystem for matching report artifacts (CSV, JSON, TXT)
- Returns: `JobReportsResponse` with filename, path, size, and modified timestamp for each report
- Returns empty list if no reports have been generated yet
- Raises 404 if job not found

### Data Sources

The monitoring server reads from:

1. **In-memory JobRegistry**: Job and task state accessed via `app.state.job_registry`
2. **Filesystem**: Report artifacts scanned via pattern matching `proxx_job_{job_id[:8]}_{timestamp}.{csv|json|txt}`

The monitoring server does NOT:
- Trigger job execution
- Generate reports
- Recompute state
- Modify any data structures
- Store additional state beyond the shared JobRegistry

### Integration

The monitoring router is mounted at `/monitor` prefix in `backend/app/main.py`.

**Shared State:**
- `app.state.job_registry`: JobRegistry instance shared between monitoring and execution logic
- JobRegistry is initialized at application startup
- All monitoring endpoints access registry via FastAPI request context

**Lifecycle:**
- Monitoring router lifecycle tied to FastAPI application
- If monitoring server crashes, jobs continue (same process, but logic decoupled)
- No background workers or separate processes
- No persistence—all state in-memory

### Response Models

All response models use Pydantic with strict validation (`extra="forbid"`).

**HealthResponse**: Status indicator
**JobSummary**: High-level job view (status, timestamps, progress counts)
**JobDetail**: Complete job view (includes all ClipTaskDetail entries)
**ClipTaskDetail**: Individual task view (source, status, timestamps, warnings, failure reason)
**ReportReference**: Report file metadata (filename, path, size, modified timestamp)
**JobReportsResponse**: Collection of ReportReference objects for a job
**JobListResponse**: Collection of JobSummary objects with total count

Location: `backend/app/monitoring/models.py`

### Error Handling

Custom error types:
- `MonitoringError`: Base exception for monitoring operations
- `JobNotFoundError`: Raised when requested job ID does not exist
- `ReportsNotAvailableError`: Raised when reports requested but not available (currently unused—empty list returned instead)

All HTTP errors mapped to appropriate status codes:
- 404: Job not found
- 500: Internal server error (unexpected failures)

No silent failures—all missing data produces explicit error responses.

Location: `backend/app/monitoring/errors.py`

### Report Discovery

Report discovery uses filesystem scanning via `find_job_reports()`:

**Process:**
1. Extract first 8 characters of job ID
2. Scan output directory (defaults to current working directory)
3. Match files against pattern: `proxx_job_{job_id[:8]}_{timestamp}.{csv|json|txt}`
4. Return list of matching Path objects sorted by modification time (newest first)

**Collision Safety:**
- Uses same filename pattern as report writers (Phase 8)
- Scans actual filesystem—no in-memory state required
- Returns empty list if output directory missing or no reports found

Location: `backend/app/monitoring/utils.py`

### What Phase 9 Does NOT Include

- Job control endpoints (start, stop, pause, resume, cancel)
- Authentication or authorization
- WebSocket or SSE for real-time progress
- UI for monitoring
- Report downloading or serving
- Report aggregation or analysis
- Job submission or creation
- Preset management
- Background execution decoupling (monitoring and execution share process lifecycle)
- Persistent monitoring state
- Alerting or notifications
- Multi-user access control

Control operations and advanced monitoring features may be added in future phases.

## Watch Folders & Unattended Ingestion

Phase 10 introduces watch folder functionality for automatic media file discovery and job creation.

### Design Principles

- Watch folders create jobs but NEVER auto-execute them
- File stability must be verified before ingestion (poll-based)
- Duplicate ingestion must be prevented
- Drive disappearance must pause ingestion, not crash
- Safety over convenience: cautious, slightly annoying is correct

### Module Structure

Watch folders are backend-only plumbing (no HTTP routes in Phase 10).

Location: `backend/app/watchfolders/`

Structure:
```
watchfolders/
├─ __init__.py       # Public API exports
├─ errors.py         # WatchFolderError hierarchy
├─ models.py         # WatchFolder, FileStabilityCheck Pydantic models
├─ registry.py       # In-memory WatchFolderRegistry
├─ scanner.py        # Filesystem scanning with extension filtering
├─ stability.py      # File size polling for copy completion detection
└─ engine.py         # Orchestration: scan → stability → job creation
```

### Watch Folder Configuration

A watch folder:
- Monitors a directory for new media files (.mov, .mxf, .mp4, .avi, .mkv)
- Can be recursive or top-level only
- Can be enabled/disabled
- Does NOT specify a preset (presets deferred to Phase 11)
- Is configured programmatically (no UI or HTTP endpoints in Phase 10)

Configuration stored in `WatchFolderRegistry` (in-memory only, no persistence).

Location: `backend/app/watchfolders/models.py`, `backend/app/watchfolders/registry.py`

### File Discovery

File scanning uses `FileScanner`:
- Recursive or non-recursive directory traversal
- Extension whitelist: `.mov`, `.mxf`, `.mp4`, `.avi`, `.mkv`
- Skips hidden files (starting with `.`)
- Skips symlinks (for safety)
- Returns candidate files sorted deterministically

Location: `backend/app/watchfolders/scanner.py`

### File Stability Detection

Files must be stable before ingestion to avoid processing partial copies.

Stability detection uses polling via `FileStabilityChecker`:
- Poll file size every 5 seconds
- File considered stable after 3 consecutive unchanged size checks (~15 seconds)
- Minimum age requirement: 10 seconds from modification time
- Total stability time: ~25 seconds from file creation

A file is considered stable when:
1. File exists and is readable
2. File is at least 10 seconds old (modification time)
3. File size unchanged for 3 consecutive polls (15 seconds)

Files that fail stability checks are skipped with warnings (warn-and-continue).

Location: `backend/app/watchfolders/stability.py`

### Duplicate Prevention

In-memory tracking prevents same file from being ingested twice.

Mechanism:
- `WatchFolderEngine` maintains set of processed file paths
- Before creating job, check if file path already processed
- Limitation: Tracking lost on application restart (acceptable for Phase 10)

Future phases: Migrate to persistent database tracking (SQLite).

Location: `backend/app/watchfolders/engine.py`

### Job Creation

Jobs are created via `WatchFolderEngine.scan_folder()`:

Process:
1. Scan watch folder for candidate files (via `FileScanner`)
2. Check stability for each file (via `FileStabilityChecker`)
3. Skip already-processed files (duplicate prevention)
4. Create one PENDING job per stable file (via `JobEngine.create_job()`)
5. Mark file as processed

Jobs created from watch folders:
- Contain single ClipTask with source file path
- Left in PENDING state (no auto-execution)
- Have NO preset applied (preset application deferred to Phase 11)
- Follow existing job model from Phase 4

Execution must be triggered manually via `JobEngine.start_job()` (Phase 11+ will add auto-execution with safeguards).

Location: `backend/app/watchfolders/engine.py`

### Orchestration

Main entry point: `WatchFolderEngine.scan_all_folders()`

Orchestration flow:
1. Retrieve all enabled watch folders from registry
2. For each watch folder:
   - Scan filesystem for candidate files
   - Check stability for each file
   - Create jobs for stable, unprocessed files
3. Return list of newly created jobs

Warn-and-continue semantics: Individual folder or file failures do not block processing of other folders/files.

Call `scan_all_folders()` periodically (e.g., every 15-30 seconds via external scheduler or background worker) to detect and ingest new files.

### Error Handling

Custom error types:
- `WatchFolderError`: Base exception for watch folder failures
- `FileStabilityError`: File not stable for processing
- `WatchFolderNotFoundError`: Watch folder path does not exist
- `DuplicateWatchFolderError`: Watch folder ID already exists
- `InvalidWatchFolderPathError`: Path is not a directory or not readable

All errors are non-fatal to application. They indicate operation failure but Proxx continues running.

Location: `backend/app/watchfolders/errors.py`

### Integration with Job Engine

Watch folder engine uses existing `JobEngine.create_job()` for job creation:
- No changes to job engine required
- Jobs created follow existing Phase 4 job model
- Jobs can be executed via existing Phase 7 multi-clip orchestration
- Reports generated via existing Phase 8 reporting system

No new endpoints or routes—watch folders are backend plumbing only in Phase 10.

### What Phase 10 Does NOT Include

- Auto-execution of jobs (manual trigger only)
- Preset application during ingestion (presets deferred to Phase 11)
- HTTP endpoints or UI for watch folder management
- Persistence of watch folder configurations (in-memory only)
- Database tracking of processed files (in-memory only)
- Event-based file watching (polling only)
- Rate limiting or throttling
- Disk space monitoring
- Network mount health checks
- Retry logic for failed stability checks
- Watch folder pause/resume via UI
- Per-folder execution history
- Metrics/telemetry

These features may be added in future phases (Phase 11+).

## Preset Binding & Execution Automation

Phase 11 introduces explicit preset binding and opt-in execution automation for jobs.

### Design Principles

- Presets are bound explicitly, never inferred
- Auto-execution requires explicit opt-in and is reversible
- Watch folder ingestion remains non-executing by default
- Automation is mediated and subject to safety checks
- Default behavior remains manual
- Bindings are stored externally (not on Job models)

### Module Structure

Location: `backend/app/jobs/`, `backend/app/watchfolders/`

New files:
```
jobs/
├─ bindings.py       # JobPresetBindingRegistry (external storage for job→preset mappings)
└─ automation.py     # ExecutionAutomation mediator (safety checks, auto-execution logic)
```

Modified files:
```
jobs/
└─ engine.py         # Updated to support binding_registry, optional preset parameter

watchfolders/
├─ models.py         # Added preset_id and auto_execute fields
└─ engine.py         # Integrated with automation mediator
```

### Job-Preset Binding

Jobs do NOT store preset IDs directly. Preset bindings are tracked externally via `JobPresetBindingRegistry`.

**JobPresetBindingRegistry** (`backend/app/jobs/bindings.py`):
- In-memory mapping: `job_id → preset_id`
- Methods: `bind_preset()`, `get_preset_id()`, `unbind_preset()`, `has_binding()`
- Persistence deferred to Phase 12

**Explicit Binding** via `JobEngine.bind_preset()`:
- Validates preset existence (optional)
- Stores binding in registry
- Does NOT start execution

**Implicit Binding** via watch folders:
- If `WatchFolder.preset_id` is set, jobs created from that folder are automatically bound

### Execution Trigger

Jobs can be executed via `JobEngine.execute_job()` (existing method, now enhanced):

**Updated Behavior:**
- If `binding_registry` is available, checks for bound preset
- Falls back to `global_preset_id` parameter if no binding exists
- Raises `ValueError` if no preset available (neither bound nor provided)
- Validates preset exists in registry before execution

**Manual Execution:**
```python
# Option 1: Bind preset, then execute
job_engine.bind_preset(job, "my_preset_id", preset_registry)
job_engine.execute_job(job, preset_registry=preset_registry)

# Option 2: Pass preset directly (no binding)
job_engine.execute_job(job, global_preset_id="my_preset_id", preset_registry=preset_registry)
```

### Optional Auto-Execution

Watch folders support optional auto-execution via `auto_execute` flag.

**WatchFolder Configuration:**
- `preset_id`: Optional global preset ID to bind to created jobs
- `auto_execute`: Boolean flag (default: False)

**Behavior:**
- If `auto_execute=False`: Jobs created in PENDING state (manual trigger required)
- If `auto_execute=True` AND `preset_id` is set: Auto-execution attempted via mediator
- If `auto_execute=True` BUT `preset_id` is missing: Warning logged, no auto-execution

**Safety:**
Auto-execution is not guaranteed even when enabled. It requires:
1. Explicit opt-in (`auto_execute=True`)
2. Preset configured (`preset_id` set)
3. All safety checks pass (disk space, concurrency)

### Execution Automation Mediator

Auto-execution is mediated by `ExecutionAutomation` class to enforce safety.

**ExecutionAutomation** (`backend/app/jobs/automation.py`):
- Deliberate layer between job creation and execution
- Enforces safety checks before execution
- Does NOT guess—only proceeds when intent is explicit

**Safety Checks (hard-coded in Phase 11):**
1. Job must be in PENDING state
2. Preset must be configured (bound or provided)
3. Preset must exist in registry
4. Disk space check: Minimum 10GB free space
5. Concurrency check: Maximum 1 concurrent job

**Methods:**
- `can_auto_execute()`: Safety check only (no side effects)
- `auto_execute_job()`: Perform checks, then delegate to `JobEngine.execute_job()`

**Integration:**
- `WatchFolderEngine` receives optional `automation_mediator` parameter
- If auto-execution enabled, engine calls `automation_mediator.auto_execute_job()`
- Failures logged as warnings (warn-and-continue)

### Safety Guarantees

Phase 11 automation is deliberately restrictive:

**Hard Limits:**
- Minimum disk space: 10GB (hard-coded)
- Maximum concurrent jobs: 1 (hard-coded)

**Failure Modes:**
- Missing preset: Job left in PENDING with warning
- Invalid preset: Job left in PENDING with warning
- Disk space too low: Job left in PENDING with warning
- Concurrency limit exceeded: Job left in PENDING with warning

All failures are non-blocking. Jobs remain in PENDING state and can be manually triggered later.

### What Phase 11 Does NOT Include

- UI for preset binding or auto-execution configuration
- Heuristic preset inference (e.g., from filenames or folders)
- Scheduling or queue prioritization
- Smart disk space calculation (per-job requirements)
- Dynamic concurrency limits
- Retry logic
- Persistence of bindings (in-memory only)
- Watch folder preset templates
- Per-clip preset overrides

These may be added in future phases.

## Persistence & Recovery (Phase 12)

Phase 12 adds state persistence so Proxx can survive process restarts without losing work or silently re-running completed tasks.

### Storage Strategy

**Technology:** SQLite (single file)
- One database per Proxx instance
- Default location: `./proxx.db` (current working directory)
- ACID guarantees for state consistency
- Schema versioning for migrations

**What is Persisted:**

1. **Jobs & ClipTasks**
   - Job ID, timestamps, status
   - Clip source paths, status, failure reasons
   - Task-level warnings

2. **Preset Bindings**
   - Job ID → Preset ID mappings
   - Preset definitions remain file-based (not persisted)

3. **Watch Folder Configurations**
   - Path, enabled flag, recursive setting
   - Preset binding, auto_execute flag
   - Creation timestamps

4. **Processed Files Tracking**
   - File paths that have been ingested
   - Prevents duplicate ingestion across restarts

**What is NOT Persisted:**

- ExecutionResult internals (transient execution data)
- Timing/performance metrics
- Logs (remain file-based)
- Derived reports (already written to disk)

### Persistence Model

**Explicit, Not Automatic:**
- Registries do NOT auto-persist on every mutation
- Persistence requires explicit `save_*()` calls
- Load operations called explicitly at startup

**Registry Integration:**

Each registry gains optional `PersistenceManager` injection:

```python
# Initialization (self-contained, not wired through main.py)
persistence = PersistenceManager(db_path="./proxx.db")
job_registry = JobRegistry(persistence_manager=persistence)
binding_registry = JobPresetBindingRegistry(persistence_manager=persistence)
watch_folder_registry = WatchFolderRegistry(persistence_manager=persistence)
watch_folder_engine = WatchFolderEngine(..., persistence_manager=persistence)

# Explicit save after state changes
job_registry.save_job(job)
binding_registry.save_binding(job.id)
watch_folder_registry.save_folder(folder)
watch_folder_engine.save_processed_file(folder.id, file_path)

# Explicit load at startup
job_registry.load_all_jobs()
binding_registry.load_all_bindings()
watch_folder_registry.load_all_folders()
watch_folder_engine.load_processed_files()
```

Registries remain fully functional without persistence (useful for testing).

### Recovery Behavior

**On Process Restart:**

1. Load all persisted state from SQLite
2. Detect interrupted jobs (status was RUNNING or PAUSED)
3. Mark interrupted jobs as `RECOVERY_REQUIRED`
4. Do NOT auto-resume execution

**RECOVERY_REQUIRED Status:**

- Hard terminal state (cannot auto-transition)
- Requires explicit operator action to resume
- Transition: `RECOVERY_REQUIRED → RUNNING` via `resume_job()`
- Honest acknowledgement of uncertainty

**No Silent Recovery:**
- Proxx never guesses what was running
- Operator must explicitly resume interrupted work
- Filesystem remains authoritative for completion verification

### State Transitions

Phase 12 adds one new job status:

```
RECOVERY_REQUIRED: Process restarted mid-execution, requires explicit resume
```

**Legal Transitions:**
- `RECOVERY_REQUIRED → RUNNING` (explicit resume only)

Interrupted jobs remain frozen until operator intervention.

### Schema Management

**Versioning:**
- `schema_version` table tracks applied migrations
- Current version: 1
- Migrations applied atomically on startup

**Migration Strategy:**
- Check current version on PersistenceManager init
- Apply missing migrations in order
- Fail loudly on migration errors (no silent degradation)

### Failure Modes

**Database Corruption:**
- PersistenceManager raises `PersistenceError`
- Application startup fails loudly
- Operator must resolve (restore from backup, delete DB, etc.)

**Missing Database:**
- Fresh database created automatically
- Empty state (no jobs, no bindings)
- Normal startup proceeds

**Schema Version Mismatch:**
- Older schema: Migrations applied automatically
- Newer schema: Application refuses to start (prevents downgrade corruption)

### Performance Characteristics

**SQLite Benefits:**
- Single-file simplicity (easy backup/restore)
- No server process required
- Sufficient for single-operator workloads
- Write performance adequate for job-level operations (not per-frame)

**Not Suitable For:**
- Multi-node/distributed execution (Phase 13+)
- High-frequency writes (e.g., frame-level progress)
- Concurrent multi-process access

Phase 12 assumes single-process, single-operator usage.

## Operator Control & Intent Surfaces (Phase 13)

Phase 13 introduces explicit operator control surfaces for job lifecycle management.

### Design Principles

- No state transition occurs without explicit operator action
- RECOVERY_REQUIRED is a terminal state until explicitly resumed
- No automatic recovery, no guessing, no "safe defaults"
- Filesystem remains authoritative
- Partial success remains honest and visible
- Every command prints what will happen before acting
- Confirmation required for destructive operations

If something feels "helpful", it is probably wrong.

### Control Surface

CLI provides the canonical operator interface.

Location: `backend/app/cli/`

Structure:
```
cli/
├─ __init__.py       # Public API exports
├─ errors.py         # CLI-specific error types
└─ commands.py       # Command implementations
```

### Commands

All commands enforce explicit operator intent. No silent mutations.

**Resume Job** (`resume_job()`):
- Allowed only if job.status == RECOVERY_REQUIRED or PAUSED
- Validates Resolve availability, preset binding, output directory
- Prints which clips will execute before proceeding
- Does not skip previously completed clips implicitly
- Requires confirmation for safety

**Retry Failed Clips** (`retry_failed_clips()`):
- Only FAILED clips are queued for retry
- COMPLETED clips are NEVER re-run
- Output collision handling is explicit (fails if file exists)
- Job status reflects partial retry outcomes
- Warn-and-continue semantics preserved

**Cancel Job** (`cancel_job()`):
- If RUNNING: allows current clip to finish
- Remaining QUEUED clips marked SKIPPED with reason="cancelled"
- Job status becomes CANCELLED (terminal state)
- CANCELLED jobs cannot be resumed
- Cancellation is operator intent, not a failure

**Rebind Preset** (`rebind_preset()`):
- Allowed only if job.status == PENDING or RECOVERY_REQUIRED
- Preset must exist and validate
- Previous binding overwritten explicitly
- Binding persisted immediately
- No silent rebinding ever

### State Machine

Phase 13 adds CANCELLED status to job lifecycle.

**Legal Transitions:**

```
RECOVERY_REQUIRED → RUNNING   (resume)
PAUSED            → RUNNING   (resume)
FAILED            → QUEUED    (retry failed clips)
PENDING           → RUNNING   (execute)
RUNNING           → CANCELLED (cancel)
PENDING           → CANCELLED (cancel)
PAUSED            → CANCELLED (cancel)
RECOVERY_REQUIRED → CANCELLED (cancel)
```

Any other transition is illegal and will raise `InvalidStateTransitionError`.

### Error Hierarchy

All CLI errors inherit from `CLIError`:
- `ValidationError`: Pre-execution validation failed
- `ConfirmationDenied`: Operator denied confirmation prompt

CLI errors are non-fatal to the application. They indicate operation cannot proceed.

Location: `backend/app/cli/errors.py`

### Integration

Commands integrate with existing registries and engine:
- `JobRegistry`: Job retrieval and persistence
- `JobPresetBindingRegistry`: Preset binding management
- `PresetRegistry`: Preset validation
- `JobEngine`: Job execution and state management

No HTTP endpoints in Phase 13. CLI is the canonical interface.

### Why Proxx Never Auto-Recovers

Proxx treats process restarts as ambiguous events. When a job is interrupted:
- Current clip state is unknown (partial render? corrupt output?)
- Filesystem may have changed (drives remounted, files moved)
- Resolve may have crashed or been upgraded
- Operator may have intentionally stopped the process

Automatic recovery would require guessing operator intent. Proxx refuses to guess.

Instead:
1. Jobs interrupted mid-execution marked RECOVERY_REQUIRED
2. Operator must explicitly inspect job state
3. Operator must explicitly resume via `resume_job()`
4. All validation re-run before resuming

This is deliberate friction. Recovery should require human decision.

### What Phase 13 Does NOT Include

- HTTP endpoints for control operations
- UI for operator workflows
- Automatic retry policies
- Smart recovery heuristics
- Scheduling or queue prioritization
- Multi-operator access control

These may be added in future phases.

## Minimal Operator UI (Phase 14)

Phase 14 introduces a minimal visual control surface for operators.

### Design Principles

- UI is NOT authoritative—it reads and displays system truth
- CLI remains the canonical source of operator intent
- UI cannot auto-recover, auto-retry, or auto-execute
- All state transitions require explicit confirmation
- UI is a viewer + switchboard, nothing more
- If it feels smooth, it is wrong

### Architecture

The UI is composed of:
- **Electron + React** frontend (reuses existing shell)
- **HTTP monitoring endpoints** for read-only job/clip state
- **HTTP control endpoints** for explicit operator actions

The UI is replaceable without affecting system correctness.

Location: `frontend/src/App.tsx`

### Read-Only Capabilities

UI displays system truth via monitoring endpoints (Phase 9):

**Job List View:**
- Job ID (truncated), status badge, creation timestamp
- Progress summary: total, completed, failed, skipped
- Sorted by creation time (newest first)
- Refresh button for manual updates

**Job Detail View:**
- Full job metadata (ID, status, timestamps)
- Progress breakdown (completed, failed, skipped, running, queued, warnings)
- Per-clip task details (source path, status, failure reason, warnings)
- Report references (filename, size, format)

All data is read from existing `/monitor/*` endpoints. UI performs NO computation or aggregation—it displays exactly what the backend reports.

### Control Operations

UI exposes four explicit control operations via buttons:

**Resume Job** (`POST /control/jobs/{job_id}/resume`):
- Visible when: `status == RECOVERY_REQUIRED or PAUSED`
- Confirmation required: "Resume job? Completed clips will NOT be re-run."
- Maps to: `cli.commands.resume_job()`

**Retry Failed Clips** (`POST /control/jobs/{job_id}/retry-failed`):
- Visible when: `failed_count > 0`
- Confirmation required: "Retry N failed clips? COMPLETED clips will NOT be re-run."
- Maps to: `cli.commands.retry_failed_clips()`

**Cancel Job** (`POST /control/jobs/{job_id}/cancel`):
- Visible when: `status not in (COMPLETED, COMPLETED_WITH_WARNINGS, FAILED, CANCELLED)`
- Confirmation required: "Cancel job? Running clips will finish. Queued clips marked SKIPPED. CANNOT be undone."
- Maps to: `cli.commands.cancel_job()`

**Rebind Preset** (`POST /control/jobs/{job_id}/rebind`):
- Visible when: `status == PENDING or RECOVERY_REQUIRED`
- Confirmation required: "Rebind to preset X? Will OVERWRITE existing binding."
- Maps to: `cli.commands.rebind_preset()`

All confirmations use native `window.confirm()` dialogs. Operator must explicitly approve before any action is sent to backend.

### Control Endpoints

Phase 14 adds HTTP control endpoints as thin adapters over Phase 13 CLI commands.

Location: `backend/app/routes/control.py`

Structure:
```
control/
└─ router (mounted at /control)
   ├─ POST /jobs/{job_id}/resume
   ├─ POST /jobs/{job_id}/retry-failed
   ├─ POST /jobs/{job_id}/cancel
   └─ POST /jobs/{job_id}/rebind (body: {preset_id})
```

**Endpoint Behavior:**
- Accept job_id from URL path
- Retrieve registries from `app.state` (FastAPI dependency injection)
- Call CLI command with `require_confirmation=False` (UI handles confirmation)
- Return `OperationResponse` with success/message
- Raise HTTP 400 for validation errors
- Raise HTTP 500 for execution failures

Control endpoints do NOT implement new logic—they delegate to existing CLI commands. This ensures CLI remains canonical.

### Integration

**Backend State Initialization:**
`backend/app/main.py` updated to initialize all registries:
- `PersistenceManager`: SQLite storage
- `JobRegistry`: Job tracking with persistence
- `JobPresetBindingRegistry`: Preset bindings with persistence
- `PresetRegistry`: Preset definitions (in-memory)
- `JobEngine`: Orchestration engine

All registries loaded from persistence at startup via explicit `load_*()` calls.

Control router mounted at `/control` prefix alongside monitoring router.

**Frontend Lifecycle:**
- On mount: Fetch job list via `/monitor/jobs`
- On job selection: Fetch job detail + reports via `/monitor/jobs/{id}` and `/monitor/jobs/{id}/reports`
- Manual refresh: Re-fetch job list
- After control action: Re-fetch affected job detail + job list

No polling. No WebSockets. No auto-refresh. Operator must explicitly refresh.

### Why UI Cannot Auto-Recover

The UI cannot and will not:
- Auto-resume RECOVERY_REQUIRED jobs
- Auto-retry failed clips without confirmation
- Hide partial failures
- Infer operator intent
- Trigger actions based on state changes

RECOVERY_REQUIRED is displayed as a blocked state requiring explicit human action. This is intentional. Recovery requires operator decision.

If a job is interrupted:
1. UI shows `RECOVERY_REQUIRED` status badge (red)
2. "Resume Job" button appears
3. Operator must click button
4. Operator must confirm via dialog
5. Only then does resume occur

No automatic recovery ever occurs. The system refuses to guess.

### Styling

Phase 14 styling is minimal and neutral:
- System fonts (system-ui, -apple-system, sans-serif)
- Neutral colors (grays, blues, greens, reds for status)
- No branding or visual identity work
- Functional layout only (no "design")

Visual design deferred to Phase 15.

### What Phase 14 Does NOT Include

- Job creation via UI
- Watch folder configuration
- Preset management UI
- Real-time progress updates (polling, WebSockets, SSE)
- Authentication or authorization
- Multi-user access control
- Background execution decoupling
- Report downloading or viewing
- Log streaming
- Metrics or analytics
- Custom styling or themes

Control operations are limited to the four explicit actions listed above. Everything else remains CLI-only or not yet implemented.

## Out of Scope (Current)

The following systems are intentionally not implemented yet:

- Multi-node execution (Phase 15+)
- Distributed job scheduling (Phase 15+)
- Visual design & operator experience (Phase 15)

These will be documented when they exist.

## Update Policy

This document should be updated:
- When a new subsystem is added
- When execution model changes
- When IPC model changes

It should not be updated for minor refactors.