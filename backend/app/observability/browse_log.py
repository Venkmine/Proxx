"""
Browse event logging.

V1 OBSERVABILITY: Logs every browse attempt with explicit success/failure states.
Used for debugging filesystem access issues, especially with /Volumes.

Design principles:
- Log every browse attempt (even if job not created)
- Explicit error payload with type, message, path
- In-memory ring buffer (last 200 events)
- No persistent storage (debug only)
"""

import logging
from datetime import datetime
from typing import Optional, List, Dict, Any
from collections import deque
from enum import Enum
from pydantic import BaseModel, ConfigDict

logger = logging.getLogger(__name__)

# Maximum browse events to keep in memory
MAX_BROWSE_EVENTS = 200


class BrowseEventType(str, Enum):
    """Types of browse events."""
    
    ROOTS_REQUESTED = "roots_requested"  # Root volumes listing started
    ROOTS_RESPONSE = "roots_response"  # Root volumes listing completed
    BROWSE_REQUESTED = "browse_requested"  # Directory listing started
    BROWSE_RESPONSE = "browse_response"  # Directory listing completed
    BROWSE_TIMEOUT = "browse_timeout"  # Directory listing timed out
    BROWSE_ERROR = "browse_error"  # Directory listing failed
    ENUMERATE_REQUESTED = "enumerate_requested"  # Folder enumeration started
    ENUMERATE_RESPONSE = "enumerate_response"  # Folder enumeration completed


class BrowseEvent(BaseModel):
    """
    A single browse event.
    
    V1 OBSERVABILITY: Records explicit success/failure with full context.
    """
    
    model_config = ConfigDict(extra="forbid")
    
    event_type: BrowseEventType
    timestamp: str  # ISO format
    
    # Path being browsed
    path: Optional[str] = None
    
    # Success state
    success: bool = True
    
    # Error information (if not success)
    error_type: Optional[str] = None  # e.g., "timeout", "permission", "not_found"
    error_message: Optional[str] = None
    
    # Result counts (if success)
    entry_count: Optional[int] = None  # Number of entries returned
    dir_count: Optional[int] = None  # Number of directories
    file_count: Optional[int] = None  # Number of files
    
    # Performance
    duration_ms: Optional[float] = None  # Time taken in milliseconds
    
    # Additional context
    context: Optional[Dict[str, Any]] = None


