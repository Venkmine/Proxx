"""
Tests for V2 Canonical Proxy Profiles.

V2 Step 5: Proxy Profile Canonicalization
==========================================
These tests verify that:
1. All proxy profiles are valid and immutable
2. Profile lookup works correctly
3. Profile validation against engine routing is enforced
4. FFmpeg command arguments are resolved correctly from profiles
5. Resolve preset mapping works correctly
6. Unknown profiles are rejected with clear errors

Part of V2 Phase 1 Step 5: Proxy Profile Canonicalization
"""

import pytest
from pathlib import Path

# Import the modules under test
from backend.v2.proxy_profiles import (
    ProxyProfile,
    EngineType,
    ResolutionPolicy,
    AudioPolicy,
    PROXY_PROFILES,
    get_profile,
    validate_profile_for_engine,
    list_profiles_for_engine,
    get_profile_metadata,
    resolve_ffmpeg_codec_args,
    resolve_ffmpeg_resolution_args,
    resolve_ffmpeg_audio_args,
    resolve_resolve_preset,
    ProxyProfileError,
)


class TestProxyProfileDefinitions:
    """Test that all defined proxy profiles are valid."""
    
    def test_all_profiles_are_immutable(self):
        """All profiles should be frozen dataclasses (immutable)."""
        for profile_name, profile in PROXY_PROFILES.items():
            assert isinstance(profile, ProxyProfile)
            # Try to modify - should raise AttributeError
            with pytest.raises(AttributeError):
                profile.codec = "different_codec"  # type: ignore
    
    def test_all_profiles_have_required_fields(self):
        """All profiles must have all required fields."""
        required_fields = {
            "name", "engine", "codec", "container",
            "resolution_policy", "audio_policy", "notes"
        }
        
        for profile_name, profile in PROXY_PROFILES.items():
            for field_name in required_fields:
                assert hasattr(profile, field_name), \
                    f"Profile {profile_name} missing field {field_name}"
                assert getattr(profile, field_name) is not None, \
                    f"Profile {profile_name} has None for {field_name}"
    
    def test_profile_names_match_keys(self):
        """Profile names should match their dictionary keys."""
        for key, profile in PROXY_PROFILES.items():
            assert profile.name == key, \
                f"Profile key '{key}' doesn't match profile.name '{profile.name}'"
    
    def test_ffmpeg_profiles_exist(self):
        """Required FFmpeg profiles must be defined."""
        required_ffmpeg_profiles = [
            "proxy_h264_low",
            "proxy_prores_proxy",
            "proxy_dnxhr_lb",
        ]
        
        for profile_name in required_ffmpeg_profiles:
            assert profile_name in PROXY_PROFILES, \
                f"Required FFmpeg profile '{profile_name}' not found"
            profile = PROXY_PROFILES[profile_name]
            assert profile.engine == EngineType.FFMPEG, \
                f"Profile '{profile_name}' should be FFmpeg engine"
    
    def test_resolve_profiles_exist(self):
        """Required Resolve profiles must be defined."""
        required_resolve_profiles = [
            "proxy_prores_proxy_resolve",
            "proxy_prores_hq_resolve",
            "proxy_dnxhr_lb_resolve",
        ]
        
        for profile_name in required_resolve_profiles:
            assert profile_name in PROXY_PROFILES, \
                f"Required Resolve profile '{profile_name}' not found"
            profile = PROXY_PROFILES[profile_name]
            assert profile.engine == EngineType.RESOLVE, \
                f"Profile '{profile_name}' should be Resolve engine"


