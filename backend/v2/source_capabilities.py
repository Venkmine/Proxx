"""
V2 Source Capability Matrix - Formalised supported and rejected source formats.

This module defines which source container/codec combinations Proxx V2 can reliably
process, which it explicitly rejects, and the reasoning behind each decision.

Design Principles:
==================
1. No heuristics - only explicit container/codec pairs
2. No probing beyond ffprobe container/codec detection
3. No auto-detection or "maybe" states
4. Determinism over convenience
5. Explicit rejection with actionable guidance

Usage:
======
    from backend.v2.source_capabilities import (
        is_source_supported,
        get_rejection_reason,
        validate_source_capability,
        SourceCapabilityError,
    )
    
    # Check if supported
    if is_source_supported("mp4", "h264"):
        # Process the file
        ...
    
    # Or validate with exception
    validate_source_capability("mxf", "arriraw")  # Raises SourceCapabilityError

Part of V2 Phase 1 (Option A: Reliable Proxy Engine)
"""

from dataclasses import dataclass
from enum import Enum
from typing import Dict, List, Optional, Set, Tuple


# =============================================================================
# Execution Engine Enum
# =============================================================================
# Third routing outcome: which engine should process this source format.
# This is NOT a user preference - it is deterministic based on format.
# =============================================================================

class ExecutionEngine(str, Enum):
    """
    Execution engine selection for source format processing.
    
    This enum determines which execution backend handles a given source format.
    The routing is DETERMINISTIC - no user override, no heuristics.
    
    FFMPEG: Standard video codecs processable by FFmpeg (H.264, ProRes, DNxHD, etc.)
    RESOLVE: Proprietary RAW formats requiring DaVinci Resolve (ARRIRAW, REDCODE, BRAW, etc.)
    """
    FFMPEG = "ffmpeg"
    RESOLVE = "resolve"


# =============================================================================
# Source Capability Error
# =============================================================================

class SourceCapabilityError(Exception):
    """
    Raised when a source format is not supported by Proxx.
    
    Contains actionable guidance for the user to resolve the issue.
    """
    
    def __init__(
        self,
        container: str,
        codec: str,
        reason: str,
        recommended_action: str,
    ):
        self.container = container
        self.codec = codec
        self.reason = reason
        self.recommended_action = recommended_action
        
        message = (
            f"{codec.upper()} in {container.upper()} is not supported. "
            f"{reason} {recommended_action}"
        )
        super().__init__(message)


# Standard message for RAW formats that require Resolve
RAW_FORMAT_RESOLVE_REASON = (
    "This format requires DaVinci Resolve. FFmpeg cannot decode proprietary RAW formats."
)

RAW_FORMAT_RESOLVE_ACTION = (
    "Route this job to the Resolve engine, or export to ProRes/DNxHR from Resolve before processing with FFmpeg."
)


# =============================================================================
# Source Capability Entry
# =============================================================================

@dataclass(frozen=True)
class SourceCapability:
    """
    Describes a source format capability entry.
    
    Attributes:
        container: Container format (e.g., 'mp4', 'mov', 'mxf')
        codec: Video codec (e.g., 'h264', 'prores', 'arriraw')
        reason: Human-readable explanation (one sentence)
        recommended_action: Suggested upstream fix if rejected
        engine: Execution engine for this format (FFMPEG or RESOLVE)
    """
    container: str
    codec: str
    reason: str
    recommended_action: str = ""
    engine: ExecutionEngine = ExecutionEngine.FFMPEG


# =============================================================================
# RAW FORMATS REQUIRING RESOLVE
# =============================================================================
# These codec identifiers MUST be routed to the Resolve engine.
# They are proprietary camera RAW formats that FFmpeg cannot decode.
#
# NOTE: These are now SUPPORTED (via Resolve), not REJECTED.
# The REJECTED_SOURCES dict is for formats unsupported by BOTH engines.
# =============================================================================

