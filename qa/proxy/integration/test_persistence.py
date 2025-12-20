"""
Integration tests for persistence.

Tests:
- Job persistence to SQLite
- Job recovery on restart
- State integrity
"""

import pytest
import sys
import tempfile
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / "backend"))


class TestJobPersistence:
    """Test job persistence to SQLite."""
    
    def test_save_and_load_job(self):
        """Job should persist and reload correctly."""
        from app.persistence.manager import PersistenceManager
        from app.jobs.registry import JobRegistry
        from app.jobs.models import Job
        
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = str(Path(tmpdir) / "test.db")
            
            # Create and save job
            persistence = PersistenceManager(db_path=db_path)
            registry = JobRegistry(persistence_manager=persistence)
            
            job = Job()
            registry.add_job(job)
            registry.save_job(job)
            
            # Create new registry from same DB
            persistence2 = PersistenceManager(db_path=db_path)
            registry2 = JobRegistry(persistence_manager=persistence2)
            
            # Load all jobs
            registry2.load_all_jobs()
            
            loaded_job = registry2.get_job(job.id)
            
            assert loaded_job is not None
            assert loaded_job.id == job.id


class TestRecoveryDetection:
    """Test restart/recovery detection."""
    
    def test_persistence_manager_exists(self):
        """PersistenceManager should be importable."""
        from app.persistence.manager import PersistenceManager
        assert PersistenceManager is not None
    
    def test_job_registry_with_persistence(self):
        """JobRegistry should accept persistence manager."""
        from app.persistence.manager import PersistenceManager
        from app.jobs.registry import JobRegistry
        
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = str(Path(tmpdir) / "test.db")
            persistence = PersistenceManager(db_path=db_path)
            registry = JobRegistry(persistence_manager=persistence)
            
            assert registry is not None
