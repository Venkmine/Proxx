"""
Job Lifecycle State Derivation Tests

Comprehensive QC tests proving:
1. Every lifecycle state is reachable
2. State transitions are correct for given event sequences
3. Determinism (same inputs → same outputs)
4. Impossible states are unreachable
5. Edge cases are handled gracefully

These tests use simulated execution events and do not invoke FFmpeg.
Runtime: <1s
"""

import pytest
from datetime import datetime
from typing import List

from execution.executionEvents import ExecutionEvent, ExecutionEventType
from execution.failureTypes import ExecutionOutcome, JobOutcomeState, ClipFailureType
from execution.jobLifecycle import JobLifecycleState, derive_job_lifecycle_state


# =============================================================================
# Test Helpers
# =============================================================================

def create_event(event_type: ExecutionEventType, clip_id: str = None, message: str = None) -> ExecutionEvent:
    """Create a test execution event."""
    return ExecutionEvent(
        event_type=event_type,
        timestamp=datetime.now(),
        clip_id=clip_id,
        message=message,
    )


def create_outcome(
    job_state: JobOutcomeState,
    total_clips: int = 5,
    success_clips: int = 5,
    failed_clips: int = 0,
    skipped_clips: int = 0,
) -> ExecutionOutcome:
    """Create a test execution outcome."""
    return ExecutionOutcome(
        job_state=job_state,
        total_clips=total_clips,
        success_clips=success_clips,
        failed_clips=failed_clips,
        skipped_clips=skipped_clips,
        failure_types=[],
        summary=f"{job_state.value}: {success_clips}/{total_clips} succeeded",
    )


# =============================================================================
# Reachability Tests: Prove every state is reachable
# =============================================================================

def test_lifecycle_state_idle_reachable():
    """IDLE state is reachable with no events."""
    events: List[ExecutionEvent] = []
    state = derive_job_lifecycle_state(events, None)
    assert state == JobLifecycleState.IDLE


def test_lifecycle_state_queued_reachable():
    """QUEUED state is reachable with JOB_CREATED event."""
    events = [
        create_event(ExecutionEventType.JOB_CREATED),
    ]
    state = derive_job_lifecycle_state(events, None)
    assert state == JobLifecycleState.QUEUED


def test_lifecycle_state_validating_reachable():
    """VALIDATING state is reachable during validation."""
    events = [
        create_event(ExecutionEventType.JOB_CREATED),
        create_event(ExecutionEventType.VALIDATION_STARTED),
    ]
    state = derive_job_lifecycle_state(events, None)
    assert state == JobLifecycleState.VALIDATING


def test_lifecycle_state_running_reachable():
    """RUNNING state is reachable during execution."""
    events = [
        create_event(ExecutionEventType.JOB_CREATED),
        create_event(ExecutionEventType.VALIDATION_STARTED),
        create_event(ExecutionEventType.VALIDATION_PASSED),
        create_event(ExecutionEventType.EXECUTION_STARTED),
    ]
    state = derive_job_lifecycle_state(events, None)
    assert state == JobLifecycleState.RUNNING


def test_lifecycle_state_complete_reachable():
    """COMPLETE state is reachable with successful completion."""
    events = [
        create_event(ExecutionEventType.JOB_CREATED),
        create_event(ExecutionEventType.VALIDATION_STARTED),
        create_event(ExecutionEventType.VALIDATION_PASSED),
        create_event(ExecutionEventType.EXECUTION_STARTED),
        create_event(ExecutionEventType.EXECUTION_COMPLETED),
    ]
    outcome = create_outcome(
        job_state=JobOutcomeState.COMPLETE,
        total_clips=5,
        success_clips=5,
    )
    state = derive_job_lifecycle_state(events, outcome)
    assert state == JobLifecycleState.COMPLETE


def test_lifecycle_state_partial_reachable():
    """PARTIAL state is reachable with mixed results."""
    events = [
        create_event(ExecutionEventType.JOB_CREATED),
        create_event(ExecutionEventType.EXECUTION_STARTED),
        create_event(ExecutionEventType.EXECUTION_COMPLETED),
    ]
    outcome = create_outcome(
        job_state=JobOutcomeState.PARTIAL,
        total_clips=5,
        success_clips=3,
        failed_clips=2,
    )
    state = derive_job_lifecycle_state(events, outcome)
    assert state == JobLifecycleState.PARTIAL


