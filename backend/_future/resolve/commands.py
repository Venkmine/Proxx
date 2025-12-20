"""
Resolve command descriptor preparation.

Prepares abstract Resolve render command descriptors WITHOUT execution.

This module generates serializable command descriptions that represent
what WOULD be invoked to render via Resolve, but does not:
- Execute renders
- Apply presets
- Create projects
- Import media
- Modify Resolve state

Command descriptors are pure data structures for inspection and dry-run.
"""

from pathlib import Path
from typing import Optional

from .models import ResolveCommandDescriptor


def prepare_render_command(
    source_path: Path,
    output_path: Path,
    render_preset_id: Optional[str] = None,
) -> ResolveCommandDescriptor:
    """
    Prepare a Resolve render command descriptor.
    
    Creates an abstract representation of a Resolve render operation
    without executing it or requiring Resolve to be available.
    
    Args:
        source_path: Absolute path to source media file.
        output_path: Absolute path to target render output file.
        render_preset_id: Optional reference to a global preset ID.
    
    Returns:
        ResolveCommandDescriptor ready for inspection or future execution.
    
    Notes:
        - Does NOT validate source file existence
        - Does NOT validate preset existence
        - Does NOT require Resolve to be installed
        - Does NOT apply render settings
        - This is a Phase 5 foundation for Phase 6+ execution
    
    Example:
        >>> cmd = prepare_render_command(
        ...     source_path=Path("/mnt/footage/clip.mov"),
        ...     output_path=Path("/mnt/proxies/clip_proxy.mov"),
        ...     render_preset_id="preset_prores_proxy",
        ... )
        >>> print(cmd.source_path)
        /mnt/footage/clip.mov
        >>> print(cmd.invocation_type)
        script
    """
    return ResolveCommandDescriptor(
        source_path=source_path,
        output_path=output_path,
        render_preset_id=render_preset_id,
        invocation_type="script",
    )
