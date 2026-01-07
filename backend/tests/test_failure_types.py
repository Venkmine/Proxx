"""
Tests for Execution Failure Taxonomy

Verifies deterministic failure classification without invoking FFmpeg or execution.
Tests use simulated execution events to prove classification logic.

All tests must be fast (<1s) and have zero side effects.
"""

import pytest
from execution.failureTypes import (
    ClipFailureType,
    JobOutcomeState,
    ExecutionOutcome,
    classify_clip_failure,
    derive_execution_outcome,
)


# =============================================================================
# Clip Failure Classification Tests
# =============================================================================

class TestClipFailureClassification:
    """Test classification of individual clip failures."""
    
    def test_decode_failure_patterns(self):
        """Decode-related errors should classify as DECODE_FAILED."""
        patterns = [
            "Decoder error: invalid data",
            "Failed to decode frame",
            "Demuxer failed",
            "Corrupt video stream"
        ]
        
        for pattern in patterns:
            result = classify_clip_failure(pattern)
            assert result == ClipFailureType.DECODE_FAILED, \
                f"'{pattern}' should classify as DECODE_FAILED"
    
    def test_unsupported_media_patterns(self):
        """Unsupported format errors should classify as UNSUPPORTED_MEDIA."""
        patterns = [
            "Unsupported codec",
            "Format not supported",
            "Unknown format",
            "No decoder found"
        ]
        
        for pattern in patterns:
            result = classify_clip_failure(pattern)
            assert result == ClipFailureType.UNSUPPORTED_MEDIA
    
    def test_invalid_input_patterns(self):
        """Missing or inaccessible files should classify as INVALID_INPUT."""
        patterns = [
            "No such file or directory",
            "File not found",
            "Permission denied",
            "Cannot open input"
        ]
        
        for pattern in patterns:
            result = classify_clip_failure(pattern)
            assert result == ClipFailureType.INVALID_INPUT
    
    def test_encode_failure_patterns(self):
        """Encoding errors should classify as ENCODE_FAILED."""
        patterns = [
            "Encoder failed",
            "Encoding error",
            "Muxer error",
            "Codec initialization failed"
        ]
        
        for pattern in patterns:
            result = classify_clip_failure(pattern)
            assert result == ClipFailureType.ENCODE_FAILED
    
    def test_output_write_patterns(self):
        """Output write errors should classify as OUTPUT_WRITE_FAILED."""
        patterns = [
            "Failed to write output",
            "Disk full",
            "No space left on device",
            "Output write error"
        ]
        
        for pattern in patterns:
            result = classify_clip_failure(pattern)
            assert result == ClipFailureType.OUTPUT_WRITE_FAILED
    
    def test_timeout_patterns(self):
        """Timeout errors should classify as TIMEOUT."""
        patterns = [
            "Execution timeout",
            "Process timed out",
            "Time limit exceeded"
        ]
        
        for pattern in patterns:
            result = classify_clip_failure(pattern)
            assert result == ClipFailureType.TIMEOUT
    
    def test_tool_crash_patterns(self):
        """Tool crashes should classify as TOOL_CRASH."""
        patterns = [
            "Segmentation fault",
            "Process crashed",
            "Signal 11",
            "FFmpeg killed"
        ]
        
        for pattern in patterns:
            result = classify_clip_failure(pattern)
            assert result == ClipFailureType.TOOL_CRASH
    
    def test_validation_patterns(self):
        """Validation errors should classify as VALIDATION_FAILED."""
        patterns = [
            "Validation failed",
            "Invalid JobSpec",
            "Missing required field"
        ]
        
        for pattern in patterns:
            result = classify_clip_failure(pattern)
            assert result == ClipFailureType.VALIDATION_FAILED
    
    def test_unknown_failure(self):
        """Unrecognized errors should classify as UNKNOWN."""
        result = classify_clip_failure("Something went wrong")
        assert result == ClipFailureType.UNKNOWN
    
    def test_empty_failure_reason(self):
        """Empty failure reason should classify as UNKNOWN."""
        result = classify_clip_failure("")
        assert result == ClipFailureType.UNKNOWN
    
    def test_case_insensitive_matching(self):
        """Classification should be case-insensitive."""
        assert classify_clip_failure("DECODE ERROR") == ClipFailureType.DECODE_FAILED
        assert classify_clip_failure("Decode Error") == ClipFailureType.DECODE_FAILED
        assert classify_clip_failure("decode error") == ClipFailureType.DECODE_FAILED


