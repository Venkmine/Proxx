"""
Pre-RAW Smoke Test - Edition Gating (Dry-Run Verification)

Validates edition gating logic without invoking Resolve engine.

Tests:
1. Tests requiring "free" → SKIPPED under Studio
2. Tests requiring "either" → NOT skipped
3. Skip metadata includes required/detected editions
4. Resolve engine is never invoked for skipped tests
5. Skip results serialize correctly

Part of Pre-RAW Smoke Validation Suite
"""

import pytest
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from job_spec import JobSpec, JOBSPEC_VERSION
from execution_adapter import execute_jobspec
from v2.resolve_installation import ResolveInstallation


def test_free_required_skipped_under_studio():
    """
    TEST: Job requiring "free" edition is SKIPPED when Studio is detected.
    
    GIVEN: JobSpec with requires_resolve_edition="free"
    WHEN: Studio edition is detected
    THEN: Job is SKIPPED with metadata
    AND: No engine is invoked
    AND: Skip reason is "resolve_free_not_installed"
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
            job_id="dry_run_free_required",
            sources=[str(source_file)],
            output_directory=str(tmpdir_path),
            codec="h264",
            container="mp4",
            resolution="quarter",
            naming_template="output",
            requires_resolve_edition="free",
        )
        
        # Execute with Studio detected
        with patch('execution_adapter.detect_resolve_installation', return_value=mock_studio):
            result = execute_jobspec(jobspec)
        
        # Assertions: Job skipped
        assert result.final_status == "SKIPPED"
        assert result.skip_metadata is not None
        assert result.skip_metadata["reason"] == "resolve_free_not_installed"
        assert result.skip_metadata["detected_resolve_edition"] == "studio"
        assert result.skip_metadata["required_resolve_edition"] == "free"
        assert result.skip_metadata["resolve_version"] == "19.0.3"
        
        # Assertions: No engine invoked
        assert result.engine_used is None
        assert len(result.clips) == 0


def test_studio_required_skipped_under_free():
    """
    TEST: Job requiring "studio" edition is SKIPPED when Free is detected.
    
    GIVEN: JobSpec with requires_resolve_edition="studio"
    WHEN: Free edition is detected
    THEN: Job is SKIPPED with metadata
    AND: Skip reason is "resolve_studio_not_installed"
    """
    mock_free = ResolveInstallation(
        version="18.6.0",
        edition="free",
        install_path="/Applications/DaVinci Resolve/DaVinci Resolve.app",
        detection_method="macos_install_path",
        detection_confidence="high",
    )
    
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        source_file = tmpdir_path / "test.ari"  # ARRI RAW (requires Studio in reality)
        source_file.write_text("fake ARRI RAW")
        
        jobspec = JobSpec(
            job_id="dry_run_studio_required",
            sources=[str(source_file)],
            output_directory=str(tmpdir_path),
            codec="prores_proxy",
            container="mov",
            resolution="same",
            naming_template="output",
            requires_resolve_edition="studio",
        )
        
        # Execute with Free detected
        with patch('execution_adapter.detect_resolve_installation', return_value=mock_free):
            result = execute_jobspec(jobspec)
        
        # Assertions: Job skipped
        assert result.final_status == "SKIPPED"
        assert result.skip_metadata is not None
        assert result.skip_metadata["reason"] == "resolve_studio_not_installed"
        assert result.skip_metadata["detected_resolve_edition"] == "free"
        assert result.skip_metadata["required_resolve_edition"] == "studio"
        assert result.skip_metadata["resolve_version"] == "18.6.0"
        
        # Assertions: No engine invoked
        assert result.engine_used is None
        assert len(result.clips) == 0


def test_either_edition_never_skipped():
    """
    TEST: Job requiring "either" edition is NEVER skipped.
    
    GIVEN: JobSpec with requires_resolve_edition="either" (default)
    WHEN: Any edition is detected (or none)
    THEN: Job proceeds normally (not skipped)
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
            job_id="dry_run_either_allowed",
            sources=[str(source_file)],
            output_directory=str(tmpdir_path),
            codec="h264",
            container="mp4",
            resolution="quarter",
            naming_template="output",
            requires_resolve_edition="either",  # Explicit "either"
        )
        
        # Execute with Studio detected
        with patch('execution_adapter.detect_resolve_installation', return_value=mock_studio):
            result = execute_jobspec(jobspec)
        
        # Assertions: Job NOT skipped
        assert result.final_status != "SKIPPED", \
            "Jobs requiring 'either' edition should never be skipped"
        assert result.skip_metadata is None


