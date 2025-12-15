"""
Core data models for the preset system.

Category presets represent single concerns (codec, scaling, watermark, etc.).
Global presets compose category presets by reference.

All models use Pydantic for strict validation.
Unknown fields are rejected.
No silent coercion.
"""

from enum import Enum
from typing import Dict, Any
from pydantic import BaseModel, ConfigDict, field_validator


class PresetCategory(str, Enum):
    """
    Enumeration of all preset categories.
    
    Each category represents exactly one concern.
    Categories are independent and know nothing about each other.
    """
    
    CODEC = "codec"
    SCALING = "scaling"
    WATERMARK = "watermark"
    NAMING = "naming"
    FOLDER_OUTPUT = "folder_output"
    EXCLUSIONS = "exclusions"
    DUPLICATES = "duplicates"
    QUEUE = "queue"
    REPORTING = "reporting"


class CategoryPreset(BaseModel):
    """
    Base model for all category presets.
    
    A category preset:
    - Represents exactly ONE concern
    - Is reusable
    - Is pure data with no side effects
    - Has no knowledge of other categories
    
    Concrete category presets must subclass this and define
    their specific fields with validation.
    """
    
    model_config = ConfigDict(
        extra="forbid",  # Reject unknown fields
        use_enum_values=True,
    )
    
    id: str
    category: PresetCategory
    name: str
    description: str = ""
    
    @field_validator("id")
    @classmethod
    def validate_id(cls, v: str) -> str:
        """ID must be non-empty and contain only valid characters."""
        if not v or not v.strip():
            raise ValueError("ID cannot be empty")
        if not v.replace("_", "").replace("-", "").isalnum():
            raise ValueError("ID must contain only alphanumeric characters, hyphens, and underscores")
        return v
    
    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        """Name must be non-empty."""
        if not v or not v.strip():
            raise ValueError("Name cannot be empty")
        return v


class GlobalPreset(BaseModel):
    """
    A global preset composes category presets by reference.
    
    Rules:
    - Must reference exactly one preset per required category
    - Contains NO inline category configuration
    - Acts as a recipe, not a blob
    
    Validation enforces:
    - No missing required categories
    - No unknown categories
    - No duplicate category references
    - All referenced presets must exist (validated by registry)
    """
    
    model_config = ConfigDict(
        extra="forbid",  # Reject unknown fields
        use_enum_values=True,
    )
    
    id: str
    name: str
    description: str = ""
    category_refs: Dict[PresetCategory, str]  # category -> preset_id
    
    @field_validator("id")
    @classmethod
    def validate_id(cls, v: str) -> str:
        """ID must be non-empty and contain only valid characters."""
        if not v or not v.strip():
            raise ValueError("ID cannot be empty")
        if not v.replace("_", "").replace("-", "").isalnum():
            raise ValueError("ID must contain only alphanumeric characters, hyphens, and underscores")
        return v
    
    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        """Name must be non-empty."""
        if not v or not v.strip():
            raise ValueError("Name cannot be empty")
        return v
    
    @field_validator("category_refs")
    @classmethod
    def validate_category_refs(cls, v: Dict[PresetCategory, str]) -> Dict[PresetCategory, str]:
        """
        Validate category references.
        
        - All required categories must be present
        - No duplicate categories (enforced by dict structure)
        - All referenced preset IDs must be non-empty
        """
        required_categories = {
            PresetCategory.CODEC,
            PresetCategory.SCALING,
            PresetCategory.WATERMARK,
            PresetCategory.NAMING,
            PresetCategory.FOLDER_OUTPUT,
            PresetCategory.EXCLUSIONS,
            PresetCategory.DUPLICATES,
            PresetCategory.QUEUE,
            PresetCategory.REPORTING,
        }
        
        provided_categories = set(v.keys())
        missing = required_categories - provided_categories
        
        if missing:
            missing_names = sorted([cat.value for cat in missing])
            raise ValueError(f"Missing required categories: {', '.join(missing_names)}")
        
        # Validate all preset IDs are non-empty
        for category, preset_id in v.items():
            if not preset_id or not preset_id.strip():
                raise ValueError(f"Preset ID for category '{category.value}' cannot be empty")
        
        return v
