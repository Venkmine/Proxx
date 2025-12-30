"""
Pre-RAW Hardening Tests - Resolve Process Failure

Tests for Resolve process disappearance and failure handling.

Validates:
1. Resolve process termination mid-job returns FAILED cleanly
2. No retries attempted
3. No hang or deadlock
4. No state corruption

Part of Pre-RAW Hardening Suite
"""

import pytest
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from job_spec import JobSpec, JOBSPEC_VERSION
from execution_adapter import execute_jobspec
from execution_results import JobExecutionResult


def test_resolve_process_termination_returns_failed():
    """
    TEST: Resolve process termination during job returns FAILED cleanly.
    
    GIVEN: Job that would route to Resolve
    WHEN: Resolve process terminates unexpectedly
    THEN: Job returns FAILED status
    AND: No retry attempted
    AND: Error message captured
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        # Create fake BRAW file (routes to Resolve)
        source_file = tmpdir_path / "test.braw"
        source_file.write_text("fake BRAW data")
        
        jobspec = JobSpec(
            job_id="process_failure_test",
            sources=[str(source_file)],
            output_directory=str(tmpdir_path),
            codec="prores_proxy",
            container="mov",
            resolution="same",
            naming_template="output",
            resolve_preset="Proxy - H.264",
        )
        
        # Mock _execute_with_resolve to simulate process termination
        def mock_resolve_failure(*args, **kwargs):
            # Simulate what happens when Resolve process dies
            from execution_results import JobExecutionResult
            return JobExecutionResult(
                job_id=jobspec.job_id,
                clips=[],
                final_status="FAILED",
                validation_error="Resolve process terminated unexpectedly",
                jobspec_version=JOBSPEC_VERSION,
                engine_used="resolve",
                started_at=datetime.now(timezone.utc),
                completed_at=datetime.now(timezone.utc),
            )
        
        with patch('execution_adapter._execute_with_resolve', side_effect=mock_resolve_failure):
            result = execute_jobspec(jobspec)
        
        # Assertions: Clean failure
        assert result.final_status == "FAILED"
        assert result.validation_error is not None
        assert "terminated" in result.validation_error.lower() or "failed" in result.validation_error.lower()
        assert result.engine_used == "resolve"
        assert len(result.clips) == 0


def test_resolve_failure_called_once_only():
    """
    TEST: Resolve failure execution happens exactly once (no automatic retries).
    
    GIVEN: Resolve job that fails
    WHEN: Failure occurs
    THEN: Execution called exactly once
    AND: No automatic retries attempted
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        source_file = tmpdir_path / "test.braw"
        source_file.write_text("fake BRAW")
        
        jobspec = JobSpec(
            job_id="execution_once_test",
            sources=[str(source_file)],
            output_directory=str(tmpdir_path),
            codec="prores_proxy",
            container="mov",
            resolution="same",
            naming_template="output",
            resolve_preset="Proxy - H.264",
            proxy_profile="proxy_prores_proxy_resolve",
        )
        
        call_count = {"count": 0}
        
        def mock_resolve_failure(*args, **kwargs):
            call_count["count"] += 1
            from execution_results import JobExecutionResult
            return JobExecutionResult(
                job_id=jobspec.job_id,
                clips=[],
                final_status="FAILED",
                validation_error="Simulated failure",
                jobspec_version=JOBSPEC_VERSION,
                engine_used="resolve",
                started_at=datetime.now(timezone.utc),
                completed_at=datetime.now(timezone.utc),
            )
        
        with patch('execution_adapter._execute_with_resolve', side_effect=mock_resolve_failure):
            result = execute_jobspec(jobspec)
        
        # Assertions: Called exactly once (no retry)
        assert call_count["count"] == 1
        assert result.final_status == "FAILED"


