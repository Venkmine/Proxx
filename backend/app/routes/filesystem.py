"""
Filesystem browsing API for directory navigator.

Phase 4A: Provides safe directory listing for Sources panel.

Security constraints:
- Path normalization to prevent traversal attacks
- Restrict to user-accessible directories
- Filter to supported media types only for files
"""

import os
import logging
from pathlib import Path
from typing import List, Optional
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
):
    """
    Enumerate all supported media files in a folder.
    
    Used for "Create Job from Folder" action.
    Returns absolute paths to all supported media files.
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
        
        # Sort for consistent ordering
        media_files.sort()
        
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
        files=media_files,
        count=len(media_files),
    )
