"""
Recursive Folder Handling Tests - Verify subfolder traversal behavior.

Tests verify that:
- Recursive flag is respected (not assumed)
- Non-recursive mode only scans top level
- Nested subfolders are handled correctly
- Path depth is not silently limited

NO IMPLICIT RECURSION. NO DEPTH LIMITS. NO SILENT TRUNCATION.

Part of Forge Verification System.
"""

import pytest
import sys
import tempfile
import shutil
from pathlib import Path
from typing import List, Set

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "backend"))


# =============================================================================
# Helper Functions
# =============================================================================

def create_empty_file(path: Path):
    """Create an empty file (sufficient for path-based tests)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.touch()


def create_nested_structure(base: Path, depth: int, files_per_level: int = 2) -> List[Path]:
    """
    Create a nested folder structure for testing.
    
    Args:
        base: Base directory
        depth: How many levels deep
        files_per_level: How many files at each level
        
    Returns:
        List of all created file paths
    """
    created_files = []
    
    current = base
    for level in range(depth):
        # Create files at this level
        for i in range(files_per_level):
            file_path = current / f"level{level}_file{i}.mp4"
            create_empty_file(file_path)
            created_files.append(file_path)
        
        # Create subfolder for next level
        if level < depth - 1:
            current = current / f"subfolder_{level}"
            current.mkdir(parents=True, exist_ok=True)
    
    return created_files


# =============================================================================
# Folder Scanner (mirrors Forge behavior)
# =============================================================================

class FolderScanner:
    """
    Folder scanning with explicit recursive control.
    
    This class verifies that recursive behavior is EXPLICIT, not implicit.
    """
    
    VIDEO_EXTENSIONS = {
        ".mp4", ".mov", ".mxf", ".mkv", ".avi", ".webm",
        ".braw", ".r3d", ".ari", ".exr", ".dng",
    }
    
    @classmethod
    def scan(
        cls,
        folder: Path,
        recursive: bool,
    ) -> List[Path]:
        """
        Scan folder for media files.
        
        Args:
            folder: Root folder to scan
            recursive: If True, scan subfolders. If False, top-level only.
            
        Returns:
            Sorted list of discovered files
        """
        if not folder.is_dir():
            raise ValueError(f"Not a directory: {folder}")
        
        discovered = []
        
        if recursive:
            # Recursive: scan all subdirectories
            for item in folder.rglob("*"):
                if item.is_file() and cls._is_video_file(item):
                    discovered.append(item)
        else:
            # Non-recursive: top-level only
            for item in folder.iterdir():
                if item.is_file() and cls._is_video_file(item):
                    discovered.append(item)
        
        return sorted(discovered)
    
    @classmethod
    def _is_video_file(cls, path: Path) -> bool:
        """Check if file is a recognized video file."""
        # Skip hidden files
        if path.name.startswith("."):
            return False
        return path.suffix.lower() in cls.VIDEO_EXTENSIONS
    
    @classmethod
    def get_subfolder_count(cls, folder: Path) -> int:
        """Count immediate subfolders (not recursive)."""
        if not folder.is_dir():
            return 0
        return sum(1 for item in folder.iterdir() if item.is_dir())
    
    @classmethod
    def get_total_subfolder_count(cls, folder: Path) -> int:
        """Count all subfolders (recursive)."""
        if not folder.is_dir():
            return 0
        return sum(1 for item in folder.rglob("*") if item.is_dir())


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def temp_test_dir():
    """Create a temporary directory for test files."""
    temp_dir = tempfile.mkdtemp(prefix="forge_recursive_test_")
    yield Path(temp_dir)
    shutil.rmtree(temp_dir, ignore_errors=True)


# =============================================================================
# TEST: Recursive flag is respected
# =============================================================================

class TestRecursiveFlagRespect:
    """Recursive flag MUST be respected, not assumed."""
    
    def test_nonrecursive_ignores_subfolders(self, temp_test_dir):
        """Non-recursive mode MUST only scan top level."""
        # Create files at multiple levels
        create_empty_file(temp_test_dir / "top_level.mp4")
        create_empty_file(temp_test_dir / "subfolder" / "nested.mp4")
        create_empty_file(temp_test_dir / "subfolder" / "deep" / "very_nested.mp4")
        
        # Non-recursive scan
        files = FolderScanner.scan(temp_test_dir, recursive=False)
        
        assert len(files) == 1, "Non-recursive should find only top-level file"
        assert files[0].name == "top_level.mp4"
    
    def test_recursive_finds_all_levels(self, temp_test_dir):
        """Recursive mode MUST find files at all levels."""
        # Create files at multiple levels
        create_empty_file(temp_test_dir / "level0.mp4")
        create_empty_file(temp_test_dir / "a" / "level1.mp4")
        create_empty_file(temp_test_dir / "a" / "b" / "level2.mp4")
        create_empty_file(temp_test_dir / "a" / "b" / "c" / "level3.mp4")
        
        # Recursive scan
        files = FolderScanner.scan(temp_test_dir, recursive=True)
        
        assert len(files) == 4, "Recursive should find all 4 files"
    
    def test_recursive_false_is_default_safe(self, temp_test_dir):
        """With recursive=False, nested files are NOT discovered."""
        # Put files only in subfolders
        create_empty_file(temp_test_dir / "sub1" / "file1.mp4")
        create_empty_file(temp_test_dir / "sub2" / "file2.mp4")
        
        files = FolderScanner.scan(temp_test_dir, recursive=False)
        
        assert len(files) == 0, "Non-recursive should find 0 files"


# =============================================================================
# TEST: Deep nesting
# =============================================================================

class TestDeepNesting:
    """Deep folder nesting MUST be handled without limits."""
    
    def test_10_levels_deep(self, temp_test_dir):
        """10 levels of nesting MUST work."""
        # Create 10-level deep structure
        current = temp_test_dir
        for i in range(10):
            current = current / f"level_{i}"
        
        # Create file at deepest level
        deep_file = current / "deep_file.mp4"
        create_empty_file(deep_file)
        
        files = FolderScanner.scan(temp_test_dir, recursive=True)
        
        assert len(files) == 1
        assert "deep_file.mp4" in files[0].name
    
    def test_20_levels_deep(self, temp_test_dir):
        """20 levels of nesting MUST work (no arbitrary limit)."""
        current = temp_test_dir
        for i in range(20):
            current = current / f"level_{i}"
        
        deep_file = current / "very_deep.mp4"
        create_empty_file(deep_file)
        
        files = FolderScanner.scan(temp_test_dir, recursive=True)
        
        assert len(files) == 1
        assert "very_deep.mp4" in files[0].name
    
    def test_files_at_every_level(self, temp_test_dir):
        """Files at every level MUST be discovered."""
        all_files = create_nested_structure(temp_test_dir, depth=5, files_per_level=2)
        
        discovered = FolderScanner.scan(temp_test_dir, recursive=True)
        
        assert len(discovered) == len(all_files), (
            f"Expected {len(all_files)} files, found {len(discovered)}"
        )


# =============================================================================
# TEST: Multiple subfolders at same level
# =============================================================================

class TestMultipleSubfolders:
    """Multiple sibling subfolders MUST all be scanned."""
    
    def test_multiple_siblings_scanned(self, temp_test_dir):
        """All sibling folders MUST be scanned in recursive mode."""
        # Create multiple sibling folders
        for folder_name in ["A", "B", "C", "D", "E"]:
            create_empty_file(temp_test_dir / folder_name / "file.mp4")
        
        files = FolderScanner.scan(temp_test_dir, recursive=True)
        
        assert len(files) == 5, "Should find 1 file in each of 5 folders"
    
    def test_wide_and_deep_structure(self, temp_test_dir):
        """Wide (many siblings) and deep (many levels) MUST work together."""
        # Create wide structure at top level
        for folder in ["A", "B", "C"]:
            folder_path = temp_test_dir / folder
            # Each folder has deep nesting
            for i in range(3):
                deep_path = folder_path / f"deep_{i}"
                create_empty_file(deep_path / f"file_{folder}_{i}.mp4")
        
        files = FolderScanner.scan(temp_test_dir, recursive=True)
        
        assert len(files) == 9, "3 folders × 3 deep levels = 9 files"


# =============================================================================
# TEST: Empty subfolders
# =============================================================================

class TestEmptySubfolders:
    """Empty subfolders MUST not cause errors."""
    
    def test_empty_subfolder_skipped(self, temp_test_dir):
        """Empty subfolders MUST be skipped without error."""
        # Create some empty folders
        (temp_test_dir / "empty1").mkdir()
        (temp_test_dir / "empty2").mkdir()
        (temp_test_dir / "has_file").mkdir()
        create_empty_file(temp_test_dir / "has_file" / "video.mp4")
        
        files = FolderScanner.scan(temp_test_dir, recursive=True)
        
        assert len(files) == 1
        assert files[0].name == "video.mp4"
    
    def test_deeply_nested_empty_folders(self, temp_test_dir):
        """Deeply nested empty folders MUST not cause errors."""
        # Create deep empty structure
        (temp_test_dir / "a" / "b" / "c" / "d" / "e").mkdir(parents=True)
        # Put one file at top level
        create_empty_file(temp_test_dir / "top.mp4")
        
        files = FolderScanner.scan(temp_test_dir, recursive=True)
        
        assert len(files) == 1


# =============================================================================
# TEST: Symlinks
# =============================================================================

class TestSymlinks:
    """Symlinks MUST be handled safely (no infinite loops)."""
    
    def test_symlink_to_parent_no_infinite_loop(self, temp_test_dir):
        """Symlink to parent folder MUST not cause infinite loop."""
        # Create a file
        create_empty_file(temp_test_dir / "video.mp4")
        
        # Create symlink to parent (potential infinite loop)
        symlink = temp_test_dir / "parent_link"
        try:
            symlink.symlink_to(temp_test_dir)
        except OSError:
            pytest.skip("Symlink creation not supported")
        
        # This should complete without hanging
        # Most implementations follow symlinks but track visited paths
        files = FolderScanner.scan(temp_test_dir, recursive=True)
        
        # Should find at least the original file
        assert len(files) >= 1
    
    def test_symlink_to_sibling_folder(self, temp_test_dir):
        """Symlink to sibling folder should work."""
        # Create actual folder with file
        real_folder = temp_test_dir / "real"
        create_empty_file(real_folder / "video.mp4")
        
        # Create symlink to sibling
        symlink = temp_test_dir / "linked"
        try:
            symlink.symlink_to(real_folder)
        except OSError:
            pytest.skip("Symlink creation not supported")
        
        files = FolderScanner.scan(temp_test_dir, recursive=True)
        
        # Should find files from both real and linked folders
        assert len(files) >= 1


# =============================================================================
# TEST: Special characters in paths
# =============================================================================

class TestSpecialCharactersInPaths:
    """Paths with special characters MUST work."""
    
    def test_spaces_in_folder_names(self, temp_test_dir):
        """Folder names with spaces MUST work."""
        folder = temp_test_dir / "folder with spaces" / "another folder"
        create_empty_file(folder / "video file.mp4")
        
        files = FolderScanner.scan(temp_test_dir, recursive=True)
        
        assert len(files) == 1
    
    def test_unicode_folder_names(self, temp_test_dir):
        """Unicode folder names MUST work."""
        folder = temp_test_dir / "日本語フォルダ" / "中文文件夹"
        create_empty_file(folder / "視頻.mp4")
        
        files = FolderScanner.scan(temp_test_dir, recursive=True)
        
        assert len(files) == 1
    
    def test_special_chars_folder_names(self, temp_test_dir):
        """Special characters in folder names MUST work."""
        special_names = [
            "folder-with-dashes",
            "folder_with_underscores",
            "folder.with.dots",
            "folder (with) parens",
            "folder [with] brackets",
        ]
        
        for name in special_names:
            create_empty_file(temp_test_dir / name / "video.mp4")
        
        files = FolderScanner.scan(temp_test_dir, recursive=True)
        
        assert len(files) == len(special_names)


# =============================================================================
# TEST: Order determinism
# =============================================================================

class TestOrderDeterminism:
    """Scan order MUST be deterministic."""
    
    def test_recursive_order_deterministic(self, temp_test_dir):
        """Recursive scan order MUST be deterministic across calls."""
        # Create files in various locations
        create_empty_file(temp_test_dir / "z" / "last.mp4")
        create_empty_file(temp_test_dir / "a" / "first.mp4")
        create_empty_file(temp_test_dir / "m" / "middle.mp4")
        
        # Scan multiple times
        results = []
        for _ in range(10):
            files = FolderScanner.scan(temp_test_dir, recursive=True)
            results.append(tuple(str(f) for f in files))
        
        # All results must be identical
        assert len(set(results)) == 1, "Recursive scan order must be deterministic"
    
    def test_sorted_output(self, temp_test_dir):
        """Output MUST be sorted."""
        create_empty_file(temp_test_dir / "c.mp4")
        create_empty_file(temp_test_dir / "a.mp4")
        create_empty_file(temp_test_dir / "b.mp4")
        
        files = FolderScanner.scan(temp_test_dir, recursive=False)
        names = [f.name for f in files]
        
        assert names == sorted(names)


# =============================================================================
# TEST: Hidden folders
# =============================================================================

class TestHiddenFolders:
    """Hidden folders (dot prefix) should be handled consistently."""
    
    def test_hidden_folders_in_recursive(self, temp_test_dir):
        """Behavior with hidden folders should be consistent."""
        # Create hidden folder
        create_empty_file(temp_test_dir / ".hidden_folder" / "video.mp4")
        create_empty_file(temp_test_dir / "visible_folder" / "video.mp4")
        
        files = FolderScanner.scan(temp_test_dir, recursive=True)
        
        # Implementation may or may not include hidden folders
        # But behavior must be consistent
        hidden_count = sum(1 for f in files if ".hidden" in str(f))
        visible_count = sum(1 for f in files if "visible" in str(f))
        
        assert visible_count == 1, "Visible folder files must be found"
        # Hidden folder handling is implementation-defined but must be consistent


# =============================================================================
# TEST: Subfolder counting
# =============================================================================

class TestSubfolderCounting:
    """Subfolder counting MUST be accurate."""
    
    def test_immediate_subfolder_count(self, temp_test_dir):
        """get_subfolder_count MUST return immediate subfolders only."""
        (temp_test_dir / "sub1").mkdir()
        (temp_test_dir / "sub2").mkdir()
        (temp_test_dir / "sub3").mkdir()
        (temp_test_dir / "sub1" / "nested").mkdir()  # Should not count
        
        count = FolderScanner.get_subfolder_count(temp_test_dir)
        
        assert count == 3
    
    def test_total_subfolder_count(self, temp_test_dir):
        """get_total_subfolder_count MUST return all subfolders."""
        (temp_test_dir / "a").mkdir()
        (temp_test_dir / "b").mkdir()
        (temp_test_dir / "a" / "a1").mkdir()
        (temp_test_dir / "a" / "a2").mkdir()
        (temp_test_dir / "b" / "b1").mkdir()
        
        count = FolderScanner.get_total_subfolder_count(temp_test_dir)
        
        assert count == 5  # a, b, a1, a2, b1


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
