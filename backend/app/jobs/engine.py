"""
Job engine orchestration logic.

Manages job lifecycle: create, start, pause, resume, cancel.
Aggregates task results into job status.
Enforces warn-and-continue semantics.

Phase 4 scope: State management only, no execution.
Execution hooks are stubs for Phase 5+ integration.
"""

from datetime import datetime
from typing import List, Optional
from .models import Job, ClipTask, JobStatus, TaskStatus
from .state import validate_job_transition, validate_task_transition
from .errors import JobEngineError


class JobEngine:
    """
    Job orchestration engine.
    
    Manages job lifecycle and aggregates task outcomes.
    Does NOT execute transcoding or call Resolve (Phase 5+).
    """
    
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
    
    def _execute_task(self, task: ClipTask) -> None:
        """
        Execute a single clip task.
        
        STUB: This will be implemented in Phase 5+ to:
        - Validate source file exists
        - Extract metadata
        - Apply preset
        - Call Resolve or ffmpeg
        - Verify output
        
        For Phase 4, this is a no-op placeholder.
        """
        pass
    
    def _process_job(self, job: Job) -> None:
        """
        Process all queued tasks in a job.
        
        STUB: This will be implemented in Phase 5+ to:
        - Iterate through QUEUED tasks
        - Execute each task
        - Update task status
        - Respect pause state
        - Handle failures with warn-and-continue
        
        For Phase 4, this is a no-op placeholder.
        """
        pass
