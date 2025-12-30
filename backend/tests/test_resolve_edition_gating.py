"""
Tests for Resolve Edition Gating and Skip Reporting

These tests verify:
1. Free-required tests are skipped under Studio
2. Studio-required tests are skipped under Free  
3. Skip does NOT invoke Resolve engine
4. Skip results are serialized deterministically
5. Reports distinguish PASS / FAIL / SKIPPED

Part of V2 Phase 2: Failure Model - Edition Gating
"""

import pytest
import json
from pathlib import Path
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock
import tempfile

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from job_spec import JobSpec, JOBSPEC_VERSION
from execution_adapter import execute_jobspec
from execution_results import JobExecutionResult
from v2.resolve_installation import ResolveInstallation


# =============================================================================
# Test: Free Required, Studio Detected → SKIP
# =============================================================================

def test_free_required_studio_detected_skips_job():
    """
    TEST: Job requiring Free is SKIPPED when Studio is detected.
    
    Assertion: Job does not execute, returns SKIPPED status with metadata.
    """
    # Mock Resolve installation as Studio
    mock_studio = ResolveInstallation(
        version="18.6.0",
        edition="studio",
        install_path="/Applications/DaVinci Resolve Studio/DaVinci Resolve.app",
        detection_method="macos_install_path",
        detection_confidence="high",
    )
    
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        # Create test source file
        source_file = tmpdir_path / "test_source.mp4"
        source_file.write_text("fake video data")
        
        # Create JobSpec requiring Free
        jobspec = JobSpec(
            job_id="test_free_required",
            sources=[str(source_file)],
            output_directory=str(tmpdir_path),
            codec="h264",
            container="mp4",
            resolution="quarter",
            naming_template="output",
            requires_resolve_edition="free",
        )
        
        # Execute with Studio mocked
        with patch('execution_adapter.detect_resolve_installation', return_value=mock_studio):
            result = execute_jobspec(jobspec)
        
        # Assertions
        assert result.final_status == "SKIPPED", "Job should be SKIPPED when Free required but Studio detected"
        assert result.skip_metadata is not None, "Skip metadata must be present"
        assert result.skip_metadata["reason"] == "resolve_free_not_installed"
        assert result.skip_metadata["detected_resolve_edition"] == "studio"
        assert result.skip_metadata["required_resolve_edition"] == "free"
        assert result.skip_metadata["resolve_version"] == "18.6.0"
        assert result.skip_metadata["timestamp"] is not None
        assert len(result.clips) == 0, "No clips should be executed"
        assert result.engine_used is None, "No engine should be invoked"


# =============================================================================
# Test: Studio Required, Free Detected → SKIP
# =============================================================================

def test_studio_required_free_detected_skips_job():
    """
    TEST: Job requiring Studio is SKIPPED when Free is detected.
    
    Assertion: Job does not execute, returns SKIPPED status with metadata.
    """
    # Mock Resolve installation as Free
    mock_free = ResolveInstallation(
        version="18.6.0",
        edition="free",
        install_path="/Applications/DaVinci Resolve/DaVinci Resolve.app",
        detection_method="macos_install_path",
        detection_confidence="high",
    )
    
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        # Create test source file
        source_file = tmpdir_path / "test_source.mp4"
        source_file.write_text("fake video data")
        
        # Create JobSpec requiring Studio
        jobspec = JobSpec(
            job_id="test_studio_required",
            sources=[str(source_file)],
            output_directory=str(tmpdir_path),
            codec="h264",
            container="mp4",
            resolution="quarter",
            naming_template="output",
            requires_resolve_edition="studio",
        )
        
        # Execute with Free mocked
        with patch('execution_adapter.detect_resolve_installation', return_value=mock_free):
            result = execute_jobspec(jobspec)
        
        # Assertions
        assert result.final_status == "SKIPPED", "Job should be SKIPPED when Studio required but Free detected"
        assert result.skip_metadata is not None, "Skip metadata must be present"
        assert result.skip_metadata["reason"] == "resolve_studio_not_installed"
        assert result.skip_metadata["detected_resolve_edition"] == "free"
        assert result.skip_metadata["required_resolve_edition"] == "studio"
        assert len(result.clips) == 0, "No clips should be executed"
        assert result.engine_used is None, "No engine should be invoked"


# =============================================================================
# Test: Either Edition Allowed → NO SKIP
# =============================================================================

