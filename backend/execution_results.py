"""
V2 Execution Results - Deterministic, auditable execution outcomes.

Part of V2 Phase 1 hardening. These result types provide:
- Clip-level execution tracking
- Job-level aggregation
- Fail-fast semantics
- Deterministic output verification

Guarantees:
-----------
1. Every clip produces exactly one ClipExecutionResult
2. All results contain full command reconstruction data
3. Output verification is mandatory before marking COMPLETED
4. Failures are explicit with reasons
5. No implicit state or side effects
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Literal, Optional
import json


@dataclass
class ClipExecutionResult:
    """
    Result of executing a single clip in a multi-clip job.
    
    Contains all information needed to:
    - Verify successful completion
    - Debug failures
    - Reconstruct what was executed
    - Audit output integrity
    
    This is the atomic unit of execution tracking in V2 Phase 1.
    """
    
    source_path: str
    """Absolute path to source media file that was processed."""
    
    resolved_output_path: str
    """Absolute path where output was (or should have been) written."""
    
    ffmpeg_command: List[str]
    """Complete FFmpeg command that was executed for this clip."""
    
    exit_code: int
    """FFmpeg process exit code (0 = success, non-zero = failure)."""
    
    output_exists: bool
    """Whether output file exists after execution."""
    
    output_size_bytes: Optional[int]
    """Size of output file in bytes (None if file doesn't exist)."""
    
    status: Literal["COMPLETED", "FAILED"]
    """Final status: COMPLETED = success, FAILED = any failure."""
    
    failure_reason: Optional[str] = None
    """Human-readable failure reason (required if status is FAILED)."""
    
    validation_stage: Optional[str] = None
    """Validation stage where failure occurred: 'pre-job' | 'validation' | 'execution' | None if no failure."""
    
    engine_used: Optional[str] = None
    """Execution engine used for this clip: 'ffmpeg' or 'resolve'. None if execution never started."""
    
    proxy_profile_used: Optional[str] = None
    """Proxy profile ID that was used for this clip. None if execution never started."""
    
    resolve_preset_used: Optional[str] = None
    """Resolve preset name used for rendering. Only set when engine_used='resolve', None otherwise."""
    
    started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    """When clip execution started (UTC)."""
    
    completed_at: Optional[datetime] = None
    """When clip execution completed (UTC)."""
    
    @property
    def duration_seconds(self) -> Optional[float]:
        """Calculate execution duration in seconds."""
        if self.completed_at is None:
            return None
        return (self.completed_at - self.started_at).total_seconds()
    
    def to_dict(self) -> dict:
        """Serialize to dictionary for JSON output."""
        return {
            "source_path": self.source_path,
            "resolved_output_path": self.resolved_output_path,
            "ffmpeg_command": self.ffmpeg_command,
            "exit_code": self.exit_code,
            "output_exists": self.output_exists,
            "output_size_bytes": self.output_size_bytes,
            "status": self.status,
            "failure_reason": self.failure_reason,
            "validation_stage": self.validation_stage,
            "engine_used": self.engine_used,
            "proxy_profile_used": self.proxy_profile_used,
            "resolve_preset_used": self.resolve_preset_used,
            "started_at": self.started_at.isoformat(),
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "duration_seconds": self.duration_seconds,
        }
    
    def summary(self) -> str:
        """Concise human-readable summary."""
        duration_str = f" ({self.duration_seconds:.1f}s)" if self.duration_seconds else ""
        source_name = Path(self.source_path).name
        
        if self.status == "COMPLETED":
            return f"[COMPLETED] {source_name}{duration_str} → {self.resolved_output_path}"
        else:
            return f"[FAILED] {source_name}{duration_str} - {self.failure_reason}"


@dataclass
class JobExecutionResult:
    """
    Aggregate result of executing a multi-clip job.
    
    Contains:
    - Per-clip results (ordered)
    - Final job-level status
    - Job timing information
    - Job identification
    
    Semantics:
    ----------
    - clips: MUST preserve execution order
    - final_status: COMPLETED only if ALL clips completed
    - final_status: FAILED if ANY clip failed
    - Partial results: If job stops early, clips list contains only executed clips
    
    This provides complete auditability of what happened during job execution.
    """
    
    job_id: str
    """JobSpec job_id that was executed."""
    
    clips: List[ClipExecutionResult]
    """Per-clip results in execution order."""
    
    final_status: Literal["COMPLETED", "FAILED", "PARTIAL", "SKIPPED"]
    """
    Job-level status:
    - COMPLETED: All clips completed successfully
    - FAILED: At least one clip failed (fail-fast stopped execution)
    - PARTIAL: Execution stopped before all clips (e.g., validation error)
    - SKIPPED: Job was skipped due to environment constraints (e.g., edition mismatch)
    """
    
    jobspec_version: Optional[str] = None
    """JobSpec schema version used for this execution. Enables postmortem auditing."""
    
    validation_error: Optional[str] = None
    """Validation error message if job failed before execution. Enables debugging."""
    
    validation_stage: Optional[str] = None
    """Stage where validation failed: \'pre-job\' | \'validation\' | \'execution\' | None if no validation failure."""
    
    engine_used: Optional[str] = None
    """Execution engine used for this job ('ffmpeg' or 'resolve'). Logged for auditability."""
    
    resolve_preset_used: Optional[str] = None
    """Resolve preset name used for rendering. Only set when engine_used='resolve'."""
    
    proxy_profile_used: Optional[str] = None
    """Proxy profile name used for this job. V2 Step 5: Canonical proxy profiles."""
    
    skip_metadata: Optional[Dict[str, str]] = None
    """Skip metadata if job was skipped (status=SKIPPED). Contains reason, editions, version."""
    
    started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    """When job execution started (UTC)."""
    
    completed_at: Optional[datetime] = None
    """When job execution completed (UTC)."""
    
    @property
    def duration_seconds(self) -> Optional[float]:
        """Calculate total job duration in seconds."""
        if self.completed_at is None:
            return None
        return (self.completed_at - self.started_at).total_seconds()
    
    @property
    def success(self) -> bool:
        """Check if entire job was successful."""
        return self.final_status == "COMPLETED" and all(
            clip.status == "COMPLETED" for clip in self.clips
        )
    
    def to_dict(self) -> dict:
        """Serialize to dictionary for JSON output with _metadata."""
        # Extract source evidence (basenames and extensions)
        source_files = []
        source_extensions = []
        for clip in self.clips:
            basename = Path(clip.source_path).name
            source_files.append(basename)
            ext = Path(clip.source_path).suffix.lower()
            if ext and ext not in source_extensions:
                source_extensions.append(ext)
        
        # Sort for determinism
        source_extensions.sort()
        
        result = {
            "job_id": self.job_id,
            "final_status": self.final_status,
            "clips": [clip.to_dict() for clip in self.clips],
            "started_at": self.started_at.isoformat(),
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "duration_seconds": self.duration_seconds,
            "total_clips": len(self.clips),
            "completed_clips": sum(1 for c in self.clips if c.status == "COMPLETED"),
            "failed_clips": sum(1 for c in self.clips if c.status == "FAILED"),
            "source_files": source_files,
            "source_extensions": source_extensions,
        }
        
        # Include _metadata for postmortem auditing
        result["_metadata"] = {
            "jobspec_version": self.jobspec_version,
            "validation_error": self.validation_error,
            "validation_stage": self.validation_stage,
            "engine_used": self.engine_used,
            "resolve_preset_used": self.resolve_preset_used,
            "proxy_profile_used": self.proxy_profile_used,
            "resolve_edition_detected": None,  # Populated by execution engines
            "resolve_version_detected": None,  # Populated by execution engines
        }
        
        # Include Resolve edition/version if available
        if hasattr(self, '_resolve_metadata'):
            # Map internal keys to standard evidence field names
            if 'resolve_edition' in self._resolve_metadata:
                result["_metadata"]["resolve_edition_detected"] = self._resolve_metadata['resolve_edition']
            if 'resolve_version' in self._resolve_metadata:
                result["_metadata"]["resolve_version_detected"] = self._resolve_metadata['resolve_version']
        
        # Include skip_metadata if job was skipped
        if self.skip_metadata:
            result["skip_metadata"] = self.skip_metadata
        
        return result
    
    def to_json(self, indent: int = 2) -> str:
        """Serialize to JSON string."""
        return json.dumps(self.to_dict(), indent=indent)
    
    def summary(self) -> str:
        """Concise human-readable summary."""
        duration_str = f" ({self.duration_seconds:.1f}s)" if self.duration_seconds else ""
        completed = sum(1 for c in self.clips if c.status == "COMPLETED")
        failed = sum(1 for c in self.clips if c.status == "FAILED")
        
        return (
            f"[{self.final_status}] Job {self.job_id}{duration_str}\n"
            f"  Clips: {completed} completed, {failed} failed (total: {len(self.clips)})"
        )
