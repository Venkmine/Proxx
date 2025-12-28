"""
Observability module for Proxx.

V1 Observability Hardening Pass: Provides execution tracing, invariant enforcement,
and browse logging for debugging and audit purposes.

This module does NOT:
- Add retries
- Refactor UI layout
- Fix bugs silently
- Add new features

It ONLY adds:
- Execution traces (one immutable file per job run)
- Hard invariants that fail loudly
- Browse event logging
- Preview resolution disclosure
"""

from .trace import JobExecutionTrace, TraceManager
from .invariants import (
    assert_naming_resolved,
    assert_output_file_exists,
    NamingInvariantViolation,
    CompletionInvariantViolation,
)
from .browse_log import BrowseEventLog, BrowseEvent

__all__ = [
    "JobExecutionTrace",
    "TraceManager",
    "assert_naming_resolved",
    "assert_output_file_exists",
    "NamingInvariantViolation",
    "CompletionInvariantViolation",
    "BrowseEventLog",
    "BrowseEvent",
]
