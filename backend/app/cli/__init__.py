"""
CLI control surface for explicit operator job control.

Phase 13: Operator Control & Intent Surfaces

Provides explicit commands for job lifecycle management:
- resume: Resume RECOVERY_REQUIRED or PAUSED jobs
- retry: Retry only FAILED clips
- cancel: Cancel running jobs
- rebind: Rebind presets to jobs

No automatic recovery. No guessing. Only explicit operator intent.
"""

from .commands import (
    resume_job,
    retry_failed_clips,
    cancel_job,
    rebind_preset,
)
from .errors import CLIError, ValidationError, ConfirmationDenied

__all__ = [
    "resume_job",
    "retry_failed_clips",
    "cancel_job",
    "rebind_preset",
    "CLIError",
    "ValidationError",
    "ConfirmationDenied",
]
