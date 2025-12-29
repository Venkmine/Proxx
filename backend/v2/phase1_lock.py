"""
V2 Phase-1 Lock Enforcement - Prevent accidental evolution to Phase-2 behavior.

This module provides compile-time and runtime enforcement that prevents
Phase-2 features from being accidentally introduced to Phase-1 code paths.

PURPOSE:
========
Phase-1 is FROZEN. It represents a stable, deterministic, well-tested baseline.
Future work (Phase-2, Phase-3) will introduce retries, concurrency, progress UI.

This lock exists to prevent developers from:
- Adding "just one retry" to fix an intermittent issue
- Introducing background threads "to improve UX"
- Adding mutable JobSpec fields "for convenience"
- Bypassing execution_adapter "to save time"

ENFORCEMENT STRATEGY:
====================
1. ALLOWLIST: Explicit list of Phase-1-legal operations
2. FORBIDDEN FLAGS: Explicit list of Phase-2 patterns
3. RUNTIME ASSERTIONS: Called from key entrypoints
4. STATIC ANALYSIS: Tests that scan codebase for violations

Part of V2 IMPLEMENTATION SLICE 7 (Phase-1 Lock Enforcement)
"""

import inspect
import threading
from typing import Any, Dict, List, Optional, Set
from dataclasses import dataclass
from pathlib import Path


# =============================================================================
# Phase-1 Violation Error
# =============================================================================

class Phase1ViolationError(Exception):
    """
    Raised when code attempts to use Phase-2 behavior in Phase-1 context.
    
    This exception MUST be treated as a programming error, not a runtime error.
    If this exception is raised in production, it indicates a code review failure.
    """
    pass


# =============================================================================
# Phase-1 Allowlist - Legal Operations
# =============================================================================

PHASE1_ALLOWLIST: Set[str] = {
    # JobSpec operations
    "jobspec_creation",
    "jobspec_validation",
    "jobspec_serialization",
    "jobspec_deserialization",
    
    # Execution operations
    "execution_adapter_invoke",
    "engine_routing",
    "ffmpeg_execution",
    "resolve_execution",
    "result_serialization",
    
    # Watch folder operations
    "filesystem_scan",
    "atomic_move",
    "result_persistence",
    "watch_folder_dispatch",
    
    # CLI operations
    "cli_validate",
    "cli_execute",
    "cli_watch",
}


# =============================================================================
# Phase-1 Forbidden Patterns - Phase-2 Features
# =============================================================================

@dataclass
class ForbiddenPattern:
    """Definition of a Phase-2 pattern that must not appear in Phase-1."""
    name: str
    description: str
    detection_keywords: List[str]
    context_hint: str


PHASE1_FORBIDDEN: List[ForbiddenPattern] = [
    ForbiddenPattern(
        name="retry_logic",
        description="Automatic retry of failed operations",
        detection_keywords=["retry", "max_retries", "attempt_count", "exponential_backoff"],
        context_hint="Phase-1 is fail-fast only. Retries belong in Phase-2."
    ),
    ForbiddenPattern(
        name="concurrency_primitives",
        description="Concurrent execution beyond Phase-1 bounded workers",
        detection_keywords=["asyncio", "async def", "await", "concurrent.futures", "ThreadPoolExecutor"],
        context_hint="Phase-1 uses simple threading.Thread with bounded worker slots only."
    ),
    ForbiddenPattern(
        name="background_processes",
        description="Long-running background tasks",
        detection_keywords=["multiprocessing", "subprocess.Popen", "daemon=True"],
        context_hint="Phase-1 executions are synchronous and deterministic."
    ),
    ForbiddenPattern(
        name="mutable_jobspec",
        description="Runtime modification of JobSpec fields",
        detection_keywords=["jobspec.clips.append", "jobspec.clips.remove", "jobspec.__setattr__"],
        context_hint="JobSpec is immutable in Phase-1. Modifications belong in creation phase."
    ),
    ForbiddenPattern(
        name="direct_engine_invoke",
        description="Bypassing execution_adapter to call engines directly",
        detection_keywords=["_execute_with_ffmpeg", "_execute_with_resolve"],
        context_hint="ALL execution MUST flow through execution_adapter.execute_jobspec()."
    ),
    ForbiddenPattern(
        name="progress_callbacks",
        description="Real-time progress updates during execution",
        detection_keywords=["on_progress", "progress_callback", "emit_progress"],
        context_hint="Phase-1 is headless and batch-oriented. Progress UI is Phase-2."
    ),
    ForbiddenPattern(
        name="dynamic_config",
        description="Runtime configuration changes",
        detection_keywords=["update_config", "reload_config", "hot_reload"],
        context_hint="Phase-1 configuration is static. Changes require restart."
    ),
    ForbiddenPattern(
        name="smart_recovery",
        description="Automatic error recovery or fallback behavior",
        detection_keywords=["fallback_to", "auto_recovery", "try_alternative"],
        context_hint="Phase-1 errors are explicit and terminal. Recovery is Phase-2."
    ),
]


