"""
Tests for V2 Watch Folder Runner - Manifest Hashing and Idempotency.

These tests verify:
1. SHA256 hash computation is deterministic
2. Manifest load/save roundtrips correctly
3. Idempotency rules are enforced (skip if already processed)
4. Hash change detection triggers reprocessing

Part of V2 Phase 1 (Option A: Reliable Proxy Engine)
"""

import json
import pytest
import tempfile
from datetime import datetime, timezone
from pathlib import Path

# Import the module under test
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from watch_folder_runner import (
    ProcessedManifest,
    compute_file_sha256,
    should_skip_jobspec,
    scan_for_jobspecs,
    MANIFEST_FILENAME,
    RESULT_SUFFIX,
)
from job_spec import JobSpec


# -----------------------------------------------------------------------------
# SHA256 Hash Tests
# -----------------------------------------------------------------------------

class TestComputeFileSha256:
    """Tests for the SHA256 file hashing function."""
    
    def test_hash_is_deterministic(self, tmp_path: Path):
        """Same content always produces same hash."""
        test_file = tmp_path / "test.json"
        content = '{"key": "value", "number": 42}'
        test_file.write_text(content)
        
        hash1 = compute_file_sha256(test_file)
        hash2 = compute_file_sha256(test_file)
        
        assert hash1 == hash2
        assert len(hash1) == 64  # SHA256 produces 64 hex chars
    
    def test_different_content_different_hash(self, tmp_path: Path):
        """Different content produces different hash."""
        file1 = tmp_path / "file1.json"
        file2 = tmp_path / "file2.json"
        
        file1.write_text('{"a": 1}')
        file2.write_text('{"a": 2}')
        
        hash1 = compute_file_sha256(file1)
        hash2 = compute_file_sha256(file2)
        
        assert hash1 != hash2
    
    def test_whitespace_changes_hash(self, tmp_path: Path):
        """Whitespace differences produce different hashes."""
        file1 = tmp_path / "file1.json"
        file2 = tmp_path / "file2.json"
        
        file1.write_text('{"a":1}')
        file2.write_text('{"a": 1}')  # Added space
        
        hash1 = compute_file_sha256(file1)
        hash2 = compute_file_sha256(file2)
        
        assert hash1 != hash2
    
    def test_empty_file_has_known_hash(self, tmp_path: Path):
        """Empty file has the known SHA256 of empty string."""
        test_file = tmp_path / "empty.json"
        test_file.write_text('')
        
        hash_result = compute_file_sha256(test_file)
        
        # SHA256 of empty string
        expected = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        assert hash_result == expected


# -----------------------------------------------------------------------------
# Manifest Tests
# -----------------------------------------------------------------------------

class TestProcessedManifest:
    """Tests for the ProcessedManifest class."""
    
    def test_empty_manifest_creation(self):
        """New manifest should be empty."""
        manifest = ProcessedManifest()
        
        assert manifest.entries == {}
        assert manifest.version == 1
    
    def test_load_nonexistent_file_returns_empty(self, tmp_path: Path):
        """Loading a non-existent file returns empty manifest."""
        manifest_path = tmp_path / "nonexistent.json"
        
        manifest = ProcessedManifest.load(manifest_path)
        
        assert manifest.entries == {}
    
    def test_save_and_load_roundtrip(self, tmp_path: Path):
        """Saved manifest can be loaded back correctly."""
        manifest_path = tmp_path / MANIFEST_FILENAME
        
        original = ProcessedManifest()
        original.record("/path/to/file.json", "abc123hash", "COMPLETED")
        original.record("/path/to/other.json", "def456hash", "FAILED")
        original.save(manifest_path)
        
        loaded = ProcessedManifest.load(manifest_path)
        
        assert len(loaded.entries) == 2
        assert "/path/to/file.json" in loaded.entries
        assert loaded.entries["/path/to/file.json"]["sha256"] == "abc123hash"
        assert loaded.entries["/path/to/file.json"]["result_status"] == "COMPLETED"
    
    def test_is_processed_returns_true_for_matching_hash(self):
        """is_processed returns True when path and hash match."""
        manifest = ProcessedManifest()
        manifest.record("/path/to/job.json", "exact_hash", "COMPLETED")
        
        result = manifest.is_processed("/path/to/job.json", "exact_hash")
        
        assert result is True
    
    def test_is_processed_returns_false_for_different_hash(self):
        """is_processed returns False when hash differs (file modified)."""
        manifest = ProcessedManifest()
        manifest.record("/path/to/job.json", "old_hash", "COMPLETED")
        
        result = manifest.is_processed("/path/to/job.json", "new_hash")
        
        assert result is False
    
    def test_is_processed_returns_false_for_unknown_path(self):
        """is_processed returns False for unknown paths."""
        manifest = ProcessedManifest()
        manifest.record("/path/to/known.json", "some_hash", "COMPLETED")
        
        result = manifest.is_processed("/path/to/unknown.json", "any_hash")
        
        assert result is False
    
    def test_record_adds_timestamp(self):
        """record() adds a processed_at timestamp."""
        manifest = ProcessedManifest()
        
        before = datetime.now(timezone.utc)
        manifest.record("/path/to/job.json", "hash", "COMPLETED")
        after = datetime.now(timezone.utc)
        
        entry = manifest.entries["/path/to/job.json"]
        assert "processed_at" in entry
        
        # Verify timestamp is valid ISO format
        ts = datetime.fromisoformat(entry["processed_at"])
        assert before <= ts <= after
    
    def test_corrupted_manifest_returns_empty(self, tmp_path: Path):
        """Corrupted manifest file returns empty manifest."""
        manifest_path = tmp_path / MANIFEST_FILENAME
        manifest_path.write_text("not valid json {{{{")
        
        manifest = ProcessedManifest.load(manifest_path)
        
        assert manifest.entries == {}


