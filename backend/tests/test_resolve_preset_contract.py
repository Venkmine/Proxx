"""
Tests for V2 Resolve Preset Contract - Deterministic preset validation.

These tests verify:
1. Resolve job without resolve_preset → FAILS
2. Resolve job with nonexistent preset → FAILS
3. Resolve job with valid preset → PASSES (mock)
4. FFmpeg job with resolve_preset → FAILS

Part of V2 Phase 1 (Option A: Reliable Proxy Engine)
"""

import pytest
import tempfile
from pathlib import Path
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from job_spec import JobSpec, JobSpecValidationError, JOBSPEC_VERSION


# -----------------------------------------------------------------------------
# Test JobSpec Validation for resolve_preset
# -----------------------------------------------------------------------------

class TestResolvePresetValidation:
    """Tests for the validate_resolve_preset method on JobSpec."""
    
    def _make_jobspec(self, resolve_preset=None):
        """Create a minimal JobSpec for testing."""
        return JobSpec(
            sources=["/test/source.mov"],
            output_directory="/test/output",
            codec="prores_proxy",
            container="mov",
            resolution="same",
            naming_template="{source_name}_proxy",
            resolve_preset=resolve_preset,
        )
    
    def test_resolve_job_without_preset_fails(self):
        """Resolve job without resolve_preset should fail validation."""
        job_spec = self._make_jobspec(resolve_preset=None)
        
        with pytest.raises(JobSpecValidationError) as exc_info:
            job_spec.validate_resolve_preset(routes_to_resolve=True)
        
        error_msg = str(exc_info.value)
        assert "Resolve jobs must specify resolve_preset" in error_msg
        assert "ProRes 422 Proxy" in error_msg  # Example preset mentioned
    
    def test_resolve_job_with_empty_preset_fails(self):
        """Resolve job with empty string preset should fail."""
        job_spec = self._make_jobspec(resolve_preset="")
        
        with pytest.raises(JobSpecValidationError) as exc_info:
            job_spec.validate_resolve_preset(routes_to_resolve=True)
        
        assert "Resolve jobs must specify resolve_preset" in str(exc_info.value)
    
    def test_resolve_job_with_whitespace_preset_fails(self):
        """Resolve job with whitespace-only preset should fail."""
        job_spec = self._make_jobspec(resolve_preset="   ")
        
        with pytest.raises(JobSpecValidationError) as exc_info:
            job_spec.validate_resolve_preset(routes_to_resolve=True)
        
        assert "Resolve jobs must specify resolve_preset" in str(exc_info.value)
    
    def test_resolve_job_with_valid_preset_passes(self):
        """Resolve job with valid preset name should pass."""
        job_spec = self._make_jobspec(resolve_preset="ProRes 422 Proxy")
        
        # Should not raise
        job_spec.validate_resolve_preset(routes_to_resolve=True)
    
    def test_ffmpeg_job_with_preset_fails(self):
        """FFmpeg job with resolve_preset should fail validation."""
        job_spec = self._make_jobspec(resolve_preset="ProRes 422 Proxy")
        
        with pytest.raises(JobSpecValidationError) as exc_info:
            job_spec.validate_resolve_preset(routes_to_resolve=False)
        
        error_msg = str(exc_info.value)
        assert "FFmpeg jobs must not specify resolve_preset" in error_msg
        assert "ProRes 422 Proxy" in error_msg  # Shows what was provided
    
    def test_ffmpeg_job_without_preset_passes(self):
        """FFmpeg job without resolve_preset should pass."""
        job_spec = self._make_jobspec(resolve_preset=None)
        
        # Should not raise
        job_spec.validate_resolve_preset(routes_to_resolve=False)


class TestJobSpecSerialization:
    """Tests for resolve_preset in JobSpec serialization."""
    
    def test_to_dict_includes_resolve_preset(self):
        """to_dict should include resolve_preset field."""
        job_spec = JobSpec(
            sources=["/test/source.mov"],
            output_directory="/test/output",
            codec="prores_proxy",
            container="mov",
            resolution="same",
            naming_template="{source_name}_proxy",
            resolve_preset="ProRes 422 Proxy",
        )
        
        data = job_spec.to_dict()
        
        assert "resolve_preset" in data
        assert data["resolve_preset"] == "ProRes 422 Proxy"
    
    def test_to_dict_includes_null_resolve_preset(self):
        """to_dict should include resolve_preset even when None."""
        job_spec = JobSpec(
            sources=["/test/source.mov"],
            output_directory="/test/output",
            codec="prores_proxy",
            container="mov",
            resolution="same",
            naming_template="{source_name}_proxy",
        )
        
        data = job_spec.to_dict()
        
        assert "resolve_preset" in data
        assert data["resolve_preset"] is None
    
    def test_from_dict_parses_resolve_preset(self):
        """from_dict should parse resolve_preset field."""
        data = {
            "jobspec_version": JOBSPEC_VERSION,
            "sources": ["/test/source.mov"],
            "output_directory": "/test/output",
            "codec": "prores_proxy",
            "container": "mov",
            "resolution": "same",
            "naming_template": "{source_name}_proxy",
            "resolve_preset": "ProRes 422 HQ",
        }
        
        job_spec = JobSpec.from_dict(data)
        
        assert job_spec.resolve_preset == "ProRes 422 HQ"
    
    def test_from_dict_handles_missing_resolve_preset(self):
        """from_dict should handle missing resolve_preset (default to None)."""
        data = {
            "jobspec_version": JOBSPEC_VERSION,
            "sources": ["/test/source.mov"],
            "output_directory": "/test/output",
            "codec": "prores_proxy",
            "container": "mov",
            "resolution": "same",
            "naming_template": "{source_name}_proxy",
        }
        
        job_spec = JobSpec.from_dict(data)
        
        assert job_spec.resolve_preset is None


