"""
Execution pipeline for clip rendering.

Awaire Proxy uses FFmpeg as its sole execution engine.

DaVinci Resolve integration is QUARANTINED in backend/_future/
and is not active in this release.
"""

from .errors import (
    ExecutionError,
    PreFlightCheckError,
    OutputVerificationError,
)
from .results import (
    ExecutionResult,
    ExecutionStatus,
)

# Execution engines
from .base import (
    EngineType,
    EngineCapability,
    ExecutionEngine,
    EngineNotAvailableError,
    EngineValidationError,
    EngineExecutionError,
)
from .ffmpeg import FFmpegEngine
from .engine_registry import EngineRegistry, get_engine_registry
from .scheduler import Scheduler, get_scheduler

__all__ = [
    # Errors
    "ExecutionError",
    "PreFlightCheckError",
    "OutputVerificationError",
    # Results
    "ExecutionResult",
    "ExecutionStatus",
    # Engine types
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
