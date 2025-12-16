"""
Watch folder error hierarchy.

All errors are non-fatal to the application. They indicate operation failure
but Proxx continues running.
"""


class WatchFolderError(Exception):
    """Base exception for watch folder failures."""

    pass


class FileStabilityError(WatchFolderError):
    """File is not stable for processing (still being written/copied)."""

    pass


class WatchFolderNotFoundError(WatchFolderError):
    """Watch folder path does not exist or is not accessible."""

    pass


class DuplicateWatchFolderError(WatchFolderError):
    """Watch folder ID already exists in registry."""

    pass


class InvalidWatchFolderPathError(WatchFolderError):
    """Watch folder path is not a directory or not readable."""

    pass
