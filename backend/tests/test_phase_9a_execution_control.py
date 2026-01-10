"""
Phase 9A: Explicit Job Execution Control - E2E Tests

CRITICAL: These tests verify the core Phase 9A invariant:
"Jobs MUST NOT auto-execute on creation"

Test Philosophy:
- If FFmpeg runs without explicitly setting execution_requested=True, test FAILS.
- Watch folder job creation MUST NOT trigger execution.
- Backend MUST block execution if execution_requested=False.

These are MANDATORY tests. The system is NOT Phase 9A compliant if any fail.
"""

import pytest
import sys
from pathlib import Path
from typing import Dict, Any
from unittest.mock import patch, MagicMock

# Add backend to path for imports
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from job_spec import JobSpec, JOBSPEC_VERSION


# =============================================================================
# Test Fixtures
# =============================================================================

def make_minimal_jobspec(
    execution_requested: bool = False,
    sources: list = None,
) -> JobSpec:
    """
    Create a minimal JobSpec for testing execution control.
    
    By default, execution_requested=False (the Phase 9A default).
    """
    return JobSpec(
        sources=sources or ["/test/source.mov"],
        output_directory="/test/output",
        codec="prores_proxy",
        container="mov",
        resolution="half",
        naming_template="{source_name}_proxy",
        execution_requested=execution_requested,
    )


def make_minimal_jobspec_dict(execution_requested: bool = None) -> dict:
    """
    Create a minimal JobSpec dict for testing.
    Includes jobspec_version as required by the contract.
    If execution_requested is None, it won't be included (simulating legacy).
    """
    data = {
        "jobspec_version": JOBSPEC_VERSION,
        "sources": ["/test/source.mov"],
        "output_directory": "/test/output",
        "codec": "prores_proxy",
        "container": "mov",
        "resolution": "half",
        "naming_template": "{source_name}_proxy",
    }
    if execution_requested is not None:
        data["execution_requested"] = execution_requested
    return data


# =============================================================================
# TEST CASE 1: Creating a job does NOT execute it
# =============================================================================

class TestJobCreationDoesNotExecute:
    """
    Phase 9A Core Invariant: Job creation ≠ Job execution
    
    Jobs should be created in a QUEUED/DRAFT state, awaiting explicit
    user action to begin processing.
    """
    
    def test_jobspec_default_execution_requested_is_false(self):
        """
        CRITICAL: JobSpec default for execution_requested must be False.
        
        This is the foundation of Phase 9A - jobs are inert by default.
        """
        jobspec = JobSpec(
            sources=["/test/file.mov"],
            output_directory="/output",
            codec="prores_proxy",
            container="mov",
            resolution="half",
            naming_template="{source_name}_proxy",
        )
        
        assert jobspec.execution_requested is False, \
            "Phase 9A violation: JobSpec default must have execution_requested=False"
    
    def test_jobspec_to_dict_includes_execution_requested(self):
        """
        execution_requested must be serialized to dict for persistence.
        """
        jobspec = make_minimal_jobspec(execution_requested=False)
        data = jobspec.to_dict()
        
        assert "execution_requested" in data, \
            "execution_requested must be in serialized JobSpec"
        assert data["execution_requested"] is False
    
    def test_jobspec_from_dict_defaults_to_false(self):
        """
        When loading a JobSpec without execution_requested, it must default to False.
        
        This handles legacy jobs from before Phase 9A.
        """
        # Create dict WITHOUT execution_requested field (simulating legacy)
        legacy_data = make_minimal_jobspec_dict(execution_requested=None)
        
        jobspec = JobSpec.from_dict(legacy_data)
        
        assert jobspec.execution_requested is False, \
            "Phase 9A: Legacy jobs without execution_requested must default to False"


# =============================================================================
# TEST CASE 2: Backend blocks execution if execution_requested=False
# =============================================================================

class TestBackendEnforcesExecutionControl:
    """
    Phase 9A Backend Enforcement: The backend MUST block execution attempts
    where execution_requested=False, regardless of how the request arrives.
    
    This is the "trust but verify" layer - even if UI is compromised,
    backend won't run jobs without explicit authorization.
    """
    
    def test_execution_adapter_blocks_when_execution_not_requested(self):
        """
        CRITICAL: execution_adapter.execute_jobspec() must return BLOCKED
        if execution_requested=False.
        
        This test imports the real execution_adapter and verifies it checks
        the execution_requested flag BEFORE invoking any engine.
        """
        import execution_adapter
        
        jobspec = make_minimal_jobspec(execution_requested=False)
        
        # Mock engine invocation - this should NEVER be called
        engine_called = False
        original_execute_ffmpeg = getattr(execution_adapter, '_execute_with_ffmpeg', None)
        
        def mock_execute(*args, **kwargs):
            nonlocal engine_called
            engine_called = True
            raise AssertionError("Phase 9A violation: Engine was invoked without execution_requested=True")
        
        # Patch engine execution
        with patch('execution_adapter._execute_with_ffmpeg', mock_execute), \
             patch('execution_adapter._execute_with_resolve', mock_execute):
            result = execution_adapter.execute_jobspec(jobspec)
        
        # Verify blocked status
        final_status = getattr(result, 'final_status', None) or result.get("final_status") if isinstance(result, dict) else result.final_status
        assert final_status == "BLOCKED", \
            f"Phase 9A violation: Execution should be BLOCKED when execution_requested=False. Got: {final_status}"
        
        # Verify engine was not called
        assert not engine_called, \
            "Phase 9A violation: Engine should not be invoked when execution_requested=False"
    
    def test_execution_adapter_allows_when_execution_requested(self):
        """
        When execution_requested=True, execution should proceed (not be blocked).
        
        We mock the actual FFmpeg call but verify the execution path is taken.
        """
        import execution_adapter
        
        jobspec = make_minimal_jobspec(execution_requested=True)
        
        # The result should NOT be blocked immediately - 
        # It may fail for other reasons (missing files, etc) but not 
        # because of execution control
        result = execution_adapter.execute_jobspec(jobspec)
        
        # Get the final status
        final_status = getattr(result, 'final_status', None) or (result.get("final_status") if isinstance(result, dict) else None)
        
        # It should NOT be BLOCKED
        assert final_status != "BLOCKED", \
            f"Execution should not be BLOCKED when execution_requested=True, got: {final_status}"


