"""
Tests for JobSpec proxy_profile validation.

V2 Step 5: Proxy Profile Canonicalization - JobSpec Integration
================================================================
These tests verify that:
1. JobSpec requires proxy_profile field
2. proxy_profile validation works correctly
3. Profile engine must match job engine routing
4. Invalid profiles are rejected with clear errors
5. Missing proxy_profile is rejected

Part of V2 Phase 1 Step 5: Proxy Profile Canonicalization
"""

import pytest
from pathlib import Path
import tempfile
import json
import sys

# Add backend to path for imports
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from job_spec import JobSpec, JobSpecValidationError
from v2.proxy_profiles import ProxyProfileError


class TestJobSpecProxyProfileField:
    """Test that JobSpec correctly handles proxy_profile field."""
    
    def test_jobspec_accepts_proxy_profile(self):
        """JobSpec should accept proxy_profile in constructor."""
        job_spec = JobSpec(
            sources=["/path/to/source.mp4"],
            output_directory="/output",
            codec="h264",
            container="mp4",
            resolution="half",
            naming_template="{source_name}_proxy",
            proxy_profile="proxy_h264_low",
        )
        
        assert job_spec.proxy_profile == "proxy_h264_low"
    
    def test_jobspec_proxy_profile_defaults_to_none(self):
        """JobSpec without proxy_profile should default to None."""
        job_spec = JobSpec(
            sources=["/path/to/source.mp4"],
            output_directory="/output",
            codec="h264",
            container="mp4",
            resolution="half",
            naming_template="{source_name}_proxy",
        )
        
        assert job_spec.proxy_profile is None
    
    def test_jobspec_serializes_proxy_profile(self):
        """JobSpec.to_dict() should include proxy_profile."""
        job_spec = JobSpec(
            sources=["/path/to/source.mp4"],
            output_directory="/output",
            codec="h264",
            container="mp4",
            resolution="half",
            naming_template="{source_name}_proxy",
            proxy_profile="proxy_prores_proxy",
        )
        
        job_dict = job_spec.to_dict()
        assert "proxy_profile" in job_dict
        assert job_dict["proxy_profile"] == "proxy_prores_proxy"
    
    def test_jobspec_deserializes_proxy_profile(self):
        """JobSpec.from_dict() should restore proxy_profile."""
        job_dict = {
            "jobspec_version": "2.1",
            "sources": ["/path/to/source.mp4"],
            "output_directory": "/output",
            "codec": "h264",
            "container": "mp4",
            "resolution": "half",
            "naming_template": "{source_name}_proxy",
            "proxy_profile": "proxy_dnxhr_lb",
        }
        
        job_spec = JobSpec.from_dict(job_dict)
        assert job_spec.proxy_profile == "proxy_dnxhr_lb"
    
    def test_jobspec_json_roundtrip_with_proxy_profile(self):
        """JobSpec should survive JSON serialization roundtrip."""
        original = JobSpec(
            sources=["/path/to/source.mp4"],
            output_directory="/output",
            codec="prores_proxy",
            container="mov",
            resolution="same",
            naming_template="{source_name}_proxy",
            proxy_profile="proxy_prores_proxy",
        )
        
        json_str = original.to_json()
        restored = JobSpec.from_json(json_str)
        
        assert restored.proxy_profile == original.proxy_profile