RAW_CODECS_RESOLVE: Set[str] = {
    # ARRI RAW
    "arriraw",
    "arri_raw",
    "ari",
    
    # RED RAW
    "redcode",
    "redraw",
    "red_raw",
    "r3d",
    
    # Blackmagic RAW
    "braw",
    "blackmagic_raw",
    
    # Sony RAW (X-OCN and Venice)
    "sony_raw",
    "x-ocn",
    "xocn",
    "x_ocn",
    "sonyraw",
    "venice_raw",
    
    # Canon RAW (Cinema RAW Light and C-RAW)
    "canon_raw",
    "craw",
    "cinema_raw_light",
    "crm",
    "canon_cinema_raw",
    
    # Panasonic RAW (V-RAW and Varicam)
    "panasonic_raw",
    "vraw",
    "v_raw",
    "varicam_raw",
    
    # Nikon N-RAW (Z8, Z9)
    "nikon_raw",
    "n_raw",
    "nraw",
    "nikon_nraw",
    
    # DJI RAW (Zenmuse X7, Inspire 3)
    "dji_raw",
    "djiraw",
    "d_log_raw",
    "zenmuse_raw",
    
    # CinemaDNG
    "cinemadng",
    "cdng",
    "cinema_dng",
    
    # ProRes RAW (sensor RAW, not standard ProRes)
    "prores_raw",
    "prores_raw_hq",
    "proresraw",
    "proresrawhq",
    
    # Unknown codec reported by ffprobe (proprietary formats)
    # FFprobe returns "unknown" for codecs it cannot identify
    "unknown",
}


# =============================================================================
# SUPPORTED SOURCES
# =============================================================================
# These container/codec combinations are known to work reliably with Proxx.
# They have deterministic decode behavior and are well-supported by FFmpeg.
# =============================================================================

