"""
Routing Matrix Tests - Deterministic engine selection verification.

Tests verify that engine routing is:
- Deterministic (same input → same output, every time)
- Explicit (no guessing, no heuristics)
- Honest (fails loudly when ambiguous)

NO USER OVERRIDE. NO PARTIAL SUCCESS. NO SILENT FALLBACK.

Part of Forge Verification System.
"""

import pytest
import sys
from pathlib import Path
from typing import List, Tuple, Optional

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "backend"))

from v2.source_capabilities import (
    ExecutionEngine,
    get_execution_engine,
    validate_source_capability,
    is_source_supported,
    is_source_rejected,
    is_raw_codec,
    validate_job_engine_consistency,
    MixedEngineError,
    SourceCapabilityError,
    RAW_CODECS_RESOLVE,
    SUPPORTED_SOURCES,
    RESOLVE_SOURCES,
)


# =============================================================================
# TEST: RAW-only jobs route to Resolve
# =============================================================================

class TestRawOnlyRouting:
    """RAW-only sources MUST route to Resolve. No exceptions."""
    
    @pytest.mark.parametrize("container,codec", [
        # ARRI RAW
        ("mxf", "arriraw"),
        ("ari", "arriraw"),
        
        # RED RAW
        ("r3d", "redcode"),
        ("r3d", "r3d"),
        
        # Blackmagic RAW
        ("braw", "braw"),
        
        # Sony RAW
        ("mxf", "x-ocn"),
        ("mxf", "xocn"),
        
        # Canon RAW
        ("crm", "canon_raw"),
        ("crm", "cinema_raw_light"),
        
        # ProRes RAW
        ("mov", "prores_raw"),
        ("mov", "prores_raw_hq"),
        
        # CinemaDNG
        ("dng", "cinemadng"),
        
        # OpenEXR (routed to Resolve)
        ("exr", "exr"),
    ])
    def test_raw_format_routes_to_resolve(self, container: str, codec: str):
        """Individual RAW format MUST route to Resolve."""
        engine = get_execution_engine(container, codec)
        
        assert engine == ExecutionEngine.RESOLVE, (
            f"ROUTING FAILURE: {codec} in {container} routed to {engine}, expected RESOLVE. "
            f"RAW formats MUST use Resolve. This is a critical routing bug."
        )
    
    def test_raw_only_job_routes_to_resolve(self):
        """Job with ONLY RAW sources MUST route entirely to Resolve."""
        sources = [
            ("/path/to/file1.braw", "braw", "braw"),
            ("/path/to/file2.r3d", "r3d", "redcode"),
            ("/path/to/file3.ari", "ari", "arriraw"),
        ]
        
        engine = validate_job_engine_consistency(sources)
        
        assert engine == ExecutionEngine.RESOLVE, (
            f"ROUTING FAILURE: RAW-only job routed to {engine}, expected RESOLVE."
        )
    
    def test_all_raw_codecs_route_to_resolve(self):
        """Every codec in RAW_CODECS_RESOLVE MUST route to Resolve."""
        failures = []
        
        for codec in RAW_CODECS_RESOLVE:
            # Use generic container - codec takes priority in routing
            engine = get_execution_engine("mov", codec)
            
            if engine != ExecutionEngine.RESOLVE:
                failures.append(f"{codec} → {engine}")
        
        assert not failures, (
            f"ROUTING FAILURES: These RAW codecs did not route to Resolve:\n"
            + "\n".join(failures)
        )


# =============================================================================
# TEST: Non-RAW jobs route to FFmpeg
# =============================================================================

