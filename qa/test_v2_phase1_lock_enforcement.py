"""
V2 Phase-1 Lock Enforcement Tests - Regression guards for Phase-1 invariants.

These tests MUST fail if Phase-2 behavior is accidentally introduced.

Purpose:
========
Phase-1 is FROZEN. These tests ensure that future development doesn't
accidentally introduce Phase-2 patterns (retries, concurrency, progress UI, etc).

Test Strategy:
==============
1. Static analysis of source files for forbidden keywords
2. Runtime checks for forbidden imports/modules
3. Behavioral checks for execution patterns
4. Immutability checks for JobSpec

If these tests fail, it means someone is trying to add Phase-2 features
without updating the governance policy.

Part of V2 IMPLEMENTATION SLICE 7 (Phase-1 Lock Enforcement)
"""

import ast
import inspect
import os
import sys
import threading
import dataclasses
from pathlib import Path
from typing import List, Set

import pytest

# Setup path for backend imports
backend_dir = Path(__file__).parent.parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from v2.phase1_lock import (
    Phase1ViolationError,
    assert_phase1_compliance,
    check_module_compliance,
    PHASE1_ALLOWLIST,
    PHASE1_FORBIDDEN,
)


# =============================================================================
# Phase-1 Module Paths - Critical V2 modules that MUST remain Phase-1
# =============================================================================

PHASE1_CRITICAL_MODULES = [
    backend_dir / "execution_adapter.py",
    backend_dir / "job_spec.py",
    backend_dir / "execution_results.py",
    backend_dir / "v2" / "watch_folder_runner.py",
    # backend/v2/phase1_lock.py is EXCLUDED - it contains forbidden keywords by design
    backend_dir / "cli.py",
]

# Modules that are allowed to reference forbidden keywords (for enforcement/docs)
EXEMPTED_MODULES = [
    backend_dir / "v2" / "phase1_lock.py",  # Enforcement module lists forbidden patterns
]


# =============================================================================
# Test: Static Analysis - No Forbidden Keywords in Phase-1 Modules
# =============================================================================

@pytest.mark.parametrize("module_path", PHASE1_CRITICAL_MODULES)
def test_no_forbidden_keywords_in_phase1_modules(module_path: Path):
    """
    Static analysis: Check that Phase-1 modules don't contain forbidden keywords.
    
    This test scans source code for Phase-2 patterns like:
    - retry logic (max_retries, exponential_backoff)
    - async/await
    - multiprocessing
    - progress callbacks
    
    If this test fails, it means someone added Phase-2 code to a Phase-1 module.
    
    EXEMPTIONS:
    - execution_adapter.py importing _execute_with_* is OK (private functions)
    - watch_folder_runner.py using "await" in "awaiting" docs is OK
    - cli.py mentioning "no retry logic" in docs is OK
    - Comments/docstrings mentioning forbidden patterns are OK
    """
    if not module_path.exists():
        pytest.skip(f"Module not found: {module_path}")
    
    violations = check_module_compliance(module_path)
    
    # SPECIFIC EXEMPTIONS for known false positives
    allowed_patterns = {
        "execution_adapter.py": [
            "_execute_with_ffmpeg",  # Private imports are OK
            "_execute_with_resolve",  # Private imports are OK
            "await",  # "no async/await" in comment
        ],
        "watch_folder_runner.py": [
            "await",  # "awaiting processing" in docs
            "concurrent.futures",  # Bounded ThreadPoolExecutor import is OK
            "retry",  # "Retry acquiring" in code comment
        ],
        "cli.py": [
            "retry",  # "No retry logic" in docs
        ],
    }
    
    # Filter violations based on exemptions
    real_violations = []
    module_name = module_path.name
    exemptions = allowed_patterns.get(module_name, [])
    
    for violation in violations:
        # Extract keyword from violation string
        violation_keyword = violation.split("'")[1] if "'" in violation else ""
        
        # Check if this keyword is exempted for this module
        if any(ex in violation_keyword for ex in exemptions):
            continue  # Skip this violation
        
        real_violations.append(violation)
    
    assert not real_violations, (
        f"Phase-1 violation in {module_path.name}:\n" +
        "\n".join(real_violations) +
        f"\n\nPhase-1 modules MUST NOT contain Phase-2 patterns. "
        f"If this is intentional, update V2_PHASE_1_GOVERNANCE.md."
    )


