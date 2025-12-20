"""
Unit tests for output path resolution.

Tests:
- Path construction
- Directory handling
- Collision avoidance
"""

import pytest
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / "backend"))

from app.deliver.paths import resolve_output_path
from app.deliver.settings import DeliverSettings
from app.deliver.capabilities import FileCapabilities


class TestOutputPathResolution:
    """Test output path resolution."""
    
    def test_basic_output_path(self):
        """Basic output path should combine directory and filename."""
        file_caps = FileCapabilities(
            naming_template="{source_name}_proxy",
            container="mp4",
        )
        settings = DeliverSettings(
            file=file_caps,
            output_dir="/output",
        )
        
        filename, result = resolve_output_path(
            source_path="/input/clip.mov",
            settings=settings,
        )
        assert "/output" in result
        assert "clip_proxy" in filename
        assert result.endswith(".mp4")
    
    def test_container_extension(self):
        """Container should determine output extension."""
        file_caps = FileCapabilities(
            naming_template="{source_name}",
            container="mov",
        )
        settings = DeliverSettings(
            file=file_caps,
            output_dir="/output",
        )
        
        _, result = resolve_output_path(
            source_path="/input/clip.mov",
            settings=settings,
        )
        assert result.endswith(".mov")


class TestPathDeterminism:
    """Test that path resolution is deterministic."""
    
    def test_same_inputs_same_output(self):
        """Same inputs should always produce same output."""
        file_caps = FileCapabilities(
            naming_template="{source_name}_proxy",
            container="mp4",
        )
        settings = DeliverSettings(
            file=file_caps,
            output_dir="/output",
        )
        
        _, result1 = resolve_output_path(
            source_path="/input/test.mov",
            settings=settings,
        )
        _, result2 = resolve_output_path(
            source_path="/input/test.mov",
            settings=settings,
        )
        _, result3 = resolve_output_path(
            source_path="/input/test.mov",
            settings=settings,
        )
        
        assert result1 == result2 == result3
    
    def test_different_sources_different_outputs(self):
        """Different sources should produce different outputs."""
        file_caps = FileCapabilities(
            naming_template="{source_name}",
            container="mp4",
        )
        settings = DeliverSettings(
            file=file_caps,
            output_dir="/output",
        )
        
        _, result1 = resolve_output_path(
            source_path="/input/clip_a.mov",
            settings=settings,
        )
        _, result2 = resolve_output_path(
            source_path="/input/clip_b.mov",
            settings=settings,
        )
        
        assert result1 != result2
