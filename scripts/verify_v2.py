#!/usr/bin/env python3
"""
V2 Verification Harness

CI-friendly verification script for V2 Phase 1 that:
1. Runs V2 unit tests (including test_v2_phase1_regression.py)
2. Runs a headless execution smoke test with a fixture JobSpec
3. Writes deterministic artifacts to ./artifacts/v2/<timestamp>/
4. Cleans old artifacts (keeps last 5 runs)

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


def write_run_summary(artifact_dir: Path, unit_ok: bool, smoke_ok: bool) -> None:
    """
    Write a summary file for this verification run.
    """
    summary = {
        "timestamp": datetime.now().isoformat(),
        "unit_tests_passed": unit_ok,
        "smoke_test_passed": smoke_ok,
        "overall_success": unit_ok and smoke_ok,
        "artifact_dir": str(artifact_dir),
    }
    
    summary_path = artifact_dir / "run_summary.json"
    with open(summary_path, "w") as f:
        json.dump(summary, f, indent=2, sort_keys=True)
    
    print(f"\n  Run summary: {summary_path}")


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
    
    # Write run summary
    write_run_summary(artifact_dir, unit_ok, smoke_ok)
    
    # Final summary
    print_header("VERIFICATION COMPLETE")
    print(f"  Unit Tests:  {'PASSED' if unit_ok else 'FAILED'}")
    print(f"  Smoke Test:  {'PASSED' if smoke_ok else 'FAILED'}")
    print(f"  Overall:     {'PASSED ✓' if all_passed else 'FAILED ✗'}")
    print(f"\n  Artifacts:   {artifact_dir}")
    
    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(main())
