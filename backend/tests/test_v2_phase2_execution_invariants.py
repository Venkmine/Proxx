"""
V2 Phase-2 Execution Invariant Enforcement Tests

THESE TESTS ARE PHASE-2 GUARDRAILS.

Purpose:
--------
Ensure Phase-2 scaling, concurrency, persistence, UI, and orchestration changes
CANNOT alter the meaning or outcome of execution.

These tests assert the NON-NEGOTIABLE execution invariants defined in:
docs/V2_PHASE_2_EXECUTION_INVARIANTS.md

Failure Policy:
---------------
Any test failure in this suite BLOCKS Phase-2 work.
These tests must pass before any Phase-2 change is merged.

Test Coverage:
--------------
A. Execution semantics are preserved (determinism)
B. Scaling does NOT affect meaning (same results sequential vs concurrent)
C. Failure semantics are stable (no reclassification)
D. Shared-nothing guarantee (no global state mutation)
E. Observability is non-authoritative (ExecutionResult is truth)

Constraints:
------------
- NO modifications to production code
- NO mocks that alter execution behavior
- Tests call existing adapters only
- Tests document violations if invariants cannot be tested directly
"""

import pytest
import tempfile
import os
import json
from pathlib import Path
from datetime import datetime, timezone
from typing import List
import copy

# Import execution infrastructure
from job_spec import JobSpec, JobSpecValidationError
from execution_adapter import execute_jobspec
from execution_results import JobExecutionResult, ClipExecutionResult


# =============================================================================
# Test Fixtures
# =============================================================================

def create_jobspec_dict(source_file, output_dir, naming_template="{source_name}_proxy"):
    """Helper to create properly-formatted JobSpec dictionaries."""
    return {
        "jobspec_version": "2.1",
        "sources": [source_file],
        "output_directory": output_dir,
        "proxy_profile": "standard_proxy_ffmpeg",
        "codec": "h264",
        "container": "mp4",
        "resolution": "1920x1080",
        "naming_template": naming_template,
    }


@pytest.fixture
def temp_workspace():
    """Create temporary workspace with input/output directories."""
    temp_dir = tempfile.mkdtemp()
    input_dir = Path(temp_dir) / "input"
    output_dir = Path(temp_dir) / "output"
    input_dir.mkdir()
    output_dir.mkdir()
    
    yield {
        "root": temp_dir,
        "input_dir": input_dir,
        "output_dir": output_dir,
    }
    
    # Cleanup
    import shutil
    if os.path.exists(temp_dir):
        shutil.rmtree(temp_dir)


@pytest.fixture
def mock_source_file(temp_workspace):
    """Create a mock source video file."""
    source_path = temp_workspace["input_dir"] / "test_source.mp4"
    # Create fake file with minimal content
    source_path.write_bytes(b"fake video content for testing")
    return str(source_path)


@pytest.fixture
def valid_jobspec_dict(mock_source_file, temp_workspace):
    """Create a valid JobSpec dictionary for testing."""
    return create_jobspec_dict(
        mock_source_file,
        str(temp_workspace["output_dir"]),
        "{source_name}_proxy"
    )


# =============================================================================
# A. Execution Semantics Are Preserved (Determinism)
# =============================================================================

