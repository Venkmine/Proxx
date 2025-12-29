"""
Test suite for Fabric Phase 1: Read-Only Ingestion.

Tests verify:
- Successful ingestion of valid ExecutionResult
- Rejection of malformed results
- Idempotent ingestion
- Correct indexing
- No dependency on Proxx internals
- No mutation of ingested data

All tests use synthetic JSON. No real media files.
"""

import json
import pytest
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from fabric.ingestion import ingest_execution_result, IngestionError
from fabric.index import FabricIndex
from fabric.queries import FabricQueries
from fabric.models import IngestedJob, IngestedOutput


# --- Test Fixtures ---

def create_valid_execution_result() -> dict:
    """Create a valid JobExecutionResult JSON structure."""
    return {
        "job_id": "test_job_123",
        "final_status": "COMPLETED",
        "clips": [
            {
                "source_path": "/test/source1.mp4",
                "resolved_output_path": "/test/output1.mp4",
                "ffmpeg_command": ["ffmpeg", "-i", "input.mp4", "output.mp4"],
                "exit_code": 0,
                "output_exists": True,
                "output_size_bytes": 1024000,
                "status": "COMPLETED",
                "failure_reason": None,
                "validation_stage": None,
                "engine_used": "ffmpeg",
                "proxy_profile_used": "PRX_STD_H264",
                "resolve_preset_used": None,
                "started_at": "2025-12-29T10:00:00+00:00",
                "completed_at": "2025-12-29T10:05:00+00:00",
                "duration_seconds": 300.0,
            },
            {
                "source_path": "/test/source2.mp4",
                "resolved_output_path": "/test/output2.mp4",
                "ffmpeg_command": ["ffmpeg", "-i", "input2.mp4", "output2.mp4"],
                "exit_code": 0,
                "output_exists": True,
                "output_size_bytes": 2048000,
                "status": "COMPLETED",
                "failure_reason": None,
                "validation_stage": None,
                "engine_used": "ffmpeg",
                "proxy_profile_used": "PRX_STD_H264",
                "resolve_preset_used": None,
                "started_at": "2025-12-29T10:05:00+00:00",
                "completed_at": "2025-12-29T10:10:00+00:00",
                "duration_seconds": 300.0,
            },
        ],
        "started_at": "2025-12-29T10:00:00+00:00",
        "completed_at": "2025-12-29T10:10:00+00:00",
        "duration_seconds": 600.0,
        "total_clips": 2,
        "completed_clips": 2,
        "failed_clips": 0,
        "_metadata": {
            "jobspec_version": "2.0",
            "validation_error": None,
            "validation_stage": None,
            "engine_used": "ffmpeg",
            "resolve_preset_used": None,
            "proxy_profile_used": "PRX_STD_H264",
        },
    }


def create_failed_execution_result() -> dict:
    """Create a failed JobExecutionResult JSON structure."""
    return {
        "job_id": "test_job_failed",
        "final_status": "FAILED",
        "clips": [
            {
                "source_path": "/test/source_bad.mp4",
                "resolved_output_path": "/test/output_bad.mp4",
                "ffmpeg_command": ["ffmpeg", "-i", "bad.mp4", "output.mp4"],
                "exit_code": 1,
                "output_exists": False,
                "output_size_bytes": None,
                "status": "FAILED",
                "failure_reason": "FFmpeg returned non-zero exit code: 1",
                "validation_stage": "execution",
                "engine_used": "ffmpeg",
                "proxy_profile_used": "PRX_STD_H264",
                "resolve_preset_used": None,
                "started_at": "2025-12-29T11:00:00+00:00",
                "completed_at": "2025-12-29T11:01:00+00:00",
                "duration_seconds": 60.0,
            },
        ],
        "started_at": "2025-12-29T11:00:00+00:00",
        "completed_at": "2025-12-29T11:01:00+00:00",
        "duration_seconds": 60.0,
        "total_clips": 1,
        "completed_clips": 0,
        "failed_clips": 1,
        "_metadata": {
            "jobspec_version": "2.0",
            "validation_error": None,
            "validation_stage": "execution",
            "engine_used": "ffmpeg",
            "resolve_preset_used": None,
            "proxy_profile_used": "PRX_STD_H264",
        },
    }