def test_lifecycle_state_failed_reachable():
    """FAILED state is reachable with execution failure."""
    events = [
        create_event(ExecutionEventType.JOB_CREATED),
        create_event(ExecutionEventType.EXECUTION_STARTED),
        create_event(ExecutionEventType.EXECUTION_FAILED),
    ]
    state = derive_job_lifecycle_state(events, None)
    assert state == JobLifecycleState.FAILED


def test_lifecycle_state_failed_reachable_via_outcome():
    """FAILED state is reachable via outcome (all clips failed)."""
    events = [
        create_event(ExecutionEventType.JOB_CREATED),
        create_event(ExecutionEventType.EXECUTION_STARTED),
        create_event(ExecutionEventType.EXECUTION_COMPLETED),
    ]
    outcome = create_outcome(
        job_state=JobOutcomeState.FAILED,
        total_clips=5,
        success_clips=0,
        failed_clips=5,
    )
    state = derive_job_lifecycle_state(events, outcome)
    assert state == JobLifecycleState.FAILED


def test_lifecycle_state_blocked_reachable():
    """BLOCKED state is reachable with validation failure."""
    events = [
        create_event(ExecutionEventType.JOB_CREATED),
        create_event(ExecutionEventType.VALIDATION_STARTED),
        create_event(ExecutionEventType.VALIDATION_FAILED, message="Invalid source path"),
    ]
    state = derive_job_lifecycle_state(events, None)
    assert state == JobLifecycleState.BLOCKED


def test_lifecycle_state_cancelled_reachable():
    """CANCELLED state is reachable with cancellation."""
    events = [
        create_event(ExecutionEventType.JOB_CREATED),
        create_event(ExecutionEventType.EXECUTION_STARTED),
        create_event(ExecutionEventType.EXECUTION_CANCELLED),
    ]
    state = derive_job_lifecycle_state(events, None)
    assert state == JobLifecycleState.CANCELLED


# =============================================================================
# Determinism Tests: Same inputs → same outputs
# =============================================================================

def test_lifecycle_derivation_is_deterministic():
    """Deriving lifecycle state multiple times produces same result."""
    events = [
        create_event(ExecutionEventType.JOB_CREATED),
        create_event(ExecutionEventType.EXECUTION_STARTED),
    ]
    
    # Derive state multiple times
    state1 = derive_job_lifecycle_state(events, None)
    state2 = derive_job_lifecycle_state(events, None)
    state3 = derive_job_lifecycle_state(events, None)
    
    assert state1 == state2 == state3 == JobLifecycleState.RUNNING


def test_lifecycle_derivation_order_independence():
    """Same events in same order always produce same state."""
    events_a = [
        create_event(ExecutionEventType.JOB_CREATED),
        create_event(ExecutionEventType.VALIDATION_STARTED),
        create_event(ExecutionEventType.VALIDATION_PASSED),
        create_event(ExecutionEventType.EXECUTION_STARTED),
    ]
    
    events_b = [
        create_event(ExecutionEventType.JOB_CREATED),
        create_event(ExecutionEventType.VALIDATION_STARTED),
        create_event(ExecutionEventType.VALIDATION_PASSED),
        create_event(ExecutionEventType.EXECUTION_STARTED),
    ]
    
    state_a = derive_job_lifecycle_state(events_a, None)
    state_b = derive_job_lifecycle_state(events_b, None)
    
    assert state_a == state_b == JobLifecycleState.RUNNING


# =============================================================================
# State Transition Tests: Verify correct transitions
# =============================================================================

def test_lifecycle_transition_idle_to_queued():
    """Job transitions from IDLE to QUEUED on creation."""
    # IDLE
    events: List[ExecutionEvent] = []
    assert derive_job_lifecycle_state(events, None) == JobLifecycleState.IDLE
    
    # QUEUED
    events.append(create_event(ExecutionEventType.JOB_CREATED))
    assert derive_job_lifecycle_state(events, None) == JobLifecycleState.QUEUED


def test_lifecycle_transition_queued_to_validating():
    """Job transitions from QUEUED to VALIDATING on validation start."""
    events = [create_event(ExecutionEventType.JOB_CREATED)]
    assert derive_job_lifecycle_state(events, None) == JobLifecycleState.QUEUED
    
    events.append(create_event(ExecutionEventType.VALIDATION_STARTED))
    assert derive_job_lifecycle_state(events, None) == JobLifecycleState.VALIDATING


