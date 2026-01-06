"""
FFmpeg Hardware Capability Detection

This module detects FFmpeg hardware acceleration capabilities available
on the current system. It is DETECTION ONLY and does not change execution
behavior, presets, or encoding flags.

Key principles:
- Read-only introspection
- No behavior changes
- Explicit about limitations (ProRes has no GPU encoder)
- Safe fallback on detection errors

Usage:
    from backend.execution.ffmpegCapabilities import detect_ffmpeg_capabilities
    
    capabilities = detect_ffmpeg_capabilities()
    print(capabilities)
    # {
    #   "hwaccels": ["cuda", "videotoolbox"],
    #   "encoders": {
    #     "gpu": ["h264_nvenc", "hevc_nvenc"],
    #     "cpu": ["prores_ks", "libx264", "libx265"]
    #   },
    #   "prores_gpu_supported": false
    # }
"""

import logging
import subprocess
from typing import Dict, Any, List

logger = logging.getLogger(__name__)


class FFmpegCapabilitiesError(Exception):
    """Raised when FFmpeg capability detection fails."""
    pass


# Expected GPU encoder names (platform-specific)
GPU_ENCODER_PATTERNS = [
    # NVIDIA NVENC
    "h264_nvenc",
    "hevc_nvenc",
    "av1_nvenc",
    # Apple VideoToolbox
    "h264_videotoolbox",
    "hevc_videotoolbox",
    # Intel Quick Sync Video (QSV)
    "h264_qsv",
    "hevc_qsv",
    "av1_qsv",
    # AMD AMF
    "h264_amf",
    "hevc_amf",
    # VAAPI (Linux)
    "h264_vaapi",
    "hevc_vaapi",
]

# Common CPU encoders
CPU_ENCODER_PATTERNS = [
    "prores_ks",      # FFmpeg ProRes (CPU only)
    "libx264",        # x264 (CPU)
    "libx265",        # x265 (CPU)
    "libaom-av1",     # AV1 reference (CPU)
]


def _run_ffmpeg_command(args: List[str]) -> str:
    """
    Run an FFmpeg command and return stdout.
    
    Args:
        args: Command arguments (e.g., ["-hwaccels"])
        
    Returns:
        Command stdout as string
        
    Raises:
        FFmpegCapabilitiesError: If command fails
    """
    try:
        result = subprocess.run(
            ["ffmpeg"] + args,
            capture_output=True,
            text=True,
            timeout=5,
        )
        
        # FFmpeg often outputs to stderr even on success
        # Combine both streams for parsing
        output = result.stdout + result.stderr
        
        return output
        
    except FileNotFoundError:
        raise FFmpegCapabilitiesError("ffmpeg not found in PATH")
    except subprocess.TimeoutExpired:
        raise FFmpegCapabilitiesError("ffmpeg command timed out")
    except Exception as e:
        raise FFmpegCapabilitiesError(f"Failed to run ffmpeg: {e}")


def _detect_hwaccels() -> List[str]:
    """
    Detect available hardware acceleration methods.
    
    Runs: ffmpeg -hwaccels
    
    Returns:
        List of hwaccel names (e.g., ["cuda", "videotoolbox"])
    """
    try:
        output = _run_ffmpeg_command(["-hwaccels"])
        
        # Parse output - format is:
        # Hardware acceleration methods:
        # cuda
        # videotoolbox
        # ...
        
        hwaccels = []
        in_list = False
        
        for line in output.split("\n"):
            line = line.strip()
            
            if not line:
                continue
                
            # Start parsing after the header
            if "hardware acceleration methods" in line.lower():
                in_list = True
                continue
            
            if in_list and line:
                # Each hwaccel is on its own line
                hwaccels.append(line)
        
        logger.info(f"Detected hwaccels: {hwaccels}")
        return hwaccels
        
    except FFmpegCapabilitiesError as e:
        logger.warning(f"Failed to detect hwaccels: {e}")
        return []


