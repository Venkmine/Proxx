"""
V2 Watch Folder Runner - Deterministic JobSpec automation with atomic filesystem semantics.

This module provides a watch-folder processor for JobSpec JSON files using
standard OS filesystem primitives and deterministic, auditable behavior.

Design Principles:
==================
1. Use boring, battle-tested filesystem behavior only
2. No retries, no guessing, no silent recovery
3. JobSpec is the only source of truth
4. UI must never control execution
5. Output correctness beats convenience

Folder Structure:
=================
watch/
├── pending/              # JobSpecs awaiting processing
│   └── job1.json
├── running/              # JobSpec(s) being processed (max N workers)
│   └── job2.json         # Only during active execution
├── completed/            # Successfully completed JobSpecs
│   ├── job0.json
│   └── job0.result.json  # Execution result alongside JobSpec
├── failed/               # Failed JobSpecs
│   ├── job_bad.json
│   └── job_bad.result.json

Startup Behavior:
=================
On startup, any files left in running/ are moved to failed/ with reason
"runner interrupted" - this handles crash recovery deterministically.

Execution Rules:
================
- Synchronous execution within each job (clips still sequential)
- Bounded concurrency: up to N jobs may run in parallel (default: 1)
- Deterministic ordering: jobs dequeued in sorted filename order
- Fail-fast within each job on first clip error
- No retries
- Preserve partial artifacts

Concurrency Model (V2 Phase 2):
===============================
- Worker slots: N workers (default 1), each processes one job at a time
- Jobs are dequeued in deterministic (sorted) order
- Each job executes synchronously internally (sequential clips)
- If one job fails, other running jobs complete normally
- No dynamic scaling, no auto-recovery, no retries

Usage:
======
    python -m backend.v2.watch_folder_runner <folder>
    python -m backend.v2.watch_folder_runner <folder> --once
    python -m backend.v2.watch_folder_runner <folder> --poll-seconds 5
    python -m backend.v2.watch_folder_runner <folder> --max-workers 4

Part of V2 Phase 2 (Bounded Deterministic Concurrency)
"""

import argparse
import hashlib
import json
import os
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, Future, as_completed
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Literal, Optional, Set

# Import from sibling modules (adjust imports for module context)
# Try different import paths to support various invocation methods
import sys
from pathlib import Path

# Add backend directory to path if not already there
_backend_dir = Path(__file__).parent.parent.resolve()
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))

try:
    from job_spec import JobSpec, JobSpecValidationError, JOBSPEC_VERSION
    from execution_results import JobExecutionResult, ClipExecutionResult
    from execution_adapter import execute_jobspec
    # V2 IMPLEMENTATION SLICE 7: Phase-1 Lock Enforcement
    from v2.phase1_lock import assert_phase1_compliance, assert_synchronous_execution
except ImportError:
    # Try alternative import paths
    try:
        from backend.job_spec import JobSpec, JobSpecValidationError, JOBSPEC_VERSION
        from backend.execution_results import JobExecutionResult, ClipExecutionResult
        from backend.execution_adapter import execute_jobspec
        # V2 IMPLEMENTATION SLICE 7: Phase-1 Lock Enforcement
        from backend.v2.phase1_lock import assert_phase1_compliance, assert_synchronous_execution
    except ImportError as e:
        print(f"Failed to import required modules: {e}", file=sys.stderr)
        print("Make sure you're running from the project root or backend directory.", file=sys.stderr)
        sys.exit(1)

# SLICE 3 ASSERTION: NO engine imports
# All engine routing and execution logic lives in execution_adapter.py
# This module is ONLY responsible for:
# - Filesystem state transitions
# - Loading JobSpec JSON
# - Persisting ExecutionResult JSON


# -----------------------------------------------------------------------------
# Constants
# -----------------------------------------------------------------------------

PENDING_FOLDER = "pending"
RUNNING_FOLDER = "running"
COMPLETED_FOLDER = "completed"
FAILED_FOLDER = "failed"
RESULT_SUFFIX = ".result.json"

DEFAULT_POLL_SECONDS = 2
DEFAULT_MAX_WORKERS = 1  # Sequential by default (Phase 1 behavior)


