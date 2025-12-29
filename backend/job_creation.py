"""
V2 Job Creation - Deterministic JobSpec creation from UserProxyProfile.

This module implements the canonical job creation flow for V2 Slice 1:
UserProxyProfile selection → compilation → JobSpec creation.

Design Principles:
==================
1. Compilation happens BEFORE JobSpec creation
2. Compilation failures → NO JobSpec created (pre-job failure)
3. JobSpec validation failures → JobSpec exists but in FAILED state
4. JobSpec is immutable after creation
5. No defaults, no heuristics, no fallbacks
6. Failures surface at the correct layer with explicit errors

Failure Ownership:
==================
Pre-job Failures (NO JobSpec created):
- Invalid user profile (schema validation)
- Deprecated user profile (lifecycle check)
- Compilation ambiguity (multiple matches)
- Unsatisfiable constraints (no matches)

Job Validation Failures (JobSpec exists, can be inspected):
- Missing sources
- Invalid naming template
- Output directory issues
- Codec/container mismatch

Execution Failures (OUT OF SCOPE for Slice 1):
- FFmpeg/Resolve errors
- Source format incompatibility
- Output verification failures

Part of V2 IMPLEMENTATION SLICE 1
"""

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Any

from backend.user_proxy_profiles import (
    UserProxyProfile,
    compile_user_proxy_profile,
    generate_profile_origin_metadata,
    ValidationError,
    CompilationError,
)
from backend.job_spec import JobSpec, JobSpecValidationError
from backend.v2.proxy_profiles import PROXY_PROFILES, get_profile, ProxyProfile


# =============================================================================
# Pre-Job Failure Exceptions
# =============================================================================

class JobCreationError(Exception):
    """
    Base exception for pre-job failures during job creation.
    
    Pre-job failures occur BEFORE a JobSpec is created. No JobSpec
    exists when these errors are raised.
    """
    pass


class ProfileCompilationError(JobCreationError):
    """
    Raised when UserProxyProfile compilation fails.
    
    This is a pre-job failure. No JobSpec is created.
    Compilation can fail due to:
    - Ambiguous constraints (multiple matches)
    - Unsatisfiable constraints (no matches)
    - Invalid profile schema
    """
    pass


class ProfileDeprecatedError(JobCreationError):
    """
    Raised when a deprecated UserProxyProfile is used for job creation.
    
    This is a pre-job failure. No JobSpec is created.
    Deprecated profiles are not selectable for new jobs.
    """
    pass


# =============================================================================
# Job Creation
# =============================================================================

