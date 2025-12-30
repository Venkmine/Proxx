"""
Pre-RAW Smoke Test - Recursive Watch Folder (Realistic Scenarios)

Validates realistic recursive watch folder discovery scenarios.

Tests:
1. Multi-project folder structure discovery
2. Deterministic ordering across runs
3. Non-recursive mode only finds top-level jobs
4. No path leakage into JobSpec

Part of Pre-RAW Smoke Validation Suite
"""

import pytest
import json
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from v2.watch_folder_runner import scan_for_pending_jobspecs, PENDING_FOLDER
from job_spec import JobSpec, JOBSPEC_VERSION


def create_jobspec_file(path: Path, job_id: str, source_name: str = "test.mp4") -> None:
    """Create a minimal valid JobSpec JSON file."""
    jobspec = {
        "jobspec_version": JOBSPEC_VERSION,
        "job_id": job_id,
        "sources": [f"/tmp/sources/{source_name}"],
        "output_directory": "/tmp/output",
        "codec": "h264",
        "container": "mp4",
        "resolution": "half",
        "naming_template": "{source_name}_proxy",
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(jobspec, indent=2))


def test_realistic_multi_project_structure():
    """
    TEST: Realistic multi-project watch folder structure.
    
    GIVEN: Watch folder with multiple project subdirectories:
        watch/pending/
            projectA/job1.json
            projectB/sub/job2.json
    WHEN: Scanned with --recursive
    THEN: Both jobs discovered
    AND: Ordering is deterministic
    """
    import tempfile
    
    with tempfile.TemporaryDirectory() as tmpdir:
        watch = Path(tmpdir) / "watch"
        pending = watch / PENDING_FOLDER
        pending.mkdir(parents=True)
        
        # Create realistic structure
        projectA = pending / "projectA"
        projectA.mkdir()
        create_jobspec_file(projectA / "job1.json", "projectA_job1")
        
        projectB_sub = pending / "projectB" / "sub"
        projectB_sub.mkdir(parents=True)
        create_jobspec_file(projectB_sub / "job2.json", "projectB_job2")
        
        # Scan recursively
        jobspecs = scan_for_pending_jobspecs(watch, recursive=True)
        
        # Assertions: Both jobs found
        assert len(jobspecs) == 2
        
        # Assertions: Deterministic order (alphabetical by relative path)
        relative_paths = [j.relative_to(pending).as_posix() for j in jobspecs]
        assert relative_paths == ["projectA/job1.json", "projectB/sub/job2.json"]


def test_recursive_ordering_is_deterministic():
    """
    TEST: Recursive discovery order is deterministic across runs.
    
    GIVEN: Complex watch folder tree
    WHEN: Scanned multiple times with --recursive
    THEN: Same order every time
    AND: Order is alphabetical by relative path
    """
    import tempfile
    
    with tempfile.TemporaryDirectory() as tmpdir:
        watch = Path(tmpdir) / "watch"
        pending = watch / PENDING_FOLDER
        pending.mkdir(parents=True)
        
        # Create complex structure
        create_jobspec_file(pending / "a_top.json", "a_top")
        create_jobspec_file(pending / "z_top.json", "z_top")
        
        batch1 = pending / "batch1"
        batch1.mkdir()
        create_jobspec_file(batch1 / "m_batch1.json", "m_batch1")
        
        batch2_sub = pending / "batch2" / "subdir"
        batch2_sub.mkdir(parents=True)
        create_jobspec_file(batch2_sub / "b_batch2.json", "b_batch2")
        
        # Scan multiple times
        run1 = scan_for_pending_jobspecs(watch, recursive=True)
        run2 = scan_for_pending_jobspecs(watch, recursive=True)
        run3 = scan_for_pending_jobspecs(watch, recursive=True)
        
        # Assertions: Same order every run
        paths1 = [j.relative_to(pending).as_posix() for j in run1]
        paths2 = [j.relative_to(pending).as_posix() for j in run2]
        paths3 = [j.relative_to(pending).as_posix() for j in run3]
        
        assert paths1 == paths2 == paths3
        
        # Assertions: Alphabetical order
        expected_order = [
            "a_top.json",
            "batch1/m_batch1.json",
            "batch2/subdir/b_batch2.json",
            "z_top.json",
        ]
        assert paths1 == expected_order


def test_non_recursive_only_finds_top_level():
    """
    TEST: Non-recursive mode only finds top-level jobs.
    
    GIVEN: Watch folder with nested structure:
        watch/pending/
            job1.json       (top-level)
            projectA/
                job2.json   (nested)
    WHEN: Scanned WITHOUT --recursive
    THEN: Only job1.json found
    AND: job2.json NOT discovered
    """
    import tempfile
    
    with tempfile.TemporaryDirectory() as tmpdir:
        watch = Path(tmpdir) / "watch"
        pending = watch / PENDING_FOLDER
        pending.mkdir(parents=True)
        
        # Top-level job
        create_jobspec_file(pending / "job1.json", "job1")
        
        # Nested job
        projectA = pending / "projectA"
        projectA.mkdir()
        create_jobspec_file(projectA / "job2.json", "job2")
        
        # Scan non-recursively (default)
        jobspecs = scan_for_pending_jobspecs(watch, recursive=False)
        
        # Assertions: Only top-level found
        assert len(jobspecs) == 1
        assert jobspecs[0].name == "job1.json"


