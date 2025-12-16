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
from app.jobs.models import JobStatus

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/control", tags=["control"])


class RebindPresetRequest(BaseModel):
    """Request body for preset rebinding."""
    
    model_config = ConfigDict(extra="forbid")
    
    preset_id: str


class CreateJobRequest(BaseModel):
    """Request body for manual job creation (Phase 15)."""
    
    model_config = ConfigDict(extra="forbid")
    
    source_paths: List[str]
    preset_id: str
    output_base_dir: Optional[str] = None


class PresetInfo(BaseModel):
    """Preset summary for UI display."""
    
    model_config = ConfigDict(extra="forbid")
    
    id: str
    name: str


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


@router.post("/jobs/create", response_model=CreateJobResponse)
async def create_job_endpoint(body: CreateJobRequest, request: Request):
    """
    Create a new PENDING job manually (Phase 15).
    
    Creates one job with multiple clip tasks from selected files.
    Job is left in PENDING state - no automatic execution.
    Preset is bound at creation time.
    
    Args:
        body: Job creation request with source paths, preset ID, output directory
        
    Returns:
        Created job details
        
    Raises:
        400: Validation failed (empty paths, invalid preset, invalid paths)
        404: Preset not found
        500: Job creation failed
    """
    try:
        job_registry = request.app.state.job_registry
        binding_registry = request.app.state.binding_registry
        preset_registry = request.app.state.preset_registry
        job_engine = request.app.state.job_engine
        
        # Validation: at least one source path required
        if not body.source_paths:
            raise HTTPException(status_code=400, detail="At least one source file required")
        
        # Validation: preset must exist
        preset = preset_registry.get_global_preset(body.preset_id)
        if not preset:
            raise HTTPException(status_code=404, detail=f"Preset '{body.preset_id}' not found")
        
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
        
        # Validation: output directory must be writable if specified
        if body.output_base_dir:
            output_path = Path(body.output_base_dir)
            if not output_path.exists():
                raise HTTPException(
                    status_code=400,
                    detail=f"Output directory does not exist: {body.output_base_dir}"
                )
            if not output_path.is_dir():
                raise HTTPException(
                    status_code=400,
                    detail=f"Output path is not a directory: {body.output_base_dir}"
                )
            # Test writability
            try:
                test_file = output_path / ".proxx_write_test"
                test_file.touch()
                test_file.unlink()
            except Exception as e:
                raise HTTPException(
                    status_code=400,
                    detail=f"Output directory not writable: {body.output_base_dir}"
                )
        
        # Create job with multiple clip tasks
        job = job_engine.create_job(
            source_paths=body.source_paths,
            output_base_dir=body.output_base_dir
        )
        
        # Bind preset explicitly at creation time
        job_engine.bind_preset(job, body.preset_id, preset_registry)
        
        logger.info(
            f"Manual job {job.id} created with {len(body.source_paths)} clips, "
            f"preset '{body.preset_id}' bound"
        )
        
        return CreateJobResponse(
            success=True,
            message=f"Job created with {len(body.source_paths)} clips",
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
