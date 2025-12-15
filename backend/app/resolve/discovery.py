"""
Resolve installation discovery.

Platform-specific logic to detect Resolve installation paths,
version, and scripting API locations.

Supports macOS and Windows with optional environment variable overrides.
"""

import os
import sys
import subprocess
from pathlib import Path
from typing import Optional

from .models import ResolveInstallation
from .errors import ResolveNotFoundError


# Environment variable overrides (optional, advanced)
ENV_RESOLVE_PATH = "PROXX_RESOLVE_PATH"
ENV_SCRIPT_API_PATH = "PROXX_RESOLVE_SCRIPT_API_PATH"


def discover_resolve() -> ResolveInstallation:
    """
    Discover Resolve installation on the current platform.
    
    Discovery priority:
    1. Environment variable override (PROXX_RESOLVE_PATH)
    2. Platform-specific default paths
    
    Returns:
        ResolveInstallation with detected paths and metadata.
    
    Raises:
        ResolveNotFoundError: If Resolve cannot be found.
    
    Notes:
        - Version detection is best-effort and may return None
        - is_studio detection requires validation step (see validation.py)
        - Environment overrides are OPTIONAL and not required for normal operation
    """
    # Check for environment variable override
    override_path = os.environ.get(ENV_RESOLVE_PATH)
    if override_path:
        install_path = Path(override_path)
        if not install_path.exists():
            raise ResolveNotFoundError(
                f"Override path from {ENV_RESOLVE_PATH} does not exist: {override_path}"
            )
        return _build_installation(install_path)
    
    # Platform-specific default discovery
    if sys.platform == "darwin":
        return _discover_macos()
    elif sys.platform == "win32":
        return _discover_windows()
    else:
        raise ResolveNotFoundError(
            f"Unsupported platform: {sys.platform}. "
            f"Proxx requires macOS or Windows."
        )


def _discover_macos() -> ResolveInstallation:
    """
    Discover Resolve on macOS.
    
    Default path: /Applications/DaVinci Resolve/DaVinci Resolve.app
    Script API: /Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting/
    """
    default_path = Path("/Applications/DaVinci Resolve/DaVinci Resolve.app")
    
    if not default_path.exists():
        raise ResolveNotFoundError(
            f"Resolve not found at expected macOS location: {default_path}. "
            f"Set {ENV_RESOLVE_PATH} environment variable if installed elsewhere."
        )
    
    return _build_installation(default_path)


def _discover_windows() -> ResolveInstallation:
    """
    Discover Resolve on Windows.
    
    Default path: C:\\Program Files\\Blackmagic Design\\DaVinci Resolve\\
    Script API: C:\\ProgramData\\Blackmagic Design\\DaVinci Resolve\\Support\\Developer\\Scripting\\
    """
    program_files = os.environ.get("PROGRAMFILES", "C:\\Program Files")
    default_path = Path(program_files) / "Blackmagic Design" / "DaVinci Resolve"
    
    if not default_path.exists():
        raise ResolveNotFoundError(
            f"Resolve not found at expected Windows location: {default_path}. "
            f"Set {ENV_RESOLVE_PATH} environment variable if installed elsewhere."
        )
    
    return _build_installation(default_path)


def _build_installation(install_path: Path) -> ResolveInstallation:
    """
    Build ResolveInstallation from detected path.
    
    Attempts to detect:
    - Resolve version
    - Scripting API path
    
    Returns best-effort installation info even if some detection fails.
    """
    version = _detect_version(install_path)
    script_api_path = _detect_script_api_path()
    
    return ResolveInstallation(
        install_path=install_path,
        version=version,
        script_api_path=script_api_path,
        is_studio=None,  # Determined by validation step
    )


def _detect_version(install_path: Path) -> Optional[str]:
    """
    Attempt to detect Resolve version.
    
    Version detection is best-effort and platform-specific.
    Returns None if version cannot be determined.
    
    TODO: Implement robust version detection.
    Possible approaches:
    - Parse version from Info.plist (macOS)
    - Query registry (Windows)
    - Parse executable metadata
    
    Version enforcement is deferred to Phase 6+.
    """
    # Placeholder: version detection logic goes here
    # For now, return None (version unknown)
    return None


def _detect_script_api_path() -> Optional[Path]:
    """
    Attempt to detect Resolve scripting API path.
    
    Checks:
    1. Environment variable override (PROXX_RESOLVE_SCRIPT_API_PATH)
    2. Platform-specific default paths
    
    Returns None if script API path cannot be found.
    """
    # Check for environment variable override
    override_path = os.environ.get(ENV_SCRIPT_API_PATH)
    if override_path:
        path = Path(override_path)
        if path.exists():
            return path
        # Override provided but doesn't exist - return None rather than fail
        # Validation step will handle this
        return None
    
    # Platform-specific defaults
    if sys.platform == "darwin":
        default_path = Path(
            "/Library/Application Support/Blackmagic Design/"
            "DaVinci Resolve/Developer/Scripting"
        )
        if default_path.exists():
            return default_path
    elif sys.platform == "win32":
        program_data = os.environ.get("PROGRAMDATA", "C:\\ProgramData")
        default_path = Path(program_data) / (
            "Blackmagic Design/DaVinci Resolve/Support/Developer/Scripting"
        )
        if default_path.exists():
            return default_path
    
    return None
