"""
V2 Watch Folder Runner - Minimal, deterministic JobSpec automation.

This module provides a simple watch-folder processor for JobSpec JSON files.
It is NOT a daemon product - it is a deterministic runner suitable for TechOps
use and future service wrapping.

Design Principles:
==================
1. DETERMINISTIC: Same input folder always produces same behavior
2. IDEMPOTENT: Safe to re-run; never re-executes processed JobSpecs
3. SEQUENTIAL: No concurrency; process one JobSpec at a time
4. EXPLICIT: Failures are preserved as .result.json with status=FAILED
5. AUDITABLE: Manifest tracks SHA256 hashes for change detection

Folder Structure:
=================
watch_folder/
├── job1.json           # Pending JobSpec
├── job2.json           # Pending JobSpec
├── processed/          # Successfully completed JobSpecs
│   └── job0.json       # Moved after successful execution
├── failed/             # Failed JobSpecs
│   └── job_bad.json    # Moved after failed execution
├── processed_manifest.json  # SHA256 hashes for idempotency
└── *.result.json       # Execution results (sibling to original)

Idempotency Rules:
==================
1. If <jobspec>.result.json exists, skip processing
2. If JobSpec path+hash is in manifest, skip processing
3. If JobSpec is modified (hash differs), re-process
4. After processing, record path:hash in manifest

Usage:
======
    python -m backend.watch_folder_runner <folder>
    python -m backend.watch_folder_runner <folder> --once
    python -m backend.watch_folder_runner <folder> --poll-seconds 5

Part of V2 Phase 1 (Option A: Reliable Proxy Engine)
"""

import argparse
import hashlib
import json
import shutil
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Literal, Optional

# Import from sibling modules (adjust imports for module context)
try:
    from job_spec import JobSpec, JobSpecValidationError
    from execution_results import JobExecutionResult
    from headless_execute import execute_multi_job_spec
except ImportError:
    # Running as module
    from backend.job_spec import JobSpec, JobSpecValidationError
    from backend.execution_results import JobExecutionResult
    from backend.headless_execute import execute_multi_job_spec


# -----------------------------------------------------------------------------
# Constants
# -----------------------------------------------------------------------------

MANIFEST_FILENAME = "processed_manifest.json"
PROCESSED_FOLDER = "processed"
FAILED_FOLDER = "failed"
RESULT_SUFFIX = ".result.json"

DEFAULT_POLL_SECONDS = 2


# -----------------------------------------------------------------------------
# Manifest Management (Idempotency)
# -----------------------------------------------------------------------------

@dataclass
class ProcessedManifest:
    """
    Tracks processed JobSpecs by path and content hash for idempotency.
    
    The manifest file is a simple JSON object:
    {
        "version": 1,
        "entries": {
            "<absolute_path>": {
                "sha256": "<hash>",
                "processed_at": "<iso_timestamp>",
                "result_status": "COMPLETED|FAILED"
            }
        }
    }
    """
    
    entries: Dict[str, Dict[str, str]] = field(default_factory=dict)
    version: int = 1
    
    @classmethod
    def load(cls, manifest_path: Path) -> "ProcessedManifest":
        """Load manifest from file, or return empty manifest if not found."""
        if not manifest_path.is_file():
            return cls()
        
        try:
            with open(manifest_path, "r") as f:
                data = json.load(f)
            return cls(
                entries=data.get("entries", {}),
                version=data.get("version", 1),
            )
        except (json.JSONDecodeError, KeyError):
            # Corrupted manifest - start fresh
            return cls()
    
    def save(self, manifest_path: Path) -> None:
        """Save manifest to file."""
        data = {
            "version": self.version,
            "entries": self.entries,
        }
        with open(manifest_path, "w") as f:
            json.dump(data, f, indent=2, sort_keys=True)
    
    def is_processed(self, path: str, sha256: str) -> bool:
        """
        Check if a JobSpec has already been processed with the same content.
        
        Returns True if:
        - Path exists in manifest AND
        - SHA256 hash matches
        
        Returns False if:
        - Path not in manifest, OR
        - Path in manifest but hash differs (file was modified)
        """
        if path not in self.entries:
            return False
        return self.entries[path].get("sha256") == sha256
    
    def record(self, path: str, sha256: str, status: str) -> None:
        """Record a processed JobSpec in the manifest."""
        self.entries[path] = {
            "sha256": sha256,
            "processed_at": datetime.now(timezone.utc).isoformat(),
            "result_status": status,
        }