class TestNonRawRouting:
    """Non-RAW sources MUST route to FFmpeg. No exceptions."""
    
    @pytest.mark.parametrize("container,codec", [
        # H.264
        ("mp4", "h264"),
        ("mov", "h264"),
        ("mkv", "h264"),
        
        # H.265/HEVC
        ("mp4", "hevc"),
        ("mov", "hevc"),
        ("mp4", "h265"),
        
        # ProRes (NOT ProRes RAW)
        ("mov", "prores"),
        ("mov", "prores_422"),
        ("mov", "prores_hq"),
        ("mov", "prores_lt"),
        ("mov", "prores_proxy"),
        
        # DNxHD/DNxHR
        ("mxf", "dnxhd"),
        ("mxf", "dnxhr"),
        ("mov", "dnxhr"),
        
        # VP9/AV1
        ("webm", "vp9"),
        ("mp4", "av1"),
        
        # MPEG-2
        ("mpg", "mpeg2video"),
        ("ts", "mpeg2video"),
    ])
    def test_standard_format_routes_to_ffmpeg(self, container: str, codec: str):
        """Individual standard format MUST route to FFmpeg."""
        engine = get_execution_engine(container, codec)
        
        assert engine == ExecutionEngine.FFMPEG, (
            f"ROUTING FAILURE: {codec} in {container} routed to {engine}, expected FFMPEG. "
            f"Standard formats MUST use FFmpeg. This is a critical routing bug."
        )
    
    def test_non_raw_only_job_routes_to_ffmpeg(self):
        """Job with ONLY non-RAW sources MUST route entirely to FFmpeg."""
        sources = [
            ("/path/to/file1.mp4", "mp4", "h264"),
            ("/path/to/file2.mov", "mov", "prores"),
            ("/path/to/file3.mxf", "mxf", "dnxhd"),
        ]
        
        engine = validate_job_engine_consistency(sources)
        
        assert engine == ExecutionEngine.FFMPEG, (
            f"ROUTING FAILURE: Non-RAW job routed to {engine}, expected FFMPEG."
        )
    
    def test_all_supported_sources_route_to_ffmpeg(self):
        """Every entry in SUPPORTED_SOURCES MUST route to FFmpeg."""
        failures = []
        
        for (container, codec) in SUPPORTED_SOURCES.keys():
            engine = get_execution_engine(container, codec)
            
            if engine != ExecutionEngine.FFMPEG:
                failures.append(f"{container}/{codec} → {engine}")
        
        assert not failures, (
            f"ROUTING FAILURES: These standard formats did not route to FFmpeg:\n"
            + "\n".join(failures)
        )


# =============================================================================
# TEST: Mixed jobs FAIL explicitly
# =============================================================================

class TestMixedJobRejection:
    """Mixed RAW + non-RAW jobs MUST fail with explicit error. No partial processing."""
    
    def test_mixed_raw_and_nonraw_fails(self):
        """Job containing both RAW and non-RAW MUST be rejected."""
        sources = [
            ("/path/to/video.mp4", "mp4", "h264"),       # FFmpeg
            ("/path/to/raw.braw", "braw", "braw"),       # Resolve
        ]
        
        with pytest.raises(MixedEngineError) as excinfo:
            validate_job_engine_consistency(sources)
        
        error = excinfo.value
        assert len(error.ffmpeg_sources) == 1, "Should identify 1 FFmpeg source"
        assert len(error.resolve_sources) == 1, "Should identify 1 Resolve source"
        assert "video.mp4" in error.ffmpeg_sources[0]
        assert "raw.braw" in error.resolve_sources[0]
    
    def test_mixed_prores_and_prores_raw_fails(self):
        """ProRes and ProRes RAW MUST NOT be mixed."""
        sources = [
            ("/path/to/standard.mov", "mov", "prores"),      # FFmpeg
            ("/path/to/raw.mov", "mov", "prores_raw"),       # Resolve
        ]
        
        with pytest.raises(MixedEngineError) as excinfo:
            validate_job_engine_consistency(sources)
        
        assert "standard.mov" in excinfo.value.ffmpeg_sources[0]
        assert "raw.mov" in excinfo.value.resolve_sources[0]
    
    def test_mixed_job_error_names_files(self):
        """Mixed job error MUST explicitly name the conflicting files."""
        sources = [
            ("/path/to/edit1.mp4", "mp4", "h264"),
            ("/path/to/edit2.mov", "mov", "prores"),
            ("/path/to/cinema1.braw", "braw", "braw"),
            ("/path/to/cinema2.r3d", "r3d", "redcode"),
        ]
        
        with pytest.raises(MixedEngineError) as excinfo:
            validate_job_engine_consistency(sources)
        
        error = excinfo.value
        assert len(error.ffmpeg_sources) == 2, "Should identify 2 FFmpeg sources"
        assert len(error.resolve_sources) == 2, "Should identify 2 Resolve sources"
    
    def test_no_partial_job_creation_on_mixed(self):
        """Mixed job MUST not create ANY output or partial job state."""
        sources = [
            ("/path/to/file.mp4", "mp4", "h264"),
            ("/path/to/file.braw", "braw", "braw"),
        ]
        
        # This test documents the requirement:
        # When validate_job_engine_consistency raises MixedEngineError,
        # the caller MUST NOT proceed with job creation.
        with pytest.raises(MixedEngineError):
            validate_job_engine_consistency(sources)


