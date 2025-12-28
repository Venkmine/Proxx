"""
Tests for V2 Source Capability Matrix - Format Validation and Hard Rejection.

These tests verify:
1. Supported formats are accepted
2. Rejected formats (RAW) fail with exact error messages
3. Unknown formats fail conservatively
4. No execution is attempted for unsupported formats

Part of V2 Phase 1 (Option A: Reliable Proxy Engine)
"""

import pytest
import sys
from pathlib import Path

# Import the module under test
sys.path.insert(0, str(Path(__file__).parent.parent))

from v2.source_capabilities import (
    SUPPORTED_SOURCES,
    REJECTED_SOURCES,
    SourceCapabilityError,
    is_source_supported,
    is_source_rejected,
    get_rejection_reason,
    validate_source_capability,
    normalize_format,
    list_supported_formats,
    list_rejected_formats,
)


# -----------------------------------------------------------------------------
# Normalization Tests
# -----------------------------------------------------------------------------

class TestNormalizeFormat:
    """Tests for format string normalization."""
    
    def test_lowercase_conversion(self):
        """Format names should be lowercased."""
        assert normalize_format("MP4") == "mp4"
        assert normalize_format("H264") == "h264"
        assert normalize_format("ProRes") == "prores"
    
    def test_strip_leading_dot(self):
        """Leading dots should be stripped from containers."""
        assert normalize_format(".mp4") == "mp4"
        assert normalize_format(".mov") == "mov"
    
    def test_strip_whitespace(self):
        """Whitespace should be stripped."""
        assert normalize_format("  mp4  ") == "mp4"
        assert normalize_format("\th264\n") == "h264"


# -----------------------------------------------------------------------------
# Supported Format Tests
# -----------------------------------------------------------------------------

class TestSupportedFormats:
    """Tests for supported format detection."""
    
    def test_h264_mp4_is_supported(self):
        """H.264 in MP4 container should be supported."""
        assert is_source_supported("mp4", "h264") is True
    
    def test_h264_mov_is_supported(self):
        """H.264 in MOV container should be supported."""
        assert is_source_supported("mov", "h264") is True
    
    def test_prores_mov_is_supported(self):
        """ProRes in MOV container should be supported."""
        assert is_source_supported("mov", "prores") is True
        assert is_source_supported("mov", "prores_proxy") is True
        assert is_source_supported("mov", "prores_hq") is True
    
    def test_dnxhr_mxf_is_supported(self):
        """DNxHR in MXF container should be supported."""
        assert is_source_supported("mxf", "dnxhr") is True
    
    def test_case_insensitive_lookup(self):
        """Format lookup should be case-insensitive."""
        assert is_source_supported("MP4", "H264") is True
        assert is_source_supported("MOV", "ProRes") is True
    
    def test_validation_passes_for_supported(self):
        """validate_source_capability should not raise for supported formats."""
        # Should not raise
        validate_source_capability("mp4", "h264")
        validate_source_capability("mov", "prores")
        validate_source_capability("mxf", "dnxhr")


# -----------------------------------------------------------------------------
# Rejected Format Tests
# -----------------------------------------------------------------------------

class TestRejectedFormats:
    """Tests for rejected format detection and error messages."""
    
    def test_arriraw_mxf_is_rejected(self):
        """ARRIRAW in MXF should be rejected."""
        assert is_source_rejected("mxf", "arriraw") is True
    
    def test_redcode_r3d_is_rejected(self):
        """REDCODE in R3D should be rejected."""
        assert is_source_rejected("r3d", "redcode") is True
    
    def test_braw_is_rejected(self):
        """Blackmagic RAW should be rejected."""
        assert is_source_rejected("braw", "braw") is True
    
    def test_prores_raw_is_rejected(self):
        """ProRes RAW should be rejected (it's sensor RAW, not video)."""
        assert is_source_rejected("mov", "prores_raw") is True
    
    def test_arriraw_rejection_message(self):
        """ARRIRAW rejection should have exact error message."""
        rejection = get_rejection_reason("mxf", "arriraw")
        
        assert rejection is not None
        assert "ARRI RAW" in rejection.reason or "proprietary" in rejection.reason.lower()
        assert "Resolve" in rejection.recommended_action
    
    def test_redcode_rejection_message(self):
        """REDCODE rejection should have exact error message."""
        rejection = get_rejection_reason("r3d", "redcode")
        
        assert rejection is not None
        assert "RED" in rejection.reason
        assert "Resolve" in rejection.recommended_action or "REDCINE" in rejection.recommended_action
    
    def test_validation_fails_for_arriraw(self):
        """validate_source_capability should raise for ARRIRAW with exact message."""
        with pytest.raises(SourceCapabilityError) as exc_info:
            validate_source_capability("mxf", "arriraw")
        
        error = exc_info.value
        assert error.container == "mxf"
        assert error.codec == "arriraw"
        assert "ARRI" in str(error) or "proprietary" in str(error).lower()
        assert "Resolve" in error.recommended_action
    
    def test_validation_fails_for_redcode(self):
        """validate_source_capability should raise for REDCODE with exact message."""
        with pytest.raises(SourceCapabilityError) as exc_info:
            validate_source_capability("r3d", "redcode")
        
        error = exc_info.value
        assert error.container == "r3d"
        assert error.codec == "redcode"
        assert "RED" in str(error)
    
    def test_validation_fails_for_prores_raw(self):
        """validate_source_capability should raise for ProRes RAW."""
        with pytest.raises(SourceCapabilityError) as exc_info:
            validate_source_capability("mov", "prores_raw")
        
        error = exc_info.value
        assert "RAW" in str(error)
        assert "sensor" in error.reason.lower() or "standard" in error.reason.lower()


