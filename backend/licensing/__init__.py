"""
Forge Licensing - Local-First Capability Gating

This module implements honest, transparent licensing with worker limits.
It is NOT DRM. It is NOT anti-piracy. It is policy enforcement that
matches how professionals actually work.

Principles:
- Local-first only (no network calls)
- No obfuscation
- No phone-home
- No UI upsell tricks
- Enforcement is explicit and explainable

What Forge will NEVER do:
- Silently throttle
- Randomly refuse jobs
- Misreport limits
- Pretend limits are technical when they are policy
"""

from .license_model import (
    LicenseTier,
    License,
    TIER_LIMITS,
    get_max_workers,
)

from .license_store import (
    LicenseStore,
    get_license_store,
    get_current_license,
)

from .license_enforcer import (
    LicenseEnforcer,
    WorkerLimitExceededError,
    WorkerRejectionReason,
    get_enforcer,
)

__all__ = [
    # Model
    "LicenseTier",
    "License",
    "TIER_LIMITS",
    "get_max_workers",
    # Store
    "LicenseStore",
    "get_license_store",
    "get_current_license",
    # Enforcer
    "LicenseEnforcer",
    "WorkerLimitExceededError",
    "WorkerRejectionReason",
    "get_enforcer",
]
