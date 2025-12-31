"""
Burn-In Preset Schema Enforcement for V1 Proxx.

This module provides schema enforcement for burn-in presets with:
- Locked vs mutable field definitions
- Industry presets (immutable)
- Derived preset creation on locked field modification
- Provenance logging for job tracking

Design Principles:
==================
- Industry presets are IMMUTABLE — no modifications allowed
- Locked fields (position, fields) create derived preset on modification
- Mutable fields (opacity, font_scale) can be modified in-place
- Provenance chain tracks preset lineage for job logging

Field Classification:
=====================
LOCKED FIELDS (modification creates derived preset):
- id: Preset identifier
- fields: List of data fields to display
- position: Screen position (TL, TR, BL, BR, TC, BC)

MUTABLE FIELDS (can modify in-place for user presets only):
- text_opacity: Text opacity (0.0 - 1.0)
- background_enabled: Background visibility
- background_opacity: Background opacity (0.0 - 1.0)
- font_scale: Font size (small, medium, large)

Part of V1 BURN-IN IMPLEMENTATION
"""

import json
import uuid
import logging
from dataclasses import dataclass, field, asdict
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any, Set, Tuple
from enum import Enum


# =============================================================================
# Configuration
# =============================================================================

logger = logging.getLogger(__name__)

BURNIN_DIR = Path(__file__).parent / "burnins"
PRESETS_FILE = BURNIN_DIR / "burnin_presets.json"
USER_PRESETS_FILE = BURNIN_DIR / "user_burnin_presets.json"


# =============================================================================
# Schema Definitions
# =============================================================================

class PresetType(str, Enum):
    """Classification of burn-in presets by mutability."""
    INDUSTRY = "industry"   # Immutable, shipped with application
    USER = "user"           # User-created, mutable fields editable
    DERIVED = "derived"     # Created from modifying locked field on another preset


class FieldType(str, Enum):
    """Classification of preset fields by mutability."""
    LOCKED = "locked"       # Modification creates derived preset
    MUTABLE = "mutable"     # Can be modified in-place (user presets only)


# Field schema: which fields are locked vs mutable
FIELD_SCHEMA: Dict[str, FieldType] = {
    "id": FieldType.LOCKED,
    "fields": FieldType.LOCKED,
    "position": FieldType.LOCKED,
    "text_opacity": FieldType.MUTABLE,
    "background_enabled": FieldType.MUTABLE,
    "background_opacity": FieldType.MUTABLE,
    "font_scale": FieldType.MUTABLE,
}

LOCKED_FIELDS: Set[str] = {k for k, v in FIELD_SCHEMA.items() if v == FieldType.LOCKED}
MUTABLE_FIELDS: Set[str] = {k for k, v in FIELD_SCHEMA.items() if v == FieldType.MUTABLE}


# =============================================================================
# Exceptions
# =============================================================================

class PresetEnforcementError(Exception):
    """Base exception for preset enforcement errors."""
    pass


class ImmutablePresetError(PresetEnforcementError):
    """Raised when attempting to modify an immutable (industry) preset."""
    pass


class LockedFieldModificationError(PresetEnforcementError):
    """Raised when locked field modification is attempted without creating derived preset."""
    pass


class InvalidFieldError(PresetEnforcementError):
    """Raised when an unknown field is referenced."""
    pass


class ProvenanceError(PresetEnforcementError):
    """Raised when provenance chain is invalid or corrupted."""
    pass


# =============================================================================
# Data Classes
# =============================================================================

@dataclass(frozen=True)
class PresetProvenance:
    """
    Provenance record tracking preset lineage.
    
    This is logged to job logs for auditability.
    """
    preset_id: str
    preset_type: PresetType
    derived_from: Optional[str]     # Parent preset ID if derived
    derived_at: Optional[str]       # ISO-8601 timestamp of derivation
    locked_fields_modified: Tuple[str, ...]  # Which locked fields caused derivation


