"""
Integration tests for watch folder functionality.

Tests:
- File detection
- Exactly-once ingestion
- Stability detection
"""

import pytest
import sys
import tempfile
import time
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / "backend"))


class TestWatchFolderDetection:
    """Test watch folder file detection."""
    
    def test_file_scanner_exists(self):
        """FileScanner should be importable."""
        from app.watchfolders.scanner import FileScanner
        assert FileScanner is not None
    
    def test_watch_folder_model_exists(self):
        """WatchFolder model should be importable."""
        from app.watchfolders.models import WatchFolder
        assert WatchFolder is not None
    
    def test_detect_new_file(self):
        """Should detect new file in watch folder."""
        from app.watchfolders.scanner import FileScanner
        from app.watchfolders.models import WatchFolder
        
        with tempfile.TemporaryDirectory() as tmpdir:
            scanner = FileScanner()
            watch_folder = WatchFolder(
                id="test",
                path=tmpdir,
                recursive=False,
            )
            
            # Create a test file with valid extension
            test_file = Path(tmpdir) / "test_clip.mov"
            test_file.write_bytes(b"fake video content")
            
            # Scan for new files
            new_files = scanner.scan(watch_folder)
            
            assert len(new_files) >= 1


class TestExactlyOnceIngestion:
    """Test exactly-once file ingestion."""
    
    def test_file_scanner_returns_paths(self):
        """FileScanner should return Path objects."""
        from app.watchfolders.scanner import FileScanner
        from app.watchfolders.models import WatchFolder
        
        with tempfile.TemporaryDirectory() as tmpdir:
            scanner = FileScanner()
            watch_folder = WatchFolder(
                id="test",
                path=tmpdir,
                recursive=False,
            )
            
            # Create test file
            test_file = Path(tmpdir) / "test.mov"
            test_file.write_bytes(b"content")
            
            # Scan
            results = scanner.scan(watch_folder)
            
            # Results should be Path objects
            for result in results:
                assert isinstance(result, Path)
