"""
Path Resolution — Complete output path generation.

This module handles the SECOND step of output path resolution:
- Combine resolved filename with folder rules
- Apply folder structure preservation
- Produce final absolute output path
- Store result on ClipTask.output_path

CRITICAL RULES:
1. Path resolution happens ONCE before render
2. Result is stored on ClipTask.output_path
3. Engines receive clip.output_path VERBATIM
4. Engines NEVER construct filenames or paths

INC-003 Fix: Collision detection is enforced. Silent overwrite is FORBIDDEN.
"""

import logging
from pathlib import Path
from typing import Optional

from .settings import DeliverSettings
from .naming import resolve_filename

logger = logging.getLogger(__name__)


class OutputCollisionError(Exception):
    """
    INC-003: Raised when output file already exists and overwrite is not allowed.
    
    Silent overwrite is FORBIDDEN. This exception forces explicit handling.
    """
    pass


def resolve_output_path(
    source_path: str,
    settings: DeliverSettings,
    preset_name: Optional[str] = None,
    job_id: Optional[str] = None,
    # Clip metadata for token resolution
    width: Optional[int] = None,
    height: Optional[int] = None,
    frame_count: Optional[int] = None,
    timecode: Optional[str] = None,
    reel_name: Optional[str] = None,
    camera: Optional[str] = None,
) -> tuple[str, str]:
    """
    Resolve complete output path for a clip.
    
    This is the PRIMARY API for path resolution.
    Call this ONCE per clip before render starts.
    Store results on ClipTask.output_filename and ClipTask.output_path.
    
    Args:
        source_path: Absolute path to source file
        settings: DeliverSettings for this job
        preset_name: Preset name for token resolution
        job_id: Job ID for token resolution
        width: Source width for tokens
        height: Source height for tokens
        frame_count: Frame count for tokens
        timecode: Timecode for tokens
        reel_name: Reel name for tokens
        camera: Camera for tokens
        
    Returns:
        (output_filename, output_path) - filename without extension and full absolute path
    """
    source = Path(source_path)
    
    # Step 1: Resolve filename from template
    output_filename = resolve_filename(
        template=settings.file.naming_template,
        source_path=source_path,
        preset_name=preset_name,
        output_codec=settings.video.codec,
        job_id=job_id,
        width=width,
        height=height,
        frame_count=frame_count,
        timecode=timecode,
        reel_name=reel_name,
        camera=camera,
        prefix=settings.file.prefix,
        suffix=settings.file.suffix,
    )
    
    # Step 2: Determine base output directory
    if settings.output_dir:
        base_dir = Path(settings.output_dir)
    else:
        # Fall back to source file's parent directory
        base_dir = source.parent
    
    # Step 3: Apply folder structure preservation
    output_dir = _apply_folder_preservation(
        base_dir=base_dir,
        source_path=source,
        preserve_source_dirs=settings.file.preserve_source_dirs,
        preserve_dir_levels=settings.file.preserve_dir_levels,
    )
    
    # Step 4: Determine file extension
    extension = settings.file.extension or settings.file.container
    
    # Step 5: Build complete output path
    output_path = output_dir / f"{output_filename}.{extension}"
    
    # Step 6: Handle overwrite policy
    output_path = _handle_overwrite(
        output_path=output_path,
        policy=settings.file.overwrite_policy.value,
    )
    
    return output_filename, str(output_path)


def _apply_folder_preservation(
    base_dir: Path,
    source_path: Path,
    preserve_source_dirs: bool,
    preserve_dir_levels: int,
) -> Path:
    """
    Apply folder structure preservation rules.
    
    Examples:
        source: /volumes/media/project/day1/cam_a/clip.mov
        base_dir: /output
        
        preserve_source_dirs=False → /output
        preserve_source_dirs=True, levels=0 → /output (same as False)
        preserve_source_dirs=True, levels=1 → /output/cam_a
        preserve_source_dirs=True, levels=2 → /output/day1/cam_a
    """
    if not preserve_source_dirs or preserve_dir_levels <= 0:
        return base_dir
    
    # Get parent directories from source path
    # source_path.parent gives us the directory containing the file
    parents = list(source_path.parent.parts)
    
    # Take the last N levels
    preserved_parts = parents[-preserve_dir_levels:] if len(parents) >= preserve_dir_levels else parents
    
    # Build preserved path
    if preserved_parts:
        return base_dir / Path(*preserved_parts)
    
    return base_dir


def _handle_overwrite(output_path: Path, policy: str) -> Path:
    """
    Handle file overwrite policy.
    
    For NEVER and ASK policies, this is just a check.
    For INCREMENT, this finds a unique filename.
    For ALWAYS, this returns the path unchanged.
    
    INC-003 Fix: NEVER policy now raises OutputCollisionError instead of
    silently returning the path. Silent overwrite is FORBIDDEN.
    """
    if policy == "always":
        return output_path
    
    if not output_path.exists():
        return output_path
    
    if policy == "never":
        # INC-003: Silent overwrite is FORBIDDEN
        # Raise an exception so the task fails with a clear message
        raise OutputCollisionError(
            f"Output file already exists: {output_path}. "
            f"Change overwrite policy to 'increment' or 'always' to proceed, "
            f"or use a different output directory."
        )
    
    if policy == "ask":
        # INC-003: Treat as failure - UI must resolve before render
        raise OutputCollisionError(
            f"Output file exists and requires confirmation: {output_path}. "
            f"Choose 'always' to overwrite or 'increment' to auto-suffix."
        )
    
    if policy == "increment":
        return _find_unique_path(output_path)
    
    return output_path


def _find_unique_path(path: Path) -> Path:
    """
    Find a unique path by adding numeric suffix.
    
    file.mov → file_001.mov → file_002.mov → ...
    """
    if not path.exists():
        return path
    
    stem = path.stem
    suffix = path.suffix
    parent = path.parent
    
    counter = 1
    while counter < 10000:  # Safety limit
        new_name = f"{stem}_{counter:03d}{suffix}"
        new_path = parent / new_name
        if not new_path.exists():
            return new_path
        counter += 1
    
    # Fallback with timestamp
    import time
    ts = int(time.time())
    return parent / f"{stem}_{ts}{suffix}"


def ensure_output_directory(output_path: str) -> None:
    """
    Ensure the output directory exists.
    
    Creates parent directories as needed.
    Call this just before render starts.
    """
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
