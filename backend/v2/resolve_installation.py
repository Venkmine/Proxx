"""
V2 Resolve Installation Detection - Edition and version discovery.

This module detects DaVinci Resolve installation details including:
- Resolve version (e.g., "19.0.3")
- Resolve edition: "free" | "studio" | "unknown"

Edition detection is best-effort but explicit when unknown.
Results are captured in JobExecutionResult metadata and test reports.

Part of V2 Resolve Dev 5: Evidence-based support matrix.
"""

import os
import plistlib
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

# =============================================================================
# Resolve Installation Info
# =============================================================================

@dataclass
class ResolveInstallation:
    """
    Information about the installed DaVinci Resolve instance.
    
    Attributes:
        version: Resolve version string (e.g., "19.0.3")
        edition: "free" | "studio" | "unknown"
        install_path: Path to Resolve.app or executable
        detection_method: How edition was detected
        detection_confidence: "high" | "medium" | "low"
    """
    version: str
    edition: str  # "free" | "studio" | "unknown"
    install_path: str
    detection_method: str
    detection_confidence: str  # "high" | "medium" | "low"
    
    def to_dict(self) -> dict:
        """Serialize to dictionary for JSON output."""
        return {
            "version": self.version,
            "edition": self.edition,
            "install_path": self.install_path,
            "detection_method": self.detection_method,
            "detection_confidence": self.detection_confidence,
        }


# =============================================================================
# macOS Detection
# =============================================================================

def _detect_resolve_macos() -> Optional[ResolveInstallation]:
    """
    Detect Resolve installation on macOS.
    
    Detection methods (in priority order):
    1. Check /Applications/DaVinci Resolve/DaVinci Resolve.app/Contents/Info.plist
    2. Check /Applications/DaVinci Resolve Studio/DaVinci Resolve.app/Contents/Info.plist
    3. Look for Resolve.app in common locations
    
    Edition detection:
    - Studio: Parent folder contains "Studio" in name, or license check
    - Free: Parent folder is "DaVinci Resolve" without "Studio"
    - Unknown: Found but cannot determine edition
    
    Returns:
        ResolveInstallation if found, None otherwise
    """
    # Common installation paths
    studio_path = Path("/Applications/DaVinci Resolve Studio/DaVinci Resolve.app")
    free_path = Path("/Applications/DaVinci Resolve/DaVinci Resolve.app")
    
    # Check Studio first (more specific path)
    if studio_path.exists():
        info_plist = studio_path / "Contents" / "Info.plist"
        if info_plist.exists():
            try:
                with open(info_plist, "rb") as f:
                    plist_data = plistlib.load(f)
                    version = plist_data.get("CFBundleShortVersionString", "unknown")
                    
                    return ResolveInstallation(
                        version=version,
                        edition="studio",
                        install_path=str(studio_path),
                        detection_method="macos_install_path",
                        detection_confidence="high",
                    )
            except Exception:
                pass
    
    # Check Free installation path (but could be Studio with license)
    if free_path.exists():
        info_plist = free_path / "Contents" / "Info.plist"
        if info_plist.exists():
            try:
                with open(info_plist, "rb") as f:
                    plist_data = plistlib.load(f)
                    version = plist_data.get("CFBundleShortVersionString", "unknown")
                    
                    # Check for Studio license files
                    license_dir = Path("/Library/Application Support/Blackmagic Design/DaVinci Resolve/.license")
                    has_studio_license = False
                    if license_dir.exists():
                        # Look for .davinciresolvestudio_*.lic files
                        studio_license_files = list(license_dir.glob(".davinciresolvestudio_*.lic"))
                        has_studio_license = len(studio_license_files) > 0
                    
                    edition = "studio" if has_studio_license else "free"
                    detection_method = "macos_license_check" if has_studio_license else "macos_install_path"
                    
                    return ResolveInstallation(
                        version=version,
                        edition=edition,
                        install_path=str(free_path),
                        detection_method=detection_method,
                        detection_confidence="high",
                    )
            except Exception:
                pass
    
    # Fallback: Search for any Resolve.app
    applications = Path("/Applications")
    if applications.exists():
        for resolve_dir in applications.glob("*Resolve*"):
            if resolve_dir.is_dir():
                resolve_app = resolve_dir / "DaVinci Resolve.app"
                if resolve_app.exists():
                    info_plist = resolve_app / "Contents" / "Info.plist"
                    if info_plist.exists():
                        try:
                            with open(info_plist, "rb") as f:
                                plist_data = plistlib.load(f)
                                version = plist_data.get("CFBundleShortVersionString", "unknown")
                                
                                # Infer edition from parent folder name
                                if "studio" in resolve_dir.name.lower():
                                    edition = "studio"
                                    confidence = "medium"
                                elif "resolve" in resolve_dir.name.lower():
                                    edition = "free"
                                    confidence = "medium"
                                else:
                                    edition = "unknown"
                                    confidence = "low"
                                
                                return ResolveInstallation(
                                    version=version,
                                    edition=edition,
                                    install_path=str(resolve_app),
                                    detection_method="macos_fallback_search",
                                    detection_confidence=confidence,
                                )
                        except Exception:
                            pass
    
    return None


