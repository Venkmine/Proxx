"""
Verify QA Runner

CLI entrypoint for the Verify QA system.

Usage:
    python -m qa.verify.verify proxy fast
    python -m qa.verify.verify proxy
    python -m qa.verify.verify proxy full
"""

import argparse
import subprocess
import sys
from pathlib import Path
from typing import List, Optional

from .levels import VerifyLevel, get_level
from .registry import get_test_groups, TestGroup


def run_command(cmd: List[str], cwd: Optional[Path] = None) -> tuple[int, str, str]:
    """Run a command and return exit code, stdout, stderr."""
    result = subprocess.run(
        cmd,
        cwd=cwd,
        capture_output=True,
        text=True,
    )
    return result.returncode, result.stdout, result.stderr


def run_lint(project_root: Path) -> bool:
    """Run linting checks."""
    print("\n" + "=" * 60)
    print("LINT CHECKS")
    print("=" * 60)
    
    backend_path = project_root / "backend"
    
    # Run ruff if available
    print("\n→ Running ruff lint...")
    code, stdout, stderr = run_command(
        ["python", "-m", "ruff", "check", "app/"],
        cwd=backend_path
    )
    
    if code != 0:
        print(f"  ✗ ruff found issues")
        print(stderr or stdout)
        # Don't fail on lint for now - just warn
        print("  (lint warnings do not block)")
    else:
        print("  ✓ ruff passed")
    
    return True  # Lint warnings don't block


def run_unit_tests(project_root: Path) -> bool:
    """Run unit tests."""
    print("\n" + "=" * 60)
    print("UNIT TESTS")
    print("=" * 60)
    
    qa_path = project_root / "qa"
    
    print("\n→ Running pytest unit tests...")
    code, stdout, stderr = run_command(
        ["python", "-m", "pytest", "proxy/unit/", "-v", "--tb=short"],
        cwd=qa_path
    )
    
    print(stdout)
    if stderr:
        print(stderr)
    
    if code != 0:
        print("  ✗ Unit tests failed")
        return False
    
    print("  ✓ Unit tests passed")
    return True


def run_integration_tests(project_root: Path) -> bool:
    """Run integration tests."""
    print("\n" + "=" * 60)
    print("INTEGRATION TESTS")
    print("=" * 60)
    
    qa_path = project_root / "qa"
    
    print("\n→ Running pytest integration tests...")
    code, stdout, stderr = run_command(
        ["python", "-m", "pytest", "proxy/integration/", "-v", "--tb=short"],
        cwd=qa_path
    )
    
    print(stdout)
    if stderr:
        print(stderr)
    
    if code != 0:
        print("  ✗ Integration tests failed")
        return False
    
    print("  ✓ Integration tests passed")
    return True


def run_e2e_tests(project_root: Path) -> bool:
    """Run E2E tests with real FFmpeg."""
    print("\n" + "=" * 60)
    print("E2E TESTS (FFmpeg)")
    print("=" * 60)
    
    qa_path = project_root / "qa"
    
    print("\n→ Running pytest E2E tests...")
    code, stdout, stderr = run_command(
        ["python", "-m", "pytest", "proxy/e2e/", "-v", "--tb=short"],
        cwd=qa_path
    )
    
    print(stdout)
    if stderr:
        print(stderr)
    
    if code != 0:
        print("  ✗ E2E tests failed")
        return False
    
    print("  ✓ E2E tests passed")
    return True


def run_schema_validation(project_root: Path) -> bool:
    """Run schema and settings validation."""
    print("\n" + "=" * 60)
    print("SCHEMA VALIDATION")
    print("=" * 60)
    
    # Import and validate settings schema
    print("\n→ Validating DeliverSettings schema...")
    try:
        sys.path.insert(0, str(project_root / "backend"))
        from app.deliver.settings import DeliverSettings
        
        # Try creating a default settings instance
        settings = DeliverSettings()
        print(f"  ✓ DeliverSettings schema valid")
        return True
    except Exception as e:
        print(f"  ✗ Schema validation failed: {e}")
        return False


def verify_proxy(level: VerifyLevel, project_root: Path) -> bool:
    """
    Run Verify Proxy at the specified level.
    
    Levels:
    - FAST: lint, unit tests, schema validation
    - PROXY: + integration tests
    - FULL: + E2E tests with real FFmpeg
    """
    print("\n" + "=" * 60)
    print(f"VERIFY PROXY — {level.name}")
    print("=" * 60)
    
    all_passed = True
    
    # FAST level
    if not run_lint(project_root):
        all_passed = False
    
    if not run_schema_validation(project_root):
        all_passed = False
        
    if not run_unit_tests(project_root):
        all_passed = False
    
    # PROXY level (includes FAST)
    if level in (VerifyLevel.PROXY, VerifyLevel.FULL):
        if not run_integration_tests(project_root):
            all_passed = False
    
    # FULL level (includes PROXY)
    if level == VerifyLevel.FULL:
        if not run_e2e_tests(project_root):
            all_passed = False
    
    # Final result
    print("\n" + "=" * 60)
    if all_passed:
        print(f"✓ VERIFY PROXY {level.name} PASSED")
    else:
        print(f"✗ VERIFY PROXY {level.name} FAILED")
    print("=" * 60)
    
    return all_passed


def main():
    """CLI entrypoint."""
    parser = argparse.ArgumentParser(
        description="Verify QA System for Awaire Proxy",
        usage="python -m qa.verify.verify <product> [level]"
    )
    parser.add_argument(
        "product",
        choices=["proxy"],
        help="Product to verify (only 'proxy' is supported)"
    )
    parser.add_argument(
        "level",
        nargs="?",
        default="proxy",
        choices=["fast", "proxy", "full"],
        help="Verification level (default: proxy)"
    )
    
    args = parser.parse_args()
    
    # Determine project root
    project_root = Path(__file__).parent.parent.parent
    
    # Get verification level
    level = get_level(args.level)
    
    # Run verification
    success = verify_proxy(level, project_root)
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
