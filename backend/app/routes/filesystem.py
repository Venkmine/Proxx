"""
Filesystem browsing API for directory navigator.

Phase 4A: Provides safe directory listing for Sources panel.

Security constraints:
- Path normalization to prevent traversal attacks
- Restrict to user-accessible directories
- Filter to supported media types only for files

Image Sequence Detection:
- Detects numbered image sequences (DPX, EXR, TIFF, etc.)
- Groups sequences into single logical clip
- Returns pattern-based path (e.g., /path/to/clip.%06d.exr)
"""

import os
import re
import logging
from pathlib import Path
from typing import List, Optional, Dict, Tuple
from collections import defaultdict
from pydantic import BaseModel, ConfigDict
from fastapi import APIRouter, HTTPException, Query

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/filesystem", tags=["filesystem"])

# Supported media extensions (lowercase, without dot)
SUPPORTED_MEDIA_EXTENSIONS = {
    # Video formats
    'mov', 'mp4', 'mxf', 'avi', 'mkv', 'webm', 'm4v', 'mpg', 'mpeg',
    'dv', 'r3d', 'braw', 'ari', 'dpx', 'exr',
    # Audio formats  
    'wav', 'aiff', 'aif', 'mp3', 'flac', 'm4a', 'aac',
    # Image sequences (single frame)
    'tif', 'tiff', 'png', 'jpg', 'jpeg',
}

# Image sequence extensions (these get grouped when numbered)
IMAGE_SEQUENCE_EXTENSIONS = {
    'dpx', 'exr', 'tif', 'tiff', 'png', 'jpg', 'jpeg', 'cin', 'tga',
}

# Pattern to detect numbered sequences: name.NNNNN.ext or name_NNNNN.ext
SEQUENCE_PATTERN = re.compile(r'^(.+?)[\._](\d{2,8})\.([\w]+)$')


def detect_image_sequence(files: List[str]) -> Tuple[List[str], List[str]]:
    """
    Detect and group numbered image sequences from a list of file paths.
    
    Returns:
        Tuple of (sequence_patterns, standalone_files)
        - sequence_patterns: List of pattern paths like "/path/clip.%06d.exr"
        - standalone_files: List of files that aren't part of sequences
    """
    # Group files by directory and base name
    sequence_groups: Dict[str, List[Tuple[int, str, int]]] = defaultdict(list)
    standalone_files: List[str] = []
    
    for file_path in files:
        path = Path(file_path)
        ext = path.suffix.lower().lstrip('.')
        
        # Only group image sequence extensions
        if ext not in IMAGE_SEQUENCE_EXTENSIONS:
            standalone_files.append(file_path)
            continue
        
        # Try to match sequence pattern
        match = SEQUENCE_PATTERN.match(path.name)
        if not match:
            standalone_files.append(file_path)
            continue
        
        base_name, frame_str, extension = match.groups()
        frame_num = int(frame_str)
        frame_padding = len(frame_str)
        
        # Create group key (directory + base_name + extension + padding)
        group_key = f"{path.parent}|{base_name}|{extension}|{frame_padding}"
        sequence_groups[group_key].append((frame_num, str(path.parent), frame_padding))
    
    # Convert groups to sequence patterns
    sequence_patterns: List[str] = []
    
    for group_key, frames in sequence_groups.items():
        if len(frames) < 2:
            # Single frame files aren't sequences, add to standalone
            # Reconstruct the file path
            parts = group_key.split('|')
            dir_path, base_name, extension, frame_padding = parts[0], parts[1], parts[2], int(parts[3])
            frame_num = frames[0][0]
            frame_str = str(frame_num).zfill(frame_padding)
            file_path = f"{dir_path}/{base_name}.{frame_str}.{extension}"
            standalone_files.append(file_path)
            continue
        
        # This is a valid sequence
        parts = group_key.split('|')
        dir_path, base_name, extension, frame_padding = parts[0], parts[1], parts[2], int(parts[3])
        
        # Create FFmpeg-compatible pattern
        pattern = f"{dir_path}/{base_name}.%0{frame_padding}d.{extension}"
        
        # Sort frames to find range
        sorted_frames = sorted(frames, key=lambda x: x[0])
        first_frame = sorted_frames[0][0]
        last_frame = sorted_frames[-1][0]
        frame_count = len(sorted_frames)
        
        # Log sequence detection
        logger.info(
            f"Detected image sequence: {pattern} "
            f"(frames {first_frame}-{last_frame}, {frame_count} files)"
        )
        
        sequence_patterns.append(pattern)
    
    return sequence_patterns, standalone_files