# -----------------------------------------------------------------------------
# Worker State Tracking (Thread-Safe)
# -----------------------------------------------------------------------------

@dataclass
class WorkerState:
    """
    Thread-safe tracking of worker assignments.
    
    Invariants:
    - active_jobs is protected by _lock
    - Each job_id can only be assigned to one worker
    - Jobs are never skipped, never processed twice
    """
    max_workers: int
    _lock: threading.Lock = field(default_factory=threading.Lock)
    _active_jobs: Dict[str, dict] = field(default_factory=dict)  # job_filename -> worker_info
    _completed_jobs: Set[str] = field(default_factory=set)  # job_filenames that finished
    _worker_counter: int = field(default=0)
    
    def acquire_job(self, job_filename: str) -> Optional[int]:
        """
        Try to acquire a job for processing. Returns worker_id if acquired, None if already taken.
        
        DETERMINISM ASSERTION: This method is called in sorted order by the main thread.
        Jobs are NEVER skipped - the main thread iterates all pending jobs in order.
        """
        with self._lock:
            if job_filename in self._active_jobs or job_filename in self._completed_jobs:
                # Already being processed or already completed - cannot happen in correct usage
                return None
            
            if len(self._active_jobs) >= self.max_workers:
                # All workers busy
                return None
            
            self._worker_counter += 1
            worker_id = self._worker_counter
            self._active_jobs[job_filename] = {
                "worker_id": worker_id,
                "started_at": datetime.now(timezone.utc).isoformat(),
            }
            return worker_id
    
    def release_job(self, job_filename: str) -> None:
        """Mark a job as complete and release the worker slot."""
        with self._lock:
            if job_filename in self._active_jobs:
                del self._active_jobs[job_filename]
            self._completed_jobs.add(job_filename)
    
    def get_worker_info(self, job_filename: str) -> Optional[dict]:
        """Get worker info for a job (if currently active)."""
        with self._lock:
            return self._active_jobs.get(job_filename)
    
    def active_count(self) -> int:
        """Number of currently active workers."""
        with self._lock:
            return len(self._active_jobs)
    
    def is_job_known(self, job_filename: str) -> bool:
        """Check if a job is currently active or already completed."""
        with self._lock:
            return job_filename in self._active_jobs or job_filename in self._completed_jobs
    
    def reset_for_new_scan(self) -> None:
        """Reset completed jobs set for a new scan iteration."""
        with self._lock:
            self._completed_jobs.clear()


# -----------------------------------------------------------------------------
# Atomic Filesystem Operations
# -----------------------------------------------------------------------------

def atomic_move(src: Path, dst: Path) -> None:
    """
    Perform an atomic move using os.rename().
    
    On POSIX systems, rename() is atomic within the same filesystem.
    This is the only way to move files in this module.
    
    Args:
        src: Source path (must exist)
        dst: Destination path (parent must exist)
        
    Raises:
        OSError: If the move fails
        FileNotFoundError: If source doesn't exist
        FileExistsError: If destination already exists
    """
    # Ensure destination doesn't exist (no silent overwrite)
    if dst.exists():
        raise FileExistsError(f"Destination already exists: {dst}")
    
    # Use os.rename for atomic move
    os.rename(src, dst)


def ensure_folder_structure(watch_folder: Path) -> None:
    """
    Ensure the watch folder has the required subdirectory structure.
    
    Creates:
        watch_folder/pending/
        watch_folder/running/
        watch_folder/completed/
        watch_folder/failed/
    """
    for subfolder in [PENDING_FOLDER, RUNNING_FOLDER, COMPLETED_FOLDER, FAILED_FOLDER]:
        (watch_folder / subfolder).mkdir(parents=True, exist_ok=True)


# -----------------------------------------------------------------------------
# Startup Recovery
# -----------------------------------------------------------------------------