# =============================================================================
# Windows Detection (Stub)
# =============================================================================

def _detect_resolve_windows() -> Optional[ResolveInstallation]:
    """
    Detect Resolve installation on Windows.
    
    Common paths:
    - C:\\Program Files\\Blackmagic Design\\DaVinci Resolve\\Resolve.exe
    - C:\\Program Files\\Blackmagic Design\\DaVinci Resolve Studio\\Resolve.exe
    
    TODO: Implement Windows detection when needed.
    
    Returns:
        ResolveInstallation if found, None otherwise
    """
    # Stub for now - will implement when Windows support is needed
    return None


# =============================================================================
# Linux Detection (Stub)
# =============================================================================

def _detect_resolve_linux() -> Optional[ResolveInstallation]:
    """
    Detect Resolve installation on Linux.
    
    Common paths:
    - /opt/resolve/bin/resolve
    - ~/Applications/resolve/bin/resolve
    
    TODO: Implement Linux detection when needed.
    
    Returns:
        ResolveInstallation if found, None otherwise
    """
    # Stub for now - will implement when Linux support is needed
    return None


# =============================================================================
# Public API
# =============================================================================

def detect_resolve_installation() -> Optional[ResolveInstallation]:
    """
    Detect DaVinci Resolve installation (OS-agnostic).
    
    This function automatically selects the appropriate detection method
    based on the current operating system.
    
    Returns:
        ResolveInstallation if Resolve is installed, None otherwise
        
    Example:
        >>> info = detect_resolve_installation()
        >>> if info:
        ...     print(f"Resolve {info.edition} {info.version}")
        ... else:
        ...     print("Resolve not found")
    """
    import sys
    
    if sys.platform == "darwin":
        return _detect_resolve_macos()
    elif sys.platform == "win32":
        return _detect_resolve_windows()
    elif sys.platform.startswith("linux"):
        return _detect_resolve_linux()
    else:
        return None


def get_resolve_version() -> str:
    """
    Get Resolve version string.
    
    Returns:
        Version string (e.g., "19.0.3") or "unknown"
    """
    info = detect_resolve_installation()
    return info.version if info else "unknown"


def get_resolve_edition() -> str:
    """
    Get Resolve edition.
    
    Returns:
        "free" | "studio" | "unknown"
    """
    info = detect_resolve_installation()
    return info.edition if info else "unknown"


def is_resolve_studio() -> bool:
    """
    Check if Resolve Studio is installed.
    
    Returns:
        True if Studio edition is detected, False otherwise
    """
    info = detect_resolve_installation()
    return info.edition == "studio" if info else False


def is_resolve_free() -> bool:
    """
    Check if Resolve Free is installed.
    
    Returns:
        True if Free edition is detected, False otherwise
    """
    info = detect_resolve_installation()
    return info.edition == "free" if info else False


# =============================================================================
# Process Detection
# =============================================================================

def is_resolve_running() -> bool:
    """
    Check if DaVinci Resolve process is currently running.
    
    This is critical for headless execution to ensure we don't accidentally
    attach to or interfere with an existing UI session.
    
    Platform support:
        - macOS: Uses pgrep to detect "DaVinci Resolve" process
        - Windows: Not implemented (returns False)
        - Linux: Not implemented (returns False)
    
    Returns:
        True if Resolve process is running, False otherwise
    """
    import sys
    
    if sys.platform == "darwin":
        # macOS: Use pgrep to search for Resolve process
        try:
            result = subprocess.run(
                ["pgrep", "-f", "DaVinci Resolve"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            # pgrep returns 0 if process found, 1 if not found
            return result.returncode == 0
        except (subprocess.TimeoutExpired, FileNotFoundError):
            # If pgrep is not available or times out, assume not running
            return False
    
    # Other platforms not implemented - return False (allow execution)
    return False


# =============================================================================
# Test/Debug Utility
# =============================================================================

if __name__ == "__main__":
    """
    Test/debug utility to display detected Resolve installation.
    
    Run: python -m backend.v2.resolve_installation
    """
    info = detect_resolve_installation()
    
    if info:
        print("DaVinci Resolve detected:")
        print(f"  Version: {info.version}")
        print(f"  Edition: {info.edition}")
        print(f"  Path: {info.install_path}")
        print(f"  Detection: {info.detection_method} (confidence: {info.detection_confidence})")
    else:
        print("DaVinci Resolve not found")
        print("Searched common installation paths for your OS")