class DirectoryEntry(BaseModel):
    """A single directory entry (file or folder)."""
    
    model_config = ConfigDict(extra="forbid")
    
    name: str
    path: str
    type: str  # "file" or "dir"
    size: Optional[int] = None
    extension: Optional[str] = None


class BrowseResponse(BaseModel):
    """Response from directory browse endpoint."""
    
    model_config = ConfigDict(extra="forbid")
    
    path: str
    parent: Optional[str] = None
    entries: List[DirectoryEntry]
    error: Optional[str] = None


class RootsResponse(BaseModel):
    """Response from roots endpoint."""
    
    model_config = ConfigDict(extra="forbid")
    
    roots: List[DirectoryEntry]


class EnumerateResponse(BaseModel):
    """Response from folder enumeration endpoint."""
    
    model_config = ConfigDict(extra="forbid")
    
    folder: str
    files: List[str]
    count: int
    error: Optional[str] = None


def normalize_and_validate_path(path: str) -> Path:
    """
    Normalize path and validate it's safe to access.
    
    Raises HTTPException if path is invalid or unsafe.
    """
    try:
        # Resolve to absolute path, following symlinks
        resolved = Path(path).resolve()
        
        # Prevent accessing system directories (basic protection)
        # Allow /Users, /home, /Volumes, /mnt, and common media paths
        path_str = str(resolved)
        
        # Block obvious system paths
        blocked_prefixes = [
            '/System', '/Library', '/bin', '/sbin', '/usr',
            '/etc', '/var', '/private', '/dev',
        ]
        
        for prefix in blocked_prefixes:
            if path_str.startswith(prefix):
                raise HTTPException(
                    status_code=403,
                    detail=f"Access to system directory not allowed: {prefix}"
                )
        
        if not resolved.exists():
            raise HTTPException(
                status_code=404,
                detail=f"Path does not exist: {path}"
            )
        
        return resolved
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid path: {str(e)}"
        )


def is_supported_media_file(path: Path) -> bool:
    """Check if a file has a supported media extension."""
    if not path.is_file():
        return False
    ext = path.suffix.lower().lstrip('.')
    return ext in SUPPORTED_MEDIA_EXTENSIONS


def get_directory_entries(
    directory: Path,
    include_hidden: bool = False,
    media_only: bool = True,
) -> List[DirectoryEntry]:
    """
    List entries in a directory.
    
    Args:
        directory: Path to directory to list
        include_hidden: Whether to include hidden files/folders
        media_only: Only include supported media files (dirs always included)
    
    Returns:
        List of DirectoryEntry objects, sorted (dirs first, then files)
    """
    entries: List[DirectoryEntry] = []
    
    try:
        for item in directory.iterdir():
            # Skip hidden files unless requested
            if not include_hidden and item.name.startswith('.'):
                continue
            
            # Skip unreadable items
            if not os.access(item, os.R_OK):
                continue
            
            if item.is_dir():
                entries.append(DirectoryEntry(
                    name=item.name,
                    path=str(item),
                    type="dir",
                ))
            elif item.is_file():
                # Filter by supported extensions if media_only
                if media_only and not is_supported_media_file(item):
                    continue
                
                ext = item.suffix.lower().lstrip('.') or None
                try:
                    size = item.stat().st_size
                except (OSError, IOError):
                    size = None
                
                entries.append(DirectoryEntry(
                    name=item.name,
                    path=str(item),
                    type="file",
                    size=size,
                    extension=ext,
                ))
    except PermissionError:
        logger.warning(f"Permission denied listing directory: {directory}")
    except OSError as e:
        logger.warning(f"Error listing directory {directory}: {e}")
    
    # Sort: directories first (alphabetically), then files (alphabetically)
    entries.sort(key=lambda e: (e.type != "dir", e.name.lower()))
    
    return entries


