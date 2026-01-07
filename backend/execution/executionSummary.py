"""
Execution Summary Generation and Export

Deterministic, read-only extraction of execution artifacts for debugging, handoff, and archival.

This module provides self-contained execution summaries that explain what happened
during a job's execution without requiring the Proxx UI or access to the database.

Design Principles (INTENT.md compliant):
----------------------------------------
- READ-ONLY: Does not modify job state or execution behavior
- DETERMINISTIC: Same job → same summary
- COMPLETE: Contains all essential context for debugging
- HUMAN-READABLE: Plain text format alongside JSON
- NO AUTO-EXPORT: Generated on explicit user request only
- NO TELEMETRY: For local debugging/handoff, not analytics

Summary Contents:
-----------------
1. Job Metadata: ID, creation time, lifecycle state, execution engine(s), preset
2. Inputs: Source files, watch folder (if applicable)
3. Outputs: Output paths, generated files
4. Outcome: Job result (COMPLETE/PARTIAL/FAILED/BLOCKED/CANCELLED), clip counts, failure types
5. Timeline: Ordered execution events from ExecutionEventRecorder
6. Environment: FFmpeg version, execution policy, platform

Export Formats:
---------------
- JSON (authoritative, machine-readable)
- Plain Text (human-readable, suitable for support tickets)
- (Optional future) CSV for clip-level results

Non-Goals:
----------
- Telemetry or analytics
- Automatic export on job completion
- Cloud upload or sharing
- Execution replay or retry logic
"""

from enum import Enum
from datetime import datetime
from typing import List, Optional, Dict, Any
from dataclasses import dataclass, asdict
from pathlib import Path
import json
import platform

from backend.execution.executionEvents import ExecutionEvent, ExecutionEventType
from backend.execution.jobLifecycle import JobLifecycleState, derive_job_lifecycle_state
from backend.execution.failureTypes import ExecutionOutcome, JobOutcomeState, ClipFailureType
from backend.execution.ffmpegCapabilities import detect_ffmpeg_capabilities
from backend.execution.executionPolicy import ExecutionPolicy


class ExportFormat(str, Enum):
    """Export format options."""
    
    JSON = "json"
    """JSON format (authoritative, machine-readable)"""
    
    TEXT = "text"
    """Plain text format (human-readable)"""
    
    CSV = "csv"
    """CSV format (clip-level results, optional)"""


@dataclass
class JobMetadata:
    """Job identification and lifecycle metadata."""
    
    job_id: str
    """Job identifier"""
    
    created_at: str
    """ISO 8601 timestamp of job creation"""
    
    lifecycle_state: str
    """Current lifecycle state (IDLE/QUEUED/RUNNING/COMPLETE/FAILED/etc)"""
    
    execution_engines: List[str]
    """Execution engines used or intended (e.g., ['ffmpeg'], ['resolve'])"""
    
    preset_name: Optional[str] = None
    """Preset name if job was created from preset"""


@dataclass
class JobInputs:
    """Job input sources and configuration."""
    
    source_files: List[str]
    """List of source file paths (may be redacted for privacy)"""
    
    watch_folder_path: Optional[str] = None
    """Watch folder path if job was auto-created"""
    
    watch_folder_preset: Optional[str] = None
    """Watch folder preset name if applicable"""


@dataclass
class JobOutputs:
    """Job output paths and generated files."""
    
    output_directory: str
    """Base output directory"""
    
    generated_files: List[str]
    """List of successfully generated output files"""
    
    failed_outputs: List[str]
    """List of expected outputs that failed to generate"""


@dataclass
class JobOutcomeSummary:
    """Execution outcome summary."""
    
    outcome_state: str
    """Overall outcome (COMPLETE/PARTIAL/FAILED/BLOCKED/CANCELLED)"""
    
    total_clips: int
    """Total number of clips in job"""
    
    success_count: int
    """Number of successfully completed clips"""
    
    failed_count: int
    """Number of failed clips"""
    
    skipped_count: int
    """Number of skipped clips"""
    
    failure_types: List[str]
    """List of unique failure types encountered"""
    
    summary_message: Optional[str] = None
    """Human-readable outcome summary"""


