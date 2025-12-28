"""
Hard invariants for job execution.

V1 OBSERVABILITY: These invariants FAIL LOUDLY when violated.
They do not recover, retry, or mask errors.

Design principle: Explicit failure is better than silent corruption.

Invariants:
1. NAMING INVARIANT: No unresolved {token} substrings in output filenames
2. FILESYSTEM INVARIANT: Browse requests resolve or error explicitly
3. COMPLETION INVARIANT: Jobs cannot be COMPLETED without verified output file
4. PREVIEW TRUTH INVARIANT: Preview metadata must declare source and resolution
"""

import re
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# ============================================================================
# INVARIANT VIOLATION EXCEPTIONS
# ============================================================================
# These are INTENTIONALLY not recoverable. They indicate logic errors
# that must be fixed in code, not worked around at runtime.
# ============================================================================


class InvariantViolation(Exception):
    """
    Base class for invariant violations.
    
    V1 OBSERVABILITY: Invariant violations are fatal.
    They indicate a bug in the codebase that must be fixed.
    Do NOT catch these and recover - fix the root cause.
    """
    pass


class NamingInvariantViolation(InvariantViolation):
    """
    Raised when output filename contains unresolved tokens.
    
    WHY THIS EXISTS:
    If a naming template like "{source_name}_{preset}.mov" is not fully
    resolved before execution, the output file will have a broken name
    like "interview_{preset}.mov". This is data corruption that's hard
    to diagnose after the fact.
    
    INVARIANT: Before execution starts, assert that:
    - No {token} substrings remain in the output filename
    - Output filename does NOT contain { or } characters
    """
    
    def __init__(
        self,
        filename: str,
        unresolved_tokens: list[str],
        message: Optional[str] = None,
    ):
        self.filename = filename
        self.unresolved_tokens = unresolved_tokens
        default_msg = (
            f"NAMING INVARIANT VIOLATED: Output filename contains unresolved tokens. "
            f"Filename: '{filename}', Unresolved: {unresolved_tokens}. "
            f"This is a bug in naming resolution - fix the template or token values."
        )
        super().__init__(message or default_msg)


class CompletionInvariantViolation(InvariantViolation):
    """
    Raised when attempting to mark a job COMPLETED without verified output.
    
    WHY THIS EXISTS:
    A job that claims COMPLETED status but has no output file is lying.
    This invariant ensures we never report success without proof.
    
    INVARIANT: A job CANNOT be marked COMPLETED unless:
    - Path(output_path).is_file() == True
    """
    
    def __init__(
        self,
        job_id: str,
        output_path: str,
        message: Optional[str] = None,
    ):
        self.job_id = job_id
        self.output_path = output_path
        default_msg = (
            f"COMPLETION INVARIANT VIOLATED: Job {job_id} cannot be marked COMPLETED. "
            f"Output file does not exist: '{output_path}'. "
            f"Either FFmpeg failed silently or the output path is wrong."
        )
        super().__init__(message or default_msg)


class PreviewInvariantViolation(InvariantViolation):
    """
    Raised when preview metadata is missing required fields.
    
    WHY THIS EXISTS:
    We need to know HOW previews were generated before we can improve them.
    Missing metadata makes debugging preview quality issues impossible.
    
    INVARIANT: Preview metadata must declare:
    - source: "thumbnail" | "decode" | "embedded"
    - resolution: WxH (width and height)
    """
    
    def __init__(
        self,
        source_path: str,
        missing_fields: list[str],
        message: Optional[str] = None,
    ):
        self.source_path = source_path
        self.missing_fields = missing_fields
        default_msg = (
            f"PREVIEW INVARIANT VIOLATED: Preview for '{source_path}' missing metadata. "
            f"Missing fields: {missing_fields}. "
            f"Preview generation must record source and resolution."
        )
        super().__init__(message or default_msg)


# ============================================================================
# INVARIANT ASSERTION FUNCTIONS
# ============================================================================
# These functions check invariants and raise violations on failure.
# They are called at critical points in the execution flow.
# ============================================================================

# Pattern to match unresolved tokens like {source_name} or {preset}
UNRESOLVED_TOKEN_PATTERN = re.compile(r'\{(\w+)\}')


