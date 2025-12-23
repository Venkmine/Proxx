"""
Settings Presets — Immutable DeliverSettings Snapshots.

Phase 6: Preset Foundations.

Presets are SNAPSHOTS, not live bindings:
- Apply only at job creation
- Jobs own their settings forever after creation
- Editing a preset creates a new version, never mutates existing jobs
- No inheritance, no partial presets, no defaults, no auto-apply

RULES (NON-NEGOTIABLE):
1. Presets are snapshots, not live bindings
2. Presets apply only at job creation
3. Jobs own their settings forever after creation
4. Editing a preset = duplicate + delete old (explicit)
5. No PATCH. No mutation.
6. Diagnostics must always explain whether a preset was used
"""

import uuid
import json
import hashlib
import os
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field, ConfigDict, field_validator

from app.deliver.settings import DeliverSettings


# ============================================================================
# SETTINGS PRESET MODEL
# ============================================================================

class SettingsPreset(BaseModel):
    """
    An immutable settings snapshot.
    
    Presets contain a COMPLETE DeliverSettings snapshot.
    No partial presets. No inheritance. No defaults.
    
    When applied to a job:
    - settings_snapshot is COPIED into job.settings_dict
    - Job stores source_preset_id + source_preset_name for diagnostics
    - Preset changes NEVER affect existing jobs
    """
    
    model_config = ConfigDict(
        extra="forbid",
        frozen=True,  # Immutable after creation
    )
    
    # Identity
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str = ""
    
    # Settings snapshot (full DeliverSettings as dict)
    settings_snapshot: Dict[str, Any]
    
    # Organization
    tags: List[str] = Field(default_factory=list)
    
    # Timestamps
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    
    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        """Name must be non-empty."""
        if not v or not v.strip():
            raise ValueError("Preset name cannot be empty")
        return v.strip()
    
    @field_validator("settings_snapshot")
    @classmethod
    def validate_settings(cls, v: Dict[str, Any]) -> Dict[str, Any]:
        """Settings snapshot must be valid DeliverSettings dict."""
        if not v:
            raise ValueError("Settings snapshot cannot be empty")
        # Validate by deserializing
        try:
            DeliverSettings.from_dict(v)
        except Exception as e:
            raise ValueError(f"Invalid settings snapshot: {e}")
        return v
    
    @property
    def fingerprint(self) -> str:
        """
        Get a deterministic hash of the settings snapshot.
        
        Used for diagnostics to verify settings haven't changed.
        """
        # Sort keys for deterministic serialization
        canonical = json.dumps(self.settings_snapshot, sort_keys=True, separators=(',', ':'))
        return hashlib.sha256(canonical.encode()).hexdigest()[:16]
    
    def get_settings(self) -> DeliverSettings:
        """Get the DeliverSettings from the snapshot."""
        return DeliverSettings.from_dict(self.settings_snapshot)
    
    def to_dict(self) -> Dict[str, Any]:
        """Serialize to dictionary for JSON storage."""
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "settings_snapshot": self.settings_snapshot,
            "tags": list(self.tags),
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "SettingsPreset":
        """Deserialize from dictionary."""
        return cls(
            id=data.get("id", str(uuid.uuid4())),
            name=data["name"],
            description=data.get("description", ""),
            settings_snapshot=data["settings_snapshot"],
            tags=data.get("tags", []),
            created_at=data.get("created_at", datetime.now().isoformat()),
            updated_at=data.get("updated_at", datetime.now().isoformat()),
        )


# ============================================================================
# SETTINGS PRESET STORE
# ============================================================================

