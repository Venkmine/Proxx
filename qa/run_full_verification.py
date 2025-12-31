#!/usr/bin/env python3
"""
Full Verification Runner - Automated tests + human chaos tests.

This script:
1. Runs all automated routing/failure tests
2. Writes results to artifacts directory
3. STOPS and prompts operator before human tests
4. Runs human chaos tests (interactive)
5. Writes final summary with credibility assessment

Usage:
    python run_full_verification.py [--skip-human] [--output-dir PATH]

Part of Forge Verification System.
"""

import sys
import os
import json
import subprocess
import argparse
from pathlib import Path
from datetime import datetime
from dataclasses import dataclass, asdict
from typing import List, Optional, Dict, Any


# =============================================================================
# Configuration
# =============================================================================

AUTOMATED_TEST_FILES = [
    "automated/test_routing_matrix.py",
    "automated/test_mixed_folder_inputs.py",
    "automated/test_failure_isolation.py",
    "automated/test_recursive_folder_handling.py",
    "automated/test_engine_selection.py",
]

QA_DIR = Path(__file__).parent
BACKEND_DIR = QA_DIR.parent / "backend"


# =============================================================================
# Result Types
# =============================================================================

@dataclass
class AutomatedTestResult:
    """Result of a single test file."""
    test_file: str
    passed: int
    failed: int
    errors: int
    skipped: int
    duration_seconds: float
    output: str
    success: bool


@dataclass
class VerificationResult:
    """Complete verification run result."""
    run_id: str
    start_time: str
    end_time: Optional[str]
    
    # Automated
    automated_tests_run: bool
    automated_passed: int
    automated_failed: int
    automated_errors: int
    automated_results: List[Dict]
    
    # Human
    human_tests_run: bool
    human_passed: int
    human_failed: int
    human_session_file: Optional[str]
    
    # Overall
    forge_credible: Optional[bool]
    credibility_reason: str


# =============================================================================
# Console Helpers
# =============================================================================

def print_header(text: str):
    """Print a section header."""
    width = 70
    print()
    print("=" * width)
    print(text.center(width))
    print("=" * width)
    print()


def print_subheader(text: str):
    """Print a subsection header."""
    print()
    print("-" * 50)
    print(f"  {text}")
    print("-" * 50)


# =============================================================================
# Automated Tests
# =============================================================================

def run_automated_tests(output_dir: Path) -> List[AutomatedTestResult]:
    """
    Run all automated tests using pytest.
    
    Returns:
        List of test results for each test file
    """
    print_header("AUTOMATED VERIFICATION TESTS")
    
    results = []
    
    for test_file in AUTOMATED_TEST_FILES:
        test_path = QA_DIR / test_file
        
        if not test_path.exists():
            print(f"  ⚠️  Test file not found: {test_file}")
            continue
        
        print(f"  Running: {test_file}")
        
        start = datetime.now()
        
        # Run pytest
        result = subprocess.run(
            [
                sys.executable, "-m", "pytest",
                str(test_path),
                "-v",
                "--tb=short",
                "-q",
            ],
            capture_output=True,
            text=True,
            env={
                **os.environ,
                "PYTHONPATH": str(BACKEND_DIR),
            },
        )
        
        duration = (datetime.now() - start).total_seconds()
        
        # Parse output
        output = result.stdout + result.stderr
        passed, failed, errors, skipped = parse_pytest_output(output)
        
        success = result.returncode == 0
        
        status = "✅" if success else "❌"
        print(f"    {status} {passed} passed, {failed} failed, {errors} errors ({duration:.1f}s)")
        
        results.append(AutomatedTestResult(
            test_file=test_file,
            passed=passed,
            failed=failed,
            errors=errors,
            skipped=skipped,
            duration_seconds=duration,
            output=output,
            success=success,
        ))
    
    return results


def parse_pytest_output(output: str) -> tuple:
    """
    Parse pytest output to extract counts.
    
    Returns:
        Tuple of (passed, failed, errors, skipped)
    """
    import re
    
    passed = failed = errors = skipped = 0
    
    # Look for summary line like "5 passed, 1 failed, 2 errors in 1.23s"
    summary_pattern = r"(\d+)\s+(passed|failed|error|skipped)"
    
    for match in re.finditer(summary_pattern, output, re.IGNORECASE):
        count = int(match.group(1))
        category = match.group(2).lower()
        
        if category == "passed":
            passed = count
        elif category == "failed":
            failed = count
        elif category in ("error", "errors"):
            errors = count
        elif category == "skipped":
            skipped = count
    
    return passed, failed, errors, skipped


