"""
Forge Monitor - Append-Only State Store

Provides persistent storage for job records and events.
This store is strictly append-only - no deletions, no updates to finalized records.

Storage Strategy:
- SQLite for durability and crash recovery
- WAL mode for concurrent reads
- No DELETE operations
- No UPDATE after terminal state

This module provides OBSERVATION ONLY.
"""

import json
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Generator, List, Optional

from .event_model import (
    EventType,
    ExecutionEngine,
    JobRecord,
    JobStatus,
    JobType,
    MonitorEvent,
    TERMINAL_STATES,
    WorkerStatus,
)


class StateStoreError(Exception):
    """Base exception for state store errors."""
    pass


class TerminalStateViolation(StateStoreError):
    """Raised when attempting to modify a job in terminal state."""
    pass


class StateStore:
    """
    Append-only state store for job monitoring.
    
    This store:
    - Records events immutably
    - Maintains current job state snapshots
    - Tracks worker heartbeats
    - Survives crashes and restarts
    
    It does NOT:
    - Delete records
    - Modify events after creation
    - Update jobs after terminal state
    """
    
    DEFAULT_DB_PATH = Path("forge_monitor.db")
    
    def __init__(self, db_path: Optional[Path] = None):
        """
        Initialize the state store.
        
        Args:
            db_path: Path to SQLite database. Defaults to forge_monitor.db
        """
        self.db_path = db_path or self.DEFAULT_DB_PATH
        self._local = threading.local()
        self._init_schema()
    
    def _get_connection(self) -> sqlite3.Connection:
        """Get thread-local database connection."""
        if not hasattr(self._local, "connection") or self._local.connection is None:
            conn = sqlite3.connect(str(self.db_path), check_same_thread=False)
            conn.row_factory = sqlite3.Row
            # Enable WAL mode for better concurrent read performance
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=NORMAL")
            self._local.connection = conn
        return self._local.connection
    
    @contextmanager
    def _cursor(self) -> Generator[sqlite3.Cursor, None, None]:
        """Context manager for database cursor with auto-commit."""
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            yield cursor
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            cursor.close()
    
    def _init_schema(self) -> None:
        """Initialize database schema if not exists."""
        with self._cursor() as cursor:
            # Events table - append only, never updated or deleted
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS events (
                    event_id TEXT PRIMARY KEY,
                    event_type TEXT NOT NULL,
                    job_id TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    worker_id TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_events_job_id ON events(job_id)
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp)
            """)
            
            # Jobs table - current state snapshots
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS jobs (
                    job_id TEXT PRIMARY KEY,
                    job_type TEXT NOT NULL,
                    engine TEXT,
                    status TEXT NOT NULL,
                    start_time TEXT NOT NULL,
                    end_time TEXT,
                    failure_reason TEXT,
                    burnin_preset_id TEXT,
                    lut_id TEXT,
                    worker_id TEXT NOT NULL,
                    verification_run_id TEXT,
                    source_path TEXT,
                    output_path TEXT,
                    is_terminal INTEGER DEFAULT 0,
                    last_updated TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_jobs_worker ON jobs(worker_id)
            """)
            
            # Workers table - heartbeat tracking
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS workers (
                    worker_id TEXT PRIMARY KEY,
                    status TEXT NOT NULL,
                    last_seen TEXT NOT NULL,
                    current_job_id TEXT,
                    hostname TEXT
                )
            """)
    
    # =========================================================================
    # EVENT OPERATIONS (Append-Only)
    # =========================================================================
    
    def record_event(self, event: MonitorEvent) -> None:
        """
        Record an event. Events are immutable once recorded.
        
        Args:
            event: The event to record
        """
        with self._cursor() as cursor:
            cursor.execute("""
                INSERT INTO events (event_id, event_type, job_id, timestamp, worker_id, payload)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (
                event.event_id,
                event.event_type.value if isinstance(event.event_type, EventType) else event.event_type,
                event.job_id,
                event.timestamp,
                event.worker_id,
                json.dumps(event.payload)
            ))
    
    def get_events_for_job(self, job_id: str) -> List[MonitorEvent]:
        """
        Get all events for a specific job, ordered by timestamp.
        
        Args:
            job_id: The job ID to query
            
        Returns:
            List of events in chronological order
        """
        with self._cursor() as cursor:
            cursor.execute("""
                SELECT event_id, event_type, job_id, timestamp, worker_id, payload
                FROM events
                WHERE job_id = ?
                ORDER BY timestamp ASC
            """, (job_id,))
            rows = cursor.fetchall()
            
        return [
            MonitorEvent(
                event_id=row["event_id"],
                event_type=EventType(row["event_type"]),
                job_id=row["job_id"],
                timestamp=row["timestamp"],
                worker_id=row["worker_id"],
                payload=json.loads(row["payload"])
            )
            for row in rows
        ]
    
    def get_recent_events(self, limit: int = 100) -> List[MonitorEvent]:
        """
        Get most recent events across all jobs.
        
        Args:
            limit: Maximum number of events to return
            
        Returns:
            List of events in reverse chronological order
        """
        with self._cursor() as cursor:
            cursor.execute("""
                SELECT event_id, event_type, job_id, timestamp, worker_id, payload
                FROM events
                ORDER BY timestamp DESC
                LIMIT ?
            """, (limit,))
            rows = cursor.fetchall()
            
        return [
            MonitorEvent(
                event_id=row["event_id"],
                event_type=EventType(row["event_type"]),
                job_id=row["job_id"],
                timestamp=row["timestamp"],
                worker_id=row["worker_id"],
                payload=json.loads(row["payload"])
            )
            for row in rows
        ]
    
    # =========================================================================
    # JOB OPERATIONS (Read + Append-Only Updates)
    # =========================================================================
    
    def create_job(self, job: JobRecord) -> None:
        """
        Create a new job record.
        
        Args:
            job: The job record to create
        """
        with self._cursor() as cursor:
            cursor.execute("""
                INSERT INTO jobs (
                    job_id, job_type, engine, status, start_time, end_time,
                    failure_reason, burnin_preset_id, lut_id, worker_id,
                    verification_run_id, source_path, output_path, is_terminal
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                job.job_id,
                job.job_type.value if isinstance(job.job_type, JobType) else job.job_type,
                job.engine.value if job.engine else None,
                job.status.value if isinstance(job.status, JobStatus) else job.status,
                job.start_time,
                job.end_time,
                job.failure_reason,
                job.burnin_preset_id,
                job.lut_id,
                job.worker_id,
                job.verification_run_id,
                job.source_path,
                job.output_path,
                1 if job.is_terminal() else 0
            ))
        
        # Also record job_created event
        event = MonitorEvent.create(
            event_type=EventType.JOB_CREATED,
            job_id=job.job_id,
            worker_id=job.worker_id,
            payload={"source_path": job.source_path}
        )
        self.record_event(event)
    
    def update_job_status(
        self,
        job_id: str,
        status: JobStatus,
        engine: Optional[ExecutionEngine] = None,
        end_time: Optional[str] = None,
        failure_reason: Optional[str] = None,
        output_path: Optional[str] = None
    ) -> None:
        """
        Update job status. Fails if job is already in terminal state.
        
        Args:
            job_id: The job to update
            status: New status
            engine: Engine used (if being set)
            end_time: Completion time (if terminal)
            failure_reason: Failure reason (if failed)
            output_path: Output path (if completed)
            
        Raises:
            TerminalStateViolation: If job is already terminal
        """
        with self._cursor() as cursor:
            # Check if job is already terminal
            cursor.execute(
                "SELECT is_terminal FROM jobs WHERE job_id = ?",
                (job_id,)
            )
            row = cursor.fetchone()
            if row and row["is_terminal"]:
                raise TerminalStateViolation(
                    f"Cannot update job {job_id}: already in terminal state"
                )
            
            # Build update query dynamically
            updates = ["status = ?", "is_terminal = ?", "last_updated = ?"]
            values = [
                status.value if isinstance(status, JobStatus) else status,
                1 if status in TERMINAL_STATES else 0,
                datetime.now(timezone.utc).isoformat()
            ]
            
            if engine is not None:
                updates.append("engine = ?")
                values.append(engine.value if isinstance(engine, ExecutionEngine) else engine)
            
            if end_time is not None:
                updates.append("end_time = ?")
                values.append(end_time)
            
            if failure_reason is not None:
                updates.append("failure_reason = ?")
                values.append(failure_reason)
            
            if output_path is not None:
                updates.append("output_path = ?")
                values.append(output_path)
            
            values.append(job_id)
            
            cursor.execute(
                f"UPDATE jobs SET {', '.join(updates)} WHERE job_id = ?",
                values
            )
    
    def get_job(self, job_id: str) -> Optional[JobRecord]:
        """
        Get a job by ID.
        
        Args:
            job_id: The job ID to query
            
        Returns:
            JobRecord if found, None otherwise
        """
        with self._cursor() as cursor:
            cursor.execute("""
                SELECT job_id, job_type, engine, status, start_time, end_time,
                       failure_reason, burnin_preset_id, lut_id, worker_id,
                       verification_run_id, source_path, output_path
                FROM jobs
                WHERE job_id = ?
            """, (job_id,))
            row = cursor.fetchone()
            
        if not row:
            return None
            
        return JobRecord(
            job_id=row["job_id"],
            job_type=JobType(row["job_type"]),
            engine=ExecutionEngine(row["engine"]) if row["engine"] else None,
            status=JobStatus(row["status"]),
            start_time=row["start_time"],
            end_time=row["end_time"],
            failure_reason=row["failure_reason"],
            burnin_preset_id=row["burnin_preset_id"],
            lut_id=row["lut_id"],
            worker_id=row["worker_id"],
            verification_run_id=row["verification_run_id"],
            source_path=row["source_path"],
            output_path=row["output_path"]
        )
    
    def get_jobs(
        self,
        status: Optional[JobStatus] = None,
        worker_id: Optional[str] = None,
        limit: int = 100
    ) -> List[JobRecord]:
        """
        Get jobs with optional filtering.
        
        Args:
            status: Filter by status
            worker_id: Filter by worker
            limit: Maximum results
            
        Returns:
            List of matching jobs
        """
        with self._cursor() as cursor:
            query = """
                SELECT job_id, job_type, engine, status, start_time, end_time,
                       failure_reason, burnin_preset_id, lut_id, worker_id,
                       verification_run_id, source_path, output_path
                FROM jobs
            """
            conditions = []
            values = []
            
            if status is not None:
                conditions.append("status = ?")
                values.append(status.value if isinstance(status, JobStatus) else status)
            
            if worker_id is not None:
                conditions.append("worker_id = ?")
                values.append(worker_id)
            
            if conditions:
                query += " WHERE " + " AND ".join(conditions)
            
            query += " ORDER BY start_time DESC LIMIT ?"
            values.append(limit)
            
            cursor.execute(query, values)
            rows = cursor.fetchall()
        
        return [
            JobRecord(
                job_id=row["job_id"],
                job_type=JobType(row["job_type"]),
                engine=ExecutionEngine(row["engine"]) if row["engine"] else None,
                status=JobStatus(row["status"]),
                start_time=row["start_time"],
                end_time=row["end_time"],
                failure_reason=row["failure_reason"],
                burnin_preset_id=row["burnin_preset_id"],
                lut_id=row["lut_id"],
                worker_id=row["worker_id"],
                verification_run_id=row["verification_run_id"],
                source_path=row["source_path"],
                output_path=row["output_path"]
            )
            for row in rows
        ]
    
    def get_active_jobs(self) -> List[JobRecord]:
        """Get all non-terminal jobs."""
        return [
            j for j in self.get_jobs()
            if j.status in (JobStatus.QUEUED, JobStatus.RUNNING)
        ]
    
    def get_failed_jobs(self, limit: int = 50) -> List[JobRecord]:
        """Get failed jobs."""
        return self.get_jobs(status=JobStatus.FAILED, limit=limit)
    
    def get_completed_jobs(self, limit: int = 50) -> List[JobRecord]:
        """Get completed jobs."""
        return self.get_jobs(status=JobStatus.COMPLETED, limit=limit)
    
    # =========================================================================
    # WORKER OPERATIONS
    # =========================================================================
    
    def update_worker(self, worker: WorkerStatus) -> None:
        """
        Update or insert worker status.
        
        Args:
            worker: The worker status to record
        """
        with self._cursor() as cursor:
            cursor.execute("""
                INSERT OR REPLACE INTO workers (worker_id, status, last_seen, current_job_id, hostname)
                VALUES (?, ?, ?, ?, ?)
            """, (
                worker.worker_id,
                worker.status,
                worker.last_seen,
                worker.current_job_id,
                worker.hostname
            ))
    
    def get_worker(self, worker_id: str) -> Optional[WorkerStatus]:
        """Get worker by ID."""
        with self._cursor() as cursor:
            cursor.execute("""
                SELECT worker_id, status, last_seen, current_job_id, hostname
                FROM workers
                WHERE worker_id = ?
            """, (worker_id,))
            row = cursor.fetchone()
        
        if not row:
            return None
            
        return WorkerStatus(
            worker_id=row["worker_id"],
            status=row["status"],
            last_seen=row["last_seen"],
            current_job_id=row["current_job_id"],
            hostname=row["hostname"]
        )
    
    def get_all_workers(self) -> List[WorkerStatus]:
        """Get all known workers."""
        with self._cursor() as cursor:
            cursor.execute("""
                SELECT worker_id, status, last_seen, current_job_id, hostname
                FROM workers
                ORDER BY last_seen DESC
            """)
            rows = cursor.fetchall()
        
        return [
            WorkerStatus(
                worker_id=row["worker_id"],
                status=row["status"],
                last_seen=row["last_seen"],
                current_job_id=row["current_job_id"],
                hostname=row["hostname"]
            )
            for row in rows
        ]
    
    # =========================================================================
    # STATISTICS (Read-Only)
    # =========================================================================
    
    def get_job_counts(self) -> Dict[str, int]:
        """Get count of jobs by status."""
        with self._cursor() as cursor:
            cursor.execute("""
                SELECT status, COUNT(*) as count
                FROM jobs
                GROUP BY status
            """)
            rows = cursor.fetchall()
        
        return {row["status"]: row["count"] for row in rows}
    
    def close(self) -> None:
        """Close database connection."""
        if hasattr(self._local, "connection") and self._local.connection:
            self._local.connection.close()
            self._local.connection = None


# Module-level singleton for convenience
_default_store: Optional[StateStore] = None


def get_store(db_path: Optional[Path] = None) -> StateStore:
    """Get or create the default state store singleton."""
    global _default_store
    if _default_store is None:
        _default_store = StateStore(db_path)
    return _default_store