def recover_interrupted_jobs(watch_folder: Path) -> List[Path]:
    """
    On startup, move any jobs left in running/ to failed/.
    
    This handles crash recovery: if the runner was interrupted mid-execution,
    the job in running/ is in an unknown state. We move it to failed/ with
    an explicit reason rather than attempting any form of recovery.
    
    Returns:
        List of paths that were recovered (moved to failed/)
    """
    running_folder = watch_folder / RUNNING_FOLDER
    failed_folder = watch_folder / FAILED_FOLDER
    
    recovered: List[Path] = []
    
    if not running_folder.is_dir():
        return recovered
    
    for jobspec_path in running_folder.glob("*.json"):
        # Skip result files
        if jobspec_path.name.endswith(RESULT_SUFFIX):
            continue
        
        print(f"  Recovering interrupted job: {jobspec_path.name}")
        
        # Create a failure result with jobspec_version for audit trail
        failure_result = JobExecutionResult(
            job_id="unknown",  # We don't load the JobSpec to avoid validation errors
            clips=[],
            final_status="FAILED",
            jobspec_version=JOBSPEC_VERSION,  # Include version for postmortem
            started_at=datetime.now(timezone.utc),
            completed_at=datetime.now(timezone.utc),
        )
        
        # Try to extract job_id and version from file
        try:
            with open(jobspec_path, "r") as f:
                data = json.load(f)
                failure_result = JobExecutionResult(
                    job_id=data.get("job_id", "unknown"),
                    clips=[],
                    final_status="FAILED",
                    jobspec_version=data.get("jobspec_version", JOBSPEC_VERSION),
                    started_at=datetime.now(timezone.utc),
                    completed_at=datetime.now(timezone.utc),
                )
        except Exception:
            pass  # Use default unknown job_id
        
        # Write result file with recovery reason
        result_data = failure_result.to_dict()
        result_data["_recovery"] = {
            "reason": "runner interrupted",
            "recovered_at": datetime.now(timezone.utc).isoformat(),
            "original_path": str(jobspec_path),
        }
        
        # Determine destination paths
        dest_jobspec = failed_folder / jobspec_path.name
        dest_result = failed_folder / f"{jobspec_path.stem}{RESULT_SUFFIX}"
        
        # Handle naming collision
        if dest_jobspec.exists():
            timestamp = datetime.now().strftime("%Y%m%dT%H%M%S")
            dest_jobspec = failed_folder / f"{jobspec_path.stem}_{timestamp}.json"
            dest_result = failed_folder / f"{jobspec_path.stem}_{timestamp}{RESULT_SUFFIX}"
        
        # Write result first
        with open(dest_result, "w") as f:
            json.dump(result_data, f, indent=2)
        
        # Move jobspec to failed
        try:
            atomic_move(jobspec_path, dest_jobspec)
            recovered.append(jobspec_path)
        except (OSError, FileExistsError) as e:
            print(f"    Warning: Could not move {jobspec_path.name}: {e}")
    
    return recovered


# -----------------------------------------------------------------------------
# Result File Handling
# -----------------------------------------------------------------------------

def write_result_json(
    result_path: Path,
    job_result: JobExecutionResult,
    jobspec_path: Path,
    failure_reason: Optional[str] = None,
    worker_id: Optional[int] = None,
    worker_started_at: Optional[str] = None,
) -> None:
    """
    Write execution result to a .result.json file.
    
    The result is written alongside the JobSpec in the destination folder
    (completed/ or failed/).
    
    Includes _metadata with:
    - jobspec_version: For postmortem auditing (from JobExecutionResult)
    - jobspec_path: Path to the original JobSpec file
    - result_written_at: Timestamp of result file creation
    - failure_reason: If provided, the reason for failure
    - worker_id: If provided, the worker that processed this job
    - worker_started_at: If provided, when the worker started
    """
    result_data = job_result.to_dict()
    
    # Merge additional metadata (preserves jobspec_version from to_dict)
    if "_metadata" not in result_data:
        result_data["_metadata"] = {}
    
    result_data["_metadata"]["jobspec_path"] = str(jobspec_path)
    result_data["_metadata"]["result_written_at"] = datetime.now(timezone.utc).isoformat()
    
    if failure_reason:
        result_data["_metadata"]["failure_reason"] = failure_reason
    
    # Include worker metadata for concurrency tracking
    if worker_id is not None:
        result_data["_metadata"]["worker_id"] = worker_id
    if worker_started_at is not None:
        result_data["_metadata"]["worker_started_at"] = worker_started_at
    
    with open(result_path, "w") as f:
        json.dump(result_data, f, indent=2)


