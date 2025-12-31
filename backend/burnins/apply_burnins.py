"""
Burn-In Application Logic for V1 Proxx.

This module provides the core burn-in application logic that:
1. Validates recipe existence
2. Resolves all preset definitions
3. Prepares burn-in configuration for Resolve rendering

Design Principles:
==================
- Deterministic: No optional fields, no defaults, no fallbacks
- Immutable: Burn-in config is snapshotted at job creation time
- Fail-fast: Loudly fail on missing recipes/presets
- Resolve Studio only: No FFmpeg burn-ins in V1

Part of V1 BURN-IN IMPLEMENTATION
"""

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Any


# =============================================================================
# Paths
# =============================================================================

BURNIN_DIR = Path(__file__).parent
PRESETS_FILE = BURNIN_DIR / "burnin_presets.json"
RECIPES_FILE = BURNIN_DIR / "burnin_recipes.json"


# =============================================================================
# Exceptions
# =============================================================================

class BurnInError(Exception):
    """Base exception for burn-in related errors."""
    pass


class BurnInRecipeNotFoundError(BurnInError):
    """Raised when a burn-in recipe ID is not found."""
    pass


class BurnInPresetNotFoundError(BurnInError):
    """Raised when a burn-in preset ID is not found."""
    pass


class BurnInValidationError(BurnInError):
    """Raised when burn-in configuration is invalid."""
    pass


# =============================================================================
# Data Classes
# =============================================================================

@dataclass(frozen=True)
class BurnInPreset:
    """
    Atomic burn-in preset definition.
    
    This is an immutable, fully-specified burn-in configuration for a single
    screen position. No optional fields. All values required.
    """
    id: str
    fields: tuple  # Tuple for immutability
    position: str  # TL, TR, BL, BR, TC, BC
    text_opacity: float
    background_enabled: bool
    background_opacity: Optional[float]  # None if background_enabled is False
    font_scale: str  # small, medium, large
    
    def __post_init__(self):
        """Validate preset configuration."""
        valid_positions = {"TL", "TR", "BL", "BR", "TC", "BC"}
        if self.position not in valid_positions:
            raise BurnInValidationError(
                f"Invalid position '{self.position}'. Must be one of: {valid_positions}"
            )
        
        valid_font_scales = {"small", "medium", "large"}
        if self.font_scale not in valid_font_scales:
            raise BurnInValidationError(
                f"Invalid font_scale '{self.font_scale}'. Must be one of: {valid_font_scales}"
            )
        
        if not 0.0 <= self.text_opacity <= 1.0:
            raise BurnInValidationError(
                f"text_opacity must be between 0.0 and 1.0, got {self.text_opacity}"
            )
        
        if self.background_enabled and self.background_opacity is None:
            raise BurnInValidationError(
                "background_opacity must be set when background_enabled is True"
            )
        
        if self.background_opacity is not None and not 0.0 <= self.background_opacity <= 1.0:
            raise BurnInValidationError(
                f"background_opacity must be between 0.0 and 1.0, got {self.background_opacity}"
            )


@dataclass(frozen=True)
class BurnInRecipe:
    """
    Ordered stack of burn-in presets.
    
    A recipe is a named collection of presets applied in order.
    Immutable after creation.
    """
    id: str
    description: str
    preset_ids: tuple  # Tuple of preset IDs, applied in order
    
    def __post_init__(self):
        """Validate recipe has at least one preset."""
        if not self.preset_ids:
            raise BurnInValidationError(
                f"Recipe '{self.id}' must have at least one preset"
            )


@dataclass(frozen=True)
class ResolvedBurnInConfig:
    """
    Fully resolved burn-in configuration ready for Resolve.
    
    This is what gets passed to the Resolve burn-in application layer.
    All preset IDs are resolved to full preset definitions.
    Immutable. Created once at job creation time.
    """
    recipe_id: str
    recipe_description: str
    presets: tuple  # Tuple of BurnInPreset objects, in order


# =============================================================================
# Loading Functions
# =============================================================================

