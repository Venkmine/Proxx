"""
Execution Policy Layer - Read-only diagnostic intelligence

This module derives execution policy explanations from JobSpec and detected
FFmpeg capabilities. It is PURE DIAGNOSTIC - it does not:
- Change execution behavior
- Modify presets
- Alter FFmpeg arguments
- Enable GPU encoding
- Invoke Resolve
- Create config flags

Purpose:
--------
Answer "WHY is this job executing the way it does?" with deterministic,
auditable explanations.

Key Principles:
--------------
1. ProRes under FFmpeg is ALWAYS CPU_ONLY (hard assertion)
2. GPU decode ≠ GPU encode
3. Absence of GPU is not an error
4. Resolve is suggested as alternative, never assumed
5. No environment inspection (capabilities passed in)
6. Zero side effects

Output:
-------
A deterministic execution policy report explaining:
- CPU vs GPU reality
- Engine constraints
- What would be different under other engines
- Blocking reasons (if any)
"""

import logging
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)


# =============================================================================
# Execution Classes
# =============================================================================

class ExecutionClass:
    """Enumeration of execution reality classes."""
    CPU_ONLY = "CPU_ONLY"
    GPU_DECODE_ONLY = "GPU_DECODE_ONLY"
    GPU_ENCODE_AVAILABLE = "GPU_ENCODE_AVAILABLE"


# =============================================================================
# Execution Policy Derivation
# =============================================================================