class TestValidateProxyProfile:
    """Test JobSpec.validate_proxy_profile() method."""
    
    def test_validate_proxy_profile_missing_raises_error(self):
        """Validating without proxy_profile should fail."""
        job_spec = JobSpec(
            sources=["/path/to/source.mp4"],
            output_directory="/output",
            codec="h264",
            container="mp4",
            resolution="half",
            naming_template="{source_name}_proxy",
            proxy_profile=None,
        )
        
        with pytest.raises(JobSpecValidationError) as exc_info:
            job_spec.validate_proxy_profile(routes_to_resolve=False)
        
        assert "must specify proxy_profile" in str(exc_info.value).lower()
        assert "V2" in str(exc_info.value)
    
    def test_validate_proxy_profile_empty_string_raises_error(self):
        """Validating with empty proxy_profile should fail."""
        job_spec = JobSpec(
            sources=["/path/to/source.mp4"],
            output_directory="/output",
            codec="h264",
            container="mp4",
            resolution="half",
            naming_template="{source_name}_proxy",
            proxy_profile="",
        )
        
        with pytest.raises(JobSpecValidationError) as exc_info:
            job_spec.validate_proxy_profile(routes_to_resolve=False)
        
        assert "must specify proxy_profile" in str(exc_info.value).lower()
    
    def test_validate_proxy_profile_unknown_profile_raises_error(self):
        """Validating with unknown profile should fail."""
        job_spec = JobSpec(
            sources=["/path/to/source.mp4"],
            output_directory="/output",
            codec="h264",
            container="mp4",
            resolution="half",
            naming_template="{source_name}_proxy",
            proxy_profile="nonexistent_profile",
        )
        
        with pytest.raises(JobSpecValidationError) as exc_info:
            job_spec.validate_proxy_profile(routes_to_resolve=False)
        
        assert "Invalid proxy_profile" in str(exc_info.value)
        assert "nonexistent_profile" in str(exc_info.value)
    
    def test_validate_proxy_profile_ffmpeg_profile_for_ffmpeg_engine_succeeds(self):
        """FFmpeg profile for FFmpeg engine should pass validation."""
        job_spec = JobSpec(
            sources=["/path/to/source.mp4"],
            output_directory="/output",
            codec="h264",
            container="mp4",
            resolution="half",
            naming_template="{source_name}_proxy",
            proxy_profile="proxy_h264_low",
        )
        
        # Should not raise
        job_spec.validate_proxy_profile(routes_to_resolve=False)
    
    def test_validate_proxy_profile_resolve_profile_for_resolve_engine_succeeds(self):
        """Resolve profile for Resolve engine should pass validation."""
        job_spec = JobSpec(
            sources=["/path/to/raw.ari"],
            output_directory="/output",
            codec="prores_proxy",
            container="mov",
            resolution="same",
            naming_template="{source_name}_proxy",
            proxy_profile="proxy_prores_proxy_resolve",
        )
        
        # Should not raise
        job_spec.validate_proxy_profile(routes_to_resolve=True)
    
    def test_validate_proxy_profile_ffmpeg_profile_for_resolve_engine_fails(self):
        """FFmpeg profile for Resolve engine should fail validation."""
        job_spec = JobSpec(
            sources=["/path/to/raw.ari"],
            output_directory="/output",
            codec="h264",
            container="mp4",
            resolution="half",
            naming_template="{source_name}_proxy",
            proxy_profile="proxy_h264_low",  # FFmpeg profile
        )
        
        with pytest.raises(JobSpecValidationError) as exc_info:
            job_spec.validate_proxy_profile(routes_to_resolve=True)
        
        assert "Proxy profile mismatch" in str(exc_info.value)
        assert "requires ffmpeg" in str(exc_info.value).lower()
        assert "routes to resolve" in str(exc_info.value).lower()
    
    def test_validate_proxy_profile_resolve_profile_for_ffmpeg_engine_fails(self):
        """Resolve profile for FFmpeg engine should fail validation."""
        job_spec = JobSpec(
            sources=["/path/to/source.mp4"],
            output_directory="/output",
            codec="prores_proxy",
            container="mov",
            resolution="same",
            naming_template="{source_name}_proxy",
            proxy_profile="proxy_prores_proxy_resolve",  # Resolve profile
        )
        
        with pytest.raises(JobSpecValidationError) as exc_info:
            job_spec.validate_proxy_profile(routes_to_resolve=False)
        
        assert "Proxy profile mismatch" in str(exc_info.value)
        assert "requires resolve" in str(exc_info.value).lower()
        assert "routes to ffmpeg" in str(exc_info.value).lower()


