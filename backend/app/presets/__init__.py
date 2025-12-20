"""
Preset system for Awaire Proxy.

This module defines the foundational data structures and validation
for the preset system. Presets are pure data with no side effects.

Phase 2 scope:
- Category presets (reusable, single-concern configurations)
- Global presets (compositions of category presets)
- Validation logic
- In-memory registry for reference validation

Phase 2 explicitly does NOT include:
- Preset persistence
- File I/O
- UI integration
- Preset application/execution
- Resolve integration
"""

from .errors import (
    PresetValidationError,
    UnknownCategoryError,
    DuplicateCategoryError,
    MissingCategoryError,
    PresetNotFoundError,
)
from .models import (
    PresetCategory,
    CategoryPreset,
    GlobalPreset,
)
from .registry import PresetRegistry

__all__ = [
    "PresetValidationError",
    "UnknownCategoryError",
    "DuplicateCategoryError",
    "MissingCategoryError",
    "PresetNotFoundError",
    "PresetCategory",
    "CategoryPreset",
    "GlobalPreset",
    "PresetRegistry",
]
