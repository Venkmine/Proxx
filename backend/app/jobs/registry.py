"""
In-memory job registry.

Phase 4 scope: Store and retrieve jobs by ID.
No persistence. No file I/O. No databases.

The registry provides:
- Job storage and retrieval by ID
- Listing all jobs
- Basic job lifecycle management

Full persistence will be implemented in Phase 6+.
"""

from typing import Dict, List, Optional
from .models import Job
from .errors import JobNotFoundError


class JobRegistry:
    """
    In-memory registry for job tracking.
    
    Stores jobs and provides retrieval by ID.
    Jobs are kept in memory only (no persistence).
    """
    
    def __init__(self):
        """Initialize empty registry."""
        # job_id -> Job
        self._jobs: Dict[str, Job] = {}
    
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
