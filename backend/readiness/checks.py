"""
Forge Readiness Checks - Individual check implementations.

Each check follows the same pattern:
1. Run a specific verification
2. Return CheckResult with:
   - id: unique identifier
   - status: pass | fail
   - message: factual explanation
   - hint: optional remediation text (not an action)

Part of IMPLEMENTATION SLICE 6: Operator Entrypoints and Packaging.
"""

import os
import shutil
import subprocess
import sys
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Callable, List, Optional


class CheckStatus(str, Enum):
    """Check result status."""
    PASS = "pass"
    FAIL = "fail"


@dataclass
class CheckResult:
    """
    Result of a single readiness check.
    
    Attributes:
        id: Unique identifier for this check (e.g., "python_version")
        status: pass | fail
        message: Factual explanation of the result
        hint: Optional remediation hint (text only)
    """
    id: str
    status: CheckStatus
    message: str
    hint: Optional[str] = None
    
    def to_dict(self) -> dict:
        """Serialize to dictionary for JSON output."""
        result = {
            "id": self.id,
            "status": self.status.value,
            "message": self.message,
        }
        if self.hint:
            result["hint"] = self.hint
        return result
    
    @property
    def passed(self) -> bool:
        """Convenience property to check if this check passed."""
        return self.status == CheckStatus.PASS


# Type alias for check functions
ReadinessCheck = Callable[[], CheckResult]


# =============================================================================
# Python Version Check
# =============================================================================

MINIMUM_PYTHON_VERSION = (3, 11)


def check_python_version() -> CheckResult:
    """
    Check that Python version meets minimum requirements.
    
    Forge requires Python 3.11 or later for:
    - Dataclass improvements
    - typing.Self support
    - tomllib stdlib
    """
    current = sys.version_info[:2]
    version_str = f"{current[0]}.{current[1]}"
    minimum_str = f"{MINIMUM_PYTHON_VERSION[0]}.{MINIMUM_PYTHON_VERSION[1]}"
    
    if current >= MINIMUM_PYTHON_VERSION:
        return CheckResult(
            id="python_version",
            status=CheckStatus.PASS,
            message=f"Python {version_str} (minimum: {minimum_str})",
        )
    else:
        return CheckResult(
            id="python_version",
            status=CheckStatus.FAIL,
            message=f"Python {version_str} detected, requires {minimum_str}+",
            hint=f"Install Python {minimum_str} or later from python.org",
        )


# =============================================================================
# FFmpeg Check
# =============================================================================