@dataclass
class BurnInPresetSchema:
    """
    Burn-in preset with schema enforcement.
    
    Enforces locked vs mutable field rules and tracks provenance.
    """
    id: str
    fields: Tuple[str, ...]
    position: str
    text_opacity: float
    background_enabled: bool
    background_opacity: Optional[float]
    font_scale: str
    preset_type: PresetType
    derived_from: Optional[str] = None
    derived_at: Optional[str] = None
    locked_fields_modified: Tuple[str, ...] = field(default_factory=tuple)
    
    def __post_init__(self):
        """Validate preset configuration."""
        valid_positions = {"TL", "TR", "BL", "BR", "TC", "BC"}
        if self.position not in valid_positions:
            raise PresetEnforcementError(
                f"Invalid position '{self.position}'. Must be one of: {valid_positions}"
            )
        
        valid_font_scales = {"small", "medium", "large"}
        if self.font_scale not in valid_font_scales:
            raise PresetEnforcementError(
                f"Invalid font_scale '{self.font_scale}'. Must be one of: {valid_font_scales}"
            )
        
        if not 0.0 <= self.text_opacity <= 1.0:
            raise PresetEnforcementError(
                f"text_opacity must be between 0.0 and 1.0, got {self.text_opacity}"
            )
        
        if self.background_enabled and self.background_opacity is None:
            raise PresetEnforcementError(
                "background_opacity must be set when background_enabled is True"
            )
        
        if self.background_opacity is not None and not 0.0 <= self.background_opacity <= 1.0:
            raise PresetEnforcementError(
                f"background_opacity must be between 0.0 and 1.0, got {self.background_opacity}"
            )
    
    @property
    def is_industry(self) -> bool:
        """Check if this is an immutable industry preset."""
        return self.preset_type == PresetType.INDUSTRY
    
    @property
    def is_mutable(self) -> bool:
        """Check if mutable fields can be modified in-place."""
        return self.preset_type in (PresetType.USER, PresetType.DERIVED)
    
    def get_provenance(self) -> PresetProvenance:
        """Generate provenance record for job logging."""
        return PresetProvenance(
            preset_id=self.id,
            preset_type=self.preset_type,
            derived_from=self.derived_from,
            derived_at=self.derived_at,
            locked_fields_modified=self.locked_fields_modified,
        )
    
    def to_dict(self) -> Dict[str, Any]:
        """Serialize preset to dictionary for storage."""
        return {
            "id": self.id,
            "fields": list(self.fields),
            "position": self.position,
            "text_opacity": self.text_opacity,
            "background_enabled": self.background_enabled,
            "background_opacity": self.background_opacity,
            "font_scale": self.font_scale,
            "preset_type": self.preset_type.value,
            "derived_from": self.derived_from,
            "derived_at": self.derived_at,
            "locked_fields_modified": list(self.locked_fields_modified),
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any], preset_type: Optional[PresetType] = None) -> "BurnInPresetSchema":
        """Deserialize preset from dictionary."""
        return cls(
            id=data["id"],
            fields=tuple(data["fields"]),
            position=data["position"],
            text_opacity=data["text_opacity"],
            background_enabled=data["background_enabled"],
            background_opacity=data.get("background_opacity"),
            font_scale=data["font_scale"],
            preset_type=preset_type or PresetType(data.get("preset_type", "user")),
            derived_from=data.get("derived_from"),
            derived_at=data.get("derived_at"),
            locked_fields_modified=tuple(data.get("locked_fields_modified", [])),
        )


# =============================================================================
# Schema Enforcement
# =============================================================================

def classify_field(field_name: str) -> FieldType:
    """
    Get the mutability classification of a field.
    
    Args:
        field_name: Name of the field
        
    Returns:
        FieldType.LOCKED or FieldType.MUTABLE
        
    Raises:
        InvalidFieldError: If field is not in schema
    """
    if field_name not in FIELD_SCHEMA:
        raise InvalidFieldError(f"Unknown field '{field_name}'. Valid fields: {list(FIELD_SCHEMA.keys())}")
    return FIELD_SCHEMA[field_name]


def validate_modification(
    preset: BurnInPresetSchema,
    modifications: Dict[str, Any],
) -> Tuple[bool, Set[str]]:
    """
    Validate a set of modifications against preset enforcement rules.
    
    Args:
        preset: The preset being modified
        modifications: Dictionary of field -> new value
        
    Returns:
        Tuple of (requires_derivation, locked_fields_modified)
        
    Raises:
        ImmutablePresetError: If preset is industry and any modification attempted
        InvalidFieldError: If unknown field is referenced
    """
    if preset.is_industry:
        raise ImmutablePresetError(
            f"Industry preset '{preset.id}' is immutable. "
            "Create a derived preset to customize these settings."
        )
    
    locked_modified: Set[str] = set()
    
    for field_name, new_value in modifications.items():
        field_type = classify_field(field_name)
        
        if field_type == FieldType.LOCKED:
            # Get current value for comparison
            current_value = getattr(preset, field_name)
            if current_value != new_value:
                locked_modified.add(field_name)
    
    requires_derivation = len(locked_modified) > 0
    return requires_derivation, locked_modified


