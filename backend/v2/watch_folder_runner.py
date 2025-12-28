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
├── running/              # JobSpec currently being processed (max 1)
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
- Synchronous execution only
- Sequential only (Phase 1)
- Fail-fast on first error
- No retries
- Preserve partial artifacts

Usage:
======
    python -m backend.v2.watch_folder_runner <folder>
    python -m backend.v2.watch_folder_runner <folder> --once
    python -m backend.v2.watch_folder_runner <folder> --poll-seconds 5

Part of V2 Phase 1 (Option A: Reliable Proxy Engine)
"""

import argparse
import hashlib
import json
import os
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Literal, Optional

# Import from sibling modules (adjust imports for module context)
# Try different import paths to support various invocation methods
import sys
from pathlib import Path

# Add backend directory to path if not already there
_backend_dir = Path(__file__).parent.parent.resolve()
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))

try:
    from job_spec import JobSpec, JobSpecValidationError
    from execution_results import JobExecutionResult, ClipExecutionResult
    from headless_execute import execute_multi_job_spec
except ImportError:
    # Try alternative import paths
    try:
        from backend.job_spec import JobSpec, JobSpecValidationError
        from backend.execution_results import JobExecutionResult, ClipExecutionResult
        from backend.headless_execute import execute_multi_job_spec
    except ImportError as e:
        print(f"Failed to import required modules: {e}", file=sys.stderr)
        print("Make sure you're running from the project root or backend directory.", file=sys.stderr)
        sys.exit(1)


# -----------------------------------------------------------------------------
# Constants
# -----------------------------------------------------------------------------

PENDING_FOLDER = "pending"
RUNNING_FOLDER = "running"
COMPLETED_FOLDER = "completed"
FAILED_FOLDER = "failed"
RESULT_SUFFIX = ".result.json"

DEFAULT_POLL_SECONDS = 2


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
        
        # Create a failure result
        failure_result = JobExecutionResult(
            job_id="unknown",  # We don't load the JobSpec to avoid validation errors
            clips=[],
            final_status="FAILED",
            started_at=datetime.now(timezone.utc),
            completed_at=datetime.now(timezone.utc),
        )
        
        # Try to extract job_id from file
        try:
            with open(jobspec_path, "r") as f:
                data = json.load(f)
                failure_result = JobExecutionResult(
                    job_id=data.get("job_id", "unknown"),
                    clips=[],
                    final_status="FAILED",
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
) -> None:
    """
    Write execution result to a .result.json file.
    
    The result is written alongside the JobSpec in the destination folder
    (completed/ or failed/).
    """
    result_data = job_result.to_dict()
    
    # Add metadata
    result_data["_metadata"] = {
        "jobspec_path": str(jobspec_path),
        "result_written_at": datetime.now(timezone.utc).isoformat(),
    }
    
    if failure_reason:
        result_data["_metadata"]["failure_reason"] = failure_reason
    
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
    
    # Step 2: Load and parse JobSpec
    try:
        with open(running_path, "r") as f:
            data = json.load(f)
        job_spec = JobSpec.from_dict(data)
    except json.JSONDecodeError as e:
        failure_reason = f"Invalid JSON: {e}"
    except (KeyError, ValueError) as e:
        failure_reason = f"Invalid JobSpec structure: {e}"
    except OSError as e:
        failure_reason = f"Cannot read file: {e}"
    
    # Step 3: Validate sources exist (before processing)
    if job_spec and not failure_reason:
        source_error = validate_sources_exist(job_spec)
        if source_error:
            failure_reason = source_error
    
    # Step 4: Execute the job
    if job_spec and not failure_reason:
        try:
            job_result = execute_multi_job_spec(job_spec)
            if job_result.final_status != "COMPLETED":
                # Find failure reason from clips
                for clip in job_result.clips:
                    if clip.status == "FAILED" and clip.failure_reason:
                        failure_reason = clip.failure_reason
                        break
                if not failure_reason:
                    failure_reason = "Execution failed"
        except JobSpecValidationError as e:
            failure_reason = f"Validation failed: {e}"
        except Exception as e:
            failure_reason = f"Execution error: {e}"
    
    # Create result if we don't have one
    if job_result is None:
        job_result = JobExecutionResult(
            job_id=job_spec.job_id if job_spec else "unknown",
            clips=[],
            final_status="FAILED",
            started_at=datetime.now(timezone.utc),
            completed_at=datetime.now(timezone.utc),
        )
    
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
    write_result_json(dest_result, job_result, running_path, failure_reason)
    
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
        )
    
    return ProcessingResult(
        jobspec_path=jobspec_path,
        status=final_status,
        result_path=dest_result,
        destination_path=dest_jobspec,
        job_result=job_result,
        error_message=failure_reason if final_status == "FAILED" else None,
    )


def run_scan(watch_folder: Path) -> List[ProcessingResult]:
    """
    Perform a single scan of pending/ and process all JobSpecs sequentially.
    
    Returns:
        List of ProcessingResult for each JobSpec processed
    """
    results: List[ProcessingResult] = []
    
    # Scan for pending JobSpecs
    jobspecs = scan_for_pending_jobspecs(watch_folder)
    
    if not jobspecs:
        return results
    
    print(f"Found {len(jobspecs)} JobSpec(s) in pending/")
    
    # Process each sequentially
    for i, jobspec_path in enumerate(jobspecs, 1):
        print(f"\n[{i}/{len(jobspecs)}] Processing: {jobspec_path.name}")
        
        result = process_single_jobspec(jobspec_path, watch_folder)
        results.append(result)
        
        # Print result
        if result.status == "SKIPPED":
            print(f"  → SKIPPED: {result.error_message}")
        elif result.status == "INVALID":
            print(f"  → INVALID: {result.error_message}")
        elif result.status == "COMPLETED":
            print(f"  → COMPLETED → {result.destination_path}")
            if result.result_path:
                print(f"     Result: {result.result_path.name}")
        else:
            print(f"  → FAILED → {result.destination_path}")
            if result.error_message:
                print(f"     Reason: {result.error_message}")
            if result.result_path:
                print(f"     Result: {result.result_path.name}")
    
    return results


def run_watch_loop(
    watch_folder: Path,
    poll_seconds: float = DEFAULT_POLL_SECONDS,
    run_once: bool = False,
) -> int:
    """
    Main watch loop - scan pending/ folder and process JobSpecs.
    
    Args:
        watch_folder: Root watch directory
        poll_seconds: Seconds between scans (default: 2)
        run_once: If True, do single scan and exit
        
    Returns:
        Exit code (0 = success/no failures, 1 = had failures)
    """
    print("V2 Watch Folder Runner (Deterministic)")
    print("=" * 50)
    print(f"Watch folder: {watch_folder}")
    print(f"Poll interval: {poll_seconds}s")
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
            
            results = run_scan(watch_folder)
            
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
  ├── running/         # Currently processing (max 1)
  ├── completed/       # Successfully completed (with .result.json)
  └── failed/          # Failed jobs (with .result.json)

Examples:
  %(prog)s ./watch                    # Continuous polling (every 2s)
  %(prog)s ./watch --once             # Single scan, then exit
  %(prog)s ./watch --poll-seconds 10  # Poll every 10 seconds

On startup, any jobs left in running/ are moved to failed/ with reason
"runner interrupted" - no silent recovery.
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
    
    args = parser.parse_args()
    
    # Resolve to absolute path
    watch_folder = args.folder.resolve()
    
    return run_watch_loop(
        watch_folder=watch_folder,
        poll_seconds=args.poll_seconds,
        run_once=args.once,
    )


if __name__ == "__main__":
    sys.exit(main())
