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
