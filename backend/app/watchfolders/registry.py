"""
Watch folder registry.

In-memory storage for watch folder configurations. Follows the same pattern
as PresetRegistry and JobRegistry.

Phase 10: In-memory only, no persistence.
Phase 11+: Persistence via SQLite or JSON.
"""

from typing import Dict, List, Optional
from pathlib import Path

from watchfolders.models import WatchFolder
from watchfolders.errors import (
    DuplicateWatchFolderError,
    WatchFolderNotFoundError,
    InvalidWatchFolderPathError,
)


class WatchFolderRegistry:
    """
    In-memory registry for watch folder configurations.

    Provides add/get/list/remove operations with duplicate detection.
    """

    def __init__(self):
        self._folders: Dict[str, WatchFolder] = {}

    def add_folder(self, folder: WatchFolder) -> None:
        """
        Register a new watch folder.

        Validates that:
        - ID is unique
        - Path exists
        - Path is a directory
        - Path is readable

        Raises:
            DuplicateWatchFolderError: If folder.id already exists
            WatchFolderNotFoundError: If folder.path does not exist
            InvalidWatchFolderPathError: If folder.path is not a directory or not readable
        """
        # Check for duplicate ID
        if folder.id in self._folders:
            raise DuplicateWatchFolderError(
                f"Watch folder ID already exists: {folder.id}"
            )

        # Validate path exists
        path = Path(folder.path)
        if not path.exists():
            raise WatchFolderNotFoundError(
                f"Watch folder path does not exist: {folder.path}"
            )

        # Validate path is a directory
        if not path.is_dir():
            raise InvalidWatchFolderPathError(
                f"Watch folder path is not a directory: {folder.path}"
            )

        # Validate path is readable
        # Note: This is a best-effort check. Permissions can change after registration.
        if not path.is_dir():  # is_dir() implicitly checks read access
            raise InvalidWatchFolderPathError(
                f"Watch folder path is not readable: {folder.path}"
            )

        # Register folder
        self._folders[folder.id] = folder

    def get_folder(self, folder_id: str) -> Optional[WatchFolder]:
        """
        Retrieve a watch folder by ID.

        Returns:
            WatchFolder if found, None otherwise
        """
        return self._folders.get(folder_id)

    def get_folder_or_raise(self, folder_id: str) -> WatchFolder:
        """
        Retrieve a watch folder by ID, raising if not found.

        Raises:
            WatchFolderNotFoundError: If folder_id does not exist
        """
        folder = self.get_folder(folder_id)
        if folder is None:
            raise WatchFolderNotFoundError(f"Watch folder not found: {folder_id}")
        return folder

    def list_folders(self) -> List[WatchFolder]:
        """
        List all registered watch folders.

        Returns folders sorted by creation time (newest first).
        """
        return sorted(
            self._folders.values(),
            key=lambda f: f.created_at,
            reverse=True,
        )

    def list_enabled_folders(self) -> List[WatchFolder]:
        """
        List only enabled watch folders.

        Returns folders sorted by creation time (newest first).
        """
        return sorted(
            [f for f in self._folders.values() if f.enabled],
            key=lambda f: f.created_at,
            reverse=True,
        )

    def remove_folder(self, folder_id: str) -> None:
        """
        Remove a watch folder from the registry.

        Does not raise if folder_id does not exist (idempotent).
        """
        self._folders.pop(folder_id, None)

    def clear(self) -> None:
        """
        Remove all watch folders.

        Used primarily for testing.
        """
        self._folders.clear()
