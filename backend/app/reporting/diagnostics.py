"""
Diagnostics and environment capture for job reports.

Observational only — captures system state at report generation time.
"""

import platform
import subprocess
import sys
from pathlib import Path
from typing import Optional


def get_python_version() -> str:
    """Return Python version (e.g., '3.11.5')."""
    return f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"


def get_os_version() -> str:
    """Return OS version (e.g., 'macOS-14.1.1-arm64')."""
    return platform.platform()


def get_hostname() -> str:
    """Return machine hostname."""
    return platform.node()


def get_proxx_version() -> str:
    """
    Return Proxx version.
    
    Attempts to detect git commit hash from repository.
    Fallback: hardcoded version from main.py.
    """
    try:
        # Try to get git commit hash
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=Path(__file__).parent.parent.parent,  # backend/ root
            capture_output=True,
            text=True,
            timeout=2,
        )
        if result.returncode == 0:
            commit = result.stdout.strip()
            return f"dev+{commit}"
    except Exception:
        pass
    
    # Fallback to hardcoded version
    return "0.1.0"


def get_resolve_info() -> dict:
    """
    Capture Resolve installation information.
    
    Returns dict with:
    - path: Installation path
    - version: Detected version (or "unknown")
    - studio: Studio license detected (bool or None)
    """
    try:
        # Lazy import to avoid breaking if resolve module doesn't exist yet
        from app.resolve.discovery import discover_resolve
        resolve = discover_resolve()
        return {
            "path": str(resolve.path),
            "version": resolve.version or "unknown",
            "studio": resolve.studio,
        }
    except ImportError:
        return {
            "path": None,
            "version": "unknown",
            "studio": None,
            "error": "Resolve module not yet implemented",
        }
    except Exception as e:
        return {
            "path": None,
            "version": "unknown",
            "studio": None,
            "error": str(e),
        }