SUPPORTED_SOURCES: Dict[Tuple[str, str], SourceCapability] = {
    # ---------------------------------------------------------------------
    # H.264 (AVC) - Universally supported, deterministic decode
    # ---------------------------------------------------------------------
    ("mp4", "h264"): SourceCapability(
        container="mp4",
        codec="h264",
        reason="Widely supported, deterministic decode.",
    ),
    ("mov", "h264"): SourceCapability(
        container="mov",
        codec="h264",
        reason="QuickTime H.264, standard editorial format.",
    ),
    ("mkv", "h264"): SourceCapability(
        container="mkv",
        codec="h264",
        reason="Matroska H.264, open container format.",
    ),
    
    # ---------------------------------------------------------------------
    # H.265 (HEVC) - Modern compression, well-supported
    # ---------------------------------------------------------------------
    ("mp4", "hevc"): SourceCapability(
        container="mp4",
        codec="hevc",
        reason="HEVC in MP4, common delivery format.",
    ),
    ("mp4", "h265"): SourceCapability(
        container="mp4",
        codec="h265",
        reason="H.265 in MP4, common delivery format.",
    ),
    ("mov", "hevc"): SourceCapability(
        container="mov",
        codec="hevc",
        reason="QuickTime HEVC, Apple ecosystem standard.",
    ),
    ("mov", "h265"): SourceCapability(
        container="mov",
        codec="h265",
        reason="H.265 in MOV, Apple ecosystem standard.",
    ),
    ("mkv", "hevc"): SourceCapability(
        container="mkv",
        codec="hevc",
        reason="Matroska HEVC, flexible container.",
    ),
    ("mkv", "h265"): SourceCapability(
        container="mkv",
        codec="h265",
        reason="Matroska H.265, flexible container.",
    ),
    
    # ---------------------------------------------------------------------
    # ProRes - Intra-frame, proxy-friendly, editorial standard
    # ---------------------------------------------------------------------
    ("mov", "prores"): SourceCapability(
        container="mov",
        codec="prores",
        reason="Apple ProRes, intra-frame editorial codec.",
    ),
    ("mov", "prores_proxy"): SourceCapability(
        container="mov",
        codec="prores_proxy",
        reason="ProRes Proxy, lightweight intra-frame.",
    ),
    ("mov", "prores_lt"): SourceCapability(
        container="mov",
        codec="prores_lt",
        reason="ProRes LT, lightweight intra-frame.",
    ),
    ("mov", "prores_422"): SourceCapability(
        container="mov",
        codec="prores_422",
        reason="ProRes 422, standard editorial quality.",
    ),
    ("mov", "prores_hq"): SourceCapability(
        container="mov",
        codec="prores_hq",
        reason="ProRes HQ, high quality intra-frame.",
    ),
    ("mov", "prores_4444"): SourceCapability(
        container="mov",
        codec="prores_4444",
        reason="ProRes 4444, high quality with alpha.",
    ),
    ("mov", "prores_4444xq"): SourceCapability(
        container="mov",
        codec="prores_4444xq",
        reason="ProRes 4444 XQ, highest quality ProRes.",
    ),
    
    # ---------------------------------------------------------------------
    # DNxHD/DNxHR - Avid intra-frame codecs
    # ---------------------------------------------------------------------
    ("mov", "dnxhd"): SourceCapability(
        container="mov",
        codec="dnxhd",
        reason="Avid DNxHD, broadcast intra-frame.",
    ),
    ("mov", "dnxhr"): SourceCapability(
        container="mov",
        codec="dnxhr",
        reason="Avid DNxHR, modern intra-frame.",
    ),
    ("mxf", "dnxhd"): SourceCapability(
        container="mxf",
        codec="dnxhd",
        reason="MXF DNxHD, broadcast standard.",
    ),
    ("mxf", "dnxhr"): SourceCapability(
        container="mxf",
        codec="dnxhr",
        reason="MXF DNxHR, modern broadcast.",
    ),
    
    # ---------------------------------------------------------------------
    # VP9/AV1 - Open web codecs
    # ---------------------------------------------------------------------
    ("webm", "vp9"): SourceCapability(
        container="webm",
        codec="vp9",
        reason="WebM VP9, open web codec.",
    ),
    ("mkv", "vp9"): SourceCapability(
        container="mkv",
        codec="vp9",
        reason="Matroska VP9, open codec.",
    ),
    ("mp4", "av1"): SourceCapability(
        container="mp4",
        codec="av1",
        reason="AV1 in MP4, next-gen open codec.",
    ),
    ("mkv", "av1"): SourceCapability(
        container="mkv",
        codec="av1",
        reason="Matroska AV1, next-gen open codec.",
    ),
    ("webm", "av1"): SourceCapability(
        container="webm",
        codec="av1",
        reason="WebM AV1, next-gen web codec.",
    ),
    
    # ---------------------------------------------------------------------
    # MJPEG - Motion JPEG, simple intra-frame
    # ---------------------------------------------------------------------
    ("mov", "mjpeg"): SourceCapability(
        container="mov",
        codec="mjpeg",
        reason="Motion JPEG, simple intra-frame.",
    ),
    ("avi", "mjpeg"): SourceCapability(
        container="avi",
        codec="mjpeg",
        reason="AVI Motion JPEG, legacy format.",
    ),
    
    # ---------------------------------------------------------------------
    # MPEG-2 - Broadcast legacy
    # ---------------------------------------------------------------------
    ("mpg", "mpeg2video"): SourceCapability(
        container="mpg",
        codec="mpeg2video",
        reason="MPEG-2, broadcast legacy format.",
    ),
    ("ts", "mpeg2video"): SourceCapability(
        container="ts",
        codec="mpeg2video",
        reason="Transport stream MPEG-2, broadcast.",
    ),
    ("mxf", "mpeg2video"): SourceCapability(
        container="mxf",
        codec="mpeg2video",
        reason="MXF MPEG-2, broadcast standard.",
    ),
    
    # ---------------------------------------------------------------------
    # XAVC / XDCAM - Sony professional formats (decoded via standard codecs)
    # ---------------------------------------------------------------------
    ("mxf", "h264"): SourceCapability(
        container="mxf",
        codec="h264",
        reason="MXF H.264 (XAVC/XDCAM), Sony professional.",
    ),
    ("mp4", "xavc"): SourceCapability(
        container="mp4",
        codec="xavc",
        reason="XAVC in MP4, Sony professional format.",
    ),
}


