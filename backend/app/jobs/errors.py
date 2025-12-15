"""
Job-specific error types.

All errors inherit from JobError for easy catching.
Errors are explicit and provide actionable messages.
"""


class JobError(Exception):
    """Base exception for all job-related failures."""
    pass


class JobNotFoundError(JobError):
    """Raised when a job cannot be found in the registry."""
    
    def __init__(self, job_id: str):
        self.job_id = job_id
        super().__init__(f"Job not found: {job_id}")


class InvalidStateTransitionError(JobError):
    """Raised when attempting an illegal state transition."""
    
    def __init__(self, entity_type: str, current_state: str, target_state: str):
        self.entity_type = entity_type
        self.current_state = current_state
        self.target_state = target_state
        super().__init__(
            f"Invalid {entity_type} state transition: "
            f"{current_state} -> {target_state}"
        )


class JobEngineError(JobError):
    """Raised when the job engine itself encounters a failure."""
    
    def __init__(self, job_id: str, reason: str):
        self.job_id = job_id
        self.reason = reason
        super().__init__(f"Job engine failure for job {job_id}: {reason}")
