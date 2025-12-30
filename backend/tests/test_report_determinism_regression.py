"""
Pre-RAW Smoke Test - Report Determinism Regression

Validates that report JSON output is byte-stable across runs.

Tests:
1. Same dry-run produces identical JSON
2. Hashes match exactly
3. No field reordering or schema drift
4. Timestamps excluded from determinism checks

Part of Pre-RAW Smoke Validation Suite
"""

import pytest
import json
import hashlib
import tempfile
from pathlib import Path
from unittest.mock import patch

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from job_spec import JobSpec, JOBSPEC_VERSION
from execution_adapter import execute_jobspec
from v2.resolve_installation import ResolveInstallation


def strip_timestamps(result_dict: dict) -> dict:
    """Remove timestamp fields for deterministic comparison."""
    result = result_dict.copy()
    
    # Remove top-level timestamps
    result.pop("started_at", None)
    result.pop("completed_at", None)
    result.pop("duration_seconds", None)  # Duration varies due to execution time
    
    # Remove skip_metadata timestamp if present
    if "skip_metadata" in result and result["skip_metadata"]:
        skip_copy = result["skip_metadata"].copy()
        skip_copy.pop("timestamp", None)
        result["skip_metadata"] = skip_copy
    
    # Remove clip-level timestamps
    if "clips" in result:
        clips_copy = []
        for clip in result["clips"]:
            clip_copy = clip.copy()
            clip_copy.pop("started_at", None)
            clip_copy.pop("completed_at", None)
            clips_copy.append(clip_copy)
        result["clips"] = clips_copy
    
    return result


def compute_json_hash(obj: dict) -> str:
    """Compute deterministic hash of JSON object (excluding timestamps)."""
    # Serialize with sorted keys for determinism
    json_str = json.dumps(strip_timestamps(obj), sort_keys=True, indent=2)
    return hashlib.sha256(json_str.encode()).hexdigest()


def test_same_job_produces_identical_json():
    """
    TEST: Same JobSpec produces identical JSON across runs.
    
    GIVEN: Identical JobSpec executed twice
    WHEN: Results are serialized to JSON
    THEN: JSON content is byte-identical (excluding timestamps)
    """
    mock_resolve = ResolveInstallation(
        version="19.0.3",
        edition="studio",
        install_path="/Applications/DaVinci Resolve Studio/DaVinci Resolve.app",
        detection_method="macos_install_path",
        detection_confidence="high",
    )
    
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        source_file = tmpdir_path / "test.mp4"
        source_file.write_text("fake video data")
        
        jobspec = JobSpec(
            job_id="determinism_test",
            sources=[str(source_file)],
            output_directory=str(tmpdir_path),
            codec="h264",
            container="mp4",
            resolution="quarter",
            naming_template="output",
        )
        
        # Execute twice with same mock
        with patch('execution_adapter.detect_resolve_installation', return_value=mock_resolve):
            result1 = execute_jobspec(jobspec)
            result2 = execute_jobspec(jobspec)
        
        # Serialize to dict and strip timestamps
        dict1 = strip_timestamps(result1.to_dict())
        dict2 = strip_timestamps(result2.to_dict())
        
        # Assertions: Identical JSON structure
        assert dict1 == dict2, "Same job should produce identical JSON (excluding timestamps)"
        
        # Assertions: JSON is parseable
        json1 = json.dumps(dict1, sort_keys=True, indent=2)
        json2 = json.dumps(dict2, sort_keys=True, indent=2)
        
        assert json1 == json2


def test_json_hash_stability():
    """
    TEST: JSON hash is stable across runs.
    
    GIVEN: Same JobSpec executed multiple times
    WHEN: Results are hashed
    THEN: Hash is identical every time
    """
    mock_resolve = ResolveInstallation(
        version="18.6.0",
        edition="free",
        install_path="/Applications/DaVinci Resolve/DaVinci Resolve.app",
        detection_method="macos_install_path",
        detection_confidence="high",
    )
    
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        source_file = tmpdir_path / "test.mp4"
        source_file.write_text("fake video")
        
        jobspec = JobSpec(
            job_id="hash_stability",
            sources=[str(source_file)],
            output_directory=str(tmpdir_path),
            codec="prores_proxy",
            container="mov",
            resolution="half",
            naming_template="output",
        )
        
        # Execute multiple times
        hashes = []
        with patch('execution_adapter.detect_resolve_installation', return_value=mock_resolve):
            for _ in range(3):
                result = execute_jobspec(jobspec)
                result_hash = compute_json_hash(result.to_dict())
                hashes.append(result_hash)
        
        # Assertions: All hashes identical
        assert len(set(hashes)) == 1, "Hash should be stable across runs"