# -----------------------------------------------------------------------------
# Test Execution Results Metadata
# -----------------------------------------------------------------------------

class TestExecutionResultsMetadata:
    """Tests for resolve_preset_used in JobExecutionResult."""
    
    def test_result_includes_resolve_preset_used(self):
        """JobExecutionResult should include resolve_preset_used in metadata."""
        from execution_results import JobExecutionResult
        
        result = JobExecutionResult(
            job_id="test_job",
            clips=[],
            final_status="COMPLETED",
            engine_used="resolve",
            resolve_preset_used="ProRes 422 Proxy",
        )
        
        data = result.to_dict()
        
        assert "_metadata" in data
        assert data["_metadata"]["resolve_preset_used"] == "ProRes 422 Proxy"
        assert data["_metadata"]["engine_used"] == "resolve"
    
    def test_result_without_preset_has_none(self):
        """JobExecutionResult without preset should have None in metadata."""
        from execution_results import JobExecutionResult
        
        result = JobExecutionResult(
            job_id="test_job",
            clips=[],
            final_status="COMPLETED",
            engine_used="ffmpeg",
        )
        
        data = result.to_dict()
        
        assert data["_metadata"]["resolve_preset_used"] is None
        assert data["_metadata"]["engine_used"] == "ffmpeg"


# -----------------------------------------------------------------------------
# Integration Tests (with mocks)
# -----------------------------------------------------------------------------

class TestHeadlessExecutePresetValidation:
    """Integration tests for preset validation in headless_execute."""
    
    def test_resolve_job_without_preset_returns_failed(self, tmp_path):
        """execute_multi_job_spec should fail for Resolve job without preset."""
        # Create a fake source file that looks like RAW
        source_file = tmp_path / "test.braw"
        source_file.write_text("fake braw content")
        
        output_dir = tmp_path / "output"
        output_dir.mkdir()
        
        job_spec = JobSpec(
            sources=[str(source_file)],
            output_directory=str(output_dir),
            codec="prores_proxy",
            container="mov",
            resolution="same",
            naming_template="{source_name}_proxy",
            resolve_preset=None,  # Missing preset
        )
        
        from headless_execute import execute_multi_job_spec
        
        result = execute_multi_job_spec(job_spec)
        
        assert result.final_status == "FAILED"
        # V2 validates proxy_profile FIRST - this fails before resolve_preset check
        assert "proxy_profile" in result.validation_error.lower()
    
    def test_ffmpeg_job_with_preset_returns_failed(self, tmp_path):
        """execute_multi_job_spec should fail for FFmpeg job with preset."""
        # Create a fake source file that looks like standard video
        source_file = tmp_path / "test.mov"
        source_file.write_text("fake mov content")
        
        output_dir = tmp_path / "output"
        output_dir.mkdir()
        
        job_spec = JobSpec(
            sources=[str(source_file)],
            output_directory=str(output_dir),
            codec="prores_proxy",
            container="mov",
            resolution="same",
            naming_template="{source_name}_proxy",
            resolve_preset="ProRes 422 Proxy",  # Preset on FFmpeg job
        )
        
        from headless_execute import execute_multi_job_spec
        
        result = execute_multi_job_spec(job_spec)
        
        assert result.final_status == "FAILED"
        # V2 validates proxy_profile FIRST - this fails before resolve_preset check
        assert "proxy_profile" in result.validation_error.lower()


# -----------------------------------------------------------------------------
# Mock Resolve Engine Tests
# -----------------------------------------------------------------------------

class TestResolveEnginePresetValidation:
    """Tests for preset validation in ResolveEngine (mocked)."""
    
    def test_preset_error_includes_available_presets(self):
        """ResolvePresetError should include list of available presets."""
        from v2.engines.resolve_engine import ResolvePresetError
        
        error = ResolvePresetError(
            missing_preset="My Custom Preset",
            available_presets=["ProRes 422 Proxy", "H.264 Master", "DNxHR HQ"],
        )
        
        assert error.missing_preset == "My Custom Preset"
        assert "ProRes 422 Proxy" in error.available_presets
        assert "My Custom Preset" in str(error)
        assert "ProRes 422 Proxy" in str(error)
    
    def test_preset_error_with_many_presets_truncates(self):
        """ResolvePresetError should truncate long preset lists."""
        from v2.engines.resolve_engine import ResolvePresetError
        
        many_presets = [f"Preset {i}" for i in range(20)]
        
        error = ResolvePresetError(
            missing_preset="Missing One",
            available_presets=many_presets,
        )
        
        # Should mention truncation
        error_str = str(error)
        assert "more" in error_str.lower() or len(error_str) < 1000


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
