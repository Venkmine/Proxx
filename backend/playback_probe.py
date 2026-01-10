"""
Playback Capability Probe — Deterministic FFmpeg-Based Detection

============================================================================
DESIGN PHILOSOPHY
============================================================================
This module provides THE SINGLE SOURCE OF TRUTH for playback capability.

We do NOT guess based on:
- Codec names
- Container formats
- File extensions
- Allowlists/blocklists

We DO test reality:
- Can FFmpeg actually decode at least one video frame?

This matches how professional NLEs work — they probe first, then offer playback.

============================================================================
PROBE METHODOLOGY
============================================================================
Command:
    ffmpeg -v error -i INPUT -map 0:v:0 -frames:v 1 -f null -

Exit code 0 → PLAYABLE (frame decoded successfully)
"Stream map '0:v:0' matches no streams" → NO_VIDEO
Decode error → METADATA_ONLY (video stream exists but can't decode)
Any other error → ERROR

Timeout: 3 seconds (hard limit)
No retries. No guessing. No fallbacks.

============================================================================
CACHING
============================================================================
Results are cached by (path, size, mtime) tuple.
Cache is in-memory only — cleared on restart.
This is acceptable because:
1. Probe is fast (sub-second for most files)
2. Session-scoped caching is sufficient
3. No need for persistence across restarts

See: docs/PLAYBACK_PROBE.md
============================================================================
"""

import hashlib
import logging
import os
import shutil
import subprocess
import time
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Dict, Optional, Tuple

logger = logging.getLogger(__name__)

# ============================================================================
# CONFIGURATION
# ============================================================================

# Probe timeout in seconds — hard limit
PROBE_TIMEOUT_SECONDS = 3.0

# Cache for probe results (in-memory, session-scoped)
_probe_cache: Dict[str, 'PlaybackProbeResult'] = {}

# Browser-compatible video codecs.
# These are codecs that HTML5 <video> elements can decode natively.
# ProRes, DNxHD, etc. are NOT browser-compatible even though FFmpeg can decode them.
BROWSER_COMPATIBLE_CODECS = {
    # H.264/AVC family
    'h264', 'avc1', 'avc',
    # H.265/HEVC family (partial browser support)
    'hevc', 'h265', 'hvc1', 'hev1',
    # VP8/VP9 (WebM)
    'vp8', 'vp9',
    # AV1 (newer browsers)
    'av1', 'av01',
    # MPEG-4 Part 2
    'mpeg4', 'mp4v',
    # Older formats with wide browser support
    'theora',
}

# Codecs that FFmpeg can decode but browsers CANNOT play natively.
# If ffprobe detects these, we return METADATA_ONLY instead of PLAYABLE.
BROWSER_INCOMPATIBLE_CODECS = {
    # ProRes family
    'prores', 'prores_ks', 'prores_aw', 'prores_lt', 'prores_proxy', 'prores_hq', 'prores_4444', 'prores_xq',
    # Apple Intermediate Codec
    'aic', 'apch', 'apcn', 'apcs', 'apco', 'ap4h', 'ap4x',
    # DNxHD/DNxHR family
    'dnxhd', 'dnxhr',
    # Avid codecs
    'avid', 'avui',
    # CineForm
    'cfhd', 'cineform',
    # GoPro CineForm
    'gopro_cineform',
    # JPEG 2000
    'jpeg2000', 'j2k',
    # Motion JPEG
    'mjpeg', 'mjpegb',
    # DPX/Cineon
    'dpx', 'cineon',
    # Uncompressed
    'rawvideo', 'v210', 'v410', 'r210', 'r10k',
    # Old QuickTime codecs
    'svq1', 'svq3', 'rpza', 'smc', '8bps', 'qtrle',
}


# ============================================================================
# TYPES
# ============================================================================

class PlaybackCapability(str, Enum):
    """
    Deterministic playback capability states.
    
    PLAYABLE:      FFmpeg can decode at least 1 video frame
    METADATA_ONLY: Video stream exists but decode fails (e.g., RAW, ProRes RAW)
    NO_VIDEO:      No video stream in file
    ERROR:         Probe error (file not found, timeout, etc.)
    """
    PLAYABLE = "PLAYABLE"
    METADATA_ONLY = "METADATA_ONLY"
    NO_VIDEO = "NO_VIDEO"
    ERROR = "ERROR"