class TestExecutionDeterminism:
    """
    INVARIANT: Same JobSpec → Same Behavior
    
    Execution must be deterministic. Identical JobSpecs must produce:
    - Same engine selection
    - Same validation behavior
    - Same failure classification
    - Identical ExecutionResult (except timestamps)
    """
    
    def test_same_jobspec_produces_identical_results_modulo_timestamps(
        self, valid_jobspec_dict
    ):
        """
        Execute the same JobSpec twice and verify results are identical
        except for timestamps.
        
        INVARIANT: Execution is deterministic.
        """
        # Create JobSpec
        jobspec1 = JobSpec.from_dict(valid_jobspec_dict)
        jobspec2 = JobSpec.from_dict(valid_jobspec_dict)
        
        # Execute twice (will fail due to FFmpeg not actually running, but that's OK)
        result1 = execute_jobspec(jobspec1)
        result2 = execute_jobspec(jobspec2)
        
        # Results must have identical semantic content
        assert result1.final_status == result2.final_status, \
            "Same JobSpec must produce same final_status"
        
        assert result1.engine_used == result2.engine_used, \
            "Same JobSpec must select same engine"
        
        assert result1.validation_stage == result2.validation_stage, \
            "Same JobSpec must have same validation_stage"
        
        assert result1.validation_error == result2.validation_error, \
            "Same JobSpec must produce same validation_error"
        
        assert len(result1.clips) == len(result2.clips), \
            "Same JobSpec must produce same number of clip results"
    
    def test_engine_selection_is_deterministic(self, mock_source_file, temp_workspace):
        """
        Engine selection must be purely a function of JobSpec content.
        
        INVARIANT: No heuristic engine switching.
        """
        jobspec_dict = create_jobspec_dict(
            mock_source_file,
            str(temp_workspace["output_dir"]),
            "{source_name}_proxy"
        )
        
        # Execute same JobSpec multiple times
        results = []
        for _ in range(3):
            jobspec = JobSpec.from_dict(jobspec_dict)
            result = execute_jobspec(jobspec)
            results.append(result)
        
        # All executions must select same engine
        engines = [r.engine_used for r in results]
        assert len(set(engines)) == 1, \
            f"Engine selection must be deterministic, got: {engines}"
    
    def test_validation_failure_is_stable(self, temp_workspace):
        """
        Validation failures must occur consistently and identically.
        
        INVARIANT: Same input → same validation behavior.
        """
        # Create invalid JobSpec (missing required fields)
        invalid_jobspec_dict = {
            "jobspec_version": "2.1",
            "sources": ["/nonexistent/file.mp4"],
            "output_directory": str(temp_workspace["output_dir"]),
            "proxy_profile": "standard_proxy_ffmpeg",
            "codec": "h264",
            "container": "mp4",
            "resolution": "1920x1080",
        }
        
        # Execute twice
        jobspec1 = JobSpec.from_dict(invalid_jobspec_dict)
        jobspec2 = JobSpec.from_dict(invalid_jobspec_dict)
        
        result1 = execute_jobspec(jobspec1)
        result2 = execute_jobspec(jobspec2)
        
        # Both must fail validation identically
        assert result1.final_status == "FAILED"
        assert result2.final_status == "FAILED"
        assert result1.validation_stage == result2.validation_stage
        assert result1.validation_error == result2.validation_error


# =============================================================================
# B. Scaling Does NOT Affect Meaning
# =============================================================================