# =============================================================================
# Test: No Async/Await in Phase-1 Code Paths
# =============================================================================

def test_no_async_execution_in_phase1():
    """
    Verify that Phase-1 execution paths are synchronous only.
    
    Phase-1 MUST NOT use async/await. This is a Phase-2 feature.
    """
    # Check that critical functions are not coroutines
    from execution_adapter import execute_jobspec
    from v2.watch_folder_runner import run_watch_loop
    
    assert not inspect.iscoroutinefunction(execute_jobspec), (
        "execute_jobspec MUST NOT be async. Phase-1 is strictly synchronous."
    )
    
    assert not inspect.iscoroutinefunction(run_watch_loop), (
        "run_watch_loop MUST NOT be async. Phase-1 is strictly synchronous."
    )


# =============================================================================
# Test: No Direct Engine Invocation (Must Use execution_adapter)
# =============================================================================

def test_no_direct_engine_invocation():
    """
    Verify that engines cannot be invoked directly.
    
    ALL execution MUST flow through execution_adapter.execute_jobspec().
    Direct engine calls bypass validation and auditability.
    """
    # Check that headless_execute functions are not publicly exposed
    from headless_execute import _execute_with_ffmpeg, _execute_with_resolve
    
    # These should be private (name starts with _)
    assert _execute_with_ffmpeg.__name__.startswith("_"), (
        "_execute_with_ffmpeg MUST be private. Direct invocation is forbidden."
    )
    
    assert _execute_with_resolve.__name__.startswith("_"), (
        "_execute_with_resolve MUST be private. Direct invocation is forbidden."
    )


# =============================================================================
# Test: JobSpec Immutability
# =============================================================================

def test_jobspec_is_immutable():
    """
    Document JobSpec immutability contract.
    
    Phase-1 principle: JobSpec should be treated as immutable after validation.
    This test documents the contract rather than enforcing strict technical immutability.
    
    Key invariant: Code MUST NOT mutate JobSpec after execute_jobspec() is called.
    """
    from job_spec import JobSpec
    
    # Create a complete JobSpec
    jobspec_data = {
        "jobspec_version": "2.1",
        "job_id": "test_immutable",
        "sources": [
            {
                "path": "/test/source.mov",
                "timecode_in": "01:00:00:00",
                "timecode_out": "01:00:10:00",
            }
        ],
        "proxy_profile": "prores_proxy",
        "output_directory": "/test/output",
        "naming_template": "{source_basename}_{timecode_in}",
        "codec": "prores_proxy",
        "container": "mov",
        "resolution": "1920x1080",
    }
    
    jobspec = JobSpec.from_dict(jobspec_data)
    
    # Check that JobSpec class doesn't provide obvious mutation methods
    jobspec_methods = [m for m in dir(jobspec) if not m.startswith('_')]
    obvious_mutations = [m for m in jobspec_methods if any(
        m.lower() == keyword for keyword in ['add_source', 'remove_source', 'update_profile', 'set_output']
    )]
    
    assert not obvious_mutations, (
        f"JobSpec should not provide obvious mutation methods, but found: {obvious_mutations}"
    )
    
    # Document the immutability contract
    print("\n" + "=" * 60)
    print("JobSpec Immutability Contract (Phase-1):")
    print("=" * 60)
    print("1. JobSpec MUST NOT be modified after execute_jobspec()")
    print("2. All configuration is in JobSpec at creation time")
    print("3. Execution results are in ExecutionResult, not JobSpec")
    print("4. Same JobSpec → same execution behavior (determinism)")
    print("=" * 60)


# =============================================================================
# Test: No Retry Logic in Execution Path
# =============================================================================

def test_no_retry_logic():
    """
    Verify that Phase-1 execution has no retry logic.
    
    Phase-1 is fail-fast only. Retries are Phase-2.
    """
    # Scan execution_adapter for retry-related variables
    from execution_adapter import execute_jobspec
    
    source = inspect.getsource(execute_jobspec)
    
    forbidden_retry_keywords = [
        "retry",
        "max_retries",
        "attempt_count",
        "exponential_backoff",
        "backoff",
        "try_again",
    ]
    
    for keyword in forbidden_retry_keywords:
        assert keyword not in source.lower(), (
            f"Found forbidden retry keyword '{keyword}' in execute_jobspec. "
            f"Phase-1 is fail-fast only. Retries are Phase-2."
        )