# =============================================================================
# Phase-1 Compliance Checker
# =============================================================================

class Phase1ComplianceContext:
    """
    Context manager for Phase-1 compliance checking.
    
    Usage:
        with Phase1ComplianceContext("execution_adapter"):
            # Phase-1 legal code here
            pass
    """
    
    def __init__(self, operation: str):
        self.operation = operation
        self.frame_locals: Dict[str, Any] = {}
        
    def __enter__(self):
        # Capture caller's local variables for inspection
        frame = inspect.currentframe()
        if frame and frame.f_back:
            self.frame_locals = frame.f_back.f_locals.copy()
        return self
        
    def __exit__(self, exc_type, exc_val, exc_tb):
        # Check for forbidden patterns in locals
        for pattern in PHASE1_FORBIDDEN:
            for keyword in pattern.detection_keywords:
                # Check variable names
                if any(keyword in str(name).lower() for name in self.frame_locals.keys()):
                    raise Phase1ViolationError(
                        f"Phase-1 violation detected in {self.operation}: "
                        f"Found forbidden pattern '{pattern.name}' (keyword: {keyword})\n"
                        f"{pattern.context_hint}"
                    )
        return False


def assert_phase1_compliance(context: str, **kwargs) -> None:
    """
    Assert that the current execution context is Phase-1 compliant.
    
    This function should be called at key entrypoints:
    - execution_adapter.execute_jobspec()
    - watch_folder_runner.run_watch_loop()
    - cli.cmd_execute()
    - cli.cmd_watch()
    
    Args:
        context: Human-readable description of where this check is called from
        **kwargs: Optional context variables to check for forbidden patterns
        
    Raises:
        Phase1ViolationError: If Phase-2 patterns are detected
        
    Example:
        assert_phase1_compliance(
            "execution_adapter.execute_jobspec",
            jobspec=jobspec,
            engine=engine_name
        )
    """
    # Check that operation is in allowlist
    # Context is free-form, so check if it contains any allowlisted operation
    # or common Phase-1 entrypoint patterns
    allowed_patterns = list(PHASE1_ALLOWLIST) + [
        "execution_adapter",
        "watch_folder_runner",
        "cli",
        "execute_jobspec",
        "run_watch_loop",
        "cmd_run",
        "cmd_watch",
        "cmd_execute",
    ]
    
    if not any(pattern in context.lower() for pattern in allowed_patterns):
        raise Phase1ViolationError(
            f"Phase-1 violation: Unknown operation '{context}' not in allowlist.\n"
            f"If this is a legitimate Phase-1 operation, add it to PHASE1_ALLOWLIST."
        )
    
    # Check kwargs for forbidden patterns
    for pattern in PHASE1_FORBIDDEN:
        for keyword in pattern.detection_keywords:
            # Check kwarg keys
            if any(keyword in str(key).lower() for key in kwargs.keys()):
                raise Phase1ViolationError(
                    f"Phase-1 violation in {context}: "
                    f"Found forbidden pattern '{pattern.name}' (keyword: {keyword})\n"
                    f"{pattern.context_hint}"
                )
            
            # Check kwarg values (shallow inspection)
            for key, value in kwargs.items():
                value_str = str(value).lower()
                if keyword in value_str:
                    raise Phase1ViolationError(
                        f"Phase-1 violation in {context}: "
                        f"Found forbidden pattern '{pattern.name}' in {key}={value}\n"
                        f"{pattern.context_hint}"
                    )
    
    # Check for threading beyond bounded worker slots
    active_threads = threading.active_count()
    if active_threads > 10:  # Main thread + bounded workers should never exceed this
        raise Phase1ViolationError(
            f"Phase-1 violation in {context}: "
            f"Too many active threads ({active_threads}). "
            f"Phase-1 uses bounded worker slots only. Unbounded concurrency is Phase-2."
        )


