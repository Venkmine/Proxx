"""
V2 Resolve Engine - DaVinci Resolve scripting API execution backend.

=============================================================================
WHY RESOLVE IS TREATED AS A HEADLESS WORKER
=============================================================================

DaVinci Resolve, when used via its Python scripting API, operates as an
external render engine - similar to how FFmpeg is invoked as a subprocess.
The key insight is that Resolve's scripting API provides programmatic control
over render jobs WITHOUT requiring human interaction with the Resolve UI.

This engine treats Resolve as a "headless worker" because:

1. AUTOMATION FIRST: The scripting API was designed for pipeline integration.
   Studios use it for batch processing, watch folder workflows, and CI/CD.

2. DETERMINISTIC EXECUTION: Given the same project/timeline/render settings,
   Resolve produces identical output. This aligns with V2's determinism goals.

3. NO USER DECISIONS: Once a JobSpec is created, all creative decisions have
   been made. Resolve just executes the render - no UI prompts or confirmations.

4. FAIL-FAST SEMANTICS: If Resolve can't render (license, GPU, codec), we fail
   immediately with structured errors. No interactive recovery or retry loops.

5. PROCESS ISOLATION: Resolve runs in its own process space. This engine
   orchestrates render jobs via API calls, similar to subprocess.run() for FFmpeg.

=============================================================================
WHY NO UI INTERACTION IS ALLOWED
=============================================================================

This engine explicitly prohibits any UI interaction because:

1. UNATTENDED OPERATION: Watch folders and automation pipelines run 24/7
   without human supervision. Any UI prompt would hang the entire system.

2. DETERMINISM: User interactions introduce non-determinism. The same JobSpec
   must produce the same result whether run at 3am or 3pm, attended or not.

3. ERROR ISOLATION: If Resolve shows a dialog (missing media, license error),
   that's a failure condition - not an opportunity for user recovery.
   This engine captures the error state and reports it structurally.

4. SEPARATION OF CONCERNS: The UI is for job CREATION (picking sources,
   choosing codecs, setting output paths). The engine is for job EXECUTION.
   These are different phases with different requirements.

5. TESTABILITY: Headless execution can be tested automatically in CI/CD.
   UI-dependent code cannot be reliably automated for testing.

=============================================================================
IMPLEMENTATION NOTES
=============================================================================

- Uses DaVinci Resolve's Python scripting API (fusionscript)
- Requires Resolve Studio for command-line/scripted rendering
- Each clip gets exactly ONE timeline and ONE render job
- No modification of existing FFmpeg execution paths
- Returns JobExecutionResult with resolve_render_job metadata

Part of V2 Phase 1 (Option A: Reliable Proxy Engine)
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional
import os


# =============================================================================
# Resolve Scripting API Detection
# =============================================================================
# The Resolve scripting API is only available when:
# 1. DaVinci Resolve Studio is installed (free version has limited scripting)
# 2. The fusionscript module path is in PYTHONPATH or sys.path
# 3. Resolve is either running or can be launched via scripting
#
# We detect this at import time to provide clear error messages.
# =============================================================================

_RESOLVE_API_AVAILABLE = False
_RESOLVE_API_ERROR: Optional[str] = None

try:
    # Resolve's Python API module location varies by platform:
    # macOS: /Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting/Modules
    # Windows: %PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\Modules
    # Linux: /opt/resolve/Developer/Scripting/Modules
    #
    # The RESOLVE_SCRIPT_API environment variable can override this.
    import sys
    
    # Standard module search paths for Resolve scripting
    _resolve_script_paths = [
        "/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting/Modules",
        os.path.expandvars("%PROGRAMDATA%\\Blackmagic Design\\DaVinci Resolve\\Support\\Developer\\Scripting\\Modules"),
        "/opt/resolve/Developer/Scripting/Modules",
    ]
    
    # Check for custom path via environment variable
    if os.environ.get("RESOLVE_SCRIPT_API"):
        _resolve_script_paths.insert(0, os.environ["RESOLVE_SCRIPT_API"])
    
    # Add paths to sys.path if they exist
    for script_path in _resolve_script_paths:
        if os.path.isdir(script_path) and script_path not in sys.path:
            sys.path.append(script_path)
    
    # Attempt to import the Resolve scripting module
    # This is the official API module name from Blackmagic
    import DaVinciResolveScript as dvr_script
    
    _RESOLVE_API_AVAILABLE = True
    
except ImportError as e:
    _RESOLVE_API_ERROR = (
        f"Resolve scripting API not available on this system. "
        f"Import error: {e}. "
        f"Ensure DaVinci Resolve Studio is installed and the scripting modules "
        f"are in your PYTHONPATH. See Resolve documentation for scripting setup."
    )
except Exception as e:
    _RESOLVE_API_ERROR = (
        f"Unexpected error loading Resolve scripting API: {e}. "
        f"This may indicate a corrupted Resolve installation or Python version mismatch."
    )


# =============================================================================
# Import JobSpec and ExecutionResults
# =============================================================================
# Handle both direct execution and module import scenarios
# =============================================================================

try:
    from job_spec import JobSpec, JobSpecValidationError
    from execution_results import ClipExecutionResult, JobExecutionResult
    from v2.resolve_installation import detect_resolve_installation, ResolveInstallation
except ImportError:
    from backend.job_spec import JobSpec, JobSpecValidationError
    from backend.execution_results import ClipExecutionResult, JobExecutionResult
    from backend.v2.resolve_installation import detect_resolve_installation, ResolveInstallation


# =============================================================================
# Resolve Engine Exceptions
# =============================================================================
# Structured, explicit failures for all error conditions.
# No silent swallowing, no generic exceptions.
# =============================================================================

class ResolveEngineError(Exception):
    """
    Base exception for all Resolve engine failures.
    
    All subclasses represent explicit, structured failure conditions.
    These exceptions are NEVER caught and retried within this engine.
    """
    pass


class ResolveAPIUnavailableError(ResolveEngineError):
    """
    Raised when DaVinci Resolve scripting API is not available.
    
    This is a fatal, non-recoverable error. The engine cannot function
    without the Resolve scripting API.
    """
    pass


class ResolveConnectionError(ResolveEngineError):
    """
    Raised when unable to connect to a running Resolve instance.
    
    This typically means Resolve is not running or the scripting
    server is not enabled.
    """
    pass


class ResolveProjectError(ResolveEngineError):
    """
    Raised when unable to create or configure a Resolve project.
    
    This includes errors in timeline creation, media import,
    or project settings configuration.
    """
    pass


class ResolveRenderError(ResolveEngineError):
    """
    Raised when a render job fails within Resolve.
    
    This includes codec unavailable, output path errors,
    and render process failures.
    """
    pass


class ResolveOutputVerificationError(ResolveEngineError):
    """
    Raised when output file verification fails after render.
    
    The render appeared to complete but the output file does not
    exist or is empty/invalid.
    """
    pass


class ResolvePresetError(ResolveEngineError):
    """
    Raised when a required render preset is not available in Resolve.
    
    Contains the missing preset name and list of available presets
    to provide actionable guidance.
    """
    
    def __init__(
        self,
        missing_preset: str,
        available_presets: List[str],
        message: Optional[str] = None,
    ):
        self.missing_preset = missing_preset
        self.available_presets = available_presets
        
        if message is None:
            available_list = ", ".join(available_presets[:10])
            if len(available_presets) > 10:
                available_list += f", ... ({len(available_presets) - 10} more)"
            message = (
                f"Resolve preset '{missing_preset}' not found. "
                f"Available presets: [{available_list}]. "
                "Create this preset in Resolve: Preferences → System → Render Presets, "
                "or use an existing preset name exactly as shown above."
            )
        
        super().__init__(message)


# =============================================================================
# Resolve Preset Discovery
# =============================================================================
# Functions to enumerate available render presets from Resolve.
# Presets are cached per-process to avoid repeated API calls.
# =============================================================================

_CACHED_PRESETS: Optional[List[str]] = None


def list_available_resolve_presets() -> List[str]:
    """
    Enumerate render presets available in the current Resolve installation.
    
    Uses the Resolve scripting API to query available render presets.
    Results are cached per-process for efficiency.
    
    Returns:
        List of preset names (e.g., ['ProRes 422 Proxy', 'H.264 Master', ...])
        
    Raises:
        ResolveAPIUnavailableError: If Resolve scripting API is not available.
        ResolveConnectionError: If unable to connect to Resolve.
    """
    global _CACHED_PRESETS
    
    if _CACHED_PRESETS is not None:
        return _CACHED_PRESETS
    
    if not _RESOLVE_API_AVAILABLE:
        raise ResolveAPIUnavailableError(
            _RESOLVE_API_ERROR or "Resolve scripting API not available on this system"
        )
    
    import DaVinciResolveScript as dvr_script
    
    resolve = dvr_script.scriptapp("Resolve")
    if resolve is None:
        raise ResolveConnectionError(
            "Unable to connect to DaVinci Resolve. "
            "Ensure Resolve is running and scripting is enabled in "
            "Preferences > System > General > External scripting using."
        )
    
    project_manager = resolve.GetProjectManager()
    if project_manager is None:
        raise ResolveConnectionError(
            "Connected to Resolve but unable to access Project Manager."
        )
    
    # Get or create a project to access render presets
    current_project = project_manager.GetCurrentProject()
    
    if current_project is None:
        # No project open - we need one to query presets
        # Try to create a temporary project
        temp_project = project_manager.CreateProject("_proxx_preset_query_temp")
        if temp_project is None:
            raise ResolveConnectionError(
                "Unable to access render presets. Open or create a project in Resolve."
            )
        current_project = temp_project
        cleanup_project = True
    else:
        cleanup_project = False
    
    try:
        # Query render presets using GetRenderPresetList()
        # This returns a list of preset names
        presets = current_project.GetRenderPresetList()
        
        if presets is None:
            presets = []
        
        _CACHED_PRESETS = list(presets)
        return _CACHED_PRESETS
        
    finally:
        if cleanup_project:
            project_manager.CloseProject(current_project)
            project_manager.DeleteProject("_proxx_preset_query_temp")


def clear_preset_cache() -> None:
    """Clear the cached preset list. Used for testing or after preset changes."""
    global _CACHED_PRESETS
    _CACHED_PRESETS = None


def validate_resolve_preset(preset_name: str) -> None:
    """
    Validate that a preset exists in Resolve.
    
    Args:
        preset_name: Name of the preset to validate.
        
    Raises:
        ResolvePresetError: If preset is not found, with list of available presets.
        ResolveAPIUnavailableError: If Resolve API is not available.
    """
    available = list_available_resolve_presets()
    
    if preset_name not in available:
        raise ResolvePresetError(
            missing_preset=preset_name,
            available_presets=available,
        )


# =============================================================================
# Codec/Container Mapping for Resolve
# =============================================================================
# Explicit mapping from JobSpec codec names to Resolve render preset values.
# This ensures deterministic codec selection - no Resolve "smart" defaults.
#
# Note: These mappings are for Resolve's native render presets.
# Custom presets or non-standard codecs will fail explicitly.
# =============================================================================

# Maps JobSpec codec names to Resolve format/codec identifiers
# Format: (ResolveFormatName, ResolveCodecName, Profile/Variant)
RESOLVE_CODEC_MAP: Dict[str, Dict[str, Any]] = {
    # ProRes family - requires QuickTime container
    "prores_proxy": {
        "format": "QuickTime",
        "codec": "Apple ProRes",
        "preset": "ProRes 422 Proxy",
    },
    "prores_lt": {
        "format": "QuickTime",
        "codec": "Apple ProRes",
        "preset": "ProRes 422 LT",
    },
    "prores_standard": {
        "format": "QuickTime",
        "codec": "Apple ProRes",
        "preset": "ProRes 422",
    },
    "prores_hq": {
        "format": "QuickTime",
        "codec": "Apple ProRes",
        "preset": "ProRes 422 HQ",
    },
    "prores_4444": {
        "format": "QuickTime",
        "codec": "Apple ProRes",
        "preset": "ProRes 4444",
    },
    
    # H.264/H.265 - typically MP4 or MOV container
    "h264": {
        "format": "MP4",
        "codec": "H.264",
        "preset": "H.264 Master",
    },
    "h265": {
        "format": "MP4",
        "codec": "H.265",
        "preset": "H.265 Master",
    },
    "hevc": {
        "format": "MP4",
        "codec": "H.265",
        "preset": "H.265 Master",
    },
    
    # DNxHD/DNxHR - typically MXF or MOV container
    "dnxhd": {
        "format": "MXF OP1A",
        "codec": "DNxHD",
        "preset": "DNxHD HQ",
    },
    "dnxhr": {
        "format": "MXF OP1A",
        "codec": "DNxHR",
        "preset": "DNxHR HQ",
    },
}

# Maps JobSpec container names to Resolve format identifiers
RESOLVE_CONTAINER_MAP: Dict[str, str] = {
    "mov": "QuickTime",
    "mp4": "MP4",
    "mkv": "Matroska",  # Note: Limited support in Resolve
    "mxf": "MXF OP1A",
}


# =============================================================================
# Render Job Metadata
# =============================================================================
# Structured metadata returned instead of ffmpeg_command.
# This provides equivalent audit/debug capability for Resolve renders.
# =============================================================================

@dataclass
class ResolveRenderJobMetadata:
    """
    Metadata for a Resolve render job, replacing ffmpeg_command in results.
    
    This captures all information needed to:
    - Reproduce the render with identical settings
    - Debug render failures
    - Audit what was executed
    """
    
    project_name: str
    """Temporary project name created for this render."""
    
    timeline_name: str
    """Timeline name containing the source clip."""
    
    source_path: str
    """Absolute path to source media that was imported."""
    
    output_path: str
    """Target output path for rendered file."""
    
    format_name: str
    """Resolve format name (e.g., 'QuickTime', 'MP4')."""
    
    codec_name: str
    """Resolve codec name (e.g., 'Apple ProRes', 'H.264')."""
    
    preset_name: str
    """Resolve preset/profile name."""
    
    resolution: str
    """Target resolution (e.g., '1920x1080', 'same')."""
    
    render_job_id: Optional[str] = None
    """Resolve's internal render job ID, if available."""
    
    render_status: Optional[str] = None
    """Final render status from Resolve."""
    
    def to_dict(self) -> Dict[str, Any]:
        """Serialize to dictionary for JSON output."""
        return {
            "engine": "resolve",
            "project_name": self.project_name,
            "timeline_name": self.timeline_name,
            "source_path": self.source_path,
            "output_path": self.output_path,
            "format_name": self.format_name,
            "codec_name": self.codec_name,
            "preset_name": self.preset_name,
            "resolution": self.resolution,
            "render_job_id": self.render_job_id,
            "render_status": self.render_status,
        }
    
    def to_command_list(self) -> List[str]:
        """
        Convert to pseudo-command list format for compatibility.
        
        Returns a list of strings that can be stored in the ffmpeg_command
        field of ClipExecutionResult for audit compatibility.
        """
        return [
            f"resolve-render",
            f"--project={self.project_name}",
            f"--timeline={self.timeline_name}",
            f"--format={self.format_name}",
            f"--codec={self.codec_name}",
            f"--preset={self.preset_name}",
            f"--resolution={self.resolution}",
            f"--input={self.source_path}",
            f"--output={self.output_path}",
        ]


