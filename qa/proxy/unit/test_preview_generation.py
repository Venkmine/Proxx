"""
Unit tests for preview video generation.

Tests the preview module which generates lightweight H.264 proxies
for UI playback from source files (including RAW formats).

Tests:
- Cache key generation based on path + mtime
- Preview status checking
- Preview video generation (mocked FFmpeg)
"""

import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock
import sys
import tempfile
import os

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / "backend"))

from app.execution.preview import (
    get_cache_key,
    get_cached_preview_path,
    CACHE_DIR,
)


class TestPreviewCacheKey:
    """Test cache key generation."""
    
    def test_cache_key_includes_path(self, tmp_path):
        """Cache key should be based on source path."""
        # Create two different files
        file1 = tmp_path / "video1.mp4"
        file2 = tmp_path / "video2.mp4"
        file1.touch()
        file2.touch()
        
        key1 = get_cache_key(str(file1))
        key2 = get_cache_key(str(file2))
        
        # Different paths should produce different keys
        assert key1 != key2
    
    def test_cache_key_reproducible(self, tmp_path):
        """Same inputs should produce same cache key."""
        file1 = tmp_path / "video.mp4"
        file1.touch()
        
        key1 = get_cache_key(str(file1))
        key2 = get_cache_key(str(file1))
        
        assert key1 == key2
    
    def test_cache_key_for_nonexistent_file(self):
        """Cache key should work for nonexistent files (fallback)."""
        key = get_cache_key("/nonexistent/path/video.mp4")
        assert key is not None
        assert len(key) == 16  # MD5 hash truncated


class TestPreviewCaching:
    """Test preview caching behavior."""
    
    def test_get_cached_preview_returns_none_for_new_source(self, tmp_path):
        """get_cached_preview_path should return None when no cache exists."""
        source = tmp_path / "video.mp4"
        source.touch()
        
        result = get_cached_preview_path(str(source))
        assert result is None
    
    def test_get_cached_preview_returns_path_when_cached(self, tmp_path):
        """get_cached_preview_path should return path when preview is cached."""
        source = tmp_path / "video.mp4"
        source.touch()
        
        # Create a cached preview file
        cache_key = get_cache_key(str(source))
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cached_file = CACHE_DIR / f"{cache_key}.mp4"
        cached_file.touch()
        
        try:
            result = get_cached_preview_path(str(source))
            assert result is not None
            assert result.exists()
        finally:
            # Cleanup
            if cached_file.exists():
                cached_file.unlink()
    
    def test_cache_invalidated_on_source_change(self, tmp_path):
        """Cache should be invalidated when source file changes."""
        source = tmp_path / "video.mp4"
        source.touch()
        
        # Get initial cache key
        key1 = get_cache_key(str(source))
        
        # Create cached preview with old key
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cached_file = CACHE_DIR / f"{key1}.mp4"
        cached_file.touch()
        
        # Modify the source file (change mtime)
        import time
        time.sleep(0.1)
        source.write_text("modified content")
        
        # New cache key should be different
        key2 = get_cache_key(str(source))
        
        try:
            assert key1 != key2
        finally:
            # Cleanup
            if cached_file.exists():
                cached_file.unlink()