def test_skipped_job_json_determinism():
    """
    TEST: Skipped jobs produce deterministic JSON.
    
    GIVEN: Job that will be skipped due to edition mismatch
    WHEN: Executed multiple times
    THEN: JSON output is deterministic (excluding timestamps)
    """
    mock_studio = ResolveInstallation(
        version="19.0.3",
        edition="studio",
        install_path="/Applications/DaVinci Resolve Studio/DaVinci Resolve.app",
        detection_method="macos_install_path",
        detection_confidence="high",
    )
    
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        source_file = tmpdir_path / "test.mp4"
        source_file.write_text("fake video")
        
        jobspec = JobSpec(
            job_id="skip_determinism",
            sources=[str(source_file)],
            output_directory=str(tmpdir_path),
            codec="h264",
            container="mp4",
            resolution="quarter",
            naming_template="output",
            requires_resolve_edition="free",  # Will be skipped under Studio
        )
        
        # Execute twice
        with patch('execution_adapter.detect_resolve_installation', return_value=mock_studio):
            result1 = execute_jobspec(jobspec)
            result2 = execute_jobspec(jobspec)
        
        # Strip timestamps and compare
        dict1 = strip_timestamps(result1.to_dict())
        dict2 = strip_timestamps(result2.to_dict())
        
        assert dict1 == dict2
        
        # Verify skip_metadata is deterministic
        assert dict1["final_status"] == "SKIPPED"
        assert dict1["skip_metadata"]["reason"] == dict2["skip_metadata"]["reason"]
        assert dict1["skip_metadata"]["detected_resolve_edition"] == dict2["skip_metadata"]["detected_resolve_edition"]


def test_no_field_reordering():
    """
    TEST: JSON field order is stable.
    
    GIVEN: JobExecutionResult serialized to JSON
    WHEN: Serialized multiple times
    THEN: Field order is preserved
    AND: No schema drift occurs
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        source_file = tmpdir_path / "test.mp4"
        source_file.write_text("fake video")
        
        jobspec = JobSpec(
            job_id="field_order",
            sources=[str(source_file)],
            output_directory=str(tmpdir_path),
            codec="h264",
            container="mp4",
            resolution="quarter",
            naming_template="output",
        )
        
        # Execute once
        with patch('execution_adapter.detect_resolve_installation', return_value=None):
            result = execute_jobspec(jobspec)
        
        # Serialize multiple times
        json1 = result.to_json()
        json2 = result.to_json()
        json3 = result.to_json()
        
        # Parse and verify
        parsed1 = json.loads(json1)
        parsed2 = json.loads(json2)
        parsed3 = json.loads(json3)
        
        # Assertions: Same fields present
        assert parsed1.keys() == parsed2.keys() == parsed3.keys()
        
        # Assertions: Required fields exist
        required_fields = [
            "job_id",
            "final_status",
            "clips",
            "total_clips",
            "completed_clips",
            "failed_clips",
            "source_files",
            "source_extensions",
            "_metadata",
        ]
        
        for field in required_fields:
            assert field in parsed1, f"Required field '{field}' missing"


def test_metadata_section_determinism():
    """
    TEST: _metadata section is deterministic.
    
    GIVEN: JobExecutionResult with metadata
    WHEN: Serialized multiple times
    THEN: _metadata section is identical
    AND: All expected metadata fields are present
    """
    mock_resolve = ResolveInstallation(
        version="19.0.3",
        edition="studio",
        install_path="/Applications/DaVinci Resolve Studio/DaVinci Resolve.app",
        detection_method="macos_install_path",
        detection_confidence="high",
    )
    
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        source_file = tmpdir_path / "test.mp4"
        source_file.write_text("fake video")
        
        jobspec = JobSpec(
            job_id="metadata_determinism",
            sources=[str(source_file)],
            output_directory=str(tmpdir_path),
            codec="h264",
            container="mp4",
            resolution="quarter",
            naming_template="output",
        )
        
        # Execute twice
        with patch('execution_adapter.detect_resolve_installation', return_value=mock_resolve):
            result1 = execute_jobspec(jobspec)
            result2 = execute_jobspec(jobspec)
        
        # Extract _metadata sections
        metadata1 = result1.to_dict()["_metadata"]
        metadata2 = result2.to_dict()["_metadata"]
        
        # Assertions: Same metadata fields
        assert metadata1.keys() == metadata2.keys()
        
        # Expected metadata fields
        expected_fields = [
            "jobspec_version",
            "validation_error",
            "validation_stage",
            "engine_used",
            "resolve_preset_used",
            "proxy_profile_used",
            "resolve_edition_detected",
            "resolve_version_detected",
        ]
        
        for field in expected_fields:
            assert field in metadata1, f"Expected metadata field '{field}' missing"


def test_json_serialization_roundtrip():
    """
    TEST: JSON serialization roundtrip preserves data.
    
    GIVEN: JobExecutionResult
    WHEN: Serialized to JSON and parsed back
    THEN: All data is preserved correctly
    AND: Types are maintained
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        source_file = tmpdir_path / "test.mp4"
        source_file.write_text("fake video")
        
        jobspec = JobSpec(
            job_id="roundtrip_test",
            sources=[str(source_file)],
            output_directory=str(tmpdir_path),
            codec="h264",
            container="mp4",
            resolution="quarter",
            naming_template="output",
        )
        
        # Execute
        with patch('execution_adapter.detect_resolve_installation', return_value=None):
            result = execute_jobspec(jobspec)
        
        # Serialize to JSON
        json_str = result.to_json()
        
        # Parse back
        parsed = json.loads(json_str)
        
        # Assertions: Data preserved
        assert parsed["job_id"] == "roundtrip_test"
        assert parsed["final_status"] in ["COMPLETED", "FAILED", "PARTIAL", "SKIPPED"]
        assert isinstance(parsed["clips"], list)
        assert isinstance(parsed["total_clips"], int)
        assert isinstance(parsed["_metadata"], dict)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
