"""
Preview video generation using FFmpeg.

Alpha: Generate lightweight preview videos for playback in the UI.

Strategy:
- Generate H.264 proxy at moderate resolution (720p)
- Short GOP for responsive scrubbing
- Cache by source path + mtime hash
- Non-blocking, runs async with progress

============================================================================
V1 OBSERVABILITY HARDENING
============================================================================
Preview generation now records metadata about HOW previews are generated.
This does NOT change preview quality - only discloses it.

Recorded metadata:
- source: "thumbnail" | "decode" (how frame was generated)
- resolution: WxH (preview dimensions)
- decode_method: e.g., "ffmpeg_seek"
- decode_position: position in video

This information is attached to job traces for debugging.
See: app/observability/trace.py
============================================================================
"""

import asyncio
import hashlib
import logging
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Optional, Tuple, Dict, Any
import threading
from datetime import datetime

logger = logging.getLogger(__name__)

# Preview video settings
# V1 DOGFOOD FIX: Increased from 540p to 720p for better preview quality.
# 540p was too blurry for H.264 delivery format previews.
# 720p balances quality vs. generation time for preview purposes.
#
# PREVIEW RESOLUTION DECISION (V1):
# - 720p is the SINGLE decode resolution for all previews
# - Source → decode at 720p → display in canvas (objectFit: contain)
# - CSS zoom on top for magnification (no re-decode)
# - Do NOT increase to 1080p — that would defeat the preview speed advantage
# - If source is ≤720p, preview may match source quality closely
# - If source is 1080p+, preview is noticeably softer — this is expected
#
# Future consideration: For sources ≤1080p, could generate at source resolution.
# However, this adds complexity and variable generation times. Defer to V2.
PREVIEW_WIDTH = 1280  # 720p with 16:9 aspect
PREVIEW_HEIGHT = 720
PREVIEW_CODEC = "libx264"
PREVIEW_CRF = 28  # Good enough for preview
PREVIEW_PRESET = "ultrafast"  # Speed over quality
PREVIEW_GOP = 15  # Short GOP for responsive scrubbing
PREVIEW_AUDIO_CODEC = "aac"
PREVIEW_AUDIO_BITRATE = "128k"

# Cache directory
CACHE_DIR = Path(tempfile.gettempdir()) / "awaire_proxy_previews"


# ============================================================================
# V1 OBSERVABILITY: Preview Metadata
# ============================================================================

def get_preview_metadata(source_path: str, preview_path: Optional[str] = None) -> Dict[str, Any]:
    """
    Get metadata about how a preview was generated.
    
    V1 OBSERVABILITY: This function records the TRUTH about preview generation.
    It does NOT change quality - only discloses it.
    
    Args:
        source_path: Path to source file
        preview_path: Path to generated preview (if available)
        
    Returns:
        Dict with preview metadata:
        - source: "thumbnail" | "decode"
        - width: preview width
        - height: preview height
        - decode_method: method used
        - decode_position: position in video
        - generated_at: timestamp
    """
    metadata = {
        "source": "decode",  # We decode, not just grab embedded thumbnail
        "width": PREVIEW_WIDTH,
        "height": PREVIEW_HEIGHT,
        "decode_method": "ffmpeg_transcode",
        "decode_position": None,  # Full video, not single frame
        "generated_at": datetime.now().isoformat(),
        "codec": PREVIEW_CODEC,
        "crf": PREVIEW_CRF,
        "preset": PREVIEW_PRESET,
    }
    
    # If preview exists, get actual dimensions
    if preview_path and Path(preview_path).exists():
        try:
            info = get_video_info(preview_path)
            if info and "streams" in info and info["streams"]:
                stream = info["streams"][0]
                metadata["width"] = stream.get("width", PREVIEW_WIDTH)
                metadata["height"] = stream.get("height", PREVIEW_HEIGHT)
        except Exception as e:
            logger.warning(f"Failed to get preview dimensions: {e}")
    
    return metadata


