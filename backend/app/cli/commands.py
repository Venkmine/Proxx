"""
CLI command implementations for explicit job control.

Phase 13: All commands enforce explicit operator intent.

Commands:
- resume_job: Resume RECOVERY_REQUIRED or PAUSED jobs
- retry_failed_clips: Retry only FAILED clips
- cancel_job: Cancel jobs safely
- rebind_preset: Rebind presets to jobs

No automatic actions. No silent mutations. Only explicit intent.
"""

from pathlib import Path
from typing import Optional
import logging

from ..jobs.models import Job, JobStatus, TaskStatus
from ..jobs.engine import JobEngine
from ..jobs.registry import JobRegistry
from ..jobs.bindings import JobPresetBindingRegistry
from ..presets.registry import PresetRegistry
from ..resolve.validation import validate_resolve_capability
from .errors import ValidationError, ConfirmationDenied

logger = logging.getLogger(__name__)


def resume_job(
    job_id: str,
    job_registry: JobRegistry,
    binding_registry: JobPresetBindingRegistry,
    preset_registry: PresetRegistry,
    job_engine: JobEngine,
    output_base_dir: Optional[str] = None,
    require_confirmation: bool = True,
) -> None:
    """
    Resume a RECOVERY_REQUIRED or PAUSED job.
    
    Phase 13: Explicit operator action required for recovery.
    
    Validation:
    - Job must be in RECOVERY_REQUIRED or PAUSED state
    - Resolve must be available
    - Preset binding must exist
    - Output directory must be writable
    
    Args:
        job_id: Job identifier
        job_registry: Job registry instance
        binding_registry: Preset binding registry
        preset_registry: Preset registry for validation
        job_engine: Job engine for execution
        output_base_dir: Optional output directory override
        require_confirmation: Whether to require operator confirmation
        
    Raises:
        ValidationError: If validation fails
        ConfirmationDenied: If operator denies confirmation
    """
    # Retrieve job
    job = job_registry.get_job(job_id)
    if not job:
        raise ValidationError(f"Job not found: {job_id}")
    
    # Validate job status
    if job.status not in (JobStatus.RECOVERY_REQUIRED, JobStatus.PAUSED):
        raise ValidationError(
            f"Job {job_id} cannot be resumed. "
            f"Current status: {job.status.value}. "
            f"Only RECOVERY_REQUIRED or PAUSED jobs can be resumed."
        )
    
    # Validate Resolve availability
    capability = validate_resolve_capability()
    if not capability.is_available:
        raise ValidationError(
            f"Resolve is not available: {capability.failure_reason}"
        )
    
    # Validate preset binding exists
    preset_id = binding_registry.get_preset_id(job_id)
    if not preset_id:
        raise ValidationError(
            f"No preset bound to job {job_id}. "
            f"Use 'proxx rebind' to bind a preset before resuming."
        )
    
    # Validate preset exists
    preset = preset_registry.get_global_preset(preset_id)
    if not preset:
        raise ValidationError(
            f"Bound preset '{preset_id}' not found in registry. "
            f"Preset may have been deleted."
        )
    
    # Validate output directory is writable
    if output_base_dir:
        output_path = Path(output_base_dir)
        if not output_path.exists():
            raise ValidationError(f"Output directory does not exist: {output_base_dir}")
        if not output_path.is_dir():
            raise ValidationError(f"Output path is not a directory: {output_base_dir}")
        # Test writability
        test_file = output_path / ".proxx_write_test"
        try:
            test_file.touch()
            test_file.unlink()
        except Exception as e:
            raise ValidationError(f"Output directory is not writable: {e}")
    
    # Identify which clips will execute
    queued_clips = [task for task in job.tasks if task.status == TaskStatus.QUEUED]
    running_clips = [task for task in job.tasks if task.status == TaskStatus.RUNNING]
    
    # Print execution plan
    print(f"\n=== Resume Job: {job_id} ===")
    print(f"Current status: {job.status.value}")
    print(f"Bound preset: {preset_id}")
    print(f"Output directory: {output_base_dir or 'current working directory'}")
    print(f"\nClips to execute:")
    print(f"  - Running (will continue): {len(running_clips)}")
    print(f"  - Queued (will start): {len(queued_clips)}")
    
    if running_clips:
        print("\nRunning clips:")
        for task in running_clips:
            print(f"  - {task.source_path}")
    
    if queued_clips:
        print("\nQueued clips:")
        for task in queued_clips:
            print(f"  - {task.source_path}")
    
    print(f"\nCompleted clips will NOT be re-run.")
    print(f"Total clips: {job.total_tasks}")
    print(f"Already completed: {job.completed_count}")
    print(f"Already failed: {job.failed_count}")
    print(f"Already skipped: {job.skipped_count}")
    
    # Require confirmation
    if require_confirmation:
        response = input("\nProceed with resume? [y/N]: ").strip().lower()
        if response != 'y':
            raise ConfirmationDenied()
    
    # Execute resume
    logger.info(f"Resuming job {job_id}")
    job_engine.resume_job(job)
    
    # Save job state if persistence configured
    if job_registry._persistence:
        job_registry.save_job(job)
    
    # Execute job
    job_engine.execute_job(
        job,
        preset_registry=preset_registry,
        output_base_dir=output_base_dir,
    )
    
    print(f"\n✓ Job {job_id} execution completed")
    print(f"Final status: {job.status.value}")


