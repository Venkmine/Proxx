"""
Metadata extraction using ffprobe.

This module uses ffprobe (part of ffmpeg) to extract metadata from media files.
Extraction is read-only and non-destructive.

Failures return structured warnings, not crashes.
Missing metadata is explicitly represented as None or empty.
No silent guessing.
"""

import json
import subprocess
import shutil
from pathlib import Path
from typing import Optional, Dict, Any
from decimal import Decimal, InvalidOperation

from .models import (
    MediaMetadata,
    MediaIdentity,
    MediaTime,
    MediaImage,
    MediaCodec,
    MediaAudio,
    ChromaSubsampling,
    GOPType,
    MetadataProvenance,
    MetadataCompleteness,
)
from .errors import (
    MetadataExtractionError,
    FFProbeNotFoundError,
    UnsupportedFileError,
)


# Cache ffprobe availability check
_ffprobe_available: Optional[bool] = None


def check_ffprobe_available() -> bool:
    """
    Check if ffprobe is available on the system.
    
    Result is cached after first call.
    
    Returns:
        True if ffprobe is available, False otherwise
    """
    global _ffprobe_available
    
    if _ffprobe_available is None:
        _ffprobe_available = shutil.which("ffprobe") is not None
    
    return _ffprobe_available


def extract_metadata(filepath: str) -> MediaMetadata:
    """
    Extract metadata from a media file using ffprobe.
    
    This is the main entry point for metadata extraction.
    
    Args:
        filepath: Absolute path to the media file
        
    Returns:
        MediaMetadata object with all extracted information
        
    Raises:
        FFProbeNotFoundError: If ffprobe is not available
        MetadataExtractionError: If extraction fails
        UnsupportedFileError: If file format is unsupported
    """
    if not check_ffprobe_available():
        raise FFProbeNotFoundError()
    
    path = Path(filepath)
    
    if not path.exists():
        raise MetadataExtractionError(filepath, "File does not exist")
    
    if not path.is_file():
        raise MetadataExtractionError(filepath, "Path is not a file")
    
    # Extract identity (always available from filesystem)
    identity = _extract_identity(path)
    
    # Run ffprobe
    try:
        probe_data = _run_ffprobe(filepath)
    except subprocess.CalledProcessError as e:
        raise MetadataExtractionError(
            filepath, f"ffprobe failed with exit code {e.returncode}"
        )
    except json.JSONDecodeError as e:
        raise MetadataExtractionError(
            filepath, f"Failed to parse ffprobe output: {e}"
        )
    
    # Extract metadata groups
    try:
        time = _extract_time(probe_data)
        image = _extract_image(probe_data)
        codec = _extract_codec(probe_data)
        audio = _extract_audio(probe_data)
    except Exception as e:
        raise MetadataExtractionError(
            filepath, f"Failed to parse metadata: {e}"
        )
    
    # Determine if file is supported
    is_supported, skip_reason = _determine_support(codec, image)
    
    # Phase 12: Determine provenance and completeness
    # FFprobe is always our source here; Resolve extraction is separate
    provenance = MetadataProvenance.FFPROBE
    completeness = MetadataCompleteness.COMPLETE
    completeness_reason = None
    
    # Check for RAW formats where FFprobe provides LIMITED metadata
    raw_extensions = {'.braw', '.r3d', '.ari', '.arx', '.crm', '.nev'}
    path = Path(filepath)
    if path.suffix.lower() in raw_extensions:
        completeness = MetadataCompleteness.LIMITED
        completeness_reason = "RAW format - full metadata requires DaVinci Resolve"
    
    # Assemble metadata
    metadata = MediaMetadata(
        identity=identity,
        time=time,
        image=image,
        codec=codec,
        audio=audio,
        is_supported=is_supported,
        skip_reason=skip_reason,
        warnings=[],
        provenance=provenance,
        completeness=completeness,
        completeness_reason=completeness_reason,
    )
    
    # Add validation warnings
    _add_warnings(metadata)
    
    return metadata


