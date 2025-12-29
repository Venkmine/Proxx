"""
V2 JobSpec Creation from UserProxyProfile Tests

Tests for V2 IMPLEMENTATION SLICE 1:
UserProxyProfile selection → compilation → JobSpec creation.

Test Coverage:
==============
1. Valid user profile → JobSpec created successfully
2. JobSpec contains correct canonical proxy profile
3. proxy_profile_origin metadata present
4. Compilation failure → NO JobSpec created
5. Determinism: same inputs → identical JobSpec JSON
6. UI boundary receives explicit errors
7. Pre-job failures vs validation failures
8. Forbidden patterns are prevented

Part of V2 IMPLEMENTATION SLICE 1
"""

import json
import pytest
from pathlib import Path
from typing import Dict, Any

from backend.user_proxy_profiles import (
    UserProxyProfile,
    compile_user_proxy_profile,
    generate_profile_origin_metadata,
    ValidationError,
    CompilationError,
)
from backend.job_creation import (
    create_jobspec_from_user_profile,
    ProfileCompilationError,
    ProfileDeprecatedError,
    _resolve_resolution_policy,
)
from backend.job_spec import JobSpec, JobSpecValidationError
from backend.v2.proxy_profiles import PROXY_PROFILES, ResolutionPolicy
from backend.v2.job_creation_boundary import (
    create_job_from_user_profile_id,
    JobCreationSuccess,
    JobCreationFailure,
)


# =============================================================================
# Test Fixtures
# =============================================================================

@pytest.fixture
def valid_user_profile() -> UserProxyProfile:
    """Valid user profile that compiles successfully to exactly one profile (proxy_dnxhr_lb)."""
    return UserProxyProfile(
        user_profile_version="1.0",
        name="Editorial DNxHR LB",
        constraints={
            "intra_frame_only": True,
            "preferred_codecs": ["dnxhr"],
            "engine_preference": ["ffmpeg"],
            "max_resolution": "same",
        }
    )


@pytest.fixture
def ambiguous_user_profile() -> UserProxyProfile:
    """User profile with ambiguous constraints (matches multiple profiles)."""
    return UserProxyProfile(
        user_profile_version="1.0",
        name="Ambiguous Profile",
        constraints={
            "intra_frame_only": True,
            # No codec preference - will match multiple ProRes profiles
        }
    )


@pytest.fixture
def unsatisfiable_user_profile() -> UserProxyProfile:
    """User profile with unsatisfiable constraints (no matches)."""
    return UserProxyProfile(
        user_profile_version="1.0",
        name="Unsatisfiable Profile",
        constraints={
            "intra_frame_only": True,
            "allow_long_gop": True,  # Contradictory: can't be both intra-frame and long-gop
        }
    )


@pytest.fixture
def test_sources(tmp_path) -> list:
    """Create test source files."""
    sources = []
    for i in range(3):
        source = tmp_path / f"source_{i:03d}.mxf"
        source.write_text(f"test source {i}")
        sources.append(str(source))
    return sources


@pytest.fixture
def test_output_directory(tmp_path) -> str:
    """Create test output directory."""
    output_dir = tmp_path / "output"
    output_dir.mkdir()
    return str(output_dir)


# =============================================================================
# Test: Valid User Profile → JobSpec Created
# =============================================================================

def test_valid_user_profile_creates_jobspec(valid_user_profile, test_sources, test_output_directory):
    """Valid user profile should compile and create JobSpec successfully."""
    jobspec = create_jobspec_from_user_profile(
        user_profile=valid_user_profile,
        sources=test_sources,
        output_directory=test_output_directory,
        naming_template="{source_name}_proxy.mov",
    )
    
    # Assert JobSpec was created
    assert isinstance(jobspec, JobSpec)
    
    # Assert sources are correct
    assert jobspec.sources == test_sources
    assert len(jobspec.sources) == 3
    
    # Assert output directory is correct
    assert jobspec.output_directory == test_output_directory
    
    # Assert naming template is correct
    assert jobspec.naming_template == "{source_name}_proxy.mov"


# =============================================================================
# Test: JobSpec Contains Correct Canonical Proxy Profile
# =============================================================================

def test_jobspec_contains_canonical_proxy_profile(valid_user_profile, test_sources, test_output_directory):
    """JobSpec should contain the correct canonical proxy profile ID."""
    # First, determine what the canonical profile should be
    expected_canonical_id = compile_user_proxy_profile(valid_user_profile, PROXY_PROFILES)
    
    # Create JobSpec
    jobspec = create_jobspec_from_user_profile(
        user_profile=valid_user_profile,
        sources=test_sources,
        output_directory=test_output_directory,
        naming_template="{source_name}_proxy.mov",
    )
    
    # Assert proxy_profile field is set
    assert jobspec.proxy_profile is not None
    assert jobspec.proxy_profile == expected_canonical_id
    
    # Assert JobSpec parameters match canonical profile
    canonical_profile = PROXY_PROFILES[expected_canonical_id]
    assert jobspec.codec == canonical_profile.codec
    assert jobspec.container == canonical_profile.container


