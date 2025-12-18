"""
DaVinci Resolve execution engine stub.

Phase 16: Stub only - NOT implemented.
Real Resolve integration is Phase 17+.

This exists to:
- Complete the engine abstraction
- Allow UI to show "coming soon"
- Preserve existing resolve_api.py code for future integration
"""

import logging
from typing import Optional, TYPE_CHECKING

from .base import (
    ExecutionEngine,
    EngineType,
    EngineCapability,
    EngineNotAvailableError,
)
from .results import ExecutionResult, ExecutionStatus

if TYPE_CHECKING:
    from ..jobs.models import Job, ClipTask
    from ..presets.registry import PresetRegistry

logger = logging.getLogger(__name__)


class ResolveEngine(ExecutionEngine):
    """
    DaVinci Resolve execution engine.
    
    Phase 16: STUB ONLY.
    All methods raise EngineNotAvailableError.
    
    Future implementation (Phase 17+) will:
    - Use existing resolve_api.py
    - Integrate with Resolve Python scripting API
    - Support native Resolve codec mapping
    """
    
    @property
    def engine_type(self) -> EngineType:
        return EngineType.RESOLVE
    
    @property
    def name(self) -> str:
        return "DaVinci Resolve"
    
    @property
    def available(self) -> bool:
        """
        Resolve engine is not available in Phase 16.
        
        Returns False to prevent selection.
        """
        return False
    
    @property
    def capabilities(self) -> set[EngineCapability]:
        """
        Resolve supports all capabilities.
        
        Note: This is future capability, not current.
        """
        return {
            EngineCapability.TRANSCODE,
            EngineCapability.SCALE,
            EngineCapability.WATERMARK,
            EngineCapability.AUDIO_PASSTHROUGH,
        }
    
    def validate_job(
        self,
        job: "Job",
        preset_registry: "PresetRegistry",
        preset_id: str,
    ) -> tuple[bool, Optional[str]]:
        """
        Validation stub - always returns False.
        """
        return False, "Resolve engine is not yet available (coming in Phase 17)"
    
    def run_clip(
        self,
        task: "ClipTask",
        preset_registry: "PresetRegistry",
        preset_id: str,
        output_base_dir: Optional[str] = None,
    ) -> ExecutionResult:
        """
        Execution stub - returns FAILED result.
        """
        from datetime import datetime
        
        logger.warning(
            f"[Resolve] Attempted to execute clip {task.id} but Resolve engine is not available"
        )
        
        return ExecutionResult(
            status=ExecutionStatus.FAILED,
            source_path=task.source_path,
            output_path=None,
            failure_reason="Resolve engine is not yet available (coming in Phase 17)",
            started_at=datetime.now(),
            completed_at=datetime.now(),
        )
    
    def cancel_job(self, job: "Job") -> None:
        """
        Cancellation stub - no-op since nothing is running.
        """
        logger.info(f"[Resolve] Cancel requested for job {job.id} (no-op - engine not available)")
