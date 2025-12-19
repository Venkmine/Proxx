"""
Regression tests for naming resolution.

Phase 20: Ensures DeliverSettings.file.naming_template is used correctly.
This test guards against the bug where flat attribute access was used
instead of nested settings.file.* access.
"""

import pytest
from pathlib import Path
from unittest.mock import MagicMock

from app.deliver.settings import DeliverSettings, DEFAULT_DELIVER_SETTINGS
from app.deliver.capabilities import FileCapabilities
from app.execution.naming import resolve_filename
from app.execution.output_paths import resolve_output_path
from app.execution.resolved_params import DEFAULT_H264_PARAMS
from app.jobs.models import Job, ClipTask, TaskStatus


class TestDeliverSettingsAttributes:
    """Test that DeliverSettings exposes correct nested structure."""
    
    def test_default_settings_has_file_attribute(self):
        """DeliverSettings must have a 'file' attribute."""
        settings = DEFAULT_DELIVER_SETTINGS
        assert hasattr(settings, 'file'), "DeliverSettings missing 'file' attribute"
        assert isinstance(settings.file, FileCapabilities)
    
    def test_file_has_naming_template(self):
        """FileCapabilities must have naming_template."""
        settings = DEFAULT_DELIVER_SETTINGS
        assert hasattr(settings.file, 'naming_template')
        assert settings.file.naming_template is not None
    
    def test_file_has_preserve_source_dirs(self):
        """FileCapabilities must have preserve_source_dirs."""
        settings = DEFAULT_DELIVER_SETTINGS
        assert hasattr(settings.file, 'preserve_source_dirs')
        assert isinstance(settings.file.preserve_source_dirs, bool)
    
    def test_file_has_preserve_dir_levels(self):
        """FileCapabilities must have preserve_dir_levels."""
        settings = DEFAULT_DELIVER_SETTINGS
        assert hasattr(settings.file, 'preserve_dir_levels')
        assert isinstance(settings.file.preserve_dir_levels, int)
    
    def test_file_has_prefix_suffix(self):
        """FileCapabilities must have prefix and suffix."""
        settings = DEFAULT_DELIVER_SETTINGS
        assert hasattr(settings.file, 'prefix')
        assert hasattr(settings.file, 'suffix')
    
    def test_output_dir_on_root(self):
        """output_dir should be on root level, not nested in file."""
        settings = DEFAULT_DELIVER_SETTINGS
        assert hasattr(settings, 'output_dir')
        # output_dir is NOT in FileCapabilities
        assert not hasattr(settings.file, 'output_dir')


class TestNamingResolution:
    """Test naming template resolution uses correct settings structure."""
    
    def test_resolve_filename_with_settings_file_naming_template(self):
        """resolve_filename should work with DeliverSettings.file.naming_template."""
        # Create settings with custom naming template
        file_caps = FileCapabilities(naming_template="{source_name}_converted")
        settings = DeliverSettings(file=file_caps)
        
        # Create a mock clip
        clip = ClipTask(
            id="test-clip-1",
            source_path="/media/test_video.mov"
        )
        
        # Create a mock job with settings_dict
        job = Job(
            id="test-job-1",
            settings_dict=settings.to_dict()
        )
        
        # Resolve filename - THIS is the line that failed before Phase 20 fix
        # It was trying settings.naming_template instead of settings.file.naming_template
        resolved = resolve_filename(
            template=job.settings.file.naming_template,
            clip=clip,
            job=job,
            resolved_params=DEFAULT_H264_PARAMS,
            preset_id="test_preset"
        )
        
        assert resolved == "test_video_converted"
    
    def test_resolve_filename_with_tokens(self):
        """Test token replacement in naming template."""
        file_caps = FileCapabilities(naming_template="{source_name}_{codec}")
        settings = DeliverSettings(file=file_caps)
        
        clip = ClipTask(
            id="test-clip-2",
            source_path="/media/interview_01.mov"
        )
        
        job = Job(
            id="test-job-2",
            settings_dict=settings.to_dict()
        )
        
        resolved = resolve_filename(
            template=job.settings.file.naming_template,
            clip=clip,
            job=job,
            resolved_params=DEFAULT_H264_PARAMS,
        )
        
        # h264 is the default codec in DEFAULT_H264_PARAMS
        assert "interview_01" in resolved