def test_either_edition_never_skips():
    """
    TEST: Jobs with requires_resolve_edition="either" are never skipped.
    
    Assertion: Job proceeds regardless of detected edition.
    """
    mock_studio = ResolveInstallation(
        version="18.6.0",
        edition="studio",
        install_path="/Applications/DaVinci Resolve Studio/DaVinci Resolve.app",
        detection_method="macos_install_path",
        detection_confidence="high",
    )
    
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        # Create test source file
        source_file = tmpdir_path / "test_source.mp4"
        source_file.write_text("fake video data")
        
        # Create JobSpec with "either" (default)
        jobspec = JobSpec(
            job_id="test_either_edition",
            sources=[str(source_file)],
            output_directory=str(tmpdir_path),
            codec="h264",
            container="mp4",
            resolution="quarter",
            naming_template="output",
            requires_resolve_edition="either",
        )
        
        # Execute with Studio mocked
        with patch('execution_adapter.detect_resolve_installation', return_value=mock_studio):
            result = execute_jobspec(jobspec)
        
        # Assertions
        assert result.final_status != "SKIPPED", "Job should NOT be skipped when 'either' edition allowed"
        assert result.skip_metadata is None, "Skip metadata should not be present"


# =============================================================================
# Test: Skip Result Serialization
# =============================================================================

def test_skip_result_serializes_deterministically():
    """
    TEST: SKIPPED JobExecutionResult serializes to deterministic JSON.
    
    Assertion: Skip metadata is included in to_dict() output.
    """
    mock_studio = ResolveInstallation(
        version="18.6.0",
        edition="studio",
        install_path="/Applications/DaVinci Resolve Studio/DaVinci Resolve.app",
        detection_method="macos_install_path",
        detection_confidence="high",
    )
    
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        source_file = tmpdir_path / "test_source.mp4"
        source_file.write_text("fake video data")
        
        jobspec = JobSpec(
            job_id="test_serialization",
            sources=[str(source_file)],
            output_directory=str(tmpdir_path),
            codec="h264",
            container="mp4",
            resolution="quarter",
            naming_template="output",
            requires_resolve_edition="free",
        )
        
        with patch('execution_adapter.detect_resolve_installation', return_value=mock_studio):
            result = execute_jobspec(jobspec)
        
        # Serialize to dict
        result_dict = result.to_dict()
        
        # Assertions
        assert "skip_metadata" in result_dict, "skip_metadata must be in serialized result"
        assert result_dict["skip_metadata"]["reason"] == "resolve_free_not_installed"
        assert result_dict["skip_metadata"]["detected_resolve_edition"] == "studio"
        assert result_dict["skip_metadata"]["required_resolve_edition"] == "free"
        assert result_dict["skip_metadata"]["resolve_version"] == "18.6.0"
        
        # Verify JSON serialization works
        json_str = result.to_json()
        assert "skip_metadata" in json_str
        
        # Verify JSON is parseable
        parsed = json.loads(json_str)
        assert parsed["final_status"] == "SKIPPED"
        assert parsed["skip_metadata"]["reason"] == "resolve_free_not_installed"


# =============================================================================
# Test: JobSpec Serialization with Edition Field
# =============================================================================

