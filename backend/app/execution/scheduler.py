"""
Minimal FIFO scheduler for execution.

Phase 16: Single-node, max 1 concurrent clip, FIFO order.

Design rules:
- No prioritization
- No parallel execution (yet)
- Sequential clip processing
- Respects job pause state
"""

import logging
import threading
from typing import Optional, TYPE_CHECKING
from collections import deque

if TYPE_CHECKING:
    from ..jobs.models import Job, ClipTask
    from ..presets.registry import PresetRegistry
    from .base import ExecutionEngine
    from .results import ExecutionResult

logger = logging.getLogger(__name__)


class Scheduler:
    """
    Minimal FIFO scheduler for clip execution.
    
    Phase 16 constraints:
    - Single-node only
    - Max concurrent clips = 1
    - FIFO order (first in, first out)
    - No prioritization
    
    Future phases will add:
    - Parallel execution (Phase 17+)
    - Priority queuing
    - Multi-node distribution
    """
    
    def __init__(self, max_concurrent: int = 1):
        """
        Initialize scheduler.
        
        Args:
            max_concurrent: Maximum concurrent clips (always 1 in Phase 16)
        """
        self.max_concurrent = max_concurrent
        self._running_count = 0
        self._lock = threading.Lock()
        self._paused = False
    
    @property
    def is_busy(self) -> bool:
        """Check if scheduler is at capacity."""
        with self._lock:
            return self._running_count >= self.max_concurrent
    
    @property
    def running_count(self) -> int:
        """Get current number of running clips."""
        with self._lock:
            return self._running_count
    
    def pause(self) -> None:
        """Pause the scheduler (finish current clip, don't start new ones)."""
        with self._lock:
            self._paused = True
        logger.info("[Scheduler] Paused")
    
    def resume(self) -> None:
        """Resume the scheduler."""
        with self._lock:
            self._paused = False
        logger.info("[Scheduler] Resumed")
    
    @property
    def is_paused(self) -> bool:
        """Check if scheduler is paused."""
        with self._lock:
            return self._paused
    
    def can_start_clip(self) -> bool:
        """
        Check if a new clip can be started.
        
        Returns:
            True if not at capacity and not paused
        """
        with self._lock:
            return not self._paused and self._running_count < self.max_concurrent
    
    def mark_clip_started(self) -> None:
        """Mark that a clip has started execution."""
        with self._lock:
            self._running_count += 1
            logger.debug(f"[Scheduler] Clip started, running: {self._running_count}")
    
    def mark_clip_completed(self) -> None:
        """Mark that a clip has completed execution."""
        with self._lock:
            self._running_count = max(0, self._running_count - 1)
            logger.debug(f"[Scheduler] Clip completed, running: {self._running_count}")
    
    def execute_job_clips(
        self,
        job: "Job",
        engine: "ExecutionEngine",
        preset_registry: "PresetRegistry",
        preset_id: str,
        output_base_dir: Optional[str] = None,
    ) -> dict[str, "ExecutionResult"]:
        """
        Execute all queued clips in a job using FIFO order.
        
        Processes clips sequentially (max 1 concurrent).
        Respects pause state between clips.
        
        Args:
            job: Job to execute
            engine: Execution engine to use
            preset_registry: Registry for preset lookup
            preset_id: Bound preset ID
            output_base_dir: Optional output directory
            
        Returns:
            Dict mapping task_id to ExecutionResult
        """
        from ..jobs.models import TaskStatus, JobStatus
        from .results import ExecutionResult
        
        results: dict[str, "ExecutionResult"] = {}
        
        # Get queued tasks in order
        queued_tasks = [task for task in job.tasks if task.status == TaskStatus.QUEUED]
        
        logger.info(
            f"[Scheduler] Starting job {job.id} with {len(queued_tasks)} queued clips "
            f"using {engine.name} engine"
        )
        
        for task in queued_tasks:
            # Check pause state before each clip
            if job.status == JobStatus.PAUSED or self.is_paused:
                logger.info(f"[Scheduler] Job {job.id} paused, stopping execution")
                break
            
            # Wait for capacity (always available in Phase 16 with max=1)
            if not self.can_start_clip():
                logger.warning(f"[Scheduler] At capacity, cannot start clip {task.id}")
                break
            
            # Start clip
            self.mark_clip_started()
            
            try:
                logger.info(f"[Scheduler] Executing clip {task.id}")
                result = engine.run_clip(
                    task=task,
                    preset_registry=preset_registry,
                    preset_id=preset_id,
                    output_base_dir=output_base_dir,
                )
                results[task.id] = result
                
            except Exception as e:
                logger.exception(f"[Scheduler] Exception executing clip {task.id}: {e}")
                from datetime import datetime
                from .results import ExecutionStatus
                
                results[task.id] = ExecutionResult(
                    status=ExecutionStatus.FAILED,
                    source_path=task.source_path,
                    output_path=None,
                    failure_reason=str(e),
                    started_at=datetime.now(),
                    completed_at=datetime.now(),
                )
            
            finally:
                self.mark_clip_completed()
        
        logger.info(f"[Scheduler] Job {job.id} execution complete: {len(results)} clips processed")
        return results


# Global scheduler instance
_default_scheduler: Optional[Scheduler] = None


def get_scheduler() -> Scheduler:
    """
    Get the default scheduler instance.
    
    Creates the scheduler on first access (lazy initialization).
    """
    global _default_scheduler
    if _default_scheduler is None:
        _default_scheduler = Scheduler(max_concurrent=1)
    return _default_scheduler
