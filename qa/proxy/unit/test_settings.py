"""
Unit tests for DeliverSettings.

Tests:
- Settings immutability rules
- Default values
- Validation
"""

import pytest
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / "backend"))

from app.deliver.settings import DeliverSettings
from app.deliver.capabilities import (
    VideoCapabilities,
    AudioCapabilities,
    FileCapabilities,
    MetadataCapabilities,
)


class TestDeliverSettingsDefaults:
    """Test DeliverSettings default values."""
    
    def test_has_video_capabilities(self):
        """DeliverSettings should have video capabilities."""
        settings = DeliverSettings()
        assert settings.video is not None
        assert isinstance(settings.video, VideoCapabilities)
    
    def test_has_audio_capabilities(self):
        """DeliverSettings should have audio capabilities."""
        settings = DeliverSettings()
        assert settings.audio is not None
        assert isinstance(settings.audio, AudioCapabilities)
    
    def test_has_file_capabilities(self):
        """DeliverSettings should have file capabilities."""
        settings = DeliverSettings()
        assert settings.file is not None
        assert isinstance(settings.file, FileCapabilities)
    
    def test_has_metadata_capabilities(self):
        """DeliverSettings should have metadata capabilities."""
        settings = DeliverSettings()
        assert settings.metadata is not None
        assert isinstance(settings.metadata, MetadataCapabilities)


class TestDeliverSettingsImmutability:
    """Test that settings are immutable (frozen dataclass)."""
    
    def test_settings_are_frozen(self):
        """DeliverSettings should be immutable (frozen dataclass)."""
        settings = DeliverSettings()
        
        with pytest.raises((AttributeError, TypeError)):
            settings.output_dir = "/new/path"
    
    def test_video_caps_are_frozen(self):
        """VideoCapabilities should be immutable."""
        settings = DeliverSettings()
        
        with pytest.raises((AttributeError, TypeError)):
            settings.video.codec = "prores_422"
    
    def test_two_instances_are_independent(self):
        """Two settings instances should be independent objects."""
        settings1 = DeliverSettings()
        settings2 = DeliverSettings()
        
        # They are equal but not the same object
        assert settings1 == settings2
        assert settings1 is not settings2


class TestDeliverSettingsSerialization:
    """Test settings serialization."""
    
    def test_to_dict_returns_dict(self):
        """to_dict should return a dictionary."""
        settings = DeliverSettings()
        data = settings.to_dict()
        
        assert isinstance(data, dict)
        assert "video" in data
        assert "audio" in data
        assert "file" in data
    
    def test_from_dict_creates_settings(self):
        """from_dict should create DeliverSettings from dict."""
        settings = DeliverSettings()
        data = settings.to_dict()
        
        restored = DeliverSettings.from_dict(data)
        assert isinstance(restored, DeliverSettings)