def test_lifecycle_transition_validating_to_running():
    """Job transitions from VALIDATING to RUNNING after validation."""
    events = [
        create_event(ExecutionEventType.JOB_CREATED),
        create_event(ExecutionEventType.VALIDATION_STARTED),
    ]
    assert derive_job_lifecycle_state(events, None) == JobLifecycleState.VALIDATING
    
    events.append(create_event(ExecutionEventType.VALIDATION_PASSED))
    events.append(create_event(ExecutionEventType.EXECUTION_STARTED))
    assert derive_job_lifecycle_state(events, None) == JobLifecycleState.RUNNING


def test_lifecycle_transition_running_to_complete():
    """Job transitions from RUNNING to COMPLETE on successful completion."""
    events = [
        create_event(ExecutionEventType.JOB_CREATED),
        create_event(ExecutionEventType.EXECUTION_STARTED),
    ]
    assert derive_job_lifecycle_state(events, None) == JobLifecycleState.RUNNING
    
    events.append(create_event(ExecutionEventType.EXECUTION_COMPLETED))
    outcome = create_outcome(JobOutcomeState.COMPLETE)
    assert derive_job_lifecycle_state(events, outcome) == JobLifecycleState.COMPLETE


def test_lifecycle_transition_running_to_partial():
    """Job transitions from RUNNING to PARTIAL on mixed completion."""
    events = [
        create_event(ExecutionEventType.JOB_CREATED),
        create_event(ExecutionEventType.EXECUTION_STARTED),
        create_event(ExecutionEventType.EXECUTION_COMPLETED),
    ]
    outcome = create_outcome(JobOutcomeState.PARTIAL, success_clips=3, failed_clips=2)
    assert derive_job_lifecycle_state(events, outcome) == JobLifecycleState.PARTIAL


def test_lifecycle_transition_running_to_failed():
    """Job transitions from RUNNING to FAILED on execution failure."""
    events = [
        create_event(ExecutionEventType.JOB_CREATED),
        create_event(ExecutionEventType.EXECUTION_STARTED),
    ]
    assert derive_job_lifecycle_state(events, None) == JobLifecycleState.RUNNING
    
    events.append(create_event(ExecutionEventType.EXECUTION_FAILED))
    assert derive_job_lifecycle_state(events, None) == JobLifecycleState.FAILED


def test_lifecycle_transition_validating_to_blocked():
    """Job transitions from VALIDATING to BLOCKED on validation failure."""
    events = [
        create_event(ExecutionEventType.JOB_CREATED),
        create_event(ExecutionEventType.VALIDATION_STARTED),
    ]
    assert derive_job_lifecycle_state(events, None) == JobLifecycleState.VALIDATING
    
    events.append(create_event(ExecutionEventType.VALIDATION_FAILED))
    assert derive_job_lifecycle_state(events, None) == JobLifecycleState.BLOCKED


def test_lifecycle_transition_running_to_cancelled():
    """Job transitions from RUNNING to CANCELLED on cancellation."""
    events = [
        create_event(ExecutionEventType.JOB_CREATED),
        create_event(ExecutionEventType.EXECUTION_STARTED),
    ]
    assert derive_job_lifecycle_state(events, None) == JobLifecycleState.RUNNING
    
    events.append(create_event(ExecutionEventType.EXECUTION_CANCELLED))
    assert derive_job_lifecycle_state(events, None) == JobLifecycleState.CANCELLED


# =============================================================================
# Terminal State Tests: Verify terminal states are sticky
# =============================================================================

def test_lifecycle_cancelled_is_terminal():
    """CANCELLED state overrides other events."""
    events = [
        create_event(ExecutionEventType.JOB_CREATED),
        create_event(ExecutionEventType.EXECUTION_STARTED),
        create_event(ExecutionEventType.EXECUTION_CANCELLED),
        create_event(ExecutionEventType.EXECUTION_COMPLETED),  # Should be ignored
    ]
    state = derive_job_lifecycle_state(events, None)
    assert state == JobLifecycleState.CANCELLED


def test_lifecycle_blocked_is_terminal():
    """BLOCKED state prevents execution."""
    events = [
        create_event(ExecutionEventType.JOB_CREATED),
        create_event(ExecutionEventType.VALIDATION_STARTED),
        create_event(ExecutionEventType.VALIDATION_FAILED),
        create_event(ExecutionEventType.EXECUTION_STARTED),  # Should be ignored
    ]
    state = derive_job_lifecycle_state(events, None)
    assert state == JobLifecycleState.BLOCKED