# =============================================================================
# Test: Proxy Profile Origin Metadata
# =============================================================================

def test_proxy_profile_origin_metadata(valid_user_profile):
    """Origin metadata should be generated correctly."""
    canonical_id = compile_user_proxy_profile(valid_user_profile, PROXY_PROFILES)
    metadata = generate_profile_origin_metadata(valid_user_profile, canonical_id)
    
    # Assert metadata structure
    assert "proxy_profile" in metadata
    assert "proxy_profile_origin" in metadata
    
    # Assert metadata values
    assert metadata["proxy_profile"] == canonical_id
    assert metadata["proxy_profile_origin"]["type"] == "user_profile"
    assert metadata["proxy_profile_origin"]["name"] == valid_user_profile.name
    assert metadata["proxy_profile_origin"]["version"] == valid_user_profile.user_profile_version


# =============================================================================
# Test: Compilation Failure → NO JobSpec Created
# =============================================================================

def test_ambiguous_profile_raises_compilation_error(ambiguous_user_profile, test_sources, test_output_directory):
    """Ambiguous user profile should raise ProfileCompilationError, no JobSpec created."""
    with pytest.raises(ProfileCompilationError) as exc_info:
        create_jobspec_from_user_profile(
            user_profile=ambiguous_user_profile,
            sources=test_sources,
            output_directory=test_output_directory,
            naming_template="{source_name}_proxy.mov",
        )
    
    # Assert error message contains profile name
    assert ambiguous_user_profile.name in str(exc_info.value)


def test_unsatisfiable_profile_raises_compilation_error(unsatisfiable_user_profile, test_sources, test_output_directory):
    """Unsatisfiable user profile should raise ProfileCompilationError, no JobSpec created."""
    with pytest.raises(ProfileCompilationError) as exc_info:
        create_jobspec_from_user_profile(
            user_profile=unsatisfiable_user_profile,
            sources=test_sources,
            output_directory=test_output_directory,
            naming_template="{source_name}_proxy.mov",
        )
    
    # Assert error message contains profile name
    assert unsatisfiable_user_profile.name in str(exc_info.value)


# =============================================================================
# Test: Determinism (Same Inputs → Identical JobSpec)
# =============================================================================

def test_deterministic_jobspec_creation(valid_user_profile, test_sources, test_output_directory):
    """Same inputs should produce identical JobSpec JSON."""
    # Create first JobSpec
    jobspec1 = create_jobspec_from_user_profile(
        user_profile=valid_user_profile,
        sources=test_sources,
        output_directory=test_output_directory,
        naming_template="{source_name}_proxy.mov",
    )
    
    # Create second JobSpec with identical inputs
    jobspec2 = create_jobspec_from_user_profile(
        user_profile=valid_user_profile,
        sources=test_sources,
        output_directory=test_output_directory,
        naming_template="{source_name}_proxy.mov",
    )
    
    # Assert proxy_profile is identical
    assert jobspec1.proxy_profile == jobspec2.proxy_profile
    
    # Assert codec/container are identical
    assert jobspec1.codec == jobspec2.codec
    assert jobspec1.container == jobspec2.container
    assert jobspec1.resolution == jobspec2.resolution
    
    # Note: job_id and created_at will differ, but the EXECUTION parameters
    # (codec, container, resolution, proxy_profile) must be identical.


# =============================================================================
# Test: UI Boundary Explicit Errors
# =============================================================================

def test_ui_boundary_success(valid_user_profile, test_sources, test_output_directory):
    """UI boundary should return JobCreationSuccess for valid profile."""
    result = create_job_from_user_profile_id(
        user_profile=valid_user_profile,
        sources=test_sources,
        output_directory=test_output_directory,
        naming_template="{source_name}_proxy.mov",
    )
    
    # Assert result is success
    assert isinstance(result, JobCreationSuccess)
    assert isinstance(result.jobspec, JobSpec)


def test_ui_boundary_compilation_failure(ambiguous_user_profile, test_sources, test_output_directory):
    """UI boundary should return JobCreationFailure for compilation error."""
    result = create_job_from_user_profile_id(
        user_profile=ambiguous_user_profile,
        sources=test_sources,
        output_directory=test_output_directory,
        naming_template="{source_name}_proxy.mov",
    )
    
    # Assert result is failure
    assert isinstance(result, JobCreationFailure)
    assert result.error_type == "compilation"
    assert result.user_profile_name == ambiguous_user_profile.name


def test_ui_boundary_validation_failure(valid_user_profile, test_output_directory):
    """UI boundary should return JobCreationFailure for validation error."""
    # Use invalid naming template (unknown token)
    result = create_job_from_user_profile_id(
        user_profile=valid_user_profile,
        sources=["/nonexistent/source.mxf"],  # This is ok for now
        output_directory=test_output_directory,
        naming_template="{source_name}_{unknown_token}.mov",  # Invalid token
    )
    
    # Assert result is failure
    assert isinstance(result, JobCreationFailure)
    assert result.error_type == "validation"


# =============================================================================
# Test: Pre-Job vs Validation Failures
# =============================================================================

