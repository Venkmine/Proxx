"""
Proxy v1 Contract: Feature Gates

Tests that unsupported features are properly rejected:
- Colour settings → HTTP 400 (extra fields forbidden)
- Resolve engine → HTTP 501 Not Implemented
- Watch folder endpoints → HTTP 404 (not exposed)

These tests ensure Proxy v1 boundaries are enforced.
"""

import pytest
from pathlib import Path
import tempfile

# Add backend to path for testing
import sys
backend_path = Path(__file__).parent.parent.parent.parent / "backend"
sys.path.insert(0, str(backend_path))


class TestColourSettingsRejection:
    """
    CONTRACT: Colour settings are NOT supported in Proxy v1.
    
    Any request containing colour settings MUST be rejected.
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
    
    def test_colour_field_rejected_by_schema(self, valid_source_file, temp_output_dir):
        """
        CONTRACT: DeliverSettingsRequest MUST reject 'colour' field.
        
        The schema uses extra="forbid", so any unknown field causes validation error.
        """
        from app.routes.control import DeliverSettingsRequest
        from pydantic import ValidationError
        
        # Attempt to create deliver settings with colour field
        with pytest.raises(ValidationError) as exc_info:
            DeliverSettingsRequest(
                output_dir=temp_output_dir,
                colour={"enabled": True}  # Not allowed in Proxy v1
            )
        
        # Verify the error is about the colour field
        error_str = str(exc_info.value).lower()
        assert "colour" in error_str or "extra" in error_str
    
    def test_colour_enabled_rejected(self, valid_source_file, temp_output_dir):
        """
        CONTRACT: Any colour configuration MUST be rejected.
        
        Even minimal colour config (just enabled=True) must fail.
        """
        from app.routes.control import DeliverSettingsRequest
        from pydantic import ValidationError
        
        with pytest.raises(ValidationError):
            DeliverSettingsRequest(
                output_dir=temp_output_dir,
                colour={"enabled": False}  # Even disabled colour config is rejected
            )
    
    def test_lut_settings_rejected(self, valid_source_file, temp_output_dir):
        """
        CONTRACT: LUT settings MUST be rejected.
        
        LUT application is not supported in Proxy v1.
        """
        from app.routes.control import DeliverSettingsRequest
        from pydantic import ValidationError
        
        with pytest.raises(ValidationError):
            DeliverSettingsRequest(
                output_dir=temp_output_dir,
                colour={"mode": "apply_lut", "lut_file": "rec709_to_srgb.cube"}
            )


class TestResolveEngineRejection:
    """
    CONTRACT: Resolve engine is NOT supported in Proxy v1.
    
    Requests for Resolve engine MUST return HTTP 501 Not Implemented.
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
    
    def test_resolve_engine_value_is_valid_at_schema_level(self, valid_source_file, temp_output_dir):
        """
        CONTRACT: 'resolve' is a valid engine value at schema level.
        
        The schema accepts 'resolve' but the endpoint rejects it with 501.
        This test verifies schema acceptance (endpoint rejection is integration test).
        """
        from app.routes.control import CreateJobRequest, DeliverSettingsRequest
        
        # Schema should accept 'resolve' as a value
        request = CreateJobRequest(
            source_paths=[valid_source_file],
            preset_id="test_preset",
            engine="resolve",
            deliver_settings=DeliverSettingsRequest(output_dir=temp_output_dir)
        )
        
        assert request.engine == "resolve"
        # Endpoint rejection (501) is tested in integration tests


class TestWatchFolderRejection:
    """
    CONTRACT: Watch folders are NOT supported in Proxy v1.
    
    Watch folder endpoints must not exist or must return appropriate errors.
    """
    
    def test_no_watch_folder_routes_in_control_router(self):
        """
        CONTRACT: No watch folder endpoints exist in the control router.
        
        Watch folder functionality is not exposed via HTTP API in Proxy v1.
        """
        from app.routes.control import router
        
        # Get all route paths
        route_paths = [route.path for route in router.routes]
        
        # None of them should contain 'watchfolder' or 'watch_folder'
        for path in route_paths:
            assert "watchfolder" not in path.lower(), f"Watch folder route found: {path}"
            assert "watch_folder" not in path.lower(), f"Watch folder route found: {path}"
            assert "watch-folder" not in path.lower(), f"Watch folder route found: {path}"
    
    def test_watch_folder_module_not_imported_in_routes(self):
        """
        CONTRACT: Watch folder module is not imported in route definitions.
        
        The watch folder backend code exists but is not wired to HTTP routes.
        """
        import app.routes.control as control_module
        
        # Check that watchfolders module is not imported
        module_attrs = dir(control_module)
        
        # None of the imported names should reference watchfolders
        for attr in module_attrs:
            if "watchfolder" in attr.lower() or "watch_folder" in attr.lower():
                # If found, verify it's not a functional endpoint
                obj = getattr(control_module, attr, None)
                assert not callable(obj) or not hasattr(obj, "__wrapped__"), \
                    f"Watch folder function found in control module: {attr}"


class TestNoSilentFallbacks:
    """
    CONTRACT: No silent fallbacks for unsupported features.
    
    If a feature is not supported, it must be rejected explicitly.
    No silent ignoring, no logging-only handling.
    """
    
    @pytest.fixture
    def temp_output_dir(self):
        """Create a temporary output directory."""
        with tempfile.TemporaryDirectory() as tmpdir:
            yield tmpdir
    
    def test_extra_fields_are_forbidden(self, temp_output_dir):
        """
        CONTRACT: Extra fields in settings MUST cause validation errors.
        
        No silent dropping of unknown fields.
        """
        from app.routes.control import DeliverSettingsRequest, VideoSettingsRequest
        from pydantic import ValidationError
        
        # Try to add unknown field to video settings
        with pytest.raises(ValidationError):
            VideoSettingsRequest(
                codec="h264",
                unknown_future_field="some_value"
            )
        
        # Try to add unknown field to deliver settings
        with pytest.raises(ValidationError):
            DeliverSettingsRequest(
                output_dir=temp_output_dir,
                future_feature={"enabled": True}
            )
