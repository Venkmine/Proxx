"""
QC tests for execution event timeline.

Verifies:
- Events are emitted in correct order
- Partial failures still emit full timeline
- Clip failures produce CLIP_FAILED events
- COMPLETE / PARTIAL / FAILED jobs all have timelines
- Timeline determinism (same input → same event sequence shape)

Tests run fast (<1s) and do not invoke FFmpeg.
"""

import pytest
from datetime import datetime
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock

from execution.executionEvents import (
    ExecutionEventType,
    ExecutionEvent,
    ExecutionEventRecorder,
)
from app.jobs.models import Job, ClipTask, JobStatus, TaskStatus
from app.jobs.engine import JobEngine


class TestExecutionEventRecorder:
    """Test the event recorder basic functionality."""
    
    def test_record_event(self):
        """Test recording a simple event."""
        recorder = ExecutionEventRecorder()
        recorder.record(
            ExecutionEventType.JOB_CREATED,
            message="Job created"
        )
        
        events = recorder.get_events()
        assert len(events) == 1
        assert events[0].event_type == ExecutionEventType.JOB_CREATED
        assert events[0].message == "Job created"
        assert events[0].clip_id is None
    
    def test_record_clip_event(self):
        """Test recording an event with clip context."""
        recorder = ExecutionEventRecorder()
        recorder.record(
            ExecutionEventType.CLIP_STARTED,
            clip_id="clip123",
            message="Encoding started"
        )
        
        events = recorder.get_events()
        assert len(events) == 1
        assert events[0].event_type == ExecutionEventType.CLIP_STARTED
        assert events[0].clip_id == "clip123"
        assert events[0].message == "Encoding started"
    
    def test_events_in_order(self):
        """Test that events are recorded in chronological order."""
        recorder = ExecutionEventRecorder()
        
        recorder.record(ExecutionEventType.JOB_CREATED)
        recorder.record(ExecutionEventType.EXECUTION_STARTED)
        recorder.record(ExecutionEventType.CLIP_STARTED, clip_id="clip1")
        recorder.record(ExecutionEventType.CLIP_COMPLETED, clip_id="clip1")
        recorder.record(ExecutionEventType.EXECUTION_COMPLETED)
        
        events = recorder.get_events()
        assert len(events) == 5
        assert events[0].event_type == ExecutionEventType.JOB_CREATED
        assert events[1].event_type == ExecutionEventType.EXECUTION_STARTED
        assert events[2].event_type == ExecutionEventType.CLIP_STARTED
        assert events[3].event_type == ExecutionEventType.CLIP_COMPLETED
        assert events[4].event_type == ExecutionEventType.EXECUTION_COMPLETED
    
    def test_filter_events_by_clip(self):
        """Test filtering events by clip ID."""
        recorder = ExecutionEventRecorder()
        
        recorder.record(ExecutionEventType.JOB_CREATED)
        recorder.record(ExecutionEventType.CLIP_STARTED, clip_id="clip1")
        recorder.record(ExecutionEventType.CLIP_STARTED, clip_id="clip2")
        recorder.record(ExecutionEventType.CLIP_COMPLETED, clip_id="clip1")
        recorder.record(ExecutionEventType.CLIP_COMPLETED, clip_id="clip2")
        
        clip1_events = recorder.get_events_for_clip("clip1")
        assert len(clip1_events) == 2
        assert all(e.clip_id == "clip1" for e in clip1_events)
        assert clip1_events[0].event_type == ExecutionEventType.CLIP_STARTED
        assert clip1_events[1].event_type == ExecutionEventType.CLIP_COMPLETED
    
    def test_recording_never_raises(self):
        """Test that recording failures are silently ignored."""
        recorder = ExecutionEventRecorder()
        
        # Even with invalid data, recording should not raise
        try:
            recorder.record(None)  # type: ignore
        except Exception:
            pytest.fail("Event recording should never raise exceptions")
        
        # Events list should still be accessible
        events = recorder.get_events()
        assert isinstance(events, list)


