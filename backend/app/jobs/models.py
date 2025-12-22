"""
Job and ClipTask data models.

Represents jobs and their constituent clip tasks.
Jobs are collections of independent clip tasks.
One clip failing must never block other clips.

All models use Pydantic for validation.
State transitions are validated externally (see state.py).

Phase 16: Engine binding at JOB level only (not clip level).
Phase 17: DeliverSettings replaces JobSettings (breaking rename).
"""

import uuid
from datetime import datetime
from enum import Enum
from typing import Optional, List, TYPE_CHECKING, Dict, Any
from pydantic import BaseModel, ConfigDict, Field

if TYPE_CHECKING:
    from ..execution.base import EngineType

# DeliverSettings is the canonical settings type (Phase 17)
# Legacy JobSettings alias maintained in settings.py for migration
from .settings import DeliverSettings, DEFAULT_DELIVER_SETTINGS


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
    
    # Phase 20: Thumbnail preview (base64 data URI)
    thumbnail: Optional[str] = None  # Base64 data URI for preview image


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
    
    # Phase 17: DeliverSettings (output dir, naming, metadata, overlays)
    # Stored as dict for Pydantic compatibility, accessed via property
    # BREAKING RENAME: settings_dict contains DeliverSettings, not JobSettings
    # This is the immutable snapshot taken at job creation
    settings_dict: Dict[str, Any] = Field(default_factory=dict)
    
    # Alpha: Per-job override settings (editable while PENDING)
    # When present, execution uses these instead of settings_dict
    override_settings_dict: Optional[Dict[str, Any]] = None
    
    @property
    def settings_snapshot(self) -> DeliverSettings:
        """Get the immutable settings snapshot from job creation."""
        if not self.settings_dict:
            return DEFAULT_DELIVER_SETTINGS
        # Handle legacy JobSettings format during migration
        if "video" not in self.settings_dict and "naming_template" in self.settings_dict:
            return DeliverSettings.from_legacy_job_settings(self.settings_dict)
        return DeliverSettings.from_dict(self.settings_dict)
    
    @property
    def override_settings(self) -> Optional[DeliverSettings]:
        """Get per-job override settings, if any."""
        if not self.override_settings_dict:
            return None
        return DeliverSettings.from_dict(self.override_settings_dict)
    
    @property
    def effective_settings(self) -> DeliverSettings:
        """Get effective settings: overrides if present, else snapshot."""
        if self.override_settings_dict:
            return DeliverSettings.from_dict(self.override_settings_dict)
        return self.settings_snapshot
    
    @property
    def settings(self) -> DeliverSettings:
        """
        Get effective settings for execution.
        
        Alias for effective_settings - uses overrides if present, else snapshot.
        This is what engines should use.
        """
        return self.effective_settings
    
    def set_override_settings(self, new_settings: DeliverSettings) -> None:
        """
        Set per-job override settings.
        
        Can only be set while job.status == PENDING.
        Does not modify the original settings_snapshot.
        
        Args:
            new_settings: Override settings for this specific job
            
        Raises:
            ValueError: If job is not in PENDING state
        """
        if self.status != JobStatus.PENDING:
            raise ValueError(
                f"Override settings cannot be modified after render has started. "
                f"Current status: {self.status.value}"
            )
        self.override_settings_dict = new_settings.to_dict()
    
    def update_settings(self, new_settings: DeliverSettings) -> None:
        """
        Update job override settings.
        
        Alpha: Modifies override_settings, preserving the original snapshot.
        Settings are ONLY editable while job.status == PENDING.
        Once any clip enters RUNNING, settings are frozen.
        
        BACKEND ENFORCEMENT: This is the authoritative guard.
        UI disabling alone is insufficient.
        
        Raises:
            ValueError: If job is not in PENDING state
        """
        self.set_override_settings(new_settings)
    
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