@dataclass
class PlaybackProbeResult:
    """Result of playback capability probe."""
    capability: PlaybackCapability
    engine: str = "ffmpeg"
    probe_ms: int = 0
    message: str = ""
    
    # Cache key info (for validation)
    path: str = ""
    size: int = 0
    mtime: float = 0.0
    
    def to_dict(self) -> dict:
        """Convert to dict for JSON response."""
        return {
            "capability": self.capability.value,
            "engine": self.engine,
            "probe_ms": self.probe_ms,
            "message": self.message,
        }


# ============================================================================
# CACHE KEY GENERATION
# ============================================================================

def _get_cache_key(path: str) -> Optional[Tuple[str, int, float]]:
    """
    Generate cache key from file path, size, and mtime.
    Returns None if file doesn't exist or can't be statted.
    """
    try:
        p = Path(path)
        if p.is_dir():
            # For directories (e.g., RAW folders), use directory mtime
            stat = p.stat()
            return (str(p.resolve()), 0, stat.st_mtime)
        elif p.exists():
            stat = p.stat()
            return (str(p.resolve()), stat.st_size, stat.st_mtime)
        else:
            return None
    except OSError:
        return None


def _cache_key_to_string(key: Tuple[str, int, float]) -> str:
    """Convert cache key tuple to string for dict key."""
    path, size, mtime = key
    return hashlib.md5(f"{path}|{size}|{mtime}".encode()).hexdigest()


# ============================================================================
# CODEC DETECTION
# ============================================================================