# -----------------------------------------------------------------------------
# Source Validation
# -----------------------------------------------------------------------------

def validate_sources_exist(job_spec: JobSpec) -> Optional[str]:
    """
    Validate that all source files referenced in JobSpec exist.
    
    Returns:
        None if all sources exist, or error message if any are missing
    """
    missing: List[str] = []
    
    for source in job_spec.sources:
        source_path = Path(source)
        if not source_path.exists():
            missing.append(source)
        elif not source_path.is_file():
            missing.append(f"{source} (not a file)")
    
    if missing:
        return f"Missing source files: {', '.join(missing)}"
    
    return None


# -----------------------------------------------------------------------------
# Processing Results
# -----------------------------------------------------------------------------

@dataclass
class ProcessingResult:
    """Result of processing a single JobSpec file."""
    
    jobspec_path: Path
    """Original path to the JobSpec file."""
    
    status: Literal["COMPLETED", "FAILED", "SKIPPED", "INVALID"]
    """Processing status."""
    
    result_path: Optional[Path] = None
    """Path to the .result.json file (if created)."""
    
    destination_path: Optional[Path] = None
    """Final path where JobSpec was moved."""
    
    error_message: Optional[str] = None
    """Error message if processing failed."""
    
    job_result: Optional[JobExecutionResult] = None
    """Full job execution result (if executed)."""
    
    worker_id: Optional[int] = None
    """Worker ID that processed this job (for concurrency tracking)."""
    
    worker_started_at: Optional[str] = None
    """ISO timestamp when worker started processing this job."""


# -----------------------------------------------------------------------------
# Watch Folder Processing
# -----------------------------------------------------------------------------

def scan_for_pending_jobspecs(watch_folder: Path) -> List[Path]:
    """
    Scan pending/ folder for JobSpec JSON files.
    
    Only scans the pending/ subdirectory.
    Returns files in sorted order for deterministic processing.
    """
    pending_folder = watch_folder / PENDING_FOLDER
    
    if not pending_folder.is_dir():
        return []
    
    jobspecs: List[Path] = []
    
    for path in sorted(pending_folder.glob("*.json")):
        # Skip result files (shouldn't be in pending, but just in case)
        if path.name.endswith(RESULT_SUFFIX):
            continue
        
        jobspecs.append(path)
    
    return jobspecs


