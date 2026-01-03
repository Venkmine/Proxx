"""
Test RAW routing logic for all formats in the RAW samples directory.

This test ensures:
1. No RAW file ever routes to FFmpeg
2. No FFmpeg-compatible file routes to Resolve
3. Deterministic routing (same file always routes to same engine)
4. All files in RAW directory have explicit routing rules

CRITICAL: This is the regression test that ensures routing correctness.
"""

import pytest
from pathlib import Path
from typing import Dict, Tuple

from v2.source_capabilities import (
    get_execution_engine,
    ExecutionEngine,
    is_source_rejected,
    RAW_CODECS_RESOLVE,
)


# =============================================================================
# TEST DATA: Expected routing for each format in RAW directory
# =============================================================================
# This is the authoritative routing table derived from probing all files
# in the RAW samples directory. Any changes to routing must be justified.
# =============================================================================

EXPECTED_ROUTING: Dict[Tuple[str, str], ExecutionEngine] = {
    # AV1 - Modern open codec
    ("mov", "av1"): ExecutionEngine.FFMPEG,
    ("mp4", "av1"): ExecutionEngine.FFMPEG,
    
    # ProRes - Standard editorial codec
    ("mov", "prores"): ExecutionEngine.FFMPEG,
    ("mxf", "prores"): ExecutionEngine.FFMPEG,
    
    # H.264 / H.265 - Standard delivery codecs
    ("mov", "h264"): ExecutionEngine.FFMPEG,
    ("mp4", "h264"): ExecutionEngine.FFMPEG,
    ("mov", "hevc"): ExecutionEngine.FFMPEG,
    ("mp4", "hevc"): ExecutionEngine.FFMPEG,
    
    # ProRes RAW - RAW format requiring Resolve
    ("mov", "prores_raw"): ExecutionEngine.RESOLVE,
    
    # RED RAW - RED REDCODE requiring Resolve
    ("r3d", "r3d"): ExecutionEngine.RESOLVE,
    ("r3d", "redcode"): ExecutionEngine.RESOLVE,
    ("r3d", "redraw"): ExecutionEngine.RESOLVE,
    ("r3d", "red_raw"): ExecutionEngine.RESOLVE,
    
    # Unknown codec - Routes to Resolve (proprietary formats)
    ("mxf", "unknown"): ExecutionEngine.RESOLVE,
    ("mov", "unknown"): ExecutionEngine.RESOLVE,
    ("mp4", "unknown"): ExecutionEngine.RESOLVE,
}

REJECTED_FORMATS: Dict[Tuple[str, str], str] = {
    # Image sequences (V1 does not support still frame sequences)
    ("tiff_pipe", "tiff"): "DNG still images",
    ("image2", "tiff"): "TIFF sequence",
    ("image2", "png"): "PNG sequence",
    ("image2", "dpx"): "DPX sequence",
    ("image2", "exr"): "EXR sequence",
}


# =============================================================================
# ROUTING INVARIANTS - These must ALWAYS be true
# =============================================================================

def test_raw_codecs_never_route_to_ffmpeg():
    """
    CRITICAL: RAW codecs must NEVER route to FFmpeg.
    
    FFmpeg cannot decode proprietary RAW formats. Routing RAW to FFmpeg
    will result in runtime errors and failed jobs.
    """
    for codec in RAW_CODECS_RESOLVE:
        # Test with common containers
        for container in ["mov", "mxf", "mp4", "r3d", "braw", "nev", "crm"]:
            engine = get_execution_engine(container, codec)
            
            # RAW codecs should either route to Resolve or be None (if rejected)
            # But they must NEVER route to FFmpeg
            assert engine != ExecutionEngine.FFMPEG, (
                f"RAW codec '{codec}' in '{container}' incorrectly routed to FFmpeg. "
                f"RAW formats require DaVinci Resolve."
            )