class TestProfileLookup:
    """Test profile lookup and validation."""
    
    def test_get_profile_success(self):
        """Getting an existing profile should succeed."""
        profile = get_profile("proxy_h264_low")
        assert profile.name == "proxy_h264_low"
        assert profile.engine == EngineType.FFMPEG
    
    def test_get_profile_unknown_raises_error(self):
        """Getting an unknown profile should raise ProxyProfileError."""
        with pytest.raises(ProxyProfileError) as exc_info:
            get_profile("nonexistent_profile")
        
        assert "Unknown proxy profile" in str(exc_info.value)
        assert "nonexistent_profile" in str(exc_info.value)
        assert "Available profiles" in str(exc_info.value)
    
    def test_validate_profile_for_engine_ffmpeg_match(self):
        """Validating FFmpeg profile for FFmpeg engine should succeed."""
        # Should not raise
        validate_profile_for_engine("proxy_h264_low", "ffmpeg")
    
    def test_validate_profile_for_engine_resolve_match(self):
        """Validating Resolve profile for Resolve engine should succeed."""
        # Should not raise
        validate_profile_for_engine("proxy_prores_proxy_resolve", "resolve")
    
    def test_validate_profile_for_engine_mismatch_ffmpeg_profile_resolve_engine(self):
        """FFmpeg profile for Resolve engine should fail."""
        with pytest.raises(ProxyProfileError) as exc_info:
            validate_profile_for_engine("proxy_h264_low", "resolve")
        
        assert "requires ffmpeg engine" in str(exc_info.value).lower()
        assert "routes to resolve" in str(exc_info.value).lower()
    
    def test_validate_profile_for_engine_mismatch_resolve_profile_ffmpeg_engine(self):
        """Resolve profile for FFmpeg engine should fail."""
        with pytest.raises(ProxyProfileError) as exc_info:
            validate_profile_for_engine("proxy_prores_proxy_resolve", "ffmpeg")
        
        assert "requires resolve engine" in str(exc_info.value).lower()
        assert "routes to ffmpeg" in str(exc_info.value).lower()
    
    def test_list_profiles_for_engine_ffmpeg(self):
        """Listing FFmpeg profiles should return only FFmpeg profiles."""
        ffmpeg_profiles = list_profiles_for_engine(EngineType.FFMPEG)
        
        assert len(ffmpeg_profiles) > 0
        for profile_name, profile in ffmpeg_profiles.items():
            assert profile.engine == EngineType.FFMPEG
    
    def test_list_profiles_for_engine_resolve(self):
        """Listing Resolve profiles should return only Resolve profiles."""
        resolve_profiles = list_profiles_for_engine(EngineType.RESOLVE)
        
        assert len(resolve_profiles) > 0
        for profile_name, profile in resolve_profiles.items():
            assert profile.engine == EngineType.RESOLVE
    
    def test_get_profile_metadata(self):
        """Getting profile metadata should return correct info."""
        metadata = get_profile_metadata("proxy_h264_low")
        
        assert metadata["name"] == "proxy_h264_low"
        assert metadata["engine"] == "ffmpeg"
        assert metadata["codec"] == "h264"
        assert metadata["container"] == "mp4"
        assert "resolution" in metadata
        assert "audio" in metadata
        assert "notes" in metadata


class TestFFmpegArgumentResolution:
    """Test FFmpeg command argument resolution from profiles."""
    
    def test_resolve_ffmpeg_codec_args_h264(self):
        """H.264 profile should resolve to correct FFmpeg codec args."""
        profile = get_profile("proxy_h264_low")
        codec_args = resolve_ffmpeg_codec_args(profile)
        
        assert "-c:v" in codec_args
        assert "libx264" in codec_args
        assert "-crf" in codec_args
    
    def test_resolve_ffmpeg_codec_args_prores(self):
        """ProRes profile should resolve to correct FFmpeg codec args."""
        profile = get_profile("proxy_prores_proxy")
        codec_args = resolve_ffmpeg_codec_args(profile)
        
        assert "-c:v" in codec_args
        assert "prores_ks" in codec_args
        assert "-profile:v" in codec_args
        assert "0" in codec_args  # ProRes Proxy profile
    
    def test_resolve_ffmpeg_codec_args_dnxhr(self):
        """DNxHR profile should resolve to correct FFmpeg codec args."""
        profile = get_profile("proxy_dnxhr_lb")
        codec_args = resolve_ffmpeg_codec_args(profile)
        
        assert "-c:v" in codec_args
        assert "dnxhd" in codec_args
        assert "dnxhr_lb" in codec_args
    
    def test_resolve_ffmpeg_codec_args_resolve_profile_raises_error(self):
        """Resolving FFmpeg args for Resolve profile should raise error."""
        profile = get_profile("proxy_prores_proxy_resolve")
        
        with pytest.raises(ProxyProfileError) as exc_info:
            resolve_ffmpeg_codec_args(profile)
        
        assert "Cannot resolve FFmpeg args" in str(exc_info.value)
        assert "resolve" in str(exc_info.value).lower()
    
    def test_resolve_ffmpeg_resolution_args_source(self):
        """Source resolution policy should return empty args."""
        profile = get_profile("proxy_prores_proxy")
        resolution_args = resolve_ffmpeg_resolution_args(profile)
        
        assert resolution_args == []
    
    def test_resolve_ffmpeg_resolution_args_scale_50(self):
        """Half resolution policy should return correct scaling args."""
        profile = get_profile("proxy_h264_low")
        resolution_args = resolve_ffmpeg_resolution_args(profile)
        
        assert "-vf" in resolution_args
        assert "scale=iw/2:ih/2" in resolution_args
    
    def test_resolve_ffmpeg_resolution_args_scale_25(self):
        """Quarter resolution policy should return correct scaling args."""
        profile = get_profile("proxy_h264_quarter")
        resolution_args = resolve_ffmpeg_resolution_args(profile)
        
        assert "-vf" in resolution_args
        assert "scale=iw/4:ih/4" in resolution_args
    
    def test_resolve_ffmpeg_audio_args_copy(self):
        """Copy audio policy should return copy args."""
        profile = get_profile("proxy_prores_proxy")
        audio_args = resolve_ffmpeg_audio_args(profile)
        
        assert "-c:a" in audio_args
        assert "copy" in audio_args
    
    def test_resolve_ffmpeg_audio_args_aac(self):
        """AAC audio policy should return AAC transcoding args."""
        profile = get_profile("proxy_h264_low")
        audio_args = resolve_ffmpeg_audio_args(profile)
        
        assert "-c:a" in audio_args
        assert "aac" in audio_args
        assert "-b:a" in audio_args
    
    def test_resolve_ffmpeg_audio_args_pcm(self):
        """PCM audio policy should return PCM args."""
        profile = get_profile("proxy_dnxhr_lb")
        audio_args = resolve_ffmpeg_audio_args(profile)
        
        assert "-c:a" in audio_args
        assert "pcm_s16le" in audio_args


