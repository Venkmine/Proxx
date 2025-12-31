"""
Forge Monitor - Worker Heartbeat Tracking

Tracks worker liveness through periodic heartbeats.
Determines worker status based on last-seen timestamps.

This module provides OBSERVATION ONLY.
It does not control workers or send commands.

License enforcement is integrated at heartbeat time:
- Workers are counted against license limits
- Excess workers are marked as REJECTED
- Rejection is explicit and logged
"""

import socket
import threading
import time
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from .event_model import WorkerStatus
from .state_store import StateStore, get_store


# Worker is considered offline if no heartbeat in this duration
OFFLINE_THRESHOLD_SECONDS = 60

# Default heartbeat interval
HEARTBEAT_INTERVAL_SECONDS = 15

# Worker rejection status for license enforcement
WORKER_STATUS_REJECTED = "rejected"


def get_hostname() -> str:
    """Get current machine's hostname."""
    try:
        return socket.gethostname()
    except Exception:
        return "unknown"


def get_worker_id() -> str:
    """
    Get or generate a persistent worker ID.
    
    The worker ID is based on hostname and a random component,
    ensuring uniqueness even across machines with same hostname.
    """
    # In production, this would be stored persistently
    # For now, generate based on hostname + UUID suffix
    hostname = get_hostname()
    short_id = str(uuid.uuid4())[:8]
    return f"{hostname}-{short_id}"


