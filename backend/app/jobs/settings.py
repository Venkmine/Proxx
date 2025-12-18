"""
Job Settings dataclass.

Phase 16.4: Explicit, editable job settings.

JobSettings define HOW outputs will be created:
- Set BEFORE render starts
- Editable only while job.status == PENDING
- Frozen once any clip enters RUNNING

This is NOT a Pydantic model to enforce immutability at the type level.
Path fields are stored as strings for JSON serialization safety.
"""

from dataclasses import dataclass, field
from typing import Optional


# Default naming template (backward compatible with existing behavior)
DEFAULT_NAMING_TEMPLATE = "{source_name}__proxx"


@dataclass(frozen=True)
class JobSettings:
    """
    Immutable job settings.
    
    All settings that define output behavior.
    Frozen after dataclass creation - create new instance to "modify".
    
    Path Serialization:
    - output_dir is stored as str (not Path) for JSON safety
    - Convert to Path at usage site, not storage
    """
    
    # Output directory (absolute path as string)
    # If None, falls back to source file's parent directory
    output_dir: Optional[str] = None
    
    # Naming template with tokens
    # Supported tokens: {source_name}, {reel}, {frame_count}, {width}, {height},
    #                   {codec}, {preset}, {job_name}
    naming_template: str = DEFAULT_NAMING_TEMPLATE
    
    # Optional prefix/suffix for output filename
    file_prefix: Optional[str] = None
    file_suffix: Optional[str] = None
    
    # Folder structure preservation
    # If True, recreate source directory structure in output_dir
    preserve_source_dirs: bool = False
    
    # How many directory levels to preserve (from source path end)
    # Only used if preserve_source_dirs is True
    # e.g., preserve_dir_levels=2 for /a/b/c/d/file.mov → output_dir/c/d/file.mov
    preserve_dir_levels: int = 0
    
    # Watermark settings (foundation only)
    # Phase 16.4: Text watermark via FFmpeg drawtext
    watermark_enabled: bool = False
    watermark_text: Optional[str] = None
    
    def to_dict(self) -> dict:
        """Serialize to dictionary for JSON storage."""
        return {
            "output_dir": self.output_dir,
            "naming_template": self.naming_template,
            "file_prefix": self.file_prefix,
            "file_suffix": self.file_suffix,
            "preserve_source_dirs": self.preserve_source_dirs,
            "preserve_dir_levels": self.preserve_dir_levels,
            "watermark_enabled": self.watermark_enabled,
            "watermark_text": self.watermark_text,
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> "JobSettings":
        """Deserialize from dictionary."""
        return cls(
            output_dir=data.get("output_dir"),
            naming_template=data.get("naming_template", DEFAULT_NAMING_TEMPLATE),
            file_prefix=data.get("file_prefix"),
            file_suffix=data.get("file_suffix"),
            preserve_source_dirs=data.get("preserve_source_dirs", False),
            preserve_dir_levels=data.get("preserve_dir_levels", 0),
            watermark_enabled=data.get("watermark_enabled", False),
            watermark_text=data.get("watermark_text"),
        )
    
    def with_updates(self, **kwargs) -> "JobSettings":
        """
        Create a new JobSettings with specified fields updated.
        
        Since dataclass is frozen, we return a new instance.
        This is the only way to "modify" settings.
        """
        current = self.to_dict()
        current.update(kwargs)
        return JobSettings.from_dict(current)


# Default settings instance for convenience
DEFAULT_JOB_SETTINGS = JobSettings()
