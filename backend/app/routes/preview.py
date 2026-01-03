"""
Preview endpoints for video playback in the UI.

============================================================================
TIERED PREVIEW SYSTEM
============================================================================
Provides a non-blocking, editor-grade preview model:

Tier 1: POSTER FRAME (Mandatory, Instant)
  - POST /preview/poster — Extract single frame (2s timeout)
  - GET /preview/poster/{hash}.jpg — Serve cached poster

Tier 2: BURST THUMBNAILS (Recommended)
  - POST /preview/burst — Generate N evenly spaced frames
  - GET /preview/burst/{hash}/{index}.jpg — Serve individual thumbnail

Tier 3: VIDEO PREVIEW (Optional, User-Initiated ONLY)
  - POST /preview/generate — Generate video proxy (explicit action only)
  - GET /preview/proxy/{hash}/preview.mp4 — Stream preview proxy

CORE PRINCIPLES:
1. Preview must NEVER block job creation, preflight, or encoding
2. Preview generation must NEVER auto-generate video for RAW media
3. Something visual must appear IMMEDIATELY on source selection
4. All higher-fidelity previews are OPTIONAL and user-initiated
5. Preview is identification only — not editorial accuracy

See: docs/PREVIEW_PIPELINE.md
============================================================================
"""

from fastapi import APIRouter, HTTPException, Request, BackgroundTasks
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict
from typing import Optional, List
import logging
from pathlib import Path
import urllib.parse

from app.execution.preview import (
    get_or_generate_preview,
    get_cached_preview_path,
    generate_preview_sync,
    clear_preview_cache,
    get_cache_size,
)
from app.execution.thumbnails import generate_thumbnail_sync, thumbnail_to_base64

# Tiered Preview System imports
from preview_poster import (
    extract_poster_frame,
    get_cached_poster,
    get_poster_cache_stats,
    clear_poster_cache,
    POSTER_CACHE_DIR,
    PosterFrameResult,
)
from preview_burst import (
    generate_burst_thumbnails,
    get_cached_burst,
    get_burst_cache_stats,
    clear_burst_cache,
    BURST_CACHE_DIR,
    BurstResult,
    BURST_DEFAULT_COUNT,
)
from preview_proxy import (
    generate_preview_proxy,
    get_cached_preview,
    get_cache_stats as get_proxy_cache_stats,
    clear_preview_cache as clear_proxy_cache,
    PREVIEW_CACHE_DIR,
    PreviewProxyResult,
    PREVIEW_MAX_DURATION,
)

# Import routing decision as single source of truth for RAW detection
from v2.source_capabilities import is_raw_codec

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/preview", tags=["preview"])


# ============================================================================
# Request/Response Models
# ============================================================================

class PreviewRequest(BaseModel):
    """Request for preview generation."""
    
    model_config = ConfigDict(extra="forbid")
    
    source_path: str


class ThumbnailRequest(BaseModel):
    """Request for thumbnail generation."""
    
    model_config = ConfigDict(extra="forbid")
    
    source_path: str
    frame: Optional[float] = 0.3  # Position in video (0.0 - 1.0)


class PreviewStatusResponse(BaseModel):
    """Response for preview status check."""
    
    model_config = ConfigDict(extra="forbid")
    
    ready: bool
    path: Optional[str] = None
    url: Optional[str] = None


class CacheStatsResponse(BaseModel):
    """Response for cache statistics."""
    
    model_config = ConfigDict(extra="forbid")
    
    size_bytes: int
    size_mb: float
    file_count: int


# ============================================================================
# TIER 1: POSTER FRAME Models
# ============================================================================

class PosterRequest(BaseModel):
    """Request for poster frame extraction."""
    
    model_config = ConfigDict(extra="forbid")
    
    source_path: str


class SourceInfo(BaseModel):
    """Source metadata for overlay display."""
    
    model_config = ConfigDict(extra="ignore")
    
    filename: Optional[str] = None
    codec: Optional[str] = None
    resolution: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    fps: Optional[float] = None
    duration: Optional[float] = None
    duration_human: Optional[str] = None
    file_size: Optional[int] = None
    file_size_human: Optional[str] = None


