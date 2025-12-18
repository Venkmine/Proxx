"""
Control endpoints for explicit operator actions.

Phase 14: HTTP adapter over Phase 13 CLI commands.
Phase 15: Manual job creation and preset listing.

All operations require explicit confirmation from UI.
No automatic actions. No silent mutations.
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict
from typing import Optional, List
import logging
from pathlib import Path

from app.cli.commands import (
    resume_job,
    retry_failed_clips,
    cancel_job,
    rebind_preset
)
from app.cli.errors import ValidationError, ConfirmationDenied
from app.jobs.models import JobStatus, TaskStatus

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/control", tags=["control"])


class RebindPresetRequest(BaseModel):
    """Request body for preset rebinding."""
    
    model_config = ConfigDict(extra="forbid")
    
    preset_id: str


class JobSettingsRequest(BaseModel):
    """
    Job settings for Phase 16.4.
    
    Controls output path, naming, watermark for a job.
    """
    
    model_config = ConfigDict(extra="forbid")
    
    output_dir: Optional[str] = None
    naming_template: str = "{source_name}__proxx"
    file_prefix: Optional[str] = None
    file_suffix: Optional[str] = None
    preserve_source_dirs: bool = False
    preserve_dir_levels: int = 0
    watermark_enabled: bool = False
    watermark_text: Optional[str] = None


class CreateJobRequest(BaseModel):
    """Request body for manual job creation (Phase 15, enhanced in Phase 16)."""
    
    model_config = ConfigDict(extra="forbid")
    
    source_paths: List[str]
    preset_id: str
    output_base_dir: Optional[str] = None  # Deprecated: use settings.output_dir
    engine: str = "ffmpeg"  # Phase 16: Explicit engine binding ("ffmpeg" or "resolve")
    
    # Phase 16.4: Full job settings
    settings: Optional[JobSettingsRequest] = None


class PresetInfo(BaseModel):
    """Preset summary for UI display."""
    
    model_config = ConfigDict(extra="forbid")
    
    id: str
    name: str


class EngineInfo(BaseModel):
    """Engine summary for UI display (Phase 16)."""
    
    model_config = ConfigDict(extra="forbid")
    
    type: str
    name: str
    available: bool


class EngineListResponse(BaseModel):
    """Response for engine listing (Phase 16)."""
    
    model_config = ConfigDict(extra="forbid")
    
    engines: List[EngineInfo]


class PresetListResponse(BaseModel):
    """Response for preset listing."""
    
    model_config = ConfigDict(extra="forbid")
    
    presets: List[PresetInfo]


class CreateJobResponse(BaseModel):
    """Response for job creation."""
    
    model_config = ConfigDict(extra="forbid")
    
    success: bool
    message: str
    job_id: str


class OperationResponse(BaseModel):
    """Generic response for control operations."""
    
    model_config = ConfigDict(extra="forbid")
    
    success: bool
    message: str


@router.get("/presets", response_model=PresetListResponse)
async def list_presets_endpoint(request: Request):
    """
    List all available global presets.
    
    Phase 15: For manual job creation preset selection.
    
    Returns:
        List of preset IDs and names
    """
    try:
        preset_registry = request.app.state.preset_registry
        
        global_presets = preset_registry.list_global_presets()
        
        presets = [
            PresetInfo(id=preset_id, name=preset.name)
            for preset_id, preset in global_presets.items()
        ]
        
        # Sort by name for consistent UI display
        presets.sort(key=lambda p: p.name.lower())
        
        return PresetListResponse(presets=presets)
        
    except Exception as e:
        logger.error(f"Failed to list presets: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list presets: {e}")


@router.get("/engines", response_model=EngineListResponse)
async def list_engines_endpoint(request: Request):
    """
    List all available execution engines.
    
    Phase 16: For manual job creation engine selection.
    
    Returns:
        List of engines with availability status
    """
    try:
        engine_registry = request.app.state.engine_registry
        
        engine_list = engine_registry.list_engines()
        
        engines = [
            EngineInfo(
                type=e["type"],
                name=e["name"],
                available=e["available"],
            )
            for e in engine_list
        ]
        
        # Sort by name, available first
        engines.sort(key=lambda e: (not e.available, e.name.lower()))
        
        return EngineListResponse(engines=engines)
        
    except Exception as e:
        logger.error(f"Failed to list engines: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list presets: {e}")


@router.post("/jobs/create", response_model=CreateJobResponse)
async def create_job_endpoint(body: CreateJobRequest, request: Request):
    """
    Create a new PENDING job manually (Phase 15, enhanced in Phase 16).
    
    Creates one job with multiple clip tasks from selected files.
    Job is left in PENDING state - no automatic execution.
    Preset and engine are bound at creation time.
    
    Args:
        body: Job creation request with source paths, preset ID, output directory, engine
        
    Returns:
        Created job details
        
    Raises:
        400: Validation failed (empty paths, invalid preset, invalid paths, engine unavailable)
        404: Preset not found
        500: Job creation failed
    """
    try:
        job_registry = request.app.state.job_registry
        binding_registry = request.app.state.binding_registry
        preset_registry = request.app.state.preset_registry
        job_engine = request.app.state.job_engine
        engine_registry = request.app.state.engine_registry
        
        # Validation: at least one source path required
        if not body.source_paths:
            raise HTTPException(status_code=400, detail="At least one source file required")
        
        # Validation: preset must exist
        preset = preset_registry.get_global_preset(body.preset_id)
        if not preset:
            raise HTTPException(status_code=404, detail=f"Preset '{body.preset_id}' not found")
        
        # Phase 16: Validate engine
        from app.execution.base import EngineType, EngineNotAvailableError
        
        engine_type_str = body.engine or "ffmpeg"  # Default to ffmpeg
        try:
            engine_type = EngineType(engine_type_str)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid engine type: '{engine_type_str}'. Must be 'ffmpeg' or 'resolve'"
            )
        
        # Check engine availability
        if not engine_registry.is_available(engine_type):
            if engine_type == EngineType.RESOLVE:
                raise HTTPException(
                    status_code=400,
                    detail="DaVinci Resolve engine is not yet available (coming soon)"
                )
            else:
                raise HTTPException(
                    status_code=400,
                    detail=f"Engine '{engine_type.value}' is not available on this system"
                )
        
        # Validation: all source paths must exist and be files
        invalid_paths = []
        for source_path in body.source_paths:
            path = Path(source_path)
            if not path.exists():
                invalid_paths.append(f"{source_path} (does not exist)")
            elif not path.is_file():
                invalid_paths.append(f"{source_path} (not a file)")
        
        if invalid_paths:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid source paths: {', '.join(invalid_paths)}"
            )
        
        # Phase 16.4: Determine output directory from settings or legacy field
        output_dir = None
        if body.settings and body.settings.output_dir:
            output_dir = body.settings.output_dir
        elif body.output_base_dir:
            output_dir = body.output_base_dir
        
        # Validation: output directory must be writable if specified
        if output_dir:
            output_path = Path(output_dir)
            if not output_path.exists():
                raise HTTPException(
                    status_code=400,
                    detail=f"Output directory does not exist: {output_dir}"
                )
            if not output_path.is_dir():
                raise HTTPException(
                    status_code=400,
                    detail=f"Output path is not a directory: {output_dir}"
                )
            # Test writability
            try:
                test_file = output_path / ".proxx_write_test"
                test_file.touch()
                test_file.unlink()
            except Exception as e:
                raise HTTPException(
                    status_code=400,
                    detail=f"Output directory not writable: {output_dir}"
                )
        
        # Create job with multiple clip tasks and engine binding
        job = job_engine.create_job(
            source_paths=body.source_paths,
            engine=engine_type_str,
        )
        
        # Phase 16.4: Apply job settings
        from app.jobs.settings import JobSettings
        
        if body.settings:
            job_settings = JobSettings(
                output_dir=body.settings.output_dir,
                naming_template=body.settings.naming_template,
                file_prefix=body.settings.file_prefix,
                file_suffix=body.settings.file_suffix,
                preserve_source_dirs=body.settings.preserve_source_dirs,
                preserve_dir_levels=body.settings.preserve_dir_levels,
                watermark_enabled=body.settings.watermark_enabled,
                watermark_text=body.settings.watermark_text,
            )
        elif output_dir:
            # Legacy: only output_base_dir was provided
            job_settings = JobSettings(output_dir=output_dir)
        else:
            # Use defaults
            job_settings = JobSettings()
        
        job.settings_dict = job_settings.to_dict()
        
        # Register the job
        job_registry.add_job(job)
        
        # Bind preset explicitly at creation time
        job_engine.bind_preset(job, body.preset_id, preset_registry)
        
        logger.info(
            f"Manual job {job.id} created with {len(body.source_paths)} clips, "
            f"preset '{body.preset_id}' bound, engine '{engine_type_str}', "
            f"output_dir='{output_dir or 'source parent'}'"
        )
        
        return CreateJobResponse(
            success=True,
            message=f"Job created with {len(body.source_paths)} clips using {engine_type_str} engine",
            job_id=job.id
        )
        
    except HTTPException:
        raise
    except ValidationError as e:
        logger.warning(f"Job creation validation failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Job creation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Job creation failed: {e}")


@router.post("/jobs/{job_id}/resume", response_model=OperationResponse)
async def resume_job_endpoint(job_id: str, request: Request):
    """
    Resume a RECOVERY_REQUIRED or PAUSED job.
    
    Phase 14: Explicit operator action via UI.
    Confirmation handled by UI before calling this endpoint.
    
    Args:
        job_id: Job identifier
        
    Returns:
        Operation result
        
    Raises:
        400: Validation failed
        404: Job not found
        500: Execution failed
    """
    try:
        job_registry = request.app.state.job_registry
        binding_registry = request.app.state.binding_registry
        preset_registry = request.app.state.preset_registry
        job_engine = request.app.state.job_engine
        
        # Call CLI command without confirmation prompt
        resume_job(
            job_id=job_id,
            job_registry=job_registry,
            binding_registry=binding_registry,
            preset_registry=preset_registry,
            job_engine=job_engine,
            require_confirmation=False,  # UI handles confirmation
        )
        
        logger.info(f"Job {job_id} resumed via control endpoint")
        
        return OperationResponse(
            success=True,
            message=f"Job {job_id} resumed successfully"
        )
        
    except ValidationError as e:
        logger.warning(f"Resume validation failed for job {job_id}: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Resume failed for job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Resume failed: {e}")


@router.post("/jobs/{job_id}/retry-failed", response_model=OperationResponse)
async def retry_failed_clips_endpoint(job_id: str, request: Request):
    """
    Retry only FAILED clips in a job.
    
    Phase 14: Explicit operator action via UI.
    COMPLETED clips are NEVER re-run.
    
    Args:
        job_id: Job identifier
        
    Returns:
        Operation result
        
    Raises:
        400: Validation failed
        404: Job not found
        500: Execution failed
    """
    try:
        job_registry = request.app.state.job_registry
        binding_registry = request.app.state.binding_registry
        preset_registry = request.app.state.preset_registry
        job_engine = request.app.state.job_engine
        
        # Call CLI command without confirmation prompt
        retry_failed_clips(
            job_id=job_id,
            job_registry=job_registry,
            binding_registry=binding_registry,
            preset_registry=preset_registry,
            job_engine=job_engine,
            require_confirmation=False,  # UI handles confirmation
        )
        
        logger.info(f"Failed clips retried for job {job_id} via control endpoint")
        
        return OperationResponse(
            success=True,
            message=f"Failed clips retried successfully for job {job_id}"
        )
        
    except ValidationError as e:
        logger.warning(f"Retry validation failed for job {job_id}: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Retry failed for job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Retry failed: {e}")


@router.put("/jobs/{job_id}/settings", response_model=OperationResponse)
async def update_job_settings_endpoint(
    job_id: str,
    body: JobSettingsRequest,
    request: Request,
):
    """
    Update job settings.
    
    Phase 16.4: Settings can ONLY be modified while job.status == PENDING.
    Once render starts (any clip enters RUNNING), settings are frozen.
    
    Args:
        job_id: Job identifier
        body: New job settings
        
    Returns:
        Operation result
        
    Raises:
        400: Job not in PENDING state
        404: Job not found
    """
    try:
        job_registry = request.app.state.job_registry
        
        job = job_registry.get_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")
        
        # Phase 16.4: Enforce immutability after render starts
        from app.jobs.models import JobStatus
        if job.status != JobStatus.PENDING:
            raise HTTPException(
                status_code=400,
                detail=f"Job settings cannot be modified after render has started. "
                       f"Current status: {job.status.value}"
            )
        
        # Create new settings
        from app.jobs.settings import JobSettings
        
        new_settings = JobSettings(
            output_dir=body.output_dir,
            naming_template=body.naming_template,
            file_prefix=body.file_prefix,
            file_suffix=body.file_suffix,
            preserve_source_dirs=body.preserve_source_dirs,
            preserve_dir_levels=body.preserve_dir_levels,
            watermark_enabled=body.watermark_enabled,
            watermark_text=body.watermark_text,
        )
        
        # Apply via update_settings (also enforces PENDING check)
        job.update_settings(new_settings)
        
        logger.info(f"Job {job_id} settings updated: output_dir='{body.output_dir}'")
        
        return OperationResponse(
            success=True,
            message=f"Job settings updated successfully"
        )
        
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Settings update failed for job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Settings update failed: {e}")


@router.get("/jobs/{job_id}/settings")
async def get_job_settings_endpoint(job_id: str, request: Request):
    """
    Get current job settings.
    
    Phase 16.4: Returns the current settings for a job.
    
    Args:
        job_id: Job identifier
        
    Returns:
        Current job settings
    """
    try:
        job_registry = request.app.state.job_registry
        
        job = job_registry.get_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")
        
        settings = job.settings
        
        return {
            "output_dir": settings.output_dir,
            "naming_template": settings.naming_template,
            "file_prefix": settings.file_prefix,
            "file_suffix": settings.file_suffix,
            "preserve_source_dirs": settings.preserve_source_dirs,
            "preserve_dir_levels": settings.preserve_dir_levels,
            "watermark_enabled": settings.watermark_enabled,
            "watermark_text": settings.watermark_text,
            "is_editable": job.status.value == "pending",
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get settings failed for job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Get settings failed: {e}")


@router.post("/jobs/{job_id}/cancel", response_model=OperationResponse)
async def cancel_job_endpoint(job_id: str, request: Request):
    """
    Cancel a job safely.
    
    Phase 14: Explicit operator action via UI.
    Cancellation is operator intent, not failure.
    
    Args:
        job_id: Job identifier
        
    Returns:
        Operation result
        
    Raises:
        400: Validation failed
        404: Job not found
        500: Cancellation failed
    """
    try:
        job_registry = request.app.state.job_registry
        job_engine = request.app.state.job_engine
        
        # Call CLI command without confirmation prompt
        cancel_job(
            job_id=job_id,
            job_registry=job_registry,
            job_engine=job_engine,
            require_confirmation=False,  # UI handles confirmation
        )
        
        logger.info(f"Job {job_id} cancelled via control endpoint")
        
        return OperationResponse(
            success=True,
            message=f"Job {job_id} cancelled successfully"
        )
        
    except ValidationError as e:
        logger.warning(f"Cancel validation failed for job {job_id}: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Cancel failed for job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Cancel failed: {e}")


@router.post("/jobs/{job_id}/rebind", response_model=OperationResponse)
async def rebind_preset_endpoint(job_id: str, body: RebindPresetRequest, request: Request):
    """
    Rebind a preset to a job.
    
    Phase 14: Explicit operator action via UI.
    Only allowed for PENDING or RECOVERY_REQUIRED jobs.
    
    Args:
        job_id: Job identifier
        body: Rebind request with new preset ID
        
    Returns:
        Operation result
        
    Raises:
        400: Validation failed
        404: Job or preset not found
        500: Rebind failed
    """
    try:
        job_registry = request.app.state.job_registry
        binding_registry = request.app.state.binding_registry
        preset_registry = request.app.state.preset_registry
        
        # Call CLI command without confirmation prompt
        rebind_preset(
            job_id=job_id,
            preset_id=body.preset_id,
            job_registry=job_registry,
            binding_registry=binding_registry,
            preset_registry=preset_registry,
            require_confirmation=False,  # UI handles confirmation
        )
        
        logger.info(f"Job {job_id} rebound to preset {body.preset_id} via control endpoint")
        
        return OperationResponse(
            success=True,
            message=f"Job {job_id} rebound to preset {body.preset_id}"
        )
        
    except ValidationError as e:
        logger.warning(f"Rebind validation failed for job {job_id}: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Rebind failed for job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Rebind failed: {e}")


# =============================================================================
# Phase 16: Start, Pause, Delete endpoints for full operator control
# =============================================================================


@router.post("/jobs/{job_id}/start", response_model=OperationResponse)
async def start_job_endpoint(job_id: str, request: Request):
    """
    Start a PENDING job - transitions to RUNNING and begins execution.
    
    Phase 16: Critical endpoint to actually execute jobs.
    This is the trigger that moves jobs from PENDING into the execution pipeline.
    
    Args:
        job_id: Job identifier
        
    Returns:
        Operation result
        
    Raises:
        400: Validation failed (job not in PENDING state)
        404: Job not found
        500: Execution failed
    """
    try:
        job_registry = request.app.state.job_registry
        binding_registry = request.app.state.binding_registry
        preset_registry = request.app.state.preset_registry
        job_engine = request.app.state.job_engine
        
        # Retrieve job
        job = job_registry.get_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
        
        # Validate job status - only PENDING jobs can be started
        if job.status != JobStatus.PENDING:
            raise HTTPException(
                status_code=400,
                detail=f"Job {job_id} cannot be started. "
                       f"Current status: {job.status.value}. "
                       f"Only PENDING jobs can be started."
            )
        
        # Validate preset binding exists
        preset_id = binding_registry.get_preset_id(job_id)
        if not preset_id:
            raise HTTPException(
                status_code=400,
                detail=f"No preset bound to job {job_id}. Cannot start without preset."
            )
        
        # Validate preset exists
        preset = preset_registry.get_global_preset(preset_id)
        if not preset:
            raise HTTPException(
                status_code=400,
                detail=f"Bound preset '{preset_id}' not found. Rebind a valid preset."
            )
        
        # Execute the job (this transitions PENDING → RUNNING and processes all clips)
        job_engine.execute_job(
            job=job,
            preset_registry=preset_registry,
            generate_reports=True,
        )
        
        logger.info(f"Job {job_id} started via control endpoint")
        
        return OperationResponse(
            success=True,
            message=f"Job {job_id} started successfully"
        )
        
    except HTTPException:
        raise
    except ValidationError as e:
        logger.warning(f"Start validation failed for job {job_id}: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Start failed for job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Start failed: {e}")


@router.post("/jobs/{job_id}/pause", response_model=OperationResponse)
async def pause_job_endpoint(job_id: str, request: Request):
    """
    Pause a RUNNING job.
    
    Phase 16: Pause will finish the current clip, then stop processing.
    Job can be resumed later with /resume endpoint.
    
    Args:
        job_id: Job identifier
        
    Returns:
        Operation result
        
    Raises:
        400: Validation failed (job not in RUNNING state)
        404: Job not found
        500: Pause failed
    """
    try:
        job_registry = request.app.state.job_registry
        job_engine = request.app.state.job_engine
        
        # Retrieve job
        job = job_registry.get_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
        
        # Validate job status - only RUNNING jobs can be paused
        if job.status != JobStatus.RUNNING:
            raise HTTPException(
                status_code=400,
                detail=f"Job {job_id} cannot be paused. "
                       f"Current status: {job.status.value}. "
                       f"Only RUNNING jobs can be paused."
            )
        
        # Pause the job
        job_engine.pause_job(job)
        
        logger.info(f"Job {job_id} paused via control endpoint")
        
        return OperationResponse(
            success=True,
            message=f"Job {job_id} paused successfully"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Pause failed for job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Pause failed: {e}")


@router.delete("/jobs/{job_id}", response_model=OperationResponse)
async def delete_job_endpoint(job_id: str, request: Request):
    """
    Delete a job from the queue.
    
    Phase 16: Removes job completely from registry.
    Only PENDING, COMPLETED, COMPLETED_WITH_WARNINGS, FAILED, or CANCELLED jobs can be deleted.
    RUNNING or PAUSED jobs must be cancelled first.
    
    Args:
        job_id: Job identifier
        
    Returns:
        Operation result
        
    Raises:
        400: Validation failed (job in RUNNING or PAUSED state)
        404: Job not found
        500: Delete failed
    """
    try:
        job_registry = request.app.state.job_registry
        binding_registry = request.app.state.binding_registry
        
        # Retrieve job
        job = job_registry.get_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
        
        # Validate job status - cannot delete RUNNING or PAUSED jobs
        if job.status in (JobStatus.RUNNING, JobStatus.PAUSED):
            raise HTTPException(
                status_code=400,
                detail=f"Job {job_id} cannot be deleted. "
                       f"Current status: {job.status.value}. "
                       f"Cancel the job first before deleting."
            )
        
        # Remove preset binding if exists
        if binding_registry:
            binding_registry.unbind_preset(job_id)
        
        # Remove job from registry
        job_registry.remove_job(job_id)
        
        logger.info(f"Job {job_id} deleted via control endpoint")
        
        return OperationResponse(
            success=True,
            message=f"Job {job_id} deleted successfully"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete failed for job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Delete failed: {e}")


# =============================================================================
# Phase 16.1: Clip-level control endpoints
# =============================================================================


class ClipRevealResponse(BaseModel):
    """Response for clip reveal endpoint."""
    
    model_config = ConfigDict(extra="forbid")
    
    success: bool
    path: Optional[str] = None
    message: str


@router.get("/clips/{task_id}/reveal", response_model=ClipRevealResponse)
async def reveal_clip_endpoint(task_id: str, request: Request):
    """
    Get the output path for a completed clip to reveal in file manager.
    
    Phase 16.1: Returns output_path for COMPLETED or FAILED clips with output.
    Disabled (returns null path) for clips without output.
    
    Args:
        task_id: Clip task identifier
        
    Returns:
        Path to reveal, or null if not available
    """
    try:
        job_registry = request.app.state.job_registry
        
        # Find task across all jobs
        for job in job_registry.list_jobs():
            for task in job.tasks:
                if task.id == task_id:
                    # Only return path if output exists
                    if task.output_path:
                        path_obj = Path(task.output_path)
                        if path_obj.exists():
                            return ClipRevealResponse(
                                success=True,
                                path=task.output_path,
                                message="Output file ready for reveal"
                            )
                        else:
                            return ClipRevealResponse(
                                success=False,
                                path=None,
                                message="Output file no longer exists"
                            )
                    else:
                        return ClipRevealResponse(
                            success=False,
                            path=None,
                            message="No output file available (clip not completed or failed)"
                        )
        
        raise HTTPException(status_code=404, detail=f"Clip task not found: {task_id}")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Reveal failed for clip {task_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Reveal failed: {e}")


@router.post("/clips/{task_id}/cancel", response_model=OperationResponse)
async def cancel_clip_endpoint(task_id: str, request: Request):
    """
    Cancel a running or queued clip.
    
    Phase 16.1: Sets clip to SKIPPED status.
    If clip is RUNNING, signals the engine to terminate the process.
    
    Args:
        task_id: Clip task identifier
        
    Returns:
        Operation result
    """
    try:
        job_registry = request.app.state.job_registry
        engine_registry = request.app.state.engine_registry
        
        # Find task across all jobs
        for job in job_registry.list_jobs():
            for task in job.tasks:
                if task.id == task_id:
                    if task.status == TaskStatus.COMPLETED:
                        raise HTTPException(
                            status_code=400,
                            detail="Cannot cancel completed clip"
                        )
                    if task.status in (TaskStatus.FAILED, TaskStatus.SKIPPED):
                        raise HTTPException(
                            status_code=400,
                            detail=f"Clip already in terminal state: {task.status.value}"
                        )
                    
                    # If running, signal engine to cancel
                    if task.status == TaskStatus.RUNNING and job.engine:
                        from app.execution.base import EngineType
                        engine_type = EngineType(job.engine)
                        engine = engine_registry.get_available_engine(engine_type)
                        if hasattr(engine, '_cancelled_tasks'):
                            engine._cancelled_tasks.add(task_id)
                    
                    # Mark as skipped
                    from datetime import datetime
                    task.status = TaskStatus.SKIPPED
                    task.failure_reason = "Cancelled by user"
                    task.completed_at = datetime.now()
                    
                    logger.info(f"Clip {task_id} cancelled via control endpoint")
                    
                    return OperationResponse(
                        success=True,
                        message=f"Clip {task_id} cancelled"
                    )
        
        raise HTTPException(status_code=404, detail=f"Clip task not found: {task_id}")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Cancel failed for clip {task_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Cancel failed: {e}")


@router.post("/clips/{task_id}/retry", response_model=OperationResponse)
async def retry_clip_endpoint(task_id: str, request: Request):
    """
    Retry a failed clip.
    
    Phase 16.1: Resets FAILED clip to QUEUED.
    Does NOT re-execute automatically - job must be started/resumed.
    
    Args:
        task_id: Clip task identifier
        
    Returns:
        Operation result
    """
    try:
        job_registry = request.app.state.job_registry
        
        # Find task across all jobs
        for job in job_registry.list_jobs():
            for task in job.tasks:
                if task.id == task_id:
                    if task.status != TaskStatus.FAILED:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Can only retry FAILED clips. Current status: {task.status.value}"
                        )
                    
                    # Reset to queued
                    task.status = TaskStatus.QUEUED
                    task.failure_reason = None
                    task.started_at = None
                    task.completed_at = None
                    task.output_path = None
                    task.retry_count += 1
                    
                    logger.info(f"Clip {task_id} reset to QUEUED for retry (attempt {task.retry_count})")
                    
                    return OperationResponse(
                        success=True,
                        message=f"Clip {task_id} queued for retry"
                    )
        
        raise HTTPException(status_code=404, detail=f"Clip task not found: {task_id}")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Retry failed for clip {task_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Retry failed: {e}")
