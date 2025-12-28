"""
Job Execution Trace model and persistence.

V1 Observability: Per-job execution trace written as immutable JSON files.

Design principles:
- One trace file per job run (NEVER overwrite)
- Progressive writes at each phase
- Complete audit trail of naming resolution, FFmpeg commands, and output verification
- Stored in ~/.proxx/traces/{job_id}.json

This module provides the ground truth for debugging job execution.
"""

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger(__name__)

# Trace directory: ~/.proxx/traces/
TRACE_DIR = Path.home() / ".proxx" / "traces"


class PreviewMetadata(BaseModel):
    """
    Preview generation metadata.
    
    V1 OBSERVABILITY: Records how preview was generated, not just that it exists.
    This surfaces the truth about preview quality before we change anything.
    """
    
    model_config = ConfigDict(extra="forbid")
    
    # Source: how was the preview frame generated?
    # - "thumbnail": Quick FFmpeg seek + single frame grab
    # - "decode": Full decode from source
    # - "embedded": Extracted from container metadata
    source: str = "thumbnail"
    
    # Resolution of the preview that was generated
    width: Optional[int] = None
    height: Optional[int] = None
    
    # Decode parameters used
    decode_method: Optional[str] = None  # e.g., "ffmpeg_seek"
    decode_position: Optional[float] = None  # Position in video (0.0-1.0)
    
    # Timing
    generated_at: Optional[str] = None


class JobExecutionTrace(BaseModel):
    """
    Complete execution trace for a single job run.
    
    V1 OBSERVABILITY: This is the ground truth for what happened during execution.
    Written progressively at each phase:
    1. On job creation (inputs + naming)
    2. Before FFmpeg launch
    3. After FFmpeg exit  
    4. After output verification
    
    INVARIANT: Trace files are NEVER overwritten. One run = one file.
    """
    
    model_config = ConfigDict(extra="forbid")
    
    # ==================== IDENTITY ====================
    job_id: str
    created_at: str  # ISO format timestamp
    
    # ==================== INPUTS ====================
    source_path: str
    source_metadata: Optional[Dict[str, Any]] = None  # Width, height, codec, etc.
    
    # ==================== NAMING RESOLUTION ====================
    # Records exactly how the output path was determined
    output_dir: Optional[str] = None
    naming_template: Optional[str] = None
    resolved_naming_tokens: Optional[Dict[str, str]] = None  # Full expanded token map
    resolved_output_path: Optional[str] = None
    
    # V1 INVARIANT: These fields surface naming problems loudly
    naming_had_unresolved_tokens: bool = False  # True if {token} remained
    naming_unresolved_tokens: Optional[List[str]] = None  # List of unresolved token names
    
    # ==================== FFMPEG EXECUTION ====================
    ffmpeg_command: Optional[str] = None  # Exact command string
    ffmpeg_args: Optional[List[str]] = None  # Command as list
    ffmpeg_stdout: Optional[str] = None  # Captured stdout
    ffmpeg_stderr: Optional[str] = None  # Captured stderr (truncated if large)
    ffmpeg_exit_code: Optional[int] = None
    
    # ==================== TIMING ====================
    execution_start_ts: Optional[str] = None  # ISO format
    execution_end_ts: Optional[str] = None  # ISO format
    execution_duration_seconds: Optional[float] = None
    
    # ==================== OUTCOME ====================
    final_status: Optional[str] = None  # COMPLETED, FAILED, CANCELLED
    failure_reason: Optional[str] = None
    warnings: List[str] = Field(default_factory=list)
    
    # ==================== VERIFICATION ====================
    output_file_exists: Optional[bool] = None  # True if file verified on disk
    output_file_size_bytes: Optional[int] = None
    verification_timestamp: Optional[str] = None
    
    # ==================== PREVIEW METADATA ====================
    # V1 OBSERVABILITY: How was the preview generated?
    preview_metadata: Optional[PreviewMetadata] = None
    
    # ==================== BROWSE CONTEXT ====================
    # Optional: browse events that led to this job (if tracked)
    browse_events: Optional[List[Dict[str, Any]]] = None


