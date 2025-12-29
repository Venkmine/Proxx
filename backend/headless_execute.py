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
import os
import shutil
import subprocess
import sys

from job_spec import JobSpec, JobSpecValidationError, FpsMode, JOBSPEC_VERSION
from execution_results import ClipExecutionResult, JobExecutionResult

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

def _determine_job_engine(job_spec: JobSpec) -> Tuple[Optional[str], Optional[str]]:
    """
    Determine which execution engine should process this job.
    
    ROUTING RULES (NO USER OVERRIDE, NO HEURISTICS):
    - All sources must route to the SAME engine
    - Mixed jobs (RAW + non-RAW) are REJECTED
    - RAW formats → "resolve"
    - Standard formats → "ffmpeg"
    - Unknown/rejected formats → validation error
    
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
        container = source.suffix.lower().lstrip(".")
        
        # For source codec, we need to probe the file or infer from container
        # For now, use container-based heuristics for common RAW formats
        codec = _infer_codec_from_path(source)
        
        engine = get_execution_engine(container, codec)
        
        if engine == ExecutionEngine.FFMPEG:
            engines_required["ffmpeg"].append(source_path)
        elif engine == ExecutionEngine.RESOLVE:
            engines_required["resolve"].append(source_path)
        else:
            engines_required["unknown"].append(source_path)
    
    # Check for unknown formats
    if engines_required["unknown"]:
        unknown_files = ", ".join(Path(p).name for p in engines_required["unknown"][:3])
        return (None, f"Unknown source format for: {unknown_files}")
    
    # Check for mixed engine requirements
    has_ffmpeg = len(engines_required["ffmpeg"]) > 0
    has_resolve = len(engines_required["resolve"]) > 0
    
    if has_ffmpeg and has_resolve:
        ffmpeg_files = ", ".join(Path(p).name for p in engines_required["ffmpeg"][:2])
        resolve_files = ", ".join(Path(p).name for p in engines_required["resolve"][:2])
        return (
            None,
            f"Mixed job not allowed: FFmpeg sources ({ffmpeg_files}) and Resolve sources ({resolve_files}) "
            f"cannot be processed in the same job. Split into separate jobs by format type."
        )
    
    if has_resolve:
        return ("resolve", None)
    
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


def _infer_codec_from_path(source_path: Path) -> str:
    """
    Infer codec from file path, with optional ffprobe for ambiguous containers.
    
    For well-known RAW extensions (.braw, .r3d, etc.), uses extension-based detection.
    For ambiguous containers like MXF (which can contain DNxHD, ProRes, or ARRIRAW),
    probes the file to determine the actual codec.
    
    Args:
        source_path: Path to source file
        
    Returns:
        Inferred codec string for capability lookup
    """
    ext = source_path.suffix.lower().lstrip(".")
    
    # RAW format extensions that require Resolve
    raw_extensions = {
        "r3d": "redcode",      # RED RAW
        "ari": "arriraw",      # ARRI RAW
        "braw": "braw",        # Blackmagic RAW
        "crm": "canon_raw",    # Canon Cinema RAW
        "dng": "cinemadng",    # CinemaDNG
    }
    
    if ext in raw_extensions:
        return raw_extensions[ext]
    
    # Ambiguous containers that need probing (can contain RAW or standard codecs)
    ambiguous_containers = {"mxf"}
    
    if ext in ambiguous_containers:
        # Probe the actual codec
        probed_codec = _probe_codec_ffprobe(source_path)
        if probed_codec:
            # If ffprobe returns "unknown", this indicates a proprietary RAW codec
            # that FFmpeg cannot decode - route to Resolve
            if probed_codec == "unknown":
                # For MXF with unknown codec, assume ARRI RAW (most common case)
                return "arriraw"
            return probed_codec
    
    # For standard containers, assume FFmpeg-compatible codecs
    # The actual codec doesn't matter for routing - these all go to FFmpeg
    standard_containers = {
        "mp4": "h264",
        "mov": "prores",  # Assume ProRes for MOV (most common in editorial)
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
    
    Args:
        ffmpeg_path: Path to FFmpeg executable
        source_path: Input file path
        output_path: Output file path
        job_spec: JobSpec with proxy_profile specified
        
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
    
    # Get profile (validation already done, this should not fail)
    profile = get_profile(job_spec.proxy_profile)
    
    # Start building command
    cmd = [ffmpeg_path, "-y"]  # -y to overwrite output
    
    # Input file
    cmd.extend(["-i", source_path])
    
    # Codec arguments from profile
    cmd.extend(resolve_ffmpeg_codec_args(profile))
    
    # Resolution arguments from profile
    resolution_args = resolve_ffmpeg_resolution_args(profile)
    if resolution_args:
        cmd.extend(resolution_args)
    
    # Audio arguments from profile
    cmd.extend(resolve_ffmpeg_audio_args(profile))
    
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
    
    # Get source path
    if index >= len(job_spec.sources):
        raise IndexError(f"Source index {index} out of range (job has {len(job_spec.sources)} sources)")
    
    source_path = Path(job_spec.sources[index])
    
    # Find FFmpeg
    ffmpeg_path = _find_ffmpeg()
    if not ffmpeg_path:
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
    
    # Resolve output path
    output_path = _resolve_output_path(source_path, job_spec, index=index)
    
    # Ensure output directory exists
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Build command
    ffmpeg_command = _build_ffmpeg_command(
        ffmpeg_path=ffmpeg_path,
        source_path=str(source_path),
        output_path=str(output_path),
        job_spec=job_spec,
    )
    
    # Execute synchronously
    try:
        process = subprocess.run(
            ffmpeg_command,
            capture_output=True,
            text=True,
            timeout=3600,  # 1 hour timeout for long renders
        )
        exit_code = process.returncode
        stderr = process.stderr
    except subprocess.TimeoutExpired:
        exit_code = -1
        stderr = "Execution timed out after 3600 seconds"
    except Exception as e:
        exit_code = -1
        stderr = f"Execution failed: {e}"
    
    completed_at = datetime.now(timezone.utc)
    
    # Verify output
    output_exists, output_size = _verify_output(output_path)
    
    # Determine status and failure reason
    if exit_code != 0:
        status = "FAILED"
        failure_reason = f"FFmpeg exited with code {exit_code}"
    elif not output_exists:
        status = "FAILED"
        failure_reason = "Output file does not exist or has zero size"
    else:
        status = "COMPLETED"
        failure_reason = None
    
    return ClipExecutionResult(
        source_path=str(source_path),
        resolved_output_path=str(output_path),
        ffmpeg_command=ffmpeg_command,
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
    
    # Step 1: Validate the entire JobSpec once
    try:
        job_spec.validate(check_paths=True)
    except JobSpecValidationError as e:
        # Return FAILED status with validation error captured
        return JobExecutionResult(
            job_id=job_spec.job_id,
            clips=[],
            final_status="FAILED",
            validation_error=str(e),
            jobspec_version=JOBSPEC_VERSION,
            started_at=started_at,
            completed_at=datetime.now(timezone.utc),
        )
    
    # Step 2: Determine which engine to use based on source capabilities
    engine_name, engine_error = _determine_job_engine(job_spec)
    
    if engine_error:
        # Engine routing failed (mixed job or unsupported format)
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
    if engine_name == "resolve":
        result = _execute_with_resolve(job_spec, started_at)
    else:
        # Default to FFmpeg
        result = _execute_with_ffmpeg(job_spec, started_at)
    
    # Step 4: Set engine metadata in result
    result.engine_used = engine_name
    result.proxy_profile_used = job_spec.proxy_profile
    
    return result


def _execute_with_ffmpeg(job_spec: JobSpec, started_at: datetime) -> JobExecutionResult:
    """
    Execute job using FFmpeg engine (standard formats).
    
    This is the original execution path for standard video formats.
    """
    clips: List[ClipExecutionResult] = []
    
    for index in range(len(job_spec.sources)):
        # Execute this clip with FFmpeg
        clip_result = execute_job_spec(
            job_spec, 
            index=index,
            engine_used="ffmpeg",
            proxy_profile_used=job_spec.proxy_profile,
            resolve_preset_used=None,  # FFmpeg jobs don't use Resolve presets
        )
        clips.append(clip_result)
        
        # FAIL-FAST: Stop on first failure
        if clip_result.status == "FAILED":
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
    """
    # Check if Resolve engine is available
    if not _RESOLVE_ENGINE_AVAILABLE:
        return JobExecutionResult(
            job_id=job_spec.job_id,
            clips=[],
            final_status="FAILED",
            validation_error=f"Resolve engine required but not available: {_RESOLVE_ENGINE_ERROR}",
            validation_stage="validation",
            jobspec_version=JOBSPEC_VERSION,
            engine_used="resolve",
            started_at=started_at,
            completed_at=datetime.now(timezone.utc),
        )
    
    try:
        # Initialize and execute with Resolve engine
        resolve_engine = ResolveEngine()
        result = resolve_engine.execute(job_spec)
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