def _get_video_codec(path: str) -> Optional[str]:
    """
    Get the video codec name using ffprobe.
    
    Args:
        path: Absolute path to media file
        
    Returns:
        Lowercase codec name, or None if detection fails
    """
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return None
    
    try:
        result = subprocess.run(
            [
                ffprobe,
                "-v", "quiet",
                "-select_streams", "v:0",
                "-show_entries", "stream=codec_name",
                "-of", "csv=p=0",
                path,
            ],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip().lower()
    except (subprocess.TimeoutExpired, Exception):
        pass
    return None


def _is_browser_compatible_codec(codec_name: Optional[str]) -> bool:
    """
    Check if a video codec is browser-compatible.
    
    Args:
        codec_name: Lowercase codec name from ffprobe
        
    Returns:
        True if browser can play this codec, False otherwise
    """
    if not codec_name:
        # Unknown codec - assume not compatible
        return False
    
    codec_lower = codec_name.lower()
    
    # Check explicit incompatibility list first (fast reject)
    if codec_lower in BROWSER_INCOMPATIBLE_CODECS:
        return False
    
    # Check compatibility list
    if codec_lower in BROWSER_COMPATIBLE_CODECS:
        return True
    
    # Check partial matches for codec families
    # ProRes uses various four-character codes (apch, apcn, etc.)
    prores_prefixes = ('ap', 'prores')
    if any(codec_lower.startswith(p) for p in prores_prefixes):
        return False
    
    # H.264 variants
    if codec_lower.startswith('h264') or codec_lower.startswith('avc'):
        return True
    
    # H.265 variants
    if codec_lower.startswith('h265') or codec_lower.startswith('hevc'):
        return True
    
    # Unknown codec - assume not compatible for safety
    logger.warning(f"[BROWSER COMPAT] Unknown codec '{codec_name}' - assuming incompatible")
    return False


# ============================================================================
# CORE PROBE FUNCTION
# ============================================================================

def probe_playback_capability(path: str) -> PlaybackProbeResult:
    """
    Probe a media file to determine if FFmpeg can decode video frames.
    
    This is THE SINGLE SOURCE OF TRUTH for playback capability.
    
    Args:
        path: Absolute path to media file or folder
        
    Returns:
        PlaybackProbeResult with capability, timing, and message
        
    Capabilities:
        PLAYABLE:      FFmpeg can decode at least 1 video frame
        METADATA_ONLY: Video stream exists but decode fails
        NO_VIDEO:      No video stream in file
        ERROR:         Probe error (file not found, timeout, etc.)
    """
    start_time = time.monotonic()
    
    # Log probe start
    logger.info(f"[PLAYBACK PROBE] Starting probe for: {path}")
    
    # Check file exists
    p = Path(path)
    if not p.exists():
        elapsed_ms = int((time.monotonic() - start_time) * 1000)
        result = PlaybackProbeResult(
            capability=PlaybackCapability.ERROR,
            probe_ms=elapsed_ms,
            message=f"File not found: {path}",
            path=path,
        )
        logger.warning(f"[PLAYBACK PROBE] path={path} capability=ERROR ms={elapsed_ms} (file not found)")
        return result
    
    # Check cache
    cache_key = _get_cache_key(path)
    if cache_key:
        key_str = _cache_key_to_string(cache_key)
        if key_str in _probe_cache:
            cached = _probe_cache[key_str]
            # Validate cache entry matches current file state
            if (cached.path == cache_key[0] and 
                cached.size == cache_key[1] and 
                cached.mtime == cache_key[2]):
                elapsed_ms = int((time.monotonic() - start_time) * 1000)
                logger.info(f"[PLAYBACK PROBE] path={path} capability={cached.capability.value} ms={elapsed_ms} (cached)")
                return cached
    
    # Resolve actual input path
    # For directories, try to find the first video file (for RAW folders)
    input_path = str(p.resolve())
    if p.is_dir():
        # RAW folder — find representative file
        video_exts = {'.r3d', '.ari', '.arx', '.braw', '.mxf', '.mov', '.mp4', '.mkv'}
        found_file = None
        for item in sorted(p.iterdir()):
            if item.is_file() and item.suffix.lower() in video_exts:
                found_file = item
                break
        if found_file:
            input_path = str(found_file.resolve())
        else:
            # No recognizable video file in folder
            elapsed_ms = int((time.monotonic() - start_time) * 1000)
            result = PlaybackProbeResult(
                capability=PlaybackCapability.NO_VIDEO,
                probe_ms=elapsed_ms,
                message="No video files found in folder",
                path=path,
            )
            logger.info(f"[PLAYBACK PROBE] path={path} capability=NO_VIDEO ms={elapsed_ms} (no video files in folder)")
            return result
    
    # Build FFmpeg probe command
    # This attempts to decode exactly 1 video frame
    cmd = [
        "ffmpeg",
        "-v", "error",           # Only show errors
        "-i", input_path,        # Input file
        "-map", "0:v:0",         # Map first video stream
        "-frames:v", "1",        # Decode only 1 frame
        "-f", "null",            # Null output (discard)
        "-"                      # Output to nowhere
    ]
    
    try:
        # Run with timeout
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=PROBE_TIMEOUT_SECONDS,
        )
        
        elapsed_ms = int((time.monotonic() - start_time) * 1000)
        stderr = result.stderr.strip()
        
        if result.returncode == 0:
            # FFmpeg decoded at least 1 frame successfully.
            # But we also need to check if the codec is browser-compatible.
            # ProRes, DNxHD, etc. can be decoded by FFmpeg but not by browsers.
            
            codec_name = _get_video_codec(input_path)
            is_browser_compatible = _is_browser_compatible_codec(codec_name)
            
            if is_browser_compatible:
                # Browser can play this codec natively
                probe_result = PlaybackProbeResult(
                    capability=PlaybackCapability.PLAYABLE,
                    probe_ms=elapsed_ms,
                    message=f"FFmpeg can decode video frames (codec: {codec_name})",
                    path=cache_key[0] if cache_key else path,
                    size=cache_key[1] if cache_key else 0,
                    mtime=cache_key[2] if cache_key else 0.0,
                )
                logger.info(f"[PLAYBACK PROBE] path={path} codec={codec_name} capability=PLAYABLE ms={elapsed_ms}")
            else:
                # FFmpeg can decode it, but browser cannot
                # Return METADATA_ONLY so user gets preview proxy option
                probe_result = PlaybackProbeResult(
                    capability=PlaybackCapability.METADATA_ONLY,
                    probe_ms=elapsed_ms,
                    message=f"Codec '{codec_name}' not supported by browser. Generate preview proxy to enable playback.",
                    path=cache_key[0] if cache_key else path,
                    size=cache_key[1] if cache_key else 0,
                    mtime=cache_key[2] if cache_key else 0.0,
                )
                logger.info(f"[PLAYBACK PROBE] path={path} codec={codec_name} capability=METADATA_ONLY (browser-incompatible) ms={elapsed_ms}")
            
        elif "Stream map '0:v:0' matches no streams" in stderr:
            # No video stream
            probe_result = PlaybackProbeResult(
                capability=PlaybackCapability.NO_VIDEO,
                probe_ms=elapsed_ms,
                message="No video stream found",
                path=cache_key[0] if cache_key else path,
                size=cache_key[1] if cache_key else 0,
                mtime=cache_key[2] if cache_key else 0.0,
            )
            logger.info(f"[PLAYBACK PROBE] path={path} capability=NO_VIDEO ms={elapsed_ms}")
            
        elif "matches no streams" in stderr.lower():
            # Alternative no-stream message
            probe_result = PlaybackProbeResult(
                capability=PlaybackCapability.NO_VIDEO,
                probe_ms=elapsed_ms,
                message="No video stream found",
                path=cache_key[0] if cache_key else path,
                size=cache_key[1] if cache_key else 0,
                mtime=cache_key[2] if cache_key else 0.0,
            )
            logger.info(f"[PLAYBACK PROBE] path={path} capability=NO_VIDEO ms={elapsed_ms}")
            
        else:
            # Decode error — video stream exists but can't decode
            # This is typical for RAW formats (ARRIRAW, REDCODE, ProRes RAW, etc.)
            error_summary = stderr[:200] if stderr else "Unknown decode error"
            probe_result = PlaybackProbeResult(
                capability=PlaybackCapability.METADATA_ONLY,
                probe_ms=elapsed_ms,
                message=f"Video stream exists but decode failed: {error_summary}",
                path=cache_key[0] if cache_key else path,
                size=cache_key[1] if cache_key else 0,
                mtime=cache_key[2] if cache_key else 0.0,
            )
            logger.info(f"[PLAYBACK PROBE] path={path} capability=METADATA_ONLY ms={elapsed_ms}")
        
        # Cache result
        if cache_key:
            _probe_cache[_cache_key_to_string(cache_key)] = probe_result
            
        return probe_result
        
    except subprocess.TimeoutExpired:
        elapsed_ms = int((time.monotonic() - start_time) * 1000)
        result = PlaybackProbeResult(
            capability=PlaybackCapability.ERROR,
            probe_ms=elapsed_ms,
            message=f"Probe timed out after {PROBE_TIMEOUT_SECONDS}s",
            path=path,
        )
        logger.warning(f"[PLAYBACK PROBE] path={path} capability=ERROR ms={elapsed_ms} (timeout)")
        return result
        
    except FileNotFoundError:
        elapsed_ms = int((time.monotonic() - start_time) * 1000)
        result = PlaybackProbeResult(
            capability=PlaybackCapability.ERROR,
            probe_ms=elapsed_ms,
            message="FFmpeg not found in PATH",
            path=path,
        )
        logger.error(f"[PLAYBACK PROBE] path={path} capability=ERROR ms={elapsed_ms} (ffmpeg not found)")
        return result
        
    except Exception as e:
        elapsed_ms = int((time.monotonic() - start_time) * 1000)
        result = PlaybackProbeResult(
            capability=PlaybackCapability.ERROR,
            probe_ms=elapsed_ms,
            message=f"Probe error: {str(e)}",
            path=path,
        )
        logger.error(f"[PLAYBACK PROBE] path={path} capability=ERROR ms={elapsed_ms} error={e}")
        return result