# -----------------------------------------------------------------------------
# Idempotency Tests
# -----------------------------------------------------------------------------

class TestShouldSkipJobspec:
    """Tests for the idempotency skip logic."""
    
    def test_skip_when_result_file_exists(self, tmp_path: Path):
        """Skip processing when .result.json already exists."""
        jobspec = tmp_path / "job.json"
        result_file = tmp_path / "job.result.json"
        
        jobspec.write_text('{"sources": []}')
        result_file.write_text('{"status": "COMPLETED"}')
        
        manifest = ProcessedManifest()
        
        should_skip, reason = should_skip_jobspec(jobspec, manifest)
        
        assert should_skip is True
        assert "result file already exists" in reason
    
    def test_skip_when_in_manifest_with_matching_hash(self, tmp_path: Path):
        """Skip processing when manifest has matching hash."""
        jobspec = tmp_path / "job.json"
        content = '{"sources": []}'
        jobspec.write_text(content)
        
        # Pre-compute the hash and add to manifest
        file_hash = compute_file_sha256(jobspec)
        manifest = ProcessedManifest()
        manifest.record(str(jobspec.absolute()), file_hash, "COMPLETED")
        
        should_skip, reason = should_skip_jobspec(jobspec, manifest)
        
        assert should_skip is True
        assert "manifest hash match" in reason
    
    def test_no_skip_for_new_jobspec(self, tmp_path: Path):
        """Don't skip processing for new JobSpec."""
        jobspec = tmp_path / "new_job.json"
        jobspec.write_text('{"sources": []}')
        
        manifest = ProcessedManifest()  # Empty manifest
        
        should_skip, reason = should_skip_jobspec(jobspec, manifest)
        
        assert should_skip is False
        assert reason is None
    
    def test_no_skip_when_hash_differs(self, tmp_path: Path):
        """Don't skip when file was modified (hash differs)."""
        jobspec = tmp_path / "job.json"
        
        # First version
        jobspec.write_text('{"sources": [], "version": 1}')
        old_hash = compute_file_sha256(jobspec)
        
        manifest = ProcessedManifest()
        manifest.record(str(jobspec.absolute()), old_hash, "COMPLETED")
        
        # Modify the file
        jobspec.write_text('{"sources": [], "version": 2}')
        
        should_skip, reason = should_skip_jobspec(jobspec, manifest)
        
        assert should_skip is False
        assert reason is None


# -----------------------------------------------------------------------------
# Scan Tests
# -----------------------------------------------------------------------------

