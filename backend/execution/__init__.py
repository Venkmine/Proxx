"""
Execution utilities and capabilities detection.
"""

from execution.ffmpegCapabilities import (
    detect_ffmpeg_capabilities,
    FFmpegCapabilitiesError,
)

__all__ = [
    "detect_ffmpeg_capabilities",
    "FFmpegCapabilitiesError",
]