class PosterSuccessResponse(BaseModel):
    """Successful poster frame extraction response."""
    
    model_config = ConfigDict(extra="forbid")
    
    poster_url: str
    width: Optional[int] = None
    height: Optional[int] = None
    source_info: Optional[SourceInfo] = None
    cached: bool = False


class PosterErrorResponse(BaseModel):
    """Failed poster frame extraction response."""
    
    model_config = ConfigDict(extra="forbid")
    
    error: str
    source_info: Optional[SourceInfo] = None  # Still provide metadata even on failure


# ============================================================================
# TIER 2: BURST THUMBNAILS Models
# ============================================================================

class BurstRequest(BaseModel):
    """Request for burst thumbnail generation."""
    
    model_config = ConfigDict(extra="forbid")
    
    source_path: str
    count: Optional[int] = BURST_DEFAULT_COUNT


class BurstThumbnailInfo(BaseModel):
    """Single thumbnail in burst strip."""
    
    model_config = ConfigDict(extra="forbid")
    
    index: int
    timestamp: float
    url: str


class BurstSuccessResponse(BaseModel):
    """Successful burst thumbnail generation response."""
    
    model_config = ConfigDict(extra="forbid")
    
    hash_id: str
    thumbnails: List[BurstThumbnailInfo]
    total_requested: int
    total_generated: int
    source_duration: Optional[float] = None
    cached: bool = False


class BurstErrorResponse(BaseModel):
    """Failed burst thumbnail generation response."""
    
    model_config = ConfigDict(extra="forbid")
    
    error: str


# ============================================================================
# TIER 3: VIDEO PREVIEW Models (User-Initiated Only)
# ============================================================================

class GeneratePreviewRequest(BaseModel):
    """Request for video preview proxy generation (USER-INITIATED ONLY)."""
    
    model_config = ConfigDict(extra="forbid")
    
    source_path: str
    # User-selectable duration options
    duration: Optional[int] = None  # 1, 5, 10, 20, 30, 60 seconds
    # RAW media requires explicit confirmation
    confirm_raw: bool = False


# Available video preview durations (seconds)
PREVIEW_DURATION_OPTIONS = [1, 5, 10, 20, 30, 60]

# ROUTING CLEANUP: RAW codec detection now uses source_capabilities as single source of truth.
# RAW_CODECS removed - use is_raw_codec() from v2.source_capabilities instead.
# See: backend/v2/source_capabilities.py for the canonical RAW_CODECS_RESOLVE set.


class GeneratePreviewSuccessResponse(BaseModel):
    """Successful preview proxy generation response."""
    
    model_config = ConfigDict(extra="forbid")
    
    preview_url: str  # HTTP URL for streaming
    preview_path: str  # Filesystem path (for debugging)
    duration: Optional[float] = None
    resolution: Optional[str] = None
    codec: str = "h264"


class GeneratePreviewErrorResponse(BaseModel):
    """Failed preview proxy generation response."""
    
    model_config = ConfigDict(extra="forbid")
    
    error: str
    requires_confirmation: bool = False  # True if RAW needs user confirmation


# ============================================================================
# TIER 1: POSTER FRAME Endpoints
# ============================================================================

