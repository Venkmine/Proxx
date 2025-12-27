"""
Concrete category preset schemas.

Each schema defines validation rules for a specific preset category.
These are strict, deterministic, and reject invalid configurations.

Phase 2 implements representative examples only:
- CodecPreset: Output codec configuration
- ScalingPreset: Resolution and scaling behavior
- WatermarkPreset: Watermark application rules

Additional categories will be defined as needed in future phases.
"""

from enum import Enum
from typing import Optional
from pydantic import field_validator, ConfigDict
from .models import CategoryPreset, PresetCategory


# ============================================================================
# CODEC PRESET
# ============================================================================

class CodecType(str, Enum):
    """
    Supported output codecs.
    
    Based on DECISIONS.md:
    - ProRes, DNxHR, and DNxHD are supported
    - Intra-frame codecs are editorial defaults
    """
    
    PRORES_PROXY = "prores_proxy"
    PRORES_LT = "prores_lt"
    PRORES_422 = "prores_422"
    PRORES_422_HQ = "prores_422_hq"
    DNXHR_LB = "dnxhr_lb"
    DNXHR_SQ = "dnxhr_sq"
    DNXHR_HQ = "dnxhr_hq"
    DNXHD_36 = "dnxhd_36"
    DNXHD_145 = "dnxhd_145"
    DNXHD_220 = "dnxhd_220"


class CodecPreset(CategoryPreset):
    """
    Codec output configuration.
    
    Defines the output codec and container format.
    No frame rate or resolution—those are separate concerns.
    """
    
    model_config = ConfigDict(extra="forbid", use_enum_values=True)
    
    category: PresetCategory = PresetCategory.CODEC
    codec: CodecType
    container: str  # e.g., "mov", "mxf"
    
    @field_validator("container")
    @classmethod
    def validate_container(cls, v: str) -> str:
        """Container must be non-empty and lowercase."""
        if not v or not v.strip():
            raise ValueError("Container cannot be empty")
        v = v.strip().lower()
        # Allowed containers per CONTAINER_CODEC_MAP in codec_specs.py
        allowed = {"mov", "mxf", "mp4"}
        if v not in allowed:
            raise ValueError(f"Container must be one of: {', '.join(sorted(allowed))}")
        return v


# ============================================================================
# SCALING PRESET
# ============================================================================

class ScalingMode(str, Enum):
    """
    Scaling behavior options.
    """
    
    NONE = "none"  # No scaling, preserve source resolution
    FIT = "fit"  # Fit within target resolution, maintain aspect ratio
    FILL = "fill"  # Fill target resolution, crop if needed
    STRETCH = "stretch"  # Stretch to exact target resolution


class ScalingPreset(CategoryPreset):
    """
    Resolution and scaling behavior.
    
    Defines target resolution and how to scale/fit source media.
    """
    
    model_config = ConfigDict(extra="forbid", use_enum_values=True)
    
    category: PresetCategory = PresetCategory.SCALING
    mode: ScalingMode
    target_width: Optional[int] = None
    target_height: Optional[int] = None
    
    @field_validator("target_width", "target_height")
    @classmethod
    def validate_dimensions(cls, v: Optional[int]) -> Optional[int]:
        """Dimensions must be positive if provided."""
        if v is not None and v <= 0:
            raise ValueError("Dimensions must be positive")
        return v
    
    def model_post_init(self, __context) -> None:
        """
        Validate cross-field constraints.
        
        If mode is not NONE, target dimensions must be provided.
        """
        if self.mode != ScalingMode.NONE:
            if self.target_width is None or self.target_height is None:
                raise ValueError(
                    f"Scaling mode '{self.mode.value}' requires target_width and target_height"
                )


# ============================================================================
# WATERMARK PRESET
# ============================================================================

class WatermarkPosition(str, Enum):
    """
    Watermark placement options.
    """
    
    TOP_LEFT = "top_left"
    TOP_RIGHT = "top_right"
    BOTTOM_LEFT = "bottom_left"
    BOTTOM_RIGHT = "bottom_right"
    CENTER = "center"


