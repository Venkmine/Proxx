"""
V2 Canonical Proxy Profiles - Deterministic proxy output specifications.

This module defines the ONLY valid ways to describe proxy output in Proxx V2.
No ad-hoc codec/container settings are permitted. All proxy outputs must be
produced via named, immutable proxy profiles.

Design Principles:
==================
1. Profiles are immutable constants (no runtime mutation)
2. Each profile fully specifies output characteristics
3. Profile selection determines engine routing (FFmpeg vs Resolve)
4. No defaults, no inference, no silent fallback
5. RAW jobs MUST use Resolve profiles
6. Non-RAW jobs MUST NOT use Resolve profiles

Usage:
======
    from backend.v2.proxy_profiles import (
        get_profile,
        validate_profile_for_engine,
        PROXY_PROFILES,
    )
    
    # Get a profile
    profile = get_profile("proxy_h264_low")
    
    # Validate profile matches engine
    validate_profile_for_engine("proxy_h264_low", "ffmpeg")

Part of V2 Phase 1 Step 5: Proxy Profile Canonicalization
"""

from dataclasses import dataclass
from enum import Enum
from typing import Dict, Optional


# =============================================================================
# Engine Types
# =============================================================================

class EngineType(str, Enum):
    """Execution engine for proxy generation."""
    FFMPEG = "ffmpeg"
    RESOLVE = "resolve"


class ResolutionPolicy(str, Enum):
    """Resolution scaling policy."""
    SOURCE = "source"          # Keep original resolution
    SCALE_50 = "scale_50"      # Half resolution (1/2)
    SCALE_25 = "scale_25"      # Quarter resolution (1/4)


class AudioPolicy(str, Enum):
    """Audio handling policy."""
    COPY = "copy"              # Copy audio stream as-is
    AAC = "aac"                # Transcode to AAC
    PCM = "pcm"                # Transcode to PCM


# =============================================================================
# Proxy Profile Definition
# =============================================================================

@dataclass(frozen=True)
class ProxyProfile:
    """
    Canonical proxy profile specification.
    
    A profile is an immutable, deterministic description of proxy output.
    All proxy generation MUST reference exactly one profile.
    
    Attributes:
        name: Unique profile identifier (kebab-case)
        engine: Execution engine (ffmpeg or resolve)
        codec: Video codec identifier
        container: Container format
        resolution_policy: Resolution scaling behavior
        audio_policy: Audio handling behavior
        notes: Human-readable description (non-functional)
    """
    name: str
    engine: EngineType
    codec: str
    container: str
    resolution_policy: ResolutionPolicy
    audio_policy: AudioPolicy
    notes: str
    
    def __post_init__(self):
        """Validate profile integrity."""
        if not self.name:
            raise ValueError("Profile name cannot be empty")
        if not self.name.replace("-", "").replace("_", "").isalnum():
            raise ValueError(f"Invalid profile name: {self.name}")


# =============================================================================
# Canonical Proxy Profiles
# =============================================================================
# These are the ONLY valid proxy profiles in Proxx V2.
# Each profile is immutable and deterministic.
# =============================================================================

