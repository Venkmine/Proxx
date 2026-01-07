"""
Execution Failure Taxonomy

Defines deterministic classification of execution outcomes and failure types.
This is OBSERVATIONAL ONLY - it does not affect execution, retries, or recovery.

Purpose:
--------
Explain WHAT failed, WHERE it failed (clip vs job), and WHY it failed.
Provide structured, actionable diagnostics for unattended execution.

Non-Goals:
----------
- Auto-recovery or retry logic
- Execution decision-making
- Policy enforcement
- JobSpec modification

Part of QC observability layer, compliant with INTENT.md invariant #7.
"""

from enum import Enum
from typing import Dict, List, Any, Optional
from dataclasses import dataclass


# =============================================================================
# Clip-Level Failure Types
# =============================================================================

class ClipFailureType(str, Enum):
    """
    Clip-level failure classification.
    
    These describe WHY a single clip failed during execution.
    Each type implies a different root cause and remediation path.
    """
    
    # Decode/Input Failures
    DECODE_FAILED = "DECODE_FAILED"
    """Source file could not be decoded (corrupt, unsupported format, etc)"""
    
    UNSUPPORTED_MEDIA = "UNSUPPORTED_MEDIA"
    """Source format is not supported by the selected engine"""
    
    INVALID_INPUT = "INVALID_INPUT"
    """Source file is invalid, missing, or inaccessible"""
    
    # Encode/Output Failures
    ENCODE_FAILED = "ENCODE_FAILED"
    """Encoding process failed (codec error, resource exhaustion, etc)"""
    
    OUTPUT_WRITE_FAILED = "OUTPUT_WRITE_FAILED"
    """Could not write output file (permissions, disk full, etc)"""
    
    # Execution Failures
    TIMEOUT = "TIMEOUT"
    """Execution exceeded timeout threshold"""
    
    TOOL_CRASH = "TOOL_CRASH"
    """FFmpeg or Resolve crashed during execution"""
    
    # Validation Failures (pre-execution)
    VALIDATION_FAILED = "VALIDATION_FAILED"
    """Source failed validation before execution started"""
    
    # Unknown
    UNKNOWN = "UNKNOWN"
    """Failure occurred but type could not be determined"""


# =============================================================================
# Job-Level Outcome States
# =============================================================================

class JobOutcomeState(str, Enum):
    """
    Job-level execution outcome classification.
    
    These describe the AGGREGATE result of all clips in a job.
    """
    
    COMPLETE = "COMPLETE"
    """All clips completed successfully. No failures."""
    
    PARTIAL = "PARTIAL"
    """Some clips succeeded, some failed. Job produced partial output."""
    
    FAILED = "FAILED"
    """All clips failed or job-level error prevented any execution."""
    
    BLOCKED = "BLOCKED"
    """Job was blocked from execution (validation failure, etc)."""


# =============================================================================
# Execution Outcome Model
# =============================================================================