class TestResolvePresetMapping:
    """Test Resolve preset name resolution from profiles."""
    
    def test_resolve_resolve_preset_prores_proxy(self):
        """ProRes Proxy profile should map to correct Resolve preset."""
        profile = get_profile("proxy_prores_proxy_resolve")
        preset_name = resolve_resolve_preset(profile)
        
        assert preset_name == "ProRes Proxy"
    
    def test_resolve_resolve_preset_prores_hq(self):
        """ProRes HQ profile should map to correct Resolve preset."""
        profile = get_profile("proxy_prores_hq_resolve")
        preset_name = resolve_resolve_preset(profile)
        
        assert preset_name == "ProRes HQ"
    
    def test_resolve_resolve_preset_dnxhr(self):
        """DNxHR profile should map to correct Resolve preset."""
        profile = get_profile("proxy_dnxhr_lb_resolve")
        preset_name = resolve_resolve_preset(profile)
        
        assert preset_name == "DNxHR LB"
    
    def test_resolve_resolve_preset_ffmpeg_profile_raises_error(self):
        """Resolving Resolve preset for FFmpeg profile should raise error."""
        profile = get_profile("proxy_h264_low")
        
        with pytest.raises(ProxyProfileError) as exc_info:
            resolve_resolve_preset(profile)
        
        assert "Cannot resolve Resolve preset" in str(exc_info.value)
        assert "ffmpeg" in str(exc_info.value).lower()


class TestProfileDeterminism:
    """Test that profiles produce deterministic outputs."""
    
    def test_profile_lookup_is_deterministic(self):
        """Looking up the same profile multiple times should return the same object."""
        profile1 = get_profile("proxy_h264_low")
        profile2 = get_profile("proxy_h264_low")
        
        # Should be the exact same object (not just equal)
        assert profile1 is profile2
    
    def test_ffmpeg_args_are_deterministic(self):
        """Resolving FFmpeg args multiple times should produce identical results."""
        profile = get_profile("proxy_prores_proxy")
        
        codec_args1 = resolve_ffmpeg_codec_args(profile)
        codec_args2 = resolve_ffmpeg_codec_args(profile)
        
        assert codec_args1 == codec_args2
    
    def test_profiles_cannot_be_mutated(self):
        """Attempting to mutate a profile should fail."""
        profile = get_profile("proxy_h264_low")
        
        with pytest.raises(AttributeError):
            profile.codec = "h265"  # type: ignore
        
        with pytest.raises(AttributeError):
            profile.container = "mkv"  # type: ignore
    
    def test_proxy_profiles_dict_cannot_be_modified(self):
        """The PROXY_PROFILES dict should be effectively immutable."""
        # Get a reference to the original
        original_count = len(PROXY_PROFILES)
        
        # Try to modify (this may or may not raise, but shouldn't affect the module)
        try:
            PROXY_PROFILES["new_profile"] = ProxyProfile(  # type: ignore
                name="new_profile",
                engine=EngineType.FFMPEG,
                codec="h264",
                container="mp4",
                resolution_policy=ResolutionPolicy.SOURCE,
                audio_policy=AudioPolicy.COPY,
                notes="Test profile"
            )
        except (TypeError, AttributeError):
            pass  # Good, dict is immutable
        
        # The module-level dict should be unchanged
        assert len(PROXY_PROFILES) == original_count or "new_profile" not in PROXY_PROFILES
