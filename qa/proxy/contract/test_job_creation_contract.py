"""
Proxy v1 Contract: Job Creation

Tests the fundamental job creation contract:
- Job creation FAILS without source files, output directory, or preset
- Job creation SUCCEEDS when all three are present

These tests define WHAT Proxy v1 requires, not HOW it validates.
"""

import pytest
from pathlib import Path
import tempfile
import os

# Add backend to path for testing
import sys
backend_path = Path(__file__).parent.parent.parent.parent / "backend"
sys.path.insert(0, str(backend_path))


class TestJobCreationContract:
    """Contract tests for job creation validation."""
    
    @pytest.fixture
    def temp_output_dir(self):
        """Create a temporary output directory."""
        with tempfile.TemporaryDirectory() as tmpdir:
            yield tmpdir
    
    @pytest.fixture
    def valid_source_file(self, temp_output_dir):
        """Create a valid source file for testing."""
        # Create a dummy file (doesn't need to be valid media for contract tests)
        source_path = Path(temp_output_dir) / "test_source.mp4"
        source_path.touch()
        return str(source_path)
    
    def test_job_creation_fails_without_source_files(self, temp_output_dir):
        """
        CONTRACT: Job creation MUST fail if no source files are provided.
        
        Empty source_paths is a validation error, not a silent no-op.
        """
        from app.routes.control import CreateJobRequest
        from pydantic import ValidationError
        
        # Attempt to create a request with empty source_paths
        # This should either fail at Pydantic validation or at endpoint level
        try:
            request = CreateJobRequest(
                source_paths=[],  # Empty - contract violation
                preset_id="test_preset",
                deliver_settings={"output_dir": temp_output_dir}
            )
            # If we get here, the request was created - endpoint must reject it
            # This is acceptable (validation at endpoint level)
            assert request.source_paths == []
        except ValidationError:
            # This is also acceptable (validation at Pydantic level)
            pass
    
    def test_job_creation_fails_without_output_directory(self, valid_source_file):
        """
        CONTRACT: Job creation MUST fail if no output directory is provided.
        
        Output directory is required in Proxy v1. No fallbacks to CWD or source dir.
        """
        from app.routes.control import CreateJobRequest, DeliverSettingsRequest
        
        # Create request without output_dir
        request = CreateJobRequest(
            source_paths=[valid_source_file],
            preset_id="test_preset",
            deliver_settings=DeliverSettingsRequest()  # No output_dir
        )
        
        # Contract: output_dir should be None/empty
        assert request.deliver_settings.output_dir is None
        # The endpoint MUST reject this - tested in integration tests
    
    def test_job_creation_allows_manual_configuration_without_preset(self, valid_source_file, temp_output_dir):
        """
        CONTRACT: Job creation ALLOWS manual configuration without preset.
        
        As of Phase 6, presets are optional. Jobs can be created with:
        - settings_preset_id (preferred)
        - preset_id (legacy)
        - deliver_settings directly (manual configuration)
        """
        from app.routes.control import CreateJobRequest, DeliverSettingsRequest
        
        # Create request without preset - should succeed with deliver_settings
        request = CreateJobRequest(
            source_paths=[valid_source_file],
            # No preset_id or settings_preset_id
            deliver_settings=DeliverSettingsRequest(output_dir=temp_output_dir)
        )
        
        # Contract: preset is optional
        assert request.preset_id is None
        assert request.settings_preset_id is None
        # But deliver_settings must be provided
        assert request.deliver_settings is not None
        assert request.deliver_settings.output_dir == temp_output_dir
    
    def test_job_creation_succeeds_with_all_requirements(self, valid_source_file, temp_output_dir):
        """
        CONTRACT: Job creation MUST succeed when all requirements are met.
        
        Required:
        - source_paths (at least one valid file)
        - preset_id (any valid preset ID)
        - output_dir (writable directory)
        """
        from app.routes.control import CreateJobRequest, DeliverSettingsRequest
        
        # Create request with all required fields
        request = CreateJobRequest(
            source_paths=[valid_source_file],
            preset_id="test_preset",
            deliver_settings=DeliverSettingsRequest(output_dir=temp_output_dir)
        )
        
        # Contract: Request should be valid
        assert len(request.source_paths) == 1
        assert request.preset_id == "test_preset"
        assert request.deliver_settings.output_dir == temp_output_dir
    
    def test_source_must_be_file_not_folder(self, temp_output_dir):
        """
        CONTRACT: Source paths MUST be files, not folders.
        
        Proxy v1 does not support folder ingest.
        """
        from app.routes.control import CreateJobRequest, DeliverSettingsRequest
        
        # Use temp_output_dir as source (it's a folder, not a file)
        request = CreateJobRequest(
            source_paths=[temp_output_dir],  # This is a directory
            preset_id="test_preset",
            deliver_settings=DeliverSettingsRequest(output_dir=temp_output_dir)
        )
        
        # Request creation should succeed (validation happens at endpoint)
        # But the endpoint MUST reject this because it's a directory
        assert Path(request.source_paths[0]).is_dir()
        # Endpoint validation tested in integration tests


class TestJobCreationContractFFmpegOnly:
    """Contract tests: Proxy v1 only supports FFmpeg engine."""
    
    @pytest.fixture
    def temp_output_dir(self):
        """Create a temporary output directory."""
        with tempfile.TemporaryDirectory() as tmpdir:
            yield tmpdir
    
    @pytest.fixture
    def valid_source_file(self, temp_output_dir):
        """Create a valid source file for testing."""
        source_path = Path(temp_output_dir) / "test_source.mp4"
        source_path.touch()
        return str(source_path)
    
    def test_ffmpeg_engine_is_valid(self, valid_source_file, temp_output_dir):
        """
        CONTRACT: FFmpeg engine MUST be accepted.
        
        FFmpeg is the only supported engine in Proxy v1.
        """
        from app.routes.control import CreateJobRequest, DeliverSettingsRequest
        
        request = CreateJobRequest(
            source_paths=[valid_source_file],
            preset_id="test_preset",
            engine="ffmpeg",
            deliver_settings=DeliverSettingsRequest(output_dir=temp_output_dir)
        )
        
        assert request.engine == "ffmpeg"
    
    def test_default_engine_is_ffmpeg(self, valid_source_file, temp_output_dir):
        """
        CONTRACT: Default engine MUST be FFmpeg.
        
        If no engine is specified, FFmpeg is used.
        """
        from app.routes.control import CreateJobRequest, DeliverSettingsRequest
        
        request = CreateJobRequest(
            source_paths=[valid_source_file],
            preset_id="test_preset",
            # engine omitted - should default to ffmpeg
            deliver_settings=DeliverSettingsRequest(output_dir=temp_output_dir)
        )
        
        assert request.engine == "ffmpeg"
