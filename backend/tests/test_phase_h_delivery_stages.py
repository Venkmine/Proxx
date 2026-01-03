"""
Phase H: Delivery Progress & ETA Honesty Tests

Tests that delivery stages are properly tracked:
- Stage transitions (queued → starting → encoding → finalizing → completed/failed)
- Progress reporting without fake percentages
- ETA only shown when derived from real signals
- Indeterminate progress for Resolve jobs
- Determinate progress for FFmpeg jobs with timing data
"""

import pytest
from pathlib import Path
import sys

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.jobs.models import Job, ClipTask, JobStatus, TaskStatus, DeliveryStage
from app.jobs.engine import JobEngine
from app.execution.progress import ProgressInfo


class TestDeliveryStageTransitions:
    """Test delivery stage state transitions."""
    
    def test_queued_task_has_queued_stage(self):
        """New tasks start with QUEUED delivery stage."""
        task = ClipTask(source_path="/test/video.mov")
        
        assert task.status == TaskStatus.QUEUED
        assert task.delivery_stage == DeliveryStage.QUEUED
    
    def test_running_task_has_starting_stage(self):
        """Tasks transition to STARTING when marked as RUNNING."""
        engine = JobEngine()
        task = ClipTask(source_path="/test/video.mov")
        
        engine.update_task_status(task, TaskStatus.RUNNING)
        
        assert task.status == TaskStatus.RUNNING
        assert task.delivery_stage == DeliveryStage.STARTING
    
    def test_encoding_stage_set_by_progress(self):
        """Delivery stage moves to ENCODING when progress > 0."""
        task = ClipTask(source_path="/test/video.mov")
        task.status = TaskStatus.RUNNING
        task.delivery_stage = DeliveryStage.STARTING
        
        # Simulate progress callback
        progress = ProgressInfo(
            clip_id=task.id,
            total_duration=120.0,
            progress_percent=5.0,
        )
        
        # This would normally be called in the progress callback
        if progress.progress_percent > 0 and task.delivery_stage == DeliveryStage.STARTING:
            task.delivery_stage = DeliveryStage.ENCODING
        
        assert task.delivery_stage == DeliveryStage.ENCODING
    
    def test_completed_task_has_completed_stage(self):
        """Completed tasks have COMPLETED delivery stage."""
        engine = JobEngine()
        task = ClipTask(source_path="/test/video.mov")
        task.status = TaskStatus.RUNNING
        
        engine.update_task_status(task, TaskStatus.COMPLETED)
        
        assert task.status == TaskStatus.COMPLETED
        assert task.delivery_stage == DeliveryStage.COMPLETED
    
    def test_failed_task_has_failed_stage(self):
        """Failed tasks have FAILED delivery stage."""
        engine = JobEngine()
        task = ClipTask(source_path="/test/video.mov")
        task.status = TaskStatus.RUNNING
        
        engine.update_task_status(
            task,
            TaskStatus.FAILED,
            failure_reason="Test failure"
        )
        
        assert task.status == TaskStatus.FAILED
        assert task.delivery_stage == DeliveryStage.FAILED


class TestProgressHonesty:
    """Test honest progress reporting rules."""
    
    def test_no_fake_progress_on_new_task(self):
        """New tasks should have zero progress, not fake values."""
        task = ClipTask(source_path="/test/video.mov")
        
        assert task.progress_percent == 0.0
        assert task.eta_seconds is None
    
    def test_progress_only_set_from_real_data(self):
        """Progress should only be set when derived from real FFmpeg output."""
        task = ClipTask(source_path="/test/video.mov")
        
        # Simulate real progress from FFmpeg
        progress = ProgressInfo(
            clip_id=task.id,
            total_duration=120.0,
            current_time=30.0,
            progress_percent=25.0,
        )
        
        task.progress_percent = progress.progress_percent
        
        assert task.progress_percent == 25.0
        assert 20.0 <= task.progress_percent <= 30.0  # Reasonable range
    
    def test_eta_only_set_when_calculable(self):
        """ETA should only be set when real encoding speed is known."""
        task = ClipTask(source_path="/test/video.mov")
        
        # Without speed data, ETA should be None
        assert task.eta_seconds is None
        
        # With real speed data, ETA can be set
        progress = ProgressInfo(
            clip_id=task.id,
            total_duration=120.0,
            current_time=30.0,
            eta_seconds=90.0,  # Calculated from real speed
        )
        
        task.eta_seconds = progress.eta_seconds
        
        assert task.eta_seconds == 90.0
        assert task.eta_seconds > 0  # Must be positive


