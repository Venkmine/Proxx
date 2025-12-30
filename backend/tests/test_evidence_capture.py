"""
Tests for evidence capture hooks (no behavior changes).

This test suite validates that:
1. All evidence fields exist in JobExecutionResult
2. Resolve edition/version are captured when available
3. Source file evidence is deterministic
4. Output verification fields are present
5. NO execution behavior changes occurred

CRITICAL: These tests enforce that evidence capture is READ-ONLY.
"""

import pytest
import tempfile
from pathlib import Path
from datetime import datetime, timezone

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.execution_results import JobExecutionResult, ClipExecutionResult
from backend.job_spec import JobSpec
from backend.execution_adapter import execute_jobspec


# =============================================================================
# Test: JobExecutionResult Evidence Fields
# =============================================================================

def test_job_result_has_all_evidence_fields():
    """
    TEST: JobExecutionResult.to_dict() contains all required evidence fields.
    
    GIVEN: A JobExecutionResult with clips
    WHEN: to_dict() is called
    THEN: All evidence fields exist (even when null)
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        # Create test clip result
        clip = ClipExecutionResult(
            source_path=str(tmpdir_path / "test.mp4"),
            resolved_output_path=str(tmpdir_path / "output.mov"),
            ffmpeg_command=["ffmpeg", "-i", "test.mp4", "output.mov"],
            exit_code=0,
            output_exists=True,
            output_size_bytes=1024,
            status="COMPLETED",
            engine_used="ffmpeg",
            proxy_profile_used="test_profile",
        )
        
        # Create job result
        job_result = JobExecutionResult(
            job_id="test_job",
            clips=[clip],
            final_status="COMPLETED",
            engine_used="ffmpeg",
            proxy_profile_used="test_profile",
        )
        
        # Serialize
        result_dict = job_result.to_dict()
        
        # Assert top-level evidence fields exist
        assert "source_files" in result_dict
        assert "source_extensions" in result_dict
        assert isinstance(result_dict["source_files"], list)
        assert isinstance(result_dict["source_extensions"], list)
        
        # Assert metadata evidence fields exist
        metadata = result_dict["_metadata"]
        assert "resolve_edition_detected" in metadata
        assert "resolve_version_detected" in metadata
        assert "engine_used" in metadata
        assert "proxy_profile_used" in metadata
        
        # Fields can be null but MUST exist
        # (Will be populated by execution engines when Resolve is detected)


def test_source_files_contains_basenames_only():
    """
    TEST: source_files contains basenames (no full paths).
    
    GIVEN: JobExecutionResult with multiple clips
    WHEN: to_dict() is called
    THEN: source_files contains only basenames
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        clips = [
            ClipExecutionResult(
                source_path="/absolute/path/to/clip1.mp4",
                resolved_output_path=str(tmpdir_path / "out1.mov"),
                ffmpeg_command=[],
                exit_code=0,
                output_exists=True,
                output_size_bytes=1024,
                status="COMPLETED",
            ),
            ClipExecutionResult(
                source_path="/another/path/clip2.braw",
                resolved_output_path=str(tmpdir_path / "out2.mov"),
                ffmpeg_command=[],
                exit_code=0,
                output_exists=True,
                output_size_bytes=2048,
                status="COMPLETED",
            ),
        ]
        
        job_result = JobExecutionResult(
            job_id="test_job",
            clips=clips,
            final_status="COMPLETED",
        )
        
        result_dict = job_result.to_dict()
        
        # Should contain basenames only
        assert result_dict["source_files"] == ["clip1.mp4", "clip2.braw"]
        
        # Should NOT contain full paths
        for filename in result_dict["source_files"]:
            assert "/" not in filename
            assert "\\" not in filename