# =============================================================================
# TEST: Unsupported formats FAIL explicitly
# =============================================================================

class TestUnsupportedFormatRejection:
    """Unsupported formats MUST fail with clear error. No silent skip."""
    
    def test_rejected_format_raises_error(self):
        """Explicitly rejected format MUST raise SourceCapabilityError."""
        # DNxHD in MOV is explicitly rejected
        with pytest.raises(SourceCapabilityError) as excinfo:
            validate_source_capability("mov", "dnxhd")
        
        error = excinfo.value
        assert error.container == "mov"
        assert error.codec == "dnxhd"
        assert "MXF" in error.recommended_action, "Should recommend MXF container"
    
    def test_unknown_format_raises_error(self):
        """Unknown format MUST raise SourceCapabilityError."""
        with pytest.raises(SourceCapabilityError) as excinfo:
            validate_source_capability("xyz", "made_up_codec")
        
        error = excinfo.value
        assert "Unknown" in error.reason
    
    def test_unsupported_format_returns_none(self):
        """get_execution_engine MUST return None for unknown formats."""
        engine = get_execution_engine("xyz", "made_up_codec")
        
        assert engine is None, (
            f"Unknown format returned {engine}, expected None. "
            f"Unknown formats must not silently route anywhere."
        )
    
    def test_rejected_format_returns_none(self):
        """get_execution_engine MUST return None for rejected formats."""
        engine = get_execution_engine("mov", "dnxhd")
        
        assert engine is None, (
            f"Rejected format (DNxHD in MOV) returned {engine}, expected None. "
            f"Rejected formats must not silently route anywhere."
        )


# =============================================================================
# TEST: Routing is deterministic
# =============================================================================

class TestRoutingDeterminism:
    """Same input MUST produce same output. Every time. No exceptions."""
    
    def test_same_format_same_result_100_times(self):
        """Call routing 100 times - result MUST be identical every time."""
        test_cases = [
            ("mp4", "h264", ExecutionEngine.FFMPEG),
            ("braw", "braw", ExecutionEngine.RESOLVE),
            ("mov", "prores", ExecutionEngine.FFMPEG),
            ("r3d", "redcode", ExecutionEngine.RESOLVE),
        ]
        
        for container, codec, expected in test_cases:
            results = set()
            for _ in range(100):
                engine = get_execution_engine(container, codec)
                results.add(engine)
            
            assert len(results) == 1, (
                f"DETERMINISM FAILURE: {container}/{codec} returned {len(results)} "
                f"different results across 100 calls. Routing MUST be deterministic."
            )
            assert expected in results
    
    def test_job_routing_deterministic(self):
        """Job routing MUST be deterministic across multiple calls."""
        sources = [
            ("/path/a.mp4", "mp4", "h264"),
            ("/path/b.mov", "mov", "prores"),
        ]
        
        results = set()
        for _ in range(100):
            engine = validate_job_engine_consistency(sources)
            results.add(engine)
        
        assert len(results) == 1, "Job routing must be deterministic"
        assert ExecutionEngine.FFMPEG in results


# =============================================================================
# TEST: Edge cases and boundary conditions
# =============================================================================

