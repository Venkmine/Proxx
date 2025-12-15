"""
Output path generation for rendered clips.

Generates output file paths from metadata and preset configurations.

Phase 6: Stub pattern implementation.
Pattern: {source_name}_{codec}.{ext}

Full pattern engine with variables deferred to Phase 7+.
"""

import re
from pathlib import Path
from typing import Optional

from ..metadata.models import MediaMetadata
from ..presets.schemas import CodecPreset


def _sanitize_filename(name: str) -> str:
    """
    Sanitize a filename component.
    
    Removes or replaces characters that are invalid on most filesystems.
    
    Args:
        name: Raw filename component
        
    Returns:
        Sanitized filename safe for filesystem use
    """
    # Replace invalid characters with underscore
    invalid_chars = r'[<>:"/\\|?*\x00-\x1f]'
    sanitized = re.sub(invalid_chars, "_", name)
    
    # Remove leading/trailing spaces and dots
    sanitized = sanitized.strip(". ")
    
    # Ensure non-empty
    if not sanitized:
        sanitized = "output"
    
    return sanitized


def _get_file_extension(codec_preset: CodecPreset) -> str:
    """
    Get file extension for codec and container combination.
    
    Args:
        codec_preset: Codec preset with codec and container
        
    Returns:
        File extension without leading dot (e.g., "mov", "mxf")
    """
    # Phase 6: Simple mapping
    container = codec_preset.container.lower()
    
    if container in ("mov", "mxf", "mp4"):
        return container
    
    # Default to mov
    return "mov"


def generate_output_path(
    source_path: Path,
    output_dir: Path,
    codec_preset: CodecPreset,
    metadata: Optional[MediaMetadata] = None,
) -> Path:
    """
    Generate output file path for rendered clip.
    
    Phase 6 implementation uses stub pattern: {source_name}_{codec}.{ext}
    
    Future phases will support full pattern syntax with variables like:
    - {source_name}
    - {resolution}
    - {codec}
    - {date}
    - {timecode}
    etc.
    
    Args:
        source_path: Absolute path to source media file
        output_dir: Directory where output should be written
        codec_preset: Codec preset defining output format
        metadata: Optional metadata (unused in Phase 6 stub)
        
    Returns:
        Absolute path to output file
        
    Example:
        source_path = Path("/media/clip001.mov")
        output_dir = Path("/output")
        codec = "prores_proxy"
        
        Returns: Path("/output/clip001_prores_proxy.mov")
    """
    
    # Extract source name without extension
    source_name = source_path.stem
    source_name_safe = _sanitize_filename(source_name)
    
    # Get codec identifier
    codec_name = codec_preset.codec.value
    codec_name_safe = _sanitize_filename(codec_name)
    
    # Get extension
    extension = _get_file_extension(codec_preset)
    
    # Phase 6 stub pattern: {source_name}_{codec}.{ext}
    output_filename = f"{source_name_safe}_{codec_name_safe}.{extension}"
    
    # Construct full path
    output_path = output_dir / output_filename
    
    return output_path


def ensure_output_directory(output_path: Path) -> None:
    """
    Ensure output directory exists.
    
    Creates parent directories if they don't exist.
    
    Args:
        output_path: Path to output file
        
    Raises:
        OSError: If directory cannot be created
        PermissionError: If permission denied
    """
    output_dir = output_path.parent
    output_dir.mkdir(parents=True, exist_ok=True)


def handle_output_collision(
    output_path: Path,
    overwrite_existing: bool = False,
) -> Path:
    """
    Handle output file collision.
    
    If output file already exists:
    - If overwrite_existing is True, return original path (will overwrite)
    - If overwrite_existing is False, generate unique path with suffix
    
    Args:
        output_path: Desired output path
        overwrite_existing: Whether to overwrite existing files
        
    Returns:
        Final output path (original or with suffix)
    """
    if not output_path.exists():
        return output_path
    
    if overwrite_existing:
        return output_path
    
    # Generate unique path with suffix
    base = output_path.stem
    extension = output_path.suffix
    parent = output_path.parent
    
    counter = 1
    while True:
        new_name = f"{base}_{counter:03d}{extension}"
        new_path = parent / new_name
        
        if not new_path.exists():
            return new_path
        
        counter += 1
        
        # Safety limit
        if counter > 999:
            raise RuntimeError(
                f"Cannot generate unique output path: too many collisions at {output_path}"
            )