def apply_mutable_modifications(
    preset: BurnInPresetSchema,
    modifications: Dict[str, Any],
) -> BurnInPresetSchema:
    """
    Apply modifications to mutable fields only.
    
    Args:
        preset: The preset to modify
        modifications: Dictionary of field -> new value (mutable fields only)
        
    Returns:
        New preset with modifications applied
        
    Raises:
        ImmutablePresetError: If preset is industry
        LockedFieldModificationError: If locked field in modifications
    """
    if preset.is_industry:
        raise ImmutablePresetError(
            f"Industry preset '{preset.id}' is immutable."
        )
    
    # Validate all modifications are to mutable fields
    for field_name in modifications.keys():
        field_type = classify_field(field_name)
        if field_type == FieldType.LOCKED:
            raise LockedFieldModificationError(
                f"Cannot modify locked field '{field_name}' in-place. "
                "Use create_derived_preset() to create a derived preset."
            )
    
    # Apply modifications
    data = preset.to_dict()
    for field_name, new_value in modifications.items():
        data[field_name] = new_value
    
    return BurnInPresetSchema.from_dict(data, preset.preset_type)


def create_derived_preset(
    parent_preset: BurnInPresetSchema,
    modifications: Dict[str, Any],
    new_id: Optional[str] = None,
) -> BurnInPresetSchema:
    """
    Create a derived preset from a parent with locked field modifications.
    
    This is the ONLY way to modify locked fields. The derived preset
    maintains provenance back to the parent.
    
    Args:
        parent_preset: The preset to derive from
        modifications: Dictionary of field -> new value (any fields)
        new_id: Optional ID for derived preset (auto-generated if None)
        
    Returns:
        New derived preset with modifications and provenance
    """
    # Determine which locked fields are being modified
    locked_modified: Set[str] = set()
    for field_name, new_value in modifications.items():
        classify_field(field_name)  # Validates field exists
        if field_name in LOCKED_FIELDS:
            current_value = getattr(parent_preset, field_name)
            if current_value != new_value:
                locked_modified.add(field_name)
    
    # Generate new ID if not provided
    if new_id is None:
        short_uuid = uuid.uuid4().hex[:8]
        new_id = f"{parent_preset.id}_derived_{short_uuid}"
    
    # Build derived preset data
    data = parent_preset.to_dict()
    data["id"] = new_id
    data["preset_type"] = PresetType.DERIVED.value
    data["derived_from"] = parent_preset.id
    data["derived_at"] = datetime.utcnow().isoformat() + "Z"
    data["locked_fields_modified"] = list(locked_modified)
    
    # Apply all modifications
    for field_name, new_value in modifications.items():
        if field_name == "fields":
            data[field_name] = list(new_value) if isinstance(new_value, tuple) else new_value
        else:
            data[field_name] = new_value
    
    return BurnInPresetSchema.from_dict(data)


# =============================================================================
# Preset Loading and Storage
# =============================================================================

def load_industry_presets() -> Dict[str, BurnInPresetSchema]:
    """
    Load immutable industry presets from JSON file.
    
    Returns:
        Dictionary mapping preset ID to BurnInPresetSchema
    """
    if not PRESETS_FILE.exists():
        raise PresetEnforcementError(f"Industry presets file not found: {PRESETS_FILE}")
    
    with open(PRESETS_FILE, "r") as f:
        data = json.load(f)
    
    presets = {}
    for preset_data in data.get("presets", []):
        preset = BurnInPresetSchema.from_dict(preset_data, PresetType.INDUSTRY)
        presets[preset.id] = preset
    
    return presets


def load_user_presets() -> Dict[str, BurnInPresetSchema]:
    """
    Load user and derived presets from JSON file.
    
    Returns:
        Dictionary mapping preset ID to BurnInPresetSchema
    """
    if not USER_PRESETS_FILE.exists():
        return {}
    
    with open(USER_PRESETS_FILE, "r") as f:
        data = json.load(f)
    
    presets = {}
    for preset_data in data.get("presets", []):
        preset_type = PresetType(preset_data.get("preset_type", "user"))
        preset = BurnInPresetSchema.from_dict(preset_data, preset_type)
        presets[preset.id] = preset
    
    return presets


