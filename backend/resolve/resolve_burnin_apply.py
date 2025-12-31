"""
Resolve Burn-In Application for V1 Proxx.

This module applies burn-in configurations to DaVinci Resolve projects
using Resolve's Project Data Burn-In feature.

IMPORTANT CONSTRAINTS:
- Resolve STUDIO ONLY (burn-in requires Studio license)
- Project-level Data Burn-In only (no per-clip overrides)
- Temporary configuration (applied per-job, torn down after render)
- No caching across jobs

Part of V1 BURN-IN IMPLEMENTATION
"""

import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Any, Dict

from backend.burnins.apply_burnins import (
    ResolvedBurnInConfig,
    BurnInPreset,
    BurnInError,
)
from backend.v2.resolve_installation import detect_resolve_installation


# =============================================================================
# Exceptions
# =============================================================================

class ResolveBurnInError(BurnInError):
    """Base exception for Resolve burn-in errors."""
    pass


class ResolveNotStudioError(ResolveBurnInError):
    """Raised when Resolve Free is detected but burn-ins require Studio."""
    pass


class ResolveNotRunningError(ResolveBurnInError):
    """Raised when Resolve is not running and cannot be accessed via scripting."""
    pass


class ResolveBurnInApplicationError(ResolveBurnInError):
    """Raised when burn-in application to Resolve fails."""
    pass


# =============================================================================
# Position Mapping
# =============================================================================

# Map our position enum to Resolve Data Burn-In positions
# Resolve uses 1-9 grid positions, but we simplify to standard corners/centers
POSITION_MAP = {
    "TL": {"alignment": 0, "vertical": 0},  # Top-Left
    "TC": {"alignment": 1, "vertical": 0},  # Top-Center
    "TR": {"alignment": 2, "vertical": 0},  # Top-Right
    "BL": {"alignment": 0, "vertical": 2},  # Bottom-Left
    "BC": {"alignment": 1, "vertical": 2},  # Bottom-Center
    "BR": {"alignment": 2, "vertical": 2},  # Bottom-Right
}

# Map our font scale enum to Resolve font sizes
FONT_SCALE_MAP = {
    "small": 0.5,
    "medium": 1.0,
    "large": 1.5,
}


# =============================================================================
# Resolve Scripting Interface
# =============================================================================

def _get_resolve() -> Any:
    """
    Get the DaVinci Resolve scripting object.
    
    Returns:
        Resolve scripting object
        
    Raises:
        ResolveNotRunningError: If Resolve is not accessible
    """
    try:
        # Try to import the Resolve scripting module
        # This is typically installed by Resolve in the Python environment
        import DaVinciResolveScript as dvr
        resolve = dvr.scriptapp("Resolve")
        if resolve is None:
            raise ResolveNotRunningError(
                "DaVinci Resolve is not running. Please start Resolve before "
                "executing jobs with burn-ins."
            )
        return resolve
    except ImportError:
        # Try alternative import path for Resolve scripting
        try:
            # Check if Resolve API is available via fusionscript
            import fusionscript as dvr
            resolve = dvr.scriptapp("Resolve")
            if resolve is None:
                raise ResolveNotRunningError(
                    "DaVinci Resolve is not running. Please start Resolve before "
                    "executing jobs with burn-ins."
                )
            return resolve
        except ImportError:
            raise ResolveNotRunningError(
                "DaVinci Resolve scripting API not found. Ensure Resolve is "
                "installed and the scripting API is configured."
            )


def _check_resolve_studio() -> None:
    """
    Verify that Resolve Studio is installed.
    
    Burn-ins require Resolve Studio. Resolve Free cannot apply burn-ins.
    
    Raises:
        ResolveNotStudioError: If Resolve Free is detected
    """
    installation = detect_resolve_installation()
    
    if installation is None:
        raise ResolveBurnInError(
            "DaVinci Resolve installation not detected. "
            "Please install Resolve Studio to use burn-ins."
        )
    
    if installation.edition == "free":
        raise ResolveNotStudioError(
            "Burn-ins require DaVinci Resolve STUDIO. "
            f"Detected: DaVinci Resolve Free ({installation.version}). "
            "Please upgrade to Resolve Studio to use burn-in features."
        )
    
    if installation.edition == "unknown":
        # Log warning but allow to proceed - user may have Studio
        # The actual burn-in application will fail if not Studio
        pass  # Proceed with caution


# =============================================================================
# Burn-In Configuration
# =============================================================================

@dataclass
class ResolveBurnInState:
    """
    Tracks the state of burn-in configuration in Resolve.
    
    Used for cleanup after render completes.
    """
    project_name: str
    original_settings: Dict[str, Any]
    burn_in_applied: bool = False


