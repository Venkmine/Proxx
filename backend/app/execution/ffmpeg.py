"""
FFmpeg execution engine.

Phase 16: Real transcoding via subprocess.Popen.

Design rules:
- One subprocess per clip
- Capture stdout + stderr for audit
- Persist full command string
- Non-zero exit code = FAILED
- SIGTERM → SIGKILL escalation for cancellation
- No progress parsing (state-only: RUNNING → COMPLETED/FAILED)
"""

import logging
import os
import signal
import shutil
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, TYPE_CHECKING

from .base import (
    ExecutionEngine,
    EngineType,
    EngineCapability,
    EngineExecutionError,
)
from .results import ExecutionResult, ExecutionStatus
from .paths import generate_output_path

if TYPE_CHECKING:
    from ..jobs.models import Job, ClipTask
    from ..presets.registry import PresetRegistry

logger = logging.getLogger(__name__)


# FFmpeg codec mappings
FFMPEG_CODEC_MAP: Dict[str, str] = {
    # ProRes variants
    "prores_proxy": "prores_ks -profile:v 0",
    "prores_lt": "prores_ks -profile:v 1",
    "prores_422": "prores_ks -profile:v 2",
    "prores_422_hq": "prores_ks -profile:v 3",
    # DNxHR variants
    "dnxhr_lb": "dnxhd -profile:v dnxhr_lb",
    "dnxhr_sq": "dnxhd -profile:v dnxhr_sq",
    "dnxhr_hq": "dnxhd -profile:v dnxhr_hq",
    # DNxHD variants (specific bitrates)
    "dnxhd_36": "dnxhd -b:v 36M",
    "dnxhd_145": "dnxhd -b:v 145M",
    "dnxhd_220": "dnxhd -b:v 220M",
}

# Container to extension mapping
CONTAINER_EXTENSION_MAP: Dict[str, str] = {
    "mov": "mov",
    "mxf": "mxf",
}


