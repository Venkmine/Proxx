"""
Tests for Fabric Phase 2: Persistence & History

Validates:
- Persistence across process restart
- Idempotent ingestion
- Index rebuild correctness
- Corruption detection
- Query parity with Phase-1 behavior

Uses synthetic data only.
"""

import json
import sqlite3
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import pytest

from fabric.index import FabricIndex
from fabric.models import IngestedJob, IngestedOutput
from fabric.persistence import FabricPersistence, PersistenceError
from fabric.queries import FabricQueries
from fabric.storage import (
    FabricStorage,
    StorageCorruptionError,
    StorageError,
    STORAGE_SCHEMA_VERSION,
)


# ===== Fixtures =====

@pytest.fixture
def temp_storage_path():
    """Provide temporary storage path that's cleaned up after test."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        path = Path(f.name)
    
    yield path
    
    # Cleanup
    if path.exists():
        path.unlink()


@pytest.fixture
def sample_job():
    """Create a sample IngestedJob for testing."""
    return IngestedJob(
        job_id="test_job_001",
        final_status="COMPLETED",
        started_at=datetime(2025, 12, 29, 10, 0, 0, tzinfo=timezone.utc),
        completed_at=datetime(2025, 12, 29, 10, 5, 0, tzinfo=timezone.utc),
        canonical_proxy_profile="proxy_h264_720p",
        fingerprint="abc123def456",
        engine_used="ffmpeg",
        total_clips=2,
        completed_clips=2,
        failed_clips=0,
        outputs=[
            IngestedOutput(
                job_id="test_job_001",
                clip_id="clip_001",
                source_path="/source/video1.mxf",
                output_path="/output/video1.mov",
                output_exists=True,
                output_size_bytes=1024000,
                status="COMPLETED",
                engine_used="ffmpeg",
                proxy_profile_used="proxy_h264_720p",
            ),
            IngestedOutput(
                job_id="test_job_001",
                clip_id="clip_002",
                source_path="/source/video2.mxf",
                output_path="/output/video2.mov",
                output_exists=True,
                output_size_bytes=2048000,
                status="COMPLETED",
                engine_used="ffmpeg",
                proxy_profile_used="proxy_h264_720p",
            ),
        ],
    )


@pytest.fixture
def sample_failed_job():
    """Create a sample failed job for testing."""
    return IngestedJob(
        job_id="test_job_002",
        final_status="FAILED",
        started_at=datetime(2025, 12, 29, 11, 0, 0, tzinfo=timezone.utc),
        completed_at=datetime(2025, 12, 29, 11, 2, 0, tzinfo=timezone.utc),
        canonical_proxy_profile="proxy_h264_1080p",
        engine_used="resolve",
        resolve_preset_used="Proxy_1080p",
        total_clips=1,
        completed_clips=0,
        failed_clips=1,
        outputs=[
            IngestedOutput(
                job_id="test_job_002",
                clip_id="clip_003",
                source_path="/source/video3.mxf",
                output_path="/output/video3.mov",
                output_exists=False,
                output_size_bytes=None,
                status="FAILED",
                failure_reason="Codec not supported",
                engine_used="resolve",
                proxy_profile_used="proxy_h264_1080p",
                resolve_preset_used="Proxy_1080p",
            ),
        ],
    )


# ===== Storage Tests =====

def test_storage_initialization(temp_storage_path):
    """Test storage initialization creates schema correctly."""
    storage = FabricStorage(temp_storage_path)
    storage.open()
    
    # Verify schema version
    assert storage.get_schema_version() == STORAGE_SCHEMA_VERSION
    
    # Verify tables exist
    cursor = storage._conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    )
    tables = {row[0] for row in cursor.fetchall()}
    assert "jobs" in tables
    
    storage.close()


def test_storage_integrity_check(temp_storage_path):
    """Test storage detects corruption."""
    storage = FabricStorage(temp_storage_path)
    storage.open()
    storage.close()
    
    # Corrupt database by truncating file
    with open(temp_storage_path, "wb") as f:
        f.write(b"corrupted")
    
    # Should fail on next open
    storage = FabricStorage(temp_storage_path)
    with pytest.raises(StorageCorruptionError):
        storage.open()


def test_storage_schema_version_mismatch(temp_storage_path):
    """Test storage rejects schema version mismatch."""
    # Create database with wrong version
    conn = sqlite3.connect(temp_storage_path)
    conn.execute("CREATE TABLE jobs (job_id TEXT PRIMARY KEY)")
    conn.execute("PRAGMA user_version = 999")
    conn.commit()
    conn.close()
    
    # Should fail on open
    storage = FabricStorage(temp_storage_path)
    with pytest.raises(StorageError, match="Schema version mismatch"):
        storage.open()


def test_storage_persist_and_load_job(temp_storage_path, sample_job):
    """Test basic job persistence and loading."""
    storage = FabricStorage(temp_storage_path)
    storage.open()
    
    # Persist job
    storage.persist_job(sample_job)
    
    # Load jobs
    jobs = storage.load_all_jobs()
    assert len(jobs) == 1
    
    loaded_job = jobs[0]
    assert loaded_job.job_id == sample_job.job_id
    assert loaded_job.final_status == sample_job.final_status
    assert loaded_job.fingerprint == sample_job.fingerprint
    assert len(loaded_job.outputs) == 2
    assert loaded_job.outputs[0].clip_id == "clip_001"
    
    storage.close()


def test_storage_idempotent_writes(temp_storage_path, sample_job):
    """Test that writing same job_id twice replaces the first."""
    storage = FabricStorage(temp_storage_path)
    storage.open()
    
    # First write
    storage.persist_job(sample_job)
    
    # Modify and write again
    modified_job = IngestedJob(
        job_id=sample_job.job_id,  # Same ID
        final_status="FAILED",  # Different status
        started_at=sample_job.started_at,
        completed_at=sample_job.completed_at,
        total_clips=1,
        completed_clips=0,
        failed_clips=1,
        outputs=[],
    )
    storage.persist_job(modified_job)
    
    # Load - should have only one job with updated status
    jobs = storage.load_all_jobs()
    assert len(jobs) == 1
    assert jobs[0].final_status == "FAILED"
    
    storage.close()


def test_storage_multiple_jobs(temp_storage_path, sample_job, sample_failed_job):
    """Test storing multiple jobs."""
    storage = FabricStorage(temp_storage_path)
    storage.open()
    
    storage.persist_job(sample_job)
    storage.persist_job(sample_failed_job)
    
    jobs = storage.load_all_jobs()
    assert len(jobs) == 2
    
    job_ids = {job.job_id for job in jobs}
    assert job_ids == {"test_job_001", "test_job_002"}
    
    storage.close()


# ===== Persistence Tests =====

def test_persistence_lifecycle(temp_storage_path):
    """Test persistence open/close lifecycle."""
    persistence = FabricPersistence(temp_storage_path)
    
    assert not persistence.is_open()
    
    persistence.open()
    assert persistence.is_open()
    
    persistence.close()
    assert not persistence.is_open()


def test_persistence_requires_open(temp_storage_path, sample_job):
    """Test that persistence operations require open state."""
    persistence = FabricPersistence(temp_storage_path)
    
    with pytest.raises(PersistenceError, match="not opened"):
        persistence.persist_ingested_job(sample_job)
    
    with pytest.raises(PersistenceError, match="not opened"):
        persistence.load_all_jobs()


def test_persistence_context_manager(temp_storage_path, sample_job):
    """Test persistence as context manager."""
    with FabricPersistence(temp_storage_path) as persistence:
        assert persistence.is_open()
        persistence.persist_ingested_job(sample_job)
        jobs = persistence.load_all_jobs()
        assert len(jobs) == 1
    
    assert not persistence.is_open()


# ===== Index Rebuild Tests =====

def test_index_rebuild_from_storage(temp_storage_path, sample_job, sample_failed_job):
    """Test that index rebuilds correctly from persisted data."""
    # First session: persist jobs
    with FabricPersistence(temp_storage_path) as persistence:
        persistence.persist_ingested_job(sample_job)
        persistence.persist_ingested_job(sample_failed_job)
    
    # Second session: rebuild index from storage
    with FabricPersistence(temp_storage_path) as persistence:
        index = FabricIndex(persistence=persistence)
        
        # Verify all jobs loaded
        assert index.count_jobs() == 2
        
        # Verify indexes rebuilt correctly
        assert index.get_job("test_job_001") is not None
        assert index.get_job("test_job_002") is not None
        
        completed = index.get_jobs_by_status("COMPLETED")
        assert len(completed) == 1
        
        failed = index.get_jobs_by_status("FAILED")
        assert len(failed) == 1
        
        by_fingerprint = index.get_jobs_by_fingerprint("abc123def456")
        assert len(by_fingerprint) == 1


def test_index_persistence_write_through(temp_storage_path, sample_job):
    """Test that adding jobs to index persists them."""
    with FabricPersistence(temp_storage_path) as persistence:
        index = FabricIndex(persistence=persistence)
        
        # Add job via index
        index.add_job(sample_job)
        
        # Verify persisted immediately
        jobs = persistence.load_all_jobs()
        assert len(jobs) == 1
        assert jobs[0].job_id == sample_job.job_id


def test_index_without_persistence(sample_job):
    """Test that index works without persistence (Phase 1 mode)."""
    index = FabricIndex()  # No persistence
    
    index.add_job(sample_job)
    
    assert index.count_jobs() == 1
    assert index.get_job(sample_job.job_id) is not None


def test_index_idempotent_with_persistence(temp_storage_path, sample_job):
    """Test idempotent job addition with persistence."""
    with FabricPersistence(temp_storage_path) as persistence:
        index = FabricIndex(persistence=persistence)
        
        # Add same job twice
        index.add_job(sample_job)
        index.add_job(sample_job)
        
        # Should have only one job
        assert index.count_jobs() == 1
        
        # Storage should also have only one
        jobs = persistence.load_all_jobs()
        assert len(jobs) == 1


# ===== Query Parity Tests =====

def test_query_parity_with_persistence(
    temp_storage_path, sample_job, sample_failed_job
):
    """Test that queries work identically with persistence."""
    with FabricPersistence(temp_storage_path) as persistence:
        index = FabricIndex(persistence=persistence)
        queries = FabricQueries(index)
        
        # Add jobs
        index.add_job(sample_job)
        index.add_job(sample_failed_job)
        
        # Test queries (same as Phase 1)
        assert queries.count_jobs() == 2
        
        completed = queries.get_completed_jobs()
        assert len(completed) == 1
        assert completed[0].job_id == "test_job_001"
        
        failed = queries.get_failed_jobs()
        assert len(failed) == 1
        assert failed[0].job_id == "test_job_002"
        
        by_profile = queries.get_jobs_by_profile("proxy_h264_720p")
        assert len(by_profile) == 1
        
        by_engine = queries.get_jobs_by_engine("ffmpeg")
        assert len(by_engine) == 1


def test_query_persistence_restart(temp_storage_path, sample_job, sample_failed_job):
    """Test that queries work after process restart."""
    # Session 1: Ingest jobs
    with FabricPersistence(temp_storage_path) as persistence:
        index = FabricIndex(persistence=persistence)
        index.add_job(sample_job)
        index.add_job(sample_failed_job)
    
    # Session 2: Query persisted jobs
    with FabricPersistence(temp_storage_path) as persistence:
        index = FabricIndex(persistence=persistence)
        queries = FabricQueries(index)
        
        # All queries should work
        assert queries.count_jobs() == 2
        assert len(queries.get_completed_jobs()) == 1
        assert len(queries.get_failed_jobs()) == 1
        
        job = queries.get_job("test_job_001")
        assert job is not None
        assert job.fingerprint == "abc123def456"
        
        outputs = queries.get_outputs_for_job("test_job_001")
        assert len(outputs) == 2


# ===== Data Integrity Tests =====

def test_datetime_serialization(temp_storage_path):
    """Test that datetimes are serialized/deserialized correctly."""
    job = IngestedJob(
        job_id="datetime_test",
        final_status="COMPLETED",
        started_at=datetime(2025, 12, 29, 14, 30, 45, 123456, tzinfo=timezone.utc),
        completed_at=datetime(2025, 12, 29, 14, 35, 12, 654321, tzinfo=timezone.utc),
        total_clips=0,
        completed_clips=0,
        failed_clips=0,
        outputs=[],
    )
    
    with FabricPersistence(temp_storage_path) as persistence:
        persistence.persist_ingested_job(job)
        
        loaded = persistence.load_all_jobs()[0]
        
        # Verify datetime precision preserved
        assert loaded.started_at == job.started_at
        assert loaded.completed_at == job.completed_at


def test_optional_fields_preserved(temp_storage_path):
    """Test that None/optional fields are preserved correctly."""
    job = IngestedJob(
        job_id="optional_test",
        final_status="PARTIAL",
        started_at=datetime.now(timezone.utc),
        canonical_proxy_profile=None,
        fingerprint=None,
        validation_stage="pre-job",
        validation_error="Missing input file",
        engine_used=None,
        completed_at=None,
        total_clips=0,
        completed_clips=0,
        failed_clips=0,
        outputs=[],
    )
    
    with FabricPersistence(temp_storage_path) as persistence:
        persistence.persist_ingested_job(job)
        
        loaded = persistence.load_all_jobs()[0]
        
        assert loaded.canonical_proxy_profile is None
        assert loaded.fingerprint is None
        assert loaded.engine_used is None
        assert loaded.completed_at is None
        assert loaded.validation_stage == "pre-job"
        assert loaded.validation_error == "Missing input file"


def test_empty_outputs_list(temp_storage_path):
    """Test that empty outputs list is handled correctly."""
    job = IngestedJob(
        job_id="empty_outputs",
        final_status="PARTIAL",
        started_at=datetime.now(timezone.utc),
        total_clips=0,
        completed_clips=0,
        failed_clips=0,
        outputs=[],
    )
    
    with FabricPersistence(temp_storage_path) as persistence:
        persistence.persist_ingested_job(job)
        
        loaded = persistence.load_all_jobs()[0]
        
        assert loaded.outputs == []
        assert len(loaded.outputs) == 0


# ===== Integration Tests =====

def test_full_lifecycle_integration(temp_storage_path):
    """Test complete lifecycle: ingest, persist, restart, query."""
    # Session 1: Ingest multiple jobs
    jobs_session1 = []
    with FabricPersistence(temp_storage_path) as persistence:
        index = FabricIndex(persistence=persistence)
        
        for i in range(5):
            job = IngestedJob(
                job_id=f"job_{i:03d}",
                final_status="COMPLETED" if i % 2 == 0 else "FAILED",
                started_at=datetime.now(timezone.utc),
                canonical_proxy_profile=f"profile_{i % 3}",
                engine_used="ffmpeg" if i % 2 == 0 else "resolve",
                total_clips=1,
                completed_clips=1 if i % 2 == 0 else 0,
                failed_clips=0 if i % 2 == 0 else 1,
                outputs=[],
            )
            index.add_job(job)
            jobs_session1.append(job)
    
    # Session 2: Verify persistence and query
    with FabricPersistence(temp_storage_path) as persistence:
        index = FabricIndex(persistence=persistence)
        queries = FabricQueries(index)
        
        # Verify all jobs persisted
        assert queries.count_jobs() == 5
        
        # Verify status counts
        assert queries.count_jobs_by_status("COMPLETED") == 3
        assert queries.count_jobs_by_status("FAILED") == 2
        
        # Verify profile grouping
        profile_0_jobs = queries.get_jobs_by_profile("profile_0")
        assert len(profile_0_jobs) == 2
        
        # Verify engine grouping
        ffmpeg_jobs = queries.get_jobs_by_engine("ffmpeg")
        assert len(ffmpeg_jobs) == 3


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