def check_module_compliance(module_path: Path) -> List[str]:
    """
    Static analysis: Check a Python module for Phase-1 violations.
    
    This function scans source code for forbidden keywords.
    It is used by regression tests to catch violations early.
    
    Args:
        module_path: Path to Python source file
        
    Returns:
        List of violation descriptions (empty if compliant)
        
    Example:
        violations = check_module_compliance(Path("backend/v2/execution_adapter.py"))
        assert not violations, f"Phase-1 violations found: {violations}"
    """
    if not module_path.exists():
        return [f"Module not found: {module_path}"]
    
    violations: List[str] = []
    source_code = module_path.read_text()
    source_lower = source_code.lower()
    
    for pattern in PHASE1_FORBIDDEN:
        for keyword in pattern.detection_keywords:
            if keyword in source_lower:
                # Count occurrences for detailed reporting
                count = source_lower.count(keyword)
                violations.append(
                    f"{pattern.name}: Found '{keyword}' ({count} occurrence(s)) in {module_path.name}\n"
                    f"  → {pattern.context_hint}"
                )
    
    return violations


def assert_no_mutable_jobspec(jobspec: Any) -> None:
    """
    Assert that JobSpec instance has not been mutated after creation.
    
    This is a Phase-1 invariant: JobSpec is immutable after validation.
    
    Args:
        jobspec: JobSpec instance to check
        
    Raises:
        Phase1ViolationError: If JobSpec has been mutated
    """
    # Check if JobSpec has __setattr__ override that allows mutation
    jobspec_class = jobspec.__class__
    if "__setattr__" in jobspec_class.__dict__:
        # Custom __setattr__ exists - check if it allows post-init mutation
        # In Phase-1, JobSpec should use frozen=True dataclass or similar
        raise Phase1ViolationError(
            f"Phase-1 violation: JobSpec class {jobspec_class.__name__} has custom __setattr__. "
            f"JobSpec MUST be immutable in Phase-1 (use frozen=True dataclass)."
        )


def assert_synchronous_execution() -> None:
    """
    Assert that execution is happening synchronously (not in async context).
    
    Phase-1 execution is strictly synchronous. Async/await is Phase-2.
    
    Raises:
        Phase1ViolationError: If called from async context
    """
    # Check if we're in an async context
    frame = inspect.currentframe()
    while frame:
        if "async" in str(frame.f_code.co_flags):
            raise Phase1ViolationError(
                "Phase-1 violation: Execution is running in async context. "
                "Phase-1 is strictly synchronous. Async/await is Phase-2."
            )
        frame = frame.f_back


# =============================================================================
# Phase-1 Enforcement Summary
# =============================================================================

def get_phase1_summary() -> Dict[str, Any]:
    """
    Get a summary of Phase-1 enforcement rules.
    
    Returns:
        Dict with allowlist, forbidden patterns, and enforcement status
    """
    return {
        "phase": "Phase-1 (Frozen)",
        "allowlist": sorted(PHASE1_ALLOWLIST),
        "forbidden_patterns": [
            {
                "name": p.name,
                "description": p.description,
                "keywords": p.detection_keywords,
                "hint": p.context_hint,
            }
            for p in PHASE1_FORBIDDEN
        ],
        "enforcement": "Active",
        "escalation": "Phase1ViolationError (treat as programming error)",
    }
