"""
Query layer for read-only job state access.

Wraps JobRegistry operations and filesystem scanning for reports.
All operations are strictly read-only.
"""

from typing import List, Optional
from app.jobs.registry import JobRegistry
from app.jobs.models import Job
from .models import (
    JobSummary,
    JobDetail,
    ClipTaskDetail,
    JobReportsResponse,
    ReportReference,
    JobListResponse
)
from .errors import JobNotFoundError, ReportsNotAvailableError
from .utils import find_job_reports, format_report_reference


def get_job_summaries(registry: JobRegistry) -> JobListResponse:
    """
    Retrieve summaries of all jobs in the registry.
    
    Jobs are sorted by creation time, newest first.
    
    Args:
        registry: The JobRegistry to query
        
    Returns:
        JobListResponse containing all job summaries
    """
    jobs = registry.list_jobs()
    
    summaries = [
        JobSummary(
            id=job.id,
            status=job.status,
            created_at=job.created_at,
            started_at=job.started_at,
            completed_at=job.completed_at,
            total_tasks=job.total_tasks,
            completed_count=job.completed_count,
            failed_count=job.failed_count,
            skipped_count=job.skipped_count,
            running_count=job.running_count,
            queued_count=job.queued_count,
            warning_count=job.warning_count
        )
        for job in jobs
    ]
    
    return JobListResponse(
        jobs=summaries,
        total_count=len(summaries)
    )


def get_job_detail(registry: JobRegistry, job_id: str) -> JobDetail:
    """
    Retrieve detailed information about a specific job.
    
    Includes all clip task details, timestamps, and outcome information.
    
    Args:
        registry: The JobRegistry to query
        job_id: The ID of the job to retrieve
        
    Returns:
        JobDetail with complete job and task information
        
    Raises:
        JobNotFoundError: If the job ID does not exist
    """
    job = registry.get_job(job_id)
    
    if job is None:
        raise JobNotFoundError(job_id)
    
    task_details = [
        ClipTaskDetail(
            id=task.id,
            source_path=task.source_path,
            status=task.status,
            started_at=task.started_at,
            completed_at=task.completed_at,
            failure_reason=task.failure_reason,
            warnings=task.warnings
        )
        for task in job.tasks
    ]
    
    return JobDetail(
        id=job.id,
        status=job.status,
        created_at=job.created_at,
        started_at=job.started_at,
        completed_at=job.completed_at,
        total_tasks=job.total_tasks,
        completed_count=job.completed_count,
        failed_count=job.failed_count,
        skipped_count=job.skipped_count,
        running_count=job.running_count,
        queued_count=job.queued_count,
        warning_count=job.warning_count,
        tasks=task_details
    )


def get_job_reports(registry: JobRegistry, job_id: str, output_dir: Optional[str] = None) -> JobReportsResponse:
    """
    Retrieve references to all report files for a specific job.
    
    Scans the filesystem for report artifacts matching the job ID pattern.
    Does not verify that the job has completed or validate report contents.
    
    Args:
        registry: The JobRegistry to query (for job existence verification)
        job_id: The ID of the job whose reports to retrieve
        output_dir: The directory to search for reports (defaults to current working directory)
        
    Returns:
        JobReportsResponse with references to all matching report files
        
    Raises:
        JobNotFoundError: If the job ID does not exist in the registry
    """
    # Verify job exists
    job = registry.get_job(job_id)
    if job is None:
        raise JobNotFoundError(job_id)
    
    # Scan filesystem for matching reports
    report_files = find_job_reports(job_id, output_dir)
    
    # Convert to references
    references = [
        ReportReference(**format_report_reference(file_path))
        for file_path in report_files
    ]
    
    return JobReportsResponse(
        job_id=job_id,
        reports=references
    )