# =============================================================================
# Execution Outcome Derivation Tests
# =============================================================================

class TestExecutionOutcomeDerivatation:
    """Test derivation of job-level outcomes from clip results."""
    
    def test_all_clips_succeed_complete(self):
        """
        All clips succeed → COMPLETE.
        
        This is the golden path: no failures, full success.
        """
        outcome = derive_execution_outcome(
            total_clips=5,
            success_clips=5,
            failed_clips=0,
            skipped_clips=0
        )
        
        assert outcome.job_state == JobOutcomeState.COMPLETE
        assert outcome.total_clips == 5
        assert outcome.success_clips == 5
        assert outcome.failed_clips == 0
        assert outcome.failure_types == []
        assert "all" in outcome.summary.lower()
        assert "success" in outcome.summary.lower()
    
    def test_some_clips_fail_partial(self):
        """
        Some clips fail → PARTIAL.
        
        Job produced partial output. Some work succeeded.
        """
        outcome = derive_execution_outcome(
            total_clips=7,
            success_clips=5,
            failed_clips=2,
            skipped_clips=0
        )
        
        assert outcome.job_state == JobOutcomeState.PARTIAL
        assert outcome.total_clips == 7
        assert outcome.success_clips == 5
        assert outcome.failed_clips == 2
        assert "2 of 7" in outcome.summary
    
    def test_all_clips_fail_failed(self):
        """
        All clips fail → FAILED.
        
        Complete failure: no successful output.
        """
        outcome = derive_execution_outcome(
            total_clips=3,
            success_clips=0,
            failed_clips=3,
            skipped_clips=0
        )
        
        assert outcome.job_state == JobOutcomeState.FAILED
        assert outcome.total_clips == 3
        assert outcome.success_clips == 0
        assert outcome.failed_clips == 3
        assert "all" in outcome.summary.lower()
        assert "failed" in outcome.summary.lower()
    
    def test_validation_prevents_execution_blocked(self):
        """
        Validation failure prevents execution → BLOCKED.
        
        No clips executed because job was blocked pre-execution.
        """
        outcome = derive_execution_outcome(
            total_clips=0,
            success_clips=0,
            failed_clips=0,
            skipped_clips=0
        )
        
        assert outcome.job_state == JobOutcomeState.BLOCKED
        assert outcome.total_clips == 0
        assert "no clips" in outcome.summary.lower() or "blocked" in outcome.summary.lower()
    
    def test_failure_reasons_preserved(self):
        """
        Failure reasons are preserved and surfaced.
        
        Clip-level failure information is accessible for diagnostics.
        """
        clip_results = [
            {
                "source_path": "/path/to/clip1.mov",
                "status": "COMPLETED",
            },
            {
                "source_path": "/path/to/clip2.mov",
                "status": "FAILED",
                "failure_reason": "Decoder error: corrupt stream"
            },
            {
                "source_path": "/path/to/clip3.mov",
                "status": "FAILED",
                "failure_reason": "Encoder failed: codec init error"
            }
        ]
        
        outcome = derive_execution_outcome(
            total_clips=3,
            success_clips=1,
            failed_clips=2,
            skipped_clips=0,
            clip_results=clip_results
        )
        
        assert outcome.job_state == JobOutcomeState.PARTIAL
        assert len(outcome.failure_types) == 2
        assert ClipFailureType.DECODE_FAILED in outcome.failure_types
        assert ClipFailureType.ENCODE_FAILED in outcome.failure_types
        assert outcome.clip_failures is not None
        assert len(outcome.clip_failures) == 2
    
    def test_skipped_clips_handled(self):
        """Skipped clips are counted separately from failures."""
        outcome = derive_execution_outcome(
            total_clips=10,
            success_clips=7,
            failed_clips=1,
            skipped_clips=2
        )
        
        assert outcome.job_state == JobOutcomeState.PARTIAL
        assert outcome.success_clips == 7
        assert outcome.failed_clips == 1
        assert outcome.skipped_clips == 2


