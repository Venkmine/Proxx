"""
Job engine orchestration logic.

Manages job lifecycle: create, start, pause, resume, cancel.
Aggregates task results into job status.
Enforces warn-and-continue semantics.

Phase 4 scope: State management only, no execution.
Execution hooks are stubs for Phase 5+ integration.
Phase 8: Reporting integration for job and clip diagnostics.
Phase 16: Execution engine integration (FFmpeg first).

============================================================================
V1 GUARDRAIL
============================================================================
If you are about to add: retry logic, requeue mechanism, pause/resume,
multi-clip batching, progress percentage, or overlay coordinate wiring —
STOP and read docs/DECISIONS.md first. These are intentionally absent.
============================================================================
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
    from ..execution.base import EngineType
    from ..execution.engine_registry import EngineRegistry


class JobEngine:
    """
    Job orchestration engine.
    
    Manages job lifecycle and aggregates task outcomes.
    
    Phase 11: Supports explicit preset binding (stored externally).
    Phase 16: Supports explicit engine binding at job level.
    """
    
    def __init__(
        self,
        binding_registry: Optional["JobPresetBindingRegistry"] = None,
        engine_registry: Optional["EngineRegistry"] = None,
    ):
        """
        Initialize job engine.
        
        Args:
            binding_registry: Optional registry for job-preset bindings
            engine_registry: Optional registry for execution engines
        """
        self.binding_registry = binding_registry
        self.engine_registry = engine_registry
    
    def create_job(
        self,
        source_paths: List[str],
        engine: Optional[str] = None,
    ) -> Job:
        """
        Create a new job from a list of source file paths.
        
        Source paths are accepted blindly without filesystem validation.
        Validation happens at execution time.
        
        Phase 16: Engine is bound at job creation.
        Phase 16.1: Metadata is extracted at ingest time.
        Phase 20: Thumbnails are generated at ingest time.
        
        Args:
            source_paths: List of absolute paths to source files
            engine: Engine type string ("ffmpeg" or "resolve")
            
        Returns:
            A new Job in PENDING state with QUEUED tasks
            
        Raises:
            ValueError: If source_paths is empty
        """
        if not source_paths:
            raise ValueError("Cannot create job with empty source paths list")
        
        # GOLDEN PATH: Hard limit = 1 clip
        if len(source_paths) > 1:
            raise ValueError(
                f"Multi-clip jobs are disabled. Only 1 clip allowed (received {len(source_paths)})"
            )
        
        import logging
        logger = logging.getLogger(__name__)
        
        # Create a task for each source file with metadata extraction
        tasks = []
        for path in source_paths:
            task = ClipTask(source_path=path)
            
            # Phase 16.1: Extract metadata at ingest time
            try:
                from ..metadata.extractors import extract_metadata
                metadata = extract_metadata(path)
                
                # Populate task with extracted metadata
                if metadata.image:
                    task.width = metadata.image.width
                    task.height = metadata.image.height
                
                if metadata.codec:
                    codec_name = metadata.codec.codec_name or ""
                    codec_profile = metadata.codec.profile or ""
                    task.codec = f"{codec_name} {codec_profile}".strip() if codec_name else None
                
                if metadata.time:
                    task.frame_rate = metadata.time.frame_rate
                    task.duration = metadata.time.duration_seconds
                
                if metadata.audio:
                    task.audio_channels = metadata.audio.channel_count
                    task.audio_sample_rate = metadata.audio.sample_rate
                    
            except Exception as e:
                # Metadata extraction failure is non-fatal
                logger.warning(f"Metadata extraction failed for {path}: {e}")
                # Leave metadata fields as None (will show "Unknown" in UI)
            
            # Phase 20: Generate thumbnail at ingest time
            try:
                from ..execution.thumbnails import generate_thumbnail_sync, thumbnail_to_base64
                thumb_path = generate_thumbnail_sync(path)
                if thumb_path:
                    task.thumbnail = thumbnail_to_base64(thumb_path)
                    logger.debug(f"Generated thumbnail for {path}")
            except Exception as e:
                # Thumbnail generation failure is non-fatal
                logger.warning(f"Thumbnail generation failed for {path}: {e}")
            
            tasks.append(task)
        
        # Create the job with engine binding
        job = Job(tasks=tasks, engine=engine)
        
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
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"[LIFECYCLE] start_job() called for job {job.id}, current status: {job.status.value}")
        
        validate_job_transition(job.status, JobStatus.RUNNING)
        
        old_status = job.status
        job.status = JobStatus.RUNNING
        job.started_at = datetime.now()
        logger.info(f"[LIFECYCLE] Job {job.id} transitioned: {old_status.value} -> RUNNING at {job.started_at.isoformat()}")
    
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
        Resume a paused or recovery-required job.
        
        Transitions job from PAUSED or RECOVERY_REQUIRED back to RUNNING.
        Only remaining QUEUED tasks will be processed.
        
        Phase 12: Explicit operator action required to resume interrupted jobs.
        
        Args:
            job: The job to resume
            
        Raises:
            InvalidStateTransitionError: If job is not in PAUSED or RECOVERY_REQUIRED state
        """
        validate_job_transition(job.status, JobStatus.RUNNING)
        
        job.status = JobStatus.RUNNING
    
    def cancel_job(self, job: Job, reason: str = "Cancelled by user") -> None:
        """
        Cancel a job.
        
        Phase 13: Cancellation marks remaining clips as SKIPPED and sets
        job status to CANCELLED (terminal state).
        
        If job is RUNNING, current clip is allowed to finish.
        Remaining QUEUED clips are marked SKIPPED.
        
        Args:
            job: The job to cancel
            reason: Reason for cancellation
            
        Raises:
            InvalidStateTransitionError: If job is already in a terminal state
        """
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"[LIFECYCLE] cancel_job() called for job {job.id}, current status: {job.status.value}")
        
        validate_job_transition(job.status, JobStatus.CANCELLED)
        
        # Mark all queued clips as skipped
        for task in job.tasks:
            if task.status == TaskStatus.QUEUED:
                task.status = TaskStatus.SKIPPED
                task.failure_reason = reason
                task.completed_at = datetime.now()
        
        old_status = job.status
        job.status = JobStatus.CANCELLED
        job.completed_at = datetime.now()
        logger.info(f"[LIFECYCLE] Job {job.id} transitioned: {old_status.value} -> CANCELLED at {job.completed_at.isoformat()}")
    
    def retry_failed_clips(
        self,
        job: Job,
        preset_registry = None,
        output_base_dir: Optional[str] = None,
    ) -> None:
        """
        Retry only FAILED clips in a job.
        
        Phase 13: Explicit retry of failed clips only.
        COMPLETED clips are never re-run.
        
        Rules:
        - Only FAILED clips are reset to QUEUED
        - COMPLETED clips remain untouched
        - Job is re-executed using existing preset binding
        - Warn-and-continue semantics preserved
        
        Args:
            job: The job containing failed clips
            preset_registry: Registry instance for preset lookup
            output_base_dir: Optional output directory override
            
        Raises:
            ValueError: If no preset is bound to the job
        """
        # Identify failed clips
        failed_clips = [task for task in job.tasks if task.status == TaskStatus.FAILED]
        
        if not failed_clips:
            return  # Nothing to retry
        
        # Reset failed clips to QUEUED
        for task in failed_clips:
            # Validate transition
            validate_task_transition(task.status, TaskStatus.QUEUED)
            
            # Reset task state
            task.status = TaskStatus.QUEUED
            task.failure_reason = None
            task.started_at = None
            task.completed_at = None
            # Keep warnings from previous attempt
        
        # Execute job (will process only QUEUED tasks)
        self.execute_job(
            job=job,
            preset_registry=preset_registry,
            output_base_dir=output_base_dir,
        )
    
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
        
        V1 GOLDEN PATH Rules (strict terminal states):
        - COMPLETED: All tasks in terminal states (output file verified)
        - FAILED: Any task failed or output file missing
        - CANCELLED: Explicitly set by operator (terminal)
        - RUNNING: At least one task is running or queued
        - PAUSED: Explicitly set by user
        - RECOVERY_REQUIRED: Explicitly set after process restart (terminal until resume)
        - PENDING: No tasks started yet
        
        Note: COMPLETED_WITH_WARNINGS was intentionally removed in V1.
        Jobs with warnings but successful output → COMPLETED.
        Jobs with failures or missing output → FAILED.
        
        Args:
            job: The job to evaluate
            
        Returns:
            The computed job status
        """
        # Terminal states remain unchanged (V1: strict COMPLETED or FAILED only)
        if job.status in (
            JobStatus.FAILED,
            JobStatus.COMPLETED,
            JobStatus.RECOVERY_REQUIRED,
            JobStatus.CANCELLED,  # Phase 13: Terminal state
        ):
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
        # V1 GOLDEN PATH: If any task failed → FAILED. Otherwise → COMPLETED.
        # Warnings are logged but do not affect terminal state.
        has_failures = job.failed_count > 0
        
        if has_failures:
            return JobStatus.FAILED
        
        return JobStatus.COMPLETED
    
    def finalize_job(self, job: Job) -> None:
        """
        Finalize a job by computing its final status.
        
        Should be called when all tasks have reached terminal states.
        Updates job status and completion timestamp.
        
        Job completion truth: Status is determined by task outcomes,
        which have already been verified (output files checked).
        
        V1 INVARIANT: Only allows transitions:
          RUNNING → COMPLETED
          RUNNING → FAILED
        
        Args:
            job: The job to finalize
        """
        import logging
        from .state import TERMINAL_JOB_STATES
        
        logger = logging.getLogger(__name__)
        
        # SAFETY GUARD: Prevent finalization of already-terminal jobs
        assert job.status not in TERMINAL_JOB_STATES, (
            f"Cannot finalize job {job.id}: already in terminal state {job.status.value}"
        )
        
        final_status = self.compute_job_status(job)
        logger.info(f"[LIFECYCLE] finalize_job() called for job {job.id}, current: {job.status.value}, computed: {final_status.value}")
        
        # Only update if status changed
        if job.status != final_status:
            # Validate the transition is legal
            validate_job_transition(job.status, final_status)
            old_status = job.status
            job.status = final_status
            logger.info(f"[LIFECYCLE] Job {job.id} transitioned: {old_status.value} -> {final_status.value}")
        
        # Set completion timestamp if job is terminal
        if final_status == JobStatus.COMPLETED:
            job.completed_at = datetime.now()
            # Log completion with verification summary
            verified_outputs = sum(
                1 for task in job.tasks 
                if task.status == TaskStatus.COMPLETED and task.output_path and Path(task.output_path).is_file()
            )
            logger.info(
                f"[COMPLETION] Job {job.id} finalized as {final_status.value} at {job.completed_at.isoformat()}. "
                f"Verified outputs: {verified_outputs}/{len(job.tasks)}"
            )
        elif final_status == JobStatus.FAILED:
            job.completed_at = datetime.now()
            failed_tasks = [t for t in job.tasks if t.status == TaskStatus.FAILED]
            reasons = [t.failure_reason for t in failed_tasks if t.failure_reason]
            logger.error(
                f"[COMPLETION] Job {job.id} finalized as FAILED at {job.completed_at.isoformat()}. "
                f"Failed tasks: {len(failed_tasks)}/{len(job.tasks)}. "
                f"Reasons: {reasons[:3]}"  # Log first 3 reasons
            )
    
    # Execution stubs for Phase 5+ integration

    def _execute_task(
        self,
        task: ClipTask,
        job: Job,
        global_preset_id: str,
        preset_registry,
        output_base_dir: Optional[str] = None,
    ):
        """
        Execute a single clip task.
        
        Phase 16: Uses execution engine based on job's engine binding.
        Phase 16.1: Resolves preset to ResolvedPresetParams before calling engine.
        Phase 16.4: Output path resolved ONCE and stored on task BEFORE engine call.
                   Engine receives resolved output_path verbatim - NEVER constructs paths.
        
        CRITICAL: Engines receive:
        - ResolvedPresetParams ONLY (not CategoryPreset)
        - Fully resolved output_path (from task.output_path)
        - Watermark text from job.settings if enabled
        
        Args:
            task: The clip task to execute (with output_path already resolved)
            job: Parent job (for engine binding and settings)
            global_preset_id: ID of the preset to use
            preset_registry: Registry instance for preset lookup
            output_base_dir: Optional output directory override (legacy, use job.settings)
            
        Returns:
            ExecutionResult from the engine or legacy pipeline
        """
        # Logger must be explicitly scoped; closures must not capture it implicitly
        import logging
        logger = logging.getLogger(__name__)
        
        # Phase 16.1: Use engine if bound to job
        if job.engine and self.engine_registry:
            from ..execution.base import EngineType
            from ..execution.resolved_params import ResolvedPresetParams, DEFAULT_H264_PARAMS
            
            try:
                engine_type = EngineType(job.engine)
                engine = self.engine_registry.get_available_engine(engine_type)
                
                # Alpha: Resolve params from preset or job settings
                resolved_params = None
                
                # Try preset resolution first (if preset is provided and not synthetic)
                if global_preset_id and not global_preset_id.startswith("_job_"):
                    try:
                        resolved_params = preset_registry.resolve_preset_params(global_preset_id)
                    except Exception as e:
                        logger.warning(f"Preset resolution failed for '{global_preset_id}': {e}")
                
                # Fall back to job settings
                if not resolved_params:
                    # Build ResolvedPresetParams from job.settings
                    settings = job.settings
                    from ..execution.resolved_params import ResolvedPresetParams
                    
                    # Map video codec and audio codec from settings
                    video_codec = settings.video.codec if settings.video else "prores_422"
                    container = settings.file.container if settings.file else "mov"
                    audio_codec = settings.audio.codec.value if settings.audio and hasattr(settings.audio.codec, 'value') else "copy"
                    audio_bitrate = settings.audio.bitrate if settings.audio else None
                    audio_sample_rate = settings.audio.sample_rate if settings.audio else None
                    
                    resolved_params = ResolvedPresetParams(
                        preset_id=f"_job_{job.id}",
                        preset_name=f"Job {job.id[:8]} Settings",
                        video_codec=video_codec,
                        container=container,
                        video_bitrate=settings.video.bitrate if settings.video else None,
                        video_quality=settings.video.quality if settings.video else None,
                        video_preset=settings.video.preset if settings.video else None,
                        audio_codec=audio_codec,
                        audio_bitrate=audio_bitrate,
                        audio_sample_rate=audio_sample_rate,
                        target_width=settings.video.width if settings.video else None,
                        target_height=settings.video.height if settings.video else None,
                    )
                
                # Phase 20: Get watermark text from DeliverSettings overlay
                settings = job.settings
                watermark_text = None
                if settings.overlay and settings.overlay.text_layers:
                    # Get first enabled text overlay
                    for layer in settings.overlay.text_layers:
                        if layer.enabled and layer.text:
                            watermark_text = layer.text
                            break
                
                # Phase 16.4: Engine receives resolved output_path from task
                # Output path was resolved in _resolve_clip_outputs() before execution started
                
                # STRUCTURAL FIX: Connect progress updates to task model
                # This ensures the UI can poll for real-time progress
                def on_progress_callback(progress_info):
                    """Update task with progress info for UI polling."""
                    task.progress_percent = progress_info.progress_percent
                    task.eta_seconds = progress_info.eta_seconds
                    # Phase 20: Enhanced progress fields
                    if hasattr(progress_info, 'encoding_fps'):
                        # Store on task for monitoring queries
                        task._encode_fps = progress_info.encoding_fps
                    logger.debug(
                        f"[PROGRESS] Clip {task.id}: {progress_info.progress_percent:.1f}% "
                        f"(ETA: {progress_info.eta_seconds or 'N/A'}s)"
                    )
                
                return engine.run_clip(
                    task=task,
                    resolved_params=resolved_params,
                    output_path=task.output_path,  # Already resolved, stored on task
                    watermark_text=watermark_text,
                    on_progress=on_progress_callback,
                )
            except Exception as e:
                # If engine execution fails, return a failed result
                from ..execution.results import ExecutionResult, ExecutionStatus
                return ExecutionResult(
                    status=ExecutionStatus.FAILED,
                    source_path=task.source_path,
                    output_path=None,
                    failure_reason=f"Engine execution failed: {e}",
                    started_at=datetime.now(),
                    completed_at=datetime.now(),
                )
        
        # Legacy: Use Resolve runner (for backwards compatibility)
        from ..execution.runner import execute_single_clip
        
        return execute_single_clip(
            source_path=task.source_path,
            global_preset_id=global_preset_id,
            preset_registry=preset_registry,
            output_base_dir=output_base_dir,
        )
    
    def _resolve_clip_outputs(
        self,
        job: Job,
        preset_registry,
        global_preset_id: Optional[str],
    ) -> None:
        """
        Resolve output paths for all clips BEFORE render starts.
        
        Alpha: Preset is optional. Uses job.settings for resolution info.
        
        Args:
            job: Job with clips to resolve
            preset_registry: Registry for preset resolution (may be None)
            global_preset_id: Preset ID for codec/extension info (may be None)
        """
        from ..execution.naming import resolve_filename
        from ..execution.output_paths import resolve_output_path
        from ..execution.resolved_params import ResolvedPresetParams, DEFAULT_H264_PARAMS
        import logging
        
        logger = logging.getLogger(__name__)
        
        # Alpha: Resolve params from preset or job settings
        resolved_params = None
        
        # Try preset resolution first (if preset is provided and not synthetic)
        if global_preset_id and not global_preset_id.startswith("_job_") and preset_registry:
            try:
                resolved_params = preset_registry.resolve_preset_params(global_preset_id)
            except Exception as e:
                logger.warning(f"Preset resolution failed: {e}")
        
        # Fall back to job settings
        if not resolved_params:
            settings = job.settings
            
            # Map video codec and audio codec from settings
            video_codec = settings.video.codec if settings.video else "prores_422"
            container = settings.file.container if settings.file else "mov"
            audio_codec = settings.audio.codec.value if settings.audio and hasattr(settings.audio.codec, 'value') else "copy"
            audio_bitrate = settings.audio.bitrate if settings.audio else None
            audio_sample_rate = settings.audio.sample_rate if settings.audio else None
            
            resolved_params = ResolvedPresetParams(
                preset_id=f"_job_{job.id}",
                preset_name=f"Job {job.id[:8]} Settings",
                video_codec=video_codec,
                container=container,
                video_bitrate=settings.video.bitrate if settings.video else None,
                video_quality=settings.video.quality if settings.video else None,
                video_preset=settings.video.preset if settings.video else None,
                audio_codec=audio_codec,
                audio_bitrate=audio_bitrate,
                audio_sample_rate=audio_sample_rate,
                target_width=settings.video.width if settings.video else None,
                target_height=settings.video.height if settings.video else None,
            )
        
        settings = job.settings
        
        for task in job.tasks:
            # Skip if already resolved (retry case)
            if task.output_path:
                continue
            
            try:
                # Step 1: Resolve filename from naming template
                resolved_name = resolve_filename(
                    template=settings.file.naming_template,
                    clip=task,
                    job=job,
                    resolved_params=resolved_params,
                    preset_id=global_preset_id or "default",
                )
                task.output_filename = resolved_name
                
                # Step 2: Resolve full output path
                # INC-003: This will raise OutputCollisionError if file exists
                # and overwrite_policy is 'never' or 'ask'
                output_path = resolve_output_path(
                    job=job,
                    clip=task,
                    resolved_params=resolved_params,
                    resolved_filename=resolved_name,
                )
                task.output_path = str(output_path)
                
                logger.debug(f"Resolved output path for {task.id}: {task.output_path}")
                
            except Exception as e:
                # INC-003: Check if this is a collision error
                error_type = type(e).__name__
                if "OutputCollisionError" in error_type or "collision" in str(e).lower():
                    logger.error(f"[INC-003] Output collision for {task.id}: {e}")
                    task.failure_reason = f"Output collision: {e}"
                else:
                    logger.error(f"Failed to resolve output path for {task.id}: {e}")
                    task.failure_reason = f"Output path resolution failed: {e}"
                
                # Mark task as failed before execution even starts
                task.status = TaskStatus.FAILED
                task.completed_at = datetime.now()
    
    def _process_job(
        self,
        job: Job,
        global_preset_id: str,
        preset_registry,
        output_base_dir: Optional[str] = None,
    ) -> Dict[str, "ExecutionResult"]:
        """
        Process all queued tasks in a job sequentially.
        
        Phase 7: Multi-clip orchestration using single-clip execution.
        Phase 8: Returns ExecutionResults for reporting.
        Phase 16: Uses execution engine based on job's engine binding.
        Phase 16.4: Resolves output paths BEFORE execution starts.
        
        Execution model:
        1. Resolve output paths for all clips BEFORE any execution
        2. Iterate through QUEUED tasks sequentially
        3. Check pause state before each task
        4. Execute task via engine (or legacy pipeline)
        5. Map ExecutionResult to task status
        6. Continue to next task (warn-and-continue)
        7. Finalize job when all tasks processed
        
        One clip failure never blocks other clips.
        Pause state is respected before starting each new clip.
        
        Args:
            job: The job to process
            global_preset_id: ID of the preset to use for all tasks
            preset_registry: Registry instance for preset lookup
            output_base_dir: Optional output directory override (legacy)
            
        Returns:
            Dict mapping task_id to ExecutionResult for reporting
        """
        from ..execution.results import ExecutionStatus
        import logging
        
        logger = logging.getLogger(__name__)
        
        # Track ExecutionResults for reporting (Phase 8)
        execution_results: Dict[str, "ExecutionResult"] = {}
        
        # Log engine info
        engine_name = job.engine or "resolve (legacy)"
        logger.info(f"Processing job {job.id} with engine: {engine_name}")
        
        # Phase 16.4: Resolve ALL output paths BEFORE any execution starts
        # This ensures paths are computed once and stored on tasks
        self._resolve_clip_outputs(job, preset_registry, global_preset_id)
        
        # Get queued tasks (snapshot at start - some may have failed during path resolution)
        queued_tasks = [task for task in job.tasks if task.status == TaskStatus.QUEUED]
        
        for task in queued_tasks:
            # Respect pause state before starting each clip
            if job.status == JobStatus.PAUSED:
                logger.info(f"Job {job.id} paused, stopping at clip {task.id}")
                break
            
            # Transition task to RUNNING
            self.update_task_status(task, TaskStatus.RUNNING)
            
            # Execute single clip via engine
            result = self._execute_task(
                task=task,
                job=job,
                global_preset_id=global_preset_id,
                preset_registry=preset_registry,
                output_base_dir=output_base_dir,
            )
            
            # Store result for reporting (Phase 8)
            execution_results[task.id] = result
            
            # Store output path on task for UI access (Phase 16.1)
            if result.output_path:
                task.output_path = result.output_path
            
            # Map ExecutionResult to task status with OUTPUT VERIFICATION
            # Job completion truth: COMPLETED requires exit_code==0 AND output file exists
            success_statuses = {
                ExecutionStatus.SUCCESS,
                ExecutionStatus.SUCCESS_WITH_WARNINGS,
                ExecutionStatus.COMPLETED,  # Legacy alias for SUCCESS
            }
            
            if result.status in success_statuses:
                # CRITICAL: Verify output file exists on disk before marking COMPLETED
                output_verified = False
                if result.output_path:
                    output_verified = Path(result.output_path).is_file()
                
                if output_verified:
                    # Output exists - task is truly COMPLETED
                    logger.info(f"[COMPLETION] Task {task.id} output verified: {result.output_path}")
                    if result.status == ExecutionStatus.SUCCESS_WITH_WARNINGS:
                        self.update_task_status(
                            task,
                            TaskStatus.COMPLETED,
                            warnings=result.warnings,
                        )
                    else:
                        self.update_task_status(task, TaskStatus.COMPLETED)
                else:
                    # Engine reported success but output file missing - FAIL the task
                    logger.error(f"[COMPLETION] Task {task.id} FAILED: output file not found at {result.output_path}")
                    self.update_task_status(
                        task,
                        TaskStatus.FAILED,
                        failure_reason=f"Output file not found: {result.output_path}",
                    )
            elif result.status == ExecutionStatus.CANCELLED:
                # Cancelled by operator - mark as failed with reason
                logger.info(f"[COMPLETION] Task {task.id} cancelled")
                self.update_task_status(
                    task,
                    TaskStatus.FAILED,
                    failure_reason=result.failure_reason or "Cancelled by operator",
                )
            else:
                # ExecutionStatus.FAILED
                logger.error(f"[COMPLETION] Task {task.id} FAILED: {result.failure_reason}")
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
        
        Alpha: Preset is optional. Jobs use their embedded settings_snapshot
        (or override_settings if present). Preset is only used for codec
        resolution when available.
        
        Executes all queued tasks sequentially, respecting warn-and-continue
        semantics. After execution completes, generates diagnostic reports
        (CSV, JSON, TXT) documenting job and clip outcomes.
        
        Args:
            job: The job to execute
            global_preset_id: Optional preset ID (for codec resolution)
            preset_registry: Registry instance for preset lookup
            output_base_dir: Optional output directory override
            generate_reports: Whether to generate reports after execution (default: True)
            
        Returns:
            Dict mapping report format to filepath if reports generated, else None
            
        Raises:
            JobEngineError: If execution or reporting fails
            ValueError: If engine is not available
        """
        import logging
        logger = logging.getLogger(__name__)
        
        # Alpha: Preset is optional - resolve if available
        effective_preset_id = None
        
        if self.binding_registry:
            effective_preset_id = self.binding_registry.get_preset_id(job.id)
        
        if not effective_preset_id:
            effective_preset_id = global_preset_id
        
        # Alpha: If no preset, use a default preset ID for codec resolution
        # The actual settings come from job.settings (settings_snapshot or override)
        if not effective_preset_id:
            # Use a synthetic preset ID based on job's video codec
            video_settings = job.settings.video
            effective_preset_id = f"_job_{job.id}_settings"
            logger.info(f"Job {job.id} has no preset - using embedded settings with codec '{video_settings.codec}'")
        else:
            # Validate preset exists if provided
            if preset_registry:
                preset = preset_registry.get_global_preset(effective_preset_id)
                if not preset:
                    logger.warning(f"Preset '{effective_preset_id}' not found, using job settings")
                    effective_preset_id = f"_job_{job.id}_settings"
        
        # Phase 16: Validate engine availability
        if job.engine and self.engine_registry:
            from ..execution.base import EngineType, EngineNotAvailableError
            
            try:
                engine_type = EngineType(job.engine)
                engine = self.engine_registry.get_available_engine(engine_type)
                
                # Validate job before execution (preset validation is optional)
                is_valid, error_msg = engine.validate_job(
                    job=job,
                    preset_registry=preset_registry,
                    preset_id=effective_preset_id if not effective_preset_id.startswith("_job_") else None,
                )
                
                if not is_valid:
                    raise ValueError(f"Job validation failed: {error_msg}")
                
                logger.info(f"Job {job.id} will use {engine.name} engine")
                
            except EngineNotAvailableError as e:
                raise ValueError(f"Engine not available: {e}")
        
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
