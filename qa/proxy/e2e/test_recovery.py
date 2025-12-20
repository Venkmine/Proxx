"""
E2E tests for recovery scenarios.

Tests:
- Restart recovery
- Crash simulation
- State restoration
"""

import pytest
import sys
import tempfile
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / "backend"))


class TestRestartRecovery:
    """Test restart/recovery scenarios."""
    
    def test_job_survives_restart(self):
        """Job state should survive simulated restart."""
        from app.persistence.manager import PersistenceManager
        from app.jobs.registry import JobRegistry
        from app.jobs.models import Job
        
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = str(Path(tmpdir) / "test.db")
            
            # Session 1: Create and save job
            persistence1 = PersistenceManager(db_path=db_path)
            registry1 = JobRegistry(persistence_manager=persistence1)
            
            job = Job()
            original_id = job.id
            registry1.add_job(job)
            registry1.save_job(job)
            
            # "Restart" - new instances
            del registry1
            del persistence1
            
            # Session 2: Load and verify
            persistence2 = PersistenceManager(db_path=db_path)
            registry2 = JobRegistry(persistence_manager=persistence2)
            registry2.load_all_jobs()
            
            loaded_job = registry2.get_job(original_id)
            
            assert loaded_job is not None
            assert loaded_job.id == original_id


class TestNoDuplication:
    """Test that restarts don't cause duplication."""
    
    def test_no_duplicate_jobs_on_restart(self):
        """Jobs should not duplicate on restart."""
        from app.persistence.manager import PersistenceManager
        from app.jobs.registry import JobRegistry
        from app.jobs.models import Job
        
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = str(Path(tmpdir) / "test.db")
            
            # Create job
            persistence = PersistenceManager(db_path=db_path)
            registry = JobRegistry(persistence_manager=persistence)
            
            job = Job()
            registry.add_job(job)
            registry.save_job(job)
            
            # Multiple load cycles
            for _ in range(3):
                persistence = PersistenceManager(db_path=db_path)
                registry = JobRegistry(persistence_manager=persistence)
                registry.load_all_jobs()
            
            # Should still have exactly one job
            jobs = registry.list_jobs()
            assert len(jobs) == 1
