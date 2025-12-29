"""
Tests for V2 User Proxy Profile Compiler.

Comprehensive test coverage for user proxy profile validation and compilation.

Part of V2 User Proxy Profiles feature.
"""

import pytest
from backend.user_proxy_profiles import (
    UserProxyProfile,
    ValidationError,
    CompilationError,
    compile_user_proxy_profile,
    generate_profile_origin_metadata,
)
from backend.v2.proxy_profiles import PROXY_PROFILES, EngineType


# =============================================================================
# Fixtures
# =============================================================================

@pytest.fixture
def canonical_profiles():
    """Provide canonical proxy profiles for testing."""
    return PROXY_PROFILES


# =============================================================================
# Schema Validation Tests
# =============================================================================

class TestSchemaValidation:
    """Test user profile schema validation."""
    
    def test_valid_minimal_profile(self):
        """Valid profile with minimal required fields."""
        profile = UserProxyProfile(
            user_profile_version="1.0",
            name="Minimal Profile",
            constraints={}
        )
        assert profile.user_profile_version == "1.0"
        assert profile.name == "Minimal Profile"
        assert profile.constraints == {}
    
    def test_valid_profile_with_notes(self):
        """Valid profile with optional notes field."""
        profile = UserProxyProfile(
            user_profile_version="1.0",
            name="Profile With Notes",
            constraints={},
            notes="This is a test profile"
        )
        assert profile.notes == "This is a test profile"
    
    def test_invalid_version(self):
        """Invalid user_profile_version."""
        with pytest.raises(ValidationError, match="Unsupported user_profile_version"):
            UserProxyProfile(
                user_profile_version="2.0",
                name="Invalid Version",
                constraints={}
            )
    
    def test_missing_version(self):
        """Missing user_profile_version."""
        with pytest.raises(ValidationError, match="user_profile_version is required"):
            UserProxyProfile(
                user_profile_version="",
                name="Missing Version",
                constraints={}
            )
    
    def test_empty_name(self):
        """Empty name field."""
        with pytest.raises(ValidationError, match="name must be a non-empty string"):
            UserProxyProfile(
                user_profile_version="1.0",
                name="",
                constraints={}
            )
    
    def test_unknown_constraint_field(self):
        """Unknown field in constraints."""
        with pytest.raises(ValidationError, match="Unknown constraint field"):
            UserProxyProfile(
                user_profile_version="1.0",
                name="Unknown Field",
                constraints={
                    "intra_frame_only": True,
                    "max_bitrate": "10M"
                }
            )


# =============================================================================
# Constraint Validation Tests
# =============================================================================

class TestConstraintValidation:
    """Test individual constraint validation."""
    
    def test_valid_intra_frame_only(self):
        """Valid intra_frame_only constraint."""
        profile = UserProxyProfile(
            user_profile_version="1.0",
            name="Intra Frame",
            constraints={"intra_frame_only": True}
        )
        assert profile.constraints["intra_frame_only"] is True
    
    def test_invalid_intra_frame_only_type(self):
        """Invalid intra_frame_only type (not boolean)."""
        with pytest.raises(ValidationError, match="intra_frame_only must be a boolean"):
            UserProxyProfile(
                user_profile_version="1.0",
                name="Invalid Intra Frame",
                constraints={"intra_frame_only": "true"}
            )
    
    def test_valid_preferred_codecs(self):
        """Valid preferred_codecs constraint."""
        profile = UserProxyProfile(
            user_profile_version="1.0",
            name="Preferred Codecs",
            constraints={"preferred_codecs": ["prores", "dnxhr"]}
        )
        assert profile.constraints["preferred_codecs"] == ["prores", "dnxhr"]
    
    def test_invalid_codec_in_preferred_codecs(self):
        """Invalid codec name in preferred_codecs."""
        with pytest.raises(ValidationError, match="Invalid codec.*in preferred_codecs"):
            UserProxyProfile(
                user_profile_version="1.0",
                name="Invalid Codec",
                constraints={"preferred_codecs": ["prores", "av1"]}
            )
    
    def test_valid_engine_preference(self):
        """Valid engine_preference constraint."""
        profile = UserProxyProfile(
            user_profile_version="1.0",
            name="Engine Preference",
            constraints={"engine_preference": ["ffmpeg", "resolve"]}
        )
        assert profile.constraints["engine_preference"] == ["ffmpeg", "resolve"]