def process_single_jobspec(
    jobspec_path: Path,
    watch_folder: Path,
    worker_id: Optional[int] = None,
    worker_started_at: Optional[str] = None,
) -> ProcessingResult:
    """
    Process a single JobSpec file with atomic state transitions.
    
    Lifecycle:
    1. Move pending/job.json → running/job.json (atomic)
    2. Load and validate JobSpec JSON
    3. Validate all source files exist
    4. Execute using headless executor
    5. Write result JSON to destination folder
    6. Move running/job.json → completed/job.json OR failed/job.json (atomic)
    
    Args:
        jobspec_path: Path to the JobSpec file in pending/
        watch_folder: Root watch folder
        worker_id: Optional worker ID for concurrency tracking
        worker_started_at: Optional ISO timestamp when worker started
    
    Returns:
        ProcessingResult with all details
    """
    running_folder = watch_folder / RUNNING_FOLDER
    completed_folder = watch_folder / COMPLETED_FOLDER
    failed_folder = watch_folder / FAILED_FOLDER
    
    running_path = running_folder / jobspec_path.name
    
    # Step 1: Atomically move to running/
    try:
        atomic_move(jobspec_path, running_path)
    except FileExistsError:
        return ProcessingResult(
            jobspec_path=jobspec_path,
            status="SKIPPED",
            error_message="File already in running folder (possible duplicate)",
        )
    except OSError as e:
        return ProcessingResult(
            jobspec_path=jobspec_path,
            status="INVALID",
            error_message=f"Cannot move to running: {e}",
        )
    
    # From here on, we're working with running_path
    job_spec: Optional[JobSpec] = None
    job_result: Optional[JobExecutionResult] = None
    failure_reason: Optional[str] = None
    
    # Step 2: Load and parse JobSpec with strict contract validation
    try:
        with open(running_path, "r") as f:
            data = json.load(f)
        job_spec = JobSpec.from_dict(data)
    except json.JSONDecodeError as e:
        failure_reason = f"Invalid JSON: {e}"
    except JobSpecValidationError as e:
        # Contract violation (version mismatch, unknown fields, invalid enums)
        failure_reason = f"JobSpec contract violation: {e}"
    except (KeyError, ValueError) as e:
        failure_reason = f"Invalid JobSpec structure: {e}"
    except OSError as e:
        failure_reason = f"Cannot read file: {e}"
    
    # Step 3: Validate sources exist (before processing)
    if job_spec and not failure_reason:
        source_error = validate_sources_exist(job_spec)
        if source_error:
            failure_reason = source_error
    
    # Step 3.5: Execute via execution_adapter (SLICE 3 integration)
    # - NO direct engine imports
    # - NO engine routing logic here
    # - ONLY dispatch and result persistence
    if job_spec and not failure_reason:
        try:
            # SLICE 3: ALL execution flows through execute_jobspec()
            # The adapter handles:
            # - Validation
            # - Engine routing
            # - Execution
            # - Result construction
            job_result = execute_jobspec(job_spec)
            
            # Extract failure information if execution failed
            if job_result.final_status != "COMPLETED":
                # Check validation_error first (pre-execution failures)
                if job_result.validation_error:
                    failure_reason = job_result.validation_error
                else:
                    # Find failure reason from clips (execution failures)
                    for clip in job_result.clips:
                        if clip.status == "FAILED" and clip.failure_reason:
                            failure_reason = clip.failure_reason
                            break
                    if not failure_reason:
                        failure_reason = "Execution failed"
        except Exception as e:
            # Unexpected error: execution_adapter should never raise
            # but handle defensively
            failure_reason = f"Execution error: {e}"
    
    # Create result if we don't have one (pre-execution failures)
    if job_result is None:
        job_result = JobExecutionResult(
            job_id=job_spec.job_id if job_spec else "unknown",
            clips=[],
            final_status="FAILED",
            validation_error=failure_reason,
            validation_stage="pre-job",
            jobspec_version=JOBSPEC_VERSION,
            engine_used=None,  # Engine never determined
            started_at=datetime.now(timezone.utc),
            completed_at=datetime.now(timezone.utc),
        )
    
    # engine_used is now always set by execute_jobspec()
    # No need to override here
    
    # Determine final status and destination
    if job_result.final_status == "COMPLETED" and not failure_reason:
        final_status: Literal["COMPLETED", "FAILED"] = "COMPLETED"
        dest_folder = completed_folder
    else:
        final_status = "FAILED"
        dest_folder = failed_folder
    
    # Step 5 & 6: Determine destination paths
    dest_jobspec = dest_folder / running_path.name
    dest_result = dest_folder / f"{running_path.stem}{RESULT_SUFFIX}"
    
    # Handle naming collision
    if dest_jobspec.exists():
        timestamp = datetime.now().strftime("%Y%m%dT%H%M%S")
        dest_jobspec = dest_folder / f"{running_path.stem}_{timestamp}.json"
        dest_result = dest_folder / f"{running_path.stem}_{timestamp}{RESULT_SUFFIX}"
    
    # Write result JSON first (to destination folder)
    write_result_json(
        dest_result, job_result, running_path, failure_reason,
        worker_id=worker_id, worker_started_at=worker_started_at
    )
    
    # Move JobSpec to destination
    try:
        atomic_move(running_path, dest_jobspec)
    except (OSError, FileExistsError) as e:
        # This is a critical error - the JobSpec is stuck in running/
        return ProcessingResult(
            jobspec_path=jobspec_path,
            status="FAILED",
            result_path=dest_result,
            error_message=f"CRITICAL: Cannot move from running to {dest_folder.name}: {e}",
            job_result=job_result,
            worker_id=worker_id,
            worker_started_at=worker_started_at,
        )
    
    return ProcessingResult(
        jobspec_path=jobspec_path,
        status=final_status,
        result_path=dest_result,
        destination_path=dest_jobspec,
        job_result=job_result,
        error_message=failure_reason if final_status == "FAILED" else None,
        worker_id=worker_id,
        worker_started_at=worker_started_at,
    )


