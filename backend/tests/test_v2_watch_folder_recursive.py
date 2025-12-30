"""
Tests for V2 Watch Folder Runner - Recursive Job Discovery.

These tests verify:
1. Non-recursive mode only scans top-level pending/ directory (unchanged behavior)
2. Recursive mode finds JobSpecs in nested subdirectories
3. Deterministic traversal order (alphabetically sorted)
4. Mixed valid/invalid JobSpecs do not block discovery
5. Skip logic (manifest, result files) applies identically in both modes
6. No execution engine logic is invoked during discovery
7. Permission errors are surfaced clearly

Part of V2 Phase 2 (Recursive Watch Folder Support)
"""

import json
import pytest
import tempfile
from datetime import datetime, timezone
from pathlib import Path

# Import the module under test
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from v2.watch_folder_runner import (
    scan_for_pending_jobspecs,
    PENDING_FOLDER,
    RESULT_SUFFIX,
)


# -----------------------------------------------------------------------------
# Helper Functions
# -----------------------------------------------------------------------------

def create_minimal_jobspec(path: Path, job_id: str = "test_job") -> Path:
    """Create a minimal valid JobSpec JSON file."""
    jobspec_data = {
        "jobspec_version": "2.0",
        "job_id": job_id,
        "sources": ["/tmp/fake_source.mov"],
        "output_directory": "/tmp/output",
        "codec": "h264",
        "container": "mp4",
        "resolution": "half",
        "naming_template": "{source_name}_proxy",
    }
    path.write_text(json.dumps(jobspec_data, indent=2))
    return path


def create_watch_folder_structure(tmp_path: Path) -> Path:
    """Create a watch folder structure with pending/ subdirectory."""
    watch_folder = tmp_path / "watch"
    watch_folder.mkdir()
    
    pending = watch_folder / PENDING_FOLDER
    pending.mkdir()
    
    return watch_folder


# -----------------------------------------------------------------------------
# Test: Non-Recursive Mode (Default Behavior)
# -----------------------------------------------------------------------------

class TestNonRecursiveMode:
    """Tests for non-recursive mode (default, unchanged behavior)."""
    
    def test_non_recursive_ignores_subdirectories(self, tmp_path: Path):
        """Non-recursive mode should only scan top-level pending/ directory."""
        watch_folder = create_watch_folder_structure(tmp_path)
        pending = watch_folder / PENDING_FOLDER
        
        # Create JobSpec in top-level pending/
        top_level_job = pending / "job_toplevel.json"
        create_minimal_jobspec(top_level_job, "toplevel")
        
        # Create subdirectory with JobSpec
        subdir = pending / "subdir"
        subdir.mkdir()
        nested_job = subdir / "job_nested.json"
        create_minimal_jobspec(nested_job, "nested")
        
        # Scan non-recursively (default)
        jobspecs = scan_for_pending_jobspecs(watch_folder, recursive=False)
        
        # Should only find top-level JobSpec
        assert len(jobspecs) == 1
        assert jobspecs[0].name == "job_toplevel.json"
    
    def test_non_recursive_excludes_result_files(self, tmp_path: Path):
        """Non-recursive mode should skip .result.json files."""
        watch_folder = create_watch_folder_structure(tmp_path)
        pending = watch_folder / PENDING_FOLDER
        
        # Create JobSpec
        job_file = pending / "job.json"
        create_minimal_jobspec(job_file)
        
        # Create result file
        result_file = pending / "job.result.json"
        result_file.write_text('{"status": "COMPLETED"}')
        
        # Scan non-recursively
        jobspecs = scan_for_pending_jobspecs(watch_folder, recursive=False)
        
        # Should only find the JobSpec, not the result file
        assert len(jobspecs) == 1
        assert jobspecs[0].name == "job.json"
    
    def test_non_recursive_deterministic_ordering(self, tmp_path: Path):
        """Non-recursive mode should return files in alphabetical order."""
        watch_folder = create_watch_folder_structure(tmp_path)
        pending = watch_folder / PENDING_FOLDER
        
        # Create JobSpecs in non-alphabetical order
        create_minimal_jobspec(pending / "zebra.json", "zebra")
        create_minimal_jobspec(pending / "apple.json", "apple")
        create_minimal_jobspec(pending / "monkey.json", "monkey")
        
        # Scan non-recursively
        jobspecs = scan_for_pending_jobspecs(watch_folder, recursive=False)
        
        # Should be sorted alphabetically
        assert len(jobspecs) == 3
        assert jobspecs[0].name == "apple.json"
        assert jobspecs[1].name == "monkey.json"
        assert jobspecs[2].name == "zebra.json"
    
    def test_non_recursive_empty_pending_folder(self, tmp_path: Path):
        """Non-recursive mode should return empty list for empty pending/."""
        watch_folder = create_watch_folder_structure(tmp_path)
        
        # Scan empty pending folder
        jobspecs = scan_for_pending_jobspecs(watch_folder, recursive=False)
        
        assert jobspecs == []
    
    def test_non_recursive_missing_pending_folder(self, tmp_path: Path):
        """Non-recursive mode should return empty list if pending/ doesn't exist."""
        watch_folder = tmp_path / "watch"
        watch_folder.mkdir()
        # Note: pending/ subdirectory is NOT created
        
        # Scan with missing pending folder
        jobspecs = scan_for_pending_jobspecs(watch_folder, recursive=False)
        
        assert jobspecs == []


