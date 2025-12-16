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
    PENDING jobs automatically. Jobs are never auto-executed in Phase 10.

    NO preset is applied during job creation. Preset application is deferred
    to Phase 11 (execution automation).
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