class BrowseEventLog:
    """
    In-memory log of browse events.
    
    V1 OBSERVABILITY: Ring buffer of last N browse events.
    Used for debugging filesystem issues.
    
    Usage:
        log = BrowseEventLog()
        log.record_browse_start("/Volumes/MyDrive")
        log.record_browse_success("/Volumes/MyDrive", entries=42)
        # or
        log.record_browse_error("/Volumes/MyDrive", "timeout", "Timed out after 3s")
    """
    
    def __init__(self, max_events: int = MAX_BROWSE_EVENTS):
        """
        Initialize browse event log.
        
        Args:
            max_events: Maximum events to keep in memory
        """
        self._events: deque[BrowseEvent] = deque(maxlen=max_events)
        self._pending_requests: Dict[str, datetime] = {}  # path -> start_time
    
    def _now(self) -> str:
        """Get current timestamp in ISO format."""
        return datetime.now().isoformat()
    
    def _record(self, event: BrowseEvent) -> None:
        """Add event to log."""
        self._events.append(event)
        logger.debug(f"[BROWSE_LOG] {event.event_type.value}: {event.path or 'N/A'}")
    
    def record_roots_start(self) -> None:
        """Record start of root volumes listing."""
        self._pending_requests["__roots__"] = datetime.now()
        self._record(BrowseEvent(
            event_type=BrowseEventType.ROOTS_REQUESTED,
            timestamp=self._now(),
        ))
    
    def record_roots_success(self, root_count: int) -> None:
        """
        Record successful root volumes listing.
        
        Args:
            root_count: Number of root volumes found
        """
        duration_ms = None
        if "__roots__" in self._pending_requests:
            start = self._pending_requests.pop("__roots__")
            duration_ms = (datetime.now() - start).total_seconds() * 1000
        
        self._record(BrowseEvent(
            event_type=BrowseEventType.ROOTS_RESPONSE,
            timestamp=self._now(),
            success=True,
            dir_count=root_count,
            duration_ms=duration_ms,
        ))
    
    def record_browse_start(self, path: str) -> None:
        """
        Record start of directory browsing.
        
        Args:
            path: Path being browsed
        """
        self._pending_requests[path] = datetime.now()
        self._record(BrowseEvent(
            event_type=BrowseEventType.BROWSE_REQUESTED,
            timestamp=self._now(),
            path=path,
        ))
    
    def record_browse_success(
        self,
        path: str,
        dir_count: int = 0,
        file_count: int = 0,
    ) -> None:
        """
        Record successful directory browse.
        
        Args:
            path: Path that was browsed
            dir_count: Number of directories found
            file_count: Number of files found
        """
        duration_ms = None
        if path in self._pending_requests:
            start = self._pending_requests.pop(path)
            duration_ms = (datetime.now() - start).total_seconds() * 1000
        
        self._record(BrowseEvent(
            event_type=BrowseEventType.BROWSE_RESPONSE,
            timestamp=self._now(),
            path=path,
            success=True,
            entry_count=dir_count + file_count,
            dir_count=dir_count,
            file_count=file_count,
            duration_ms=duration_ms,
        ))
    
    def record_browse_timeout(
        self,
        path: str,
        timeout_seconds: float,
    ) -> None:
        """
        Record browse timeout.
        
        V1 FILESYSTEM INVARIANT: Timeouts are explicit failures, not silent drops.
        
        Args:
            path: Path that timed out
            timeout_seconds: Timeout duration
        """
        self._pending_requests.pop(path, None)
        
        self._record(BrowseEvent(
            event_type=BrowseEventType.BROWSE_TIMEOUT,
            timestamp=self._now(),
            path=path,
            success=False,
            error_type="timeout",
            error_message=f"Directory enumeration timed out after {timeout_seconds}s",
            duration_ms=timeout_seconds * 1000,
        ))
    
    def record_browse_error(
        self,
        path: str,
        error_type: str,
        error_message: str,
    ) -> None:
        """
        Record browse error.
        
        V1 FILESYSTEM INVARIANT: Errors are explicit, with type and message.
        
        Args:
            path: Path that failed
            error_type: Type of error (e.g., "permission", "not_found", "io_error")
            error_message: Human-readable error message
        """
        duration_ms = None
        if path in self._pending_requests:
            start = self._pending_requests.pop(path)
            duration_ms = (datetime.now() - start).total_seconds() * 1000
        
        self._record(BrowseEvent(
            event_type=BrowseEventType.BROWSE_ERROR,
            timestamp=self._now(),
            path=path,
            success=False,
            error_type=error_type,
            error_message=error_message,
            duration_ms=duration_ms,
        ))
    
    def record_enumerate_start(self, path: str) -> None:
        """Record start of folder enumeration."""
        self._pending_requests[f"enum:{path}"] = datetime.now()
        self._record(BrowseEvent(
            event_type=BrowseEventType.ENUMERATE_REQUESTED,
            timestamp=self._now(),
            path=path,
        ))
    
    def record_enumerate_success(
        self,
        path: str,
        file_count: int,
    ) -> None:
        """Record successful folder enumeration."""
        key = f"enum:{path}"
        duration_ms = None
        if key in self._pending_requests:
            start = self._pending_requests.pop(key)
            duration_ms = (datetime.now() - start).total_seconds() * 1000
        
        self._record(BrowseEvent(
            event_type=BrowseEventType.ENUMERATE_RESPONSE,
            timestamp=self._now(),
            path=path,
            success=True,
            file_count=file_count,
            duration_ms=duration_ms,
        ))
    
    def record_enumerate_error(
        self,
        path: str,
        error_type: str,
        error_message: str,
    ) -> None:
        """Record folder enumeration error."""
        key = f"enum:{path}"
        duration_ms = None
        if key in self._pending_requests:
            start = self._pending_requests.pop(key)
            duration_ms = (datetime.now() - start).total_seconds() * 1000
        
        self._record(BrowseEvent(
            event_type=BrowseEventType.BROWSE_ERROR,
            timestamp=self._now(),
            path=path,
            success=False,
            error_type=error_type,
            error_message=error_message,
            duration_ms=duration_ms,
        ))
    
    def get_events(self, limit: Optional[int] = None) -> List[BrowseEvent]:
        """
        Get recent browse events.
        
        Args:
            limit: Maximum events to return (default: all)
            
        Returns:
            List of events, most recent first
        """
        events = list(self._events)
        events.reverse()  # Most recent first
        if limit:
            events = events[:limit]
        return events
    
    def get_events_as_dicts(self, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        """
        Get recent browse events as dicts (for JSON serialization).
        
        Args:
            limit: Maximum events to return (default: all)
            
        Returns:
            List of event dicts, most recent first
        """
        events = self.get_events(limit)
        return [e.model_dump() for e in events]
    
    def clear(self) -> None:
        """Clear all events."""
        self._events.clear()
        self._pending_requests.clear()


# Global browse event log instance
_browse_log: Optional[BrowseEventLog] = None


def get_browse_log() -> BrowseEventLog:
    """Get the global browse event log instance."""
    global _browse_log
    if _browse_log is None:
        _browse_log = BrowseEventLog()
    return _browse_log