def assert_naming_resolved(
    filename: str,
    output_path: str,
) -> list[str]:
    """
    Assert that naming has been fully resolved.
    
    V1 NAMING INVARIANT:
    - No {token} substrings remain in output filename
    - Output filename does NOT contain { or } characters
    
    Args:
        filename: The resolved filename (without path)
        output_path: The full output path
        
    Returns:
        List of resolved token names (for tracing)
        
    Raises:
        NamingInvariantViolation: If unresolved tokens are found
    """
    # Check for unresolved tokens in filename
    matches = UNRESOLVED_TOKEN_PATTERN.findall(filename)
    
    if matches:
        # FAIL LOUDLY: Unresolved tokens are bugs, not runtime errors
        logger.error(
            f"[INVARIANT] NAMING VIOLATED: filename='{filename}', "
            f"unresolved_tokens={matches}"
        )
        raise NamingInvariantViolation(filename, matches)
    
    # Also check for stray braces (malformed templates)
    if '{' in filename or '}' in filename:
        # Stray brace without complete token - also a violation
        logger.error(
            f"[INVARIANT] NAMING VIOLATED: filename='{filename}' contains stray braces"
        )
        raise NamingInvariantViolation(
            filename, 
            ["<stray_brace>"],
            f"Output filename contains stray brace characters: '{filename}'"
        )
    
    logger.debug(f"[INVARIANT] NAMING OK: filename='{filename}'")
    return []  # No unresolved tokens


def assert_output_file_exists(
    job_id: str,
    output_path: str,
) -> int:
    """
    Assert that output file exists before marking job COMPLETED.
    
    V1 COMPLETION INVARIANT:
    A job CANNOT be marked COMPLETED unless Path(output_path).is_file() == True
    
    Args:
        job_id: Job identifier
        output_path: Path to output file
        
    Returns:
        File size in bytes
        
    Raises:
        CompletionInvariantViolation: If output file does not exist
    """
    path = Path(output_path)
    
    if not path.is_file():
        # FAIL LOUDLY: Missing output is a critical failure
        logger.error(
            f"[INVARIANT] COMPLETION VIOLATED: job={job_id}, "
            f"output_path='{output_path}', is_file=False"
        )
        raise CompletionInvariantViolation(job_id, output_path)
    
    file_size = path.stat().st_size
    logger.debug(
        f"[INVARIANT] COMPLETION OK: job={job_id}, "
        f"output_path='{output_path}', size={file_size}"
    )
    return file_size


def assert_preview_metadata(
    source_path: str,
    source: Optional[str],
    width: Optional[int],
    height: Optional[int],
) -> None:
    """
    Assert that preview metadata is complete.
    
    V1 PREVIEW TRUTH INVARIANT:
    Preview metadata must declare:
    - source: "thumbnail" | "decode" | "embedded"
    - resolution: WxH (width and height)
    
    Args:
        source_path: Source file path
        source: Preview source type
        width: Preview width
        height: Preview height
        
    Raises:
        PreviewInvariantViolation: If metadata is incomplete
    """
    missing = []
    
    if not source:
        missing.append("source")
    if width is None:
        missing.append("width")
    if height is None:
        missing.append("height")
    
    if missing:
        # FAIL LOUDLY: Incomplete metadata blocks debugging
        logger.error(
            f"[INVARIANT] PREVIEW VIOLATED: source_path='{source_path}', "
            f"missing_fields={missing}"
        )
        raise PreviewInvariantViolation(source_path, missing)
    
    logger.debug(
        f"[INVARIANT] PREVIEW OK: source_path='{source_path}', "
        f"source={source}, resolution={width}x{height}"
    )


def check_naming_has_unresolved_tokens(filename: str) -> tuple[bool, list[str]]:
    """
    Check if filename has unresolved tokens (non-raising version).
    
    Use this for logging/tracing without failing.
    Use assert_naming_resolved() when you want to fail.
    
    Args:
        filename: The filename to check
        
    Returns:
        (has_unresolved, token_list) tuple
    """
    matches = UNRESOLVED_TOKEN_PATTERN.findall(filename)
    has_unresolved = bool(matches) or '{' in filename or '}' in filename
    return has_unresolved, matches
