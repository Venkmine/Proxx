"""
Job engine: orchestration for batch media processing.

This module manages job lifecycle and clip task state.
It does NOT execute transcoding or call Resolve.

Phase 4 scope:
- Job and ClipTask data models
- State transitions and validation
- In-memory job tracking
- Orchestration logic (no execution)

Not included:
- Actual transcoding or Resolve integration (Phase 5+)
- Job persistence (Phase 6+)
- Watch folders or scheduling
- UI integration
"""

from .errors import (
    JobError,
    JobNotFoundError,
    InvalidStateTransitionError,
)
from .models import (
    JobStatus,
    TaskStatus,
    ClipTask,
    Job,
)
from .state import (
    can_transition_job,
    can_transition_task,
)
from .engine import JobEngine
from .registry import JobRegistry

__all__ = [
    # Errors
    "JobError",
    "JobNotFoundError",
    "InvalidStateTransitionError",
    # Models
    "JobStatus",
    "TaskStatus",
    "ClipTask",
    "Job",
    # State validation
    "can_transition_job",
    "can_transition_task",
    # Engine
    "JobEngine",
    # Registry
    "JobRegistry",
]