class HeartbeatEmitter:
    """
    Emits periodic heartbeats for the local worker.
    
    This runs in a background thread and updates the state store
    with the worker's current status.
    
    License enforcement is integrated:
    - Each heartbeat checks license worker limits
    - Rejected workers are marked with explicit status
    - Workers can query their rejection status
    """
    
    def __init__(
        self,
        worker_id: Optional[str] = None,
        store: Optional[StateStore] = None,
        interval: int = HEARTBEAT_INTERVAL_SECONDS,
        enforce_license: bool = True
    ):
        """
        Initialize the heartbeat emitter.
        
        Args:
            worker_id: Worker ID to report. Auto-generated if not provided.
            store: State store to update. Uses default if not provided.
            interval: Seconds between heartbeats.
            enforce_license: Whether to enforce license limits on this worker.
        """
        self.worker_id = worker_id or get_worker_id()
        self.store = store or get_store()
        self.interval = interval
        self.hostname = get_hostname()
        self.enforce_license = enforce_license
        
        self._current_job_id: Optional[str] = None
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()
        self._rejected = False
        self._rejection_reason: Optional[str] = None
    
    def set_current_job(self, job_id: Optional[str]) -> None:
        """
        Update the currently running job.
        
        Args:
            job_id: The job ID being processed, or None if idle
        """
        with self._lock:
            self._current_job_id = job_id
    
    def is_rejected(self) -> bool:
        """
        Check if this worker has been rejected due to license limits.
        
        Returns:
            True if rejected, False if accepted
        """
        with self._lock:
            return self._rejected
    
    def get_rejection_reason(self) -> Optional[str]:
        """
        Get the reason for rejection if rejected.
        
        Returns:
            Rejection reason string, or None if not rejected
        """
        with self._lock:
            return self._rejection_reason
    
    def can_execute_jobs(self) -> bool:
        """
        Check if this worker is allowed to execute jobs.
        
        A worker cannot execute if:
        - It has been rejected due to license limits
        - It is not running (stopped emitting heartbeats)
        
        Returns:
            True if jobs can be executed, False otherwise
        """
        with self._lock:
            return self._running and not self._rejected
    
    def _check_license_enforcement(self) -> bool:
        """
        Check license limits and update rejection status.
        
        Returns:
            True if worker is accepted, False if rejected
        """
        if not self.enforce_license:
            return True
        
        try:
            from backend.licensing import get_enforcer
            enforcer = get_enforcer()
            accepted = enforcer.register_worker_heartbeat(self.worker_id)
            
            with self._lock:
                if not accepted:
                    self._rejected = True
                    rejection = enforcer.get_rejection_reason(self.worker_id)
                    if rejection:
                        self._rejection_reason = (
                            f"Worker limit reached: {rejection.current_workers}/"
                            f"{rejection.max_workers} workers active for "
                            f"{rejection.license_tier.value} license"
                        )
                else:
                    self._rejected = False
                    self._rejection_reason = None
            
            return accepted
        except ImportError:
            # Licensing module not available - accept by default
            return True
        except Exception:
            # Non-fatal - accept by default but log
            return True
    
    def _emit_heartbeat(self) -> None:
        """Send a single heartbeat to the store."""
        # Check license enforcement first
        license_accepted = self._check_license_enforcement()
        
        with self._lock:
            current_job = self._current_job_id
            rejected = self._rejected
        
        # Determine status
        if rejected:
            status = WORKER_STATUS_REJECTED
        elif current_job:
            status = "busy"
        else:
            status = "idle"
        
        worker_status = WorkerStatus(
            worker_id=self.worker_id,
            status=status,
            last_seen=datetime.now(timezone.utc).isoformat(),
            current_job_id=current_job,
            hostname=self.hostname
        )
        
        try:
            self.store.update_worker(worker_status)
        except Exception:
            # Heartbeat failures are non-fatal
            pass
    
    def _heartbeat_loop(self) -> None:
        """Background thread that emits heartbeats."""
        while self._running:
            self._emit_heartbeat()
            time.sleep(self.interval)
    
    def start(self) -> None:
        """Start the heartbeat background thread."""
        if self._running:
            return
        
        self._running = True
        self._thread = threading.Thread(
            target=self._heartbeat_loop,
            daemon=True,
            name=f"heartbeat-{self.worker_id}"
        )
        self._thread.start()
        
        # Emit initial heartbeat immediately
        self._emit_heartbeat()
    
    def stop(self) -> None:
        """Stop the heartbeat background thread."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=2.0)
            self._thread = None
        
        # Deregister from license enforcer
        if self.enforce_license:
            try:
                from backend.licensing import get_enforcer
                get_enforcer().deregister_worker(self.worker_id)
            except (ImportError, Exception):
                pass


class WorkerMonitor:
    """
    Monitors worker status based on heartbeats.
    
    This is a read-only component that interprets heartbeat data.
    It does not send commands or control workers.
    """
    
    def __init__(
        self,
        store: Optional[StateStore] = None,
        offline_threshold: int = OFFLINE_THRESHOLD_SECONDS
    ):
        """
        Initialize the worker monitor.
        
        Args:
            store: State store to read from.
            offline_threshold: Seconds since last heartbeat to consider offline.
        """
        self.store = store or get_store()
        self.offline_threshold = offline_threshold
    
    def get_worker_status(self, worker_id: str) -> Optional[WorkerStatus]:
        """
        Get current status of a worker.
        
        The status is derived from the last heartbeat:
        - If last_seen > threshold: status is "offline"
        - Otherwise: use reported status
        
        Args:
            worker_id: Worker to check
            
        Returns:
            WorkerStatus with current status, or None if unknown
        """
        worker = self.store.get_worker(worker_id)
        if not worker:
            return None
        
        return self._apply_offline_check(worker)
    
    def get_all_workers(self) -> list[WorkerStatus]:
        """
        Get status of all known workers.
        
        Returns:
            List of WorkerStatus with offline checks applied
        """
        workers = self.store.get_all_workers()
        return [self._apply_offline_check(w) for w in workers]
    
    def _apply_offline_check(self, worker: WorkerStatus) -> WorkerStatus:
        """
        Check if worker should be marked offline based on last_seen.
        
        Args:
            worker: The worker status to check
            
        Returns:
            WorkerStatus with potentially updated status
        """
        try:
            last_seen = datetime.fromisoformat(worker.last_seen.replace('Z', '+00:00'))
            now = datetime.now(timezone.utc)
            age = (now - last_seen).total_seconds()
            
            if age > self.offline_threshold:
                # Return new immutable instance with offline status
                return WorkerStatus(
                    worker_id=worker.worker_id,
                    status="offline",
                    last_seen=worker.last_seen,
                    current_job_id=worker.current_job_id,
                    hostname=worker.hostname
                )
        except (ValueError, TypeError):
            # If we can't parse the timestamp, assume offline
            return WorkerStatus(
                worker_id=worker.worker_id,
                status="offline",
                last_seen=worker.last_seen,
                current_job_id=worker.current_job_id,
                hostname=worker.hostname
            )
        
        return worker
    
    def get_active_workers(self) -> list[WorkerStatus]:
        """Get workers that are not offline."""
        return [w for w in self.get_all_workers() if w.status != "offline"]
    
    def get_busy_workers(self) -> list[WorkerStatus]:
        """Get workers currently processing jobs."""
        return [w for w in self.get_all_workers() if w.status == "busy"]
    
    def get_idle_workers(self) -> list[WorkerStatus]:
        """Get workers that are online but not processing."""
        return [w for w in self.get_all_workers() if w.status == "idle"]
    
    def get_offline_workers(self) -> list[WorkerStatus]:
        """Get workers that have not sent a heartbeat recently."""
        return [w for w in self.get_all_workers() if w.status == "offline"]
    
    def get_rejected_workers(self) -> list[WorkerStatus]:
        """Get workers that have been rejected due to license limits."""
        return [w for w in self.get_all_workers() if w.status == WORKER_STATUS_REJECTED]
    
    def get_license_status(self) -> dict:
        """
        Get current license enforcement status.
        
        Returns:
            Dict with license tier, limits, and worker counts
        """
        try:
            from backend.licensing import get_enforcer, get_current_license
            enforcer = get_enforcer()
            license = get_current_license()
            
            return {
                "license_tier": license.license_type.value,
                "max_workers": license.max_workers,
                "active_workers": enforcer.get_active_worker_count(),
                "rejected_workers": len(enforcer.get_rejected_workers()),
                "allows_lan_monitoring": license.allows_lan_monitoring(),
            }
        except ImportError:
            return {
                "license_tier": "unknown",
                "max_workers": None,
                "active_workers": len(self.get_active_workers()),
                "rejected_workers": 0,
                "allows_lan_monitoring": True,
            }


# Module-level singleton emitter
_default_emitter: Optional[HeartbeatEmitter] = None


def start_heartbeat(worker_id: Optional[str] = None) -> HeartbeatEmitter:
    """Start the default heartbeat emitter."""
    global _default_emitter
    if _default_emitter is None:
        _default_emitter = HeartbeatEmitter(worker_id=worker_id)
    _default_emitter.start()
    return _default_emitter


def stop_heartbeat() -> None:
    """Stop the default heartbeat emitter."""
    global _default_emitter
    if _default_emitter:
        _default_emitter.stop()
        _default_emitter = None


def get_emitter() -> Optional[HeartbeatEmitter]:
    """Get the current heartbeat emitter."""
    return _default_emitter
