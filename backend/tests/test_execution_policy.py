"""
Tests for Execution Policy Layer

These tests verify that execution policy derivation is:
1. Deterministic
2. Read-only (no side effects)
3. Correct for all codec/capability combinations

NO MOCKS for JobSpec or capabilities - use real data structures.
"""

import pytest
import sys
from pathlib import Path
from typing import Dict, Any

# Add backend to path for imports
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from execution.executionPolicy import derive_execution_policy, ExecutionClass
from job_spec import JobSpec


# =============================================================================
# Test Fixtures
# =============================================================================

def make_ffmpeg_capabilities(
    hwaccels: list = None,
    gpu_encoders: list = None,
    cpu_encoders: list = None,
    prores_gpu_supported: bool = False
) -> Dict[str, Any]:
    """Create FFmpeg capabilities dict for testing."""
    return {
        "hwaccels": hwaccels or [],
        "encoders": {
            "gpu": gpu_encoders or [],
            "cpu": cpu_encoders or ["prores_ks", "libx264", "libx265"]
        },
        "prores_gpu_supported": prores_gpu_supported
    }


def make_jobspec(
    codec: str = "prores_proxy",
    container: str = "mov",
    sources: list = None
) -> JobSpec:
    """Create a minimal JobSpec for testing."""
    return JobSpec(
        sources=sources or ["/path/to/source.mov"],
        output_directory="/output",
        codec=codec,
        container=container,
        resolution="half",
        naming_template="{source_name}_proxy"
    )


# =============================================================================
# REQUIRED TEST CASE 1: ProRes + FFmpeg + GPU present
# =============================================================================

def test_prores_always_cpu_only_despite_gpu():
    """
    ProRes under FFmpeg must ALWAYS be CPU_ONLY.
    
    Even if GPU hardware is present, ProRes has no GPU encoder in FFmpeg.
    This is a fundamental limitation.
    """
    jobspec = make_jobspec(codec="prores_proxy")
    
    # System has GPU but ProRes still CPU-only
    capabilities = make_ffmpeg_capabilities(
        hwaccels=["videotoolbox", "cuda"],
        gpu_encoders=["h264_videotoolbox", "h264_nvenc", "hevc_nvenc"],
        cpu_encoders=["prores_ks", "libx264"]
    )
    
    policy = derive_execution_policy(jobspec, capabilities)
    
    # MUST be CPU_ONLY
    assert policy["execution_class"] == ExecutionClass.CPU_ONLY
    
    # MUST have explicit blocking reason mentioning ProRes limitation
    reasons = " ".join(policy["blocking_reasons"])
    assert "prores" in reasons.lower()
    assert "cpu" in reasons.lower() or "cpu-only" in reasons.lower()
    
    # MUST have high confidence
    assert policy["confidence"] == "high"
    
    # ProRes GPU support must be False
    assert policy["capability_summary"]["prores_gpu_supported"] is False
    
    # Should suggest Resolve as alternative
    assert len(policy["alternatives"]) > 0
    assert any(alt["engine"] == "resolve" for alt in policy["alternatives"])


def test_prores_all_variants_cpu_only():
    """All ProRes variants must be CPU_ONLY under FFmpeg."""
    prores_variants = [
        "prores_proxy",
        "prores_lt",
        "prores_standard",
        "prores_hq",
        "prores_4444"
    ]
    
    capabilities = make_ffmpeg_capabilities(
        hwaccels=["videotoolbox"],
        gpu_encoders=["h264_videotoolbox"]
    )
    
    for codec in prores_variants:
        jobspec = make_jobspec(codec=codec)
        policy = derive_execution_policy(jobspec, capabilities)
        
        assert policy["execution_class"] == ExecutionClass.CPU_ONLY, \
            f"{codec} should be CPU_ONLY"
        assert policy["capability_summary"]["prores_gpu_supported"] is False


