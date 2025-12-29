"""
Fabric Storage - SQLite-based persistence for ingested jobs.

CHOICE: SQLite
--------------
- Embedded: No external dependencies
- ACID: Transactions prevent partial writes
- Schema: Explicit versioning with user_version pragma
- Corruption: Built-in detection (PRAGMA integrity_check)
- Idempotent: INSERT OR REPLACE for same job_id

GUARANTEES:
-----------
- All writes are transactional
- No partial job records
- Schema version tracked explicitly
- Corruption = loud failure (no healing)

NOT PROVIDED:
-------------
- Automatic migration
- Background compaction
- Retention policies
- Deletion
- Performance optimization

Fabric remembers. Humans decide what to forget.
"""

import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fabric.models import IngestedJob, IngestedOutput


# Schema version - increment on breaking changes
STORAGE_SCHEMA_VERSION = 1

# Default storage location
DEFAULT_STORAGE_PATH = Path.home() / ".proxx" / "fabric" / "fabric.db"


class StorageError(Exception):
    """Raised when storage operations fail."""
    pass


class StorageCorruptionError(StorageError):
    """Raised when storage corruption is detected."""
    pass


def _serialize_datetime(dt: Optional[datetime]) -> Optional[str]:
    """Serialize datetime to ISO 8601 string."""
    if dt is None:
        return None
    return dt.isoformat()


def _deserialize_datetime(dt_str: Optional[str]) -> Optional[datetime]:
    """Deserialize ISO 8601 string to datetime."""
    if dt_str is None:
        return None
    return datetime.fromisoformat(dt_str)


def _serialize_outputs(outputs: List[IngestedOutput]) -> str:
    """Serialize list of outputs to JSON."""
    return json.dumps([
        {
            "job_id": out.job_id,
            "clip_id": out.clip_id,
            "source_path": out.source_path,
            "output_path": out.output_path,
            "output_exists": out.output_exists,
            "output_size_bytes": out.output_size_bytes,
            "status": out.status,
            "failure_reason": out.failure_reason,
            "engine_used": out.engine_used,
            "proxy_profile_used": out.proxy_profile_used,
            "resolve_preset_used": out.resolve_preset_used,
        }
        for out in outputs
    ])


def _deserialize_outputs(json_str: str) -> List[IngestedOutput]:
    """Deserialize JSON to list of outputs."""
    data = json.loads(json_str)
    return [
        IngestedOutput(
            job_id=item["job_id"],
            clip_id=item["clip_id"],
            source_path=item["source_path"],
            output_path=item["output_path"],
            output_exists=item["output_exists"],
            output_size_bytes=item["output_size_bytes"],
            status=item["status"],
            failure_reason=item["failure_reason"],
            engine_used=item["engine_used"],
            proxy_profile_used=item["proxy_profile_used"],
            resolve_preset_used=item["resolve_preset_used"],
        )
        for item in data
    ]


