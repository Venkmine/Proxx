"""
Monitoring-specific errors.

Read-only monitoring should never fail silently.
Explicit error responses for missing data or unavailable state.
"""


class MonitoringError(Exception):
    """Base exception for monitoring operations."""
    pass


class JobNotFoundError(MonitoringError):
    """Raised when a requested job ID does not exist."""
    
    def __init__(self, job_id: str):
        self.job_id = job_id
        super().__init__(f"Job not found: {job_id}")


class ReportsNotAvailableError(MonitoringError):
    """Raised when reports are requested but not yet available."""
    
    def __init__(self, job_id: str, reason: str):
        self.job_id = job_id
        self.reason = reason
        super().__init__(f"Reports not available for job {job_id}: {reason}")
