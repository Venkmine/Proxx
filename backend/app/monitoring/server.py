"""
Monitoring server endpoints.

Read-only HTTP API for job state visibility.
Intended for trusted LAN access by assistants and TechOps.

Phase 9 scope: Observation only, no control operations.
"""

from fastapi import APIRouter, HTTPException, Request
from typing import Optional
from .models import (
    HealthResponse,
    JobListResponse,
    JobDetail,
    JobReportsResponse
)
from .queries import (
    get_job_summaries,
    get_job_detail,
    get_job_reports
)
from .errors import JobNotFoundError, ReportsNotAvailableError


router = APIRouter(prefix="/monitor", tags=["monitoring"])


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Health check endpoint.
    
    Returns:
        Simple status indicator
    """
    return HealthResponse(status="ok")


@router.get("/jobs", response_model=JobListResponse)
async def list_jobs(request: Request):
    """
    List all known jobs with summary information.
    
    Jobs are sorted by creation time, newest first.
    Includes high-level status and progress counts.
    
    Returns:
        JobListResponse containing all job summaries
    """
    registry = request.app.state.job_registry
    return get_job_summaries(registry)


@router.get("/jobs/{job_id}", response_model=JobDetail)
async def get_job(job_id: str, request: Request):
    """
    Retrieve detailed information about a specific job.
    
    Includes complete job metadata, all clip task details,
    timestamps, and outcome information.
    
    Args:
        job_id: The UUID of the job to retrieve
        
    Returns:
        JobDetail with complete job state
        
    Raises:
        404: If the job ID does not exist
    """
    registry = request.app.state.job_registry
    
    try:
        return get_job_detail(registry, job_id)
    except JobNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/jobs/{job_id}/reports", response_model=JobReportsResponse)
async def get_job_reports_endpoint(job_id: str, request: Request, output_dir: Optional[str] = None):
    """
    Retrieve references to all report files for a specific job.
    
    Scans the filesystem for report artifacts (CSV, JSON, TXT).
    Returns empty list if no reports have been generated yet.
    
    Args:
        job_id: The UUID of the job whose reports to retrieve
        output_dir: Optional directory to search (defaults to current working directory)
        
    Returns:
        JobReportsResponse with references to all matching report files
        
    Raises:
        404: If the job ID does not exist
    """
    registry = request.app.state.job_registry
    
    try:
        return get_job_reports(registry, job_id, output_dir)
    except JobNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
