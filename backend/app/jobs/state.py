"""
State transition validation for jobs and tasks.

GOLDEN PATH: Strictly enforces single-clip workflow.
Job lifecycle: PENDING → RUNNING → COMPLETED | FAILED
No pause, recovery, or cancellation allowed.
"""

from typing import Set, Tuple
from .models import JobStatus, TaskStatus
from .errors import InvalidStateTransitionError


# GOLDEN PATH: Legal job state transitions (strict)
_JOB_TRANSITIONS: Set[Tuple[JobStatus, JobStatus]] = {
    # Starting a job
    (JobStatus.PENDING, JobStatus.RUNNING),
    
    # REMOVED: Pausing/resuming - violates golden path
    # (JobStatus.RUNNING, JobStatus.PAUSED),
    # (JobStatus.PAUSED, JobStatus.RUNNING),
    # (JobStatus.RECOVERY_REQUIRED, JobStatus.RUNNING),
    
    # Terminal states
    (JobStatus.RUNNING, JobStatus.COMPLETED),
    (JobStatus.RUNNING, JobStatus.FAILED),
    
    # REMOVED: COMPLETED_WITH_WARNINGS - simplify to COMPLETED or FAILED
    # (JobStatus.RUNNING, JobStatus.COMPLETED_WITH_WARNINGS),
    
    # REMOVED: Cancellation - violates golden path
    # (JobStatus.PENDING, JobStatus.CANCELLED),
    # (JobStatus.RUNNING, JobStatus.CANCELLED),
    
    # REMOVED: PAUSED/RECOVERY_REQUIRED transitions - violate golden path
}


# GOLDEN PATH: Legal task state transitions (strict)
_TASK_TRANSITIONS: Set[Tuple[TaskStatus, TaskStatus]] = {
    # Normal execution flow only
    (TaskStatus.QUEUED, TaskStatus.RUNNING),
    (TaskStatus.RUNNING, TaskStatus.COMPLETED),
    (TaskStatus.RUNNING, TaskStatus.FAILED),
    
    # REMOVED: SKIPPED - violates golden path (encode always runs)
    # (TaskStatus.RUNNING, TaskStatus.SKIPPED),
    # (TaskStatus.QUEUED, TaskStatus.SKIPPED),
}


def can_transition_job(from_status: JobStatus, to_status: JobStatus) -> bool:
    """
    Check if a job state transition is legal.
    
    Args:
        from_status: Current job status
        to_status: Target job status
        
    Returns:
        True if the transition is allowed, False otherwise
    """
    # Allow staying in same state (idempotent operations)
    if from_status == to_status:
        return True
    
    return (from_status, to_status) in _JOB_TRANSITIONS


def can_transition_task(from_status: TaskStatus, to_status: TaskStatus) -> bool:
    """
    Check if a task state transition is legal.
    
    Args:
        from_status: Current task status
        to_status: Target task status
        
    Returns:
        True if the transition is allowed, False otherwise
    """
    # Allow staying in same state (idempotent operations)
    if from_status == to_status:
        return True
    
    return (from_status, to_status) in _TASK_TRANSITIONS


def validate_job_transition(from_status: JobStatus, to_status: JobStatus) -> None:
    """
    Validate a job state transition, raising an exception if illegal.
    
    Args:
        from_status: Current job status
        to_status: Target job status
        
    Raises:
        InvalidStateTransitionError: If the transition is not allowed
    """
    if not can_transition_job(from_status, to_status):
        raise InvalidStateTransitionError("job", from_status.value, to_status.value)


def validate_task_transition(from_status: TaskStatus, to_status: TaskStatus) -> None:
    """
    Validate a task state transition, raising an exception if illegal.
    
    Args:
        from_status: Current task status
        to_status: Target task status
        
    Raises:
        InvalidStateTransitionError: If the transition is not allowed
    """
    if not can_transition_task(from_status, to_status):
        raise InvalidStateTransitionError("task", from_status.value, to_status.value)
