"""
Query layer for read-only job state access.

Wraps JobRegistry operations and filesystem scanning for reports.
All operations are strictly read-only.

Phase 16: Includes metadata extraction for clip display.
"""

from typing import List, Optional
from pathlib import Path
import logging

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

logger = logging.getLogger(__name__)


def _extract_clip_metadata(source_path: str) -> dict:
    """
    Extract metadata from a source file for UI display.
    
    Phase 16: Uses ffprobe-based extraction from metadata module.
    Returns empty dict fields if extraction fails (graceful degradation).
    
    Args:
        source_path: Absolute path to source media file
        
    Returns:
        Dict with keys: resolution, codec, frame_rate, duration, audio_channels, color_space
    """
    result = {
        "resolution": None,
        "codec": None,
        "frame_rate": None,
        "duration": None,
        "audio_channels": None,
        "color_space": None,
    }
    
    try:
        from app.metadata.extractors import extract_metadata
        
        path = Path(source_path)
        if not path.exists():
            return result
        
        metadata = extract_metadata(source_path)
        
        if metadata:
            # Resolution
            if metadata.image:
                result["resolution"] = f"{metadata.image.width}x{metadata.image.height}"
            
            # Codec
            if metadata.codec:
                codec_name = metadata.codec.codec_name.upper()
                profile = metadata.codec.profile or ""
                if profile:
                    result["codec"] = f"{codec_name} {profile}"
                else:
                    result["codec"] = codec_name
            
            # Frame rate
            if metadata.time:
                fps = metadata.time.frame_rate
                # Format common frame rates nicely
                if abs(fps - 23.976) < 0.01:
                    result["frame_rate"] = "23.976 fps"
                elif abs(fps - 29.97) < 0.01:
                    result["frame_rate"] = "29.97 fps"
                elif abs(fps - 59.94) < 0.01:
                    result["frame_rate"] = "59.94 fps"
                elif fps == int(fps):
                    result["frame_rate"] = f"{int(fps)} fps"
                else:
                    result["frame_rate"] = f"{fps:.3f} fps"
            
            # Duration
            if metadata.time:
                total_seconds = metadata.time.duration_seconds
                hours = int(total_seconds // 3600)
                minutes = int((total_seconds % 3600) // 60)
                seconds = int(total_seconds % 60)
                result["duration"] = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
            
            # Audio channels
            if metadata.audio:
                ch = metadata.audio.channel_count
                if ch == 1:
                    result["audio_channels"] = "Mono"
                elif ch == 2:
                    result["audio_channels"] = "Stereo"
                elif ch == 6:
                    result["audio_channels"] = "5.1"
                elif ch == 8:
                    result["audio_channels"] = "7.1"
                else:
                    result["audio_channels"] = f"{ch}ch"
            
            # Color space (from image bit depth or profile hints)
            # This is a best-effort extraction
            if metadata.image and metadata.image.bit_depth:
                bit_depth = metadata.image.bit_depth
                if bit_depth >= 10:
                    result["color_space"] = f"{bit_depth}-bit"
                    
    except Exception as e:
        # Graceful degradation - log but don't fail
        logger.debug(f"Metadata extraction failed for {source_path}: {e}")
    
    return result


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
    
    Includes all clip task details, timestamps, outcome information,
    and media metadata for UI display.
    
    Phase 16: Extracts metadata on demand for each clip.
    
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
    
    task_details = []
    for task in job.tasks:
        # Phase 16.1: Use metadata stored on task from ingest time
        # This avoids re-extracting metadata on every API call
        resolution = None
        if task.width and task.height:
            resolution = f"{task.width}x{task.height}"
        
        # Format duration
        duration = None
        if task.duration:
            total_seconds = task.duration
            hours = int(total_seconds // 3600)
            minutes = int((total_seconds % 3600) // 60)
            seconds = int(total_seconds % 60)
            duration = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
        
        # Format frame rate
        frame_rate = None
        if task.frame_rate:
            frame_rate = f"{task.frame_rate} fps"
        
        # Format audio channels
        audio_channels = None
        if task.audio_channels:
            ch = task.audio_channels
            if ch == 1:
                audio_channels = "Mono"
            elif ch == 2:
                audio_channels = "Stereo"
            elif ch == 6:
                audio_channels = "5.1"
            elif ch == 8:
                audio_channels = "7.1"
            else:
                audio_channels = f"{ch}ch"
        
        task_details.append(ClipTaskDetail(
            id=task.id,
            source_path=task.source_path,
            status=task.status,
            started_at=task.started_at,
            completed_at=task.completed_at,
            output_path=task.output_path,  # Phase 16.1: Include output path
            progress_percent=task.progress_percent,  # Phase 16.4: Progress
            eta_seconds=task.eta_seconds,  # Phase 16.4: ETA
            failure_reason=task.failure_reason,
            warnings=task.warnings,
            resolution=resolution,
            codec=task.codec,
            frame_rate=frame_rate,
            duration=duration,
            audio_channels=audio_channels,
            color_space=None,  # Not extracted at ingest currently
            thumbnail=task.thumbnail,  # Phase 20: Thumbnail preview
        ))
    
    # Trust Stabilisation: Build settings summary for queue export intent visibility
    settings_summary = None
    settings_dict = getattr(job, 'settings_dict', None)
    if settings_dict:
        # Extract codec and container from video settings
        video_settings = settings_dict.get('video', {})
        codec = video_settings.get('codec')
        container = settings_dict.get('file', {}).get('container')
        
        # Extract resolution from video settings
        resolution_policy = video_settings.get('resolution_policy')
        custom_width = video_settings.get('custom_width')
        custom_height = video_settings.get('custom_height')
        
        resolution = None
        if resolution_policy == 'source':
            resolution = 'Source'
        elif resolution_policy == 'custom' and custom_width and custom_height:
            resolution = f"{custom_width}×{custom_height}"
        elif resolution_policy and resolution_policy != 'source':
            resolution = resolution_policy.replace('_', ' ').title()
        
        # Get preset name if available
        preset_name = getattr(job, 'source_preset_name', None)
        
        settings_summary = {
            'preset_name': preset_name or 'Manual',
            'codec': codec,
            'container': container,
            'resolution': resolution,
        }
    
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
        tasks=task_details,
        settings_summary=settings_summary,  # Trust Stabilisation: Export intent visibility
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
