"""
V2 Execute Endpoint — Thin Client JobSpec Execution

This module provides the POST /v2/execute_jobspec endpoint that:
1. Accepts a JobSpec JSON payload from the UI
2. Validates using JobSpec.validate()
3. Executes using the existing headless executor
4. Returns JobExecutionResult JSON

Design principles:
- UI is a compiler, not authority
- No queues, no async workers
- Synchronous execution
- Truth comes from JobExecutionResult

V2 Step 3: UI as JobSpec Compiler (Thin Client)
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict
from typing import List, Optional
import logging
import sys
import os

# Add backend root to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from job_spec import JobSpec, JobSpecValidationError, FpsMode
from headless_execute import execute_multi_job_spec
from execution_results import JobExecutionResult

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v2", tags=["v2"])


# ============================================================================
# Request/Response Models
# ============================================================================

class JobSpecRequest(BaseModel):
    """
    Request model for JobSpec execution.
    
    Maps directly to JobSpec fields. The UI compiles settings into this format.
    """
    
    model_config = ConfigDict(extra="forbid")
    
    sources: List[str]
    """Ordered list of absolute paths to source media files."""
    
    output_directory: str
    """Absolute path to output directory for proxies."""
    
    codec: str
    """Video codec for proxy encoding (e.g., 'prores_proxy', 'h264')."""
    
    container: str
    """Container format (e.g., 'mov', 'mp4')."""
    
    resolution: str
    """Target resolution (e.g., '1920x1080', 'half', 'quarter', 'same')."""
    
    naming_template: str
    """Template string for output file naming."""
    
    proxy_profile: str
    """Proxy profile ID (e.g., 'h264_1080p', 'prores_proxy_720p')."""
    
    job_id: Optional[str] = None
    """Optional job ID (auto-generated if not provided)."""
    
    fps_mode: str = "same-as-source"
    """Frame rate handling mode ('same-as-source' or 'explicit')."""
    
    fps_explicit: Optional[float] = None
    """Explicit frame rate value (required if fps_mode is 'explicit')."""


class ClipResultResponse(BaseModel):
    """Response model for per-clip execution result."""
    
    source_path: str
    resolved_output_path: str
    ffmpeg_command: List[str]
    exit_code: int
    output_exists: bool
    output_size_bytes: Optional[int]
    status: str  # "COMPLETED" or "FAILED"
    failure_reason: Optional[str]
    started_at: str
    completed_at: Optional[str]
    duration_seconds: Optional[float]


class JobExecutionResultResponse(BaseModel):
    """Response model for job execution result."""
    
    job_id: str
    final_status: str  # "COMPLETED", "FAILED", or "PARTIAL"
    clips: List[ClipResultResponse]
    started_at: str
    completed_at: Optional[str]
    duration_seconds: Optional[float]
    total_clips: int
    completed_clips: int
    failed_clips: int


# ============================================================================
# Endpoint
# ============================================================================

@router.post("/execute_jobspec", response_model=JobExecutionResultResponse)
async def execute_jobspec(request: JobSpecRequest):
    """
    Execute a JobSpec synchronously and return the result.
    
    V2 Step 3: UI as JobSpec Compiler
    ---------------------------------
    This endpoint receives a JobSpec compiled by the UI, validates it,
    executes it using the headless executor, and returns the authoritative
    JobExecutionResult.
    
    The UI shows "Encoding..." while waiting, then displays the result.
    No progress percent or ETA - just honest status.
    
    Args:
        request: JobSpec JSON payload from the UI
        
    Returns:
        JobExecutionResultResponse with all clip results
        
    Raises:
        HTTPException 400: If JobSpec validation fails
        HTTPException 500: If execution fails unexpectedly
    """
    logger.info(f"V2 execute_jobspec received: {len(request.sources)} sources")
    
    # Step 1: Convert request to JobSpec
    try:
        fps_mode = FpsMode(request.fps_mode) if request.fps_mode else FpsMode.SAME_AS_SOURCE
    except ValueError:
        fps_mode = FpsMode.SAME_AS_SOURCE
    
    job_spec_kwargs = {
        "sources": request.sources,
        "output_directory": request.output_directory,
        "codec": request.codec,
        "container": request.container,
        "resolution": request.resolution,
        "naming_template": request.naming_template,
        "proxy_profile": request.proxy_profile,
        "fps_mode": fps_mode,
        "fps_explicit": request.fps_explicit,
    }
    
    if request.job_id:
        job_spec_kwargs["job_id"] = request.job_id
    
    job_spec = JobSpec(**job_spec_kwargs)
    
    # Step 2: Validate JobSpec
    try:
        job_spec.validate(check_paths=True)
        logger.info(f"V2 JobSpec validated: job_id={job_spec.job_id}")
    except JobSpecValidationError as e:
        logger.warning(f"V2 JobSpec validation failed: {e}")
        raise HTTPException(
            status_code=400,
            detail={
                "error": "JobSpec validation failed",
                "message": str(e),
                "job_id": job_spec.job_id,
            }
        )
    
    # Step 3: Execute using headless executor (synchronous)
    try:
        logger.info(f"V2 executing JobSpec: job_id={job_spec.job_id}")
        result: JobExecutionResult = execute_multi_job_spec(job_spec)
        logger.info(f"V2 execution complete: job_id={job_spec.job_id}, status={result.final_status}")
    except Exception as e:
        logger.error(f"V2 execution failed unexpectedly: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Execution failed",
                "message": str(e),
                "job_id": job_spec.job_id,
            }
        )
    
    # Step 4: Convert result to response model
    clips_response = [
        ClipResultResponse(
            source_path=clip.source_path,
            resolved_output_path=clip.resolved_output_path,
            ffmpeg_command=clip.ffmpeg_command,
            exit_code=clip.exit_code,
            output_exists=clip.output_exists,
            output_size_bytes=clip.output_size_bytes,
            status=clip.status,
            failure_reason=clip.failure_reason,
            started_at=clip.started_at.isoformat(),
            completed_at=clip.completed_at.isoformat() if clip.completed_at else None,
            duration_seconds=clip.duration_seconds,
        )
        for clip in result.clips
    ]
    
    return JobExecutionResultResponse(
        job_id=result.job_id,
        final_status=result.final_status,
        clips=clips_response,
        started_at=result.started_at.isoformat(),
        completed_at=result.completed_at.isoformat() if result.completed_at else None,
        duration_seconds=result.duration_seconds,
        total_clips=len(result.clips),
        completed_clips=sum(1 for c in result.clips if c.status == "COMPLETED"),
        failed_clips=sum(1 for c in result.clips if c.status == "FAILED"),
    )