def save_user_preset(preset: BurnInPresetSchema) -> None:
    """
    Save a user or derived preset to storage.
    
    Args:
        preset: The preset to save
        
    Raises:
        PresetEnforcementError: If attempting to save industry preset
    """
    if preset.is_industry:
        raise PresetEnforcementError(
            f"Cannot save industry preset '{preset.id}' to user storage."
        )
    
    presets = load_user_presets()
    presets[preset.id] = preset
    
    # Ensure directory exists
    USER_PRESETS_FILE.parent.mkdir(parents=True, exist_ok=True)
    
    with open(USER_PRESETS_FILE, "w") as f:
        json.dump({
            "version": "1.0.0",
            "presets": [p.to_dict() for p in presets.values()]
        }, f, indent=2)


def get_all_presets() -> Dict[str, BurnInPresetSchema]:
    """
    Get all presets (industry + user + derived).
    
    Industry presets take precedence if ID conflicts (should not happen).
    
    Returns:
        Dictionary mapping preset ID to BurnInPresetSchema
    """
    all_presets = load_user_presets()
    all_presets.update(load_industry_presets())  # Industry takes precedence
    return all_presets


def get_preset(preset_id: str) -> BurnInPresetSchema:
    """
    Get a specific preset by ID.
    
    Args:
        preset_id: The preset ID to retrieve
        
    Returns:
        BurnInPresetSchema instance
        
    Raises:
        PresetEnforcementError: If preset not found
    """
    presets = get_all_presets()
    if preset_id not in presets:
        raise PresetEnforcementError(
            f"Preset '{preset_id}' not found. Available: {list(presets.keys())}"
        )
    return presets[preset_id]


# =============================================================================
# Job Logging
# =============================================================================

def log_preset_provenance(
    job_id: str,
    preset: BurnInPresetSchema,
) -> Dict[str, Any]:
    """
    Generate provenance log entry for job logs.
    
    This creates a structured log entry that records:
    - Which preset was used
    - The preset type (industry/user/derived)
    - Derivation chain if applicable
    
    Args:
        job_id: The job ID for correlation
        preset: The preset being used
        
    Returns:
        Dictionary suitable for job log entry
    """
    provenance = preset.get_provenance()
    
    log_entry = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "job_id": job_id,
        "event": "burnin_preset_applied",
        "preset_id": provenance.preset_id,
        "preset_type": provenance.preset_type.value,
        "derived_from": provenance.derived_from,
        "derived_at": provenance.derived_at,
        "locked_fields_modified": list(provenance.locked_fields_modified),
    }
    
    # Log the entry
    logger.info(
        f"[{job_id}] Burn-in preset applied: {provenance.preset_id} "
        f"(type={provenance.preset_type.value}"
        f"{f', derived_from={provenance.derived_from}' if provenance.derived_from else ''})"
    )
    
    return log_entry


def get_preset_badge_info(preset: BurnInPresetSchema) -> Dict[str, Any]:
    """
    Get badge display information for UI.
    
    Args:
        preset: The preset to get badge info for
        
    Returns:
        Dictionary with badge label, color, and tooltip
    """
    badge_configs = {
        PresetType.INDUSTRY: {
            "label": "INDUSTRY",
            "color": "blue",
            "tooltip": "Industry standard preset — cannot be modified",
            "icon": "lock",
        },
        PresetType.USER: {
            "label": "USER",
            "color": "green",
            "tooltip": "User-created preset — mutable fields can be edited",
            "icon": "user",
        },
        PresetType.DERIVED: {
            "label": "DERIVED",
            "color": "orange",
            "tooltip": f"Derived from: {preset.derived_from}",
            "icon": "git-branch",
        },
    }
    
    return badge_configs[preset.preset_type]


# =============================================================================
# Public API
# =============================================================================

__all__ = [
    # Enums
    "PresetType",
    "FieldType",
    # Constants
    "LOCKED_FIELDS",
    "MUTABLE_FIELDS",
    "FIELD_SCHEMA",
    # Exceptions
    "PresetEnforcementError",
    "ImmutablePresetError",
    "LockedFieldModificationError",
    "InvalidFieldError",
    "ProvenanceError",
    # Data Classes
    "PresetProvenance",
    "BurnInPresetSchema",
    # Schema Enforcement
    "classify_field",
    "validate_modification",
    "apply_mutable_modifications",
    "create_derived_preset",
    # Storage
    "load_industry_presets",
    "load_user_presets",
    "save_user_preset",
    "get_all_presets",
    "get_preset",
    # Logging
    "log_preset_provenance",
    "get_preset_badge_info",
]