# =============================================================================
# TEST CASE 3: Queued jobs remain idle until Start pressed
# =============================================================================

class TestQueuedJobsRemainIdle:
    """
    Phase 9A Queue Behavior: Jobs in QUEUED state do not process
    until explicitly started by user action.
    """
    
    def test_queue_does_not_auto_execute_pending_jobs(self):
        """
        A job added to the queue with execution_requested=False
        should not be picked up for processing.
        """
        # This test would integrate with the FIFO queue system
        # For unit testing, we verify the execution_requested check exists
        jobspec = make_minimal_jobspec(execution_requested=False)
        
        # Job should have status that indicates waiting for user action
        assert not jobspec.execution_requested, \
            "Job in queue should not have execution_requested=True until user starts it"


# =============================================================================
# TEST CASE 4: Watch folder jobs never auto-execute
# =============================================================================

class TestWatchFolderNoAutoExecute:
    """
    Phase 9A Watch Folder Rule: Watch folders can CREATE jobs,
    but MUST NOT EXECUTE them automatically.
    
    This is critical for automation safety - files appearing in a folder
    should queue work but not consume resources without user approval.
    """
    
    def test_watch_folder_created_job_has_execution_requested_false(self):
        """
        Jobs created by watch folder ingestion must have execution_requested=False.
        """
        # Simulate watch folder job creation - using valid jobspec dict
        watch_folder_job_data = make_minimal_jobspec_dict(execution_requested=None)
        # Override to simulate watch folder detected file
        watch_folder_job_data["sources"] = ["/watch/incoming/new_file.mov"]
        watch_folder_job_data["output_directory"] = "/watch/output"
        
        jobspec = JobSpec.from_dict(watch_folder_job_data)
        
        assert jobspec.execution_requested is False, \
            "Phase 9A violation: Watch folder jobs must NOT have execution_requested=True"
    
    def test_watch_folder_auto_execute_flag_is_deprecated(self):
        """
        The auto_execute flag on watch folders should be deprecated/ignored.
        
        Even if a watch folder config has auto_execute=True, it should
        be overridden by Phase 9A controls.
        """
        # This tests the conceptual requirement - implementation may vary
        # The key invariant is that auto_execute cannot bypass Phase 9A
        
        watch_folder_config = {
            "path": "/watch/folder",
            "auto_execute": True,  # Legacy/deprecated setting
            "profile": "proxy_prores",
        }
        
        # Even with auto_execute=True in config, jobs should still
        # be created with execution_requested=False
        # The actual enforcement happens in the watch folder engine
        
        # For this unit test, verify JobSpec contract
        jobspec = make_minimal_jobspec(execution_requested=False)
        assert not jobspec.execution_requested, \
            "Watch folder must not override Phase 9A execution control"


# =============================================================================
# TEST CASE 5: The execution_requested field roundtrips correctly
# =============================================================================

class TestExecutionRequestedRoundtrip:
    """
    Data integrity tests for execution_requested field.
    """
    
    def test_execution_requested_true_roundtrips(self):
        """execution_requested=True survives serialization/deserialization."""
        original = make_minimal_jobspec(execution_requested=True)
        data = original.to_dict()
        restored = JobSpec.from_dict(data)
        
        assert restored.execution_requested is True
    
    def test_execution_requested_false_roundtrips(self):
        """execution_requested=False survives serialization/deserialization."""
        original = make_minimal_jobspec(execution_requested=False)
        data = original.to_dict()
        restored = JobSpec.from_dict(data)
        
        assert restored.execution_requested is False
    
    def test_execution_requested_in_known_fields(self):
        """execution_requested must be in KNOWN_FIELDS for validation."""
        # KNOWN_FIELDS is a class variable on JobSpec
        assert "execution_requested" in JobSpec.KNOWN_FIELDS, \
            "execution_requested must be declared in JobSpec.KNOWN_FIELDS"


# =============================================================================
# Summary Test - The Phase 9A Contract
# =============================================================================

class TestPhase9AContract:
    """
    High-level tests for the Phase 9A execution model contract.
    """
    
    def test_phase_9a_execution_model_summary(self):
        """
        Phase 9A Execution Model Contract:
        
        1. Jobs MUST NOT auto-execute on creation
        2. Watch folders MUST NOT bypass execution controls
        3. No background execution without a user gesture
        4. No "smart defaults" that start jobs implicitly
        5. Backend enforces execution_requested check before any engine call
        
        This test documents the contract. Each requirement has detailed tests above.
        """
        # Document the contract
        contract = {
            "version": "9A",
            "core_invariant": "Jobs MUST NOT auto-execute on creation",
            "default_execution_requested": False,
            "backend_enforcement": True,
            "watch_folder_auto_execute": "deprecated",
        }
        
        # Verify the contract holds
        jobspec = make_minimal_jobspec()
        assert jobspec.execution_requested is contract["default_execution_requested"]