def _run_ffprobe(filepath: str) -> Dict[str, Any]:
    """
    Run ffprobe and return parsed JSON output.
    
    Args:
        filepath: Path to media file
        
    Returns:
        Parsed ffprobe JSON output
        
    Raises:
        subprocess.CalledProcessError: If ffprobe fails
        json.JSONDecodeError: If output is not valid JSON
    """
    cmd = [
        "ffprobe",
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        filepath,
    ]
    
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        check=True,
    )
    
    return json.loads(result.stdout)


def _extract_identity(path: Path) -> MediaIdentity:
    """Extract identity metadata from filesystem."""
    return MediaIdentity(
        filename=path.name,
        full_path=str(path.absolute()),
        parent_folder=str(path.parent.absolute()),
    )


def _extract_time(probe_data: Dict[str, Any]) -> MediaTime:
    """
    Extract time-related metadata.
    
    Args:
        probe_data: Parsed ffprobe output
        
    Returns:
        MediaTime object
        
    Raises:
        ValueError: If required fields are missing or invalid
    """
    format_info = probe_data.get("format", {})
    video_stream = _get_video_stream(probe_data)
    
    if not video_stream:
        raise ValueError("No video stream found")
    
    # Duration
    duration_str = format_info.get("duration") or video_stream.get("duration")
    if not duration_str:
        raise ValueError("Duration not found")
    
    try:
        duration = float(duration_str)
    except (ValueError, TypeError):
        raise ValueError(f"Invalid duration: {duration_str}")
    
    # Frame rate
    fps_str = video_stream.get("r_frame_rate", "0/1")
    frame_rate = _parse_rational(fps_str)
    
    if frame_rate <= 0:
        # Try avg_frame_rate as fallback
        fps_str = video_stream.get("avg_frame_rate", "0/1")
        frame_rate = _parse_rational(fps_str)
    
    if frame_rate <= 0:
        raise ValueError("Frame rate not found or invalid")
    
    # Timecode (optional)
    timecode_start = _extract_timecode(video_stream)
    
    # Drop frame detection (heuristic)
    drop_frame = _is_drop_frame(frame_rate)
    
    # VFR detection
    is_vfr = _is_variable_frame_rate(video_stream)
    
    return MediaTime(
        duration_seconds=duration,
        frame_rate=frame_rate,
        timecode_start=timecode_start,
        drop_frame=drop_frame,
        is_vfr=is_vfr,
    )


def _extract_image(probe_data: Dict[str, Any]) -> MediaImage:
    """
    Extract image-related metadata.
    
    Args:
        probe_data: Parsed ffprobe output
        
    Returns:
        MediaImage object
        
    Raises:
        ValueError: If required fields are missing or invalid
    """
    video_stream = _get_video_stream(probe_data)
    
    if not video_stream:
        raise ValueError("No video stream found")
    
    width = video_stream.get("width")
    height = video_stream.get("height")
    
    if not width or not height:
        raise ValueError("Resolution not found")
    
    # Calculate aspect ratio
    dar = video_stream.get("display_aspect_ratio")
    if dar and ":" in dar:
        aspect_ratio = dar
    else:
        # Calculate from dimensions
        aspect_ratio = f"{width}:{height}"
    
    # Bit depth (optional)
    bit_depth = video_stream.get("bits_per_raw_sample")
    if bit_depth:
        try:
            bit_depth = int(bit_depth)
        except (ValueError, TypeError):
            bit_depth = None
    
    # Chroma subsampling
    pix_fmt = video_stream.get("pix_fmt", "")
    chroma = _parse_chroma_subsampling(pix_fmt)
    
    return MediaImage(
        width=width,
        height=height,
        aspect_ratio=aspect_ratio,
        bit_depth=bit_depth,
        chroma_subsampling=chroma,
    )


