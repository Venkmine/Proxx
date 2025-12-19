"""
Execution result models.

Structured representation of single-clip execution outcomes.
Results are machine-readable and human-readable.
"""

from enum import Enum
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class ExecutionStatus(str, Enum):
    """
    Execution outcome classification.
    
    SUCCESS: Render completed, output verified
    SUCCESS_WITH_WARNINGS: Render completed but with non-blocking warnings
    FAILED: Execution failed at any stage
    CANCELLED: Execution was cancelled by operator
    COMPLETED: Alias for SUCCESS (legacy compatibility)
    """
    
    SUCCESS = "success"
    SUCCESS_WITH_WARNINGS = "success_with_warnings"
    FAILED = "failed"
    CANCELLED = "cancelled"
    COMPLETED = "completed"  # Legacy alias for SUCCESS


class ExecutionResult(BaseModel):
    """
    Result of single-clip execution.
    
    Contains all information about what happened during execution:
    - Final status
    - Timing information
    - Warnings (non-blocking issues)
    - Failure reason (if failed)
    - Output path (if succeeded)
    
    This model is the single source of truth for execution outcome.
    """
    
    model_config = ConfigDict(extra="forbid")
    
    status: ExecutionStatus
    """Final execution status."""
    
    source_path: str
    """Source media file that was processed."""
    
    output_path: Optional[str] = None
    """Output file path (if render succeeded)."""
    
    started_at: datetime = Field(default_factory=datetime.now)
    """When execution started."""
    
    completed_at: Optional[datetime] = None
    """When execution completed (success or failure)."""
    
    warnings: List[str] = Field(default_factory=list)
    """Non-blocking warnings collected during execution."""
    
    failure_reason: Optional[str] = None
    """Human-readable failure reason (required if status is FAILED)."""
    
    def duration_seconds(self) -> Optional[float]:
        """Calculate execution duration in seconds."""
        if self.completed_at is None:
            return None
        delta = self.completed_at - self.started_at
        return delta.total_seconds()
    
    def summary(self) -> str:
        """Human-readable summary of execution result."""
        duration_str = ""
        if self.completed_at:
            duration = self.duration_seconds()
            if duration is not None:
                duration_str = f" ({duration:.1f}s)"
        
        if self.status in (ExecutionStatus.SUCCESS, ExecutionStatus.COMPLETED):
            return f"SUCCESS{duration_str}: {self.source_path} → {self.output_path}"
        
        elif self.status == ExecutionStatus.SUCCESS_WITH_WARNINGS:
            warning_count = len(self.warnings)
            return f"SUCCESS WITH {warning_count} WARNING(S){duration_str}: {self.source_path} → {self.output_path}"
        
        elif self.status == ExecutionStatus.FAILED:
            return f"FAILED{duration_str}: {self.source_path} - {self.failure_reason}"
        
        elif self.status == ExecutionStatus.CANCELLED:
            return f"CANCELLED{duration_str}: {self.source_path}"
        
        return f"{self.status.value.upper()}: {self.source_path}"
