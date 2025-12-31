"""
Resolve module for V1 Proxx.

This package provides DaVinci Resolve integration including:
- Burn-in application via Project Data Burn-In

Part of V1 BURN-IN IMPLEMENTATION
"""

from backend.resolve.resolve_burnin_apply import (
    # Exceptions
    ResolveBurnInError,
    ResolveNotStudioError,
    ResolveNotRunningError,
    ResolveBurnInApplicationError,
    # State
    ResolveBurnInState,
    # Public API
    apply_burnins_to_resolve,
    teardown_burnins,
    validate_resolve_for_burnins,
)

__all__ = [
    # Exceptions
    "ResolveBurnInError",
    "ResolveNotStudioError",
    "ResolveNotRunningError",
    "ResolveBurnInApplicationError",
    # State
    "ResolveBurnInState",
    # Public API
    "apply_burnins_to_resolve",
    "teardown_burnins",
    "validate_resolve_for_burnins",
]