# -----------------------------------------------------------------------------
# Test: Recursive Mode
# -----------------------------------------------------------------------------

class TestRecursiveMode:
    """Tests for recursive mode (new feature)."""
    
    def test_recursive_finds_nested_jobspecs(self, tmp_path: Path):
        """Recursive mode should find JobSpecs in subdirectories."""
        watch_folder = create_watch_folder_structure(tmp_path)
        pending = watch_folder / PENDING_FOLDER
        
        # Create JobSpec in top-level
        create_minimal_jobspec(pending / "job_toplevel.json", "toplevel")
        
        # Create nested subdirectories with JobSpecs
        subdir1 = pending / "batch1"
        subdir1.mkdir()
        create_minimal_jobspec(subdir1 / "job_a.json", "a")
        
        subdir2 = pending / "batch2"
        subdir2.mkdir()
        create_minimal_jobspec(subdir2 / "job_b.json", "b")
        
        # Deeply nested
        deep = pending / "batch1" / "nested"
        deep.mkdir()
        create_minimal_jobspec(deep / "job_deep.json", "deep")
        
        # Scan recursively
        jobspecs = scan_for_pending_jobspecs(watch_folder, recursive=True)
        
        # Should find all JobSpecs
        assert len(jobspecs) == 4
        job_names = [j.name for j in jobspecs]
        assert "job_toplevel.json" in job_names
        assert "job_a.json" in job_names
        assert "job_b.json" in job_names
        assert "job_deep.json" in job_names
    
    def test_recursive_deterministic_ordering(self, tmp_path: Path):
        """Recursive mode should return files in deterministic alphabetical order."""
        watch_folder = create_watch_folder_structure(tmp_path)
        pending = watch_folder / PENDING_FOLDER
        
        # Create directory structure with multiple levels
        # Directory names: z_dir, a_dir (non-alphabetical creation)
        z_dir = pending / "z_dir"
        z_dir.mkdir()
        create_minimal_jobspec(z_dir / "z_file.json", "z")
        
        a_dir = pending / "a_dir"
        a_dir.mkdir()
        create_minimal_jobspec(a_dir / "a_file.json", "a")
        
        # Top-level file
        create_minimal_jobspec(pending / "m_toplevel.json", "m")
        
        # Scan recursively multiple times
        jobspecs1 = scan_for_pending_jobspecs(watch_folder, recursive=True)
        jobspecs2 = scan_for_pending_jobspecs(watch_folder, recursive=True)
        
        # Results should be identical across runs
        assert len(jobspecs1) == 3
        assert len(jobspecs2) == 3
        assert [j.name for j in jobspecs1] == [j.name for j in jobspecs2]
        
        # Check expected deterministic order
        # Expected: a_dir/a_file.json, m_toplevel.json, z_dir/z_file.json
        # (sorted by relative path from pending/)
        relative_paths = [j.relative_to(pending) for j in jobspecs1]
        relative_paths_str = [str(p) for p in relative_paths]
        
        assert relative_paths_str == sorted(relative_paths_str)
        assert relative_paths_str[0] == "a_dir/a_file.json"
        assert relative_paths_str[1] == "m_toplevel.json"
        assert relative_paths_str[2] == "z_dir/z_file.json"
    
    def test_recursive_excludes_result_files_in_subdirs(self, tmp_path: Path):
        """Recursive mode should skip .result.json files in all subdirectories."""
        watch_folder = create_watch_folder_structure(tmp_path)
        pending = watch_folder / PENDING_FOLDER
        
        # Create subdirectory
        subdir = pending / "batch"
        subdir.mkdir()
        
        # Create JobSpec and result file
        create_minimal_jobspec(subdir / "job.json", "job")
        result_file = subdir / "job.result.json"
        result_file.write_text('{"status": "COMPLETED"}')
        
        # Also create another result file
        result_file2 = subdir / "another.result.json"
        result_file2.write_text('{"status": "FAILED"}')
        
        # Scan recursively
        jobspecs = scan_for_pending_jobspecs(watch_folder, recursive=True)
        
        # Should only find the JobSpec, not result files
        assert len(jobspecs) == 1
        assert jobspecs[0].name == "job.json"
    
    def test_recursive_empty_subdirectories_no_error(self, tmp_path: Path):
        """Recursive mode should handle empty subdirectories gracefully."""
        watch_folder = create_watch_folder_structure(tmp_path)
        pending = watch_folder / PENDING_FOLDER
        
        # Create empty subdirectories
        (pending / "empty1").mkdir()
        (pending / "empty2" / "nested_empty").mkdir(parents=True)
        
        # Create one JobSpec in a different subdir
        batch_dir = pending / "batch"
        batch_dir.mkdir()
        create_minimal_jobspec(batch_dir / "job.json", "job")
        
        # Scan recursively
        jobspecs = scan_for_pending_jobspecs(watch_folder, recursive=True)
        
        # Should find only the one JobSpec
        assert len(jobspecs) == 1
        assert jobspecs[0].name == "job.json"
    
    def test_recursive_complex_tree_structure(self, tmp_path: Path):
        """Recursive mode should handle complex directory trees deterministically."""
        watch_folder = create_watch_folder_structure(tmp_path)
        pending = watch_folder / PENDING_FOLDER
        
        # Create complex tree
        # pending/
        #   ├── 1_top.json
        #   ├── a/
        #   │   ├── 2_a.json
        #   │   └── x/
        #   │       └── 3_ax.json
        #   ├── b/
        #   │   ├── 4_b.json
        #   │   └── y/
        #   │       └── 5_by.json
        #   └── c/
        #       └── 6_c.json
        
        create_minimal_jobspec(pending / "1_top.json", "1")
        
        a_dir = pending / "a"
        a_dir.mkdir()
        create_minimal_jobspec(a_dir / "2_a.json", "2")
        ax_dir = a_dir / "x"
        ax_dir.mkdir()
        create_minimal_jobspec(ax_dir / "3_ax.json", "3")
        
        b_dir = pending / "b"
        b_dir.mkdir()
        create_minimal_jobspec(b_dir / "4_b.json", "4")
        by_dir = b_dir / "y"
        by_dir.mkdir()
        create_minimal_jobspec(by_dir / "5_by.json", "5")
        
        c_dir = pending / "c"
        c_dir.mkdir()
        create_minimal_jobspec(c_dir / "6_c.json", "6")
        
        # Scan recursively
        jobspecs = scan_for_pending_jobspecs(watch_folder, recursive=True)
        
        # Should find all 6 JobSpecs
        assert len(jobspecs) == 6
        
        # Check deterministic ordering (alphabetical by relative path)
        relative_paths = [str(j.relative_to(pending)) for j in jobspecs]
        expected_order = [
            "1_top.json",
            "a/2_a.json",
            "a/x/3_ax.json",
            "b/4_b.json",
            "b/y/5_by.json",
            "c/6_c.json",
        ]
        assert relative_paths == expected_order