def get_thumbnail_metadata(source_path: str, position: float = 0.3) -> Dict[str, Any]:
    """
    Get metadata about how a thumbnail was generated.
    
    V1 OBSERVABILITY: Records thumbnail generation parameters.
    
    Args:
        source_path: Path to source file
        position: Position in video (0.0-1.0)
        
    Returns:
        Dict with thumbnail metadata
    """
    return {
        "source": "thumbnail",
        "width": 480,  # Thumbnail width (from thumbnails.py)
        "height": None,  # Aspect-ratio dependent
        "decode_method": "ffmpeg_seek",
        "decode_position": position,
        "generated_at": datetime.now().isoformat(),
    }


def get_cache_key(source_path: str) -> str:
    """Generate a cache key for a source file based on path and mtime."""
    source = Path(source_path)
    if not source.exists():
        return hashlib.md5(source_path.encode()).hexdigest()[:16]
    
    # Include mtime in hash to invalidate cache on source change
    mtime = source.stat().st_mtime
    key_source = f"{source_path}:{mtime}"
    return hashlib.md5(key_source.encode()).hexdigest()[:16]


def get_cached_preview_path(source_path: str) -> Optional[Path]:
    """Get the cached preview video path if it exists."""
    cache_key = get_cache_key(source_path)
    preview_path = CACHE_DIR / f"{cache_key}.mp4"
    
    if preview_path.exists():
        # Verify source still exists with same mtime
        source = Path(source_path)
        if source.exists():
            # Check if cache is still valid
            current_key = get_cache_key(source_path)
            if cache_key == current_key:
                return preview_path
    
    return None


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


def get_video_info(source_path: str) -> Optional[Dict[str, Any]]:
    """Get video metadata using ffprobe."""
    ffprobe_path = shutil.which("ffprobe")
    if not ffprobe_path:
        ffmpeg_path = find_ffmpeg()
        if ffmpeg_path:
            ffprobe_path = ffmpeg_path.replace("ffmpeg", "ffprobe")
    
    if not ffprobe_path or not os.path.exists(ffprobe_path):
        return None
    
    try:
        result = subprocess.run(
            [
                ffprobe_path,
                "-v", "error",
                "-select_streams", "v:0",
                "-show_entries", "stream=width,height,duration,r_frame_rate",
                "-show_entries", "format=duration",
                "-of", "json",
                source_path
            ],
            capture_output=True,
            timeout=10,
        )
        
        if result.returncode == 0:
            import json
            data = json.loads(result.stdout.decode())
            return data
    except Exception as e:
        logger.warning(f"Failed to get video info: {e}")
    
    return None


