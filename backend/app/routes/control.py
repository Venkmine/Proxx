"""
Control endpoints for explicit operator actions.

Phase 14: HTTP adapter over Phase 13 CLI commands.
Phase 15: Manual job creation and preset listing.

All operations require explicit confirmation from UI.
No automatic actions. No silent mutations.
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Literal
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


# ============================================================================
# DELIVER SETTINGS API MODELS (Phase 17)
# ============================================================================

class VideoSettingsRequest(BaseModel):
    """Video capability settings for API."""
    
    model_config = ConfigDict(extra="forbid")
    
    codec: str = "prores_422"
    profile: Optional[str] = None
    level: Optional[str] = None
    pixel_format: Optional[str] = None
    resolution_policy: str = "source"
    width: Optional[int] = None
    height: Optional[int] = None
    scaling_filter: str = "auto"
    frame_rate_policy: str = "source"
    frame_rate: Optional[str] = None
    field_order: str = "progressive"
    color_space: str = "source"
    gamma: str = "source"
    data_levels: str = "source"
    hdr_metadata_passthrough: bool = True
    quality: Optional[int] = None
    bitrate: Optional[str] = None
    preset: Optional[str] = None
    # Phase 17.1: Frontend sends pixel_aspect_ratio
    pixel_aspect_ratio: Optional[str] = None
    # Proxy v1: Accepted for schema compatibility, not implemented
    rate_control_mode: Optional[str] = None
    bitrate_preset: Optional[str] = None


class AudioSettingsRequest(BaseModel):
    """Audio capability settings for API."""
    
    model_config = ConfigDict(extra="forbid")
    
    codec: str = "copy"
    bitrate: Optional[str] = None
    channels: Optional[int] = None
    layout: str = "source"
    sample_rate: Optional[int] = None
    passthrough: bool = False


class FileSettingsRequest(BaseModel):
    """File output settings for API."""
    
    model_config = ConfigDict(extra="forbid")
    
    container: str = "mov"
    extension: Optional[str] = None
    naming_template: str = "{source_name}__proxy"
    prefix: Optional[str] = None
    suffix: Optional[str] = None
    overwrite_policy: str = "never"
    preserve_source_dirs: bool = False
    preserve_dir_levels: int = 0


class MetadataSettingsRequest(BaseModel):
    """Metadata passthrough settings for API."""
    
    model_config = ConfigDict(extra="forbid")
    
    strip_all_metadata: bool = False
    passthrough_all_container_metadata: bool = True
    passthrough_timecode: bool = True
    passthrough_reel_name: bool = True
    passthrough_camera_metadata: bool = True
    passthrough_color_metadata: bool = True


class TextOverlayRequest(BaseModel):
    """Text overlay settings for API."""
    
    model_config = ConfigDict(extra="forbid")
    
    text: str
    position: str = "bottom_left"
    font_size: int = 24
    opacity: float = 1.0
    enabled: bool = True
    # Proxy v1: Accepted for schema compatibility, positional behaviour not guaranteed
    x: Optional[float] = None
    y: Optional[float] = None
    # Phase 22: Additional text styling options
    font: Optional[str] = None
    color: Optional[str] = None
    background: Optional[bool] = None
    background_color: Optional[str] = None
    background_opacity: Optional[float] = None
    # Anchor position (left, center, right)
    anchor: Optional[str] = None


class ImageOverlayRequest(BaseModel):
    """Image overlay (watermark) settings for API."""
    
    model_config = ConfigDict(extra="forbid")
    
    enabled: bool = False
    image_data: Optional[str] = None  # Base64 for Alpha
    image_name: Optional[str] = None
    x: float = 0.5
    y: float = 0.5
    opacity: float = 1.0
    scale: Optional[float] = None
    grayscale: Optional[bool] = None


class TimecodeOverlayRequest(BaseModel):
    """Timecode burn-in overlay settings for API."""
    
    model_config = ConfigDict(extra="forbid")
    
    enabled: bool = False
    timecode_source: str = "source"
    position: str = "top_left"
    font_size: int = 24
    font: Optional[str] = None
    color: Optional[str] = None
    background: Optional[bool] = None
    background_color: Optional[str] = None
    background_opacity: Optional[float] = None
    opacity: float = 1.0
    x: Optional[float] = None
    y: Optional[float] = None
    anchor: Optional[str] = None
    # Display during first/last frames
    display_first_frames: Optional[int] = None
    display_last_frames: Optional[int] = None


class OverlaySettingsRequest(BaseModel):
    """Overlay settings for API."""
    
    model_config = ConfigDict(extra="forbid")
    
    text_layers: List[TextOverlayRequest] = []
    image_watermark: Optional[ImageOverlayRequest] = None
    timecode_overlay: Optional[TimecodeOverlayRequest] = None


# Proxy v1: ColourSettingsRequest removed - colour settings are explicitly rejected


class DeliverSettingsRequest(BaseModel):
    """
    Full DeliverSettings for API (Proxy v1).
    
    Replaces legacy JobSettingsRequest with complete capability model.
    Note: Colour settings are NOT accepted in Proxy v1 and will cause HTTP 400.
    """
    
    model_config = ConfigDict(extra="forbid")
    
    video: Optional[VideoSettingsRequest] = None
    audio: Optional[AudioSettingsRequest] = None
    file: Optional[FileSettingsRequest] = None
    metadata: Optional[MetadataSettingsRequest] = None
    overlay: Optional[OverlaySettingsRequest] = None
    # Proxy v1: colour field removed - any colour settings will fail schema validation
    output_dir: Optional[str] = None


# DEPRECATED: Legacy JobSettingsRequest for backward compatibility
class JobSettingsRequest(BaseModel):
    """
    DEPRECATED: Use DeliverSettingsRequest instead.
    
    Legacy job settings for Phase 16.4 compatibility.
    Will be removed in a future version.
    """
    
    model_config = ConfigDict(extra="forbid")
    
    output_dir: Optional[str] = None
    naming_template: str = "{source_name}__proxy"
    file_prefix: Optional[str] = None
    file_suffix: Optional[str] = None
    preserve_source_dirs: bool = False
    preserve_dir_levels: int = 0
    watermark_enabled: bool = False
    watermark_text: Optional[str] = None


class CreateJobRequest(BaseModel):
    """Request body for manual job creation (Alpha).
    
    Phase 6: settings_preset_id is the preferred way to apply preset settings.
    When settings_preset_id is provided:
    - Settings are COPIED from the preset (not linked)
    - Job stores preset ID/name/fingerprint for diagnostics only
    - Preset changes NEVER affect this job after creation
    
    If no preset, uses deliver_settings directly ("Manual configuration").
    """
    
    model_config = ConfigDict(extra="forbid")
    
    source_paths: List[str]
    preset_id: Optional[str] = None  # Legacy global preset (Phase 15)
    settings_preset_id: Optional[str] = None  # Phase 6: Settings preset ID
    output_base_dir: Optional[str] = None  # Deprecated: use deliver_settings.output_dir
    engine: str = "ffmpeg"
    
    # Full DeliverSettings - used directly when no settings_preset_id
    deliver_settings: Optional[DeliverSettingsRequest] = None
    
    # DEPRECATED: Legacy settings (Phase 16.4 compatibility)
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


# ============================================================================
# PHASE 6: SETTINGS PRESET API MODELS
# Phase 7B: Added scope field for user vs workspace presets
# ============================================================================

# Phase 7B: Preset scope type
PresetScope = Literal["user", "workspace"]


class SettingsPresetInfo(BaseModel):
    """Settings preset summary for UI display."""
    
    model_config = ConfigDict(extra="forbid")
    
    id: str
    name: str
    description: str = ""
    scope: PresetScope = "user"  # Phase 7B: user or workspace
    fingerprint: str  # SHA-256 hash prefix for diagnostics
    created_at: str
    updated_at: str
    tags: List[str] = []


class SettingsPresetDetail(BaseModel):
    """Full settings preset with snapshot."""
    
    model_config = ConfigDict(extra="forbid")
    
    id: str
    name: str
    description: str = ""
    scope: PresetScope = "user"  # Phase 7B: user or workspace
    settings_snapshot: dict  # Full DeliverSettings dict
    fingerprint: str
    tags: List[str] = []
    created_at: str
    updated_at: str


class SettingsPresetListResponse(BaseModel):
    """Response for settings preset listing."""
    
    model_config = ConfigDict(extra="forbid")
    
    presets: List[SettingsPresetInfo]


class CreateSettingsPresetRequest(BaseModel):
    """Request body for creating a settings preset."""
    
    model_config = ConfigDict(extra="forbid")
    
    name: str
    description: str = ""
    scope: PresetScope = "user"  # Phase 7B: user or workspace (default: user)
    settings_snapshot: dict  # Full DeliverSettings dict
    tags: List[str] = []


class CreateSettingsPresetResponse(BaseModel):
    """Response for settings preset creation."""
    
    model_config = ConfigDict(extra="forbid")
    
    success: bool
    message: str
    preset: Optional[SettingsPresetInfo] = None


class DeleteSettingsPresetResponse(BaseModel):
    """Response for settings preset deletion."""
    
    model_config = ConfigDict(extra="forbid")
    
    success: bool
    message: str
    referencing_job_ids: List[str] = []  # Jobs that reference this preset (informational)


# ============================================================================
# QUEUE RESET API (Test Support)
# ============================================================================

@router.post("/queue/reset", response_model=OperationResponse)
async def reset_queue(request: Request):
    """
    Reset the job queue by clearing all jobs.
    
    This endpoint is primarily for testing purposes to ensure test isolation.
    It clears all jobs from the registry.
    """
    try:
        job_registry = request.app.state.job_registry
        job_count = job_registry.count()
        job_registry.clear()
        logger.info(f"Queue reset: cleared {job_count} jobs")
        return OperationResponse(
            success=True,
            message=f"Queue cleared: {job_count} jobs removed"
        )
    except Exception as e:
        logger.error(f"Failed to reset queue: {e}")
        return OperationResponse(
            success=False,
            message=f"Failed to reset queue: {e}"
        )


# ============================================================================
# PHASE 6: SETTINGS PRESET API ENDPOINTS
# ============================================================================

@router.get("/settings-presets", response_model=SettingsPresetListResponse)
async def list_settings_presets_endpoint(request: Request):
    """
    List all settings presets.
    
    Phase 6: Immutable settings snapshots for job creation.
    
    Returns:
        List of preset summaries with fingerprints
    """
    try:
        preset_store = request.app.state.settings_preset_store
        
        presets = preset_store.list_presets()
        
        preset_infos = [
            SettingsPresetInfo(
                id=p.id,
                name=p.name,
                description=p.description,
                scope=p.scope,  # Phase 7B
                fingerprint=p.fingerprint,
                created_at=p.created_at,
                updated_at=p.updated_at,
                tags=list(p.tags),
            )
            for p in presets
        ]
        
        return SettingsPresetListResponse(presets=preset_infos)
        
    except Exception as e:
        logger.error(f"Failed to list settings presets: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list settings presets: {e}")


@router.get("/settings-presets/{preset_id}", response_model=SettingsPresetDetail)
async def get_settings_preset_endpoint(preset_id: str, request: Request):
    """
    Get a settings preset by ID.
    
    Phase 6: Returns full preset with settings snapshot.
    
    Args:
        preset_id: The preset UUID
        
    Returns:
        Full preset details including settings snapshot
        
    Raises:
        404: Preset not found
    """
    try:
        preset_store = request.app.state.settings_preset_store
        
        preset = preset_store.get_preset(preset_id)
        if not preset:
            raise HTTPException(status_code=404, detail=f"Settings preset not found: {preset_id}")
        
        return SettingsPresetDetail(
            id=preset.id,
            name=preset.name,
            description=preset.description,
            scope=preset.scope,  # Phase 7B
            settings_snapshot=preset.settings_snapshot,
            fingerprint=preset.fingerprint,
            tags=list(preset.tags),
            created_at=preset.created_at,
            updated_at=preset.updated_at,
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get settings preset: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get settings preset: {e}")


@router.post("/settings-presets", response_model=CreateSettingsPresetResponse)
async def create_settings_preset_endpoint(body: CreateSettingsPresetRequest, request: Request):
    """
    Create a new settings preset from a DeliverSettings snapshot.
    
    Phase 6: Presets are immutable snapshots.
    No PATCH. No mutation. To "edit", duplicate and delete old.
    
    Args:
        body: Preset name, description, and settings snapshot
        
    Returns:
        Created preset summary
        
    Raises:
        400: Validation failed (empty name, invalid settings, duplicate name)
    """
    try:
        preset_store = request.app.state.settings_preset_store
        
        # Validate settings by deserializing
        from app.deliver.settings import DeliverSettings
        try:
            settings = DeliverSettings.from_dict(body.settings_snapshot)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid settings snapshot: {e}")
        
        try:
            preset = preset_store.create_preset(
                name=body.name,
                settings=settings,
                description=body.description,
                tags=body.tags,
                scope=body.scope,  # Phase 7B
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        
        logger.info(f"Settings preset created: {preset.id} ({preset.name}, scope={preset.scope})")
        
        return CreateSettingsPresetResponse(
            success=True,
            message=f"Preset '{preset.name}' created",
            preset=SettingsPresetInfo(
                id=preset.id,
                name=preset.name,
                description=preset.description,
                scope=preset.scope,  # Phase 7B
                fingerprint=preset.fingerprint,
                created_at=preset.created_at,
                updated_at=preset.updated_at,
                tags=list(preset.tags),
            ),
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create settings preset: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create settings preset: {e}")


@router.post("/settings-presets/{preset_id}/duplicate", response_model=CreateSettingsPresetResponse)
async def duplicate_settings_preset_endpoint(
    preset_id: str, 
    request: Request,
    new_name: Optional[str] = None,
):
    """
    Create a new preset from an existing preset's snapshot.
    
    Phase 6: This is the ONLY way to "edit" a preset:
    1. Duplicate the preset
    2. Delete the old one (if desired)
    
    Args:
        preset_id: The preset to duplicate
        new_name: Optional name for the new preset
        
    Returns:
        Created preset summary
        
    Raises:
        404: Source preset not found
    """
    try:
        preset_store = request.app.state.settings_preset_store
        
        new_preset = preset_store.duplicate_preset(preset_id, new_name)
        if not new_preset:
            raise HTTPException(status_code=404, detail=f"Settings preset not found: {preset_id}")
        
        logger.info(f"Settings preset duplicated: {preset_id} -> {new_preset.id} ({new_preset.name}, scope={new_preset.scope})")
        
        return CreateSettingsPresetResponse(
            success=True,
            message=f"Preset duplicated as '{new_preset.name}'",
            preset=SettingsPresetInfo(
                id=new_preset.id,
                name=new_preset.name,
                description=new_preset.description,
                scope=new_preset.scope,  # Phase 7B
                fingerprint=new_preset.fingerprint,
                created_at=new_preset.created_at,
                updated_at=new_preset.updated_at,
                tags=list(new_preset.tags),
            ),
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to duplicate settings preset: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to duplicate settings preset: {e}")


@router.delete("/settings-presets/{preset_id}", response_model=DeleteSettingsPresetResponse)
async def delete_settings_preset_endpoint(preset_id: str, request: Request, force: bool = False):
    """
    Delete a settings preset.
    
    Phase 6: Deleting a preset does NOT affect jobs that were created from it.
    Jobs own their settings forever after creation.
    
    Args:
        preset_id: The preset to delete
        force: If True, delete even if jobs reference this preset
        
    Returns:
        Deletion result with list of referencing jobs (informational)
        
    Raises:
        404: Preset not found
        400: Jobs reference this preset and force=False
    """
    try:
        preset_store = request.app.state.settings_preset_store
        job_registry = request.app.state.job_registry
        
        preset = preset_store.get_preset(preset_id)
        if not preset:
            raise HTTPException(status_code=404, detail=f"Settings preset not found: {preset_id}")
        
        # Check for referencing jobs (informational only)
        referencing_jobs = preset_store.is_preset_referenced_by_jobs(preset_id, job_registry)
        
        if referencing_jobs and not force:
            return DeleteSettingsPresetResponse(
                success=False,
                message=f"Preset is referenced by {len(referencing_jobs)} job(s). "
                        f"Use force=True to delete anyway. "
                        f"Note: Deleting the preset will NOT affect those jobs.",
                referencing_job_ids=referencing_jobs,
            )
        
        preset_name = preset.name
        preset_store.delete_preset(preset_id)
        
        logger.info(f"Settings preset deleted: {preset_id} ({preset_name})")
        
        return DeleteSettingsPresetResponse(
            success=True,
            message=f"Preset '{preset_name}' deleted",
            referencing_job_ids=referencing_jobs,
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete settings preset: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete settings preset: {e}")


# ============================================================================
# CODEC SPECS API (Phase 20)
# ============================================================================

@router.get("/codecs")
async def list_codecs_endpoint():
    """
    List all codec specifications.
    
    Phase 20: Codec-driven UI authority.
    
    Returns complete codec specs that drive UI generation.
    Frontend MUST use these to determine which controls to show.
    
    Returns:
        Dict of codec_id -> CodecSpec
    """
    from app.deliver.codec_specs import get_all_codecs
    return {"codecs": get_all_codecs()}


@router.get("/codecs/{codec_id}")
async def get_codec_endpoint(codec_id: str):
    """
    Get a single codec specification.
    
    Phase 20: For detailed codec capability lookup.
    
    Returns:
        CodecSpec for the requested codec
        
    Raises:
        404: Codec not found
    """
    from app.deliver.codec_specs import get_codec_spec
    spec = get_codec_spec(codec_id)
    if not spec:
        raise HTTPException(status_code=404, detail=f"Codec not found: {codec_id}")
    return spec.to_dict()


@router.get("/codecs/for-container/{container}")
async def get_codecs_for_container_endpoint(container: str):
    """
    Get all codecs valid for a container.
    
    Phase 20: Container ↔ codec enforcement.
    
    Used by UI to filter codec dropdown based on selected container.
    
    Returns:
        List of CodecSpec dicts valid for this container
    """
    from app.deliver.codec_specs import get_codecs_for_container
    codecs = get_codecs_for_container(container)
    return {"container": container, "codecs": [c.to_dict() for c in codecs]}


@router.get("/containers/for-codec/{codec_id}")
async def get_containers_for_codec_endpoint(codec_id: str):
    """
    Get all containers valid for a codec.
    
    Phase 20: Container ↔ codec enforcement.
    
    Used by UI to filter container dropdown based on selected codec.
    
    Returns:
        List of container strings valid for this codec
    """
    from app.deliver.codec_specs import get_containers_for_codec, get_codec_spec
    spec = get_codec_spec(codec_id)
    if not spec:
        raise HTTPException(status_code=404, detail=f"Codec not found: {codec_id}")
    containers = get_containers_for_codec(codec_id)
    return {"codec_id": codec_id, "containers": containers, "default_container": spec.default_container}


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


@router.get("/presets/{preset_id}/deliver-settings")
async def get_preset_deliver_settings_endpoint(preset_id: str, request: Request):
    """
    Get DeliverSettings for a preset.
    
    Phase 17: Presets are one-time initializers for the Deliver panel.
    Returns default DeliverSettings that the preset would apply.
    
    Note: In Phase 17, presets don't yet have custom deliver settings stored.
    This endpoint returns sensible defaults based on the preset's category refs.
    Future phases will add preset-specific deliver settings storage.
    """
    try:
        preset_registry = request.app.state.preset_registry
        
        global_presets = preset_registry.list_global_presets()
        preset = global_presets.get(preset_id)
        
        if not preset:
            raise HTTPException(status_code=404, detail=f"Preset not found: {preset_id}")
        
        # Phase 17: Return sensible defaults
        # Future: Load preset-specific deliver settings
        # For now, return ProRes 422 HQ defaults (common proxy workflow)
        deliver_settings = {
            "video": {
                "codec": "prores_422_hq",
                "resolution_policy": "source",
                "frame_rate_policy": "source",
                "pixel_aspect_ratio": "square",
                "quality": None,
            },
            "audio": {
                "codec": "pcm_s24le",
                "layout": "source",
                "sample_rate": 48000,
                "passthrough": False,
            },
            "file": {
                "container": "mov",
                "naming_template": "{source_name}_proxy",
                "overwrite_policy": "increment",
                "preserve_source_dirs": False,
                "preserve_dir_levels": 0,
            },
            "metadata": {
                "strip_all_metadata": False,
                "passthrough_all_container_metadata": True,
                "passthrough_timecode": True,
                "passthrough_reel_name": True,
                "passthrough_camera_metadata": True,
                "passthrough_color_metadata": True,
            },
            "overlay": {
                "text_layers": [],
            },
        }
        
        return deliver_settings
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get preset deliver settings: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get preset deliver settings: {e}")


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
    Create a new PENDING job manually.
    
    CANONICAL INGESTION PIPELINE:
    All job creation flows through IngestionService.ingest_sources().
    This endpoint is the HTTP adapter over the canonical pipeline.
    
    Phase 6: If settings_preset_id is provided:
    - Settings are COPIED from the preset (not linked)
    - Job stores preset ID/name/fingerprint for diagnostics only
    - Preset changes NEVER affect this job after creation
    
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
        # Get IngestionService from app state
        ingestion_service = request.app.state.ingestion_service
        
        # Phase 17: Build DeliverSettings from request (used if no preset)
        deliver_settings = _build_deliver_settings_from_request(body)
        
        # Determine output directory
        output_dir = _determine_output_dir(body)
        
        # Delegate to canonical ingestion pipeline
        from app.services.ingestion import IngestionError
        
        try:
            result = ingestion_service.ingest_sources(
                source_paths=body.source_paths,
                output_dir=output_dir,
                deliver_settings=deliver_settings,
                engine=body.engine or "ffmpeg",
                preset_id=body.preset_id,
                settings_preset_id=body.settings_preset_id,  # Phase 6
            )
        except IngestionError as e:
            # Map ingestion errors to appropriate HTTP status codes
            if "not found" in str(e).lower():
                raise HTTPException(status_code=404, detail=str(e))
            elif "not available" in str(e).lower():
                raise HTTPException(status_code=501, detail=str(e))
            else:
                raise HTTPException(status_code=400, detail=str(e))
        
        # Phase 6: Include preset info in response message
        preset_msg = ""
        if body.settings_preset_id:
            preset_store = request.app.state.settings_preset_store
            preset = preset_store.get_preset(body.settings_preset_id)
            if preset:
                preset_msg = f" using preset '{preset.name}'"
        
        logger.info(
            f"Job {result.job_id} created via canonical pipeline with {result.task_count} tasks"
            + (f" from preset {body.settings_preset_id}" if body.settings_preset_id else " (manual config)")
        )
        
        return CreateJobResponse(
            success=True,
            message=f"Job created with {result.task_count} clips{preset_msg} using {body.engine or 'ffmpeg'} engine",
            job_id=result.job_id
        )
        
    except HTTPException:
        raise
    except ValidationError as e:
        logger.warning(f"Job creation validation failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Job creation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Job creation failed: {e}")


def _determine_output_dir(body: CreateJobRequest) -> Optional[str]:
    """
    Determine output directory from request body.
    
    Priority: deliver_settings.output_dir > settings.output_dir > output_base_dir
    """
    if body.deliver_settings and body.deliver_settings.output_dir:
        return body.deliver_settings.output_dir
    elif body.settings and body.settings.output_dir:
        return body.settings.output_dir
    elif body.output_base_dir:
        return body.output_base_dir
    return None


def _build_deliver_settings_from_request(body: CreateJobRequest):
    """
    Build DeliverSettings from API request body.
    
    Handles Phase 17 format, legacy format, and defaults.
    """
    from app.deliver.settings import DeliverSettings
    from app.deliver.capabilities import (
        VideoCapabilities, AudioCapabilities, FileCapabilities,
        MetadataCapabilities, OverlayCapabilities, TextOverlay,
        ResolutionPolicy, FrameRatePolicy, FieldOrder, ColorSpace,
        GammaTransfer, DataLevels, ScalingFilter, AudioCodec,
        AudioChannelLayout, OverwritePolicy, TextPosition,
    )
    
    if body.deliver_settings:
        # New Phase 17 format
        ds = body.deliver_settings
        
        # Build video capabilities
        video = VideoCapabilities(
            codec=ds.video.codec if ds.video else "prores_422",
            profile=ds.video.profile if ds.video else None,
            level=ds.video.level if ds.video else None,
            pixel_format=ds.video.pixel_format if ds.video else None,
            resolution_policy=ResolutionPolicy(ds.video.resolution_policy) if ds.video else ResolutionPolicy.SOURCE,
            width=ds.video.width if ds.video else None,
            height=ds.video.height if ds.video else None,
            scaling_filter=ScalingFilter(ds.video.scaling_filter) if ds.video else ScalingFilter.AUTO,
            frame_rate_policy=FrameRatePolicy(ds.video.frame_rate_policy) if ds.video else FrameRatePolicy.SOURCE,
            frame_rate=ds.video.frame_rate if ds.video else None,
            field_order=FieldOrder(ds.video.field_order) if ds.video else FieldOrder.PROGRESSIVE,
            color_space=ColorSpace(ds.video.color_space) if ds.video else ColorSpace.SOURCE,
            gamma=GammaTransfer(ds.video.gamma) if ds.video else GammaTransfer.SOURCE,
            data_levels=DataLevels(ds.video.data_levels) if ds.video else DataLevels.SOURCE,
            hdr_metadata_passthrough=ds.video.hdr_metadata_passthrough if ds.video else True,
            quality=ds.video.quality if ds.video else None,
            bitrate=ds.video.bitrate if ds.video else None,
            preset=ds.video.preset if ds.video else None,
        ) if ds.video else VideoCapabilities()
        
        # Build audio capabilities
        audio = AudioCapabilities(
            codec=AudioCodec(ds.audio.codec) if ds.audio else AudioCodec.COPY,
            bitrate=ds.audio.bitrate if ds.audio else None,
            channels=ds.audio.channels if ds.audio else None,
            layout=AudioChannelLayout(ds.audio.layout) if ds.audio else AudioChannelLayout.SOURCE,
            sample_rate=ds.audio.sample_rate if ds.audio else None,
            passthrough=ds.audio.passthrough if ds.audio else False,
        ) if ds.audio else AudioCapabilities()
        
        # Build file capabilities
        file_caps = FileCapabilities(
            container=ds.file.container if ds.file else "mov",
            extension=ds.file.extension if ds.file else None,
            naming_template=ds.file.naming_template if ds.file else "{source_name}__proxy",
            prefix=ds.file.prefix if ds.file else None,
            suffix=ds.file.suffix if ds.file else None,
            overwrite_policy=OverwritePolicy(ds.file.overwrite_policy) if ds.file else OverwritePolicy.NEVER,
            preserve_source_dirs=ds.file.preserve_source_dirs if ds.file else False,
            preserve_dir_levels=ds.file.preserve_dir_levels if ds.file else 0,
        ) if ds.file else FileCapabilities()
        
        # Build metadata capabilities
        metadata = MetadataCapabilities(
            strip_all_metadata=ds.metadata.strip_all_metadata if ds.metadata else False,
            passthrough_all_container_metadata=ds.metadata.passthrough_all_container_metadata if ds.metadata else True,
            passthrough_timecode=ds.metadata.passthrough_timecode if ds.metadata else True,
            passthrough_reel_name=ds.metadata.passthrough_reel_name if ds.metadata else True,
            passthrough_camera_metadata=ds.metadata.passthrough_camera_metadata if ds.metadata else True,
            passthrough_color_metadata=ds.metadata.passthrough_color_metadata if ds.metadata else True,
        ) if ds.metadata else MetadataCapabilities()
        
        # Build overlay capabilities
        text_layers: tuple[TextOverlay, ...] = ()
        if ds.overlay and ds.overlay.text_layers:
            text_layers = tuple(
                TextOverlay(
                    text=layer.text,
                    position=TextPosition(layer.position),
                    font_size=layer.font_size,
                    opacity=layer.opacity,
                    enabled=layer.enabled,
                )
                for layer in ds.overlay.text_layers
            )
        overlay = OverlayCapabilities(text_layers=text_layers)
        
        return DeliverSettings(
            video=video,
            audio=audio,
            file=file_caps,
            metadata=metadata,
            overlay=overlay,
            output_dir=ds.output_dir,
        )
    elif body.settings:
        # Legacy Phase 16.4 format - convert to DeliverSettings
        text_layers: tuple[TextOverlay, ...] = ()
        if body.settings.watermark_enabled and body.settings.watermark_text:
            text_layers = (
                TextOverlay(
                    text=body.settings.watermark_text,
                    position=TextPosition.BOTTOM_LEFT,
                    enabled=True,
                ),
            )
        
        return DeliverSettings(
            file=FileCapabilities(
                naming_template=body.settings.naming_template,
                prefix=body.settings.file_prefix,
                suffix=body.settings.file_suffix,
                preserve_source_dirs=body.settings.preserve_source_dirs,
                preserve_dir_levels=body.settings.preserve_dir_levels,
            ),
            overlay=OverlayCapabilities(text_layers=text_layers),
            output_dir=body.settings.output_dir,
        )
    else:
        # Use defaults
        return DeliverSettings()


@router.get("/jobs/{job_id}/deliver-settings")
async def get_job_deliver_settings_endpoint(job_id: str, request: Request):
    """
    Get DeliverSettings for a specific job.
    
    Phase 17: Allows UI to reload a job's settings into the Deliver panel.
    Returns the exact settings that were persisted at job creation.
    
    Args:
        job_id: Job UUID
        
    Returns:
        DeliverSettings dict
        
    Raises:
        404: Job not found
    """
    try:
        job_registry = request.app.state.job_registry
        
        job = job_registry.get_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
        
        # Return settings_dict directly (already serialized)
        # If empty, return DEFAULT_DELIVER_SETTINGS
        from app.deliver.settings import DEFAULT_DELIVER_SETTINGS
        
        if not job.settings_dict:
            return DEFAULT_DELIVER_SETTINGS.to_dict()
        
        return job.settings_dict
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get job deliver settings: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get job deliver settings: {e}")


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
                detail=f"DeliverSettings cannot be modified after render has started. "
                       f"Current status: {job.status.value}"
            )
        
        # Phase 17: Convert legacy JobSettingsRequest to DeliverSettings
        from app.deliver.settings import DeliverSettings
        from app.deliver.capabilities import (
            FileCapabilities, OverlayCapabilities, TextOverlay, TextPosition,
        )
        
        # Build text overlays from legacy watermark
        text_layers: tuple[TextOverlay, ...] = ()
        if body.watermark_enabled and body.watermark_text:
            text_layers = (
                TextOverlay(
                    text=body.watermark_text,
                    position=TextPosition.BOTTOM_LEFT,
                    enabled=True,
                ),
            )
        
        new_settings = DeliverSettings(
            file=FileCapabilities(
                naming_template=body.naming_template,
                prefix=body.file_prefix,
                suffix=body.file_suffix,
                preserve_source_dirs=body.preserve_source_dirs,
                preserve_dir_levels=body.preserve_dir_levels,
            ),
            overlay=OverlayCapabilities(text_layers=text_layers),
            output_dir=body.output_dir,
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


@router.put("/jobs/{job_id}/deliver-settings", response_model=OperationResponse)
async def update_deliver_settings_endpoint(
    job_id: str,
    body: DeliverSettingsRequest,
    request: Request,
):
    """
    Update job DeliverSettings (Phase 17).
    
    Settings can ONLY be modified while job.status == PENDING.
    Backend enforcement: mutation attempts on non-PENDING jobs are rejected.
    
    Args:
        job_id: Job identifier
        body: New deliver settings
        
    Returns:
        Operation result
        
    Raises:
        400: Job not in PENDING state (immutability violation)
        404: Job not found
    """
    try:
        job_registry = request.app.state.job_registry
        
        job = job_registry.get_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")
        
        # BACKEND ENFORCEMENT: Immutability after render starts
        from app.jobs.models import JobStatus
        if job.status != JobStatus.PENDING:
            raise HTTPException(
                status_code=400,
                detail=f"DeliverSettings cannot be modified after render has started. "
                       f"Current status: {job.status.value}"
            )
        
        # Build DeliverSettings from request
        from app.deliver.settings import DeliverSettings
        from app.deliver.capabilities import (
            VideoCapabilities, AudioCapabilities, FileCapabilities,
            MetadataCapabilities, OverlayCapabilities, TextOverlay,
            ResolutionPolicy, FrameRatePolicy, FieldOrder, ColorSpace,
            GammaTransfer, DataLevels, ScalingFilter, AudioCodec,
            AudioChannelLayout, OverwritePolicy, TextPosition,
        )
        
        # Build video capabilities
        video = VideoCapabilities(
            codec=body.video.codec if body.video else "prores_422",
            profile=body.video.profile if body.video else None,
            level=body.video.level if body.video else None,
            pixel_format=body.video.pixel_format if body.video else None,
            resolution_policy=ResolutionPolicy(body.video.resolution_policy) if body.video else ResolutionPolicy.SOURCE,
            width=body.video.width if body.video else None,
            height=body.video.height if body.video else None,
            scaling_filter=ScalingFilter(body.video.scaling_filter) if body.video else ScalingFilter.AUTO,
            frame_rate_policy=FrameRatePolicy(body.video.frame_rate_policy) if body.video else FrameRatePolicy.SOURCE,
            frame_rate=body.video.frame_rate if body.video else None,
            field_order=FieldOrder(body.video.field_order) if body.video else FieldOrder.PROGRESSIVE,
            color_space=ColorSpace(body.video.color_space) if body.video else ColorSpace.SOURCE,
            gamma=GammaTransfer(body.video.gamma) if body.video else GammaTransfer.SOURCE,
            data_levels=DataLevels(body.video.data_levels) if body.video else DataLevels.SOURCE,
            hdr_metadata_passthrough=body.video.hdr_metadata_passthrough if body.video else True,
            quality=body.video.quality if body.video else None,
            bitrate=body.video.bitrate if body.video else None,
            preset=body.video.preset if body.video else None,
        ) if body.video else VideoCapabilities()
        
        # Build audio capabilities
        audio = AudioCapabilities(
            codec=AudioCodec(body.audio.codec) if body.audio else AudioCodec.COPY,
            bitrate=body.audio.bitrate if body.audio else None,
            channels=body.audio.channels if body.audio else None,
            layout=AudioChannelLayout(body.audio.layout) if body.audio else AudioChannelLayout.SOURCE,
            sample_rate=body.audio.sample_rate if body.audio else None,
            passthrough=body.audio.passthrough if body.audio else False,
        ) if body.audio else AudioCapabilities()
        
        # Build file capabilities
        file_caps = FileCapabilities(
            container=body.file.container if body.file else "mov",
            extension=body.file.extension if body.file else None,
            naming_template=body.file.naming_template if body.file else "{source_name}__proxy",
            prefix=body.file.prefix if body.file else None,
            suffix=body.file.suffix if body.file else None,
            overwrite_policy=OverwritePolicy(body.file.overwrite_policy) if body.file else OverwritePolicy.NEVER,
            preserve_source_dirs=body.file.preserve_source_dirs if body.file else False,
            preserve_dir_levels=body.file.preserve_dir_levels if body.file else 0,
        ) if body.file else FileCapabilities()
        
        # Build metadata capabilities
        metadata = MetadataCapabilities(
            strip_all_metadata=body.metadata.strip_all_metadata if body.metadata else False,
            passthrough_all_container_metadata=body.metadata.passthrough_all_container_metadata if body.metadata else True,
            passthrough_timecode=body.metadata.passthrough_timecode if body.metadata else True,
            passthrough_reel_name=body.metadata.passthrough_reel_name if body.metadata else True,
            passthrough_camera_metadata=body.metadata.passthrough_camera_metadata if body.metadata else True,
            passthrough_color_metadata=body.metadata.passthrough_color_metadata if body.metadata else True,
        ) if body.metadata else MetadataCapabilities()
        
        # Build overlay capabilities
        text_layers: tuple[TextOverlay, ...] = ()
        if body.overlay and body.overlay.text_layers:
            text_layers = tuple(
                TextOverlay(
                    text=layer.text,
                    position=TextPosition(layer.position),
                    font_size=layer.font_size,
                    opacity=layer.opacity,
                    enabled=layer.enabled,
                )
                for layer in body.overlay.text_layers
            )
        overlay = OverlayCapabilities(text_layers=text_layers)
        
        new_settings = DeliverSettings(
            video=video,
            audio=audio,
            file=file_caps,
            metadata=metadata,
            overlay=overlay,
            output_dir=body.output_dir,
        )
        
        # Apply settings (update_settings also enforces PENDING check)
        job.update_settings(new_settings)
        
        logger.info(f"Job {job_id} DeliverSettings updated: output_dir='{body.output_dir}'")
        
        return OperationResponse(
            success=True,
            message=f"DeliverSettings updated successfully"
        )
        
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"DeliverSettings update failed for job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"DeliverSettings update failed: {e}")


@router.get("/jobs/{job_id}/settings")
async def get_job_settings_endpoint(job_id: str, request: Request):
    """
    Get current job settings (legacy format).
    
    DEPRECATED: Use GET /jobs/{job_id}/deliver-settings instead.
    
    Args:
        job_id: Job identifier
        
    Returns:
        Current job settings in legacy format
    """
    try:
        job_registry = request.app.state.job_registry
        
        job = job_registry.get_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")
        
        settings = job.settings
        
        # Convert DeliverSettings to legacy format for backward compatibility
        # Check for text overlays to simulate watermark
        watermark_enabled = len(settings.overlay.text_layers) > 0
        watermark_text = settings.overlay.text_layers[0].text if watermark_enabled else None
        
        return {
            "output_dir": settings.output_dir,
            "naming_template": settings.file.naming_template,
            "file_prefix": settings.file.prefix,
            "file_suffix": settings.file.suffix,
            "preserve_source_dirs": settings.file.preserve_source_dirs,
            "preserve_dir_levels": settings.file.preserve_dir_levels,
            "watermark_enabled": watermark_enabled,
            "watermark_text": watermark_text,
            "is_editable": job.status.value == "pending",
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get settings failed for job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Get settings failed: {e}")


@router.get("/jobs/{job_id}/deliver-settings")
async def get_deliver_settings_endpoint(job_id: str, request: Request):
    """
    Get current DeliverSettings for a job (Phase 17).
    
    Args:
        job_id: Job identifier
        
    Returns:
        Full DeliverSettings structure
    """
    try:
        job_registry = request.app.state.job_registry
        
        job = job_registry.get_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")
        
        settings = job.settings
        
        return {
            "video": {
                "codec": settings.video.codec,
                "profile": settings.video.profile,
                "level": settings.video.level,
                "pixel_format": settings.video.pixel_format,
                "resolution_policy": settings.video.resolution_policy.value,
                "width": settings.video.width,
                "height": settings.video.height,
                "scaling_filter": settings.video.scaling_filter.value,
                "frame_rate_policy": settings.video.frame_rate_policy.value,
                "frame_rate": settings.video.frame_rate,
                "field_order": settings.video.field_order.value,
                "color_space": settings.video.color_space.value,
                "gamma": settings.video.gamma.value,
                "data_levels": settings.video.data_levels.value,
                "hdr_metadata_passthrough": settings.video.hdr_metadata_passthrough,
                "quality": settings.video.quality,
                "bitrate": settings.video.bitrate,
                "preset": settings.video.preset,
            },
            "audio": {
                "codec": settings.audio.codec.value,
                "bitrate": settings.audio.bitrate,
                "channels": settings.audio.channels,
                "layout": settings.audio.layout.value,
                "sample_rate": settings.audio.sample_rate,
                "passthrough": settings.audio.passthrough,
            },
            "file": {
                "container": settings.file.container,
                "extension": settings.file.extension,
                "naming_template": settings.file.naming_template,
                "prefix": settings.file.prefix,
                "suffix": settings.file.suffix,
                "overwrite_policy": settings.file.overwrite_policy.value,
                "preserve_source_dirs": settings.file.preserve_source_dirs,
                "preserve_dir_levels": settings.file.preserve_dir_levels,
            },
            "metadata": {
                "strip_all_metadata": settings.metadata.strip_all_metadata,
                "passthrough_all_container_metadata": settings.metadata.passthrough_all_container_metadata,
                "passthrough_timecode": settings.metadata.passthrough_timecode,
                "passthrough_reel_name": settings.metadata.passthrough_reel_name,
                "passthrough_camera_metadata": settings.metadata.passthrough_camera_metadata,
                "passthrough_color_metadata": settings.metadata.passthrough_color_metadata,
            },
            "overlay": {
                "text_layers": [
                    {
                        "text": layer.text,
                        "position": layer.position.value,
                        "font_size": layer.font_size,
                        "opacity": layer.opacity,
                        "enabled": layer.enabled,
                    }
                    for layer in settings.overlay.text_layers
                ],
            },
            "output_dir": settings.output_dir,
            "is_editable": job.status.value == "pending",
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get DeliverSettings failed for job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Get DeliverSettings failed: {e}")


@router.post("/jobs/{job_id}/cancel", response_model=OperationResponse)
async def cancel_job_endpoint(job_id: str, request: Request):
    """
    Cancel a job safely.
    
    Phase 14: Explicit operator action via UI.
    INC-002 Fix: Also removes job from FIFO queue if waiting.
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
    from app.execution.scheduler import get_scheduler
    
    try:
        job_registry = request.app.state.job_registry
        job_engine = request.app.state.job_engine
        scheduler = get_scheduler()
        
        # INC-002: Remove from queue if waiting
        scheduler.remove_from_queue(job_id)
        
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
    
    INC-002 Fix: Jobs are queued and execute in strict FIFO order.
    A job will only execute when all previously started jobs have completed.
    
    Alpha: Preset is optional. Jobs use their embedded settings_snapshot
    (or override_settings if present). Preset binding is only used for
    codec resolution if available.
    
    Args:
        job_id: Job identifier
        
    Returns:
        Operation result (includes queue position if waiting)
        
    Raises:
        400: Validation failed (job not in PENDING state)
        404: Job not found
        500: Execution failed
    """
    from app.execution.scheduler import get_scheduler
    from datetime import datetime as dt
    
    try:
        job_registry = request.app.state.job_registry
        binding_registry = request.app.state.binding_registry
        preset_registry = request.app.state.preset_registry
        job_engine = request.app.state.job_engine
        scheduler = get_scheduler()
        
        # Retrieve job
        job = job_registry.get_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
        
        logger.info(f"[LIFECYCLE] HTTP start_job_endpoint BEGIN for job {job_id} at {dt.now().isoformat()}")
        
        # Validate job status - only PENDING jobs can be started
        if job.status != JobStatus.PENDING:
            raise HTTPException(
                status_code=400,
                detail=f"Job {job_id} cannot be started. "
                       f"Current status: {job.status.value}. "
                       f"Only PENDING jobs can be started."
            )
        
        # INC-002: Enqueue job for FIFO execution
        queue_position = scheduler.enqueue_job(job_id)
        logger.info(f"[INC-002] Job {job_id} enqueued at position {queue_position}")
        
        # INC-002: Attempt to acquire execution slot (only succeeds if at front)
        if not scheduler.acquire_execution(job_id):
            # Job is queued but must wait for others ahead
            return OperationResponse(
                success=True,
                message=f"Job {job_id} queued at position {queue_position}. "
                        f"Will execute after {queue_position - 1} job(s) complete."
            )
        
        # Alpha: Preset is optional - get if available
        preset_id = binding_registry.get_preset_id(job_id)
        if preset_id:
            # Validate preset exists if bound
            preset = preset_registry.get_global_preset(preset_id)
            if not preset:
                logger.warning(f"Bound preset '{preset_id}' not found for job {job_id}, proceeding with job settings")
                preset_id = None
        
        logger.info(f"[LIFECYCLE] Calling execute_job() SYNCHRONOUSLY for job {job_id} at {dt.now().isoformat()}")
        try:
            # Execute the job using embedded settings (preset optional)
            job_engine.execute_job(
                job=job,
                global_preset_id=preset_id,  # May be None - engine uses job.settings
                preset_registry=preset_registry,
                generate_reports=True,
            )
        finally:
            # INC-002: Release execution slot when done
            scheduler.release_execution(job_id)
        
        logger.info(f"[LIFECYCLE] HTTP start_job_endpoint END for job {job_id} at {dt.now().isoformat()}, final status: {job.status.value}")
        
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


# =============================================================================
# INC-002: Queue Status Endpoint
# =============================================================================

class QueueStatusResponse(BaseModel):
    """Response for queue status query."""
    
    model_config = ConfigDict(extra="forbid")
    
    current_job_id: Optional[str] = None
    queued_job_ids: List[str] = []
    queue_length: int = 0


@router.get("/queue/status", response_model=QueueStatusResponse)
async def get_queue_status():
    """
    Get current execution queue status.
    
    INC-002 Fix: Provides provable FIFO queue order for UI.
    
    Returns:
        Current executing job and queue of waiting jobs
    """
    from app.execution.scheduler import get_scheduler
    
    scheduler = get_scheduler()
    queued_ids = scheduler.get_queued_job_ids()
    
    return QueueStatusResponse(
        current_job_id=scheduler.get_current_job_id(),
        queued_job_ids=queued_ids,
        queue_length=len(queued_ids),
    )