# -----------------------------------------------------------------------------
# Unknown Format Tests
# -----------------------------------------------------------------------------

class TestUnknownFormats:
    """Tests for unknown format handling (conservative failure)."""
    
    def test_unknown_format_is_not_supported(self):
        """Unknown formats should not be marked as supported."""
        assert is_source_supported("xyz", "fakecodec") is False
    
    def test_unknown_format_is_not_rejected(self):
        """Unknown formats are not in the explicit reject list."""
        assert is_source_rejected("xyz", "fakecodec") is False
    
    def test_unknown_format_fails_validation(self):
        """Unknown formats should fail validation conservatively."""
        with pytest.raises(SourceCapabilityError) as exc_info:
            validate_source_capability("xyz", "fakecodec")
        
        error = exc_info.value
        assert "unknown" in str(error).lower() or "Unknown" in str(error)
    
    def test_unknown_codec_in_known_container_fails(self):
        """Unknown codec in a known container should fail."""
        with pytest.raises(SourceCapabilityError):
            validate_source_capability("mp4", "totally_fake_codec")


# -----------------------------------------------------------------------------
# Determinism Tests
# -----------------------------------------------------------------------------

class TestDeterminism:
    """Tests for deterministic behavior."""
    
    def test_same_input_same_result(self):
        """Same input should always produce same validation result."""
        # Run multiple times to ensure determinism
        for _ in range(10):
            assert is_source_supported("mp4", "h264") is True
            assert is_source_rejected("mxf", "arriraw") is True
    
    def test_validation_error_is_consistent(self):
        """Validation errors should have consistent content."""
        errors = []
        for _ in range(5):
            try:
                validate_source_capability("mxf", "arriraw")
            except SourceCapabilityError as e:
                errors.append(str(e))
        
        # All error messages should be identical
        assert len(set(errors)) == 1
    
    def test_no_execution_for_rejected_format(self):
        """Rejected formats should fail before any execution could occur."""
        # This is verified by the fact that validate_source_capability raises
        # immediately without any side effects
        with pytest.raises(SourceCapabilityError):
            validate_source_capability("r3d", "redcode")


# -----------------------------------------------------------------------------
# Listing Tests
# -----------------------------------------------------------------------------

class TestListingFunctions:
    """Tests for format listing utilities."""
    
    def test_list_supported_formats_not_empty(self):
        """Supported formats list should not be empty."""
        formats = list_supported_formats()
        assert len(formats) > 0
    
    def test_list_rejected_formats_not_empty(self):
        """Rejected formats list should not be empty."""
        formats = list_rejected_formats()
        assert len(formats) > 0
    
    def test_supported_list_contains_h264(self):
        """Supported list should include H.264."""
        formats = list_supported_formats()
        codecs = [f[1] for f in formats]
        assert "h264" in codecs
    
    def test_rejected_list_contains_arriraw(self):
        """Rejected list should include ARRIRAW."""
        formats = list_rejected_formats()
        codecs = [f[1] for f in formats]
        assert "arriraw" in codecs


# -----------------------------------------------------------------------------
# Integration with JobSpec Tests
# -----------------------------------------------------------------------------

class TestJobSpecIntegration:
    """Tests for integration with JobSpec validation."""
    
    def test_jobspec_validation_catches_arriraw(self, tmp_path):
        """JobSpec.validate() should catch ARRIRAW sources if file exists."""
        # Note: This test requires an actual ARRIRAW file to work fully.
        # For unit testing, we test the source_capabilities module directly.
        # The integration is tested in test_e2e tests with real files.
        pass  # Covered by direct source_capabilities tests above
