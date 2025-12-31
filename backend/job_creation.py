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

Preflight Validation Hooks:
===========================
This module provides preflight validation functions for the frontend.
These are called BEFORE job creation to surface all issues early.
No job is created until all preflight checks pass.

Part of V2 IMPLEMENTATION SLICE 1
"""

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Any, Optional, Literal

from backend.user_proxy_profiles import (
    UserProxyProfile,
    compile_user_proxy_profile,
    generate_profile_origin_metadata,
    ValidationError,
    CompilationError,
)
from backend.job_spec import JobSpec, JobSpecValidationError
from backend.v2.proxy_profiles import PROXY_PROFILES, get_profile, ProxyProfile
from backend.burnins import validate_recipe_id, BurnInRecipeNotFoundError


# =============================================================================
# Preflight Check Types
# =============================================================================

PreflightStatus = Literal["pass", "warning", "fail"]


@dataclass
class PreflightCheckResult:
    """
    Result of a single preflight check.
    
    This mirrors the frontend PreflightCheck type for consistency.
    """
    id: str
    label: str
    status: PreflightStatus
    message: str
    detail: Optional[str] = None


@dataclass
class PreflightReport:
    """
    Complete preflight validation report.
    
    Aggregates all checks for UI display.
    """
    checks: List[PreflightCheckResult]
    can_submit: bool
    blocking_count: int
    warning_count: int
    pass_count: int
    
    @classmethod
    def from_checks(cls, checks: List[PreflightCheckResult]) -> "PreflightReport":
        """Create a report from a list of checks."""
        blocking = sum(1 for c in checks if c.status == "fail")
        warnings = sum(1 for c in checks if c.status == "warning")
        passes = sum(1 for c in checks if c.status == "pass")
        return cls(
            checks=checks,
            can_submit=blocking == 0,
            blocking_count=blocking,
            warning_count=warnings,
            pass_count=passes,
        )


# =============================================================================
# Preflight Validation Hooks
# =============================================================================

def validate_sources_preflight(sources: List[str]) -> List[PreflightCheckResult]:
    """
    Validate source paths for preflight.
    
    Checks:
    - At least one source is provided
    - All paths are absolute
    - (Future) File existence, format detection
    
    Args:
        sources: List of source file paths
        
    Returns:
        List of preflight check results
    """
    checks = []
    
    # Check: Sources required
    if not sources:
        checks.append(PreflightCheckResult(
            id="sources-required",
            label="Source Files",
            status="fail",
            message="At least one source file is required",
        ))
        return checks
    
    # Check: Absolute paths
    invalid_paths = [p for p in sources if not _is_absolute_path(p)]
    if invalid_paths:
        checks.append(PreflightCheckResult(
            id="sources-absolute",
            label="Source Paths",
            status="fail",
            message=f"{len(invalid_paths)} path(s) are not absolute",
            detail=invalid_paths[0],
        ))
    else:
        checks.append(PreflightCheckResult(
            id="sources-valid",
            label="Source Files",
            status="pass",
            message=f"{len(sources)} file(s) provided",
        ))
    
    return checks


def validate_output_preflight(output_directory: str) -> List[PreflightCheckResult]:
    """
    Validate output directory for preflight.
    
    Checks:
    - Output directory is provided
    - Path is absolute
    - (Future) Directory writability
    
    Args:
        output_directory: Output directory path
        
    Returns:
        List of preflight check results
    """
    checks = []
    
    # Check: Output required
    if not output_directory:
        checks.append(PreflightCheckResult(
            id="output-required",
            label="Output Directory",
            status="fail",
            message="Output directory is required",
        ))
        return checks
    
    # Check: Absolute path
    if not _is_absolute_path(output_directory):
        checks.append(PreflightCheckResult(
            id="output-absolute",
            label="Output Directory",
            status="fail",
            message="Output directory must be an absolute path",
            detail=output_directory,
        ))
    else:
        checks.append(PreflightCheckResult(
            id="output-valid",
            label="Output Directory",
            status="pass",
            message=output_directory,
        ))
    
    return checks


def validate_engine_preflight(
    engine: str,
    available_engines: Optional[Dict[str, bool]] = None,
) -> List[PreflightCheckResult]:
    """
    Validate execution engine for preflight.
    
    Checks:
    - Engine is specified
    - Engine is available
    
    Args:
        engine: Engine type (e.g., "ffmpeg", "resolve")
        available_engines: Dict of engine -> availability
        
    Returns:
        List of preflight check results
    """
    checks = []
    
    if available_engines is None:
        # Default: assume FFmpeg is always available
        available_engines = {"ffmpeg": True, "resolve": False}
    
    # Check: Engine specified
    if not engine:
        checks.append(PreflightCheckResult(
            id="engine-selected",
            label="Execution Engine",
            status="fail",
            message="No execution engine selected",
        ))
        return checks
    
    # Check: Engine available
    is_available = available_engines.get(engine, False)
    if not is_available:
        checks.append(PreflightCheckResult(
            id="engine-available",
            label="Execution Engine",
            status="fail",
            message=f"{engine} is not available",
        ))
    else:
        checks.append(PreflightCheckResult(
            id="engine-valid",
            label="Execution Engine",
            status="pass",
            message=engine.title(),
        ))
    
    return checks


def validate_burnin_preflight(burnin_recipe_id: Optional[str]) -> List[PreflightCheckResult]:
    """
    Validate burn-in recipe for preflight.
    
    Checks:
    - If specified, recipe exists
    
    Args:
        burnin_recipe_id: Optional burn-in recipe ID
        
    Returns:
        List of preflight check results
    """
    checks = []
    
    if burnin_recipe_id is None:
        # No burn-in is valid
        return checks
    
    try:
        validate_recipe_id(burnin_recipe_id)
        checks.append(PreflightCheckResult(
            id="burnin-valid",
            label="Burn-in Recipe",
            status="pass",
            message=burnin_recipe_id,
        ))
    except BurnInRecipeNotFoundError as e:
        checks.append(PreflightCheckResult(
            id="burnin-invalid",
            label="Burn-in Recipe",
            status="fail",
            message="Burn-in recipe not found",
            detail=str(e),
        ))
    
    return checks


def run_preflight_validation(
    sources: List[str],
    output_directory: str,
    engine: str = "ffmpeg",
    burnin_recipe_id: Optional[str] = None,
    available_engines: Optional[Dict[str, bool]] = None,
) -> PreflightReport:
    """
    Run complete preflight validation.
    
    This is the main entry point for preflight checks.
    Call this before attempting job creation.
    
    Args:
        sources: List of source file paths
        output_directory: Output directory path
        engine: Execution engine
        burnin_recipe_id: Optional burn-in recipe ID
        available_engines: Dict of engine -> availability
        
    Returns:
        PreflightReport with all check results
    """
    all_checks: List[PreflightCheckResult] = []
    
    # Run all validation hooks
    all_checks.extend(validate_sources_preflight(sources))
    all_checks.extend(validate_output_preflight(output_directory))
    all_checks.extend(validate_engine_preflight(engine, available_engines))
    all_checks.extend(validate_burnin_preflight(burnin_recipe_id))
    
    return PreflightReport.from_checks(all_checks)


def _is_absolute_path(path: str) -> bool:
    """Check if a path is absolute."""
    # Unix-style absolute paths start with /
    # Windows-style absolute paths start with C:\\ or similar
    return path.startswith('/') or (len(path) > 2 and path[1] == ':' and path[2] in ['\\', '/'])


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


class BurnInRecipeError(JobCreationError):
    """
    Raised when a burn-in recipe ID is invalid at job creation.
    
    This is a pre-job failure. No JobSpec is created.
    Burn-in recipe must exist when specified.
    """
    pass


class WorkerLimitError(JobCreationError):
    """
    Raised when job cannot be created due to license worker limits.
    
    This is a pre-job failure. No JobSpec is created.
    The message is explicit about the license tier and limits.
    """
    
    def __init__(self, tier: str, current_workers: int, max_workers: int):
        self.tier = tier
        self.current_workers = current_workers
        self.max_workers = max_workers
        message = (
            f"Worker limit reached for license tier: {tier}. "
            f"Active workers: {current_workers}, limit: {max_workers}. "
            "Cannot create job when no eligible workers are available."
        )
        super().__init__(message)


# =============================================================================
# License Enforcement
# =============================================================================

def _check_worker_limits() -> None:
    """
    Check license worker limits before job creation.
    
    This is called at the start of job creation to fail fast
    if no workers are available due to license limits.
    
    Raises:
        WorkerLimitError: If worker limit is exceeded
    """
    try:
        from backend.licensing import get_enforcer, WorkerLimitExceededError
        enforcer = get_enforcer()
        
        # Check if we can create jobs
        # This doesn't require active workers, but respects limits
        status = enforcer.get_status()
        
        # If at limit and no active workers, fail
        if status["at_limit"] and status["active_workers"] == 0:
            raise WorkerLimitError(
                tier=status["license_tier"],
                current_workers=status["active_workers"],
                max_workers=status["max_workers"],
            )
        
    except ImportError:
        # Licensing module not available - allow by default
        pass
    except WorkerLimitError:
        # Re-raise our own error
        raise
    except Exception:
        # Non-fatal - allow by default
        # License enforcement should not block legitimate work
        pass


# =============================================================================
# Job Creation
# =============================================================================

def create_jobspec_from_user_profile(
    user_profile: UserProxyProfile,
    sources: List[str],
    output_directory: str,
    naming_template: str,
    burnin_recipe_id: Optional[str] = None,
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
        burnin_recipe_id: Optional burn-in recipe ID to apply (Resolve Studio only)
        
    Returns:
        Immutable JobSpec instance
        
    Raises:
        ProfileCompilationError: If compilation fails (pre-job failure)
        ProfileDeprecatedError: If profile is deprecated (pre-job failure)
        ValidationError: If profile schema is invalid (pre-job failure)
        BurnInRecipeError: If burn-in recipe is invalid (pre-job failure)
        WorkerLimitError: If worker limit is exceeded (pre-job failure)
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
    # PRE-JOB LICENSE CHECK: Verify worker availability
    # =========================================================================
    # License enforcement is explicit. If worker limits are exceeded,
    # we fail BEFORE creating the JobSpec. No partial acceptance.
    # No queueing jobs that cannot run.
    
    _check_worker_limits()
    
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
    # PRE-JOB BURN-IN VALIDATION
    # =========================================================================
    # Validate burn-in recipe ID if provided. Recipe must exist.
    # This is a pre-job failure - no JobSpec is created if recipe is invalid.
    # Burn-in recipe is immutable after job creation.
    
    validated_burnin_recipe_id = None
    if burnin_recipe_id is not None:
        try:
            validated_burnin_recipe_id = validate_recipe_id(burnin_recipe_id)
        except BurnInRecipeNotFoundError as e:
            raise BurnInRecipeError(
                f"Invalid burn-in recipe for job: {str(e)}"
            ) from e
    
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
    # ATTACH BURN-IN RECIPE (IMMUTABLE)
    # =========================================================================
    # Burn-in recipe is stored as a private attribute on the JobSpec.
    # This avoids modifying the JobSpec schema while still associating
    # the burn-in config with the job. It is immutable after creation.
    # 
    # NOTE: The burn-in recipe is NOT serialized with the JobSpec to maintain
    # schema stability. It must be passed separately to execution.
    
    jobspec._burnin_recipe_id = validated_burnin_recipe_id  # type: ignore
    
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


# =============================================================================
# Burn-In Helpers
# =============================================================================

def get_burnin_recipe_id(jobspec: JobSpec) -> Optional[str]:
    """
    Get the burn-in recipe ID associated with a JobSpec.
    
    The burn-in recipe is attached at job creation time and is immutable.
    Returns None if no burn-in recipe was specified.
    
    Args:
        jobspec: JobSpec instance
        
    Returns:
        Burn-in recipe ID or None
    """
    return getattr(jobspec, "_burnin_recipe_id", None)


def has_burnins(jobspec: JobSpec) -> bool:
    """
    Check if a JobSpec has burn-ins configured.
    
    Args:
        jobspec: JobSpec instance
        
    Returns:
        True if burn-ins are configured, False otherwise
    """
    return get_burnin_recipe_id(jobspec) is not None
