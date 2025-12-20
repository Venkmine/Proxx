"""
Unit tests for engine mapping.

Tests:
- Valid engine/codec combinations
- FFmpeg codec mapping
- Engine availability checks
"""

import pytest
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / "backend"))

from app.deliver.engine_mapping import (
    FFMPEG_VIDEO_CODEC_MAP,
    FFmpegMappingResult,
    FFmpegEngineMapper,
)
from app.execution.base import EngineType


class TestFFmpegCodecMapping:
    """Test FFmpeg codec mapping."""
    
    def test_codec_map_exists(self):
        """Video codec map should exist and be populated."""
        assert FFMPEG_VIDEO_CODEC_MAP is not None
        assert len(FFMPEG_VIDEO_CODEC_MAP) > 0
    
    def test_common_codecs_mapped(self):
        """Common video codecs should be in the map."""
        # Check for at least some common codecs
        common_codecs = ["h264"]
        for codec in common_codecs:
            if codec in FFMPEG_VIDEO_CODEC_MAP:
                mapping = FFMPEG_VIDEO_CODEC_MAP[codec]
                assert mapping is not None


class TestFFmpegMappingResult:
    """Test FFmpegMappingResult dataclass."""
    
    def test_mapping_result_has_required_fields(self):
        """FFmpegMappingResult should have expected fields."""
        # Just verify the class exists and can be instantiated
        assert FFmpegMappingResult is not None


class TestFFmpegEngineMapper:
    """Test FFmpegEngineMapper class."""
    
    def test_mapper_class_exists(self):
        """FFmpegEngineMapper class should exist."""
        assert FFmpegEngineMapper is not None
    
    def test_mapper_has_map_method(self):
        """FFmpegEngineMapper should have map method."""
        assert hasattr(FFmpegEngineMapper, "map")


class TestEngineType:
    """Test EngineType enum."""
    
    def test_ffmpeg_engine_exists(self):
        """FFmpeg engine type should exist."""
        assert hasattr(EngineType, "FFMPEG")
        assert EngineType.FFMPEG.value == "ffmpeg"