def run_scan(watch_folder: Path, max_workers: int = DEFAULT_MAX_WORKERS) -> List[ProcessingResult]:
    """
    Perform a single scan of pending/ and process JobSpecs with bounded concurrency.
    
    DETERMINISM GUARANTEES:
    - Jobs are discovered in sorted filename order (deterministic)
    - Jobs are submitted to workers in that same order
    - Each job is processed exactly once (no duplicates, no skips)
    - Results are collected and returned in submission order
    
    CONCURRENCY MODEL:
    - max_workers=1: Sequential execution (Phase 1 behavior)
    - max_workers>1: Up to N jobs run concurrently
    - Each job still executes clips sequentially internally
    
    FAILURE SEMANTICS:
    - If one job fails, other running jobs complete normally
    - Failed jobs go to failed/, successful jobs to completed/
    - Runner does NOT crash on job failure
    
    Args:
        watch_folder: Root watch directory
        max_workers: Maximum concurrent workers (default: 1 = sequential)
    
    Returns:
        List of ProcessingResult for each JobSpec processed (in submission order)
    """
    results: List[ProcessingResult] = []
    
    # Scan for pending JobSpecs - DETERMINISM: sorted() ensures consistent order
    jobspecs = scan_for_pending_jobspecs(watch_folder)
    # ASSERTION: jobspecs is already sorted by scan_for_pending_jobspecs()
    # This ensures deterministic job ordering regardless of filesystem enumeration order
    
    if not jobspecs:
        return results
    
    print(f"Found {len(jobspecs)} JobSpec(s) in pending/")
    print(f"Max workers: {max_workers}")
    
    # Initialize worker state tracking
    worker_state = WorkerState(max_workers=max_workers)
    
    if max_workers == 1:
        # SEQUENTIAL EXECUTION (Phase 1 behavior preserved)
        # No ThreadPoolExecutor overhead for the common case
        for i, jobspec_path in enumerate(jobspecs, 1):
            # DETERMINISM: Jobs processed in sorted order, one at a time
            worker_id = worker_state.acquire_job(jobspec_path.name)
            # ASSERTION: worker_id is never None in sequential mode (only 1 job, 1 worker)
            assert worker_id is not None, "Worker slot must be available in sequential mode"
            
            worker_info = worker_state.get_worker_info(jobspec_path.name)
            worker_started_at = worker_info["started_at"] if worker_info else None
            
            print(f"\n[{i}/{len(jobspecs)}] Processing: {jobspec_path.name}")
            
            result = process_single_jobspec(
                jobspec_path, watch_folder,
                worker_id=worker_id, worker_started_at=worker_started_at
            )
            results.append(result)
            
            worker_state.release_job(jobspec_path.name)
            _print_result(result)
    else:
        # CONCURRENT EXECUTION (Phase 2)
        # Use ThreadPoolExecutor with bounded workers
        
        # Track futures to results mapping for ordered collection
        future_to_index: Dict[Future, int] = {}
        results = [None] * len(jobspecs)  # Pre-allocate for ordered results
        
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            # DETERMINISM: Submit jobs in sorted order
            # Jobs may complete out of order, but we track submission order
            for i, jobspec_path in enumerate(jobspecs):
                worker_id = worker_state.acquire_job(jobspec_path.name)
                # ASSERTION: We always have a worker slot because we limit submission
                # by waiting for futures when pool is full
                
                if worker_id is None:
                    # Should not happen with proper ThreadPoolExecutor sizing,
                    # but handle gracefully by waiting for a slot
                    # This is defensive code that should never execute
                    print(f"  Warning: All workers busy, waiting...")
                    # Wait for any future to complete
                    for future in as_completed(future_to_index.keys()):
                        idx = future_to_index[future]
                        try:
                            results[idx] = future.result()
                        except Exception as e:
                            # Should not happen - exceptions are caught in process_single_jobspec
                            results[idx] = ProcessingResult(
                                jobspec_path=jobspecs[idx],
                                status="FAILED",
                                error_message=f"Worker exception: {e}",
                            )
                        worker_state.release_job(jobspecs[idx].name)
                        break
                    # Retry acquiring
                    worker_id = worker_state.acquire_job(jobspec_path.name)
                
                worker_info = worker_state.get_worker_info(jobspec_path.name)
                worker_started_at = worker_info["started_at"] if worker_info else None
                
                print(f"[{i+1}/{len(jobspecs)}] Submitting: {jobspec_path.name} (worker {worker_id})")
                
                future = executor.submit(
                    process_single_jobspec,
                    jobspec_path, watch_folder,
                    worker_id, worker_started_at
                )
                future_to_index[future] = i
            
            # Collect all results
            # DETERMINISM: Results are stored by submission index, not completion order
            for future in as_completed(future_to_index.keys()):
                idx = future_to_index[future]
                try:
                    result = future.result()
                    results[idx] = result
                    _print_result(result, prefix=f"  [{idx+1}/{len(jobspecs)}]")
                except Exception as e:
                    # Should not happen - exceptions are caught in process_single_jobspec
                    results[idx] = ProcessingResult(
                        jobspec_path=jobspecs[idx],
                        status="FAILED",
                        error_message=f"Worker exception: {e}",
                    )
                    print(f"  [{idx+1}/{len(jobspecs)}] → FAILED: Worker exception: {e}")
                
                worker_state.release_job(jobspecs[idx].name)
        
        # ASSERTION: All results should be populated
        assert all(r is not None for r in results), "All jobs must produce results"
    
    return results


