"""
V2 JobSpec - Deterministic, serializable job specification for the Reliable Proxy Engine.

This module defines the JobSpec dataclass which serves as the single source of truth
for proxy job configuration. It is independent of UI state and designed for
deterministic, reproducible job execution.

Part of V2 Phase 1 (Option A: Reliable Proxy Engine)
"""

from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional
import json
import uuid


class FpsMode(str, Enum):
    """Frame rate handling mode for proxy generation."""
    SAME_AS_SOURCE = "same-as-source"
    EXPLICIT = "explicit"


class JobSpecValidationError(Exception):
    """Raised when JobSpec validation fails."""
    pass


@dataclass
class JobSpec:
    """
    Deterministic, serializable specification for a proxy transcoding job.
    
    This dataclass fully describes a proxy job independent of UI state.
    It is the single source of truth for job configuration and can be
    serialized to JSON for persistence, logging, and debugging.
    
    Attributes:
        job_id: Unique identifier for this job (auto-generated if not provided)
        sources: Ordered list of absolute paths to source media files
        output_directory: Absolute path to output directory for proxies
        codec: Video codec for proxy encoding (e.g., 'prores_proxy', 'h264')
        container: Container format (e.g., 'mov', 'mp4')
        resolution: Target resolution (e.g., '1920x1080', '1280x720', 'half', 'quarter')
        fps_mode: Frame rate handling mode
        fps_explicit: Explicit frame rate value (required if fps_mode is EXPLICIT)
        naming_template: Template string for output file naming
        resolved_tokens: Dictionary of resolved naming tokens (populated during execution)
        created_at: ISO 8601 timestamp of job creation
    """
    
    sources: List[str]
    output_directory: str
    codec: str
    container: str
    resolution: str
    naming_template: str
    job_id: str = field(default_factory=lambda: uuid.uuid4().hex[:8])
    fps_mode: FpsMode = FpsMode.SAME_AS_SOURCE
    fps_explicit: Optional[float] = None
    resolved_tokens: Dict[str, str] = field(default_factory=dict)
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    
    # -------------------------------------------------------------------------
    # Serialization
    # -------------------------------------------------------------------------
    
    def to_dict(self) -> Dict[str, Any]:
        """
        Serialize JobSpec to a dictionary with stable key ordering.
        
        Returns:
            Dictionary representation suitable for JSON serialization.
        """
        return {
            "job_id": self.job_id,
            "sources": list(self.sources),  # Preserve order
            "output_directory": self.output_directory,
            "codec": self.codec,
            "container": self.container,
            "resolution": self.resolution,
            "fps_mode": self.fps_mode.value if isinstance(self.fps_mode, FpsMode) else self.fps_mode,
            "fps_explicit": self.fps_explicit,
            "naming_template": self.naming_template,
            "resolved_tokens": dict(sorted(self.resolved_tokens.items())),  # Stable ordering
            "created_at": self.created_at,
        }
    
    def to_json(self, indent: int = 2) -> str:
        """
        Serialize JobSpec to JSON string with stable ordering.
        
        Args:
            indent: JSON indentation level (default: 2)
            
        Returns:
            JSON string representation of the JobSpec.
        """
        return json.dumps(self.to_dict(), indent=indent, sort_keys=False)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "JobSpec":
        """
        Deserialize JobSpec from a dictionary.
        
        Args:
            data: Dictionary containing JobSpec fields.
            
        Returns:
            New JobSpec instance.
            
        Raises:
            KeyError: If required fields are missing.
            ValueError: If field values are invalid.
        """
        # Handle fps_mode enum conversion
        fps_mode_value = data.get("fps_mode", FpsMode.SAME_AS_SOURCE)
        if isinstance(fps_mode_value, str):
            fps_mode = FpsMode(fps_mode_value)
        else:
            fps_mode = fps_mode_value
        
        return cls(
            job_id=data.get("job_id", uuid.uuid4().hex[:8]),
            sources=list(data["sources"]),
            output_directory=data["output_directory"],
            codec=data["codec"],
            container=data["container"],
            resolution=data["resolution"],
            fps_mode=fps_mode,
            fps_explicit=data.get("fps_explicit"),
            naming_template=data["naming_template"],
            resolved_tokens=data.get("resolved_tokens", {}),
            created_at=data.get("created_at", datetime.now(timezone.utc).isoformat()),
        )
    
    @classmethod
    def from_json(cls, json_str: str) -> "JobSpec":
        """
        Deserialize JobSpec from a JSON string.
        
        Args:
            json_str: JSON string containing JobSpec data.
            
        Returns:
            New JobSpec instance.
        """
        return cls.from_dict(json.loads(json_str))
    
    # -------------------------------------------------------------------------
    # Validation
    # -------------------------------------------------------------------------
    
    # Known valid codec/container combinations
    VALID_CODEC_CONTAINERS: Dict[str, List[str]] = {
        "prores_proxy": ["mov"],
        "prores_lt": ["mov"],
        "prores_standard": ["mov"],
        "prores_hq": ["mov"],
        "prores_4444": ["mov"],
        "h264": ["mp4", "mov", "mkv"],
        "h265": ["mp4", "mov", "mkv"],
        "hevc": ["mp4", "mov", "mkv"],
        "dnxhd": ["mov", "mxf"],
        "dnxhr": ["mov", "mxf"],
        "vp9": ["webm", "mkv"],
        "av1": ["mp4", "mkv", "webm"],
    }
    
    # Known naming template tokens
    KNOWN_TOKENS: List[str] = [
        "{source_name}",
        "{source_ext}",
        "{job_id}",
        "{date}",
        "{time}",
        "{index}",
        "{codec}",
        "{resolution}",
    ]
    
    def validate_paths_exist(self) -> None:
        """
        Validate that all source paths exist and output directory is writable.
        
        Raises:
            JobSpecValidationError: If any path validation fails.
        """
        errors: List[str] = []
        
        # Validate source files exist
        for source in self.sources:
            source_path = Path(source)
            if not source_path.exists():
                errors.append(f"Source file does not exist: {source}")
            elif not source_path.is_file():
                errors.append(f"Source path is not a file: {source}")
        
        # Validate output directory
        output_path = Path(self.output_directory)
        if not output_path.exists():
            errors.append(f"Output directory does not exist: {self.output_directory}")
        elif not output_path.is_dir():
            errors.append(f"Output path is not a directory: {self.output_directory}")
        
        if errors:
            raise JobSpecValidationError(
                f"Path validation failed with {len(errors)} error(s):\n" +
                "\n".join(f"  - {e}" for e in errors)
            )
    
    def validate_codec_container(self) -> None:
        """
        Validate that the codec/container combination is valid.
        
        Raises:
            JobSpecValidationError: If the combination is invalid.
        """
        codec_lower = self.codec.lower()
        container_lower = self.container.lower().lstrip(".")
        
        if codec_lower not in self.VALID_CODEC_CONTAINERS:
            valid_codecs = ", ".join(sorted(self.VALID_CODEC_CONTAINERS.keys()))
            raise JobSpecValidationError(
                f"Unknown codec '{self.codec}'. Valid codecs are: {valid_codecs}"
            )
        
        valid_containers = self.VALID_CODEC_CONTAINERS[codec_lower]
        if container_lower not in valid_containers:
            raise JobSpecValidationError(
                f"Invalid container '{self.container}' for codec '{self.codec}'. "
                f"Valid containers for {self.codec}: {', '.join(valid_containers)}"
            )
    
    def validate_naming_tokens_resolvable(self) -> None:
        """
        Validate that all tokens in the naming template are known/resolvable.
        
        Raises:
            JobSpecValidationError: If unknown tokens are found.
        """
        import re
        
        # Extract all tokens from template
        token_pattern = r"\{[^}]+\}"
        found_tokens = re.findall(token_pattern, self.naming_template)
        
        unknown_tokens: List[str] = []
        for token in found_tokens:
            if token not in self.KNOWN_TOKENS:
                unknown_tokens.append(token)
        
        if unknown_tokens:
            known_list = ", ".join(self.KNOWN_TOKENS)
            raise JobSpecValidationError(
                f"Unknown tokens in naming template: {', '.join(unknown_tokens)}. "
                f"Known tokens: {known_list}"
            )
    
    def validate_fps_mode(self) -> None:
        """
        Validate FPS mode configuration.
        
        Raises:
            JobSpecValidationError: If fps_mode is EXPLICIT but fps_explicit is not set.
        """
        if self.fps_mode == FpsMode.EXPLICIT and self.fps_explicit is None:
            raise JobSpecValidationError(
                "fps_mode is 'explicit' but fps_explicit value is not set. "
                "Provide a numeric frame rate value (e.g., 24.0, 29.97, 30.0)."
            )
        
        if self.fps_explicit is not None and self.fps_explicit <= 0:
            raise JobSpecValidationError(
                f"fps_explicit must be a positive number, got: {self.fps_explicit}"
            )
    
    def validate(self, check_paths: bool = True) -> None:
        """
        Run all validation checks.
        
        Args:
            check_paths: Whether to validate that paths exist (default: True).
                        Set to False for dry-run or pre-flight checks.
        
        Raises:
            JobSpecValidationError: If any validation fails.
        """
        # Always validate these
        self.validate_codec_container()
        self.validate_naming_tokens_resolvable()
        self.validate_fps_mode()
        
        # Optionally validate paths
        if check_paths:
            self.validate_paths_exist()
    
    # -------------------------------------------------------------------------
    # Utility
    # -------------------------------------------------------------------------
    
    def __repr__(self) -> str:
        return (
            f"JobSpec(job_id={self.job_id!r}, "
            f"sources=[{len(self.sources)} files], "
            f"codec={self.codec!r}, "
            f"container={self.container!r})"
        )