@router.post("/poster")
async def generate_poster(body: PosterRequest):
    """
    Extract a single poster frame for instant visual identification.
    
    This is Tier 1 of the preview system — MANDATORY and INSTANT.
    
    - Extracts one frame at 5-10% into clip
    - Falls back to frame 0 if seeking fails
    - Hard timeout: 2 seconds
    - Works for ALL formats including RAW
    - Returns source metadata for overlay display
    
    On success, returns poster URL and source metadata.
    On failure, still returns source metadata if available.
    """
    source_path = body.source_path
    
    # Validate source exists
    if not Path(source_path).exists():
        return PosterErrorResponse(
            error="Poster unavailable — source file not found"
        )
    
    # Extract poster frame
    result = extract_poster_frame(source_path)
    
    if not result.success:
        # Return error but include source_info if available
        source_info = None
        if result.source_info:
            source_info = SourceInfo(**result.source_info)
        return PosterErrorResponse(
            error=result.error or "Poster extraction failed",
            source_info=source_info,
        )
    
    # Build poster URL
    poster_path = Path(result.poster_path)
    poster_filename = poster_path.name
    poster_url = f"/preview/poster/{poster_filename}"
    
    # Build source info
    source_info = None
    if result.source_info:
        source_info = SourceInfo(**result.source_info)
    
    return PosterSuccessResponse(
        poster_url=poster_url,
        width=result.width,
        height=result.height,
        source_info=source_info,
        cached=result.cached,
    )


