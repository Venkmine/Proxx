"""
Capabilities API — Execution Engine Availability and Status

Phase 12: Restore Resolve RAW Routing
=====================================
This endpoint provides truthful, auditable capability status for:
1. FFmpeg availability
2. DaVinci Resolve availability (installation + runtime status)
3. Per-format routing decisions

Design Principles:
- NO silent fallback
- NO "it still works" hand-waving
- Explicit capability_status: SUPPORTED | BLOCKED | UNKNOWN
- Clear, actionable user messages

Usage:
    GET /api/capabilities
    Returns: CapabilitiesResponse with engine availability

Part of Phase 12: Restore Resolve RAW Routing
"""

import logging
import shutil
import subprocess
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["capabilities"])


# =============================================================================
# Response Models
# =============================================================================


class EngineStatus(BaseModel):
    """Status of an execution engine."""

    available: bool
    """True if engine is ready for execution."""

    reason: Optional[str] = None
    """If unavailable, human-readable explanation."""

    version: Optional[str] = None
    """Engine version if detected."""

    path: Optional[str] = None
    """Path to engine binary/installation."""


class ResolveStatus(EngineStatus):
    """Extended status for DaVinci Resolve."""

    edition: Optional[str] = None
    """free | studio | unknown"""

    running: bool = False
    """True if Resolve process is currently running."""

    scripting_available: bool = False
    """True if scripting API is available."""


class CapabilitiesResponse(BaseModel):
    """Complete capabilities report."""

    timestamp: str
    """ISO timestamp of capability check."""

    ffmpeg: EngineStatus
    """FFmpeg engine status."""

    resolve: ResolveStatus
    """DaVinci Resolve engine status."""

    raw_routing: str
    """Current RAW file routing: 'resolve' | 'blocked'"""

    raw_routing_reason: str
    """Explanation of RAW routing decision."""


# =============================================================================
# Capability Detection Functions
# =============================================================================


