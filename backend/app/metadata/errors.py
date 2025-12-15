"""
Metadata-specific error types.

All errors inherit from MetadataError for easy catching.
Errors are explicit and provide actionable messages.
"""


class MetadataError(Exception):
    """Base exception for all metadata-related failures."""
    pass


class MetadataExtractionError(MetadataError):
    """Raised when metadata extraction fails."""
    
    def __init__(self, filepath: str, reason: str):
        self.filepath = filepath
        self.reason = reason
        super().__init__(f"Failed to extract metadata from {filepath}: {reason}")


class UnsupportedFileError(MetadataError):
    """Raised when a file is unsupported for processing."""
    
    def __init__(self, filepath: str, reason: str):
        self.filepath = filepath
        self.reason = reason
        super().__init__(f"Unsupported file {filepath}: {reason}")


class FFProbeNotFoundError(MetadataError):
    """Raised when ffprobe is not available on the system."""
    
    def __init__(self):
        super().__init__(
            "ffprobe not found. Please install ffmpeg to enable metadata extraction."
        )
