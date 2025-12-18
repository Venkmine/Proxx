"""
Resolved preset parameters for execution engines.

This module defines the clean boundary between preset resolution and engine execution.
Engines receive ONLY ResolvedPresetParams - never CategoryPreset or GlobalPreset objects.

This is a HARD RULE:
- CategoryPreset is UI-only
- GlobalPreset is a reference structure
- ResolvedPresetParams is what engines consume

If a CategoryPreset reaches an engine, it is a fatal EngineValidationError.
"""

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class ResolvedPresetParams:
    """
    Fully resolved preset parameters for engine execution.
    
    This is an immutable, flat structure containing all values
    an engine needs to execute a transcode. No references to
    CategoryPreset or GlobalPreset objects.
    
    Engines ONLY receive this type. Period.
    """
    
    # Preset identity (for logging and UI display)
    preset_id: str
    preset_name: str
    
    # Codec settings
    video_codec: str  # e.g., "h264", "prores_422", "dnxhr_hq"
    container: str  # e.g., "mp4", "mov", "mxf"
    
    # Video encoding parameters
    video_bitrate: Optional[str] = None  # e.g., "20M", None for CRF/quality-based
    video_quality: Optional[int] = None  # CRF value for H.264/H.265 (0-51, lower = better)
    video_preset: Optional[str] = None  # Encoder preset (e.g., "medium", "fast")
    
    # Audio settings
    audio_codec: str = "copy"  # "copy", "aac", "pcm_s16le", etc.
    audio_bitrate: Optional[str] = None  # e.g., "192k"
    audio_sample_rate: Optional[int] = None  # e.g., 48000
    
    # Scaling settings
    scale_mode: str = "none"  # "none", "fit", "fill", "stretch"
    target_width: Optional[int] = None
    target_height: Optional[int] = None
    
    # File extension (derived from container)
    @property
    def file_extension(self) -> str:
        """Get file extension from container format."""
        return self.container.lower()


# Default H.264/AAC preset for baseline transcoding
DEFAULT_H264_PARAMS = ResolvedPresetParams(
    preset_id="default_h264",
    preset_name="H.264 Default",
    video_codec="h264",
    container="mp4",
    video_quality=23,  # CRF 23 (good quality, reasonable size)
    video_preset="medium",
    audio_codec="aac",
    audio_bitrate="192k",
)
