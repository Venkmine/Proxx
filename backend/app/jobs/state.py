"""
State transition validation for jobs and tasks.

GOLDEN PATH: Strictly enforces single-clip workflow.
Job lifecycle: PENDING → RUNNING → COMPLETED | FAILED
No pause, recovery, or cancellation allowed.

INVARIANT: Terminal job states (COMPLETED, COMPLETED_WITH_WARNINGS, FAILED, CANCELLED)
are immutable. Once a job enters a terminal state, no state transition is allowed.
Polling, refresh, or UI re-render must never regress a terminal state to RUNNING.
"""

from typing import FrozenSet, Set, Tuple
from .models import JobStatus, TaskStatus
from .errors import InvalidStateTransitionError


# ============================================================================
# TERMINAL STATE INVARIANT
# ============================================================================
# Once a job reaches any of these states, it MUST NOT transition to any other state.
# This is enforced at multiple layers:
#   1. state.py: is_job_terminal() and can_transition_job() block illegal transitions
#   2. engine.py: compute_job_status() returns current status for terminal jobs
#   3. Frontend: fetchJobs() preserves terminal states from prior state
# ============================================================================
TERMINAL_JOB_STATES: FrozenSet[JobStatus] = frozenset({
    JobStatus.COMPLETED,
    JobStatus.COMPLETED_WITH_WARNINGS,
    JobStatus.FAILED,
    JobStatus.CANCELLED,
})


def is_job_terminal(status: JobStatus) -> bool:
    """
    Check if a job status is terminal (immutable).
    
    Terminal states represent completed execution and must never change.
    
    Args:
        status: The job status to check
        
    Returns:
        True if the status is terminal, False otherwise
    """
    return status in TERMINAL_JOB_STATES


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
# ============================================================================
# V1 INTENTIONAL OMISSION: No retry, no requeue, no pause transitions
# ============================================================================
# Why: Retry/requeue creates complex state machine edge cases (what if retry
# fails? what if user cancels during retry? what if preset changed?). The v1
# model is simple: create job → run → done. Failed? Create a new job.
#
# If you are about to add FAILED→QUEUED or PAUSED→RUNNING, stop and read
# DECISIONS.md.
# ============================================================================
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
    
    INVARIANT: Terminal states cannot transition to any other state.
    
    Args:
        from_status: Current job status
        to_status: Target job status
        
    Returns:
        True if the transition is allowed, False otherwise
    """
    # Allow staying in same state (idempotent operations)
    if from_status == to_status:
        return True
    
    # INVARIANT: Terminal states are immutable — no transitions allowed
    if is_job_terminal(from_status):
        return False
    
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