def _build_resolve_burnin_settings(
    config: ResolvedBurnInConfig,
) -> Dict[str, Any]:
    """
    Convert ResolvedBurnInConfig to Resolve Project Data Burn-In settings.
    
    Args:
        config: Fully resolved burn-in configuration
        
    Returns:
        Dictionary of Resolve burn-in settings
    """
    # Resolve Data Burn-In supports multiple text fields per position
    # We need to aggregate presets by position and build the settings
    
    settings = {
        "DataBurnInEnabled": True,
        "DataBurnInProperties": [],
    }
    
    for preset in config.presets:
        position_config = POSITION_MAP.get(preset.position)
        if position_config is None:
            continue
            
        font_scale = FONT_SCALE_MAP.get(preset.font_scale, 1.0)
        
        # Build property entry for this preset
        for field in preset.fields:
            prop = {
                "PropertyName": field,
                "Enabled": True,
                "FontScale": font_scale,
                "TextOpacity": preset.text_opacity,
                "HorizontalAlignment": position_config["alignment"],
                "VerticalAlignment": position_config["vertical"],
                "BackgroundEnabled": preset.background_enabled,
            }
            
            if preset.background_enabled and preset.background_opacity is not None:
                prop["BackgroundOpacity"] = preset.background_opacity
            
            settings["DataBurnInProperties"].append(prop)
    
    return settings


# =============================================================================
# Public API
# =============================================================================

def apply_burnins_to_resolve(
    config: ResolvedBurnInConfig,
    project_name: Optional[str] = None,
) -> ResolveBurnInState:
    """
    Apply burn-in configuration to the current Resolve project.
    
    This function:
    1. Verifies Resolve Studio is installed
    2. Connects to running Resolve instance
    3. Saves current burn-in settings
    4. Applies new burn-in configuration
    5. Returns state object for later cleanup
    
    Args:
        config: Fully resolved burn-in configuration
        project_name: Optional project name (uses current if not specified)
        
    Returns:
        ResolveBurnInState for cleanup after render
        
    Raises:
        ResolveNotStudioError: If Resolve Free is detected
        ResolveNotRunningError: If Resolve is not running
        ResolveBurnInApplicationError: If burn-in application fails
    """
    # Verify Studio
    _check_resolve_studio()
    
    # Get Resolve instance
    resolve = _get_resolve()
    
    # Get current project
    project_manager = resolve.GetProjectManager()
    if project_manager is None:
        raise ResolveBurnInApplicationError(
            "Failed to get Resolve Project Manager"
        )
    
    current_project = project_manager.GetCurrentProject()
    if current_project is None:
        raise ResolveBurnInApplicationError(
            "No project is currently open in Resolve. "
            "Please open a project before applying burn-ins."
        )
    
    actual_project_name = current_project.GetName()
    
    # Save original settings for cleanup
    try:
        original_settings = current_project.GetSetting("dataBurnInPreset") or {}
    except Exception:
        original_settings = {}
    
    state = ResolveBurnInState(
        project_name=actual_project_name,
        original_settings=original_settings,
        burn_in_applied=False,
    )
    
    # Build and apply new settings
    new_settings = _build_resolve_burnin_settings(config)
    
    try:
        # Apply Data Burn-In settings to project
        # Note: The exact API depends on Resolve version
        # This is the general approach for Project Settings
        success = current_project.SetSetting("dataBurnInPreset", new_settings)
        
        if not success:
            raise ResolveBurnInApplicationError(
                f"Failed to apply burn-in settings to project '{actual_project_name}'"
            )
        
        state.burn_in_applied = True
        
    except Exception as e:
        raise ResolveBurnInApplicationError(
            f"Error applying burn-in settings: {str(e)}"
        ) from e
    
    return state


def teardown_burnins(state: ResolveBurnInState) -> None:
    """
    Remove burn-in configuration and restore original settings.
    
    Called after render completes to clean up temporary burn-in state.
    
    Args:
        state: State object from apply_burnins_to_resolve
    """
    if not state.burn_in_applied:
        return  # Nothing to tear down
    
    try:
        resolve = _get_resolve()
        project_manager = resolve.GetProjectManager()
        current_project = project_manager.GetCurrentProject()
        
        if current_project is None:
            return  # Project closed, nothing to restore
        
        # Only restore if same project
        if current_project.GetName() != state.project_name:
            return  # Different project, don't modify
        
        # Restore original settings or disable burn-in
        if state.original_settings:
            current_project.SetSetting("dataBurnInPreset", state.original_settings)
        else:
            # Disable burn-in if no original settings
            current_project.SetSetting("dataBurnInPreset", {"DataBurnInEnabled": False})
            
    except Exception:
        # Best effort cleanup - log but don't fail
        pass


def validate_resolve_for_burnins() -> Dict[str, Any]:
    """
    Validate that Resolve is ready for burn-in application.
    
    Use this for pre-flight checks before job execution.
    
    Returns:
        Dictionary with validation results:
        - valid: bool
        - edition: str or None
        - version: str or None
        - error: str or None
    """
    result = {
        "valid": False,
        "edition": None,
        "version": None,
        "error": None,
    }
    
    # Check installation
    installation = detect_resolve_installation()
    if installation is None:
        result["error"] = "DaVinci Resolve not installed"
        return result
    
    result["version"] = installation.version
    result["edition"] = installation.edition
    
    if installation.edition == "free":
        result["error"] = "Burn-ins require Resolve Studio (detected: Resolve Free)"
        return result
    
    # Check if Resolve is running
    try:
        _get_resolve()
    except ResolveNotRunningError as e:
        result["error"] = str(e)
        return result
    
    result["valid"] = True
    return result
