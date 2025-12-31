"""
Burn-Ins package for V1 Proxx.

This package provides deterministic burn-in presets and recipes
for DaVinci Resolve Project Data Burn-In.

Components:
- burnin_presets.json: Atomic burn-in preset definitions
- burnin_recipes.json: Ordered stacks of presets
- apply_burnins.py: Core resolution and validation logic

Part of V1 BURN-IN IMPLEMENTATION
"""

from backend.burnins.apply_burnins import (
    # Exceptions
    BurnInError,
    BurnInRecipeNotFoundError,
    BurnInPresetNotFoundError,
    BurnInValidationError,
    # Data classes
    BurnInPreset,
    BurnInRecipe,
    ResolvedBurnInConfig,
    # Public API
    get_available_recipes,
    get_available_presets,
    resolve_burnin_recipe,
    validate_recipe_id,
)

__all__ = [
    # Exceptions
    "BurnInError",
    "BurnInRecipeNotFoundError",
    "BurnInPresetNotFoundError",
    "BurnInValidationError",
    # Data classes
    "BurnInPreset",
    "BurnInRecipe",
    "ResolvedBurnInConfig",
    # Public API
    "get_available_recipes",
    "get_available_presets",
    "resolve_burnin_recipe",
    "validate_recipe_id",
]
