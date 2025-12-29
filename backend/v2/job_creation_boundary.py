"""
V2 Job Creation Boundary - Minimal UI/Backend interface for job creation.

This module provides a thin boundary between UI and backend job creation logic.
It exists to enforce separation of concerns and prevent UI logic from leaking
into execution.

Design Principles:
==================
1. UI provides intent (UserProxyProfile ID, sources, paths)
2. Backend performs compilation and validation
3. UI receives either a JobSpec (success) or explicit error (failure)
4. UI CANNOT inspect canonical proxy profiles
5. UI CANNOT retry automatically
6. UI CANNOT modify JobSpec
7. UI CANNOT guess alternatives

This is a MINIMAL implementation for V2 Slice 1. No visual components required.

Part of V2 IMPLEMENTATION SLICE 1
"""

from dataclasses import dataclass
from typing import List, Optional, Union

from backend.job_creation import (
    create_jobspec_from_user_profile,
    ProfileCompilationError,
    ProfileDeprecatedError,
    JobCreationError,
)
from backend.user_proxy_profiles import UserProxyProfile, ValidationError
from backend.job_spec import JobSpec, JobSpecValidationError


# =============================================================================
# Job Creation Result
# =============================================================================

@dataclass
class JobCreationSuccess:
    """
    Successful job creation result.
    
    Contains the created JobSpec and NO additional information.
    UI must not inspect the canonical proxy profile or attempt to
    modify the JobSpec.
    """
    jobspec: JobSpec


@dataclass
class JobCreationFailure:
    """
    Failed job creation result.
    
    Contains an explicit error message and error type.
    UI displays this error to the user without attempting recovery.
    """
    error_type: str  # "compilation", "validation", "deprecated", "schema"
    error_message: str
    user_profile_name: Optional[str] = None


JobCreationResult = Union[JobCreationSuccess, JobCreationFailure]


# =============================================================================
# UI Boundary Function
# =============================================================================

def create_job_from_user_profile_id(
    user_profile: UserProxyProfile,
    sources: List[str],
    output_directory: str,
    naming_template: str,
) -> JobCreationResult:
    """
    UI boundary function for creating a job from a UserProxyProfile.
    
    This function wraps the backend job creation logic and returns a
    structured result that the UI can display. It enforces that:
    
    - UI provides intent only (profile ID, sources, paths)
    - UI receives either JobSpec or explicit error
    - UI does not retry, override, or infer alternatives
    
    Args:
        user_profile: UserProxyProfile instance (selected by UI)
        sources: List of source file paths
        output_directory: Output directory path
        naming_template: Naming template string
        
    Returns:
        JobCreationResult (either Success or Failure)
        
    Example (Success):
        >>> result = create_job_from_user_profile_id(
        ...     user_profile=my_profile,
        ...     sources=["/path/to/source.mxf"],
        ...     output_directory="/path/to/output",
        ...     naming_template="{source_name}_proxy.mov"
        ... )
        >>> if isinstance(result, JobCreationSuccess):
        ...     jobspec = result.jobspec
        ...     # Submit jobspec to execution engine
        
    Example (Failure):
        >>> result = create_job_from_user_profile_id(...)
        >>> if isinstance(result, JobCreationFailure):
        ...     print(f"Error: {result.error_message}")
        ...     # Display error to user
    """
    try:
        # Attempt job creation
        jobspec = create_jobspec_from_user_profile(
            user_profile=user_profile,
            sources=sources,
            output_directory=output_directory,
            naming_template=naming_template,
        )
        
        # Success: Return JobSpec
        return JobCreationSuccess(jobspec=jobspec)
        
    except ProfileCompilationError as e:
        # Pre-job failure: Compilation failed (ambiguous or unsatisfiable)
        return JobCreationFailure(
            error_type="compilation",
            error_message=str(e),
            user_profile_name=user_profile.name,
        )
        
    except ProfileDeprecatedError as e:
        # Pre-job failure: Profile is deprecated
        return JobCreationFailure(
            error_type="deprecated",
            error_message=str(e),
            user_profile_name=user_profile.name,
        )
        
    except ValidationError as e:
        # Pre-job failure: Profile schema is invalid
        return JobCreationFailure(
            error_type="schema",
            error_message=str(e),
            user_profile_name=user_profile.name,
        )
        
    except JobSpecValidationError as e:
        # Job validation failure: JobSpec exists but is invalid
        # NOTE: The JobSpec is NOT returned because it failed validation.
        # UI must not attempt to modify or retry the JobSpec.
        return JobCreationFailure(
            error_type="validation",
            error_message=str(e),
            user_profile_name=user_profile.name,
        )
        
    except Exception as e:
        # Unexpected failure: Should not happen
        # Log this as a bug if it occurs in production
        return JobCreationFailure(
            error_type="unexpected",
            error_message=f"Unexpected error during job creation: {str(e)}",
            user_profile_name=user_profile.name,
        )


# =============================================================================
# FORBIDDEN PATTERNS
# =============================================================================
# The following patterns are EXPLICITLY FORBIDDEN in UI code:
#
# ❌ UI inspecting canonical proxy profile
# ❌ UI retrying job creation automatically
# ❌ UI modifying JobSpec after creation
# ❌ UI guessing alternative profiles
# ❌ UI implementing compilation logic
# ❌ UI implementing validation logic
# ❌ UI implementing execution routing
# ❌ UI deriving execution parameters
# ❌ UI selecting default profiles
# ❌ UI interpreting canonical profile IDs
#
# If you are tempted to implement any of the above, STOP.
# Read V2_PROFILE_SELECTION_AND_JOB_CREATION.md and
# V2_IMPLEMENTATION_MAPPING.md to understand why.
# =============================================================================
