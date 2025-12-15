"""
In-memory preset registry.

Phase 2 scope: validation of preset references only.
No persistence. No file I/O. No databases.

The registry validates that:
- Category presets exist before being referenced by global presets
- Category presets have unique IDs within their category
- Global presets have unique IDs

This is a stub implementation to enable validation testing in isolation.
Full persistence and loading will be implemented in later phases.
"""

from typing import Dict, Optional
from .models import PresetCategory, CategoryPreset, GlobalPreset
from .errors import PresetNotFoundError, DuplicateCategoryError


class PresetRegistry:
    """
    In-memory registry for preset validation.
    
    Stores category presets and global presets.
    Validates referential integrity when global presets are added.
    """
    
    def __init__(self):
        """Initialize empty registry."""
        # category -> (preset_id -> CategoryPreset)
        self._category_presets: Dict[PresetCategory, Dict[str, CategoryPreset]] = {
            category: {} for category in PresetCategory
        }
        # global_preset_id -> GlobalPreset
        self._global_presets: Dict[str, GlobalPreset] = {}
    
    def add_category_preset(self, preset: CategoryPreset) -> None:
        """
        Add a category preset to the registry.
        
        Args:
            preset: The category preset to add
            
        Raises:
            ValueError: If a preset with the same ID already exists in this category
        """
        category_store = self._category_presets[preset.category]
        
        if preset.id in category_store:
            raise ValueError(
                f"Category preset with ID '{preset.id}' already exists "
                f"in category '{preset.category.value}'"
            )
        
        category_store[preset.id] = preset
    
    def get_category_preset(
        self, category: PresetCategory, preset_id: str
    ) -> Optional[CategoryPreset]:
        """
        Retrieve a category preset by ID.
        
        Args:
            category: The preset category
            preset_id: The preset ID
            
        Returns:
            The preset if found, None otherwise
        """
        return self._category_presets[category].get(preset_id)
    
    def add_global_preset(self, preset: GlobalPreset) -> None:
        """
        Add a global preset to the registry.
        
        Validates that all referenced category presets exist.
        
        Args:
            preset: The global preset to add
            
        Raises:
            ValueError: If a preset with the same ID already exists
            PresetNotFoundError: If any referenced category preset does not exist
        """
        if preset.id in self._global_presets:
            raise ValueError(
                f"Global preset with ID '{preset.id}' already exists"
            )
        
        # Validate all category preset references
        for category, preset_id in preset.category_refs.items():
            if not self.get_category_preset(category, preset_id):
                raise PresetNotFoundError(category.value, preset_id)
        
        self._global_presets[preset.id] = preset
    
    def get_global_preset(self, preset_id: str) -> Optional[GlobalPreset]:
        """
        Retrieve a global preset by ID.
        
        Args:
            preset_id: The preset ID
            
        Returns:
            The preset if found, None otherwise
        """
        return self._global_presets.get(preset_id)
    
    def list_category_presets(
        self, category: PresetCategory
    ) -> Dict[str, CategoryPreset]:
        """
        List all presets in a category.
        
        Args:
            category: The preset category
            
        Returns:
            Dictionary mapping preset IDs to presets
        """
        return dict(self._category_presets[category])
    
    def list_global_presets(self) -> Dict[str, GlobalPreset]:
        """
        List all global presets.
        
        Returns:
            Dictionary mapping preset IDs to presets
        """
        return dict(self._global_presets)
