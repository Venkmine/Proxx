"""
Naming Resolution — Token-based filename generation.

This module handles the FIRST step of output path resolution:
- Parse naming template tokens
- Resolve tokens to actual values
- Store result on ClipTask.output_filename

The SECOND step (path resolution) happens in paths.py.

CRITICAL RULES:
1. Tokens resolve ONCE before render, stored on ClipTask
2. Engines receive resolved paths verbatim
3. Engines NEVER construct filenames or paths
"""

import re
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)


# Supported tokens for naming templates
# Each token maps to a resolver function
SUPPORTED_TOKENS = {
    "{source_name}",      # Source filename without extension
    "{reel}",             # Reel/tape name from metadata
    "{timecode}",         # Source timecode (TC format)
    "{frame_count}",      # Total frame count
    "{width}",            # Source video width
    "{height}",           # Source video height
    "{codec}",            # Output codec name
    "{preset}",           # Preset name
    "{job_name}",         # Job identifier (short form)
    "{camera}",           # Camera metadata
    "{date}",             # Current date (YYYYMMDD)
    "{datetime}",         # Current datetime (YYYYMMDD_HHMMSS)
}


def validate_naming_template(template: str) -> tuple[bool, Optional[str]]:
    """
    Validate a naming template.
    
    Returns:
        (is_valid, error_message)
    """
    if not template or not template.strip():
        return False, "Naming template cannot be empty"
    
    # Find all tokens in template
    tokens = re.findall(r'\{[^}]+\}', template)
    
    # Check for unsupported tokens
    unsupported = [t for t in tokens if t not in SUPPORTED_TOKENS]
    if unsupported:
        return False, f"Unsupported tokens: {', '.join(unsupported)}"
    
    # Check for invalid filename characters (excluding token braces)
    test_name = template
    for token in SUPPORTED_TOKENS:
        test_name = test_name.replace(token, "TOKEN")
    
    invalid_chars = set('<>:"/\\|?*')
    found_invalid = [c for c in test_name if c in invalid_chars]
    if found_invalid:
        return False, f"Invalid filename characters: {', '.join(set(found_invalid))}"
    
    return True, None


def resolve_filename(
    template: str,
    source_path: str,
    preset_name: Optional[str] = None,
    output_codec: Optional[str] = None,
    job_id: Optional[str] = None,
    # Clip metadata
    width: Optional[int] = None,
    height: Optional[int] = None,
    frame_count: Optional[int] = None,
    timecode: Optional[str] = None,
    reel_name: Optional[str] = None,
    camera: Optional[str] = None,
    # Optional prefix/suffix from FileCapabilities
    prefix: Optional[str] = None,
    suffix: Optional[str] = None,
) -> str:
    """
    Resolve naming template tokens to produce output filename.
    
    This produces the FILENAME ONLY, without extension.
    Extension is added by path resolution based on container.
    
    Args:
        template: Naming template with tokens
        source_path: Absolute path to source file
        preset_name: Name of render preset
        output_codec: Output codec identifier
        job_id: Job identifier
        width: Source video width
        height: Source video height
        frame_count: Total frame count
        timecode: Source timecode string
        reel_name: Reel/tape name
        camera: Camera identifier
        prefix: Optional prefix to prepend
        suffix: Optional suffix to append
        
    Returns:
        Resolved filename (without extension)
    """
    source = Path(source_path)
    source_name = source.stem  # Filename without extension
    
    # Build token value map
    now = datetime.now()
    
    token_values: Dict[str, str] = {
        "{source_name}": source_name,
        "{reel}": reel_name or "NOREEL",
        "{timecode}": _sanitize_timecode(timecode) if timecode else "00_00_00_00",
        "{frame_count}": str(frame_count) if frame_count else "0",
        "{width}": str(width) if width else "0",
        "{height}": str(height) if height else "0",
        "{codec}": output_codec or "unknown",
        "{preset}": preset_name or "default",
        "{job_name}": _short_job_id(job_id) if job_id else "job",
        "{camera}": camera or "CAM",
        "{date}": now.strftime("%Y%m%d"),
        "{datetime}": now.strftime("%Y%m%d_%H%M%S"),
    }
    
    # Resolve template
    result = template
    for token, value in token_values.items():
        result = result.replace(token, value)
    
    # Apply prefix/suffix
    if prefix:
        result = f"{prefix}{result}"
    if suffix:
        result = f"{result}{suffix}"
    
    # Sanitize for filesystem safety
    result = _sanitize_filename(result)
    
    return result


def _sanitize_timecode(tc: str) -> str:
    """
    Sanitize timecode for use in filename.
    
    Converts 01:23:45:06 → 01_23_45_06
    """
    return tc.replace(":", "_").replace(";", "_")


def _short_job_id(job_id: str) -> str:
    """
    Create short form of job ID for filename use.
    
    Takes first 8 characters of UUID.
    """
    return job_id[:8] if job_id else "job"


def _sanitize_filename(name: str) -> str:
    """
    Sanitize string for safe use as filename.
    
    Removes/replaces characters that are problematic on various filesystems.
    """
    # Replace problematic characters
    replacements = {
        '<': '',
        '>': '',
        ':': '-',
        '"': '',
        '/': '-',
        '\\': '-',
        '|': '-',
        '?': '',
        '*': '',
    }
    
    for char, replacement in replacements.items():
        name = name.replace(char, replacement)
    
    # Remove leading/trailing spaces and dots
    name = name.strip('. ')
    
    # Collapse multiple spaces/dashes
    name = re.sub(r'\s+', ' ', name)
    name = re.sub(r'-+', '-', name)
    
    # Ensure non-empty
    if not name:
        name = "output"
    
    return name