def test_unknown_codec_routes_to_resolve():
    """
    CRITICAL: Unknown codecs must route to Resolve.
    
    When ffprobe returns codec_name="unknown", this indicates a proprietary
    format that FFmpeg cannot identify. These are typically RAW formats
    that require manufacturer SDKs. Route to Resolve for safety.
    """
    # Unknown codec in MXF (common for ARRI, Sony RAW)
    engine = get_execution_engine("mxf", "unknown")
    assert engine == ExecutionEngine.RESOLVE, (
        "MXF with unknown codec should route to Resolve (likely ARRI/Sony RAW)"
    )
    
    # Unknown codec in MOV (Canon, Nikon RAW)
    engine = get_execution_engine("mov", "unknown")
    assert engine == ExecutionEngine.RESOLVE, (
        "MOV with unknown codec should route to Resolve (likely Canon/Nikon RAW)"
    )
    
    # Unknown codec in MP4 (proprietary format)
    engine = get_execution_engine("mp4", "unknown")
    assert engine == ExecutionEngine.RESOLVE, (
        "MP4 with unknown codec should route to Resolve (proprietary format)"
    )


def test_standard_codecs_route_to_ffmpeg():
    """
    Standard codecs (H.264, ProRes, DNxHD) must route to FFmpeg.
    
    These are well-supported formats that FFmpeg can decode reliably.
    They should NOT be routed to Resolve (unnecessary overhead).
    """
    standard_formats = [
        ("mp4", "h264"),
        ("mov", "h264"),
        ("mov", "prores"),
        ("mxf", "prores"),
        ("mxf", "dnxhd"),
        ("mov", "dnxhr"),
        ("mp4", "hevc"),
        ("mov", "hevc"),
        ("mp4", "av1"),
        ("mov", "av1"),
    ]
    
    for container, codec in standard_formats:
        engine = get_execution_engine(container, codec)
        assert engine == ExecutionEngine.FFMPEG, (
            f"{codec.upper()} in {container.upper()} should route to FFmpeg, "
            f"not {engine}"
        )


def test_prores_raw_routes_to_resolve():
    """
    ProRes RAW must route to Resolve.
    
    ProRes RAW is a sensor RAW format (not standard ProRes).
    FFmpeg cannot decode ProRes RAW - it requires Resolve or FCP.
    """
    engine = get_execution_engine("mov", "prores_raw")
    assert engine == ExecutionEngine.RESOLVE, (
        "ProRes RAW must route to Resolve (sensor RAW format)"
    )
    
    engine = get_execution_engine("mov", "prores_raw_hq")
    assert engine == ExecutionEngine.RESOLVE, (
        "ProRes RAW HQ must route to Resolve (sensor RAW format)"
    )


def test_image_sequences_rejected():
    """
    Image sequences must be explicitly rejected in V1.
    
    V1 does not support still frame sequences (DNG, DPX, EXR, TIFF, PNG).
    These should be explicitly rejected with clear error messages.
    """
    for (container, codec), description in REJECTED_FORMATS.items():
        is_rejected = is_source_rejected(container, codec)
        assert is_rejected, (
            f"{description} ({codec} in {container}) should be rejected in V1. "
            f"Image sequences are not supported."
        )


# =============================================================================
# FORMAT-SPECIFIC TESTS - Based on actual RAW samples directory
# =============================================================================

def test_av1_routing():
    """
    AV1 codec must route to FFmpeg.
    
    AV1 is a modern open codec supported by FFmpeg.
    Sample files: AV1/Sample_Footage_*.mp4
    """
    # ffprobe reports container as "mov" even for .mp4 files
    engine = get_execution_engine("mov", "av1")
    assert engine == ExecutionEngine.FFMPEG, "AV1 in MOV should route to FFmpeg"
    
    engine = get_execution_engine("mp4", "av1")
    assert engine == ExecutionEngine.FFMPEG, "AV1 in MP4 should route to FFmpeg"


def test_prores_in_mxf_routing():
    """
    ProRes in MXF must route to FFmpeg.
    
    ARRI and Canon cameras record ProRes in MXF containers.
    This is standard ProRes (not RAW), decodable by FFmpeg.
    Sample files: ARRI35/A_0001C043_220825_062758_p12SQ.mxf
    """
    engine = get_execution_engine("mxf", "prores")
    assert engine == ExecutionEngine.FFMPEG, "ProRes in MXF should route to FFmpeg"


def test_arri_raw_routing():
    """
    ARRI RAW formats must route to Resolve.
    
    ARRI RAW files have codec="unknown" in ffprobe (proprietary format).
    They require DaVinci Resolve for decode.
    Sample files: ARRI/ARRI 35 Xtreme MXF HDE/*.mxf
    """
    engine = get_execution_engine("mxf", "unknown")
    assert engine == ExecutionEngine.RESOLVE, (
        "MXF with unknown codec should route to Resolve (likely ARRI RAW)"
    )