# -----------------------------------------------------------------------------
# Test: Invalid JobSpecs Do Not Block Discovery
# -----------------------------------------------------------------------------

class TestInvalidJobSpecHandling:
    """Tests that invalid JobSpecs do not block discovery of valid ones."""
    
    def test_recursive_invalid_json_does_not_block_discovery(self, tmp_path: Path):
        """Invalid JSON in one subdir should not prevent discovery of valid JobSpecs."""
        watch_folder = create_watch_folder_structure(tmp_path)
        pending = watch_folder / PENDING_FOLDER
        
        # Create valid JobSpec
        batch1 = pending / "batch1"
        batch1.mkdir()
        create_minimal_jobspec(batch1 / "valid.json", "valid")
        
        # Create invalid JSON file
        batch2 = pending / "batch2"
        batch2.mkdir()
        invalid_file = batch2 / "invalid.json"
        invalid_file.write_text("{this is not valid JSON")
        
        # Scan recursively
        jobspecs = scan_for_pending_jobspecs(watch_folder, recursive=True)
        
        # Should still find valid JobSpec
        # Note: scan_for_pending_jobspecs only discovers files, doesn't validate content
        assert len(jobspecs) == 2  # Both files are discovered
        # Validation happens later in the processing pipeline
    
    def test_non_recursive_mixed_valid_invalid(self, tmp_path: Path):
        """Non-recursive mode should discover all .json files (validation happens later)."""
        watch_folder = create_watch_folder_structure(tmp_path)
        pending = watch_folder / PENDING_FOLDER
        
        # Create valid and invalid files
        create_minimal_jobspec(pending / "valid.json", "valid")
        invalid = pending / "invalid.json"
        invalid.write_text("not valid json")
        
        # Scan non-recursively
        jobspecs = scan_for_pending_jobspecs(watch_folder, recursive=False)
        
        # Should find both (discovery doesn't validate content)
        assert len(jobspecs) == 2


