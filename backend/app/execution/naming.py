"""
Naming token resolver.

Phase 16.4: Token-based filename generation.

Resolves naming templates with tokens BEFORE render starts.
Engines never construct filenames - they receive resolved names.

Supported tokens:
- {source_name}  : Source filename without extension
- {reel}         : Reel name (from metadata if available)
- {frame_count}  : Total frame count
- {width}        : Frame width in pixels
- {height}       : Frame height in pixels
- {codec}        : Output codec name
- {preset}       : Preset ID used for this job
- {job_name}     : Job identifier (short form)
- {fps}          : Frame rate (alias for frame_rate)
- {tc}           : Source timecode start (alias for timecode)
- {timecode}     : Source timecode start
- {date}         : Current date (YYYYMMDD)
- {datetime}     : Current datetime (YYYYMMDD_HHMMSS)

V1 CONSTRAINT: All tokens MUST resolve fully or fail loudly.
Unknown tokens are left as-is to surface template errors visibly.

Rules:
- Tokens resolved once, stored on ClipTask.output_filename
- Missing token values become empty string (not "N/A")
- Invalid tokens are left as-is (for debugging)
"""

import re
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from ..jobs.models import ClipTask, Job
    from .resolved_params import ResolvedPresetParams


# Regex to match tokens like {source_name}
TOKEN_PATTERN = re.compile(r'\{(\w+)\}')


def resolve_filename(
    template: str,
    clip: "ClipTask",
    job: "Job",
    resolved_params: "ResolvedPresetParams",
    preset_id: Optional[str] = None,
) -> str:
    """
    Resolve naming template to final filename (without extension).
    
    This function is called ONCE per clip, BEFORE render starts.
    The result is stored on clip.output_filename.
    
    Args:
        template: Naming template with tokens (e.g., "{source_name}_{preset}")
        clip: ClipTask with source path and metadata
        job: Parent job
        resolved_params: Resolved preset parameters (for codec info)
        preset_id: Preset ID for {preset} token
        
    Returns:
        Resolved filename WITHOUT extension
        
    Example:
        >>> resolve_filename("{source_name}_{codec}", clip, job, params)
        "interview_01_prores_422"
    """
    source_path = Path(clip.source_path)
    source_name = source_path.stem
    
    # V1 DOGFOOD FIX: Naming tokens must resolve fully.
    # Add all common tokens including fps, tc, timecode, date, datetime.
    now = datetime.now()
    
    # Get frame rate as string
    fps_str = ""
    if clip.frame_rate is not None:
        if isinstance(clip.frame_rate, (int, float)):
            fps_str = f"{float(clip.frame_rate):.2f}".rstrip('0').rstrip('.')
        else:
            fps_str = str(clip.frame_rate)
    
    # Get timecode, sanitized for filename (colons → underscores)
    timecode_str = _sanitize_timecode(getattr(clip, 'timecode_start', None) or "")
    
    # Build token value map
    token_values = {
        "source_name": source_name,
        "reel": _get_reel_name(clip),
        "frame_count": _get_frame_count(clip),
        "width": str(clip.width) if clip.width else "",
        "height": str(clip.height) if clip.height else "",
        "codec": resolved_params.video_codec if resolved_params else "",
        "preset": preset_id or "",
        "job_name": job.id[:8] if job else "",  # Short job ID
        # Additional tokens for V1
        "fps": fps_str,
        "tc": timecode_str,  # Alias for timecode
        "timecode": timecode_str,
        "date": now.strftime("%Y%m%d"),
        "datetime": now.strftime("%Y%m%d_%H%M%S"),
    }
    
    def replace_token(match: re.Match) -> str:
        token_name = match.group(1)
        if token_name in token_values:
            return token_values[token_name]
        # V1 DOGFOOD: Unknown token - leave as-is to surface template errors visibly
        return match.group(0)
    
    resolved = TOKEN_PATTERN.sub(replace_token, template)
    
    # Clean up any double underscores from empty tokens
    while "__" in resolved:
        resolved = resolved.replace("__", "_")
    
    # Remove leading/trailing underscores
    resolved = resolved.strip("_")
    
    # Ensure we have a valid filename
    if not resolved:
        resolved = source_name
    
    return resolved


def _sanitize_timecode(tc: Optional[str]) -> str:
    """
    Sanitize timecode for use in filename.
    
    Converts 01:23:45:06 → 01_23_45_06
    """
    if not tc:
        return ""
    return tc.replace(":", "_").replace(";", "_")


def _get_reel_name(clip: "ClipTask") -> str:
    """
    Extract reel name from clip metadata.
    
    Reel name may come from:
    - Embedded metadata (future)
    - Filename pattern (e.g., "REEL_001_clip.mov")
    - Parent directory name
    
    For now, returns empty string (placeholder for future metadata).
    """
    # TODO: Extract from metadata when available
    return ""


def _get_frame_count(clip: "ClipTask") -> str:
    """
    Calculate frame count from duration and frame rate.
    
    Returns empty string if calculation not possible.
    """
    if clip.duration is None or clip.frame_rate is None:
        return ""
    
    try:
        # Parse frame rate - handle both float and string formats
        # e.g., 23.976 (float), "23.976" (string), "24000/1001" (fraction string)
        frame_rate = clip.frame_rate
        
        if isinstance(frame_rate, (int, float)):
            fps = float(frame_rate)
        elif isinstance(frame_rate, str):
            if "/" in frame_rate:
                # Fraction format like "24000/1001"
                num, den = frame_rate.split("/")
                fps = float(num) / float(den)
            else:
                fps = float(frame_rate)
        else:
            return ""
        
        frame_count = int(clip.duration * fps)
        return str(frame_count)
    except (ValueError, ZeroDivisionError, TypeError):
        return ""


def validate_template(template: str) -> tuple[bool, Optional[str]]:
    """
    Validate a naming template.
    
    Args:
        template: Template string to validate
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not template:
        return False, "Naming template cannot be empty"
    
    if not template.strip():
        return False, "Naming template cannot be whitespace only"
    
    # Check for valid token syntax
    tokens_found = TOKEN_PATTERN.findall(template)
    
    # V1 DOGFOOD FIX: Full set of supported tokens
    valid_tokens = {
        "source_name", "reel", "frame_count", "width", "height",
        "codec", "preset", "job_name",
        "fps", "tc", "timecode", "date", "datetime",
    }
    
    invalid_tokens = [t for t in tokens_found if t not in valid_tokens]
    if invalid_tokens:
        return False, f"Unknown tokens: {', '.join(invalid_tokens)}"
    
    # Must contain at least source_name to ensure unique filenames
    if "source_name" not in tokens_found:
        return False, "Template must include {source_name} token"
    
    return True, None
