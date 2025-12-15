"""
Resolve API wrapper for single-clip rendering.

This module provides low-level Resolve Python API invocation.
It handles:
- API initialization
- Project creation/deletion
- Media import
- Timeline creation
- Render preset application
- Render execution and monitoring
- Cleanup

Phase 6 strategy: Project-per-render (isolated, clean).
No shared state between renders.
"""

import sys
import time
from pathlib import Path
from typing import Optional, Tuple
from datetime import datetime

from ..resolve.discovery import discover_resolve
from ..resolve.validation import validate_resolve_installation
from ..resolve.errors import ResolveNotFoundError, ResolveStudioRequiredError
from .errors import PreFlightCheckError, ResolveExecutionError


# Default render timeout: 5 minutes minimum, or 2x realtime if duration known
DEFAULT_TIMEOUT_SECONDS = 300
REALTIME_MULTIPLIER = 2.0


def _import_resolve_api(script_api_path: Path):
    """
    Import Resolve Python API module.
    
    Dynamically adds the Resolve script API path to sys.path and imports
    the DaVinciResolveScript module.
    
    Args:
        script_api_path: Path to Resolve scripting API directory
        
    Returns:
        Imported DaVinciResolveScript module
        
    Raises:
        PreFlightCheckError: If API cannot be imported
    """
    script_module_path = script_api_path / "Modules"
    
    if not script_module_path.exists():
        raise PreFlightCheckError(
            f"Resolve script modules not found at {script_module_path}"
        )
    
    # Add to path if not already present
    script_module_str = str(script_module_path)
    if script_module_str not in sys.path:
        sys.path.insert(0, script_module_str)
    
    try:
        import DaVinciResolveScript as dvr
        return dvr
    except ImportError as e:
        raise PreFlightCheckError(
            f"Failed to import DaVinciResolveScript: {e}"
        )


def _calculate_timeout(duration_seconds: Optional[float]) -> int:
    """
    Calculate render timeout based on source duration.
    
    Args:
        duration_seconds: Source media duration in seconds (if known)
        
    Returns:
        Timeout in seconds (minimum 5 minutes, or 2x realtime)
    """
    if duration_seconds is None or duration_seconds <= 0:
        return DEFAULT_TIMEOUT_SECONDS
    
    realtime_timeout = int(duration_seconds * REALTIME_MULTIPLIER)
    return max(DEFAULT_TIMEOUT_SECONDS, realtime_timeout)


