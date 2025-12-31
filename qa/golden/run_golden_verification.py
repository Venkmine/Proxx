#!/usr/bin/env python3
"""
Golden Render Verification Runner - Opt-in proxy output verification.

This is Forge's golden render verification suite. It proves that Forge can
produce real, attach-safe proxy outputs end-to-end using Resolve and FFmpeg.

This is NOT part of normal verification.
This is NOT fast.
This is NOT CI-friendly.

It must only run when explicitly invoked by a human.

Usage:
======
    python qa/golden/run_golden_verification.py

You will be prompted to type exactly "RUN GOLDEN TESTS" to confirm.
"""

from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
import json
import shutil
import sys
import os

# Add backend to path for imports
REPO_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "backend"))

from expectations import (
    ExpectationRunner,
    ExpectationResult,
    probe_file,
)

# Import Forge execution machinery
try:
    from job_spec import JobSpec, JOBSPEC_VERSION
    from headless_execute import execute_job_spec, execute_multi_job_spec
    from execution_results import JobExecutionResult
    _FORGE_AVAILABLE = True
except ImportError as e:
    _FORGE_AVAILABLE = False
    _FORGE_IMPORT_ERROR = str(e)


# =============================================================================
# Constants
# =============================================================================

GOLDEN_DIR = Path(__file__).parent
MANIFEST_PATH = GOLDEN_DIR / "golden_manifest.json"
RESULTS_DIR = GOLDEN_DIR / "results"
MEDIA_DIR = REPO_ROOT / "qa" / "media"

CONFIRMATION_PHRASE = "RUN GOLDEN TESTS"

WARNING_BANNER = """
================================================================================
                    GOLDEN RENDER VERIFICATION SUITE
================================================================================

WARNING: This will perform REAL RENDERS and may take SEVERAL MINUTES.

This suite:
  - Executes real FFmpeg and Resolve jobs
  - Produces actual proxy output files
  - Writes persistent artifacts to qa/golden/results/
  - Stops immediately on first failure

This is NOT part of normal verification.
This is NOT fast.
This is NOT CI-friendly.

================================================================================
"""


# =============================================================================
# Data Classes
# =============================================================================

@dataclass
class TestDefinition:
    """A single golden render test from the manifest."""
    
    id: str
    description: str
    engine: str
    source: str
    profile: str
    burnin_recipe: Optional[str]
    lut: Optional[str]
    expectations: List[str]
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "TestDefinition":
        return cls(
            id=data["id"],
            description=data.get("description", ""),
            engine=data["engine"],
            source=data["source"],
            profile=data["profile"],
            burnin_recipe=data.get("burnin_recipe"),
            lut=data.get("lut"),
            expectations=data["expectations"],
        )


@dataclass
class TestResult:
    """Result of a single golden render test."""
    
    test_id: str
    passed: bool
    reason: str
    execution_time_seconds: float
    proxy_output_path: Optional[str] = None
    expectation_results: List[Dict[str, Any]] = field(default_factory=list)
    error: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "test_id": self.test_id,
            "passed": self.passed,
            "reason": self.reason,
            "execution_time_seconds": self.execution_time_seconds,
            "proxy_output_path": self.proxy_output_path,
            "expectation_results": self.expectation_results,
            "error": self.error,
        }


# =============================================================================
# Manifest Loading
# =============================================================================

def load_manifest() -> List[TestDefinition]:
    """Load and parse the golden manifest."""
    if not MANIFEST_PATH.exists():
        raise FileNotFoundError(f"Golden manifest not found: {MANIFEST_PATH}")
    
    with open(MANIFEST_PATH) as f:
        data = json.load(f)
    
    tests = []
    for test_data in data.get("tests", []):
        tests.append(TestDefinition.from_dict(test_data))
    
    return tests


