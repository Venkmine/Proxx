"""
Watch folder registry.

In-memory storage for watch folder configurations.
Phase 10: In-memory only.
Phase 12: Explicit persistence support.
"""

from typing import Dict, List, Optional
from pathlib import Path
from datetime import datetime

from .models import WatchFolder
from .errors import (
    DuplicateWatchFolderError,
    WatchFolderNotFoundError,
    InvalidWatchFolderPathError,
)


class WatchFolderRegistry:
    """
    In-memory registry for watch folder configurations.

    Phase 12: Explicit persistence via save/load methods.
    """

    def __init__(self, persistence_manager=None):
        """
        Initialize registry.
        
        Args:
            persistence_manager: Optional PersistenceManager for explicit save/load
        """
        self._folders: Dict[str, WatchFolder] = {}
        self._persistence = persistence_manager

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
    
    # Phase 12: Explicit persistence operations
    
    def save_folder(self, folder: WatchFolder) -> None:
        """
        Explicitly save a watch folder to persistent storage.
        
        Must be called manually after add_folder() or updates.
        
        Args:
            folder: The watch folder to persist
            
        Raises:
            ValueError: If persistence_manager is not configured
        """
        if not self._persistence:
            raise ValueError("No persistence_manager configured for WatchFolderRegistry")
        
        folder_data = {
            "id": folder.id,
            "path": folder.path,
            "enabled": folder.enabled,
            "recursive": folder.recursive,
            "preset_id": folder.preset_id,
            "auto_execute": folder.auto_execute,
            "created_at": folder.created_at.isoformat(),
        }
        
        self._persistence.save_watch_folder(folder_data)
    
    def load_all_folders(self) -> None:
        """
        Load all watch folders from persistent storage into memory.
        
        Called explicitly at startup to restore state.
        Does NOT re-validate filesystem paths (may have changed).
        
        Raises:
            ValueError: If persistence_manager is not configured
        """
        if not self._persistence:
            raise ValueError("No persistence_manager configured for WatchFolderRegistry")
        
        folder_datas = self._persistence.load_all_watch_folders()
        
        for folder_data in folder_datas:
            folder = WatchFolder(
                id=folder_data["id"],
                path=folder_data["path"],
                enabled=folder_data["enabled"],
                recursive=folder_data["recursive"],
                preset_id=folder_data["preset_id"],
                auto_execute=folder_data["auto_execute"],
                created_at=datetime.fromisoformat(folder_data["created_at"]),
            )
            
            self._folders[folder.id] = folder
