"""
Execution pipeline for single-clip rendering.

Phase 6: Single-clip execution only.
No job loops, no task iteration, no engine integration.

Engine orchestration happens in Phase 7.
"""

from .errors import (
    ExecutionError,
    PreFlightCheckError,
    ResolveExecutionError,
    OutputVerificationError,
)
from .results import (
    ExecutionResult,
    ExecutionStatus,
)
from .runner import execute_single_clip

__all__ = [
    "ExecutionError",
    "PreFlightCheckError",
    "ResolveExecutionError",
    "OutputVerificationError",
    "ExecutionResult",
    "ExecutionStatus",
    "execute_single_clip",
]