# =============================================================================
# Compilation Success Tests
# =============================================================================

class TestCompilationSuccess:
    """Test successful compilation to exactly one canonical profile."""
    
    def test_compile_dnxhr_lb_ffmpeg(self, canonical_profiles):
        """Compile to exactly proxy_dnxhr_lb."""
        profile = UserProxyProfile(
            user_profile_version="1.0",
            name="DNxHR FFmpeg",
            constraints={
                "preferred_codecs": ["dnxhr"],
                "engine_preference": ["ffmpeg"]
            }
        )
        
        result = compile_user_proxy_profile(profile, canonical_profiles)
        assert result == "proxy_dnxhr_lb"
    
    def test_compile_respects_engine_preference(self, canonical_profiles):
        """Engine preference is used as tie-breaker."""
        profile = UserProxyProfile(
            user_profile_version="1.0",
            name="DNxHR Tie Breaker",
            constraints={
                "preferred_codecs": ["dnxhr"],
                "engine_preference": ["ffmpeg"]
            }
        )
        
        result = compile_user_proxy_profile(profile, canonical_profiles)
        assert canonical_profiles[result].engine == EngineType.FFMPEG


# =============================================================================
# Compilation Failure Tests
# =============================================================================

class TestCompilationFailure:
    """Test compilation failures (no match or ambiguous match)."""
    
    def test_unsatisfiable_constraints(self, canonical_profiles):
        """Constraints that cannot be satisfied by any profile."""
        profile = UserProxyProfile(
            user_profile_version="1.0",
            name="Unsatisfiable",
            constraints={
                "intra_frame_only": True,
                "preferred_codecs": ["h264"]
            }
        )
        
        with pytest.raises(CompilationError, match="No matching canonical profile"):
            compile_user_proxy_profile(profile, canonical_profiles)
    
    def test_ambiguous_match(self, canonical_profiles):
        """Constraints that match multiple profiles."""
        profile = UserProxyProfile(
            user_profile_version="1.0",
            name="Ambiguous",
            constraints={
                "preferred_codecs": ["prores"]
            }
        )
        
        with pytest.raises(CompilationError, match="Ambiguous match"):
            compile_user_proxy_profile(profile, canonical_profiles)
    
    def test_ambiguous_match_lists_profiles(self, canonical_profiles):
        """Ambiguous match error includes list of matching profiles."""
        profile = UserProxyProfile(
            user_profile_version="1.0",
            name="Ambiguous ProRes",
            constraints={
                "preferred_codecs": ["prores"]
            }
        )
        
        with pytest.raises(CompilationError) as exc_info:
            compile_user_proxy_profile(profile, canonical_profiles)
        
        error_message = str(exc_info.value)
        assert "proxy_prores" in error_message
    
    def test_empty_constraints_ambiguous(self, canonical_profiles):
        """Profile with no constraints is ambiguous."""
        profile = UserProxyProfile(
            user_profile_version="1.0",
            name="No Constraints",
            constraints={}
        )
        
        with pytest.raises(CompilationError, match="Ambiguous match"):
            compile_user_proxy_profile(profile, canonical_profiles)


# =============================================================================
# Determinism Tests
# =============================================================================