# =============================================================================
# RESOLVE-ROUTED SOURCES (RAW Formats)
# =============================================================================
# These container/codec combinations require DaVinci Resolve for processing.
# They are SUPPORTED, but only via the Resolve engine, not FFmpeg.
#
# Key difference from REJECTED_SOURCES:
# - RESOLVE_SOURCES: Supported via Resolve engine
# - REJECTED_SOURCES: Not supported by ANY engine
# =============================================================================

RESOLVE_SOURCES: Dict[Tuple[str, str], SourceCapability] = {
    # ---------------------------------------------------------------------
    # ARRIRAW - Proprietary camera RAW (Resolve has native support)
    # ---------------------------------------------------------------------
    ("mxf", "arriraw"): SourceCapability(
        container="mxf",
        codec="arriraw",
        reason="ARRI RAW in MXF, decoded natively by DaVinci Resolve.",
        engine=ExecutionEngine.RESOLVE,
    ),
    ("ari", "arriraw"): SourceCapability(
        container="ari",
        codec="arriraw",
        reason="ARRI RAW native format, decoded by DaVinci Resolve.",
        engine=ExecutionEngine.RESOLVE,
    ),
    
    # ---------------------------------------------------------------------
    # RED RAW - Proprietary camera RAW (Resolve has native support)
    # ---------------------------------------------------------------------
    ("r3d", "redcode"): SourceCapability(
        container="r3d",
        codec="redcode",
        reason="RED REDCODE RAW, decoded natively by DaVinci Resolve.",
        engine=ExecutionEngine.RESOLVE,
    ),
    ("r3d", "redraw"): SourceCapability(
        container="r3d",
        codec="redraw",
        reason="RED RAW format, decoded by DaVinci Resolve.",
        engine=ExecutionEngine.RESOLVE,
    ),
    
    # ---------------------------------------------------------------------
    # Blackmagic RAW - Proprietary camera RAW (Resolve has native support)
    # ---------------------------------------------------------------------
    ("braw", "braw"): SourceCapability(
        container="braw",
        codec="braw",
        reason="Blackmagic RAW, decoded natively by DaVinci Resolve.",
        engine=ExecutionEngine.RESOLVE,
    ),
    ("braw", "blackmagic_raw"): SourceCapability(
        container="braw",
        codec="blackmagic_raw",
        reason="Blackmagic RAW format, decoded by DaVinci Resolve.",
        engine=ExecutionEngine.RESOLVE,
    ),
    
    # ---------------------------------------------------------------------
    # Sony RAW - Camera RAW formats (Resolve has native support)
    # ---------------------------------------------------------------------
    ("mxf", "sony_raw"): SourceCapability(
        container="mxf",
        codec="sony_raw",
        reason="Sony RAW in MXF, decoded by DaVinci Resolve.",
        engine=ExecutionEngine.RESOLVE,
    ),
    ("mxf", "x-ocn"): SourceCapability(
        container="mxf",
        codec="x-ocn",
        reason="Sony X-OCN RAW, decoded by DaVinci Resolve.",
        engine=ExecutionEngine.RESOLVE,
    ),
    
    # ---------------------------------------------------------------------
    # Canon RAW - Camera RAW formats (Resolve has native support)
    # ---------------------------------------------------------------------
    ("crm", "canon_raw"): SourceCapability(
        container="crm",
        codec="canon_raw",
        reason="Canon Cinema RAW Light, decoded by DaVinci Resolve.",
        engine=ExecutionEngine.RESOLVE,
    ),
    ("crm", "craw"): SourceCapability(
        container="crm",
        codec="craw",
        reason="Canon Cinema RAW, decoded by DaVinci Resolve.",
        engine=ExecutionEngine.RESOLVE,
    ),
    
    # ---------------------------------------------------------------------
    # Panasonic RAW - Camera RAW formats (Resolve has native support)
    # ---------------------------------------------------------------------
    ("vraw", "panasonic_raw"): SourceCapability(
        container="vraw",
        codec="panasonic_raw",
        reason="Panasonic V-RAW, decoded by DaVinci Resolve.",
        engine=ExecutionEngine.RESOLVE,
    ),
    
    # ---------------------------------------------------------------------
    # CinemaDNG - Open RAW format (Resolve has native support)
    # ---------------------------------------------------------------------
    ("dng", "cinemadng"): SourceCapability(
        container="dng",
        codec="cinemadng",
        reason="CinemaDNG frame sequences, decoded by DaVinci Resolve.",
        engine=ExecutionEngine.RESOLVE,
    ),
    
    # ---------------------------------------------------------------------
    # Apple ProRes RAW - Hybrid RAW format (Resolve has native support)
    # ---------------------------------------------------------------------
    ("mov", "prores_raw"): SourceCapability(
        container="mov",
        codec="prores_raw",
        reason="ProRes RAW sensor data, decoded by DaVinci Resolve.",
        engine=ExecutionEngine.RESOLVE,
    ),
    ("mov", "prores_raw_hq"): SourceCapability(
        container="mov",
        codec="prores_raw_hq",
        reason="ProRes RAW HQ sensor data, decoded by DaVinci Resolve.",
        engine=ExecutionEngine.RESOLVE,
    ),
    
    # ---------------------------------------------------------------------
    # Nikon N-RAW - Nikon Z8/Z9 internal RAW (Resolve has native support)
    # ---------------------------------------------------------------------
    ("nev", "nikon_raw"): SourceCapability(
        container="nev",
        codec="nikon_raw",
        reason="Nikon N-RAW format, decoded by DaVinci Resolve.",
        engine=ExecutionEngine.RESOLVE,
    ),
    ("nev", "nraw"): SourceCapability(
        container="nev",
        codec="nraw",
        reason="Nikon N-RAW format, decoded by DaVinci Resolve.",
        engine=ExecutionEngine.RESOLVE,
    ),
    ("mov", "nikon_raw"): SourceCapability(
        container="mov",
        codec="nikon_raw",
        reason="Nikon N-RAW in MOV container, decoded by DaVinci Resolve.",
        engine=ExecutionEngine.RESOLVE,
    ),
    
    # ---------------------------------------------------------------------
    # DJI RAW - Zenmuse X7, Inspire 3, etc. (Resolve has native support)
    # ---------------------------------------------------------------------
    ("mov", "dji_raw"): SourceCapability(
        container="mov",
        codec="dji_raw",
        reason="DJI RAW format, decoded by DaVinci Resolve.",
        engine=ExecutionEngine.RESOLVE,
    ),
    ("dng", "dji_raw"): SourceCapability(
        container="dng",
        codec="dji_raw",
        reason="DJI CinemaDNG RAW, decoded by DaVinci Resolve.",
        engine=ExecutionEngine.RESOLVE,
    ),
}


