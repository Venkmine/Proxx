"""
Metadata data models.

Represents all extracted metadata from source media files.
All models use Pydantic for validation.
Unknown or missing values are explicitly represented as Optional or None.
No silent guessing.
"""

from enum import Enum
from typing import Optional
from pathlib import Path
from pydantic import BaseModel, ConfigDict, field_validator


class ChromaSubsampling(str, Enum):
    """Chroma subsampling format."""
    
    YUV_420 = "4:2:0"
    YUV_422 = "4:2:2"
    YUV_444 = "4:4:4"
    UNKNOWN = "unknown"


class GOPType(str, Enum):
    """GOP structure type."""
    
    INTRA = "intra"  # All I-frames (ProRes, DNx)
    LONG_GOP = "long_gop"  # Mix of I/B/P frames
    UNKNOWN = "unknown"


class MediaIdentity(BaseModel):
    """
    Identity metadata: what and where the file is.
    
    Always present. Derived from filesystem.
    """
    
    model_config = ConfigDict(extra="forbid")
    
    filename: str
    full_path: str
    parent_folder: str
    
    @field_validator("filename", "full_path", "parent_folder")
    @classmethod
    def validate_non_empty(cls, v: str) -> str:
        """Fields must be non-empty."""
        if not v or not v.strip():
            raise ValueError("Identity fields cannot be empty")
        return v


class MediaTime(BaseModel):
    """
    Time-related metadata: duration, frame rate, timecode.
    
    Duration and frame rate are always extracted.
    Timecode may be absent (None).
    """
    
    model_config = ConfigDict(extra="forbid")
    
    duration_seconds: float
    frame_rate: float
    timecode_start: Optional[str] = None  # e.g., "01:00:00:00"
    drop_frame: bool = False
    is_vfr: bool = False  # Variable frame rate flag
    
    @field_validator("duration_seconds", "frame_rate")
    @classmethod
    def validate_positive(cls, v: float) -> float:
        """Duration and frame rate must be positive."""
        if v <= 0:
            raise ValueError("Duration and frame rate must be positive")
        return v


class MediaImage(BaseModel):
    """
    Image metadata: resolution, aspect ratio, bit depth, chroma.
    
    Resolution is always extracted.
    Bit depth and chroma may be unknown.
    """
    
    model_config = ConfigDict(extra="forbid")
    
    width: int
    height: int
    aspect_ratio: str  # e.g., "16:9", "1.85:1"
    bit_depth: Optional[int] = None
    chroma_subsampling: ChromaSubsampling = ChromaSubsampling.UNKNOWN
    
    @field_validator("width", "height")
    @classmethod
    def validate_positive(cls, v: int) -> int:
        """Resolution must be positive."""
        if v <= 0:
            raise ValueError("Resolution must be positive")
        return v
    
    @field_validator("aspect_ratio")
    @classmethod
    def validate_aspect_ratio(cls, v: str) -> str:
        """Aspect ratio must be non-empty."""
        if not v or not v.strip():
            raise ValueError("Aspect ratio cannot be empty")
        return v


class MediaCodec(BaseModel):
    """
    Codec and container metadata.
    
    Container and codec name are always extracted.
    Profile, level, and GOP type may be unknown.
    """
    
    model_config = ConfigDict(extra="forbid")
    
    container: str  # e.g., "mov", "mxf", "mp4"
    codec_name: str  # e.g., "prores", "h264", "dnxhd"
    profile: Optional[str] = None  # e.g., "High 4:2:2", "Main"
    level: Optional[str] = None
    gop_type: GOPType = GOPType.UNKNOWN
    
    @field_validator("container", "codec_name")
    @classmethod
    def validate_non_empty(cls, v: str) -> str:
        """Container and codec must be non-empty."""
        if not v or not v.strip():
            raise ValueError("Container and codec name cannot be empty")
        return v.lower()


class MediaAudio(BaseModel):
    """
    Audio metadata: channels and sample rate.
    
    May be absent if no audio tracks exist (None).
    When present, both fields are required.
    """
    
    model_config = ConfigDict(extra="forbid")
    
    channel_count: int
    sample_rate: int  # Hz
    
    @field_validator("channel_count", "sample_rate")
    @classmethod
    def validate_positive(cls, v: int) -> int:
        """Channel count and sample rate must be positive."""
        if v <= 0:
            raise ValueError("Channel count and sample rate must be positive")
        return v


class MetadataProvenance(str, Enum):
    """
    Phase 12: Source of metadata extraction.
    
    Tells the user where this metadata came from so they know what to trust.
    """
    
    FFPROBE = "ffprobe"      # Container-level metadata from ffprobe
    RESOLVE = "resolve"      # Full RAW decode via DaVinci Resolve
    EXIFTOOL = "exiftool"    # Embedded metadata via exiftool
    SIDECAR = "sidecar"      # External sidecar file (.xmp, etc.)
    UNKNOWN = "unknown"      # Source could not be determined


class MetadataCompleteness(str, Enum):
    """
    Phase 12: Completeness indicator for metadata.
    
    Tells the user whether they have full metadata or limited info.
    """
    
    COMPLETE = "complete"    # Full metadata available
    LIMITED = "limited"      # Some fields unavailable (e.g., RAW without Resolve)
    MINIMAL = "minimal"      # Only basic file info available


class MediaMetadata(BaseModel):
    """
    Complete metadata for a single media file.
    
    Aggregates all metadata groups.
    Includes workflow flags for processing decisions.
    """
    
    model_config = ConfigDict(extra="forbid")
    
    identity: MediaIdentity
    time: MediaTime
    image: MediaImage
    codec: MediaCodec
    audio: Optional[MediaAudio] = None
    
    # Workflow flags
    is_supported: bool
    skip_reason: Optional[str] = None  # Human-readable explanation if unsupported
    warnings: list[str] = []  # Non-blocking warnings (VFR, unusual bit depth, etc.)
    
    # Phase 12: Provenance tracking
    provenance: MetadataProvenance = MetadataProvenance.FFPROBE
    completeness: MetadataCompleteness = MetadataCompleteness.COMPLETE
    completeness_reason: Optional[str] = None  # Why metadata is limited
    
    def add_warning(self, warning: str) -> None:
        """Add a validation warning."""
        if warning and warning not in self.warnings:
            self.warnings.append(warning)
    
    def mark_limited(self, reason: str) -> None:
        """Mark metadata as limited with explanation."""
        self.completeness = MetadataCompleteness.LIMITED
        self.completeness_reason = reason
    
    def mark_minimal(self, reason: str) -> None:
        """Mark metadata as minimal with explanation."""
        self.completeness = MetadataCompleteness.MINIMAL
        self.completeness_reason = reason
