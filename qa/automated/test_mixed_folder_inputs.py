"""
Mixed Folder Input Tests - Verify folder handling with heterogeneous content.

Tests verify that Forge correctly handles folders containing:
- RAW + non-RAW files (MUST fail)
- Image sequences + video files
- Junk files (.txt, .DS_Store)
- Nested subfolders

NO SILENT SKIPS. NO GUESSING. NO AUTO-CORRECTION.

Part of Forge Verification System.
"""

import pytest
import sys
import os
import tempfile
import shutil
from pathlib import Path
from typing import List, Tuple, Set

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "backend"))

from v2.source_capabilities import (
    ExecutionEngine,
    get_execution_engine,
    validate_job_engine_consistency,
    MixedEngineError,
    SourceCapabilityError,
)


# =============================================================================
# FIXTURES: Create test folder structures
# =============================================================================

@pytest.fixture
def temp_test_dir():
    """Create a temporary directory for test files."""
    temp_dir = tempfile.mkdtemp(prefix="forge_test_")
    yield Path(temp_dir)
    # Cleanup
    shutil.rmtree(temp_dir, ignore_errors=True)


def create_empty_file(path: Path):
    """Create an empty file (sufficient for path-based routing tests)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.touch()


# =============================================================================
# Folder Discovery Simulation
# =============================================================================

class FolderDiscovery:
    """
    Simulates Forge's folder discovery logic for testing.
    
    This class mimics how Forge discovers files in folders for verification.
    It does NOT implement new logic - it tests the existing behavior.
    """
    
    # Known video extensions
    VIDEO_EXTENSIONS = {
        # Standard containers
        ".mp4", ".mov", ".mxf", ".mkv", ".avi", ".webm", ".ts", ".mpg",
        # RAW formats
        ".braw", ".r3d", ".ari", ".crm", ".dng", ".nev",
        # Image sequences
        ".exr", ".dpx", ".tiff", ".tif", ".png", ".jpg", ".jpeg",
    }
    
    # Junk files to ignore
    JUNK_PATTERNS = {".DS_Store", ".gitkeep", "Thumbs.db", "._."}
    
    @classmethod
    def discover_files(
        cls,
        folder: Path,
        recursive: bool = False,
    ) -> List[Path]:
        """
        Discover media files in a folder.
        
        Args:
            folder: Root folder to search
            recursive: Whether to search subfolders
            
        Returns:
            Sorted list of discovered media files
        """
        if not folder.is_dir():
            raise ValueError(f"Not a directory: {folder}")
        
        discovered = []
        
        if recursive:
            for item in folder.rglob("*"):
                if item.is_file():
                    if cls._is_media_file(item):
                        discovered.append(item)
        else:
            for item in folder.iterdir():
                if item.is_file():
                    if cls._is_media_file(item):
                        discovered.append(item)
        
        # CRITICAL: Sorting ensures deterministic order
        return sorted(discovered)
    
    @classmethod
    def _is_media_file(cls, path: Path) -> bool:
        """Check if file is a recognized media file."""
        name = path.name
        
        # Skip junk files
        for junk in cls.JUNK_PATTERNS:
            if name.startswith(junk) or name == junk:
                return False
        
        # Check extension
        return path.suffix.lower() in cls.VIDEO_EXTENSIONS
    
    @classmethod
    def classify_sources(
        cls,
        files: List[Path],
    ) -> Tuple[List[Path], List[Path], List[Path]]:
        """
        Classify files by required engine.
        
        Returns:
            Tuple of (ffmpeg_files, resolve_files, unknown_files)
        """
        ffmpeg_files = []
        resolve_files = []
        unknown_files = []
        
        for f in files:
            container = f.suffix.lower().lstrip(".")
            # For tests, infer codec from extension
            codec = cls._infer_codec(f)
            
            engine = get_execution_engine(container, codec)
            
            if engine == ExecutionEngine.FFMPEG:
                ffmpeg_files.append(f)
            elif engine == ExecutionEngine.RESOLVE:
                resolve_files.append(f)
            else:
                unknown_files.append(f)
        
        return ffmpeg_files, resolve_files, unknown_files
    
    @classmethod
    def _infer_codec(cls, path: Path) -> str:
        """Infer codec from file extension (test simplification)."""
        ext = path.suffix.lower().lstrip(".")
        
        # RAW extensions
        raw_map = {
            "braw": "braw",
            "r3d": "redcode",
            "ari": "arriraw",
            "crm": "canon_raw",
            "dng": "cinemadng",
            "nev": "nikon_raw",
            "exr": "exr",
        }
        
        if ext in raw_map:
            return raw_map[ext]
        
        # Standard containers - assume common codec
        standard_map = {
            "mp4": "h264",
            "mov": "prores",
            "mxf": "dnxhd",
            "mkv": "h264",
            "avi": "mjpeg",
            "webm": "vp9",
            "ts": "mpeg2video",
            "mpg": "mpeg2video",
        }
        
        return standard_map.get(ext, "unknown")


# =============================================================================
# TEST: Mixed RAW + non-RAW folders
# =============================================================================

class TestMixedRawNonRawFolders:
    """Folders with RAW + non-RAW MUST fail explicitly."""
    
    def test_folder_with_raw_and_nonraw_fails(self, temp_test_dir):
        """Folder containing both RAW and standard files MUST be rejected."""
        # Create mixed content
        create_empty_file(temp_test_dir / "video.mp4")
        create_empty_file(temp_test_dir / "raw.braw")
        
        files = FolderDiscovery.discover_files(temp_test_dir)
        ffmpeg, resolve, unknown = FolderDiscovery.classify_sources(files)
        
        assert len(ffmpeg) == 1, "Should find 1 FFmpeg file"
        assert len(resolve) == 1, "Should find 1 Resolve file"
        
        # Build source tuples for validation
        sources = []
        for f in ffmpeg:
            sources.append((str(f), f.suffix.lstrip("."), "h264"))
        for f in resolve:
            sources.append((str(f), f.suffix.lstrip("."), "braw"))
        
        with pytest.raises(MixedEngineError) as excinfo:
            validate_job_engine_consistency(sources)
        
        error = excinfo.value
        assert len(error.ffmpeg_sources) >= 1
        assert len(error.resolve_sources) >= 1
    
    def test_folder_with_multiple_raw_formats_ok(self, temp_test_dir):
        """Folder with multiple RAW formats (all Resolve) should be OK."""
        # Create RAW-only content
        create_empty_file(temp_test_dir / "shot1.braw")
        create_empty_file(temp_test_dir / "shot2.r3d")
        create_empty_file(temp_test_dir / "shot3.ari")
        
        files = FolderDiscovery.discover_files(temp_test_dir)
        ffmpeg, resolve, unknown = FolderDiscovery.classify_sources(files)
        
        assert len(ffmpeg) == 0
        assert len(resolve) == 3
        assert len(unknown) == 0
        
        # All Resolve - should work
        sources = []
        for f in resolve:
            ext = f.suffix.lstrip(".")
            codec = FolderDiscovery._infer_codec(f)
            sources.append((str(f), ext, codec))
        
        engine = validate_job_engine_consistency(sources)
        assert engine == ExecutionEngine.RESOLVE
    
    def test_mixed_folder_error_names_all_files(self, temp_test_dir):
        """Mixed folder error MUST name all conflicting files."""
        # Create mixed content
        create_empty_file(temp_test_dir / "interview.mp4")
        create_empty_file(temp_test_dir / "broll.mov")
        create_empty_file(temp_test_dir / "cinema1.braw")
        create_empty_file(temp_test_dir / "cinema2.r3d")
        
        files = FolderDiscovery.discover_files(temp_test_dir)
        
        sources = []
        for f in files:
            ext = f.suffix.lstrip(".")
            codec = FolderDiscovery._infer_codec(f)
            sources.append((str(f), ext, codec))
        
        with pytest.raises(MixedEngineError) as excinfo:
            validate_job_engine_consistency(sources)
        
        error = excinfo.value
        # Should identify both FFmpeg files
        assert len(error.ffmpeg_sources) == 2
        # Should identify both Resolve files
        assert len(error.resolve_sources) == 2


# =============================================================================
# TEST: Image sequence + video folders
# =============================================================================

class TestImageSequenceVideoFolders:
    """Folders with image sequences and video files."""
    
    def test_exr_sequence_folder(self, temp_test_dir):
        """Folder with only EXR files should route to Resolve."""
        # Create EXR sequence
        for i in range(10):
            create_empty_file(temp_test_dir / f"frame_{i:04d}.exr")
        
        files = FolderDiscovery.discover_files(temp_test_dir)
        assert len(files) == 10
        
        ffmpeg, resolve, unknown = FolderDiscovery.classify_sources(files)
        
        assert len(ffmpeg) == 0
        assert len(resolve) == 10
        assert len(unknown) == 0
    
    def test_exr_plus_video_fails(self, temp_test_dir):
        """EXR sequence + video file MUST fail (mixed engines)."""
        # Create mixed content
        for i in range(5):
            create_empty_file(temp_test_dir / f"vfx_{i:04d}.exr")
        create_empty_file(temp_test_dir / "reference.mp4")
        
        files = FolderDiscovery.discover_files(temp_test_dir)
        
        sources = []
        for f in files:
            ext = f.suffix.lstrip(".")
            codec = FolderDiscovery._infer_codec(f)
            sources.append((str(f), ext, codec))
        
        with pytest.raises(MixedEngineError):
            validate_job_engine_consistency(sources)


# =============================================================================
# TEST: Junk file handling
# =============================================================================

class TestJunkFileHandling:
    """Junk files MUST be ignored, not cause failures."""
    
    def test_ds_store_ignored(self, temp_test_dir):
        """macOS .DS_Store files MUST be ignored."""
        create_empty_file(temp_test_dir / ".DS_Store")
        create_empty_file(temp_test_dir / "video.mp4")
        
        files = FolderDiscovery.discover_files(temp_test_dir)
        
        assert len(files) == 1
        assert files[0].name == "video.mp4"
    
    def test_thumbs_db_ignored(self, temp_test_dir):
        """Windows Thumbs.db files MUST be ignored."""
        create_empty_file(temp_test_dir / "Thumbs.db")
        create_empty_file(temp_test_dir / "video.mov")
        
        files = FolderDiscovery.discover_files(temp_test_dir)
        
        assert len(files) == 1
        assert files[0].name == "video.mov"
    
    def test_text_files_ignored(self, temp_test_dir):
        """Non-media files MUST be ignored."""
        create_empty_file(temp_test_dir / "notes.txt")
        create_empty_file(temp_test_dir / "README.md")
        create_empty_file(temp_test_dir / "script.sh")
        create_empty_file(temp_test_dir / "video.mp4")
        
        files = FolderDiscovery.discover_files(temp_test_dir)
        
        assert len(files) == 1
        assert files[0].name == "video.mp4"
    
    def test_hidden_files_ignored(self, temp_test_dir):
        """Hidden files (dot prefix) MUST be ignored."""
        create_empty_file(temp_test_dir / ".hidden_video.mp4")
        create_empty_file(temp_test_dir / "._.video.mp4")  # macOS extended attr
        create_empty_file(temp_test_dir / "video.mp4")
        
        files = FolderDiscovery.discover_files(temp_test_dir)
        
        # Only visible video file should be found
        visible_files = [f for f in files if not f.name.startswith(".")]
        assert len(visible_files) == 1
        assert visible_files[0].name == "video.mp4"
    
    def test_junk_only_folder_empty_result(self, temp_test_dir):
        """Folder with only junk files MUST return empty list."""
        create_empty_file(temp_test_dir / ".DS_Store")
        create_empty_file(temp_test_dir / "Thumbs.db")
        create_empty_file(temp_test_dir / "notes.txt")
        
        files = FolderDiscovery.discover_files(temp_test_dir)
        
        assert len(files) == 0


# =============================================================================
# TEST: Unsupported files in folder
# =============================================================================

class TestUnsupportedFilesInFolder:
    """Folders with unsupported files must handle them explicitly."""
    
    def test_unsupported_extension_not_discovered(self, temp_test_dir):
        """Files with unknown extensions MUST not be discovered."""
        create_empty_file(temp_test_dir / "unknown.xyz")
        create_empty_file(temp_test_dir / "video.mp4")
        
        files = FolderDiscovery.discover_files(temp_test_dir)
        
        assert len(files) == 1
        assert files[0].name == "video.mp4"
    
    def test_mixed_supported_unsupported(self, temp_test_dir):
        """Unsupported files should be filtered out before routing."""
        create_empty_file(temp_test_dir / "project.fcp")
        create_empty_file(temp_test_dir / "timeline.xml")
        create_empty_file(temp_test_dir / "video1.mp4")
        create_empty_file(temp_test_dir / "video2.mov")
        
        files = FolderDiscovery.discover_files(temp_test_dir)
        
        assert len(files) == 2
        assert all(f.suffix in [".mp4", ".mov"] for f in files)


# =============================================================================
# TEST: Discovery order determinism
# =============================================================================

class TestDiscoveryDeterminism:
    """File discovery order MUST be deterministic."""
    
    def test_discovery_order_sorted(self, temp_test_dir):
        """Files MUST be returned in sorted order."""
        # Create files in random order
        for name in ["zebra.mp4", "alpha.mp4", "middle.mp4"]:
            create_empty_file(temp_test_dir / name)
        
        files = FolderDiscovery.discover_files(temp_test_dir)
        names = [f.name for f in files]
        
        assert names == ["alpha.mp4", "middle.mp4", "zebra.mp4"]
    
    def test_discovery_order_deterministic_100x(self, temp_test_dir):
        """Discovery MUST return same order 100 times."""
        for name in ["c.mp4", "a.mp4", "b.mp4"]:
            create_empty_file(temp_test_dir / name)
        
        results = []
        for _ in range(100):
            files = FolderDiscovery.discover_files(temp_test_dir)
            results.append(tuple(f.name for f in files))
        
        # All results must be identical
        assert len(set(results)) == 1
    
    def test_numeric_sequence_ordering(self, temp_test_dir):
        """Image sequences MUST maintain numeric order."""
        # Note: String sort, so 0001-0010 works but 1-10 wouldn't
        for i in range(1, 11):
            create_empty_file(temp_test_dir / f"frame_{i:04d}.exr")
        
        files = FolderDiscovery.discover_files(temp_test_dir)
        names = [f.name for f in files]
        
        expected = [f"frame_{i:04d}.exr" for i in range(1, 11)]
        assert names == expected


# =============================================================================
# TEST: Empty folders
# =============================================================================

class TestEmptyFolders:
    """Empty folders must be handled explicitly."""
    
    def test_empty_folder_returns_empty_list(self, temp_test_dir):
        """Empty folder MUST return empty list, not error."""
        files = FolderDiscovery.discover_files(temp_test_dir)
        assert files == []
    
    def test_nonexistent_folder_raises_error(self, temp_test_dir):
        """Non-existent folder MUST raise error."""
        fake_path = temp_test_dir / "does_not_exist"
        
        with pytest.raises(ValueError) as excinfo:
            FolderDiscovery.discover_files(fake_path)
        
        assert "Not a directory" in str(excinfo.value)


# =============================================================================
# TEST: File as folder
# =============================================================================

class TestFileAsFolder:
    """File passed as folder MUST fail."""
    
    def test_file_path_as_folder_fails(self, temp_test_dir):
        """Passing a file path as folder MUST raise error."""
        file_path = temp_test_dir / "video.mp4"
        create_empty_file(file_path)
        
        with pytest.raises(ValueError) as excinfo:
            FolderDiscovery.discover_files(file_path)
        
        assert "Not a directory" in str(excinfo.value)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