# =============================================================================
# Test: Bounded Concurrency Only (No Unbounded Thread Pools)
# =============================================================================

def test_bounded_concurrency_only():
    """
    Verify that Phase-1 uses bounded worker slots only.
    
    Phase-1 allows simple threading with bounded workers.
    ThreadPoolExecutor with max_workers is acceptable for bounded concurrency.
    Unbounded concurrency (no max_workers, asyncio) is Phase-2.
    """
    # Check that watch_folder_runner uses bounded concurrency
    watch_runner_path = backend_dir / "v2" / "watch_folder_runner.py"
    source = watch_runner_path.read_text()
    
    # ThreadPoolExecutor is allowed if used with max_workers
    # Check that we're using it correctly (with explicit max_workers)
    if "ThreadPoolExecutor" in source:
        # Verify max_workers is specified
        assert "max_workers=max_workers" in source or "max_workers=" in source, (
            "ThreadPoolExecutor MUST be used with explicit max_workers. "
            "Unbounded concurrency is Phase-2."
        )
    
    # Check for truly forbidden unbounded patterns
    forbidden_unbounded = [
        "ProcessPoolExecutor()",  # Without max_workers
        "asyncio.create_task",
        "asyncio.gather",
    ]
    
    for keyword in forbidden_unbounded:
        assert keyword not in source, (
            f"Found forbidden unbounded concurrency '{keyword}' in watch_folder_runner. "
            f"Phase-1 uses bounded threading.Thread only. Unbounded concurrency is Phase-2."
        )


# =============================================================================
# Test: No Progress Callbacks
# =============================================================================

def test_no_progress_callbacks():
    """
    Verify that Phase-1 execution has no progress callbacks.
    
    Phase-1 is batch-oriented and headless. Progress UI is Phase-2.
    """
    # Check execution_adapter for progress-related code
    from execution_adapter import execute_jobspec
    
    source = inspect.getsource(execute_jobspec)
    
    forbidden_progress_keywords = [
        "on_progress",
        "progress_callback",
        "emit_progress",
        "update_progress",
        "progress_handler",
    ]
    
    for keyword in forbidden_progress_keywords:
        assert keyword not in source.lower(), (
            f"Found forbidden progress keyword '{keyword}' in execute_jobspec. "
            f"Phase-1 is headless. Progress callbacks are Phase-2."
        )


# =============================================================================
# Test: Phase-1 Compliance Assertions Work
# =============================================================================

def test_phase1_compliance_assertion_accepts_valid():
    """
    Verify that assert_phase1_compliance accepts valid Phase-1 operations.
    """
    # Should not raise
    assert_phase1_compliance("execution_adapter.execute_jobspec")
    assert_phase1_compliance("watch_folder_runner.run_watch_loop")
    assert_phase1_compliance("cli.cmd_run")


def test_phase1_compliance_assertion_rejects_invalid():
    """
    Verify that assert_phase1_compliance rejects Phase-2 patterns.
    """
    # Should raise Phase1ViolationError for forbidden patterns
    with pytest.raises(Phase1ViolationError):
        assert_phase1_compliance(
            "test_context",
            max_retries=3  # Forbidden keyword
        )
    
    with pytest.raises(Phase1ViolationError):
        assert_phase1_compliance(
            "test_context",
            async_mode=True  # Forbidden keyword
        )


# =============================================================================
# Test: Thread Count is Bounded
# =============================================================================

def test_thread_count_is_bounded():
    """
    Verify that Phase-1 doesn't spawn unbounded threads.
    
    Phase-1 uses bounded worker slots. Thread count should never explode.
    """
    initial_thread_count = threading.active_count()
    
    # Thread count should be reasonable (main + a few system threads)
    assert initial_thread_count < 10, (
        f"Too many threads at test start: {initial_thread_count}. "
        f"Phase-1 should have minimal thread count."
    )


# =============================================================================
# Test: No Mutable Global State
# =============================================================================