def _extract_codec(probe_data: Dict[str, Any]) -> MediaCodec:
    """
    Extract codec and container metadata.
    
    Args:
        probe_data: Parsed ffprobe output
        
    Returns:
        MediaCodec object
        
    Raises:
        ValueError: If required fields are missing
    """
    format_info = probe_data.get("format", {})
    video_stream = _get_video_stream(probe_data)
    
    if not video_stream:
        raise ValueError("No video stream found")
    
    # Container
    container = format_info.get("format_name", "").split(",")[0]
    if not container:
        raise ValueError("Container format not found")
    
    # Codec
    codec_name = video_stream.get("codec_name")
    if not codec_name:
        raise ValueError("Codec name not found")
    
    # Profile and level (optional)
    profile = video_stream.get("profile")
    level = video_stream.get("level")
    if level is not None:
        level = str(level)
    
    # GOP type detection
    gop_type = _detect_gop_type(codec_name)
    
    return MediaCodec(
        container=container,
        codec_name=codec_name,
        profile=profile,
        level=level,
        gop_type=gop_type,
    )


def _extract_audio(probe_data: Dict[str, Any]) -> Optional[MediaAudio]:
    """
    Extract audio metadata.
    
    Returns None if no audio stream exists.
    
    Args:
        probe_data: Parsed ffprobe output
        
    Returns:
        MediaAudio object or None
    """
    audio_stream = _get_audio_stream(probe_data)
    
    if not audio_stream:
        return None
    
    channels = audio_stream.get("channels")
    sample_rate = audio_stream.get("sample_rate")
    
    if not channels or not sample_rate:
        return None
    
    try:
        channels = int(channels)
        sample_rate = int(sample_rate)
    except (ValueError, TypeError):
        return None
    
    return MediaAudio(
        channel_count=channels,
        sample_rate=sample_rate,
    )