# =============================================================================
# ResolveEngine - Main Engine Class
# =============================================================================

class ResolveEngine:
    """
    DaVinci Resolve execution engine for V2 JobSpec processing.
    
    This engine executes JobSpec instances using the DaVinci Resolve
    scripting API. It treats Resolve as a headless render worker,
    with no UI interaction whatsoever.
    
    ==========================================================================
    CRITICAL DESIGN DECISIONS
    ==========================================================================
    
    1. ONE TIMELINE PER CLIP
       Each source clip gets its own dedicated timeline. This ensures:
       - No cross-contamination of clip settings
       - Clean isolation for render jobs
       - Deterministic per-clip processing
       - No implicit grouping or batching
    
    2. ONE RENDER JOB PER CLIP
       Each clip produces exactly one render job. This ensures:
       - Clear 1:1 mapping between input and output
       - Simple success/failure tracking per clip
       - No partial batch failures
    
    3. EXPLICIT CODEC/CONTAINER MAPPING
       We don't rely on Resolve's defaults or "smart" selections.
       Every codec and container is explicitly mapped to prevent:
       - Unexpected format changes
       - Silent fallbacks to different codecs
       - Platform-dependent behavior
    
    4. OUTPUT VERIFICATION ON DISK
       A render is NOT complete until the output file:
       - Exists on disk at the expected path
       - Has non-zero size
       This prevents marking jobs complete when Resolve silently fails.
    
    5. NO FFmpeg PATH MODIFICATION
       This engine does NOT touch FFmpeg paths or configuration.
       FFmpeg and Resolve are completely separate execution paths.
    
    ==========================================================================
    USAGE
    ==========================================================================
    
    >>> engine = ResolveEngine()
    >>> result = engine.execute(job_spec)
    >>> if result.success:
    ...     print(f"Completed: {result.clips[0].resolved_output_path}")
    ... else:
    ...     print(f"Failed: {result.clips[0].failure_reason}")
    
    ==========================================================================
    ERROR HANDLING
    ==========================================================================
    
    All errors are raised as explicit, typed exceptions:
    - ResolveAPIUnavailableError: Scripting API not available
    - ResolveConnectionError: Cannot connect to Resolve
    - ResolveProjectError: Project/timeline creation failed
    - ResolveRenderError: Render job failed
    - ResolveOutputVerificationError: Output file missing/invalid
    
    There are NO retries, NO pauses, NO recovery attempts.
    Failures are immediate and explicit.
    """
    
    def __init__(self) -> None:
        """
        Initialize ResolveEngine.
        
        Raises:
            ResolveAPIUnavailableError: If Resolve scripting API is not available.
        """
        # =====================================================================
        # API Availability Check
        # =====================================================================
        # This is checked at init time, not execute time, because:
        # 1. Fail-fast: Don't accept work we can't complete
        # 2. Clear error: The exception message is set at import time
        # 3. No partial processing: All-or-nothing for the engine
        # =====================================================================
        if not _RESOLVE_API_AVAILABLE:
            raise ResolveAPIUnavailableError(
                _RESOLVE_API_ERROR or "Resolve scripting API not available on this system"
            )
        
        # Store reference to the Resolve scripting module
        # This is safe because we checked _RESOLVE_API_AVAILABLE above
        import DaVinciResolveScript as dvr_script
        self._dvr_script = dvr_script
        
        # Connection to Resolve is established per-execute, not at init.
        # This is because Resolve might be restarted between jobs.
        self._resolve: Any = None
        self._project_manager: Any = None
        
        # Detect Resolve installation info (edition + version)
        self._installation_info: Optional[ResolveInstallation] = detect_resolve_installation()
        
        # Process ownership tracking
        self._launched_by_forge: bool = False
        self._resolve_process: Any = None
    
    def execute(self, job_spec: JobSpec) -> JobExecutionResult:
        """
        Execute a JobSpec using DaVinci Resolve as the render engine.
        
        This is the single public entry point for the ResolveEngine.
        It processes all sources in the JobSpec sequentially, creating
        one timeline and one render job per clip.
        
        Args:
            job_spec: Validated JobSpec containing sources and render settings.
        
        Returns:
            JobExecutionResult containing per-clip results and overall status.
        
        Raises:
            ResolveAPIUnavailableError: If Resolve API is not available.
            ResolveConnectionError: If unable to connect to Resolve.
            ResolveProjectError: If project/timeline creation fails.
            ResolveRenderError: If render job fails.
            ResolveOutputVerificationError: If output verification fails.
        
        Note:
            This method does NOT retry on failure. Any exception propagates
            immediately. The caller is responsible for error handling.
        """
        # =====================================================================
        # Initialize Result Tracking
        # =====================================================================
        started_at = datetime.now(timezone.utc)
        clip_results: List[ClipExecutionResult] = []
        
        # =====================================================================
        # Connect to Resolve
        # =====================================================================
        # We connect at execute time, not init time, because:
        # 1. Resolve might have been restarted since engine init
        # 2. Each job should get a fresh connection state
        # 3. Connection errors should be per-job, not per-engine
        # =====================================================================
        self._connect_to_resolve()
        
        # =====================================================================
        # Validate Resolve Preset (V2 Deterministic Preset Contract)
        # =====================================================================
        # Resolve must NEVER silently choose a render format.
        # The JobSpec MUST specify resolve_preset explicitly.
        # If the preset doesn't exist in Resolve, fail immediately.
        # =====================================================================
        if job_spec.resolve_preset is None or job_spec.resolve_preset.strip() == "":
            raise ResolveRenderError(
                "JobSpec.resolve_preset is required for Resolve engine execution. "
                "Specify a preset name (e.g., 'ProRes 422 Proxy'). "
                "This ensures deterministic output format selection."
            )
        
        # Validate preset exists in Resolve
        try:
            validate_resolve_preset(job_spec.resolve_preset)
        except ResolvePresetError:
            # Re-raise with full context
            raise
        
        # =====================================================================
        # Create Temporary Project
        # =====================================================================
        # We create a new project for each job execution because:
        # 1. Clean slate - no leftover timelines or render jobs
        # 2. Isolation - this job can't affect other projects
        # 3. Cleanup - easy to delete the entire project when done
        # =====================================================================
        project_name = f"proxx_job_{job_spec.job_id}"
        project = self._create_project(project_name)
        
        try:
            # =================================================================
            # Process Each Source Clip
            # =================================================================
            # Sequential processing, fail-fast on first error.
            # No concurrency in this phase - determinism over speed.
            # =================================================================
            for index, source_path_str in enumerate(job_spec.sources):
                source_path = Path(source_path_str)
                clip_started_at = datetime.now(timezone.utc)
                
                try:
                    # Resolve output path for this clip
                    output_path = self._resolve_output_path(
                        source_path=source_path,
                        job_spec=job_spec,
                        index=index,
                    )
                    
                    # Create timeline for this clip (one timeline per clip)
                    timeline_name = f"clip_{index:03d}_{source_path.stem}"
                    timeline = self._create_timeline_for_clip(
                        project=project,
                        timeline_name=timeline_name,
                        source_path=source_path,
                    )
                    
                    # Configure and execute render job (one render per clip)
                    render_metadata = self._render_timeline(
                        project=project,
                        timeline=timeline,
                        output_path=output_path,
                        job_spec=job_spec,
                        project_name=project_name,
                        timeline_name=timeline_name,
                        source_path=source_path,
                    )
                    
                    # Verify output exists on disk
                    self._verify_output(output_path)
                    
                    # Record success
                    clip_results.append(ClipExecutionResult(
                        source_path=str(source_path),
                        resolved_output_path=str(output_path),
                        ffmpeg_command=render_metadata.to_command_list(),
                        exit_code=0,
                        output_exists=True,
                        output_size_bytes=output_path.stat().st_size,
                        status="COMPLETED",
                        failure_reason=None,
                        validation_stage=None,
                        engine_used="resolve",
                        proxy_profile_used=job_spec.proxy_profile,
                        resolve_preset_used=job_spec.resolve_preset,
                        started_at=clip_started_at,
                        completed_at=datetime.now(timezone.utc),
                    ))
                    
                except (ResolveProjectError, ResolveRenderError, ResolveOutputVerificationError) as e:
                    # Record failure and stop processing (fail-fast)
                    clip_results.append(ClipExecutionResult(
                        source_path=str(source_path),
                        resolved_output_path=str(output_path) if 'output_path' in locals() else "",
                        ffmpeg_command=["resolve-render", "--failed"],
                        exit_code=1,
                        output_exists=False,
                        output_size_bytes=None,
                        status="FAILED",
                        failure_reason=str(e),
                        validation_stage="execution",
                        engine_used="resolve",
                        proxy_profile_used=job_spec.proxy_profile,
                        resolve_preset_used=job_spec.resolve_preset,
                        started_at=clip_started_at,
                        completed_at=datetime.now(timezone.utc),
                    ))
                    # Fail-fast: stop processing remaining clips
                    break
        
        finally:
            # =================================================================
            # Cleanup: Delete Temporary Project
            # =================================================================
            # Always attempt cleanup, even on failure.
            # We don't want to leave orphan projects in Resolve.
            # =================================================================
            self._cleanup_project(project_name)
            
            # =================================================================
            # Cleanup: Shutdown Resolve if we launched it
            # =================================================================
            # Only shutdown if _launched_by_forge is True
            # This ensures we never terminate a user's Resolve session
            # =================================================================
            self._shutdown_resolve()
        
        # =====================================================================
        # Build Final Result
        # =====================================================================
        completed_at = datetime.now(timezone.utc)
        
        # Determine final status
        if not clip_results:
            final_status: Literal["COMPLETED", "FAILED", "PARTIAL"] = "PARTIAL"
        elif all(c.status == "COMPLETED" for c in clip_results):
            if len(clip_results) == len(job_spec.sources):
                final_status = "COMPLETED"
            else:
                final_status = "PARTIAL"
        else:
            final_status = "FAILED"
        
        # Build result with resolve_preset metadata and installation info
        result = JobExecutionResult(
            job_id=job_spec.job_id,
            clips=clip_results,
            final_status=final_status,
            jobspec_version=job_spec.to_dict().get("jobspec_version"),
            engine_used="resolve",
            resolve_preset_used=job_spec.resolve_preset,
            started_at=started_at,
            completed_at=completed_at,
        )
        
        # Attach Resolve installation metadata if detected
        if self._installation_info:
            # Store in private metadata dict (execution_results.py supports this)
            if not hasattr(result, '_resolve_metadata'):
                result._resolve_metadata = {}
            result._resolve_metadata.update({
                'resolve_version': self._installation_info.version,
                'resolve_edition': self._installation_info.edition,
                'resolve_install_path': self._installation_info.install_path,
                'launched_by_forge': self._launched_by_forge,
            })
        
        return result
    
    # =========================================================================
    # Private Methods - Connection Management
    # =========================================================================
    
    def _connect_to_resolve(self) -> None:
        """
        Establish connection to running DaVinci Resolve instance.
        
        If Resolve is not running, attempt to launch it (macOS only for now).
        Track if we launched it so we can clean up afterward.
        
        Raises:
            ResolveConnectionError: If unable to connect to Resolve.
        """
        # Try connecting to existing Resolve instance first
        self._resolve = self._dvr_script.scriptapp("Resolve")
        
        if self._resolve is None:
            # Resolve not running - attempt to launch it
            if not self._launch_resolve():
                raise ResolveConnectionError(
                    "Unable to connect to DaVinci Resolve. "
                    "Attempted to launch Resolve but connection failed. "
                    "Ensure Resolve is installed and scripting is enabled in "
                    "Preferences > System > General > External scripting using."
                )
            
            # Mark that we launched it
            self._launched_by_forge = True
        else:
            # Connected to existing instance - we did not launch it
            self._launched_by_forge = False
        
        # Get the project manager for project operations
        self._project_manager = self._resolve.GetProjectManager()
        
        if self._project_manager is None:
            raise ResolveConnectionError(
                "Connected to Resolve but unable to access Project Manager. "
                "This may indicate a Resolve version incompatibility or licensing issue."
            )
    
    def _launch_resolve(self) -> bool:
        """
        Launch DaVinci Resolve application.
        
        Platform support:
            - macOS: Launch via 'open' command
            - Windows: Not implemented
            - Linux: Not implemented
        
        Returns:
            True if Resolve launched and connected, False otherwise
        """
        import sys
        import time
        
        if sys.platform != "darwin":
            # Only macOS supported for now
            return False
        
        if not self._installation_info:
            return False
        
        try:
            # Launch Resolve.app
            import subprocess
            self._resolve_process = subprocess.Popen(
                ["open", "-a", self._installation_info.install_path],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            
            # Wait for Resolve to start and become connectable
            # Try for up to 30 seconds
            for _ in range(30):
                time.sleep(1)
                self._resolve = self._dvr_script.scriptapp("Resolve")
                if self._resolve is not None:
                    return True
            
            return False
            
        except Exception:
            return False
    
    def _shutdown_resolve(self) -> None:
        """
        Shutdown DaVinci Resolve if we launched it.
        
        Only attempts shutdown if _launched_by_forge is True.
        Gives Resolve 10 seconds to exit gracefully, then force terminates.
        """
        if not self._launched_by_forge:
            return
        
        import sys
        import time
        
        try:
            # Try graceful quit via API first
            if self._resolve is not None:
                try:
                    # Resolve's scripting API doesn't have a standard Quit method
                    # We'll need to use OS-level process termination
                    pass
                except Exception:
                    pass
            
            # macOS: Find and terminate Resolve process
            if sys.platform == "darwin":
                import subprocess
                
                # Give Resolve a moment to save state
                time.sleep(2)
                
                # Try graceful termination first
                try:
                    subprocess.run(
                        ["osascript", "-e", 'quit app "DaVinci Resolve"'],
                        capture_output=True,
                        timeout=10,
                    )
                    
                    # Wait for process to exit (up to 10 seconds)
                    for _ in range(10):
                        result = subprocess.run(
                            ["pgrep", "-f", "DaVinci Resolve"],
                            capture_output=True,
                        )
                        if result.returncode != 0:
                            # Process exited
                            return
                        time.sleep(1)
                    
                    # Still running - force terminate
                    subprocess.run(
                        ["pkill", "-9", "-f", "DaVinci Resolve"],
                        capture_output=True,
                        timeout=5,
                    )
                    
                except Exception:
                    # Best effort - don't fail the job if cleanup fails
                    pass
        
        except Exception:
            # Best effort cleanup
            pass
    
    # =========================================================================
    # Private Methods - Project Management
    # =========================================================================
    
    def _create_project(self, project_name: str) -> Any:
        """
        Create a new temporary project for this job.
        
        Args:
            project_name: Name for the new project.
        
        Returns:
            Resolve project object.
        
        Raises:
            ResolveProjectError: If project creation fails.
        """
        # Attempt to create new project
        project = self._project_manager.CreateProject(project_name)
        
        if project is None:
            # Check if a project with this name already exists
            existing = self._project_manager.LoadProject(project_name)
            if existing is not None:
                raise ResolveProjectError(
                    f"Project '{project_name}' already exists. "
                    "This indicates a previous job did not clean up properly. "
                    "Please manually delete this project in Resolve."
                )
            else:
                raise ResolveProjectError(
                    f"Failed to create project '{project_name}'. "
                    "This may indicate insufficient disk space, database issues, "
                    "or Resolve licensing restrictions."
                )
        
        return project
    
    def _cleanup_project(self, project_name: str) -> None:
        """
        Delete the temporary project after job completion.
        
        This is a best-effort cleanup. Failures are logged but not raised,
        because the main job has already succeeded or failed.
        
        Args:
            project_name: Name of the project to delete.
        """
        try:
            # Close current project first
            self._project_manager.CloseProject(self._project_manager.GetCurrentProject())
            
            # Delete the project
            # Note: DeleteProject returns True on success, False on failure
            deleted = self._project_manager.DeleteProject(project_name)
            
            if not deleted:
                # Log but don't raise - cleanup failure shouldn't affect job status
                # In production, this would be logged to observability
                pass
                
        except Exception:
            # Swallow cleanup errors - the main job result is what matters
            # In production, this would be logged to observability
            pass
    
    # =========================================================================
    # Private Methods - Timeline Management
    # =========================================================================
    
    def _create_timeline_for_clip(
        self,
        project: Any,
        timeline_name: str,
        source_path: Path,
    ) -> Any:
        """
        Create a timeline containing a single source clip.
        
        This enforces the ONE TIMELINE PER CLIP rule.
        
        Args:
            project: Resolve project object.
            timeline_name: Name for the new timeline.
            source_path: Path to the source media file.
        
        Returns:
            Resolve timeline object.
        
        Raises:
            ResolveProjectError: If timeline creation or media import fails.
        """
        # Get the media pool for importing clips
        media_pool = project.GetMediaPool()
        
        if media_pool is None:
            raise ResolveProjectError(
                "Unable to access Media Pool. "
                "This may indicate a corrupted project state."
            )
        
        # Import the source media
        # ImportMedia returns a list of MediaPoolItem objects
        # 
        # IMAGE SEQUENCE HANDLING:
        # When source_path is the first frame of a numbered sequence,
        # Resolve automatically detects and imports the ENTIRE sequence
        # as a SINGLE clip. This is the required behavior.
        # 
        # Example: Given "clip.0001.exr"
        # - Resolve scans the directory
        # - Detects "clip.0002.exr", "clip.0003.exr", etc.
        # - Creates ONE MediaPoolItem spanning all frames
        # - Timeline duration = frame_count / framerate
        imported = media_pool.ImportMedia([str(source_path)])
        
        if not imported or len(imported) == 0:
            raise ResolveProjectError(
                f"Failed to import media: {source_path}. "
                "The file may be corrupt, unsupported, or inaccessible."
            )
        
        # For image sequences, this is ONE clip representing the entire sequence
        media_item = imported[0]
        
        # Create a new timeline with the imported clip
        # CreateTimelineFromClips creates a timeline and adds the clip(s)
        timeline = media_pool.CreateTimelineFromClips(timeline_name, [media_item])
        
        if timeline is None:
            raise ResolveProjectError(
                f"Failed to create timeline '{timeline_name}' for clip: {source_path}. "
                "This may indicate unsupported media format or codec."
            )
        
        return timeline
    
    # =========================================================================
    # Private Methods - Render Execution
    # =========================================================================
    
    def _render_timeline(
        self,
        project: Any,
        timeline: Any,
        output_path: Path,
        job_spec: JobSpec,
        project_name: str,
        timeline_name: str,
        source_path: Path,
    ) -> ResolveRenderJobMetadata:
        """
        Configure and execute a render job for a timeline.
        
        This enforces the ONE RENDER JOB PER CLIP rule and uses
        the EXPLICIT resolve_preset from JobSpec.
        
        V2 Deterministic Preset Contract:
        - Preset MUST be specified in job_spec.resolve_preset
        - Preset MUST exist in Resolve (validated before this method)
        - No fallback to codec_info defaults
        
        Args:
            project: Resolve project object.
            timeline: Resolve timeline object to render.
            output_path: Target output file path.
            job_spec: JobSpec with resolve_preset and resolution settings.
            project_name: Name of the project (for metadata).
            timeline_name: Name of the timeline (for metadata).
            source_path: Original source path (for metadata).
        
        Returns:
            ResolveRenderJobMetadata with render job details.
        
        Raises:
            ResolveRenderError: If render job setup or execution fails.
        """
        # V2: Use explicit preset from JobSpec (already validated in execute())
        preset_name = job_spec.resolve_preset
        
        # Set the current timeline before configuring render
        project.SetCurrentTimeline(timeline)
        
        # Load the render preset (REQUIRED - no fallback)
        preset_loaded = project.LoadRenderPreset(preset_name)
        
        if not preset_loaded:
            # This should not happen if validate_resolve_preset passed,
            # but handle it defensively
            available = list_available_resolve_presets()
            raise ResolveRenderError(
                f"Failed to load preset '{preset_name}' in Resolve. "
                f"Available presets: {available[:10]}. "
                "The preset may have been deleted or renamed since validation."
            )
        
        # Configure render settings
        # These settings are applied on top of the preset
        # Resolve API keys: SelectAllFrames, MarkIn, MarkOut, TargetDir, 
        # CustomName, UniqueFilenameStyle, ExportVideo, ExportAudio,
        # FormatWidth, FormatHeight, FrameRate, etc.
        render_settings = {
            "TargetDir": str(output_path.parent),
            "CustomName": output_path.stem,
            "ExportVideo": True,
            "ExportAudio": True,
            "SelectAllFrames": True,
        }
        
        # Handle resolution: 0 means use source/timeline resolution
        width = self._parse_resolution_width(job_spec.resolution)
        height = self._parse_resolution_height(job_spec.resolution)
        if width > 0 and height > 0:
            render_settings["FormatWidth"] = width
            render_settings["FormatHeight"] = height
        
        # Apply settings
        project.SetRenderSettings(render_settings)
        
        # Add render job to queue
        # AddRenderJob returns the job ID or None on failure
        job_id = project.AddRenderJob()
        
        if job_id is None:
            raise ResolveRenderError(
                f"Failed to add render job for timeline '{timeline_name}'. "
                "This may indicate invalid render settings or licensing restrictions."
            )
        
        # Start rendering
        # StartRendering returns True if render started successfully
        # We pass the specific job ID to render only this job
        render_started = project.StartRendering([job_id])
        
        if not render_started:
            raise ResolveRenderError(
                f"Failed to start render for timeline '{timeline_name}'. "
                "Check Resolve's render queue for more details."
            )
        
        # Wait for render to complete
        # IsRenderingInProgress returns True while rendering
        while project.IsRenderingInProgress():
            # Blocking wait - no timeout, no progress callbacks
            # This is intentional: headless workers don't need progress UI
            import time
            time.sleep(1.0)
        
        # Check render status
        # GetRenderJobStatus returns a dict with status information
        status = project.GetRenderJobStatus(job_id)
        
        if status is None or status.get("JobStatus") != "Complete":
            error_msg = status.get("Error", "Unknown error") if status else "No status available"
            raise ResolveRenderError(
                f"Render job failed for timeline '{timeline_name}': {error_msg}"
            )
        
        # Build metadata for result
        # Note: format_name and codec_name are derived from the preset
        # The preset is the source of truth for V2 deterministic rendering
        return ResolveRenderJobMetadata(
            project_name=project_name,
            timeline_name=timeline_name,
            source_path=str(source_path),
            output_path=str(output_path),
            format_name="(from preset)",  # Preset determines format
            codec_name="(from preset)",   # Preset determines codec
            preset_name=preset_name,      # This is the source of truth
            resolution=job_spec.resolution,
            render_job_id=str(job_id),
            render_status="Complete",
        )
    
    # =========================================================================
    # Private Methods - Output Verification
    # =========================================================================
    
    def _verify_output(self, output_path: Path) -> None:
        """
        Verify that the rendered output file exists and is valid.
        
        This is the final gate before marking a clip as COMPLETED.
        The file MUST exist on disk with non-zero size.
        
        Args:
            output_path: Expected output file path.
        
        Raises:
            ResolveOutputVerificationError: If output is missing or invalid.
        """
        if not output_path.exists():
            raise ResolveOutputVerificationError(
                f"Output file does not exist after render: {output_path}. "
                "Resolve reported success but the file was not written. "
                "Check disk space and write permissions."
            )
        
        if output_path.stat().st_size == 0:
            raise ResolveOutputVerificationError(
                f"Output file is empty (0 bytes): {output_path}. "
                "Resolve may have encountered an encoding error. "
                "Check the source media for corruption."
            )
    
    # =========================================================================
    # Private Methods - Path Resolution
    # =========================================================================
    
    def _resolve_output_path(
        self,
        source_path: Path,
        job_spec: JobSpec,
        index: int,
    ) -> Path:
        """
        Resolve the output file path for a given source using proxy profile.
        
        V2 Step 5: Profile-Driven Output Naming
        ========================================
        Output container extension is now derived from the proxy profile,
        not from ad-hoc JobSpec fields.
        
        Uses the same token resolution logic as the FFmpeg engine
        to ensure consistent output naming.
        
        Args:
            source_path: Source file path.
            job_spec: JobSpec with naming template and output directory.
            index: Clip index in the sources list.
        
        Returns:
            Absolute path for the output file.
        """
        # Import proxy profile utilities
        try:
            from v2.proxy_profiles import get_profile
        except ImportError:
            from backend.v2.proxy_profiles import get_profile
        
        now = datetime.now()
        
        # Token resolution - same tokens as FFmpeg engine for consistency
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
        
        filename = job_spec.naming_template
        for token, value in token_values.items():
            filename = filename.replace(f"{{{token}}}", value)
        
        # Clean up double underscores
        while "__" in filename:
            filename = filename.replace("__", "_")
        filename = filename.strip("_") or source_path.stem
        
        # Get container from proxy profile
        profile = get_profile(job_spec.proxy_profile)
        extension = f".{profile.container.lower().lstrip('.')}"
        
        return Path(job_spec.output_directory) / f"{filename}{extension}"
    
    def _parse_resolution_width(self, resolution: str) -> int:
        """
        Parse resolution string to get width in pixels.
        
        Args:
            resolution: Resolution string (e.g., '1920x1080', 'same', 'half').
        
        Returns:
            Width in pixels, or 0 for 'same' (let Resolve use source resolution).
        """
        resolution = resolution.lower()
        
        if resolution == "same":
            return 0  # Resolve uses source resolution
        elif resolution == "half":
            return 0  # Would need source dimensions - use 0 for now
        elif resolution == "quarter":
            return 0  # Would need source dimensions - use 0 for now
        elif "x" in resolution:
            try:
                width, _ = resolution.split("x")
                return int(width)
            except ValueError:
                return 0
        else:
            return 0
    
    def _parse_resolution_height(self, resolution: str) -> int:
        """
        Parse resolution string to get height in pixels.
        
        Args:
            resolution: Resolution string (e.g., '1920x1080', 'same', 'half').
        
        Returns:
            Height in pixels, or 0 for 'same' (let Resolve use source resolution).
        """
        resolution = resolution.lower()
        
        if resolution == "same":
            return 0  # Resolve uses source resolution
        elif resolution == "half":
            return 0  # Would need source dimensions - use 0 for now
        elif resolution == "quarter":
            return 0  # Would need source dimensions - use 0 for now
        elif "x" in resolution:
            try:
                _, height = resolution.split("x")
                return int(height)
            except ValueError:
                return 0
        else:
            return 0


# =============================================================================
# Convenience Wrapper for External Callers
# =============================================================================

def run_job(jobspec: JobSpec) -> JobExecutionResult:
    """
    Run a JobSpec using DaVinci Resolve (convenience wrapper).
    
    This is a simple wrapper around ResolveEngine.execute() for
    external callers who want a clean function interface without
    instantiating the engine directly.
    
    Args:
        jobspec: Validated JobSpec to execute
        
    Returns:
        JobExecutionResult with execution details and Resolve metadata
        
    Raises:
        ResolveAPIUnavailableError: If Resolve API is not available
        ResolveConnectionError: If unable to connect to Resolve
        ResolveProjectError: If project/timeline creation fails
        ResolveRenderError: If render execution fails
        ResolveOutputVerificationError: If output verification fails
        
    Example:
        >>> from backend.job_spec import JobSpec
        >>> from backend.v2.engines.resolve_engine import run_job
        >>> 
        >>> spec = JobSpec.from_json_file("my_raw_job.json")
        >>> result = run_job(spec)
        >>> 
        >>> if result.success:
        ...     print(f"Completed {len(result.clips)} clips")
        >>> else:
        ...     print(f"Failed: {result.clips[0].failure_reason}")
    """
    engine = ResolveEngine()
    return engine.execute(jobspec)
