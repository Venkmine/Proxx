"""
FFprobe helper for validating transcode outputs.

Provides utilities to extract and validate:
- Container format
- Video codec, dimensions, frame rate
- Audio codec, channels, sample rate

Used by E2E tests to verify FFmpeg output correctness.
"""

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Optional
from fractions import Fraction


@dataclass
class VideoStreamInfo:
    """Video stream information from ffprobe."""
    codec_name: str
    width: int
    height: int
    frame_rate: float  # Computed from r_frame_rate
    pix_fmt: Optional[str] = None
    duration_seconds: Optional[float] = None


@dataclass
class AudioStreamInfo:
    """Audio stream information from ffprobe."""
    codec_name: str
    channels: int
    sample_rate: int
    duration_seconds: Optional[float] = None


@dataclass
class MediaInfo:
    """Complete media file information."""
    format_name: str  # e.g., "mov,mp4,m4a,3gp,3g2,mj2" or "matroska,webm"
    duration_seconds: float
    file_size_bytes: int
    video: Optional[VideoStreamInfo] = None
    audio: Optional[AudioStreamInfo] = None
    
    @property
    def primary_container(self) -> str:
        """Return the primary container format (first in list)."""
        return self.format_name.split(",")[0]
    
    def container_matches(self, expected: str) -> bool:
        """Check if container matches expected format."""
        expected_lower = expected.lower()
        # Handle aliases
        aliases = {
            "mov": ["mov", "mp4", "m4a"],
            "mp4": ["mov", "mp4", "m4a"],
            "mxf": ["mxf"],
            "mkv": ["matroska"],
            "webm": ["webm", "matroska"],
        }
        allowed = aliases.get(expected_lower, [expected_lower])
        return any(fmt in self.format_name.lower() for fmt in allowed)


class FFprobeError(Exception):
    """Error running ffprobe or parsing output."""
    pass


def parse_frame_rate(rate_str: str) -> float:
    """Parse ffprobe frame rate string (e.g., '24000/1001' or '24')."""
    if "/" in rate_str:
        try:
            frac = Fraction(rate_str)
            return float(frac)
        except (ValueError, ZeroDivisionError):
            return 0.0
    try:
        return float(rate_str)
    except ValueError:
        return 0.0


def probe_file(file_path: Path) -> MediaInfo:
    """
    Run ffprobe on a file and return structured info.
    
    Args:
        file_path: Path to media file
        
    Returns:
        MediaInfo with container, video, and audio details
        
    Raises:
        FFprobeError: If ffprobe fails or file is invalid
        FileNotFoundError: If file doesn't exist
    """
    if not file_path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")
    
    cmd = [
        "ffprobe",
        "-v", "error",
        "-show_format",
        "-show_streams",
        "-print_format", "json",
        str(file_path),
    ]
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30,
        )
    except FileNotFoundError:
        raise FFprobeError("ffprobe not found in PATH")
    except subprocess.TimeoutExpired:
        raise FFprobeError("ffprobe timed out")
    
    if result.returncode != 0:
        raise FFprobeError(f"ffprobe failed: {result.stderr}")
    
    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError as e:
        raise FFprobeError(f"Invalid JSON from ffprobe: {e}")
    
    # Parse format info
    format_info = data.get("format", {})
    format_name = format_info.get("format_name", "unknown")
    duration = float(format_info.get("duration", 0))
    file_size = int(format_info.get("size", 0))
    
    # Parse streams
    video_info = None
    audio_info = None
    
    for stream in data.get("streams", []):
        codec_type = stream.get("codec_type")
        
        if codec_type == "video" and video_info is None:
            video_info = VideoStreamInfo(
                codec_name=stream.get("codec_name", "unknown"),
                width=int(stream.get("width", 0)),
                height=int(stream.get("height", 0)),
                frame_rate=parse_frame_rate(stream.get("r_frame_rate", "0")),
                pix_fmt=stream.get("pix_fmt"),
                duration_seconds=float(stream.get("duration", 0)) if stream.get("duration") else None,
            )
        
        elif codec_type == "audio" and audio_info is None:
            audio_info = AudioStreamInfo(
                codec_name=stream.get("codec_name", "unknown"),
                channels=int(stream.get("channels", 0)),
                sample_rate=int(stream.get("sample_rate", 0)),
                duration_seconds=float(stream.get("duration", 0)) if stream.get("duration") else None,
            )
    
    return MediaInfo(
        format_name=format_name,
        duration_seconds=duration,
        file_size_bytes=file_size,
        video=video_info,
        audio=audio_info,
    )