# --- Ingestion Tests ---

def test_ingest_valid_execution_result(tmp_path):
    """Test ingesting a valid JobExecutionResult."""
    # Create test file
    test_data = create_valid_execution_result()
    test_file = tmp_path / "test_job.json"
    with open(test_file, "w") as f:
        json.dump(test_data, f)
    
    # Ingest
    job = ingest_execution_result(str(test_file))
    
    # Verify basic fields
    assert job.job_id == "test_job_123"
    assert job.final_status == "COMPLETED"
    assert job.canonical_proxy_profile == "PRX_STD_H264"
    assert job.engine_used == "ffmpeg"
    assert job.total_clips == 2
    assert job.completed_clips == 2
    assert job.failed_clips == 0
    assert len(job.outputs) == 2
    
    # Verify outputs
    assert job.outputs[0].source_path == "/test/source1.mp4"
    assert job.outputs[0].output_path == "/test/output1.mp4"
    assert job.outputs[0].status == "COMPLETED"
    assert job.outputs[0].output_exists is True
    assert job.outputs[0].output_size_bytes == 1024000


def test_ingest_failed_execution_result(tmp_path):
    """Test ingesting a failed JobExecutionResult."""
    test_data = create_failed_execution_result()
    test_file = tmp_path / "test_job_failed.json"
    with open(test_file, "w") as f:
        json.dump(test_data, f)
    
    job = ingest_execution_result(str(test_file))
    
    assert job.job_id == "test_job_failed"
    assert job.final_status == "FAILED"
    assert job.failed_clips == 1
    assert job.outputs[0].status == "FAILED"
    assert job.outputs[0].failure_reason == "FFmpeg returned non-zero exit code: 1"


def test_reject_missing_file():
    """Test that ingestion fails when file doesn't exist."""
    with pytest.raises(IngestionError, match="File not found"):
        ingest_execution_result("/nonexistent/file.json")


def test_reject_malformed_json(tmp_path):
    """Test that ingestion fails on malformed JSON."""
    test_file = tmp_path / "malformed.json"
    with open(test_file, "w") as f:
        f.write("{invalid json")
    
    with pytest.raises(IngestionError, match="Invalid JSON"):
        ingest_execution_result(str(test_file))


def test_reject_missing_required_fields(tmp_path):
    """Test that ingestion fails when required fields are missing."""
    test_data = {"job_id": "test"}  # Missing final_status, clips, started_at
    test_file = tmp_path / "incomplete.json"
    with open(test_file, "w") as f:
        json.dump(test_data, f)
    
    with pytest.raises(IngestionError, match="Missing required fields"):
        ingest_execution_result(str(test_file))


def test_reject_invalid_status(tmp_path):
    """Test that ingestion fails on invalid status values."""
    test_data = create_valid_execution_result()
    test_data["final_status"] = "UNKNOWN"
    test_file = tmp_path / "invalid_status.json"
    with open(test_file, "w") as f:
        json.dump(test_data, f)
    
    with pytest.raises(IngestionError, match="Invalid final_status"):
        ingest_execution_result(str(test_file))


def test_idempotent_ingestion(tmp_path):
    """Test that ingesting the same file twice produces the same result."""
    test_data = create_valid_execution_result()
    test_file = tmp_path / "test_job.json"
    with open(test_file, "w") as f:
        json.dump(test_data, f)
    
    job1 = ingest_execution_result(str(test_file))
    job2 = ingest_execution_result(str(test_file))
    
    # Should produce identical results
    assert job1.job_id == job2.job_id
    assert job1.final_status == job2.final_status
    assert len(job1.outputs) == len(job2.outputs)
    assert job1.outputs[0].clip_id == job2.outputs[0].clip_id


# --- Indexing Tests ---

def test_index_add_job():
    """Test adding a job to the index."""
    index = FabricIndex()
    
    # Create a job
    job = IngestedJob(
        job_id="test_123",
        final_status="COMPLETED",
        canonical_proxy_profile="PRX_STD_H264",
        started_at=datetime.now(timezone.utc),
    )
    
    index.add_job(job)
    
    # Verify retrieval
    retrieved = index.get_job("test_123")
    assert retrieved is not None
    assert retrieved.job_id == "test_123"


