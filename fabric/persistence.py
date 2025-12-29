"""
Fabric Persistence - High-level API for job persistence.

Provides clean interface between ingestion/queries and storage layer.

Rules:
------
- Idempotent writes (same job_id = same result)
- No partial writes (transactional)
- No background operations
- Explicit initialization
- Fail loudly on errors

FORBIDDEN:
----------
- Automatic migration
- Background flushing
- Retry logic
- Data healing
- Optimization
"""

from pathlib import Path
from typing import List, Optional

from fabric.models import IngestedJob
from fabric.storage import FabricStorage, StorageError


class PersistenceError(Exception):
    """Raised when persistence operations fail."""
    pass


class FabricPersistence:
    """
    High-level persistence API for Fabric.
    
    Wraps FabricStorage with explicit lifecycle management.
    """
    
    def __init__(self, storage_path: Optional[Path] = None):
        """
        Initialize persistence layer.
        
        Args:
            storage_path: Path to storage database.
                          Defaults to ~/.proxx/fabric/fabric.db
        """
        self._storage = FabricStorage(storage_path)
        self._is_open = False
    
    def open(self) -> None:
        """
        Open persistence layer.
        
        Must be called before any read/write operations.
        
        Raises:
            PersistenceError: If opening fails
        """
        try:
            self._storage.open()
            self._is_open = True
        except StorageError as e:
            raise PersistenceError(f"Failed to open persistence: {e}") from e
    
    def close(self) -> None:
        """Close persistence layer."""
        if self._is_open:
            self._storage.close()
            self._is_open = False
    
    def persist_ingested_job(self, job: IngestedJob) -> None:
        """
        Persist an ingested job.
        
        Idempotent: Persisting same job_id multiple times results in
        single stored record with latest data.
        
        Args:
            job: IngestedJob to persist
        
        Raises:
            PersistenceError: If not opened or write fails
        """
        if not self._is_open:
            raise PersistenceError("Persistence not opened")
        
        try:
            self._storage.persist_job(job)
        except StorageError as e:
            raise PersistenceError(
                f"Failed to persist job {job.job_id}: {e}"
            ) from e
    
    def load_all_jobs(self) -> List[IngestedJob]:
        """
        Load all persisted jobs.
        
        Returns jobs in ingestion order (oldest first).
        
        Returns:
            List of all persisted IngestedJobs
        
        Raises:
            PersistenceError: If not opened or read fails
        """
        if not self._is_open:
            raise PersistenceError("Persistence not opened")
        
        try:
            return self._storage.load_all_jobs()
        except StorageError as e:
            raise PersistenceError(f"Failed to load jobs: {e}") from e
    
    def get_schema_version(self) -> int:
        """
        Get storage schema version.
        
        Returns:
            Schema version number
        
        Raises:
            PersistenceError: If not opened
        """
        if not self._is_open:
            raise PersistenceError("Persistence not opened")
        
        return self._storage.get_schema_version()
    
    def is_open(self) -> bool:
        """Check if persistence is open."""
        return self._is_open
    
    def __enter__(self):
        """Context manager entry."""
        self.open()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.close()


def create_persistence(storage_path: Optional[Path] = None) -> FabricPersistence:
    """
    Factory function for creating FabricPersistence.
    
    Args:
        storage_path: Optional path to storage database
    
    Returns:
        FabricPersistence instance (unopened)
    """
    return FabricPersistence(storage_path)