def save_automated_results(results: List[AutomatedTestResult], output_dir: Path):
    """Save automated test results to JSON."""
    output_dir.mkdir(parents=True, exist_ok=True)
    
    json_path = output_dir / "automated_results.json"
    
    data = {
        "timestamp": datetime.now().isoformat(),
        "total_passed": sum(r.passed for r in results),
        "total_failed": sum(r.failed for r in results),
        "total_errors": sum(r.errors for r in results),
        "all_success": all(r.success for r in results),
        "results": [asdict(r) for r in results],
    }
    
    with open(json_path, 'w') as f:
        json.dump(data, f, indent=2)
    
    # Also save full output log
    log_path = output_dir / "automated_tests.log"
    with open(log_path, 'w') as f:
        for r in results:
            f.write(f"\n{'='*60}\n")
            f.write(f"TEST FILE: {r.test_file}\n")
            f.write(f"{'='*60}\n")
            f.write(r.output)
            f.write("\n")
    
    print(f"  Results saved to: {json_path}")


def print_automated_summary(results: List[AutomatedTestResult]):
    """Print summary of automated tests."""
    print_subheader("AUTOMATED TEST SUMMARY")
    
    total_passed = sum(r.passed for r in results)
    total_failed = sum(r.failed for r in results)
    total_errors = sum(r.errors for r in results)
    all_success = all(r.success for r in results)
    
    print(f"  Total Passed:  {total_passed}")
    print(f"  Total Failed:  {total_failed}")
    print(f"  Total Errors:  {total_errors}")
    print()
    
    if all_success:
        print("  ✅ All automated tests PASSED")
    else:
        print("  ❌ Some automated tests FAILED")
        print()
        print("  Failed test files:")
        for r in results:
            if not r.success:
                print(f"    - {r.test_file}: {r.failed} failed, {r.errors} errors")


# =============================================================================
# Human Tests
# =============================================================================

def prompt_for_human_tests() -> bool:
    """
    Prompt operator to confirm running human tests.
    
    Returns:
        True if operator wants to run human tests
    """
    print_header("HUMAN CHAOS TESTS")
    
    print("  Automated tests are complete.")
    print()
    print("  Human chaos tests require physical intervention:")
    print("    - Disconnecting drives")
    print("    - Killing processes")
    print("    - Changing permissions")
    print("    - etc.")
    print()
    print("  These tests are CRITICAL for real-world credibility.")
    print("  They cannot be automated.")
    print()
    
    response = input("  Run human chaos tests now? (yes/no): ").strip().lower()
    
    return response in ("yes", "y")


def run_human_tests(output_dir: Path) -> Optional[Path]:
    """
    Run human chaos tests interactively.
    
    Returns:
        Path to results file, or None if not run
    """
    # Import and run the human test runner
    human_runner = QA_DIR / "human" / "run_human_chaos_tests.py"
    
    if not human_runner.exists():
        print(f"  ⚠️  Human test runner not found: {human_runner}")
        return None
    
    # Run in subprocess to keep output clean
    result = subprocess.run(
        [sys.executable, str(human_runner), "--output-dir", str(output_dir)],
    )
    
    # Find the results file
    for f in output_dir.glob("human_chaos_session_*.json"):
        return f
    
    return None


# =============================================================================
# Final Summary
# =============================================================================

def generate_summary(
    output_dir: Path,
    automated_results: List[AutomatedTestResult],
    human_session_file: Optional[Path],
) -> VerificationResult:
    """Generate final verification summary."""
    
    # Automated stats
    auto_passed = sum(r.passed for r in automated_results)
    auto_failed = sum(r.failed for r in automated_results)
    auto_errors = sum(r.errors for r in automated_results)
    auto_success = all(r.success for r in automated_results)
    
    # Human stats
    human_run = human_session_file is not None
    human_passed = 0
    human_failed = 0
    
    if human_session_file and human_session_file.exists():
        with open(human_session_file) as f:
            human_data = json.load(f)
            for r in human_data.get("results", []):
                if r.get("result") == "PASS":
                    human_passed += 1
                elif r.get("result") == "FAIL":
                    human_failed += 1
    
    # Credibility assessment
    if auto_failed > 0 or auto_errors > 0:
        credible = False
        reason = f"Automated tests failed ({auto_failed} failed, {auto_errors} errors)"
    elif not human_run:
        credible = None
        reason = "Human chaos tests not run - credibility unknown"
    elif human_failed > 0:
        credible = False
        reason = f"Human chaos tests failed ({human_failed} failed)"
    else:
        credible = True
        reason = "All automated and human tests passed"
    
    return VerificationResult(
        run_id=datetime.now().strftime("%Y%m%d_%H%M%S"),
        start_time=datetime.now().isoformat(),
        end_time=datetime.now().isoformat(),
        automated_tests_run=True,
        automated_passed=auto_passed,
        automated_failed=auto_failed,
        automated_errors=auto_errors,
        automated_results=[asdict(r) for r in automated_results],
        human_tests_run=human_run,
        human_passed=human_passed,
        human_failed=human_failed,
        human_session_file=str(human_session_file) if human_session_file else None,
        forge_credible=credible,
        credibility_reason=reason,
    )