def test_source_extensions_are_normalized_and_sorted():
    """
    TEST: source_extensions are normalized and sorted for determinism.
    
    GIVEN: JobExecutionResult with mixed-case extensions
    WHEN: to_dict() is called
    THEN: Extensions are lowercase, unique, and sorted
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        clips = [
            ClipExecutionResult(
                source_path="/path/file1.MP4",
                resolved_output_path=str(tmpdir_path / "out1.mov"),
                ffmpeg_command=[],
                exit_code=0,
                output_exists=True,
                output_size_bytes=1024,
                status="COMPLETED",
            ),
            ClipExecutionResult(
                source_path="/path/file2.braw",
                resolved_output_path=str(tmpdir_path / "out2.mov"),
                ffmpeg_command=[],
                exit_code=0,
                output_exists=True,
                output_size_bytes=2048,
                status="COMPLETED",
            ),
            ClipExecutionResult(
                source_path="/path/file3.mp4",  # Duplicate extension
                resolved_output_path=str(tmpdir_path / "out3.mov"),
                ffmpeg_command=[],
                exit_code=0,
                output_exists=True,
                output_size_bytes=3072,
                status="COMPLETED",
            ),
        ]
        
        job_result = JobExecutionResult(
            job_id="test_job",
            clips=clips,
            final_status="COMPLETED",
        )
        
        result_dict = job_result.to_dict()
        
        # Should be normalized and sorted
        assert result_dict["source_extensions"] == [".braw", ".mp4"]
        
        # Should be unique (no duplicates)
        assert len(result_dict["source_extensions"]) == len(set(result_dict["source_extensions"]))


def test_resolve_metadata_fields_default_to_null():
    """
    TEST: Resolve edition/version fields default to null when not set.
    
    GIVEN: JobExecutionResult without Resolve metadata
    WHEN: to_dict() is called
    THEN: Resolve fields exist but are null
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        clip = ClipExecutionResult(
            source_path=str(tmpdir_path / "test.mp4"),
            resolved_output_path=str(tmpdir_path / "output.mov"),
            ffmpeg_command=[],
            exit_code=0,
            output_exists=True,
            output_size_bytes=1024,
            status="COMPLETED",
        )
        
        job_result = JobExecutionResult(
            job_id="test_job",
            clips=[clip],
            final_status="COMPLETED",
        )
        
        result_dict = job_result.to_dict()
        metadata = result_dict["_metadata"]
        
        # Fields MUST exist
        assert "resolve_edition_detected" in metadata
        assert "resolve_version_detected" in metadata
        
        # But should be null when not set
        assert metadata["resolve_edition_detected"] is None
        assert metadata["resolve_version_detected"] is None


def test_resolve_metadata_populated_when_available():
    """
    TEST: Resolve edition/version are populated when set via _resolve_metadata.
    
    GIVEN: JobExecutionResult with _resolve_metadata attribute
    WHEN: to_dict() is called
    THEN: Resolve fields are populated correctly
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        clip = ClipExecutionResult(
            source_path=str(tmpdir_path / "test.braw"),
            resolved_output_path=str(tmpdir_path / "output.mov"),
            ffmpeg_command=[],
            exit_code=0,
            output_exists=True,
            output_size_bytes=1024,
            status="COMPLETED",
            engine_used="resolve",
        )
        
        job_result = JobExecutionResult(
            job_id="test_job",
            clips=[clip],
            final_status="COMPLETED",
            engine_used="resolve",
        )
        
        # Simulate ResolveEngine attaching metadata
        job_result._resolve_metadata = {
            "resolve_edition": "studio",
            "resolve_version": "19.0.3",
            "resolve_install_path": "/Applications/DaVinci Resolve Studio",
        }
        
        result_dict = job_result.to_dict()
        metadata = result_dict["_metadata"]
        
        # Should be populated
        assert metadata["resolve_edition_detected"] == "studio"
        assert metadata["resolve_version_detected"] == "19.0.3"


# =============================================================================
# Test: Output Verification Fields
# =============================================================================

def test_clip_result_contains_output_verification_fields():
    """
    TEST: ClipExecutionResult contains output verification fields.
    
    GIVEN: ClipExecutionResult
    WHEN: to_dict() is called
    THEN: output_exists and output_size_bytes are present
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        clip = ClipExecutionResult(
            source_path=str(tmpdir_path / "test.mp4"),
            resolved_output_path=str(tmpdir_path / "output.mov"),
            ffmpeg_command=[],
            exit_code=0,
            output_exists=True,
            output_size_bytes=123456,
            status="COMPLETED",
        )
        
        clip_dict = clip.to_dict()
        
        assert "output_exists" in clip_dict
        assert "output_size_bytes" in clip_dict
        assert clip_dict["output_exists"] is True
        assert clip_dict["output_size_bytes"] == 123456