class TestDeterminism:
    """Test compilation determinism (same input, same output)."""
    
    def test_same_input_same_output(self, canonical_profiles):
        """Compiling the same profile twice produces the same result."""
        profile = UserProxyProfile(
            user_profile_version="1.0",
            name="Determinism Test",
            constraints={
                "preferred_codecs": ["dnxhr"],
                "engine_preference": ["ffmpeg"]
            }
        )
        
        result1 = compile_user_proxy_profile(profile, canonical_profiles)
        result2 = compile_user_proxy_profile(profile, canonical_profiles)
        
        assert result1 == result2
        assert result1 == "proxy_dnxhr_lb"
    
    def test_equivalent_profiles_same_output(self, canonical_profiles):
        """Two profiles with identical constraints produce the same result."""
        profile1 = UserProxyProfile(
            user_profile_version="1.0",
            name="Profile A",
            constraints={
                "preferred_codecs": ["dnxhr"],
                "engine_preference": ["ffmpeg"]
            }
        )
        
        profile2 = UserProxyProfile(
            user_profile_version="1.0",
            name="Profile B",
            constraints={
                "preferred_codecs": ["dnxhr"],
                "engine_preference": ["ffmpeg"]
            }
        )
        
        result1 = compile_user_proxy_profile(profile1, canonical_profiles)
        result2 = compile_user_proxy_profile(profile2, canonical_profiles)
        
        assert result1 == result2


# =============================================================================
# Metadata Generation Tests
# =============================================================================

class TestMetadataGeneration:
    """Test origin metadata generation."""
    
    def test_generate_metadata(self):
        """Generate metadata for compiled profile."""
        profile = UserProxyProfile(
            user_profile_version="1.0",
            name="Test Profile",
            constraints={}
        )
        
        metadata = generate_profile_origin_metadata(profile, "proxy_prores_proxy")
        
        assert metadata["proxy_profile"] == "proxy_prores_proxy"
        assert metadata["proxy_profile_origin"]["type"] == "user_profile"
        assert metadata["proxy_profile_origin"]["name"] == "Test Profile"
        assert metadata["proxy_profile_origin"]["version"] == "1.0"
    
    def test_metadata_structure(self):
        """Metadata has correct structure for job spec integration."""
        profile = UserProxyProfile(
            user_profile_version="1.0",
            name="Editorial ProRes",
            constraints={"preferred_codecs": ["prores"]}
        )
        
        metadata = generate_profile_origin_metadata(profile, "proxy_prores_proxy")
        
        assert "proxy_profile" in metadata
        assert "proxy_profile_origin" in metadata
        assert "type" in metadata["proxy_profile_origin"]
        assert "name" in metadata["proxy_profile_origin"]
        assert "version" in metadata["proxy_profile_origin"]


# =============================================================================
# Real World Scenarios
# =============================================================================

class TestRealWorldScenarios:
    """Test realistic user profile scenarios."""
    
    def test_broadcast_workflow_dnxhr(self, canonical_profiles):
        """Broadcast workflow: DNxHR LB."""
        profile = UserProxyProfile(
            user_profile_version="1.0",
            name="Broadcast DNxHR",
            constraints={
                "preferred_codecs": ["dnxhr"],
                "engine_preference": ["ffmpeg"]
            }
        )
        
        result = compile_user_proxy_profile(profile, canonical_profiles)
        assert result == "proxy_dnxhr_lb"
    
    def test_intra_frame_only_filters_h264(self, canonical_profiles):
        """Intra-frame constraint excludes H.264 profiles."""
        profile = UserProxyProfile(
            user_profile_version="1.0",
            name="Intra Only",
            constraints={
                "intra_frame_only": True,
                "preferred_codecs": ["dnxhr"],
                "engine_preference": ["ffmpeg"]
            }
        )
        
        result = compile_user_proxy_profile(profile, canonical_profiles)
        canonical_profile = canonical_profiles[result]
        assert canonical_profile.codec not in ["h264", "h265", "hevc"]
    
    def test_no_long_gop_filters_correctly(self, canonical_profiles):
        """allow_long_gop=False excludes long-GOP codecs."""
        profile = UserProxyProfile(
            user_profile_version="1.0",
            name="No Long GOP",
            constraints={
                "allow_long_gop": False,
                "preferred_codecs": ["dnxhr"],
                "engine_preference": ["ffmpeg"]
            }
        )
        
        result = compile_user_proxy_profile(profile, canonical_profiles)
        canonical_profile = canonical_profiles[result]
        assert canonical_profile.codec not in ["h264", "h265", "hevc"]