def _detect_encoders() -> Dict[str, List[str]]:
    """
    Detect available encoders and categorize as GPU or CPU.
    
    Runs: ffmpeg -encoders
    
    Returns:
        Dict with keys:
        - "gpu": List of GPU encoder names
        - "cpu": List of CPU encoder names
    """
    try:
        output = _run_ffmpeg_command(["-encoders"])
        
        # Parse output - format is:
        # Encoders:
        #  V..... = Video
        #  A..... = Audio
        #  ...
        #  V..... libx264              libx264 H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10
        #  V..... h264_nvenc           NVIDIA NVENC H.264 encoder
        
        gpu_encoders = []
        cpu_encoders = []
        
        in_list = False
        
        for line in output.split("\n"):
            line_stripped = line.strip()
            
            if not line_stripped:
                continue
            
            # Start parsing after "Encoders:" header
            if "encoders:" in line_stripped.lower():
                in_list = True
                continue
            
            # Skip legend lines
            if line_stripped.startswith(".") or "=" in line_stripped[:20]:
                continue
            
            if in_list and line_stripped:
                # Extract encoder name (second column)
                # Format: " V..... encodername     Description"
                parts = line_stripped.split()
                if len(parts) >= 2:
                    encoder_name = parts[1]
                    
                    # Categorize as GPU or CPU
                    if any(pattern in encoder_name for pattern in GPU_ENCODER_PATTERNS):
                        gpu_encoders.append(encoder_name)
                    elif any(pattern in encoder_name for pattern in CPU_ENCODER_PATTERNS):
                        cpu_encoders.append(encoder_name)
        
        logger.info(f"Detected GPU encoders: {gpu_encoders}")
        logger.info(f"Detected CPU encoders: {cpu_encoders}")
        
        return {
            "gpu": gpu_encoders,
            "cpu": cpu_encoders,
        }
        
    except FFmpegCapabilitiesError as e:
        logger.warning(f"Failed to detect encoders: {e}")
        return {"gpu": [], "cpu": []}


def detect_ffmpeg_capabilities() -> Dict[str, Any]:
    """
    Detect all FFmpeg hardware capabilities available on this system.
    
    This is a read-only introspection function. It does NOT:
    - Change execution behavior
    - Modify presets
    - Alter encoding flags
    - Make decisions about what to use
    
    Returns:
        Dictionary with structure:
        {
            "hwaccels": List[str],           # Available hwaccel methods
            "encoders": {
                "gpu": List[str],            # GPU encoder names
                "cpu": List[str]             # CPU encoder names
            },
            "prores_gpu_supported": False    # Always False (explicit)
        }
        
    Note:
        - ProRes has NO GPU encoder in FFmpeg (always CPU via prores_ks)
        - GPU decode (hwaccels) ≠ GPU encode (encoders)
        - Resolve GPU acceleration is independent from FFmpeg GPU
    """
    logger.info("Detecting FFmpeg hardware capabilities...")
    
    # Detect hardware acceleration methods
    hwaccels = _detect_hwaccels()
    
    # Detect encoders
    encoders = _detect_encoders()
    
    # CRITICAL ASSERTION: ProRes has no GPU encoder
    # This is a fundamental limitation of FFmpeg
    prores_gpu_supported = False
    
    # Verify ProRes is never in GPU encoders
    gpu_encoders = encoders.get("gpu", [])
    if any("prores" in encoder.lower() for encoder in gpu_encoders):
        logger.error("ASSERTION FAILED: ProRes encoder detected in GPU list!")
        logger.error("This should never happen - ProRes is CPU-only in FFmpeg")
        # Move any ProRes to CPU list
        encoders["gpu"] = [e for e in gpu_encoders if "prores" not in e.lower()]
        encoders["cpu"] = encoders.get("cpu", []) + [
            e for e in gpu_encoders if "prores" in e.lower()
        ]
    
    capabilities = {
        "hwaccels": hwaccels,
        "encoders": encoders,
        "prores_gpu_supported": prores_gpu_supported,
    }
    
    logger.info(f"FFmpeg capabilities detected: {capabilities}")
    
    return capabilities