# =============================================================================
# REQUIRED TEST CASE 2: H.264 + NVENC present
# =============================================================================

def test_h264_with_nvenc_gpu_encode_available():
    """
    H.264 with NVENC present should be classified as GPU_ENCODE_AVAILABLE.
    
    Note: This does NOT mean GPU is actually used - it means it's available.
    Actual usage depends on preset configuration.
    """
    jobspec = make_jobspec(codec="h264", container="mp4")
    
    capabilities = make_ffmpeg_capabilities(
        hwaccels=["cuda"],
        gpu_encoders=["h264_nvenc", "hevc_nvenc"],
        cpu_encoders=["libx264", "prores_ks"]
    )
    
    policy = derive_execution_policy(jobspec, capabilities)
    
    # Should be GPU_ENCODE_AVAILABLE
    assert policy["execution_class"] == ExecutionClass.GPU_ENCODE_AVAILABLE
    
    # Should mention GPU encoder availability
    reasons = " ".join(policy["blocking_reasons"])
    assert "gpu" in reasons.lower()
    
    # Should have high confidence
    assert policy["confidence"] == "high"
    
    # Capability summary should reflect GPU availability
    assert policy["capability_summary"]["gpu_decode"] is True
    assert policy["capability_summary"]["gpu_encode"] is True


def test_h264_with_videotoolbox_gpu_encode_available():
    """H.264 with VideoToolbox (macOS) should be GPU_ENCODE_AVAILABLE."""
    jobspec = make_jobspec(codec="h264", container="mp4")
    
    capabilities = make_ffmpeg_capabilities(
        hwaccels=["videotoolbox"],
        gpu_encoders=["h264_videotoolbox", "hevc_videotoolbox"],
        cpu_encoders=["libx264", "prores_ks"]
    )
    
    policy = derive_execution_policy(jobspec, capabilities)
    
    assert policy["execution_class"] == ExecutionClass.GPU_ENCODE_AVAILABLE
    assert policy["capability_summary"]["gpu_encode"] is True


# =============================================================================
# REQUIRED TEST CASE 3: RAW input
# =============================================================================

def test_raw_codec_requires_resolve():
    """
    RAW codecs (REDCODE, BRAW, ARRIRAW) should suggest Resolve as alternative.
    
    FFmpeg cannot decode RAW formats.
    """
    raw_codecs = ["redcode", "braw", "arriraw", "raw"]
    
    capabilities = make_ffmpeg_capabilities(
        hwaccels=["cuda"],
        gpu_encoders=["h264_nvenc"]
    )
    
    for codec in raw_codecs:
        jobspec = make_jobspec(codec=codec)
        policy = derive_execution_policy(jobspec, capabilities)
        
        # Should mention FFmpeg limitation
        reasons = " ".join(policy["blocking_reasons"]).lower()
        assert "ffmpeg" in reasons or "not supported" in reasons
        
        # Should suggest Resolve
        assert len(policy["alternatives"]) > 0
        assert any(alt["engine"] == "resolve" for alt in policy["alternatives"]), \
            f"{codec} should suggest Resolve as alternative"


# =============================================================================
# REQUIRED TEST CASE 4: No GPU at all
# =============================================================================

def test_no_gpu_cpu_only():
    """
    System with no GPU should classify everything as CPU_ONLY.
    
    This is NOT an error - it's just reality.
    """
    jobspec = make_jobspec(codec="h264", container="mp4")
    
    # No GPU hardware
    capabilities = make_ffmpeg_capabilities(
        hwaccels=[],
        gpu_encoders=[],
        cpu_encoders=["libx264", "prores_ks"]
    )
    
    policy = derive_execution_policy(jobspec, capabilities)
    
    # Should be CPU_ONLY
    assert policy["execution_class"] == ExecutionClass.CPU_ONLY
    
    # Should mention no GPU hardware
    reasons = " ".join(policy["blocking_reasons"]).lower()
    assert "no gpu" in reasons or "cpu" in reasons
    
    # Should have high confidence
    assert policy["confidence"] == "high"
    
    # Capability summary should reflect no GPU
    assert policy["capability_summary"]["gpu_decode"] is False
    assert policy["capability_summary"]["gpu_encode"] is False