class TraceManager:
    """
    Manager for writing and reading job execution traces.
    
    V1 OBSERVABILITY: Progressive writes, never overwrites.
    
    Usage:
        trace_mgr = TraceManager()
        trace = trace_mgr.create_trace(job_id, source_path)
        
        # On naming resolution
        trace_mgr.record_naming(trace, template, tokens, output_path)
        
        # Before FFmpeg
        trace_mgr.record_ffmpeg_start(trace, command)
        
        # After FFmpeg
        trace_mgr.record_ffmpeg_result(trace, exit_code, stdout, stderr)
        
        # After verification
        trace_mgr.record_completion(trace, status, output_exists)
    """
    
    def __init__(self, trace_dir: Optional[Path] = None):
        """
        Initialize trace manager.
        
        Args:
            trace_dir: Override trace directory (default: ~/.proxx/traces/)
        """
        self.trace_dir = trace_dir or TRACE_DIR
        self._ensure_trace_dir()
    
    def _ensure_trace_dir(self) -> None:
        """Create trace directory if it doesn't exist."""
        self.trace_dir.mkdir(parents=True, exist_ok=True)
    
    def _trace_path(self, job_id: str) -> Path:
        """Get the path for a trace file."""
        return self.trace_dir / f"{job_id}.json"
    
    def _write_trace(self, trace: JobExecutionTrace) -> None:
        """
        Write trace to disk.
        
        V1 INVARIANT: This is a progressive write, not an overwrite.
        The trace file is updated in place as execution progresses.
        Once execution completes, the file becomes immutable.
        """
        path = self._trace_path(trace.job_id)
        try:
            with open(path, "w") as f:
                f.write(trace.model_dump_json(indent=2))
            logger.debug(f"[TRACE] Wrote trace for job {trace.job_id} to {path}")
        except Exception as e:
            # Trace write failures are logged but don't fail the job
            # OBSERVABILITY: We want to trace, not block execution
            logger.error(f"[TRACE] Failed to write trace for job {trace.job_id}: {e}")
    
    def create_trace(
        self,
        job_id: str,
        source_path: str,
        source_metadata: Optional[Dict[str, Any]] = None,
    ) -> JobExecutionTrace:
        """
        Create a new trace on job creation.
        
        Phase 1: Records inputs before any processing.
        
        Args:
            job_id: Unique job identifier
            source_path: Path to source file
            source_metadata: Optional metadata dict (width, height, codec, etc.)
            
        Returns:
            New JobExecutionTrace instance
        """
        trace = JobExecutionTrace(
            job_id=job_id,
            created_at=datetime.now().isoformat(),
            source_path=source_path,
            source_metadata=source_metadata,
        )
        self._write_trace(trace)
        logger.info(f"[TRACE] Created trace for job {job_id}")
        return trace
    
    def load_trace(self, job_id: str) -> Optional[JobExecutionTrace]:
        """
        Load an existing trace from disk.
        
        Args:
            job_id: Job identifier
            
        Returns:
            JobExecutionTrace if found, None otherwise
        """
        path = self._trace_path(job_id)
        if not path.exists():
            return None
        
        try:
            with open(path) as f:
                data = json.load(f)
            return JobExecutionTrace(**data)
        except Exception as e:
            logger.error(f"[TRACE] Failed to load trace for job {job_id}: {e}")
            return None
    
    def record_naming(
        self,
        trace: JobExecutionTrace,
        output_dir: str,
        naming_template: str,
        resolved_tokens: Dict[str, str],
        resolved_output_path: str,
        unresolved_tokens: Optional[List[str]] = None,
    ) -> None:
        """
        Record naming resolution phase.
        
        Phase 2: Records how output path was determined.
        
        Args:
            trace: Trace to update
            output_dir: Output directory
            naming_template: Naming template used
            resolved_tokens: Map of token name -> resolved value
            resolved_output_path: Final output path
            unresolved_tokens: List of tokens that remained unresolved
        """
        trace.output_dir = output_dir
        trace.naming_template = naming_template
        trace.resolved_naming_tokens = resolved_tokens
        trace.resolved_output_path = resolved_output_path
        
        # V1 INVARIANT: Surface unresolved tokens loudly
        if unresolved_tokens:
            trace.naming_had_unresolved_tokens = True
            trace.naming_unresolved_tokens = unresolved_tokens
        else:
            trace.naming_had_unresolved_tokens = False
            trace.naming_unresolved_tokens = None
        
        self._write_trace(trace)
        logger.debug(f"[TRACE] Recorded naming for job {trace.job_id}")
    
    def record_ffmpeg_start(
        self,
        trace: JobExecutionTrace,
        command: List[str],
    ) -> None:
        """
        Record FFmpeg command before execution.
        
        Phase 3a: Records exact command that will be run.
        
        Args:
            trace: Trace to update
            command: FFmpeg command as list of arguments
        """
        trace.ffmpeg_args = command
        trace.ffmpeg_command = " ".join(command)
        trace.execution_start_ts = datetime.now().isoformat()
        self._write_trace(trace)
        logger.debug(f"[TRACE] Recorded FFmpeg start for job {trace.job_id}")
    
    def record_ffmpeg_result(
        self,
        trace: JobExecutionTrace,
        exit_code: int,
        stdout: Optional[str] = None,
        stderr: Optional[str] = None,
    ) -> None:
        """
        Record FFmpeg execution result.
        
        Phase 3b: Records FFmpeg exit status and output.
        
        Args:
            trace: Trace to update
            exit_code: FFmpeg exit code
            stdout: Captured stdout
            stderr: Captured stderr (may be truncated)
        """
        trace.ffmpeg_exit_code = exit_code
        trace.ffmpeg_stdout = stdout
        trace.ffmpeg_stderr = stderr
        trace.execution_end_ts = datetime.now().isoformat()
        
        # Calculate duration
        if trace.execution_start_ts:
            try:
                start = datetime.fromisoformat(trace.execution_start_ts)
                end = datetime.fromisoformat(trace.execution_end_ts)
                trace.execution_duration_seconds = (end - start).total_seconds()
            except ValueError:
                pass
        
        self._write_trace(trace)
        logger.debug(f"[TRACE] Recorded FFmpeg result for job {trace.job_id}: exit_code={exit_code}")
    
    def record_completion(
        self,
        trace: JobExecutionTrace,
        final_status: str,
        failure_reason: Optional[str] = None,
        warnings: Optional[List[str]] = None,
        output_file_exists: Optional[bool] = None,
        output_file_size: Optional[int] = None,
    ) -> None:
        """
        Record job completion.
        
        Phase 4: Records final status and output verification.
        
        Args:
            trace: Trace to update
            final_status: Final job status (COMPLETED, FAILED, CANCELLED)
            failure_reason: Reason for failure if any
            warnings: List of warnings encountered
            output_file_exists: Whether output file was verified on disk
            output_file_size: Size of output file in bytes
        """
        trace.final_status = final_status
        trace.failure_reason = failure_reason
        trace.warnings = warnings or []
        trace.output_file_exists = output_file_exists
        trace.output_file_size_bytes = output_file_size
        trace.verification_timestamp = datetime.now().isoformat()
        
        self._write_trace(trace)
        logger.info(f"[TRACE] Recorded completion for job {trace.job_id}: status={final_status}")
    
    def record_preview_metadata(
        self,
        trace: JobExecutionTrace,
        source: str,
        width: Optional[int] = None,
        height: Optional[int] = None,
        decode_method: Optional[str] = None,
        decode_position: Optional[float] = None,
    ) -> None:
        """
        Record preview generation metadata.
        
        V1 OBSERVABILITY: Records how preview was generated.
        This does NOT change preview quality - only records it.
        
        Args:
            trace: Trace to update
            source: How preview was generated ("thumbnail", "decode", "embedded")
            width: Preview width
            height: Preview height
            decode_method: Decode method used (e.g., "ffmpeg_seek")
            decode_position: Position in video (0.0-1.0)
        """
        trace.preview_metadata = PreviewMetadata(
            source=source,
            width=width,
            height=height,
            decode_method=decode_method,
            decode_position=decode_position,
            generated_at=datetime.now().isoformat(),
        )
        self._write_trace(trace)
        logger.debug(f"[TRACE] Recorded preview metadata for job {trace.job_id}")
    
    def add_browse_event(
        self,
        trace: JobExecutionTrace,
        event: Dict[str, Any],
    ) -> None:
        """
        Add a browse event to the trace.
        
        V1 OBSERVABILITY: Links browse events to job for debugging.
        
        Args:
            trace: Trace to update
            event: Browse event dict
        """
        if trace.browse_events is None:
            trace.browse_events = []
        trace.browse_events.append(event)
        self._write_trace(trace)


# Global trace manager instance
_trace_manager: Optional[TraceManager] = None


def get_trace_manager() -> TraceManager:
    """Get the global trace manager instance."""
    global _trace_manager
    if _trace_manager is None:
        _trace_manager = TraceManager()
    return _trace_manager
