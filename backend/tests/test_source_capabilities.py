"""
Tests for V2 Source Capability Matrix - Format Validation and Engine Routing.

These tests verify:
1. Supported formats are accepted and route to FFmpeg
2. RAW formats are accepted and route to Resolve
3. Unknown formats fail conservatively
4. Mixed jobs (RAW + non-RAW) are rejected
5. Engine routing is deterministic
6. All camera RAW formats route to Resolve
7. ffprobe 'unknown' codec routes to Resolve

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
    RAW_CODECS_RESOLVE,
    RAW_FORMAT_RESOLVE_REASON,
    RAW_FORMAT_RESOLVE_ACTION,
    ExecutionEngine,
    SourceCapabilityError,
    MixedEngineError,
    is_source_supported,
    is_source_rejected,
    is_raw_codec,
    get_rejection_reason,
    get_execution_engine,
    is_resolve_required,
    validate_source_capability,
    validate_job_engine_consistency,
    normalize_format,
    list_supported_formats,
    list_resolve_formats,
    list_rejected_formats,
    list_raw_codecs,
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
        """ProRes RAW should route to Resolve engine (proxy workflow only)."""
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


# -----------------------------------------------------------------------------
# Comprehensive Camera RAW Tests
# -----------------------------------------------------------------------------

class TestAllCameraRAWFormats:
    """Tests that ALL camera RAW formats route to Resolve."""
    
    # ARRI RAW
    def test_arriraw_mxf_routes_to_resolve(self):
        """ARRIRAW in MXF routes to Resolve."""
        assert get_execution_engine("mxf", "arriraw") == ExecutionEngine.RESOLVE
    
    def test_arriraw_ari_routes_to_resolve(self):
        """ARRIRAW in ARI container routes to Resolve."""
        assert get_execution_engine("ari", "arriraw") == ExecutionEngine.RESOLVE
    
    def test_arri_raw_alternate_routes_to_resolve(self):
        """arri_raw codec routes to Resolve."""
        assert get_execution_engine("mxf", "arri_raw") == ExecutionEngine.RESOLVE
    
    # RED RAW
    def test_redcode_r3d_routes_to_resolve(self):
        """REDCODE in R3D routes to Resolve."""
        assert get_execution_engine("r3d", "redcode") == ExecutionEngine.RESOLVE
    
    def test_redraw_routes_to_resolve(self):
        """redraw codec routes to Resolve."""
        assert get_execution_engine("r3d", "redraw") == ExecutionEngine.RESOLVE
    
    def test_red_raw_routes_to_resolve(self):
        """red_raw codec routes to Resolve."""
        assert get_execution_engine("r3d", "red_raw") == ExecutionEngine.RESOLVE
    
    # Blackmagic RAW
    def test_braw_routes_to_resolve(self):
        """BRAW routes to Resolve."""
        assert get_execution_engine("braw", "braw") == ExecutionEngine.RESOLVE
    
    def test_blackmagic_raw_routes_to_resolve(self):
        """blackmagic_raw codec routes to Resolve."""
        assert get_execution_engine("braw", "blackmagic_raw") == ExecutionEngine.RESOLVE
    
    # Sony RAW
    def test_sony_raw_routes_to_resolve(self):
        """Sony RAW routes to Resolve."""
        assert get_execution_engine("mxf", "sony_raw") == ExecutionEngine.RESOLVE
    
    def test_xocn_routes_to_resolve(self):
        """Sony X-OCN routes to Resolve."""
        assert get_execution_engine("mxf", "x-ocn") == ExecutionEngine.RESOLVE
    
    def test_xocn_alternate_routes_to_resolve(self):
        """xocn codec routes to Resolve."""
        assert get_execution_engine("mxf", "xocn") == ExecutionEngine.RESOLVE
    
    # Canon RAW
    def test_canon_raw_routes_to_resolve(self):
        """Canon RAW routes to Resolve."""
        assert get_execution_engine("crm", "canon_raw") == ExecutionEngine.RESOLVE
    
    def test_craw_routes_to_resolve(self):
        """craw codec routes to Resolve."""
        assert get_execution_engine("crm", "craw") == ExecutionEngine.RESOLVE
    
    def test_cinema_raw_light_routes_to_resolve(self):
        """Cinema RAW Light routes to Resolve."""
        assert get_execution_engine("crm", "cinema_raw_light") == ExecutionEngine.RESOLVE
    
    # Panasonic RAW
    def test_panasonic_raw_routes_to_resolve(self):
        """Panasonic RAW routes to Resolve."""
        assert get_execution_engine("vraw", "panasonic_raw") == ExecutionEngine.RESOLVE
    
    def test_vraw_routes_to_resolve(self):
        """V-RAW codec routes to Resolve."""
        assert get_execution_engine("vraw", "vraw") == ExecutionEngine.RESOLVE
    
    # Nikon N-RAW
    def test_nikon_raw_nev_routes_to_resolve(self):
        """Nikon N-RAW in NEV container routes to Resolve."""
        assert get_execution_engine("nev", "nikon_raw") == ExecutionEngine.RESOLVE
    
    def test_nraw_routes_to_resolve(self):
        """nraw codec routes to Resolve."""
        assert get_execution_engine("nev", "nraw") == ExecutionEngine.RESOLVE
    
    def test_nikon_raw_mov_routes_to_resolve(self):
        """Nikon N-RAW in MOV container routes to Resolve."""
        assert get_execution_engine("mov", "nikon_raw") == ExecutionEngine.RESOLVE
    
    # DJI RAW
    def test_dji_raw_mov_routes_to_resolve(self):
        """DJI RAW in MOV container routes to Resolve."""
        assert get_execution_engine("mov", "dji_raw") == ExecutionEngine.RESOLVE
    
    def test_dji_raw_dng_routes_to_resolve(self):
        """DJI RAW in DNG container routes to Resolve."""
        assert get_execution_engine("dng", "dji_raw") == ExecutionEngine.RESOLVE
    
    def test_djiraw_routes_to_resolve(self):
        """djiraw codec routes to Resolve."""
        assert get_execution_engine("mov", "djiraw") == ExecutionEngine.RESOLVE
    
    # ProRes RAW
    def test_prores_raw_routes_to_resolve(self):
        """ProRes RAW routes to Resolve."""
        assert get_execution_engine("mov", "prores_raw") == ExecutionEngine.RESOLVE
    
    def test_prores_raw_hq_routes_to_resolve(self):
        """ProRes RAW HQ routes to Resolve."""
        assert get_execution_engine("mov", "prores_raw_hq") == ExecutionEngine.RESOLVE
    
    # CinemaDNG
    def test_cinemadng_routes_to_resolve(self):
        """CinemaDNG routes to Resolve."""
        assert get_execution_engine("dng", "cinemadng") == ExecutionEngine.RESOLVE
    
    def test_cdng_routes_to_resolve(self):
        """cdng codec routes to Resolve."""
        assert get_execution_engine("dng", "cdng") == ExecutionEngine.RESOLVE


class TestUnknownCodecRouting:
    """Tests that ffprobe 'unknown' codec routes to Resolve."""
    
    def test_unknown_codec_routes_to_resolve(self):
        """codec_name='unknown' from ffprobe should route to Resolve."""
        engine = get_execution_engine("mxf", "unknown")
        assert engine == ExecutionEngine.RESOLVE
    
    def test_unknown_codec_any_container_routes_to_resolve(self):
        """Unknown codec in any container routes to Resolve."""
        assert get_execution_engine("mp4", "unknown") == ExecutionEngine.RESOLVE
        assert get_execution_engine("mov", "unknown") == ExecutionEngine.RESOLVE
        assert get_execution_engine("xyz", "unknown") == ExecutionEngine.RESOLVE
    
    def test_unknown_is_supported(self):
        """Unknown codec should be marked as supported (via Resolve)."""
        assert is_source_supported("mxf", "unknown") is True
    
    def test_unknown_requires_resolve(self):
        """Unknown codec should require Resolve."""
        assert is_resolve_required("mxf", "unknown") is True
    
    def test_unknown_validates_to_resolve(self):
        """Unknown codec should validate successfully to Resolve."""
        engine = validate_source_capability("mxf", "unknown")
        assert engine == ExecutionEngine.RESOLVE


class TestIsRawCodecFunction:
    """Tests for the is_raw_codec() helper function."""
    
    def test_arriraw_is_raw(self):
        """arriraw is a RAW codec."""
        assert is_raw_codec("arriraw") is True
    
    def test_redcode_is_raw(self):
        """redcode is a RAW codec."""
        assert is_raw_codec("redcode") is True
    
    def test_braw_is_raw(self):
        """braw is a RAW codec."""
        assert is_raw_codec("braw") is True
    
    def test_unknown_is_raw(self):
        """unknown is treated as RAW."""
        assert is_raw_codec("unknown") is True
    
    def test_h264_is_not_raw(self):
        """h264 is not a RAW codec."""
        assert is_raw_codec("h264") is False
    
    def test_prores_is_not_raw(self):
        """prores (standard) is not a RAW codec."""
        assert is_raw_codec("prores") is False
    
    def test_prores_raw_is_raw(self):
        """prores_raw IS a RAW codec."""
        assert is_raw_codec("prores_raw") is True
    
    def test_case_insensitive(self):
        """is_raw_codec should be case-insensitive."""
        assert is_raw_codec("ARRIRAW") is True
        assert is_raw_codec("Redcode") is True
        assert is_raw_codec("BRAW") is True


class TestMixedEngineValidation:
    """Tests for mixed RAW + non-RAW job rejection."""
    
    def test_all_ffmpeg_sources_valid(self):
        """All FFmpeg sources should validate successfully."""
        sources = [
            ("/path/clip1.mov", "mov", "prores"),
            ("/path/clip2.mp4", "mp4", "h264"),
            ("/path/clip3.mxf", "mxf", "dnxhd"),
        ]
        engine = validate_job_engine_consistency(sources)
        assert engine == ExecutionEngine.FFMPEG
    
    def test_all_resolve_sources_valid(self):
        """All Resolve sources should validate successfully."""
        sources = [
            ("/path/clip1.r3d", "r3d", "redcode"),
            ("/path/clip2.braw", "braw", "braw"),
            ("/path/clip3.ari", "ari", "arriraw"),
        ]
        engine = validate_job_engine_consistency(sources)
        assert engine == ExecutionEngine.RESOLVE
    
    def test_mixed_sources_rejected(self):
        """Mixed RAW + non-RAW sources should raise MixedEngineError."""
        sources = [
            ("/path/clip1.r3d", "r3d", "redcode"),  # Resolve
            ("/path/clip2.mov", "mov", "prores"),   # FFmpeg
        ]
        with pytest.raises(MixedEngineError) as exc_info:
            validate_job_engine_consistency(sources)
        
        error = exc_info.value
        assert len(error.ffmpeg_sources) == 1
        assert len(error.resolve_sources) == 1
        assert "different engines" in str(error)
    
    def test_mixed_sources_counts_correct(self):
        """MixedEngineError should have correct source counts."""
        sources = [
            ("/path/clip1.r3d", "r3d", "redcode"),
            ("/path/clip2.braw", "braw", "braw"),
            ("/path/clip3.mov", "mov", "prores"),
            ("/path/clip4.mp4", "mp4", "h264"),
            ("/path/clip5.mxf", "mxf", "dnxhd"),
        ]
        with pytest.raises(MixedEngineError) as exc_info:
            validate_job_engine_consistency(sources)
        
        error = exc_info.value
        assert len(error.resolve_sources) == 2  # redcode, braw
        assert len(error.ffmpeg_sources) == 3   # prores, h264, dnxhd
    
    def test_empty_sources_raises_error(self):
        """Empty source list should raise ValueError."""
        with pytest.raises(ValueError):
            validate_job_engine_consistency([])
    
    def test_single_ffmpeg_source_valid(self):
        """Single FFmpeg source should validate."""
        sources = [("/path/clip.mov", "mov", "prores")]
        engine = validate_job_engine_consistency(sources)
        assert engine == ExecutionEngine.FFMPEG
    
    def test_single_resolve_source_valid(self):
        """Single Resolve source should validate."""
        sources = [("/path/clip.r3d", "r3d", "redcode")]
        engine = validate_job_engine_consistency(sources)
        assert engine == ExecutionEngine.RESOLVE


class TestListRawCodecs:
    """Tests for list_raw_codecs() utility."""
    
    def test_returns_sorted_list(self):
        """list_raw_codecs should return a sorted list."""
        codecs = list_raw_codecs()
        assert codecs == sorted(codecs)
    
    def test_contains_all_major_raw_formats(self):
        """list_raw_codecs should contain all major RAW formats."""
        codecs = list_raw_codecs()
        assert "arriraw" in codecs
        assert "redcode" in codecs
        assert "braw" in codecs
        assert "prores_raw" in codecs
        assert "unknown" in codecs
    
    def test_does_not_contain_standard_codecs(self):
        """list_raw_codecs should not contain standard codecs."""
        codecs = list_raw_codecs()
        assert "h264" not in codecs
        assert "prores" not in codecs
        assert "dnxhd" not in codecs


class TestDynamicRawRouting:
    """Tests for dynamic RAW codec routing (not in explicit RESOLVE_SOURCES)."""
    
    def test_raw_codec_unknown_container_routes_to_resolve(self):
        """RAW codec in unknown container should still route to Resolve."""
        # arriraw in a container not explicitly listed
        engine = get_execution_engine("foo", "arriraw")
        assert engine == ExecutionEngine.RESOLVE
    
    def test_raw_codec_routes_even_without_explicit_entry(self):
        """RAW codecs route to Resolve even without explicit container/codec entry."""
        # These codecs are in RAW_CODECS_RESOLVE but might not have explicit entries
        assert get_execution_engine("mov", "varicam_raw") == ExecutionEngine.RESOLVE
        assert get_execution_engine("any", "nikon_nraw") == ExecutionEngine.RESOLVE
        assert get_execution_engine("any", "zenmuse_raw") == ExecutionEngine.RESOLVE
    
    def test_is_supported_for_dynamic_raw(self):
        """is_source_supported should return True for any RAW codec."""
        assert is_source_supported("foo", "arriraw") is True
        assert is_source_supported("bar", "redcode") is True
        assert is_source_supported("baz", "braw") is True


# -----------------------------------------------------------------------------
# DNxHD/DNxHR Container Restriction Tests
# -----------------------------------------------------------------------------

class TestDNxContainerRestrictions:
    """
    Tests for DNxHD and DNxHR container restrictions.
    
    Rules:
    - DNxHD: MXF only (industry standard)
    - DNxHR: MXF or MOV (modern codec with cross-platform support)
    """
    
    # -------------------------------------------------------------------------
    # DNxHD Source Format Tests
    # -------------------------------------------------------------------------
    
    def test_dnxhd_mxf_is_supported(self):
        """DNxHD in MXF is supported (industry standard)."""
        assert is_source_supported("mxf", "dnxhd") is True
    
    def test_dnxhd_mxf_routes_to_ffmpeg(self):
        """DNxHD in MXF routes to FFmpeg."""
        engine = get_execution_engine("mxf", "dnxhd")
        assert engine == ExecutionEngine.FFMPEG
    
    def test_dnxhd_mov_is_rejected(self):
        """DNxHD in MOV is NOT supported (non-standard)."""
        assert is_source_supported("mov", "dnxhd") is False
    
    def test_dnxhd_mov_is_explicitly_rejected(self):
        """DNxHD in MOV is in REJECTED_SOURCES."""
        assert is_source_rejected("mov", "dnxhd") is True
    
    def test_dnxhd_mov_has_rejection_reason(self):
        """DNxHD in MOV has a clear rejection reason."""
        reason = get_rejection_reason("mov", "dnxhd")
        assert reason is not None
        assert "MXF" in reason.reason or "non-standard" in reason.reason.lower()
    
    def test_dnxhd_mov_validation_fails(self):
        """DNxHD in MOV fails validation with clear error."""
        with pytest.raises(SourceCapabilityError) as exc_info:
            validate_source_capability("mov", "dnxhd")
        
        error = exc_info.value
        assert "MXF" in str(error)
        assert "non-standard" in str(error).lower() or "unsupported" in str(error).lower()
    
    def test_dnxhd_mov_error_has_recommended_action(self):
        """DNxHD in MOV error includes recommended action."""
        with pytest.raises(SourceCapabilityError) as exc_info:
            validate_source_capability("mov", "dnxhd")
        
        error = exc_info.value
        assert error.recommended_action is not None
        assert len(error.recommended_action) > 0
        # Should suggest using MXF or DNxHR
        assert "MXF" in error.recommended_action or "DNxHR" in error.recommended_action
    
    # -------------------------------------------------------------------------
    # DNxHR Source Format Tests
    # -------------------------------------------------------------------------
    
    def test_dnxhr_mxf_is_supported(self):
        """DNxHR in MXF is supported (modern broadcast)."""
        assert is_source_supported("mxf", "dnxhr") is True
    
    def test_dnxhr_mxf_routes_to_ffmpeg(self):
        """DNxHR in MXF routes to FFmpeg."""
        engine = get_execution_engine("mxf", "dnxhr")
        assert engine == ExecutionEngine.FFMPEG
    
    def test_dnxhr_mov_is_supported(self):
        """DNxHR in MOV is supported (cross-platform flexibility)."""
        assert is_source_supported("mov", "dnxhr") is True
    
    def test_dnxhr_mov_routes_to_ffmpeg(self):
        """DNxHR in MOV routes to FFmpeg."""
        engine = get_execution_engine("mov", "dnxhr")
        assert engine == ExecutionEngine.FFMPEG
    
    def test_dnxhr_mov_validation_passes(self):
        """DNxHR in MOV passes validation."""
        engine = validate_source_capability("mov", "dnxhr")
        assert engine == ExecutionEngine.FFMPEG
    
    # -------------------------------------------------------------------------
    # Error Message Quality Tests
    # -------------------------------------------------------------------------
    
    def test_dnxhd_mov_error_is_deterministic(self):
        """DNxHD in MOV error message is deterministic."""
        errors = []
        for _ in range(5):
            try:
                validate_source_capability("mov", "dnxhd")
            except SourceCapabilityError as e:
                errors.append(str(e))
        
        # All error messages should be identical
        assert all(e == errors[0] for e in errors)
    
    def test_dnxhd_mov_error_is_actionable(self):
        """DNxHD in MOV error message is actionable."""
        with pytest.raises(SourceCapabilityError) as exc_info:
            validate_source_capability("mov", "dnxhd")
        
        error = exc_info.value
        # Error should contain clear guidance
        error_str = str(error)
        assert "DNxHD" in error_str
        assert "MXF" in error_str or "DNxHR" in error_str

# -----------------------------------------------------------------------------
# ProRes Routing Guard Tests (MANDATORY)
# -----------------------------------------------------------------------------
# These tests lock the following engine routing behaviors:
# - .mov + codec=prores_raw     → Resolve (proxy generation only)
# - .mov + codec=prores_422/4444 → FFmpeg (standard ProRes)
# - .mov + unrecognized codec    → BLOCK (validation fails)
#
# These tests are DETERMINISTIC and do NOT invoke Resolve or FFmpeg.
# They assert ENGINE SELECTION ONLY.
# -----------------------------------------------------------------------------

class TestProResRoutingGuards:
    """
    Mandatory routing guard tests for ProRes codec variants.
    
    These tests lock the critical distinction between:
    - ProRes RAW (sensor RAW) → Resolve engine (proxy generation supported)
    - ProRes 422/4444 (standard) → FFmpeg engine (full support)
    - Unrecognized codecs → validation failure (blocked)
    
    NOTE: ProRes RAW support is LIMITED to Resolve-based proxy generation.
    It is NOT supported as a creative or grading format in Resolve.
    """
    
    # -------------------------------------------------------------------------
    # ProRes RAW → Resolve (Proxy Generation Only)
    # -------------------------------------------------------------------------
    
    def test_prores_raw_mov_routes_to_resolve(self):
        """mov + prores_raw → Resolve engine."""
        engine = get_execution_engine("mov", "prores_raw")
        assert engine == ExecutionEngine.RESOLVE
    
    def test_prores_raw_hq_mov_routes_to_resolve(self):
        """mov + prores_raw_hq → Resolve engine."""
        engine = get_execution_engine("mov", "prores_raw_hq")
        assert engine == ExecutionEngine.RESOLVE
    
    def test_prores_raw_aprn_routes_to_resolve(self):
        """mov + aprn (ProRes RAW fourcc) → Resolve engine."""
        engine = get_execution_engine("mov", "aprn")
        assert engine == ExecutionEngine.RESOLVE
    
    def test_prores_raw_aprh_routes_to_resolve(self):
        """mov + aprh (ProRes RAW HQ fourcc) → Resolve engine."""
        engine = get_execution_engine("mov", "aprh")
        assert engine == ExecutionEngine.RESOLVE
    
    def test_proresraw_no_underscore_routes_to_resolve(self):
        """mov + proresraw (no underscore) → Resolve engine."""
        engine = get_execution_engine("mov", "proresraw")
        assert engine == ExecutionEngine.RESOLVE
    
    def test_proresrawhq_no_underscore_routes_to_resolve(self):
        """mov + proresrawhq (no underscore) → Resolve engine."""
        engine = get_execution_engine("mov", "proresrawhq")
        assert engine == ExecutionEngine.RESOLVE
    
    # -------------------------------------------------------------------------
    # Standard ProRes (422/4444 variants) → FFmpeg
    # -------------------------------------------------------------------------
    
    def test_prores_mov_routes_to_ffmpeg(self):
        """mov + prores (generic) → FFmpeg engine."""
        engine = get_execution_engine("mov", "prores")
        assert engine == ExecutionEngine.FFMPEG
    
    def test_prores_422_mov_routes_to_ffmpeg(self):
        """mov + prores_422 → FFmpeg engine."""
        engine = get_execution_engine("mov", "prores_422")
        assert engine == ExecutionEngine.FFMPEG
    
    def test_prores_4444_mov_routes_to_ffmpeg(self):
        """mov + prores_4444 → FFmpeg engine."""
        engine = get_execution_engine("mov", "prores_4444")
        assert engine == ExecutionEngine.FFMPEG
    
    def test_prores_4444xq_mov_routes_to_ffmpeg(self):
        """mov + prores_4444xq → FFmpeg engine."""
        engine = get_execution_engine("mov", "prores_4444xq")
        assert engine == ExecutionEngine.FFMPEG
    
    def test_prores_hq_mov_routes_to_ffmpeg(self):
        """mov + prores_hq → FFmpeg engine."""
        engine = get_execution_engine("mov", "prores_hq")
        assert engine == ExecutionEngine.FFMPEG
    
    def test_prores_lt_mov_routes_to_ffmpeg(self):
        """mov + prores_lt → FFmpeg engine."""
        engine = get_execution_engine("mov", "prores_lt")
        assert engine == ExecutionEngine.FFMPEG
    
    def test_prores_proxy_mov_routes_to_ffmpeg(self):
        """mov + prores_proxy → FFmpeg engine."""
        engine = get_execution_engine("mov", "prores_proxy")
        assert engine == ExecutionEngine.FFMPEG
    
    # -------------------------------------------------------------------------
    # Unrecognized Codec in MOV → BLOCK
    # -------------------------------------------------------------------------
    
    def test_mov_unrecognized_codec_returns_none(self):
        """mov + unrecognized_codec → None (no engine)."""
        engine = get_execution_engine("mov", "totally_fake_codec_xyz")
        assert engine is None
    
    def test_mov_unrecognized_codec_validation_fails(self):
        """mov + unrecognized_codec → validation failure."""
        with pytest.raises(SourceCapabilityError):
            validate_source_capability("mov", "totally_fake_codec_xyz")
    
    def test_mov_unrecognized_codec_not_supported(self):
        """mov + unrecognized_codec → is_source_supported returns False."""
        assert is_source_supported("mov", "totally_fake_codec_xyz") is False
    
    # -------------------------------------------------------------------------
    # Routing Determinism (Critical for reliability)
    # -------------------------------------------------------------------------
    
    def test_prores_raw_routing_is_deterministic(self):
        """ProRes RAW routing must be deterministic across repeated calls."""
        engines = [get_execution_engine("mov", "prores_raw") for _ in range(10)]
        assert all(e == ExecutionEngine.RESOLVE for e in engines)
    
    def test_prores_422_routing_is_deterministic(self):
        """ProRes 422 routing must be deterministic across repeated calls."""
        engines = [get_execution_engine("mov", "prores_422") for _ in range(10)]
        assert all(e == ExecutionEngine.FFMPEG for e in engines)
    
    def test_prores_4444_routing_is_deterministic(self):
        """ProRes 4444 routing must be deterministic across repeated calls."""
        engines = [get_execution_engine("mov", "prores_4444") for _ in range(10)]
        assert all(e == ExecutionEngine.FFMPEG for e in engines)
    
    # -------------------------------------------------------------------------
    # ProRes RAW Classification Assertions
    # -------------------------------------------------------------------------
    
    def test_prores_raw_is_classified_as_raw(self):
        """prores_raw must be classified as a RAW codec."""
        assert is_raw_codec("prores_raw") is True
    
    def test_prores_raw_hq_is_classified_as_raw(self):
        """prores_raw_hq must be classified as a RAW codec."""
        assert is_raw_codec("prores_raw_hq") is True
    
    def test_prores_422_is_not_raw(self):
        """prores_422 must NOT be classified as a RAW codec."""
        assert is_raw_codec("prores_422") is False
    
    def test_prores_4444_is_not_raw(self):
        """prores_4444 must NOT be classified as a RAW codec."""
        assert is_raw_codec("prores_4444") is False
    
    def test_prores_generic_is_not_raw(self):
        """prores (generic) must NOT be classified as a RAW codec."""
        assert is_raw_codec("prores") is False


# =============================================================================
# OpenEXR Routing Guards
# =============================================================================
# EXR is NOT a camera RAW format, but it MUST route to Resolve because:
# - FFmpeg cannot reliably handle high-bit-depth EXR sequences
# - Resolve has native OpenEXR support with proper colorspace handling
#
# CONSTRAINTS:
# - exr + exr → Resolve engine (deterministic)
# - Proxy generation only (no creative grading controls)
# - Image sequence handling (one folder = one job)
# =============================================================================

class TestEXRRoutingGuards:
    """
    Enforce EXR routing determinism (NOT FFmpeg, MUST be Resolve).
    
    PURPOSE:
    - Prevent FFmpeg from attempting EXR sequence processing
    - Ensure EXR sequences use Resolve's native OpenEXR decoder
    - Lock proxy-only expectations (no grading controls)
    
    POLICY:
    - exr + exr → Resolve (high-bit-depth support)
    - Unrecognized container + exr → BLOCK (no guessing)
    
    These tests use MOCKED data only (no engine invocation).
    """
    
    # -------------------------------------------------------------------------
    # EXR Image Sequence → Resolve
    # -------------------------------------------------------------------------
    
    def test_exr_exr_is_supported(self):
        """exr + exr is supported (Resolve-based)."""
        assert is_source_supported("exr", "exr") is True
    
    def test_exr_exr_routes_to_resolve(self):
        """exr + exr → Resolve engine (NOT FFmpeg)."""
        engine = get_execution_engine("exr", "exr")
        assert engine == ExecutionEngine.RESOLVE
    
    def test_exr_exr_not_ffmpeg(self):
        """exr + exr must NOT route to FFmpeg."""
        engine = get_execution_engine("exr", "exr")
        assert engine != ExecutionEngine.FFMPEG
    
    def test_exr_exr_validation_succeeds(self):
        """exr + exr passes validation."""
        # Should not raise exception
        validate_source_capability("exr", "exr")
    
    def test_exr_exr_has_capability_entry(self):
        """exr + exr has a SourceCapability entry in RESOLVE_SOURCES."""
        from backend.v2.source_capabilities import RESOLVE_SOURCES
        assert ("exr", "exr") in RESOLVE_SOURCES
    
    def test_exr_exr_capability_has_reason(self):
        """exr + exr capability entry has a descriptive reason."""
        from backend.v2.source_capabilities import RESOLVE_SOURCES
        capability = RESOLVE_SOURCES[("exr", "exr")]
        assert capability.reason is not None
        assert len(capability.reason) > 0
        assert "exr" in capability.reason.lower() or "openexr" in capability.reason.lower()
    
    def test_exr_exr_capability_engine_is_resolve(self):
        """exr + exr capability entry explicitly sets engine=RESOLVE."""
        from backend.v2.source_capabilities import RESOLVE_SOURCES
        capability = RESOLVE_SOURCES[("exr", "exr")]
        assert capability.engine == ExecutionEngine.RESOLVE
    
    # -------------------------------------------------------------------------
    # Unrecognized Container + EXR → Still Routes to Resolve
    # -------------------------------------------------------------------------
    # NOTE: Because 'exr' is in RAW_CODECS_RESOLVE, the routing logic will
    # route ANY container + exr to Resolve (codec takes precedence).
    # This is correct behavior - we want EXR to always go to Resolve.
    
    def test_mov_exr_routes_to_resolve(self):
        """mov + exr → Resolve (codec takes precedence)."""
        engine = get_execution_engine("mov", "exr")
        assert engine == ExecutionEngine.RESOLVE
    
    def test_mov_exr_validation_succeeds(self):
        """mov + exr → validation succeeds (codec in RAW_CODECS_RESOLVE)."""
        # Should not raise exception
        validate_source_capability("mov", "exr")
    
    def test_mov_exr_is_supported(self):
        """mov + exr → is_source_supported returns True (codec in RAW_CODECS_RESOLVE)."""
        assert is_source_supported("mov", "exr") is True
    
    # -------------------------------------------------------------------------
    # Routing Determinism (Critical for reliability)
    # -------------------------------------------------------------------------
    
    def test_exr_routing_is_deterministic(self):
        """EXR routing must be deterministic across repeated calls."""
        engines = [get_execution_engine("exr", "exr") for _ in range(10)]
        assert all(e == ExecutionEngine.RESOLVE for e in engines)
    
    # -------------------------------------------------------------------------
    # EXR Classification Assertions
    # -------------------------------------------------------------------------
    
    def test_exr_is_classified_as_raw(self):
        """exr must be in RAW_CODECS_RESOLVE (even though it's not technically RAW)."""
        assert is_raw_codec("exr") is True
    
    def test_exr_in_raw_codecs_set(self):
        """exr must be present in RAW_CODECS_RESOLVE set."""
        from backend.v2.source_capabilities import RAW_CODECS_RESOLVE
        assert "exr" in RAW_CODECS_RESOLVE