def compute_file_sha256(file_path: Path) -> str:
    """Compute SHA256 hash of file contents."""
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha256_hash.update(chunk)
    return sha256_hash.hexdigest()


# -----------------------------------------------------------------------------
# Watch Folder Processing
# -----------------------------------------------------------------------------

@dataclass
class ProcessingResult:
    """Result of processing a single JobSpec file."""
    
    jobspec_path: Path
    """Path to the JobSpec file that was processed."""
    
    status: Literal["COMPLETED", "FAILED", "SKIPPED", "INVALID"]
    """Processing status."""
    
    result_path: Optional[Path] = None
    """Path to the .result.json file (if created)."""
    
    destination_path: Optional[Path] = None
    """Path where JobSpec was moved (processed/ or failed/)."""
    
    error_message: Optional[str] = None
    """Error message if processing failed."""
    
    job_result: Optional[JobExecutionResult] = None
    """Full job execution result (if executed)."""


def scan_for_jobspecs(watch_folder: Path) -> List[Path]:
    """
    Scan watch folder for pending JobSpec JSON files.
    
    Only scans the root of watch_folder, not subdirectories.
    Excludes:
    - Files in processed/ and failed/ subdirectories
    - Files ending in .result.json
    - manifest file
    """
    jobspecs: List[Path] = []
    
    for path in sorted(watch_folder.glob("*.json")):
        # Skip results and manifest
        if path.name.endswith(RESULT_SUFFIX):
            continue
        if path.name == MANIFEST_FILENAME:
            continue
        
        jobspecs.append(path)
    
    return jobspecs


def should_skip_jobspec(
    jobspec_path: Path,
    manifest: ProcessedManifest,
) -> tuple[bool, Optional[str]]:
    """
    Determine if a JobSpec should be skipped.
    
    Returns:
        (should_skip, reason)
        - should_skip: True if processing should be skipped
        - reason: Human-readable reason for skipping (or None)
    """
    # Check if result file already exists
    result_path = jobspec_path.with_suffix(RESULT_SUFFIX)
    if result_path.is_file():
        return True, "result file already exists"
    
    # Check manifest for hash match
    try:
        current_hash = compute_file_sha256(jobspec_path)
        path_key = str(jobspec_path.absolute())
        
        if manifest.is_processed(path_key, current_hash):
            return True, "already processed (manifest hash match)"
    except OSError:
        # Can't compute hash - don't skip, let processing handle the error
        pass
    
    return False, None


def write_result_json(
    result_path: Path,
    job_result: JobExecutionResult,
    jobspec_path: Path,
    trace_path: Optional[Path] = None,
) -> None:
    """Write execution result to a .result.json file."""
    result_data = job_result.to_dict()
    
    # Add metadata
    result_data["_metadata"] = {
        "jobspec_path": str(jobspec_path),
        "result_written_at": datetime.now(timezone.utc).isoformat(),
        "trace_path": str(trace_path) if trace_path else None,
    }
    
    with open(result_path, "w") as f:
        json.dump(result_data, f, indent=2)