def check_media_setup() -> List[str]:
    """
    Check if test media files exist.
    
    Returns list of missing files (empty if all present).
    """
    missing = []
    
    expected_files = [
        MEDIA_DIR / "ffmpeg_sample.mov",
        MEDIA_DIR / "ffmpeg_sample.wav",
    ]
    
    for path in expected_files:
        if not path.exists():
            missing.append(str(path.relative_to(REPO_ROOT)))
    
    # BRAW is optional (requires external sample)
    braw_path = MEDIA_DIR / "resolve_raw_sample.braw"
    if not braw_path.exists():
        # Check if it's a broken symlink
        if braw_path.is_symlink():
            missing.append(f"{braw_path.relative_to(REPO_ROOT)} (broken symlink)")
    
    return missing


# =============================================================================
# Test Execution
# =============================================================================

def resolve_source_path(source: str) -> Path:
    """Resolve a source path relative to repo root."""
    source_path = REPO_ROOT / source
    if not source_path.exists():
        raise FileNotFoundError(f"Source file not found: {source_path}")
    return source_path


def create_job_spec(test: TestDefinition, output_dir: Path) -> JobSpec:
    """Create a JobSpec for a golden render test."""
    source_path = resolve_source_path(test.source)
    
    # Determine output container
    container = "mov"
    
    # Extract codec from profile
    codec_map = {
        "proxy_h264_low": "h264",
        "proxy_h264": "h264",
        "proxy_prores_proxy": "prores_proxy",
        "proxy_prores_lt": "prores_lt",
        "proxy_prores_proxy_resolve": "prores_proxy",
        "audio_passthrough": "pcm_s16le",
    }
    codec = codec_map.get(test.profile, "h264")
    
    job_spec = JobSpec(
        sources=[str(source_path)],
        output_directory=str(output_dir),
        proxy_profile=test.profile,
        naming_template="{source_name}_proxy",
        codec=codec,
        container=container,
        resolution="1920x1080" if "h264" in test.profile or "prores" in test.profile else "same",
        burnin_recipe=test.burnin_recipe,
        lut=test.lut,
    )
    
    return job_spec


