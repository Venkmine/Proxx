"""
Forge Monitor - Event Model

Defines immutable event types for job observability.
All events are timestamped at creation and cannot be modified.

This module provides OBSERVATION ONLY.
Events are append-only records of what has occurred.
"""

from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, Optional, List
import uuid


class JobType(str, Enum):
    """Type of job being monitored."""
    PROXY = "proxy"


class ExecutionEngine(str, Enum):
    """Execution engine used for processing."""
    RESOLVE = "resolve"
    FFMPEG = "ffmpeg"


class JobStatus(str, Enum):
    """Current status of a job."""
    QUEUED = "queued"
    RUNNING = "running"
    FAILED = "failed"
    COMPLETED = "completed"


class EventType(str, Enum):
    """Types of observable events."""
    JOB_CREATED = "job_created"
    ENGINE_SELECTED = "engine_selected"
    EXECUTION_STARTED = "execution_started"
    PROGRESS_UPDATE = "progress_update"
    EXECUTION_FAILED = "execution_failed"
    EXECUTION_COMPLETED = "execution_completed"


# Terminal states - no mutations allowed after reaching these
TERMINAL_STATES = frozenset({JobStatus.FAILED, JobStatus.COMPLETED})


@dataclass(frozen=True)
class MonitorEvent:
    """
    Immutable event record.
    
    Once created, events cannot be modified.
    The frozen=True ensures immutability at the Python level.
    """
    event_id: str
    event_type: EventType
    job_id: str
    timestamp: str  # ISO 8601 format, always UTC
    worker_id: str
    payload: Dict[str, Any] = field(default_factory=dict)
    
    @classmethod
    def create(
        cls,
        event_type: EventType,
        job_id: str,
        worker_id: str,
        payload: Optional[Dict[str, Any]] = None
    ) -> "MonitorEvent":
        """Create a new immutable event with auto-generated ID and timestamp."""
        return cls(
            event_id=str(uuid.uuid4()),
            event_type=event_type,
            job_id=job_id,
            timestamp=datetime.now(timezone.utc).isoformat(),
            worker_id=worker_id,
            payload=payload or {}
        )
    
    def to_dict(self) -> Dict[str, Any]:
        """Serialize event to dictionary."""
        return {
            "event_id": self.event_id,
            "event_type": self.event_type.value if isinstance(self.event_type, EventType) else self.event_type,
            "job_id": self.job_id,
            "timestamp": self.timestamp,
            "worker_id": self.worker_id,
            "payload": self.payload
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "MonitorEvent":
        """Deserialize event from dictionary."""
        return cls(
            event_id=data["event_id"],
            event_type=EventType(data["event_type"]) if isinstance(data["event_type"], str) else data["event_type"],
            job_id=data["job_id"],
            timestamp=data["timestamp"],
            worker_id=data["worker_id"],
            payload=data.get("payload", {})
        )


@dataclass(frozen=True)
class JobRecord:
    """
    Immutable snapshot of job state.
    
    This represents the current observed state of a job.
    Once a job reaches a terminal state, no further updates are recorded.
    """
    job_id: str
    job_type: JobType
    engine: Optional[ExecutionEngine]
    status: JobStatus
    start_time: str  # ISO 8601 format, always UTC
    end_time: Optional[str]  # ISO 8601 format, always UTC, null if still running
    failure_reason: Optional[str]
    burnin_preset_id: Optional[str]
    lut_id: Optional[str]
    worker_id: str
    verification_run_id: Optional[str]
    source_path: Optional[str] = None
    output_path: Optional[str] = None
    
    def is_terminal(self) -> bool:
        """Check if job has reached a terminal state."""
        return self.status in TERMINAL_STATES
    
    def to_dict(self) -> Dict[str, Any]:
        """Serialize job record to dictionary."""
        return {
            "job_id": self.job_id,
            "job_type": self.job_type.value if isinstance(self.job_type, JobType) else self.job_type,
            "engine": self.engine.value if self.engine else None,
            "status": self.status.value if isinstance(self.status, JobStatus) else self.status,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "failure_reason": self.failure_reason,
            "burnin_preset_id": self.burnin_preset_id,
            "lut_id": self.lut_id,
            "worker_id": self.worker_id,
            "verification_run_id": self.verification_run_id,
            "source_path": self.source_path,
            "output_path": self.output_path
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "JobRecord":
        """Deserialize job record from dictionary."""
        return cls(
            job_id=data["job_id"],
            job_type=JobType(data["job_type"]) if isinstance(data["job_type"], str) else data["job_type"],
            engine=ExecutionEngine(data["engine"]) if data.get("engine") else None,
            status=JobStatus(data["status"]) if isinstance(data["status"], str) else data["status"],
            start_time=data["start_time"],
            end_time=data.get("end_time"),
            failure_reason=data.get("failure_reason"),
            burnin_preset_id=data.get("burnin_preset_id"),
            lut_id=data.get("lut_id"),
            worker_id=data["worker_id"],
            verification_run_id=data.get("verification_run_id"),
            source_path=data.get("source_path"),
            output_path=data.get("output_path")
        )


@dataclass(frozen=True)
class WorkerStatus:
    """
    Immutable snapshot of worker state.
    
    Represents the last known state of a worker.
    """
    worker_id: str
    status: str  # "idle", "busy", "offline"
    last_seen: str  # ISO 8601 format, always UTC
    current_job_id: Optional[str]
    hostname: Optional[str]
    
    def to_dict(self) -> Dict[str, Any]:
        """Serialize worker status to dictionary."""
        return {
            "worker_id": self.worker_id,
            "status": self.status,
            "last_seen": self.last_seen,
            "current_job_id": self.current_job_id,
            "hostname": self.hostname
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "WorkerStatus":
        """Deserialize worker status from dictionary."""
        return cls(
            worker_id=data["worker_id"],
            status=data["status"],
            last_seen=data["last_seen"],
            current_job_id=data.get("current_job_id"),
            hostname=data.get("hostname")
        )