@router.get("/roots", response_model=RootsResponse)
async def get_filesystem_roots():
    """
    Get available filesystem roots for navigation.
    
    Returns mounted volumes on macOS, common directories on other platforms.
    """
    roots: List[DirectoryEntry] = []
    
    # macOS: /Volumes contains mounted drives
    volumes_path = Path("/Volumes")
    if volumes_path.exists():
        try:
            for item in volumes_path.iterdir():
                if item.is_dir() and os.access(item, os.R_OK):
                    roots.append(DirectoryEntry(
                        name=item.name,
                        path=str(item),
                        type="dir",
                    ))
        except PermissionError:
            pass
    
    # Add user home directory
    home = Path.home()
    if home.exists():
        roots.append(DirectoryEntry(
            name=f"Home ({home.name})",
            path=str(home),
            type="dir",
        ))
    
    # Sort by name
    roots.sort(key=lambda r: r.name.lower())
    
    return RootsResponse(roots=roots)


@router.get("/browse", response_model=BrowseResponse)
async def browse_directory(
    path: str = Query(..., description="Absolute path to directory to browse"),
    include_hidden: bool = Query(False, description="Include hidden files/folders"),
    media_only: bool = Query(True, description="Only show supported media files"),
):
    """
    Browse a directory and return its contents.
    
    Returns directories and optionally filtered media files.
    Path must be absolute and accessible.
    """
    resolved = normalize_and_validate_path(path)
    
    if not resolved.is_dir():
        raise HTTPException(
            status_code=400,
            detail=f"Path is not a directory: {path}"
        )
    
    entries = get_directory_entries(
        resolved,
        include_hidden=include_hidden,
        media_only=media_only,
    )
    
    # Compute parent path
    parent = str(resolved.parent) if resolved.parent != resolved else None
    
    return BrowseResponse(
        path=str(resolved),
        parent=parent,
        entries=entries,
    )


@router.get("/enumerate", response_model=EnumerateResponse)
async def enumerate_folder_media(
    path: str = Query(..., description="Absolute path to folder to enumerate"),
    recursive: bool = Query(True, description="Recursively scan subfolders"),
    detect_sequences: bool = Query(True, description="Detect and group image sequences"),
):
    """
    Enumerate all supported media files in a folder.
    
    Used for "Create Job from Folder" action.
    Returns absolute paths to all supported media files.
    
    When detect_sequences=True (default), numbered image sequences 
    (e.g., clip.000001.exr through clip.001000.exr) are grouped and 
    returned as a single pattern path (e.g., /path/clip.%06d.exr).
    """
    resolved = normalize_and_validate_path(path)
    
    if not resolved.is_dir():
        raise HTTPException(
            status_code=400,
            detail=f"Path is not a directory: {path}"
        )
    
    media_files: List[str] = []
    
    try:
        if recursive:
            # Walk directory tree
            for root, _dirs, files in os.walk(resolved):
                root_path = Path(root)
                for filename in files:
                    if filename.startswith('.'):
                        continue
                    file_path = root_path / filename
                    if is_supported_media_file(file_path):
                        media_files.append(str(file_path))
        else:
            # Just this directory
            for item in resolved.iterdir():
                if item.name.startswith('.'):
                    continue
                if is_supported_media_file(item):
                    media_files.append(str(item))
        
        # Detect image sequences if requested
        if detect_sequences and media_files:
            sequence_patterns, standalone = detect_image_sequence(media_files)
            # Combine: sequences first, then standalone files
            final_files = sequence_patterns + standalone
            final_files.sort()
        else:
            final_files = sorted(media_files)
        
    except PermissionError:
        return EnumerateResponse(
            folder=str(resolved),
            files=[],
            count=0,
            error="Permission denied accessing folder",
        )
    except OSError as e:
        return EnumerateResponse(
            folder=str(resolved),
            files=[],
            count=0,
            error=str(e),
        )
    
    return EnumerateResponse(
        folder=str(resolved),
        files=final_files,
        count=len(final_files),
    )