def check_ffmpeg_availability() -> EngineStatus:
    """
    Check FFmpeg availability.

    Returns:
        EngineStatus with availability and version info.
    """
    ffmpeg_path = shutil.which("ffmpeg")

    if not ffmpeg_path:
        return EngineStatus(
            available=False,
            reason="FFmpeg not found in PATH. Install FFmpeg to enable standard format processing.",
            version=None,
            path=None,
        )

    # Get version
    try:
        result = subprocess.run(
            [ffmpeg_path, "-version"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        version_line = result.stdout.split("\n")[0] if result.stdout else "unknown"
        # Extract version from "ffmpeg version X.Y.Z ..."
        version = version_line.split(" ")[2] if "version" in version_line else version_line

        return EngineStatus(
            available=True,
            reason=None,
            version=version,
            path=ffmpeg_path,
        )
    except (subprocess.TimeoutExpired, Exception) as e:
        return EngineStatus(
            available=True,
            reason=f"FFmpeg found but version check failed: {e}",
            version="unknown",
            path=ffmpeg_path,
        )


def check_resolve_availability() -> ResolveStatus:
    """
    Check DaVinci Resolve availability.

    This performs a comprehensive check:
    1. Is Resolve installed?
    2. What edition (Free/Studio)?
    3. Is Resolve currently running?
    4. Is scripting API accessible?

    Returns:
        ResolveStatus with full availability info.
    """
    # Import Resolve detection utilities
    try:
        from v2.resolve_installation import (
            detect_resolve_installation,
            is_resolve_running,
        )
    except ImportError:
        try:
            from backend.v2.resolve_installation import (
                detect_resolve_installation,
                is_resolve_running,
            )
        except ImportError:
            return ResolveStatus(
                available=False,
                reason="Resolve detection module not available.",
                edition=None,
                running=False,
                scripting_available=False,
            )

    # Check installation
    installation = detect_resolve_installation()

    if not installation:
        return ResolveStatus(
            available=False,
            reason="DaVinci Resolve is not installed. Install Resolve Studio for RAW format support.",
            edition=None,
            running=False,
            scripting_available=False,
        )

    # Check if running
    running = is_resolve_running()

    # Check scripting API
    scripting_available = False
    scripting_reason = None

    try:
        from v2.engines.resolve_engine import check_resolve_availability as check_resolve_api
    except ImportError:
        try:
            from backend.v2.engines.resolve_engine import check_resolve_availability as check_resolve_api
        except ImportError:
            check_resolve_api = None

    if check_resolve_api:
        try:
            api_result = check_resolve_api()
            scripting_available = api_result.available
            if not scripting_available:
                scripting_reason = api_result.reason
        except Exception as e:
            scripting_reason = f"Failed to check scripting API: {e}"

    # Determine overall availability
    if installation.edition == "free":
        # Free edition has limited scripting support
        available = False
        reason = (
            "DaVinci Resolve Free detected. "
            "Scripted rendering requires DaVinci Resolve Studio. "
            "RAW file transcode will be blocked."
        )
    elif not running:
        available = False
        reason = (
            "DaVinci Resolve Studio is installed but not running. "
            "Launch Resolve to enable RAW file processing."
        )
    elif not scripting_available:
        available = False
        reason = scripting_reason or (
            "DaVinci Resolve is running but scripting API is not accessible. "
            "Enable external scripting in Resolve: Preferences > System > General > External scripting using."
        )
    else:
        available = True
        reason = None

    return ResolveStatus(
        available=available,
        reason=reason,
        version=installation.version,
        path=installation.install_path,
        edition=installation.edition,
        running=running,
        scripting_available=scripting_available,
    )


# =============================================================================
# API Endpoint
# =============================================================================


@router.get("/capabilities", response_model=CapabilitiesResponse)
async def get_capabilities() -> CapabilitiesResponse:
    """
    Get execution engine capability status.

    This endpoint provides truthful capability information for:
    - FFmpeg: Standard format processing
    - Resolve: RAW format processing (BRAW, R3D, ARRIRAW, ProRes RAW)

    The UI should use this to:
    1. Show engine availability indicators
    2. Block RAW jobs when Resolve is unavailable
    3. Provide actionable error messages

    Example Response:
    ```json
    {
        "timestamp": "2026-01-11T10:00:00Z",
        "ffmpeg": {
            "available": true,
            "version": "6.1",
            "path": "/opt/homebrew/bin/ffmpeg"
        },
        "resolve": {
            "available": false,
            "reason": "DaVinci Resolve is not running",
            "edition": "studio",
            "running": false,
            "scripting_available": false
        },
        "raw_routing": "blocked",
        "raw_routing_reason": "Resolve not running. Launch Resolve to enable RAW processing."
    }
    ```
    """
    timestamp = datetime.now(timezone.utc).isoformat()

    logger.info("[CAPABILITIES] Checking execution engine availability")

    ffmpeg_status = check_ffmpeg_availability()
    resolve_status = check_resolve_availability()

    # Determine RAW routing
    if resolve_status.available:
        raw_routing = "resolve"
        raw_routing_reason = "RAW files will be processed by DaVinci Resolve."
    else:
        raw_routing = "blocked"
        raw_routing_reason = resolve_status.reason or "Resolve unavailable for RAW processing."

    logger.info(
        f"[CAPABILITIES] FFmpeg: {ffmpeg_status.available}, "
        f"Resolve: {resolve_status.available}, RAW routing: {raw_routing}"
    )

    return CapabilitiesResponse(
        timestamp=timestamp,
        ffmpeg=ffmpeg_status,
        resolve=resolve_status,
        raw_routing=raw_routing,
        raw_routing_reason=raw_routing_reason,
    )


@router.get("/capabilities/resolve/check")
async def check_resolve_for_job():
    """
    Quick check if Resolve is ready for RAW job execution.

    Returns:
        Simple availability status for pre-job validation.

    Example Response (available):
    ```json
    {
        "available": true,
        "can_process_raw": true
    }
    ```

    Example Response (blocked):
    ```json
    {
        "available": false,
        "can_process_raw": false,
        "reason": "DaVinci Resolve is not running",
        "action": "Launch DaVinci Resolve to process RAW files"
    }
    ```
    """
    resolve_status = check_resolve_availability()

    if resolve_status.available:
        return {
            "available": True,
            "can_process_raw": True,
        }
    else:
        return {
            "available": False,
            "can_process_raw": False,
            "reason": resolve_status.reason,
            "action": _get_resolve_action(resolve_status),
        }


def _get_resolve_action(status: ResolveStatus) -> str:
    """Get actionable instruction for Resolve issues."""
    if not status.path:
        return "Install DaVinci Resolve Studio from blackmagicdesign.com"

    if status.edition == "free":
        return "Upgrade to DaVinci Resolve Studio for scripted RAW processing"

    if not status.running:
        return "Launch DaVinci Resolve"

    if not status.scripting_available:
        return "Enable external scripting in Resolve: Preferences > System > General"

    return "Check Resolve configuration"
