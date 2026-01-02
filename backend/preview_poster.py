"""
Preview Poster Frame — Instant Single-Frame Extraction

============================================================================
DESIGN PHILOSOPHY
============================================================================
Poster frames provide INSTANT visual identification of source media.
This is the foundation of the tiered preview system.

Key Principles:
1. MUST complete within 2 seconds (hard timeout)
2. MUST work for ALL formats including RAW
3. NEVER blocks job creation, preflight, or encoding
4. Something visual appears IMMEDIATELY on source selection
5. Preview is identification only — not editorial accuracy

Seek Strategy:
- Prefer 5–10% into clip (avoids black frames, slates)
- Fallback to frame 0 if seeking fails

Output:
- JPEG, quality ~75
- Max dimension: 1280px (preserves aspect ratio)
- Cache by content hash in /tmp/proxx_previews/posters/

See: docs/PREVIEW_PIPELINE.md
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

# Poster frame settings
POSTER_MAX_DIMENSION = 1280  # Max width or height
POSTER_JPEG_QUALITY = 75  # JPEG quality (1-100)
POSTER_TIMEOUT_SECONDS = 2  # Hard timeout for generation
POSTER_SEEK_PERCENT = 0.07  # 7% into clip (between 5-10%)

# Cache directory for poster frames
POSTER_CACHE_DIR = Path(tempfile.gettempdir()) / "proxx_previews" / "posters"


# ============================================================================
# DATA CLASSES
# ============================================================================

@dataclass
class PosterFrameResult:
    """Result of poster frame extraction."""
    success: bool
    poster_path: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    source_info: Optional[Dict[str, Any]] = None  # Metadata for overlay
    error: Optional[str] = None
    cached: bool = False
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dict for JSON response."""
        if self.success:
            return {
                "poster_path": self.poster_path,
                "width": self.width,
                "height": self.height,
                "source_info": self.source_info,
                "cached": self.cached,
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
    Generate a deterministic hash for a source file.
    
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


def get_poster_path(source_path: str) -> Path:
    """Get the expected poster frame file path."""
    source_hash = get_source_hash(source_path)
    return POSTER_CACHE_DIR / f"{source_hash}.jpg"


def get_cached_poster(source_path: str) -> Optional[Path]:
    """
    Check if a valid cached poster exists.
    
    Returns path if cache hit, None if cache miss.
    """
    poster_path = get_poster_path(source_path)
    
    if not poster_path.exists():
        return None
    
    # Verify source still exists and hash is valid
    source = Path(source_path)
    if not source.exists():
        return None
    
    # Verify cache is still valid (source hasn't changed)
    current_hash = get_source_hash(source_path)
    cached_hash = poster_path.stem  # filename without extension
    
    if current_hash != cached_hash:
        # Source changed, invalidate cache
        try:
            poster_path.unlink()
        except Exception:
            pass
        return None
    
    logger.debug(f"Poster cache hit for: {source_path}")
    return poster_path


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


def probe_source_metadata(source_path: str) -> Optional[Dict[str, Any]]:
    """
    Get source video information using ffprobe.
    
    Returns dict with duration, width, height, fps, codec, etc.
    This metadata is used for the poster frame overlay.
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
            "-show_entries", "stream=width,height,duration,r_frame_rate,codec_name,pix_fmt",
            "-show_entries", "format=duration,size,filename",
            "-of", "json",
            source_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, timeout=5)
        
        if result.returncode != 0:
            stderr = result.stderr.decode()[:500]
            logger.warning(f"ffprobe failed for {source_path}: {stderr}")
            return None
        
        data = json.loads(result.stdout.decode())
        
        info: Dict[str, Any] = {}
        
        # Extract video stream info
        if "streams" in data and data["streams"]:
            stream = data["streams"][0]
            info["width"] = stream.get("width")
            info["height"] = stream.get("height")
            info["codec"] = stream.get("codec_name")
            info["pix_fmt"] = stream.get("pix_fmt")
            
            # Parse frame rate (may be "30000/1001" format)
            fps_str = stream.get("r_frame_rate", "")
            if "/" in fps_str:
                try:
                    num, den = fps_str.split("/")
                    fps = float(num) / float(den)
                    info["fps"] = round(fps, 3)
                except (ValueError, ZeroDivisionError):
                    pass
            elif fps_str:
                try:
                    info["fps"] = float(fps_str)
                except ValueError:
                    pass
        
        # Get duration and file size from format
        if "format" in data:
            fmt = data["format"]
            if "duration" in fmt:
                info["duration"] = float(fmt["duration"])
            if "size" in fmt:
                size_bytes = int(fmt["size"])
                info["file_size"] = size_bytes
                # Human-readable size
                if size_bytes >= 1024 * 1024 * 1024:
                    info["file_size_human"] = f"{size_bytes / (1024*1024*1024):.2f} GB"
                elif size_bytes >= 1024 * 1024:
                    info["file_size_human"] = f"{size_bytes / (1024*1024):.1f} MB"
                else:
                    info["file_size_human"] = f"{size_bytes / 1024:.0f} KB"
            if "filename" in fmt:
                info["filename"] = Path(fmt["filename"]).name
        
        # Add resolution string
        if info.get("width") and info.get("height"):
            info["resolution"] = f"{info['width']}x{info['height']}"
        
        # Add duration string
        if info.get("duration"):
            dur = info["duration"]
            hours = int(dur // 3600)
            minutes = int((dur % 3600) // 60)
            seconds = dur % 60
            if hours > 0:
                info["duration_human"] = f"{hours}:{minutes:02d}:{seconds:05.2f}"
            else:
                info["duration_human"] = f"{minutes}:{seconds:05.2f}"
        
        return info
        
    except subprocess.TimeoutExpired:
        logger.warning(f"ffprobe timed out for {source_path}")
        return None
    except Exception as e:
        logger.warning(f"ffprobe error for {source_path}: {e}")
        return None


def extract_poster_frame(source_path: str) -> PosterFrameResult:
    """
    Extract a single poster frame from a source file.
    
    This is the main entry point for poster frame generation.
    
    - Uses FFmpeg to extract a single JPEG frame
    - Seeks to 5-10% into clip to avoid black frames
    - Falls back to frame 0 if seeking fails
    - Scales to max 1280px while preserving aspect ratio
    - Hard timeout of 2 seconds
    - Returns result with poster path and source metadata
    """
    source = Path(source_path)
    
    # Validate source exists
    if not source.exists():
        return PosterFrameResult(
            success=False,
            error=f"Source file not found: {source_path}"
        )
    
    if not source.is_file():
        return PosterFrameResult(
            success=False,
            error=f"Source is not a file: {source_path}"
        )
    
    # Get source metadata for overlay (non-blocking)
    source_info = probe_source_metadata(source_path)
    
    # Check for cached poster first
    cached_poster = get_cached_poster(source_path)
    if cached_poster:
        # Get poster dimensions
        width, height = None, None
        try:
            from PIL import Image
            with Image.open(cached_poster) as img:
                width, height = img.size
        except ImportError:
            pass  # PIL not available, skip dimension extraction
        except Exception:
            pass
        
        return PosterFrameResult(
            success=True,
            poster_path=str(cached_poster),
            width=width,
            height=height,
            source_info=source_info,
            cached=True,
        )
    
    # Find FFmpeg
    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        return PosterFrameResult(
            success=False,
            error="FFmpeg not found — cannot extract poster frame",
            source_info=source_info,
        )
    
    # Calculate seek time
    seek_time = 0
    if source_info and source_info.get("duration"):
        duration = source_info["duration"]
        seek_time = duration * POSTER_SEEK_PERCENT
        # Don't seek past the end
        seek_time = min(seek_time, duration - 0.1)
        seek_time = max(seek_time, 0)
    
    # Prepare output directory and path
    POSTER_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    poster_path = get_poster_path(source_path)
    
    # Calculate output dimensions
    src_width = source_info.get("width", 1920) if source_info else 1920
    src_height = source_info.get("height", 1080) if source_info else 1080
    
    if src_width > src_height:
        # Landscape
        if src_width > POSTER_MAX_DIMENSION:
            out_width = POSTER_MAX_DIMENSION
            out_height = int(src_height * POSTER_MAX_DIMENSION / src_width)
        else:
            out_width = src_width
            out_height = src_height
    else:
        # Portrait
        if src_height > POSTER_MAX_DIMENSION:
            out_height = POSTER_MAX_DIMENSION
            out_width = int(src_width * POSTER_MAX_DIMENSION / src_height)
        else:
            out_width = src_width
            out_height = src_height
    
    # Ensure even dimensions
    out_width = (out_width // 2) * 2
    out_height = (out_height // 2) * 2
    
    # Build FFmpeg command
    # Try with seek first, fallback to frame 0 if it fails
    cmd = [
        ffmpeg,
        "-y",  # Overwrite output
        "-ss", str(seek_time),  # Seek before input (fast)
        "-i", source_path,
        "-vframes", "1",  # Extract exactly one frame
        "-vf", f"scale={out_width}:{out_height}",
        "-q:v", str(int(100 - POSTER_JPEG_QUALITY) // 3 + 1),  # JPEG quality (1=best, 31=worst)
        str(poster_path),
    ]
    
    try:
        logger.info(f"Extracting poster frame: {source_path} @ {seek_time:.2f}s")
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            timeout=POSTER_TIMEOUT_SECONDS,
        )
        
        if result.returncode != 0 or not poster_path.exists():
            # Try again without seeking (fallback to frame 0)
            logger.debug(f"Seek extraction failed, trying frame 0")
            cmd_fallback = [
                ffmpeg,
                "-y",
                "-i", source_path,
                "-vframes", "1",
                "-vf", f"scale={out_width}:{out_height}",
                "-q:v", str(int(100 - POSTER_JPEG_QUALITY) // 3 + 1),
                str(poster_path),
            ]
            
            result = subprocess.run(
                cmd_fallback,
                capture_output=True,
                timeout=POSTER_TIMEOUT_SECONDS,
            )
        
        if result.returncode != 0:
            stderr = result.stderr.decode()[-500:]
            logger.warning(f"FFmpeg poster extraction failed: {stderr}")
            return PosterFrameResult(
                success=False,
                error="Poster extraction failed — unsupported format",
                source_info=source_info,
            )
        
        if not poster_path.exists():
            return PosterFrameResult(
                success=False,
                error="Poster extraction failed — no output file",
                source_info=source_info,
            )
        
        logger.info(f"Poster frame extracted: {poster_path} ({out_width}x{out_height})")
        
        return PosterFrameResult(
            success=True,
            poster_path=str(poster_path),
            width=out_width,
            height=out_height,
            source_info=source_info,
            cached=False,
        )
        
    except subprocess.TimeoutExpired:
        logger.warning(f"Poster extraction timed out for: {source_path}")
        
        # Clean up partial output
        if poster_path.exists():
            try:
                poster_path.unlink()
            except Exception:
                pass
        
        return PosterFrameResult(
            success=False,
            error="Poster extraction timed out",
            source_info=source_info,
        )
    except Exception as e:
        logger.error(f"Poster extraction error: {e}")
        
        return PosterFrameResult(
            success=False,
            error=f"Poster extraction failed — {str(e)}",
            source_info=source_info,
        )


def clear_poster_cache() -> int:
    """
    Clear all cached poster frames.
    
    Returns the number of files deleted.
    """
    if not POSTER_CACHE_DIR.exists():
        return 0
    
    count = 0
    for f in POSTER_CACHE_DIR.glob("*.jpg"):
        try:
            f.unlink()
            count += 1
        except Exception:
            pass
    
    logger.info(f"Cleared {count} cached poster frames")
    return count


def get_poster_cache_stats() -> Dict[str, Any]:
    """
    Get statistics about the poster cache.
    
    Returns dict with size_bytes, size_mb, file_count.
    """
    if not POSTER_CACHE_DIR.exists():
        return {
            "size_bytes": 0,
            "size_mb": 0.0,
            "file_count": 0,
        }
    
    total_size = 0
    file_count = 0
    
    for f in POSTER_CACHE_DIR.glob("*.jpg"):
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