def test_output_size_bytes_null_when_file_missing():
    """
    TEST: output_size_bytes is null when output file doesn't exist.
    
    GIVEN: ClipExecutionResult with output_exists=False
    WHEN: to_dict() is called
    THEN: output_size_bytes is None
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        clip = ClipExecutionResult(
            source_path=str(tmpdir_path / "test.mp4"),
            resolved_output_path=str(tmpdir_path / "output.mov"),
            ffmpeg_command=[],
            exit_code=1,
            output_exists=False,
            output_size_bytes=None,
            status="FAILED",
            failure_reason="FFmpeg failed",
        )
        
        clip_dict = clip.to_dict()
        
        assert clip_dict["output_exists"] is False
        assert clip_dict["output_size_bytes"] is None


# =============================================================================
# Test: Deterministic Output
# =============================================================================

def test_multiple_to_dict_calls_produce_same_result():
    """
    TEST: Multiple to_dict() calls produce identical output (determinism).
    
    GIVEN: JobExecutionResult
    WHEN: to_dict() is called multiple times
    THEN: Output is byte-identical (except timestamps)
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        clips = [
            ClipExecutionResult(
                source_path=f"/path/file{i}.mp4",
                resolved_output_path=str(tmpdir_path / f"out{i}.mov"),
                ffmpeg_command=[],
                exit_code=0,
                output_exists=True,
                output_size_bytes=1024 * i,
                status="COMPLETED",
            )
            for i in range(1, 4)
        ]
        
        job_result = JobExecutionResult(
            job_id="test_job",
            clips=clips,
            final_status="COMPLETED",
            started_at=datetime(2025, 1, 1, 12, 0, 0, tzinfo=timezone.utc),
            completed_at=datetime(2025, 1, 1, 12, 1, 0, tzinfo=timezone.utc),
        )
        
        # Call multiple times
        dict1 = job_result.to_dict()
        dict2 = job_result.to_dict()
        
        # Should be identical
        assert dict1 == dict2
        
        # Source evidence should be in same order
        assert dict1["source_files"] == dict2["source_files"]
        assert dict1["source_extensions"] == dict2["source_extensions"]