def generate_preview_sync(
    source_path: str,
    output_path: Optional[str] = None,
    width: int = PREVIEW_WIDTH,
    height: int = PREVIEW_HEIGHT,
    progress_callback: Optional[callable] = None,
) -> Optional[str]:
    """
    Generate a preview video from a source file synchronously.
    
    Args:
        source_path: Path to source video file
        output_path: Path to save preview (default: cache directory)
        width: Target width
        height: Target height
        progress_callback: Optional callback for progress updates (0-100)
        
    Returns:
        Path to generated preview video, or None on failure
    """
    ffmpeg_path = find_ffmpeg()
    if not ffmpeg_path:
        logger.warning("FFmpeg not found, cannot generate preview")
        return None
    
    source = Path(source_path)
    if not source.exists():
        logger.warning(f"Source file not found: {source_path}")
        return None
    
    # Check cache first
    cached = get_cached_preview_path(source_path)
    if cached:
        logger.debug(f"Using cached preview: {cached}")
        return str(cached)
    
    # Ensure cache directory exists
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    
    # Determine output path
    if output_path is None:
        cache_key = get_cache_key(source_path)
        output_path = str(CACHE_DIR / f"{cache_key}.mp4")
    
    try:
        # Get source duration for progress calculation
        video_info = get_video_info(source_path)
        duration = None
        if video_info:
            try:
                if 'format' in video_info and 'duration' in video_info['format']:
                    duration = float(video_info['format']['duration'])
                elif 'streams' in video_info and video_info['streams']:
                    duration = float(video_info['streams'][0].get('duration', 0))
            except (ValueError, KeyError):
                pass
        
        # Build FFmpeg command
        # Scale to fit within target dimensions, maintaining aspect ratio
        scale_filter = f"scale='min({width},iw)':'min({height},ih)':force_original_aspect_ratio=decrease"
        # Ensure even dimensions
        scale_filter += ",pad=ceil(iw/2)*2:ceil(ih/2)*2"
        
        cmd = [
            ffmpeg_path,
            "-i", source_path,
            "-vf", scale_filter,
            "-c:v", PREVIEW_CODEC,
            "-crf", str(PREVIEW_CRF),
            "-preset", PREVIEW_PRESET,
            "-g", str(PREVIEW_GOP),  # Keyframe interval
            "-c:a", PREVIEW_AUDIO_CODEC,
            "-b:a", PREVIEW_AUDIO_BITRATE,
            "-movflags", "+faststart",  # Web playback optimization
            "-y",  # Overwrite
            "-progress", "pipe:1",  # Progress to stdout
            output_path
        ]
        
        logger.info(f"Generating preview for: {source_path}")
        
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            universal_newlines=True,
        )
        
        # Monitor progress
        current_time = 0.0
        for line in process.stdout:
            if line.startswith("out_time_ms="):
                try:
                    time_ms = int(line.split("=")[1].strip())
                    current_time = time_ms / 1_000_000  # Convert to seconds
                    if duration and duration > 0 and progress_callback:
                        progress = min(100, (current_time / duration) * 100)
                        progress_callback(progress)
                except (ValueError, IndexError):
                    pass
        
        process.wait()
        
        if process.returncode == 0 and Path(output_path).exists():
            logger.info(f"Generated preview: {output_path}")
            if progress_callback:
                progress_callback(100)
            return output_path
        else:
            stderr = process.stderr.read() if process.stderr else ""
            logger.warning(f"Preview generation failed: {stderr[-500:]}")
            return None
            
    except Exception as e:
        logger.error(f"Preview generation error: {e}")
        return None


# Track in-progress generations
_generation_locks: Dict[str, threading.Lock] = {}
_generation_results: Dict[str, Optional[str]] = {}


def get_or_generate_preview(source_path: str) -> Tuple[Optional[str], bool]:
    """
    Get cached preview or start generation.
    
    Returns:
        Tuple of (preview_path or None, is_ready boolean)
        If is_ready is False, generation is in progress
    """
    # Check cache first
    cached = get_cached_preview_path(source_path)
    if cached:
        return str(cached), True
    
    cache_key = get_cache_key(source_path)
    
    # Check if already generating
    if cache_key in _generation_locks:
        # Return None with is_ready=False to indicate in-progress
        if cache_key in _generation_results:
            result = _generation_results[cache_key]
            if result:
                return result, True
        return None, False
    
    # Start generation in background
    _generation_locks[cache_key] = threading.Lock()
    
    def generate():
        with _generation_locks[cache_key]:
            result = generate_preview_sync(source_path)
            _generation_results[cache_key] = result
            del _generation_locks[cache_key]
    
    thread = threading.Thread(target=generate, daemon=True)
    thread.start()
    
    return None, False


def clear_preview_cache() -> int:
    """Clear all cached preview videos. Returns count of files deleted."""
    if not CACHE_DIR.exists():
        return 0
    
    count = 0
    for f in CACHE_DIR.glob("*.mp4"):
        try:
            f.unlink()
            count += 1
        except Exception:
            pass
    
    return count


def get_cache_size() -> Tuple[int, int]:
    """Get cache size in bytes and file count."""
    if not CACHE_DIR.exists():
        return 0, 0
    
    total_size = 0
    count = 0
    for f in CACHE_DIR.glob("*.mp4"):
        try:
            total_size += f.stat().st_size
            count += 1
        except Exception:
            pass
    
    return total_size, count
