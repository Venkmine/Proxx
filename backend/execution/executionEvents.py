"""
Execution Event Timeline.

Deterministic, ordered record of execution events per job.
Events are observational—they explain what happened, without altering behavior.

This is not telemetry. This is truth.

Design rules (INTENT.md compliant):
- Events are append-only, immutable
- Event capture NEVER gates execution
- Event failure NEVER halts execution
- Events are persisted with diagnostics
- Events are read-only in the UI
"""

from enum import Enum
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


class ExecutionEventType(str, Enum):
    """
    Execution event types (lifecycle-ordered).
    
    These describe what happened during job execution, in order.
    They do NOT control execution—they observe it.
    """
    
    # Job lifecycle
    JOB_CREATED = "job_created"
    VALIDATION_STARTED = "validation_started"
    VALIDATION_PASSED = "validation_passed"
    VALIDATION_FAILED = "validation_failed"
    EXECUTION_STARTED = "execution_started"
    EXECUTION_PAUSED = "execution_paused"
    EXECUTION_RESUMED = "execution_resumed"
    EXECUTION_CANCELLED = "execution_cancelled"
    EXECUTION_COMPLETED = "execution_completed"
    EXECUTION_FAILED = "execution_failed"
    
    # Clip lifecycle
    CLIP_QUEUED = "clip_queued"
    CLIP_STARTED = "clip_started"
    CLIP_ENCODING = "clip_encoding"
    CLIP_VERIFYING = "clip_verifying"
    CLIP_COMPLETED = "clip_completed"
    CLIP_FAILED = "clip_failed"
    CLIP_SKIPPED = "clip_skipped"
    
    # Path resolution (INC-003 collision detection)
    OUTPUT_RESOLVED = "output_resolved"
    OUTPUT_COLLISION = "output_collision"
    
    # Recovery
    JOB_RECOVERY_REQUIRED = "job_recovery_required"


class ExecutionEvent(BaseModel):
    """
    Single execution event.
    
    Immutable once created. Appended to job's event timeline in order.
    """
    
    model_config = ConfigDict(extra="forbid")
    
    # Event identity
    event_type: ExecutionEventType
    timestamp: datetime = Field(default_factory=datetime.now)
    
    # Optional context
    clip_id: Optional[str] = None
    message: Optional[str] = None
    
    def __str__(self) -> str:
        """Human-readable event description."""
        parts = [f"[{self.timestamp.isoformat()}]", self.event_type.value]
        if self.clip_id:
            parts.append(f"(clip: {self.clip_id[:8]})")
        if self.message:
            parts.append(f"- {self.message}")
        return " ".join(parts)


class ExecutionEventRecorder:
    """
    Non-invasive event recorder for job execution.
    
    Captures events in order. If recording fails, execution continues.
    This recorder is for observability, not control.
    """
    
    def __init__(self):
        """Initialize empty event timeline."""
        self._events: List[ExecutionEvent] = []
    
    def record(
        self,
        event_type: ExecutionEventType,
        clip_id: Optional[str] = None,
        message: Optional[str] = None,
    ) -> None:
        """
        Record an execution event.
        
        CRITICAL: This method NEVER raises exceptions. If recording fails,
        execution must continue.
        
        Args:
            event_type: Type of event
            clip_id: Optional clip context
            message: Optional human-readable message
        """
        try:
            event = ExecutionEvent(
                event_type=event_type,
                clip_id=clip_id,
                message=message,
            )
            self._events.append(event)
        except Exception:
            # Silent failure - event recording NEVER gates execution
            pass
    
    def get_events(self) -> List[ExecutionEvent]:
        """
        Get all recorded events in order.
        
        Returns:
            List of ExecutionEvent objects (chronologically ordered)
        """
        return self._events.copy()
    
    def get_events_for_clip(self, clip_id: str) -> List[ExecutionEvent]:
        """
        Get all events for a specific clip.
        
        Args:
            clip_id: Clip ID to filter by
            
        Returns:
            List of ExecutionEvent objects for that clip
        """
        return [e for e in self._events if e.clip_id == clip_id]
    
    def clear(self) -> None:
        """Clear all events (for testing only)."""
        self._events.clear()
