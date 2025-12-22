"""
Preview endpoints for video playback in the UI.

Alpha: Provides preview video generation and streaming.
"""

from fastapi import APIRouter, HTTPException, Request, BackgroundTasks
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict
from typing import Optional
import logging
from pathlib import Path

from app.execution.preview import (
    get_or_generate_preview,
    get_cached_preview_path,
    generate_preview_sync,
    clear_preview_cache,
    get_cache_size,
)
from app.execution.thumbnails import generate_thumbnail_sync, thumbnail_to_base64

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
# Endpoints
# ============================================================================

@router.post("/status")
async def get_preview_status(body: PreviewRequest) -> PreviewStatusResponse:
    """
    Check if a preview video is ready or start generation.
    
    If preview exists in cache, returns ready=True with path.
    If not, starts generation in background and returns ready=False.
    
    Client should poll this endpoint until ready=True.
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
async def get_cache_stats() -> CacheStatsResponse:
    """Get preview cache statistics."""
    size_bytes, file_count = get_cache_size()
    
    return CacheStatsResponse(
        size_bytes=size_bytes,
        size_mb=round(size_bytes / (1024 * 1024), 2),
        file_count=file_count,
    )


@router.post("/cache/clear")
async def clear_cache():
    """Clear the preview cache."""
    count = clear_preview_cache()
    
    return {
        "success": True,
        "message": f"Cleared {count} cached preview files",
        "count": count,
    }
