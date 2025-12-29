"""
V2 Execution Adapter - Single authoritative entrypoint for JobSpec execution.

This module provides the ONLY way to execute a JobSpec in V2 Phase 1.
It serves as the bridge between JobSpec and execution engines.

Design Principles (V2 IMPLEMENTATION SLICE 2):
==============================================
1. Accepts IMMUTABLE JobSpec (no mutations)
2. Deterministic engine selection (FFmpeg vs Resolve)
3. Explicit validation before execution
4. Structured ExecutionResult with full audit trail
5. NO retries, NO concurrency, NO UI state
6. Boring, explicit, auditable

Engine Routing Rules:
=====================
- RAW formats (ARRIRAW, REDCODE, BRAW) → Resolve engine
- Standard formats (H.264, ProRes, DNxHD) → FFmpeg engine
- Unknown formats → HARD ERROR (no fallback)
- Mixed jobs (RAW + non-RAW) → HARD ERROR (no processing)

Output Verification:
====================
Before marking COMPLETED:
- Output file MUST exist
- Output file MUST be > 0 bytes

Failure if not satisfied.

Part of V2 Phase 1 (Option A: Reliable Proxy Engine)
"""

from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Tuple

import logging

logger = logging.getLogger(__name__)

from job_spec import JobSpec, JobSpecValidationError, JOBSPEC_VERSION
from execution_results import ClipExecutionResult, JobExecutionResult

# Import headless_execute for actual execution logic
from headless_execute import (
    _determine_job_engine,
    _execute_with_ffmpeg,
    _execute_with_resolve,
)

# V2 IMPLEMENTATION SLICE 7: Phase-1 Lock Enforcement
from v2.phase1_lock import assert_phase1_compliance, assert_synchronous_execution


# =============================================================================
# Core Execution Adapter
# =============================================================================

def execute_jobspec(jobspec: JobSpec) -> JobExecutionResult:
    """
    Execute a JobSpec using the appropriate execution engine.
    
    This is the SINGLE, AUTHORITATIVE entrypoint for JobSpec execution in V2.
    All execution must flow through this function.
    
    Execution Flow:
    ---------------
    1. Validate JobSpec (fail-fast if invalid)
    2. Determine execution engine (FFmpeg or Resolve)
    3. Validate proxy profile matches engine
    4. Validate Resolve preset (if Resolve engine)
    5. Execute job with selected engine
    6. Return JobExecutionResult with metadata
    
    Engine Selection:
    -----------------
    - Based ONLY on source file formats
    - RAW formats → Resolve
    - Standard formats → FFmpeg
    - NO user override, NO heuristics, NO defaults
    
    Validation Failures:
    --------------------
    - Occur BEFORE execution
    - Return FAILED JobExecutionResult
    - NO engine invoked
    - validation_error field populated
    
    Execution Failures:
    -------------------
    - Engine returns non-zero / error
    - Partial results preserved in clips[]
    - Explicit failure_reason in ClipExecutionResult
    - NO retries, NO recovery, NO masking
    
    Output Verification:
    --------------------
    - Enforced PER CLIP before marking COMPLETED
    - Output file must exist
    - Output file must be > 0 bytes
    - Failure here counts as execution failure
    
    Args:
        jobspec: A validated JobSpec instance (will be re-validated)
        
    Returns:
        JobExecutionResult containing:
        - All ClipExecutionResults (in order)
        - Final job status (COMPLETED, FAILED, PARTIAL)
        - Engine selection metadata
        - Proxy profile metadata
        - Validation errors (if any)
        
    Raises:
        NOTHING. All failures are captured in JobExecutionResult.
        
    Guarantees:
    -----------
    1. JobSpec is NEVER mutated
    2. Engine selection is deterministic (same JobSpec → same engine)
    3. Validation runs before execution (never execute invalid specs)
    4. Output verification is mandatory (no unchecked outputs)
    5. Results contain full audit trail (commands, timing, errors)
    
    FORBIDDEN PATTERNS:
    -------------------
    - NO UI-derived execution logic
    - NO retries
    - NO concurrency
    - NO dynamic profile changes
    - NO mutation of JobSpec
    
    Example:
    --------
        >>> from job_spec import JobSpec
        >>> from execution_adapter import execute_jobspec
        >>> 
        >>> jobspec = JobSpec.from_json_file("my_job.json")
        >>> result = execute_jobspec(jobspec)
        >>> 
        >>> if result.success:
        >>>     print(f"Job completed: {len(result.clips)} clips")
        >>> else:
        >>>     print(f"Job failed: {result.validation_error}")
    """
    started_at = datetime.now(timezone.utc)
    logger.info(f"Starting job execution: job_id={jobspec.job_id}, sources={len(jobspec.sources)}")
    
    # V2 IMPLEMENTATION SLICE 7: Phase-1 Lock Enforcement
    # ----------------------------------------------------
    # Assert that we're in Phase-1 compliant context
    assert_phase1_compliance(
        "execution_adapter.execute_jobspec",
        jobspec_id=jobspec.job_id,
        engine_selection="deterministic",
    )
    
    # Assert synchronous execution (no async/await)
    assert_synchronous_execution()
    
    # STEP 1: Validate JobSpec
    # -------------------------
    # Validation must run BEFORE engine selection.
    # Invalid JobSpecs NEVER reach execution engines.
    try:
        jobspec.validate(check_paths=True)
    except JobSpecValidationError as e:
        # Validation failure: return FAILED with no clips executed
        return JobExecutionResult(
            job_id=jobspec.job_id,
            clips=[],
            final_status="FAILED",
            validation_error=f"JobSpec validation failed: {e}",
            validation_stage="pre-job",
            jobspec_version=JOBSPEC_VERSION,
            started_at=started_at,
            completed_at=datetime.now(timezone.utc),
        )
    
    # STEP 2: Determine Execution Engine
    # -----------------------------------
    # Engine choice based ONLY on source formats.
    # NO user override, NO heuristics, NO fallback.
    engine_name, engine_error = _determine_job_engine(jobspec)
    
    if engine_name:
        logger.info(f"Engine selected: job_id={jobspec.job_id}, engine={engine_name}")
    
    if engine_error:
        # Engine routing failed (mixed job or unsupported format)
        # This is a validation-level failure: don't execute
        return JobExecutionResult(
            job_id=jobspec.job_id,
            clips=[],
            final_status="FAILED",
            validation_error=f"Engine routing failed: {engine_error}",
            validation_stage="pre-job",
            jobspec_version=JOBSPEC_VERSION,
            engine_used=None,  # No engine selected
            started_at=started_at,
            completed_at=datetime.now(timezone.utc),
        )
    
    # STEP 3: Validate Proxy Profile Matches Engine
    # ----------------------------------------------
    # V2 Canonical Proxy Profiles:
    # - FFmpeg jobs MUST use FFmpeg profiles
    # - Resolve jobs MUST use Resolve profiles
    # - Mismatch is a contract violation
    try:
        jobspec.validate_proxy_profile(routes_to_resolve=(engine_name == "resolve"))
    except JobSpecValidationError as e:
        return JobExecutionResult(
            job_id=jobspec.job_id,
            clips=[],
            final_status="FAILED",
            validation_error=f"Proxy profile validation failed: {e}",
            validation_stage="validation",
            jobspec_version=JOBSPEC_VERSION,
            engine_used=engine_name,
            started_at=started_at,
            completed_at=datetime.now(timezone.utc),
        )
    
    # STEP 4: Validate Resolve Preset (if Resolve engine)
    # ----------------------------------------------------
    # V2 Deterministic Preset Contract:
    # - Resolve jobs MUST specify resolve_preset
    # - FFmpeg jobs MUST NOT specify resolve_preset
    try:
        jobspec.validate_resolve_preset(routes_to_resolve=(engine_name == "resolve"))
    except JobSpecValidationError as e:
        return JobExecutionResult(
            job_id=jobspec.job_id,
            clips=[],
            final_status="FAILED",
            validation_error=f"Resolve preset validation failed: {e}",
            validation_stage="validation",
            jobspec_version=JOBSPEC_VERSION,
            engine_used=engine_name,
            started_at=started_at,
            completed_at=datetime.now(timezone.utc),
        )
    
    # STEP 5: Execute with Selected Engine
    # -------------------------------------
    # Dispatch to FFmpeg or Resolve engine based on routing decision.
    logger.info(f"Starting execution: job_id={jobspec.job_id}, engine={engine_name}, proxy_profile={jobspec.proxy_profile}")
    # All execution failures are captured in JobExecutionResult.
    # NO exceptions escape this layer.
    if engine_name == "resolve":
        result = _execute_with_resolve(jobspec, started_at)
    else:
        # Default to FFmpeg for standard formats
        result = _execute_with_ffmpeg(jobspec, started_at)
    
    # STEP 6: Populate Metadata
    # -------------------------
    # Record engine selection and proxy profile for auditability.
    logger.info(f"Execution completed: job_id={jobspec.job_id}, status={result.final_status}, clips={len(result.clips)}")
    result.engine_used = engine_name
    result.proxy_profile_used = jobspec.proxy_profile
    
    # Return complete result with full audit trail
    return result


