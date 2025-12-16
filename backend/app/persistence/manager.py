"""
SQLite persistence manager for Proxx state.

Phase 12: Single-file SQLite database.
Explicit save/load only - no auto-persistence.
"""

import sqlite3
import json
from pathlib import Path
from typing import List, Dict, Optional, Set
from datetime import datetime
from contextlib import contextmanager

from .errors import PersistenceError, SchemaError, LoadError, SaveError


# Database schema version for migrations
SCHEMA_VERSION = 1


class PersistenceManager:
    """
    Manages SQLite persistence for Proxx state.
    
    Stores:
    - Jobs and ClipTasks
    - Preset bindings (job_id → preset_id)
    - Watch folder configurations
    - Processed files tracking
    
    Does NOT store:
    - Preset definitions (remain file-based)
    - ExecutionResult internals
    - Transient timing data
    """
    
    def __init__(self, db_path: Optional[str] = None):
        """
        Initialize persistence manager.
        
        Args:
            db_path: Path to SQLite database file (defaults to ./proxx.db)
        """
        if db_path is None:
            db_path = str(Path.cwd() / "proxx.db")
        
        self.db_path = db_path
        self._ensure_schema()
    
    @contextmanager
    def _connect(self):
        """Context manager for database connections."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row  # Access columns by name
        try:
            yield conn
            conn.commit()
        except Exception as e:
            conn.rollback()
            raise PersistenceError(f"Database operation failed: {e}") from e
        finally:
            conn.close()
    
    def _ensure_schema(self):
        """Create schema if it doesn't exist."""
        with self._connect() as conn:
            cursor = conn.cursor()
            
            # Schema version tracking
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS schema_version (
                    version INTEGER PRIMARY KEY,
                    applied_at TEXT NOT NULL
                )
            """)
            
            # Check current version
            cursor.execute("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1")
            row = cursor.fetchone()
            current_version = row[0] if row else 0
            
            if current_version < SCHEMA_VERSION:
                self._migrate_schema(conn, current_version)
    
    def _migrate_schema(self, conn, from_version: int):
        """Apply schema migrations."""
        cursor = conn.cursor()
        
        if from_version < 1:
            # Initial schema
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS jobs (
                    id TEXT PRIMARY KEY,
                    created_at TEXT NOT NULL,
                    started_at TEXT,
                    completed_at TEXT,
                    status TEXT NOT NULL
                )
            """)
            
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS clip_tasks (
                    id TEXT PRIMARY KEY,
                    job_id TEXT NOT NULL,
                    source_path TEXT NOT NULL,
                    status TEXT NOT NULL,
                    started_at TEXT,
                    completed_at TEXT,
                    failure_reason TEXT,
                    warnings TEXT,
                    retry_count INTEGER DEFAULT 0,
                    FOREIGN KEY (job_id) REFERENCES jobs (id) ON DELETE CASCADE
                )
            """)
            
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_clip_tasks_job_id 
                ON clip_tasks (job_id)
            """)
            
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS preset_bindings (
                    job_id TEXT PRIMARY KEY,
                    preset_id TEXT NOT NULL,
                    bound_at TEXT NOT NULL,
                    FOREIGN KEY (job_id) REFERENCES jobs (id) ON DELETE CASCADE
                )
            """)
            
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS watch_folders (
                    id TEXT PRIMARY KEY,
                    path TEXT NOT NULL UNIQUE,
                    enabled INTEGER NOT NULL,
                    recursive INTEGER NOT NULL,
                    preset_id TEXT,
                    auto_execute INTEGER NOT NULL,
                    created_at TEXT NOT NULL
                )
            """)
            
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS processed_files (
                    file_path TEXT PRIMARY KEY,
                    watch_folder_id TEXT NOT NULL,
                    processed_at TEXT NOT NULL,
                    FOREIGN KEY (watch_folder_id) REFERENCES watch_folders (id) ON DELETE CASCADE
                )
            """)
            
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_processed_files_watch_folder 
                ON processed_files (watch_folder_id)
            """)
            
            # Record migration
            cursor.execute(
                "INSERT INTO schema_version (version, applied_at) VALUES (?, ?)",
                (1, datetime.now().isoformat())
            )
    
    # Job persistence
    
    def save_job(self, job_data: Dict):
        """
        Save or update a job and its tasks.
        
        Args:
            job_data: Dict with keys: id, created_at, started_at, completed_at, status, tasks
        """
        with self._connect() as conn:
            cursor = conn.cursor()
            
            # Upsert job
            cursor.execute("""
                INSERT INTO jobs (id, created_at, started_at, completed_at, status)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    started_at = excluded.started_at,
                    completed_at = excluded.completed_at,
                    status = excluded.status
            """, (
                job_data["id"],
                job_data["created_at"],
                job_data.get("started_at"),
                job_data.get("completed_at"),
                job_data["status"],
            ))
            
            # Delete existing tasks for this job
            cursor.execute("DELETE FROM clip_tasks WHERE job_id = ?", (job_data["id"],))
            
            # Insert tasks
            for task in job_data.get("tasks", []):
                cursor.execute("""
                    INSERT INTO clip_tasks (
                        id, job_id, source_path, status,
                        started_at, completed_at, failure_reason, warnings, retry_count
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    task["id"],
                    job_data["id"],
                    task["source_path"],
                    task["status"],
                    task.get("started_at"),
                    task.get("completed_at"),
                    task.get("failure_reason"),
                    json.dumps(task.get("warnings", [])),
                    task.get("retry_count", 0),
                ))
    
    def load_job(self, job_id: str) -> Optional[Dict]:
        """
        Load a job and its tasks.
        
        Args:
            job_id: Job ID
            
        Returns:
            Dict with job data or None if not found
        """
        with self._connect() as conn:
            cursor = conn.cursor()
            
            # Load job
            cursor.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
            job_row = cursor.fetchone()
            
            if not job_row:
                return None
            
            # Load tasks
            cursor.execute("SELECT * FROM clip_tasks WHERE job_id = ?", (job_id,))
            task_rows = cursor.fetchall()
            
            return {
                "id": job_row["id"],
                "created_at": job_row["created_at"],
                "started_at": job_row["started_at"],
                "completed_at": job_row["completed_at"],
                "status": job_row["status"],
                "tasks": [
                    {
                        "id": task["id"],
                        "source_path": task["source_path"],
                        "status": task["status"],
                        "started_at": task["started_at"],
                        "completed_at": task["completed_at"],
                        "failure_reason": task["failure_reason"],
                        "warnings": json.loads(task["warnings"]) if task["warnings"] else [],
                        "retry_count": task["retry_count"],
                    }
                    for task in task_rows
                ],
            }
    
    def load_all_jobs(self) -> List[Dict]:
        """
        Load all persisted jobs.
        
        Returns:
            List of job dicts
        """
        with self._connect() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM jobs")
            job_ids = [row["id"] for row in cursor.fetchall()]
        
        return [self.load_job(job_id) for job_id in job_ids]
    
    def delete_job(self, job_id: str):
        """Delete a job and its tasks."""
        with self._connect() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
    
    # Preset binding persistence
    
    def save_preset_binding(self, job_id: str, preset_id: str):
        """Save a job-preset binding."""
        with self._connect() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO preset_bindings (job_id, preset_id, bound_at)
                VALUES (?, ?, ?)
                ON CONFLICT(job_id) DO UPDATE SET
                    preset_id = excluded.preset_id,
                    bound_at = excluded.bound_at
            """, (job_id, preset_id, datetime.now().isoformat()))
    
    def load_preset_binding(self, job_id: str) -> Optional[str]:
        """Load preset binding for a job."""
        with self._connect() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT preset_id FROM preset_bindings WHERE job_id = ?", (job_id,))
            row = cursor.fetchone()
            return row["preset_id"] if row else None
    
    def load_all_preset_bindings(self) -> Dict[str, str]:
        """Load all preset bindings as job_id → preset_id dict."""
        with self._connect() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT job_id, preset_id FROM preset_bindings")
            return {row["job_id"]: row["preset_id"] for row in cursor.fetchall()}
    
    def delete_preset_binding(self, job_id: str):
        """Delete a preset binding."""
        with self._connect() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM preset_bindings WHERE job_id = ?", (job_id,))
    
    # Watch folder persistence
    
    def save_watch_folder(self, watch_folder_data: Dict):
        """
        Save or update a watch folder configuration.
        
        Args:
            watch_folder_data: Dict with keys: id, path, enabled, recursive, preset_id, auto_execute, created_at
        """
        with self._connect() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO watch_folders (id, path, enabled, recursive, preset_id, auto_execute, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    path = excluded.path,
                    enabled = excluded.enabled,
                    recursive = excluded.recursive,
                    preset_id = excluded.preset_id,
                    auto_execute = excluded.auto_execute
            """, (
                watch_folder_data["id"],
                watch_folder_data["path"],
                1 if watch_folder_data["enabled"] else 0,
                1 if watch_folder_data["recursive"] else 0,
                watch_folder_data.get("preset_id"),
                1 if watch_folder_data["auto_execute"] else 0,
                watch_folder_data["created_at"],
            ))
    
    def load_watch_folder(self, watch_folder_id: str) -> Optional[Dict]:
        """Load a watch folder configuration."""
        with self._connect() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM watch_folders WHERE id = ?", (watch_folder_id,))
            row = cursor.fetchone()
            
            if not row:
                return None
            
            return {
                "id": row["id"],
                "path": row["path"],
                "enabled": bool(row["enabled"]),
                "recursive": bool(row["recursive"]),
                "preset_id": row["preset_id"],
                "auto_execute": bool(row["auto_execute"]),
                "created_at": row["created_at"],
            }
    
    def load_all_watch_folders(self) -> List[Dict]:
        """Load all watch folder configurations."""
        with self._connect() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM watch_folders")
            
            return [
                {
                    "id": row["id"],
                    "path": row["path"],
                    "enabled": bool(row["enabled"]),
                    "recursive": bool(row["recursive"]),
                    "preset_id": row["preset_id"],
                    "auto_execute": bool(row["auto_execute"]),
                    "created_at": row["created_at"],
                }
                for row in cursor.fetchall()
            ]
    
    def delete_watch_folder(self, watch_folder_id: str):
        """Delete a watch folder configuration."""
        with self._connect() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM watch_folders WHERE id = ?", (watch_folder_id,))
    
    # Processed files tracking
    
    def save_processed_file(self, watch_folder_id: str, file_path: str):
        """Mark a file as processed."""
        with self._connect() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO processed_files (file_path, watch_folder_id, processed_at)
                VALUES (?, ?, ?)
                ON CONFLICT(file_path) DO NOTHING
            """, (file_path, watch_folder_id, datetime.now().isoformat()))
    
    def is_file_processed(self, file_path: str) -> bool:
        """Check if a file has been processed."""
        with self._connect() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT 1 FROM processed_files WHERE file_path = ?", (file_path,))
            return cursor.fetchone() is not None
    
    def load_processed_files(self, watch_folder_id: Optional[str] = None) -> Set[str]:
        """
        Load set of processed file paths.
        
        Args:
            watch_folder_id: Optional filter by watch folder
            
        Returns:
            Set of processed file paths
        """
        with self._connect() as conn:
            cursor = conn.cursor()
            
            if watch_folder_id:
                cursor.execute(
                    "SELECT file_path FROM processed_files WHERE watch_folder_id = ?",
                    (watch_folder_id,)
                )
            else:
                cursor.execute("SELECT file_path FROM processed_files")
            
            return {row["file_path"] for row in cursor.fetchall()}
    
    def clear_processed_files(self, watch_folder_id: str):
        """Clear processed files for a watch folder."""
        with self._connect() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM processed_files WHERE watch_folder_id = ?", (watch_folder_id,))