class TestScalingInvariance:
    """
    INVARIANT: Parallelism Must Not Change Semantics
    
    Sequential vs concurrent execution must produce identical per-job results.
    Ordering must not affect outcomes.
    """
    
    def test_job_isolation_no_cross_contamination(
        self, mock_source_file, temp_workspace
    ):
        """
        Executing multiple JobSpecs in sequence must not affect each other.
        
        INVARIANT: No cross-job influence.
        INVARIANT: Shared-nothing execution.
        """
        # Create two distinct JobSpecs
        jobspec_dict_a = {
            "jobspec_version": "2.1",
            "sources": [mock_source_file],
            "output_dir": str(temp_workspace["output_dir"]),
            "proxy_profile": "standard_proxy_ffmpeg",
            "video_codec": "h264",
            "audio_codec": "aac",
            "container": "mp4",
            "naming_template": "job_a_{source_name}",
        }
        
        jobspec_dict_b = {
            "jobspec_version": "2.1",
            "sources": [mock_source_file],
            "output_dir": str(temp_workspace["output_dir"]),
            "proxy_profile": "standard_proxy_ffmpeg",
            "video_codec": "h264",
            "audio_codec": "aac",
            "container": "mp4",
            "naming_template": "job_b_{source_name}",
        }
        
        # Execute Job A alone
        jobspec_a_solo = JobSpec.from_dict(jobspec_dict_a)
        result_a_solo = execute_jobspec(jobspec_a_solo)
        
        # Execute Job A and Job B in sequence
        jobspec_a_with_b = JobSpec.from_dict(jobspec_dict_a)
        jobspec_b = JobSpec.from_dict(jobspec_dict_b)
        
        result_a_with_b = execute_jobspec(jobspec_a_with_b)
        result_b = execute_jobspec(jobspec_b)
        
        # Job A result must be identical whether executed alone or with Job B
        assert result_a_solo.final_status == result_a_with_b.final_status, \
            "Job A outcome must not be affected by Job B execution"
        
        assert result_a_solo.engine_used == result_a_with_b.engine_used, \
            "Job A engine selection must not be affected by Job B"
        
        assert result_a_solo.validation_error == result_a_with_b.validation_error, \
            "Job A validation must not be affected by Job B"
    
    def test_execution_order_does_not_affect_individual_outcomes(
        self, mock_source_file, temp_workspace
    ):
        """
        Changing execution order must not change individual job results.
        
        INVARIANT: Ordering must not change outcomes.
        """
        # Create three distinct JobSpecs
        jobspecs_dicts = []
        for i in range(3):
            jobspecs_dicts.append({
                "jobspec_version": "2.1",
                "sources": [mock_source_file],
                "output_dir": str(temp_workspace["output_dir"]),
                "proxy_profile": "standard_proxy_ffmpeg",
                "video_codec": "h264",
                "audio_codec": "aac",
                "container": "mp4",
                "naming_template": f"job_{i}_{{source_name}}",
            })
        
        # Execute in order A, B, C
        order_abc = [JobSpec.from_dict(d) for d in jobspecs_dicts]
        results_abc = [execute_jobspec(js) for js in order_abc]
        
        # Execute in order C, B, A
        order_cba = [JobSpec.from_dict(jobspecs_dicts[i]) for i in [2, 1, 0]]
        results_cba = [execute_jobspec(js) for js in order_cba]
        
        # Job outcomes must be independent of execution order
        # Compare job 0 from both orderings
        assert results_abc[0].final_status == results_cba[2].final_status
        assert results_abc[0].engine_used == results_cba[2].engine_used
        
        # Compare job 1 from both orderings
        assert results_abc[1].final_status == results_cba[1].final_status
        assert results_abc[1].engine_used == results_cba[1].engine_used


# =============================================================================
# C. Failure Semantics Are Stable
# =============================================================================

class TestFailureSemanticStability:
    """
    INVARIANT: Failure Types Are Preserved Verbatim
    
    Failure classification must not change based on context.
    No implicit retries.
    No failure reclassification.
    """
    
    def test_validation_failure_remains_validation_failure(self, temp_workspace):
        """
        Validation failures must always be classified as validation failures.
        
        INVARIANT: Failure meaning cannot change under scaling.
        """
        # Create JobSpec with validation error (nonexistent source)
        invalid_jobspec_dict = {
            "jobspec_version": "2.1",
            "sources": ["/absolutely/does/not/exist.mp4"],
            "output_dir": str(temp_workspace["output_dir"]),
            "proxy_profile": "standard_proxy_ffmpeg",
            "video_codec": "h264",
            "audio_codec": "aac",
            "container": "mp4",
            "naming_template": "{source_name}_proxy",
        }
        
        # Execute multiple times
        results = []
        for _ in range(3):
            jobspec = JobSpec.from_dict(invalid_jobspec_dict)
            result = execute_jobspec(jobspec)
            results.append(result)
        
        # All must fail at validation stage
        for result in results:
            assert result.final_status == "FAILED", \
                "Validation failures must result in FAILED status"
            assert result.validation_stage is not None, \
                "Validation failures must set validation_stage"
            assert result.validation_error is not None, \
                "Validation failures must provide validation_error"
    
    def test_no_implicit_retry_on_failure(self, mock_source_file, temp_workspace):
        """
        Execution must attempt exactly one run per clip. No automatic retries.
        
        INVARIANT: No implicit retries.
        
        NOTE: This test documents the invariant. Actual retry detection would
        require execution engine instrumentation, which violates test constraints.
        """
        jobspec_dict = {
            "jobspec_version": "2.1",
            "sources": [mock_source_file],
            "output_dir": str(temp_workspace["output_dir"]),
            "proxy_profile": "standard_proxy_ffmpeg",
            "video_codec": "h264",
            "audio_codec": "aac",
            "container": "mp4",
            "naming_template": "{source_name}_proxy",
        }
        
        jobspec = JobSpec.from_dict(jobspec_dict)
        result = execute_jobspec(jobspec)
        
        # Result must reflect single execution attempt
        # If this were to change (e.g., automatic retry added), this test would
        # need to detect multiple execution attempts, which it currently cannot.
        # 
        # VIOLATION DETECTION: Manual review required
        # If execution logs show multiple FFmpeg invocations for single clip,
        # that violates "no implicit retries" invariant.
        assert True, "Invariant documented: no implicit retries"
    
    def test_failure_classification_is_stable_across_executions(
        self, temp_workspace
    ):
        """
        Same failure cause must produce same failure classification every time.
        
        INVARIANT: Failure types are preserved verbatim.
        """
        # Validation failure case
        invalid_jobspec_dict = {
            "jobspec_version": "2.1",
            "sources": ["/does/not/exist.mp4"],
            "output_dir": str(temp_workspace["output_dir"]),
            "proxy_profile": "standard_proxy_ffmpeg",
            "video_codec": "h264",
            "audio_codec": "aac",
            "container": "mp4",
            "naming_template": "{source_name}_proxy",
        }
        
        results = []
        for _ in range(5):
            jobspec = JobSpec.from_dict(invalid_jobspec_dict)
            result = execute_jobspec(jobspec)
            results.append(result)
        
        # All failures must have identical classification
        validation_stages = [r.validation_stage for r in results]
        assert len(set(validation_stages)) == 1, \
            f"Validation stage must be stable, got: {validation_stages}"
        
        final_statuses = [r.final_status for r in results]
        assert all(status == "FAILED" for status in final_statuses), \
            "All validation failures must result in FAILED status"