def _print_result(result: ProcessingResult, prefix: str = "  ") -> None:
    """Print a single processing result."""
    worker_info = f" (worker {result.worker_id})" if result.worker_id else ""
    
    if result.status == "SKIPPED":
        print(f"{prefix}→ SKIPPED{worker_info}: {result.error_message}")
    elif result.status == "INVALID":
        print(f"{prefix}→ INVALID{worker_info}: {result.error_message}")
    elif result.status == "COMPLETED":
        print(f"{prefix}→ COMPLETED{worker_info} → {result.destination_path}")
        if result.result_path:
            print(f"{prefix}   Result: {result.result_path.name}")
    else:
        print(f"{prefix}→ FAILED{worker_info} → {result.destination_path}")
        if result.error_message:
            print(f"{prefix}   Reason: {result.error_message}")
        if result.result_path:
            print(f"{prefix}   Result: {result.result_path.name}")


def run_watch_loop(
    watch_folder: Path,
    poll_seconds: float = DEFAULT_POLL_SECONDS,
    run_once: bool = False,
    max_workers: int = DEFAULT_MAX_WORKERS,
) -> int:
    """
    Main watch loop - scan pending/ folder and process JobSpecs.
    
    Args:
        watch_folder: Root watch directory
        poll_seconds: Seconds between scans (default: 2)
        run_once: If True, do single scan and exit
        max_workers: Maximum concurrent workers (default: 1)
        
    Returns:
        Exit code (0 = success/no failures, 1 = had failures)
    """
    # V2 IMPLEMENTATION SLICE 7: Phase-1 Lock Enforcement
    # ----------------------------------------------------
    # Assert that we're in Phase-1 compliant context
    assert_phase1_compliance(
        "watch_folder_runner.run_watch_loop",
        watch_folder=str(watch_folder),
        max_workers=max_workers,
    )
    
    # Assert synchronous execution (no async/await)
    assert_synchronous_execution()
    
    print("V2 Watch Folder Runner (Deterministic)")
    print("=" * 50)
    print(f"Watch folder: {watch_folder}")
    print(f"Poll interval: {poll_seconds}s")
    print(f"Max workers: {max_workers}")
    print(f"Mode: {'single scan (--once)' if run_once else 'continuous polling'}")
    print()
    
    # Ensure watch folder exists
    if not watch_folder.is_dir():
        print(f"Error: Watch folder does not exist: {watch_folder}", file=sys.stderr)
        return 1
    
    # Create folder structure
    ensure_folder_structure(watch_folder)
    print(f"Folder structure verified: {PENDING_FOLDER}/, {RUNNING_FOLDER}/, {COMPLETED_FOLDER}/, {FAILED_FOLDER}/")
    
    # Recover any interrupted jobs
    print("\nChecking for interrupted jobs...")
    recovered = recover_interrupted_jobs(watch_folder)
    if recovered:
        print(f"Recovered {len(recovered)} interrupted job(s) → {FAILED_FOLDER}/")
    else:
        print("No interrupted jobs found")
    
    had_failures = False
    iteration = 0
    
    try:
        while True:
            iteration += 1
            
            if not run_once:
                print(f"\n--- Scan #{iteration} at {datetime.now().strftime('%H:%M:%S')} ---")
            
            results = run_scan(watch_folder, max_workers=max_workers)
            
            # Summary
            completed = sum(1 for r in results if r.status == "COMPLETED")
            failed = sum(1 for r in results if r.status == "FAILED")
            skipped = sum(1 for r in results if r.status == "SKIPPED")
            invalid = sum(1 for r in results if r.status == "INVALID")
            
            if failed > 0 or invalid > 0:
                had_failures = True
            
            if results:
                print(f"\nScan complete: {completed} completed, {failed} failed, {skipped} skipped, {invalid} invalid")
            else:
                if not run_once:
                    print("No pending JobSpecs")
            
            if run_once:
                break
            
            # Sleep before next scan
            time.sleep(poll_seconds)
            
    except KeyboardInterrupt:
        print("\n\nShutting down watch folder runner...")
    
    return 1 if had_failures else 0


