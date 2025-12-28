"""
Tests for JobSpec codec/container validation rules.

These tests verify:
1. DNxHD + MOV → FAIL (non-standard)
2. DNxHD + MXF → PASS (industry standard)
3. DNxHR + MOV → PASS (cross-platform)
4. DNxHR + MXF → PASS (broadcast)
5. Error messages are deterministic and actionable

Part of V2 Phase 1 (Option A: Reliable Proxy Engine)
"""

import pytest
import sys
from pathlib import Path

# Import the module under test
sys.path.insert(0, str(Path(__file__).parent.parent))

from job_spec import JobSpec, JobSpecValidationError, JOBSPEC_VERSION


# -----------------------------------------------------------------------------
# Test Fixtures
# -----------------------------------------------------------------------------

def create_test_jobspec(codec: str, container: str) -> JobSpec:
    """Create a minimal JobSpec for testing codec/container validation."""
    return JobSpec(
        sources=["/tmp/test_source.mov"],
        output_directory="/tmp/output",
        codec=codec,
        container=container,
        resolution="1920x1080",
        naming_template="{source_name}_proxy",
    )


# -----------------------------------------------------------------------------
# DNxHD Container Restriction Tests
# -----------------------------------------------------------------------------

class TestDNxHDContainerRestrictions:
    """
    Tests for DNxHD container restrictions.
    
    Rule: DNxHD must be wrapped in MXF only.
    DNxHD-in-MOV is non-standard and causes issues with:
    - Avid Media Composer relinking
    - Broadcast QC systems
    - NLE interchange workflows
    """
    
    def test_dnxhd_mxf_passes_validation(self):
        """DNxHD + MXF should pass validation."""
        spec = create_test_jobspec(codec="dnxhd", container="mxf")
        # Should not raise
        spec.validate_codec_container()
    
    def test_dnxhd_mov_fails_validation(self):
        """DNxHD + MOV should fail validation."""
        spec = create_test_jobspec(codec="dnxhd", container="mov")
        
        with pytest.raises(JobSpecValidationError) as exc_info:
            spec.validate_codec_container()
        
        error_msg = str(exc_info.value)
        assert "DNxHD" in error_msg
        assert "MXF" in error_msg
    
    def test_dnxhd_mov_error_mentions_non_standard(self):
        """DNxHD + MOV error should mention it's non-standard."""
        spec = create_test_jobspec(codec="dnxhd", container="mov")
        
        with pytest.raises(JobSpecValidationError) as exc_info:
            spec.validate_codec_container()
        
        error_msg = str(exc_info.value).lower()
        assert "non-standard" in error_msg or "unsupported" in error_msg
    
    def test_dnxhd_mov_error_suggests_alternatives(self):
        """DNxHD + MOV error should suggest MXF or DNxHR."""
        spec = create_test_jobspec(codec="dnxhd", container="mov")
        
        with pytest.raises(JobSpecValidationError) as exc_info:
            spec.validate_codec_container()
        
        error_msg = str(exc_info.value)
        # Should suggest using MXF container
        has_mxf_suggestion = "MXF" in error_msg
        # Or suggest using DNxHR instead
        has_dnxhr_suggestion = "DNxHR" in error_msg
        
        assert has_mxf_suggestion or has_dnxhr_suggestion
    
    def test_dnxhd_uppercase_mov_fails(self):
        """DNxHD + MOV should fail regardless of case."""
        spec = create_test_jobspec(codec="DNXHD", container="MOV")
        
        with pytest.raises(JobSpecValidationError):
            spec.validate_codec_container()
    
    def test_dnxhd_dot_mov_fails(self):
        """DNxHD + .mov (with dot) should fail."""
        spec = create_test_jobspec(codec="dnxhd", container=".mov")
        
        with pytest.raises(JobSpecValidationError):
            spec.validate_codec_container()


# -----------------------------------------------------------------------------
# DNxHR Container Tests (Should Support Both MXF and MOV)
# -----------------------------------------------------------------------------

class TestDNxHRContainerSupport:
    """
    Tests for DNxHR container support.
    
    Rule: DNxHR supports both MXF and MOV containers.
    DNxHR is the modern Avid codec with cross-platform flexibility.
    Profiles: LB, SQ, HQ, HQX, 444
    """
    
    def test_dnxhr_mxf_passes_validation(self):
        """DNxHR + MXF should pass validation."""
        spec = create_test_jobspec(codec="dnxhr", container="mxf")
        # Should not raise
        spec.validate_codec_container()
    
    def test_dnxhr_mov_passes_validation(self):
        """DNxHR + MOV should pass validation."""
        spec = create_test_jobspec(codec="dnxhr", container="mov")
        # Should not raise
        spec.validate_codec_container()
    
    def test_dnxhr_uppercase_containers_pass(self):
        """DNxHR with uppercase containers should pass."""
        spec_mxf = create_test_jobspec(codec="DNXHR", container="MXF")
        spec_mov = create_test_jobspec(codec="DNXHR", container="MOV")
        
        # Neither should raise
        spec_mxf.validate_codec_container()
        spec_mov.validate_codec_container()
    
    def test_dnxhr_invalid_container_fails(self):
        """DNxHR with invalid container (e.g., MP4) should fail."""
        spec = create_test_jobspec(codec="dnxhr", container="mp4")
        
        with pytest.raises(JobSpecValidationError) as exc_info:
            spec.validate_codec_container()
        
        # Error should mention valid containers
        error_msg = str(exc_info.value)
        assert "mov" in error_msg.lower() or "mxf" in error_msg.lower()