def test_sony_venice_routing():
    """
    Sony Venice X-OCN must route to Resolve.
    
    Sony Venice MXF files have codec="unknown" in ffprobe.
    They require DaVinci Resolve for X-OCN decode.
    Sample files: SONY/Venice/Sony VENICE 2 Test Footage.mxf
    """
    engine = get_execution_engine("mxf", "unknown")
    assert engine == ExecutionEngine.RESOLVE, (
        "MXF with unknown codec should route to Resolve (likely Sony X-OCN)"
    )


def test_canon_raw_routing():
    """
    Canon Cinema RAW must route to Resolve.
    
    Canon .CRM files have codec="unknown" in ffprobe.
    They require DaVinci Resolve for decode.
    Sample files: Canon/A003C138_1701148G_CANON.CRM
    """
    engine = get_execution_engine("mov", "unknown")
    assert engine == ExecutionEngine.RESOLVE, (
        "MOV with unknown codec should route to Resolve (likely Canon RAW)"
    )


def test_prores_raw_a7siii_routing():
    """
    Sony a7S III ProRes RAW must route to Resolve.
    
    ProRes RAW is a sensor RAW format, NOT standard ProRes.
    Sample files: PRORES_RAW/a7s III ProRes RAW HQ.mov
    """
    engine = get_execution_engine("mov", "prores_raw")
    assert engine == ExecutionEngine.RESOLVE, (
        "ProRes RAW must route to Resolve (sensor RAW format)"
    )


def test_red_r3d_routing():
    """
    RED .R3D files must route to Resolve.
    
    RED RAW files contain REDCODE proprietary RAW data.
    FFmpeg cannot decode RED files - they require RED SDK.
    
    Tests:
    1. Single .r3d file → resolve
    2. Extension-based codec fallback (when ffprobe fails)
    3. Explicit codec variants (redcode, redraw, red_raw)
    """
    # Extension-based routing (most common case - ffprobe fails on .r3d)
    engine = get_execution_engine("r3d", "r3d")
    assert engine == ExecutionEngine.RESOLVE, (
        "RED .r3d file (extension-based) must route to Resolve"
    )
    
    # Explicit codec variants (if ffprobe succeeds)
    engine = get_execution_engine("r3d", "redcode")
    assert engine == ExecutionEngine.RESOLVE, (
        "RED REDCODE codec must route to Resolve"
    )
    
    engine = get_execution_engine("r3d", "redraw")
    assert engine == ExecutionEngine.RESOLVE, (
        "RED RAW codec must route to Resolve"
    )
    
    engine = get_execution_engine("r3d", "red_raw")
    assert engine == ExecutionEngine.RESOLVE, (
        "RED red_raw codec must route to Resolve"
    )


def test_red_never_routes_to_ffmpeg():
    """
    CRITICAL: RED files must NEVER route to FFmpeg.
    
    RED files require RED SDK for decode. FFmpeg cannot handle them.
    This test ensures RED files are never misrouted to FFmpeg.
    """
    red_codec_variants = ["r3d", "redcode", "redraw", "red_raw"]
    
    for codec in red_codec_variants:
        engine = get_execution_engine("r3d", codec)
        assert engine != ExecutionEngine.FFMPEG, (
            f"RED codec '{codec}' must NEVER route to FFmpeg (requires RED SDK)"
        )
        assert engine == ExecutionEngine.RESOLVE, (
            f"RED codec '{codec}' must route to Resolve"
        )


def test_red_folder_detection():
    """
    RED camera folders must be detected and routed to Resolve.
    
    RED cameras create folder structures with .R3D files and sidecars.
    Folders containing .r3d/.R3D files should route to Resolve.
    
    This is tested indirectly via _is_raw_camera_folder in headless_execute.py
    """
    # This test validates that RED is in RAW_CODECS_RESOLVE set
    assert "r3d" in RAW_CODECS_RESOLVE, (
        "r3d must be in RAW_CODECS_RESOLVE for folder detection"
    )
    assert "redcode" in RAW_CODECS_RESOLVE, (
        "redcode must be in RAW_CODECS_RESOLVE"
    )
    assert "redraw" in RAW_CODECS_RESOLVE, (
        "redraw must be in RAW_CODECS_RESOLVE"
    )
    assert "red_raw" in RAW_CODECS_RESOLVE, (
        "red_raw must be in RAW_CODECS_RESOLVE"
    )