def save_summary(result: VerificationResult, output_dir: Path):
    """Save verification summary to files."""
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Save JSON
    json_path = output_dir / "verification_summary.json"
    with open(json_path, 'w') as f:
        json.dump(asdict(result), f, indent=2)
    
    # Save markdown
    md_path = output_dir / "summary.md"
    with open(md_path, 'w') as f:
        f.write(generate_markdown_summary(result))
    
    print(f"  Summary saved to: {md_path}")


def generate_markdown_summary(result: VerificationResult) -> str:
    """Generate markdown summary."""
    lines = [
        "# Forge Verification Summary",
        "",
        f"**Run ID**: {result.run_id}",
        f"**Date**: {result.start_time}",
        "",
        "---",
        "",
        "## Automated Tests",
        "",
        f"- **Passed**: {result.automated_passed}",
        f"- **Failed**: {result.automated_failed}",
        f"- **Errors**: {result.automated_errors}",
        "",
    ]
    
    if result.automated_failed == 0 and result.automated_errors == 0:
        lines.append("✅ All automated tests passed")
    else:
        lines.append("❌ Automated tests have failures")
    
    lines.extend([
        "",
        "## Human Chaos Tests",
        "",
    ])
    
    if result.human_tests_run:
        lines.extend([
            f"- **Passed**: {result.human_passed}",
            f"- **Failed**: {result.human_failed}",
            "",
        ])
        if result.human_failed == 0:
            lines.append("✅ All human chaos tests passed")
        else:
            lines.append("❌ Human chaos tests have failures")
    else:
        lines.append("⚠️ Human chaos tests were NOT run")
    
    lines.extend([
        "",
        "---",
        "",
        "## Credibility Assessment",
        "",
    ])
    
    if result.forge_credible is True:
        lines.extend([
            "# ✅ FORGE IS CREDIBLE FOR REAL-WORLD USE",
            "",
            f"Reason: {result.credibility_reason}",
        ])
    elif result.forge_credible is False:
        lines.extend([
            "# ❌ FORGE IS NOT CREDIBLE FOR REAL-WORLD USE",
            "",
            f"Reason: {result.credibility_reason}",
        ])
    else:
        lines.extend([
            "# ⚠️ CREDIBILITY UNKNOWN",
            "",
            f"Reason: {result.credibility_reason}",
        ])
    
    lines.extend([
        "",
        "---",
        "",
        "*This report was generated by the Forge Verification System.*",
        "",
    ])
    
    return "\n".join(lines)


def print_final_summary(result: VerificationResult):
    """Print final summary to console."""
    print_header("VERIFICATION COMPLETE")
    
    print("  AUTOMATED TESTS:")
    print(f"    Passed: {result.automated_passed}")
    print(f"    Failed: {result.automated_failed}")
    print(f"    Errors: {result.automated_errors}")
    print()
    
    print("  HUMAN CHAOS TESTS:")
    if result.human_tests_run:
        print(f"    Passed: {result.human_passed}")
        print(f"    Failed: {result.human_failed}")
    else:
        print("    NOT RUN")
    print()
    
    print("  " + "=" * 50)
    
    if result.forge_credible is True:
        print("  ✅ FORGE IS CREDIBLE FOR REAL-WORLD USE TODAY")
    elif result.forge_credible is False:
        print("  ❌ FORGE IS NOT CREDIBLE FOR REAL-WORLD USE TODAY")
    else:
        print("  ⚠️  CREDIBILITY UNKNOWN (human tests not run)")
    
    print("  " + "=" * 50)
    print()
    print(f"  Reason: {result.credibility_reason}")
    print()


# =============================================================================
# Main
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Run full Forge verification (automated + human tests)"
    )
    parser.add_argument(
        "--skip-human",
        action="store_true",
        help="Skip human chaos tests",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("artifacts"),
        help="Base directory for results",
    )
    
    args = parser.parse_args()
    
    # Create timestamped output directory
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_dir = args.output_dir / f"verification_run_{timestamp}"
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print_header("FORGE VERIFICATION SYSTEM")
    print(f"  Output directory: {output_dir}")
    print()
    
    # Phase 1: Automated tests
    automated_results = run_automated_tests(output_dir)
    save_automated_results(automated_results, output_dir)
    print_automated_summary(automated_results)
    
    # Phase 2: Human tests (optional)
    human_session_file = None
    
    if not args.skip_human:
        auto_success = all(r.success for r in automated_results)
        
        if not auto_success:
            print()
            print("  ⚠️  Automated tests failed.")
            print("  Consider fixing automated test failures before human tests.")
            print()
        
        if prompt_for_human_tests():
            human_session_file = run_human_tests(output_dir)
    else:
        print()
        print("  ⏭️  Skipping human tests (--skip-human flag)")
    
    # Phase 3: Generate summary
    result = generate_summary(output_dir, automated_results, human_session_file)
    save_summary(result, output_dir)
    print_final_summary(result)
    
    print(f"  Full results: {output_dir}")
    print()
    
    # Exit code
    if result.forge_credible is False:
        sys.exit(1)
    elif result.forge_credible is None:
        sys.exit(2)  # Inconclusive
    else:
        sys.exit(0)


if __name__ == "__main__":
    main()
