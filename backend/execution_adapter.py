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

# V2 Resolve Edition Detection
try:
    from v2.resolve_installation import detect_resolve_installation
except ImportError:
    try:
        from backend.v2.resolve_installation import detect_resolve_installation
    except ImportError:
        detect_resolve_installation = None  # type: ignore


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
    logger.info(f"[EXECUTION ADAPTER] Job received: job_id={jobspec.job_id}")
    logger.info(f"[EXECUTION ADAPTER] Sources: {len(jobspec.sources)}")
    logger.info(f"[EXECUTION ADAPTER] Proxy profile: {jobspec.proxy_profile}")
    logger.info(f"[EXECUTION ADAPTER] Output directory: {jobspec.output_directory}")
    
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
    
    # STEP 0: Phase 9A - Explicit Execution Control Enforcement
    # ----------------------------------------------------------
    # Jobs MUST NOT execute unless execution_requested is True.
    # This is BACKEND ENFORCEMENT - never trust the UI alone.
    # This check happens BEFORE all other validation because:
    #   1. A job without execution permission shouldn't even be validated for paths
    #   2. This is a security/intent check, not a validity check
    #   3. The user's explicit decision to NOT run takes priority
    # 
    # This prevents:
    #   - Auto-execution on job creation
    #   - Watch folder auto-execution bypass
    #   - Background execution without user gesture
    #   - Smart defaults that start jobs implicitly
    if not jobspec.execution_requested:
        logger.warning(
            f"[EXECUTION ADAPTER] EXECUTION BLOCKED: job_id={jobspec.job_id} - "
            "execution_requested=False. Jobs require explicit user action to execute."
        )
        return JobExecutionResult(
            job_id=jobspec.job_id,
            clips=[],
            final_status="BLOCKED",
            validation_error=(
                "Job execution not authorized. "
                "Jobs must be explicitly started via user action. "
                "Set execution_requested=True to execute this job."
            ),
            validation_stage="execution-control",
            jobspec_version=JOBSPEC_VERSION,
            started_at=started_at,
            completed_at=datetime.now(timezone.utc),
        )
    
    # STEP 1: Validate JobSpec
    # -------------------------
    # Validation must run BEFORE engine selection.
    # Invalid JobSpecs NEVER reach execution engines.
    logger.info(f"[EXECUTION ADAPTER] Validating JobSpec...")
    try:
        jobspec.validate(check_paths=True)
        logger.info(f"[EXECUTION ADAPTER] JobSpec validation passed")
    except JobSpecValidationError as e:
        # Validation failure: return FAILED with no clips executed
        logger.error(f"[EXECUTION ADAPTER] JobSpec validation failed: {e}")
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
    
    # STEP 1.5: Edition Gating (Resolve Edition Requirement)
    # -------------------------------------------------------
    # Check if this job requires a specific Resolve edition.
    # If requirement doesn't match detected edition, SKIP the job.
    # This is NOT a failure - it's an environment constraint.
    if detect_resolve_installation is not None:
        resolve_info = detect_resolve_installation()
        required_edition = jobspec.requires_resolve_edition
        
        if required_edition == "free" and resolve_info and resolve_info.edition == "studio":
            # Free required but Studio detected - SKIP
            skip_metadata = {
                "reason": "resolve_free_not_installed",
                "detected_resolve_edition": resolve_info.edition,
                "required_resolve_edition": "free",
                "resolve_version": resolve_info.version,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            
            logger.info(
                f"Job skipped: job_id={jobspec.job_id}, "
                f"reason=resolve_free_not_installed, "
                f"detected={resolve_info.edition}, required=free"
            )
            
            return JobExecutionResult(
                job_id=jobspec.job_id,
                clips=[],
                final_status="SKIPPED",
                validation_error=None,
                validation_stage=None,
                jobspec_version=JOBSPEC_VERSION,
                skip_metadata=skip_metadata,
                started_at=started_at,
                completed_at=datetime.now(timezone.utc),
            )
        
        if required_edition == "studio" and resolve_info and resolve_info.edition == "free":
            # Studio required but Free detected - SKIP
            skip_metadata = {
                "reason": "resolve_studio_not_installed",
                "detected_resolve_edition": resolve_info.edition,
                "required_resolve_edition": "studio",
                "resolve_version": resolve_info.version,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            
            logger.info(
                f"Job skipped: job_id={jobspec.job_id}, "
                f"reason=resolve_studio_not_installed, "
                f"detected={resolve_info.edition}, required=studio"
            )
            
            return JobExecutionResult(
                job_id=jobspec.job_id,
                clips=[],
                final_status="SKIPPED",
                validation_error=None,
                validation_stage=None,
                jobspec_version=JOBSPEC_VERSION,
                skip_metadata=skip_metadata,
                started_at=started_at,
                completed_at=datetime.now(timezone.utc),
            )
    
    # STEP 2: Determine Execution Engine
    # -----------------------------------
    # Engine choice based ONLY on source formats.
    # NO user override, NO heuristics, NO fallback.
    # 
    # ENGINE CAPABILITY GATING:
    # - FFmpeg can only process standard codecs (H.264, ProRes, DNxHR)
    # - FFmpeg CANNOT process RAW formats (Sony Venice, RED, ARRI, etc.)
    # - If RAW sources are detected, job MUST route to Resolve or FAIL
    logger.info(f"[EXECUTION ADAPTER] Determining execution engine...")
    engine_name, engine_error = _determine_job_engine(jobspec)
    
    if engine_name:
        logger.info(f"[EXECUTION ADAPTER] Engine selected: {engine_name}")
    
    if engine_error:
        # Engine routing failed (mixed job or unsupported format)
        # This is a validation-level failure: don't execute
        logger.error(f"[EXECUTION ADAPTER] Engine routing FAILED: {engine_error}")
        logger.error(f"[EXECUTION ADAPTER] Job will be rejected - no execution will occur")
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
    
    # STEP 4.5: Resolve Availability Guard (RAW jobs only)
    # -----------------------------------------------------
    # Fail-fast check for Resolve availability BEFORE job execution.
    # This prevents:
    # - Partial task creation
    # - Cascading failures
    # - Mystery errors when Resolve is unreachable
    #
    # Only applies to jobs that route to Resolve.
    # FFmpeg jobs are unaffected.
    if engine_name == "resolve":
        logger.info("[EXECUTION ADAPTER] Checking Resolve availability for RAW job...")
        
        try:
            from v2.engines.resolve_engine import check_resolve_availability
        except ImportError:
            from backend.v2.engines.resolve_engine import check_resolve_availability
        
        availability = check_resolve_availability()
        
        if not availability.available:
            # Resolve is unavailable - fail the job immediately
            # NO task creation, NO retries, NO fallback to FFmpeg
            logger.error(
                f"[EXECUTION ADAPTER] Resolve unavailable for RAW job: "
                f"{availability.reason}"
            )
            logger.error("[EXECUTION ADAPTER] Job rejected - no execution will occur")
            
            error_message = (
                f"Resolve is required for this media but is not available: "
                f"{availability.reason}"
            )
            
            return JobExecutionResult(
                job_id=jobspec.job_id,
                clips=[],
                final_status="FAILED",
                validation_error=error_message,
                validation_stage="resolve_availability",
                jobspec_version=JOBSPEC_VERSION,
                engine_used=engine_name,
                started_at=started_at,
                completed_at=datetime.now(timezone.utc),
            )
        
        logger.info("[EXECUTION ADAPTER] Resolve availability confirmed - proceeding with execution")
    
    # STEP 5: Execute with Selected Engine
    # -------------------------------------
    # Dispatch to FFmpeg or Resolve engine based on routing decision.
    logger.info(f"[EXECUTION ADAPTER] Starting execution with {engine_name} engine")
    logger.info(f"[EXECUTION ADAPTER] Proxy profile: {jobspec.proxy_profile}")
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
    logger.info(f"[EXECUTION ADAPTER] Execution completed: status={result.final_status}, clips={len(result.clips)}")
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