# =============================================================================
# REJECTED SOURCES
# =============================================================================
# These container/codec combinations are NOT supported by ANY engine.
# This is for truly unsupported formats that neither FFmpeg nor Resolve can handle.
# =============================================================================

REJECTED_SOURCES: Dict[Tuple[str, str], SourceCapability] = {
    # ---------------------------------------------------------------------
    # Obsolete/Unsupported formats - neither FFmpeg nor Resolve can decode
    # ---------------------------------------------------------------------
    # Currently empty - all known formats are either FFmpeg or Resolve supported.
    # Add entries here for formats that cannot be processed by any engine.
    # Example:
    # ("xyz", "proprietary_codec"): SourceCapability(
    #     container="xyz",
    #     codec="proprietary_codec",
    #     reason="No known decoder for this format.",
    #     recommended_action="Convert to ProRes or H.264 using manufacturer software.",
    # ),
}


# =============================================================================
# Lookup Functions
# =============================================================================

def normalize_format(value: str) -> str:
    """
    Normalize a container or codec name for lookup.
    
    - Lowercase
    - Strip leading dots (e.g., ".mp4" -> "mp4")
    - Strip trailing whitespace
    """
    return value.lower().strip().lstrip(".")


def is_source_supported(container: str, codec: str) -> bool:
    """
    Check if a container/codec combination is explicitly supported.
    
    This includes both FFmpeg-routed (SUPPORTED_SOURCES) and
    Resolve-routed (RESOLVE_SOURCES) formats, as well as any codec
    in the RAW_CODECS_RESOLVE set (dynamic RAW detection).
    
    Args:
        container: Container format (e.g., 'mp4', 'mov')
        codec: Video codec (e.g., 'h264', 'prores')
        
    Returns:
        True if explicitly supported by any engine, False otherwise.
    """
    key = (normalize_format(container), normalize_format(codec))
    codec_norm = normalize_format(codec)
    
    # RAW codecs are always supported (via Resolve)
    if codec_norm in RAW_CODECS_RESOLVE:
        return True
    
    return key in SUPPORTED_SOURCES or key in RESOLVE_SOURCES


