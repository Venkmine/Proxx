"""
Watch folder data models.

All models use Pydantic with strict validation and no silent coercion.
"""

from datetime import datetime
from pathlib import Path
from typing import Optional
from pydantic import BaseModel, Field, field_validator


class WatchFolder(BaseModel):
    """
    Watch folder configuration.

    A watch folder monitors a directory for new media files and creates
    jobs automatically.

    Phase 11: Added preset binding and optional auto-execution.
    - preset_id: Optional global preset to bind to created jobs
    - auto_execute: If True AND preset_id is set, jobs may auto-execute
    
    Auto-execution requires explicit opt-in and is subject to safety checks.
    Default behavior remains manual (auto_execute=False).
    """

    model_config = {"extra": "forbid"}

    id: str = Field(..., description="Unique identifier for this watch folder")
    path: str = Field(..., description="Absolute path to monitored directory")
    enabled: bool = Field(
        default=True, description="Whether this watch folder is active"
    )
    recursive: bool = Field(
        default=True, description="Whether to monitor subdirectories"
    )
    preset_id: Optional[str] = Field(
        default=None, 
        description="Global preset ID to bind to jobs created from this folder"
    )
    auto_execute: bool = Field(
        default=False,
        description="Whether to automatically execute jobs (requires preset_id)"
    )
    created_at: datetime = Field(default_factory=datetime.now)

    @field_validator("path")
    @classmethod
    def validate_absolute_path(cls, v: str) -> str:
        """Ensure path is absolute."""
        p = Path(v)
        if not p.is_absolute():
            raise ValueError(f"Watch folder path must be absolute: {v}")
        return v


class FileStabilityCheck(BaseModel):
    """
    Result of a file stability check.

    Files are considered stable when their size has not changed for a
    configured number of consecutive checks.
    """

    model_config = {"extra": "forbid"}

    path: str = Field(..., description="Absolute path to checked file")
    is_stable: bool = Field(..., description="Whether file is stable")
    size_bytes: Optional[int] = Field(
        None, description="Current file size in bytes (None if file inaccessible)"
    )
    check_count: int = Field(
        default=0, description="Number of consecutive stable size checks"
    )
    reason: Optional[str] = Field(
        None, description="Human-readable explanation if unstable or inaccessible"
    )