def check_ffmpeg_available() -> CheckResult:
    """
    Check that FFmpeg is available in PATH.
    
    FFmpeg is required for non-RAW proxy generation.
    Resolve-only users may not have FFmpeg, but this limits capabilities.
    """
    ffmpeg_path = shutil.which("ffmpeg")
    
    if ffmpeg_path:
        # Try to get version
        try:
            result = subprocess.run(
                ["ffmpeg", "-version"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            # Extract first line for version info
            version_line = result.stdout.split("\n")[0] if result.stdout else "version unknown"
            return CheckResult(
                id="ffmpeg_available",
                status=CheckStatus.PASS,
                message=f"FFmpeg found: {version_line[:60]}",
            )
        except (subprocess.TimeoutExpired, subprocess.SubprocessError):
            return CheckResult(
                id="ffmpeg_available",
                status=CheckStatus.PASS,
                message=f"FFmpeg found at {ffmpeg_path}",
            )
    else:
        return CheckResult(
            id="ffmpeg_available",
            status=CheckStatus.FAIL,
            message="FFmpeg not found in PATH",
            hint="Install FFmpeg: brew install ffmpeg (macOS) or apt install ffmpeg (Linux)",
        )


# =============================================================================
# Resolve Installation Check
# =============================================================================

def check_resolve_installed() -> CheckResult:
    """
    Check if DaVinci Resolve is installed.
    
    Resolve is required for RAW format support (BRAW, R3D, ARRIRAW, etc).
    Detection is platform-specific.
    """
    # Import from v2 module
    try:
        from v2.resolve_installation import detect_resolve_installation
        
        installation = detect_resolve_installation()
        
        if installation:
            return CheckResult(
                id="resolve_installed",
                status=CheckStatus.PASS,
                message=f"DaVinci Resolve {installation.version} installed at {installation.install_path}",
            )
        else:
            return CheckResult(
                id="resolve_installed",
                status=CheckStatus.FAIL,
                message="DaVinci Resolve not detected",
                hint="RAW format support requires DaVinci Resolve. Download from blackmagicdesign.com",
            )
    except ImportError:
        # Fallback if v2 module not available
        return _check_resolve_installed_fallback()


def _check_resolve_installed_fallback() -> CheckResult:
    """Fallback Resolve detection for macOS."""
    import platform
    
    if platform.system() != "Darwin":
        return CheckResult(
            id="resolve_installed",
            status=CheckStatus.FAIL,
            message="Resolve detection not implemented for this platform",
            hint="RAW format support requires DaVinci Resolve. Download from blackmagicdesign.com",
        )
    
    # Check common macOS paths
    studio_path = Path("/Applications/DaVinci Resolve Studio/DaVinci Resolve.app")
    free_path = Path("/Applications/DaVinci Resolve/DaVinci Resolve.app")
    
    if studio_path.exists():
        return CheckResult(
            id="resolve_installed",
            status=CheckStatus.PASS,
            message=f"DaVinci Resolve installed at {studio_path}",
        )
    elif free_path.exists():
        return CheckResult(
            id="resolve_installed",
            status=CheckStatus.PASS,
            message=f"DaVinci Resolve installed at {free_path}",
        )
    else:
        return CheckResult(
            id="resolve_installed",
            status=CheckStatus.FAIL,
            message="DaVinci Resolve not found in /Applications",
            hint="RAW format support requires DaVinci Resolve. Download from blackmagicdesign.com",
        )


# =============================================================================
# Resolve Edition Check
# =============================================================================

def check_resolve_edition() -> CheckResult:
    """
    Check if DaVinci Resolve Studio is installed.
    
    Resolve Studio is required for:
    - RAW format scripting API access
    - Some advanced proxy features
    
    Resolve Free is functional but limited.
    """
    try:
        from v2.resolve_installation import detect_resolve_installation
        
        installation = detect_resolve_installation()
        
        if not installation:
            return CheckResult(
                id="resolve_edition",
                status=CheckStatus.FAIL,
                message="Resolve not installed, edition unknown",
                hint="Install DaVinci Resolve from blackmagicdesign.com",
            )
        
        if installation.edition == "studio":
            return CheckResult(
                id="resolve_edition",
                status=CheckStatus.PASS,
                message=f"Resolve Studio {installation.version} ({installation.detection_confidence} confidence)",
            )
        elif installation.edition == "free":
            return CheckResult(
                id="resolve_edition",
                status=CheckStatus.FAIL,
                message=f"Resolve Free {installation.version} detected",
                hint="Resolve Studio is required for full RAW proxy support",
            )
        else:
            return CheckResult(
                id="resolve_edition",
                status=CheckStatus.FAIL,
                message=f"Resolve edition unknown (version {installation.version})",
                hint="Edition detection inconclusive. RAW features may be limited.",
            )
    except ImportError:
        return _check_resolve_edition_fallback()


def _check_resolve_edition_fallback() -> CheckResult:
    """Fallback edition detection for macOS."""
    import platform
    
    if platform.system() != "Darwin":
        return CheckResult(
            id="resolve_edition",
            status=CheckStatus.FAIL,
            message="Resolve edition detection not implemented for this platform",
        )
    
    studio_path = Path("/Applications/DaVinci Resolve Studio/DaVinci Resolve.app")
    free_path = Path("/Applications/DaVinci Resolve/DaVinci Resolve.app")
    
    if studio_path.exists():
        return CheckResult(
            id="resolve_edition",
            status=CheckStatus.PASS,
            message="Resolve Studio detected (install path)",
        )
    elif free_path.exists():
        return CheckResult(
            id="resolve_edition",
            status=CheckStatus.FAIL,
            message="Resolve Free detected (install path)",
            hint="Resolve Studio is required for full RAW proxy support",
        )
    else:
        return CheckResult(
            id="resolve_edition",
            status=CheckStatus.FAIL,
            message="Resolve not installed",
            hint="Install DaVinci Resolve from blackmagicdesign.com",
        )


# =============================================================================
# Directory Writability Check
# =============================================================================

def check_directories_writable() -> CheckResult:
    """
    Check that required directories are writable.
    
    Forge needs write access to:
    - Current working directory (for temp files)
    - Database directory (for monitoring DB)
    """
    issues = []
    
    # Check current working directory
    cwd = Path.cwd()
    if not os.access(cwd, os.W_OK):
        issues.append(f"Cannot write to working directory: {cwd}")
    
    # Check backend directory (relative to this file)
    backend_dir = Path(__file__).parent.parent.resolve()
    if not os.access(backend_dir, os.W_OK):
        issues.append(f"Cannot write to backend directory: {backend_dir}")
    
    if issues:
        return CheckResult(
            id="directories_writable",
            status=CheckStatus.FAIL,
            message="; ".join(issues),
            hint="Check directory permissions or run from a writable location",
        )
    else:
        return CheckResult(
            id="directories_writable",
            status=CheckStatus.PASS,
            message="Required directories are writable",
        )


# =============================================================================
# License Check
# =============================================================================

def check_license_valid() -> CheckResult:
    """
    Check if a valid Forge license is loaded.
    
    License tiers:
    - FREE: Limited workers
    - FREELANCE/FACILITY: More workers
    
    No license file = FREE tier (valid but limited).
    """
    try:
        from licensing import get_current_license, LicenseTier
        
        license_info = get_current_license()
        
        # License uses license_type not tier
        tier_name = license_info.license_type.value if hasattr(license_info, 'license_type') else "unknown"
        max_workers = license_info.max_workers if license_info.max_workers else "unlimited"
        
        return CheckResult(
            id="license_valid",
            status=CheckStatus.PASS,
            message=f"License: {tier_name} (max {max_workers} workers)",
        )
    except ImportError:
        # Licensing module not available - assume FREE
        return CheckResult(
            id="license_valid",
            status=CheckStatus.PASS,
            message="License: FREE (licensing module not loaded)",
        )
    except Exception as e:
        return CheckResult(
            id="license_valid",
            status=CheckStatus.FAIL,
            message=f"License check failed: {e}",
            hint="Check forge_license.json or FORGE_LICENSE_TYPE environment variable",
        )


# =============================================================================
# Worker Capacity Check
# =============================================================================

def check_worker_capacity() -> CheckResult:
    """
    Check that at least one worker slot is available.
    
    This verifies the license enforcer can allocate workers.
    """
    try:
        from licensing import get_enforcer
        
        enforcer = get_enforcer()
        active = enforcer.get_active_worker_count()
        max_workers = enforcer.get_max_workers()
        
        # max_workers is None for unlimited
        if max_workers is None:
            return CheckResult(
                id="worker_capacity",
                status=CheckStatus.PASS,
                message=f"Worker capacity: {active} active (unlimited)",
            )
        
        available = max_workers - active
        if available > 0:
            return CheckResult(
                id="worker_capacity",
                status=CheckStatus.PASS,
                message=f"Worker capacity: {available}/{max_workers} available",
            )
        else:
            return CheckResult(
                id="worker_capacity",
                status=CheckStatus.FAIL,
                message=f"No worker slots available ({active}/{max_workers} in use)",
                hint="Wait for running jobs to complete or upgrade license for more workers",
            )
    except ImportError:
        # Assume single worker available if licensing not loaded
        return CheckResult(
            id="worker_capacity",
            status=CheckStatus.PASS,
            message="Worker capacity: 1/1 available (default)",
        )
    except Exception as e:
        return CheckResult(
            id="worker_capacity",
            status=CheckStatus.FAIL,
            message=f"Worker capacity check failed: {e}",
        )


# =============================================================================
# Monitoring DB Check
# =============================================================================

def check_monitoring_db() -> CheckResult:
    """
    Check that the monitoring database is writable.
    
    The monitoring DB stores job execution history and telemetry.
    """
    # Check for common DB paths
    db_paths = [
        Path("awaire_proxy.db"),
        Path("proxx.db"),
        Path("backend/awaire_proxy.db"),
        Path("backend/proxx.db"),
    ]
    
    # Find existing DB
    existing_db = None
    for db_path in db_paths:
        if db_path.exists():
            existing_db = db_path
            break
    
    if existing_db:
        # Check if writable
        if os.access(existing_db, os.W_OK):
            return CheckResult(
                id="monitoring_db",
                status=CheckStatus.PASS,
                message=f"Monitoring DB writable: {existing_db}",
            )
        else:
            return CheckResult(
                id="monitoring_db",
                status=CheckStatus.FAIL,
                message=f"Monitoring DB not writable: {existing_db}",
                hint="Check file permissions on the database file",
            )
    else:
        # No DB exists - check if we can create one
        test_path = db_paths[0]
        try:
            # Try to create parent directory if needed
            test_path.parent.mkdir(parents=True, exist_ok=True)
            # Try to create a test file
            test_file = test_path.parent / ".forge_write_test"
            test_file.write_text("test")
            test_file.unlink()
            return CheckResult(
                id="monitoring_db",
                status=CheckStatus.PASS,
                message="Monitoring DB can be created",
            )
        except (OSError, PermissionError) as e:
            return CheckResult(
                id="monitoring_db",
                status=CheckStatus.FAIL,
                message=f"Cannot create monitoring DB: {e}",
                hint="Check write permissions in the working directory",
            )


# =============================================================================
# Aggregation Functions
# =============================================================================

# List of all mandatory checks
ALL_CHECKS: List[ReadinessCheck] = [
    check_python_version,
    check_ffmpeg_available,
    check_resolve_installed,
    check_resolve_edition,
    check_directories_writable,
    check_license_valid,
    check_worker_capacity,
    check_monitoring_db,
]

# Checks that MUST pass for Forge to start
BLOCKING_CHECKS = {
    "python_version",
    "directories_writable",
    "license_valid",
    "worker_capacity",
}


def run_all_checks() -> List[CheckResult]:
    """
    Run all readiness checks and return results.
    
    Returns:
        List of CheckResult instances, one per check.
    """
    results = []
    for check in ALL_CHECKS:
        try:
            result = check()
            results.append(result)
        except Exception as e:
            # Catch-all for check failures
            results.append(CheckResult(
                id=check.__name__.replace("check_", ""),
                status=CheckStatus.FAIL,
                message=f"Check failed with error: {e}",
            ))
    return results


def is_ready(results: List[CheckResult]) -> bool:
    """
    Determine if Forge is ready to start based on check results.
    
    Forge is READY if all blocking checks pass.
    Non-blocking checks (FFmpeg, Resolve) can fail but limit capabilities.
    
    Args:
        results: List of CheckResult from run_all_checks()
        
    Returns:
        True if ready, False otherwise
    """
    for result in results:
        if result.id in BLOCKING_CHECKS and not result.passed:
            return False
    return True