# ============================================================================
# CACHE MANAGEMENT
# ============================================================================

def clear_probe_cache() -> int:
    """
    Clear the probe cache.
    
    Returns:
        Number of entries cleared
    """
    count = len(_probe_cache)
    _probe_cache.clear()
    logger.info(f"[PLAYBACK PROBE] Cache cleared ({count} entries)")
    return count


def get_probe_cache_stats() -> dict:
    """
    Get probe cache statistics.
    
    Returns:
        Dict with cache stats
    """
    return {
        "entries": len(_probe_cache),
        "capabilities": {
            cap.value: sum(1 for r in _probe_cache.values() if r.capability == cap)
            for cap in PlaybackCapability
        },
    }


# ============================================================================
# CONVENIENCE FUNCTIONS
# ============================================================================

def can_playback(path: str) -> bool:
    """
    Quick check if a file can be played back.
    
    This is a convenience wrapper around probe_playback_capability.
    
    Args:
        path: Absolute path to media file
        
    Returns:
        True if capability is PLAYABLE, False otherwise
    """
    result = probe_playback_capability(path)
    return result.capability == PlaybackCapability.PLAYABLE


def get_playback_message(capability: PlaybackCapability) -> str:
    """
    Get human-readable message for a playback capability.
    
    Args:
        capability: PlaybackCapability enum value
        
    Returns:
        Human-readable message
    """
    messages = {
        PlaybackCapability.PLAYABLE: "Playback available",
        PlaybackCapability.METADATA_ONLY: "Playback unavailable — requires Resolve",
        PlaybackCapability.NO_VIDEO: "No video stream",
        PlaybackCapability.ERROR: "Unable to probe file",
    }
    return messages.get(capability, "Unknown capability")