# -----------------------------------------------------------------------------
# CLI Entry Point
# -----------------------------------------------------------------------------

def main() -> int:
    """
    CLI entry point for watch folder runner.
    
    Usage:
        python -m backend.v2.watch_folder_runner <folder>
        python -m backend.v2.watch_folder_runner <folder> --once
        python -m backend.v2.watch_folder_runner <folder> --poll-seconds 5
        
    Returns:
        Exit code (0 = success, 1 = failure)
    """
    parser = argparse.ArgumentParser(
        description="V2 Watch Folder Runner - Deterministic JobSpec automation",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Folder Structure:
  watch/
  ├── pending/         # Drop JobSpec files here
  ├── running/         # Currently processing (max N workers)
  ├── completed/       # Successfully completed (with .result.json)
  └── failed/          # Failed jobs (with .result.json)

Examples:
  %(prog)s ./watch                    # Continuous polling (every 2s), 1 worker
  %(prog)s ./watch --once             # Single scan, then exit
  %(prog)s ./watch --poll-seconds 10  # Poll every 10 seconds
  %(prog)s ./watch --max-workers 4    # Up to 4 concurrent jobs

Concurrency (V2 Phase 2):
  --max-workers N   Process up to N jobs concurrently (default: 1)
                    Each job still processes clips sequentially
                    Jobs are dequeued in deterministic (filename) order
                    If one job fails, other running jobs complete normally

On startup, any jobs left in running/ are moved to failed/ with reason
"runner interrupted" - no silent recovery, no retries.
        """,
    )
    
    parser.add_argument(
        "folder",
        type=Path,
        help="Root watch directory (will contain pending/, running/, completed/, failed/)",
    )
    
    parser.add_argument(
        "--once",
        action="store_true",
        help="Perform a single scan and exit (don't poll)",
    )
    
    parser.add_argument(
        "--poll-seconds",
        type=float,
        default=DEFAULT_POLL_SECONDS,
        metavar="N",
        help=f"Seconds between folder scans (default: {DEFAULT_POLL_SECONDS})",
    )
    
    parser.add_argument(
        "--max-workers",
        type=int,
        default=DEFAULT_MAX_WORKERS,
        metavar="N",
        help=f"Maximum concurrent workers (default: {DEFAULT_MAX_WORKERS}). "
             f"Each worker processes one job at a time. "
             f"Jobs are dequeued in deterministic order.",
    )
    
    args = parser.parse_args()
    
    # Validate max-workers
    if args.max_workers < 1:
        print("Error: --max-workers must be at least 1", file=sys.stderr)
        return 1
    
    # Resolve to absolute path
    watch_folder = args.folder.resolve()
    
    return run_watch_loop(
        watch_folder=watch_folder,
        poll_seconds=args.poll_seconds,
        run_once=args.once,
        max_workers=args.max_workers,
    )


if __name__ == "__main__":
    sys.exit(main())