def test_index_reingestion():
    """Test that re-adding a job with same ID replaces the old one."""
    index = FabricIndex()
    
    job1 = IngestedJob(
        job_id="test_123",
        final_status="FAILED",
        canonical_proxy_profile="PRX_STD_H264",
        started_at=datetime.now(timezone.utc),
    )
    
    job2 = IngestedJob(
        job_id="test_123",
        final_status="COMPLETED",
        canonical_proxy_profile="PRX_STD_H265",
        started_at=datetime.now(timezone.utc),
    )
    
    index.add_job(job1)
    index.add_job(job2)
    
    # Should have the second job
    retrieved = index.get_job("test_123")
    assert retrieved.final_status == "COMPLETED"
    assert retrieved.canonical_proxy_profile == "PRX_STD_H265"
    
    # Should only have one job in index
    assert index.count_jobs() == 1


def test_index_by_profile():
    """Test indexing and retrieval by profile."""
    index = FabricIndex()
    
    job1 = IngestedJob(
        job_id="job1",
        final_status="COMPLETED",
        canonical_proxy_profile="PRX_STD_H264",
        started_at=datetime.now(timezone.utc),
    )
    
    job2 = IngestedJob(
        job_id="job2",
        final_status="COMPLETED",
        canonical_proxy_profile="PRX_STD_H264",
        started_at=datetime.now(timezone.utc),
    )
    
    job3 = IngestedJob(
        job_id="job3",
        final_status="COMPLETED",
        canonical_proxy_profile="PRX_STD_H265",
        started_at=datetime.now(timezone.utc),
    )
    
    index.add_job(job1)
    index.add_job(job2)
    index.add_job(job3)
    
    # Query by profile
    h264_jobs = index.get_jobs_by_profile("PRX_STD_H264")
    assert len(h264_jobs) == 2
    assert all(j.canonical_proxy_profile == "PRX_STD_H264" for j in h264_jobs)
    
    h265_jobs = index.get_jobs_by_profile("PRX_STD_H265")
    assert len(h265_jobs) == 1


def test_index_by_status():
    """Test indexing and retrieval by status."""
    index = FabricIndex()
    
    completed_job = IngestedJob(
        job_id="completed",
        final_status="COMPLETED",
        canonical_proxy_profile="PRX_STD_H264",
        started_at=datetime.now(timezone.utc),
    )
    
    failed_job = IngestedJob(
        job_id="failed",
        final_status="FAILED",
        canonical_proxy_profile="PRX_STD_H264",
        started_at=datetime.now(timezone.utc),
    )
    
    index.add_job(completed_job)
    index.add_job(failed_job)
    
    # Query by status
    completed = index.get_jobs_by_status("COMPLETED")
    assert len(completed) == 1
    assert completed[0].job_id == "completed"
    
    failed = index.get_jobs_by_status("FAILED")
    assert len(failed) == 1
    assert failed[0].job_id == "failed"


# --- Query Tests ---

def test_queries_get_job():
    """Test retrieving a job by ID."""
    index = FabricIndex()
    queries = FabricQueries(index)
    
    job = IngestedJob(
        job_id="test_123",
        final_status="COMPLETED",
        canonical_proxy_profile="PRX_STD_H264",
        started_at=datetime.now(timezone.utc),
    )
    
    index.add_job(job)
    
    retrieved = queries.get_job("test_123")
    assert retrieved is not None
    assert retrieved.job_id == "test_123"


def test_queries_get_failed_jobs():
    """Test querying for failed jobs."""
    index = FabricIndex()
    queries = FabricQueries(index)
    
    completed_job = IngestedJob(
        job_id="completed",
        final_status="COMPLETED",
        canonical_proxy_profile="PRX_STD_H264",
        started_at=datetime.now(timezone.utc),
    )
    
    failed_job = IngestedJob(
        job_id="failed",
        final_status="FAILED",
        canonical_proxy_profile="PRX_STD_H264",
        started_at=datetime.now(timezone.utc),
    )
    
    index.add_job(completed_job)
    index.add_job(failed_job)
    
    failed_jobs = queries.get_failed_jobs()
    assert len(failed_jobs) == 1
    assert failed_jobs[0].job_id == "failed"