# =============================================================================
# Validation Helpers (Expose for Testing)
# =============================================================================

def validate_jobspec_for_execution(jobspec: JobSpec) -> Tuple[bool, Optional[str]]:
    """
    Validate a JobSpec for execution without actually executing it.
    
    This is useful for:
    - Pre-flight checks in UI
    - Testing validation logic
    - Queue admission control
    
    Returns:
        Tuple of (is_valid, error_message)
        - (True, None) if JobSpec is valid for execution
        - (False, error_message) if validation fails
        
    Example:
    --------
        >>> valid, error = validate_jobspec_for_execution(jobspec)
        >>> if not valid:
        >>>     print(f"Cannot execute: {error}")
    """
    # Run the same validation as execute_jobspec, but don't execute
    try:
        jobspec.validate(check_paths=True)
    except JobSpecValidationError as e:
        return (False, f"JobSpec validation failed: {e}")
    
    # Check engine routing
    engine_name, engine_error = _determine_job_engine(jobspec)
    if engine_error:
        return (False, f"Engine routing failed: {engine_error}")
    
    # Check proxy profile
    try:
        jobspec.validate_proxy_profile(routes_to_resolve=(engine_name == "resolve"))
    except JobSpecValidationError as e:
        return (False, f"Proxy profile validation failed: {e}")
    
    # Check Resolve preset
    try:
        jobspec.validate_resolve_preset(routes_to_resolve=(engine_name == "resolve"))
    except JobSpecValidationError as e:
        return (False, f"Resolve preset validation failed: {e}")
    
    return (True, None)


def determine_engine(jobspec: JobSpec) -> Tuple[Optional[str], Optional[str]]:
    """
    Determine which execution engine would be used for a JobSpec.
    
    This exposes the engine routing logic for testing and introspection.
    
    Returns:
        Tuple of (engine_name, error_message)
        - ("ffmpeg", None) for FFmpeg-routable jobs
        - ("resolve", None) for Resolve-routable jobs
        - (None, error_message) for invalid jobs
        
    Example:
    --------
        >>> engine, error = determine_engine(jobspec)
        >>> if engine:
        >>>     print(f"Will use {engine} engine")
        >>> else:
        >>>     print(f"Cannot determine engine: {error}")
    """
    return _determine_job_engine(jobspec)