class TestScanForJobspecs:
    """Tests for the folder scanning function."""
    
    def test_finds_json_files(self, tmp_path: Path):
        """Scan finds .json files in root directory."""
        (tmp_path / "job1.json").write_text("{}")
        (tmp_path / "job2.json").write_text("{}")
        (tmp_path / "job3.json").write_text("{}")
        
        result = scan_for_jobspecs(tmp_path)
        
        assert len(result) == 3
    
    def test_excludes_result_files(self, tmp_path: Path):
        """Scan excludes .result.json files."""
        (tmp_path / "job.json").write_text("{}")
        (tmp_path / "job.result.json").write_text("{}")
        
        result = scan_for_jobspecs(tmp_path)
        
        assert len(result) == 1
        assert result[0].name == "job.json"
    
    def test_excludes_manifest_file(self, tmp_path: Path):
        """Scan excludes the manifest file."""
        (tmp_path / "job.json").write_text("{}")
        (tmp_path / MANIFEST_FILENAME).write_text("{}")
        
        result = scan_for_jobspecs(tmp_path)
        
        assert len(result) == 1
        assert result[0].name == "job.json"
    
    def test_does_not_recurse_into_subdirectories(self, tmp_path: Path):
        """Scan only looks at root, not subdirectories."""
        (tmp_path / "job.json").write_text("{}")
        
        subdir = tmp_path / "processed"
        subdir.mkdir()
        (subdir / "old_job.json").write_text("{}")
        
        result = scan_for_jobspecs(tmp_path)
        
        assert len(result) == 1
        assert result[0].name == "job.json"
    
    def test_returns_sorted_order(self, tmp_path: Path):
        """Scan returns files in sorted order for determinism."""
        (tmp_path / "charlie.json").write_text("{}")
        (tmp_path / "alpha.json").write_text("{}")
        (tmp_path / "bravo.json").write_text("{}")
        
        result = scan_for_jobspecs(tmp_path)
        
        names = [p.name for p in result]
        assert names == ["alpha.json", "bravo.json", "charlie.json"]
    
    def test_empty_folder_returns_empty_list(self, tmp_path: Path):
        """Scan of empty folder returns empty list."""
        result = scan_for_jobspecs(tmp_path)
        
        assert result == []


# -----------------------------------------------------------------------------
# Integration-like Tests (without actual FFmpeg execution)
# -----------------------------------------------------------------------------

class TestManifestIntegration:
    """Integration tests for manifest usage patterns."""
    
    def test_full_workflow_simulation(self, tmp_path: Path):
        """Simulate a full workflow: scan, record, rescan."""
        # Setup: Create a watch folder with some jobs
        watch_folder = tmp_path / "watch"
        watch_folder.mkdir()
        
        job1 = watch_folder / "job1.json"
        job2 = watch_folder / "job2.json"
        job1.write_text('{"id": 1}')
        job2.write_text('{"id": 2}')
        
        manifest_path = watch_folder / MANIFEST_FILENAME
        
        # First scan: find both jobs
        manifest = ProcessedManifest.load(manifest_path)
        jobs = scan_for_jobspecs(watch_folder)
        assert len(jobs) == 2
        
        # Simulate processing job1
        hash1 = compute_file_sha256(job1)
        manifest.record(str(job1.absolute()), hash1, "COMPLETED")
        manifest.save(manifest_path)
        
        # Create result file for job1
        (watch_folder / "job1.result.json").write_text('{"status": "COMPLETED"}')
        
        # Second scan: job1 should be skipped
        manifest = ProcessedManifest.load(manifest_path)
        
        skip1, _ = should_skip_jobspec(job1, manifest)
        skip2, _ = should_skip_jobspec(job2, manifest)
        
        assert skip1 is True  # Has result file
        assert skip2 is False  # Not yet processed
        
        # Simulate modifying job1 (even with result file, skip due to result)
        job1.write_text('{"id": 1, "modified": true}')
        
        skip1_after_mod, reason = should_skip_jobspec(job1, manifest)
        assert skip1_after_mod is True  # Still skipped because result file exists
        assert "result file" in reason


# -----------------------------------------------------------------------------
# Engine Routing Integration Tests
# -----------------------------------------------------------------------------