def process_single_jobspec(
    jobspec_path: Path,
    watch_folder: Path,
    manifest: ProcessedManifest,
) -> ProcessingResult:
    """
    Process a single JobSpec file.
    
    Steps:
    1. Check idempotency (skip if already processed)
    2. Load and validate JobSpec JSON
    3. Execute using headless executor
    4. Write .result.json
    5. Move JobSpec to processed/ or failed/
    6. Update manifest
    
    Returns:
        ProcessingResult with all details
    """
    # Step 1: Check if should skip
    should_skip, skip_reason = should_skip_jobspec(jobspec_path, manifest)
    if should_skip:
        return ProcessingResult(
            jobspec_path=jobspec_path,
            status="SKIPPED",
            error_message=skip_reason,
        )
    
    # Compute hash for manifest (before any processing)
    try:
        file_hash = compute_file_sha256(jobspec_path)
    except OSError as e:
        return ProcessingResult(
            jobspec_path=jobspec_path,
            status="INVALID",
            error_message=f"Cannot read file: {e}",
        )
    
    # Step 2: Load and parse JobSpec
    try:
        with open(jobspec_path, "r") as f:
            data = json.load(f)
        job_spec = JobSpec.from_dict(data)
    except json.JSONDecodeError as e:
        return ProcessingResult(
            jobspec_path=jobspec_path,
            status="INVALID",
            error_message=f"Invalid JSON: {e}",
        )
    except (KeyError, ValueError) as e:
        return ProcessingResult(
            jobspec_path=jobspec_path,
            status="INVALID",
            error_message=f"Invalid JobSpec structure: {e}",
        )
    
    # Step 3: Execute the job
    try:
        job_result = execute_multi_job_spec(job_spec)
    except JobSpecValidationError as e:
        # Validation failed - treat as FAILED
        job_result = None
        execution_failed = True
        failure_reason = f"Validation failed: {e}"
    except Exception as e:
        # Unexpected error - treat as FAILED
        job_result = None
        execution_failed = True
        failure_reason = f"Execution error: {e}"
    else:
        execution_failed = job_result.final_status != "COMPLETED"
        failure_reason = None
    
    # Determine final status
    if job_result is None:
        # Create a minimal failed result
        from execution_results import JobExecutionResult
        job_result = JobExecutionResult(
            job_id=job_spec.job_id if job_spec else "unknown",
            clips=[],
            final_status="FAILED",
            started_at=datetime.now(timezone.utc),
            completed_at=datetime.now(timezone.utc),
        )
    
    final_status: Literal["COMPLETED", "FAILED"] = (
        "COMPLETED" if job_result.final_status == "COMPLETED" else "FAILED"
    )
    
    # Step 4: Write .result.json (sibling to original jobspec)
    result_path = jobspec_path.with_suffix(RESULT_SUFFIX)
    write_result_json(result_path, job_result, jobspec_path)
    
    # Step 5: Move JobSpec to processed/ or failed/
    if final_status == "COMPLETED":
        dest_folder = watch_folder / PROCESSED_FOLDER
    else:
        dest_folder = watch_folder / FAILED_FOLDER
    
    dest_folder.mkdir(parents=True, exist_ok=True)
    destination_path = dest_folder / jobspec_path.name
    
    # Handle filename collision (add timestamp suffix)
    if destination_path.exists():
        timestamp = datetime.now().strftime("%Y%m%dT%H%M%S")
        stem = jobspec_path.stem
        destination_path = dest_folder / f"{stem}_{timestamp}.json"
    
    shutil.move(str(jobspec_path), str(destination_path))
    
    # Step 6: Update manifest
    path_key = str(jobspec_path.absolute())
    manifest.record(path_key, file_hash, final_status)
    
    return ProcessingResult(
        jobspec_path=jobspec_path,
        status=final_status,
        result_path=result_path,
        destination_path=destination_path,
        job_result=job_result,
    )


def run_scan(watch_folder: Path, manifest: ProcessedManifest) -> List[ProcessingResult]:
    """
    Perform a single scan of the watch folder and process all pending JobSpecs.
    
    Returns:
        List of ProcessingResult for each JobSpec found
    """
    results: List[ProcessingResult] = []
    
    # Scan for pending JobSpecs
    jobspecs = scan_for_jobspecs(watch_folder)
    
    if not jobspecs:
        return results
    
    print(f"Found {len(jobspecs)} JobSpec(s) to process")
    
    # Process each sequentially
    for i, jobspec_path in enumerate(jobspecs, 1):
        print(f"\n[{i}/{len(jobspecs)}] Processing: {jobspec_path.name}")
        
        result = process_single_jobspec(jobspec_path, watch_folder, manifest)
        results.append(result)
        
        # Print result
        if result.status == "SKIPPED":
            print(f"  → SKIPPED: {result.error_message}")
        elif result.status == "INVALID":
            print(f"  → INVALID: {result.error_message}")
        elif result.status == "COMPLETED":
            print(f"  → COMPLETED: Moved to {result.destination_path}")
            if result.result_path:
                print(f"     Result: {result.result_path}")
        else:
            print(f"  → FAILED: Moved to {result.destination_path}")
            if result.result_path:
                print(f"     Result: {result.result_path}")
    
    return results