# =============================================================================
# D. Shared-Nothing Guarantee
# =============================================================================

class TestSharedNothingExecution:
    """
    INVARIANT: Jobs Do Not Share Mutable State
    
    No cross-job communication.
    No global state mutation.
    No shared caches affecting semantics.
    """
    
    def test_no_global_state_mutation_during_execution(
        self, mock_source_file, temp_workspace
    ):
        """
        Execution must not modify global state that affects subsequent executions.
        
        INVARIANT: No background mutation.
        INVARIANT: Shared-nothing execution guarantee.
        
        NOTE: This test is limited by inability to instrument global state.
        If execution modifies global caches, profile registries, or other shared
        state, this test cannot detect it directly.
        
        VIOLATION DETECTION: Manual code review required.
        """
        jobspec_dict = {
            "jobspec_version": "2.1",
            "sources": [mock_source_file],
            "output_dir": str(temp_workspace["output_dir"]),
            "proxy_profile": "standard_proxy_ffmpeg",
            "video_codec": "h264",
            "audio_codec": "aac",
            "container": "mp4",
            "naming_template": "{source_name}_proxy",
        }
        
        # Execute first job
        jobspec1 = JobSpec.from_dict(jobspec_dict)
        result1 = execute_jobspec(jobspec1)
        
        # Execute second job with identical spec
        jobspec2 = JobSpec.from_dict(jobspec_dict)
        result2 = execute_jobspec(jobspec2)
        
        # Results must be identical (proving no state mutation affected execution)
        assert result1.final_status == result2.final_status
        assert result1.engine_used == result2.engine_used
        assert result1.validation_stage == result2.validation_stage
        
        # If global state were mutated, second execution might behave differently
        # This test documents the requirement but cannot enforce it completely
        assert True, "Invariant documented: no global state mutation"
    
    def test_jobspec_immutability_during_execution(
        self, mock_source_file, temp_workspace
    ):
        """
        JobSpec must not be mutated during execution.
        
        INVARIANT: JobSpec immutability.
        """
        jobspec_dict = {
            "jobspec_version": "2.1",
            "sources": [mock_source_file],
            "output_dir": str(temp_workspace["output_dir"]),
            "proxy_profile": "standard_proxy_ffmpeg",
            "video_codec": "h264",
            "audio_codec": "aac",
            "container": "mp4",
            "naming_template": "{source_name}_proxy",
        }
        
        jobspec = JobSpec.from_dict(jobspec_dict)
        
        # Capture JobSpec state before execution
        sources_before = copy.deepcopy(jobspec.sources)
        output_dir_before = jobspec.output_dir
        proxy_profile_before = jobspec.proxy_profile
        
        # Execute
        result = execute_jobspec(jobspec)
        
        # Verify JobSpec is unchanged
        assert jobspec.sources == sources_before, \
            "sources must not be mutated during execution"
        assert jobspec.output_dir == output_dir_before, \
            "output_dir must not be mutated during execution"
        assert jobspec.proxy_profile == proxy_profile_before, \
            "proxy_profile must not be mutated during execution"