# =============================================================================
# Determinism and Purity Tests
# =============================================================================

class TestDeterminismAndPurity:
    """Verify classification is deterministic and has no side effects."""
    
    def test_classification_is_deterministic(self):
        """Same input produces identical output."""
        clip_results = [
            {
                "source_path": "/path/to/clip.mov",
                "status": "FAILED",
                "failure_reason": "Decode error"
            }
        ]
        
        outcome1 = derive_execution_outcome(
            total_clips=1,
            success_clips=0,
            failed_clips=1,
            skipped_clips=0,
            clip_results=clip_results
        )
        
        outcome2 = derive_execution_outcome(
            total_clips=1,
            success_clips=0,
            failed_clips=1,
            skipped_clips=0,
            clip_results=clip_results
        )
        
        # Outcomes should be identical
        assert outcome1.job_state == outcome2.job_state
        assert outcome1.failure_types == outcome2.failure_types
        assert outcome1.summary == outcome2.summary
    
    def test_no_side_effects(self):
        """Classification does not mutate input data."""
        clip_results = [
            {
                "source_path": "/path/to/clip.mov",
                "status": "FAILED",
                "failure_reason": "Encode error"
            }
        ]
        
        # Capture original state
        original_results = clip_results.copy()
        
        # Derive outcome
        derive_execution_outcome(
            total_clips=1,
            success_clips=0,
            failed_clips=1,
            skipped_clips=0,
            clip_results=clip_results
        )
        
        # Input should be unchanged
        assert clip_results == original_results
    
    def test_classification_is_fast(self):
        """Classification completes in <100ms for typical job."""
        import time
        
        clip_results = [
            {
                "source_path": f"/path/to/clip{i}.mov",
                "status": "FAILED" if i % 3 == 0 else "COMPLETED",
                "failure_reason": "Decode error" if i % 3 == 0 else None
            }
            for i in range(100)
        ]
        
        start = time.time()
        derive_execution_outcome(
            total_clips=100,
            success_clips=67,
            failed_clips=33,
            skipped_clips=0,
            clip_results=clip_results
        )
        elapsed = time.time() - start
        
        assert elapsed < 0.1, f"Classification took {elapsed}s, should be <0.1s"


# =============================================================================
# Serialization Tests
# =============================================================================

class TestSerialization:
    """Test ExecutionOutcome serialization to dict/JSON."""
    
    def test_to_dict_includes_all_fields(self):
        """to_dict() should include all outcome fields."""
        outcome = derive_execution_outcome(
            total_clips=5,
            success_clips=3,
            failed_clips=2,
            skipped_clips=0,
            clip_results=[
                {
                    "source_path": "/clip.mov",
                    "status": "FAILED",
                    "failure_reason": "Decode error"
                }
            ]
        )
        
        result = outcome.to_dict()
        
        assert "job_state" in result
        assert "total_clips" in result
        assert "success_clips" in result
        assert "failed_clips" in result
        assert "skipped_clips" in result
        assert "failure_types" in result
        assert "summary" in result
        assert "clip_failures" in result
    
    def test_to_dict_serializes_enums(self):
        """Enums should be serialized to string values."""
        outcome = derive_execution_outcome(
            total_clips=1,
            success_clips=1,
            failed_clips=0,
            skipped_clips=0
        )
        
        result = outcome.to_dict()
        
        assert isinstance(result["job_state"], str)
        assert result["job_state"] == "COMPLETE"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
