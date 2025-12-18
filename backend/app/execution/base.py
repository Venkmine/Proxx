"""
Execution engine abstraction layer.

Phase 16: Formal engine interface for FFmpeg (real) and Resolve (stub).

Design rules:
- Each job binds to exactly ONE engine at job creation
- Engine binding is explicit, never inferred
- No engine fallback or auto-switching
- Presets are engine-scoped
- Engine at JOB level only, not clip level
"""

from abc import ABC, abstractmethod
from enum import Enum
from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from ..jobs.models import Job, ClipTask
    from ..presets.registry import PresetRegistry
    from .results import ExecutionResult


class EngineType(str, Enum):
    """
    Supported execution engines.
    
    Engine binding is explicit at job creation.
    No inference, no fallback, no magic.
    """
    
    FFMPEG = "ffmpeg"
    RESOLVE = "resolve"


class EngineCapability(str, Enum):
    """
    Engine capability flags.
    
    Used to validate preset compatibility with engines.
    """
    
    TRANSCODE = "transcode"
    SCALE = "scale"
    WATERMARK = "watermark"
    AUDIO_PASSTHROUGH = "audio_passthrough"


class ExecutionEngine(ABC):
    """
    Abstract base class for execution engines.
    
    All engines must implement:
    - validate_job: Pre-execution validation
    - run_clip: Execute single clip
    - cancel_job: Graceful cancellation with cleanup
    
    Engines are stateless - all context passed per-call.
    """
    
    @property
    @abstractmethod
    def engine_type(self) -> EngineType:
        """Return the engine type identifier."""
        pass
    
    @property
    @abstractmethod
    def name(self) -> str:
        """Human-readable engine name for logs and UI."""
        pass
    
    @property
    @abstractmethod
    def available(self) -> bool:
        """
        Check if engine is available on this system.
        
        Returns:
            True if engine can execute, False if not installed/configured.
        """
        pass
    
    @property
    @abstractmethod
    def capabilities(self) -> set[EngineCapability]:
        """
        Return the set of capabilities this engine supports.
        """
        pass
    
    @abstractmethod
    def validate_job(
        self,
        job: "Job",
        preset_registry: "PresetRegistry",
        preset_id: str,
    ) -> tuple[bool, Optional[str]]:
        """
        Validate a job before execution.
        
        Checks:
        - Source files exist
        - Preset is compatible with engine
        - Engine-specific requirements
        
        Args:
            job: Job to validate
            preset_registry: Registry for preset lookup
            preset_id: Bound preset ID
            
        Returns:
            Tuple of (is_valid, error_message)
            error_message is None if valid
        """
        pass
    
    @abstractmethod
    def run_clip(
        self,
        task: "ClipTask",
        preset_registry: "PresetRegistry",
        preset_id: str,
        output_base_dir: Optional[str] = None,
    ) -> "ExecutionResult":
        """
        Execute a single clip.
        
        Args:
            task: ClipTask to execute
            preset_registry: Registry for preset lookup
            preset_id: Bound preset ID
            output_base_dir: Output directory (defaults to source dir)
            
        Returns:
            ExecutionResult with status, output path, timing
        """
        pass
    
    @abstractmethod
    def cancel_job(self, job: "Job") -> None:
        """
        Cancel execution for a job.
        
        Behavior:
        - Stop running clip (SIGTERM, then SIGKILL)
        - Mark remaining clips SKIPPED
        - Clean up temp files
        
        Args:
            job: Job to cancel
        """
        pass


class EngineNotAvailableError(Exception):
    """Raised when an engine is requested but not available on this system."""
    
    def __init__(self, engine_type: EngineType, reason: str = ""):
        self.engine_type = engine_type
        self.reason = reason
        message = f"Engine '{engine_type.value}' is not available"
        if reason:
            message += f": {reason}"
        super().__init__(message)


class EngineValidationError(Exception):
    """Raised when job validation fails for an engine."""
    
    def __init__(self, engine_type: EngineType, message: str):
        self.engine_type = engine_type
        super().__init__(f"[{engine_type.value}] Validation failed: {message}")


class EngineExecutionError(Exception):
    """Raised when clip execution fails in an engine."""
    
    def __init__(
        self,
        engine_type: EngineType,
        clip_id: str,
        exit_code: Optional[int] = None,
        stderr: Optional[str] = None,
    ):
        self.engine_type = engine_type
        self.clip_id = clip_id
        self.exit_code = exit_code
        self.stderr = stderr
        
        message = f"[{engine_type.value}] Clip {clip_id} execution failed"
        if exit_code is not None:
            message += f" (exit code: {exit_code})"
        super().__init__(message)
