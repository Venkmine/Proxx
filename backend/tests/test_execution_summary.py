"""
QC Tests for Execution Summary & Export (Phase 4)

Tests deterministic execution summary generation and export formats.
Validates read-only behavior, schema completeness, and format correctness.

Must run fast (<1s), no FFmpeg invocation, no file I/O.
"""

import pytest
import json
from datetime import datetime
from typing import List

from app.jobs.models import Job, ClipTask, JobStatus, TaskStatus
from execution.executionSummary import (
    create_execution_summary,
    export_execution_summary,
    ExecutionSummary,
    JobMetadata,
    JobInputs,
    JobOutputs,
    JobOutcomeSummary,
    TimelineEvent,
    EnvironmentInfo
)
from execution.executionEvents import ExecutionEvent, ExecutionEventType
from execution.jobLifecycle import JobExecutionOutcome, JobState
from execution.executionPolicy import ExecutionPolicy


# ============================================================================
# FIXTURES
# ============================================================================

@pytest.fixture
def sample_job() -> Job:
    """Create a sample job for testing."""
    job = Job(
        id="test-job-123",
        engine="ffmpeg",
        status=JobStatus.COMPLETED
    )
    
    # Add some tasks
    task1 = ClipTask(
        id="task-1",
        source_path="/source/clip1.mov",
        status=TaskStatus.COMPLETED,
        output_path="/output/clip1_prores.mov"
    )
    task2 = ClipTask(
        id="task-2",
        source_path="/source/clip2.mov",
        status=TaskStatus.FAILED,
        failure_reason="Source file not found"
    )
    
    job.tasks = [task1, task2]
    
    return job


@pytest.fixture
def sample_events() -> List[ExecutionEvent]:
    """Create sample execution events."""
    now = datetime.now()
    
    return [
        ExecutionEvent(
            timestamp=now,
            event_type=ExecutionEventType.JOB_STARTED,
            message="Job started",
            clip_id=None
        ),
        ExecutionEvent(
            timestamp=now,
            event_type=ExecutionEventType.CLIP_STARTED,
            message="Clip encoding started",
            clip_id="task-1"
        ),
        ExecutionEvent(
            timestamp=now,
            event_type=ExecutionEventType.CLIP_COMPLETED,
            message="Clip encoding completed",
            clip_id="task-1"
        )
    ]


@pytest.fixture
def sample_outcome() -> JobExecutionOutcome:
    """Create sample execution outcome."""
    return JobExecutionOutcome(
        job_state=JobState.PARTIAL,
        summary="1 of 2 clips completed successfully",
        total_clips=2,
        success_clips=1,
        failed_clips=1,
        skipped_clips=0,
        failure_types=["SOURCE_FILE_MISSING"]
    )


@pytest.fixture
def sample_policy() -> ExecutionPolicy:
    """Create sample execution policy."""
    return ExecutionPolicy.default()


# ============================================================================
# SCHEMA TESTS
# ============================================================================

def test_execution_summary_schema_completeness(
    sample_job,
    sample_events,
    sample_outcome,
    sample_policy
):
    """Test that ExecutionSummary includes all required fields."""
    summary = create_execution_summary(
        job=sample_job,
        execution_events=sample_events,
        execution_outcome=sample_outcome,
        execution_policy=sample_policy
    )
    
    # Verify top-level structure
    assert isinstance(summary, ExecutionSummary)
    assert isinstance(summary.metadata, JobMetadata)
    assert isinstance(summary.inputs, JobInputs)
    assert isinstance(summary.outputs, JobOutputs)
    assert isinstance(summary.outcome, JobOutcomeSummary)
    assert isinstance(summary.timeline, list)
    assert isinstance(summary.environment, EnvironmentInfo)
    
    # Verify metadata fields
    assert summary.metadata.job_id == "test-job-123"
    assert summary.metadata.engine == "ffmpeg"
    assert summary.metadata.status == "completed"
    
    # Verify inputs
    assert summary.inputs.total_clips == 2
    assert len(summary.inputs.source_files) == 2
    
    # Verify outputs
    assert summary.outputs.output_directory is not None
    assert len(summary.outputs.completed_files) == 1
    
    # Verify outcome
    assert summary.outcome.job_state == "PARTIAL"
    assert summary.outcome.success_count == 1
    assert summary.outcome.failed_count == 1
    
    # Verify timeline
    assert len(summary.timeline) == 3
    assert all(isinstance(event, TimelineEvent) for event in summary.timeline)
    
    # Verify environment
    assert summary.environment.python_version is not None
    assert summary.environment.platform is not None