@dataclass
class ExecutionOutcome:
    """
    Structured representation of job execution outcome.
    
    This is DERIVED from execution results, not captured during execution.
    It is a read-only diagnostic summary.
    
    Attributes:
        job_state: Aggregate job outcome (COMPLETE, PARTIAL, FAILED, BLOCKED)
        total_clips: Total number of clips in the job
        success_clips: Number of clips that completed successfully
        failed_clips: Number of clips that failed
        skipped_clips: Number of clips that were skipped
        failure_types: List of distinct failure types encountered
        summary: Human-readable one-line summary
        clip_failures: Optional detailed per-clip failure information
    """
    
    job_state: JobOutcomeState
    total_clips: int
    success_clips: int
    failed_clips: int
    skipped_clips: int
    failure_types: List[ClipFailureType]
    summary: str
    clip_failures: Optional[List[Dict[str, Any]]] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Serialize to dictionary for JSON output."""
        return {
            "job_state": self.job_state.value,
            "total_clips": self.total_clips,
            "success_clips": self.success_clips,
            "failed_clips": self.failed_clips,
            "skipped_clips": self.skipped_clips,
            "failure_types": [ft.value for ft in self.failure_types],
            "summary": self.summary,
            "clip_failures": self.clip_failures,
        }


# =============================================================================
# Failure Classification Logic
# =============================================================================

def classify_clip_failure(failure_reason: str) -> ClipFailureType:
    """
    Classify a clip failure based on failure reason string.
    
    This is heuristic-based pattern matching. It does not change execution.
    
    Args:
        failure_reason: Error message or failure reason from execution
        
    Returns:
        ClipFailureType classification
    """
    if not failure_reason:
        return ClipFailureType.UNKNOWN
    
    reason_lower = failure_reason.lower()
    
    # Unsupported media (check before decode failures, more specific)
    if any(pattern in reason_lower for pattern in [
        "unsupported", "not supported", "unknown format", "no decoder"
    ]):
        return ClipFailureType.UNSUPPORTED_MEDIA
    
    # Invalid input
    if any(pattern in reason_lower for pattern in [
        "no such file", "file not found", "permission denied", "cannot open"
    ]):
        return ClipFailureType.INVALID_INPUT
    
    # Decode failures (check demux BEFORE muxer to avoid false matches)
    if any(pattern in reason_lower for pattern in [
        "decod", "demux", "invalid data", "corrupt"
    ]):
        return ClipFailureType.DECODE_FAILED
    
    # Encode failures
    if any(pattern in reason_lower for pattern in [
        "encod", "muxer", "codec"
    ]):
        return ClipFailureType.ENCODE_FAILED
    
    # Output write failures
    if any(pattern in reason_lower for pattern in [
        "write", "output", "disk", "space", "full"
    ]):
        return ClipFailureType.OUTPUT_WRITE_FAILED
    
    # Timeout
    if any(pattern in reason_lower for pattern in [
        "timeout", "timed out", "exceeded"
    ]):
        return ClipFailureType.TIMEOUT
    
    # Tool crash
    if any(pattern in reason_lower for pattern in [
        "crash", "segmentation fault", "signal", "killed"
    ]):
        return ClipFailureType.TOOL_CRASH
    
    # Validation
    if any(pattern in reason_lower for pattern in [
        "validation", "invalid jobspec", "missing"
    ]):
        return ClipFailureType.VALIDATION_FAILED
    
    return ClipFailureType.UNKNOWN


def derive_execution_outcome(
    total_clips: int,
    success_clips: int,
    failed_clips: int,
    skipped_clips: int,
    clip_results: Optional[List[Dict[str, Any]]] = None
) -> ExecutionOutcome:
    """
    Derive execution outcome from clip-level results.
    
    This is a PURE FUNCTION with NO SIDE EFFECTS. It classifies outcomes
    based on aggregate clip results without altering execution.
    
    Args:
        total_clips: Total number of clips in the job
        success_clips: Number of clips that completed successfully
        failed_clips: Number of clips that failed
        skipped_clips: Number of clips that were skipped
        clip_results: Optional list of clip result dictionaries with 'failure_reason' field
        
    Returns:
        ExecutionOutcome with structured classification
        
    Classification Rules:
    ---------------------
    - COMPLETE: All clips succeeded
    - PARTIAL: Some clips succeeded, some failed
    - FAILED: All clips failed
    - BLOCKED: No clips executed (validation or pre-execution failure)
    """
    # Determine failure types
    failure_types: List[ClipFailureType] = []
    clip_failures: List[Dict[str, Any]] = []
    
    if clip_results:
        for clip in clip_results:
            if clip.get("status") in ["FAILED", "failed"]:
                failure_reason = clip.get("failure_reason", "")
                failure_type = classify_clip_failure(failure_reason)
                
                if failure_type not in failure_types:
                    failure_types.append(failure_type)
                
                clip_failures.append({
                    "source_path": clip.get("source_path", "unknown"),
                    "failure_type": failure_type.value,
                    "failure_reason": failure_reason
                })
    
    # Determine job state
    if total_clips == 0:
        job_state = JobOutcomeState.BLOCKED
        summary = "No clips to execute"
    elif success_clips == total_clips:
        job_state = JobOutcomeState.COMPLETE
        summary = f"All {total_clips} clips completed successfully"
    elif success_clips == 0 and failed_clips > 0:
        job_state = JobOutcomeState.FAILED
        summary = f"All {total_clips} clips failed"
    elif success_clips > 0 and failed_clips > 0:
        job_state = JobOutcomeState.PARTIAL
        summary = f"{failed_clips} of {total_clips} clips failed"
    elif success_clips == 0 and failed_clips == 0:
        job_state = JobOutcomeState.BLOCKED
        summary = "Job was blocked from execution"
    else:
        job_state = JobOutcomeState.PARTIAL
        summary = f"{success_clips} succeeded, {failed_clips} failed, {skipped_clips} skipped"
    
    return ExecutionOutcome(
        job_state=job_state,
        total_clips=total_clips,
        success_clips=success_clips,
        failed_clips=failed_clips,
        skipped_clips=skipped_clips,
        failure_types=failure_types,
        summary=summary,
        clip_failures=clip_failures if clip_failures else None
    )
