"""
Resolve data models.

Pydantic models for Resolve capability detection, installation info,
and command descriptor preparation.
"""

from typing import Optional
from pathlib import Path
from pydantic import BaseModel, ConfigDict, field_validator


class ResolveInstallation(BaseModel):
    """
    Represents a discovered Resolve installation.
    
    Contains paths and metadata about a detected Resolve installation,
    including version information and API access paths.
    """
    model_config = ConfigDict(extra="forbid")
    
    install_path: Path
    """Absolute path to Resolve installation directory."""
    
    version: Optional[str] = None
    """Detected Resolve version string (e.g., '18.6.4'), if available."""
    
    script_api_path: Optional[Path] = None
    """Path to Resolve scripting API directory, if detected."""
    
    is_studio: Optional[bool] = None
    """True if Studio license detected, False if Free, None if unknown."""
    
    @field_validator("install_path", mode="before")
    @classmethod
    def validate_install_path(cls, v):
        """Ensure install_path is absolute."""
        if isinstance(v, str):
            v = Path(v)
        if not v.is_absolute():
            raise ValueError(f"install_path must be absolute: {v}")
        return v
    
    @field_validator("script_api_path", mode="before")
    @classmethod
    def validate_script_api_path(cls, v):
        """Ensure script_api_path is absolute if provided."""
        if v is None:
            return v
        if isinstance(v, str):
            v = Path(v)
        if not v.is_absolute():
            raise ValueError(f"script_api_path must be absolute: {v}")
        return v


class ResolveCapability(BaseModel):
    """
    Represents Resolve system capability status.
    
    Indicates whether Resolve is available and usable for rendering,
    with detailed reasons if it is not.
    """
    model_config = ConfigDict(extra="forbid")
    
    is_available: bool
    """True if Resolve is installed and usable, False otherwise."""
    
    installation: Optional[ResolveInstallation] = None
    """Detected installation info, if Resolve was found."""
    
    failure_reason: Optional[str] = None
    """Human-readable explanation if Resolve is not available."""
    
    @field_validator("failure_reason")
    @classmethod
    def validate_failure_reason(cls, v, info):
        """Ensure failure_reason is set when not available."""
        is_available = info.data.get("is_available", True)
        if not is_available and not v:
            raise ValueError("failure_reason must be provided when is_available is False")
        if is_available and v:
            raise ValueError("failure_reason must not be set when is_available is True")
        return v


class ResolveCommandDescriptor(BaseModel):
    """
    Describes a Resolve render command without execution details.
    
    This is an abstract representation of what would be invoked
    to render via Resolve scripting API. It does NOT contain
    job-specific logic or preset application - only structural
    information for future execution phases.
    
    NOTE: This is a Phase 5 foundation. Command descriptors will
    evolve in Phase 6+ when execution pipelines are implemented.
    """
    model_config = ConfigDict(extra="forbid")
    
    source_path: Path
    """Absolute path to source media file."""
    
    output_path: Path
    """Absolute path to target render output file."""
    
    render_preset_id: Optional[str] = None
    """Reference to a global preset ID (future use)."""
    
    invocation_type: str = "script"
    """How Resolve would be invoked: 'script' or 'cli' (reserved)."""
    
    @field_validator("source_path", "output_path", mode="before")
    @classmethod
    def validate_paths(cls, v):
        """Ensure paths are absolute."""
        if isinstance(v, str):
            v = Path(v)
        if not v.is_absolute():
            raise ValueError(f"Path must be absolute: {v}")
        return v
    
    @field_validator("invocation_type")
    @classmethod
    def validate_invocation_type(cls, v):
        """Ensure invocation_type is valid."""
        if v not in ("script", "cli"):
            raise ValueError(f"invocation_type must be 'script' or 'cli', got: {v}")
        return v