def test_execution_summary_determinism(
    sample_job,
    sample_events,
    sample_outcome,
    sample_policy
):
    """Test that same job produces same summary (determinism)."""
    # Create summary twice
    summary1 = create_execution_summary(
        job=sample_job,
        execution_events=sample_events,
        execution_outcome=sample_outcome,
        execution_policy=sample_policy
    )
    
    summary2 = create_execution_summary(
        job=sample_job,
        execution_events=sample_events,
        execution_outcome=sample_outcome,
        execution_policy=sample_policy
    )
    
    # Convert to JSON for comparison (ignoring timestamp differences)
    json1 = export_execution_summary(summary1, format="json")
    json2 = export_execution_summary(summary2, format="json")
    
    # Parse and compare (timestamps may differ slightly)
    data1 = json.loads(json1)
    data2 = json.loads(json2)
    
    # Compare metadata (excluding generated_at timestamp)
    assert data1["metadata"]["job_id"] == data2["metadata"]["job_id"]
    assert data1["metadata"]["engine"] == data2["metadata"]["engine"]
    assert data1["metadata"]["status"] == data2["metadata"]["status"]
    
    # Compare inputs
    assert data1["inputs"] == data2["inputs"]
    
    # Compare outputs (excluding paths which may be redacted differently)
    assert data1["outputs"]["completed_files"] == data2["outputs"]["completed_files"]
    
    # Compare outcome
    assert data1["outcome"]["job_state"] == data2["outcome"]["job_state"]
    assert data1["outcome"]["success_count"] == data2["outcome"]["success_count"]


def test_failed_job_includes_failure_details(sample_job):
    """Test that failed jobs export failure details."""
    # Mark job as failed
    sample_job.status = JobStatus.FAILED
    
    outcome = JobExecutionOutcome(
        job_state=JobState.TOTAL_FAILURE,
        summary="All clips failed",
        total_clips=2,
        success_clips=0,
        failed_clips=2,
        skipped_clips=0,
        failure_types=["SOURCE_FILE_MISSING", "CODEC_UNSUPPORTED"]
    )
    
    summary = create_execution_summary(
        job=sample_job,
        execution_events=[],
        execution_outcome=outcome,
        execution_policy=ExecutionPolicy.default()
    )
    
    # Verify failure information is included
    assert summary.outcome.job_state == "TOTAL_FAILURE"
    assert summary.outcome.failed_count == 2
    assert len(summary.outcome.failure_types) == 2
    assert "SOURCE_FILE_MISSING" in summary.outcome.failure_types


# ============================================================================
# EXPORT FORMAT TESTS
# ============================================================================

def test_json_export_valid_json(
    sample_job,
    sample_events,
    sample_outcome,
    sample_policy
):
    """Test that JSON export produces valid JSON."""
    summary = create_execution_summary(
        job=sample_job,
        execution_events=sample_events,
        execution_outcome=sample_outcome,
        execution_policy=sample_policy
    )
    
    json_output = export_execution_summary(summary, format="json")
    
    # Verify it's valid JSON
    data = json.loads(json_output)
    
    # Verify structure
    assert "metadata" in data
    assert "inputs" in data
    assert "outputs" in data
    assert "outcome" in data
    assert "timeline" in data
    assert "environment" in data


def test_text_export_contains_required_sections(
    sample_job,
    sample_events,
    sample_outcome,
    sample_policy
):
    """Test that text export contains all required sections."""
    summary = create_execution_summary(
        job=sample_job,
        execution_events=sample_events,
        execution_outcome=sample_outcome,
        execution_policy=sample_policy
    )
    
    text_output = export_execution_summary(summary, format="text")
    
    # Verify required sections
    assert "EXECUTION SUMMARY" in text_output
    assert "METADATA" in text_output
    assert "INPUTS" in text_output
    assert "OUTPUTS" in text_output
    assert "OUTCOME" in text_output
    assert "TIMELINE" in text_output
    assert "ENVIRONMENT" in text_output
    
    # Verify job details are present
    assert "test-job-123" in text_output
    assert "ffmpeg" in text_output.lower()


def test_text_export_80_character_formatting(
    sample_job,
    sample_events,
    sample_outcome,
    sample_policy
):
    """Test that text export respects 80-character line length."""
    summary = create_execution_summary(
        job=sample_job,
        execution_events=sample_events,
        execution_outcome=sample_outcome,
        execution_policy=sample_policy
    )
    
    text_output = export_execution_summary(summary, format="text")
    
    # Split into lines
    lines = text_output.split("\n")
    
    # Check that most lines are <= 80 characters
    # (Allow some flexibility for edge cases)
    long_lines = [line for line in lines if len(line) > 80]
    
    # Should have very few (if any) lines over 80 characters
    # Allow up to 10% of lines to exceed for paths/IDs
    assert len(long_lines) < len(lines) * 0.1