# =============================================================================
# Edge Case Tests: Handle unusual but valid scenarios
# =============================================================================

def test_lifecycle_empty_events_is_idle():
    """Empty event list results in IDLE state."""
    state = derive_job_lifecycle_state([], None)
    assert state == JobLifecycleState.IDLE


def test_lifecycle_completed_without_outcome_defaults_to_complete():
    """Completion without outcome assumes COMPLETE (defensive)."""
    events = [
        create_event(ExecutionEventType.EXECUTION_STARTED),
        create_event(ExecutionEventType.EXECUTION_COMPLETED),
    ]
    state = derive_job_lifecycle_state(events, None)
    assert state == JobLifecycleState.COMPLETE


def test_lifecycle_skipped_validation_goes_to_running():
    """Job can skip validation and go straight to running."""
    events = [
        create_event(ExecutionEventType.JOB_CREATED),
        create_event(ExecutionEventType.EXECUTION_STARTED),
    ]
    state = derive_job_lifecycle_state(events, None)
    assert state == JobLifecycleState.RUNNING


def test_lifecycle_validation_passed_but_not_started_is_queued():
    """Validation passed but execution not started is still QUEUED."""
    events = [
        create_event(ExecutionEventType.JOB_CREATED),
        create_event(ExecutionEventType.VALIDATION_STARTED),
        create_event(ExecutionEventType.VALIDATION_PASSED),
    ]
    state = derive_job_lifecycle_state(events, None)
    assert state == JobLifecycleState.QUEUED


def test_lifecycle_clip_events_do_not_affect_job_state():
    """Clip-level events do not change job-level lifecycle state."""
    events = [
        create_event(ExecutionEventType.JOB_CREATED),
        create_event(ExecutionEventType.EXECUTION_STARTED),
        create_event(ExecutionEventType.CLIP_QUEUED, clip_id="clip_001"),
        create_event(ExecutionEventType.CLIP_STARTED, clip_id="clip_001"),
        create_event(ExecutionEventType.CLIP_COMPLETED, clip_id="clip_001"),
    ]
    state = derive_job_lifecycle_state(events, None)
    assert state == JobLifecycleState.RUNNING


# =============================================================================
# Outcome Mapping Tests: Verify outcome-to-lifecycle mapping
# =============================================================================

def test_lifecycle_outcome_complete_maps_to_complete():
    """JobOutcomeState.COMPLETE maps to JobLifecycleState.COMPLETE."""
    events = [create_event(ExecutionEventType.EXECUTION_COMPLETED)]
    outcome = create_outcome(JobOutcomeState.COMPLETE)
    state = derive_job_lifecycle_state(events, outcome)
    assert state == JobLifecycleState.COMPLETE


def test_lifecycle_outcome_partial_maps_to_partial():
    """JobOutcomeState.PARTIAL maps to JobLifecycleState.PARTIAL."""
    events = [create_event(ExecutionEventType.EXECUTION_COMPLETED)]
    outcome = create_outcome(JobOutcomeState.PARTIAL)
    state = derive_job_lifecycle_state(events, outcome)
    assert state == JobLifecycleState.PARTIAL


def test_lifecycle_outcome_failed_maps_to_failed():
    """JobOutcomeState.FAILED maps to JobLifecycleState.FAILED."""
    events = [create_event(ExecutionEventType.EXECUTION_COMPLETED)]
    outcome = create_outcome(JobOutcomeState.FAILED)
    state = derive_job_lifecycle_state(events, outcome)
    assert state == JobLifecycleState.FAILED


def test_lifecycle_outcome_blocked_maps_to_blocked():
    """JobOutcomeState.BLOCKED maps to JobLifecycleState.BLOCKED."""
    events = [create_event(ExecutionEventType.EXECUTION_COMPLETED)]
    outcome = create_outcome(JobOutcomeState.BLOCKED)
    state = derive_job_lifecycle_state(events, outcome)
    assert state == JobLifecycleState.BLOCKED


# =============================================================================
# No Side Effects Tests: Verify pure function behavior
# =============================================================================