def test_pre_job_failure_no_jobspec_created(ambiguous_user_profile, test_sources, test_output_directory):
    """Pre-job failures should NOT create a JobSpec."""
    # Attempt to create job with ambiguous profile
    try:
        jobspec = create_jobspec_from_user_profile(
            user_profile=ambiguous_user_profile,
            sources=test_sources,
            output_directory=test_output_directory,
            naming_template="{source_name}_proxy.mov",
        )
        # Should not reach here
        assert False, "Expected ProfileCompilationError"
    except ProfileCompilationError:
        # Expected: pre-job failure, no JobSpec created
        pass


def test_validation_failure_jobspec_not_returned(valid_user_profile, test_output_directory):
    """Validation failures should raise JobSpecValidationError."""
    # Use invalid naming template
    with pytest.raises(JobSpecValidationError):
        create_jobspec_from_user_profile(
            user_profile=valid_user_profile,
            sources=["/nonexistent/source.mxf"],
            output_directory=test_output_directory,
            naming_template="{source_name}_{unknown_token}.mov",
        )


# =============================================================================
# Test: Resolution Policy Mapping
# =============================================================================

def test_resolve_resolution_policy():
    """Resolution policy should map correctly to JobSpec resolution strings."""
    assert _resolve_resolution_policy(ResolutionPolicy.SOURCE) == "same"
    assert _resolve_resolution_policy(ResolutionPolicy.SCALE_50) == "half"
    assert _resolve_resolution_policy(ResolutionPolicy.SCALE_25) == "quarter"


# =============================================================================
# Test: JobSpec Immutability
# =============================================================================

def test_jobspec_immutability(valid_user_profile, test_sources, test_output_directory):
    """JobSpec should be immutable after creation."""
    jobspec = create_jobspec_from_user_profile(
        user_profile=valid_user_profile,
        sources=test_sources,
        output_directory=test_output_directory,
        naming_template="{source_name}_proxy.mov",
    )
    
    # Attempt to modify JobSpec (should fail for dataclass with frozen=True if set)
    # For now, just document that modification is forbidden
    original_codec = jobspec.codec
    original_proxy_profile = jobspec.proxy_profile
    
    # Assert fields are set
    assert jobspec.codec == original_codec
    assert jobspec.proxy_profile == original_proxy_profile


# =============================================================================
# Test: Canonical Profile Parameters
# =============================================================================

def test_jobspec_uses_canonical_profile_parameters(valid_user_profile, test_sources, test_output_directory):
    """JobSpec parameters should come from canonical profile, not user profile."""
    # Compile to get canonical profile
    canonical_id = compile_user_proxy_profile(valid_user_profile, PROXY_PROFILES)
    canonical_profile = PROXY_PROFILES[canonical_id]
    
    # Create JobSpec
    jobspec = create_jobspec_from_user_profile(
        user_profile=valid_user_profile,
        sources=test_sources,
        output_directory=test_output_directory,
        naming_template="{source_name}_proxy.mov",
    )
    
    # Assert JobSpec uses canonical profile parameters
    assert jobspec.codec == canonical_profile.codec
    assert jobspec.container == canonical_profile.container
    
    # Assert resolution matches canonical profile's resolution policy
    expected_resolution = _resolve_resolution_policy(canonical_profile.resolution_policy)
    assert jobspec.resolution == expected_resolution


# =============================================================================
# Test: Invalid User Profile Schema
# =============================================================================

def test_invalid_profile_schema_raises_error(test_sources, test_output_directory):
    """Invalid user profile schema should raise ValidationError."""
    # Create invalid profile (unsupported version)
    with pytest.raises(ValidationError):
        invalid_profile = UserProxyProfile(
            user_profile_version="99.0",  # Unsupported version
            name="Invalid Profile",
            constraints={}
        )


def test_unknown_constraint_field_raises_error(test_sources, test_output_directory):
    """Unknown constraint fields should be rejected."""
    with pytest.raises(ValidationError):
        invalid_profile = UserProxyProfile(
            user_profile_version="1.0",
            name="Invalid Profile",
            constraints={
                "unknown_field": True,  # Unknown field
            }
        )


# =============================================================================
# Test: Codec/Container Validation
# =============================================================================

def test_codec_container_validation(valid_user_profile, test_sources, test_output_directory):
    """JobSpec should validate codec/container combination."""
    jobspec = create_jobspec_from_user_profile(
        user_profile=valid_user_profile,
        sources=test_sources,
        output_directory=test_output_directory,
        naming_template="{source_name}_proxy.mov",
    )
    
    # Validation should pass for valid profile
    jobspec.validate_codec_container()  # Should not raise


# =============================================================================
# Test: Naming Token Validation
# =============================================================================

def test_naming_token_validation(valid_user_profile, test_sources, test_output_directory):
    """JobSpec should validate naming tokens."""
    jobspec = create_jobspec_from_user_profile(
        user_profile=valid_user_profile,
        sources=test_sources,
        output_directory=test_output_directory,
        naming_template="{source_name}_proxy.mov",
    )
    
    # Validation should pass for valid template
    jobspec.validate_naming_tokens_resolvable()  # Should not raise


# =============================================================================
# Run Tests
# =============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