def derive_execution_policy(
    jobspec: "JobSpec",
    ffmpeg_capabilities: dict
) -> dict:
    """
    Derive read-only execution policy from JobSpec and FFmpeg capabilities.
    
    This function is PURE DIAGNOSTIC. It does NOT:
    - Change execution behavior
    - Modify jobspec
    - Alter FFmpeg arguments
    - Enable GPU encoding
    - Make routing decisions
    
    Args:
        jobspec: The JobSpec to analyze
        ffmpeg_capabilities: FFmpeg capabilities from detect_ffmpeg_capabilities()
            Expected structure:
            {
                "hwaccels": ["cuda", "videotoolbox", ...],
                "encoders": {
                    "gpu": ["h264_nvenc", "hevc_nvenc", ...],
                    "cpu": ["prores_ks", "libx264", ...]
                },
                "prores_gpu_supported": False  # Always False
            }
    
    Returns:
        Dictionary with structure:
        {
            "execution_class": "CPU_ONLY | GPU_DECODE_ONLY | GPU_ENCODE_AVAILABLE",
            "primary_engine": "ffmpeg | resolve",
            "blocking_reasons": [<human-readable strings>],
            "capability_summary": {
                "gpu_decode": bool,
                "gpu_encode": bool,
                "prores_gpu_supported": bool  # Always False
            },
            "alternatives": [
                {
                    "engine": "ffmpeg | resolve",
                    "codec": "string",
                    "tradeoff": "string"
                }
            ],
            "confidence": "high | medium"
        }
    
    HARD RULES:
    -----------
    1. ProRes under FFmpeg is ALWAYS classified as CPU_ONLY
    2. GPU decode ≠ GPU encode
    3. Absence of GPU is not an error
    4. Resolve is suggested as alternative, never assumed
    5. No environment inspection (capabilities already passed in)
    """
    logger.info(f"Deriving execution policy for job {jobspec.job_id}, codec={jobspec.codec}")
    
    # Extract codec from jobspec
    codec = jobspec.codec.lower()
    
    # Extract capabilities
    hwaccels = ffmpeg_capabilities.get("hwaccels", [])
    encoders = ffmpeg_capabilities.get("encoders", {})
    gpu_encoders = encoders.get("gpu", [])
    cpu_encoders = encoders.get("cpu", [])
    prores_gpu_supported = ffmpeg_capabilities.get("prores_gpu_supported", False)
    
    # CRITICAL ASSERTION: ProRes GPU support must be False
    if prores_gpu_supported:
        logger.error("POLICY VIOLATION: prores_gpu_supported is True (should always be False)")
        prores_gpu_supported = False
    
    # Determine GPU availability
    has_gpu_decode = len(hwaccels) > 0
    has_gpu_encode = len(gpu_encoders) > 0
    
    # Initialize policy components
    execution_class = ExecutionClass.CPU_ONLY
    primary_engine = "ffmpeg"
    blocking_reasons = []
    alternatives = []
    confidence = "high"
    
    # =========================================================================
    # RULE 1: ProRes is ALWAYS CPU_ONLY under FFmpeg
    # =========================================================================
    if "prores" in codec:
        execution_class = ExecutionClass.CPU_ONLY
        blocking_reasons.append(
            "ProRes encoding in FFmpeg is CPU-only. No GPU encoder exists for ProRes in FFmpeg."
        )
        
        # Suggest Resolve as alternative for ProRes GPU
        alternatives.append({
            "engine": "resolve",
            "codec": "prores_proxy",
            "tradeoff": "Resolve Studio supports ProRes GPU encoding but requires license and installation."
        })
        
        confidence = "high"
        logger.info("ProRes detected: Classified as CPU_ONLY")
    
    # =========================================================================
    # RULE 2: H.264/H.265 with GPU encoder available
    # =========================================================================
    elif codec in ["h264", "h265", "hevc"]:
        # Check if GPU encoder exists for this codec
        codec_has_gpu_encoder = any(
            codec_pattern in encoder.lower()
            for encoder in gpu_encoders
            for codec_pattern in [codec, "h265" if codec == "hevc" else "hevc" if codec == "h265" else codec]
        )
        
        if codec_has_gpu_encoder:
            execution_class = ExecutionClass.GPU_ENCODE_AVAILABLE
            blocking_reasons.append(
                f"GPU encoder available for {codec.upper()}. "
                f"Current preset may not use it (depends on preset configuration)."
            )
            confidence = "high"
            logger.info(f"{codec.upper()} with GPU encoder available")
        elif has_gpu_decode:
            execution_class = ExecutionClass.GPU_DECODE_ONLY
            blocking_reasons.append(
                f"GPU decode available but no GPU encoder for {codec.upper()}. "
                f"Encoding will use CPU."
            )
            confidence = "high"
            logger.info(f"{codec.upper()} with GPU decode only")
        else:
            execution_class = ExecutionClass.CPU_ONLY
            blocking_reasons.append(
                f"No GPU hardware detected. {codec.upper()} encoding will use CPU."
            )
            confidence = "high"
            logger.info(f"{codec.upper()} CPU-only (no GPU)")
    
    # =========================================================================
    # RULE 3: RAW codecs (no FFmpeg support)
    # =========================================================================
    elif codec in ["raw", "redcode", "braw", "arriraw"]:
        execution_class = ExecutionClass.CPU_ONLY
        blocking_reasons.append(
            f"{codec.upper()} is not supported by FFmpeg. RAW formats require Resolve."
        )
        
        alternatives.append({
            "engine": "resolve",
            "codec": codec,
            "tradeoff": "Resolve is required for RAW format decoding. FFmpeg cannot process RAW."
        })
        
        confidence = "high"
        logger.info(f"RAW codec {codec} detected: Not supported by FFmpeg")
    
    # =========================================================================
    # RULE 4: Other codecs (DNxHD, DNxHR, VP9, AV1, etc.)
    # =========================================================================
    else:
        # Check for GPU encoder
        codec_has_gpu_encoder = any(
            codec in encoder.lower()
            for encoder in gpu_encoders
        )
        
        if codec_has_gpu_encoder:
            execution_class = ExecutionClass.GPU_ENCODE_AVAILABLE
            blocking_reasons.append(
                f"GPU encoder may be available for {codec.upper()}. "
                f"Actual usage depends on preset configuration."
            )
            confidence = "medium"
            logger.info(f"{codec.upper()} with potential GPU support")
        elif has_gpu_decode:
            execution_class = ExecutionClass.GPU_DECODE_ONLY
            blocking_reasons.append(
                f"GPU decode available but no GPU encoder for {codec.upper()}. "
                f"Encoding will use CPU."
            )
            confidence = "high"
            logger.info(f"{codec.upper()} with GPU decode only")
        else:
            execution_class = ExecutionClass.CPU_ONLY
            blocking_reasons.append(
                f"No GPU hardware detected. {codec.upper()} encoding will use CPU."
            )
            confidence = "high"
            logger.info(f"{codec.upper()} CPU-only")
    
    # =========================================================================
    # Build capability summary
    # =========================================================================
    capability_summary = {
        "gpu_decode": has_gpu_decode,
        "gpu_encode": has_gpu_encode,
        "prores_gpu_supported": False  # Always False (explicit)
    }
    
    # =========================================================================
    # Build final policy
    # =========================================================================
    policy = {
        "execution_class": execution_class,
        "primary_engine": primary_engine,
        "blocking_reasons": blocking_reasons,
        "capability_summary": capability_summary,
        "alternatives": alternatives,
        "confidence": confidence
    }
    
    logger.info(f"Execution policy derived: class={execution_class}, confidence={confidence}")
    return policy
