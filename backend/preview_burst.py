"""
Preview Burst Thumbnails — Evenly Spaced Frame Strip

============================================================================
DESIGN PHILOSOPHY
============================================================================
Burst thumbnails provide a scrubable overview of source content.
This is the second tier of the preview system (after poster frame).

Key Principles:
1. Generate N evenly spaced frames (default: 7)
2. Evenly distributed across duration (or first 20% if >30min)
3. Non-blocking — user can work while generating
4. NEVER blocks job creation, preflight, or encoding
5. Preview is identification only — not editorial accuracy

Output:
- JPEGs, quality ~75
- Max dimension: 480px (thumbnails are smaller than poster)
- Cache by content hash in /tmp/proxx_previews/bursts/{hash}/

See: docs/PREVIEW_PIPELINE.md
============================================================================
"""

import hashlib
import logging
import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional, Dict, Any, List
import json

logger = logging.getLogger(__name__)

# ============================================================================
# CONFIGURATION
# ============================================================================

# Burst thumbnail settings
BURST_DEFAULT_COUNT = 7  # Number of frames in burst strip
BURST_MAX_DIMENSION = 480  # Max width or height (smaller than poster)
BURST_JPEG_QUALITY = 75  # JPEG quality (1-100)
BURST_TIMEOUT_PER_FRAME = 3  # Timeout per frame extraction
BURST_MAX_DURATION_FULL = 30 * 60  # 30 minutes
BURST_LONG_CLIP_PERCENT = 0.20  # Use first 20% for clips >30min

# Cache directory for burst thumbnails
BURST_CACHE_DIR = Path(tempfile.gettempdir()) / "proxx_previews" / "bursts"


# ============================================================================
# DATA CLASSES
# ============================================================================

@dataclass
class BurstThumbnail:
    """Single thumbnail in a burst strip."""
    index: int
    path: str
    timestamp: float  # Seconds into source