class FFmpegEngine(ExecutionEngine):
    """
    FFmpeg-based execution engine.
    
    Uses subprocess.Popen for real transcoding.
    State-only tracking (no progress parsing).
    """
    
    def __init__(self):
        """Initialize FFmpeg engine."""
        self._active_processes: Dict[str, subprocess.Popen] = {}
        self._cancelled_jobs: set[str] = set()
        self._ffmpeg_path: Optional[str] = None
    
    @property
    def engine_type(self) -> EngineType:
        return EngineType.FFMPEG
    
    @property
    def name(self) -> str:
        return "FFmpeg"
    
    @property
    def available(self) -> bool:
        """Check if ffmpeg is installed and accessible."""
        return self._find_ffmpeg() is not None
    
    @property
    def capabilities(self) -> set[EngineCapability]:
        return {
            EngineCapability.TRANSCODE,
            EngineCapability.SCALE,
            EngineCapability.AUDIO_PASSTHROUGH,
        }
    
    def _find_ffmpeg(self) -> Optional[str]:
        """Find ffmpeg binary path."""
        if self._ffmpeg_path:
            return self._ffmpeg_path
        
        # Try to find ffmpeg in PATH
        ffmpeg_path = shutil.which("ffmpeg")
        if ffmpeg_path:
            self._ffmpeg_path = ffmpeg_path
            return ffmpeg_path
        
        # Common install locations
        common_paths = [
            "/usr/local/bin/ffmpeg",
            "/usr/bin/ffmpeg",
            "/opt/homebrew/bin/ffmpeg",
        ]
        for path in common_paths:
            if os.path.isfile(path) and os.access(path, os.X_OK):
                self._ffmpeg_path = path
                return path
        
        return None
    
    def validate_job(
        self,
        job: "Job",
        preset_registry: "PresetRegistry",
        preset_id: str,
    ) -> tuple[bool, Optional[str]]:
        """Validate job can be executed by FFmpeg."""
        from ..presets.models import PresetCategory
        
        # Check FFmpeg availability
        if not self.available:
            return False, "FFmpeg is not installed or not in PATH"
        
        # Validate preset exists
        preset = preset_registry.get_global_preset(preset_id)
        if not preset:
            return False, f"Preset '{preset_id}' not found"
        
        # Validate codec preset compatibility
        codec_ref = preset.category_refs.get(PresetCategory.CODEC, "")
        codec_preset = preset_registry.get_category_preset(PresetCategory.CODEC, codec_ref) if codec_ref else None
        if not codec_preset:
            return False, "No codec preset configured"
        
        # Check codec is supported by FFmpeg
        codec_type = getattr(codec_preset, "codec", None)
        if codec_type and str(codec_type) not in FFMPEG_CODEC_MAP:
            return False, f"Codec '{codec_type}' is not supported by FFmpeg engine"
        
        # Validate source files exist
        missing_files = []
        for task in job.tasks:
            if not Path(task.source_path).is_file():
                missing_files.append(task.source_path)
        
        if missing_files:
            return False, f"Missing source files: {', '.join(missing_files[:3])}" + \
                (f" and {len(missing_files) - 3} more" if len(missing_files) > 3 else "")
        
        return True, None
    
    def _build_ffmpeg_command(
        self,
        source_path: str,
        output_path: str,
        preset_registry: "PresetRegistry",
        preset_id: str,
    ) -> list[str]:
        """Build FFmpeg command line arguments."""
        from ..presets.models import PresetCategory
        
        ffmpeg_path = self._find_ffmpeg()
        if not ffmpeg_path:
            raise EngineExecutionError(
                EngineType.FFMPEG,
                "unknown",
                stderr="FFmpeg not found"
            )
        
        cmd = [ffmpeg_path, "-y"]  # -y to overwrite output
        
        # Input file
        cmd.extend(["-i", source_path])
        
        # Get preset
        preset = preset_registry.get_global_preset(preset_id)
        if preset:
            # Get codec settings
            codec_ref = preset.category_refs.get(PresetCategory.CODEC, "")
            codec_preset = preset_registry.get_category_preset(PresetCategory.CODEC, codec_ref) if codec_ref else None
            
            if codec_preset:
                codec_type = str(getattr(codec_preset, "codec", "prores_422"))
                codec_args = FFMPEG_CODEC_MAP.get(codec_type, "prores_ks -profile:v 2")
                cmd.extend(["-c:v"] + codec_args.split())
            
            # Get scaling settings
            scaling_ref = preset.category_refs.get(PresetCategory.SCALING, "")
            scaling_preset = preset_registry.get_category_preset(PresetCategory.SCALING, scaling_ref) if scaling_ref else None
            
            if scaling_preset:
                mode = getattr(scaling_preset, "mode", "none")
                if mode != "none":
                    target_width = getattr(scaling_preset, "target_width", None)
                    target_height = getattr(scaling_preset, "target_height", None)
                    if target_width and target_height:
                        if mode == "fit":
                            # Scale to fit within dimensions, maintain aspect ratio
                            cmd.extend([
                                "-vf",
                                f"scale='min({target_width},iw)':'min({target_height},ih)':force_original_aspect_ratio=decrease"
                            ])
                        elif mode == "fill":
                            # Scale to fill dimensions, crop if needed
                            cmd.extend([
                                "-vf",
                                f"scale={target_width}:{target_height}:force_original_aspect_ratio=increase,crop={target_width}:{target_height}"
                            ])
                        elif mode == "stretch":
                            # Stretch to exact dimensions
                            cmd.extend(["-vf", f"scale={target_width}:{target_height}"])
        
        # Audio passthrough (copy audio as-is)
        cmd.extend(["-c:a", "copy"])
        
        # Output file
        cmd.append(output_path)
        
        return cmd
    
    def run_clip(
        self,
        task: "ClipTask",
        preset_registry: "PresetRegistry",
        preset_id: str,
        output_base_dir: Optional[str] = None,
    ) -> ExecutionResult:
        """
        Execute a single clip with FFmpeg.
        
        Returns ExecutionResult with status, output path, timing.
        """
        from ..presets.models import PresetCategory
        from ..presets.schemas import CodecPreset
        
        start_time = datetime.now()
        source_path_str = task.source_path
        source_path = Path(source_path_str)
        
        # Generate output path using codec preset
        preset = preset_registry.get_global_preset(preset_id)
        codec_preset: Optional[CodecPreset] = None
        
        if preset:
            codec_ref = preset.category_refs.get(PresetCategory.CODEC, "")
            codec_preset = preset_registry.get_category_preset(PresetCategory.CODEC, codec_ref) if codec_ref else None
        
        # Create a minimal codec preset if none found for path generation
        if not codec_preset:
            # Default to ProRes 422 in MOV container
            codec_preset = CodecPreset(
                id="default",
                name="Default ProRes",
                codec="prores_422",
                container="mov",
            )
        
        # Determine output directory
        output_dir = Path(output_base_dir) if output_base_dir else source_path.parent
        
        output_path = generate_output_path(
            source_path=source_path,
            output_dir=output_dir,
            codec_preset=codec_preset,
        )
        
        # Convert to strings for subprocess and result
        output_path_str = str(output_path)
        
        # Ensure output directory exists
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Build command
        try:
            cmd = self._build_ffmpeg_command(
                source_path=source_path_str,
                output_path=output_path_str,
                preset_registry=preset_registry,
                preset_id=preset_id,
            )
        except Exception as e:
            return ExecutionResult(
                status=ExecutionStatus.FAILED,
                source_path=source_path_str,
                output_path=None,
                failure_reason=f"Failed to build FFmpeg command: {e}",
                started_at=start_time,
                completed_at=datetime.now(),
            )
        
        # Log the command for audit
        cmd_string = " ".join(cmd)
        logger.info(f"[FFmpeg] Executing: {cmd_string}")
        
        # Execute via subprocess
        try:
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            
            # Track active process for cancellation
            self._active_processes[task.id] = process
            
            logger.info(f"[FFmpeg] Started PID {process.pid} for clip {task.id}")
            
            # Wait for completion
            stdout, stderr = process.communicate()
            exit_code = process.returncode
            
            # Remove from active processes
            self._active_processes.pop(task.id, None)
            
            end_time = datetime.now()
            
            logger.info(f"[FFmpeg] PID {process.pid} exited with code {exit_code}")
            
            # Check for cancellation
            if task.id in self._cancelled_jobs:
                self._cancelled_jobs.discard(task.id)
                return ExecutionResult(
                    status=ExecutionStatus.FAILED,
                    source_path=source_path_str,
                    output_path=None,
                    failure_reason="Cancelled by user",
                    started_at=start_time,
                    completed_at=end_time,
                )
            
            # Non-zero exit = FAILED
            if exit_code != 0:
                failure_reason = stderr.strip() if stderr else f"FFmpeg exited with code {exit_code}"
                logger.error(f"[FFmpeg] Failed: {failure_reason}")
                return ExecutionResult(
                    status=ExecutionStatus.FAILED,
                    source_path=source_path_str,
                    output_path=None,
                    failure_reason=failure_reason,
                    started_at=start_time,
                    completed_at=end_time,
                )
            
            # Verify output exists
            if not output_path.is_file():
                return ExecutionResult(
                    status=ExecutionStatus.FAILED,
                    source_path=source_path_str,
                    output_path=None,
                    failure_reason="Output file was not created",
                    started_at=start_time,
                    completed_at=end_time,
                )
            
            # Success
            logger.info(f"[FFmpeg] Completed: {output_path_str}")
            return ExecutionResult(
                status=ExecutionStatus.SUCCESS,
                source_path=source_path_str,
                output_path=output_path_str,
                started_at=start_time,
                completed_at=end_time,
            )
            
        except Exception as e:
            self._active_processes.pop(task.id, None)
            logger.exception(f"[FFmpeg] Exception during execution: {e}")
            return ExecutionResult(
                status=ExecutionStatus.FAILED,
                source_path=source_path_str,
                output_path=None,
                failure_reason=str(e),
                started_at=start_time,
                completed_at=datetime.now(),
            )
    
    def cancel_job(self, job: "Job") -> None:
        """
        Cancel all running clips for a job.
        
        Uses SIGTERM first, escalates to SIGKILL after timeout.
        """
        from ..jobs.models import TaskStatus
        
        logger.info(f"[FFmpeg] Cancelling job {job.id}")
        
        # Mark all clips in this job as cancelled
        for task in job.tasks:
            if task.status == TaskStatus.RUNNING:
                self._cancelled_jobs.add(task.id)
                
                # Find and terminate the process
                process = self._active_processes.get(task.id)
                if process:
                    logger.info(f"[FFmpeg] Sending SIGTERM to PID {process.pid}")
                    try:
                        process.terminate()  # SIGTERM
                        
                        # Wait briefly for graceful shutdown
                        try:
                            process.wait(timeout=5)
                        except subprocess.TimeoutExpired:
                            # Escalate to SIGKILL
                            logger.warning(f"[FFmpeg] PID {process.pid} did not terminate, sending SIGKILL")
                            process.kill()  # SIGKILL
                            process.wait()
                    except ProcessLookupError:
                        pass  # Process already dead
                    
                    self._active_processes.pop(task.id, None)
        
        logger.info(f"[FFmpeg] Job {job.id} cancellation complete")
