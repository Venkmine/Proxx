"""
Dogfood Backend Contract Tests

Tests backend API contracts for:
- Job creation validation
- Path validation (absolute vs relative)
- Codec/container compatibility
- Error response formats
"""

import pytest
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / "backend"))


# ============================================================================
# PATH VALIDATION TESTS
# ============================================================================

def is_absolute_path(path_str: str) -> bool:
    """Check if path is absolute (mirrors frontend logic)."""
    if not path_str or not path_str.strip():
        return False
    p = Path(path_str.strip())
    return p.is_absolute()


class TestPathValidation:
    """Test path validation logic."""
    
    def test_absolute_unix_path_accepted(self):
        """Absolute Unix paths should be accepted."""
        assert is_absolute_path("/Users/test/video.mp4") is True
        assert is_absolute_path("/home/user/file.mov") is True
        assert is_absolute_path("/tmp/output") is True
    
    def test_relative_path_rejected(self):
        """Relative paths should be rejected."""
        assert is_absolute_path("relative/path/video.mp4") is False
        assert is_absolute_path("./file.mp4") is False
        assert is_absolute_path("../parent/file.mp4") is False
        assert is_absolute_path("file.mp4") is False
    
    def test_empty_path_rejected(self):
        """Empty paths should be rejected."""
        assert is_absolute_path("") is False
        assert is_absolute_path("   ") is False


# ============================================================================
# CODEC/CONTAINER COMPATIBILITY TESTS
# ============================================================================

class TestCodecContainerCompatibility:
    """Test codec/container compatibility validation."""
    
    def test_prores_requires_mov(self):
        """ProRes codecs should require MOV container."""
        from app.deliver.codec_specs import CODEC_REGISTRY
        
        prores_codecs = [k for k in CODEC_REGISTRY if k.startswith("prores")]
        
        for codec_id in prores_codecs:
            spec = CODEC_REGISTRY[codec_id]
            assert "mov" in spec.supported_containers, f"{codec_id} should support MOV"
    
    def test_h264_supports_mp4(self):
        """H.264 should support MP4 container."""
        from app.deliver.codec_specs import CODEC_REGISTRY
        
        if "h264" in CODEC_REGISTRY:
            spec = CODEC_REGISTRY["h264"]
            assert "mp4" in spec.supported_containers
    
    def test_dnxhd_supports_mxf(self):
        """DNxHD/DNxHR codecs should support MXF container."""
        from app.deliver.codec_specs import CODEC_REGISTRY
        
        dnx_codecs = [k for k in CODEC_REGISTRY if k.startswith("dnx")]
        
        for codec_id in dnx_codecs:
            spec = CODEC_REGISTRY[codec_id]
            assert "mxf" in spec.supported_containers, f"{codec_id} should support MXF"
    
    def test_all_codecs_have_default_container(self):
        """All codecs should have a default container defined."""
        from app.deliver.codec_specs import CODEC_REGISTRY
        
        for codec_id, spec in CODEC_REGISTRY.items():
            assert spec.default_container, f"{codec_id} missing default_container"
            assert spec.default_container in spec.supported_containers, \
                f"{codec_id} default_container not in supported_containers"


# ============================================================================
# JOB STATUS ENUM TESTS
# ============================================================================

class TestJobStatusContract:
    """Test job status enum contracts."""
    
    def test_job_status_enum_values(self):
        """Job status should have expected enum values."""
        from app.jobs.models import JobStatus
        
        # These statuses must exist for UI compatibility
        expected_statuses = [
            "PENDING",
            "RUNNING",
            "COMPLETED",
            "FAILED",
            "CANCELLED",
        ]
        
        for status in expected_statuses:
            assert hasattr(JobStatus, status), f"Missing status: {status}"
    
    def test_task_status_enum_values(self):
        """Task status should have expected enum values."""
        from app.jobs.models import TaskStatus
        
        expected_statuses = [
            "QUEUED",
            "RUNNING",
            "COMPLETED",
            "FAILED",
        ]
        
        for status in expected_statuses:
            assert hasattr(TaskStatus, status), f"Missing task status: {status}"


# ============================================================================
# ERROR RESPONSE FORMAT TESTS
# ============================================================================

class TestErrorResponseFormat:
    """Test that error responses are human-readable."""
    
    def test_validation_error_has_message(self):
        """Validation errors should have readable message field."""
        # ValidationError should be convertible to readable message
        try:
            from app.deliver.naming import validate_naming_template
            is_valid, error = validate_naming_template("")
            assert not is_valid
            assert error  # Should have an error message
            assert len(error) > 10  # Should be human-readable, not just "error"
        except ImportError:
            pytest.skip("Naming module not available")


# ============================================================================
# NAMING TEMPLATE VALIDATION TESTS
# ============================================================================

class TestNamingTemplates:
    """Test naming template token validation."""
    
    def test_supported_tokens(self):
        """Supported naming tokens should be documented."""
        from app.deliver.naming import SUPPORTED_TOKENS
        
        expected_tokens = [
            "{source_name}",
            "{job_name}",
        ]
        
        for token in expected_tokens:
            assert token in SUPPORTED_TOKENS, f"Missing token: {token}"
    
    def test_validate_empty_template_fails(self):
        """Empty naming template should fail validation."""
        from app.deliver.naming import validate_naming_template
        
        is_valid, error = validate_naming_template("")
        assert not is_valid
        assert error is not None
    
    def test_validate_valid_template_succeeds(self):
        """Valid naming template should pass validation."""
        from app.deliver.naming import validate_naming_template
        
        is_valid, error = validate_naming_template("{source_name}_{preset}")
        assert is_valid
        assert error is None