def is_source_rejected(container: str, codec: str) -> bool:
    """
    Check if a container/codec combination is explicitly rejected.
    
    Args:
        container: Container format
        codec: Video codec
        
    Returns:
        True if explicitly rejected, False otherwise.
    """
    key = (normalize_format(container), normalize_format(codec))
    return key in REJECTED_SOURCES


def get_rejection_reason(container: str, codec: str) -> Optional[SourceCapability]:
    """
    Get the rejection reason for a container/codec combination.
    
    Args:
        container: Container format
        codec: Video codec
        
    Returns:
        SourceCapability with reason and recommended action, or None if not rejected.
    """
    key = (normalize_format(container), normalize_format(codec))
    return REJECTED_SOURCES.get(key)


def get_support_info(container: str, codec: str) -> Optional[SourceCapability]:
    """
    Get support information for a container/codec combination.
    
    Checks both FFmpeg-routed and Resolve-routed sources.
    
    Args:
        container: Container format
        codec: Video codec
        
    Returns:
        SourceCapability with reason and engine, or None if not in any supported list.
    """
    key = (normalize_format(container), normalize_format(codec))
    if key in SUPPORTED_SOURCES:
        return SUPPORTED_SOURCES[key]
    if key in RESOLVE_SOURCES:
        return RESOLVE_SOURCES[key]
    return None


def is_raw_codec(codec: str) -> bool:
    """
    Check if a codec is a RAW format that requires Resolve.
    
    This function checks against the RAW_CODECS_RESOLVE set, which contains
    all known RAW codec identifiers. This allows dynamic routing of RAW
    formats even if the specific container/codec pair is not in RESOLVE_SOURCES.
    
    IMPORTANT: 'unknown' is included in RAW_CODECS_RESOLVE because ffprobe
    returns codec_name="unknown" for proprietary formats it cannot identify.
    These are routed to Resolve since they likely require manufacturer SDKs.
    
    Args:
        codec: Video codec name
        
    Returns:
        True if the codec is a known RAW format, False otherwise.
    """
    return normalize_format(codec) in RAW_CODECS_RESOLVE