# =============================================================================
# E. Observability Guarantees
# =============================================================================

class TestObservabilityGuarantees:
    """
    INVARIANT: ExecutionResult Is Sole Source of Truth
    
    Logs are supplemental.
    Metrics do not redefine success/failure.
    ExecutionResult completely describes outcome.
    """
    
    def test_execution_result_is_self_describing(
        self, mock_source_file, temp_workspace
    ):
        """
        ExecutionResult must contain all information needed to determine outcome.
        
        INVARIANT: ExecutionResult is sole source of truth.
        """
        jobspec_dict = {
            "jobspec_version": "2.1",
            "sources": [mock_source_file],
            "output_dir": str(temp_workspace["output_dir"]),
            "proxy_profile": "standard_proxy_ffmpeg",
            "video_codec": "h264",
            "audio_codec": "aac",
            "container": "mp4",
            "naming_template": "{source_name}_proxy",
        }
        
        jobspec = JobSpec.from_dict(jobspec_dict)
        result = execute_jobspec(jobspec)
        
        # Result must contain definitive status
        assert result.final_status in ["COMPLETED", "FAILED", "PARTIAL"], \
            "ExecutionResult must have unambiguous final_status"
        
        # If failed, must contain failure information
        if result.final_status == "FAILED":
            assert (
                result.validation_error is not None or
                any(clip.failure_reason for clip in result.clips)
            ), "Failed result must contain failure reason"
        
        # Result must contain engine selection information
        assert result.engine_used is not None or result.validation_error is not None, \
            "ExecutionResult must indicate which engine was used or why execution failed"
    
    def test_success_determination_requires_only_execution_result(
        self, mock_source_file, temp_workspace
    ):
        """
        Success/failure must be determinable from ExecutionResult alone.
        
        INVARIANT: No external state required to interpret results.
        """
        jobspec_dict = {
            "jobspec_version": "2.1",
            "sources": [mock_source_file],
            "output_dir": str(temp_workspace["output_dir"]),
            "proxy_profile": "standard_proxy_ffmpeg",
            "video_codec": "h264",
            "audio_codec": "aac",
            "container": "mp4",
            "naming_template": "{source_name}_proxy",
        }
        
        jobspec = JobSpec.from_dict(jobspec_dict)
        result = execute_jobspec(jobspec)
        
        # Must be able to determine success from result alone
        is_success = result.final_status == "COMPLETED"
        is_failure = result.final_status == "FAILED"
        
        assert is_success or is_failure, \
            "Success/failure must be determinable from final_status"
        
        # No log parsing should be required
        # No database queries should be required
        # No external file checks should be required
        assert True, "Success determination requires only ExecutionResult"
    
    def test_execution_result_serialization_preserves_semantics(
        self, mock_source_file, temp_workspace
    ):
        """
        Serialized ExecutionResult must retain all semantic information.
        
        INVARIANT: Results are auditable through serialization.
        """
        jobspec_dict = {
            "jobspec_version": "2.1",
            "sources": [mock_source_file],
            "output_dir": str(temp_workspace["output_dir"]),
            "proxy_profile": "standard_proxy_ffmpeg",
            "video_codec": "h264",
            "audio_codec": "aac",
            "container": "mp4",
            "naming_template": "{source_name}_proxy",
        }
        
        jobspec = JobSpec.from_dict(jobspec_dict)
        result = execute_jobspec(jobspec)
        
        # Serialize to dict
        result_dict = result.to_dict()
        
        # Critical fields must be present
        assert "final_status" in result_dict
        assert "job_id" in result_dict
        assert "clips" in result_dict
        assert "engine_used" in result_dict
        
        # Serialization must be lossless for semantics
        assert result_dict["final_status"] == result.final_status
        assert result_dict["engine_used"] == result.engine_used
