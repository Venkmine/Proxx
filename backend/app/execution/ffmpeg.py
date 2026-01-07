"""
FFmpeg execution engine.

Phase 16: Real transcoding via subprocess.Popen.
Phase 16.1: Uses ResolvedPresetParams only - no CategoryPreset leakage.
Phase 16.4: Progress parsing, resolved output paths, watermark support.
Phase 17: DeliverSettings integration with engine_mapping layer.

Design rules:
- One subprocess per clip
- Capture stdout + stderr for audit
- Real-time progress parsing from FFmpeg stderr
- Non-zero exit code = FAILED
- SIGTERM → SIGKILL escalation for cancellation
- Engine receives RESOLVED output_path - NEVER constructs paths
- Engine receives DeliverSettings via engine_mapping translation
- Metadata passthrough is ON by default (editor-trust-critical)
- Text overlays via drawtext filter (Phase 17 scope: text only)
"""

import logging
import os
import select
import signal
import shutil
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, List, Callable, TYPE_CHECKING

from .progress import ProgressParser, ProgressInfo

from .base import (
    ExecutionEngine,
    EngineType,
    EngineCapability,
    EngineExecutionError,
    EngineValidationError,
)
from .results import ExecutionResult, ExecutionStatus
from .resolved_params import ResolvedPresetParams, DEFAULT_H264_PARAMS

if TYPE_CHECKING:
    from ..jobs.models import Job, ClipTask
    from ..presets.registry import PresetRegistry
    from ..deliver.settings import DeliverSettings

logger = logging.getLogger(__name__)


# FFmpeg codec mappings: video_codec string -> ffmpeg arguments
FFMPEG_CODEC_MAP: Dict[str, List[str]] = {
    # H.264 (via libx264)
    "h264": ["-c:v", "libx264"],
    
    # Phase 20: H.265/HEVC (via libx265)
    "h265": ["-c:v", "libx265", "-tag:v", "hvc1"],
    "hevc": ["-c:v", "libx265", "-tag:v", "hvc1"],
    
    # Phase 20: AV1 (via libaom-av1, software fallback)
    "av1": ["-c:v", "libaom-av1", "-cpu-used", "4"],  # cpu-used 4 for reasonable speed
    
    # ProRes variants
    "prores_proxy": ["-c:v", "prores_ks", "-profile:v", "0"],
    "prores_lt": ["-c:v", "prores_ks", "-profile:v", "1"],
    "prores_422": ["-c:v", "prores_ks", "-profile:v", "2"],
    "prores_422_hq": ["-c:v", "prores_ks", "-profile:v", "3"],
    "prores_4444": ["-c:v", "prores_ks", "-profile:v", "4"],
    "prores_4444_xq": ["-c:v", "prores_ks", "-profile:v", "5"],  # Phase 20: ProRes 4444 XQ
    
    # DNxHR variants
    "dnxhr_lb": ["-c:v", "dnxhd", "-profile:v", "dnxhr_lb"],
    "dnxhr_sq": ["-c:v", "dnxhd", "-profile:v", "dnxhr_sq"],
    "dnxhr_hq": ["-c:v", "dnxhd", "-profile:v", "dnxhr_hq"],
    "dnxhr_hqx": ["-c:v", "dnxhd", "-profile:v", "dnxhr_hqx"],
    "dnxhr_444": ["-c:v", "dnxhd", "-profile:v", "dnxhr_444"],
    
    # DNxHD variants (specific bitrates)
    "dnxhd_36": ["-c:v", "dnxhd", "-b:v", "36M"],
    "dnxhd_145": ["-c:v", "dnxhd", "-b:v", "145M"],
    "dnxhd_220": ["-c:v", "dnxhd", "-b:v", "220M"],
}

# Audio codec mappings
FFMPEG_AUDIO_MAP: Dict[str, List[str]] = {
    "copy": ["-c:a", "copy"],
    "aac": ["-c:a", "aac"],
    "pcm_s16le": ["-c:a", "pcm_s16le"],
    "pcm_s24le": ["-c:a", "pcm_s24le"],
}

# Maximum lines of stderr to store in clip.error
MAX_STDERR_LINES = 20


