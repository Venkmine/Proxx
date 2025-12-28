#!/usr/bin/env python3
"""
V2 Verification Harness

CI-friendly verification script for V2 Phase 1 that:
1. Runs V2 unit tests (including test_v2_phase1_regression.py)
2. Runs a headless execution smoke test with a fixture JobSpec
3. Runs a watch folder test with atomic state transitions
4. Writes deterministic artifacts to ./artifacts/v2/<timestamp>/
5. Cleans old artifacts (keeps last 5 runs)

Exit codes:
  0 = All tests passed
  1 = One or more tests failed

Usage:
  python scripts/verify_v2.py         # Run from repo root
  make verify-v2                      # Via Makefile
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from typing import List, Tuple

# Resolve paths
SCRIPT_DIR = Path(__file__).parent.resolve()
PROJECT_ROOT = SCRIPT_DIR.parent
BACKEND_DIR = PROJECT_ROOT / "backend"
QA_DIR = PROJECT_ROOT / "qa"
FIXTURES_V2_DIR = QA_DIR / "fixtures" / "v2"
ARTIFACTS_DIR = PROJECT_ROOT / "artifacts" / "v2"
FIXTURE_MEDIA = QA_DIR / "fixtures" / "media" / "short_h264_audio.mp4"
FIXTURE_JOBSPEC = FIXTURES_V2_DIR / "smoke_jobspec.json"

# Add backend to path for imports
sys.path.insert(0, str(BACKEND_DIR))

# Max artifact runs to keep
MAX_ARTIFACT_RUNS = 5


def print_header(title: str) -> None:
    """Print a visible section header."""
    print("\n" + "=" * 70)
    print(f"  {title}")
    print("=" * 70)


def print_subheader(title: str) -> None:
    """Print a subsection header."""
    print(f"\n--- {title} ---")


def cleanup_old_artifacts() -> int:
    """
    Remove old artifact directories, keeping only the last MAX_ARTIFACT_RUNS.
    
    Returns:
        Number of directories cleaned up.
    """
    if not ARTIFACTS_DIR.exists():
        return 0
    
    # List all run directories (should be named with timestamps)
    run_dirs = sorted(
        [d for d in ARTIFACTS_DIR.iterdir() if d.is_dir()],
        key=lambda x: x.name,
        reverse=True,  # Newest first
    )
    
    cleaned = 0
    if len(run_dirs) > MAX_ARTIFACT_RUNS:
        for old_dir in run_dirs[MAX_ARTIFACT_RUNS:]:
            try:
                shutil.rmtree(old_dir)
                cleaned += 1
            except Exception as e:
                print(f"  Warning: Could not remove {old_dir}: {e}")
    
    return cleaned


def create_run_artifact_dir() -> Path:
    """
    Create a new artifact directory for this run.
    
    Returns:
        Path to the artifact directory.
    """
    timestamp = datetime.now().strftime("%Y%m%dT%H%M%S")
    run_dir = ARTIFACTS_DIR / timestamp
    run_dir.mkdir(parents=True, exist_ok=True)
    return run_dir


def run_unit_tests() -> Tuple[bool, str]:
    """
    Run V2 unit tests using pytest.
    
    Returns:
        Tuple of (success, output)
    """
    print_subheader("Running V2 Unit Tests")
    
    test_file = QA_DIR / "test_v2_phase1_regression.py"
    
    if not test_file.exists():
        return False, f"Test file not found: {test_file}"
    
    try:
        result = subprocess.run(
            [sys.executable, "-m", "pytest", str(test_file), "-v", "--tb=short"],
            cwd=str(PROJECT_ROOT),
            capture_output=True,
            text=True,
            timeout=300,  # 5 minute timeout
        )
        
        output = result.stdout + result.stderr
        print(output)
        
        return result.returncode == 0, output
        
    except subprocess.TimeoutExpired:
        return False, "Unit tests timed out after 5 minutes"
    except Exception as e:
        return False, f"Failed to run unit tests: {e}"


def run_smoke_test(artifact_dir: Path) -> Tuple[bool, str, Path]:
    """
    Run headless execution smoke test with fixture JobSpec.
    
    Args:
        artifact_dir: Directory to write artifacts to.
        
    Returns:
        Tuple of (success, output, result_json_path)
    """
    print_subheader("Running Headless Smoke Test")
    
    # Check fixture media exists
    if not FIXTURE_MEDIA.exists():
        return False, f"Fixture media not found: {FIXTURE_MEDIA}", Path()
    
    if not FIXTURE_JOBSPEC.exists():
        return False, f"Fixture JobSpec not found: {FIXTURE_JOBSPEC}", Path()
    
    # Load fixture JobSpec template
    try:
        with open(FIXTURE_JOBSPEC, "r") as f:
            jobspec_data = json.load(f)
    except Exception as e:
        return False, f"Failed to load JobSpec fixture: {e}", Path()
    
    # Resolve paths (sources are relative, convert to absolute)
    source_path = PROJECT_ROOT / jobspec_data["sources"][0]
    if not source_path.exists():
        return False, f"Source media not found: {source_path}", Path()
    
    jobspec_data["sources"] = [str(source_path)]
    jobspec_data["output_directory"] = str(artifact_dir)
    
    # Write resolved JobSpec to artifact dir
    resolved_jobspec_path = artifact_dir / "resolved_jobspec.json"
    with open(resolved_jobspec_path, "w") as f:
        json.dump(jobspec_data, f, indent=2, sort_keys=False)
    
    print(f"  JobSpec: {resolved_jobspec_path}")
    print(f"  Source:  {source_path}")
    print(f"  Output:  {artifact_dir}")
    
    # Import and execute
    try:
        from job_spec import JobSpec
        from headless_execute import execute_multi_job_spec
        
        job_spec = JobSpec.from_dict(jobspec_data)
        result = execute_multi_job_spec(job_spec)
        
        # Print summary
        print(f"\n{result.summary()}")
        for clip in result.clips:
            print(f"  {clip.summary()}")
        
        # Write result JSON deterministically
        result_json_path = artifact_dir / "execution_result.json"
        with open(result_json_path, "w") as f:
            # Use sorted keys for determinism
            json.dump(result.to_dict(), f, indent=2, sort_keys=True)
        
        print(f"\n  Result JSON: {result_json_path}")
        
        # Verify output
        if result.success:
            for clip in result.clips:
                output_path = Path(clip.resolved_output_path)
                if output_path.exists():
                    size_kb = clip.output_size_bytes / 1024 if clip.output_size_bytes else 0
                    print(f"  ✓ Output: {output_path.name} ({size_kb:.1f} KB)")
                else:
                    return False, f"Output file missing: {output_path}", result_json_path
        
        return result.success, result.summary(), result_json_path
        
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        return False, f"Smoke test failed: {e}\n{tb}", Path()


def write_run_summary(artifact_dir: Path, unit_ok: bool, smoke_ok: bool, watch_ok: bool = True) -> None:
    """
    Write a summary file for this verification run.
    """
    summary = {
        "timestamp": datetime.now().isoformat(),
        "unit_tests_passed": unit_ok,
        "smoke_test_passed": smoke_ok,
        "watch_folder_test_passed": watch_ok,
        "overall_success": unit_ok and smoke_ok and watch_ok,
        "artifact_dir": str(artifact_dir),
    }
    
    summary_path = artifact_dir / "run_summary.json"
    with open(summary_path, "w") as f:
        json.dump(summary, f, indent=2, sort_keys=True)
    
    print(f"\n  Run summary: {summary_path}")


def run_watch_folder_test(artifact_dir: Path) -> Tuple[bool, str]:
    """
    Run watch folder verification test.
    
    This test:
    1. Creates a temp watch folder structure (pending/, running/, completed/, failed/)
    2. Drops a valid JobSpec into pending/
    3. Runs the watch runner in --once mode
    4. Asserts JobSpec moved to completed/, result json written, output file exists
    
    Args:
        artifact_dir: Directory to write artifacts to.
        
    Returns:
        Tuple of (success, message)
    """
    print_subheader("Running Watch Folder Test")
    
    # Check fixture media exists
    if not FIXTURE_MEDIA.exists():
        return False, f"Fixture media not found: {FIXTURE_MEDIA}"
    
    if not FIXTURE_JOBSPEC.exists():
        return False, f"Fixture JobSpec not found: {FIXTURE_JOBSPEC}"
    
    # Create watch folder structure in artifacts
    watch_dir = artifact_dir / "watch_test"
    pending_dir = watch_dir / "pending"
    running_dir = watch_dir / "running"
    completed_dir = watch_dir / "completed"
    failed_dir = watch_dir / "failed"
    
    for d in [pending_dir, running_dir, completed_dir, failed_dir]:
        d.mkdir(parents=True, exist_ok=True)
    
    print(f"  Watch folder: {watch_dir}")
    
    # Load and prepare JobSpec
    try:
        with open(FIXTURE_JOBSPEC, "r") as f:
            jobspec_data = json.load(f)
    except Exception as e:
        return False, f"Failed to load JobSpec fixture: {e}"
    
    # Resolve paths
    source_path = PROJECT_ROOT / jobspec_data["sources"][0]
    if not source_path.exists():
        return False, f"Source media not found: {source_path}"
    
    # Create output directory for the job
    output_dir = artifact_dir / "watch_output"
    output_dir.mkdir(parents=True, exist_ok=True)
    
    jobspec_data["sources"] = [str(source_path)]
    jobspec_data["output_directory"] = str(output_dir)
    jobspec_data["job_id"] = "watch_test_001"
    
    # Write JobSpec to pending/
    test_jobspec_path = pending_dir / "watch_test_job.json"
    with open(test_jobspec_path, "w") as f:
        json.dump(jobspec_data, f, indent=2)
    
    print(f"  Created pending JobSpec: {test_jobspec_path.name}")
    print(f"  Output directory: {output_dir}")
    
    # Run watch folder runner in --once mode
    try:
        result = subprocess.run(
            [sys.executable, "-m", "backend.v2.watch_folder_runner", str(watch_dir), "--once"],
            cwd=str(PROJECT_ROOT),
            capture_output=True,
            text=True,
            timeout=120,  # 2 minute timeout
        )
        
        print(f"\n  Runner output:")
        for line in result.stdout.split('\n'):
            if line.strip():
                print(f"    {line}")
        
        if result.returncode != 0:
            print(f"\n  Runner stderr:")
            for line in result.stderr.split('\n'):
                if line.strip():
                    print(f"    {line}")
        
    except subprocess.TimeoutExpired:
        return False, "Watch folder runner timed out after 2 minutes"
    except Exception as e:
        return False, f"Failed to run watch folder runner: {e}"
    
    # Verify: JobSpec should have moved to completed/
    completed_jobspec = completed_dir / "watch_test_job.json"
    if not completed_jobspec.exists():
        # Check if it's in failed/ instead
        failed_jobspec = failed_dir / "watch_test_job.json"
        if failed_jobspec.exists():
            # Read result to understand why
            failed_result = failed_dir / "watch_test_job.result.json"
            if failed_result.exists():
                with open(failed_result, "r") as f:
                    result_data = json.load(f)
                failure_info = result_data.get("_metadata", {}).get("failure_reason", "unknown")
                return False, f"JobSpec moved to failed/ instead of completed/. Reason: {failure_info}"
            return False, "JobSpec moved to failed/ instead of completed/"
        
        # Check if still in pending (not processed)
        if test_jobspec_path.exists():
            return False, "JobSpec was not processed (still in pending/)"
        
        return False, f"JobSpec not found in completed/ or failed/"
    
    print(f"  ✓ JobSpec moved to completed/")
    
    # Verify: Result JSON should exist alongside JobSpec
    result_json = completed_dir / "watch_test_job.result.json"
    if not result_json.exists():
        return False, "Result JSON not found in completed/"
    
    print(f"  ✓ Result JSON exists: {result_json.name}")
    
    # Read and validate result JSON
    try:
        with open(result_json, "r") as f:
            result_data = json.load(f)
        
        if result_data.get("final_status") != "COMPLETED":
            return False, f"Result status is {result_data.get('final_status')}, expected COMPLETED"
        
        print(f"  ✓ Result status: COMPLETED")
        
    except Exception as e:
        return False, f"Failed to read result JSON: {e}"
    
    # Verify: Output file should exist with size > 0
    clips = result_data.get("clips", [])
    if not clips:
        return False, "No clips in result"
    
    for clip in clips:
        output_path = Path(clip.get("resolved_output_path", ""))
        if not output_path.exists():
            return False, f"Output file missing: {output_path}"
        
        size = output_path.stat().st_size
        if size == 0:
            return False, f"Output file has zero size: {output_path}"
        
        size_kb = size / 1024
        print(f"  ✓ Output exists: {output_path.name} ({size_kb:.1f} KB)")
    
    # Verify: pending/ should be empty
    pending_files = list(pending_dir.glob("*.json"))
    if pending_files:
        return False, f"pending/ should be empty but has {len(pending_files)} file(s)"
    
    print(f"  ✓ pending/ is empty")
    
    # Verify: running/ should be empty
    running_files = list(running_dir.glob("*.json"))
    if running_files:
        return False, f"running/ should be empty but has {len(running_files)} file(s)"
    
    print(f"  ✓ running/ is empty")
    
    return True, "Watch folder test passed"


def main() -> int:
    """
    Main entry point for V2 verification.
    
    Returns:
        Exit code (0 = success, 1 = failure)
    """
    print_header("V2 Verification Harness")
    print(f"Project root: {PROJECT_ROOT}")
    print(f"Timestamp: {datetime.now().isoformat()}")
    
    # Clean old artifacts
    cleaned = cleanup_old_artifacts()
    if cleaned > 0:
        print(f"\nCleaned {cleaned} old artifact run(s)")
    
    # Create artifact directory for this run
    artifact_dir = create_run_artifact_dir()
    print(f"Artifact directory: {artifact_dir}")
    
    # Track results
    all_passed = True
    
    # Step 1: Run unit tests
    print_header("PHASE 1: V2 Unit Tests")
    unit_ok, unit_output = run_unit_tests()
    
    if unit_ok:
        print("\n✓ Unit tests PASSED")
    else:
        print("\n✗ Unit tests FAILED")
        all_passed = False
    
    # Step 2: Run smoke test
    print_header("PHASE 2: Headless Smoke Test")
    smoke_ok, smoke_output, result_path = run_smoke_test(artifact_dir)
    
    if smoke_ok:
        print("\n✓ Smoke test PASSED")
    else:
        print(f"\n✗ Smoke test FAILED: {smoke_output}")
        all_passed = False
    
    # Step 3: Run watch folder test
    print_header("PHASE 3: Watch Folder Test")
    watch_ok, watch_output = run_watch_folder_test(artifact_dir)
    
    if watch_ok:
        print("\n✓ Watch folder test PASSED")
    else:
        print(f"\n✗ Watch folder test FAILED: {watch_output}")
        all_passed = False
    
    # Write run summary
    write_run_summary(artifact_dir, unit_ok, smoke_ok, watch_ok)
    
    # Final summary
    print_header("VERIFICATION COMPLETE")
    print(f"  Unit Tests:        {'PASSED' if unit_ok else 'FAILED'}")
    print(f"  Smoke Test:        {'PASSED' if smoke_ok else 'FAILED'}")
    print(f"  Watch Folder Test: {'PASSED' if watch_ok else 'FAILED'}")
    print(f"  Overall:           {'PASSED ✓' if all_passed else 'FAILED ✗'}")
    print(f"\n  Artifacts:         {artifact_dir}")
    
    return 0 if all_passed else 1
    
    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(main())