def get_execution_engine(container: str, codec: str) -> Optional[ExecutionEngine]:
    """
    Determine which execution engine should process this source format.
    
    This is the PRIMARY routing function for engine selection.
    
    ROUTING RULES (NO USER OVERRIDE, NO HEURISTICS):
    1. If codec is in RAW_CODECS_RESOLVE → ExecutionEngine.RESOLVE (always)
    2. If container/codec in RESOLVE_SOURCES → ExecutionEngine.RESOLVE
    3. If container/codec in SUPPORTED_SOURCES → ExecutionEngine.FFMPEG
    4. If codec is 'unknown' (ffprobe cannot identify) → ExecutionEngine.RESOLVE
    5. Rejected formats (REJECTED_SOURCES) → None (validation will fail)
    6. Unknown formats → None (validation will fail)
    
    The codec-based check (step 1) ensures that ALL RAW formats route to
    Resolve, even if the specific container/codec pair is not explicitly
    listed in RESOLVE_SOURCES.
    
    Args:
        container: Container format (e.g., 'mp4', 'r3d')
        codec: Video codec (e.g., 'h264', 'arriraw')
        
    Returns:
        ExecutionEngine.FFMPEG for standard formats
        ExecutionEngine.RESOLVE for RAW formats
        None if format is rejected or unknown (caller must handle)
    """
    container_norm = normalize_format(container)
    codec_norm = normalize_format(codec)
    key = (container_norm, codec_norm)
    
    # PRIORITY 1: Check if codec is a known RAW format (routes to Resolve)
    # This catches ALL RAW variants even if not explicitly in RESOLVE_SOURCES
    if codec_norm in RAW_CODECS_RESOLVE:
        return ExecutionEngine.RESOLVE
    
    # PRIORITY 2: Check explicit Resolve-routed sources
    if key in RESOLVE_SOURCES:
        return ExecutionEngine.RESOLVE
    
    # PRIORITY 3: Check FFmpeg-routed sources (standard formats)
    if key in SUPPORTED_SOURCES:
        return ExecutionEngine.FFMPEG
    
    # Rejected or truly unknown - return None (caller handles validation error)
    return None


def is_resolve_required(container: str, codec: str) -> bool:
    """
    Check if a format requires the Resolve engine (RAW format).
    
    Convenience function for quick engine checks.
    This returns True for:
    - Any codec in RAW_CODECS_RESOLVE (including 'unknown')
    - Any container/codec pair in RESOLVE_SOURCES
    
    Args:
        container: Container format
        codec: Video codec
        
    Returns:
        True if format requires Resolve engine, False otherwise.
    """
    codec_norm = normalize_format(codec)
    
    # RAW codecs always require Resolve
    if codec_norm in RAW_CODECS_RESOLVE:
        return True
    
    return get_execution_engine(container, codec) == ExecutionEngine.RESOLVE


def validate_source_capability(container: str, codec: str) -> ExecutionEngine:
    """
    Validate that a source format is supported and return the required engine.
    
    This is the primary validation function for source format checking.
    It should be called during JobSpec validation, before execution.
    
    ROUTING RULES (NO USER OVERRIDE, NO HEURISTICS):
    1. RAW codecs (in RAW_CODECS_RESOLVE) → ExecutionEngine.RESOLVE (always)
    2. Explicit RESOLVE_SOURCES entries → ExecutionEngine.RESOLVE
    3. Standard formats (SUPPORTED_SOURCES) → ExecutionEngine.FFMPEG
    4. codec='unknown' (ffprobe cannot identify) → ExecutionEngine.RESOLVE
    5. Rejected/Unknown → Raises SourceCapabilityError
    
    Args:
        container: Container format (e.g., 'mp4', 'mov')
        codec: Video codec (e.g., 'h264', 'prores')
        
    Returns:
        ExecutionEngine indicating which engine should process this format.
        
    Raises:
        SourceCapabilityError: If the format is explicitly rejected.
        SourceCapabilityError: If the format is unknown (not in any list).
    """
    container_norm = normalize_format(container)
    codec_norm = normalize_format(codec)
    key = (container_norm, codec_norm)
    
    # Check if explicitly rejected (not supported by ANY engine)
    if key in REJECTED_SOURCES:
        entry = REJECTED_SOURCES[key]
        raise SourceCapabilityError(
            container=container_norm,
            codec=codec_norm,
            reason=entry.reason,
            recommended_action=entry.recommended_action,
        )
    
    # PRIORITY 1: Check if codec is a known RAW format (routes to Resolve)
    # This catches ALL RAW variants including 'unknown' codecs from ffprobe
    if codec_norm in RAW_CODECS_RESOLVE:
        return ExecutionEngine.RESOLVE
    
    # PRIORITY 2: Check explicit Resolve-routed sources
    if key in RESOLVE_SOURCES:
        return ExecutionEngine.RESOLVE
    
    # PRIORITY 3: Check FFmpeg-routed sources (standard formats)
    if key in SUPPORTED_SOURCES:
        return ExecutionEngine.FFMPEG
    
    # Unknown format - fail conservatively with clear RAW guidance
    raise SourceCapabilityError(
        container=container_norm,
        codec=codec_norm,
        reason=f"Unknown container/codec combination '{container_norm}/{codec_norm}'.",
        recommended_action="Verify the source format or transcode to ProRes/H.264 before processing.",
    )


