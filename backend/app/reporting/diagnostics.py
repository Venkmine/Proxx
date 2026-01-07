"""
Diagnostics and environment capture for job reports.

Observational only — captures system state at report generation time.
"""

import platform
import subprocess
import sys
from pathlib import Path
from typing import Optional, Dict, Any


def get_python_version() -> str:
    """Return Python version (e.g., '3.11.5')."""
    return f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"


def get_os_version() -> str:
    """Return OS version (e.g., 'macOS-14.1.1-arm64')."""
    return platform.platform()


def get_hostname() -> str:
    """Return machine hostname."""
    return platform.node()


def get_proxx_version() -> str:
    """
    Return Proxx version.
    
    Attempts to detect git commit hash from repository.
    Fallback: hardcoded version from main.py.
    """
    try:
        # Try to get git commit hash
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=Path(__file__).parent.parent.parent,  # backend/ root
            capture_output=True,
            text=True,
            timeout=2,
        )
        if result.returncode == 0:
            commit = result.stdout.strip()
            return f"dev+{commit}"
    except Exception:
        pass
    
    # Fallback to hardcoded version
    return "0.1.0"


def get_resolve_info() -> dict:
    """
    Capture Resolve installation information.
    
    Returns dict with:
    - path: Installation path
    - version: Detected version (or "unknown")
    - studio: Studio license detected (bool or None)
    """
    try:
        # Lazy import to avoid breaking if resolve module doesn't exist yet
        from app.resolve.discovery import discover_resolve
        resolve = discover_resolve()
        return {
            "path": str(resolve.path),
            "version": resolve.version or "unknown",
            "studio": resolve.studio,
        }
    except ImportError:
        return {
            "path": None,
            "version": "unknown",
            "studio": None,
            "error": "Resolve module not yet implemented",
        }
    except Exception as e:
        return {
            "path": None,
            "version": "unknown",
            "studio": None,
            "error": str(e),
        }


def get_ffmpeg_capabilities() -> Dict[str, Any]:
    """
    Detect FFmpeg hardware capabilities.
    
    Returns dict with:
    - hwaccels: List of hardware acceleration methods
    - encoders: Dict with 'gpu' and 'cpu' encoder lists
    - prores_gpu_supported: Always False (explicit limitation)
    - error: Error message if detection failed (optional)
    
    Note:
        This is DETECTION ONLY - it does not change execution behavior.
        GPU decode ≠ GPU encode. ProRes has no GPU encoder in FFmpeg.
    """
    try:
        from execution.ffmpegCapabilities import detect_ffmpeg_capabilities
        return detect_ffmpeg_capabilities()
    except Exception as e:
        # Return safe fallback on detection error
        return {
            "hwaccels": [],
            "encoders": {"gpu": [], "cpu": []},
            "prores_gpu_supported": False,
            "error": f"Detection failed: {e}",
        }


def get_execution_policy(jobspec: "JobSpec") -> Dict[str, Any]:
    """
    Derive read-only execution policy for a JobSpec.
    
    Explains WHY the job executes the way it does, without changing execution.
    
    Args:
        jobspec: The JobSpec to analyze
        
    Returns:
        Execution policy dict with:
        - execution_class: CPU_ONLY | GPU_DECODE_ONLY | GPU_ENCODE_AVAILABLE
        - primary_engine: ffmpeg | resolve
        - blocking_reasons: List of human-readable explanations
        - capability_summary: GPU capabilities
        - alternatives: Suggested alternative engines/codecs
        - confidence: high | medium
        
    Note:
        This is DIAGNOSTIC ONLY - it does not affect execution behavior.
    """
    try:
        from execution.executionPolicy import derive_execution_policy
        ffmpeg_caps = get_ffmpeg_capabilities()
        return derive_execution_policy(jobspec, ffmpeg_caps)
    except Exception as e:
        # Return safe fallback on error
        return {
            "execution_class": "UNKNOWN",
            "primary_engine": "ffmpeg",
            "blocking_reasons": [f"Policy derivation failed: {e}"],
            "capability_summary": {
                "gpu_decode": False,
                "gpu_encode": False,
                "prores_gpu_supported": False
            },
            "alternatives": [],
            "confidence": "low",
            "error": str(e)
        }


def get_execution_outcome(
    total_clips: int,
    success_clips: int,
    failed_clips: int,
    skipped_clips: int,
    clip_results: Optional[list] = None
) -> Dict[str, Any]:
    """
    Derive execution outcome from clip results.
    
    Classifies job outcome (COMPLETE, PARTIAL, FAILED, BLOCKED) and identifies
    failure types for observability in unattended execution.
    
    Args:
        total_clips: Total number of clips in the job
        success_clips: Number of clips that completed successfully
        failed_clips: Number of clips that failed
        skipped_clips: Number of clips that were skipped
        clip_results: Optional list of per-clip result dicts with "failure_reason"
        
    Returns:
        Execution outcome dict with:
        - job_state: COMPLETE | PARTIAL | FAILED | BLOCKED
        - total_clips, success_clips, failed_clips, skipped_clips
        - failure_types: List of distinct failure classifications
        - summary: Human-readable one-line summary
        - clip_failures: Optional per-clip failure details
        
    Note:
        This is READ-ONLY diagnostic classification. It does NOT:
        - Change execution behavior
        - Trigger retries
        - Modify job state
        - Alter execution policy
    """
    try:
        from execution.failureTypes import derive_execution_outcome
        outcome = derive_execution_outcome(
            total_clips=total_clips,
            success_clips=success_clips,
            failed_clips=failed_clips,
            skipped_clips=skipped_clips,
            clip_results=clip_results
        )
        return outcome.to_dict()
    except Exception as e:
        # Return safe fallback on error
        return {
            "job_state": "UNKNOWN",
            "total_clips": total_clips,
            "success_clips": success_clips,
            "failed_clips": failed_clips,
            "skipped_clips": skipped_clips,
            "failure_types": [],
            "summary": f"Outcome derivation failed: {e}",
            "clip_failures": None,
            "error": str(e)
        }