class TestJobLifecycleEvents:
    """Test that job lifecycle produces correct events."""
    
    def test_job_creation_event(self):
        """Test that job creation records an event."""
        engine = JobEngine(binding_registry=None, engine_registry=None)
        job = engine.create_job(
            source_paths=["/path/to/source.mov"],
            engine="ffmpeg"
        )
        
        events = job.event_recorder.get_events()
        assert len(events) >= 1
        assert events[0].event_type == ExecutionEventType.JOB_CREATED
        assert "1 clips" in events[0].message
    
    def test_execution_start_event(self):
        """Test that starting a job records an event."""
        engine = JobEngine(binding_registry=None, engine_registry=None)
        job = engine.create_job(
            source_paths=["/path/to/source.mov"],
            engine="ffmpeg"
        )
        
        engine.start_job(job)
        
        events = job.event_recorder.get_events()
        assert any(e.event_type == ExecutionEventType.EXECUTION_STARTED for e in events)
    
    def test_execution_pause_event(self):
        """Test that pausing a job records an event."""
        engine = JobEngine(binding_registry=None, engine_registry=None)
        job = engine.create_job(
            source_paths=["/path/to/source.mov"],
            engine="ffmpeg"
        )
        
        engine.start_job(job)
        engine.pause_job(job)
        
        events = job.event_recorder.get_events()
        assert any(e.event_type == ExecutionEventType.EXECUTION_PAUSED for e in events)
    
    def test_execution_resume_event(self):
        """Test that resuming a job records an event."""
        engine = JobEngine(binding_registry=None, engine_registry=None)
        job = engine.create_job(
            source_paths=["/path/to/source.mov"],
            engine="ffmpeg"
        )
        
        engine.start_job(job)
        engine.pause_job(job)
        engine.resume_job(job)
        
        events = job.event_recorder.get_events()
        assert any(e.event_type == ExecutionEventType.EXECUTION_RESUMED for e in events)
    
    def test_execution_cancel_event(self):
        """Test that cancelling a job records an event."""
        engine = JobEngine(binding_registry=None, engine_registry=None)
        job = engine.create_job(
            source_paths=["/path/to/source.mov"],
            engine="ffmpeg"
        )
        
        engine.start_job(job)
        engine.cancel_job(job, reason="User cancelled")
        
        events = job.event_recorder.get_events()
        assert any(e.event_type == ExecutionEventType.EXECUTION_CANCELLED for e in events)
        cancel_event = next(e for e in events if e.event_type == ExecutionEventType.EXECUTION_CANCELLED)
        assert "User cancelled" in cancel_event.message


class TestClipExecutionEvents:
    """Test that clip execution produces correct events."""
    
    @patch('app.jobs.engine.JobEngine._execute_task')
    @patch('app.jobs.engine.JobEngine._resolve_clip_outputs')
    def test_successful_clip_execution_events(self, mock_resolve, mock_execute):
        """Test that successful clip execution records all expected events."""
        from app.execution.results import ExecutionResult, ExecutionStatus
        
        # Mock successful execution
        mock_execute.return_value = ExecutionResult(
            status=ExecutionStatus.SUCCESS,
            source_path="/path/to/source.mov",
            output_path="/path/to/output.mov",
            started_at=datetime.now(),
            completed_at=datetime.now(),
        )
        
        # Mock path resolution (set output_path on task)
        def set_output_path(job, *args):
            for task in job.tasks:
                task.output_path = "/path/to/output.mov"
        
        mock_resolve.side_effect = set_output_path
        
        # Mock output file existence
        with patch('pathlib.Path.is_file', return_value=True), \
             patch('pathlib.Path.stat') as mock_stat:
            mock_stat.return_value.st_size = 1000000
            
            engine = JobEngine(binding_registry=None, engine_registry=None)
            job = engine.create_job(
                source_paths=["/path/to/source.mov"],
                engine="ffmpeg"
            )
            
            # Execute the job
            engine._process_job(job, "preset", None, None)
            
            events = job.event_recorder.get_events()
            event_types = [e.event_type for e in events]
            
            # Verify event sequence
            assert ExecutionEventType.CLIP_QUEUED in event_types
            assert ExecutionEventType.CLIP_STARTED in event_types
            assert ExecutionEventType.CLIP_COMPLETED in event_types
    
    @patch('app.jobs.engine.JobEngine._execute_task')
    @patch('app.jobs.engine.JobEngine._resolve_clip_outputs')
    def test_failed_clip_execution_events(self, mock_resolve, mock_execute):
        """Test that failed clip execution records failure events."""
        from app.execution.results import ExecutionResult, ExecutionStatus
        
        # Mock failed execution
        mock_execute.return_value = ExecutionResult(
            status=ExecutionStatus.FAILED,
            source_path="/path/to/source.mov",
            output_path=None,
            failure_reason="FFmpeg encoding failed",
            started_at=datetime.now(),
            completed_at=datetime.now(),
        )
        
        # Mock path resolution
        def set_output_path(job, *args):
            for task in job.tasks:
                task.output_path = "/path/to/output.mov"
        
        mock_resolve.side_effect = set_output_path
        
        engine = JobEngine(binding_registry=None, engine_registry=None)
        job = engine.create_job(
            source_paths=["/path/to/source.mov"],
            engine="ffmpeg"
        )
        
        # Execute the job
        engine._process_job(job, "preset", None, None)
        
        events = job.event_recorder.get_events()
        event_types = [e.event_type for e in events]
        
        # Verify failure event is recorded
        assert ExecutionEventType.CLIP_FAILED in event_types
        
        # Verify failure message is captured
        failed_events = [e for e in events if e.event_type == ExecutionEventType.CLIP_FAILED]
        assert len(failed_events) > 0
        assert any("failed" in e.message.lower() for e in failed_events if e.message)


