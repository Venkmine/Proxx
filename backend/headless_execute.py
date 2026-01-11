"""
V2 Headless Execution - Execute JobSpec without UI involvement.

This module provides a parallel execution path for V2 Phase 1.
It executes validated JobSpec instances using existing FFmpeg engine helpers.

Design principles:
- NO UI involvement
- NO modification to V1 execution paths
- Synchronous execution (for now)
- Structured result reporting
- Explicit error propagation (no swallowing, no retries)

This enables future automation scenarios:
- Watch folder processing
- Batch queue processing
- CI/CD integration testing
- Scripted workflows
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import json
import logging
import os
import shutil
import subprocess
import sys

# Initialize logger for this module
logger = logging.getLogger(__name__)

from job_spec import JobSpec, JobSpecValidationError, FpsMode, JOBSPEC_VERSION
from execution_results import ClipExecutionResult, JobExecutionResult

# Image sequence extensions (V1 does NOT support these)
IMAGE_SEQUENCE_EXTENSIONS = {
    # RAW stills
    "dng", "nef", "cr2", "cr3", "arw", "ari",
    # Rendered stills
    "exr", "dpx", "tif", "tiff", "png", "jpg", "jpeg",
    # Other still formats
    "bmp", "pfm",
}

# Import image sequence detection
try:
    from v2.image_sequence import (
        detect_sequences_from_paths,
        collapse_sequence_to_single_source,
        is_image_sequence_format,
        ImageSequenceError,
    )
    _IMAGE_SEQUENCE_AVAILABLE = True
except ImportError:
    try:
        from backend.v2.image_sequence import (
            detect_sequences_from_paths,
            collapse_sequence_to_single_source,
            is_image_sequence_format,
            ImageSequenceError,
        )
        _IMAGE_SEQUENCE_AVAILABLE = True
    except ImportError:
        _IMAGE_SEQUENCE_AVAILABLE = False
        ImageSequenceError = None  # type: ignore

# Import source capabilities for engine routing
try:
    from v2.source_capabilities import (
        ExecutionEngine,
        get_execution_engine,
        validate_source_capability,
        SourceCapabilityError,
    )
    _SOURCE_CAPABILITIES_AVAILABLE = True
except ImportError:
    try:
        from backend.v2.source_capabilities import (
            ExecutionEngine,
            get_execution_engine,
            validate_source_capability,
            SourceCapabilityError,
        )
        _SOURCE_CAPABILITIES_AVAILABLE = True
    except ImportError:
        _SOURCE_CAPABILITIES_AVAILABLE = False
        ExecutionEngine = None  # type: ignore
        SourceCapabilityError = None  # type: ignore

# Import Resolve engine (optional - may not be available)
_RESOLVE_ENGINE_AVAILABLE = False
_RESOLVE_ENGINE_ERROR: Optional[str] = None

try:
    from v2.engines.resolve_engine import (
        ResolveEngine,
        ResolveAPIUnavailableError,
        ResolvePresetError,
        validate_resolve_preset,
    )
    _RESOLVE_ENGINE_AVAILABLE = True
except ImportError:
    try:
        from backend.v2.engines.resolve_engine import (
            ResolveEngine,
            ResolveAPIUnavailableError,
            ResolvePresetError,
            validate_resolve_preset,
        )
        _RESOLVE_ENGINE_AVAILABLE = True
    except ImportError as e:
        _RESOLVE_ENGINE_ERROR = f"Resolve engine not available: {e}"
        ResolveEngine = None  # type: ignore
        ResolveAPIUnavailableError = None  # type: ignore
        ResolvePresetError = None  # type: ignore
        validate_resolve_preset = None  # type: ignore


# -----------------------------------------------------------------------------
# Result Structure
# -----------------------------------------------------------------------------

@dataclass
class ExecutionResult:
    """
    Structured result of headless JobSpec execution.
    
    Captures everything needed to:
    - Determine success/failure
    - Debug issues
    - Integrate with automation systems
    """
    
    job_id: str
    """JobSpec job_id that was executed."""
    
    ffmpeg_command: List[str]
    """Complete FFmpeg command that was invoked."""
    
    exit_code: int
    """FFmpeg process exit code (0 = success)."""
    
    stdout: str
    """Captured stdout from FFmpeg."""
    
    stderr: str
    """Captured stderr from FFmpeg (contains progress/errors)."""
    
    output_path: str
    """Resolved output file path."""
    
    output_exists: bool
    """Whether output file exists after execution."""
    
    started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    """When execution started (UTC)."""
    
    completed_at: Optional[datetime] = None
    """When execution completed (UTC)."""
    
    @property
    def success(self) -> bool:
        """Check if execution was successful."""
        return self.exit_code == 0 and self.output_exists
    
    @property
    def duration_seconds(self) -> Optional[float]:
        """Execution duration in seconds."""
        if self.completed_at is None:
            return None
        return (self.completed_at - self.started_at).total_seconds()
    
    def to_dict(self) -> dict:
        """Serialize to dictionary for JSON output."""
        return {
            "job_id": self.job_id,
            "success": self.success,
            "exit_code": self.exit_code,
            "output_path": self.output_path,
            "output_exists": self.output_exists,
            "ffmpeg_command": self.ffmpeg_command,
            "stdout": self.stdout,
            "stderr": self.stderr,
            "started_at": self.started_at.isoformat(),
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "duration_seconds": self.duration_seconds,
        }
    
    def summary(self) -> str:
        """Concise human-readable summary."""
        status = "SUCCESS" if self.success else "FAILED"
        duration = f" ({self.duration_seconds:.1f}s)" if self.duration_seconds else ""
        return f"[{status}] Job {self.job_id}{duration} → {self.output_path}"


# -----------------------------------------------------------------------------
# FFmpeg Codec/Container Mappings (subset from engine)
# -----------------------------------------------------------------------------

FFMPEG_CODEC_MAP = {
    "h264": ["-c:v", "libx264"],
    "h265": ["-c:v", "libx265", "-tag:v", "hvc1"],
    "hevc": ["-c:v", "libx265", "-tag:v", "hvc1"],
    "av1": ["-c:v", "libaom-av1", "-cpu-used", "4"],
    "prores_proxy": ["-c:v", "prores_ks", "-profile:v", "0"],
    "prores_lt": ["-c:v", "prores_ks", "-profile:v", "1"],
    "prores_standard": ["-c:v", "prores_ks", "-profile:v", "2"],
    "prores_hq": ["-c:v", "prores_ks", "-profile:v", "3"],
    "prores_4444": ["-c:v", "prores_ks", "-profile:v", "4"],
    "dnxhd": ["-c:v", "dnxhd"],
    "dnxhr": ["-c:v", "dnxhd", "-profile:v", "dnxhr_hq"],
    "vp9": ["-c:v", "libvpx-vp9"],
}


# -----------------------------------------------------------------------------
# Engine Routing
# -----------------------------------------------------------------------------
# Determines which execution engine (FFmpeg or Resolve) should process a job.
# This is based purely on source format capability - NO user override.
# -----------------------------------------------------------------------------

def _is_raw_camera_folder(path: Path) -> bool:
    """
    Detect if a directory is a RAW camera card/folder structure.
    
    RAW camera folders contain video files that require Resolve, not still sequences.
    
    Detection criteria (checks for presence of RAW video file types):
    - RED: .R3D files (+ optional .RMD/.RDC sidecars)
    - ARRI: .arx files, ARRI MXF RAW structures
    - Sony: X-OCN MXF files
    - Canon: .crm files
    - Nikon: .nev files  
    - Blackmagic: .braw files
    - DJI: .dng files with bayer patterns (video, not stills)
    
    Returns:
        True if this is a RAW camera folder, False otherwise
    """
    if not path.is_dir():
        return False
    
    # RAW video file extensions (video formats that require Resolve)
    RAW_VIDEO_EXTENSIONS = {
        '.r3d', '.R3D',           # RED
        '.arx',                    # ARRI RAW
        '.nev', '.NEV',           # Nikon N-RAW
        '.braw',                   # Blackmagic RAW
        '.crm',                    # Canon RAW
    }
    
    try:
        files = list(path.iterdir())
        
        # Check for RAW video files
        raw_video_files = [f for f in files if f.suffix in RAW_VIDEO_EXTENSIONS]
        if raw_video_files:
            logger.info(f"[ROUTING] RAW camera folder detected: {path.name} ({len(raw_video_files)} RAW files) => Resolve")
            return True
        
        # Check for RAW MXF that might be ARRI/Sony (requires deeper inspection)
        mxf_files = [f for f in files if f.suffix.lower() == '.mxf']
        if mxf_files:
            # ARRI and Sony X-OCN use MXF containers
            # These will be detected via codec probing later
            # For now, mark as potential RAW if in known folder structures
            path_str = str(path).lower()
            if any(x in path_str for x in ['arri', 'sony', 'venice', 'burano', 'xocn']):
                logger.info(f"[ROUTING] Potential RAW camera folder: {path.name} (contains MXF in RAW path) => will probe")
                return True
        
    except (OSError, PermissionError):
        pass
    
    return False


def _is_image_sequence(path: Path) -> bool:
    """
    Detect if a path represents an image sequence (still frames).
    
    V1 does NOT support image sequences. This function provides early detection
    to fail fast with a clear error message.
    
    Detection rules:
    1. Extension is in IMAGE_SEQUENCE_EXTENSIONS (excluding .dng - special case)
    2. Path is a directory containing multiple numbered image files
    
    NOTE: .dng files are excluded from automatic rejection because they can be:
    - RAW video frames (DJI, some cameras) → route to Resolve for debayering
    - Still photo sequences → should be rejected
    The distinction is made later via ffprobe bayer pattern detection.
    
    Returns:
        True if this is an image sequence, False otherwise
    """
    # Check if extension matches known still image formats
    # Exclude .dng from this check - it requires ffprobe inspection
    ext = path.suffix.lower().lstrip(".")
    if ext in IMAGE_SEQUENCE_EXTENSIONS and ext != "dng":
        logger.info(f"[ROUTING] Image sequence detected: {path.name} (ext=.{ext}) => REJECTED (V1 unsupported)")
        return True
    
    # Check if path is a directory (common for frame sequences)
    if path.is_dir():
        # First check if it's a RAW camera folder (video, not stills)
        if _is_raw_camera_folder(path):
            return False  # RAW camera folders are NOT image sequences
        
        # Look for numbered image files inside
        try:
            files = list(path.iterdir())
            image_files = [f for f in files if f.suffix.lower().lstrip(".") in IMAGE_SEQUENCE_EXTENSIONS]
            if len(image_files) > 1:
                logger.info(f"[ROUTING] Image sequence folder detected: {path.name} ({len(image_files)} frames) => REJECTED (V1 unsupported)")
                return True
        except (OSError, PermissionError):
            pass
    
    return False


def _determine_job_engine(job_spec: JobSpec) -> Tuple[Optional[str], Optional[str]]:
    """
    Determine which execution engine should process this job.
    
    ROUTING RULES (NO USER OVERRIDE, NO HEURISTICS):
    - All sources must route to the SAME engine
    - Mixed jobs (RAW + non-RAW) are REJECTED
    - RAW formats → "resolve"
    - Standard formats → "ffmpeg"
    - Unknown/rejected formats → validation error
    
    ENGINE CAPABILITY GATING:
    - FFmpeg can only process standard codecs (H.264, ProRes, DNxHR, etc.)
    - FFmpeg CANNOT process RAW formats (Sony Venice, RED, ARRI, etc.)
    - RAW sources routed to FFmpeg will FAIL with explicit error
    
    Args:
        job_spec: JobSpec to analyze
        
    Returns:
        Tuple of (engine_name, error_message)
        - ("ffmpeg", None) for FFmpeg-routable jobs
        - ("resolve", None) for Resolve-routable jobs
        - (None, error_message) for invalid jobs
    """
    if not _SOURCE_CAPABILITIES_AVAILABLE:
        # Fall back to FFmpeg if capability routing not available
        return ("ffmpeg", None)
    
    if not job_spec.sources:
        return (None, "JobSpec has no sources")
    
    engines_required: Dict[str, List[str]] = {
        "ffmpeg": [],
        "resolve": [],
        "unknown": [],
    }
    
    for source_path in job_spec.sources:
        # Extract container from file extension
        source = Path(source_path)
        ext = source.suffix.lower().lstrip(".")
        
        # CHECK FOR RAW CAMERA FOLDERS FIRST (video content, not stills)
        if _is_raw_camera_folder(source):
            logger.info(f"[ROUTING TABLE] {source.name} => engine=resolve reason=RAW_camera_folder")
            engines_required["resolve"].append(source_path)
            continue
        
        # REJECT IMAGE SEQUENCES EARLY (V1 does not support still sequences)
        if _is_image_sequence(source):
            return (None, "Image sequences (DNG / EXR / DPX / TIFF) are not supported in V1. Sequence ingest will be added in V2.")
        
        # Exclude RED sidecar files and other non-video metadata
        # These should never be processed as video sources
        RED_SIDECAR_EXTENSIONS = {"rmd", "rdc", "rtn", "ale"}
        if ext in RED_SIDECAR_EXTENSIONS:
            logger.info(f"[ROUTING TABLE] {source.name} ext=.{ext} => SKIPPED reason=sidecar_file")
            continue
        
        container = ext
        
        # For source codec, we need to probe the file or infer from container
        # For now, use container-based heuristics for common RAW formats
        codec = _infer_codec_from_path(source)
        
        # Test FFmpeg decodability if possible (quick single-frame decode test)
        # Skip decode test for proprietary RAW files that require manufacturer SDKs
        raw_extensions_no_decode = {"r3d", "arx", "nev"}
        ffmpeg_decodable = False if ext in raw_extensions_no_decode else _test_ffmpeg_decodable(source)
        
        # Determine routing engine
        engine = get_execution_engine(container, codec)
        
        # Log routing table entry with full diagnostic metadata
        if engine == ExecutionEngine.FFMPEG:
            logger.info(
                f"[ROUTING TABLE] {source.name} container={container} codec={codec} "
                f"ffmpeg_decodable={ffmpeg_decodable} => engine=ffmpeg reason=standard_format"
            )
            engines_required["ffmpeg"].append(source_path)
        elif engine == ExecutionEngine.RESOLVE:
            logger.info(
                f"[ROUTING TABLE] {source.name} container={container} codec={codec} "
                f"ffmpeg_decodable={ffmpeg_decodable} => engine=resolve reason=raw_or_proprietary_format"
            )
            engines_required["resolve"].append(source_path)
        else:
            logger.warning(
                f"[ROUTING TABLE] {source.name} container={container} codec={codec} "
                f"ffmpeg_decodable={ffmpeg_decodable} => engine=UNKNOWN reason=unsupported_format"
            )
            engines_required["unknown"].append(source_path)
    
    # Check for unknown formats
    if engines_required["unknown"]:
        unknown_files = ", ".join(Path(p).name for p in engines_required["unknown"][:3])
        error_msg = f"Unsupported source format: {unknown_files}. Verify the source or transcode to ProRes/H.264."
        logger.error(f"[ENGINE ROUTING] {error_msg}")
        return (None, error_msg)
    
    # Check for mixed engine requirements
    has_ffmpeg = len(engines_required["ffmpeg"]) > 0
    has_resolve = len(engines_required["resolve"]) > 0
    
    if has_ffmpeg and has_resolve:
        ffmpeg_files = ", ".join(Path(p).name for p in engines_required["ffmpeg"][:2])
        resolve_files = ", ".join(Path(p).name for p in engines_required["resolve"][:2])
        error_msg = (
            f"Mixed job not allowed: FFmpeg sources ({ffmpeg_files}) and Resolve sources ({resolve_files}) "
            f"cannot be processed in the same job. Split into separate jobs by format type."
        )
        logger.error(f"[ENGINE ROUTING] {error_msg}")
        return (None, error_msg)
    
    if has_resolve:
        logger.info(f"[ENGINE ROUTING] Job routes to Resolve engine ({len(engines_required['resolve'])} RAW sources)")
        return ("resolve", None)
    
    logger.info(f"[ENGINE ROUTING] Job routes to FFmpeg engine ({len(engines_required['ffmpeg'])} standard sources)")
    return ("ffmpeg", None)


def _probe_codec_ffprobe(source_path: Path) -> Optional[str]:
    """
    Probe a file using ffprobe to get the actual video codec.
    
    Returns None if ffprobe fails or codec cannot be determined.
    """
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return None
    
    try:
        result = subprocess.run(
            [
                ffprobe,
                "-v", "quiet",
                "-select_streams", "v:0",
                "-show_entries", "stream=codec_name",
                "-of", "csv=p=0",
                str(source_path),
            ],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip().lower()
    except (subprocess.TimeoutExpired, Exception):
        pass
    return None


def _test_ffmpeg_decodable(source_path: Path) -> bool:
    """
    Test if FFmpeg can decode this file by attempting a single-frame decode.
    
    This is a quick diagnostic check (not used for routing decisions).
    Routing is purely based on codec/container detection.
    
    Args:
        source_path: Path to source file
        
    Returns:
        True if FFmpeg can decode the file, False otherwise
    """
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg or not source_path.exists():
        return False
    
    try:
        result = subprocess.run(
            [
                ffmpeg,
                "-v", "error",
                "-i", str(source_path),
                "-map", "0:v:0",
                "-frames:v", "1",
                "-f", "null",
                "-",
            ],
            capture_output=True,
            timeout=10,
        )
        return result.returncode == 0
    except (subprocess.TimeoutExpired, Exception):
        return False


def _infer_codec_from_path(source_path: Path) -> str:
    """
    Infer codec from file path, with optional ffprobe for ambiguous containers.
    
    For well-known RAW extensions (.braw, .r3d, etc.), uses extension-based detection.
    For ambiguous containers like MXF and MOV (which can contain standard or RAW codecs),
    probes the file to determine the actual codec.
    
    Args:
        source_path: Path to source file
        
    Returns:
        Inferred codec string for capability lookup
    """
    ext = source_path.suffix.lower().lstrip(".")
    
    # RED RAW files - route directly to Resolve without probing
    # RED files often fail ffprobe (require RED SDK) and must not be tested with FFmpeg
    # Use extension as codec fallback for capability lookup
    if ext == "r3d":
        logger.info(f"[ROUTING] RED RAW detected (.r3d) → Resolve (SDK required)")
        return "r3d"  # Use extension as codec - will be caught by RAW_CODECS_RESOLVE
    
    # ARRI RAW files - route directly to Resolve without probing
    # ARRI .arx files often fail ffprobe (require ARRI SDK) and must not be tested with FFmpeg
    if ext == "arx":
        logger.info(f"[ROUTING TABLE] {source_path.name} ext=.arx => engine=resolve reason=ARRI RAW")
        return "arriraw"
    
    # Nikon N-RAW files - route directly to Resolve without probing
    # Nikon .nev files report codec=unknown in ffprobe
    if ext == "nev":
        logger.info(f"[ROUTING TABLE] {source_path.name} ext=.nev => engine=resolve reason=Nikon N-RAW")
        return "nikon_raw"
    
    # RAW format extensions that require Resolve
    raw_extensions = {
        "ari": "arriraw",      # ARRI RAW (.ari)
        "braw": "braw",        # Blackmagic RAW
        "crm": "canon_raw",    # Canon Cinema RAW
        "dng": "cinemadng",    # CinemaDNG / DJI RAW
        "exr": "exr",          # OpenEXR (not RAW, but requires Resolve)
    }
    
    if ext in raw_extensions:
        return raw_extensions[ext]
    
    # Ambiguous containers that need probing (can contain RAW or standard codecs)
    # MOV can contain ProRes, H.264, or ProRes RAW
    # MXF can contain DNxHD, MPEG-2, or ARRIRAW
    ambiguous_containers = {"mxf", "mov"}
    
    if ext in ambiguous_containers:
        # Probe the actual codec
        probed_codec = _probe_codec_ffprobe(source_path)
        if probed_codec:
            # Check for ProRes RAW (reported as 'prores_raw' by ffprobe)
            if 'prores_raw' in probed_codec or 'prores raw' in probed_codec.lower():
                logger.info(f"[CODEC PROBE] ProRes RAW detected: {source_path.name} → Resolve engine")
                return "prores_raw"
            
            # If ffprobe returns "unknown", this indicates a proprietary RAW codec
            # that FFmpeg cannot decode - route to Resolve
            if probed_codec == "unknown":
                logger.info(f"[CODEC PROBE] {ext.upper()} with 'unknown' codec detected: {source_path.name} → assuming RAW format")
                # For MXF/MOV with unknown codec, this is likely Sony Venice, ARRI, or other RAW
                # The 'unknown' codec will be caught by RAW_CODECS_RESOLVE and routed to Resolve
                return "unknown"
            logger.info(f"[CODEC PROBE] {ext.upper()} probed: {source_path.name} → codec={probed_codec}")
            return probed_codec
    
    # For standard containers, assume FFmpeg-compatible codecs
    # The actual codec doesn't matter for routing - these all go to FFmpeg
    standard_containers = {
        "mp4": "h264",
        "mov": "prores",  # Assume standard ProRes for MOV (if probe failed)
        "mxf": "dnxhd",
        "mkv": "h264",
        "webm": "vp9",
        "avi": "mjpeg",
        "ts": "mpeg2video",
        "mpg": "mpeg2video",
    }
    
    return standard_containers.get(ext, "h264")  # Default to h264 for unknown


# -----------------------------------------------------------------------------
# Path and Token Resolution
# -----------------------------------------------------------------------------

def _find_ffmpeg() -> Optional[str]:
    """Find FFmpeg binary path."""
    # Try PATH first
    ffmpeg_path = shutil.which("ffmpeg")
    if ffmpeg_path:
        return ffmpeg_path
    
    # Common install locations
    common_paths = [
        "/usr/local/bin/ffmpeg",
        "/usr/bin/ffmpeg",
        "/opt/homebrew/bin/ffmpeg",
    ]
    for path in common_paths:
        if os.path.isfile(path) and os.access(path, os.X_OK):
            return path
    
    return None


def _resolve_naming_tokens(
    template: str,
    source_path: Path,
    job_spec: JobSpec,
    index: int = 0,
) -> str:
    """
    Resolve naming template tokens to final filename (without extension).
    
    Supported tokens:
    - {source_name}: Source filename without extension
    - {source_ext}: Source file extension (without dot)
    - {job_id}: JobSpec job_id
    - {date}: Current date (YYYYMMDD)
    - {time}: Current time (HHMMSS)
    - {index}: File index (for multi-source jobs)
    - {codec}: Output codec
    - {resolution}: Target resolution string
    """
    now = datetime.now()
    
    token_values = {
        "source_name": source_path.stem,
        "source_ext": source_path.suffix.lstrip("."),
        "job_id": job_spec.job_id,
        "date": now.strftime("%Y%m%d"),
        "time": now.strftime("%H%M%S"),
        "index": str(index).zfill(3),
        "codec": job_spec.codec,
        "resolution": job_spec.resolution,
    }
    
    result = template
    for token, value in token_values.items():
        result = result.replace(f"{{{token}}}", value)
    
    # Clean up any double underscores from empty tokens
    while "__" in result:
        result = result.replace("__", "_")
    
    return result.strip("_") or source_path.stem


def _resolve_output_path(
    source_path: Path,
    job_spec: JobSpec,
    index: int = 0,
) -> Path:
    """
    Resolve output path for a source file using proxy profile.
    
    V2 Step 5: Profile-Driven Output Naming
    ========================================
    Output container extension is now derived from the proxy profile,
    not from ad-hoc JobSpec fields.
    
    Uses:
    - job_spec.output_directory as base
    - job_spec.naming_template for filename
    - profile.container for extension (derived from proxy_profile)
    """
    # Import proxy profile utilities
    try:
        from v2.proxy_profiles import get_profile
    except ImportError:
        from backend.v2.proxy_profiles import get_profile
    
    output_dir = Path(job_spec.output_directory)
    
    # Resolve filename from template
    filename = _resolve_naming_tokens(
        template=job_spec.naming_template,
        source_path=source_path,
        job_spec=job_spec,
        index=index,
    )
    
    # Get container from proxy profile
    profile = get_profile(job_spec.proxy_profile)
    extension = profile.container.lstrip(".")
    output_filename = f"{filename}.{extension}"
    
    return output_dir / output_filename


def _verify_output(output_path: Path) -> tuple[bool, Optional[int]]:
    """
    Verify output file exists and has size > 0.
    
    Returns:
        Tuple of (exists, size_bytes)
        - exists: True if file exists and size > 0
        - size_bytes: File size in bytes, or None if doesn't exist
    """
    if not output_path.is_file():
        return False, None
    
    try:
        size = output_path.stat().st_size
        return size > 0, size
    except OSError:
        return False, None


def _build_ffmpeg_command(
    ffmpeg_path: str,
    source_path: str,
    output_path: str,
    job_spec: JobSpec,
    lut_filepath: Optional[str] = None,
    source_audio_props = None,
) -> List[str]:
    """
    Build FFmpeg command from JobSpec using canonical proxy profile.
    
    V2 Step 5: Profile-Based Command Building
    ==========================================
    Commands are now built ONLY from proxy profiles. No ad-hoc settings,
    no user overrides, no passthrough flags.
    
    The profile determines:
    - Codec arguments (including quality settings)
    - Resolution scaling policy
    - Audio handling policy
    
    LUT Support:
    - If lut_filepath is provided, adds -vf lut3d filter
    - LUT is applied BEFORE any resolution scaling
    - Supported formats: .cube, .3dl
    
    Audio Parity Enforcement:
    - Probes source audio properties
    - Enforces exact channel count match
    - Enforces sample rate match
    - Validates container compatibility
    
    Args:
        ffmpeg_path: Path to FFmpeg executable
        source_path: Input file path
        output_path: Output file path
        job_spec: JobSpec with proxy_profile specified
        lut_filepath: Optional path to LUT file to apply
        
    Returns:
        Complete FFmpeg command as list of strings
    """
    # Import proxy profile utilities
    try:
        from v2.proxy_profiles import (
            get_profile,
            resolve_ffmpeg_codec_args,
            resolve_ffmpeg_resolution_args,
            resolve_ffmpeg_audio_args,
        )
    except ImportError:
        from backend.v2.proxy_profiles import (
            get_profile,
            resolve_ffmpeg_codec_args,
            resolve_ffmpeg_resolution_args,
            resolve_ffmpeg_audio_args,
        )
    
    # Import audio probe utilities for parity enforcement
    try:
        from audio_probe import validate_container_compatibility
    except ImportError:
        try:
            from backend.audio_probe import validate_container_compatibility
        except ImportError:
            validate_container_compatibility = None
    
    # Get profile (validation already done, this should not fail)
    profile = get_profile(job_spec.proxy_profile)
    
    # Validate container compatibility if audio props provided
    container_ext = Path(output_path).suffix.lstrip('.').lower()
    
    if source_audio_props is not None and validate_container_compatibility is not None:
        try:
            compatible, error_msg = validate_container_compatibility(
                container_ext, 
                source_audio_props.channels
            )
            if not compatible:
                logger.warning(f"Container compatibility warning: {error_msg}")
                # Force error for multichannel MP4
                if source_audio_props.channels > 2 and container_ext == 'mp4':
                    logger.error(
                        f"CRITICAL: MP4 container cannot support {source_audio_props.channels} channels. "
                        "Use MOV container for attach compatibility."
                    )
                    raise ValueError(error_msg)
        except Exception as e:
            logger.warning(f"Container validation error: {e}")
    
    # Start building command
    cmd = [ffmpeg_path, "-y"]  # -y to overwrite output
    
    # Input file
    cmd.extend(["-i", source_path])
    
    # Build video filter chain
    # LUT must be applied first, then scaling
    vf_filters = []
    
    # Add LUT filter if provided
    if lut_filepath:
        # FFmpeg lut3d filter supports .cube and .3dl formats
        # The filter automatically detects format from extension
        vf_filters.append(f"lut3d='{lut_filepath}'")
    
    # Resolution arguments from profile (may include scale filter)
    resolution_args = resolve_ffmpeg_resolution_args(profile)
    
    # Check if resolution_args contains a -vf flag and extract filters
    if resolution_args:
        vf_index = None
        for i, arg in enumerate(resolution_args):
            if arg == "-vf":
                vf_index = i
                break
        
        if vf_index is not None and vf_index + 1 < len(resolution_args):
            # Extract the filter from resolution args
            resolution_filter = resolution_args[vf_index + 1]
            vf_filters.append(resolution_filter)
            # Remove -vf and its argument from resolution_args
            resolution_args = resolution_args[:vf_index] + resolution_args[vf_index + 2:]
    
    # Apply combined video filters
    if vf_filters:
        cmd.extend(["-vf", ",".join(vf_filters)])
    
    # Add remaining resolution args (if any)
    if resolution_args:
        cmd.extend(resolution_args)
    
    # Codec arguments from profile
    cmd.extend(resolve_ffmpeg_codec_args(profile))
    
    # Audio arguments from profile with parity enforcement
    audio_args = resolve_ffmpeg_audio_args(profile)
    
    # Override audio args to enforce exact parity with source
    if source_audio_props is not None:
        # Force exact audio parity for attach compatibility
        # Use PCM for maximum NLE compatibility
        audio_args = [
            "-c:a", "pcm_s16le",
            "-ar", str(source_audio_props.sample_rate),
            "-ac", str(source_audio_props.channels)
        ]
        # Preserve channel layout if specified
        if source_audio_props.channel_layout:
            audio_args.extend(["-channel_layout", source_audio_props.channel_layout])
        
        logger.info(
            f"Enforcing audio parity: {source_audio_props.channels}ch @ "
            f"{source_audio_props.sample_rate}Hz, layout={source_audio_props.channel_layout}"
        )
    
    cmd.extend(audio_args)
    
    # Output file
    cmd.append(output_path)
    
    return cmd


# -----------------------------------------------------------------------------
# Main Execution Function
# -----------------------------------------------------------------------------

# -----------------------------------------------------------------------------
# Main Execution Function
# -----------------------------------------------------------------------------

def execute_job_spec(
    job_spec: JobSpec, 
    index: int = 0,
    engine_used: Optional[str] = None,
    proxy_profile_used: Optional[str] = None,
    resolve_preset_used: Optional[str] = None,
) -> ClipExecutionResult:
    """
    Execute a single clip from a JobSpec without UI involvement.
    
    V2 Phase 1 Hardening: Per-Clip Execution with Verification
    ===========================================================
    This function executes ONE source clip and returns a ClipExecutionResult
    with complete verification and audit trail.
    
    Execution steps:
    1. Resolve output path deterministically
    2. Build FFmpeg command
    3. Execute synchronously
    4. Verify output exists and size > 0
    5. Return ClipExecutionResult with complete information
    
    Args:
        job_spec: A complete JobSpec instance (may have multiple sources)
        index: Index of the source to execute (0-based)
        
    Returns:
        ClipExecutionResult with all execution details
        
    Raises:
        IndexError: If index is out of range for job_spec.sources
        JobSpecValidationError: If FFmpeg not found (only on first call)
        
    Note:
        - Execution failures do NOT raise exceptions
        - All failures are captured in ClipExecutionResult
        - Check result.status == "COMPLETED" for success
    """
    started_at = datetime.now(timezone.utc)
    
    logger.info(f"[EXECUTE] Starting clip execution: job_id={job_spec.job_id}, source_index={index}")
    
    # Get source path
    if index >= len(job_spec.sources):
        raise IndexError(f"Source index {index} out of range (job has {len(job_spec.sources)} sources)")
    
    source_path = Path(job_spec.sources[index])
    
    logger.info(f"[EXECUTE] Processing source: {source_path.name}")
    
    # Find FFmpeg
    ffmpeg_path = _find_ffmpeg()
    if not ffmpeg_path:
        logger.error(f"[EXECUTE] FFmpeg not found in PATH")
        return ClipExecutionResult(
            source_path=str(source_path),
            resolved_output_path="",
            ffmpeg_command=[],
            exit_code=-1,
            output_exists=False,
            output_size_bytes=None,
            status="FAILED",
            failure_reason="FFmpeg not found. Install FFmpeg to use headless execution.",
            validation_stage="validation",
            engine_used=engine_used or "ffmpeg",
            proxy_profile_used=proxy_profile_used or job_spec.proxy_profile,
            resolve_preset_used=resolve_preset_used,
            started_at=started_at,
            completed_at=datetime.now(timezone.utc),
        )
    
    logger.info(f"[EXECUTE] FFmpeg found at: {ffmpeg_path}")
    
    # Resolve output path
    output_path = _resolve_output_path(source_path, job_spec, index=index)
    
    logger.info(f"[EXECUTE] Output path resolved: {output_path}")
    
    # Ensure output directory exists
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Validate and resolve LUT if specified
    lut_filepath = None
    lut_hash = None
    lut_name = None
    lut_applied = False
    
    if job_spec.lut_id is not None:
        try:
            from lut_registry import (
                validate_lut_for_engine,
                LUTRegistryError,
            )
        except ImportError:
            try:
                from backend.lut_registry import (
                    validate_lut_for_engine,
                    LUTRegistryError,
                )
            except ImportError:
                return ClipExecutionResult(
                    source_path=str(source_path),
                    resolved_output_path=str(output_path),
                    ffmpeg_command=[],
                    exit_code=-1,
                    output_exists=False,
                    output_size_bytes=None,
                    status="FAILED",
                    failure_reason=f"LUT registry module not available. Cannot apply lut_id='{job_spec.lut_id}'.",
                    validation_stage="validation",
                    engine_used=engine_used or "ffmpeg",
                    proxy_profile_used=proxy_profile_used or job_spec.proxy_profile,
                    resolve_preset_used=resolve_preset_used,
                    started_at=started_at,
                    completed_at=datetime.now(timezone.utc),
                )
        
        try:
            lut_entry = validate_lut_for_engine(job_spec.lut_id, "ffmpeg")
            lut_filepath = lut_entry.filepath
            lut_hash = lut_entry.file_hash
            lut_name = lut_entry.filename
        except LUTRegistryError as e:
            return ClipExecutionResult(
                source_path=str(source_path),
                resolved_output_path=str(output_path),
                ffmpeg_command=[],
                exit_code=-1,
                output_exists=False,
                output_size_bytes=None,
                status="FAILED",
                failure_reason=f"LUT validation failed: {e}",
                validation_stage="validation",
                engine_used=engine_used or "ffmpeg",
                proxy_profile_used=proxy_profile_used or job_spec.proxy_profile,
                resolve_preset_used=resolve_preset_used,
                started_at=started_at,
                completed_at=datetime.now(timezone.utc),
            )
    
    # Probe source audio for attach compatibility enforcement
    source_audio_props = None
    try:
        from audio_probe import probe_audio, AudioProbeError
    except ImportError:
        try:
            from backend.audio_probe import probe_audio, AudioProbeError
        except ImportError:
            probe_audio = None
            AudioProbeError = Exception
    
    if probe_audio is not None:
        try:
            source_audio_props = probe_audio(source_path)
        except AudioProbeError as e:
            logger.warning(f"Could not probe source audio: {e}")
        except Exception as e:
            logger.warning(f"Audio probe error: {e}")
    
    # Build command
    ffmpeg_command = _build_ffmpeg_command(
        ffmpeg_path=ffmpeg_path,
        source_path=str(source_path),
        output_path=str(output_path),
        job_spec=job_spec,
        lut_filepath=lut_filepath,
        source_audio_props=source_audio_props,
    )
    
    logger.info(f"[EXECUTE] FFmpeg command built: {' '.join(ffmpeg_command[:10])}...")
    logger.info(f"[EXECUTE] Full command: {' '.join(ffmpeg_command)}")
    
    # ═══════════════════════════════════════════════════════════════════════════
    # EXECUTION_STARTED EVENT - QC_ACTION_TRACE NORMATIVE REQUIREMENT
    # ═══════════════════════════════════════════════════════════════════════════
    # This log line marks the EXACT moment FFmpeg execution begins.
    # It MUST be emitted BEFORE subprocess.run() is called.
    # This is NOT inferred, NOT post-hoc, NOT optional.
    # See: docs/QC_ACTION_TRACE.md (NORMATIVE)
    #
    # The QC_ACTION_TRACE golden path requires, IN ORDER:
    #   SELECT_SOURCE → CREATE_JOB → ADD_TO_QUEUE → EXECUTION_STARTED → EXECUTION_COMPLETED
    #
    # If EXECUTION_STARTED is missing from traces, tests fail.
    # ═══════════════════════════════════════════════════════════════════════════
    execution_started_at = datetime.now(timezone.utc)
    logger.info(f"[QC_TRACE] EXECUTION_STARTED job_id={job_spec.job_id} source={source_path.name} timestamp={execution_started_at.isoformat()}")
    
    # Execute synchronously
    logger.info(f"[EXECUTE] Starting FFmpeg process...")
    try:
        process = subprocess.run(
            ffmpeg_command,
            capture_output=True,
            text=True,
            timeout=3600,  # 1 hour timeout for long renders
        )
        exit_code = process.returncode
        stderr = process.stderr
        logger.info(f"[EXECUTE] FFmpeg completed with exit code: {exit_code}")
    except subprocess.TimeoutExpired:
        exit_code = -1
        stderr = "Execution timed out after 3600 seconds"
        logger.error(f"[EXECUTE] FFmpeg timed out after 3600 seconds")
    except Exception as e:
        exit_code = -1
        stderr = f"Execution failed: {e}"
        logger.error(f"[EXECUTE] FFmpeg execution failed: {e}")
    
    completed_at = datetime.now(timezone.utc)
    
    # Verify output
    logger.info(f"[EXECUTE] Verifying output file...")
    output_exists, output_size = _verify_output(output_path)
    logger.info(f"[EXECUTE] Output exists: {output_exists}, size: {output_size} bytes")
    
    # Verify audio parity if source was probed
    audio_parity_passed = True
    audio_parity_error = None
    
    if output_exists and source_audio_props is not None:
        try:
            from audio_probe import verify_audio_parity
        except ImportError:
            try:
                from backend.audio_probe import verify_audio_parity
            except ImportError:
                verify_audio_parity = None
        
        if verify_audio_parity is not None:
            audio_parity_passed, audio_parity_error = verify_audio_parity(
                Path(source_path),
                Path(output_path)
            )
            if not audio_parity_passed:
                logger.error(f"Audio parity check FAILED: {audio_parity_error}")
            else:
                logger.info("Audio parity check PASSED")
    
    # Determine status and failure reason
    if exit_code != 0:
        status = "FAILED"
        failure_reason = f"FFmpeg exited with code {exit_code}"
    elif not output_exists:
        status = "FAILED"
        failure_reason = "Output file does not exist or has zero size"
    elif not audio_parity_passed:
        status = "FAILED"
        failure_reason = f"Audio parity validation failed: {audio_parity_error}"
    else:
        status = "COMPLETED"
        failure_reason = None
        # Mark LUT as successfully applied if execution succeeded
        if lut_filepath:
            lut_applied = True
    
    # ═══════════════════════════════════════════════════════════════════════════
    # EXECUTION_COMPLETED EVENT - QC_ACTION_TRACE NORMATIVE REQUIREMENT
    # ═══════════════════════════════════════════════════════════════════════════
    # This log line marks the EXACT moment clip execution completes.
    # See: docs/QC_ACTION_TRACE.md (NORMATIVE)
    # ═══════════════════════════════════════════════════════════════════════════
    execution_completed_at = datetime.now(timezone.utc)
    duration_ms = int((execution_completed_at - execution_started_at).total_seconds() * 1000)
    logger.info(f"[QC_TRACE] EXECUTION_COMPLETED job_id={job_spec.job_id} source={source_path.name} status={status} duration_ms={duration_ms} timestamp={execution_completed_at.isoformat()}")
    
    # Build result with LUT audit information in command
    # Add LUT metadata as comments in the command list for audit trail
    audit_command = list(ffmpeg_command)
    if lut_filepath and lut_applied:
        audit_command.append(f"# LUT applied: {lut_name}")
        audit_command.append(f"# LUT hash: {lut_hash}")
        audit_command.append(f"# LUT engine: ffmpeg")
    
    return ClipExecutionResult(
        source_path=str(source_path),
        resolved_output_path=str(output_path),
        ffmpeg_command=audit_command,
        exit_code=exit_code,
        output_exists=output_exists,
        output_size_bytes=output_size,
        status=status,
        failure_reason=failure_reason,
        validation_stage="execution" if status == "FAILED" else None,
        engine_used=engine_used or "ffmpeg",
        proxy_profile_used=proxy_profile_used or job_spec.proxy_profile,
        resolve_preset_used=resolve_preset_used,
        started_at=started_at,
        completed_at=completed_at,
    )


def _detect_and_collapse_sequences(job_spec: JobSpec) -> Tuple[JobSpec, Optional[Dict]]:
    """
    Detect image sequences and collapse them into single logical sources.
    
    MANDATORY BEHAVIOR:
    - Image sequence jobs MUST result in ONE output file
    - Sequences are detected by numbered frames
    - Multiple sequences or mixed formats are rejected
    
    Args:
        job_spec: Original JobSpec with potentially multiple frames
        
    Returns:
        Tuple of (modified_jobspec, sequence_metadata)
        - modified_jobspec: JobSpec with collapsed sources
        - sequence_metadata: Dict with sequence info (or None if not a sequence)
        
    Raises:
        JobSpecValidationError: If sequence validation fails
    """
    if not _IMAGE_SEQUENCE_AVAILABLE:
        # No sequence detection available, pass through unchanged
        return (job_spec, None)
    
    # Check if any sources are image sequence formats
    source_paths = [Path(s) for s in job_spec.sources]
    has_sequence_formats = any(is_image_sequence_format(p) for p in source_paths)
    
    if not has_sequence_formats:
        # No image sequences, pass through unchanged
        return (job_spec, None)
    
    # Detect sequences
    try:
        sequences, standalone = detect_sequences_from_paths(source_paths)
    except ImageSequenceError as e:
        raise JobSpecValidationError(f"Image sequence detection failed: {e}")
    
    # If we detected a sequence, validate it's the only thing in this job
    if sequences:
        if len(sequences) > 1:
            raise JobSpecValidationError(
                f"Multiple image sequences detected ({len(sequences)} sequences). "
                f"Each job must contain only ONE sequence. Split into separate jobs."
            )
        
        if standalone:
            raise JobSpecValidationError(
                f"Mixed sources detected: {len(sequences)} sequence(s) and "
                f"{len(standalone)} standalone file(s). Image sequence jobs must "
                f"contain ONLY sequence frames."
            )
        
        # We have exactly one sequence - collapse it
        sequence = sequences[0]
        
        # Create modified JobSpec with first frame as the single source
        # The Resolve engine will detect the rest of the sequence
        modified_spec = JobSpec(
            sources=[str(sequence.frame_files[0])],  # First frame only
            output_directory=job_spec.output_directory,
            codec=job_spec.codec,
            container=job_spec.container,
            resolution=job_spec.resolution,
            naming_template=job_spec.naming_template,
            fps_mode=job_spec.fps_mode,
            fps_explicit=job_spec.fps_explicit,
            proxy_profile=job_spec.proxy_profile,
            resolve_preset=job_spec.resolve_preset,
            requires_resolve_edition=job_spec.requires_resolve_edition,
            job_id=job_spec.job_id,
            resolved_tokens=job_spec.resolved_tokens,
            created_at=job_spec.created_at,
        )
        
        # Create sequence metadata
        sequence_metadata = {
            'is_sequence': True,
            'pattern': sequence.pattern,
            'frame_count': sequence.frame_count,
            'first_frame': sequence.first_frame,
            'last_frame': sequence.last_frame,
            'original_source_count': len(job_spec.sources),
        }
        
        print(f"Detected image sequence: {sequence.pattern}")
        print(f"  Frames: {sequence.first_frame}-{sequence.last_frame} ({sequence.frame_count} total)")
        print(f"  Collapsed {len(job_spec.sources)} sources → 1 logical source")
        
        return (modified_spec, sequence_metadata)
    
    # No sequences detected, pass through unchanged
    return (job_spec, None)


def execute_multi_job_spec(job_spec: JobSpec) -> JobExecutionResult:
    """
    Execute a multi-source JobSpec with automatic engine routing.
    
    V2 Phase 2: Capability-Based Engine Routing
    ============================================
    This function automatically selects the appropriate execution engine
    (FFmpeg or Resolve) based on source format capabilities.
    
    Engine Routing Rules (NO USER OVERRIDE, NO HEURISTICS):
    - RAW formats (ARRIRAW, REDCODE, BRAW, etc.) → Resolve engine
    - Standard formats (H.264, ProRes, DNxHD, etc.) → FFmpeg engine
    - Mixed jobs (RAW + non-RAW) → REJECTED with clear error
    - Unknown formats → REJECTED with validation error
    
    Behavior:
    ---------
    1. Validates the entire JobSpec
    2. Determines required engine based on source formats
    3. Rejects mixed-engine jobs with explicit error
    4. Dispatches to appropriate engine (FFmpeg or Resolve)
    5. Logs engine choice in result metadata
    6. Returns JobExecutionResult with engine metadata
    
    Args:
        job_spec: A complete JobSpec with one or more sources
        
    Returns:
        JobExecutionResult containing:
        - All ClipExecutionResults (successful + failed)
        - Final job status (COMPLETED, FAILED, or PARTIAL)
        - Engine selection in _metadata
        
    Raises:
        JobSpecValidationError: If JobSpec validation fails before execution
        
    Note:
        - Execution failures do NOT raise exceptions
        - Check result.success or result.final_status
        - Partial results returned if any source fails (fail-fast behavior)
    """
    started_at = datetime.now(timezone.utc)
    
    logger.info(f"[JOB EXECUTION] Starting multi-source job execution")
    logger.info(f"[JOB EXECUTION] Job ID: {job_spec.job_id}")
    logger.info(f"[JOB EXECUTION] Sources: {len(job_spec.sources)}")
    logger.info(f"[JOB EXECUTION] Proxy profile: {job_spec.proxy_profile}")
    logger.info(f"[JOB EXECUTION] Output directory: {job_spec.output_directory}")
    
    # Step 1: Validate the entire JobSpec once
    logger.info(f"[JOB EXECUTION] Validating JobSpec...")
    try:
        job_spec.validate(check_paths=True)
        logger.info(f"[JOB EXECUTION] JobSpec validation passed")
    except JobSpecValidationError as e:
        # Return FAILED status with validation error captured
        logger.error(f"[JOB EXECUTION] JobSpec validation failed: {e}")
        return JobExecutionResult(
            job_id=job_spec.job_id,
            clips=[],
            final_status="FAILED",
            validation_error=str(e),
            jobspec_version=JOBSPEC_VERSION,
            started_at=started_at,
            completed_at=datetime.now(timezone.utc),
        )
    
    # Step 1.5: Detect and collapse image sequences
    # This MUST happen before engine routing because it changes the sources list
    try:
        job_spec, sequence_metadata = _detect_and_collapse_sequences(job_spec)
    except JobSpecValidationError as e:
        return JobExecutionResult(
            job_id=job_spec.job_id,
            clips=[],
            final_status="FAILED",
            validation_error=f"Image sequence validation failed: {e}",
            jobspec_version=JOBSPEC_VERSION,
            started_at=started_at,
            completed_at=datetime.now(timezone.utc),
        )
    
    # Step 2: Determine which engine to use based on source capabilities
    logger.info(f"[JOB EXECUTION] Determining execution engine...")
    engine_name, engine_error = _determine_job_engine(job_spec)
    
    if engine_name:
        logger.info(f"[JOB EXECUTION] Engine selected: {engine_name}")
    
    if engine_error:
        # Engine routing failed (mixed job or unsupported format)
        logger.error(f"[JOB EXECUTION] Engine routing failed: {engine_error}")
        return JobExecutionResult(
            job_id=job_spec.job_id,
            clips=[],
            final_status="FAILED",
            validation_error=f"Engine routing failed: {engine_error}",
            jobspec_version=JOBSPEC_VERSION,
            started_at=started_at,
            completed_at=datetime.now(timezone.utc),
        )
    
    # Step 2.5: Validate proxy_profile based on engine routing
    # V2 Step 5: Canonical Proxy Profiles
    # - FFmpeg jobs MUST use FFmpeg profiles
    # - Resolve jobs MUST use Resolve profiles
    try:
        job_spec.validate_proxy_profile(routes_to_resolve=(engine_name == "resolve"))
    except JobSpecValidationError as e:
        return JobExecutionResult(
            job_id=job_spec.job_id,
            clips=[],
            final_status="FAILED",
            validation_error=str(e),
            jobspec_version=JOBSPEC_VERSION,
            engine_used=engine_name,
            started_at=started_at,
            completed_at=datetime.now(timezone.utc),
        )
    
    # Step 2.6: Validate resolve_preset based on engine routing
    # V2 Deterministic Preset Contract:
    # - Resolve jobs MUST specify resolve_preset
    # - FFmpeg jobs MUST NOT specify resolve_preset
    try:
        job_spec.validate_resolve_preset(routes_to_resolve=(engine_name == "resolve"))
    except JobSpecValidationError as e:
        return JobExecutionResult(
            job_id=job_spec.job_id,
            clips=[],
            final_status="FAILED",
            validation_error=str(e),
            jobspec_version=JOBSPEC_VERSION,
            engine_used=engine_name,
            started_at=started_at,
            completed_at=datetime.now(timezone.utc),
        )
    
    # Step 3: Execute with the selected engine
    logger.info(f"[JOB EXECUTION] Dispatching to {engine_name} engine...")
    if engine_name == "resolve":
        result = _execute_with_resolve(job_spec, started_at)
    else:
        # Default to FFmpeg
        result = _execute_with_ffmpeg(job_spec, started_at)
    
    # Step 4: Set engine metadata in result
    logger.info(f"[JOB EXECUTION] Execution complete: final_status={result.final_status}")
    result.engine_used = engine_name
    result.proxy_profile_used = job_spec.proxy_profile
    
    return result


def _execute_with_ffmpeg(job_spec: JobSpec, started_at: datetime) -> JobExecutionResult:
    """
    Execute job using FFmpeg engine (standard formats).
    
    This is the original execution path for standard video formats.
    
    INVARIANT: RAW formats must NEVER reach this function.
    FFmpeg cannot decode proprietary RAW formats (ARRIRAW, REDCODE, BRAW).
    """
    logger.info(f"[FFMPEG ENGINE] Starting FFmpeg execution for job: {job_spec.job_id}")
    logger.info(f"[FFMPEG ENGINE] Processing {len(job_spec.sources)} source(s)")
    
    # =========================================================================
    # PHASE 12 INVARIANT: RAW formats must NEVER reach FFmpeg
    # =========================================================================
    # This is a FATAL guard. If we get here with RAW sources, something has
    # gone wrong in the routing logic. Fail loudly with clear diagnostic.
    # =========================================================================
    if _SOURCE_CAPABILITIES_AVAILABLE:
        for source_path in job_spec.sources:
            source = Path(source_path)
            ext = source.suffix.lower().lstrip(".")
            codec = _infer_codec_from_path(source)
            engine = get_execution_engine(ext, codec)
            
            if engine == ExecutionEngine.RESOLVE:
                # FATAL INVARIANT VIOLATION
                error_msg = (
                    f"INVARIANT VIOLATION: RAW source '{source.name}' reached FFmpeg execution. "
                    f"Container={ext}, Codec={codec}. "
                    f"RAW formats MUST route to Resolve engine. "
                    f"This indicates a bug in engine routing."
                )
                logger.error(f"[FFMPEG ENGINE] {error_msg}")
                return JobExecutionResult(
                    job_id=job_spec.job_id,
                    clips=[],
                    final_status="FAILED",
                    validation_error=error_msg,
                    validation_stage="invariant_check",
                    jobspec_version=JOBSPEC_VERSION,
                    engine_used="ffmpeg",
                    started_at=started_at,
                    completed_at=datetime.now(timezone.utc),
                )
    
    clips: List[ClipExecutionResult] = []
    
    for index in range(len(job_spec.sources)):
        logger.info(f"[FFMPEG ENGINE] Executing clip {index + 1}/{len(job_spec.sources)}")
        # Execute this clip with FFmpeg
        clip_result = execute_job_spec(
            job_spec, 
            index=index,
            engine_used="ffmpeg",
            proxy_profile_used=job_spec.proxy_profile,
            resolve_preset_used=None,  # FFmpeg jobs don't use Resolve presets
        )
        clips.append(clip_result)
        
        logger.info(f"[FFMPEG ENGINE] Clip {index + 1} result: {clip_result.status}")
        
        # FAIL-FAST: Stop on first failure
        if clip_result.status == "FAILED":
            logger.warning(f"[FFMPEG ENGINE] Clip {index + 1} failed, stopping execution: {clip_result.failure_reason}")
            break
    
    completed_at = datetime.now(timezone.utc)
    
    # Determine final job status
    if not clips:
        final_status = "PARTIAL"
    elif len(clips) < len(job_spec.sources):
        final_status = "FAILED"
    elif all(clip.status == "COMPLETED" for clip in clips):
        final_status = "COMPLETED"
    else:
        final_status = "FAILED"
    
    logger.info(f"[FFMPEG ENGINE] Job execution completed: status={final_status}, clips_executed={len(clips)}/{len(job_spec.sources)}")
    
    return JobExecutionResult(
        job_id=job_spec.job_id,
        clips=clips,
        final_status=final_status,
        jobspec_version=JOBSPEC_VERSION,
        started_at=started_at,
        completed_at=completed_at,
    )


def _execute_with_resolve(job_spec: JobSpec, started_at: datetime) -> JobExecutionResult:
    """
    Execute job using Resolve engine (RAW formats).
    
    Delegates to the ResolveEngine for processing.
    Fails explicitly if Resolve is not available.
    
    CRITICAL: Will skip execution if Resolve is already running to avoid
    interfering with an existing UI session.
    
    PHASE 12 INVARIANT: Resolve execution MUST be observable.
    - Resolve launch MUST be logged explicitly
    - Execution without Resolve launch is a FATAL error
    """
    # =========================================================================
    # PHASE 12: Log Resolve execution attempt explicitly
    # =========================================================================
    logger.info("=" * 70)
    logger.info("[RESOLVE ENGINE] ═══ RESOLVE HEADLESS EXECUTION STARTING ═══")
    logger.info(f"[RESOLVE ENGINE] Job ID: {job_spec.job_id}")
    logger.info(f"[RESOLVE ENGINE] Sources: {len(job_spec.sources)}")
    for i, src in enumerate(job_spec.sources):
        logger.info(f"[RESOLVE ENGINE]   Source {i+1}: {Path(src).name}")
    logger.info("=" * 70)
    
    # Check if Resolve engine is available
    if not _RESOLVE_ENGINE_AVAILABLE:
        error_msg = f"Resolve engine required but not available: {_RESOLVE_ENGINE_ERROR}"
        logger.error(f"[RESOLVE ENGINE] FATAL: {error_msg}")
        return JobExecutionResult(
            job_id=job_spec.job_id,
            clips=[],
            final_status="FAILED",
            validation_error=error_msg,
            validation_stage="validation",
            jobspec_version=JOBSPEC_VERSION,
            engine_used="resolve",
            started_at=started_at,
            completed_at=datetime.now(timezone.utc),
        )
    
    # GUARD: Check if Resolve is already running
    # Headless execution requires launching Resolve ourselves, not attaching to existing session
    try:
        from v2.resolve_installation import is_resolve_running
    except ImportError:
        from backend.v2.resolve_installation import is_resolve_running
    
    if is_resolve_running():
        error_msg = "Resolve is already open. Headless execution requires Resolve to be closed."
        logger.error(f"[RESOLVE ENGINE] BLOCKED: {error_msg}")
        return JobExecutionResult(
            job_id=job_spec.job_id,
            clips=[],
            final_status="SKIPPED",
            validation_error=error_msg,
            validation_stage="pre_execution",
            jobspec_version=JOBSPEC_VERSION,
            engine_used="resolve",
            started_at=started_at,
            completed_at=datetime.now(timezone.utc),
        )
    
    try:
        # =====================================================================
        # PHASE 12: Explicit Resolve launch logging
        # =====================================================================
        logger.info("[RESOLVE ENGINE] Initializing ResolveEngine...")
        resolve_engine = ResolveEngine()
        logger.info("[RESOLVE ENGINE] ResolveEngine initialized successfully")
        logger.info("[RESOLVE ENGINE] ═══ LAUNCHING RESOLVE HEADLESS RENDER ═══")
        
        result = resolve_engine.execute(job_spec)
        
        # =====================================================================
        # PHASE 12 INVARIANT: Verify Resolve was actually used
        # =====================================================================
        if result.final_status == "COMPLETED":
            logger.info("[RESOLVE ENGINE] ═══ RESOLVE EXECUTION COMPLETED SUCCESSFULLY ═══")
            logger.info(f"[RESOLVE ENGINE] Clips processed: {len(result.clips)}")
        else:
            logger.warning(f"[RESOLVE ENGINE] Execution ended with status: {result.final_status}")
        
        return result
        
    except ResolveAPIUnavailableError as e:
        return JobExecutionResult(
            job_id=job_spec.job_id,
            clips=[],
            final_status="FAILED",
            validation_error=f"Resolve scripting API not available: {e}",
            validation_stage="validation",
            jobspec_version=JOBSPEC_VERSION,
            engine_used="resolve",
            started_at=started_at,
            completed_at=datetime.now(timezone.utc),
        )
    except ResolvePresetError as e:
        # Preset not found in Resolve
        return JobExecutionResult(
            job_id=job_spec.job_id,
            clips=[],
            final_status="FAILED",
            validation_error=f"Resolve preset error: {e}",
            validation_stage="validation",
            jobspec_version=JOBSPEC_VERSION,
            engine_used="resolve",
            resolve_preset_used=e.missing_preset,
            started_at=started_at,
            completed_at=datetime.now(timezone.utc),
        )
    except Exception as e:
        return JobExecutionResult(
            job_id=job_spec.job_id,
            clips=[],
            final_status="FAILED",
            validation_error=f"Resolve engine error: {e}",
            validation_stage="execution",
            jobspec_version=JOBSPEC_VERSION,
            engine_used="resolve",
            started_at=started_at,
            completed_at=datetime.now(timezone.utc),
        )


# -----------------------------------------------------------------------------
# CLI Entry Point
# -----------------------------------------------------------------------------

def main():
    """
    CLI entry point for headless execution.
    
    Supports both single-source and multi-source JobSpecs.
    For multi-source, prints a per-clip progress summary.
    
    Usage:
        python -m backend.headless_execute <path_to_jobspec.json>
    
    Prints concise summary and exits with appropriate code.
    """
    if len(sys.argv) < 2:
        print("Usage: python -m backend.headless_execute <path_to_jobspec.json>", file=sys.stderr)
        sys.exit(1)
    
    jobspec_path = sys.argv[1]
    
    # Load JobSpec from JSON
    try:
        with open(jobspec_path, "r") as f:
            data = json.load(f)
        job_spec = JobSpec.from_dict(data)
    except FileNotFoundError:
        print(f"Error: JobSpec file not found: {jobspec_path}", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in {jobspec_path}: {e}", file=sys.stderr)
        sys.exit(1)
    except (KeyError, ValueError) as e:
        print(f"Error: Invalid JobSpec structure: {e}", file=sys.stderr)
        sys.exit(1)
    
    # Execute multi-source JobSpec
    try:
        result = execute_multi_job_spec(job_spec)
        
        # Check for validation error
        if result.validation_error:
            print(f"\nValidation Error: {result.validation_error}", file=sys.stderr)
            sys.exit(1)
        
        # Print summary
        print(f"\n{result.summary()}\n")
        
        # Print per-clip details
        for i, clip in enumerate(result.clips):
            source_name = Path(clip.source_path).name
            print(f"[{i+1}/{len(job_spec.sources)}] {clip.summary()}")
            
            if clip.status == "COMPLETED":
                if clip.output_size_bytes:
                    size_mb = clip.output_size_bytes / (1024 * 1024)
                    print(f"     Size: {size_mb:.1f} MB")
        
        # Save full result to JSON
        result_filename = f"proxx_job_{job_spec.job_id}_{datetime.now().strftime('%Y%m%dT%H%M%S')}.json"
        result_path = Path(job_spec.output_directory) / result_filename
        with open(result_path, "w") as f:
            f.write(result.to_json())
        print(f"\nFull results saved to: {result_path}")
        
        # Exit with appropriate code
        sys.exit(0 if result.success else 1)
        
    except JobSpecValidationError as e:
        print(f"Validation Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