class TestRoutingEdgeCases:
    """Edge cases MUST be handled explicitly, not guessed."""
    
    def test_unknown_codec_from_ffprobe_routes_to_resolve(self):
        """When ffprobe returns 'unknown', route to Resolve (likely proprietary)."""
        engine = get_execution_engine("mov", "unknown")
        
        assert engine == ExecutionEngine.RESOLVE, (
            f"'unknown' codec routed to {engine}, expected RESOLVE. "
            f"Unknown codecs are likely proprietary RAW formats."
        )
    
    def test_case_insensitive_routing(self):
        """Routing MUST be case-insensitive."""
        test_cases = [
            ("MP4", "H264"),
            ("mp4", "H264"),
            ("MP4", "h264"),
            ("Mp4", "H264"),
        ]
        
        for container, codec in test_cases:
            engine = get_execution_engine(container, codec)
            assert engine == ExecutionEngine.FFMPEG, (
                f"Case variation {container}/{codec} failed"
            )
    
    def test_extension_normalization(self):
        """Leading dots in extensions MUST be stripped."""
        # This tests internal normalization
        engine1 = get_execution_engine(".mp4", "h264")
        engine2 = get_execution_engine("mp4", "h264")
        
        assert engine1 == engine2 == ExecutionEngine.FFMPEG
    
    def test_empty_sources_raises_error(self):
        """Empty source list MUST raise error, not return default."""
        with pytest.raises(ValueError):
            validate_job_engine_consistency([])


# =============================================================================
# TEST: Resolve sources consistency
# =============================================================================

class TestResolveSources:
    """All RESOLVE_SOURCES entries MUST route correctly."""
    
    def test_all_resolve_sources_route_to_resolve(self):
        """Every entry in RESOLVE_SOURCES MUST route to Resolve."""
        failures = []
        
        for (container, codec) in RESOLVE_SOURCES.keys():
            engine = get_execution_engine(container, codec)
            
            if engine != ExecutionEngine.RESOLVE:
                failures.append(f"{container}/{codec} → {engine}")
        
        assert not failures, (
            f"ROUTING FAILURES: These Resolve formats did not route correctly:\n"
            + "\n".join(failures)
        )
    
    def test_resolve_sources_have_resolve_engine_flag(self):
        """Every RESOLVE_SOURCES entry MUST have engine=RESOLVE."""
        failures = []
        
        for key, capability in RESOLVE_SOURCES.items():
            if capability.engine != ExecutionEngine.RESOLVE:
                failures.append(f"{key} has engine={capability.engine}")
        
        assert not failures, (
            f"METADATA FAILURES: These entries have wrong engine flag:\n"
            + "\n".join(failures)
        )


# =============================================================================
# TEST: is_raw_codec function
# =============================================================================

class TestIsRawCodec:
    """is_raw_codec MUST correctly identify all RAW codecs."""
    
    def test_all_raw_codecs_identified(self):
        """Every codec in RAW_CODECS_RESOLVE MUST return True."""
        for codec in RAW_CODECS_RESOLVE:
            assert is_raw_codec(codec), f"{codec} not identified as RAW"
    
    def test_standard_codecs_not_raw(self):
        """Standard codecs MUST return False."""
        standard_codecs = ["h264", "hevc", "prores", "dnxhd", "dnxhr", "vp9"]
        
        for codec in standard_codecs:
            assert not is_raw_codec(codec), f"{codec} wrongly identified as RAW"
    
    def test_unknown_is_raw(self):
        """'unknown' MUST be treated as RAW (conservative routing)."""
        assert is_raw_codec("unknown"), "'unknown' should be treated as RAW"


# =============================================================================
# REGRESSION: Known routing bugs (if any)
# =============================================================================

class TestRoutingRegressions:
    """Regression tests for previously identified routing bugs."""
    
    def test_prores_not_confused_with_prores_raw(self):
        """ProRes and ProRes RAW MUST route to different engines."""
        prores_engine = get_execution_engine("mov", "prores")
        prores_raw_engine = get_execution_engine("mov", "prores_raw")
        
        assert prores_engine == ExecutionEngine.FFMPEG
        assert prores_raw_engine == ExecutionEngine.RESOLVE
        assert prores_engine != prores_raw_engine
    
    def test_exr_routes_to_resolve(self):
        """EXR sequences MUST route to Resolve (not FFmpeg)."""
        engine = get_execution_engine("exr", "exr")
        
        assert engine == ExecutionEngine.RESOLVE, (
            f"EXR routed to {engine}. EXR requires Resolve for proper handling."
        )


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