class TestEngineRoutingIntegration:
    """Integration tests for automatic engine selection via capability routing."""
    
    def test_raw_jobspec_routes_to_resolve_engine(self, tmp_path: Path):
        """
        RAW JobSpec should:
        1. Be routed to Resolve engine
        2. Have engine_used='resolve' in result metadata
        3. Fail explicitly if Resolve unavailable (expected on CI)
        """
        from v2.source_capabilities import ExecutionEngine
        from headless_execute import _determine_job_engine
        from job_spec import JobSpec
        
        # Create a RAW source file (just needs to exist for validation)
        raw_source = tmp_path / "camera_raw.r3d"
        raw_source.write_bytes(b"fake r3d data")
        
        # Create a JobSpec with RAW source
        job_spec = JobSpec(
            sources=[str(raw_source)],
            output_directory=str(tmp_path / "output"),
            codec="prores_proxy",
            container="mov",
            resolution="half",
            naming_template="{source_name}_proxy",
        )
        
        # Test engine routing
        engine_name, engine_error = _determine_job_engine(job_spec)
        
        # Should route to Resolve (not FFmpeg)
        assert engine_name == "resolve", f"Expected 'resolve', got '{engine_name}'"
        assert engine_error is None, f"Unexpected error: {engine_error}"
    
    def test_prores_jobspec_routes_to_ffmpeg_engine(self, tmp_path: Path):
        """
        ProRes JobSpec should route to FFmpeg engine.
        """
        from headless_execute import _determine_job_engine
        from job_spec import JobSpec
        
        # Create a standard ProRes source file
        prores_source = tmp_path / "footage.mov"
        prores_source.write_bytes(b"fake mov data")
        
        # Create a JobSpec with ProRes source
        job_spec = JobSpec(
            sources=[str(prores_source)],
            output_directory=str(tmp_path / "output"),
            codec="h264",
            container="mp4",
            resolution="half",
            naming_template="{source_name}_proxy",
        )
        
        # Test engine routing
        engine_name, engine_error = _determine_job_engine(job_spec)
        
        # Should route to FFmpeg
        assert engine_name == "ffmpeg", f"Expected 'ffmpeg', got '{engine_name}'"
        assert engine_error is None
    
    def test_mixed_job_rejected_with_clear_error(self, tmp_path: Path):
        """
        Mixed jobs (RAW + non-RAW sources) should be rejected with clear explanation.
        """
        from headless_execute import _determine_job_engine
        from job_spec import JobSpec
        
        # Create both RAW and standard sources
        raw_source = tmp_path / "camera.r3d"
        raw_source.write_bytes(b"fake r3d")
        
        prores_source = tmp_path / "footage.mov"
        prores_source.write_bytes(b"fake mov")
        
        # Create a JobSpec with mixed sources
        job_spec = JobSpec(
            sources=[str(raw_source), str(prores_source)],
            output_directory=str(tmp_path / "output"),
            codec="prores_proxy",
            container="mov",
            resolution="half",
            naming_template="{source_name}_proxy",
        )
        
        # Test engine routing - should fail
        engine_name, engine_error = _determine_job_engine(job_spec)
        
        # Should be rejected with clear error
        assert engine_name is None
        assert engine_error is not None
        assert "Mixed" in engine_error or "mixed" in engine_error
        assert "FFmpeg" in engine_error or "Resolve" in engine_error
    
    def test_raw_jobspec_result_contains_engine_metadata(self, tmp_path: Path):
        """
        When RAW JobSpec is executed (even if it fails due to Resolve unavailable),
        the result should contain engine metadata.
        """
        from job_spec import JobSpec
        from headless_execute import execute_multi_job_spec
        
        # Create a RAW source file
        raw_source = tmp_path / "camera_raw.braw"
        raw_source.write_bytes(b"fake braw data")
        
        # Create output directory
        output_dir = tmp_path / "output"
        output_dir.mkdir()
        
        # Create a JobSpec with RAW source (requires resolve_preset per V2 contract)
        job_spec = JobSpec(
            sources=[str(raw_source)],
            output_directory=str(output_dir),
            codec="prores_proxy",
            container="mov",
            resolution="half",
            naming_template="{source_name}_proxy",
            resolve_preset="ProRes 422 Proxy",  # V2: Required for Resolve jobs
        )
        
        # Execute - will fail because Resolve is not available, but that's expected
        result = execute_multi_job_spec(job_spec)
        
        # The result should have engine_used set
        assert result.engine_used == "resolve"
        
        # The result should indicate failure due to Resolve unavailable
        # (since Resolve scripting API is not installed on CI)
        if result.final_status == "FAILED":
            # This is expected - Resolve is not available
            # The validation_error or clips may contain failure info
            # Either we have clips with failure, or validation_error about Resolve unavailable
            if len(result.clips) > 0:
                clip = result.clips[0]
                assert clip.status == "FAILED"
                assert clip.failure_reason is not None
                assert len(clip.failure_reason) > 0
            else:
                # No clips means validation/API failure before execution
                assert result.validation_error is not None
                assert "Resolve" in result.validation_error or "resolve" in result.validation_error.lower()
    
    def test_ffmpeg_jobspec_result_contains_engine_metadata(self, tmp_path: Path):
        """
        FFmpeg JobSpec result should contain engine_used='ffmpeg' in metadata.
        """
        from job_spec import JobSpec
        from headless_execute import execute_multi_job_spec
        
        # Create a standard source file
        source = tmp_path / "footage.mp4"
        source.write_bytes(b"fake mp4 data")
        
        # Create output directory
        output_dir = tmp_path / "output"
        output_dir.mkdir()
        
        # Create a JobSpec
        job_spec = JobSpec(
            sources=[str(source)],
            output_directory=str(output_dir),
            codec="h264",
            container="mp4",
            resolution="half",
            naming_template="{source_name}_proxy",
        )
        
        # Execute - may fail due to FFmpeg not recognizing fake data, but engine should be set
        result = execute_multi_job_spec(job_spec)
        
        # The result should have engine_used set to ffmpeg
        assert result.engine_used == "ffmpeg"
        
        # Verify metadata is serialized correctly
        result_dict = result.to_dict()
        assert result_dict["_metadata"]["engine_used"] == "ffmpeg"