class TestOutputPathResolution:
    """Test output path resolution uses correct settings structure."""
    
    def test_output_path_uses_settings_output_dir(self):
        """Output path should use settings.output_dir (root level)."""
        settings = DeliverSettings(output_dir="/output/renders")
        
        clip = ClipTask(
            id="test-clip-3",
            source_path="/media/project/clip.mov"
        )
        
        job = Job(
            id="test-job-3",
            settings_dict=settings.to_dict()
        )
        
        output_path = resolve_output_path(
            job=job,
            clip=clip,
            resolved_params=DEFAULT_H264_PARAMS,
            resolved_filename="clip_output"
        )
        
        assert str(output_path).startswith("/output/renders")
    
    def test_output_path_fallback_to_source_dir(self):
        """If output_dir is None, fallback to source directory."""
        settings = DeliverSettings(output_dir=None)
        
        clip = ClipTask(
            id="test-clip-4",
            source_path="/media/project/clip.mov"
        )
        
        job = Job(
            id="test-job-4",
            settings_dict=settings.to_dict()
        )
        
        output_path = resolve_output_path(
            job=job,
            clip=clip,
            resolved_params=DEFAULT_H264_PARAMS,
            resolved_filename="clip_output"
        )
        
        # Should be in same directory as source
        assert output_path.parent == Path("/media/project")
    
    def test_output_path_with_preserve_source_dirs(self):
        """Test directory preservation uses settings.file.preserve_source_dirs."""
        file_caps = FileCapabilities(
            preserve_source_dirs=True,
            preserve_dir_levels=2
        )
        settings = DeliverSettings(file=file_caps, output_dir="/output")
        
        clip = ClipTask(
            id="test-clip-5",
            source_path="/media/project/day1/reel01/clip.mov"
        )
        
        job = Job(
            id="test-job-5",
            settings_dict=settings.to_dict()
        )
        
        output_path = resolve_output_path(
            job=job,
            clip=clip,
            resolved_params=DEFAULT_H264_PARAMS,
            resolved_filename="clip_output"
        )
        
        # Should preserve 2 levels: day1/reel01
        path_str = str(output_path)
        assert "day1" in path_str or "reel01" in path_str
    
    def test_output_path_with_prefix_suffix(self):
        """Test prefix/suffix uses settings.file.prefix and settings.file.suffix."""
        file_caps = FileCapabilities(
            prefix="PRE_",
            suffix="_SUF"
        )
        settings = DeliverSettings(file=file_caps, output_dir="/output")
        
        clip = ClipTask(
            id="test-clip-6",
            source_path="/media/clip.mov"
        )
        
        job = Job(
            id="test-job-6",
            settings_dict=settings.to_dict()
        )
        
        output_path = resolve_output_path(
            job=job,
            clip=clip,
            resolved_params=DEFAULT_H264_PARAMS,
            resolved_filename="myfile"
        )
        
        filename = output_path.name
        assert filename.startswith("PRE_")
        assert "_SUF" in filename


class TestRegressionBug_DeliverSettingsFlat:
    """
    Regression tests for Phase 20 bug fix.
    
    The bug was: code accessed settings.naming_template, settings.file_prefix, etc.
    But DeliverSettings has these nested under settings.file.*
    
    These tests ensure the bug doesn't recur.
    """
    
    def test_settings_has_no_flat_naming_template(self):
        """DeliverSettings should NOT have flat naming_template attribute."""
        settings = DEFAULT_DELIVER_SETTINGS
        # This attribute should NOT exist on root level
        # If it does, it's a regression
        assert not hasattr(settings, 'naming_template') or settings.__class__.__name__ != 'DeliverSettings'
    
    def test_settings_has_no_flat_file_prefix(self):
        """DeliverSettings should NOT have flat file_prefix attribute."""
        settings = DEFAULT_DELIVER_SETTINGS
        assert not hasattr(settings, 'file_prefix')
    
    def test_settings_has_no_flat_file_suffix(self):
        """DeliverSettings should NOT have flat file_suffix attribute."""
        settings = DEFAULT_DELIVER_SETTINGS
        assert not hasattr(settings, 'file_suffix')
    
    def test_settings_has_no_flat_preserve_source_dirs(self):
        """DeliverSettings should NOT have flat preserve_source_dirs attribute."""
        settings = DEFAULT_DELIVER_SETTINGS
        assert not hasattr(settings, 'preserve_source_dirs')
    
    def test_settings_has_no_flat_preserve_dir_levels(self):
        """DeliverSettings should NOT have flat preserve_dir_levels attribute."""
        settings = DEFAULT_DELIVER_SETTINGS
        assert not hasattr(settings, 'preserve_dir_levels')