def execute_test(test: TestDefinition, output_dir: Path) -> TestResult:
    """Execute a single golden render test."""
    start_time = datetime.now()
    
    try:
        # Create output directory for this test
        test_output_dir = output_dir / test.id
        test_output_dir.mkdir(parents=True, exist_ok=True)
        
        # Create JobSpec
        job_spec = create_job_spec(test, test_output_dir)
        
        print(f"\n  Creating JobSpec for: {test.id}")
        print(f"    Source: {job_spec.sources[0]}")
        print(f"    Profile: {job_spec.proxy_profile}")
        print(f"    Engine: {test.engine}")
        
        # Execute the job
        print(f"  Executing render...")
        
        result = execute_multi_job_spec(job_spec)
        
        # Find the output file
        proxy_output = None
        if result.clip_results:
            first_clip = result.clip_results[0]
            if first_clip.resolved_output_path:
                proxy_output = Path(first_clip.resolved_output_path)
        
        if proxy_output is None or not proxy_output.exists():
            # Try to find any output file in the directory
            outputs = list(test_output_dir.glob("*_proxy.*"))
            if outputs:
                proxy_output = outputs[0]
        
        if proxy_output is None or not proxy_output.exists():
            elapsed = (datetime.now() - start_time).total_seconds()
            return TestResult(
                test_id=test.id,
                passed=False,
                reason="No proxy output file produced",
                execution_time_seconds=elapsed,
                error=f"Job result: {result.status}",
            )
        
        print(f"  Output: {proxy_output}")
        
        # Copy output to standardized location
        standard_output = test_output_dir / "proxy_output.mov"
        if proxy_output != standard_output:
            shutil.copy2(proxy_output, standard_output)
        
        # Probe source and proxy
        source_path = resolve_source_path(test.source)
        source_probe = probe_file(source_path)
        proxy_probe = probe_file(standard_output)
        
        if source_probe is None:
            elapsed = (datetime.now() - start_time).total_seconds()
            return TestResult(
                test_id=test.id,
                passed=False,
                reason="Failed to probe source file",
                execution_time_seconds=elapsed,
                proxy_output_path=str(standard_output),
            )
        
        if proxy_probe is None:
            elapsed = (datetime.now() - start_time).total_seconds()
            return TestResult(
                test_id=test.id,
                passed=False,
                reason="Failed to probe proxy file",
                execution_time_seconds=elapsed,
                proxy_output_path=str(standard_output),
            )
        
        # Save probe data
        with open(test_output_dir / "probe.json", "w") as f:
            json.dump({
                "source": source_probe,
                "proxy": proxy_probe,
            }, f, indent=2)
        
        # Run expectations
        print(f"  Running expectations: {', '.join(test.expectations)}")
        
        runner = ExpectationRunner(
            source_probe=source_probe,
            proxy_probe=proxy_probe,
            source_path=source_path,
            proxy_path=standard_output,
        )
        
        expectation_results = runner.run_expectations(
            test.expectations,
            profile=test.profile,
        )
        
        # Save expectation results
        with open(test_output_dir / "expectations.json", "w") as f:
            json.dump([r.to_dict() for r in expectation_results], f, indent=2)
        
        # Check if all expectations passed
        all_passed = all(r.passed for r in expectation_results)
        failed_expectations = [r for r in expectation_results if not r.passed]
        
        elapsed = (datetime.now() - start_time).total_seconds()
        
        if all_passed:
            reason = f"All {len(test.expectations)} expectations passed"
        else:
            reason = f"{len(failed_expectations)} expectation(s) failed: " + \
                     ", ".join(f"{r.expectation}: {r.reason}" for r in failed_expectations)
        
        # Write result summary
        with open(test_output_dir / "result.txt", "w") as f:
            f.write(f"Test: {test.id}\n")
            f.write(f"Status: {'PASS' if all_passed else 'FAIL'}\n")
            f.write(f"Reason: {reason}\n")
            f.write(f"Execution Time: {elapsed:.2f}s\n")
            f.write("\nExpectation Details:\n")
            for r in expectation_results:
                status = "PASS" if r.passed else "FAIL"
                f.write(f"  [{status}] {r.expectation}: {r.reason}\n")
        
        return TestResult(
            test_id=test.id,
            passed=all_passed,
            reason=reason,
            execution_time_seconds=elapsed,
            proxy_output_path=str(standard_output),
            expectation_results=[r.to_dict() for r in expectation_results],
        )
    
    except Exception as e:
        elapsed = (datetime.now() - start_time).total_seconds()
        return TestResult(
            test_id=test.id,
            passed=False,
            reason=f"Exception during execution: {e}",
            execution_time_seconds=elapsed,
            error=str(e),
        )


# =============================================================================
# Summary Generation
# =============================================================================

def write_summary(
    results: List[TestResult],
    output_dir: Path,
    total_time: float,
) -> None:
    """Write the summary.md file."""
    
    passed_count = sum(1 for r in results if r.passed)
    failed_count = len(results) - passed_count
    overall_status = "PASS" if failed_count == 0 else "FAIL"
    
    summary_lines = [
        "# Golden Render Verification Summary",
        "",
        f"**Run Time:** {datetime.now().isoformat()}",
        f"**Total Duration:** {total_time:.2f} seconds",
        "",
        "---",
        "",
        f"## FORGE GOLDEN RENDER STATUS: **{overall_status}**",
        "",
        f"- Tests Run: {len(results)}",
        f"- Passed: {passed_count}",
        f"- Failed: {failed_count}",
        "",
        "---",
        "",
        "## Test Results",
        "",
    ]
    
    for result in results:
        status = "✅ PASS" if result.passed else "❌ FAIL"
        summary_lines.append(f"### {result.test_id}")
        summary_lines.append("")
        summary_lines.append(f"**Status:** {status}")
        summary_lines.append(f"**Duration:** {result.execution_time_seconds:.2f}s")
        summary_lines.append(f"**Reason:** {result.reason}")
        
        if result.proxy_output_path:
            summary_lines.append(f"**Output:** `{result.proxy_output_path}`")
        
        if result.error:
            summary_lines.append(f"**Error:** {result.error}")
        
        if result.expectation_results:
            summary_lines.append("")
            summary_lines.append("**Expectations:**")
            summary_lines.append("")
            for exp in result.expectation_results:
                exp_status = "✅" if exp["passed"] else "❌"
                summary_lines.append(f"- {exp_status} `{exp['expectation']}`: {exp['reason']}")
        
        summary_lines.append("")
        summary_lines.append("---")
        summary_lines.append("")
    
    summary_path = output_dir / "summary.md"
    with open(summary_path, "w") as f:
        f.write("\n".join(summary_lines))
    
    print(f"\nSummary written to: {summary_path}")


