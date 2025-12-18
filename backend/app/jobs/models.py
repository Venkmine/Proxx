"""
Job and ClipTask data models.

Represents jobs and their constituent clip tasks.
Jobs are collections of independent clip tasks.
One clip failing must never block other clips.

All models use Pydantic for validation.
State transitions are validated externally (see state.py).

Phase 16: Engine binding at JOB level only (not clip level).
"""

import uuid
from datetime import datetime
from enum import Enum
from typing import Optional, List, TYPE_CHECKING
from pydantic import BaseModel, ConfigDict, Field

if TYPE_CHECKING:
    from ..execution.base import EngineType


class JobStatus(str, Enum):
    """
    Job-level status.
    
    A job moves through these states as its clips are processed.
    """
    
    PENDING = "pending"  # Created, not yet started
    RUNNING = "running"  # At least one clip is being processed
    PAUSED = "paused"  # Paused by user, can be resumed
    COMPLETED = "completed"  # All clips completed, no failures or warnings
    COMPLETED_WITH_WARNINGS = "completed_with_warnings"  # All clips terminal, some failed/skipped/warned
    FAILED = "failed"  # Job engine itself cannot continue
    RECOVERY_REQUIRED = "recovery_required"  # Process restarted mid-execution, requires explicit resume
    CANCELLED = "cancelled"  # Phase 13: Cancelled by operator (terminal)


class TaskStatus(str, Enum):
    """
    Clip task status.
    
    Each clip moves independently through these states.
    """
    
    QUEUED = "queued"  # Waiting to be processed
    RUNNING = "running"  # Currently being processed
    COMPLETED = "completed"  # Successfully completed
    SKIPPED = "skipped"  # Skipped (e.g., source file offline, unsupported)
    FAILED = "failed"  # Failed during processing


class ClipTask(BaseModel):
    """
    A single clip processing task.
    
    Represents one source file to be processed as part of a job.
    Each task has its own independent state and outcome.
    """
    
    model_config = ConfigDict(extra="forbid")
    
    # Identity
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    source_path: str  # Absolute path to source file (not validated at creation)
    
    # State
    status: TaskStatus = TaskStatus.QUEUED
    
    # Execution metadata
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    # Output
    # Phase 16.4: output_path is resolved ONCE before render and stored here
    # Engine receives this path verbatim - never recomputed
    output_path: Optional[str] = None  # Absolute path to output file
    output_filename: Optional[str] = None  # Resolved filename without extension
    
    # Phase 16.4: Progress tracking (0.0 - 100.0)
    progress_percent: float = 0.0
    eta_seconds: Optional[float] = None  # Estimated time remaining
    
    # Outcome
    failure_reason: Optional[str] = None  # Set when status is FAILED or SKIPPED
    warnings: List[str] = Field(default_factory=list)  # Non-blocking warnings
    
    # Future-proofing (stub only, no behavior)
    retry_count: int = 0
    
    # Media metadata (populated at ingest, Phase 16.1)
    width: Optional[int] = None
    height: Optional[int] = None
    codec: Optional[str] = None
    frame_rate: Optional[str] = None
    duration: Optional[float] = None  # Duration in seconds
    audio_channels: Optional[int] = None
    audio_sample_rate: Optional[int] = None


class Job(BaseModel):
    """
    A batch processing job containing multiple clip tasks.
    
    Jobs orchestrate independent clip tasks.
    Job status is derived from aggregate task states.
    
    Phase 16: Engine binding at JOB level.
    All clips in a job use the SAME engine. No mixed-engine jobs.
    """
    
    model_config = ConfigDict(extra="forbid")
    
    # Identity
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    
    # Phase 16: Engine binding (explicit, no default, no inference)
    # Engine is set at job creation and cannot be changed
    engine: Optional[str] = None  # EngineType value: "ffmpeg" or "resolve"
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.now)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    # State
    status: JobStatus = JobStatus.PENDING
    
    # Phase 16.4: Job settings (output dir, naming, watermark)
    # Stored as dict for Pydantic compatibility, accessed via property
    settings_dict: Dict[str, Any] = Field(default_factory=dict)
    
    @property
    def settings(self) -> JobSettings:
        """Get JobSettings from stored dict."""
        if not self.settings_dict:
            return DEFAULT_JOB_SETTINGS
        return JobSettings.from_dict(self.settings_dict)
    
    def update_settings(self, new_settings: JobSettings) -> None:
        """
        Update job settings.
        
        Phase 16.4: Settings are ONLY editable while job.status == PENDING.
        Once any clip enters RUNNING, settings are frozen.
        
        Raises:
            ValueError: If job is not in PENDING state
        """
        if self.status != JobStatus.PENDING:
            raise ValueError(
                f"Job settings cannot be modified after render has started. "
                f"Current status: {self.status.value}"
            )
        self.settings_dict = new_settings.to_dict()
    
    # Clip tasks
    tasks: List[ClipTask] = Field(default_factory=list)
    
    # Summary counts (computed from tasks)
    @property
    def total_tasks(self) -> int:
        """Total number of clip tasks."""
        return len(self.tasks)
    
    @property
    def completed_count(self) -> int:
        """Number of successfully completed tasks."""
        return sum(1 for task in self.tasks if task.status == TaskStatus.COMPLETED)
    
    @property
    def skipped_count(self) -> int:
        """Number of skipped tasks."""
        return sum(1 for task in self.tasks if task.status == TaskStatus.SKIPPED)
    
    @property
    def failed_count(self) -> int:
        """Number of failed tasks."""
        return sum(1 for task in self.tasks if task.status == TaskStatus.FAILED)
    
    @property
    def warning_count(self) -> int:
        """Number of tasks with warnings (regardless of completion status)."""
        return sum(1 for task in self.tasks if task.warnings)
    
    @property
    def running_count(self) -> int:
        """Number of currently running tasks."""
        return sum(1 for task in self.tasks if task.status == TaskStatus.RUNNING)
    
    @property
    def queued_count(self) -> int:
        """Number of queued tasks."""
        return sum(1 for task in self.tasks if task.status == TaskStatus.QUEUED)
