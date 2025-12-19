"""
Deliver Capability Models — Pure Data, Engine-Agnostic.

This module defines the canonical capability model for all render outputs.
These are PURE DATA MODELS with NO engine-specific content.

CRITICAL RULES:
1. No FFmpeg flags or Resolve-specific options in these models
2. All engine-specific interpretation happens ONLY in engine_mapping.py
3. These models represent WHAT to do, not HOW to do it
4. All fields have explicit defaults — no silent guessing

If a capability cannot be mapped to an engine:
- Emit an explicit warning
- Do not guess or silently coerce values
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, List


# ============================================================================
# VIDEO CAPABILITIES
# ============================================================================

class ResolutionPolicy(str, Enum):
    """How to determine output resolution."""
    SOURCE = "source"      # Use source resolution
    SCALE = "scale"        # Scale to target (fit/fill/stretch)
    CUSTOM = "custom"      # Explicit width/height


class ScalingFilter(str, Enum):
    """Scaling algorithm preference (engine interprets appropriately)."""
    AUTO = "auto"          # Engine default
    BILINEAR = "bilinear"  # Fast, reasonable quality
    BICUBIC = "bicubic"    # Better quality, slower
    LANCZOS = "lanczos"    # High quality, slowest
    NEAREST = "nearest"    # No interpolation (for pixel art)


class FrameRatePolicy(str, Enum):
    """How to determine output frame rate."""
    SOURCE = "source"  # Match source frame rate
    FORCE = "force"    # Force to specific frame rate


class FieldOrder(str, Enum):
    """Video field order for interlaced content."""
    PROGRESSIVE = "progressive"
    TOP_FIRST = "top_first"
    BOTTOM_FIRST = "bottom_first"


class ColorSpace(str, Enum):
    """Color space specification."""
    SOURCE = "source"          # Preserve source
    REC709 = "rec709"          # HD standard
    REC2020 = "rec2020"        # UHD/HDR
    P3D65 = "p3d65"            # DCI-P3 D65
    SRGB = "srgb"              # Web/computer
    ACESCE = "acesce"          # ACES Color Encoding


class GammaTransfer(str, Enum):
    """Gamma/transfer function."""
    SOURCE = "source"
    SDR = "sdr"                # Standard BT.1886/2.4
    HLG = "hlg"                # Hybrid Log-Gamma
    PQ = "pq"                  # Perceptual Quantizer (HDR10)
    LINEAR = "linear"          # Linear (ACES workflows)


class DataLevels(str, Enum):
    """Video data levels."""
    SOURCE = "source"
    VIDEO = "video"            # 16-235 (broadcast safe)
    FULL = "full"              # 0-255


@dataclass(frozen=True)
class VideoCapabilities:
    """
    Video output capabilities — pure data, engine-agnostic.
    
    Represents WHAT the output video should be, not HOW to encode it.
    Engine mapping translates these to encoder-specific commands.
    """
    
    # Codec identification (engine maps to specific encoder)
    codec: str = "prores_422"  # e.g., "prores_422", "dnxhr_hq", "h264"
    
    # Codec profile/level (engine interprets per codec)
    profile: Optional[str] = None  # e.g., "main", "high", "422_hq"
    level: Optional[str] = None    # e.g., "4.1", "5.0"
    
    # Pixel format preference
    pixel_format: Optional[str] = None  # e.g., "yuv422p10le"
    
    # Resolution handling
    resolution_policy: ResolutionPolicy = ResolutionPolicy.SOURCE
    width: Optional[int] = None
    height: Optional[int] = None
    scaling_filter: ScalingFilter = ScalingFilter.AUTO
    
    # Frame rate handling
    frame_rate_policy: FrameRatePolicy = FrameRatePolicy.SOURCE
    frame_rate: Optional[str] = None  # e.g., "24000/1001", "25/1"
    
    # Field handling
    field_order: FieldOrder = FieldOrder.PROGRESSIVE
    
    # Color handling
    color_space: ColorSpace = ColorSpace.SOURCE
    gamma: GammaTransfer = GammaTransfer.SOURCE
    data_levels: DataLevels = DataLevels.SOURCE
    
    # HDR metadata passthrough
    hdr_metadata_passthrough: bool = True
    
    # Quality control (engine interprets per codec)
    quality: Optional[int] = None      # CRF or similar (lower = better)
    bitrate: Optional[str] = None      # e.g., "50M"
    preset: Optional[str] = None       # Speed/quality tradeoff


# ============================================================================
# AUDIO CAPABILITIES
# ============================================================================

class AudioCodec(str, Enum):
    """Supported audio codecs."""
    COPY = "copy"              # Passthrough (no transcode)
    AAC = "aac"                # AAC-LC
    PCM_S16LE = "pcm_s16le"    # 16-bit PCM
    PCM_S24LE = "pcm_s24le"    # 24-bit PCM
    PCM_S32LE = "pcm_s32le"    # 32-bit PCM
    AC3 = "ac3"                # Dolby Digital
    EAC3 = "eac3"              # Dolby Digital Plus


class AudioChannelLayout(str, Enum):
    """Audio channel layout."""
    SOURCE = "source"          # Preserve source layout
    MONO = "mono"              # 1.0
    STEREO = "stereo"          # 2.0
    SURROUND_51 = "5.1"        # 5.1 surround
    SURROUND_71 = "7.1"        # 7.1 surround


@dataclass(frozen=True)
class AudioCapabilities:
    """
    Audio output capabilities — pure data, engine-agnostic.
    """
    
    # Codec
    codec: AudioCodec = AudioCodec.COPY
    
    # Encoding parameters
    bitrate: Optional[str] = None      # e.g., "192k", "320k"
    
    # Channel handling
    channels: Optional[int] = None     # Explicit channel count
    layout: AudioChannelLayout = AudioChannelLayout.SOURCE
    
    # Sample rate
    sample_rate: Optional[int] = None  # e.g., 48000, 96000
    
    # Audio passthrough (overrides all other audio settings)
    # When True, copy audio streams without modification
    passthrough: bool = False


# ============================================================================
# FILE CAPABILITIES
# ============================================================================

class OverwritePolicy(str, Enum):
    """How to handle existing output files."""
    NEVER = "never"            # Fail if file exists
    ALWAYS = "always"          # Always overwrite
    ASK = "ask"                # Prompt operator (UI handles)
    INCREMENT = "increment"    # Add numeric suffix (_001, _002)


@dataclass(frozen=True)
class FileCapabilities:
    """
    File output capabilities — container, naming, folder structure.
    """
    
    # Container format
    container: str = "mov"     # e.g., "mov", "mxf", "mp4"
    extension: Optional[str] = None  # Override extension (usually derived from container)
    
    # Naming
    naming_template: str = "{source_name}__proxx"
    prefix: Optional[str] = None
    suffix: Optional[str] = None
    
    # Overwrite behavior
    overwrite_policy: OverwritePolicy = OverwritePolicy.NEVER
    
    # Folder structure preservation
    preserve_source_dirs: bool = False
    preserve_dir_levels: int = 0  # How many levels to preserve from source path


# ============================================================================
# METADATA CAPABILITIES — ALL DEFAULTS ON
# ============================================================================

@dataclass(frozen=True)
class MetadataCapabilities:
    """
    Metadata passthrough capabilities.
    
    ALL passthrough defaults are ON. This is editor-trust-critical.
    If metadata cannot be preserved, the engine MUST log a warning.
    Silent metadata loss is a bug.
    
    strip_all_metadata: Override flag that ignores all passthrough settings
    and explicitly removes metadata. UI must label this as DESTRUCTIVE.
    """
    
    # Master override: when True, ALL metadata is stripped
    # This ignores all passthrough flags below
    strip_all_metadata: bool = False
    
    # Individual passthrough controls (all default ON)
    passthrough_all_container_metadata: bool = True
    passthrough_timecode: bool = True
    passthrough_reel_name: bool = True
    passthrough_camera_metadata: bool = True
    passthrough_color_metadata: bool = True


# ============================================================================
# OVERLAY CAPABILITIES — TEXT ONLY (Phase 1)
# ============================================================================

class TextPosition(str, Enum):
    """Text overlay position presets."""
    TOP_LEFT = "top_left"
    TOP_CENTER = "top_center"
    TOP_RIGHT = "top_right"
    BOTTOM_LEFT = "bottom_left"
    BOTTOM_CENTER = "bottom_center"
    BOTTOM_RIGHT = "bottom_right"
    CENTER = "center"


@dataclass(frozen=True)
class TextOverlay:
    """
    Single text overlay layer.
    
    Supports metadata tokens that resolve at render time:
    - {timecode} — Source timecode
    - {filename} — Source filename
    - {reel} — Reel/tape name
    - {frame} — Frame number
    - {date} — Render date
    - {job_name} — Job name
    
    Phase 1 scope:
    - Fixed positional presets only
    - Fixed font defaults
    - NO image overlays
    - NO safe guides
    - NO custom styling beyond position
    """
    
    # Text content (with token support)
    text: str
    
    # Position
    position: TextPosition = TextPosition.BOTTOM_LEFT
    
    # Basic styling (engine interprets with sensible defaults)
    font_size: int = 24
    opacity: float = 1.0  # 0.0 - 1.0
    
    # Enable/disable
    enabled: bool = True


@dataclass(frozen=True)
class OverlayCapabilities:
    """
    Overlay capabilities — Phase 1: Text only.
    
    Explicitly deferred to future phases:
    - Image overlays (PNG/TIFF/JPG)
    - Safe guides (action safe, title safe)
    - Custom font selection
    - Custom positioning (x, y coordinates)
    - Layer ordering
    """
    
    # Text overlays (rendered in order)
    text_layers: tuple[TextOverlay, ...] = ()
    
    # Future (Phase 2+): Image overlays
    # image_layers: tuple[ImageOverlay, ...] = ()
    
    # Future (Phase 2+): Safe guides
    # safe_guides_enabled: bool = False
    # action_safe_percent: float = 0.9
    # title_safe_percent: float = 0.8
