"""
State transition validation for jobs and tasks.

PHASE 9B: Separate Job Creation, Queueing, and Execution
=========================================================
Job lifecycle: DRAFT → QUEUED → RUNNING → COMPLETED | FAILED

STATE MACHINE ENFORCEMENT:
- DRAFT → QUEUED: Allowed (Add to Queue)
- DRAFT → RUNNING: BLOCKED (must queue first)
- QUEUED → RUNNING: Only with execution_requested=True
- RUNNING → QUEUED: BLOCKED (no going back)
- RUNNING → PAUSED: Allowed

INVARIANT: Terminal job states (COMPLETED, FAILED, CANCELLED)
are immutable. Once a job enters a terminal state, no state transition is allowed.
Polling, refresh, or UI re-render must never regress a terminal state to RUNNING.

Note: COMPLETED_WITH_WARNINGS was intentionally removed in V1.
Jobs with warnings but successful output → COMPLETED.
Jobs with failures or missing output → FAILED.
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
#
# V1: COMPLETED_WITH_WARNINGS removed. Use COMPLETED or FAILED only.
# ============================================================================
TERMINAL_JOB_STATES: FrozenSet[JobStatus] = frozenset({
    JobStatus.COMPLETED,
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


# PHASE 9B: Legal job state transitions (strict)
# ============================================================================
# CRITICAL: Execution requires explicit user action via execution_requested flag.
# QUEUED → RUNNING is only allowed when execution_requested=True (checked externally).
# ============================================================================
_JOB_TRANSITIONS: Set[Tuple[JobStatus, JobStatus]] = {
    # Phase 9B: Create Job produces DRAFT
    # Add to Queue transitions DRAFT → QUEUED
    (JobStatus.DRAFT, JobStatus.QUEUED),
    
    # Phase 9B: Start execution (with execution_requested=True check done externally)
    (JobStatus.QUEUED, JobStatus.RUNNING),
    
    # Legacy: PENDING is an alias for QUEUED
    (JobStatus.PENDING, JobStatus.RUNNING),
    
    # Terminal states from RUNNING only
    (JobStatus.RUNNING, JobStatus.COMPLETED),
    (JobStatus.RUNNING, JobStatus.FAILED),
    
    # Phase 9B: Cancellation allowed from DRAFT, QUEUED, and RUNNING
    (JobStatus.DRAFT, JobStatus.CANCELLED),
    (JobStatus.QUEUED, JobStatus.CANCELLED),
    (JobStatus.RUNNING, JobStatus.CANCELLED),
    
    # Pause/resume (if supported)
    (JobStatus.RUNNING, JobStatus.PAUSED),
    (JobStatus.PAUSED, JobStatus.RUNNING),
    
    # REMOVED: DRAFT → RUNNING (violates Phase 9B - must queue first)
    # REMOVED: COMPLETED_WITH_WARNINGS - simplify to COMPLETED or FAILED
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


# ============================================================================
# PHASE 9B: Execution Request Validation
# ============================================================================

def can_execute_job(job_status: JobStatus, execution_requested: bool) -> bool:
    """
    Check if a job can transition to RUNNING.
    
    PHASE 9B HARD RULES:
    - Job MUST be in QUEUED state (or legacy PENDING)
    - execution_requested MUST be True
    - If either condition fails, execution is BLOCKED
    
    Args:
        job_status: Current job status
        execution_requested: Whether user explicitly requested execution
        
    Returns:
        True if execution is allowed, False otherwise
    """
    # Only QUEUED (or legacy PENDING) jobs can start execution
    if job_status not in (JobStatus.QUEUED, JobStatus.PENDING):
        return False
    
    # Execution MUST be explicitly requested
    if not execution_requested:
        return False
    
    return True


def validate_execution_request(job_status: JobStatus, execution_requested: bool) -> None:
    """
    Validate that a job can be executed.
    
    Args:
        job_status: Current job status
        execution_requested: Whether user explicitly requested execution
        
    Raises:
        InvalidStateTransitionError: If execution is not allowed
    """
    if job_status == JobStatus.DRAFT:
        raise InvalidStateTransitionError(
            "job", 
            job_status.value, 
            JobStatus.RUNNING.value,
            reason="Job is in DRAFT state. Add to Queue first before starting."
        )
    
    if job_status not in (JobStatus.QUEUED, JobStatus.PENDING):
        raise InvalidStateTransitionError(
            "job", 
            job_status.value, 
            JobStatus.RUNNING.value,
            reason=f"Job must be QUEUED to start execution. Current state: {job_status.value}"
        )
    
    if not execution_requested:
        raise InvalidStateTransitionError(
            "job", 
            job_status.value, 
            JobStatus.RUNNING.value,
            reason="Execution not requested. Press Start to begin execution."
        )
