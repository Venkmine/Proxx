"""
Preview Proxy Generation — Deterministic, Browser-Safe Proxies

============================================================================
DESIGN PHILOSOPHY
============================================================================
Preview proxies enable honest video playback in the MonitorSurface.

Key Principles:
1. UI NEVER attempts playback from original sources
2. ALL playback comes from preview-safe proxy files
3. Preview proxies are temporary, disposable, isolated from output jobs
4. If preview proxy generation fails, UI falls back to Identification Mode
5. No speculative playback. No fake scrubbers. No guessing codec support.

This matches the behavior of professional NLEs like DaVinci Resolve and
Adobe Premiere Pro, which generate optimized media for timeline playback.

============================================================================
OUTPUT SPECIFICATION
============================================================================
- Container: MP4 (HTML5-safe)
- Video: H.264 (baseline or main profile)
- Audio: AAC (optional, 128kbps)
- Resolution: max 1280px wide, preserve aspect ratio
- Duration: first 30 seconds OR full clip if shorter
- Frame rate: source or capped at 30fps
- +faststart for web streaming

See: docs/PREVIEW_PROXY_PIPELINE.md
============================================================================
"""

import hashlib
import logging
import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Dict, Any
import json

logger = logging.getLogger(__name__)

# ============================================================================
# CONFIGURATION
# ============================================================================

# Preview proxy settings — optimized for browser playback
PREVIEW_MAX_WIDTH = 1280
PREVIEW_MAX_HEIGHT = 720
PREVIEW_CODEC = "libx264"
PREVIEW_PROFILE = "main"  # main profile for broad compatibility
PREVIEW_PRESET = "fast"  # Balance speed vs quality
PREVIEW_CRF = 23  # Good quality for preview
PREVIEW_MAX_DURATION = 30  # First 30 seconds only
PREVIEW_MAX_FPS = 30  # Cap frame rate
PREVIEW_AUDIO_CODEC = "aac"
PREVIEW_AUDIO_BITRATE = "128k"
PREVIEW_AUDIO_CHANNELS = 2  # Stereo

# Cache directory for preview proxies
# Using system temp with proxx_previews subfolder
PREVIEW_CACHE_DIR = Path(tempfile.gettempdir()) / "proxx_previews"

# TODO: Implement cleanup daemon for preview proxies
# Preview proxies persist for session lifetime. A future cleanup daemon
# should remove old proxies based on age or when disk space is low.
# For now, proxies accumulate until manually cleared or system clears /tmp.


# ============================================================================
# DATA CLASSES
# ============================================================================

