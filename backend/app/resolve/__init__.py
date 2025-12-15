"""
Resolve integration module.

Provides Resolve installation discovery, capability validation,
and render command descriptor preparation without execution.

This module treats Resolve as an external system and ensures
graceful failure when Resolve is missing or misconfigured.
"""

from .errors import (
    ResolveError,
    ResolveNotFoundError,
    ResolveFreeDetectedError,
    ResolveValidationError,
)
from .models import (
    ResolveCapability,
    ResolveInstallation,
    ResolveCommandDescriptor,
)
from .discovery import discover_resolve
from .validation import validate_resolve_capability
from .commands import prepare_render_command

__all__ = [
    # Errors
    "ResolveError",
    "ResolveNotFoundError",
    "ResolveFreeDetectedError",
    "ResolveValidationError",
    # Models
    "ResolveCapability",
    "ResolveInstallation",
    "ResolveCommandDescriptor",
    # Functions
    "discover_resolve",
    "validate_resolve_capability",
    "prepare_render_command",
]