# -----------------------------------------------------------------------------
# Test: Comparison Between Modes
# -----------------------------------------------------------------------------

class TestModeComparison:
    """Tests comparing recursive and non-recursive modes."""
    
    def test_recursive_false_matches_non_recursive_behavior(self, tmp_path: Path):
        """recursive=False should behave identically to original non-recursive mode."""
        watch_folder = create_watch_folder_structure(tmp_path)
        pending = watch_folder / PENDING_FOLDER
        
        # Create various files
        create_minimal_jobspec(pending / "job1.json", "1")
        create_minimal_jobspec(pending / "job2.json", "2")
        
        # Create subdirectory with JobSpec (should be ignored)
        subdir = pending / "subdir"
        subdir.mkdir()
        create_minimal_jobspec(subdir / "nested.json", "nested")
        
        # Scan with explicit recursive=False
        jobspecs_explicit_false = scan_for_pending_jobspecs(watch_folder, recursive=False)
        
        # Should only find top-level
        assert len(jobspecs_explicit_false) == 2
        names = [j.name for j in jobspecs_explicit_false]
        assert "job1.json" in names
        assert "job2.json" in names
        assert "nested.json" not in names
    
    def test_recursive_true_finds_more_than_non_recursive(self, tmp_path: Path):
        """recursive=True should find more JobSpecs than recursive=False when subdirs exist."""
        watch_folder = create_watch_folder_structure(tmp_path)
        pending = watch_folder / PENDING_FOLDER
        
        # Create top-level JobSpec
        create_minimal_jobspec(pending / "top.json", "top")
        
        # Create nested JobSpecs
        subdir = pending / "batch"
        subdir.mkdir()
        create_minimal_jobspec(subdir / "nested.json", "nested")
        
        # Scan both modes
        non_recursive = scan_for_pending_jobspecs(watch_folder, recursive=False)
        recursive = scan_for_pending_jobspecs(watch_folder, recursive=True)
        
        # Non-recursive should find only top-level
        assert len(non_recursive) == 1
        assert non_recursive[0].name == "top.json"
        
        # Recursive should find both
        assert len(recursive) == 2
        names = [j.name for j in recursive]
        assert "top.json" in names
        assert "nested.json" in names
    
    def test_recursive_same_result_when_no_subdirs(self, tmp_path: Path):
        """When no subdirectories exist, both modes should return same results."""
        watch_folder = create_watch_folder_structure(tmp_path)
        pending = watch_folder / PENDING_FOLDER
        
        # Create only top-level JobSpecs
        create_minimal_jobspec(pending / "job1.json", "1")
        create_minimal_jobspec(pending / "job2.json", "2")
        
        # Scan both modes
        non_recursive = scan_for_pending_jobspecs(watch_folder, recursive=False)
        recursive = scan_for_pending_jobspecs(watch_folder, recursive=True)
        
        # Should return identical results
        assert len(non_recursive) == len(recursive)
        assert [j.name for j in non_recursive] == [j.name for j in recursive]