def retry_failed_clips(
    job_id: str,
    job_registry: JobRegistry,
    binding_registry: JobPresetBindingRegistry,
    preset_registry: PresetRegistry,
    job_engine: JobEngine,
    output_base_dir: Optional[str] = None,
    require_confirmation: bool = True,
) -> None:
    """
    Retry only FAILED clips in a job.
    
    Phase 13: COMPLETED clips are NEVER re-run.
    
    Rules:
    - Only FAILED clips are queued for retry
    - COMPLETED clips remain untouched
    - Output collision handling is explicit (fails if exists)
    - Job status reflects partial retry outcomes
    
    Args:
        job_id: Job identifier
        job_registry: Job registry instance
        binding_registry: Preset binding registry
        preset_registry: Preset registry for validation
        job_engine: Job engine for execution
        output_base_dir: Optional output directory override
        require_confirmation: Whether to require operator confirmation
        
    Raises:
        ValidationError: If validation fails
        ConfirmationDenied: If operator denies confirmation
    """
    # Retrieve job
    job = job_registry.get_job(job_id)
    if not job:
        raise ValidationError(f"Job not found: {job_id}")
    
    # Validate preset binding exists
    preset_id = binding_registry.get_preset_id(job_id)
    if not preset_id:
        raise ValidationError(
            f"No preset bound to job {job_id}. "
            f"Use 'proxx rebind' to bind a preset before retrying."
        )
    
    # Validate preset exists
    preset = preset_registry.get_global_preset(preset_id)
    if not preset:
        raise ValidationError(
            f"Bound preset '{preset_id}' not found in registry."
        )
    
    # Identify failed clips
    failed_clips = [task for task in job.tasks if task.status == TaskStatus.FAILED]
    
    if not failed_clips:
        print(f"No failed clips to retry in job {job_id}")
        return
    
    # Print retry plan
    print(f"\n=== Retry Failed Clips: {job_id} ===")
    print(f"Current status: {job.status.value}")
    print(f"Bound preset: {preset_id}")
    print(f"Output directory: {output_base_dir or 'current working directory'}")
    print(f"\nFailed clips to retry ({len(failed_clips)}):")
    for task in failed_clips:
        print(f"  - {task.source_path}")
        if task.failure_reason:
            print(f"    Reason: {task.failure_reason}")
    
    print(f"\nCOMPLETED clips will NOT be re-run.")
    print(f"Completed: {job.completed_count}, Skipped: {job.skipped_count}")
    
    # Require confirmation
    if require_confirmation:
        response = input("\nProceed with retry? [y/N]: ").strip().lower()
        if response != 'y':
            raise ConfirmationDenied()
    
    # Execute retry via job engine
    logger.info(f"Retrying {len(failed_clips)} failed clips in job {job_id}")
    
    job_engine.retry_failed_clips(
        job,
        preset_registry=preset_registry,
        output_base_dir=output_base_dir,
    )
    
    # Save job state if persistence configured
    if job_registry._persistence:
        job_registry.save_job(job)
    
    print(f"\n✓ Retry completed for job {job_id}")
    print(f"Final status: {job.status.value}")