class SettingsPresetStore:
    """
    JSON file-based storage for settings presets.
    
    Alpha-appropriate persistence:
    - Simple JSON file storage
    - No complex database
    - No migration of old jobs
    
    Thread-safety: Not thread-safe (Alpha limitation).
    For production, would need locking or database.
    """
    
    DEFAULT_PATH = Path.home() / ".proxx" / "presets.json"
    
    def __init__(self, storage_path: Optional[Path] = None):
        """
        Initialize preset store.
        
        Args:
            storage_path: Path to JSON storage file (default: ~/.proxx/presets.json)
        """
        self.storage_path = storage_path or self.DEFAULT_PATH
        self._presets: Dict[str, SettingsPreset] = {}
        self._load()
    
    def _load(self) -> None:
        """Load presets from storage."""
        if not self.storage_path.exists():
            self._presets = {}
            return
        
        try:
            with open(self.storage_path, 'r') as f:
                data = json.load(f)
            
            self._presets = {}
            for preset_data in data.get("presets", []):
                try:
                    preset = SettingsPreset.from_dict(preset_data)
                    self._presets[preset.id] = preset
                except Exception as e:
                    # Skip invalid presets rather than fail entirely
                    print(f"Warning: Failed to load preset: {e}")
        except Exception as e:
            print(f"Warning: Failed to load presets from {self.storage_path}: {e}")
            self._presets = {}
    
    def _save(self) -> None:
        """Persist presets to storage."""
        # Ensure directory exists
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        
        data = {
            "version": 1,
            "presets": [p.to_dict() for p in self._presets.values()]
        }
        
        # Atomic write via temp file
        temp_path = self.storage_path.with_suffix('.tmp')
        with open(temp_path, 'w') as f:
            json.dump(data, f, indent=2)
        temp_path.replace(self.storage_path)
    
    def list_presets(self) -> List[SettingsPreset]:
        """
        List all presets.
        
        Returns:
            List of presets sorted by name
        """
        return sorted(self._presets.values(), key=lambda p: p.name.lower())
    
    def get_preset(self, preset_id: str) -> Optional[SettingsPreset]:
        """
        Get a preset by ID.
        
        Args:
            preset_id: The preset UUID
            
        Returns:
            The preset if found, None otherwise
        """
        return self._presets.get(preset_id)
    
    def create_preset(
        self,
        name: str,
        settings: DeliverSettings,
        description: str = "",
        tags: Optional[List[str]] = None,
    ) -> SettingsPreset:
        """
        Create a new preset from settings snapshot.
        
        Args:
            name: Preset name (must be unique)
            settings: DeliverSettings to snapshot
            description: Optional description
            tags: Optional tags for organization
            
        Returns:
            The created preset
            
        Raises:
            ValueError: If name is empty or already taken
        """
        # Check for duplicate names
        for existing in self._presets.values():
            if existing.name.lower() == name.strip().lower():
                raise ValueError(f"A preset named '{name}' already exists")
        
        preset = SettingsPreset(
            name=name,
            description=description,
            settings_snapshot=settings.to_dict(),
            tags=tags or [],
        )
        
        self._presets[preset.id] = preset
        self._save()
        
        return preset
    
    def duplicate_preset(
        self,
        preset_id: str,
        new_name: Optional[str] = None,
    ) -> Optional[SettingsPreset]:
        """
        Create a new preset from an existing preset's snapshot.
        
        This is the ONLY way to "edit" a preset:
        1. Duplicate the preset
        2. Delete the old one (if desired)
        
        Args:
            preset_id: The preset to duplicate
            new_name: Name for the new preset (default: "Copy of {name}")
            
        Returns:
            The new preset, or None if source preset not found
        """
        source = self._presets.get(preset_id)
        if not source:
            return None
        
        # Generate unique name
        base_name = new_name or f"Copy of {source.name}"
        name = base_name
        counter = 1
        while any(p.name.lower() == name.lower() for p in self._presets.values()):
            counter += 1
            name = f"{base_name} ({counter})"
        
        # Create new preset with same snapshot
        new_preset = SettingsPreset(
            name=name,
            description=source.description,
            settings_snapshot=source.settings_snapshot,
            tags=list(source.tags),
        )
        
        self._presets[new_preset.id] = new_preset
        self._save()
        
        return new_preset
    
    def delete_preset(self, preset_id: str) -> bool:
        """
        Delete a preset.
        
        Note: This does NOT affect any jobs that were created from this preset.
        Jobs own their settings forever after creation.
        
        Args:
            preset_id: The preset to delete
            
        Returns:
            True if deleted, False if not found
        """
        if preset_id not in self._presets:
            return False
        
        del self._presets[preset_id]
        self._save()
        return True
    
    def is_preset_referenced_by_jobs(
        self, preset_id: str, job_registry: Any
    ) -> List[str]:
        """
        Check if any jobs reference this preset.
        
        Used for delete guard - warn user if preset is referenced.
        Note: This is informational only - deleting preset does NOT
        affect the jobs (they own their settings).
        
        Args:
            preset_id: The preset to check
            job_registry: JobRegistry to check against
            
        Returns:
            List of job IDs that reference this preset
        """
        referencing_jobs = []
        for job in job_registry.list_jobs():
            if getattr(job, 'source_preset_id', None) == preset_id:
                referencing_jobs.append(job.id)
        return referencing_jobs