def run_watch_loop(
    watch_folder: Path,
    poll_seconds: float = DEFAULT_POLL_SECONDS,
    run_once: bool = False,
) -> None:
    """
    Main watch loop - scan folder and process JobSpecs.
    
    Args:
        watch_folder: Directory to watch for JobSpec JSON files
        poll_seconds: Seconds between scans (default: 2)
        run_once: If True, do single scan and exit
    """
    print(f"V2 Watch Folder Runner")
    print(f"=" * 40)
    print(f"Watch folder: {watch_folder}")
    print(f"Poll interval: {poll_seconds}s")
    print(f"Mode: {'single scan' if run_once else 'continuous polling'}")
    print()
    
    # Ensure watch folder exists
    if not watch_folder.is_dir():
        print(f"Error: Watch folder does not exist: {watch_folder}", file=sys.stderr)
        sys.exit(1)
    
    # Create subdirectories if needed
    (watch_folder / PROCESSED_FOLDER).mkdir(exist_ok=True)
    (watch_folder / FAILED_FOLDER).mkdir(exist_ok=True)
    
    # Load manifest
    manifest_path = watch_folder / MANIFEST_FILENAME
    manifest = ProcessedManifest.load(manifest_path)
    print(f"Loaded manifest with {len(manifest.entries)} entries")
    
    iteration = 0
    
    try:
        while True:
            iteration += 1
            
            if not run_once:
                print(f"\n--- Scan #{iteration} at {datetime.now().strftime('%H:%M:%S')} ---")
            
            results = run_scan(watch_folder, manifest)
            
            # Save manifest after each scan (if anything was processed)
            if any(r.status in ("COMPLETED", "FAILED") for r in results):
                manifest.save(manifest_path)
                print(f"Manifest saved ({len(manifest.entries)} entries)")
            
            # Summary
            completed = sum(1 for r in results if r.status == "COMPLETED")
            failed = sum(1 for r in results if r.status == "FAILED")
            skipped = sum(1 for r in results if r.status == "SKIPPED")
            invalid = sum(1 for r in results if r.status == "INVALID")
            
            if results:
                print(f"\nScan complete: {completed} completed, {failed} failed, {skipped} skipped, {invalid} invalid")
            else:
                if not run_once:
                    print("No pending JobSpecs found")
            
            if run_once:
                break
            
            # Sleep before next scan
            time.sleep(poll_seconds)
            
    except KeyboardInterrupt:
        print("\n\nShutting down watch folder runner...")
        manifest.save(manifest_path)
        print("Manifest saved.")


# -----------------------------------------------------------------------------
# CLI Entry Point
# -----------------------------------------------------------------------------

def main():
    """
    CLI entry point for watch folder runner.
    
    Usage:
        python -m backend.watch_folder_runner <folder>
        python -m backend.watch_folder_runner <folder> --once
        python -m backend.watch_folder_runner <folder> --poll-seconds 5
    """
    parser = argparse.ArgumentParser(
        description="V2 Watch Folder Runner - Process JobSpec JSON files",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s ./jobs                    # Watch folder, poll every 2s
  %(prog)s ./jobs --once             # Single scan, then exit
  %(prog)s ./jobs --poll-seconds 10  # Poll every 10 seconds

Folder structure after running:
  ./jobs/
  ├── pending.json           # Pending JobSpec
  ├── pending.result.json    # Result of processing (stays in place)
  ├── processed/             # Successfully completed JobSpecs
  ├── failed/                # Failed JobSpecs
  └── processed_manifest.json  # Idempotency tracking
        """,
    )
    
    parser.add_argument(
        "folder",
        type=Path,
        help="Directory containing JobSpec JSON files to process",
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
    
    run_watch_loop(
        watch_folder=watch_folder,
        poll_seconds=args.poll_seconds,
        run_once=args.once,
    )


if __name__ == "__main__":
    main()
