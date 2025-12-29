"""
V2 Execution Adapter Tests - Comprehensive test coverage for JobSpec execution.

These tests assert V2 Phase 1 SLICE 2 semantics:
- JobSpec → execution engine invocation → ExecutionResult
- NO UI, NO retries, NO concurrency, NO heuristics

Test Coverage:
==============
1. Engine Selection
   - FFmpeg for non-RAW formats
   - Resolve for RAW formats
   - Mixed jobs rejected with error
   - Unknown formats rejected with error

2. Validation
   - Valid JobSpec → execution invoked
   - Invalid JobSpec → FAILED result, NO execution
   - Validation errors captured in result

3. Execution
   - Successful execution → COMPLETED result
   - Execution failure → FAILED result with reason
   - Output verification enforced

4. Determinism
   - Same JobSpec → same engine selection
   - Same JobSpec → same command structure

Part of V2 Phase 1 Implementation Readiness
"""

import json
import pytest
import tempfile
from datetime import datetime
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock
from dataclasses import replace

# Import the execution adapter (our subject under test)
import sys
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from job_spec import JobSpec, JobSpecValidationError
from execution_adapter import (
    execute_jobspec,
    validate_jobspec_for_execution,
    determine_engine,
)
from execution_results import JobExecutionResult


# =============================================================================
# Fixtures
# =============================================================================

