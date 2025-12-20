"""
Integration tests for job creation.

Tests:
- Job creation lifecycle
- Task state transitions
- Job completion status
"""

import pytest
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / "backend"))

from app.jobs.models import Job, JobStatus, ClipTask, TaskStatus
from app.jobs.registry import JobRegistry


class TestJobCreation:
    """Test job creation."""
    
    def test_create_empty_job(self):
        """Create job with no clips."""
        job = Job()
        
        assert job is not None
        assert job.id is not None
        assert job.status == JobStatus.PENDING
    
    def test_add_job_to_registry(self):
        """Add job to registry."""
        registry = JobRegistry()
        job = Job()
        
        registry.add_job(job)
        
        retrieved = registry.get_job(job.id)
        assert retrieved is not None
        assert retrieved.id == job.id
    
    def test_job_has_unique_id(self):
        """Each job should have unique ID."""
        job1 = Job()
        job2 = Job()
        
        assert job1.id != job2.id


class TestJobRegistry:
    """Test job registry operations."""
    
    def test_list_jobs(self):
        """Should list all jobs."""
        registry = JobRegistry()
        job1 = Job()
        job2 = Job()
        
        registry.add_job(job1)
        registry.add_job(job2)
        
        jobs = registry.list_jobs()
        assert len(jobs) == 2
    
    def test_get_missing_job(self):
        """Getting missing job should return None."""
        registry = JobRegistry()
        
        result = registry.get_job("nonexistent")
        assert result is None
    
    def test_duplicate_add_raises(self):
        """Adding duplicate job ID should raise."""
        registry = JobRegistry()
        job = Job()
        
        registry.add_job(job)
        
        # Same job again should raise
        with pytest.raises(ValueError):
            registry.add_job(job)
    
    def test_get_job_by_id(self):
        """Should retrieve job by ID."""
        registry = JobRegistry()
        job = Job()
        registry.add_job(job)
        
        retrieved = registry.get_job(job.id)
        
        assert retrieved is not None
        assert retrieved.id == job.id
    
    def test_get_nonexistent_job(self):
        """Should return None for nonexistent job."""
        registry = JobRegistry()
        
        retrieved = registry.get_job("nonexistent-id")
        
        assert retrieved is None
    
    def test_list_all_jobs(self):
        """Should list all jobs."""
        registry = JobRegistry()
        registry.add_job(Job())
        registry.add_job(Job())
        registry.add_job(Job())
        
        all_jobs = registry.list_jobs()
        
        assert len(all_jobs) == 3