_PROFILES: Dict[str, ProxyProfile] = {
    # FFmpeg Profiles (for standard video formats)
    "proxy_h264_low": ProxyProfile(
        name="proxy_h264_low",
        engine=EngineType.FFMPEG,
        codec="h264",
        container="mp4",
        resolution_policy=ResolutionPolicy.SCALE_50,
        audio_policy=AudioPolicy.AAC,
        notes="H.264 low-bandwidth proxy at half resolution. Best for remote editing and low-storage workflows.",
    ),
    
    "proxy_prores_proxy": ProxyProfile(
        name="proxy_prores_proxy",
        engine=EngineType.FFMPEG,
        codec="prores_proxy",
        container="mov",
        resolution_policy=ResolutionPolicy.SOURCE,
        audio_policy=AudioPolicy.COPY,
        notes="ProRes Proxy at full resolution. Standard for professional NLE workflows with Apple ecosystem.",
    ),
    
    "proxy_prores_lt": ProxyProfile(
        name="proxy_prores_lt",
        engine=EngineType.FFMPEG,
        codec="prores_lt",
        container="mov",
        resolution_policy=ResolutionPolicy.SOURCE,
        audio_policy=AudioPolicy.COPY,
        notes="ProRes LT at full resolution. Higher quality than Proxy, suitable for color-sensitive work.",
    ),
    
    "proxy_dnxhr_lb": ProxyProfile(
        name="proxy_dnxhr_lb",
        engine=EngineType.FFMPEG,
        codec="dnxhr",
        container="mxf",
        resolution_policy=ResolutionPolicy.SOURCE,
        audio_policy=AudioPolicy.PCM,
        notes="DNxHR LB (Low Bandwidth) at full resolution. Avid/broadcast standard for edit proxies.",
    ),
    
    "proxy_h264_quarter": ProxyProfile(
        name="proxy_h264_quarter",
        engine=EngineType.FFMPEG,
        codec="h264",
        container="mp4",
        resolution_policy=ResolutionPolicy.SCALE_25,
        audio_policy=AudioPolicy.AAC,
        notes="H.264 quarter resolution. Ultra-lightweight for mobile/tablet editing or bandwidth-constrained scenarios.",
    ),
    
    # Resolve Profiles (for RAW and high-end formats requiring Resolve)
    "proxy_prores_proxy_resolve": ProxyProfile(
        name="proxy_prores_proxy_resolve",
        engine=EngineType.RESOLVE,
        codec="prores_proxy",
        container="mov",
        resolution_policy=ResolutionPolicy.SOURCE,
        audio_policy=AudioPolicy.COPY,
        notes="ProRes Proxy via Resolve. Required for RAW formats (ARRIRAW, REDCODE, BRAW, etc.).",
    ),
    
    "proxy_prores_lt_resolve": ProxyProfile(
        name="proxy_prores_lt_resolve",
        engine=EngineType.RESOLVE,
        codec="prores_lt",
        container="mov",
        resolution_policy=ResolutionPolicy.SOURCE,
        audio_policy=AudioPolicy.COPY,
        notes="ProRes LT via Resolve. Higher quality RAW debayer for color-critical work.",
    ),
    
    "proxy_prores_hq_resolve": ProxyProfile(
        name="proxy_prores_hq_resolve",
        engine=EngineType.RESOLVE,
        codec="prores_hq",
        container="mov",
        resolution_policy=ResolutionPolicy.SOURCE,
        audio_policy=AudioPolicy.COPY,
        notes="ProRes HQ via Resolve. High-quality RAW debayer for finishing-grade proxies.",
    ),
    
    "proxy_dnxhr_lb_resolve": ProxyProfile(
        name="proxy_dnxhr_lb_resolve",
        engine=EngineType.RESOLVE,
        codec="dnxhr",
        container="mxf",
        resolution_policy=ResolutionPolicy.SOURCE,
        audio_policy=AudioPolicy.PCM,
        notes="DNxHR LB via Resolve. Broadcast-standard RAW proxy for Avid workflows.",
    ),
    
    "proxy_dnxhr_sq_resolve": ProxyProfile(
        name="proxy_dnxhr_sq_resolve",
        engine=EngineType.RESOLVE,
        codec="dnxhr",
        container="mxf",
        resolution_policy=ResolutionPolicy.SOURCE,
        audio_policy=AudioPolicy.PCM,
        notes="DNxHR SQ (Standard Quality) via Resolve. Higher quality RAW proxy for broadcast finishing.",
    ),
}


# Make profiles dictionary immutable via read-only interface
# MappingProxyType provides a read-only view that raises TypeError on mutation
from types import MappingProxyType
PROXY_PROFILES: MappingProxyType[str, ProxyProfile] = MappingProxyType(_PROFILES)


# =============================================================================
# Profile Query and Validation Functions
# =============================================================================

class ProxyProfileError(Exception):
    """Raised when proxy profile validation fails."""
    pass


def get_profile(profile_name: str) -> ProxyProfile:
    """
    Get a proxy profile by name.
    
    Args:
        profile_name: Profile identifier (e.g., "proxy_h264_low")
        
    Returns:
        ProxyProfile instance
        
    Raises:
        ProxyProfileError: If profile does not exist
    """
    if profile_name not in PROXY_PROFILES:
        available = ", ".join(sorted(PROXY_PROFILES.keys()))
        raise ProxyProfileError(
            f"Unknown proxy profile '{profile_name}'. "
            f"Available profiles: [{available}]"
        )
    
    return PROXY_PROFILES[profile_name]


def validate_profile_for_engine(profile_name: str, engine: str) -> None:
    """
    Validate that a profile matches the required execution engine.
    
    Args:
        profile_name: Profile identifier
        engine: Expected engine ("ffmpeg" or "resolve")
        
    Raises:
        ProxyProfileError: If profile engine doesn't match expected engine
    """
    profile = get_profile(profile_name)
    
    engine_lower = engine.lower()
    profile_engine = profile.engine.value.lower()
    
    if profile_engine != engine_lower:
        raise ProxyProfileError(
            f"Profile '{profile_name}' requires {profile_engine} engine, "
            f"but job routes to {engine_lower}. "
            f"{'Use an FFmpeg profile for standard formats.' if engine_lower == 'ffmpeg' else 'Use a Resolve profile for RAW formats.'}"
        )


def list_profiles_for_engine(engine: EngineType) -> Dict[str, ProxyProfile]:
    """
    List all profiles for a specific engine.
    
    Args:
        engine: Engine type to filter by
        
    Returns:
        Dictionary of profile_name -> ProxyProfile for matching engine
    """
    return {
        name: profile
        for name, profile in PROXY_PROFILES.items()
        if profile.engine == engine
    }


