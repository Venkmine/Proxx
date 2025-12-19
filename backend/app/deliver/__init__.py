"""
Deliver module: Canonical capability model for render outputs.

This module is the SINGLE SOURCE OF TRUTH for all deliver functionality.
If something is not expressible here, it does not exist in Proxx.

Architecture:
- capabilities.py: Pure data models (engine-agnostic)
- settings.py: DeliverSettings composed from capabilities
- engine_mapping.py: Translate capabilities → engine-specific arguments
- naming.py: Token-based filename resolution
- paths.py: Output path resolution

Engine rules:
- Engines ONLY receive resolved DeliverSettings
- Engines ONLY receive resolved clip.output_path
- Engines NEVER read UI state
- Engines NEVER infer or guess
"""

from .capabilities import (
    # Video
    VideoCapabilities,
    ResolutionPolicy,
    FrameRatePolicy,
    FieldOrder,
    ColorSpace,
    DataLevels,
    
    # Audio
    AudioCapabilities,
    AudioCodec,
    AudioChannelLayout,
    
    # File
    FileCapabilities,
    OverwritePolicy,
    
    # Metadata
    MetadataCapabilities,
    
    # Overlays
    OverlayCapabilities,
    TextOverlay,
    TextPosition,
)

from .settings import (
    DeliverSettings,
    DEFAULT_DELIVER_SETTINGS,
)

__all__ = [
    # Video
    "VideoCapabilities",
    "ResolutionPolicy",
    "FrameRatePolicy",
    "FieldOrder",
    "ColorSpace",
    "DataLevels",
    
    # Audio
    "AudioCapabilities",
    "AudioCodec",
    "AudioChannelLayout",
    
    # File
    "FileCapabilities",
    "OverwritePolicy",
    
    # Metadata
    "MetadataCapabilities",
    
    # Overlays
    "OverlayCapabilities",
    "TextOverlay",
    "TextPosition",
    
    # Settings
    "DeliverSettings",
    "DEFAULT_DELIVER_SETTINGS",
]