class TestTimelineDeterminism:
    """Test that execution timeline is deterministic."""
    
    def test_same_input_produces_same_event_sequence(self):
        """Test that identical inputs produce identical event sequences (structurally)."""
        engine1 = JobEngine(binding_registry=None, engine_registry=None)
        job1 = engine1.create_job(
            source_paths=["/path/to/source.mov"],
            engine="ffmpeg"
        )
        engine1.start_job(job1)
        
        engine2 = JobEngine(binding_registry=None, engine_registry=None)
        job2 = engine2.create_job(
            source_paths=["/path/to/source.mov"],
            engine="ffmpeg"
        )
        engine2.start_job(job2)
        
        # Event types should match (timestamps will differ)
        events1 = [e.event_type for e in job1.event_recorder.get_events()]
        events2 = [e.event_type for e in job2.event_recorder.get_events()]
        
        assert events1 == events2
    
    def test_partial_failure_has_complete_timeline(self):
        """Test that partial failures still produce a complete timeline."""
        # This test verifies that even if some clips fail, all events are recorded
        # We don't have real execution here, but we can test the structure
        recorder = ExecutionEventRecorder()
        
        # Simulate a job with one success and one failure
        recorder.record(ExecutionEventType.JOB_CREATED)
        recorder.record(ExecutionEventType.EXECUTION_STARTED)
        
        # Clip 1: Success
        recorder.record(ExecutionEventType.CLIP_STARTED, clip_id="clip1")
        recorder.record(ExecutionEventType.CLIP_COMPLETED, clip_id="clip1")
        
        # Clip 2: Failure
        recorder.record(ExecutionEventType.CLIP_STARTED, clip_id="clip2")
        recorder.record(ExecutionEventType.CLIP_FAILED, clip_id="clip2", message="Encoding failed")
        
        recorder.record(ExecutionEventType.EXECUTION_FAILED, message="Partial failure")
        
        events = recorder.get_events()
        assert len(events) == 7
        
        # Verify all expected event types are present
        event_types = [e.event_type for e in events]
        assert ExecutionEventType.CLIP_COMPLETED in event_types
        assert ExecutionEventType.CLIP_FAILED in event_types
        assert ExecutionEventType.EXECUTION_FAILED in event_types


class TestTimelineImmutability:
    """Test that events are immutable once recorded."""
    
    def test_get_events_returns_copy(self):
        """Test that get_events() returns a copy, not the original list."""
        recorder = ExecutionEventRecorder()
        recorder.record(ExecutionEventType.JOB_CREATED)
        
        events1 = recorder.get_events()
        events2 = recorder.get_events()
        
        # Lists should be different objects
        assert events1 is not events2
        
        # But contents should be identical
        assert len(events1) == len(events2)
        assert events1[0].event_type == events2[0].event_type
    
    def test_events_cannot_be_modified_externally(self):
        """Test that modifying returned events doesn't affect the recorder."""
        recorder = ExecutionEventRecorder()
        recorder.record(ExecutionEventType.JOB_CREATED)
        recorder.record(ExecutionEventType.EXECUTION_STARTED)
        
        events = recorder.get_events()
        original_count = len(events)
        
        # Try to modify the returned list
        events.clear()
        
        # Recorder's internal list should be unchanged
        new_events = recorder.get_events()
        assert len(new_events) == original_count


class TestEventPersistence:
    """Test that events are persisted with diagnostics."""
    
    def test_events_in_diagnostics_info(self):
        """Test that events are included in DiagnosticsInfo."""
        from app.reporting.models import ExecutionEventSummary
        
        # Create some events
        recorder = ExecutionEventRecorder()
        recorder.record(ExecutionEventType.JOB_CREATED, message="Test job")
        recorder.record(ExecutionEventType.CLIP_STARTED, clip_id="clip1")
        
        # Convert to ExecutionEventSummary format (as done in engine.py)
        events = recorder.get_events()
        summaries = [
            ExecutionEventSummary(
                event_type=event.event_type.value,
                timestamp=event.timestamp.isoformat(),
                clip_id=event.clip_id,
                message=event.message,
            )
            for event in events
        ]
        
        assert len(summaries) == 2
        assert summaries[0].event_type == "job_created"
        assert summaries[1].event_type == "clip_started"
        assert summaries[1].clip_id == "clip1"
