"""
Watch folders — unattended media ingestion.

This module provides safe, polling-based file discovery that creates PENDING jobs
without auto-execution or preset application. It is the foundation for overnight
unattended ingestion workflows.

Public API:
    WatchFolder — Watch folder configuration model
    WatchFolderRegistry — In-memory watch folder storage
    FileStabilityChecker — File size polling for copy completion detection
    FileScanner — Filesystem traversal with extension filtering
    WatchFolderEngine — Orchestration: scan → stability → job creation
"""

from .errors import (
    WatchFolderError,
    FileStabilityError,
    WatchFolderNotFoundError,
    DuplicateWatchFolderError,
)
from .models import WatchFolder, FileStabilityCheck
from .registry import WatchFolderRegistry
from .stability import FileStabilityChecker
from .scanner import FileScanner
from .engine import WatchFolderEngine

__all__ = [
    # Errors
    "WatchFolderError",
    "FileStabilityError",
    "WatchFolderNotFoundError",
    "DuplicateWatchFolderError",
    # Models
    "WatchFolder",
    "FileStabilityCheck",
    # Registry
    "WatchFolderRegistry",
    # Core
    "FileStabilityChecker",
    "FileScanner",
    "WatchFolderEngine",
]