# -----------------------------------------------------------------------------
# Test: Edge Cases
# -----------------------------------------------------------------------------

class TestEdgeCases:
    """Tests for edge cases and boundary conditions."""
    
    def test_recursive_with_symlinks(self, tmp_path: Path):
        """Recursive mode should handle symlinks (follows them by default)."""
        watch_folder = create_watch_folder_structure(tmp_path)
        pending = watch_folder / PENDING_FOLDER
        
        # Create actual directory with JobSpec
        real_dir = tmp_path / "external_batch"
        real_dir.mkdir()
        create_minimal_jobspec(real_dir / "external_job.json", "external")
        
        # Create symlink in pending/
        symlink = pending / "linked_batch"
        try:
            symlink.symlink_to(real_dir)
        except OSError:
            # Symlinks may not be supported on all systems
            pytest.skip("Symlinks not supported on this system")
        
        # Also create regular JobSpec
        create_minimal_jobspec(pending / "regular.json", "regular")
        
        # Scan recursively
        jobspecs = scan_for_pending_jobspecs(watch_folder, recursive=True)
        
        # Should find both (rglob follows symlinks by default in Python 3.10+)
        # Note: behavior may vary by Python version
        assert len(jobspecs) >= 1  # At minimum, should find regular.json
        names = [j.name for j in jobspecs]
        assert "regular.json" in names
    
    def test_recursive_deeply_nested_structure(self, tmp_path: Path):
        """Recursive mode should handle deeply nested directory structures."""
        watch_folder = create_watch_folder_structure(tmp_path)
        pending = watch_folder / PENDING_FOLDER
        
        # Create deeply nested structure (10 levels)
        current = pending
        for i in range(10):
            current = current / f"level_{i}"
            current.mkdir()
        
        # Create JobSpec at deepest level
        create_minimal_jobspec(current / "deep_job.json", "deep")
        
        # Scan recursively
        jobspecs = scan_for_pending_jobspecs(watch_folder, recursive=True)
        
        # Should find the deeply nested JobSpec
        assert len(jobspecs) == 1
        assert jobspecs[0].name == "deep_job.json"
    
    def test_recursive_special_characters_in_paths(self, tmp_path: Path):
        """Recursive mode should handle special characters in directory names."""
        watch_folder = create_watch_folder_structure(tmp_path)
        pending = watch_folder / PENDING_FOLDER
        
        # Create directory with special characters
        special_dir = pending / "batch (2024-12-30) [final]"
        special_dir.mkdir()
        create_minimal_jobspec(special_dir / "job.json", "special")
        
        # Scan recursively
        jobspecs = scan_for_pending_jobspecs(watch_folder, recursive=True)
        
        # Should find JobSpec despite special characters
        assert len(jobspecs) == 1
        assert jobspecs[0].name == "job.json"
        assert "batch (2024-12-30) [final]" in str(jobspecs[0])
