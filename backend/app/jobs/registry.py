"""
In-memory job registry.

Phase 4 scope: Store and retrieve jobs by ID.
Phase 12: Explicit persistence support.

The registry provides:
- Job storage and retrieval by ID
- Listing all jobs
- Basic job lifecycle management
- Explicit save/load operations (no auto-persist)
"""

from typing import Dict, List, Optional
from datetime import datetime
from .models import Job, JobStatus, ClipTask, TaskStatus
from .errors import JobNotFoundError


class JobRegistry:
    """
    In-memory registry for job tracking.
    
    Stores jobs and provides retrieval by ID.
    Phase 12: Explicit persistence via save/load methods.
    """
    
    def __init__(self, persistence_manager=None):
        """
        Initialize registry.
        
        Args:
            persistence_manager: Optional PersistenceManager for explicit save/load
        """
        # job_id -> Job
        self._jobs: Dict[str, Job] = {}
        self._persistence = persistence_manager
    
    def add_job(self, job: Job) -> None:
        """
        Add a job to the registry.
        
        Args:
            job: The job to add
            
        Raises:
            ValueError: If a job with the same ID already exists
        """
        if job.id in self._jobs:
            raise ValueError(f"Job with ID '{job.id}' already exists")
        
        self._jobs[job.id] = job
    
    def get_job(self, job_id: str) -> Optional[Job]:
        """
        Retrieve a job by ID.
        
        Args:
            job_id: The job ID
            
        Returns:
            The job if found, None otherwise
        """
        return self._jobs.get(job_id)
    
    def get_job_or_raise(self, job_id: str) -> Job:
        """
        Retrieve a job by ID, raising an exception if not found.
        
        Args:
            job_id: The job ID
            
        Returns:
            The job
            
        Raises:
            JobNotFoundError: If the job does not exist
        """
        job = self.get_job(job_id)
        if job is None:
            raise JobNotFoundError(job_id)
        return job
    
    def list_jobs(self) -> List[Job]:
        """
        List all jobs in the registry.
        
        Returns:
            List of all jobs, ordered by creation time (newest first)
        """
        jobs = list(self._jobs.values())
        jobs.sort(key=lambda j: j.created_at, reverse=True)
        return jobs
    
    def remove_job(self, job_id: str) -> None:
        """
        Remove a job from the registry.
        
        Args:
            job_id: The job ID to remove
            
        Raises:
            JobNotFoundError: If the job does not exist
        """
        if job_id not in self._jobs:
            raise JobNotFoundError(job_id)
        
        del self._jobs[job_id]
    
    def clear(self) -> None:
        """
        Clear all jobs from the registry.
        
        Useful for testing or resetting state.
        """
        self._jobs.clear()
    
    def count(self) -> int:
        """
        Get the total number of jobs in the registry.
        
        Returns:
            Number of jobs
        """
        return len(self._jobs)
    
    # Phase 12: Explicit persistence operations
    
    def save_job(self, job: Job) -> None:
        """
        Explicitly save a job to persistent storage.
        
        Must be called manually after job state changes.
        Does not auto-persist on mutations.
        
        Args:
            job: The job to persist
            
        Raises:
            ValueError: If persistence_manager is not configured
        """
        if not self._persistence:
            raise ValueError("No persistence_manager configured for JobRegistry")
        
        # Serialize job to dict
        job_data = {
            "id": job.id,
            "created_at": job.created_at.isoformat(),
            "started_at": job.started_at.isoformat() if job.started_at else None,
            "completed_at": job.completed_at.isoformat() if job.completed_at else None,
            "status": job.status.value,
            "tasks": [
                {
                    "id": task.id,
                    "source_path": task.source_path,
                    "status": task.status.value,
                    "started_at": task.started_at.isoformat() if task.started_at else None,
                    "completed_at": task.completed_at.isoformat() if task.completed_at else None,
                    "failure_reason": task.failure_reason,
                    "warnings": task.warnings,
                    "retry_count": task.retry_count,
                }
                for task in job.tasks
            ],
        }
        
        self._persistence.save_job(job_data)
    
    def load_all_jobs(self) -> None:
        """
        Load all jobs from persistent storage into memory.
        
        Called explicitly at startup to restore state.
        Detects jobs requiring recovery (RUNNING/PAUSED become RECOVERY_REQUIRED).
        
        Raises:
            ValueError: If persistence_manager is not configured
        """
        if not self._persistence:
            raise ValueError("No persistence_manager configured for JobRegistry")
        
        job_datas = self._persistence.load_all_jobs()
        
        for job_data in job_datas:
            # Deserialize tasks
            tasks = [
                ClipTask(
                    id=task_data["id"],
                    source_path=task_data["source_path"],
                    status=TaskStatus(task_data["status"]),
                    started_at=datetime.fromisoformat(task_data["started_at"]) if task_data["started_at"] else None,
                    completed_at=datetime.fromisoformat(task_data["completed_at"]) if task_data["completed_at"] else None,
                    failure_reason=task_data["failure_reason"],
                    warnings=task_data["warnings"],
                    retry_count=task_data["retry_count"],
                )
                for task_data in job_data["tasks"]
            ]
            
            # Deserialize job
            job = Job(
                id=job_data["id"],
                created_at=datetime.fromisoformat(job_data["created_at"]),
                started_at=datetime.fromisoformat(job_data["started_at"]) if job_data["started_at"] else None,
                completed_at=datetime.fromisoformat(job_data["completed_at"]) if job_data["completed_at"] else None,
                status=JobStatus(job_data["status"]),
                tasks=tasks,
            )
            
            # Recovery detection: RUNNING or PAUSED at startup means interrupted
            if job.status in (JobStatus.RUNNING, JobStatus.PAUSED):
                job.status = JobStatus.RECOVERY_REQUIRED
            
            self._jobs[job.id] = job