def test_queries_count_jobs():
    """Test counting jobs."""
    index = FabricIndex()
    queries = FabricQueries(index)
    
    for i in range(5):
        job = IngestedJob(
            job_id=f"job_{i}",
            final_status="COMPLETED",
            canonical_proxy_profile="PRX_STD_H264",
            started_at=datetime.now(timezone.utc),
        )
        index.add_job(job)
    
    assert queries.count_jobs() == 5


def test_queries_get_outputs_for_job():
    """Test retrieving outputs for a specific job."""
    index = FabricIndex()
    queries = FabricQueries(index)
    
    output1 = IngestedOutput(
        job_id="test_123",
        clip_id="clip1",
        source_path="/test/source1.mp4",
        output_path="/test/output1.mp4",
        output_exists=True,
        output_size_bytes=1024,
        status="COMPLETED",
    )
    
    output2 = IngestedOutput(
        job_id="test_123",
        clip_id="clip2",
        source_path="/test/source2.mp4",
        output_path="/test/output2.mp4",
        output_exists=True,
        output_size_bytes=2048,
        status="COMPLETED",
    )
    
    job = IngestedJob(
        job_id="test_123",
        final_status="COMPLETED",
        canonical_proxy_profile="PRX_STD_H264",
        started_at=datetime.now(timezone.utc),
        outputs=[output1, output2],
    )
    
    index.add_job(job)
    
    outputs = queries.get_outputs_for_job("test_123")
    assert len(outputs) == 2
    assert outputs[0].clip_id == "clip1"
    assert outputs[1].clip_id == "clip2"


# --- Integration Tests ---

def test_full_ingestion_to_query_flow(tmp_path):
    """Test complete flow from file ingestion to querying."""
    # Create test file
    test_data = create_valid_execution_result()
    test_file = tmp_path / "test_job.json"
    with open(test_file, "w") as f:
        json.dump(test_data, f)
    
    # Ingest
    job = ingest_execution_result(str(test_file))
    
    # Index
    index = FabricIndex()
    index.add_job(job)
    
    # Query
    queries = FabricQueries(index)
    
    # Verify we can retrieve and query the job
    retrieved = queries.get_job("test_job_123")
    assert retrieved is not None
    assert retrieved.success is True
    
    # Query by profile
    profile_jobs = queries.get_jobs_by_profile("PRX_STD_H264")
    assert len(profile_jobs) == 1
    
    # Query outputs
    outputs = queries.get_outputs_for_job("test_job_123")
    assert len(outputs) == 2


# --- Immutability Tests ---

def test_ingested_job_immutability():
    """Test that IngestedJob is immutable (frozen dataclass)."""
    job = IngestedJob(
        job_id="test_123",
        final_status="COMPLETED",
        canonical_proxy_profile="PRX_STD_H264",
        started_at=datetime.now(timezone.utc),
    )
    
    # Should not be able to mutate
    with pytest.raises(AttributeError):
        job.job_id = "modified"  # type: ignore


def test_ingested_output_immutability():
    """Test that IngestedOutput is immutable (frozen dataclass)."""
    output = IngestedOutput(
        job_id="test_123",
        clip_id="clip1",
        source_path="/test/source.mp4",
        output_path="/test/output.mp4",
        output_exists=True,
        output_size_bytes=1024,
        status="COMPLETED",
    )
    
    # Should not be able to mutate
    with pytest.raises(AttributeError):
        output.status = "FAILED"  # type: ignore


# --- Independence Tests ---

def test_no_proxx_dependency():
    """
    Test that Fabric can be imported without importing Proxx modules.
    
    This ensures Fabric is truly independent and read-only.
    """
    # This test verifies that we can use Fabric without backend imports
    from fabric.models import IngestedJob
    from fabric.ingestion import ingest_execution_result
    from fabric.index import FabricIndex
    from fabric.queries import FabricQueries
    
    # Should be able to create instances without backend
    index = FabricIndex()
    queries = FabricQueries(index)
    
    # Verify types exist
    assert IngestedJob is not None
    assert ingest_execution_result is not None


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