# =============================================================================
# Utility: List All Formats
# =============================================================================

def list_supported_formats() -> list:
    """
    Return a list of all FFmpeg-supported container/codec pairs.
    
    Returns:
        List of (container, codec, reason) tuples.
    """
    return [
        (cap.container, cap.codec, cap.reason)
        for cap in SUPPORTED_SOURCES.values()
    ]


def list_resolve_formats() -> list:
    """
    Return a list of all Resolve-supported container/codec pairs (RAW formats).
    
    Returns:
        List of (container, codec, reason) tuples.
    """
    return [
        (cap.container, cap.codec, cap.reason)
        for cap in RESOLVE_SOURCES.values()
    ]


def list_rejected_formats() -> list:
    """
    Return a list of all rejected container/codec pairs.
    
    Returns:
        List of (container, codec, reason, recommended_action) tuples.
    """
    return [
        (cap.container, cap.codec, cap.reason, cap.recommended_action)
        for cap in REJECTED_SOURCES.values()
    ]


def list_raw_codecs() -> List[str]:
    """
    Return a sorted list of all RAW codec identifiers that route to Resolve.
    
    Returns:
        Sorted list of codec names.
    """
    return sorted(RAW_CODECS_RESOLVE)


# =============================================================================
# Mixed Job Validation
# =============================================================================

class MixedEngineError(Exception):
    """
    Raised when a job contains sources requiring different engines.
    
    Proxx requires deterministic engine selection: ALL sources in a job
    must route to the SAME engine. Mixed RAW + non-RAW jobs are rejected.
    """
    
    def __init__(
        self,
        ffmpeg_sources: List[str],
        resolve_sources: List[str],
    ):
        self.ffmpeg_sources = ffmpeg_sources
        self.resolve_sources = resolve_sources
        
        message = (
            f"Job contains sources requiring different engines. "
            f"FFmpeg sources: {len(ffmpeg_sources)}, Resolve sources: {len(resolve_sources)}. "
            f"Split into separate jobs or transcode RAW files to an intermediate codec."
        )
        super().__init__(message)


def validate_job_engine_consistency(
    sources: List[Tuple[str, str, str]],
) -> ExecutionEngine:
    """
    Validate that all sources in a job require the same execution engine.
    
    Proxx requires deterministic engine selection. A job cannot contain
    a mix of RAW sources (Resolve) and standard sources (FFmpeg).
    
    Args:
        sources: List of (source_path, container, codec) tuples
        
    Returns:
        ExecutionEngine that should process all sources in this job.
        
    Raises:
        MixedEngineError: If sources require different engines.
        SourceCapabilityError: If any source format is unsupported.
    """
    if not sources:
        raise ValueError("Cannot validate empty source list")
    
    ffmpeg_sources: List[str] = []
    resolve_sources: List[str] = []
    
    for source_path, container, codec in sources:
        engine = get_execution_engine(container, codec)
        
        if engine is None:
            # Unknown format - validate to get proper error
            validate_source_capability(container, codec)
        
        if engine == ExecutionEngine.FFMPEG:
            ffmpeg_sources.append(source_path)
        elif engine == ExecutionEngine.RESOLVE:
            resolve_sources.append(source_path)
    
    # Check for mixed engines
    if ffmpeg_sources and resolve_sources:
        raise MixedEngineError(ffmpeg_sources, resolve_sources)
    
    # Return the consistent engine
    if resolve_sources:
        return ExecutionEngine.RESOLVE
    return ExecutionEngine.FFMPEG
