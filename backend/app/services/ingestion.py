"""
IngestionService — Canonical Job Ingestion Pipeline.

This is THE SINGLE ENTRY POINT for all job creation:
- File browser selection
- Directory navigator selection
- Watch folder automation (future)

NOTE: Drag & drop removed from UI for honesty.
Use explicit "Select Files" and "Select Folder" buttons.

All paths flow through ingest_sources() which:
1. Validates paths exist and are readable files
2. Normalizes absolute paths (resolves symlinks)
3. Snapshots effective settings
4. Creates job with stable UUIDv4 ID
5. Enqueues job in registry

CONSTRAINTS:
- Backend IngestionService is the single source of truth
- Job IDs are UUIDv4 only (no content hashing)
- Settings snapshot occurs here, not in frontend
- No alternate job creation paths allowed
"""

import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Dict, Any, TYPE_CHECKING, Tuple

if TYPE_CHECKING:
    from ..jobs.registry import JobRegistry
    from ..jobs.engine import JobEngine
    from ..jobs.bindings import JobPresetBindingRegistry
    from ..presets.registry import PresetRegistry
    from ..execution.engine_registry import EngineRegistry
    from ..deliver.settings import DeliverSettings

from ..jobs.models import Job, JobStatus
from ..deliver.codec_specs import validate_codec_container, CODEC_REGISTRY
from ..execution.ffmpeg import FFMPEG_CODEC_MAP

logger = logging.getLogger(__name__)

# ============================================================================
# RAW Folder Detection
# ============================================================================

def detect_raw_folder_type(folder_path: Path) -> Optional[str]:
    """
    Detect RAW folder type by inspecting contents.
    
    Returns:
        - "R3D" if contains *.R3D files
        - "ARRIRAW" if contains *.ari files
        - "SONY_RAW" if contains *.mxf + metadata files
        - "IMAGE_SEQUENCE" if contains numbered image frames
        - None if not a recognized RAW format
    """
    if not folder_path.is_dir():
        return None
    
    try:
        files = list(folder_path.iterdir())
        filenames = [f.name.lower() for f in files if f.is_file()]
        
        # Check for R3D
        if any(f.endswith('.r3d') for f in filenames):
            return "R3D"
        
        # Check for ARRIRAW
        if any(f.endswith('.ari') for f in filenames):
            return "ARRIRAW"
        
        # Check for Sony RAW (MXF + metadata)
        has_mxf = any(f.endswith('.mxf') for f in filenames)
        has_xml = any(f.endswith('.xml') for f in filenames)
        if has_mxf and has_xml:
            return "SONY_RAW"
        
        # Check for image sequences (numbered frames)
        image_exts = {'.dpx', '.exr', '.tiff', '.tif', '.png', '.jpg', '.jpeg'}
        image_files = [f for f in filenames if any(f.endswith(ext) for ext in image_exts)]
        if len(image_files) >= 2:
            # Check if files are numbered (simple heuristic)
            import re
            numbered = [f for f in image_files if re.search(r'\d{3,}', f)]
            if len(numbered) >= 2:
                return "IMAGE_SEQUENCE"
        
        return None
    except (OSError, PermissionError) as e:
        logger.warning(f"Failed to inspect folder {folder_path}: {e}")
        return None

def get_representative_clip_name(folder_path: Path, raw_type: str) -> str:
    """
    Generate a representative clip name for a RAW folder.
    
    Uses folder name as the clip name for display purposes.
    """
    return folder_path.name


class IngestionError(Exception):
    """Raised when ingestion validation fails."""
    
    def __init__(self, message: str, invalid_paths: Optional[List[str]] = None):
        super().__init__(message)
        self.message = message
        self.invalid_paths = invalid_paths or []


@dataclass
class IngestionResult:
    """Result of a successful ingestion operation."""
    
    job: Job
    job_id: str
    task_count: int
    warnings: List[str]
    
    @property
    def success(self) -> bool:
        return True