def test_dng_still_images_rejected():
    """
    DNG still images must be rejected.
    
    DNG files with codec="tiff" are still photos, not video.
    V1 does not support still image sequences.
    Sample files: DJI/DJI_0010.DNG
    """
    is_rejected = is_source_rejected("tiff_pipe", "tiff")
    assert is_rejected, (
        "DNG still images (tiff_pipe/tiff) should be rejected in V1"
    )


def test_h264_hevc_routing():
    """
    H.264 and H.265 must route to FFmpeg.
    
    These are standard delivery codecs supported by FFmpeg.
    Sample files: NO_TC/*.mp4, Panasonic/*.MP4, iPhone/*.mov
    """
    for container in ["mov", "mp4"]:
        for codec in ["h264", "hevc"]:
            engine = get_execution_engine(container, codec)
            assert engine == ExecutionEngine.FFMPEG, (
                f"{codec.upper()} in {container.upper()} should route to FFmpeg"
            )


# =============================================================================
# DETERMINISM TESTS - Same input always produces same output
# =============================================================================

def test_routing_is_deterministic():
    """
    Routing must be deterministic - same format always routes to same engine.
    
    No randomness, no time-based decisions, no environment dependencies.
    """
    # Test multiple times to ensure determinism
    for _ in range(10):
        # Standard format
        engine1 = get_execution_engine("mp4", "h264")
        assert engine1 == ExecutionEngine.FFMPEG
        
        # RAW format
        engine2 = get_execution_engine("mov", "prores_raw")
        assert engine2 == ExecutionEngine.RESOLVE
        
        # Unknown codec
        engine3 = get_execution_engine("mxf", "unknown")
        assert engine3 == ExecutionEngine.RESOLVE


def test_routing_case_insensitive():
    """
    Routing must be case-insensitive for container and codec.
    
    Users may provide "MP4" or "mp4", "H264" or "h264".
    Routing should be the same regardless of case.
    """
    # Test various case combinations
    assert get_execution_engine("MP4", "H264") == get_execution_engine("mp4", "h264")
    assert get_execution_engine("MOV", "ProRes") == get_execution_engine("mov", "prores")
    assert get_execution_engine("MXF", "UNKNOWN") == get_execution_engine("mxf", "unknown")


# =============================================================================
# REGRESSION TESTS - Prevent known issues from reoccurring
# =============================================================================

def test_no_av1_misrouting_regression():
    """
    Regression test: AV1 was previously marked as UNKNOWN.
    
    Before fix: AV1 files returned engine=None (unknown format)
    After fix: AV1 routes to FFmpeg (standard codec)
    
    This test prevents regression to the unfixed state.
    """
    engine = get_execution_engine("mov", "av1")
    assert engine is not None, "AV1 routing must not return None"
    assert engine == ExecutionEngine.FFMPEG, "AV1 must route to FFmpeg"


def test_no_prores_mxf_misrouting_regression():
    """
    Regression test: ProRes in MXF was previously marked as UNKNOWN.
    
    Before fix: ProRes MXF files returned engine=None (unknown format)
    After fix: ProRes in MXF routes to FFmpeg (standard codec)
    
    ARRI and Canon cameras record ProRes in MXF containers.
    """
    engine = get_execution_engine("mxf", "prores")
    assert engine is not None, "ProRes MXF routing must not return None"
    assert engine == ExecutionEngine.FFMPEG, "ProRes in MXF must route to FFmpeg"


def test_no_unknown_codec_ffmpeg_misrouting():
    """
    Regression test: Unknown codecs must never route to FFmpeg.
    
    Unknown codecs indicate proprietary formats that FFmpeg cannot decode.
    They must route to Resolve or be rejected.
    """
    for container in ["mov", "mxf", "mp4"]:
        engine = get_execution_engine(container, "unknown")
        assert engine != ExecutionEngine.FFMPEG, (
            f"Unknown codec in {container} must not route to FFmpeg"
        )


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
