"""
Unit tests for jobs running without presets.

Alpha Rule: Presets are optional.
Jobs can run using embedded settings_snapshot instead of preset binding.

Tests:
- Job can be created without preset_id
- Job stores settings_snapshot at creation time
- override_settings can modify effective settings
- effective_settings returns override if set, else snapshot
"""

import pytest
from pathlib import Path
import sys

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / "backend"))

from app.jobs.models import Job, ClipTask
from app.deliver.settings import DeliverSettings


class TestJobWithoutPreset:
    """Test jobs can run without preset binding."""
    
    def test_job_creation_without_preset(self):
        """Job can be created without a preset_id."""
        task = ClipTask(
            source_path="/test/source.mp4",
            output_path="/test/output/source_proxy.mp4"
        )
        
        # Create job with settings_dict instead of separate fields
        settings = DeliverSettings(output_dir="/test/output")
        
        job = Job(
            tasks=[task],
            settings_dict=settings.to_dict()
        )
        
        # Job should be valid without preset
        # preset_id would be a separate attribute on the control request, not on Job
        assert job.id is not None
        assert len(job.tasks) == 1
    
    def test_job_stores_settings_snapshot(self):
        """Job stores settings_snapshot at creation time."""
        task = ClipTask(
            source_path="/test/source.mp4",
            output_path="/test/output/source_proxy.mp4"
        )
        
        settings = DeliverSettings(output_dir="/test/output")
        
        job = Job(
            tasks=[task],
            settings_dict=settings.to_dict()
        )
        
        # Accessing settings_snapshot should return the settings
        snapshot = job.settings_snapshot
        assert snapshot is not None
        assert snapshot.video is not None
        assert snapshot.output_dir == "/test/output"
    
    def test_override_settings_none_by_default(self):
        """override_settings should be None by default."""
        task = ClipTask(
            source_path="/test/source.mp4",
            output_path="/test/output/source_proxy.mp4"
        )
        
        job = Job(
            tasks=[task],
            settings_dict={}
        )
        
        assert job.override_settings is None
        assert job.override_settings_dict is None
    
    def test_effective_settings_returns_snapshot_when_no_override(self):
        """effective_settings returns snapshot when no override is set."""
        task = ClipTask(
            source_path="/test/source.mp4",
            output_path="/test/output/source_proxy.mp4"
        )
        
        settings = DeliverSettings(output_dir="/test/output")
        
        job = Job(
            tasks=[task],
            settings_dict=settings.to_dict()
        )
        
        effective = job.effective_settings
        assert effective is not None
        # Should be the same as snapshot
        assert effective.output_dir == settings.output_dir
    
    def test_set_override_settings(self):
        """set_override_settings stores override settings."""
        task = ClipTask(
            source_path="/test/source.mp4",
            output_path="/test/output/source_proxy.mp4"
        )
        
        settings = DeliverSettings(output_dir="/test/output")
        
        job = Job(
            tasks=[task],
            settings_dict=settings.to_dict()
        )
        
        # Set an override
        override = DeliverSettings(output_dir="/different/output")
        job.set_override_settings(override)
        
        assert job.override_settings is not None
        assert job.override_settings_dict is not None
        assert job.override_settings.output_dir == "/different/output"
    
    def test_effective_settings_returns_override_when_set(self):
        """effective_settings returns override when override is set."""
        task = ClipTask(
            source_path="/test/source.mp4",
            output_path="/test/output/source_proxy.mp4"
        )
        
        settings = DeliverSettings(output_dir="/original/output")
        
        job = Job(
            tasks=[task],
            settings_dict=settings.to_dict()
        )
        
        # Set an override with different settings
        override = DeliverSettings(output_dir="/override/output")
        job.set_override_settings(override)
        
        effective = job.effective_settings
        assert effective is not None
        # Should have the override's output_dir
        assert effective.output_dir == "/override/output"


class TestJobSettingsImmutability:
    """Test that settings_snapshot is immutable after creation."""
    
    def test_settings_snapshot_preserved(self):
        """Original settings are preserved even if override is set."""
        task = ClipTask(
            source_path="/test/source.mp4",
            output_path="/test/output/source_proxy.mp4"
        )
        
        original_settings = DeliverSettings(output_dir="/original/output")
        
        job = Job(
            tasks=[task],
            settings_dict=original_settings.to_dict()
        )
        
        # Store original output_dir
        original_dir = job.settings_snapshot.output_dir
        
        # Set an override
        override = DeliverSettings(output_dir="/override/output")
        job.set_override_settings(override)
        
        # Snapshot should still have original value
        snapshot = job.settings_snapshot
        assert snapshot.output_dir == original_dir
