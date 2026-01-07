"""
Job Lifecycle State Layer

Derives a stable, deterministic job state from execution truth for UI display.

Purpose:
--------
Project existing execution events and outcomes into a single lifecycle state
that answers: "What state is this job in RIGHT NOW?"

Design Rules (INTENT.md compliant):
-----------------------------------
- DERIVED ONLY - never stored as primary state
- READ-ONLY - never influences execution flow
- DETERMINISTIC - same inputs always produce same state
- NO MUTATION - pure function, no side effects
- NO EXECUTION INSPECTION - relies only on events + outcome

This is NOT:
- A state machine
- An execution controller
- A source of truth (events/outcomes are truth)
- A retry mechanism

State derivation happens on-demand for diagnostics and UI projection.
"""

from enum import Enum
from typing import List, Optional
from backend.execution.executionEvents import ExecutionEvent, ExecutionEventType
from backend.execution.failureTypes import ExecutionOutcome, JobOutcomeState


class JobLifecycleState(str, Enum):
    """
    Job lifecycle states derived from execution events and outcome.
    
    These represent the current phase of a job's lifecycle for UI display.
    They are computed on-demand, not stored.
    
    State Definitions:
    ------------------
    IDLE: Job created but not yet queued for execution
    QUEUED: Job is waiting to begin validation/execution  
    VALIDATING: Job is undergoing pre-execution validation
    RUNNING: Job execution is in progress (at least one clip processing)
    COMPLETE: Job finished successfully, all clips succeeded
    PARTIAL: Job finished with some clips succeeded, some failed
    FAILED: Job finished with all clips failed or job-level failure
    BLOCKED: Job cannot execute due to validation failure
    CANCELLED: Job was explicitly cancelled during execution
    """
    
    IDLE = "IDLE"
    """Job created but execution has not started"""
    
    QUEUED = "QUEUED"
    """Job is queued and waiting for execution to begin"""
    
    VALIDATING = "VALIDATING"
    """Job is undergoing validation checks before execution"""
    
    RUNNING = "RUNNING"
    """Job is actively executing (clips are being processed)"""
    
    COMPLETE = "COMPLETE"
    """Job completed successfully - all clips succeeded"""
    
    PARTIAL = "PARTIAL"
    """Job completed with mixed results - some clips succeeded, some failed"""
    
    FAILED = "FAILED"
    """Job failed - all clips failed or job-level failure occurred"""
    
    BLOCKED = "BLOCKED"
    """Job blocked from execution due to validation failure"""
    
    CANCELLED = "CANCELLED"
    """Job was cancelled during execution"""


def derive_job_lifecycle_state(
    execution_events: List[ExecutionEvent],
    execution_outcome: Optional[ExecutionOutcome] = None,
) -> JobLifecycleState:
    """
    Derive job lifecycle state from execution events and outcome.
    
    This is a PURE FUNCTION - no side effects, no mutations.
    Given the same inputs, it always produces the same output.
    
    Derivation Logic:
    -----------------
    1. Check for terminal states first (cancelled, completed, failed, blocked)
    2. Check for active states (running, validating)
    3. Fall back to queued/idle
    
    Args:
        execution_events: Ordered list of execution events (chronological)
        execution_outcome: Optional outcome summary (if execution completed)
        
    Returns:
        JobLifecycleState representing current job phase
        
    Examples:
        No events → IDLE
        VALIDATION_STARTED but no result → VALIDATING
        VALIDATION_FAILED → BLOCKED
        EXECUTION_STARTED but no completion → RUNNING
        EXECUTION_CANCELLED → CANCELLED
        EXECUTION_COMPLETED + COMPLETE outcome → COMPLETE
        EXECUTION_COMPLETED + PARTIAL outcome → PARTIAL
        EXECUTION_COMPLETED + FAILED outcome → FAILED
        EXECUTION_FAILED → FAILED
    """
    
    # Build event type set for fast lookup
    event_types = {event.event_type for event in execution_events}
    
    # Terminal state: Cancelled
    if ExecutionEventType.EXECUTION_CANCELLED in event_types:
        return JobLifecycleState.CANCELLED
    
    # Terminal state: Validation blocked
    if ExecutionEventType.VALIDATION_FAILED in event_types:
        return JobLifecycleState.BLOCKED
    
    # Terminal state: Execution failed (job-level)
    if ExecutionEventType.EXECUTION_FAILED in event_types:
        return JobLifecycleState.FAILED
    
    # Terminal state: Execution completed - use outcome to determine state
    if ExecutionEventType.EXECUTION_COMPLETED in event_types:
        if execution_outcome is None:
            # Completed but no outcome available - default to COMPLETE
            # (outcome should always be present, but defensive)
            return JobLifecycleState.COMPLETE
        
        # Map outcome state to lifecycle state
        if execution_outcome.job_state == JobOutcomeState.COMPLETE:
            return JobLifecycleState.COMPLETE
        elif execution_outcome.job_state == JobOutcomeState.PARTIAL:
            return JobLifecycleState.PARTIAL
        elif execution_outcome.job_state == JobOutcomeState.FAILED:
            return JobLifecycleState.FAILED
        elif execution_outcome.job_state == JobOutcomeState.BLOCKED:
            return JobLifecycleState.BLOCKED
        else:
            # Unknown outcome state - default to COMPLETE
            return JobLifecycleState.COMPLETE
    
    # Active state: Execution in progress
    if ExecutionEventType.EXECUTION_STARTED in event_types:
        # Check if paused (future: could derive PAUSED state)
        # For now, treat paused as still RUNNING
        return JobLifecycleState.RUNNING
    
    # Active state: Validation in progress
    if ExecutionEventType.VALIDATION_STARTED in event_types:
        # Started validation but no result yet
        if ExecutionEventType.VALIDATION_PASSED not in event_types:
            return JobLifecycleState.VALIDATING
        # If validation passed, fall through to check execution state
    
    # Pre-execution state: Job created and waiting
    if ExecutionEventType.JOB_CREATED in event_types:
        return JobLifecycleState.QUEUED
    
    # Default: No events recorded yet (should be rare)
    return JobLifecycleState.IDLE