@dataclass
class TimelineEvent:
    """Single timeline event (simplified for export)."""
    
    timestamp: str
    """ISO 8601 timestamp"""
    
    event_type: str
    """Event type name"""
    
    clip_id: Optional[str] = None
    """Clip ID if event is clip-specific"""
    
    message: Optional[str] = None
    """Optional event message"""


@dataclass
class EnvironmentInfo:
    """Execution environment details."""
    
    platform: str
    """Operating system (e.g., 'macOS')"""
    
    ffmpeg_version: Optional[str] = None
    """FFmpeg version string"""
    
    ffmpeg_capabilities: Optional[Dict[str, Any]] = None
    """FFmpeg hardware capabilities detection result"""
    
    execution_policy_summary: Optional[str] = None
    """Execution policy classification (CPU/GPU)"""


@dataclass
class ExecutionSummary:
    """
    Complete execution summary for a job.
    
    This is the authoritative structure for execution artifacts.
    All export formats derive from this structure.
    """
    
    # Core summary components
    metadata: JobMetadata
    inputs: JobInputs
    outputs: JobOutputs
    outcome: JobOutcomeSummary
    timeline: List[TimelineEvent]
    environment: EnvironmentInfo
    
    # Export metadata
    summary_version: str = "1.0"
    """Schema version for forward compatibility"""
    
    generated_at: str = ""
    """ISO 8601 timestamp when summary was generated"""
    
    def __post_init__(self):
        """Set generated_at timestamp if not provided."""
        if not self.generated_at:
            self.generated_at = datetime.now().isoformat()
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return asdict(self)
    
    def to_json(self, indent: int = 2) -> str:
        """
        Export as JSON string.
        
        Args:
            indent: JSON indentation level (default: 2)
            
        Returns:
            Formatted JSON string
        """
        return json.dumps(self.to_dict(), indent=indent, default=str)
    
    def to_text(self) -> str:
        """
        Export as human-readable plain text.
        
        Format designed for support tickets, bug reports, and human review.
        Includes all essential information in a readable structure.
        
        Returns:
            Formatted plain text string
        """
        lines = []
        
        # Header
        lines.append("=" * 80)
        lines.append("PROXX EXECUTION SUMMARY")
        lines.append("=" * 80)
        lines.append("")
        
        # Metadata Section
        lines.append("JOB METADATA")
        lines.append("-" * 80)
        lines.append(f"Job ID:           {self.metadata.job_id}")
        lines.append(f"Created At:       {self.metadata.created_at}")
        lines.append(f"Lifecycle State:  {self.metadata.lifecycle_state}")
        lines.append(f"Execution Engines: {', '.join(self.metadata.execution_engines)}")
        if self.metadata.preset_name:
            lines.append(f"Preset:           {self.metadata.preset_name}")
        lines.append("")
        
        # Inputs Section
        lines.append("INPUTS")
        lines.append("-" * 80)
        lines.append(f"Source Files ({len(self.inputs.source_files)}):")
        for i, source in enumerate(self.inputs.source_files, 1):
            lines.append(f"  {i}. {source}")
        if self.inputs.watch_folder_path:
            lines.append(f"Watch Folder:     {self.inputs.watch_folder_path}")
            if self.inputs.watch_folder_preset:
                lines.append(f"Watch Preset:     {self.inputs.watch_folder_preset}")
        lines.append("")
        
        # Outputs Section
        lines.append("OUTPUTS")
        lines.append("-" * 80)
        lines.append(f"Output Directory: {self.outputs.output_directory}")
        if self.outputs.generated_files:
            lines.append(f"Generated Files ({len(self.outputs.generated_files)}):")
            for i, output in enumerate(self.outputs.generated_files, 1):
                lines.append(f"  {i}. {output}")
        if self.outputs.failed_outputs:
            lines.append(f"Failed Outputs ({len(self.outputs.failed_outputs)}):")
            for i, failed in enumerate(self.outputs.failed_outputs, 1):
                lines.append(f"  {i}. {failed}")
        lines.append("")
        
        # Outcome Section
        lines.append("OUTCOME")
        lines.append("-" * 80)
        lines.append(f"Result:           {self.outcome.outcome_state}")
        lines.append(f"Total Clips:      {self.outcome.total_clips}")
        lines.append(f"Successful:       {self.outcome.success_count}")
        lines.append(f"Failed:           {self.outcome.failed_count}")
        lines.append(f"Skipped:          {self.outcome.skipped_count}")
        if self.outcome.failure_types:
            lines.append(f"Failure Types:    {', '.join(self.outcome.failure_types)}")
        if self.outcome.summary_message:
            lines.append(f"Summary:          {self.outcome.summary_message}")
        lines.append("")
        
        # Timeline Section
        lines.append("TIMELINE")
        lines.append("-" * 80)
        lines.append(f"Events: {len(self.timeline)}")
        for i, event in enumerate(self.timeline, 1):
            timestamp = event.timestamp.split('T')[1][:8] if 'T' in event.timestamp else event.timestamp
            clip_info = f" (clip: {event.clip_id[:8]}...)" if event.clip_id else ""
            message_info = f" - {event.message}" if event.message else ""
            lines.append(f"  {i}. [{timestamp}] {event.event_type}{clip_info}{message_info}")
        lines.append("")
        
        # Environment Section
        lines.append("ENVIRONMENT")
        lines.append("-" * 80)
        lines.append(f"Platform:         {self.environment.platform}")
        if self.environment.ffmpeg_version:
            lines.append(f"FFmpeg Version:   {self.environment.ffmpeg_version}")
        if self.environment.execution_policy_summary:
            lines.append(f"Execution Policy: {self.environment.execution_policy_summary}")
        if self.environment.ffmpeg_capabilities:
            caps = self.environment.ffmpeg_capabilities
            if 'hwaccels' in caps:
                lines.append(f"HW Accelerators:  {', '.join(caps.get('hwaccels', []))}")
            if 'prores_gpu_supported' in caps:
                lines.append(f"ProRes GPU:       {caps['prores_gpu_supported']}")
        lines.append("")
        
        # Footer
        lines.append("-" * 80)
        lines.append(f"Summary Generated: {self.generated_at}")
        lines.append(f"Summary Version:   {self.summary_version}")
        lines.append("=" * 80)
        
        return "\n".join(lines)