# -----------------------------------------------------------------------------
# V1 Image Sequence Rejection Tests
# -----------------------------------------------------------------------------

class TestImageSequenceRejection:
    """Tests for V1 image sequence rejection behavior."""
    
    def test_exr_sequence_rejected(self, tmp_path: Path):
        """EXR files should be rejected in V1 (still image format)."""
        from headless_execute import _determine_job_engine
        
        source = tmp_path / "render_0001.exr"
        source.write_bytes(b"fake exr data")
        output_dir = tmp_path / "output"
        output_dir.mkdir()
        
        job_spec = JobSpec(
            sources=[str(source)],
            output_directory=str(output_dir),
            codec="prores_proxy",
            container="mov",
            resolution="full",
            naming_template="{source_name}_proxy",
        )
        
        engine_name, error = _determine_job_engine(job_spec)
        
        assert engine_name is None
        assert error is not None
        assert "Image sequences" in error
        assert "not supported in V1" in error
    
    def test_dpx_sequence_rejected(self, tmp_path: Path):
        """DPX files should be rejected in V1 (cinema still format)."""
        from headless_execute import _determine_job_engine
        
        source = tmp_path / "shot_0100.dpx"
        source.write_bytes(b"fake dpx data")
        output_dir = tmp_path / "output"
        output_dir.mkdir()
        
        job_spec = JobSpec(
            sources=[str(source)],
            output_directory=str(output_dir),
            codec="prores_proxy",
            container="mov",
            resolution="full",
            naming_template="{source_name}_proxy",
        )
        
        engine_name, error = _determine_job_engine(job_spec)
        
        assert engine_name is None
        assert error is not None
        assert "Image sequences" in error
    
    def test_tiff_sequence_rejected(self, tmp_path: Path):
        """TIFF files should be rejected in V1 (still image format)."""
        from headless_execute import _determine_job_engine
        
        source = tmp_path / "frame_001.tiff"
        source.write_bytes(b"fake tiff data")
        output_dir = tmp_path / "output"
        output_dir.mkdir()
        
        job_spec = JobSpec(
            sources=[str(source)],
            output_directory=str(output_dir),
            codec="prores_proxy",
            container="mov",
            resolution="full",
            naming_template="{source_name}_proxy",
        )
        
        engine_name, error = _determine_job_engine(job_spec)
        
        assert engine_name is None
        assert error is not None
        assert "Image sequences" in error

# -----------------------------------------------------------------------------
# RAW Camera Folder Detection Tests
# -----------------------------------------------------------------------------

