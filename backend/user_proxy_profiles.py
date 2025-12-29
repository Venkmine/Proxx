"""
V2 User Proxy Profiles - Policy layer for proxy generation constraints.

This module provides a deterministic compiler that resolves user-friendly
proxy profile constraints into exactly one canonical proxy profile, or fails
with a clear diagnostic error.

USER PROXY PROFILES ARE NOT EXECUTABLE. They are a policy layer only.

Design Principles:
==================
1. User profiles express constraints, not execution parameters
2. Compilation is deterministic (same input → same output)
3. Compilation either succeeds with exactly 1 match or fails loudly
4. No defaults, no heuristics, no fallbacks, no ranking
5. Schema is versioned and strictly validated
6. Unknown fields are rejected (no silent ignoring)

Usage:
======
    from backend.user_proxy_profiles import (
        UserProxyProfile,
        compile_user_proxy_profile,
        CompilationError,
    )
    from backend.v2.proxy_profiles import PROXY_PROFILES
    
    # Define user profile
    user_profile = UserProxyProfile(
        user_profile_version="1.0",
        name="Editorial ProRes Proxy",
        constraints={
            "intra_frame_only": True,
            "max_resolution": "same",
            "preferred_codecs": ["prores"],
            "engine_preference": ["ffmpeg"]
        }
    )
    
    # Compile to canonical profile
    try:
        canonical_id = compile_user_proxy_profile(user_profile, PROXY_PROFILES)
        print(f"Resolved to: {canonical_id}")
    except CompilationError as e:
        print(f"Compilation failed: {e}")

Part of V2 User Proxy Profiles feature.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any
from backend.v2.proxy_profiles import ProxyProfile, EngineType, ResolutionPolicy


# =============================================================================
# Validation Constants
# =============================================================================

SUPPORTED_VERSIONS = {"1.0"}

VALID_CODECS = {"prores", "dnxhr", "h264", "hevc"}
VALID_RESOLUTIONS = {"same", "1080p", "2k"}
VALID_ENGINES = {"ffmpeg", "resolve"}

VALID_CONSTRAINT_FIELDS = {
    "intra_frame_only",
    "allow_long_gop",
    "max_resolution",
    "preferred_codecs",
    "engine_preference",
}

# Codec family mapping
INTRA_FRAME_CODECS = {"prores_proxy", "prores_lt", "prores_standard", "prores_hq", "prores_4444", "dnxhd", "dnxhr"}
LONG_GOP_CODECS = {"h264", "h265", "hevc"}


# =============================================================================
# Exceptions
# =============================================================================

class ValidationError(Exception):
    """Raised when user profile schema validation fails."""
    pass


class CompilationError(Exception):
    """Raised when user profile cannot be compiled to a canonical profile."""
    pass


# =============================================================================
# User Proxy Profile
# =============================================================================

@dataclass
class UserProxyProfile:
    """
    User-friendly proxy profile specification.
    
    A user profile expresses constraints for proxy generation in human terms.
    It is NOT executable—it must be compiled to a canonical proxy profile.
    
    Attributes:
        user_profile_version: Schema version (currently "1.0")
        name: Human-readable profile name
        constraints: Dictionary of constraint specifications
        notes: Optional human-readable description (non-functional)
    """
    user_profile_version: str
    name: str
    constraints: Dict[str, Any] = field(default_factory=dict)
    notes: Optional[str] = None
    
    def __post_init__(self):
        """Validate user profile schema."""
        self._validate()
    
    def _validate(self):
        """
        Validate user profile schema.
        
        Raises:
            ValidationError: If schema is invalid
        """
        # Validate version
        if not self.user_profile_version:
            raise ValidationError("user_profile_version is required")
        
        if self.user_profile_version not in SUPPORTED_VERSIONS:
            supported = ", ".join(sorted(SUPPORTED_VERSIONS))
            raise ValidationError(
                f"Unsupported user_profile_version '{self.user_profile_version}'. "
                f"Supported versions: {supported}"
            )
        
        # Validate name
        if not self.name or not isinstance(self.name, str):
            raise ValidationError("name must be a non-empty string")
        
        # Validate constraints is a dict
        if not isinstance(self.constraints, dict):
            raise ValidationError("constraints must be a dictionary")
        
        # Check for unknown constraint fields
        unknown_fields = set(self.constraints.keys()) - VALID_CONSTRAINT_FIELDS
        if unknown_fields:
            valid_fields = ", ".join(sorted(VALID_CONSTRAINT_FIELDS))
            unknown_list = ", ".join(sorted(unknown_fields))
            raise ValidationError(
                f"Unknown constraint field(s): {unknown_list}. "
                f"Valid fields: {valid_fields}"
            )
        
        # Validate individual constraint values
        self._validate_constraints()
    
    def _validate_constraints(self):
        """
        Validate constraint values.
        
        Raises:
            ValidationError: If constraint values are invalid
        """
        constraints = self.constraints
        
        # intra_frame_only
        if "intra_frame_only" in constraints:
            if not isinstance(constraints["intra_frame_only"], bool):
                raise ValidationError("intra_frame_only must be a boolean")
        
        # allow_long_gop
        if "allow_long_gop" in constraints:
            if not isinstance(constraints["allow_long_gop"], bool):
                raise ValidationError("allow_long_gop must be a boolean")
        
        # max_resolution
        if "max_resolution" in constraints:
            max_res = constraints["max_resolution"]
            if max_res not in VALID_RESOLUTIONS:
                valid = ", ".join(sorted(VALID_RESOLUTIONS))
                raise ValidationError(
                    f"Invalid max_resolution '{max_res}'. Valid values: {valid}"
                )
        
        # preferred_codecs
        if "preferred_codecs" in constraints:
            preferred = constraints["preferred_codecs"]
            if not isinstance(preferred, list):
                raise ValidationError("preferred_codecs must be a list")
            if not preferred:
                raise ValidationError("preferred_codecs cannot be empty")
            
            for codec in preferred:
                if codec not in VALID_CODECS:
                    valid = ", ".join(sorted(VALID_CODECS))
                    raise ValidationError(
                        f"Invalid codec '{codec}' in preferred_codecs. Valid codecs: {valid}"
                    )
        
        # engine_preference
        if "engine_preference" in constraints:
            preference = constraints["engine_preference"]
            if not isinstance(preference, list):
                raise ValidationError("engine_preference must be a list")
            if not preference:
                raise ValidationError("engine_preference cannot be empty")
            
            for engine in preference:
                if engine not in VALID_ENGINES:
                    valid = ", ".join(sorted(VALID_ENGINES))
                    raise ValidationError(
                        f"Invalid engine '{engine}' in engine_preference. Valid engines: {valid}"
                    )


# =============================================================================
# Compiler
# =============================================================================

def compile_user_proxy_profile(
    user_profile: UserProxyProfile,
    available_profiles: Dict[str, ProxyProfile]
) -> str:
    """
    Compile user proxy profile to exactly one canonical proxy profile.
    
    Algorithm:
    1. Start with all available canonical profiles
    2. Apply each constraint, filtering out non-matching profiles
    3. Check result:
       - Exactly 1 match → success, return canonical profile ID
       - 0 matches → CompilationError (unsatisfiable)
       - >1 matches → CompilationError (ambiguous)
    
    Args:
        user_profile: User proxy profile specification
        available_profiles: Dictionary of canonical profile name -> ProxyProfile
        
    Returns:
        Canonical proxy profile ID (string)
        
    Raises:
        CompilationError: If compilation fails (no match or ambiguous match)
    """
    # Start with all available profiles
    candidates = list(available_profiles.keys())
    
    # Apply constraints
    constraints = user_profile.constraints
    
    # Constraint: intra_frame_only
    if constraints.get("intra_frame_only"):
        candidates = _filter_intra_frame_only(candidates, available_profiles)
    
    # Constraint: allow_long_gop
    if "allow_long_gop" in constraints and not constraints["allow_long_gop"]:
        candidates = _filter_no_long_gop(candidates, available_profiles)
    
    # Constraint: max_resolution
    if "max_resolution" in constraints:
        max_res = constraints["max_resolution"]
        candidates = _filter_max_resolution(candidates, available_profiles, max_res)
    
    # Constraint: preferred_codecs
    if "preferred_codecs" in constraints:
        preferred_codecs = constraints["preferred_codecs"]
        candidates = _filter_preferred_codecs(candidates, available_profiles, preferred_codecs)
    
    # Constraint: engine_preference (tie-breaker)
    if "engine_preference" in constraints:
        engine_pref = constraints["engine_preference"]
        candidates = _apply_engine_preference(candidates, available_profiles, engine_pref)
    
    # Check match count
    if len(candidates) == 0:
        raise CompilationError(
            f"No matching canonical profile for user profile '{user_profile.name}'. "
            f"Constraints are unsatisfiable."
        )
    
    if len(candidates) > 1:
        profile_list = ", ".join(sorted(candidates))
        raise CompilationError(
            f"Ambiguous match for user profile '{user_profile.name}'. "
            f"Multiple canonical profiles satisfy constraints: [{profile_list}]. "
            f"Add more constraints to resolve to exactly one profile."
        )
    
    return candidates[0]


# =============================================================================
# Constraint Filters
# =============================================================================

def _filter_intra_frame_only(
    candidates: List[str],
    profiles: Dict[str, ProxyProfile]
) -> List[str]:
    """Filter to only intra-frame codecs (ProRes, DNxHR)."""
    return [
        name for name in candidates
        if profiles[name].codec in INTRA_FRAME_CODECS
    ]


def _filter_no_long_gop(
    candidates: List[str],
    profiles: Dict[str, ProxyProfile]
) -> List[str]:
    """Filter out long-GOP codecs (H.264, H.265, HEVC)."""
    return [
        name for name in candidates
        if profiles[name].codec not in LONG_GOP_CODECS
    ]


def _filter_max_resolution(
    candidates: List[str],
    profiles: Dict[str, ProxyProfile],
    max_resolution: str
) -> List[str]:
    """
    Filter by maximum resolution policy.
    
    Resolution hierarchy:
    - "same" (source) = no scaling
    - "1080p" = allows scale_50, scale_25, or source (if source <= 1080p)
    - "2k" = allows scale_50, scale_25, or source (if source <= 2k)
    
    For simplicity, we enforce:
    - "same" → SOURCE policy only
    - "1080p" → SOURCE or SCALE_50 or SCALE_25 (conservatively allow all)
    - "2k" → SOURCE or SCALE_50 or SCALE_25
    
    This is a conservative filter; finer-grained resolution matching
    would require source media metadata, which is not available at
    compile time.
    """
    if max_resolution == "same":
        # Only source resolution allowed
        return [
            name for name in candidates
            if profiles[name].resolution_policy == ResolutionPolicy.SOURCE
        ]
    elif max_resolution in ("1080p", "2k"):
        # Allow all scaling policies (SOURCE, SCALE_50, SCALE_25)
        # since we don't know source resolution at compile time
        return candidates
    else:
        # Unknown max_resolution (should never happen due to validation)
        return candidates


def _filter_preferred_codecs(
    candidates: List[str],
    profiles: Dict[str, ProxyProfile],
    preferred_codecs: List[str]
) -> List[str]:
    """
    Filter by preferred codec families.
    
    Maps codec families to canonical codec names:
    - "prores" → prores_proxy, prores_lt, prores_standard, prores_hq, prores_4444
    - "dnxhr" → dnxhd, dnxhr
    - "h264" → h264
    - "hevc" → h265, hevc
    """
    codec_family_map = {
        "prores": {"prores_proxy", "prores_lt", "prores_standard", "prores_hq", "prores_4444"},
        "dnxhr": {"dnxhd", "dnxhr"},
        "h264": {"h264"},
        "hevc": {"h265", "hevc"},
    }
    
    # Collect all allowed canonical codecs
    allowed_codecs = set()
    for family in preferred_codecs:
        allowed_codecs.update(codec_family_map.get(family, set()))
    
    # Filter profiles
    filtered = [
        name for name in candidates
        if profiles[name].codec in allowed_codecs
    ]
    
    # If preferred_codecs specified but nothing matches, return empty
    # (this will trigger unsatisfiable error)
    return filtered


def _apply_engine_preference(
    candidates: List[str],
    profiles: Dict[str, ProxyProfile],
    engine_preference: List[str]
) -> List[str]:
    """
    Apply engine preference as a tie-breaker.
    
    If multiple profiles remain after constraint filtering,
    select only those matching the first engine in the preference list.
    
    This is a deterministic tie-breaker, not a ranking system.
    """
    if len(candidates) <= 1:
        # No tie to break
        return candidates
    
    # Try each engine in preference order
    for preferred_engine in engine_preference:
        engine_type = EngineType.FFMPEG if preferred_engine == "ffmpeg" else EngineType.RESOLVE
        
        matching = [
            name for name in candidates
            if profiles[name].engine == engine_type
        ]
        
        if matching:
            # Found matches for this engine preference
            return matching
    
    # No engine preference matched (shouldn't happen if engine_preference is valid)
    return candidates


# =============================================================================
# Metadata Generation
# =============================================================================

def generate_profile_origin_metadata(
    user_profile: UserProxyProfile,
    canonical_profile_id: str
) -> Dict[str, Any]:
    """
    Generate origin metadata for a compiled user profile.
    
    This metadata is informational only and should be stored in job metadata
    for auditing and debugging purposes.
    
    Args:
        user_profile: Original user proxy profile
        canonical_profile_id: Compiled canonical profile ID
        
    Returns:
        Metadata dictionary with proxy_profile and proxy_profile_origin
    """
    return {
        "proxy_profile": canonical_profile_id,
        "proxy_profile_origin": {
            "type": "user_profile",
            "name": user_profile.name,
            "version": user_profile.user_profile_version,
        }
    }