def _get_video_stream(probe_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Find the first video stream in ffprobe output."""
    streams = probe_data.get("streams", [])
    for stream in streams:
        if stream.get("codec_type") == "video":
            return stream
    return None


def _get_audio_stream(probe_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Find the first audio stream in ffprobe output."""
    streams = probe_data.get("streams", [])
    for stream in streams:
        if stream.get("codec_type") == "audio":
            return stream
    return None


def _parse_rational(rational_str: str) -> float:
    """
    Parse a rational number string (e.g., "30000/1001") to float.
    
    Args:
        rational_str: String in format "numerator/denominator"
        
    Returns:
        Float value, or 0.0 if parsing fails
    """
    try:
        if "/" in rational_str:
            num, denom = rational_str.split("/")
            num = int(num)
            denom = int(denom)
            if denom == 0:
                return 0.0
            return num / denom
        else:
            return float(rational_str)
    except (ValueError, ZeroDivisionError):
        return 0.0


def _extract_timecode(video_stream: Dict[str, Any]) -> Optional[str]:
    """
    Extract timecode start if present.
    
    Args:
        video_stream: Video stream data from ffprobe
        
    Returns:
        Timecode string or None
    """
    # Check tags for timecode
    tags = video_stream.get("tags", {})
    
    # Common timecode tag names
    for tag_name in ["timecode", "time_code", "TIMECODE"]:
        tc = tags.get(tag_name)
        if tc:
            return tc
    
    return None


def _is_drop_frame(frame_rate: float) -> bool:
    """
    Heuristic to detect drop-frame timecode.
    
    Drop frame is typically used with 29.97 and 59.94 fps.
    
    Args:
        frame_rate: Frame rate in fps
        
    Returns:
        True if likely drop-frame
    """
    # 29.97 fps (30000/1001)
    if abs(frame_rate - 29.97) < 0.01:
        return True
    
    # 59.94 fps (60000/1001)
    if abs(frame_rate - 59.94) < 0.01:
        return True
    
    return False


def _is_variable_frame_rate(video_stream: Dict[str, Any]) -> bool:
    """
    Detect variable frame rate.
    
    VFR is detected when avg_frame_rate differs significantly from r_frame_rate.
    
    Args:
        video_stream: Video stream data from ffprobe
        
    Returns:
        True if VFR detected
    """
    r_fps_str = video_stream.get("r_frame_rate", "0/1")
    avg_fps_str = video_stream.get("avg_frame_rate", "0/1")
    
    r_fps = _parse_rational(r_fps_str)
    avg_fps = _parse_rational(avg_fps_str)
    
    if r_fps <= 0 or avg_fps <= 0:
        return False
    
    # If difference is > 1%, flag as VFR
    diff_pct = abs(r_fps - avg_fps) / r_fps
    return diff_pct > 0.01


def _parse_chroma_subsampling(pix_fmt: str) -> ChromaSubsampling:
    """
    Parse chroma subsampling from pixel format string.
    
    Args:
        pix_fmt: Pixel format string (e.g., "yuv420p", "yuv422p10le")
        
    Returns:
        ChromaSubsampling enum value
    """
    pix_fmt = pix_fmt.lower()
    
    if "420" in pix_fmt:
        return ChromaSubsampling.YUV_420
    elif "422" in pix_fmt:
        return ChromaSubsampling.YUV_422
    elif "444" in pix_fmt:
        return ChromaSubsampling.YUV_444
    else:
        return ChromaSubsampling.UNKNOWN


def _detect_gop_type(codec_name: str) -> GOPType:
    """
    Detect GOP type from codec name.
    
    Intra-frame codecs (ProRes, DNx) have all I-frames.
    Long-GOP codecs (H.264, H.265) have I/B/P frames.
    
    Args:
        codec_name: Codec name from ffprobe
        
    Returns:
        GOPType enum value
    """
    codec_name = codec_name.lower()
    
    # Intra-frame codecs
    intra_codecs = ["prores", "dnxhd", "dnxhr", "mjpeg", "jpeg2000"]
    for intra in intra_codecs:
        if intra in codec_name:
            return GOPType.INTRA
    
    # Long-GOP codecs
    long_gop_codecs = ["h264", "h265", "hevc", "mpeg2", "mpeg4"]
    for long_gop in long_gop_codecs:
        if long_gop in codec_name:
            return GOPType.LONG_GOP
    
    return GOPType.UNKNOWN


def _determine_support(codec: MediaCodec, image: MediaImage) -> tuple[bool, Optional[str]]:
    """
    Determine if a file is supported for processing.
    
    Based on DECISIONS.md:
    - ProRes, DNxHR, DNxHD are supported
    - Long-GOP codecs warn but do not block
    
    Args:
        codec: Codec metadata
        image: Image metadata
        
    Returns:
        Tuple of (is_supported, skip_reason)
    """
    codec_name = codec.codec_name.lower()
    
    # Known unsupported formats
    unsupported_codecs = ["av1", "vp9", "vp8"]
    for unsupported in unsupported_codecs:
        if unsupported in codec_name:
            return False, f"Unsupported codec: {codec.codec_name}"
    
    # Unknown containers
    known_containers = ["mov", "mxf", "mp4", "avi", "mkv"]
    if codec.container not in known_containers:
        return False, f"Unsupported container: {codec.container}"
    
    # All other files are supported (even if they warn)
    return True, None


def _add_warnings(metadata: MediaMetadata) -> None:
    """
    Add validation warnings to metadata.
    
    Warnings are non-blocking but surfaced to user.
    
    Args:
        metadata: MediaMetadata to add warnings to
    """
    # VFR warning
    if metadata.time.is_vfr:
        metadata.add_warning("Variable frame rate detected - may cause sync issues")
    
    # Long-GOP warning (per DECISIONS.md)
    if metadata.codec.gop_type == GOPType.LONG_GOP:
        metadata.add_warning(
            f"Long-GOP codec detected ({metadata.codec.codec_name}) - "
            "intra-frame codecs recommended for editorial"
        )
    
    # Unusual bit depths
    if metadata.image.bit_depth and metadata.image.bit_depth not in [8, 10, 12]:
        metadata.add_warning(
            f"Unusual bit depth: {metadata.image.bit_depth} bits"
        )
    
    # No audio warning
    if metadata.audio is None:
        metadata.add_warning("No audio tracks detected")
    
    # Drop frame mismatch warning
    if metadata.time.drop_frame and metadata.time.timecode_start:
        # Drop frame timecode should use ";" separator
        if ";" not in metadata.time.timecode_start:
            metadata.add_warning(
                "Drop-frame flag set but timecode does not use ';' separator"
            )
