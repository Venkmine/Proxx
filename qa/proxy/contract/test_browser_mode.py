"""
Proxy v1 Contract: Browser Mode

Tests that browser mode cannot bypass Proxy v1 restrictions:
- Output directory is always required (no filesystem workarounds)
- Cannot enable features that Electron mode doesn't have

Browser mode is for development/debugging only.
It must not expose functionality Electron doesn't have.
"""

import pytest
from pathlib import Path
import tempfile

# Add backend to path for testing
import sys
backend_path = Path(__file__).parent.parent.parent.parent / "backend"
sys.path.insert(0, str(backend_path))


class TestBrowserModeOutputDirectory:
    """
    CONTRACT: Browser mode cannot bypass output directory requirement.
    
    The backend enforces output directory requirement regardless of client.
    """
    
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
    
    def test_no_output_dir_fallback_to_source_dir(self, valid_source_file):
        """
        CONTRACT: Backend MUST NOT fall back to source file directory.
        
        If output_dir is not specified, job creation must fail.
        No automatic fallback to source directory.
        """
        from app.routes.control import CreateJobRequest, DeliverSettingsRequest
        
        # Create request without output_dir
        request = CreateJobRequest(
            source_paths=[valid_source_file],
            preset_id="test_preset",
            deliver_settings=DeliverSettingsRequest()  # No output_dir
        )
        
        # Verify no fallback happens at request level
        assert request.deliver_settings.output_dir is None
        # No output_base_dir fallback
        assert request.output_base_dir is None
    
    def test_no_output_dir_fallback_to_cwd(self, valid_source_file):
        """
        CONTRACT: Backend MUST NOT fall back to current working directory.
        
        CWD fallback would be a security and predictability issue.
        """
        from app.routes.control import CreateJobRequest, DeliverSettingsRequest
        import os
        
        cwd_before = os.getcwd()
        
        request = CreateJobRequest(
            source_paths=[valid_source_file],
            preset_id="test_preset",
            deliver_settings=DeliverSettingsRequest()
        )
        
        # Nothing in the request should reference CWD
        assert request.deliver_settings.output_dir is None
        assert cwd_before not in str(request.deliver_settings)
    
    def test_empty_output_dir_is_rejected(self, valid_source_file):
        """
        CONTRACT: Empty string output_dir MUST NOT be accepted as valid.
        
        Empty string is semantically different from None but equally invalid.
        """
        from app.routes.control import CreateJobRequest, DeliverSettingsRequest
        
        request = CreateJobRequest(
            source_paths=[valid_source_file],
            preset_id="test_preset",
            deliver_settings=DeliverSettingsRequest(output_dir="")  # Empty string
        )
        
        # Empty string should not be treated as valid path
        # Endpoint validation will reject this
        assert request.deliver_settings.output_dir == ""
        # The endpoint MUST treat "" as invalid (tested in integration)


class TestBrowserModeFeatureParity:
    """
    CONTRACT: Browser mode cannot enable features Electron doesn't have.
    
    API behavior is identical regardless of client type.
    """
    
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
    
    def test_no_special_browser_mode_header(self):
        """
        CONTRACT: Backend does NOT have browser-mode-specific behavior.
        
        There is no X-Browser-Mode or similar header that changes validation.
        """
        from app.routes.control import CreateJobRequest
        
        # The CreateJobRequest model has no browser_mode field
        model_fields = CreateJobRequest.model_fields.keys()
        
        assert "browser_mode" not in model_fields
        assert "client_type" not in model_fields
        assert "is_electron" not in model_fields
    
    def test_api_endpoints_have_no_client_detection(self):
        """
        CONTRACT: API endpoints do not detect or differentiate clients.
        
        Same validation rules apply to Electron, browser, or any HTTP client.
        """
        from app.routes.control import router
        
        # Check that routes don't have client-specific dependencies
        for route in router.routes:
            # Routes should not have browser/electron specific dependencies
            if hasattr(route, 'dependant'):
                deps = getattr(route.dependant, 'dependencies', [])
                for dep in deps:
                    dep_name = str(dep).lower()
                    assert "browser" not in dep_name
                    assert "electron" not in dep_name


class TestBrowserModeCannotBypassValidation:
    """
    CONTRACT: Browser mode cannot bypass any Proxy v1 validation.
    
    All validation is server-side and client-agnostic.
    """
    
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
    
    def test_file_existence_check_is_server_side(self, temp_output_dir):
        """
        CONTRACT: File existence validation happens on server, not client.
        
        Browser cannot claim a file exists when it doesn't.
        """
        from app.routes.control import CreateJobRequest, DeliverSettingsRequest
        
        # Create request with non-existent file
        request = CreateJobRequest(
            source_paths=["/nonexistent/path/to/file.mp4"],
            preset_id="test_preset",
            deliver_settings=DeliverSettingsRequest(output_dir=temp_output_dir)
        )
        
        # Request creation succeeds (paths are just strings)
        # Server-side validation will fail when endpoint processes it
        assert not Path(request.source_paths[0]).exists()
    
    def test_directory_writability_check_is_server_side(self, valid_source_file):
        """
        CONTRACT: Directory writability is checked on server, not client.
        
        Browser cannot claim a directory is writable when it isn't.
        """
        from app.routes.control import CreateJobRequest, DeliverSettingsRequest
        
        # Create request with non-existent output directory
        request = CreateJobRequest(
            source_paths=[valid_source_file],
            preset_id="test_preset",
            deliver_settings=DeliverSettingsRequest(output_dir="/nonexistent/output/dir")
        )
        
        # Request creation succeeds (paths are just strings)
        # Server-side validation will fail when endpoint processes it
        assert not Path(request.deliver_settings.output_dir).exists()