def test_path_redaction(
    sample_job,
    sample_events,
    sample_outcome,
    sample_policy
):
    """Test that path redaction works correctly."""
    summary_with_paths = create_execution_summary(
        job=sample_job,
        execution_events=sample_events,
        execution_outcome=sample_outcome,
        execution_policy=sample_policy,
        redact_paths=False
    )
    
    summary_redacted = create_execution_summary(
        job=sample_job,
        execution_events=sample_events,
        execution_outcome=sample_outcome,
        execution_policy=sample_policy,
        redact_paths=True
    )
    
    # With redaction, paths should be redacted
    assert summary_redacted.inputs.source_files[0] == "[REDACTED]"
    
    # Without redaction, paths should be present
    assert "/source/clip1.mov" in summary_with_paths.inputs.source_files[0]


# ============================================================================
# READ-ONLY BEHAVIOR TESTS
# ============================================================================

def test_summary_creation_does_not_modify_job(sample_job):
    """Test that creating summary does not modify the original job."""
    # Save original state
    original_status = sample_job.status
    original_task_count = len(sample_job.tasks)
    original_task_statuses = [task.status for task in sample_job.tasks]
    
    # Create summary
    create_execution_summary(
        job=sample_job,
        execution_events=[],
        execution_outcome=JobExecutionOutcome(
            job_state=JobState.COMPLETE,
            summary="Test",
            total_clips=2,
            success_clips=2,
            failed_clips=0,
            skipped_clips=0,
            failure_types=[]
        ),
        execution_policy=ExecutionPolicy.default()
    )
    
    # Verify job state unchanged
    assert sample_job.status == original_status
    assert len(sample_job.tasks) == original_task_count
    assert [task.status for task in sample_job.tasks] == original_task_statuses


# ============================================================================
# PERFORMANCE TESTS
# ============================================================================

def test_summary_generation_performance(
    sample_job,
    sample_events,
    sample_outcome,
    sample_policy
):
    """Test that summary generation is fast (<1s)."""
    import time
    
    start = time.time()
    
    # Generate summary
    create_execution_summary(
        job=sample_job,
        execution_events=sample_events,
        execution_outcome=sample_outcome,
        execution_policy=sample_policy
    )
    
    duration = time.time() - start
    
    # Should complete in less than 1 second
    assert duration < 1.0


def test_export_performance(
    sample_job,
    sample_events,
    sample_outcome,
    sample_policy
):
    """Test that export is fast (<1s)."""
    import time
    
    summary = create_execution_summary(
        job=sample_job,
        execution_events=sample_events,
        execution_outcome=sample_outcome,
        execution_policy=sample_policy
    )
    
    start = time.time()
    
    # Export both formats
    export_execution_summary(summary, format="json")
    export_execution_summary(summary, format="text")
    
    duration = time.time() - start
    
    # Should complete in less than 1 second
    assert duration < 1.0


# ============================================================================
# EDGE CASE TESTS
# ============================================================================

def test_empty_job_summary():
    """Test summary creation for job with no tasks."""
    job = Job(
        id="empty-job",
        engine="ffmpeg",
        status=JobStatus.PENDING,
        tasks=[]
    )
    
    outcome = JobExecutionOutcome(
        job_state=JobState.BLOCKED,
        summary="No clips to process",
        total_clips=0,
        success_clips=0,
        failed_clips=0,
        skipped_clips=0,
        failure_types=[]
    )
    
    summary = create_execution_summary(
        job=job,
        execution_events=[],
        execution_outcome=outcome,
        execution_policy=ExecutionPolicy.default()
    )
    
    # Should handle empty job gracefully
    assert summary.inputs.total_clips == 0
    assert len(summary.inputs.source_files) == 0
    assert summary.outcome.success_count == 0


def test_no_events_timeline():
    """Test summary with no execution events."""
    job = Job(
        id="test-job",
        engine="ffmpeg",
        status=JobStatus.PENDING
    )
    
    summary = create_execution_summary(
        job=job,
        execution_events=[],  # No events
        execution_outcome=JobExecutionOutcome(
            job_state=JobState.BLOCKED,
            summary="Not started",
            total_clips=0,
            success_clips=0,
            failed_clips=0,
            skipped_clips=0,
            failure_types=[]
        ),
        execution_policy=ExecutionPolicy.default()
    )
    
    # Should handle no events gracefully
    assert len(summary.timeline) == 0
    
    # Text export should still work
    text = export_execution_summary(summary, format="text")
    assert "TIMELINE" in text


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