def test_lifecycle_derivation_does_not_mutate_events():
    """Deriving lifecycle state does not modify input events."""
    events = [
        create_event(ExecutionEventType.JOB_CREATED),
        create_event(ExecutionEventType.EXECUTION_STARTED),
    ]
    
    original_event_count = len(events)
    original_first_event_type = events[0].event_type
    
    derive_job_lifecycle_state(events, None)
    
    assert len(events) == original_event_count
    assert events[0].event_type == original_first_event_type


def test_lifecycle_derivation_does_not_mutate_outcome():
    """Deriving lifecycle state does not modify input outcome."""
    events = [create_event(ExecutionEventType.EXECUTION_COMPLETED)]
    outcome = create_outcome(JobOutcomeState.COMPLETE)
    
    original_job_state = outcome.job_state
    original_total_clips = outcome.total_clips
    
    derive_job_lifecycle_state(events, outcome)
    
    assert outcome.job_state == original_job_state
    assert outcome.total_clips == original_total_clips


# =============================================================================
# Performance Tests: Verify fast execution
# =============================================================================

def test_lifecycle_derivation_is_fast():
    """Deriving lifecycle state completes in <1ms."""
    import time
    
    events = [
        create_event(ExecutionEventType.JOB_CREATED),
        create_event(ExecutionEventType.VALIDATION_STARTED),
        create_event(ExecutionEventType.VALIDATION_PASSED),
        create_event(ExecutionEventType.EXECUTION_STARTED),
    ] + [
        create_event(ExecutionEventType.CLIP_STARTED, clip_id=f"clip_{i}")
        for i in range(100)
    ]
    
    start = time.perf_counter()
    derive_job_lifecycle_state(events, None)
    elapsed = time.perf_counter() - start
    
    # Should complete in <1ms even with 100+ events
    assert elapsed < 0.001


# =============================================================================
# Documentation Tests: Verify examples from docstring
# =============================================================================

def test_lifecycle_derivation_example_no_events():
    """Example from docstring: No events → IDLE."""
    state = derive_job_lifecycle_state([], None)
    assert state == JobLifecycleState.IDLE


def test_lifecycle_derivation_example_validation_started():
    """Example from docstring: VALIDATION_STARTED but no result → VALIDATING."""
    events = [create_event(ExecutionEventType.VALIDATION_STARTED)]
    state = derive_job_lifecycle_state(events, None)
    assert state == JobLifecycleState.VALIDATING


def test_lifecycle_derivation_example_validation_failed():
    """Example from docstring: VALIDATION_FAILED → BLOCKED."""
    events = [create_event(ExecutionEventType.VALIDATION_FAILED)]
    state = derive_job_lifecycle_state(events, None)
    assert state == JobLifecycleState.BLOCKED


def test_lifecycle_derivation_example_execution_started():
    """Example from docstring: EXECUTION_STARTED but no completion → RUNNING."""
    events = [create_event(ExecutionEventType.EXECUTION_STARTED)]
    state = derive_job_lifecycle_state(events, None)
    assert state == JobLifecycleState.RUNNING


def test_lifecycle_derivation_example_execution_cancelled():
    """Example from docstring: EXECUTION_CANCELLED → CANCELLED."""
    events = [create_event(ExecutionEventType.EXECUTION_CANCELLED)]
    state = derive_job_lifecycle_state(events, None)
    assert state == JobLifecycleState.CANCELLED


def test_lifecycle_derivation_example_execution_completed_complete():
    """Example from docstring: EXECUTION_COMPLETED + COMPLETE outcome → COMPLETE."""
    events = [create_event(ExecutionEventType.EXECUTION_COMPLETED)]
    outcome = create_outcome(JobOutcomeState.COMPLETE)
    state = derive_job_lifecycle_state(events, outcome)
    assert state == JobLifecycleState.COMPLETE


def test_lifecycle_derivation_example_execution_completed_partial():
    """Example from docstring: EXECUTION_COMPLETED + PARTIAL outcome → PARTIAL."""
    events = [create_event(ExecutionEventType.EXECUTION_COMPLETED)]
    outcome = create_outcome(JobOutcomeState.PARTIAL)
    state = derive_job_lifecycle_state(events, outcome)
    assert state == JobLifecycleState.PARTIAL


def test_lifecycle_derivation_example_execution_failed():
    """Example from docstring: EXECUTION_FAILED → FAILED."""
    events = [create_event(ExecutionEventType.EXECUTION_FAILED)]
    state = derive_job_lifecycle_state(events, None)
    assert state == JobLifecycleState.FAILED


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