@dataclass
class BurstResult:
    """Result of burst thumbnail generation."""
    success: bool
    hash_id: Optional[str] = None
    thumbnails: List[BurstThumbnail] = field(default_factory=list)
    total_requested: int = BURST_DEFAULT_COUNT
    total_generated: int = 0
    source_duration: Optional[float] = None
    error: Optional[str] = None
    cached: bool = False
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dict for JSON response."""
        if self.success:
            return {
                "hash_id": self.hash_id,
                "thumbnails": [
                    {
                        "index": t.index,
                        "timestamp": t.timestamp,
                        "url": f"/preview/burst/{self.hash_id}/{t.index}.jpg"
                    }
                    for t in self.thumbnails
                ],
                "total_requested": self.total_requested,
                "total_generated": self.total_generated,
                "source_duration": self.source_duration,
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
        return hashlib.sha256(source_path.encode()).hexdigest()[:16]
    
    mtime = source.stat().st_mtime
    key_source = f"{source.resolve()}:{mtime}"
    return hashlib.sha256(key_source.encode()).hexdigest()[:16]


def get_burst_directory(source_path: str) -> Path:
    """Get the burst thumbnail directory for a source file."""
    source_hash = get_source_hash(source_path)
    return BURST_CACHE_DIR / source_hash


def get_cached_burst(source_path: str, count: int = BURST_DEFAULT_COUNT) -> Optional[List[BurstThumbnail]]:
    """
    Check if valid cached burst thumbnails exist.
    
    Returns list of thumbnails if cache hit, None if cache miss.
    """
    burst_dir = get_burst_directory(source_path)
    
    if not burst_dir.exists():
        return None
    
    # Check that expected thumbnails exist
    thumbnails: List[BurstThumbnail] = []
    for i in range(count):
        thumb_path = burst_dir / f"{i}.jpg"
        if not thumb_path.exists():
            return None  # Incomplete cache
        
        # Read timestamp from metadata file if exists
        meta_path = burst_dir / f"{i}.json"
        timestamp = 0.0
        if meta_path.exists():
            try:
                with open(meta_path, "r") as f:
                    meta = json.load(f)
                    timestamp = meta.get("timestamp", 0.0)
            except Exception:
                pass
        
        thumbnails.append(BurstThumbnail(
            index=i,
            path=str(thumb_path),
            timestamp=timestamp,
        ))
    
    logger.debug(f"Burst cache hit for: {source_path}")
    return thumbnails


def find_ffmpeg() -> Optional[str]:
    """Find ffmpeg binary path."""
    ffmpeg_path = shutil.which("ffmpeg")
    if ffmpeg_path:
        return ffmpeg_path
    
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
    
    ffmpeg_path = find_ffmpeg()
    if ffmpeg_path:
        ffprobe_path = ffmpeg_path.replace("ffmpeg", "ffprobe")
        if os.path.isfile(ffprobe_path):
            return ffprobe_path
    
    return None


def get_source_duration(source_path: str) -> Optional[float]:
    """Get source video duration using ffprobe."""
    ffprobe = find_ffprobe()
    if not ffprobe:
        return None
    
    try:
        cmd = [
            ffprobe,
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "json",
            source_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, timeout=5)
        
        if result.returncode != 0:
            return None
        
        data = json.loads(result.stdout.decode())
        
        if "format" in data and "duration" in data["format"]:
            return float(data["format"]["duration"])
        
        return None
        
    except Exception:
        return None


def generate_burst_thumbnails(
    source_path: str,
    count: int = BURST_DEFAULT_COUNT,
) -> BurstResult:
    """
    Generate burst thumbnails (evenly spaced frames) for a source file.
    
    This is the main entry point for burst thumbnail generation.
    
    - Extracts N evenly spaced frames
    - For clips >30min, uses first 20% only
    - Scales to max 480px while preserving aspect ratio
    - Returns result with thumbnail paths and timestamps
    """
    source = Path(source_path)
    
    # Validate source exists
    if not source.exists():
        return BurstResult(
            success=False,
            error=f"Source file not found: {source_path}"
        )
    
    if not source.is_file():
        return BurstResult(
            success=False,
            error=f"Source is not a file: {source_path}"
        )
    
    # Get source hash for caching
    source_hash = get_source_hash(source_path)
    
    # Check for cached burst
    cached_burst = get_cached_burst(source_path, count)
    if cached_burst:
        duration = get_source_duration(source_path)
        return BurstResult(
            success=True,
            hash_id=source_hash,
            thumbnails=cached_burst,
            total_requested=count,
            total_generated=len(cached_burst),
            source_duration=duration,
            cached=True,
        )
    
    # Find FFmpeg
    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        return BurstResult(
            success=False,
            error="FFmpeg not found — cannot generate burst thumbnails"
        )
    
    # Get source duration
    duration = get_source_duration(source_path)
    if not duration or duration <= 0:
        return BurstResult(
            success=False,
            error="Could not determine source duration"
        )
    
    # Calculate effective duration for frame extraction
    # For clips >30min, only use first 20%
    if duration > BURST_MAX_DURATION_FULL:
        effective_duration = duration * BURST_LONG_CLIP_PERCENT
        logger.info(f"Long clip ({duration:.1f}s), using first {effective_duration:.1f}s for burst")
    else:
        effective_duration = duration
    
    # Calculate timestamps for each frame
    # Evenly spaced, avoiding very start and end
    timestamps: List[float] = []
    margin = effective_duration * 0.02  # 2% margin at start/end
    usable_duration = effective_duration - (2 * margin)
    
    if count == 1:
        timestamps = [effective_duration / 2]
    else:
        for i in range(count):
            t = margin + (usable_duration * i / (count - 1))
            timestamps.append(t)
    
    # Prepare output directory
    burst_dir = get_burst_directory(source_path)
    burst_dir.mkdir(parents=True, exist_ok=True)
    
    # Extract each frame
    thumbnails: List[BurstThumbnail] = []
    
    for i, timestamp in enumerate(timestamps):
        output_path = burst_dir / f"{i}.jpg"
        meta_path = burst_dir / f"{i}.json"
        
        cmd = [
            ffmpeg,
            "-y",
            "-ss", str(timestamp),
            "-i", source_path,
            "-vframes", "1",
            "-vf", f"scale='min({BURST_MAX_DIMENSION},iw)':'min({BURST_MAX_DIMENSION},ih)':force_original_aspect_ratio=decrease",
            "-q:v", str(int(100 - BURST_JPEG_QUALITY) // 3 + 1),
            str(output_path),
        ]
        
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                timeout=BURST_TIMEOUT_PER_FRAME,
            )
            
            if result.returncode == 0 and output_path.exists():
                # Save metadata
                with open(meta_path, "w") as f:
                    json.dump({"timestamp": timestamp}, f)
                
                thumbnails.append(BurstThumbnail(
                    index=i,
                    path=str(output_path),
                    timestamp=timestamp,
                ))
                logger.debug(f"Burst frame {i} extracted at {timestamp:.2f}s")
            else:
                logger.warning(f"Failed to extract burst frame {i} at {timestamp:.2f}s")
                
        except subprocess.TimeoutExpired:
            logger.warning(f"Timeout extracting burst frame {i}")
        except Exception as e:
            logger.warning(f"Error extracting burst frame {i}: {e}")
    
    if not thumbnails:
        return BurstResult(
            success=False,
            error="Failed to extract any burst frames"
        )
    
    logger.info(f"Burst thumbnails generated: {len(thumbnails)}/{count} frames for {source_path}")
    
    return BurstResult(
        success=True,
        hash_id=source_hash,
        thumbnails=thumbnails,
        total_requested=count,
        total_generated=len(thumbnails),
        source_duration=duration,
        cached=False,
    )


def clear_burst_cache() -> int:
    """
    Clear all cached burst thumbnails.
    
    Returns the number of directories deleted.
    """
    if not BURST_CACHE_DIR.exists():
        return 0
    
    count = 0
    for subdir in BURST_CACHE_DIR.iterdir():
        if subdir.is_dir():
            try:
                shutil.rmtree(subdir)
                count += 1
            except Exception:
                pass
    
    logger.info(f"Cleared {count} burst thumbnail directories")
    return count


def get_burst_cache_stats() -> Dict[str, Any]:
    """
    Get statistics about the burst cache.
    
    Returns dict with size_bytes, size_mb, directory_count, file_count.
    """
    if not BURST_CACHE_DIR.exists():
        return {
            "size_bytes": 0,
            "size_mb": 0.0,
            "directory_count": 0,
            "file_count": 0,
        }
    
    total_size = 0
    file_count = 0
    dir_count = 0
    
    for subdir in BURST_CACHE_DIR.iterdir():
        if subdir.is_dir():
            dir_count += 1
            for f in subdir.glob("*"):
                try:
                    total_size += f.stat().st_size
                    file_count += 1
                except Exception:
                    pass
    
    return {
        "size_bytes": total_size,
        "size_mb": round(total_size / (1024 * 1024), 2),
        "directory_count": dir_count,
        "file_count": file_count,
    }