@dataclass
class PreviewProxyResult:
    """Result of preview proxy generation."""
    success: bool
    preview_path: Optional[str] = None
    duration: Optional[float] = None
    resolution: Optional[str] = None
    codec: str = "h264"
    error: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dict for JSON response."""
        if self.success:
            return {
                "preview_path": self.preview_path,
                "duration": self.duration,
                "resolution": self.resolution,
                "codec": self.codec,
            }
        else:
            return {
                "error": self.error,
            }


# ============================================================================
# CORE FUNCTIONS
# ============================================================================

def get_source_hash(source_path: str) -> str:
    """
    Generate a deterministic hash for a source file path.
    
    Hash includes absolute path and mtime for cache invalidation.
    """
    source = Path(source_path)
    if not source.exists():
        # Fallback to path-only hash for non-existent files
        return hashlib.sha256(source_path.encode()).hexdigest()[:16]
    
    # Include mtime in hash to invalidate cache when source changes
    mtime = source.stat().st_mtime
    key_source = f"{source.resolve()}:{mtime}"
    return hashlib.sha256(key_source.encode()).hexdigest()[:16]


def get_preview_directory(source_path: str) -> Path:
    """
    Get the preview directory for a source file.
    
    Creates a subfolder keyed by hash of absolute path.
    """
    source_hash = get_source_hash(source_path)
    preview_dir = PREVIEW_CACHE_DIR / source_hash
    return preview_dir


def get_preview_path(source_path: str) -> Path:
    """Get the expected preview proxy file path."""
    return get_preview_directory(source_path) / "preview.mp4"


def get_cached_preview(source_path: str) -> Optional[Path]:
    """
    Check if a valid cached preview exists.
    
    Returns path if cache hit, None if cache miss.
    """
    preview_path = get_preview_path(source_path)
    
    if not preview_path.exists():
        return None
    
    # Verify source still exists
    source = Path(source_path)
    if not source.exists():
        return None
    
    # Verify cache is still valid (source hasn't changed)
    current_hash = get_source_hash(source_path)
    cached_hash = preview_path.parent.name
    
    if current_hash != cached_hash:
        # Source changed, invalidate cache
        return None
    
    logger.debug(f"Cache hit for preview: {source_path}")
    return preview_path


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


def find_ffprobe() -> Optional[str]:
    """Find ffprobe binary path."""
    ffprobe_path = shutil.which("ffprobe")
    if ffprobe_path:
        return ffprobe_path
    
    # Try next to ffmpeg
    ffmpeg_path = find_ffmpeg()
    if ffmpeg_path:
        ffprobe_path = ffmpeg_path.replace("ffmpeg", "ffprobe")
        if os.path.isfile(ffprobe_path):
            return ffprobe_path
    
    return None


def probe_source_info(source_path: str) -> Optional[Dict[str, Any]]:
    """
    Get source video information using ffprobe.
    
    Returns dict with duration, width, height, fps, etc.
    """
    ffprobe = find_ffprobe()
    if not ffprobe:
        logger.warning("ffprobe not found, cannot probe source")
        return None
    
    try:
        cmd = [
            ffprobe,
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height,duration,r_frame_rate,codec_name",
            "-show_entries", "format=duration",
            "-of", "json",
            source_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, timeout=30)
        
        if result.returncode != 0:
            stderr = result.stderr.decode()[:500]
            logger.warning(f"ffprobe failed for {source_path}: {stderr}")
            return None
        
        data = json.loads(result.stdout.decode())
        
        # Extract video stream info
        info: Dict[str, Any] = {}
        
        if "streams" in data and data["streams"]:
            stream = data["streams"][0]
            info["width"] = stream.get("width")
            info["height"] = stream.get("height")
            info["codec_name"] = stream.get("codec_name")
            
            # Parse frame rate (may be "30000/1001" format)
            fps_str = stream.get("r_frame_rate", "")
            if "/" in fps_str:
                try:
                    num, den = fps_str.split("/")
                    info["fps"] = float(num) / float(den)
                except (ValueError, ZeroDivisionError):
                    pass
        
        # Get duration from format or stream
        if "format" in data and "duration" in data["format"]:
            info["duration"] = float(data["format"]["duration"])
        elif info.get("duration"):
            info["duration"] = float(info["duration"])
        
        return info
        
    except subprocess.TimeoutExpired:
        logger.warning(f"ffprobe timed out for {source_path}")
        return None
    except Exception as e:
        logger.warning(f"ffprobe error for {source_path}: {e}")
        return None


def generate_preview_proxy(source_path: str) -> PreviewProxyResult:
    """
    Generate a browser-safe preview proxy for a source file.
    
    This is the main entry point for preview generation.
    
    - Uses FFmpeg to transcode source to H.264/AAC MP4
    - Limits duration to first 30 seconds
    - Scales to max 1280px wide, preserving aspect ratio
    - Caps frame rate at 30fps
    - Returns result with preview path or error message
    """
    source = Path(source_path)
    
    # Validate source exists
    if not source.exists():
        return PreviewProxyResult(
            success=False,
            error=f"Source file not found: {source_path}"
        )
    
    if not source.is_file():
        return PreviewProxyResult(
            success=False,
            error=f"Source is not a file: {source_path}"
        )
    
    # Check for cached preview first
    cached = get_cached_preview(source_path)
    if cached:
        # Get duration from cached preview
        info = probe_source_info(str(cached))
        duration = info.get("duration") if info else None
        width = info.get("width") if info else PREVIEW_MAX_WIDTH
        height = info.get("height") if info else PREVIEW_MAX_HEIGHT
        
        return PreviewProxyResult(
            success=True,
            preview_path=str(cached),
            duration=duration,
            resolution=f"{width}x{height}" if width and height else None,
            codec="h264",
        )
    
    # Find FFmpeg
    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        return PreviewProxyResult(
            success=False,
            error="FFmpeg not found — cannot generate preview proxy"
        )
    
    # Probe source for metadata
    source_info = probe_source_info(source_path)
    if not source_info:
        return PreviewProxyResult(
            success=False,
            error="Preview unavailable — unsupported source format"
        )
    
    source_duration = source_info.get("duration")
    source_width = source_info.get("width")
    source_height = source_info.get("height")
    source_fps = source_info.get("fps")
    
    if not source_width or not source_height:
        return PreviewProxyResult(
            success=False,
            error="Preview unavailable — could not determine source dimensions"
        )
    
    # Calculate output dimensions (max 1280px wide, preserve aspect)
    aspect = source_width / source_height
    if source_width > PREVIEW_MAX_WIDTH:
        out_width = PREVIEW_MAX_WIDTH
        out_height = int(PREVIEW_MAX_WIDTH / aspect)
    else:
        out_width = source_width
        out_height = source_height
    
    # Ensure even dimensions (required for H.264)
    out_width = (out_width // 2) * 2
    out_height = (out_height // 2) * 2
    
    # Calculate duration limit
    if source_duration and source_duration > PREVIEW_MAX_DURATION:
        duration_limit = PREVIEW_MAX_DURATION
    else:
        duration_limit = source_duration
    
    # Calculate target fps
    if source_fps and source_fps > PREVIEW_MAX_FPS:
        target_fps = PREVIEW_MAX_FPS
    else:
        target_fps = source_fps
    
    # Prepare output directory
    preview_dir = get_preview_directory(source_path)
    preview_dir.mkdir(parents=True, exist_ok=True)
    preview_path = preview_dir / "preview.mp4"
    
    # Build FFmpeg command
    cmd = [
        ffmpeg,
        "-y",  # Overwrite output
        "-i", source_path,
    ]
    
    # Duration limit
    if duration_limit:
        cmd.extend(["-t", str(duration_limit)])
    
    # Video filters
    video_filters = []
    video_filters.append(f"scale={out_width}:{out_height}")
    if target_fps:
        video_filters.append(f"fps={target_fps}")
    
    cmd.extend(["-vf", ",".join(video_filters)])
    
    # Video codec settings
    cmd.extend([
        "-c:v", PREVIEW_CODEC,
        "-profile:v", PREVIEW_PROFILE,
        "-preset", PREVIEW_PRESET,
        "-crf", str(PREVIEW_CRF),
        "-pix_fmt", "yuv420p",  # Ensure browser compatibility
    ])
    
    # Audio codec settings
    cmd.extend([
        "-c:a", PREVIEW_AUDIO_CODEC,
        "-b:a", PREVIEW_AUDIO_BITRATE,
        "-ac", str(PREVIEW_AUDIO_CHANNELS),
    ])
    
    # Output settings
    cmd.extend([
        "-movflags", "+faststart",  # Enable progressive download
        str(preview_path),
    ])
    
    # Run FFmpeg
    try:
        logger.info(f"Generating preview proxy: {source_path} -> {preview_path}")
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            timeout=120,  # 2 minute timeout
        )
        
        if result.returncode != 0:
            stderr = result.stderr.decode()[-500:]
            logger.error(f"FFmpeg failed: {stderr}")
            
            # Clean up partial output
            if preview_path.exists():
                preview_path.unlink()
            
            return PreviewProxyResult(
                success=False,
                error="Preview unavailable — proxy generation failed"
            )
        
        if not preview_path.exists():
            return PreviewProxyResult(
                success=False,
                error="Preview unavailable — output file not created"
            )
        
        # Get actual output duration
        output_info = probe_source_info(str(preview_path))
        actual_duration = output_info.get("duration") if output_info else duration_limit
        actual_width = output_info.get("width", out_width)
        actual_height = output_info.get("height", out_height)
        
        logger.info(f"Preview proxy generated: {preview_path} ({actual_width}x{actual_height}, {actual_duration:.2f}s)")
        
        return PreviewProxyResult(
            success=True,
            preview_path=str(preview_path),
            duration=actual_duration,
            resolution=f"{actual_width}x{actual_height}",
            codec="h264",
        )
        
    except subprocess.TimeoutExpired:
        logger.error(f"FFmpeg timed out generating preview for: {source_path}")
        
        # Clean up partial output
        if preview_path.exists():
            preview_path.unlink()
        
        return PreviewProxyResult(
            success=False,
            error="Preview unavailable — generation timed out"
        )
    except Exception as e:
        logger.error(f"Preview generation error: {e}")
        
        return PreviewProxyResult(
            success=False,
            error=f"Preview unavailable — {str(e)}"
        )


def clear_preview_cache() -> int:
    """
    Clear all cached preview proxies.
    
    Returns the number of files deleted.
    """
    if not PREVIEW_CACHE_DIR.exists():
        return 0
    
    count = 0
    for subdir in PREVIEW_CACHE_DIR.iterdir():
        if subdir.is_dir():
            for f in subdir.glob("*"):
                try:
                    f.unlink()
                    count += 1
                except Exception:
                    pass
            try:
                subdir.rmdir()
            except Exception:
                pass
    
    logger.info(f"Cleared {count} preview proxy files")
    return count


def get_cache_stats() -> Dict[str, Any]:
    """
    Get statistics about the preview cache.
    
    Returns dict with size_bytes, size_mb, file_count.
    """
    if not PREVIEW_CACHE_DIR.exists():
        return {
            "size_bytes": 0,
            "size_mb": 0.0,
            "file_count": 0,
        }
    
    total_size = 0
    file_count = 0
    
    for subdir in PREVIEW_CACHE_DIR.iterdir():
        if subdir.is_dir():
            for f in subdir.glob("*"):
                try:
                    total_size += f.stat().st_size
                    file_count += 1
                except Exception:
                    pass
    
    return {
        "size_bytes": total_size,
        "size_mb": round(total_size / (1024 * 1024), 2),
        "file_count": file_count,
    }