class TestProxyProfileInKnownFields:
    """Test that proxy_profile is in JobSpec.KNOWN_FIELDS."""
    
    def test_proxy_profile_in_known_fields(self):
        """proxy_profile should be in KNOWN_FIELDS."""
        assert "proxy_profile" in JobSpec.KNOWN_FIELDS
    
    def test_deserialization_with_proxy_profile_succeeds(self):
        """Deserializing JobSpec with proxy_profile should not trigger unknown field error."""
        job_dict = {
            "jobspec_version": "2.1",
            "sources": ["/path/to/source.mp4"],
            "output_directory": "/output",
            "codec": "h264",
            "container": "mp4",
            "resolution": "half",
            "naming_template": "{source_name}_proxy",
            "proxy_profile": "proxy_h264_low",
        }
        
        # Should not raise
        job_spec = JobSpec.from_dict(job_dict)
        assert job_spec.proxy_profile == "proxy_h264_low"


class TestProxyProfileErrorMessages:
    """Test that error messages are actionable and helpful."""
    
    def test_missing_proxy_profile_error_suggests_profiles(self):
        """Missing proxy_profile error should suggest how to list profiles."""
        job_spec = JobSpec(
            sources=["/path/to/source.mp4"],
            output_directory="/output",
            codec="h264",
            container="mp4",
            resolution="half",
            naming_template="{source_name}_proxy",
        )
        
        with pytest.raises(JobSpecValidationError) as exc_info:
            job_spec.validate_proxy_profile(routes_to_resolve=False)
        
        error_msg = str(exc_info.value)
        # Should mention how to discover profiles
        assert "proxy_h264_low" in error_msg or "proxy_prores_proxy" in error_msg
    
    def test_engine_mismatch_error_suggests_correct_profile_type(self):
        """Engine mismatch error should suggest correct profile category."""
        job_spec = JobSpec(
            sources=["/path/to/raw.ari"],
            output_directory="/output",
            codec="h264",
            container="mp4",
            resolution="half",
            naming_template="{source_name}_proxy",
            proxy_profile="proxy_h264_low",
        )
        
        with pytest.raises(JobSpecValidationError) as exc_info:
            job_spec.validate_proxy_profile(routes_to_resolve=True)
        
        error_msg = str(exc_info.value)
        # Should suggest using Resolve profile for RAW
        assert "Resolve" in error_msg or "RAW" in error_msg


class TestProxyProfileWatchFolderCompatibility:
    """Test that proxy_profile works correctly in watch folder scenarios."""
    
    def test_jobspec_file_without_proxy_profile_can_be_parsed(self):
        """Legacy JobSpec JSON without proxy_profile should parse (but fail validation)."""
        # Simulate a JobSpec JSON dropped into watch folder
        job_dict = {
            "jobspec_version": "2.1",
            "sources": ["/path/to/source.mp4"],
            "output_directory": "/output",
            "codec": "h264",
            "container": "mp4",
            "resolution": "half",
            "naming_template": "{source_name}_proxy",
            # No proxy_profile
        }
        
        # Should parse successfully
        job_spec = JobSpec.from_dict(job_dict)
        assert job_spec.proxy_profile is None
        
        # But validation should fail
        with pytest.raises(JobSpecValidationError):
            job_spec.validate_proxy_profile(routes_to_resolve=False)
    
    def test_jobspec_file_with_proxy_profile_validates(self):
        """JobSpec JSON with proxy_profile should validate successfully."""
        job_dict = {
            "jobspec_version": "2.1",
            "sources": ["/path/to/source.mp4"],
            "output_directory": "/output",
            "codec": "h264",
            "container": "mp4",
            "resolution": "half",
            "naming_template": "{source_name}_proxy",
            "proxy_profile": "proxy_h264_low",
        }
        
        job_spec = JobSpec.from_dict(job_dict)
        # Should not raise
        job_spec.validate_proxy_profile(routes_to_resolve=False)