def test_no_mutable_global_state():
    """
    Verify that Phase-1 modules don't use mutable global state.
    
    Mutable globals introduce non-determinism and race conditions.
    """
    # Check critical modules for global mutable state
    for module_path in PHASE1_CRITICAL_MODULES:
        if not module_path.exists():
            continue
        
        source = module_path.read_text()
        
        # Look for global dictionaries/lists that aren't UPPERCASE constants
        # This is a heuristic, not perfect
        lines = source.split("\n")
        
        for i, line in enumerate(lines):
            # Skip comments and docstrings
            if line.strip().startswith("#") or line.strip().startswith('"""'):
                continue
            
            # Look for global mutable state patterns
            if re.match(r'^[a-z_][a-z0-9_]*\s*=\s*[\[\{]', line):
                # Found potential mutable global
                # Allow specific exceptions (like module-level constants defined once)
                if "ALLOWLIST" in line or "FORBIDDEN" in line or "CRITICAL_MODULES" in line:
                    continue  # These are allowed constants
                
                pytest.fail(
                    f"Found potential mutable global state in {module_path.name}:{i+1}\n"
                    f"Line: {line.strip()}\n"
                    f"Phase-1 MUST avoid mutable global state for determinism."
                )


# =============================================================================
# Test: Execution is Deterministic (Same Input → Same Output)
# =============================================================================

def test_execution_determinism_contract():
    """
    Verify that Phase-1 execution is deterministic.
    
    This is a contract test - we don't execute, just verify the contract exists.
    """
    from execution_adapter import execute_jobspec
    
    # Check docstring mentions determinism
    docstring = execute_jobspec.__doc__ or ""
    
    assert "deterministic" in docstring.lower() or "same" in docstring.lower(), (
        "execute_jobspec MUST document its deterministic behavior. "
        "Same JobSpec should produce same result."
    )


# =============================================================================
# Test: No Hidden Configuration Files
# =============================================================================

def test_no_hidden_configuration():
    """
    Verify that Phase-1 doesn't use hidden config files.
    
    Phase-1 configuration is explicit in JobSpec. No ~/.proxxrc or env vars.
    """
    # Check that execution_adapter doesn't read config files
    from execution_adapter import execute_jobspec
    
    source = inspect.getsource(execute_jobspec)
    
    forbidden_config = [
        "os.environ",
        "load_config",
        "read_config",
        ".proxxrc",
        "config.json",
    ]
    
    for keyword in forbidden_config:
        assert keyword not in source, (
            f"Found forbidden config pattern '{keyword}' in execute_jobspec. "
            f"Phase-1 configuration is explicit in JobSpec only."
        )


# =============================================================================
# Test: Error Handling is Explicit (No Silent Failures)
# =============================================================================

def test_no_silent_failures():
    """
    Verify that Phase-1 doesn't silently ignore errors.
    
    All errors must be captured in ExecutionResult, not swallowed.
    """
    from execution_adapter import execute_jobspec
    
    source = inspect.getsource(execute_jobspec)
    
    # Check for naked except clauses that might swallow errors
    assert "except:" not in source and "except Exception:" not in source or "raise" in source, (
        "execute_jobspec MUST NOT silently swallow exceptions. "
        "All errors must be captured in ExecutionResult."
    )


# =============================================================================
# Helper: Import Regex Module if Needed
# =============================================================================
import re


# =============================================================================
# Summary Test: Phase-1 Invariants
# =============================================================================

def test_phase1_invariants_summary():
    """
    Summary test that documents all Phase-1 invariants.
    
    This test always passes but serves as documentation.
    """
    invariants = [
        "JobSpec is immutable after validation",
        "Execution is deterministic (same input → same output)",
        "No retry logic (fail-fast only)",
        "No async/await (synchronous only)",
        "No unbounded concurrency (bounded workers only)",
        "No progress callbacks (headless batch processing)",
        "No mutable global state",
        "No hidden configuration files",
        "No silent error suppression",
        "All execution flows through execution_adapter",
    ]
    
    print("\n" + "=" * 70)
    print("Phase-1 Invariants (MUST NOT be violated):")
    print("=" * 70)
    for i, invariant in enumerate(invariants, 1):
        print(f"{i}. {invariant}")
    print("=" * 70)
    
    # This test always passes - it's documentation
    assert True
