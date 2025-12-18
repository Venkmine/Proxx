"""
Execution pipeline for clip rendering.

Phase 6: Single-clip execution (Resolve legacy).
Phase 16: Execution engine abstraction (FFmpeg first).

Engine orchestration and selection at job level.
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

# Phase 16: Execution engines
from .base import (
    EngineType,
    EngineCapability,
    ExecutionEngine,
    EngineNotAvailableError,
    EngineValidationError,
    EngineExecutionError,
)
from .ffmpeg import FFmpegEngine
from .resolve import ResolveEngine
from .engine_registry import EngineRegistry, get_engine_registry
from .scheduler import Scheduler, get_scheduler

__all__ = [
    # Legacy errors
    "ExecutionError",
    "PreFlightCheckError",
    "ResolveExecutionError",
    "OutputVerificationError",
    # Results
    "ExecutionResult",
    "ExecutionStatus",
    # Legacy runner
    "execute_single_clip",
    # Phase 16: Engine types
    "EngineType",
    "EngineCapability",
    "ExecutionEngine",
    "EngineNotAvailableError",
    "EngineValidationError",
    "EngineExecutionError",
    # Engine implementations
    "FFmpegEngine",
    "ResolveEngine",
    # Registry and scheduler
    "EngineRegistry",
    "get_engine_registry",
    "Scheduler",
    "get_scheduler",
]
