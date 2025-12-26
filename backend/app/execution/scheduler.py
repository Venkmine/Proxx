"""
Minimal FIFO scheduler for execution.

Phase 16: Single-node, max 1 concurrent clip, FIFO order.
INC-002 Fix: Added job-level FIFO queue to ensure strict execution order.

Design rules:
- No prioritization
- No parallel execution
- Sequential job processing (single job at a time)
- Sequential clip processing within jobs
- Respects job pause state
"""

import logging
import threading
from typing import Optional, List, TYPE_CHECKING
from collections import deque
from datetime import datetime

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
    
    INC-002 Fix: Added job-level FIFO queue.
    - Jobs are queued in strict order when started
    - Only one job executes at a time
    - Queue order is visible and provable
    
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
        
        # INC-002: Job-level FIFO queue
        # Stores job_id in order of submission
        self._job_queue: deque[str] = deque()
        # Currently executing job (only one at a time)
        self._current_job_id: Optional[str] = None
    
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
    
    # =========================================================================
    # INC-002: Job-level FIFO queue methods
    # =========================================================================
    
    def enqueue_job(self, job_id: str) -> int:
        """
        Add a job to the FIFO queue.
        
        INC-002: Jobs execute in strict order of enqueue.
        
        Args:
            job_id: The job identifier
            
        Returns:
            Position in queue (1-indexed, 1 = will execute next)
        """
        with self._lock:
            # Don't enqueue if already in queue or currently executing
            if job_id in self._job_queue:
                position = list(self._job_queue).index(job_id) + 1
                logger.debug(f"[Scheduler] Job {job_id} already in queue at position {position}")
                return position
            
            if self._current_job_id == job_id:
                logger.debug(f"[Scheduler] Job {job_id} is currently executing")
                return 0  # 0 means currently executing
            
            self._job_queue.append(job_id)
            position = len(self._job_queue)
            logger.info(f"[Scheduler] Job {job_id} enqueued at position {position}")
            return position
    
    def get_queue_position(self, job_id: str) -> int:
        """
        Get the current queue position for a job.
        
        Returns:
            Position (1-indexed), 0 if currently executing, -1 if not in queue
        """
        with self._lock:
            if self._current_job_id == job_id:
                return 0
            try:
                return list(self._job_queue).index(job_id) + 1
            except ValueError:
                return -1
    
    def get_queued_job_ids(self) -> List[str]:
        """
        Get list of all queued job IDs in FIFO order.
        
        INC-002: This allows UI to show provable queue order.
        """
        with self._lock:
            return list(self._job_queue)
    
    def get_current_job_id(self) -> Optional[str]:
        """Get the currently executing job ID."""
        with self._lock:
            return self._current_job_id
    
    def is_job_turn(self, job_id: str) -> bool:
        """
        Check if it's this job's turn to execute.
        
        INC-002: A job can only execute if it's at the front of the queue
        AND no other job is currently executing.
        
        Args:
            job_id: The job to check
            
        Returns:
            True if this job should execute next
        """
        with self._lock:
            # Already executing
            if self._current_job_id == job_id:
                return True
            
            # Another job is executing
            if self._current_job_id is not None:
                return False
            
            # Queue is empty
            if not self._job_queue:
                return False
            
            # Check if at front of queue
            return self._job_queue[0] == job_id
    
    def acquire_execution(self, job_id: str) -> bool:
        """
        Attempt to acquire execution slot for a job.
        
        INC-002: Only succeeds if it's this job's turn (FIFO enforced).
        
        Args:
            job_id: The job requesting execution
            
        Returns:
            True if job can now execute, False if it must wait
        """
        with self._lock:
            # Already executing this job
            if self._current_job_id == job_id:
                return True
            
            # Another job is executing
            if self._current_job_id is not None:
                logger.debug(f"[Scheduler] Job {job_id} blocked - {self._current_job_id} executing")
                return False
            
            # Scheduler is paused
            if self._paused:
                logger.debug(f"[Scheduler] Job {job_id} blocked - scheduler paused")
                return False
            
            # Queue is empty or job not in queue
            if not self._job_queue or self._job_queue[0] != job_id:
                logger.debug(f"[Scheduler] Job {job_id} blocked - not at front of queue")
                return False
            
            # This job is at front - acquire execution slot
            self._job_queue.popleft()
            self._current_job_id = job_id
            logger.info(f"[Scheduler] Job {job_id} acquired execution slot")
            return True
    
    def release_execution(self, job_id: str) -> None:
        """
        Release execution slot after job completes.
        
        Args:
            job_id: The job releasing execution
        """
        with self._lock:
            if self._current_job_id == job_id:
                self._current_job_id = None
                logger.info(f"[Scheduler] Job {job_id} released execution slot")
            else:
                logger.warning(f"[Scheduler] Job {job_id} tried to release but wasn't executing")
    
    def remove_from_queue(self, job_id: str) -> bool:
        """
        Remove a job from the queue (e.g., on cancellation).
        
        Args:
            job_id: The job to remove
            
        Returns:
            True if job was in queue and removed
        """
        with self._lock:
            if job_id in self._job_queue:
                self._job_queue.remove(job_id)
                logger.info(f"[Scheduler] Job {job_id} removed from queue")
                return True
            return False

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
