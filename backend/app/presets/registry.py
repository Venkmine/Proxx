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

from typing import Dict, Optional, TYPE_CHECKING
from .models import PresetCategory, CategoryPreset, GlobalPreset
from .errors import PresetNotFoundError, DuplicateCategoryError

if TYPE_CHECKING:
    from ..execution.resolved_params import ResolvedPresetParams


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

    def resolve_preset_params(self, preset_id: str) -> "ResolvedPresetParams":
        """
        Resolve a global preset into flat execution parameters.
        
        This is the ONLY way engines should access preset data.
        Returns a ResolvedPresetParams with all values resolved and flattened.
        
        Args:
            preset_id: The global preset ID to resolve
            
        Returns:
            ResolvedPresetParams ready for engine consumption
            
        Raises:
            PresetNotFoundError: If preset or required category presets not found
        """
        from ..execution.resolved_params import ResolvedPresetParams, DEFAULT_H264_PARAMS
        from .schemas import CodecPreset, ScalingPreset, ScalingMode
        
        # Get global preset
        global_preset = self.get_global_preset(preset_id)
        if not global_preset:
            raise PresetNotFoundError("global", preset_id)
        
        # Resolve codec preset
        codec_ref = global_preset.category_refs.get(PresetCategory.CODEC, "")
        codec_preset = self.get_category_preset(PresetCategory.CODEC, codec_ref)
        
        if not codec_preset:
            # Fall back to H.264 default
            return DEFAULT_H264_PARAMS
        
        # Type-safe codec preset access - if not a proper CodecPreset, fall back to defaults
        if not isinstance(codec_preset, CodecPreset):
            # Base CategoryPreset was used (e.g., test presets) - use H.264 defaults
            return DEFAULT_H264_PARAMS
        
        # Map codec type to video_codec string
        video_codec = str(codec_preset.codec.value) if hasattr(codec_preset.codec, 'value') else str(codec_preset.codec)
        container = codec_preset.container
        
        # Resolve scaling preset
        scale_mode = "none"
        target_width = None
        target_height = None
        
        scaling_ref = global_preset.category_refs.get(PresetCategory.SCALING, "")
        scaling_preset = self.get_category_preset(PresetCategory.SCALING, scaling_ref)
        
        if scaling_preset and isinstance(scaling_preset, ScalingPreset):
            mode_value = scaling_preset.mode
            scale_mode = mode_value.value if hasattr(mode_value, 'value') else str(mode_value)
            target_width = scaling_preset.target_width
            target_height = scaling_preset.target_height
        
        # Build resolved params
        return ResolvedPresetParams(
            preset_id=preset_id,
            preset_name=global_preset.name,
            video_codec=video_codec,
            container=container,
            # For ProRes/DNxHR, no quality/bitrate needed (codec profile determines quality)
            # For H.264, we'd set video_quality=23, video_preset="medium"
            video_quality=23 if video_codec == "h264" else None,
            video_preset="medium" if video_codec == "h264" else None,
            audio_codec="aac" if video_codec == "h264" else "copy",
            audio_bitrate="192k" if video_codec == "h264" else None,
            scale_mode=scale_mode,
            target_width=target_width,
            target_height=target_height,
        )