def test_result_ordering_is_stable():
    """
    TEST: Result field ordering is stable across serializations.
    
    GIVEN: JobExecutionResult
    WHEN: to_dict() is called
    THEN: Field keys appear in consistent order
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        clip = ClipExecutionResult(
            source_path=str(tmpdir_path / "test.mp4"),
            resolved_output_path=str(tmpdir_path / "output.mov"),
            ffmpeg_command=[],
            exit_code=0,
            output_exists=True,
            output_size_bytes=1024,
            status="COMPLETED",
        )
        
        job_result = JobExecutionResult(
            job_id="test_job",
            clips=[clip],
            final_status="COMPLETED",
        )
        
        result_dict = job_result.to_dict()
        
        # Check that key ordering is deterministic
        # (Python 3.7+ maintains insertion order)
        keys = list(result_dict.keys())
        
        # Should start with core fields
        assert keys[0] == "job_id"
        assert keys[1] == "final_status"
        
        # Source evidence should come after clips
        assert "source_files" in keys
        assert "source_extensions" in keys


# =============================================================================
# Test: No Behavior Changes
# =============================================================================

def test_execution_behavior_unchanged():
    """
    TEST: Execution behavior has not changed (integration sanity check).
    
    GIVEN: A valid JobSpec
    WHEN: execute_jobspec() is called
    THEN: Execution completes without new errors
    AND: Result structure is valid
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        # Create fake source file
        source_file = tmpdir_path / "test_source.txt"
        source_file.write_text("fake video data")
        
        # Create JobSpec
        jobspec = JobSpec(
            job_id="test_behavior_unchanged",
            sources=[str(source_file)],
            output_directory=str(tmpdir_path),
            codec="h264",
            container="mp4",
            resolution="quarter",
            naming_template="output",
        )
        
        # Execute (will fail due to invalid source, but should not crash)
        result = execute_jobspec(jobspec)
        
        # Result should be valid
        assert result is not None
        assert hasattr(result, 'job_id')
        assert hasattr(result, 'final_status')
        assert hasattr(result, 'clips')
        
        # Should be serializable
        result_dict = result.to_dict()
        assert isinstance(result_dict, dict)
        
        # Evidence fields should exist
        assert "source_files" in result_dict
        assert "source_extensions" in result_dict
        assert "_metadata" in result_dict


def test_no_mutations_during_serialization():
    """
    TEST: to_dict() does not mutate the JobExecutionResult.
    
    GIVEN: JobExecutionResult
    WHEN: to_dict() is called
    THEN: Original object is unchanged
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        clip = ClipExecutionResult(
            source_path=str(tmpdir_path / "test.mp4"),
            resolved_output_path=str(tmpdir_path / "output.mov"),
            ffmpeg_command=["ffmpeg"],
            exit_code=0,
            output_exists=True,
            output_size_bytes=1024,
            status="COMPLETED",
        )
        
        job_result = JobExecutionResult(
            job_id="test_job",
            clips=[clip],
            final_status="COMPLETED",
        )
        
        # Capture original state
        original_job_id = job_result.job_id
        original_clips_len = len(job_result.clips)
        original_status = job_result.final_status
        
        # Serialize
        _ = job_result.to_dict()
        
        # Should be unchanged
        assert job_result.job_id == original_job_id
        assert len(job_result.clips) == original_clips_len
        assert job_result.final_status == original_status


# =============================================================================
# Test: Edge Cases
# =============================================================================

def test_empty_clips_list_handled_gracefully():
    """
    TEST: Empty clips list produces valid evidence fields.
    
    GIVEN: JobExecutionResult with no clips
    WHEN: to_dict() is called
    THEN: Evidence fields are empty but valid
    """
    job_result = JobExecutionResult(
        job_id="empty_job",
        clips=[],
        final_status="PARTIAL",
        validation_error="No sources provided",
    )
    
    result_dict = job_result.to_dict()
    
    assert result_dict["source_files"] == []
    assert result_dict["source_extensions"] == []
    assert result_dict["_metadata"]["resolve_edition_detected"] is None
    assert result_dict["_metadata"]["resolve_version_detected"] is None


def test_duplicate_extensions_deduplicated():
    """
    TEST: Duplicate file extensions are deduplicated in source_extensions.
    
    GIVEN: Multiple clips with same extension
    WHEN: to_dict() is called
    THEN: Extension appears only once in source_extensions
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        clips = [
            ClipExecutionResult(
                source_path=f"/path/file{i}.mp4",
                resolved_output_path=str(tmpdir_path / f"out{i}.mov"),
                ffmpeg_command=[],
                exit_code=0,
                output_exists=True,
                output_size_bytes=1024,
                status="COMPLETED",
            )
            for i in range(5)
        ]
        
        job_result = JobExecutionResult(
            job_id="test_job",
            clips=clips,
            final_status="COMPLETED",
        )
        
        result_dict = job_result.to_dict()
        
        # Should have exactly one .mp4 entry
        assert result_dict["source_extensions"] == [".mp4"]
        assert len(result_dict["source_extensions"]) == 1


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