def get_profile_metadata(profile_name: str) -> Dict[str, str]:
    """
    Get human-readable metadata for a profile.
    
    Args:
        profile_name: Profile identifier
        
    Returns:
        Dictionary with profile details for display/documentation
    """
    profile = get_profile(profile_name)
    
    return {
        "name": profile.name,
        "engine": profile.engine.value,
        "codec": profile.codec,
        "container": profile.container,
        "resolution": profile.resolution_policy.value,
        "audio": profile.audio_policy.value,
        "notes": profile.notes,
    }


# =============================================================================
# Profile Resolution to FFmpeg/Resolve Settings
# =============================================================================

def resolve_ffmpeg_codec_args(profile: ProxyProfile) -> list[str]:
    """
    Resolve FFmpeg codec arguments from profile.
    
    Args:
        profile: Proxy profile (must be FFmpeg engine)
        
    Returns:
        List of FFmpeg command arguments for codec
        
    Raises:
        ProxyProfileError: If profile is not for FFmpeg engine
    """
    if profile.engine != EngineType.FFMPEG:
        raise ProxyProfileError(
            f"Cannot resolve FFmpeg args for {profile.engine.value} profile '{profile.name}'"
        )
    
    # Map codec to FFmpeg arguments
    codec_map = {
        "h264": ["-c:v", "libx264", "-crf", "23", "-preset", "medium"],
        "h265": ["-c:v", "libx265", "-crf", "28", "-preset", "medium"],
        "prores_proxy": ["-c:v", "prores_ks", "-profile:v", "0"],
        "prores_lt": ["-c:v", "prores_ks", "-profile:v", "1"],
        "prores_standard": ["-c:v", "prores_ks", "-profile:v", "2"],
        "prores_hq": ["-c:v", "prores_ks", "-profile:v", "3"],
        "prores_4444": ["-c:v", "prores_ks", "-profile:v", "4"],
        "dnxhd": ["-c:v", "dnxhd"],
        "dnxhr": ["-c:v", "dnxhd", "-profile:v", "dnxhr_lb"],
    }
    
    if profile.codec not in codec_map:
        raise ProxyProfileError(
            f"Unknown codec '{profile.codec}' in profile '{profile.name}'"
        )
    
    return codec_map[profile.codec]


def resolve_ffmpeg_resolution_args(profile: ProxyProfile) -> list[str]:
    """
    Resolve FFmpeg resolution/scaling arguments from profile.
    
    Args:
        profile: Proxy profile
        
    Returns:
        List of FFmpeg command arguments for scaling (empty if source resolution)
    """
    if profile.resolution_policy == ResolutionPolicy.SOURCE:
        return []
    elif profile.resolution_policy == ResolutionPolicy.SCALE_50:
        return ["-vf", "scale=iw/2:ih/2"]
    elif profile.resolution_policy == ResolutionPolicy.SCALE_25:
        return ["-vf", "scale=iw/4:ih/4"]
    else:
        return []


def resolve_ffmpeg_audio_args(profile: ProxyProfile) -> list[str]:
    """
    Resolve FFmpeg audio arguments from profile.
    
    Args:
        profile: Proxy profile
        
    Returns:
        List of FFmpeg command arguments for audio
    """
    if profile.audio_policy == AudioPolicy.COPY:
        return ["-c:a", "copy"]
    elif profile.audio_policy == AudioPolicy.AAC:
        return ["-c:a", "aac", "-b:a", "192k"]
    elif profile.audio_policy == AudioPolicy.PCM:
        return ["-c:a", "pcm_s16le"]
    else:
        return ["-c:a", "copy"]


def resolve_resolve_preset(profile: ProxyProfile) -> str:
    """
    Resolve DaVinci Resolve preset name from profile.
    
    Args:
        profile: Proxy profile (must be Resolve engine)
        
    Returns:
        Resolve preset name string
        
    Raises:
        ProxyProfileError: If profile is not for Resolve engine
    """
    if profile.engine != EngineType.RESOLVE:
        raise ProxyProfileError(
            f"Cannot resolve Resolve preset for {profile.engine.value} profile '{profile.name}'"
        )
    
    # Map profile codec to Resolve preset naming convention
    # These must match the presets validated in resolve_engine.py
    preset_map = {
        "prores_proxy": "ProRes Proxy",
        "prores_lt": "ProRes LT",
        "prores_standard": "ProRes 422",
        "prores_hq": "ProRes HQ",
        "dnxhr": "DNxHR LB",
    }
    
    if profile.codec not in preset_map:
        raise ProxyProfileError(
            f"Unknown codec '{profile.codec}' for Resolve in profile '{profile.name}'"
        )
    
    return preset_map[profile.codec]