def cancel_job(
    job_id: str,
    job_registry: JobRegistry,
    job_engine: JobEngine,
    require_confirmation: bool = True,
) -> None:
    """
    Cancel a job safely.
    
    Phase 13: Cancellation is operator intent, not failure.
    
    Rules:
    - If RUNNING: allows current clip to finish
    - Remaining QUEUED clips marked SKIPPED with reason="cancelled"
    - Job status becomes CANCELLED (terminal)
    - CANCELLED jobs cannot be resumed
    
    Args:
        job_id: Job identifier
        job_registry: Job registry instance
        job_engine: Job engine for cancellation
        require_confirmation: Whether to require operator confirmation
        
    Raises:
        ValidationError: If validation fails
        ConfirmationDenied: If operator denies confirmation
    """
    # Retrieve job
    job = job_registry.get_job(job_id)
    if not job:
        raise ValidationError(f"Job not found: {job_id}")
    
    # Validate job can be cancelled
    if job.status in (JobStatus.COMPLETED, JobStatus.COMPLETED_WITH_WARNINGS, JobStatus.FAILED, JobStatus.CANCELLED):
        raise ValidationError(
            f"Job {job_id} cannot be cancelled. "
            f"Current status: {job.status.value} (terminal state)."
        )
    
    # Count clips that will be affected
    queued_clips = [task for task in job.tasks if task.status == TaskStatus.QUEUED]
    running_clips = [task for task in job.tasks if task.status == TaskStatus.RUNNING]
    
    # Print cancellation plan
    print(f"\n=== Cancel Job: {job_id} ===")
    print(f"Current status: {job.status.value}")
    
    if running_clips:
        print(f"\nRunning clips will finish:")
        for task in running_clips:
            print(f"  - {task.source_path}")
    
    if queued_clips:
        print(f"\nQueued clips will be marked SKIPPED ({len(queued_clips)}):")
        for task in queued_clips:
            print(f"  - {task.source_path}")
    else:
        print("\nNo queued clips to cancel.")
    
    print(f"\nCompleted clips: {job.completed_count}")
    print(f"This operation CANNOT be undone.")
    
    # Require confirmation
    if require_confirmation:
        response = input("\nProceed with cancellation? [y/N]: ").strip().lower()
        if response != 'y':
            raise ConfirmationDenied()
    
    # Execute cancellation
    logger.info(f"Cancelling job {job_id}")
    job_engine.cancel_job(job, reason="Cancelled by operator")
    
    # Save job state if persistence configured
    if job_registry._persistence:
        job_registry.save_job(job)
    
    print(f"\n✓ Job {job_id} cancelled")
    print(f"Final status: {job.status.value}")


def rebind_preset(
    job_id: str,
    preset_id: str,
    job_registry: JobRegistry,
    binding_registry: JobPresetBindingRegistry,
    preset_registry: PresetRegistry,
    require_confirmation: bool = True,
) -> None:
    """
    Rebind a preset to a job.
    
    Phase 13: Explicit preset rebinding for PENDING or RECOVERY_REQUIRED jobs.
    
    Rules:
    - Only allowed for PENDING or RECOVERY_REQUIRED jobs
    - Preset must exist and validate
    - Previous binding is overwritten explicitly
    - Binding is persisted immediately
    
    Args:
        job_id: Job identifier
        preset_id: New preset identifier
        job_registry: Job registry instance
        binding_registry: Preset binding registry
        preset_registry: Preset registry for validation
        require_confirmation: Whether to require operator confirmation
        
    Raises:
        ValidationError: If validation fails
        ConfirmationDenied: If operator denies confirmation
    """
    # Retrieve job
    job = job_registry.get_job(job_id)
    if not job:
        raise ValidationError(f"Job not found: {job_id}")
    
    # Validate job status
    if job.status not in (JobStatus.PENDING, JobStatus.RECOVERY_REQUIRED):
        raise ValidationError(
            f"Job {job_id} cannot be rebound. "
            f"Current status: {job.status.value}. "
            f"Only PENDING or RECOVERY_REQUIRED jobs can be rebound."
        )
    
    # Validate preset exists
    preset = preset_registry.get_global_preset(preset_id)
    if not preset:
        raise ValidationError(f"Preset '{preset_id}' not found in registry.")
    
    # Check for existing binding
    current_preset_id = binding_registry.get_preset_id(job_id)
    
    # Print rebinding plan
    print(f"\n=== Rebind Preset: {job_id} ===")
    print(f"Job status: {job.status.value}")
    if current_preset_id:
        print(f"Current preset: {current_preset_id}")
    else:
        print(f"Current preset: <none>")
    print(f"New preset: {preset_id}")
    
    if current_preset_id:
        print(f"\nThis will OVERWRITE the existing binding.")
    
    # Require confirmation
    if require_confirmation:
        response = input("\nProceed with rebinding? [y/N]: ").strip().lower()
        if response != 'y':
            raise ConfirmationDenied()
    
    # Execute rebinding
    logger.info(f"Rebinding job {job_id} to preset {preset_id}")
    binding_registry.bind_preset(job_id, preset_id)
    
    # Persist binding immediately
    if binding_registry._persistence:
        binding_registry.save_binding(job_id)
    
    print(f"\n✓ Job {job_id} rebound to preset {preset_id}")