def test_prores_no_gpu_still_cpu_only():
    """ProRes without GPU should still be CPU_ONLY (not an error case)."""
    jobspec = make_jobspec(codec="prores_proxy")
    
    capabilities = make_ffmpeg_capabilities(
        hwaccels=[],
        gpu_encoders=[],
        cpu_encoders=["prores_ks"]
    )
    
    policy = derive_execution_policy(jobspec, capabilities)
    
    assert policy["execution_class"] == ExecutionClass.CPU_ONLY
    assert policy["confidence"] == "high"


# =============================================================================
# REQUIRED TEST CASE 5: Malformed JobSpec
# =============================================================================

def test_malformed_jobspec_missing_codec():
    """Malformed JobSpec should raise clean exception, not silent fallback."""
    capabilities = make_ffmpeg_capabilities()
    
    # Create JobSpec dict missing codec
    jobspec_dict = {
        "sources": ["/path/to/source.mov"],
        "output_directory": "/output",
        "container": "mov",
        "resolution": "half",
        "naming_template": "{source_name}_proxy"
        # Missing codec field
    }
    
    # Should raise exception during JobSpec construction
    with pytest.raises((TypeError, AttributeError, KeyError)):
        jobspec = JobSpec(**jobspec_dict)
        derive_execution_policy(jobspec, capabilities)


def test_malformed_capabilities_missing_encoders():
    """Malformed capabilities should handle gracefully."""
    jobspec = make_jobspec(codec="h264")
    
    # Missing encoders key
    capabilities = {
        "hwaccels": ["cuda"],
        # Missing "encoders" key
        "prores_gpu_supported": False
    }
    
    # Should not crash, should handle gracefully
    policy = derive_execution_policy(jobspec, capabilities)
    
    # Should fall back to safe defaults
    assert policy["execution_class"] in [
        ExecutionClass.CPU_ONLY,
        ExecutionClass.GPU_DECODE_ONLY,
        ExecutionClass.GPU_ENCODE_AVAILABLE
    ]


# =============================================================================
# EDGE CASES AND INVARIANTS
# =============================================================================

def test_gpu_decode_only_case():
    """
    GPU decode available but no encoder for codec should be GPU_DECODE_ONLY.
    """
    jobspec = make_jobspec(codec="vp9", container="webm")
    
    capabilities = make_ffmpeg_capabilities(
        hwaccels=["cuda"],
        gpu_encoders=["h264_nvenc"],  # No VP9 encoder
        cpu_encoders=["libvpx-vp9", "prores_ks"]
    )
    
    policy = derive_execution_policy(jobspec, capabilities)
    
    # Should be GPU_DECODE_ONLY (decode available, encode not)
    assert policy["execution_class"] == ExecutionClass.GPU_DECODE_ONLY
    
    # Should mention GPU decode but CPU encode
    reasons = " ".join(policy["blocking_reasons"]).lower()
    assert "gpu decode" in reasons or "gpu" in reasons
    assert "cpu" in reasons or "encoding will use cpu" in reasons


def test_policy_is_deterministic():
    """Same inputs should produce identical policy (deterministic)."""
    jobspec = make_jobspec(codec="h264")
    
    capabilities = make_ffmpeg_capabilities(
        hwaccels=["cuda"],
        gpu_encoders=["h264_nvenc"]
    )
    
    # Run twice
    policy1 = derive_execution_policy(jobspec, capabilities)
    policy2 = derive_execution_policy(jobspec, capabilities)
    
    # Should be identical
    assert policy1 == policy2


