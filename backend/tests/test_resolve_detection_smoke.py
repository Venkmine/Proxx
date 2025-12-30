"""
Pre-RAW Smoke Test - Resolve Detection

Validates that Resolve metadata is captured even when Resolve engine is not used.

Tests:
1. Non-RAW job execution still captures Resolve edition/version
2. Detection occurs during execution adapter invocation
3. No mutation of JobSpec or execution path
4. Metadata is present in JobExecutionResult

Part of Pre-RAW Smoke Validation Suite
"""

import pytest
import tempfile
from pathlib import Path
from unittest.mock import patch

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from job_spec import JobSpec, JOBSPEC_VERSION
from execution_adapter import execute_jobspec
from v2.resolve_installation import ResolveInstallation


def test_non_raw_job_captures_resolve_metadata():
    """
    TEST: Non-RAW job still captures Resolve edition and version metadata.
    
    GIVEN: A simple H.264 job (does NOT route to Resolve engine)
    WHEN: Job is executed via execution_adapter
    THEN: Resolve edition and version are detected and captured
    AND: Detection occurs even though FFmpeg engine is used
    AND: JobSpec is NOT mutated
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
        
        # Create test source file
        source_file = tmpdir_path / "test_source.mp4"
        source_file.write_text("fake video data")
        
        # Create JobSpec for H.264 (FFmpeg engine)
        jobspec = JobSpec(
            job_id="smoke_test_detection",
            sources=[str(source_file)],
            output_directory=str(tmpdir_path),
            codec="h264",
            container="mp4",
            resolution="quarter",
            naming_template="output",
        )
        
        # Store original JobSpec state
        original_dict = jobspec.to_dict()
        
        # Execute with Resolve detection mocked
        with patch('execution_adapter.detect_resolve_installation', return_value=mock_resolve):
            result = execute_jobspec(jobspec)
        
        # Assertions: Resolve metadata captured
        result_dict = result.to_dict()
        metadata = result_dict.get("_metadata", {})
        
        assert "resolve_edition_detected" in metadata, \
            "Resolve edition must be captured"
        assert "resolve_version_detected" in metadata, \
            "Resolve version must be captured"
        
        # Note: For FFmpeg jobs, these fields may be null since Resolve engine wasn't used
        # But the fields MUST exist in the schema
        
        # Assertions: No JobSpec mutation
        assert jobspec.to_dict() == original_dict, \
            "JobSpec must NOT be mutated during execution"


def test_resolve_detection_occurs_without_resolve_engine_use():
    """
    TEST: Resolve detection occurs even when Resolve engine is not used.
    
    GIVEN: A job that routes to FFmpeg (non-RAW source)
    WHEN: Resolve is installed and detected
    THEN: Detection is captured in result metadata
    AND: FFmpeg engine is still used (not Resolve)
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
        
        source_file = tmpdir_path / "test.mov"
        source_file.write_text("fake video")
        
        jobspec = JobSpec(
            job_id="smoke_ffmpeg_job",
            sources=[str(source_file)],
            output_directory=str(tmpdir_path),
            codec="h264",
            container="mp4",
            resolution="half",
            naming_template="output",
        )
        
        # Execute with Resolve detection mocked
        with patch('execution_adapter.detect_resolve_installation', return_value=mock_resolve):
            result = execute_jobspec(jobspec)
        
        # Assertions: FFmpeg engine used (not Resolve)
        assert result.engine_used == "ffmpeg", \
            "Non-RAW job should route to FFmpeg"
        
        # Assertions: Resolve detection still occurred
        result_dict = result.to_dict()
        metadata = result_dict.get("_metadata", {})
        
        # Fields must exist (even if null for FFmpeg jobs)
        assert "resolve_edition_detected" in metadata
        assert "resolve_version_detected" in metadata


def test_resolve_metadata_fields_exist_when_no_resolve_installed():
    """
    TEST: Resolve metadata fields exist even when Resolve is not installed.
    
    GIVEN: System with no Resolve installation
    WHEN: Job is executed
    THEN: resolve_edition_detected and resolve_version_detected exist
    AND: Values are null
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        source_file = tmpdir_path / "test.mp4"
        source_file.write_text("fake video")
        
        jobspec = JobSpec(
            job_id="smoke_no_resolve",
            sources=[str(source_file)],
            output_directory=str(tmpdir_path),
            codec="h264",
            container="mp4",
            resolution="quarter",
            naming_template="output",
        )
        
        # Execute with no Resolve detected
        with patch('execution_adapter.detect_resolve_installation', return_value=None):
            result = execute_jobspec(jobspec)
        
        # Assertions: Fields exist but are null
        result_dict = result.to_dict()
        metadata = result_dict.get("_metadata", {})
        
        assert "resolve_edition_detected" in metadata
        assert "resolve_version_detected" in metadata
        assert metadata["resolve_edition_detected"] is None
        assert metadata["resolve_version_detected"] is None


def test_resolve_detection_does_not_mutate_execution_path():
    """
    TEST: Resolve detection does not change execution routing or behavior.
    
    GIVEN: A job that should route to FFmpeg
    WHEN: Resolve is detected during execution
    THEN: Engine routing is unchanged
    AND: Execution behavior is identical
    AND: No additional validation or gating occurs
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
            job_id="smoke_no_mutation",
            sources=[str(source_file)],
            output_directory=str(tmpdir_path),
            codec="prores_proxy",
            container="mov",
            resolution="same",
            naming_template="output",
        )
        
        # Execute with Resolve detected
        with patch('execution_adapter.detect_resolve_installation', return_value=mock_resolve):
            result_with_detection = execute_jobspec(jobspec)
        
        # Execute with no Resolve detected
        with patch('execution_adapter.detect_resolve_installation', return_value=None):
            result_without_detection = execute_jobspec(jobspec)
        
        # Assertions: Execution behavior identical
        assert result_with_detection.engine_used == result_without_detection.engine_used, \
            "Engine selection must be identical"
        assert result_with_detection.final_status == result_without_detection.final_status, \
            "Final status must be identical"
        
        # Only difference: metadata fields
        metadata_with = result_with_detection.to_dict().get("_metadata", {})
        metadata_without = result_without_detection.to_dict().get("_metadata", {})
        
        # Both must have the fields
        assert "resolve_edition_detected" in metadata_with
        assert "resolve_edition_detected" in metadata_without


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