class FabricStorage:
    """
    SQLite-backed storage for ingested jobs.
    
    Provides durable persistence with explicit failure modes.
    Does NOT optimize, migrate, compact, or heal.
    """
    
    def __init__(self, db_path: Optional[Path] = None):
        """
        Initialize storage.
        
        Args:
            db_path: Path to SQLite database file. 
                     Creates parent directories if needed.
                     Defaults to ~/.proxx/fabric/fabric.db
        """
        self.db_path = db_path or DEFAULT_STORAGE_PATH
        self._ensure_storage_directory()
        self._conn: Optional[sqlite3.Connection] = None
    
    def _ensure_storage_directory(self) -> None:
        """Create storage directory if it doesn't exist."""
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
    
    def open(self) -> None:
        """
        Open database connection and initialize schema.
        
        Raises:
            StorageError: If database cannot be opened
            StorageCorruptionError: If corruption is detected
        """
        if self._conn is not None:
            return  # Already open
        
        try:
            self._conn = sqlite3.connect(
                self.db_path,
                isolation_level="IMMEDIATE",  # Explicit transactions
                check_same_thread=False,  # Allow multi-threaded access
            )
            self._conn.row_factory = sqlite3.Row  # Dict-like access
            
            # Enable foreign keys
            self._conn.execute("PRAGMA foreign_keys = ON")
            
            # Check for corruption
            self._check_integrity()
            
            # Initialize or verify schema
            self._init_schema()
            
        except sqlite3.Error as e:
            raise StorageError(f"Failed to open storage: {e}") from e
    
    def close(self) -> None:
        """Close database connection."""
        if self._conn:
            self._conn.close()
            self._conn = None
    
    def _check_integrity(self) -> None:
        """
        Check database integrity.
        
        Raises:
            StorageCorruptionError: If corruption detected
        """
        if not self._conn:
            return
        
        try:
            cursor = self._conn.execute("PRAGMA integrity_check")
            result = cursor.fetchone()
            if result and result[0] != "ok":
                raise StorageCorruptionError(
                    f"Database corruption detected: {result[0]}"
                )
        except sqlite3.Error as e:
            raise StorageCorruptionError(
                f"Integrity check failed: {e}"
            ) from e
    
    def _init_schema(self) -> None:
        """
        Initialize database schema or verify existing version.
        
        Raises:
            StorageError: If schema version mismatch (no auto-migration)
        """
        if not self._conn:
            raise StorageError("Storage not opened")
        
        cursor = self._conn.execute("PRAGMA user_version")
        current_version = cursor.fetchone()[0]
        
        if current_version == 0:
            # New database - create schema
            self._create_schema()
            self._conn.execute(f"PRAGMA user_version = {STORAGE_SCHEMA_VERSION}")
            self._conn.commit()
        elif current_version != STORAGE_SCHEMA_VERSION:
            # Version mismatch - fail loudly
            raise StorageError(
                f"Schema version mismatch: expected {STORAGE_SCHEMA_VERSION}, "
                f"found {current_version}. No automatic migration. "
                f"Operator must handle schema evolution."
            )
    
    def _create_schema(self) -> None:
        """Create initial database schema."""
        if not self._conn:
            raise StorageError("Storage not opened")
        
        # Jobs table - one row per job
        self._conn.execute("""
            CREATE TABLE IF NOT EXISTS jobs (
                job_id TEXT PRIMARY KEY,
                final_status TEXT NOT NULL,
                started_at TEXT NOT NULL,
                canonical_proxy_profile TEXT,
                fingerprint TEXT,
                validation_stage TEXT,
                validation_error TEXT,
                engine_used TEXT,
                resolve_preset_used TEXT,
                jobspec_version TEXT,
                completed_at TEXT,
                ingested_at TEXT NOT NULL,
                total_clips INTEGER NOT NULL,
                completed_clips INTEGER NOT NULL,
                failed_clips INTEGER NOT NULL,
                outputs_json TEXT NOT NULL
            )
        """)
        
        # Indexes for common queries
        self._conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_jobs_fingerprint 
            ON jobs(fingerprint) WHERE fingerprint IS NOT NULL
        """)
        
        self._conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_jobs_profile 
            ON jobs(canonical_proxy_profile) 
            WHERE canonical_proxy_profile IS NOT NULL
        """)
        
        self._conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_jobs_status 
            ON jobs(final_status)
        """)
        
        self._conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_jobs_engine 
            ON jobs(engine_used) WHERE engine_used IS NOT NULL
        """)
    
    def persist_job(self, job: IngestedJob) -> None:
        """
        Persist a job to storage.
        
        Idempotent: Same job_id replaces existing record.
        Transactional: All-or-nothing write.
        
        Args:
            job: IngestedJob to persist
        
        Raises:
            StorageError: If write fails
        """
        if not self._conn:
            raise StorageError("Storage not opened")
        
        try:
            self._conn.execute("""
                INSERT OR REPLACE INTO jobs (
                    job_id, final_status, started_at,
                    canonical_proxy_profile, fingerprint,
                    validation_stage, validation_error,
                    engine_used, resolve_preset_used, jobspec_version,
                    completed_at, ingested_at,
                    total_clips, completed_clips, failed_clips,
                    outputs_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                job.job_id,
                job.final_status,
                _serialize_datetime(job.started_at),
                job.canonical_proxy_profile,
                job.fingerprint,
                job.validation_stage,
                job.validation_error,
                job.engine_used,
                job.resolve_preset_used,
                job.jobspec_version,
                _serialize_datetime(job.completed_at),
                _serialize_datetime(job.ingested_at),
                job.total_clips,
                job.completed_clips,
                job.failed_clips,
                _serialize_outputs(job.outputs),
            ))
            self._conn.commit()
        except sqlite3.Error as e:
            self._conn.rollback()
            raise StorageError(f"Failed to persist job {job.job_id}: {e}") from e
    
    def load_all_jobs(self) -> List[IngestedJob]:
        """
        Load all jobs from storage.
        
        Returns jobs in insertion order (by ingested_at).
        
        Returns:
            List of all persisted IngestedJobs
        
        Raises:
            StorageError: If read fails
        """
        if not self._conn:
            raise StorageError("Storage not opened")
        
        try:
            cursor = self._conn.execute("""
                SELECT 
                    job_id, final_status, started_at,
                    canonical_proxy_profile, fingerprint,
                    validation_stage, validation_error,
                    engine_used, resolve_preset_used, jobspec_version,
                    completed_at, ingested_at,
                    total_clips, completed_clips, failed_clips,
                    outputs_json
                FROM jobs
                ORDER BY ingested_at ASC
            """)
            
            jobs = []
            for row in cursor:
                jobs.append(IngestedJob(
                    job_id=row["job_id"],
                    final_status=row["final_status"],
                    started_at=_deserialize_datetime(row["started_at"]),
                    canonical_proxy_profile=row["canonical_proxy_profile"],
                    fingerprint=row["fingerprint"],
                    validation_stage=row["validation_stage"],
                    validation_error=row["validation_error"],
                    engine_used=row["engine_used"],
                    resolve_preset_used=row["resolve_preset_used"],
                    jobspec_version=row["jobspec_version"],
                    completed_at=_deserialize_datetime(row["completed_at"]),
                    ingested_at=_deserialize_datetime(row["ingested_at"]),
                    total_clips=row["total_clips"],
                    completed_clips=row["completed_clips"],
                    failed_clips=row["failed_clips"],
                    outputs=_deserialize_outputs(row["outputs_json"]),
                ))
            
            return jobs
            
        except sqlite3.Error as e:
            raise StorageError(f"Failed to load jobs: {e}") from e
        except (json.JSONDecodeError, KeyError) as e:
            raise StorageError(f"Failed to deserialize job data: {e}") from e
    
    def get_schema_version(self) -> int:
        """
        Get current schema version.
        
        Returns:
            Schema version number
        """
        if not self._conn:
            raise StorageError("Storage not opened")
        
        cursor = self._conn.execute("PRAGMA user_version")
        return cursor.fetchone()[0]
    
    def __enter__(self):
        """Context manager entry."""
        self.open()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.close()
