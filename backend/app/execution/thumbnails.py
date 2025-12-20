"""
Thumbnail generation using FFmpeg.

Phase 20: Generate preview thumbnails for clips at job creation.

Strategy:
- Use FFmpeg's thumbnail filter for intelligent frame selection
- Generate at ~30% duration by default
- Scale to 320px width, maintain aspect ratio
- Store alongside job metadata as base64 or file path
- Non-blocking, runs in background
"""

import asyncio
import base64
import logging
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Optional, Tuple

logger = logging.getLogger(__name__)


# Default thumbnail size (width, height auto-calculated to maintain aspect)
THUMBNAIL_WIDTH = 320

# Default position in video (0.0 - 1.0, where 0.3 = 30%)
DEFAULT_THUMBNAIL_POSITION = 0.3


def find_ffmpeg() -> Optional[str]:
    """Find ffmpeg binary path."""
    ffmpeg_path = shutil.which("ffmpeg")
    if ffmpeg_path:
        return ffmpeg_path
    
    # Common install locations
    common_paths = [
        "/usr/local/bin/ffmpeg",
        "/usr/bin/ffmpeg",
        "/opt/homebrew/bin/ffmpeg",
    ]
    for path in common_paths:
        if os.path.isfile(path) and os.access(path, os.X_OK):
            return path
    
    return None


def generate_thumbnail_sync(
    source_path: str,
    output_path: Optional[str] = None,
    position: float = DEFAULT_THUMBNAIL_POSITION,
    width: int = THUMBNAIL_WIDTH,
) -> Optional[str]:
    """
    Generate a thumbnail from a video file synchronously.
    
    Args:
        source_path: Path to source video file
        output_path: Path to save thumbnail (default: temp file)
        position: Position in video (0.0 - 1.0)
        width: Target thumbnail width in pixels
        
    Returns:
        Path to generated thumbnail, or None on failure
    """
    ffmpeg_path = find_ffmpeg()
    if not ffmpeg_path:
        logger.warning("FFmpeg not found, cannot generate thumbnail")
        return None
    
    source = Path(source_path)
    if not source.exists():
        logger.warning(f"Source file not found: {source_path}")
        return None
    
    # Determine output path
    if output_path is None:
        output_path = tempfile.mktemp(suffix=".jpg", prefix="awaire_thumb_")
    
    try:
        # First, get video duration
        duration = get_video_duration(source_path, ffmpeg_path)
        if duration is None or duration <= 0:
            # Fallback: just grab first frame
            seek_time = 0
        else:
            seek_time = duration * position
        
        # Generate thumbnail using FFmpeg
        # -ss before -i for fast seeking
        # thumbnail filter selects best frame in a window
        # scale filter maintains aspect ratio
        cmd = [
            ffmpeg_path,
            "-ss", str(seek_time),
            "-i", source_path,
            "-vf", f"thumbnail,scale={width}:-1",
            "-frames:v", "1",
            "-y",
            output_path
        ]
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            timeout=30,  # 30 second timeout
        )
        
        if result.returncode == 0 and Path(output_path).exists():
            logger.debug(f"Generated thumbnail: {output_path}")
            return output_path
        else:
            logger.warning(f"Thumbnail generation failed: {result.stderr.decode()[-500:]}")
            return None
            
    except subprocess.TimeoutExpired:
        logger.warning(f"Thumbnail generation timed out for {source_path}")
        return None
    except Exception as e:
        logger.error(f"Thumbnail generation error: {e}")
        return None


def get_video_duration(source_path: str, ffmpeg_path: str) -> Optional[float]:
    """Get video duration in seconds using ffprobe."""
    ffprobe_path = ffmpeg_path.replace("ffmpeg", "ffprobe")
    if not os.path.exists(ffprobe_path):
        ffprobe_path = shutil.which("ffprobe")
    
    if not ffprobe_path:
        return None
    
    try:
        result = subprocess.run(
            [
                ffprobe_path,
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                source_path
            ],
            capture_output=True,
            timeout=10,
        )
        
        if result.returncode == 0:
            duration_str = result.stdout.decode().strip()
            return float(duration_str)
    except Exception:
        pass
    
    return None


def thumbnail_to_base64(thumbnail_path: str) -> Optional[str]:
    """
    Read thumbnail file and encode as base64 data URI.
    
    Returns:
        Base64 data URI string, or None on failure
    """
    try:
        with open(thumbnail_path, "rb") as f:
            data = f.read()
        
        # Determine MIME type from extension
        ext = Path(thumbnail_path).suffix.lower()
        mime_type = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".webp": "image/webp",
        }.get(ext, "image/jpeg")
        
        encoded = base64.b64encode(data).decode("ascii")
        return f"data:{mime_type};base64,{encoded}"
        
    except Exception as e:
        logger.error(f"Failed to encode thumbnail: {e}")
        return None


async def generate_thumbnail_async(
    source_path: str,
    output_path: Optional[str] = None,
    position: float = DEFAULT_THUMBNAIL_POSITION,
    width: int = THUMBNAIL_WIDTH,
) -> Optional[str]:
    """
    Generate thumbnail asynchronously.
    
    Runs the synchronous function in a thread pool to avoid blocking.
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None,
        generate_thumbnail_sync,
        source_path,
        output_path,
        position,
        width,
    )


async def generate_clip_thumbnail(
    source_path: str,
    clip_id: str,
    thumbnail_dir: Optional[str] = None,
) -> Tuple[Optional[str], Optional[str]]:
    """
    Generate and store thumbnail for a clip.
    
    Args:
        source_path: Path to source video
        clip_id: Clip ID for naming the thumbnail file
        thumbnail_dir: Directory to store thumbnails (default: system temp)
        
    Returns:
        Tuple of (file_path, base64_data_uri)
    """
    if thumbnail_dir is None:
        thumbnail_dir = tempfile.gettempdir()
    
    output_path = os.path.join(thumbnail_dir, f"awaire_thumb_{clip_id[:8]}.jpg")
    
    result_path = await generate_thumbnail_async(source_path, output_path)
    
    if result_path:
        base64_data = thumbnail_to_base64(result_path)
        return result_path, base64_data
    
    return None, None
