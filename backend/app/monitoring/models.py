"""
Response models for monitoring API.

All responses are read-only views of job state and reports.
Models are optimized for remote visibility, not control.
"""

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict
from app.jobs.models import JobStatus, TaskStatus, DeliveryStage


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
    Phase 16: Includes media metadata for UI display.
    Phase 16.1: Includes output_path for Reveal in Finder.
    Phase 16.4: Includes progress_percent and eta_seconds for live progress.
    Phase 20: Includes thumbnail preview, encode_fps, and phase.
    """
    
    model_config = ConfigDict(extra="forbid")
    
    # Identity
    id: str
    source_path: str
    
    # State
    status: TaskStatus
    
    # Phase H: Delivery progress stage for honest progress
    delivery_stage: DeliveryStage = DeliveryStage.QUEUED
    
    # Timestamps
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    # Output (Phase 16.1)
    output_path: Optional[str] = None  # Absolute path to rendered output
    
    # Phase 16.4: Progress tracking
    progress_percent: float = 0.0  # 0.0 - 100.0
    eta_seconds: Optional[float] = None  # Estimated seconds remaining
    
    # Phase 20: Enhanced progress
    encode_fps: Optional[float] = None  # Current encoding speed (frames per second)
    phase: Optional[str] = None  # PREPARING | ENCODING | FINALIZING
    
    # Outcome
    failure_reason: Optional[str] = None
    warnings: List[str]
    
    # Phase 16: Media metadata for UI display
    resolution: Optional[str] = None       # e.g., "1920x1080"
    codec: Optional[str] = None            # e.g., "ProRes 422 HQ"
    frame_rate: Optional[str] = None       # e.g., "23.976 fps"
    duration: Optional[str] = None         # e.g., "00:02:35"
    audio_channels: Optional[str] = None   # e.g., "stereo" or "5.1"
    color_space: Optional[str] = None      # e.g., "Rec. 709"
    
    # Phase 20: Thumbnail preview
    thumbnail: Optional[str] = None  # Base64 data URI


class JobDetail(BaseModel):
    """
    Detailed view of a job including all clip tasks.
    
    Provides complete visibility into job state for monitoring.
    Trust Stabilisation: Includes settings summary for queue export intent visibility.
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
    
    # Trust Stabilisation: Settings summary for queue export intent visibility
    # Shows what will be produced, not just that a job exists
    settings_summary: Optional[dict] = None  # {preset_name, codec, container, resolution}
    
    # FFmpeg Capabilities (detection only, read-only)
    ffmpeg_capabilities: Optional[dict] = None  # {hwaccels, encoders, prores_gpu_supported}
    
    # Execution Policy (read-only explanation, V2 only)
    execution_policy: Optional[dict] = None  # {execution_class, blocking_reasons, alternatives}
    
    # Execution Outcome (read-only classification, explains what happened)
    execution_outcome: Optional[dict] = None  # {job_state, failure_types, summary}
    
    # Execution Events Timeline (QC observability)
    execution_events: Optional[List[dict]] = None  # [{event_type, timestamp, clip_id, message}]


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
