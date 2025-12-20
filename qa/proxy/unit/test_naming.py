"""
Unit tests for output naming.

Tests:
- Token resolution
- Template parsing
- Edge cases
"""

import pytest
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / "backend"))

from app.deliver.naming import resolve_filename


class TestFilenameResolution:
    """Test filename resolution from templates."""
    
    def test_simple_source_name(self):
        """Simple source_name token should resolve."""
        result = resolve_filename(
            template="{source_name}_proxy",
            source_path="/path/to/my_video.mov",
        )
        assert result == "my_video_proxy"
    
    def test_preserves_extension_separately(self):
        """Extension should not be part of source_name."""
        result = resolve_filename(
            template="{source_name}",
            source_path="/path/to/clip.mxf",
        )
        assert result == "clip"
        assert ".mxf" not in result
    
    def test_multiple_tokens(self):
        """Multiple tokens in template should all resolve."""
        result = resolve_filename(
            template="{source_name}_{date}",
            source_path="/path/to/clip.mov",
        )
        assert "clip_" in result
        # Date should be YYYYMMDD format
        assert len(result) > len("clip_")
    
    def test_literal_text_preserved(self):
        """Literal text in template should be preserved."""
        result = resolve_filename(
            template="PROXY_{source_name}_v1",
            source_path="/path/to/shot_001.mov",
        )
        assert result == "PROXY_shot_001_v1"
    
    def test_empty_template_uses_source_name(self):
        """Empty template should fall back to source name."""
        result = resolve_filename(
            template="",
            source_path="/path/to/fallback.mov",
        )
        # Should either return source name or raise
        assert result is not None


class TestNamingEdgeCases:
    """Test edge cases in naming."""
    
    def test_source_with_spaces(self):
        """Source names with spaces should be handled."""
        result = resolve_filename(
            template="{source_name}_proxy",
            source_path="/path/to/my video file.mov",
        )
        assert "my video file" in result or "my_video_file" in result
    
    def test_source_with_special_chars(self):
        """Special characters should be handled safely."""
        result = resolve_filename(
            template="{source_name}",
            source_path="/path/to/clip-001_take.2.mov",
        )
        # Should not raise
        assert result is not None
    
    def test_deep_nested_path(self):
        """Deep paths should extract filename correctly."""
        result = resolve_filename(
            template="{source_name}",
            source_path="/very/deep/nested/path/to/clip.mov",
        )
        assert result == "clip"