class IngestionService:
    """
    Canonical job ingestion pipeline.
    
    All job creation MUST flow through this service.
    Provides unified validation, normalization, and settings snapshot.
    
    Phase 6: Settings presets are COPIED at job creation.
    Jobs own their settings forever after creation.
    """
    
    def __init__(
        self,
        job_registry: "JobRegistry",
        job_engine: "JobEngine",
        binding_registry: Optional["JobPresetBindingRegistry"] = None,
        preset_registry: Optional["PresetRegistry"] = None,
        engine_registry: Optional["EngineRegistry"] = None,
        settings_preset_store: Optional[Any] = None,
    ):
        """
        Initialize ingestion service.
        
        Args:
            job_registry: Registry for storing created jobs
            job_engine: Engine for job/task creation
            binding_registry: Optional registry for preset bindings
            preset_registry: Optional registry for preset lookup
            engine_registry: Optional registry for engine availability checks
            settings_preset_store: Optional Phase 6 settings preset store
        """
        self.job_registry = job_registry
        self.job_engine = job_engine
        self.binding_registry = binding_registry
        self.preset_registry = preset_registry
        self.engine_registry = engine_registry
        self.settings_preset_store = settings_preset_store
    
    def ingest_sources(
        self,
        source_paths: List[str],
        output_dir: Optional[str],
        deliver_settings: "DeliverSettings",
        engine: str = "ffmpeg",
        preset_id: Optional[str] = None,
        settings_preset_id: Optional[str] = None,
    ) -> IngestionResult:
        """
        Canonical ingestion entry point.
        
        Creates a job from source paths with settings snapshot.
        This is THE ONLY method for creating jobs.
        
        Phase 6: If settings_preset_id is provided:
        - Settings are COPIED from the preset (not linked)
        - Job stores preset ID/name/fingerprint for diagnostics only
        - Preset changes NEVER affect this job after creation
        
        Args:
            source_paths: List of absolute paths to source files
            output_dir: Absolute path to output directory (may be None)
            deliver_settings: DeliverSettings to snapshot (used if no preset)
            engine: Engine type string ("ffmpeg" or "resolve")
            preset_id: Optional legacy global preset ID to bind
            settings_preset_id: Optional Phase 6 settings preset ID (overrides deliver_settings)
            
        Returns:
            IngestionResult with created job and metadata
            
        Raises:
            IngestionError: If validation fails (empty paths, invalid files, etc.)
        """
        warnings: List[str] = []
        
        # Phase 6: Settings preset source tracking
        source_preset_id: Optional[str] = None
        source_preset_name: Optional[str] = None
        source_preset_fingerprint: Optional[str] = None
        
        # =====================================================================
        # 0. PHASE 6: Load settings from preset if specified
        # =====================================================================
        if settings_preset_id and self.settings_preset_store:
            # Log available presets for diagnostics (Trust Stabilisation)
            available_presets = [p.id for p in self.settings_preset_store.list_presets()]
            logger.debug(f"Settings preset resolution: requested='{settings_preset_id}', available={available_presets}")
            
            settings_preset = self.settings_preset_store.get_preset(settings_preset_id)
            if not settings_preset:
                # INVARIANT: PRESET_REFERENCE_MISSING - frontend sent ID not known to backend
                logger.error(
                    f"PRESET_REFERENCE_MISSING: Settings preset '{settings_preset_id}' not found. "
                    f"Available presets: {available_presets}. "
                    "This indicates frontend/backend preset sync failure."
                )
                raise IngestionError(
                    f"Selected preset is no longer available. Please reselect or use Manual settings. "
                    f"(Preset ID: {settings_preset_id})"
                )
            
            # COPY settings from preset (not a reference!)
            deliver_settings = settings_preset.get_settings()
            
            # Store preset source info for diagnostics
            source_preset_id = settings_preset.id
            source_preset_name = settings_preset.name
            source_preset_fingerprint = settings_preset.fingerprint
            
            logger.debug(
                f"Using settings preset: {source_preset_name} ({source_preset_id}) "
                f"fingerprint={source_preset_fingerprint}"
            )
        
        # =====================================================================
        # 1. VALIDATE: paths exist, are files, are readable
        # =====================================================================
        if not source_paths:
            raise IngestionError("At least one source file required")
        
        # GOLDEN PATH: Hard limit = 1 clip
        if len(source_paths) > 1:
            raise IngestionError(
                f"Multi-clip jobs are disabled. Only 1 clip allowed (received {len(source_paths)})"
            )
        
        validated_paths, invalid_paths = self._validate_paths(source_paths)
        
        if invalid_paths:
            raise IngestionError(
                f"Invalid source paths: {', '.join(invalid_paths)}",
                invalid_paths=invalid_paths,
            )
        
        if not validated_paths:
            raise IngestionError("No valid source paths after validation")
        
        # =====================================================================
        # 2. NORMALIZE: resolve symlinks, ensure absolute paths
        # =====================================================================
        normalized_paths = self._normalize_paths(validated_paths)
        
        # =====================================================================
        # 3. VALIDATE OUTPUT DIRECTORY (if provided)
        # =====================================================================
        effective_output_dir = output_dir or deliver_settings.output_dir
        if effective_output_dir:
            self._validate_output_dir(effective_output_dir)
        
        # =====================================================================
        # 4. VALIDATE ENGINE (if registry available)
        # =====================================================================
        if self.engine_registry:
            self._validate_engine(engine)
        
        # =====================================================================
        # 4b. VALIDATE CODEC/CONTAINER COMPATIBILITY
        # =====================================================================
        self._validate_codec_container(deliver_settings, engine)
        
        # =====================================================================
        # 5. VALIDATE PRESET (if provided and registry available)
        # =====================================================================
        preset = None
        if preset_id and self.preset_registry:
            # Log available presets for diagnostics (Trust Stabilisation)
            available_global = list(self.preset_registry.list_global_presets().keys())
            logger.debug(f"Legacy preset resolution: requested='{preset_id}', available={available_global}")
            
            preset = self.preset_registry.get_global_preset(preset_id)
            if not preset:
                # INVARIANT: PRESET_REFERENCE_MISSING - frontend sent ID not known to backend
                logger.error(
                    f"PRESET_REFERENCE_MISSING: Legacy preset '{preset_id}' not found. "
                    f"Available presets: {available_global}. "
                    "This indicates frontend/backend preset sync failure."
                )
                raise IngestionError(
                    f"Selected preset is no longer available. Please reselect or use Manual settings. "
                    f"(Preset ID: {preset_id})"
                )
        
        # =====================================================================
        # 6. CREATE JOB: UUIDv4 ID generated automatically
        # =====================================================================
        job = self.job_engine.create_job(
            source_paths=normalized_paths,
            engine=engine,
        )
        
        # =====================================================================
        # 7. SNAPSHOT: freeze DeliverSettings
        # =====================================================================
        # Update output_dir in settings if provided separately
        if effective_output_dir and effective_output_dir != deliver_settings.output_dir:
            # Create new settings with updated output_dir
            settings_dict = deliver_settings.to_dict()
            settings_dict["output_dir"] = effective_output_dir
            job.settings_dict = settings_dict
        else:
            job.settings_dict = deliver_settings.to_dict()
        
        # =====================================================================
        # 7b. PHASE 6: Store preset source info for diagnostics
        # =====================================================================
        # This records WHICH preset was used at creation time.
        # It does NOT create a live link — jobs own their settings forever.
        if source_preset_id:
            job.source_preset_id = source_preset_id
            job.source_preset_name = source_preset_name
            job.source_preset_fingerprint = source_preset_fingerprint
            logger.debug(
                f"Job {job.id} created from preset '{source_preset_name}' "
                f"(id={source_preset_id}, fingerprint={source_preset_fingerprint})"
            )
        else:
            # Job created with manual configuration (no preset)
            job.source_preset_id = None
            job.source_preset_name = None
            job.source_preset_fingerprint = None
            logger.debug(f"Job {job.id} created with manual configuration (no preset)")
        
        # =====================================================================
        # 8. ENQUEUE: add to registry
        # =====================================================================
        self.job_registry.add_job(job)
        
        # =====================================================================
        # 9. BIND PRESET (if provided — legacy global preset system)
        # =====================================================================
        if preset_id and self.binding_registry:
            self.binding_registry.bind_preset(job.id, preset_id)
            logger.debug(f"Bound legacy preset '{preset_id}' to job {job.id}")
        
        logger.info(
            f"Ingested job {job.id} with {len(job.tasks)} tasks, "
            f"engine='{engine}', output_dir='{effective_output_dir or 'source parent'}'"
        )
        
        return IngestionResult(
            job=job,
            job_id=job.id,
            task_count=len(job.tasks),
            warnings=warnings,
        )
    
    def _validate_paths(self, paths: List[str]) -> Tuple[List[str], List[str]]:
        """
        Validate that paths exist and are either files or RAW folders.
        
        Accepts:
        - Media files (mov, mp4, mxf, etc.)
        - RAW folders (R3D, ARRIRAW, Sony RAW, image sequences)
        
        Returns:
            Tuple of (valid_paths, invalid_paths)
        """
        valid_paths: List[str] = []
        invalid_paths: List[str] = []
        
        for path_str in paths:
            path = Path(path_str)
            
            if not path.exists():
                invalid_paths.append(f"{path_str} (does not exist)")
                continue
            
            if not os.access(path, os.R_OK):
                invalid_paths.append(f"{path_str} (not readable)")
                continue
            
            # Accept files
            if path.is_file():
                valid_paths.append(path_str)
                continue
            
            # Accept folders if they are RAW folders
            if path.is_dir():
                raw_type = detect_raw_folder_type(path)
                if raw_type:
                    logger.debug(f"Detected {raw_type} folder: {path_str}")
                    valid_paths.append(path_str)
                else:
                    invalid_paths.append(f"{path_str} (not a recognized RAW folder or media file)")
                continue
            
            # Neither file nor directory
            invalid_paths.append(f"{path_str} (unknown path type)")
        
        return valid_paths, invalid_paths
    
    def _normalize_paths(self, paths: List[str]) -> List[str]:
        """
        Normalize paths to absolute, resolved paths.
        
        - Resolves symlinks
        - Converts to absolute path
        - Normalizes path separators
        """
        normalized: List[str] = []
        
        for path_str in paths:
            path = Path(path_str)
            
            # Resolve symlinks and make absolute
            resolved = path.resolve()
            normalized.append(str(resolved))
        
        return normalized
    
    def _validate_output_dir(self, output_dir: str) -> None:
        """
        Validate output directory is suitable for job creation.
        
        Strict validation: output directory MUST exist at job creation time.
        This prevents jobs from being created with invalid output paths.
        
        Raises:
            IngestionError: If output directory is invalid or does not exist
        """
        output_path = Path(output_dir)
        
        # Validate path syntax
        if not output_path.is_absolute():
            raise IngestionError(f"Output directory must be absolute path: {output_dir}")
        
        # Directory must exist
        if not output_path.exists():
            raise IngestionError(f"Output directory does not exist: {output_dir}")
        
        # Must be a directory, not a file
        if not output_path.is_dir():
            raise IngestionError(f"Output path is not a directory: {output_dir}")
    
    def _validate_codec_container(self, deliver_settings: "DeliverSettings", engine: str) -> None:
        """
        Validate codec/container compatibility and engine support.
        
        Blocks job creation if:
        1. Codec is not in CODEC_REGISTRY (unknown codec)
        2. Container is not valid for the codec
        3. Codec is not mapped in FFmpeg engine (for FFmpeg engine)
        
        This ensures the UI cannot create jobs that will fail at execution.
        
        Raises:
            IngestionError: With clear message for StatusLog display
        """
        video_codec = deliver_settings.video.codec.lower() if deliver_settings.video else "prores_422"
        container = deliver_settings.file.container.lower() if deliver_settings.file else "mov"
        
        # 1. Check codec exists in registry
        codec_spec = CODEC_REGISTRY.get(video_codec)
        if not codec_spec:
            raise IngestionError(
                f"Unsupported codec '{video_codec}'. "
                f"Available codecs: {', '.join(sorted(CODEC_REGISTRY.keys()))}. "
                "Please select a different codec."
            )
        
        # 2. Check container is valid for codec
        if not validate_codec_container(video_codec, container):
            valid_containers = ", ".join(codec_spec.supported_containers)
            raise IngestionError(
                f"Container '{container}' is not compatible with codec '{codec_spec.name}'. "
                f"Supported containers for {codec_spec.name}: {valid_containers}. "
                "Please select a compatible container."
            )
        
        # 3. Check codec is mapped in FFmpeg (if using FFmpeg engine)
        if engine.lower() == "ffmpeg":
            if video_codec not in FFMPEG_CODEC_MAP:
                raise IngestionError(
                    f"Codec '{codec_spec.name}' is not yet supported by FFmpeg engine. "
                    f"Mapped codecs: {', '.join(sorted(FFMPEG_CODEC_MAP.keys()))}. "
                    "Please select a different codec or wait for engine support."
                )
        
        logger.debug(
            f"Codec/container validation passed: {video_codec} → {container} (engine={engine})"
        )
    
    def _validate_engine(self, engine: str) -> None:
        """
        Validate engine type and availability.
        
        Raises:
            IngestionError: If engine is invalid or unavailable
        """
        from ..execution.base import EngineType
        
        try:
            engine_type = EngineType(engine)
        except ValueError:
            raise IngestionError(
                f"Invalid engine type: '{engine}'. Must be 'ffmpeg' or 'resolve'"
            )
        
        # Guard: engine_registry must be set (caller should check)
        if self.engine_registry is None:
            return  # Skip availability check if no registry
        
        if not self.engine_registry.is_available(engine_type):
            if engine_type == EngineType.RESOLVE:
                raise IngestionError("Resolve engine is not available in Proxy v1")
            else:
                raise IngestionError(f"Engine '{engine}' is not available on this system")
