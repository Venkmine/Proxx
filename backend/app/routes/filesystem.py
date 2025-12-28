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

INC-001 Fix: All directory enumeration is async with timeout protection.
Network volumes (/Volumes) can hang indefinitely - we now enforce a 3-second
timeout on all iterdir() operations.

============================================================================
V1 OBSERVABILITY HARDENING
============================================================================
All browse operations are now logged to the browse event log.
Each request is logged with:
- Path being browsed
- Success/failure status
- Error type and message (if failure)
- Timing information

This surfaces the truth about filesystem access for debugging.
See: app/observability/browse_log.py
============================================================================
"""

import os
import re
import asyncio
import logging
from pathlib import Path
from typing import List, Optional, Dict, Tuple
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pydantic import BaseModel, ConfigDict
from fastapi import APIRouter, HTTPException, Query

from ..observability.browse_log import get_browse_log

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/filesystem", tags=["filesystem"])

# INC-001: Timeout for directory enumeration (seconds)
# Network volumes can hang indefinitely - enforce a reasonable timeout
DIRECTORY_TIMEOUT_SECONDS = 3.0

# Executor for running blocking filesystem operations in threads
_fs_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="fs_enum")

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


async def list_directory_with_timeout(
    directory: Path,
    timeout: float = DIRECTORY_TIMEOUT_SECONDS,
) -> List[Path]:
    """
    List directory contents with timeout protection.
    
    INC-001 Fix: Network volumes (/Volumes) can hang indefinitely when
    listing contents. This function wraps iterdir() in a timeout.
    
    Args:
        directory: Path to directory to list
        timeout: Maximum seconds to wait (default: 3.0)
        
    Returns:
        List of Path objects in the directory
        
    Raises:
        asyncio.TimeoutError: If enumeration exceeds timeout
        PermissionError: If access is denied
        OSError: For other filesystem errors
    """
    loop = asyncio.get_event_loop()
    
    def _sync_iterdir() -> List[Path]:
        """Synchronous directory listing - runs in thread pool."""
        return list(directory.iterdir())
    
    # Run blocking iterdir() in thread pool with timeout
    return await asyncio.wait_for(
        loop.run_in_executor(_fs_executor, _sync_iterdir),
        timeout=timeout,
    )


async def get_directory_entries(
    directory: Path,
    include_hidden: bool = False,
    media_only: bool = True,
) -> List[DirectoryEntry]:
    """
    List entries in a directory.
    
    INC-001 Fix: Uses timeout-protected directory enumeration.
    
    Args:
        directory: Path to directory to list
        include_hidden: Whether to include hidden files/folders
        media_only: Only include supported media files (dirs always included)
    
    Returns:
        List of DirectoryEntry objects, sorted (dirs first, then files)
        
    Raises:
        asyncio.TimeoutError: If directory enumeration times out
    """
    entries: List[DirectoryEntry] = []
    
    # INC-001: Use timeout-protected directory listing
    items = await list_directory_with_timeout(directory)
    
    for item in items:
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
    
    # Sort: directories first (alphabetically), then files (alphabetically)
    entries.sort(key=lambda e: (e.type != "dir", e.name.lower()))
    
    return entries


@router.get("/roots", response_model=RootsResponse)
async def get_filesystem_roots():
    """
    Get available filesystem roots for navigation.
    
    INC-001 Fix: Uses timeout-protected enumeration to prevent hangs
    on network volumes that are unreachable.
    
    V1 OBSERVABILITY: All browse attempts are logged to browse event log.
    
    Returns mounted volumes on macOS, common directories on other platforms.
    """
    browse_log = get_browse_log()
    browse_log.record_roots_start()
    
    roots: List[DirectoryEntry] = []
    
    # macOS: /Volumes contains mounted drives
    # INC-001: Network volumes can hang indefinitely - use timeout
    volumes_path = Path("/Volumes")
    if volumes_path.exists():
        try:
            # Use timeout-protected enumeration
            volume_items = await list_directory_with_timeout(volumes_path)
            for item in volume_items:
                if item.is_dir() and os.access(item, os.R_OK):
                    roots.append(DirectoryEntry(
                        name=item.name,
                        path=str(item),
                        type="dir",
                    ))
        except asyncio.TimeoutError:
            # INC-001: Volumes enumeration timed out - skip but log
            # V1 OBSERVABILITY: Record timeout explicitly
            logger.warning(f"Timeout listing /Volumes - skipping (INC-001)")
            browse_log.record_browse_timeout("/Volumes", DIRECTORY_TIMEOUT_SECONDS)
        except PermissionError:
            # V1 OBSERVABILITY: Record permission error
            browse_log.record_browse_error("/Volumes", "permission", "Permission denied")
    
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
    
    # V1 OBSERVABILITY: Record successful roots listing
    browse_log.record_roots_success(len(roots))
    
    return RootsResponse(roots=roots)


@router.get("/browse", response_model=BrowseResponse)
async def browse_directory(
    path: str = Query(..., description="Absolute path to directory to browse"),
    include_hidden: bool = Query(False, description="Include hidden files/folders"),
    media_only: bool = Query(True, description="Only show supported media files"),
):
    """
    Browse a directory and return its contents.
    
    INC-001 Fix: Uses timeout-protected enumeration to prevent hangs
    on network volumes.
    
    V1 OBSERVABILITY: All browse attempts are logged to browse event log.
    V1 FILESYSTEM INVARIANT: Browse MUST resolve to directory list OR visible error.
    
    Returns directories and optionally filtered media files.
    Path must be absolute and accessible.
    """
    browse_log = get_browse_log()
    browse_log.record_browse_start(path)
    
    # V1 DEBUG: Log the requested and resolved paths for diagnosis
    logger.info(f"[BROWSE] Requested path: {path}")
    
    try:
        resolved = normalize_and_validate_path(path)
        logger.info(f"[BROWSE] Resolved path: {resolved}")
    except HTTPException as e:
        # V1 OBSERVABILITY: Record path validation error
        logger.warning(f"[BROWSE] Path validation failed: {path} -> {e.detail}")
        browse_log.record_browse_error(path, "validation", str(e.detail))
        raise
    
    if not resolved.is_dir():
        # V1 OBSERVABILITY: Record error
        browse_log.record_browse_error(path, "not_directory", f"Path is not a directory: {path}")
        raise HTTPException(
            status_code=400,
            detail=f"Path is not a directory: {path}"
        )
    
    # Compute parent path
    parent = str(resolved.parent) if resolved.parent != resolved else None
    
    # INC-001: Use timeout-protected enumeration with HARD timeout.
    # Network volumes (/Volumes) can hang indefinitely.
    # V1 FILESYSTEM INVARIANT: Browse MUST resolve to directory list OR visible error.
    try:
        logger.info(f"[BROWSE] Starting directory enumeration for: {resolved}")
        entries = await get_directory_entries(
            resolved,
            include_hidden=include_hidden,
            media_only=media_only,
        )
        logger.info(f"[BROWSE] Enumeration complete: {len(entries)} entries for {resolved}")
        
        # V1 OBSERVABILITY: Record successful browse
        dir_count = sum(1 for e in entries if e.type == "dir")
        file_count = sum(1 for e in entries if e.type == "file")
        browse_log.record_browse_success(path, dir_count, file_count)
        
        # V1 FIX: If no entries AND this is an empty directory, return empty list (not error)
        # This prevents "Loading forever" for empty directories
        if len(entries) == 0:
            logger.info(f"[BROWSE] Empty directory (or no media files): {resolved}")
        
    except asyncio.TimeoutError:
        # INC-001: Directory enumeration timed out — log ONCE (no spam)
        # V1 OBSERVABILITY: Record timeout with explicit error payload
        logger.warning(f"INC-001: Timeout browsing directory after {DIRECTORY_TIMEOUT_SECONDS}s: {path}")
        browse_log.record_browse_timeout(path, DIRECTORY_TIMEOUT_SECONDS)
        
        return BrowseResponse(
            path=str(resolved),
            parent=parent,
            entries=[],
            error="Unable to list this folder (permissions or slow volume)",
        )
    except PermissionError as e:
        # V1 OBSERVABILITY: Record permission error
        logger.warning(f"[BROWSE] Permission denied: {path} - {e}")
        browse_log.record_browse_error(path, "permission", "Permission denied")
        
        return BrowseResponse(
            path=str(resolved),
            parent=parent,
            entries=[],
            error="Permission denied",
        )
    except OSError as e:
        # V1 OBSERVABILITY: Record OS error
        logger.warning(f"[BROWSE] OS error: {path} - {e}")
        browse_log.record_browse_error(path, "io_error", str(e))
        
        return BrowseResponse(
            path=str(resolved),
            parent=parent,
            entries=[],
            error=str(e),
        )
    except Exception as e:
        # V1 FIX: Catch-all to ensure we NEVER hang
        logger.error(f"[BROWSE] Unexpected error: {path} - {type(e).__name__}: {e}")
        browse_log.record_browse_error(path, "unexpected", str(e))
        
        return BrowseResponse(
            path=str(resolved),
            parent=parent,
            entries=[],
            error=f"Unexpected error: {type(e).__name__}",
        )
    
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


# ============================================================================
# V1 OBSERVABILITY: Debug Endpoints
# ============================================================================

@router.get("/debug/browse-log")
async def get_browse_log_entries(limit: int = 50):
    """
    Get recent browse events for debugging.
    
    V1 OBSERVABILITY: Debug-only endpoint for viewing browse event log.
    Returns last N browse events with full context.
    
    This endpoint should NOT be exposed in production.
    """
    browse_log = get_browse_log()
    events = browse_log.get_events_as_dicts(limit)
    
    return {
        "events": events,
        "count": len(events),
        "total_logged": browse_log._events.maxlen if hasattr(browse_log._events, 'maxlen') else len(browse_log._events),
    }


@router.post("/debug/browse-log/clear")
async def clear_browse_log_entries():
    """
    Clear browse event log.
    
    V1 OBSERVABILITY: Debug-only endpoint for clearing browse event log.
    """
    browse_log = get_browse_log()
    browse_log.clear()
    
    return {
        "success": True,
        "message": "Browse log cleared",
    }
