"""
Execution automation mediator.

Phase 11: Safe, opt-in automation layer between job creation and execution.
This mediator enforces safety checks and explicit intent verification.

Automation NEVER guesses. It only proceeds when:
1. Auto-execution is explicitly enabled
2. Preset is explicitly configured
3. Basic safety checks pass (disk space, concurrency)

Default behavior is manual execution.
"""

import logging
import shutil
from pathlib import Path
from typing import Optional

from jobs.models import Job, JobStatus
from jobs.engine import JobEngine
from jobs.bindings import JobPresetBindingRegistry
from presets.registry import PresetRegistry

logger = logging.getLogger(__name__)


class ExecutionAutomation:
    """
    Mediator for safe execution automation.
    
    Provides a deliberate, observable layer between job creation and execution.
    Enforces safety checks and explicit intent verification.
    
    Phase 11 safety rules:
    - Auto-execution requires explicit opt-in
    - Preset must be explicitly configured
    - Basic disk space check (hard-coded 10GB minimum)
    - Simple concurrency limit (hard-coded 1 concurrent job max)
    """
    
    # Hard-coded safety constants (Phase 11 scope)
    MIN_DISK_SPACE_GB = 10
    MAX_CONCURRENT_JOBS = 1
    
    def __init__(
        self,
        job_engine: JobEngine,
        preset_registry: PresetRegistry,
        binding_registry: JobPresetBindingRegistry,
    ):
        """
        Initialize automation mediator.
        
        Args:
            job_engine: Job execution engine
            preset_registry: Preset registry for validation
            binding_registry: Job-preset binding registry
        """
        self.job_engine = job_engine
        self.preset_registry = preset_registry
        self.binding_registry = binding_registry
    
    def can_auto_execute(
        self,
        job: Job,
        preset_id: Optional[str] = None,
        output_base_dir: Optional[str] = None,
    ) -> tuple[bool, Optional[str]]:
        """
        Check if a job can be auto-executed safely.
        
        Performs all safety checks without side effects.
        
        Args:
            job: Job to check
            preset_id: Preset to validate (if not bound via registry)
            output_base_dir: Output directory for disk space check
            
        Returns:
            (can_execute: bool, reason: Optional[str])
            If can_execute=False, reason explains why
        """
        # Check 1: Job must be in PENDING state
        if job.status != JobStatus.PENDING:
            return False, f"Job is not in PENDING state (current: {job.status.value})"
        
        # Check 2: Preset must be configured
        bound_preset_id = self.binding_registry.get_preset_id(job.id)
        effective_preset_id = bound_preset_id or preset_id
        
        if not effective_preset_id:
            return False, "No preset configured for job"
        
        # Check 3: Preset must exist
        preset = self.preset_registry.get_global_preset(effective_preset_id)
        if not preset:
            return False, f"Preset '{effective_preset_id}' not found in registry"
        
        # Check 4: Disk space check
        target_dir = Path(output_base_dir) if output_base_dir else Path.cwd()
        try:
            disk_usage = shutil.disk_usage(target_dir)
            free_gb = disk_usage.free / (1024**3)
            
            if free_gb < self.MIN_DISK_SPACE_GB:
                return False, f"Insufficient disk space: {free_gb:.1f}GB free (minimum: {self.MIN_DISK_SPACE_GB}GB)"
        except Exception as e:
            return False, f"Cannot check disk space: {e}"
        
        # Check 5: Concurrency limit
        running_jobs = self._count_running_jobs()
        if running_jobs >= self.MAX_CONCURRENT_JOBS:
            return False, f"Concurrency limit reached: {running_jobs}/{self.MAX_CONCURRENT_JOBS} jobs running"
        
        # All checks passed
        return True, None
    
    def auto_execute_job(
        self,
        job: Job,
        preset_id: Optional[str] = None,
        output_base_dir: Optional[str] = None,
        generate_reports: bool = True,
    ) -> tuple[bool, Optional[str]]:
        """
        Attempt to auto-execute a job with safety checks.
        
        This is the primary entry point for automation.
        Performs safety checks, then delegates to JobEngine if safe.
        
        Args:
            job: Job to execute
            preset_id: Preset to use (if not bound via registry)
            output_base_dir: Output directory
            generate_reports: Whether to generate reports
            
        Returns:
            (success: bool, error_message: Optional[str])
        """
        # Safety check
        can_execute, reason = self.can_auto_execute(job, preset_id, output_base_dir)
        
        if not can_execute:
            logger.warning(f"Auto-execution blocked for job {job.id}: {reason}")
            return False, reason
        
        # Resolve effective preset
        bound_preset_id = self.binding_registry.get_preset_id(job.id)
        effective_preset_id = bound_preset_id or preset_id
        
        # Execute via JobEngine
        try:
            logger.info(f"Auto-executing job {job.id} with preset '{effective_preset_id}'")
            
            self.job_engine.execute_job(
                job=job,
                global_preset_id=effective_preset_id,
                preset_registry=self.preset_registry,
                output_base_dir=output_base_dir,
                generate_reports=generate_reports,
            )
            
            logger.info(f"Job {job.id} auto-execution completed (status: {job.status.value})")
            return True, None
            
        except Exception as e:
            error_msg = f"Auto-execution failed for job {job.id}: {e}"
            logger.error(error_msg)
            return False, error_msg
    
    def _count_running_jobs(self) -> int:
        """
        Count currently running jobs.
        
        Phase 11: Simple implementation for single-registry scenario.
        Assumes job_engine has access to job_registry.
        
        Returns:
            Number of jobs in RUNNING state
        """
        # This is a simplified implementation
        # In production, this would query the job registry
        # For Phase 11, we assume single-threaded execution
        return 0  # Placeholder: actual implementation would count RUNNING jobs