def _load_presets() -> Dict[str, BurnInPreset]:
    """
    Load burn-in presets from JSON file.
    
    Returns:
        Dictionary mapping preset ID to BurnInPreset
        
    Raises:
        BurnInError: If presets file cannot be loaded or parsed
    """
    if not PRESETS_FILE.exists():
        raise BurnInError(f"Burn-in presets file not found: {PRESETS_FILE}")
    
    try:
        with open(PRESETS_FILE, "r") as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        raise BurnInError(f"Invalid JSON in presets file: {e}") from e
    
    presets = {}
    for preset_data in data.get("presets", []):
        preset = BurnInPreset(
            id=preset_data["id"],
            fields=tuple(preset_data["fields"]),
            position=preset_data["position"],
            text_opacity=preset_data["text_opacity"],
            background_enabled=preset_data["background_enabled"],
            background_opacity=preset_data["background_opacity"],
            font_scale=preset_data["font_scale"],
        )
        presets[preset.id] = preset
    
    return presets


def _load_recipes() -> Dict[str, BurnInRecipe]:
    """
    Load burn-in recipes from JSON file.
    
    Returns:
        Dictionary mapping recipe ID to BurnInRecipe
        
    Raises:
        BurnInError: If recipes file cannot be loaded or parsed
    """
    if not RECIPES_FILE.exists():
        raise BurnInError(f"Burn-in recipes file not found: {RECIPES_FILE}")
    
    try:
        with open(RECIPES_FILE, "r") as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        raise BurnInError(f"Invalid JSON in recipes file: {e}") from e
    
    recipes = {}
    for recipe_data in data.get("recipes", []):
        recipe = BurnInRecipe(
            id=recipe_data["id"],
            description=recipe_data["description"],
            preset_ids=tuple(recipe_data["presets"]),
        )
        recipes[recipe.id] = recipe
    
    return recipes


# =============================================================================
# Public API
# =============================================================================

def get_available_recipes() -> List[Dict[str, Any]]:
    """
    Get list of available burn-in recipes for UI display.
    
    Returns:
        List of dictionaries with recipe id and description
    """
    recipes = _load_recipes()
    return [
        {"id": r.id, "description": r.description}
        for r in recipes.values()
    ]


def get_available_presets() -> List[Dict[str, Any]]:
    """
    Get list of available burn-in presets for reference.
    
    Returns:
        List of dictionaries with preset details
    """
    presets = _load_presets()
    return [
        {
            "id": p.id,
            "fields": list(p.fields),
            "position": p.position,
        }
        for p in presets.values()
    ]


def resolve_burnin_recipe(recipe_id: str) -> ResolvedBurnInConfig:
    """
    Resolve a burn-in recipe to a fully-specified configuration.
    
    This is the main entrypoint for burn-in resolution at job creation time.
    
    Args:
        recipe_id: The ID of the burn-in recipe to resolve
        
    Returns:
        ResolvedBurnInConfig with all presets fully resolved
        
    Raises:
        BurnInRecipeNotFoundError: If recipe_id is not found
        BurnInPresetNotFoundError: If a preset referenced by the recipe is not found
    """
    # Load both presets and recipes
    presets = _load_presets()
    recipes = _load_recipes()
    
    # Validate recipe exists
    if recipe_id not in recipes:
        available = list(recipes.keys())
        raise BurnInRecipeNotFoundError(
            f"Burn-in recipe '{recipe_id}' not found. "
            f"Available recipes: {available}"
        )
    
    recipe = recipes[recipe_id]
    
    # Resolve all presets in order
    resolved_presets = []
    for preset_id in recipe.preset_ids:
        if preset_id not in presets:
            available = list(presets.keys())
            raise BurnInPresetNotFoundError(
                f"Burn-in preset '{preset_id}' referenced by recipe '{recipe_id}' "
                f"not found. Available presets: {available}"
            )
        resolved_presets.append(presets[preset_id])
    
    return ResolvedBurnInConfig(
        recipe_id=recipe.id,
        recipe_description=recipe.description,
        presets=tuple(resolved_presets),
    )


def validate_recipe_id(recipe_id: Optional[str]) -> Optional[str]:
    """
    Validate that a recipe ID exists (if provided).
    
    Use this at job creation time to fail fast on invalid recipe IDs.
    
    Args:
        recipe_id: Recipe ID to validate, or None for no burn-ins
        
    Returns:
        The validated recipe_id (or None)
        
    Raises:
        BurnInRecipeNotFoundError: If recipe_id is not None and not found
    """
    if recipe_id is None:
        return None
    
    recipes = _load_recipes()
    if recipe_id not in recipes:
        available = list(recipes.keys())
        raise BurnInRecipeNotFoundError(
            f"Burn-in recipe '{recipe_id}' not found. "
            f"Available recipes: {available}"
        )
    
    return recipe_id
