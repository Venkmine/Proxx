"""
Preview endpoints for video playback in the UI.

============================================================================
PREVIEW PROXY SYSTEM
============================================================================
Provides deterministic, browser-safe preview proxy generation.

Key Endpoints:
- POST /preview/generate — Generate preview proxy for source (NEW)
- GET /preview/proxy/<hash>/preview.mp4 — Stream preview proxy (NEW)
- POST /preview/status — Legacy async preview generation
- GET /preview/stream — Legacy preview streaming

See: docs/PREVIEW_PROXY_PIPELINE.md
============================================================================
"""

from fastapi import APIRouter, HTTPException, Request, BackgroundTasks
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict
from typing import Optional
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

# NEW: Preview proxy generation
from preview_proxy import (
    generate_preview_proxy,
    get_cached_preview,
    get_cache_stats as get_proxy_cache_stats,
    clear_preview_cache as clear_proxy_cache,
    PREVIEW_CACHE_DIR,
    PreviewProxyResult,
)

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
# NEW: Preview Proxy Generation Models
# ============================================================================

class GeneratePreviewRequest(BaseModel):
    """Request for preview proxy generation."""
    
    model_config = ConfigDict(extra="forbid")
    
    source_path: str


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


# ============================================================================
# NEW: Preview Proxy Generation Endpoints
# ============================================================================

@router.post("/generate")
async def generate_preview(body: GeneratePreviewRequest):
    """
    Generate a browser-safe preview proxy for a source file.
    
    This is the primary endpoint for preview generation. It:
    - Validates the source exists
    - Generates an H.264/AAC MP4 preview proxy
    - Returns HTTP URL for streaming
    
    The preview is:
    - Max 1280px wide (preserves aspect ratio)
    - First 30 seconds (or full clip if shorter)
    - Capped at 30fps
    - Browser-compatible (H.264 main profile + AAC)
    
    On success, returns preview URL and metadata.
    On failure, returns human-readable error message.
    """
    source_path = body.source_path
    
    # Validate source exists
    if not Path(source_path).exists():
        return GeneratePreviewErrorResponse(
            error=f"Preview unavailable — source file not found"
        )
    
    # Generate preview proxy
    result = generate_preview_proxy(source_path)
    
    if not result.success:
        return GeneratePreviewErrorResponse(
            error=result.error or "Preview unavailable — proxy generation failed"
        )
    
    # Build streaming URL
    # URL-encode the hash directory name for the URL
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
    """Get preview cache statistics (both legacy and proxy caches)."""
    # Legacy cache
    legacy_size_bytes, legacy_file_count = get_cache_size()
    
    # Proxy cache
    proxy_stats = get_proxy_cache_stats()
    
    # Combined totals
    total_size_bytes = legacy_size_bytes + proxy_stats["size_bytes"]
    total_file_count = legacy_file_count + proxy_stats["file_count"]
    
    return {
        "size_bytes": total_size_bytes,
        "size_mb": round(total_size_bytes / (1024 * 1024), 2),
        "file_count": total_file_count,
        "legacy_cache": {
            "size_bytes": legacy_size_bytes,
            "file_count": legacy_file_count,
        },
        "proxy_cache": proxy_stats,
    }


@router.post("/cache/clear")
async def clear_cache():
    """Clear all preview caches (both legacy and proxy)."""
    legacy_count = clear_preview_cache()
    proxy_count = clear_proxy_cache()
    
    total_count = legacy_count + proxy_count
    
    return {
        "success": True,
        "message": f"Cleared {total_count} cached preview files",
        "count": total_count,
        "legacy_count": legacy_count,
        "proxy_count": proxy_count,
    }