def test_recursive_finds_all_non_recursive_finds_subset():
    """
    TEST: Recursive mode finds more jobs than non-recursive.
    
    GIVEN: Watch folder with mixed structure
    WHEN: Scanned with and without --recursive
    THEN: Recursive finds all jobs
    AND: Non-recursive finds only top-level
    AND: Non-recursive results are subset of recursive results
    """
    import tempfile
    
    with tempfile.TemporaryDirectory() as tmpdir:
        watch = Path(tmpdir) / "watch"
        pending = watch / PENDING_FOLDER
        pending.mkdir(parents=True)
        
        # Create jobs at multiple levels
        create_jobspec_file(pending / "top1.json", "top1")
        create_jobspec_file(pending / "top2.json", "top2")
        
        sub = pending / "subdir"
        sub.mkdir()
        create_jobspec_file(sub / "nested1.json", "nested1")
        create_jobspec_file(sub / "nested2.json", "nested2")
        
        # Scan both modes
        non_recursive = scan_for_pending_jobspecs(watch, recursive=False)
        recursive = scan_for_pending_jobspecs(watch, recursive=True)
        
        # Assertions: Recursive finds more
        assert len(recursive) == 4
        assert len(non_recursive) == 2
        
        # Assertions: Non-recursive is subset
        non_recursive_names = {j.name for j in non_recursive}
        recursive_names = {j.name for j in recursive}
        
        assert non_recursive_names.issubset(recursive_names)
        assert "top1.json" in non_recursive_names
        assert "top2.json" in non_recursive_names
        assert "nested1.json" not in non_recursive_names
        assert "nested2.json" not in non_recursive_names


def test_no_path_leakage_into_jobspec():
    """
    TEST: Watch folder structure does not leak into JobSpec content.
    
    GIVEN: JobSpec in nested directory structure
    WHEN: JobSpec is loaded
    THEN: JobSpec content is unchanged
    AND: No watch folder paths added
    AND: Sources remain as specified in JSON
    """
    import tempfile
    
    with tempfile.TemporaryDirectory() as tmpdir:
        watch = Path(tmpdir) / "watch"
        pending = watch / PENDING_FOLDER
        
        # Create nested structure
        deep = pending / "project" / "batch" / "clips"
        deep.mkdir(parents=True)
        
        jobspec_path = deep / "job.json"
        original_source = "/media/source.mp4"
        
        jobspec_data = {
            "jobspec_version": JOBSPEC_VERSION,
            "job_id": "test_no_leakage",
            "sources": [original_source],
            "output_directory": "/output",
            "codec": "h264",
            "container": "mp4",
            "resolution": "half",
            "naming_template": "output",
        }
        jobspec_path.write_text(json.dumps(jobspec_data, indent=2))
        
        # Discover JobSpec
        jobspecs = scan_for_pending_jobspecs(watch, recursive=True)
        assert len(jobspecs) == 1
        
        # Load JobSpec and verify content
        loaded_jobspec = JobSpec.from_json(jobspecs[0].read_text())
        
        # Assertions: No path leakage
        assert loaded_jobspec.sources == [original_source]
        assert str(watch) not in loaded_jobspec.sources[0]
        assert "pending" not in loaded_jobspec.sources[0]
        assert "project" not in loaded_jobspec.sources[0]


def test_realistic_overnight_batch_structure():
    """
    TEST: Realistic overnight batch ingestion structure.
    
    GIVEN: Watch folder organized by date and camera:
        watch/pending/
            2024-01-15/
                cam_A/job1.json
                cam_B/job2.json
            2024-01-16/
                cam_A/job3.json
    WHEN: Scanned with --recursive
    THEN: All jobs discovered in deterministic order
    """
    import tempfile
    
    with tempfile.TemporaryDirectory() as tmpdir:
        watch = Path(tmpdir) / "watch"
        pending = watch / PENDING_FOLDER
        pending.mkdir(parents=True)
        
        # Create realistic date/camera structure
        day1_camA = pending / "2024-01-15" / "cam_A"
        day1_camA.mkdir(parents=True)
        create_jobspec_file(day1_camA / "job1.json", "job1")
        
        day1_camB = pending / "2024-01-15" / "cam_B"
        day1_camB.mkdir(parents=True)
        create_jobspec_file(day1_camB / "job2.json", "job2")
        
        day2_camA = pending / "2024-01-16" / "cam_A"
        day2_camA.mkdir(parents=True)
        create_jobspec_file(day2_camA / "job3.json", "job3")
        
        # Scan recursively
        jobspecs = scan_for_pending_jobspecs(watch, recursive=True)
        
        # Assertions: All jobs found
        assert len(jobspecs) == 3
        
        # Assertions: Deterministic alphabetical order
        relative_paths = [j.relative_to(pending).as_posix() for j in jobspecs]
        expected = [
            "2024-01-15/cam_A/job1.json",
            "2024-01-15/cam_B/job2.json",
            "2024-01-16/cam_A/job3.json",
        ]
        assert relative_paths == expected


def test_empty_subdirectories_ignored():
    """
    TEST: Empty subdirectories do not cause errors.
    
    GIVEN: Watch folder with empty nested directories
    WHEN: Scanned with --recursive
    THEN: No errors occur
    AND: Only actual JobSpecs are discovered
    """
    import tempfile
    
    with tempfile.TemporaryDirectory() as tmpdir:
        watch = Path(tmpdir) / "watch"
        pending = watch / PENDING_FOLDER
        pending.mkdir(parents=True)
        
        # Create empty directories
        (pending / "empty1").mkdir()
        (pending / "empty2" / "nested").mkdir(parents=True)
        
        # Create one real job
        (pending / "project").mkdir()
        create_jobspec_file(pending / "project" / "job.json", "job1")
        
        # Scan recursively
        jobspecs = scan_for_pending_jobspecs(watch, recursive=True)
        
        # Assertions: Only real job found
        assert len(jobspecs) == 1
        assert jobspecs[0].name == "job.json"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