# =============================================================================
# Main Runner
# =============================================================================

def run_golden_verification() -> int:
    """
    Run the golden render verification suite.
    
    Returns:
        0 if all tests pass, 1 if any test fails.
    """
    # Print warning banner
    print(WARNING_BANNER)
    
    # Check Forge availability
    if not _FORGE_AVAILABLE:
        print(f"\n❌ ERROR: Forge execution machinery not available.")
        print(f"   Import error: {_FORGE_IMPORT_ERROR}")
        return 1
    
    # Check media setup
    missing_media = check_media_setup()
    if missing_media:
        print("\n❌ ERROR: Test media not set up. Missing files:")
        for f in missing_media:
            print(f"   - {f}")
        print()
        print("Run the media setup script first:")
        print("  python qa/media/setup_golden_media.py")
        print()
        return 1
    
    # Load manifest
    try:
        tests = load_manifest()
    except Exception as e:
        print(f"\n❌ ERROR: Failed to load manifest: {e}")
        return 1
    
    print(f"Found {len(tests)} test(s) in manifest:")
    for test in tests:
        print(f"  - {test.id} ({test.engine}): {test.description}")
    
    # Require explicit confirmation
    print(f"\nTo proceed, type exactly: {CONFIRMATION_PHRASE}")
    print()
    
    try:
        confirmation = input("> ").strip()
    except (EOFError, KeyboardInterrupt):
        print("\n\nAborted by user.")
        return 1
    
    if confirmation != CONFIRMATION_PHRASE:
        print(f"\n❌ Confirmation failed. Expected: '{CONFIRMATION_PHRASE}'")
        print("Aborting.")
        return 1
    
    print("\n" + "=" * 80)
    print("STARTING GOLDEN RENDER VERIFICATION")
    print("=" * 80)
    
    # Create timestamped output directory
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_dir = RESULTS_DIR / timestamp
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"\nOutput directory: {output_dir}")
    
    # Run tests
    results: List[TestResult] = []
    start_time = datetime.now()
    
    for i, test in enumerate(tests, 1):
        print(f"\n{'=' * 60}")
        print(f"TEST {i}/{len(tests)}: {test.id}")
        print(f"{'=' * 60}")
        
        result = execute_test(test, output_dir)
        results.append(result)
        
        if result.passed:
            print(f"\n  ✅ PASSED: {result.reason}")
        else:
            print(f"\n  ❌ FAILED: {result.reason}")
            if result.error:
                print(f"     Error: {result.error}")
            
            # Stop on first failure
            print("\n" + "=" * 80)
            print("STOPPING: First failure encountered (no continue-on-error)")
            print("=" * 80)
            break
    
    total_time = (datetime.now() - start_time).total_seconds()
    
    # Write summary
    write_summary(results, output_dir, total_time)
    
    # Print final status
    passed_count = sum(1 for r in results if r.passed)
    failed_count = len(results) - passed_count
    
    print("\n" + "=" * 80)
    if failed_count == 0 and len(results) == len(tests):
        print("FORGE GOLDEN RENDER STATUS: ✅ PASS")
        print(f"All {len(tests)} test(s) passed in {total_time:.2f}s")
    else:
        print("FORGE GOLDEN RENDER STATUS: ❌ FAIL")
        print(f"{failed_count} test(s) failed, {passed_count} passed ({len(tests) - len(results)} not run)")
    print("=" * 80)
    
    return 0 if failed_count == 0 and len(results) == len(tests) else 1


# =============================================================================
# Entry Point
# =============================================================================

if __name__ == "__main__":
    sys.exit(run_golden_verification())