class FFmpegEngine(ExecutionEngine):
    """
    FFmpeg-based execution engine.
    
    Uses subprocess.Popen for real transcoding.
    State-only tracking (no progress parsing).
    
    Phase 16.1: Uses ResolvedPresetParams only.
    """
    
    def __init__(self):
        """Initialize FFmpeg engine."""
        self._active_processes: Dict[str, subprocess.Popen] = {}
        self._cancelled_tasks: set[str] = set()
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
        preset_id: Optional[str],
    ) -> tuple[bool, Optional[str]]:
        """
        Validate job can be executed by FFmpeg.
        
        Alpha: preset_id is optional. When None, job uses embedded settings
        and codec validation uses job.settings.video.codec directly.
        """
        from ..presets.models import PresetCategory
        
        # Check FFmpeg availability
        if not self.available:
            return False, "FFmpeg is not installed or not in PATH"
        
        # Alpha: If no preset, validate using job's embedded settings
        if preset_id is None:
            # Validate codec from job settings
            video_settings = job.settings.video
            codec_str = video_settings.codec if video_settings else "prores_422"
            
            # Check codec is supported by FFmpeg
            if codec_str not in FFMPEG_CODEC_MAP and codec_str != "h264":
                return False, f"Codec '{codec_str}' is not supported by FFmpeg engine"
        else:
            # Validate preset exists
            preset = preset_registry.get_global_preset(preset_id)
            if not preset:
                return False, f"Preset '{preset_id}' not found"
            
            # Validate codec preset exists and is compatible
            codec_ref = preset.category_refs.get(PresetCategory.CODEC, "")
            if not codec_ref:
                return False, "No codec preset reference in global preset"
            
            codec_preset = preset_registry.get_category_preset(PresetCategory.CODEC, codec_ref)
            if not codec_preset:
                return False, f"Codec preset '{codec_ref}' not found"
            
            # Check codec is supported by FFmpeg
            codec_type = getattr(codec_preset, "codec", None)
            if codec_type:
                codec_str = codec_type.value if hasattr(codec_type, 'value') else str(codec_type)
                # Allow h264 explicitly
                if codec_str not in FFMPEG_CODEC_MAP and codec_str != "h264":
                    return False, f"Codec '{codec_str}' is not supported by FFmpeg engine"
        
        # Validate source files exist
        missing_files = []
        for task in job.tasks:
            if not Path(task.source_path).is_file():
                missing_files.append(task.source_path)
        
        if missing_files:
            preview = ', '.join(missing_files[:3])
            suffix = f" and {len(missing_files) - 3} more" if len(missing_files) > 3 else ""
            return False, f"Missing source files: {preview}{suffix}"
        
        return True, None
    
    def _truncate_stderr(self, stderr: str) -> str:
        """Truncate stderr to last MAX_STDERR_LINES lines for storage."""
        lines = stderr.strip().split('\n')
        if len(lines) <= MAX_STDERR_LINES:
            return stderr.strip()
        return '\n'.join(lines[-MAX_STDERR_LINES:])
    
    def _build_ffmpeg_command(
        self,
        source_path: str,
        output_path: str,
        resolved_params: ResolvedPresetParams,
        watermark_text: Optional[str] = None,
    ) -> List[str]:
        """
        Build FFmpeg command line arguments from ResolvedPresetParams.
        
        Phase 16.4: This method receives ONLY ResolvedPresetParams.
        Engine NEVER constructs output paths - receives resolved path verbatim.
        Watermark text is applied via drawtext filter if provided.
        """
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
        
        # Video codec
        video_codec = resolved_params.video_codec
        if video_codec in FFMPEG_CODEC_MAP:
            cmd.extend(FFMPEG_CODEC_MAP[video_codec])
            
            # Phase 20: Add quality settings for codecs that support CRF
            if video_codec in ("h264", "h265", "hevc"):
                if resolved_params.video_quality is not None:
                    cmd.extend(["-crf", str(resolved_params.video_quality)])
                if resolved_params.video_preset:
                    cmd.extend(["-preset", resolved_params.video_preset])
            elif video_codec == "av1":
                # AV1 uses crf for quality control
                if resolved_params.video_quality is not None:
                    cmd.extend(["-crf", str(resolved_params.video_quality)])
        elif video_codec == "h264":
            # H.264 with quality settings (legacy path)
            cmd.extend(["-c:v", "libx264"])
            if resolved_params.video_quality is not None:
                cmd.extend(["-crf", str(resolved_params.video_quality)])
            if resolved_params.video_preset:
                cmd.extend(["-preset", resolved_params.video_preset])
        else:
            # Fallback to H.264
            logger.warning(f"Unknown codec '{video_codec}', falling back to H.264")
            cmd.extend(["-c:v", "libx264", "-crf", "23", "-preset", "medium"])
        
        # Build video filter chain
        filters: List[str] = []
        
        # Scaling filter
        if resolved_params.scale_mode != "none":
            target_width = resolved_params.target_width
            target_height = resolved_params.target_height
            if target_width and target_height:
                if resolved_params.scale_mode == "fit":
                    filters.append(
                        f"scale='min({target_width},iw)':'min({target_height},ih)':force_original_aspect_ratio=decrease"
                    )
                elif resolved_params.scale_mode == "fill":
                    filters.append(
                        f"scale={target_width}:{target_height}:force_original_aspect_ratio=increase,crop={target_width}:{target_height}"
                    )
                elif resolved_params.scale_mode == "stretch":
                    filters.append(f"scale={target_width}:{target_height}")
        
        # Phase 16.4: Watermark via drawtext filter
        if watermark_text:
            # Escape special characters for FFmpeg drawtext
            escaped_text = watermark_text.replace("'", "'\\\\\''")
            escaped_text = escaped_text.replace(":", "\\\\:")
            # Fixed position: bottom-right corner, white text, semi-transparent
            filters.append(
                f"drawtext=text='{escaped_text}':fontsize=24:fontcolor=white@0.7:"
                f"x=w-tw-20:y=h-th-20"
            )
        
        # Apply filter chain if any
        if filters:
            cmd.extend(["-vf", ",".join(filters)])
        
        # Audio codec
        audio_codec = resolved_params.audio_codec
        if audio_codec in FFMPEG_AUDIO_MAP:
            cmd.extend(FFMPEG_AUDIO_MAP[audio_codec])
        else:
            cmd.extend(["-c:a", audio_codec])
        
        # Audio bitrate (only if not copy)
        if audio_codec != "copy" and resolved_params.audio_bitrate:
            cmd.extend(["-b:a", resolved_params.audio_bitrate])
        
        # Output file
        cmd.append(output_path)
        
        return cmd
    
    def _build_command_from_deliver_settings(
        self,
        source_path: str,
        output_path: str,
        deliver_settings: "DeliverSettings",
        source_width: Optional[int] = None,
        source_height: Optional[int] = None,
        source_timecode: Optional[str] = None,
    ) -> tuple[List[str], List[str]]:
        """
        Build FFmpeg command from DeliverSettings via engine_mapping.
        
        Phase 17: This method uses the engine_mapping layer to translate
        DeliverSettings into FFmpeg arguments. This is the preferred method
        for new code.
        
        Args:
            source_path: Path to source file
            output_path: Resolved output path (engine uses verbatim)
            deliver_settings: Complete DeliverSettings
            source_width: Source video width for scaling
            source_height: Source video height for scaling
            source_timecode: Source timecode for burn-in
            
        Returns:
            (command_list, warnings_list) - FFmpeg command and any mapping warnings
        """
        from ..deliver.engine_mapping import map_to_ffmpeg
        
        # Map settings to FFmpeg arguments
        mapping_result = map_to_ffmpeg(
            settings=deliver_settings,
            source_width=source_width,
            source_height=source_height,
            source_timecode=source_timecode,
        )
        
        # Log any warnings
        warnings = []
        for warning in mapping_result.warnings:
            warning_msg = f"{warning.capability}: {warning.message}"
            if warning.fallback:
                warning_msg += f" (fallback: {warning.fallback})"
            logger.warning(f"[FFmpeg] Capability warning: {warning_msg}")
            warnings.append(warning_msg)
        
        # Build complete command
        ffmpeg_path = self._find_ffmpeg()
        if not ffmpeg_path:
            raise EngineExecutionError(
                EngineType.FFMPEG,
                "unknown",
                stderr="FFmpeg not found"
            )
        
        cmd = mapping_result.build_command(ffmpeg_path, source_path, output_path)
        
        return cmd, warnings
    
    def run_clip_with_deliver_settings(
        self,
        task: "ClipTask",
        deliver_settings: "DeliverSettings",
        output_path: str,
        on_progress: Optional[Callable[[ProgressInfo], None]] = None,
    ) -> ExecutionResult:
        """
        Execute a clip using DeliverSettings (Phase 17).
        
        This is the preferred method for executing clips with the full
        capability model. Uses engine_mapping for translation.
        
        Args:
            task: ClipTask with source path and metadata
            deliver_settings: Complete DeliverSettings
            output_path: Resolved output path (engine uses verbatim)
            on_progress: Optional progress callback
            
        Returns:
            ExecutionResult with status, warnings, timing
        """
        start_time = datetime.now()
        source_path = task.source_path
        
        # Ensure output directory exists
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        
        # Build command from DeliverSettings
        try:
            cmd, warnings = self._build_command_from_deliver_settings(
                source_path=source_path,
                output_path=output_path,
                deliver_settings=deliver_settings,
                source_width=task.width,
                source_height=task.height,
                source_timecode=None,  # TODO: Extract from metadata
            )
        except Exception as e:
            return ExecutionResult(
                status=ExecutionStatus.FAILED,
                source_path=source_path,
                output_path=None,
                failure_reason=f"Failed to build FFmpeg command: {e}",
                started_at=start_time,
                completed_at=datetime.now(),
            )
        
        # Execute using existing subprocess infrastructure
        return self._execute_ffmpeg_command(
            task=task,
            cmd=cmd,
            output_path=output_path,
            start_time=start_time,
            on_progress=on_progress,
            warnings=warnings,
        )
    
    def _execute_ffmpeg_command(
        self,
        task: "ClipTask",
        cmd: List[str],
        output_path: str,
        start_time: datetime,
        on_progress: Optional[Callable[[ProgressInfo], None]] = None,
        warnings: Optional[List[str]] = None,
    ) -> ExecutionResult:
        """
        Execute an FFmpeg command and handle output/progress.
        
        Internal method that handles subprocess execution, progress parsing,
        and result construction. Used by both legacy and DeliverSettings paths.
        
        V1 OBSERVABILITY: Records FFmpeg command and output to job trace.
        """
        from ..observability.trace import get_trace_manager
        
        warnings = warnings or []
        trace_mgr = get_trace_manager()
        
        # Log the command for audit
        cmd_string = " ".join(cmd)
        logger.info(f"[FFmpeg] Executing: {cmd_string}")
        
        # ======================================================
        # V1 OBSERVABILITY: Record FFmpeg command before execution
        # ======================================================
        # Try to find and update trace (may not exist if called outside job context)
        try:
            # Trace should exist if called from job engine
            # We'll record the FFmpeg command to any existing trace for this task's job
            trace = trace_mgr.load_trace(task.id[:8])  # Try job ID prefix
            if not trace:
                # Try to find trace by scanning (expensive, skip if not found)
                pass
        except Exception:
            trace = None
        
        # Initialize progress parser
        duration = task.duration if task.duration else 0.0
        progress_parser = ProgressParser(
            clip_id=task.id,
            duration=duration,
            on_progress=on_progress,
        )
        
        # Execute via subprocess
        try:
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            
            self._active_processes[task.id] = process
            logger.info(f"[FFmpeg] Started PID {process.pid} for clip {task.id}")
            
            # Read stderr for progress
            stderr_lines = []
            if process.stderr:
                import fcntl
                fd = process.stderr.fileno()
                flags = fcntl.fcntl(fd, fcntl.F_GETFL)
                fcntl.fcntl(fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)
                
                while True:
                    poll_result = process.poll()
                    
                    try:
                        readable, _, _ = select.select([process.stderr], [], [], 0.1)
                        if readable:
                            line = process.stderr.readline()
                            if line:
                                stderr_lines.append(line.rstrip())
                                progress_parser.parse_line(line)
                    except (OSError, ValueError):
                        pass
                    
                    if poll_result is not None:
                        remaining = process.stderr.read()
                        if remaining:
                            for line in remaining.split('\n'):
                                if line.strip():
                                    stderr_lines.append(line)
                                    progress_parser.parse_line(line)
                        break
            
            exit_code = process.returncode
            stderr = '\n'.join(stderr_lines)
            
            self._active_processes.pop(task.id, None)
            end_time = datetime.now()
            
            logger.info(f"[FFmpeg] PID {process.pid} exited with code {exit_code}")
            
            # ======================================================
            # V1 OBSERVABILITY: Log FFmpeg execution details
            # This is logged even if trace doesn't exist
            # ======================================================
            logger.debug(
                f"[FFmpeg][TRACE] command={cmd_string}, "
                f"exit_code={exit_code}, "
                f"stderr_lines={len(stderr_lines)}"
            )
            
            # Check for cancellation
            if task.id in self._cancelled_tasks:
                self._cancelled_tasks.discard(task.id)
                return ExecutionResult(
                    status=ExecutionStatus.CANCELLED,
                    source_path=task.source_path,
                    output_path=output_path,
                    failure_reason="Cancelled by operator",
                    started_at=start_time,
                    completed_at=end_time,
                    warnings=warnings,
                )
            
            if exit_code == 0:
                # Verify output exists
                if Path(output_path).is_file():
                    return ExecutionResult(
                        status=ExecutionStatus.COMPLETED,
                        source_path=task.source_path,
                        output_path=output_path,
                        started_at=start_time,
                        completed_at=end_time,
                        warnings=warnings,
                    )
                else:
                    return ExecutionResult(
                        status=ExecutionStatus.FAILED,
                        source_path=task.source_path,
                        output_path=output_path,
                        failure_reason="FFmpeg exited successfully but output file not found",
                        started_at=start_time,
                        completed_at=end_time,
                        warnings=warnings,
                    )
            else:
                return ExecutionResult(
                    status=ExecutionStatus.FAILED,
                    source_path=task.source_path,
                    output_path=output_path,
                    failure_reason=f"FFmpeg exited with code {exit_code}\n{self._truncate_stderr(stderr)}",
                    started_at=start_time,
                    completed_at=end_time,
                    warnings=warnings,
                )
                
        except Exception as e:
            self._active_processes.pop(task.id, None)
            return ExecutionResult(
                status=ExecutionStatus.FAILED,
                source_path=task.source_path,
                output_path=output_path,
                failure_reason=f"FFmpeg execution error: {e}",
                started_at=start_time,
                completed_at=datetime.now(),
                warnings=warnings,
            )
    
    def run_clip(
        self,
        task: "ClipTask",
        resolved_params: ResolvedPresetParams,
        output_path: Optional[str] = None,
        watermark_text: Optional[str] = None,
        on_progress: Optional[Callable[[ProgressInfo], None]] = None,
    ) -> ExecutionResult:
        """
        Execute a single clip with FFmpeg.
        
        Phase 16.4: CRITICAL DESIGN RULES
        - Engine receives RESOLVED output_path - NEVER constructs paths
        - output_path must be provided - no fallback to source directory
        - Progress is parsed from FFmpeg stderr in real-time
        - Watermark applied via drawtext filter if text provided
        
        Args:
            task: ClipTask with source path and metadata
            resolved_params: ResolvedPresetParams (NOT CategoryPreset)
            output_path: RESOLVED output path - engine uses verbatim
            watermark_text: Optional watermark text to overlay
            on_progress: Optional callback for progress updates
            
        Returns:
            ExecutionResult with status, output path, timing.
        """
        # Type guard: reject CategoryPreset or GlobalPreset if somehow passed
        if not isinstance(resolved_params, ResolvedPresetParams):
            raise EngineValidationError(
                EngineType.FFMPEG,
                f"CategoryPreset or GlobalPreset leaked to engine! "
                f"Received {type(resolved_params).__name__} instead of ResolvedPresetParams. "
                f"This is a bug in the caller - presets must be resolved before reaching engine."
            )
        
        logger.info(f"[TRACE:FFMPEG:ENTRY] ═══ FFmpegEngine.run_clip CALLED ═══")
        logger.info(f"[TRACE:FFMPEG:ENTRY] Task ID: {task.id}")
        logger.info(f"[TRACE:FFMPEG:ENTRY] Source: {task.source_path}")
        logger.info(f"[TRACE:FFMPEG:ENTRY] Output: {output_path}")
        logger.info(f"[TRACE:FFMPEG:ENTRY] Codec: {resolved_params.video_codec}")
        
        start_time = datetime.now()
        source_path_str = task.source_path
        
        # Phase 16.4: Engine MUST receive resolved output_path
        # Fallback to task.output_path if not provided as argument
        if output_path is None:
            output_path = task.output_path
        
        if output_path is None:
            return ExecutionResult(
                status=ExecutionStatus.FAILED,
                source_path=source_path_str,
                output_path=None,
                failure_reason="No output path provided. Caller must resolve output path before engine invocation.",
                started_at=start_time,
                completed_at=datetime.now(),
            )
        
        output_path_obj = Path(output_path)
        
        # Ensure output directory exists
        output_path_obj.parent.mkdir(parents=True, exist_ok=True)
        
        # Build command
        try:
            logger.info(f"[TRACE:FFMPEG:BUILD] Building FFmpeg command")
            cmd = self._build_ffmpeg_command(
                source_path=source_path_str,
                output_path=output_path,
                resolved_params=resolved_params,
                watermark_text=watermark_text,
            )
            logger.info(f"[TRACE:FFMPEG:BUILD] Command built: {' '.join(cmd[:5])}... ({len(cmd)} args)")
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
        logger.info(f"[TRACE:FFMPEG:EXEC] ═══ SPAWNING FFmpeg SUBPROCESS ═══")
        logger.info(f"[TRACE:FFMPEG:EXEC] Full command: {cmd_string}")
        
        # Initialize progress parser
        duration = task.duration if task.duration else 0.0
        progress_parser = ProgressParser(
            clip_id=task.id,
            duration=duration,
            on_progress=on_progress,
        )
        
        # Execute via subprocess with non-blocking stderr for progress
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
            
            # Read stderr line by line for progress (with select for non-blocking)
            stderr_lines = []
            if process.stderr:
                # Use select to read stderr non-blocking on Unix
                import fcntl
                fd = process.stderr.fileno()
                flags = fcntl.fcntl(fd, fcntl.F_GETFL)
                fcntl.fcntl(fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)
                
                while True:
                    # Check if process has terminated
                    poll_result = process.poll()
                    
                    try:
                        readable, _, _ = select.select([process.stderr], [], [], 0.1)
                        if readable:
                            line = process.stderr.readline()
                            if line:
                                stderr_lines.append(line.rstrip())
                                # Parse progress from this line
                                progress_parser.parse_line(line)
                    except (OSError, ValueError):
                        # Handle closed file descriptors
                        pass
                    
                    if poll_result is not None:
                        # Process finished, read remaining stderr
                        remaining = process.stderr.read()
                        if remaining:
                            for line in remaining.split('\n'):
                                if line.strip():
                                    stderr_lines.append(line)
                                    progress_parser.parse_line(line)
                        break
            
            exit_code = process.returncode
            stderr = '\n'.join(stderr_lines)
            
            # Remove from active processes
            self._active_processes.pop(task.id, None)
            
            end_time = datetime.now()
            
            logger.info(f"[FFmpeg] PID {process.pid} exited with code {exit_code}")
            logger.info(f"[TRACE:FFMPEG:DONE] ═══ FFmpeg COMPLETED ═══")
            logger.info(f"[TRACE:FFMPEG:DONE] Exit code: {exit_code}")
            logger.info(f"[TRACE:FFMPEG:DONE] Duration: {(end_time - start_time).total_seconds():.1f}s")
            
            # Log full stderr for debugging (before truncation)
            if stderr:
                logger.debug(f"[FFmpeg] Full stderr for {task.id}:\n{stderr}")
            
            # Check for cancellation
            if task.id in self._cancelled_tasks:
                self._cancelled_tasks.discard(task.id)
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
                # Truncate stderr to last N lines for storage
                truncated_stderr = self._truncate_stderr(stderr) if stderr else ""
                failure_reason = truncated_stderr if truncated_stderr else f"FFmpeg exited with code {exit_code}"
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
            if not output_path_obj.is_file():
                return ExecutionResult(
                    status=ExecutionStatus.FAILED,
                    source_path=source_path_str,
                    output_path=None,
                    failure_reason="Output file was not created",
                    started_at=start_time,
                    completed_at=end_time,
                )
            
            # Success
            logger.info(f"[FFmpeg] Completed: {output_path}")
            return ExecutionResult(
                status=ExecutionStatus.SUCCESS,
                source_path=source_path_str,
                output_path=output_path,
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
                self._cancelled_tasks.add(task.id)
                
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