class WatermarkPreset(CategoryPreset):
    """
    Watermark application rules.
    
    Defines whether to apply a watermark and where to place it.
    Does not specify the watermark content—that's runtime data.
    """
    
    model_config = ConfigDict(extra="forbid", use_enum_values=True)
    
    category: PresetCategory = PresetCategory.WATERMARK
    enabled: bool
    position: Optional[WatermarkPosition] = None
    opacity: float = 1.0
    
    @field_validator("opacity")
    @classmethod
    def validate_opacity(cls, v: float) -> float:
        """Opacity must be between 0.0 and 1.0."""
        if not 0.0 <= v <= 1.0:
            raise ValueError("Opacity must be between 0.0 and 1.0")
        return v
    
    def model_post_init(self, __context) -> None:
        """
        Validate cross-field constraints.
        
        If enabled, position must be specified.
        """
        if self.enabled and self.position is None:
            raise ValueError("Watermark position must be specified when enabled")


# ============================================================================
# STUB PRESETS FOR REMAINING CATEGORIES
# ============================================================================

class NamingPreset(CategoryPreset):
    """
    Naming convention configuration.
    
    Phase 2 stub: minimal implementation to demonstrate category structure.
    Full implementation deferred to later phases.
    """
    
    model_config = ConfigDict(extra="forbid", use_enum_values=True)
    
    category: PresetCategory = PresetCategory.NAMING
    pattern: str  # e.g., "{source_name}_{codec}_{resolution}"
    
    @field_validator("pattern")
    @classmethod
    def validate_pattern(cls, v: str) -> str:
        """Pattern must be non-empty."""
        if not v or not v.strip():
            raise ValueError("Pattern cannot be empty")
        return v


class FolderOutputPreset(CategoryPreset):
    """
    Folder output configuration.
    
    Phase 2 stub: minimal implementation to demonstrate category structure.
    Full implementation deferred to later phases.
    """
    
    model_config = ConfigDict(extra="forbid", use_enum_values=True)
    
    category: PresetCategory = PresetCategory.FOLDER_OUTPUT
    use_subdirectories: bool = False


class ExclusionsPreset(CategoryPreset):
    """
    File exclusion rules.
    
    Phase 2 stub: minimal implementation to demonstrate category structure.
    Full implementation deferred to later phases.
    """
    
    model_config = ConfigDict(extra="forbid", use_enum_values=True)
    
    category: PresetCategory = PresetCategory.EXCLUSIONS
    skip_hidden_files: bool = True


class DuplicatesPreset(CategoryPreset):
    """
    Duplicate handling configuration.
    
    Phase 2 stub: minimal implementation to demonstrate category structure.
    Full implementation deferred to later phases.
    """
    
    model_config = ConfigDict(extra="forbid", use_enum_values=True)
    
    category: PresetCategory = PresetCategory.DUPLICATES
    overwrite_existing: bool = False


class QueuePreset(CategoryPreset):
    """
    Queue behavior configuration.
    
    Phase 2 stub: minimal implementation to demonstrate category structure.
    Full implementation deferred to later phases.
    """
    
    model_config = ConfigDict(extra="forbid", use_enum_values=True)
    
    category: PresetCategory = PresetCategory.QUEUE
    parallel_jobs: int = 1
    
    @field_validator("parallel_jobs")
    @classmethod
    def validate_parallel_jobs(cls, v: int) -> int:
        """Parallel jobs must be positive."""
        if v <= 0:
            raise ValueError("Parallel jobs must be positive")
        return v


class ReportingPreset(CategoryPreset):
    """
    Reporting configuration.
    
    Phase 2 stub: minimal implementation to demonstrate category structure.
    Full implementation deferred to later phases.
    """
    
    model_config = ConfigDict(extra="forbid", use_enum_values=True)
    
    category: PresetCategory = PresetCategory.REPORTING
    generate_summary: bool = True
