"""
Response models for monitoring API.

All responses are read-only views of job state and reports.
Models are optimized for remote visibility, not control.
"""

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict
from app.jobs.models import JobStatus, TaskStatus


class HealthResponse(BaseModel):
    """Response for health check endpoint."""
    
    model_config = ConfigDict(extra="forbid")
    
    status: str = "ok"


class JobSummary(BaseModel):
    """
    Summary view of a job for list endpoints.
    
    Provides high-level status and progress without full task details.
    """
    
    model_config = ConfigDict(extra="forbid")
    
    # Identity
    id: str
    
    # State
    status: JobStatus
    
    # Timestamps
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    # Progress summary
    total_tasks: int
    completed_count: int
    failed_count: int
    skipped_count: int
    running_count: int
    queued_count: int
    warning_count: int


class ClipTaskDetail(BaseModel):
    """
    Detailed view of a single clip task.
    
    Used in job detail responses to show per-clip status.
    """
    
    model_config = ConfigDict(extra="forbid")
    
    # Identity
    id: str
    source_path: str
    
    # State
    status: TaskStatus
    
    # Timestamps
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    # Outcome
    failure_reason: Optional[str] = None
    warnings: List[str]


class JobDetail(BaseModel):
    """
    Detailed view of a job including all clip tasks.
    
    Provides complete visibility into job state for monitoring.
    """
    
    model_config = ConfigDict(extra="forbid")
    
    # Identity
    id: str
    
    # State
    status: JobStatus
    
    # Timestamps
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    # Progress summary
    total_tasks: int
    completed_count: int
    failed_count: int
    skipped_count: int
    running_count: int
    queued_count: int
    warning_count: int
    
    # Task details
    tasks: List[ClipTaskDetail]


class ReportReference(BaseModel):
    """
    Reference to a report file on disk.
    
    Does not contain report content, only metadata for retrieval.
    """
    
    model_config = ConfigDict(extra="forbid")
    
    filename: str
    path: str
    size_bytes: int
    modified_at: float


class JobReportsResponse(BaseModel):
    """
    Response containing references to all report files for a job.
    
    Empty list indicates reports not yet generated.
    """
    
    model_config = ConfigDict(extra="forbid")
    
    job_id: str
    reports: List[ReportReference]


class JobListResponse(BaseModel):
    """
    Response containing a list of job summaries.
    
    Jobs are sorted by creation time, newest first.
    """
    
    model_config = ConfigDict(extra="forbid")
    
    jobs: List[JobSummary]
    total_count: int