def render_single_clip(
    source_path: Path,
    output_path: Path,
    codec: str,
    container: str,
    timeout_seconds: Optional[int] = None,
    duration_hint: Optional[float] = None,
) -> Tuple[bool, Optional[str]]:
    """
    Render a single clip using Resolve Studio.
    
    This function:
    1. Validates Resolve is available
    2. Imports Resolve API
    3. Creates temporary project
    4. Imports source media
    5. Creates timeline
    6. Sets render settings (codec, output path)
    7. Submits render job
    8. Monitors render progress with timeout
    9. Cleans up project
    
    Args:
        source_path: Absolute path to source media file
        output_path: Absolute path for output file
        codec: Output codec name (e.g., "prores_proxy")
        container: Output container (e.g., "mov")
        timeout_seconds: Render timeout (None = auto-calculate)
        duration_hint: Source duration for timeout calculation
        
    Returns:
        Tuple of (success: bool, error_message: Optional[str])
        - (True, None) on success
        - (False, error_message) on failure
        
    Raises:
        PreFlightCheckError: Pre-flight checks failed
        ResolveExecutionError: Resolve execution failed
    """
    
    # Step 1: Discover and validate Resolve
    try:
        installation = discover_resolve()
        validation_result = validate_resolve_installation(installation)
        
        if not validation_result.is_available:
            raise PreFlightCheckError(
                f"Resolve not available: {validation_result.message}"
            )
        
        if validation_result.is_studio is False:
            raise PreFlightCheckError(
                "Resolve Free detected. Resolve Studio is required for rendering."
            )
        
        if installation.script_api_path is None:
            raise PreFlightCheckError(
                "Resolve scripting API path not found"
            )
        
    except ResolveNotFoundError as e:
        raise PreFlightCheckError(f"Resolve not found: {e}")
    except ResolveStudioRequiredError as e:
        raise PreFlightCheckError(f"Resolve Studio required: {e}")
    
    # Step 2: Import Resolve API
    dvr = _import_resolve_api(installation.script_api_path)
    
    # Step 3: Get Resolve instance
    resolve = dvr.scriptapp("Resolve")
    if resolve is None:
        raise ResolveExecutionError(
            "Failed to connect to Resolve. Is Resolve running?"
        )
    
    project_manager = resolve.GetProjectManager()
    if project_manager is None:
        raise ResolveExecutionError(
            "Failed to get Resolve Project Manager"
        )
    
    # Step 4: Create temporary project
    project_name = f"Proxx_Render_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    
    project = project_manager.CreateProject(project_name)
    if project is None:
        raise ResolveExecutionError(
            f"Failed to create Resolve project: {project_name}"
        )
    
    try:
        # Step 5: Get media pool and import source
        media_pool = project.GetMediaPool()
        if media_pool is None:
            return False, "Failed to get media pool"
        
        root_folder = media_pool.GetRootFolder()
        if root_folder is None:
            return False, "Failed to get root folder"
        
        imported_clips = media_pool.ImportMedia([str(source_path)])
        if not imported_clips or len(imported_clips) == 0:
            return False, f"Failed to import media: {source_path}"
        
        # Step 6: Create timeline from first clip
        clip = imported_clips[0]
        timeline = media_pool.CreateTimelineFromClips(project_name, [clip])
        if timeline is None:
            return False, "Failed to create timeline"
        
        # Step 7: Set render settings
        project.SetCurrentTimeline(timeline)
        
        # Map codec names to Resolve codec identifiers
        codec_map = {
            "prores_proxy": "ProRes Proxy",
            "prores_lt": "ProRes LT",
            "prores_422": "ProRes 422",
            "prores_422_hq": "ProRes 422 HQ",
            "dnxhr_lb": "DNxHR LB",
            "dnxhr_sq": "DNxHR SQ",
            "dnxhr_hq": "DNxHR HQ",
            "dnxhd_36": "DNxHD 36",
            "dnxhd_145": "DNxHD 145",
            "dnxhd_220": "DNxHD 220",
        }
        
        resolve_codec = codec_map.get(codec.lower(), "ProRes 422")
        
        # Get render settings
        project.SetRenderSettings({
            "SelectAllFrames": True,
            "TargetDir": str(output_path.parent),
            "CustomName": output_path.stem,
            "ExportVideo": True,
            "ExportAudio": True,
            "VideoFormat": container.upper(),
            "VideoCodec": resolve_codec,
        })
        
        # Step 8: Add render job to queue
        project.AddRenderJob()
        
        # Step 9: Start rendering
        project.StartRendering()
        
        # Step 10: Monitor render progress with timeout
        if timeout_seconds is None:
            timeout_seconds = _calculate_timeout(duration_hint)
        
        start_time = time.time()
        
        while True:
            status = project.GetRenderJobStatus(1)  # Job ID 1 (first job)
            
            if status == "Complete":
                break
            elif status == "Failed":
                return False, "Render job failed"
            elif status == "Cancelled":
                return False, "Render job cancelled"
            
            # Check timeout
            elapsed = time.time() - start_time
            if elapsed > timeout_seconds:
                project.StopRendering()
                return False, f"Render timeout exceeded ({timeout_seconds}s)"
            
            # Wait before checking again
            time.sleep(1.0)
        
        # Success
        return True, None
        
    finally:
        # Step 11: Cleanup - delete temporary project
        try:
            project_manager.DeleteProject(project_name)
        except Exception as cleanup_error:
            # Log but don't fail if cleanup fails
            print(f"Warning: Failed to cleanup project {project_name}: {cleanup_error}")
