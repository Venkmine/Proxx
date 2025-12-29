"""
Fabric Data Models - Immutable representations of ingested facts.

These models represent WHAT HAPPENED, not WHAT SHOULD HAPPEN.

Rules:
------
- Fabric NEVER stores mutable execution state
- Fabric NEVER reinterprets results
- Missing data remains missing (no inference)
- Fields map directly to JobExecutionResult structure
- No derived fields unless explicitly marked as computed
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import List, Literal, Optional


@dataclass(frozen=True)
class IngestedOutput:
    """
    Immutable record of a single output file produced during job execution.
    
    Maps to ClipExecutionResult in JobExecutionResult.
    Records only facts that were observed during execution.
    """
    
    job_id: str
    """Job that produced this output."""
    
    clip_id: str
    """Computed identifier: hash of source_path for this output."""
    
    source_path: str
    """Source media file that was processed."""
    
    output_path: str
    """Absolute path where output was written (or should have been)."""
    
    output_exists: bool
    """Whether output file existed after execution."""
    
    output_size_bytes: Optional[int]
    """Size of output file in bytes. None if file doesn't exist."""
    
    status: Literal["COMPLETED", "FAILED"]
    """Clip-level status."""
    
    failure_reason: Optional[str] = None
    """Human-readable failure reason if status is FAILED."""
    
    engine_used: Optional[str] = None
    """Execution engine: 'ffmpeg' or 'resolve'. None if execution never started."""
    
    proxy_profile_used: Optional[str] = None
    """Proxy profile ID used. None if execution never started."""
    
    resolve_preset_used: Optional[str] = None
    """Resolve preset name. Only set when engine_used='resolve'."""
    
    # FORBIDDEN: Do not add fields like:
    # - should_retry
    # - recommended_action
    # - health_score
    # - inferred_status


@dataclass(frozen=True)
class IngestedJob:
    """
    Immutable record of a job execution.
    
    Maps to JobExecutionResult.
    Records only facts observed at ingestion time.
    
    Fabric does NOT:
    - Interpret failure causes
    - Suggest next actions
    - Compute health metrics
    - Infer missing data
    """
    
    job_id: str
    """JobSpec job_id that was executed."""
    
    final_status: Literal["COMPLETED", "FAILED", "PARTIAL"]
    """
    Job-level status:
    - COMPLETED: All clips completed successfully
    - FAILED: At least one clip failed
    - PARTIAL: Execution stopped before all clips (e.g., validation error)
    """
    
    started_at: datetime
    """When job execution started (UTC)."""
    
    canonical_proxy_profile: Optional[str] = None
    """Canonical proxy profile ID used for this job. None if not set."""
    
    fingerprint: Optional[str] = None
    """
    Output fingerprint if job completed successfully.
    None if job failed or fingerprint not calculated.
    
    FUTURE: Phase 2 will populate this from verification results.
    For Phase 1, this field remains None.
    """
    
    validation_stage: Optional[str] = None
    """Stage where validation failed: 'pre-job' | 'validation' | 'execution' | None."""
    
    validation_error: Optional[str] = None
    """Validation error message if job failed before execution."""
    
    engine_used: Optional[str] = None
    """Execution engine: 'ffmpeg' or 'resolve'. None if execution never started."""
    
    resolve_preset_used: Optional[str] = None
    """Resolve preset name. Only set when engine_used='resolve'."""
    
    jobspec_version: Optional[str] = None
    """JobSpec schema version. Enables postmortem auditing."""
    
    completed_at: Optional[datetime] = None
    """When job execution completed (UTC)."""
    
    ingested_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    """When Fabric ingested this result (UTC). NOT part of execution data."""
    
    total_clips: int = 0
    """Total number of clips in this job."""
    
    completed_clips: int = 0
    """Number of clips that completed successfully."""
    
    failed_clips: int = 0
    """Number of clips that failed."""
    
    outputs: List[IngestedOutput] = field(default_factory=list)
    """Per-clip outputs in execution order."""
    
    # FORBIDDEN: Do not add fields like:
    # - retry_count
    # - next_action
    # - failure_severity
    # - success_probability
    # - recommended_profile
    
    @property
    def duration_seconds(self) -> Optional[float]:
        """Computed: execution duration in seconds."""
        if self.completed_at is None:
            return None
        return (self.completed_at - self.started_at).total_seconds()
    
    @property
    def success(self) -> bool:
        """Computed: whether entire job was successful."""
        return self.final_status == "COMPLETED" and self.failed_clips == 0
