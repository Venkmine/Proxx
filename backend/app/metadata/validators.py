"""
Metadata validation utilities.

Provides validation and sanity checking for extracted metadata.
Produces human-readable warnings and error messages.
"""

from typing import List
from .models import MediaMetadata, GOPType


def validate_metadata(metadata: MediaMetadata) -> List[str]:
    """
    Validate metadata and return list of issues.
    
    This performs sanity checks beyond basic model validation.
    Returns empty list if all checks pass.
    
    Args:
        metadata: Metadata to validate
        
    Returns:
        List of human-readable validation issues
    """
    issues: List[str] = []
    
    # Check resolution sanity
    if metadata.image.width > 16384 or metadata.image.height > 16384:
        issues.append(
            f"Unusually large resolution: {metadata.image.width}x{metadata.image.height}"
        )
    
    if metadata.image.width < 64 or metadata.image.height < 64:
        issues.append(
            f"Unusually small resolution: {metadata.image.width}x{metadata.image.height}"
        )
    
    # Check frame rate sanity
    common_fps = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60, 120]
    is_common = any(abs(metadata.time.frame_rate - fps) < 0.01 for fps in common_fps)
    
    if not is_common:
        issues.append(
            f"Unusual frame rate: {metadata.time.frame_rate:.3f} fps"
        )
    
    # Check duration sanity
    if metadata.time.duration_seconds > 86400:  # > 24 hours
        issues.append(
            f"Unusually long duration: {metadata.time.duration_seconds / 3600:.1f} hours"
        )
    
    if metadata.time.duration_seconds < 0.1:  # < 100ms
        issues.append(
            f"Unusually short duration: {metadata.time.duration_seconds:.3f} seconds"
        )
    
    # Check audio sanity (if present)
    if metadata.audio:
        if metadata.audio.channel_count > 64:
            issues.append(
                f"Unusually high channel count: {metadata.audio.channel_count}"
            )
        
        common_rates = [44100, 48000, 96000]
        if metadata.audio.sample_rate not in common_rates:
            issues.append(
                f"Unusual sample rate: {metadata.audio.sample_rate} Hz"
            )
    
    return issues


def is_editorial_friendly(metadata: MediaMetadata) -> bool:
    """
    Check if media is editorial-friendly.
    
    Editorial-friendly means:
    - Intra-frame codec (not long-GOP)
    - Standard frame rate
    - Not VFR
    - Has audio (preferred but not required)
    
    Args:
        metadata: Metadata to check
        
    Returns:
        True if editorial-friendly
    """
    # Must be intra-frame
    if metadata.codec.gop_type != GOPType.INTRA:
        return False
    
    # Must not be VFR
    if metadata.time.is_vfr:
        return False
    
    # Should have reasonable frame rate
    common_fps = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60]
    is_common = any(abs(metadata.time.frame_rate - fps) < 0.01 for fps in common_fps)
    
    if not is_common:
        return False
    
    return True


def get_processing_recommendation(metadata: MediaMetadata) -> str:
    """
    Get a human-readable processing recommendation.
    
    Args:
        metadata: Metadata to analyze
        
    Returns:
        Recommendation string
    """
    if not metadata.is_supported:
        return f"Skip: {metadata.skip_reason}"
    
    if is_editorial_friendly(metadata):
        return "Ready for editorial - no transcoding required"
    
    if metadata.codec.gop_type == GOPType.LONG_GOP:
        return "Recommend transcode to ProRes or DNx for editorial"
    
    if metadata.time.is_vfr:
        return "Recommend transcode to CFR for editorial"
    
    if metadata.warnings:
        return f"Processable with {len(metadata.warnings)} warning(s)"
    
    return "Processable"


def summarize_metadata(metadata: MediaMetadata) -> str:
    """
    Create a human-readable summary of metadata.
    
    Useful for logging and reporting.
    
    Args:
        metadata: Metadata to summarize
        
    Returns:
        Multi-line summary string
    """
    lines = [
        f"File: {metadata.identity.filename}",
        f"Path: {metadata.identity.full_path}",
        f"",
        f"Container: {metadata.codec.container}",
        f"Codec: {metadata.codec.codec_name}",
        f"Resolution: {metadata.image.width}x{metadata.image.height}",
        f"Aspect Ratio: {metadata.image.aspect_ratio}",
        f"Frame Rate: {metadata.time.frame_rate:.3f} fps",
        f"Duration: {metadata.time.duration_seconds:.2f} seconds",
    ]
    
    if metadata.image.bit_depth:
        lines.append(f"Bit Depth: {metadata.image.bit_depth} bits")
    
    if metadata.image.chroma_subsampling.value != "unknown":
        lines.append(f"Chroma: {metadata.image.chroma_subsampling.value}")
    
    if metadata.time.timecode_start:
        lines.append(f"Timecode Start: {metadata.time.timecode_start}")
    
    if metadata.audio:
        lines.append(
            f"Audio: {metadata.audio.channel_count} channels @ {metadata.audio.sample_rate} Hz"
        )
    else:
        lines.append("Audio: None")
    
    lines.append("")
    lines.append(f"GOP Type: {metadata.codec.gop_type.value}")
    lines.append(f"Supported: {metadata.is_supported}")
    
    if metadata.skip_reason:
        lines.append(f"Skip Reason: {metadata.skip_reason}")
    
    if metadata.warnings:
        lines.append("")
        lines.append("Warnings:")
        for warning in metadata.warnings:
            lines.append(f"  - {warning}")
    
    lines.append("")
    lines.append(f"Recommendation: {get_processing_recommendation(metadata)}")
    
    return "\n".join(lines)
