"""
Forge Licensing - License Enforcer

Enforces worker limits at heartbeat and job creation time.
Enforcement is explicit and explainable. No silent throttling.

ENFORCEMENT RULES:
------------------
At worker heartbeat time:
- Count active workers
- If count exceeds max_workers:
  - Mark worker as REJECTED
  - Log explicit reason
  - Worker must refuse to execute jobs

At job creation time:
- If no eligible workers available:
  - FAIL job creation
  - Message: "Worker limit reached for license tier: <tier>"

No partial acceptance.
No queueing jobs that cannot run.
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Dict, List, Optional, Set

from .license_model import License, LicenseTier
from .license_store import get_current_license


logger = logging.getLogger(__name__)


class WorkerRejectionReason(str, Enum):
    """Explicit reasons for worker rejection."""
    WORKER_LIMIT_EXCEEDED = "worker_limit_exceeded"
    LICENSE_INVALID = "license_invalid"


@dataclass(frozen=True)
class RejectedWorker:
    """
    Record of a rejected worker.
    
    Tracks which workers were rejected and why.
    This is for observability, not punishment.
    """
    worker_id: str
    reason: WorkerRejectionReason
    rejected_at: str
    license_tier: LicenseTier
    current_workers: int
    max_workers: int
    
    def to_dict(self) -> Dict:
        return {
            "worker_id": self.worker_id,
            "reason": self.reason.value,
            "rejected_at": self.rejected_at,
            "license_tier": self.license_tier.value,
            "current_workers": self.current_workers,
            "max_workers": self.max_workers,
        }


class WorkerLimitExceededError(Exception):
    """
    Raised when worker limit is exceeded.
    
    This is an honest, explicit error.
    The message tells the user exactly what happened.
    """
    
    def __init__(
        self,
        tier: LicenseTier,
        current_workers: int,
        max_workers: int,
        context: str = "job creation"
    ):
        self.tier = tier
        self.current_workers = current_workers
        self.max_workers = max_workers
        self.context = context
        
        message = (
            f"Worker limit reached for license tier: {tier.value}. "
            f"Active workers: {current_workers}, limit: {max_workers}. "
            f"Context: {context}"
        )
        super().__init__(message)


class LicenseEnforcer:
    """
    Enforces license limits on workers.
    
    This enforcer:
    - Tracks active workers
    - Rejects workers that exceed limits
    - Provides explicit status for monitoring
    
    It does NOT:
    - Silently throttle
    - Randomly reject
    - Hide the reason for rejection
    """
    
    def __init__(self, license: Optional[License] = None):
        """
        Initialize the enforcer.
        
        Args:
            license: The license to enforce. Uses current license if not provided.
        """
        self._license = license
        self._active_workers: Set[str] = set()
        self._rejected_workers: Dict[str, RejectedWorker] = {}
    
    @property
    def license(self) -> License:
        """Get the license being enforced."""
        if self._license is None:
            self._license = get_current_license()
        return self._license
    
    def get_active_worker_count(self) -> int:
        """Get the count of currently active workers."""
        return len(self._active_workers)
    
    def get_max_workers(self) -> Optional[int]:
        """Get the maximum allowed workers (None = unlimited)."""
        return self.license.max_workers
    
    def get_active_workers(self) -> List[str]:
        """Get list of active worker IDs."""
        return list(self._active_workers)
    
    def get_rejected_workers(self) -> List[RejectedWorker]:
        """Get list of rejected workers."""
        return list(self._rejected_workers.values())
    
    def can_accept_worker(self, worker_id: str) -> bool:
        """
        Check if a worker can be accepted without modifying state.
        
        Args:
            worker_id: Worker to check
            
        Returns:
            True if worker can be accepted, False otherwise
        """
        # Already active = already accepted
        if worker_id in self._active_workers:
            return True
        
        # Unlimited license always accepts
        if self.license.max_workers is None:
            return True
        
        # Check if we have room
        return len(self._active_workers) < self.license.max_workers
    
    def register_worker_heartbeat(self, worker_id: str) -> bool:
        """
        Register a worker heartbeat.
        
        If the worker is new and we're at the limit, reject it.
        
        Args:
            worker_id: Worker sending heartbeat
            
        Returns:
            True if worker is accepted, False if rejected
        """
        # Already active = already accepted
        if worker_id in self._active_workers:
            return True
        
        # Clear from rejected list if re-attempting
        if worker_id in self._rejected_workers:
            del self._rejected_workers[worker_id]
        
        # Unlimited license always accepts
        if self.license.max_workers is None:
            self._active_workers.add(worker_id)
            logger.info(f"Worker {worker_id} accepted (unlimited license)")
            return True
        
        # Check if we have room
        if len(self._active_workers) < self.license.max_workers:
            self._active_workers.add(worker_id)
            logger.info(
                f"Worker {worker_id} accepted "
                f"({len(self._active_workers)}/{self.license.max_workers})"
            )
            return True
        
        # No room - reject with explicit reason
        rejection = RejectedWorker(
            worker_id=worker_id,
            reason=WorkerRejectionReason.WORKER_LIMIT_EXCEEDED,
            rejected_at=datetime.now(timezone.utc).isoformat(),
            license_tier=self.license.license_type,
            current_workers=len(self._active_workers),
            max_workers=self.license.max_workers,
        )
        self._rejected_workers[worker_id] = rejection
        
        logger.warning(
            f"Worker {worker_id} REJECTED: "
            f"Worker limit reached ({len(self._active_workers)}/{self.license.max_workers}) "
            f"for tier {self.license.license_type.value}"
        )
        
        return False
    
    def deregister_worker(self, worker_id: str) -> None:
        """
        Remove a worker from active set.
        
        Called when worker goes offline or is shut down.
        
        Args:
            worker_id: Worker to remove
        """
        self._active_workers.discard(worker_id)
        self._rejected_workers.pop(worker_id, None)
        logger.info(f"Worker {worker_id} deregistered")
    
    def is_worker_rejected(self, worker_id: str) -> bool:
        """Check if a worker is currently rejected."""
        return worker_id in self._rejected_workers
    
    def get_rejection_reason(self, worker_id: str) -> Optional[RejectedWorker]:
        """Get the rejection record for a worker if rejected."""
        return self._rejected_workers.get(worker_id)
    
    def check_can_create_job(self) -> None:
        """
        Check if a job can be created.
        
        Raises WorkerLimitExceededError if no workers are available.
        This check is for when we want to create a job but have no
        eligible workers due to license limits.
        
        Raises:
            WorkerLimitExceededError: If no workers available
        """
        # If we have active workers, we can create jobs
        if self._active_workers:
            return
        
        # No active workers - check if we're at the limit
        # This handles the edge case where there are no active workers
        # but there would be if someone tried to start one
        if self.license.max_workers is not None and self.license.max_workers == 0:
            raise WorkerLimitExceededError(
                tier=self.license.license_type,
                current_workers=0,
                max_workers=0,
                context="job creation"
            )
    
    def get_status(self) -> Dict:
        """
        Get enforcement status for monitoring.
        
        Returns:
            Dict with license and worker status
        """
        return {
            "license_tier": self.license.license_type.value,
            "max_workers": self.license.max_workers,
            "active_workers": len(self._active_workers),
            "active_worker_ids": list(self._active_workers),
            "rejected_workers": len(self._rejected_workers),
            "rejected_worker_details": [
                r.to_dict() for r in self._rejected_workers.values()
            ],
            "at_limit": (
                self.license.max_workers is not None
                and len(self._active_workers) >= self.license.max_workers
            ),
        }


# Module-level singleton enforcer
_default_enforcer: Optional[LicenseEnforcer] = None


def get_enforcer() -> LicenseEnforcer:
    """Get the default license enforcer singleton."""
    global _default_enforcer
    if _default_enforcer is None:
        _default_enforcer = LicenseEnforcer()
    return _default_enforcer


def reset_enforcer() -> None:
    """Reset the enforcer singleton (for testing)."""
    global _default_enforcer
    _default_enforcer = None
