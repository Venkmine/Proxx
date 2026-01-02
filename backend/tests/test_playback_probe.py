"""
Test Playback Probe — Unit Tests

============================================================================
TESTS
============================================================================
1. Probe returns PLAYABLE for standard mp4/mov files
2. Probe returns PLAYABLE for ProRes files
3. Probe returns METADATA_ONLY for RAW MXF files
4. Probe returns NO_VIDEO for audio-only files
5. Probe returns ERROR for non-existent files
6. Cache works correctly
7. Probe respects timeout
============================================================================
"""

import os
import pytest
import tempfile
import subprocess
from pathlib import Path
from unittest.mock import patch, MagicMock

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from playback_probe import (
    probe_playback_capability,
    PlaybackCapability,
    clear_probe_cache,
    get_probe_cache_stats,
    can_playback,
    get_playback_message,
    PROBE_TIMEOUT_SECONDS,
)


class TestProbePlaybackCapability:
    """Test the core probe function."""
    
    def setup_method(self):
        """Clear cache before each test."""
        clear_probe_cache()
    
    def test_nonexistent_file_returns_error(self):
        """Probe should return ERROR for non-existent file."""
        result = probe_playback_capability('/nonexistent/path/to/file.mp4')
        
        assert result.capability == PlaybackCapability.ERROR
        assert result.engine == 'ffmpeg'
        assert 'not found' in result.message.lower()
    
    def test_ffmpeg_not_found_returns_error(self):
        """Probe should return ERROR if ffmpeg is not installed."""
        with patch('subprocess.run', side_effect=FileNotFoundError()):
            with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as f:
                temp_path = f.name
            
            try:
                result = probe_playback_capability(temp_path)
                assert result.capability == PlaybackCapability.ERROR
                assert 'FFmpeg not found' in result.message
            finally:
                os.unlink(temp_path)
    
    def test_timeout_returns_error(self):
        """Probe should return ERROR on timeout."""
        with patch('subprocess.run', side_effect=subprocess.TimeoutExpired('ffmpeg', PROBE_TIMEOUT_SECONDS)):
            with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as f:
                temp_path = f.name
            
            try:
                result = probe_playback_capability(temp_path)
                assert result.capability == PlaybackCapability.ERROR
                assert 'timed out' in result.message.lower()
            finally:
                os.unlink(temp_path)
    
    def test_ffmpeg_success_returns_playable(self):
        """Probe should return PLAYABLE when ffmpeg exits with 0."""
        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stderr = ''
        
        with patch('subprocess.run', return_value=mock_result):
            with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as f:
                temp_path = f.name
            
            try:
                result = probe_playback_capability(temp_path)
                assert result.capability == PlaybackCapability.PLAYABLE
            finally:
                os.unlink(temp_path)
    
    def test_no_video_stream_returns_no_video(self):
        """Probe should return NO_VIDEO when no video stream exists."""
        mock_result = MagicMock()
        mock_result.returncode = 1
        mock_result.stderr = "Stream map '0:v:0' matches no streams"
        
        with patch('subprocess.run', return_value=mock_result):
            with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as f:
                temp_path = f.name
            
            try:
                result = probe_playback_capability(temp_path)
                assert result.capability == PlaybackCapability.NO_VIDEO
            finally:
                os.unlink(temp_path)
    
    def test_decode_error_returns_metadata_only(self):
        """Probe should return METADATA_ONLY when video stream exists but can't decode."""
        mock_result = MagicMock()
        mock_result.returncode = 1
        mock_result.stderr = "Error while decoding stream #0:0: Invalid data found"
        
        with patch('subprocess.run', return_value=mock_result):
            with tempfile.NamedTemporaryFile(suffix='.mxf', delete=False) as f:
                temp_path = f.name
            
            try:
                result = probe_playback_capability(temp_path)
                assert result.capability == PlaybackCapability.METADATA_ONLY
            finally:
                os.unlink(temp_path)


