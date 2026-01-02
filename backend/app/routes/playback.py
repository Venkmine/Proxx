"""
Playback Probe API Routes

============================================================================
ENDPOINTS
============================================================================
POST /playback/probe  — Probe a file for playback capability

This is the SINGLE authoritative endpoint for determining if a file
can be played back in the browser.

See: backend/playback_probe.py for probe implementation
============================================================================
"""

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict
import logging

from playback_probe import (
    probe_playback_capability,
    clear_probe_cache,
    get_probe_cache_stats,
    PlaybackCapability,
    get_playback_message,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/playback", tags=["playback"])


# ============================================================================
# REQUEST/RESPONSE MODELS
# ============================================================================

class PlaybackProbeRequest(BaseModel):
    """Request for playback capability probe."""
    
    model_config = ConfigDict(extra="forbid")
    
    path: str


class PlaybackProbeResponse(BaseModel):
    """Response for playback capability probe."""
    
    model_config = ConfigDict(extra="forbid")
    
    capability: str  # PLAYABLE | METADATA_ONLY | NO_VIDEO | ERROR
    engine: str
    probe_ms: int
    message: str


class CacheStatsResponse(BaseModel):
    """Response for cache statistics."""
    
    model_config = ConfigDict(extra="forbid")
    
    entries: int
    capabilities: dict


class CacheClearResponse(BaseModel):
    """Response for cache clear operation."""
    
    model_config = ConfigDict(extra="forbid")
    
    cleared: int


# ============================================================================
# ENDPOINTS
# ============================================================================

@router.post("/probe", response_model=PlaybackProbeResponse)
async def probe_playback(request: PlaybackProbeRequest) -> PlaybackProbeResponse:
    """
    Probe a media file to determine playback capability.
    
    This is THE SINGLE SOURCE OF TRUTH for playback capability.
    
    The probe uses FFmpeg to attempt decoding exactly 1 video frame:
    - Exit code 0 → PLAYABLE
    - No video stream → NO_VIDEO  
    - Decode error → METADATA_ONLY (e.g., RAW formats)
    - Other error → ERROR
    
    Timeout: 3 seconds max. Never retries.
    
    Results are cached by (path, size, mtime) for session lifetime.
    
    Args:
        request: PlaybackProbeRequest with path to probe
        
    Returns:
        PlaybackProbeResponse with capability, timing, and message
    """
    logger.info(f"[PLAYBACK PROBE] API request for: {request.path}")
    
    result = probe_playback_capability(request.path)
    
    # Use human-readable message if probe message is technical
    message = result.message
    if result.capability != PlaybackCapability.PLAYABLE:
        message = get_playback_message(result.capability)
    
    return PlaybackProbeResponse(
        capability=result.capability.value,
        engine=result.engine,
        probe_ms=result.probe_ms,
        message=message,
    )


@router.get("/cache/stats", response_model=CacheStatsResponse)
async def get_cache_stats() -> CacheStatsResponse:
    """
    Get probe cache statistics.
    
    Returns:
        CacheStatsResponse with cache entry counts
    """
    stats = get_probe_cache_stats()
    return CacheStatsResponse(
        entries=stats["entries"],
        capabilities=stats["capabilities"],
    )


@router.post("/cache/clear", response_model=CacheClearResponse)
async def clear_cache() -> CacheClearResponse:
    """
    Clear the probe cache.
    
    Returns:
        CacheClearResponse with number of entries cleared
    """
    cleared = clear_probe_cache()
    return CacheClearResponse(cleared=cleared)