# -----------------------------------------------------------------------------
# Error Message Determinism Tests
# -----------------------------------------------------------------------------

class TestErrorMessageDeterminism:
    """Tests that error messages are deterministic and consistent."""
    
    def test_dnxhd_mov_error_is_deterministic(self):
        """DNxHD + MOV error message should be identical across calls."""
        spec = create_test_jobspec(codec="dnxhd", container="mov")
        
        errors = []
        for _ in range(5):
            try:
                spec.validate_codec_container()
            except JobSpecValidationError as e:
                errors.append(str(e))
        
        assert len(errors) == 5
        assert all(e == errors[0] for e in errors), "Error messages should be identical"
    
    def test_error_contains_codec_and_container(self):
        """Error messages should include the offending codec and container."""
        spec = create_test_jobspec(codec="dnxhd", container="mov")
        
        with pytest.raises(JobSpecValidationError) as exc_info:
            spec.validate_codec_container()
        
        error_msg = str(exc_info.value)
        assert "dnxhd" in error_msg.lower() or "DNxHD" in error_msg
        assert "mov" in error_msg.lower() or "MOV" in error_msg


# -----------------------------------------------------------------------------
# Full Validation Chain Tests
# -----------------------------------------------------------------------------

class TestFullValidationChain:
    """Tests that codec/container validation is part of full validate() chain."""
    
    def test_validate_catches_dnxhd_mov(self):
        """Full validate() should catch DNxHD + MOV before path checks."""
        spec = create_test_jobspec(codec="dnxhd", container="mov")
        
        with pytest.raises(JobSpecValidationError) as exc_info:
            spec.validate(check_paths=False)  # Don't check paths
        
        error_msg = str(exc_info.value)
        assert "DNxHD" in error_msg or "MXF" in error_msg
    
    def test_validate_passes_dnxhd_mxf(self):
        """Full validate() should pass DNxHD + MXF (path check disabled)."""
        spec = create_test_jobspec(codec="dnxhd", container="mxf")
        
        # Should not raise when path check is disabled
        spec.validate(check_paths=False)
    
    def test_validate_passes_dnxhr_mov(self):
        """Full validate() should pass DNxHR + MOV (path check disabled)."""
        spec = create_test_jobspec(codec="dnxhr", container="mov")
        
        # Should not raise when path check is disabled
        spec.validate(check_paths=False)


# -----------------------------------------------------------------------------
# Valid Codec/Container Matrix Tests
# -----------------------------------------------------------------------------

class TestValidCodecContainerMatrix:
    """Tests that the VALID_CODEC_CONTAINERS matrix is correctly defined."""
    
    def test_dnxhd_only_allows_mxf(self):
        """DNxHD should only allow MXF container."""
        valid_containers = JobSpec.VALID_CODEC_CONTAINERS.get("dnxhd", [])
        
        assert "mxf" in valid_containers
        assert "mov" not in valid_containers
        assert len(valid_containers) == 1
    
    def test_dnxhr_allows_mov_and_mxf(self):
        """DNxHR should allow both MOV and MXF containers."""
        valid_containers = JobSpec.VALID_CODEC_CONTAINERS.get("dnxhr", [])
        
        assert "mov" in valid_containers
        assert "mxf" in valid_containers
        assert len(valid_containers) == 2
    
    def test_prores_only_allows_mov(self):
        """ProRes codecs should only allow MOV container."""
        prores_codecs = ["prores_proxy", "prores_lt", "prores_standard", "prores_hq", "prores_4444"]
        
        for codec in prores_codecs:
            valid_containers = JobSpec.VALID_CODEC_CONTAINERS.get(codec, [])
            assert valid_containers == ["mov"], f"{codec} should only allow MOV"
    
    def test_h264_allows_mp4_mov_mkv(self):
        """H.264 should allow MP4, MOV, and MKV containers."""
        valid_containers = JobSpec.VALID_CODEC_CONTAINERS.get("h264", [])
        
        assert "mp4" in valid_containers
        assert "mov" in valid_containers
        assert "mkv" in valid_containers


# -----------------------------------------------------------------------------
# Edge Case Tests
# -----------------------------------------------------------------------------

class TestEdgeCases:
    """Tests for edge cases and boundary conditions."""
    
    def test_empty_codec_fails(self):
        """Empty codec should fail validation."""
        spec = create_test_jobspec(codec="", container="mxf")
        
        with pytest.raises(JobSpecValidationError):
            spec.validate_codec_container()
    
    def test_unknown_codec_fails(self):
        """Unknown codec should fail validation."""
        spec = create_test_jobspec(codec="not_a_real_codec", container="mxf")
        
        with pytest.raises(JobSpecValidationError):
            spec.validate_codec_container()
    
    def test_unknown_container_fails(self):
        """Unknown container should fail validation."""
        spec = create_test_jobspec(codec="dnxhr", container="xyz")
        
        with pytest.raises(JobSpecValidationError):
            spec.validate_codec_container()