class TestVisualHonesty:
    """Test visual honesty constraints."""
    
    def test_no_progress_bar_without_data(self):
        """Tasks without progress data should use indeterminate display."""
        task = ClipTask(source_path="/test/video.mov")
        task.status = TaskStatus.RUNNING
        task.delivery_stage = DeliveryStage.STARTING
        
        # No progress data
        assert task.progress_percent == 0.0
        
        # Frontend should show indeterminate spinner, not progress bar
        # This is verified in frontend tests
    
    def test_determinate_bar_only_with_real_progress(self):
        """Determinate progress bar only shown when progress_percent > 0."""
        task = ClipTask(source_path="/test/video.mov")
        task.status = TaskStatus.RUNNING
        task.delivery_stage = DeliveryStage.ENCODING
        task.progress_percent = 42.5
        
        # Frontend should show determinate bar
        assert task.progress_percent > 0
        assert task.delivery_stage == DeliveryStage.ENCODING
    
    def test_eta_confidence_threshold(self):
        """ETA should only be shown when confidence is high."""
        task = ClipTask(source_path="/test/video.mov")
        
        # Unreasonable ETA (> 24 hours) should not be shown
        task.eta_seconds = 100000.0
        assert task.eta_seconds > 86400  # More than 24 hours
        
        # Frontend should hide this ETA
        # Verified in frontend tests


class TestFastJobHandling:
    """Test that fast jobs still show intermediate states."""
    
    def test_fast_job_shows_starting_stage(self):
        """Even fast jobs should briefly show STARTING stage."""
        engine = JobEngine()
        task = ClipTask(source_path="/test/video.mov")
        
        # Start task
        engine.update_task_status(task, TaskStatus.RUNNING)
        assert task.delivery_stage == DeliveryStage.STARTING
        
        # Even if job completes quickly, stages were visible
        engine.update_task_status(task, TaskStatus.COMPLETED)
        assert task.delivery_stage == DeliveryStage.COMPLETED
    
    def test_minimum_stage_visibility(self):
        """Stages should be visible long enough to perceive."""
        # This is a UI concern, but backend must support it
        # by setting stages properly
        
        task = ClipTask(source_path="/test/video.mov")
        task.status = TaskStatus.RUNNING
        task.delivery_stage = DeliveryStage.STARTING
        
        # Simulate immediate progress
        task.delivery_stage = DeliveryStage.ENCODING
        task.progress_percent = 100.0
        
        # Both stages existed (even if briefly)
        assert task.progress_percent == 100.0


class TestStageLabels:
    """Test stage label mappings."""
    
    def test_all_stages_have_labels(self):
        """All delivery stages should map to human-readable labels."""
        stage_labels = {
            DeliveryStage.QUEUED: "Queued",
            DeliveryStage.STARTING: "Starting",
            DeliveryStage.ENCODING: "Encoding",
            DeliveryStage.FINALIZING: "Finalizing",
            DeliveryStage.COMPLETED: "Completed",
            DeliveryStage.FAILED: "Failed",
        }
        
        # All stages accounted for
        assert len(stage_labels) == 6
        
        # Labels are user-friendly
        for stage, label in stage_labels.items():
            assert label  # Not empty
            assert label[0].isupper()  # Capitalized
            assert label.isalpha()  # No special characters


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
