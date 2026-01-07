"""
Immutable report data models.

Reports are derived from Job/ClipTask state at completion time.
These models do NOT modify or persist job state—they are read-only views.
"""

from datetime import datetime
from typing import List, Optional, Dict, Any

from pydantic import BaseModel, ConfigDict, Field

from app.jobs.models import Job, ClipTask, JobStatus, TaskStatus


class ExecutionEventSummary(BaseModel):
    """
    Immutable execution event for reporting.
    
    Simplified view of ExecutionEvent for diagnostics.
    """
    
    model_config = ConfigDict(extra="forbid")
    
    event_type: str  # ExecutionEventType value
    timestamp: str  # ISO format timestamp
    clip_id: Optional[str] = None
    message: Optional[str] = None


class ClipReport(BaseModel):
    """
    Immutable report for a single clip task.
    
    Derived from ClipTask at report generation time.
    Contains execution outcome and metadata.
    """

    model_config = ConfigDict(extra="forbid")

    # Identity
    task_id: str
    source_path: str

    # Outcome
    status: TaskStatus
    failure_reason: Optional[str] = None
    warnings: List[str] = Field(default_factory=list)

    # Execution metadata (derived from ExecutionResult)
    output_path: Optional[str] = None
    output_size_bytes: Optional[int] = None
    execution_duration_seconds: Optional[float] = None

    # Timing
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    @classmethod
    def from_task(
        cls,
        task: ClipTask,
        output_path: Optional[str] = None,
        output_size_bytes: Optional[int] = None,
        execution_duration_seconds: Optional[float] = None,
    ) -> "ClipReport":
        """
        Create ClipReport from ClipTask.

        Additional execution metadata (output_path, size, duration) must be
        passed explicitly from ExecutionResult—they are not stored on ClipTask.
        """
        return cls(
            task_id=task.id,
            source_path=task.source_path,
            status=task.status,
            failure_reason=task.failure_reason,
            warnings=task.warnings.copy(),
            output_path=output_path,
            output_size_bytes=output_size_bytes,
            execution_duration_seconds=execution_duration_seconds,
            started_at=task.started_at,
            completed_at=task.completed_at,
        )


class DiagnosticsInfo(BaseModel):
    """
    System and environment diagnostics captured at report time.
    
    Includes Proxx version, Python/OS versions, Resolve info, FFmpeg capabilities,
    execution policy explanation, execution outcome classification, and execution
    event timeline.
    """

    model_config = ConfigDict(extra="forbid")

    # Proxx
    proxx_version: str

    # System
    python_version: str
    os_version: str
    hostname: str

    # Resolve
    resolve_path: Optional[str] = None
    resolve_version: Optional[str] = None
    resolve_studio: Optional[bool] = None

    # FFmpeg capabilities (detection only, does not affect execution)
    ffmpeg_capabilities: Optional[Dict[str, Any]] = None

    # Execution policy (read-only explanation, does not affect execution)
    execution_policy: Optional[Dict[str, Any]] = None

    # Execution outcome (read-only classification, does not affect execution)
    execution_outcome: Optional[Dict[str, Any]] = None
    
    # Execution event timeline (QC observability)
    execution_events: List[ExecutionEventSummary] = Field(default_factory=list)

    # Timestamp
    generated_at: datetime = Field(default_factory=datetime.now)


class JobReport(BaseModel):
    """
    Immutable report for an entire job.
    
    Derived from Job at completion time.
    Contains job outcome, all clip reports, and diagnostics.
    """

    model_config = ConfigDict(extra="forbid")

    # Identity
    job_id: str

    # Outcome
    status: JobStatus

    # Timing
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    # Summary counts
    total_clips: int
    completed_clips: int
    failed_clips: int
    skipped_clips: int
    warnings_count: int

    # Details
    clips: List[ClipReport] = Field(default_factory=list)
    diagnostics: DiagnosticsInfo

    @classmethod
    def from_job(cls, job: Job, diagnostics: DiagnosticsInfo) -> "JobReport":
        """
        Create JobReport from Job.

        ClipReports must be constructed with execution metadata (output paths,
        durations) derived from ExecutionResult objects. This method only
        captures what's already stored on Job/ClipTask.
        
        For complete reports with output paths and durations, use a higher-level
        factory that has access to ExecutionResult data.
        """
        clips = [ClipReport.from_task(task) for task in job.tasks]

        return cls(
            job_id=job.id,
            status=job.status,
            created_at=job.created_at,
            started_at=job.started_at,
            completed_at=job.completed_at,
            total_clips=job.total_clips,
            completed_clips=job.completed_clips,
            failed_clips=job.failed_clips,
            skipped_clips=job.skipped_clips,
            warnings_count=job.warnings_count,
            clips=clips,
            diagnostics=diagnostics,
        )

    def duration_seconds(self) -> Optional[float]:
        """Calculate total job duration in seconds."""
        if self.started_at is None or self.completed_at is None:
            return None
        delta = self.completed_at - self.started_at
        return delta.total_seconds()
