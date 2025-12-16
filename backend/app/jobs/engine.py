"""
Job engine orchestration logic.

Manages job lifecycle: create, start, pause, resume, cancel.
Aggregates task results into job status.
Enforces warn-and-continue semantics.

Phase 4 scope: State management only, no execution.
Execution hooks are stubs for Phase 5+ integration.
Phase 8: Reporting integration for job and clip diagnostics.
"""

from datetime import datetime
from pathlib import Path
from typing import List, Optional, Dict, TYPE_CHECKING
from .models import Job, ClipTask, JobStatus, TaskStatus
from .state import validate_job_transition, validate_task_transition
from .errors import JobEngineError

if TYPE_CHECKING:
    from .bindings import JobPresetBindingRegistry
    from ..presets.registry import PresetRegistry
    from ..execution.results import ExecutionResult


class JobEngine:
    """
    Job orchestration engine.
    
    Manages job lifecycle and aggregates task outcomes.
    Does NOT execute transcoding or call Resolve (Phase 5+).
    
    Phase 11: Supports explicit preset binding (stored externally).
    """
    
    def __init__(self, binding_registry: Optional["JobPresetBindingRegistry"] = None):
        """
        Initialize job engine.
        
        Args:
            binding_registry: Optional registry for job-preset bindings
        """
        self.binding_registry = binding_registry
    
    def create_job(self, source_paths: List[str]) -> Job:
        """
        Create a new job from a list of source file paths.
        
        Source paths are accepted blindly without filesystem validation.
        Validation happens at execution time (Phase 5+).
        
        Args:
            source_paths: List of absolute paths to source files
            
        Returns:
            A new Job in PENDING state with QUEUED tasks
            
        Raises:
            ValueError: If source_paths is empty
        """
        if not source_paths:
            raise ValueError("Cannot create job with empty source paths list")
        
        # Create a task for each source file
        tasks = [ClipTask(source_path=path) for path in source_paths]
        
        # Create the job
        job = Job(tasks=tasks)
        
        return job
    
    def bind_preset(
        self, job: Job, preset_id: str, preset_registry: Optional["PresetRegistry"] = None
    ) -> None:
        """
        Explicitly bind a preset to a job.
        
        Phase 11: Binding is stored externally via binding_registry.
        Preset validation is optional but recommended.
        
        Args:
            job: The job to bind
            preset_id: Global preset ID
            preset_registry: Optional registry to validate preset existence
            
        Raises:
            ValueError: If binding_registry is not configured
            ValueError: If preset does not exist (when registry provided)
        """
        if not self.binding_registry:
            raise ValueError("JobEngine has no binding_registry configured")
        
        # Optional validation
        if preset_registry:
            preset = preset_registry.get_global_preset(preset_id)
            if not preset:
                raise ValueError(f"Global preset '{preset_id}' not found in registry")
        
        # Store binding externally
        self.binding_registry.bind_preset(job.id, preset_id)
    
    def start_job(self, job: Job) -> None:
        """
        Start a pending job.
        
        Transitions job from PENDING to RUNNING.
        Does NOT execute tasks (execution is stubbed for Phase 5+).
        
        Args:
            job: The job to start
            
        Raises:
            InvalidStateTransitionError: If job is not in PENDING state
        """
        validate_job_transition(job.status, JobStatus.RUNNING)
        
        job.status = JobStatus.RUNNING
        job.started_at = datetime.now()
    
    def pause_job(self, job: Job) -> None:
        """
        Pause a running job.
        
        Semantic: Finish current clip, do not start new clips.
        Implementation: Immediate state transition (execution stubbed).
        
        Args:
            job: The job to pause
            
        Raises:
            InvalidStateTransitionError: If job is not in RUNNING state
        """
        validate_job_transition(job.status, JobStatus.PAUSED)
        
        job.status = JobStatus.PAUSED
    
    def resume_job(self, job: Job) -> None:
        """
        Resume a paused job.
        
        Transitions job from PAUSED back to RUNNING.
        Only remaining QUEUED tasks will be processed.
        
        Args:
            job: The job to resume
            
        Raises:
            InvalidStateTransitionError: If job is not in PAUSED state
        """
        validate_job_transition(job.status, JobStatus.RUNNING)
        
        job.status = JobStatus.RUNNING
    
    def cancel_job(self, job: Job, reason: str = "Cancelled by user") -> None:
        """
        Cancel a job.
        
        Marks job as FAILED with the provided reason.
        Safe cancellation: does not corrupt state.
        
        Args:
            job: The job to cancel
            reason: Reason for cancellation
            
        Raises:
            InvalidStateTransitionError: If job is already in a terminal state
        """
        validate_job_transition(job.status, JobStatus.FAILED)
        
        job.status = JobStatus.FAILED
        job.completed_at = datetime.now()
    
    def update_task_status(
        self,
        task: ClipTask,
        new_status: TaskStatus,
        failure_reason: Optional[str] = None,
        warnings: Optional[List[str]] = None,
    ) -> None:
        """
        Update a task's status.
        
        Validates state transition and updates metadata.
        
        Args:
            task: The task to update
            new_status: Target status
            failure_reason: Reason for failure (required if status is FAILED or SKIPPED)
            warnings: List of warnings to add
            
        Raises:
            InvalidStateTransitionError: If the state transition is illegal
            ValueError: If failure_reason is missing for FAILED/SKIPPED status
        """
        validate_task_transition(task.status, new_status)
        
        # Update status
        old_status = task.status
        task.status = new_status
        
        # Update timestamps
        if old_status == TaskStatus.QUEUED and new_status == TaskStatus.RUNNING:
            task.started_at = datetime.now()
        
        if new_status in (TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.SKIPPED):
            task.completed_at = datetime.now()
        
        # Handle failure reason
        if new_status in (TaskStatus.FAILED, TaskStatus.SKIPPED):
            if not failure_reason:
                raise ValueError(
                    f"failure_reason is required when setting status to {new_status.value}"
                )
            task.failure_reason = failure_reason
        
        # Add warnings
        if warnings:
            task.warnings.extend(warnings)
    
    def compute_job_status(self, job: Job) -> JobStatus:
        """
        Compute the appropriate job status based on task states.
        
        Rules:
        - FAILED: Only if job engine itself cannot continue
        - COMPLETED: All tasks in terminal states, no failures, no warnings
        - COMPLETED_WITH_WARNINGS: All tasks in terminal states, but some failed/skipped/warned
        - RUNNING: At least one task is running or queued
        - PAUSED: Explicitly set by user
        - PENDING: No tasks started yet
        
        Args:
            job: The job to evaluate
            
        Returns:
            The computed job status
        """
        # Terminal states remain unchanged
        if job.status in (JobStatus.FAILED, JobStatus.COMPLETED, JobStatus.COMPLETED_WITH_WARNINGS):
            return job.status
        
        # Check if all tasks are in terminal states
        terminal_task_states = {TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.SKIPPED}
        all_terminal = all(task.status in terminal_task_states for task in job.tasks)
        
        if not all_terminal:
            # Still have work to do
            if job.status == JobStatus.PAUSED:
                return JobStatus.PAUSED
            return JobStatus.RUNNING
        
        # All tasks are terminal - determine completion status
        has_failures = job.failed_count > 0
        has_skipped = job.skipped_count > 0
        has_warnings = job.warning_count > 0
        
        if has_failures or has_skipped or has_warnings:
            return JobStatus.COMPLETED_WITH_WARNINGS
        
        return JobStatus.COMPLETED
    
    def finalize_job(self, job: Job) -> None:
        """
        Finalize a job by computing its final status.
        
        Should be called when all tasks have reached terminal states.
        Updates job status and completion timestamp.
        
        Args:
            job: The job to finalize
        """
        final_status = self.compute_job_status(job)
        
        # Only update if status changed
        if job.status != final_status:
            # Validate the transition is legal
            validate_job_transition(job.status, final_status)
            job.status = final_status
        
        # Set completion timestamp if job is terminal
        if final_status in (JobStatus.COMPLETED, JobStatus.COMPLETED_WITH_WARNINGS):
            job.completed_at = datetime.now()
    
    # Execution stubs for Phase 5+ integration
    
    def _execute_task(
        self,
        task: ClipTask,
        global_preset_id: str,
        preset_registry,
        output_base_dir: Optional[str] = None,
    ):
        """
        Execute a single clip task.
        
        Phase 7: Thin wrapper around Phase 6 single-clip execution.
        Invokes execute_single_clip() and returns ExecutionResult.
        
        Args:
            task: The clip task to execute
            global_preset_id: ID of the preset to use
            preset_registry: Registry instance for preset lookup
            output_base_dir: Optional output directory override
            
        Returns:
            ExecutionResult from the single-clip pipeline
        """
        from ..execution.runner import execute_single_clip
        
        return execute_single_clip(
            source_path=task.source_path,
            global_preset_id=global_preset_id,
            preset_registry=preset_registry,
            output_base_dir=output_base_dir,
        )
    
    def _process_job(
        self,
        job: Job,
        global_preset_id: str,
        preset_registry,
        output_base_dir: Optional[str] = None,
    ) -> Dict[str, "ExecutionResult"]:
        """
        Process all queued tasks in a job sequentially.
        
        Phase 7: Multi-clip orchestration using Phase 6 single-clip execution.
        Phase 8: Returns ExecutionResults for reporting.
        
        Execution model:
        1. Iterate through QUEUED tasks sequentially
        2. Check pause state before each task
        3. Execute task via single-clip pipeline
        4. Map ExecutionResult to task status
        5. Continue to next task (warn-and-continue)
        6. Finalize job when all tasks processed
        
        One clip failure never blocks other clips.
        Pause state is respected before starting each new clip.
        
        Args:
            job: The job to process
            global_preset_id: ID of the preset to use for all tasks
            preset_registry: Registry instance for preset lookup
            output_base_dir: Optional output directory override
            
        Returns:
            Dict mapping task_id to ExecutionResult for reporting
        """
        from ..execution.results import ExecutionStatus
        
        # Track ExecutionResults for reporting (Phase 8)
        execution_results: Dict[str, "ExecutionResult"] = {}
        
        # Get queued tasks (snapshot at start)
        queued_tasks = [task for task in job.tasks if task.status == TaskStatus.QUEUED]
        
        for task in queued_tasks:
            # Respect pause state before starting each clip
            if job.status == JobStatus.PAUSED:
                break
            
            # Transition task to RUNNING
            self.update_task_status(task, TaskStatus.RUNNING)
            
            # Execute single clip via Phase 6 pipeline
            result = self._execute_task(
                task=task,
                global_preset_id=global_preset_id,
                preset_registry=preset_registry,
                output_base_dir=output_base_dir,
            )
            
            # Store result for reporting (Phase 8)
            execution_results[task.id] = result
            
            # Map ExecutionResult to task status
            if result.status == ExecutionStatus.SUCCESS:
                self.update_task_status(task, TaskStatus.COMPLETED)
            elif result.status == ExecutionStatus.SUCCESS_WITH_WARNINGS:
                self.update_task_status(
                    task,
                    TaskStatus.COMPLETED,
                    warnings=result.warnings,
                )
            else:  # ExecutionStatus.FAILED
                self.update_task_status(
                    task,
                    TaskStatus.FAILED,
                    failure_reason=result.failure_reason or "Unknown execution failure",
                )
            
            # Warn-and-continue: Do NOT break on failure, continue to next task
        
        # Finalize job status after all tasks processed (or paused)
        self.finalize_job(job)
        
        return execution_results
    
    def execute_job(
        self,
        job: Job,
        global_preset_id: Optional[str] = None,
        preset_registry = None,
        output_base_dir: Optional[str] = None,
        generate_reports: bool = True,
    ) -> Optional[Dict[str, Path]]:
        """
        Execute a job and optionally generate reports.
        
        Phase 8: Public entry point with integrated reporting.
        Phase 11: Uses bound preset if available, falls back to parameter.
        
        Executes all queued tasks sequentially, respecting warn-and-continue
        semantics. After execution completes, generates diagnostic reports
        (CSV, JSON, TXT) documenting job and clip outcomes.
        
        Args:
            job: The job to execute
            global_preset_id: Optional preset ID (fallback if no binding exists)
            preset_registry: Registry instance for preset lookup
            output_base_dir: Optional output directory override
            generate_reports: Whether to generate reports after execution (default: True)
            
        Returns:
            Dict mapping report format to filepath if reports generated, else None
            
        Raises:
            JobEngineError: If execution or reporting fails
            ValueError: If no preset is available (neither bound nor provided)
        """
        # Resolve effective preset ID
        effective_preset_id = None
        
        if self.binding_registry:
            effective_preset_id = self.binding_registry.get_preset_id(job.id)
        
        if not effective_preset_id:
            effective_preset_id = global_preset_id
        
        if not effective_preset_id:
            raise ValueError(
                f"No preset available for job {job.id}. "
                "Preset must be bound via binding_registry or provided as parameter."
            )
        
        # Validate preset exists
        if preset_registry:
            preset = preset_registry.get_global_preset(effective_preset_id)
            if not preset:
                raise ValueError(f"Global preset '{effective_preset_id}' not found in registry")
        
        # Start the job
        self.start_job(job)
        
        # Process all tasks
        execution_results = self._process_job(
            job=job,
            global_preset_id=effective_preset_id,
            preset_registry=preset_registry,
            output_base_dir=output_base_dir,
        )
        
        # Generate reports if requested
        if generate_reports:
            return self._generate_job_reports(
                job=job,
                execution_results=execution_results,
                output_base_dir=output_base_dir,
            )
        
        return None
    
    def _generate_job_reports(
        self,
        job: Job,
        execution_results: Dict[str, "ExecutionResult"],
        output_base_dir: Optional[str] = None,
    ) -> Dict[str, Path]:
        """
        Generate reports for a completed job.
        
        Phase 8: Observational reporting from job state and execution results.
        
        Creates ClipReports enriched with ExecutionResult data (output paths,
        file sizes, durations) and writes CSV, JSON, and TXT reports to disk.
        
        Args:
            job: The completed job
            execution_results: Dict mapping task_id to ExecutionResult
            output_base_dir: Output directory (defaults to current working directory)
            
        Returns:
            Dict mapping report format to filepath
            
        Raises:
            ReportWriteError: If report generation fails
        """
        from ..reporting.models import JobReport, ClipReport, DiagnosticsInfo
        from ..reporting.diagnostics import (
            get_proxx_version,
            get_python_version,
            get_os_version,
            get_hostname,
            get_resolve_info,
        )
        from ..reporting.writers import write_reports
        
        # Capture diagnostics
        resolve_info = get_resolve_info()
        diagnostics = DiagnosticsInfo(
            proxx_version=get_proxx_version(),
            python_version=get_python_version(),
            os_version=get_os_version(),
            hostname=get_hostname(),
            resolve_path=resolve_info.get("path"),
            resolve_version=resolve_info.get("version"),
            resolve_studio=resolve_info.get("studio"),
        )
        
        # Build ClipReports with execution metadata
        clip_reports = []
        for task in job.tasks:
            result = execution_results.get(task.id)
            
            # Extract output metadata from ExecutionResult
            output_path = None
            output_size_bytes = None
            execution_duration_seconds = None
            
            if result:
                output_path = result.output_path
                execution_duration_seconds = result.duration_seconds()
                
                # Get output file size if output exists
                if output_path and Path(output_path).exists():
                    output_size_bytes = Path(output_path).stat().st_size
            
            clip_report = ClipReport.from_task(
                task=task,
                output_path=output_path,
                output_size_bytes=output_size_bytes,
                execution_duration_seconds=execution_duration_seconds,
            )
            clip_reports.append(clip_report)
        
        # Build JobReport
        job_report = JobReport(
            job_id=job.id,
            status=job.status,
            created_at=job.created_at,
            started_at=job.started_at,
            completed_at=job.completed_at,
            total_clips=job.total_tasks,
            completed_clips=job.completed_count,
            failed_clips=job.failed_count,
            skipped_clips=job.skipped_count,
            warnings_count=job.warning_count,
            clips=clip_reports,
            diagnostics=diagnostics,
        )
        
        # Determine output directory
        if output_base_dir:
            report_dir = Path(output_base_dir)
        else:
            report_dir = Path.cwd()
        
        # Write reports to disk
        return write_reports(job_report, report_dir)