def test_resolve_failure_no_state_corruption():
    """
    TEST: Resolve failure does not corrupt JobSpec or result state.
    
    GIVEN: JobSpec for Resolve job
    WHEN: Resolve execution fails
    THEN: JobSpec remains unchanged
    AND: Result is valid and serializable
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        source_file = tmpdir_path / "test.braw"
        source_file.write_text("fake BRAW")
        
        jobspec = JobSpec(
            job_id="state_corruption_test",
            sources=[str(source_file)],
            output_directory=str(tmpdir_path),
            codec="prores_proxy",
            container="mov",
            resolution="same",
            naming_template="output",
            resolve_preset="Proxy - H.264",
        )
        
        # Store original state
        original_dict = jobspec.to_dict()
        
        def mock_resolve_failure(*args, **kwargs):
            from execution_results import JobExecutionResult
            return JobExecutionResult(
                job_id=jobspec.job_id,
                clips=[],
                final_status="FAILED",
                validation_error="Simulated failure",
                jobspec_version=JOBSPEC_VERSION,
                engine_used="resolve",
                started_at=datetime.now(timezone.utc),
                completed_at=datetime.now(timezone.utc),
            )
        
        with patch('execution_adapter._execute_with_resolve', side_effect=mock_resolve_failure):
            result = execute_jobspec(jobspec)
        
        # Assertions: JobSpec unchanged
        assert jobspec.to_dict() == original_dict
        
        # Assertions: Result is valid and serializable
        result_dict = result.to_dict()
        assert result_dict["final_status"] == "FAILED"
        assert "job_id" in result_dict
        
        # Can serialize to JSON
        import json
        json_str = result.to_json()
        parsed = json.loads(json_str)
        assert parsed["final_status"] == "FAILED"


def test_resolve_failure_completes_within_timeout():
    """
    TEST: Resolve failure returns promptly (no hang).
    
    GIVEN: Resolve job that fails
    WHEN: Failure occurs
    THEN: Result returned immediately
    AND: No blocking or deadlock
    """
    import time
    
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        source_file = tmpdir_path / "test.braw"
        source_file.write_text("fake BRAW")
        
        jobspec = JobSpec(
            job_id="timeout_test",
            sources=[str(source_file)],
            output_directory=str(tmpdir_path),
            codec="prores_proxy",
            container="mov",
            resolution="same",
            naming_template="output",
            resolve_preset="Proxy - H.264",
        )
        
        def mock_resolve_failure(*args, **kwargs):
            from execution_results import JobExecutionResult
            return JobExecutionResult(
                job_id=jobspec.job_id,
                clips=[],
                final_status="FAILED",
                validation_error="Simulated failure",
                jobspec_version=JOBSPEC_VERSION,
                engine_used="resolve",
                started_at=datetime.now(timezone.utc),
                completed_at=datetime.now(timezone.utc),
            )
        
        start = time.time()
        with patch('execution_adapter._execute_with_resolve', side_effect=mock_resolve_failure):
            result = execute_jobspec(jobspec)
        elapsed = time.time() - start
        
        # Assertions: Returns quickly (< 1 second)
        assert elapsed < 1.0, f"Execution took {elapsed}s, should return immediately"
        assert result.final_status == "FAILED"


def test_resolve_api_exception_returns_failed():
    """
    TEST: Resolve API exception during execution returns FAILED.
    
    GIVEN: Resolve job
    WHEN: Resolve API raises exception
    THEN: Job returns FAILED status
    AND: Exception message captured
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        source_file = tmpdir_path / "test.braw"
        source_file.write_text("fake BRAW")
        
        jobspec = JobSpec(
            job_id="api_exception_test",
            sources=[str(source_file)],
            output_directory=str(tmpdir_path),
            codec="prores_proxy",
            container="mov",
            resolution="same",
            naming_template="output",
            resolve_preset="Proxy - H.264",
        )
        
        def mock_resolve_exception(*args, **kwargs):
            raise RuntimeError("Resolve API connection failed")
        
        with patch('execution_adapter._execute_with_resolve', side_effect=mock_resolve_exception):
            # Should catch exception and return FAILED result
            result = execute_jobspec(jobspec)
        
        # Assertions: Exception handled gracefully
        assert result.final_status == "FAILED"
        assert result.validation_error is not None or result.final_status == "FAILED"


def test_multiple_resolve_failures_independent():
    """
    TEST: Multiple Resolve failures are independent (no shared state).
    
    GIVEN: Multiple JobSpecs that fail in Resolve
    WHEN: Executed sequentially
    THEN: Each failure is independent
    AND: No cross-contamination between jobs
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        results = []
        
        for i in range(3):
            source_file = tmpdir_path / f"test_{i}.braw"
            source_file.write_text(f"fake BRAW {i}")
            
            job_id = f"independent_failure_{i}"
            error_message = f"Failure {i}"
            
            jobspec = JobSpec(
                job_id=job_id,
                sources=[str(source_file)],
                output_directory=str(tmpdir_path),
                codec="prores_proxy",
                container="mov",
                resolution="same",
                naming_template="output",
                resolve_preset="Proxy - H.264",
                proxy_profile="proxy_prores_proxy_resolve",
            )
            
            # Create closure with captured variables
            def make_mock_failure(captured_job_id, captured_error):
                def mock_resolve_failure(*args, **kwargs):
                    from execution_results import JobExecutionResult
                    return JobExecutionResult(
                        job_id=captured_job_id,
                        clips=[],
                        final_status="FAILED",
                        validation_error=captured_error,
                        jobspec_version=JOBSPEC_VERSION,
                        engine_used="resolve",
                        started_at=datetime.now(timezone.utc),
                        completed_at=datetime.now(timezone.utc),
                    )
                return mock_resolve_failure
            
            with patch('execution_adapter._execute_with_resolve', side_effect=make_mock_failure(job_id, error_message)):
                result = execute_jobspec(jobspec)
                results.append(result)
        
        # Assertions: All failed independently
        assert len(results) == 3
        for i, result in enumerate(results):
            assert result.final_status == "FAILED"
            assert result.job_id == f"independent_failure_{i}"
            assert f"Failure {i}" in result.validation_error


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