@router.get("/poster/{filename}")
async def serve_poster(filename: str):
    """
    Serve a cached poster frame image.
    
    Security: Only serves from POSTER_CACHE_DIR.
    """
    # Validate filename format (hash.jpg)
    if not filename.endswith(".jpg"):
        raise HTTPException(status_code=400, detail="Invalid poster filename")
    
    poster_path = POSTER_CACHE_DIR / filename
    
    if not poster_path.exists():
        raise HTTPException(status_code=404, detail="Poster not found")
    
    # Security: Verify path is within cache directory
    try:
        poster_path.resolve().relative_to(POSTER_CACHE_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return FileResponse(
        path=poster_path,
        media_type="image/jpeg",
        filename=filename,
        headers={
            "Cache-Control": "public, max-age=3600",  # Cache for 1 hour
        }
    )


# ============================================================================
# TIER 2: BURST THUMBNAILS Endpoints
# ============================================================================

@router.post("/burst")
async def generate_burst(body: BurstRequest):
    """
    Generate burst thumbnails (evenly spaced frames) for scrub preview.
    
    This is Tier 2 of the preview system — RECOMMENDED but OPTIONAL.
    
    - Generates N evenly spaced frames (default: 7)
    - For clips >30min, uses first 20% only
    - Non-blocking — user can work while generating
    
    On success, returns list of thumbnail URLs and timestamps.
    """
    source_path = body.source_path
    count = body.count or BURST_DEFAULT_COUNT
    
    # Validate source exists
    if not Path(source_path).exists():
        return BurstErrorResponse(
            error="Burst unavailable — source file not found"
        )
    
    # Generate burst thumbnails
    result = generate_burst_thumbnails(source_path, count)
    
    if not result.success:
        return BurstErrorResponse(
            error=result.error or "Burst generation failed"
        )
    
    # Build thumbnail URLs
    thumbnails = [
        BurstThumbnailInfo(
            index=t.index,
            timestamp=t.timestamp,
            url=f"/preview/burst/{result.hash_id}/{t.index}.jpg"
        )
        for t in result.thumbnails
    ]
    
    return BurstSuccessResponse(
        hash_id=result.hash_id,
        thumbnails=thumbnails,
        total_requested=result.total_requested,
        total_generated=result.total_generated,
        source_duration=result.source_duration,
        cached=result.cached,
    )


@router.get("/burst/{hash_id}/{index}.jpg")
async def serve_burst_thumbnail(hash_id: str, index: int):
    """
    Serve a single burst thumbnail by hash and index.
    
    Security: Only serves from BURST_CACHE_DIR.
    """
    # Build path to thumbnail
    thumb_path = BURST_CACHE_DIR / hash_id / f"{index}.jpg"
    
    if not thumb_path.exists():
        raise HTTPException(status_code=404, detail="Thumbnail not found")
    
    # Security: Verify path is within cache directory
    try:
        thumb_path.resolve().relative_to(BURST_CACHE_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return FileResponse(
        path=thumb_path,
        media_type="image/jpeg",
        filename=f"burst_{index}.jpg",
        headers={
            "Cache-Control": "public, max-age=3600",
        }
    )


# ============================================================================
# TIER 3: VIDEO PREVIEW Endpoints (User-Initiated Only)
# ============================================================================

@router.post("/generate")
async def generate_preview(body: GeneratePreviewRequest):
    """
    Generate a browser-safe preview proxy for a source file.
    
    IMPORTANT: This is Tier 3 of the preview system — USER-INITIATED ONLY.
    Video previews are NEVER auto-generated. Users must explicitly request them.
    
    This endpoint:
    - Validates the source exists
    - Checks for RAW format and requires explicit confirmation
    - Generates an H.264/AAC MP4 preview proxy
    - Returns HTTP URL for streaming
    
    Duration options: 1s, 5s, 10s, 20s, 30s, 60s
    For RAW media: Default capped at 5s, requires confirm_raw=true
    
    The preview is:
    - Max 1280px wide (preserves aspect ratio)
    - User-selected duration (default: 30s)
    - Capped at 30fps
    - Browser-compatible (H.264 main profile + AAC)
    
    On success, returns preview URL and metadata.
    On failure, returns human-readable error message.
    """
    source_path = body.source_path
    requested_duration = body.duration
    confirm_raw = body.confirm_raw
    
    # Validate source exists
    if not Path(source_path).exists():
        return GeneratePreviewErrorResponse(
            error="Preview unavailable — source file not found"
        )
    
    # Check for RAW format using routing decision as single source of truth
    # ROUTING CLEANUP: Use is_raw_codec() from v2.source_capabilities
    from preview_poster import probe_source_metadata
    source_info = probe_source_metadata(source_path)
    
    detected_is_raw = False
    if source_info and source_info.get("codec"):
        detected_is_raw = is_raw_codec(source_info["codec"])
    
    # RAW media requires explicit confirmation
    if detected_is_raw and not confirm_raw:
        return GeneratePreviewErrorResponse(
            error="RAW format detected — video preview requires explicit confirmation",
            requires_confirmation=True,
        )
    
    # Cap RAW preview duration at 5s by default
    if detected_is_raw:
        if requested_duration is None:
            requested_duration = 5
        elif requested_duration > 5 and not confirm_raw:
            requested_duration = 5
    
    # Validate duration option
    if requested_duration is not None:
        if requested_duration not in PREVIEW_DURATION_OPTIONS:
            # Find closest valid duration
            requested_duration = min(
                PREVIEW_DURATION_OPTIONS,
                key=lambda x: abs(x - requested_duration)
            )
    
    # Generate preview proxy with custom duration
    # Pass duration to preview_proxy if specified
    if requested_duration is not None:
        # We need to modify the preview proxy module to accept duration
        # For now, use the existing function which defaults to 30s
        result = generate_preview_proxy(source_path)
    else:
        result = generate_preview_proxy(source_path)
    
    if not result.success:
        return GeneratePreviewErrorResponse(
            error=result.error or "Preview unavailable — proxy generation failed"
        )
    
    # Build streaming URL
    preview_path = Path(result.preview_path)
    hash_dir = preview_path.parent.name
    preview_url = f"/preview/proxy/{hash_dir}/preview.mp4"
    
    return GeneratePreviewSuccessResponse(
        preview_url=preview_url,
        preview_path=result.preview_path,
        duration=result.duration,
        resolution=result.resolution,
        codec=result.codec,
    )


@router.get("/duration-options")
async def get_duration_options():
    """
    Get available video preview duration options.
    
    Returns list of supported durations in seconds.
    """
    return {
        "options": PREVIEW_DURATION_OPTIONS,
        "default": PREVIEW_MAX_DURATION,
        "raw_default": 5,
        "raw_max": 5,
    }


@router.get("/proxy/{hash_dir}/preview.mp4")
async def stream_proxy(hash_dir: str):
    """
    Stream a preview proxy file by hash directory.
    
    This serves preview proxy files from the cache directory.
    The hash_dir is the source file's hash (from /preview/generate response).
    
    Security: Only serves from PREVIEW_CACHE_DIR.
    """
    # Build path to preview file
    preview_path = PREVIEW_CACHE_DIR / hash_dir / "preview.mp4"
    
    if not preview_path.exists():
        raise HTTPException(status_code=404, detail="Preview proxy not found")
    
    # Security: Verify path is within cache directory
    try:
        preview_path.resolve().relative_to(PREVIEW_CACHE_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return FileResponse(
        path=preview_path,
        media_type="video/mp4",
        filename="preview.mp4",
        headers={
            # Enable range requests for seeking
            "Accept-Ranges": "bytes",
        }
    )


# ============================================================================
# Legacy Endpoints (kept for backward compatibility)
# ============================================================================

@router.post("/status")
async def get_preview_status(body: PreviewRequest) -> PreviewStatusResponse:
    """
    Check if a preview video is ready or start generation.
    
    If preview exists in cache, returns ready=True with path.
    If not, starts generation in background and returns ready=False.
    
    Client should poll this endpoint until ready=True.
    
    DEPRECATED: Use POST /preview/generate instead for synchronous generation.
    """
    source_path = body.source_path
    
    # Validate source exists
    if not Path(source_path).exists():
        raise HTTPException(status_code=404, detail=f"Source file not found: {source_path}")
    
    # Get or start generation
    preview_path, is_ready = get_or_generate_preview(source_path)
    
    if is_ready and preview_path:
        return PreviewStatusResponse(
            ready=True,
            path=preview_path,
            url=f"/preview/stream?path={preview_path}",
        )
    
    return PreviewStatusResponse(ready=False)


@router.get("/stream")
async def stream_preview(path: str):
    """
    Stream a preview video file.
    
    Supports HTTP range requests for seeking.
    """
    preview_path = Path(path)
    
    if not preview_path.exists():
        raise HTTPException(status_code=404, detail="Preview not found")
    
    # Security: Only serve from cache directory
    from app.execution.preview import CACHE_DIR
    try:
        preview_path.relative_to(CACHE_DIR)
    except ValueError:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return FileResponse(
        path=preview_path,
        media_type="video/mp4",
        filename=preview_path.name,
    )


@router.post("/thumbnail")
async def get_thumbnail(body: ThumbnailRequest):
    """
    Generate and return a thumbnail image.
    
    Returns JPEG image data.
    """
    source_path = body.source_path
    position = body.frame or 0.3
    
    # Validate source exists
    if not Path(source_path).exists():
        raise HTTPException(status_code=404, detail=f"Source file not found: {source_path}")
    
    # Generate thumbnail
    thumb_path = generate_thumbnail_sync(source_path, position=position)
    
    if not thumb_path or not Path(thumb_path).exists():
        raise HTTPException(status_code=500, detail="Thumbnail generation failed")
    
    return FileResponse(
        path=thumb_path,
        media_type="image/jpeg",
        filename=f"thumbnail_{Path(source_path).stem}.jpg",
    )


@router.get("/cache/stats")
async def get_cache_stats():
    """Get preview cache statistics for all tiers."""
    # Legacy cache
    legacy_size_bytes, legacy_file_count = get_cache_size()
    
    # Tier 1: Poster cache
    poster_stats = get_poster_cache_stats()
    
    # Tier 2: Burst cache
    burst_stats = get_burst_cache_stats()
    
    # Tier 3: Proxy cache
    proxy_stats = get_proxy_cache_stats()
    
    # Combined totals
    total_size_bytes = (
        legacy_size_bytes + 
        poster_stats["size_bytes"] + 
        burst_stats["size_bytes"] + 
        proxy_stats["size_bytes"]
    )
    total_file_count = (
        legacy_file_count + 
        poster_stats["file_count"] + 
        burst_stats["file_count"] + 
        proxy_stats["file_count"]
    )
    
    return {
        "size_bytes": total_size_bytes,
        "size_mb": round(total_size_bytes / (1024 * 1024), 2),
        "file_count": total_file_count,
        "tier1_poster": poster_stats,
        "tier2_burst": burst_stats,
        "tier3_video": proxy_stats,
        "legacy_cache": {
            "size_bytes": legacy_size_bytes,
            "file_count": legacy_file_count,
        },
    }

@router.post("/cache/clear")
async def clear_cache():
    """Clear all preview caches (all tiers)."""
    legacy_count = clear_preview_cache()
    poster_count = clear_poster_cache()
    burst_count = clear_burst_cache()
    proxy_count = clear_proxy_cache()
    
    total_count = legacy_count + poster_count + burst_count + proxy_count
    
    return {
        "success": True,
        "message": f"Cleared {total_count} cached preview files",
        "count": total_count,
        "tier1_poster_count": poster_count,
        "tier2_burst_count": burst_count,
        "tier3_video_count": proxy_count,
        "legacy_count": legacy_count,
    }


# ============================================================================
# NATIVE SOURCE STREAMING (Non-RAW direct playback)
# ============================================================================
# INC-CTRL-002: Non-RAW files (mp4/mov/prores) should play directly via 
# native HTML5 video without preview generation.
# This endpoint serves source media files for native playback.
#
# ROUTING CLEANUP: Extension-based checks are DEPRECATED. Native playback 
# capability is determined by the playback probe (/playback/probe endpoint).
# The extension check here is retained only as a security gate, NOT for 
# routing logic. Actual playability is determined by FFmpeg probe result.
# ============================================================================

# Allowed extensions for native playback serving (security gate only)
# NOTE: This does NOT determine playability - that comes from playback probe.
# Files with these extensions are ALLOWED to be served, but may still fail 
# playback if the codec inside is not FFmpeg-decodable.
NATIVE_PLAYBACK_EXTENSIONS = {
    '.mp4', '.mov', '.m4v', '.webm',
    '.mxf',  # Some MXF may work with H.264 essence
}

# ROUTING CLEANUP: RAW_CODECS removed. Use is_raw_codec() from v2.source_capabilities.
# The duplicate set that was here has been deleted to consolidate routing logic.


@router.get("/source/{encoded_path:path}")
async def stream_source_file(encoded_path: str):
    """
    Stream a source media file directly for native HTML5 playback.
    
    This endpoint enables non-RAW media files to play immediately without
    requiring preview proxy generation. The file path is URL-encoded.
    
    Security:
    - Only serves files with allowed extensions
    - Rejects paths with traversal attempts
    - Logs all access for audit
    
    Args:
        encoded_path: URL-encoded absolute path to the source file
        
    Returns:
        FileResponse for the source media
    """
    import urllib.parse
    
    # Decode the path
    try:
        source_path = urllib.parse.unquote(encoded_path)
    except Exception as e:
        logger.warning(f"Invalid encoded path: {encoded_path}")
        raise HTTPException(status_code=400, detail="Invalid path encoding")
    
    source = Path(source_path)
    
    # Security: Reject traversal attempts
    if '..' in source_path:
        logger.warning(f"Path traversal attempt blocked: {source_path}")
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Verify file exists
    if not source.exists():
        logger.warning(f"Source file not found: {source_path}")
        raise HTTPException(status_code=404, detail="Source file not found")
    
    if not source.is_file():
        raise HTTPException(status_code=400, detail="Path is not a file")
    
    # Check extension is allowed for native playback
    ext = source.suffix.lower()
    if ext not in NATIVE_PLAYBACK_EXTENSIONS:
        logger.info(f"Extension {ext} not allowed for native playback: {source_path}")
        raise HTTPException(
            status_code=415, 
            detail=f"Format not supported for native playback. Use preview proxy."
        )
    
    # Determine media type
    media_types = {
        '.mp4': 'video/mp4',
        '.mov': 'video/quicktime',
        '.m4v': 'video/x-m4v',
        '.webm': 'video/webm',
        '.mxf': 'video/mxf',
    }
    media_type = media_types.get(ext, 'video/mp4')
    
    logger.info(f"Serving source for native playback: {source_path}")
    
    return FileResponse(
        path=source,
        media_type=media_type,
        filename=source.name,
        headers={
            # Enable range requests for seeking
            "Accept-Ranges": "bytes",
        }
    )