class TestProbeCache:
    """Test caching behavior."""
    
    def setup_method(self):
        """Clear cache before each test."""
        clear_probe_cache()
    
    def test_cache_starts_empty(self):
        """Cache should start empty."""
        stats = get_probe_cache_stats()
        assert stats['entries'] == 0
    
    def test_probe_result_is_cached(self):
        """Second probe should use cached result."""
        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stderr = ''
        
        with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as f:
            temp_path = f.name
        
        try:
            with patch('subprocess.run', return_value=mock_result) as mock_run:
                # First probe
                result1 = probe_playback_capability(temp_path)
                assert result1.capability == PlaybackCapability.PLAYABLE
                assert mock_run.call_count == 1
                
                # Second probe (should use cache)
                result2 = probe_playback_capability(temp_path)
                assert result2.capability == PlaybackCapability.PLAYABLE
                # Mock should NOT be called again
                assert mock_run.call_count == 1
                
            stats = get_probe_cache_stats()
            assert stats['entries'] == 1
        finally:
            os.unlink(temp_path)
    
    def test_clear_cache(self):
        """clear_probe_cache should empty the cache."""
        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stderr = ''
        
        with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as f:
            temp_path = f.name
        
        try:
            with patch('subprocess.run', return_value=mock_result):
                probe_playback_capability(temp_path)
                
            stats = get_probe_cache_stats()
            assert stats['entries'] == 1
            
            cleared = clear_probe_cache()
            assert cleared == 1
            
            stats = get_probe_cache_stats()
            assert stats['entries'] == 0
        finally:
            os.unlink(temp_path)


class TestConvenienceFunctions:
    """Test convenience functions."""
    
    def test_can_playback_returns_true_for_playable(self):
        """can_playback should return True for PLAYABLE files."""
        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stderr = ''
        
        with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as f:
            temp_path = f.name
        
        try:
            with patch('subprocess.run', return_value=mock_result):
                assert can_playback(temp_path) is True
        finally:
            os.unlink(temp_path)
    
    def test_can_playback_returns_false_for_metadata_only(self):
        """can_playback should return False for METADATA_ONLY files."""
        mock_result = MagicMock()
        mock_result.returncode = 1
        mock_result.stderr = "Error while decoding"
        
        with tempfile.NamedTemporaryFile(suffix='.mxf', delete=False) as f:
            temp_path = f.name
        
        try:
            clear_probe_cache()
            with patch('subprocess.run', return_value=mock_result):
                assert can_playback(temp_path) is False
        finally:
            os.unlink(temp_path)
    
    def test_get_playback_message(self):
        """get_playback_message should return appropriate messages."""
        assert get_playback_message(PlaybackCapability.PLAYABLE) == 'Playback available'
        assert 'Resolve' in get_playback_message(PlaybackCapability.METADATA_ONLY)
        assert get_playback_message(PlaybackCapability.NO_VIDEO) == 'No video stream'
        assert get_playback_message(PlaybackCapability.ERROR) == 'Unable to probe file'


class TestRealFFmpeg:
    """Integration tests with real FFmpeg (requires ffmpeg to be installed)."""
    
    @pytest.fixture
    def has_ffmpeg(self):
        """Check if ffmpeg is installed."""
        try:
            result = subprocess.run(['ffmpeg', '-version'], capture_output=True)
            return result.returncode == 0
        except FileNotFoundError:
            return False
    
    @pytest.mark.skipif(
        not subprocess.run(['which', 'ffmpeg'], capture_output=True).returncode == 0,
        reason="FFmpeg not installed"
    )
    def test_real_probe_with_generated_video(self):
        """Test probe with a real video file generated by ffmpeg."""
        clear_probe_cache()
        
        with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as f:
            temp_path = f.name
        
        try:
            # Generate a simple 1-second test video
            cmd = [
                'ffmpeg', '-y',
                '-f', 'lavfi', '-i', 'testsrc=duration=1:size=320x240:rate=25',
                '-c:v', 'libx264', '-preset', 'ultrafast',
                '-pix_fmt', 'yuv420p',
                temp_path
            ]
            subprocess.run(cmd, capture_output=True, check=True)
            
            result = probe_playback_capability(temp_path)
            
            assert result.capability == PlaybackCapability.PLAYABLE
            assert result.engine == 'ffmpeg'
            assert result.probe_ms > 0
            
        finally:
            if os.path.exists(temp_path):
                os.unlink(temp_path)
    
    @pytest.mark.skipif(
        not subprocess.run(['which', 'ffmpeg'], capture_output=True).returncode == 0,
        reason="FFmpeg not installed"
    )
    def test_real_probe_with_audio_only(self):
        """Test probe with an audio-only file."""
        clear_probe_cache()
        
        with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as f:
            temp_path = f.name
        
        try:
            # Generate a simple 1-second test audio
            cmd = [
                'ffmpeg', '-y',
                '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
                '-c:a', 'libmp3lame',
                temp_path
            ]
            subprocess.run(cmd, capture_output=True, check=True)
            
            result = probe_playback_capability(temp_path)
            
            assert result.capability == PlaybackCapability.NO_VIDEO
            assert result.engine == 'ffmpeg'
            
        finally:
            if os.path.exists(temp_path):
                os.unlink(temp_path)
