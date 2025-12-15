"""
Metadata extraction and validation system for Proxx.

This module provides read-only metadata extraction from media files.
Extraction is non-destructive and uses ffprobe.

Phase 3 scope:
- Extract identity, time, image, codec, and audio metadata
- Validate metadata and flag unsupported files
- Produce human-readable warnings
- No persistence, transcoding, or Resolve integration

Usage:
    from app.metadata import extract_metadata, summarize_metadata
    
    metadata = extract_metadata("/path/to/file.mov")
    print(summarize_metadata(metadata))
"""

from .errors import (
    MetadataError,
    MetadataExtractionError,
    UnsupportedFileError,
    FFProbeNotFoundError,
)
from .models import (
    MediaMetadata,
    MediaIdentity,
    MediaTime,
    MediaImage,
    MediaCodec,
    MediaAudio,
    ChromaSubsampling,
    GOPType,
)
from .extractors import (
    extract_metadata,
    check_ffprobe_available,
)
from .validators import (
    validate_metadata,
    is_editorial_friendly,
    get_processing_recommendation,
    summarize_metadata,
)

__all__ = [
    # Errors
    "MetadataError",
    "MetadataExtractionError",
    "UnsupportedFileError",
    "FFProbeNotFoundError",
    # Models
    "MediaMetadata",
    "MediaIdentity",
    "MediaTime",
    "MediaImage",
    "MediaCodec",
    "MediaAudio",
    "ChromaSubsampling",
    "GOPType",
    # Extraction
    "extract_metadata",
    "check_ffprobe_available",
    # Validation
    "validate_metadata",
    "is_editorial_friendly",
    "get_processing_recommendation",
    "summarize_metadata",
]
