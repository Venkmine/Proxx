"""
Authoritative output path resolver.

Phase 16.4: Single source of truth for output paths.

Rules:
- If job.settings.output_dir is set → always use it
- Source directory fallback only if output_dir is None
- Filename MUST be resolved before this function is called
- Engines NEVER construct paths - they receive resolved paths

This module is the ONLY place where output paths are computed.
"""

from pathlib import Path
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from ..jobs.models import Job, ClipTask
    from ..jobs.settings import JobSettings
    from .resolved_params import ResolvedPresetParams


class OutputPathError(Exception):
    """Error resolving output path."""
    pass


def resolve_output_path(
    job: "Job",
    clip: "ClipTask",
    resolved_params: "ResolvedPresetParams",
    resolved_filename: str,
) -> Path:
    """
    Resolve the final output path for a clip.
    
    This is the ONLY function that should compute output paths.
    Engines must NEVER construct paths themselves.
    
    Args:
        job: Parent job with settings
        clip: ClipTask with source path
        resolved_params: Resolved preset params (for file extension)
        resolved_filename: Pre-resolved filename WITHOUT extension
                          (from naming.resolve_filename)
    
    Returns:
        Absolute Path to output file
        
    Raises:
        OutputPathError: If path cannot be resolved
        
    Rules applied:
    1. If job.settings.output_dir is set → use it
    2. If preserve_source_dirs → recreate directory structure
    3. If output_dir is None → use source file's parent
    4. Apply file prefix/suffix from settings
    5. Append file extension from resolved_params
    """
    source_path = Path(clip.source_path)
    settings = job.settings
    
    # Determine base output directory
    if settings.output_dir:
        output_dir = Path(settings.output_dir)
    else:
        # Fallback to source file's parent directory
        output_dir = source_path.parent
    
    # Handle directory structure preservation
    if settings.preserve_source_dirs and settings.preserve_dir_levels > 0:
        output_dir = _apply_directory_preservation(
            output_dir=output_dir,
            source_path=source_path,
            preserve_levels=settings.preserve_dir_levels,
        )
    
    # Build final filename with prefix/suffix
    final_filename = _apply_prefix_suffix(
        filename=resolved_filename,
        prefix=settings.file_prefix,
        suffix=settings.file_suffix,
    )
    
    # Append extension
    extension = resolved_params.file_extension
    if not extension.startswith("."):
        extension = f".{extension}"
    final_filename = f"{final_filename}{extension}"
    
    # Combine to full path
    output_path = output_dir / final_filename
    
    return output_path


def _apply_directory_preservation(
    output_dir: Path,
    source_path: Path,
    preserve_levels: int,
) -> Path:
    """
    Recreate source directory structure in output directory.
    
    Example:
        source_path = /media/project/reel_01/day_2/clip.mov
        preserve_levels = 2
        output_dir = /output
        
        Result: /output/reel_01/day_2/
        
    Args:
        output_dir: Base output directory
        source_path: Source file path
        preserve_levels: Number of parent directories to preserve
        
    Returns:
        Modified output directory with preserved structure
    """
    if preserve_levels <= 0:
        return output_dir
    
    # Get parent directories from source path
    source_parents = list(source_path.parents)
    
    # Exclude the root and the immediate parent (which contains the file)
    # We want the directories ABOVE the file's immediate parent
    # source_path.parent is the immediate parent
    # We need to extract the last N directory names
    
    # Get relative directory components
    # e.g., for /a/b/c/d/file.mov with preserve_levels=2
    # We want [c, d]
    parent_names = []
    current = source_path.parent
    for _ in range(preserve_levels):
        if current.name:  # Not root
            parent_names.insert(0, current.name)
            current = current.parent
        else:
            break
    
    # Append preserved directories to output_dir
    result = output_dir
    for name in parent_names:
        result = result / name
    
    return result


def _apply_prefix_suffix(
    filename: str,
    prefix: Optional[str],
    suffix: Optional[str],
) -> str:
    """
    Apply optional prefix and suffix to filename.
    
    Args:
        filename: Base filename without extension
        prefix: Optional prefix to prepend
        suffix: Optional suffix to append
        
    Returns:
        Modified filename
    """
    result = filename
    
    if prefix:
        result = f"{prefix}{result}"
    
    if suffix:
        result = f"{result}{suffix}"
    
    return result


def ensure_output_directory(output_path: Path) -> None:
    """
    Ensure the output directory exists.
    
    Creates all parent directories if needed.
    
    Args:
        output_path: Full path to output file
        
    Raises:
        OutputPathError: If directory cannot be created
    """
    output_dir = output_path.parent
    try:
        output_dir.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        raise OutputPathError(f"Cannot create output directory: {output_dir}: {e}")


def validate_output_path(
    job: "Job",
    clip: "ClipTask",
) -> tuple[bool, Optional[str]]:
    """
    Validate that output path can be resolved and written.
    
    Called BEFORE render starts to catch errors early.
    
    Args:
        job: Job with settings
        clip: ClipTask to validate
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    settings = job.settings
    
    # Check output directory if specified
    if settings.output_dir:
        output_dir = Path(settings.output_dir)
        
        if not output_dir.exists():
            return False, f"Output directory does not exist: {output_dir}"
        
        if not output_dir.is_dir():
            return False, f"Output path is not a directory: {output_dir}"
        
        # Test writability
        try:
            test_file = output_dir / ".proxx_write_test"
            test_file.touch()
            test_file.unlink()
        except Exception:
            return False, f"Output directory not writable: {output_dir}"
    
    # Check source path exists
    source_path = Path(clip.source_path)
    if not source_path.exists():
        return False, f"Source file does not exist: {source_path}"
    
    return True, None