def create_jobspec_from_user_profile(
    user_profile: UserProxyProfile,
    sources: List[str],
    output_directory: str,
    naming_template: str,
) -> JobSpec:
    """
    Create a JobSpec from a UserProxyProfile with deterministic compilation.
    
    This is the canonical entrypoint for V2 job creation. It implements the
    complete flow:
    
    1. Validate UserProxyProfile schema (ValidationError → pre-job failure)
    2. Compile UserProxyProfile → canonical proxy profile (CompilationError → pre-job failure)
    3. Resolve canonical proxy profile to ProxyProfile
    4. Attach proxy_profile_origin metadata
    5. Create JobSpec with resolved parameters
    6. Validate JobSpec (JobSpecValidationError → job validation failure)
    
    Pre-job failures (exceptions raised):
    - ProfileCompilationError: Compilation fails (ambiguous/unsatisfiable)
    - ProfileDeprecatedError: Profile is deprecated
    - ValidationError: Profile schema is invalid
    
    Job validation failures (JobSpec exists, validation fails):
    - JobSpecValidationError: Sources missing, invalid paths, etc.
    
    Args:
        user_profile: User proxy profile specification
        sources: List of absolute paths to source media files
        output_directory: Absolute path to output directory
        naming_template: Template string for output file naming
        
    Returns:
        Immutable JobSpec instance
        
    Raises:
        ProfileCompilationError: If compilation fails (pre-job failure)
        ProfileDeprecatedError: If profile is deprecated (pre-job failure)
        ValidationError: If profile schema is invalid (pre-job failure)
        JobSpecValidationError: If JobSpec validation fails (job validation failure)
        
    Example:
        >>> from backend.user_proxy_profiles import UserProxyProfile
        >>> user_profile = UserProxyProfile(
        ...     user_profile_version="1.0",
        ...     name="Editorial ProRes Proxy",
        ...     constraints={
        ...         "intra_frame_only": True,
        ...         "preferred_codecs": ["prores"],
        ...         "engine_preference": ["ffmpeg"]
        ...     }
        ... )
        >>> jobspec = create_jobspec_from_user_profile(
        ...     user_profile=user_profile,
        ...     sources=["/path/to/source.mxf"],
        ...     output_directory="/path/to/output",
        ...     naming_template="{source_name}_proxy.mov"
        ... )
    """
    # =========================================================================
    # PRE-JOB VALIDATION: Check profile lifecycle state
    # =========================================================================
    # NOTE: In Slice 1, we assume all profiles are ACTIVE.
    # Lifecycle checking (DEPRECATED, GRADUATED) is deferred to future slices
    # when the full lifecycle system is implemented.
    # For now, we document the intended behavior:
    #
    # if user_profile.lifecycle_state == "DEPRECATED":
    #     raise ProfileDeprecatedError(
    #         f"User profile '{user_profile.name}' is deprecated and cannot be "
    #         "used for new jobs. Please select an active profile."
    #     )
    
    # =========================================================================
    # PRE-JOB COMPILATION: Resolve to canonical proxy profile
    # =========================================================================
    # Compilation failure means NO JobSpec is created.
    # UI must display the error and allow the user to modify constraints.
    
    try:
        canonical_profile_id = compile_user_proxy_profile(user_profile, PROXY_PROFILES)
    except CompilationError as e:
        # Compilation failed (ambiguous or unsatisfiable)
        raise ProfileCompilationError(
            f"Failed to compile user profile '{user_profile.name}': {str(e)}"
        ) from e
    except ValidationError as e:
        # Profile schema is invalid
        # This should not happen if the profile was validated at creation time,
        # but we catch it here for defensive programming.
        raise ProfileCompilationError(
            f"User profile '{user_profile.name}' has invalid schema: {str(e)}"
        ) from e
    
    # =========================================================================
    # RETRIEVE CANONICAL PROXY PROFILE
    # =========================================================================
    # At this point, compilation succeeded and we have exactly one canonical profile ID.
    
    canonical_profile = get_profile(canonical_profile_id)
    
    # =========================================================================
    # GENERATE ORIGIN METADATA
    # =========================================================================
    # Attach metadata that records the user profile that led to this canonical profile.
    # This is informational only and does not affect execution.
    
    metadata = generate_profile_origin_metadata(user_profile, canonical_profile_id)
    
    # =========================================================================
    # CREATE JOBSPEC
    # =========================================================================
    # JobSpec fields are fully resolved at creation time from the canonical profile.
    # No lazy resolution. No runtime inference.
    #
    # FORBIDDEN PATTERNS (asserted by code structure):
    # - No UI-derived execution logic (all parameters from canonical profile)
    # - No default proxy selection (explicit compilation required)
    # - No heuristic fallback (compilation failure = hard stop)
    # - No mutation after creation (JobSpec is immutable)
    
    jobspec = JobSpec(
        sources=sources,
        output_directory=output_directory,
        codec=canonical_profile.codec,
        container=canonical_profile.container,
        resolution=_resolve_resolution_policy(canonical_profile.resolution_policy),
        naming_template=naming_template,
        proxy_profile=canonical_profile_id,  # V2 CRITICAL: Store canonical ID
    )
    
    # =========================================================================
    # VALIDATE JOBSPEC
    # =========================================================================
    # Validation failures are JOB VALIDATION FAILURES, not pre-job failures.
    # The JobSpec exists and can be inspected, but it is invalid for execution.
    #
    # JobSpecValidationError is raised directly (not wrapped) so callers can
    # distinguish between pre-job and validation failures.
    
    jobspec.validate_codec_container()
    jobspec.validate_naming_tokens_resolvable()
    # NOTE: validate_paths_exist() is NOT called here because sources may not
    # exist yet (e.g., for watch folder workflows where sources arrive later).
    # Path validation is deferred to execution time.
    
    # =========================================================================
    # SUCCESS: Return immutable JobSpec
    # =========================================================================
    return jobspec


# =============================================================================
# Resolution Policy Mapping
# =============================================================================

def _resolve_resolution_policy(resolution_policy) -> str:
    """
    Map ResolutionPolicy enum to JobSpec resolution string.
    
    This is a deterministic mapping with no heuristics.
    
    Args:
        resolution_policy: ResolutionPolicy enum value
        
    Returns:
        JobSpec-compatible resolution string
    """
    from backend.v2.proxy_profiles import ResolutionPolicy
    
    # Map canonical resolution policies to JobSpec resolution strings
    mapping = {
        ResolutionPolicy.SOURCE: "same",
        ResolutionPolicy.SCALE_50: "half",
        ResolutionPolicy.SCALE_25: "quarter",
    }
    
    if resolution_policy not in mapping:
        raise ValueError(f"Unknown resolution policy: {resolution_policy}")
    
    return mapping[resolution_policy]
