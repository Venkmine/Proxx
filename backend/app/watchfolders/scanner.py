"""
Filesystem scanner for watch folders.

Recursively scans directories for media files with extension filtering.
"""

from pathlib import Path
from typing import List, Set

from watchfolders.models import WatchFolder


class FileScanner:
    """
    Filesystem scanner for watch folder ingestion.

    Scans directories for media files matching a whitelist of extensions.
    Skips hidden files, directories, and symlinks.
    """

    # Media file extensions to process
    # Based on supported formats from metadata/extractors.py
    MEDIA_EXTENSIONS = {".mov", ".mxf", ".mp4", ".avi", ".mkv"}

    def __init__(self, skip_hidden: bool = True, follow_symlinks: bool = False):
        """
        Initialize file scanner.

        Args:
            skip_hidden: Skip files/dirs starting with '.' (default: True)
            follow_symlinks: Follow symbolic links (default: False for safety)
        """
        self.skip_hidden = skip_hidden
        self.follow_symlinks = follow_symlinks

    def scan(self, watch_folder: WatchFolder) -> List[Path]:
        """
        Scan a watch folder for media files.

        Returns:
            List of absolute paths to candidate files (not yet stability-checked)

        Files are returned in deterministic order (sorted by path).
        """
        folder_path = Path(watch_folder.path)

        # Verify folder still exists
        if not folder_path.exists():
            return []

        if not folder_path.is_dir():
            return []

        # Collect candidate files
        candidates = []

        if watch_folder.recursive:
            # Recursive scan
            candidates = self._scan_recursive(folder_path)
        else:
            # Non-recursive scan (top-level only)
            candidates = self._scan_toplevel(folder_path)

        # Sort for deterministic ordering
        return sorted(candidates)

    def _scan_recursive(self, root: Path) -> List[Path]:
        """
        Recursively scan directory tree.

        Returns:
            List of candidate file paths
        """
        candidates = []

        try:
            for item in root.rglob("*"):
                # Skip based on symlink policy
                if item.is_symlink() and not self.follow_symlinks:
                    continue

                # Skip hidden files/dirs
                if self.skip_hidden and item.name.startswith("."):
                    continue

                # Only process files (not directories)
                if not item.is_file():
                    continue

                # Check extension
                if item.suffix.lower() in self.MEDIA_EXTENSIONS:
                    candidates.append(item.resolve())

        except (OSError, PermissionError):
            # Directory became inaccessible during scan
            # Return what we have so far
            pass

        return candidates

    def _scan_toplevel(self, root: Path) -> List[Path]:
        """
        Scan top-level directory only (non-recursive).

        Returns:
            List of candidate file paths
        """
        candidates = []

        try:
            for item in root.iterdir():
                # Skip based on symlink policy
                if item.is_symlink() and not self.follow_symlinks:
                    continue

                # Skip hidden files/dirs
                if self.skip_hidden and item.name.startswith("."):
                    continue

                # Only process files (not directories)
                if not item.is_file():
                    continue

                # Check extension
                if item.suffix.lower() in self.MEDIA_EXTENSIONS:
                    candidates.append(item.resolve())

        except (OSError, PermissionError):
            # Directory became inaccessible during scan
            # Return empty list
            pass

        return candidates