def assert_video_codec(info: MediaInfo, expected: str) -> None:
    """Assert video codec matches expected value."""
    if info.video is None:
        raise AssertionError("No video stream found")
    
    actual = info.video.codec_name.lower()
    expected_lower = expected.lower()
    
    # Handle codec aliases
    aliases = {
        "h264": ["h264", "avc", "avc1"],
        "h265": ["h265", "hevc"],
        "prores": ["prores"],
        "prores_proxy": ["prores"],  # ffprobe reports "prores" for all ProRes
        "prores_lt": ["prores"],
        "prores_422": ["prores"],
        "prores_422_hq": ["prores"],
        "prores_4444": ["prores"],
        "prores_4444_xq": ["prores"],
        "dnxhd": ["dnxhd"],
        "dnxhr": ["dnxhd"],  # DNxHR uses same codec name in ffprobe
        "av1": ["av1"],
    }
    
    allowed = aliases.get(expected_lower, [expected_lower])
    if actual not in allowed:
        raise AssertionError(f"Video codec mismatch: expected {expected}, got {actual}")


def assert_audio_codec(info: MediaInfo, expected: str) -> None:
    """Assert audio codec matches expected value."""
    if info.audio is None:
        raise AssertionError("No audio stream found")
    
    actual = info.audio.codec_name.lower()
    expected_lower = expected.lower()
    
    # Handle codec aliases
    aliases = {
        "aac": ["aac"],
        "pcm_s16le": ["pcm_s16le"],
        "pcm_s24le": ["pcm_s24le"],
        "copy": ["aac", "pcm_s16le", "pcm_s24le", "mp3", "ac3"],  # Copy can result in any codec
    }
    
    allowed = aliases.get(expected_lower, [expected_lower])
    if actual not in allowed:
        raise AssertionError(f"Audio codec mismatch: expected {expected}, got {actual}")


def assert_dimensions(info: MediaInfo, width: int, height: int) -> None:
    """Assert video dimensions match expected values."""
    if info.video is None:
        raise AssertionError("No video stream found")
    
    if info.video.width != width or info.video.height != height:
        raise AssertionError(
            f"Dimensions mismatch: expected {width}x{height}, "
            f"got {info.video.width}x{info.video.height}"
        )


def assert_frame_rate(info: MediaInfo, expected: float, tolerance: float = 0.1) -> None:
    """Assert frame rate is within tolerance of expected value."""
    if info.video is None:
        raise AssertionError("No video stream found")
    
    actual = info.video.frame_rate
    if abs(actual - expected) > tolerance:
        raise AssertionError(f"Frame rate mismatch: expected {expected}, got {actual}")


def assert_audio_channels(info: MediaInfo, expected: int) -> None:
    """Assert audio channel count matches expected value."""
    if info.audio is None:
        raise AssertionError("No audio stream found")
    
    if info.audio.channels != expected:
        raise AssertionError(f"Audio channels mismatch: expected {expected}, got {info.audio.channels}")


def assert_container(info: MediaInfo, expected: str) -> None:
    """Assert container format matches expected value."""
    if not info.container_matches(expected):
        raise AssertionError(f"Container mismatch: expected {expected}, got {info.format_name}")


def assert_file_valid(file_path: Path) -> MediaInfo:
    """
    Assert file exists, is non-zero, and is valid media.
    
    Returns MediaInfo on success.
    Raises AssertionError on failure.
    """
    if not file_path.exists():
        raise AssertionError(f"Output file does not exist: {file_path}")
    
    if file_path.stat().st_size == 0:
        raise AssertionError(f"Output file is empty: {file_path}")
    
    try:
        return probe_file(file_path)
    except FFprobeError as e:
        raise AssertionError(f"Invalid media file: {e}")