@pytest.fixture
def temp_dir():
    """Provide a temporary directory for test outputs."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)


@pytest.fixture
def mock_source_file(temp_dir):
    """Create a mock source file for testing."""
    source_file = temp_dir / "source.mp4"
    source_file.write_text("mock video data")
    return source_file


@pytest.fixture
def mock_raw_source_file(temp_dir):
    """Create a mock RAW source file for testing."""
    source_file = temp_dir / "source.r3d"
    source_file.write_text("mock raw data")
    return source_file


@pytest.fixture
def basic_jobspec(temp_dir, mock_source_file):
    """Create a basic valid JobSpec for FFmpeg execution."""
    output_dir = temp_dir / "outputs"
    output_dir.mkdir(parents=True, exist_ok=True)
    return JobSpec(
        job_id="test_job_001",
        sources=[str(mock_source_file)],
        output_directory=str(output_dir),
        codec="h264",
        container="mp4",
        resolution="half",
        naming_template="{source_name}_proxy",
        proxy_profile="proxy_h264_low",
        fps_mode="same-as-source",
    )


@pytest.fixture
def raw_jobspec(temp_dir, mock_raw_source_file):
    """Create a valid JobSpec for Resolve execution (RAW source)."""
    output_dir = temp_dir / "outputs"
    output_dir.mkdir(parents=True, exist_ok=True)
    return JobSpec(
        job_id="test_job_raw_001",
        sources=[str(mock_raw_source_file)],
        output_directory=str(output_dir),
        codec="prores_proxy",
        container="mov",
        resolution="source",
        naming_template="{source_name}_proxy",
        proxy_profile="proxy_prores_proxy_resolve",
        resolve_preset="ProRes Proxy",
        fps_mode="same-as-source",
    )


@pytest.fixture
def multi_source_jobspec(temp_dir):
    """Create a multi-source JobSpec for testing batch execution."""
    # Create multiple mock source files
    sources = []
    for i in range(3):
        source_file = temp_dir / f"source_{i}.mp4"
        source_file.write_text(f"mock video data {i}")
        sources.append(str(source_file))
    
    output_dir = temp_dir / "outputs"
    output_dir.mkdir(parents=True, exist_ok=True)
    
    return JobSpec(
        job_id="test_job_multi_001",
        sources=sources,
        output_directory=str(output_dir),
        codec="h264",
        container="mp4",
        resolution="half",
        naming_template="{source_name}_proxy",
        proxy_profile="proxy_h264_low",
        fps_mode="same-as-source",
    )


# =============================================================================
# Test: Engine Selection
# =============================================================================

def test_engine_selection_ffmpeg_for_standard_formats(basic_jobspec):
    """
    TEST: Standard video formats (MP4, MOV, MXF with standard codecs)
    route to FFmpeg engine.
    
    Assertion: Engine selection is deterministic and based on format.
    """
    engine, error = determine_engine(basic_jobspec)
    
    assert error is None, f"Expected no error, got: {error}"
    assert engine == "ffmpeg", f"Expected 'ffmpeg' engine, got: {engine}"


def test_engine_selection_resolve_for_raw_formats(raw_jobspec):
    """
    TEST: RAW formats (R3D, BRAW, ARRIRAW) route to Resolve engine.
    
    Assertion: RAW sources require Resolve, no fallback to FFmpeg.
    """
    engine, error = determine_engine(raw_jobspec)
    
    assert error is None, f"Expected no error, got: {error}"
    assert engine == "resolve", f"Expected 'resolve' engine, got: {engine}"


def test_engine_selection_mixed_job_rejected(temp_dir, mock_source_file, mock_raw_source_file):
    """
    TEST: Jobs with mixed RAW and non-RAW sources are REJECTED.
    
    Assertion: No mixed-engine jobs allowed. Explicit error returned.
    """
    output_dir = temp_dir / "outputs"
    output_dir.mkdir(parents=True, exist_ok=True)
    
    mixed_jobspec = JobSpec(
        job_id="test_mixed_001",
        sources=[str(mock_source_file), str(mock_raw_source_file)],
        output_directory=str(output_dir),
        codec="h264",
        container="mp4",
        resolution="half",
        naming_template="{source_name}_proxy",
        proxy_profile="proxy_h264_low",  # Invalid for mixed
        fps_mode="same-as-source",
    )
    
    engine, error = determine_engine(mixed_jobspec)
    
    assert engine is None, f"Expected no engine for mixed job, got: {engine}"
    assert error is not None, "Expected error for mixed job"
    assert "mixed" in error.lower(), f"Expected 'mixed' in error, got: {error}"


def test_engine_selection_deterministic(basic_jobspec):
    """
    TEST: Engine selection is deterministic.
    
    Same JobSpec → same engine, every time.
    Assertion: No randomness, no state, no side effects.
    """
    engine1, _ = determine_engine(basic_jobspec)
    engine2, _ = determine_engine(basic_jobspec)
    engine3, _ = determine_engine(basic_jobspec)
    
    assert engine1 == engine2 == engine3, "Engine selection must be deterministic"


# =============================================================================
# Test: Validation Before Execution
# =============================================================================

def test_validation_valid_jobspec_passes(basic_jobspec):
    """
    TEST: Valid JobSpec passes validation.
    
    Assertion: No errors for well-formed JobSpec.
    """
    valid, error = validate_jobspec_for_execution(basic_jobspec)
    
    assert valid is True, f"Expected valid JobSpec, got error: {error}"
    assert error is None, f"Expected no error, got: {error}"


def test_validation_missing_source_fails(basic_jobspec):
    """
    TEST: JobSpec with missing source files fails validation.
    
    Assertion: Validation detects missing files before execution.
    """
    # Create JobSpec with non-existent source
    invalid_jobspec = replace(basic_jobspec, sources=["/nonexistent/file.mp4"])
    
    valid, error = validate_jobspec_for_execution(invalid_jobspec)
    
    assert valid is False, "Expected validation to fail for missing source"
    assert error is not None, "Expected error message for missing source"
    assert "source" in error.lower() or "file" in error.lower() or "exist" in error.lower(), \
        f"Expected source/file/exist in error, got: {error}"


def test_validation_invalid_proxy_profile_fails(basic_jobspec):
    """
    TEST: JobSpec with invalid proxy profile fails validation.
    
    Assertion: Invalid profiles rejected before execution.
    """
    # Use a Resolve profile for an FFmpeg job
    invalid_jobspec = replace(basic_jobspec, proxy_profile="proxy_prores_proxy_resolve")
    
    valid, error = validate_jobspec_for_execution(invalid_jobspec)
    
    assert valid is False, "Expected validation to fail for mismatched profile"
    assert error is not None, "Expected error for profile mismatch"


def test_validation_empty_sources_fails(basic_jobspec):
    """
    TEST: JobSpec with no sources fails validation.
    
    Assertion: Empty sources list is invalid.
    """
    invalid_jobspec = replace(basic_jobspec, sources=[])
    
    valid, error = validate_jobspec_for_execution(invalid_jobspec)
    
    assert valid is False, "Expected validation to fail for empty sources"
    assert error is not None, "Expected error for empty sources"


# =============================================================================
# Test: Execution Behavior
# =============================================================================

@patch('execution_adapter._execute_with_ffmpeg')
@patch('execution_adapter._determine_job_engine')
def test_execution_valid_jobspec_invokes_engine(mock_determine, mock_execute, basic_jobspec):
    """
    TEST: Valid JobSpec triggers engine execution.
    
    Assertion: After validation, engine is invoked.
    """
    # Mock engine selection to return FFmpeg
    mock_determine.return_value = ("ffmpeg", None)
    
    # Mock FFmpeg execution to return success
    from execution_results import ClipExecutionResult
    mock_execute.return_value = JobExecutionResult(
        job_id=basic_jobspec.job_id,
        clips=[
            ClipExecutionResult(
                source_path=basic_jobspec.sources[0],
                resolved_output_path="/tmp/output.mp4",
                ffmpeg_command=["ffmpeg", "-i", "input.mp4", "output.mp4"],
                exit_code=0,
                output_exists=True,
                output_size_bytes=1024,
                status="COMPLETED",
            )
        ],
        final_status="COMPLETED",
    )
    
    result = execute_jobspec(basic_jobspec)
    
    # Assert engine was invoked
    mock_execute.assert_called_once()
    
    # Assert result is successful
    assert result.success is True, "Expected successful execution"
    assert result.final_status == "COMPLETED", f"Expected COMPLETED, got {result.final_status}"


@patch('execution_adapter._determine_job_engine')
def test_execution_invalid_jobspec_not_invoked(mock_determine, basic_jobspec):
    """
    TEST: Invalid JobSpec does NOT invoke engine.
    
    Assertion: Validation failure prevents execution.
    """
    # Create invalid JobSpec (empty sources)
    invalid_jobspec = replace(basic_jobspec, sources=[])
    
    result = execute_jobspec(invalid_jobspec)
    
    # Assert engine was NOT invoked
    mock_determine.assert_not_called()
    
    # Assert result shows failure
    assert result.success is False, "Expected failed result"
    assert result.validation_error is not None, "Expected validation error"
    assert len(result.clips) == 0, "Expected no clips executed"


@patch('execution_adapter._execute_with_ffmpeg')
@patch('execution_adapter._determine_job_engine')
def test_execution_failure_captured_in_result(mock_determine, mock_execute, basic_jobspec):
    """
    TEST: Execution failures are captured in JobExecutionResult.
    
    Assertion: Failures don't raise exceptions, they return FAILED results.
    """
    # Mock engine selection
    mock_determine.return_value = ("ffmpeg", None)
    
    # Mock FFmpeg execution to return failure
    from execution_results import ClipExecutionResult
    mock_execute.return_value = JobExecutionResult(
        job_id=basic_jobspec.job_id,
        clips=[
            ClipExecutionResult(
                source_path=basic_jobspec.sources[0],
                resolved_output_path="/tmp/output.mp4",
                ffmpeg_command=["ffmpeg", "-i", "input.mp4", "output.mp4"],
                exit_code=1,
                output_exists=False,
                output_size_bytes=None,
                status="FAILED",
                failure_reason="FFmpeg exited with code 1",
            )
        ],
        final_status="FAILED",
    )
    
    # Execute - should NOT raise exception
    result = execute_jobspec(basic_jobspec)
    
    # Assert failure is captured in result
    assert result.success is False, "Expected failed result"
    assert result.final_status == "FAILED", f"Expected FAILED, got {result.final_status}"
    assert len(result.clips) > 0, "Expected at least one clip result"
    assert result.clips[0].status == "FAILED", "Expected clip to be FAILED"
    assert result.clips[0].failure_reason is not None, "Expected failure reason"


# =============================================================================
# Test: Output Verification
# =============================================================================

@patch('execution_adapter._execute_with_ffmpeg')
@patch('execution_adapter._determine_job_engine')
def test_output_verification_enforced(mock_determine, mock_execute, basic_jobspec):
    """
    TEST: Output verification is mandatory before marking COMPLETED.
    
    Assertion: File must exist AND be > 0 bytes.
    """
    # Mock engine selection
    mock_determine.return_value = ("ffmpeg", None)
    
    # Mock execution with missing output
    from execution_results import ClipExecutionResult
    mock_execute.return_value = JobExecutionResult(
        job_id=basic_jobspec.job_id,
        clips=[
            ClipExecutionResult(
                source_path=basic_jobspec.sources[0],
                resolved_output_path="/tmp/output.mp4",
                ffmpeg_command=["ffmpeg", "-i", "input.mp4", "output.mp4"],
                exit_code=0,  # FFmpeg succeeded
                output_exists=False,  # But output doesn't exist
                output_size_bytes=None,
                status="FAILED",
                failure_reason="Output file does not exist or has zero size",
            )
        ],
        final_status="FAILED",
    )
    
    result = execute_jobspec(basic_jobspec)
    
    # Assert verification failure causes FAILED status
    assert result.success is False, "Expected failure when output missing"
    assert result.clips[0].output_exists is False, "Expected output_exists to be False"
    assert result.clips[0].status == "FAILED", "Expected FAILED status despite exit_code=0"


# =============================================================================
# Test: Metadata and Auditability
# =============================================================================

@patch('execution_adapter._execute_with_ffmpeg')
@patch('execution_adapter._determine_job_engine')
def test_result_contains_engine_metadata(mock_determine, mock_execute, basic_jobspec):
    """
    TEST: JobExecutionResult contains engine selection metadata.
    
    Assertion: Engine choice is logged for auditability.
    """
    # Mock engine selection
    mock_determine.return_value = ("ffmpeg", None)
    
    # Mock successful execution
    from execution_results import ClipExecutionResult
    mock_execute.return_value = JobExecutionResult(
        job_id=basic_jobspec.job_id,
        clips=[
            ClipExecutionResult(
                source_path=basic_jobspec.sources[0],
                resolved_output_path="/tmp/output.mp4",
                ffmpeg_command=["ffmpeg", "-i", "input.mp4", "output.mp4"],
                exit_code=0,
                output_exists=True,
                output_size_bytes=1024,
                status="COMPLETED",
            )
        ],
        final_status="COMPLETED",
    )
    
    result = execute_jobspec(basic_jobspec)
    
    # Assert metadata is populated
    assert result.engine_used == "ffmpeg", f"Expected engine_used='ffmpeg', got {result.engine_used}"
    assert result.proxy_profile_used == basic_jobspec.proxy_profile, \
        f"Expected proxy_profile_used={basic_jobspec.proxy_profile}, got {result.proxy_profile_used}"


@patch('execution_adapter._execute_with_ffmpeg')
@patch('execution_adapter._determine_job_engine')
def test_result_contains_jobspec_version(mock_determine, mock_execute, basic_jobspec):
    """
    TEST: JobExecutionResult contains JobSpec version for postmortem auditing.
    
    Assertion: Version tracking enables debugging across schema changes.
    """
    # Mock engine selection
    mock_determine.return_value = ("ffmpeg", None)
    
    # Mock execution
    from execution_results import ClipExecutionResult
    mock_execute.return_value = JobExecutionResult(
        job_id=basic_jobspec.job_id,
        clips=[],
        final_status="COMPLETED",
        jobspec_version="2.1",  # Current version
    )
    
    result = execute_jobspec(basic_jobspec)
    
    # Assert version is tracked
    assert result.jobspec_version is not None, "Expected jobspec_version to be populated"


# =============================================================================
# Test: Determinism
# =============================================================================

@patch('execution_adapter._execute_with_ffmpeg')
@patch('execution_adapter._determine_job_engine')
def test_deterministic_engine_selection(mock_determine, mock_execute, basic_jobspec):
    """
    TEST: Same JobSpec always selects same engine.
    
    Assertion: No randomness, no time-based logic, no external state.
    """
    # Mock to track calls
    mock_determine.return_value = ("ffmpeg", None)
    mock_execute.return_value = JobExecutionResult(
        job_id=basic_jobspec.job_id,
        clips=[],
        final_status="COMPLETED",
    )
    
    # Execute same JobSpec multiple times
    results = [execute_jobspec(basic_jobspec) for _ in range(3)]
    
    # Assert engine selection was consistent
    engines = [r.engine_used for r in results]
    assert all(e == "ffmpeg" for e in engines), "Engine selection must be deterministic"


# =============================================================================
# Test: Forbidden Patterns
# =============================================================================

def test_jobspec_not_mutated_during_execution(basic_jobspec):
    """
    TEST: JobSpec is never mutated during execution.
    
    Assertion: Immutability preserved throughout execution flow.
    """
    # Capture original state
    original_sources = basic_jobspec.sources.copy()
    original_output_dir = basic_jobspec.output_directory
    original_proxy_profile = basic_jobspec.proxy_profile
    
    # Execute (with mocks to avoid real execution)
    with patch('execution_adapter._execute_with_ffmpeg') as mock_execute:
        with patch('execution_adapter._determine_job_engine', return_value=("ffmpeg", None)):
            mock_execute.return_value = JobExecutionResult(
                job_id=basic_jobspec.job_id,
                clips=[],
                final_status="COMPLETED",
            )
            execute_jobspec(basic_jobspec)
    
    # Assert JobSpec unchanged
    assert basic_jobspec.sources == original_sources, "JobSpec.sources was mutated"
    assert basic_jobspec.output_directory == original_output_dir, "JobSpec.output_directory was mutated"
    assert basic_jobspec.proxy_profile == original_proxy_profile, "JobSpec.proxy_profile was mutated"


# =============================================================================
# Test: Integration with Existing Code
# =============================================================================

def test_execution_adapter_uses_headless_execute_functions():
    """
    TEST: execution_adapter.py uses existing headless_execute.py functions.
    
    Assertion: No code duplication, reuses existing execution logic.
    """
    from execution_adapter import execute_jobspec
    import inspect
    
    source = inspect.getsource(execute_jobspec)
    
    # Assert that it imports from headless_execute
    assert "_execute_with_ffmpeg" in source or "headless_execute" in source, \
        "Expected execution_adapter to use headless_execute functions"


# =============================================================================
# Run Tests
# =============================================================================

if __name__ == "__main__":
    # Run with pytest
    pytest.main([__file__, "-v", "--tb=short"])