def test_policy_has_no_side_effects():
    """Deriving policy should not modify jobspec or capabilities."""
    jobspec = make_jobspec(codec="prores_proxy")
    capabilities = make_ffmpeg_capabilities(
        hwaccels=["videotoolbox"],
        gpu_encoders=["h264_videotoolbox"]
    )
    
    # Capture original state
    original_codec = jobspec.codec
    original_hwaccels = capabilities["hwaccels"].copy()
    original_gpu_encoders = capabilities["encoders"]["gpu"].copy()
    
    # Derive policy
    policy = derive_execution_policy(jobspec, capabilities)
    
    # Verify no mutations
    assert jobspec.codec == original_codec
    assert capabilities["hwaccels"] == original_hwaccels
    assert capabilities["encoders"]["gpu"] == original_gpu_encoders


def test_prores_gpu_assertion_enforced():
    """
    prores_gpu_supported must ALWAYS be False, even if corrupted input.
    
    This is a critical assertion - if input claims ProRes GPU support,
    the policy layer must correct it.
    """
    jobspec = make_jobspec(codec="prores_proxy")
    
    # Corrupted capabilities claiming ProRes GPU support
    capabilities = make_ffmpeg_capabilities(
        hwaccels=["videotoolbox"],
        gpu_encoders=["h264_videotoolbox"],
        prores_gpu_supported=True  # WRONG, should be False
    )
    
    policy = derive_execution_policy(jobspec, capabilities)
    
    # Policy MUST correct this to False
    assert policy["capability_summary"]["prores_gpu_supported"] is False


def test_alternative_engines_suggested_appropriately():
    """Alternatives should only suggest engines that make sense."""
    # ProRes should suggest Resolve
    jobspec_prores = make_jobspec(codec="prores_proxy")
    capabilities = make_ffmpeg_capabilities()
    
    policy = derive_execution_policy(jobspec_prores, capabilities)
    assert any(alt["engine"] == "resolve" for alt in policy["alternatives"])
    
    # H.264 with GPU should not necessarily suggest Resolve
    jobspec_h264 = make_jobspec(codec="h264")
    capabilities_gpu = make_ffmpeg_capabilities(
        hwaccels=["cuda"],
        gpu_encoders=["h264_nvenc"]
    )
    
    policy_h264 = derive_execution_policy(jobspec_h264, capabilities_gpu)
    # May or may not suggest alternatives (implementation detail)


def test_confidence_levels_are_reasonable():
    """Confidence should be 'high' or 'medium', not other values."""
    codecs = ["prores_proxy", "h264", "dnxhd", "vp9"]
    capabilities = make_ffmpeg_capabilities(
        hwaccels=["cuda"],
        gpu_encoders=["h264_nvenc"]
    )
    
    for codec in codecs:
        jobspec = make_jobspec(codec=codec)
        policy = derive_execution_policy(jobspec, capabilities)
        
        # Confidence must be valid
        assert policy["confidence"] in ["high", "medium"], \
            f"Invalid confidence for {codec}: {policy['confidence']}"


# =============================================================================
# INTEGRATION: Multi-source jobs
# =============================================================================

def test_multi_source_jobspec_single_policy():
    """
    Multi-source JobSpec should produce single policy (applies to all sources).
    
    Policy is based on codec/container, not source files.
    """
    jobspec = make_jobspec(
        codec="h264",
        sources=["/path/to/source1.mov", "/path/to/source2.mov", "/path/to/source3.mxf"]
    )
    
    capabilities = make_ffmpeg_capabilities(
        hwaccels=["cuda"],
        gpu_encoders=["h264_nvenc"]
    )
    
    policy = derive_execution_policy(jobspec, capabilities)
    
    # Policy applies to all sources (no per-source policy)
    assert policy["execution_class"] == ExecutionClass.GPU_ENCODE_AVAILABLE
    assert "execution_class" in policy  # Single policy, not list


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
