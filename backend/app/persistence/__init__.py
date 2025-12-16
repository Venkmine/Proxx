"""
Persistence layer for Proxx state.

Phase 12: SQLite-backed storage for jobs, preset bindings, watch folders.
Recovery detection without auto-resume.
"""

from .manager import PersistenceManager
from .errors import PersistenceError

__all__ = ["PersistenceManager", "PersistenceError"]