def create_execution_summary(
    job_id: str,
    created_at: datetime,
    execution_engines: List[str],
    source_files: List[str],
    output_directory: str,
    execution_events: List[ExecutionEvent],
    execution_outcome: Optional[ExecutionOutcome] = None,
    execution_policy: Optional[ExecutionPolicy] = None,
    preset_name: Optional[str] = None,
    watch_folder_path: Optional[str] = None,
    watch_folder_preset: Optional[str] = None,
    generated_files: Optional[List[str]] = None,
    failed_outputs: Optional[List[str]] = None,
    redact_paths: bool = False,
) -> ExecutionSummary:
    """
    Create execution summary from job data.
    
    This is a pure function that aggregates job data into a complete summary.
    It does not access databases, filesystems, or modify any state.
    
    Args:
        job_id: Job identifier
        created_at: Job creation timestamp
        execution_engines: List of execution engines used
        source_files: List of source file paths
        output_directory: Output directory path
        execution_events: List of execution events (in order)
        execution_outcome: Optional execution outcome summary
        execution_policy: Optional execution policy
        preset_name: Optional preset name
        watch_folder_path: Optional watch folder path
        watch_folder_preset: Optional watch folder preset name
        generated_files: Optional list of successfully generated files
        failed_outputs: Optional list of failed output paths
        redact_paths: If True, redact file paths for privacy (default: False)
        
    Returns:
        Complete ExecutionSummary
    """
    # Derive lifecycle state
    lifecycle_state = derive_job_lifecycle_state(execution_events, execution_outcome)
    
    # Redact paths if requested
    def redact_path(path: str) -> str:
        if not redact_paths:
            return path
        p = Path(path)
        return f"<redacted>/{p.name}"
    
    # Build metadata
    metadata = JobMetadata(
        job_id=job_id,
        created_at=created_at.isoformat(),
        lifecycle_state=lifecycle_state.value,
        execution_engines=execution_engines,
        preset_name=preset_name,
    )
    
    # Build inputs
    inputs = JobInputs(
        source_files=[redact_path(f) for f in source_files],
        watch_folder_path=redact_path(watch_folder_path) if watch_folder_path else None,
        watch_folder_preset=watch_folder_preset,
    )
    
    # Build outputs
    outputs = JobOutputs(
        output_directory=redact_path(output_directory),
        generated_files=[redact_path(f) for f in (generated_files or [])],
        failed_outputs=[redact_path(f) for f in (failed_outputs or [])],
    )
    
    # Build outcome summary
    if execution_outcome:
        outcome = JobOutcomeSummary(
            outcome_state=execution_outcome.job_state.value,
            total_clips=execution_outcome.total_clips,
            success_count=execution_outcome.success_clips,
            failed_count=execution_outcome.failed_clips,
            skipped_count=execution_outcome.skipped_clips,
            failure_types=[ft.value for ft in execution_outcome.failure_types],
            summary_message=execution_outcome.summary,
        )
    else:
        # No outcome yet - derive from events
        outcome = JobOutcomeSummary(
            outcome_state="UNKNOWN",
            total_clips=len(source_files),
            success_count=0,
            failed_count=0,
            skipped_count=0,
            failure_types=[],
            summary_message="Execution in progress or outcome not available",
        )
    
    # Build timeline
    timeline = [
        TimelineEvent(
            timestamp=event.timestamp.isoformat(),
            event_type=event.event_type.value,
            clip_id=event.clip_id,
            message=event.message,
        )
        for event in execution_events
    ]
    
    # Build environment info
    environment = EnvironmentInfo(
        platform=platform.system(),
    )
    
    # Try to detect FFmpeg version and capabilities (non-blocking)
    try:
        ffmpeg_caps = detect_ffmpeg_capabilities()
        environment.ffmpeg_capabilities = ffmpeg_caps
        environment.ffmpeg_version = ffmpeg_caps.get("ffmpeg_version")
    except Exception:
        # Detection failed - not critical for summary
        pass
    
    # Add execution policy summary if available
    if execution_policy:
        environment.execution_policy_summary = f"{execution_policy.execution_class} (engine: {execution_policy.primary_engine})"
    
    return ExecutionSummary(
        metadata=metadata,
        inputs=inputs,
        outputs=outputs,
        outcome=outcome,
        timeline=timeline,
        environment=environment,
    )


def export_execution_summary(
    summary: ExecutionSummary,
    format: ExportFormat = ExportFormat.JSON,
) -> str:
    """
    Export execution summary in specified format.
    
    Args:
        summary: ExecutionSummary to export
        format: Export format (JSON or TEXT)
        
    Returns:
        Formatted string in requested format
        
    Raises:
        ValueError: If format is not supported
    """
    if format == ExportFormat.JSON:
        return summary.to_json()
    elif format == ExportFormat.TEXT:
        return summary.to_text()
    elif format == ExportFormat.CSV:
        raise NotImplementedError("CSV export not yet implemented")
    else:
        raise ValueError(f"Unsupported export format: {format}")
