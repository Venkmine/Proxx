"""
Resolve capability validation.

Validates discovered Resolve installations to ensure they meet
requirements for Proxx v1.x (Studio license required).
"""

from .models import ResolveCapability, ResolveInstallation
from .errors import (
    ResolveFreeDetectedError,
    ResolveValidationError,
)


def validate_resolve_capability(
    installation: ResolveInstallation,
) -> ResolveCapability:
    """
    Validate a discovered Resolve installation.
    
    Checks:
    - Studio vs Free license detection
    - Scripting API availability
    
    Args:
        installation: Discovered Resolve installation to validate.
    
    Returns:
        ResolveCapability indicating availability and any failure reasons.
    
    Notes:
        - This function does NOT raise exceptions
        - It returns structured capability status with human-readable reasons
        - Callers should check is_available before attempting Resolve operations
        - Version enforcement is NOT performed (version detection only)
    """
    # Check for scripting API path
    if installation.script_api_path is None:
        return ResolveCapability(
            is_available=False,
            installation=installation,
            failure_reason=(
                f"Resolve scripting API not found. "
                f"Expected at platform-specific location. "
                f"Installation may be incomplete or corrupted."
            ),
        )
    
    if not installation.script_api_path.exists():
        return ResolveCapability(
            is_available=False,
            installation=installation,
            failure_reason=(
                f"Resolve scripting API path does not exist: "
                f"{installation.script_api_path}. "
                f"Installation may be incomplete or corrupted."
            ),
        )
    
    # Attempt Studio vs Free detection
    # TODO: Implement robust license detection
    # Possible approaches:
    # - Query Resolve API (requires launching Resolve)
    # - Parse license files
    # - Registry/plist inspection
    #
    # For Phase 5, we defer this to execution time (Phase 6+)
    # when we actually attempt to use the API.
    #
    # For now, assume Studio until proven otherwise.
    is_studio = _detect_studio_license(installation)
    
    if is_studio is False:
        return ResolveCapability(
            is_available=False,
            installation=installation,
            failure_reason=(
                "Resolve Free detected. Proxx v1.x requires Resolve Studio "
                "for scripting API access. Please upgrade to Resolve Studio."
            ),
        )
    
    # If we reach here, installation appears valid
    # (Note: is_studio may still be None if detection was inconclusive)
    return ResolveCapability(
        is_available=True,
        installation=installation,
        failure_reason=None,
    )


def _detect_studio_license(installation: ResolveInstallation) -> bool | None:
    """
    Attempt to detect Studio vs Free license.
    
    Returns:
        True: Studio detected
        False: Free detected
        None: Cannot determine (assume Studio until proven otherwise)
    
    TODO: Implement robust license detection.
    
    Phase 5 defers this to execution time (Phase 6+).
    At execution time, attempting to use restricted API will
    fail explicitly if using Free version.
    
    For now, optimistically assume Studio.
    """
    # Placeholder: license detection logic goes here
    # For Phase 5, return None (unknown)
    return None