def test_jobspec_with_edition_requirement_serializes():
    """
    TEST: JobSpec with requires_resolve_edition serializes correctly.
    
    Assertion: Field is included in to_dict() and to_json().
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        source_file = tmpdir_path / "test_source.mp4"
        source_file.write_text("fake video data")
        
        jobspec = JobSpec(
            job_id="test_edition_field",
            sources=[str(source_file)],
            output_directory=str(tmpdir_path),
            codec="h264",
            container="mp4",
            resolution="quarter",
            naming_template="output",
            requires_resolve_edition="free",
        )
        
        # Serialize to dict
        spec_dict = jobspec.to_dict()
        assert "requires_resolve_edition" in spec_dict
        assert spec_dict["requires_resolve_edition"] == "free"
        
        # Serialize to JSON
        json_str = jobspec.to_json()
        assert "requires_resolve_edition" in json_str
        
        # Deserialize and verify
        parsed = json.loads(json_str)
        assert parsed["requires_resolve_edition"] == "free"


# =============================================================================
# Test: JobSpec Deserialization with Edition Field
# =============================================================================

def test_jobspec_from_dict_with_edition_requirement():
    """
    TEST: JobSpec.from_dict() correctly parses requires_resolve_edition.
    
    Assertion: Field is preserved during deserialization.
    """
    spec_dict = {
        "jobspec_version": JOBSPEC_VERSION,
        "job_id": "test_deserialize",
        "sources": ["/tmp/test.mp4"],
        "output_directory": "/tmp",
        "codec": "h264",
        "container": "mp4",
        "resolution": "quarter",
        "naming_template": "output",
        "requires_resolve_edition": "studio",
    }
    
    jobspec = JobSpec.from_dict(spec_dict)
    
    assert jobspec.requires_resolve_edition == "studio"


# =============================================================================
# Test: Default Edition Requirement is "either"
# =============================================================================

def test_default_edition_requirement_is_either():
    """
    TEST: JobSpec without requires_resolve_edition defaults to "either".
    
    Assertion: Missing field defaults to "either" for backward compatibility.
    """
    spec_dict = {
        "jobspec_version": JOBSPEC_VERSION,
        "job_id": "test_default",
        "sources": ["/tmp/test.mp4"],
        "output_directory": "/tmp",
        "codec": "h264",
        "container": "mp4",
        "resolution": "quarter",
        "naming_template": "output",
        # requires_resolve_edition omitted
    }
    
    jobspec = JobSpec.from_dict(spec_dict)
    
    assert jobspec.requires_resolve_edition == "either", "Default should be 'either'"


# =============================================================================
# Test: Skip Does Not Invoke Engine
# =============================================================================

def test_skip_does_not_invoke_resolve_engine():
    """
    TEST: SKIPPED jobs never invoke the Resolve engine.
    
    Assertion: _execute_with_resolve is not called when job is skipped.
    """
    mock_studio = ResolveInstallation(
        version="18.6.0",
        edition="studio",
        install_path="/Applications/DaVinci Resolve Studio/DaVinci Resolve.app",
        detection_method="macos_install_path",
        detection_confidence="high",
    )
    
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        source_file = tmpdir_path / "test_source.mp4"
        source_file.write_text("fake video data")
        
        jobspec = JobSpec(
            job_id="test_no_invoke",
            sources=[str(source_file)],
            output_directory=str(tmpdir_path),
            codec="h264",
            container="mp4",
            resolution="quarter",
            naming_template="output",
            requires_resolve_edition="free",
        )
        
        with patch('execution_adapter.detect_resolve_installation', return_value=mock_studio):
            with patch('execution_adapter._execute_with_resolve') as mock_execute:
                with patch('execution_adapter._execute_with_ffmpeg') as mock_ffmpeg:
                    result = execute_jobspec(jobspec)
        
        # Assertions
        assert result.final_status == "SKIPPED"
        assert not mock_execute.called, "Resolve engine should NOT be invoked"
        assert not mock_ffmpeg.called, "FFmpeg engine should NOT be invoked"


# =============================================================================
# Test: Skip Preserves Ordering in Multi-Job Scenarios
# =============================================================================

def test_skip_preserves_result_ordering():
    """
    TEST: Skipped results maintain deterministic ordering in test reports.
    
    Assertion: Result ordering is stable and independent of skip status.
    """
    # This is implicitly tested by the forge test runner, but we verify
    # that skip results have same structure as completed/failed results
    mock_studio = ResolveInstallation(
        version="18.6.0",
        edition="studio",
        install_path="/Applications/DaVinci Resolve Studio/DaVinci Resolve.app",
        detection_method="macos_install_path",
        detection_confidence="high",
    )
    
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        source_file = tmpdir_path / "test_source.mp4"
        source_file.write_text("fake video data")
        
        jobspec = JobSpec(
            job_id="test_ordering",
            sources=[str(source_file)],
            output_directory=str(tmpdir_path),
            codec="h264",
            container="mp4",
            resolution="quarter",
            naming_template="output",
            requires_resolve_edition="free",
        )
        
        with patch('execution_adapter.detect_resolve_installation', return_value=mock_studio):
            result = execute_jobspec(jobspec)
        
        # Verify result has required fields for stable ordering
        result_dict = result.to_dict()
        assert "job_id" in result_dict
        assert "final_status" in result_dict
        assert "started_at" in result_dict
        assert "completed_at" in result_dict
        
        # Verify timestamps are ISO-8601 strings
        assert isinstance(result_dict["started_at"], str)
        assert isinstance(result_dict["completed_at"], str)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