def test_skip_metadata_includes_all_required_fields():
    """
    TEST: Skip metadata includes all required diagnostic fields.
    
    GIVEN: A skipped job due to edition mismatch
    WHEN: Result is serialized
    THEN: skip_metadata contains:
        - reason
        - detected_resolve_edition
        - required_resolve_edition
        - resolve_version
        - timestamp
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
            job_id="dry_run_metadata_check",
            sources=[str(source_file)],
            output_directory=str(tmpdir_path),
            codec="h264",
            container="mp4",
            resolution="quarter",
            naming_template="output",
            requires_resolve_edition="free",
        )
        
        # Execute and skip
        with patch('execution_adapter.detect_resolve_installation', return_value=mock_studio):
            result = execute_jobspec(jobspec)
        
        # Assertions: All required fields present
        assert result.skip_metadata is not None
        required_fields = [
            "reason",
            "detected_resolve_edition",
            "required_resolve_edition",
            "resolve_version",
            "timestamp",
        ]
        
        for field in required_fields:
            assert field in result.skip_metadata, \
                f"skip_metadata must include '{field}'"
        
        # Verify field types
        assert isinstance(result.skip_metadata["reason"], str)
        assert isinstance(result.skip_metadata["detected_resolve_edition"], str)
        assert isinstance(result.skip_metadata["required_resolve_edition"], str)
        assert isinstance(result.skip_metadata["resolve_version"], str)
        assert isinstance(result.skip_metadata["timestamp"], str)


def test_skip_serializes_deterministically():
    """
    TEST: Skip results serialize to JSON deterministically.
    
    GIVEN: Same JobSpec skipped twice
    WHEN: Results are serialized to JSON (excluding timestamp)
    THEN: JSON structure is identical
    AND: skip_metadata is included in serialization
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
            job_id="dry_run_determinism",
            sources=[str(source_file)],
            output_directory=str(tmpdir_path),
            codec="h264",
            container="mp4",
            resolution="quarter",
            naming_template="output",
            requires_resolve_edition="free",
        )
        
        # Execute twice
        with patch('execution_adapter.detect_resolve_installation', return_value=mock_studio):
            result1 = execute_jobspec(jobspec)
            result2 = execute_jobspec(jobspec)
        
        # Serialize to dict (skip timestamp for comparison)
        dict1 = result1.to_dict()
        dict2 = result2.to_dict()
        
        # Remove timestamps for comparison
        if dict1.get("skip_metadata"):
            dict1["skip_metadata"].pop("timestamp", None)
        if dict2.get("skip_metadata"):
            dict2["skip_metadata"].pop("timestamp", None)
        
        dict1.pop("started_at", None)
        dict1.pop("completed_at", None)
        dict2.pop("started_at", None)
        dict2.pop("completed_at", None)
        
        # Assertions: Structure identical
        assert dict1["final_status"] == dict2["final_status"]
        assert dict1["skip_metadata"] == dict2["skip_metadata"]


def test_resolve_engine_never_invoked_for_skip():
    """
    TEST: Resolve engine is NEVER invoked when job is skipped.
    
    GIVEN: A job that would route to Resolve if not skipped
    WHEN: Job is skipped due to edition mismatch
    THEN: Job is skipped before engine selection
    AND: No clips are executed
    AND: No engine_used is set
    """
    mock_free = ResolveInstallation(
        version="18.6.0",
        edition="free",
        install_path="/Applications/DaVinci Resolve/DaVinci Resolve.app",
        detection_method="macos_install_path",
        detection_confidence="high",
    )
    
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        # Use .braw extension (would route to Resolve if not skipped)
        source_file = tmpdir_path / "test.braw"
        source_file.write_text("fake BRAW")
        
        jobspec = JobSpec(
            job_id="dry_run_no_invoke",
            sources=[str(source_file)],
            output_directory=str(tmpdir_path),
            codec="prores_proxy",
            container="mov",
            resolution="same",
            naming_template="output",
            resolve_preset="Proxy - H.264",
            requires_resolve_edition="studio",  # Requires Studio, Free detected
        )
        
        # Execute with Free detected (requires Studio)
        with patch('execution_adapter.detect_resolve_installation', return_value=mock_free):
            result = execute_jobspec(jobspec)
        
        # Assertions: Job skipped before engine selection
        assert result.final_status == "SKIPPED"
        assert result.engine_used is None, "No engine should be set for skipped jobs"
        assert len(result.clips) == 0, "No clips should be executed for skipped jobs"
        assert result.skip_metadata is not None
        assert result.skip_metadata["reason"] == "resolve_studio_not_installed"


def test_default_edition_requirement_is_either():
    """
    TEST: JobSpec without requires_resolve_edition defaults to "either".
    
    GIVEN: JobSpec without explicit requires_resolve_edition
    WHEN: JobSpec is created
    THEN: requires_resolve_edition defaults to "either"
    AND: Job proceeds normally regardless of detected edition
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        source_file = tmpdir_path / "test.mp4"
        source_file.write_text("fake video")
        
        jobspec = JobSpec(
            job_id="dry_run_default_either",
            sources=[str(source_file)],
            output_directory=str(tmpdir_path),
            codec="h264",
            container="mp4",
            resolution="quarter",
            naming_template="output",
            # requires_resolve_edition NOT specified
        )
        
        # Assertions: Defaults to "either"
        assert jobspec.requires_resolve_edition == "either"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
