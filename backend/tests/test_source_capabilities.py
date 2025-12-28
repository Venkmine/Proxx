"""
Tests for V2 Source Capability Matrix - Format Validation and Engine Routing.

These tests verify:
1. Supported formats are accepted and route to FFmpeg
2. RAW formats are accepted and route to Resolve
3. Unknown formats fail conservatively
4. Mixed jobs (RAW + non-RAW) are rejected
5. Engine routing is deterministic

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
    RESOLVE_SOURCES,
    ExecutionEngine,
    SourceCapabilityError,
    is_source_supported,
    is_source_rejected,
    get_rejection_reason,
    get_execution_engine,
    is_resolve_required,
    validate_source_capability,
    normalize_format,
    list_supported_formats,
    list_resolve_formats,
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
        """validate_source_capability should return FFMPEG for supported formats."""
        assert validate_source_capability("mp4", "h264") == ExecutionEngine.FFMPEG
        assert validate_source_capability("mov", "prores") == ExecutionEngine.FFMPEG
        assert validate_source_capability("mxf", "dnxhr") == ExecutionEngine.FFMPEG


# -----------------------------------------------------------------------------
# Resolve-Routed Format Tests (RAW Formats)
# -----------------------------------------------------------------------------

class TestResolveRoutedFormats:
    """Tests for RAW format detection and Resolve engine routing."""
    
    def test_arriraw_routes_to_resolve(self):
        """ARRIRAW should route to Resolve engine."""
        engine = get_execution_engine("mxf", "arriraw")
        assert engine == ExecutionEngine.RESOLVE
    
    def test_redcode_routes_to_resolve(self):
        """RED REDCODE should route to Resolve engine."""
        engine = get_execution_engine("r3d", "redcode")
        assert engine == ExecutionEngine.RESOLVE
    
    def test_braw_routes_to_resolve(self):
        """Blackmagic RAW should route to Resolve engine."""
        engine = get_execution_engine("braw", "braw")
        assert engine == ExecutionEngine.RESOLVE
    
    def test_prores_raw_routes_to_resolve(self):
        """ProRes RAW should route to Resolve engine (it's sensor RAW)."""
        engine = get_execution_engine("mov", "prores_raw")
        assert engine == ExecutionEngine.RESOLVE
    
    def test_cinemadng_routes_to_resolve(self):
        """CinemaDNG should route to Resolve engine."""
        engine = get_execution_engine("dng", "cinemadng")
        assert engine == ExecutionEngine.RESOLVE
    
    def test_is_resolve_required_for_raw(self):
        """is_resolve_required should return True for RAW formats."""
        assert is_resolve_required("r3d", "redcode") is True
        assert is_resolve_required("braw", "braw") is True
        assert is_resolve_required("mxf", "arriraw") is True
    
    def test_is_resolve_required_false_for_standard(self):
        """is_resolve_required should return False for standard formats."""
        assert is_resolve_required("mp4", "h264") is False
        assert is_resolve_required("mov", "prores") is False
    
    def test_raw_formats_are_supported(self):
        """RAW formats should now be marked as supported (via Resolve)."""
        assert is_source_supported("r3d", "redcode") is True
        assert is_source_supported("braw", "braw") is True
        assert is_source_supported("mxf", "arriraw") is True
    
    def test_validation_returns_resolve_for_raw(self):
        """validate_source_capability should return RESOLVE for RAW formats."""
        assert validate_source_capability("r3d", "redcode") == ExecutionEngine.RESOLVE
        assert validate_source_capability("braw", "braw") == ExecutionEngine.RESOLVE
        assert validate_source_capability("mxf", "arriraw") == ExecutionEngine.RESOLVE


# -----------------------------------------------------------------------------
# Rejected Format Tests (Unsupported by both engines)
# -----------------------------------------------------------------------------

class TestRejectedFormats:
    """Tests for truly rejected formats (not supported by any engine)."""
    
    def test_rejected_sources_dict_structure(self):
        """REJECTED_SOURCES should be a valid dict (may be empty)."""
        assert isinstance(REJECTED_SOURCES, dict)


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
            assert get_execution_engine("r3d", "redcode") == ExecutionEngine.RESOLVE
    
    def test_engine_routing_is_consistent(self):
        """Engine routing should be deterministic."""
        engines = []
        for _ in range(5):
            engines.append(get_execution_engine("r3d", "redcode"))
        
        # All results should be identical
        assert all(e == ExecutionEngine.RESOLVE for e in engines)
    
    def test_no_user_override_for_engine(self):
        """Engine routing should not allow user override."""
        # RAW formats ALWAYS go to Resolve, regardless of any external factors
        assert get_execution_engine("r3d", "redcode") == ExecutionEngine.RESOLVE
        # Standard formats ALWAYS go to FFmpeg
        assert get_execution_engine("mp4", "h264") == ExecutionEngine.FFMPEG


# -----------------------------------------------------------------------------
# Listing Tests
# -----------------------------------------------------------------------------

class TestListingFunctions:
    """Tests for format listing utilities."""
    
    def test_list_supported_formats_not_empty(self):
        """Supported formats list should not be empty."""
        formats = list_supported_formats()
        assert len(formats) > 0
    
    def test_list_resolve_formats_not_empty(self):
        """Resolve formats list should not be empty."""
        formats = list_resolve_formats()
        assert len(formats) > 0
    
    def test_supported_list_contains_h264(self):
        """Supported list should include H.264."""
        formats = list_supported_formats()
        codecs = [f[1] for f in formats]
        assert "h264" in codecs
    
    def test_resolve_list_contains_arriraw(self):
        """Resolve list should include ARRIRAW."""
        formats = list_resolve_formats()
        codecs = [f[1] for f in formats]
        assert "arriraw" in codecs
    
    def test_resolve_list_contains_redcode(self):
        """Resolve list should include REDCODE."""
        formats = list_resolve_formats()
        codecs = [f[1] for f in formats]
        assert "redcode" in codecs


# -----------------------------------------------------------------------------
# Engine Routing Integration Tests
# -----------------------------------------------------------------------------

class TestEngineRouting:
    """Tests for execution engine routing based on source format."""
    
    def test_prores_routes_to_ffmpeg(self):
        """ProRes (standard, not RAW) should route to FFmpeg."""
        engine = get_execution_engine("mov", "prores")
        assert engine == ExecutionEngine.FFMPEG
    
    def test_h264_routes_to_ffmpeg(self):
        """H.264 should route to FFmpeg."""
        engine = get_execution_engine("mp4", "h264")
        assert engine == ExecutionEngine.FFMPEG
    
    def test_dnxhd_routes_to_ffmpeg(self):
        """DNxHD should route to FFmpeg."""
        engine = get_execution_engine("mxf", "dnxhd")
        assert engine == ExecutionEngine.FFMPEG
    
    def test_arriraw_routes_to_resolve(self):
        """ARRIRAW should route to Resolve."""
        engine = get_execution_engine("mxf", "arriraw")
        assert engine == ExecutionEngine.RESOLVE
    
    def test_redcode_routes_to_resolve(self):
        """REDCODE should route to Resolve."""
        engine = get_execution_engine("r3d", "redcode")
        assert engine == ExecutionEngine.RESOLVE
    
    def test_unknown_format_returns_none(self):
        """Unknown formats should return None for engine."""
        engine = get_execution_engine("xyz", "fakecodec")
        assert engine is None
    
    def test_unsupported_format_fails_validation(self):
        """Unsupported formats should fail validation with clear error."""
        with pytest.raises(SourceCapabilityError) as exc_info:
            validate_source_capability("xyz", "fakecodec")
        
        error = exc_info.value
        assert "unknown" in str(error).lower() or "Unknown" in str(error)