class TestRawCameraFolderDetection:
    """Tests for RAW camera folder detection and routing."""
    
    def test_red_camera_folder_routes_to_resolve(self, tmp_path: Path):
        """RED camera folder with .R3D files should route to Resolve."""
        from headless_execute import _determine_job_engine
        
        # Create RED camera folder structure
        red_folder = tmp_path / "A001_C001_0101AB"
        red_folder.mkdir()
        (red_folder / "A001_C001_0101AB_001.R3D").write_bytes(b"fake RED data")
        (red_folder / "A001_C001_0101AB_002.R3D").write_bytes(b"fake RED data")
        
        output_dir = tmp_path / "output"
        output_dir.mkdir()
        
        job_spec = JobSpec(
            sources=[str(red_folder)],
            output_directory=str(output_dir),
            codec="prores_proxy",
            container="mov",
            resolution="full",
            naming_template="{source_name}_proxy",
        )
        
        engine_name, error = _determine_job_engine(job_spec)
        
        assert engine_name == "resolve", f"RED folder should route to Resolve, got: {engine_name}, error: {error}"
        assert error is None
    
    def test_arri_camera_folder_routes_to_resolve(self, tmp_path: Path):
        """ARRI camera folder with .arx files should route to Resolve."""
        from headless_execute import _determine_job_engine
        
        # Create ARRI camera folder structure
        arri_folder = tmp_path / "S001C001_210101_A001"
        arri_folder.mkdir()
        (arri_folder / "S001C001_210101_A001.0001.arx").write_bytes(b"fake ARRI data")
        (arri_folder / "S001C001_210101_A001.0002.arx").write_bytes(b"fake ARRI data")
        
        output_dir = tmp_path / "output"
        output_dir.mkdir()
        
        job_spec = JobSpec(
            sources=[str(arri_folder)],
            output_directory=str(output_dir),
            codec="prores_proxy",
            container="mov",
            resolution="full",
            naming_template="{source_name}_proxy",
        )
        
        engine_name, error = _determine_job_engine(job_spec)
        
        assert engine_name == "resolve", f"ARRI folder should route to Resolve, got: {engine_name}, error: {error}"
        assert error is None
    
    def test_nikon_nraw_folder_routes_to_resolve(self, tmp_path: Path):
        """Nikon N-RAW folder with .nev files should route to Resolve."""
        from headless_execute import _determine_job_engine
        
        # Create Nikon N-RAW folder structure
        nikon_folder = tmp_path / "NIKON_RAW"
        nikon_folder.mkdir()
        (nikon_folder / "DSC_0001.NEV").write_bytes(b"fake Nikon N-RAW data")
        (nikon_folder / "DSC_0002.NEV").write_bytes(b"fake Nikon N-RAW data")
        
        output_dir = tmp_path / "output"
        output_dir.mkdir()
        
        job_spec = JobSpec(
            sources=[str(nikon_folder)],
            output_directory=str(output_dir),
            codec="prores_proxy",
            container="mov",
            resolution="full",
            naming_template="{source_name}_proxy",
        )
        
        engine_name, error = _determine_job_engine(job_spec)
        
        assert engine_name == "resolve", f"Nikon N-RAW folder should route to Resolve, got: {engine_name}, error: {error}"
        assert error is None
    
    def test_braw_folder_routes_to_resolve(self, tmp_path: Path):
        """Blackmagic RAW folder with .braw files should route to Resolve."""
        from headless_execute import _determine_job_engine
        
        # Create BRAW folder structure
        braw_folder = tmp_path / "BMPCC_001"
        braw_folder.mkdir()
        (braw_folder / "A001_0101_001.braw").write_bytes(b"fake BRAW data")
        (braw_folder / "A001_0101_002.braw").write_bytes(b"fake BRAW data")
        
        output_dir = tmp_path / "output"
        output_dir.mkdir()
        
        job_spec = JobSpec(
            sources=[str(braw_folder)],
            output_directory=str(output_dir),
            codec="prores_proxy",
            container="mov",
            resolution="full",
            naming_template="{source_name}_proxy",
        )
        
        engine_name, error = _determine_job_engine(job_spec)
        
        assert engine_name == "resolve", f"BRAW folder should route to Resolve, got: {engine_name}, error: {error}"
        assert error is None
    
    def test_exr_sequence_folder_still_rejected(self, tmp_path: Path):
        """EXR sequence folder should still be rejected (not RAW camera)."""
        from headless_execute import _determine_job_engine
        
        # Create EXR sequence folder (still sequence, not video)
        exr_folder = tmp_path / "render_sequence"
        exr_folder.mkdir()
        (exr_folder / "frame_0001.exr").write_bytes(b"fake EXR data")
        (exr_folder / "frame_0002.exr").write_bytes(b"fake EXR data")
        (exr_folder / "frame_0003.exr").write_bytes(b"fake EXR data")
        
        output_dir = tmp_path / "output"
        output_dir.mkdir()
        
        job_spec = JobSpec(
            sources=[str(exr_folder)],
            output_directory=str(output_dir),
            codec="prores_proxy",
            container="mov",
            resolution="full",
            naming_template="{source_name}_proxy",
        )
        
        engine_name, error = _determine_job_engine(job_spec)
        
        assert engine_name is None, "EXR sequence should be rejected"
        assert error is not None
        assert "Image sequences" in error
