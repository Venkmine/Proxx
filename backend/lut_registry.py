"""
LUT Registry - Deterministic, auditable LUT management for Forge.

=============================================================================
DESIGN PRINCIPLES
=============================================================================

1. EXPLICIT REGISTRATION: No LUT is valid unless registered via this module.
   LUTs are not auto-discovered or guessed.

2. HASH VERIFICATION: Every registered LUT has a SHA256 hash computed at
   registration time. This enables audit trails and integrity verification.

3. NO LUT MODIFICATION: This registry stores metadata only. LUT files are
   NEVER modified, converted, or transformed by Forge.

4. NO LUT CHAINING: Multiple LUTs are NOT supported. If you need a combined
   LUT, create it upstream and register the combined result.

5. FORMAT STRICTNESS: Only officially supported formats are allowed:
   - .cube (3D LUT - universal support)
   - .3dl (3D LUT - legacy Autodesk/Lustre format)
   - .dat (Resolve-only - limited compatibility)

6. FAIL-LOUD: Invalid LUTs, missing files, or unsupported formats result in
   explicit errors. No silent fallback or degraded operation.

=============================================================================
LUT APPLICATION SCOPE
=============================================================================

LUTs applied by Forge are FOR PROXY VIEWING ONLY:

- LUTs are baked into proxy output files
- Original source media is NEVER modified
- This is a NON-DESTRUCTIVE, preview-focused workflow
- Final color grading must be done on source media in a proper grading tool

=============================================================================
Part of V2 Phase 1 (Option A: Reliable Proxy Engine)
=============================================================================
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Dict, List, Optional, Set
import hashlib
import json
import logging
import os

logger = logging.getLogger(__name__)


# =============================================================================
# Supported LUT Formats
# =============================================================================

class LUTFormat(str, Enum):
    """Supported LUT file formats."""
    CUBE = "cube"  # Industry standard 3D LUT (Adobe, Resolve, FFmpeg)
    DL3 = "3dl"    # Legacy Autodesk/Lustre 3D LUT format
    DAT = "dat"    # Resolve-specific format (limited compatibility)


# File extension to format mapping
SUPPORTED_LUT_EXTENSIONS: Dict[str, LUTFormat] = {
    ".cube": LUTFormat.CUBE,
    ".3dl": LUTFormat.DL3,
    ".dat": LUTFormat.DAT,
}

# Formats supported by each engine
FFMPEG_SUPPORTED_FORMATS: Set[LUTFormat] = {LUTFormat.CUBE, LUTFormat.DL3}
RESOLVE_SUPPORTED_FORMATS: Set[LUTFormat] = {LUTFormat.CUBE, LUTFormat.DL3, LUTFormat.DAT}


# =============================================================================
# LUT Origin Types
# =============================================================================

class LUTOrigin(str, Enum):
    """Classification of LUT origin/purpose."""
    DIT = "DIT"                    # On-set DIT-provided LUT
    SHOW_LUT = "Show LUT"          # Production/show-specific LUT
    CAMERA_LUT = "Camera LUT"      # Camera manufacturer LUT (e.g., ARRI, RED)
    FACILITY_LUT = "Facility LUT"  # Post facility standard LUT
    CUSTOM = "Custom"              # User-defined/other


# =============================================================================
# LUT Entry Data Structure
# =============================================================================

@dataclass
class LUTEntry:
    """
    Registered LUT entry with full metadata for auditability.
    
    Every field is explicitly set at registration time.
    No auto-detection or inference is performed.
    
    Attributes:
        lut_id: Unique identifier for this LUT (user-assigned or auto-generated)
        filename: Original filename of the LUT file
        filepath: Absolute path to the LUT file
        file_hash: SHA256 hash of the LUT file contents
        format: LUT file format (cube, 3dl, dat)
        color_space_note: Free-text color space description (e.g., "Log-C to Rec.709")
        origin: Classification of LUT origin (DIT, Show LUT, Camera LUT, etc.)
        registered_at: ISO 8601 timestamp of registration
        description: Optional free-text description
    """
    lut_id: str
    filename: str
    filepath: str
    file_hash: str
    format: LUTFormat
    color_space_note: str
    origin: LUTOrigin
    registered_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    description: Optional[str] = None
    
    def to_dict(self) -> Dict:
        """Serialize to dictionary for JSON persistence."""
        return {
            "lut_id": self.lut_id,
            "filename": self.filename,
            "filepath": self.filepath,
            "file_hash": self.file_hash,
            "format": self.format.value,
            "color_space_note": self.color_space_note,
            "origin": self.origin.value,
            "registered_at": self.registered_at,
            "description": self.description,
        }
    
    @classmethod
    def from_dict(cls, data: Dict) -> "LUTEntry":
        """Deserialize from dictionary."""
        return cls(
            lut_id=data["lut_id"],
            filename=data["filename"],
            filepath=data["filepath"],
            file_hash=data["file_hash"],
            format=LUTFormat(data["format"]),
            color_space_note=data["color_space_note"],
            origin=LUTOrigin(data["origin"]),
            registered_at=data.get("registered_at", datetime.now(timezone.utc).isoformat()),
            description=data.get("description"),
        )
    
    def is_compatible_with_engine(self, engine: str) -> bool:
        """
        Check if this LUT format is compatible with the given execution engine.
        
        Args:
            engine: Execution engine name ("ffmpeg" or "resolve")
            
        Returns:
            True if the LUT format is supported by the engine
        """
        if engine == "ffmpeg":
            return self.format in FFMPEG_SUPPORTED_FORMATS
        elif engine == "resolve":
            return self.format in RESOLVE_SUPPORTED_FORMATS
        else:
            return False


# =============================================================================
# LUT Registry Exceptions
# =============================================================================

class LUTRegistryError(Exception):
    """Base exception for LUT registry operations."""
    pass


class LUTNotFoundError(LUTRegistryError):
    """Raised when a LUT ID is not found in the registry."""
    pass


class LUTFileNotFoundError(LUTRegistryError):
    """Raised when a LUT file does not exist at the specified path."""
    pass


class LUTFormatError(LUTRegistryError):
    """Raised when a LUT file has an unsupported format."""
    pass


class LUTHashMismatchError(LUTRegistryError):
    """Raised when a LUT file hash does not match the registered hash."""
    pass


class LUTEngineCompatibilityError(LUTRegistryError):
    """Raised when a LUT format is incompatible with the target engine."""
    pass


class LUTAlreadyRegisteredError(LUTRegistryError):
    """Raised when attempting to register a LUT with a duplicate ID."""
    pass


# =============================================================================
# LUT Registry Implementation
# =============================================================================

class LUTRegistry:
    """
    In-memory LUT registry with persistence support.
    
    This is the SINGLE SOURCE OF TRUTH for LUT metadata in Forge.
    All LUT lookups and validations must go through this registry.
    
    Registry Semantics:
    -------------------
    - register_lut(): Add a new LUT to the registry
    - get_lut(): Retrieve a LUT by ID (fails if not found)
    - validate_lut(): Verify a LUT exists and hash matches
    - list_luts(): List all registered LUTs
    - remove_lut(): Remove a LUT from the registry
    
    Persistence:
    ------------
    The registry can be persisted to a JSON file and loaded on startup.
    This enables LUT registration to survive process restarts.
    """
    
    def __init__(self, registry_path: Optional[Path] = None):
        """
        Initialize the LUT registry.
        
        Args:
            registry_path: Path to JSON file for persistence.
                          If None, registry is in-memory only.
        """
        self._entries: Dict[str, LUTEntry] = {}
        self._registry_path = registry_path
        
        # Load existing registry if path provided
        if registry_path and registry_path.exists():
            self._load_from_file()
    
    def _load_from_file(self) -> None:
        """Load registry entries from JSON file."""
        if self._registry_path is None:
            return
            
        try:
            with open(self._registry_path, "r") as f:
                data = json.load(f)
            
            for entry_data in data.get("luts", []):
                entry = LUTEntry.from_dict(entry_data)
                self._entries[entry.lut_id] = entry
            
            logger.info(f"Loaded {len(self._entries)} LUTs from registry: {self._registry_path}")
        except (json.JSONDecodeError, KeyError) as e:
            logger.error(f"Failed to load LUT registry from {self._registry_path}: {e}")
            raise LUTRegistryError(f"Failed to load LUT registry: {e}")
    
    def _save_to_file(self) -> None:
        """Persist registry entries to JSON file."""
        if self._registry_path is None:
            return
        
        data = {
            "version": "1.0",
            "luts": [entry.to_dict() for entry in self._entries.values()]
        }
        
        # Ensure parent directory exists
        self._registry_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(self._registry_path, "w") as f:
            json.dump(data, f, indent=2)
        
        logger.info(f"Saved {len(self._entries)} LUTs to registry: {self._registry_path}")
    
    @staticmethod
    def compute_file_hash(filepath: Path) -> str:
        """
        Compute SHA256 hash of a file.
        
        Args:
            filepath: Path to the file to hash
            
        Returns:
            Lowercase hexadecimal SHA256 hash string
            
        Raises:
            LUTFileNotFoundError: If file does not exist
        """
        if not filepath.exists():
            raise LUTFileNotFoundError(f"LUT file not found: {filepath}")
        
        sha256_hash = hashlib.sha256()
        with open(filepath, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                sha256_hash.update(chunk)
        
        return sha256_hash.hexdigest()
    
    @staticmethod
    def detect_format(filepath: Path) -> LUTFormat:
        """
        Detect LUT format from file extension.
        
        Args:
            filepath: Path to the LUT file
            
        Returns:
            LUTFormat enum value
            
        Raises:
            LUTFormatError: If file extension is not supported
        """
        ext = filepath.suffix.lower()
        if ext not in SUPPORTED_LUT_EXTENSIONS:
            supported = ", ".join(SUPPORTED_LUT_EXTENSIONS.keys())
            raise LUTFormatError(
                f"Unsupported LUT format: '{ext}'. "
                f"Supported formats: {supported}"
            )
        return SUPPORTED_LUT_EXTENSIONS[ext]
    
    def register_lut(
        self,
        filepath: Path,
        color_space_note: str,
        origin: LUTOrigin,
        lut_id: Optional[str] = None,
        description: Optional[str] = None,
    ) -> LUTEntry:
        """
        Register a LUT file in the registry.
        
        This is the ONLY way to add LUTs to Forge. Registration involves:
        1. Verify file exists
        2. Detect and validate format
        3. Compute SHA256 hash
        4. Store entry with all metadata
        
        Args:
            filepath: Absolute path to the LUT file
            color_space_note: Description of color space transform
                             (e.g., "ARRI Log-C to Rec.709")
            origin: Classification of LUT origin (DIT, Show LUT, etc.)
            lut_id: Optional unique identifier. If not provided, filename
                    stem (without extension) is used.
            description: Optional free-text description
            
        Returns:
            The registered LUTEntry
            
        Raises:
            LUTFileNotFoundError: If file does not exist
            LUTFormatError: If file format is not supported
            LUTAlreadyRegisteredError: If lut_id already exists
        """
        filepath = Path(filepath).absolute()
        
        # Validate file exists
        if not filepath.exists():
            raise LUTFileNotFoundError(f"LUT file not found: {filepath}")
        
        if not filepath.is_file():
            raise LUTFileNotFoundError(f"LUT path is not a file: {filepath}")
        
        # Detect format
        lut_format = self.detect_format(filepath)
        
        # Generate or validate ID
        if lut_id is None:
            lut_id = filepath.stem
        
        if lut_id in self._entries:
            raise LUTAlreadyRegisteredError(
                f"LUT with ID '{lut_id}' is already registered. "
                "Use a different ID or remove the existing entry first."
            )
        
        # Compute hash
        file_hash = self.compute_file_hash(filepath)
        
        # Create entry
        entry = LUTEntry(
            lut_id=lut_id,
            filename=filepath.name,
            filepath=str(filepath),
            file_hash=file_hash,
            format=lut_format,
            color_space_note=color_space_note,
            origin=origin,
            description=description,
        )
        
        # Store entry
        self._entries[lut_id] = entry
        
        # Persist if path configured
        self._save_to_file()
        
        logger.info(
            f"Registered LUT: id={lut_id}, "
            f"format={lut_format.value}, "
            f"hash={file_hash[:16]}..., "
            f"origin={origin.value}"
        )
        
        return entry
    
    def get_lut(self, lut_id: str) -> LUTEntry:
        """
        Retrieve a LUT entry by ID.
        
        Args:
            lut_id: The unique identifier of the LUT
            
        Returns:
            The LUTEntry if found
            
        Raises:
            LUTNotFoundError: If LUT ID is not in the registry
        """
        if lut_id not in self._entries:
            raise LUTNotFoundError(
                f"LUT '{lut_id}' not found in registry. "
                "LUTs must be explicitly registered before use. "
                "Use LUTRegistry.register_lut() to add a LUT."
            )
        return self._entries[lut_id]
    
    def validate_lut(self, lut_id: str, verify_hash: bool = True) -> LUTEntry:
        """
        Validate a LUT exists and optionally verify its hash.
        
        This should be called before applying a LUT to ensure:
        1. The LUT is registered
        2. The file still exists
        3. The file has not been modified (hash match)
        
        Args:
            lut_id: The unique identifier of the LUT
            verify_hash: Whether to recompute and verify file hash
            
        Returns:
            The validated LUTEntry
            
        Raises:
            LUTNotFoundError: If LUT ID is not in the registry
            LUTFileNotFoundError: If LUT file no longer exists
            LUTHashMismatchError: If file hash differs from registered hash
        """
        entry = self.get_lut(lut_id)
        
        # Verify file exists
        filepath = Path(entry.filepath)
        if not filepath.exists():
            raise LUTFileNotFoundError(
                f"LUT file no longer exists: {entry.filepath}. "
                f"The file was registered but has been moved or deleted."
            )
        
        # Verify hash if requested
        if verify_hash:
            current_hash = self.compute_file_hash(filepath)
            if current_hash != entry.file_hash:
                raise LUTHashMismatchError(
                    f"LUT file has been modified since registration. "
                    f"Registered hash: {entry.file_hash[:16]}..., "
                    f"Current hash: {current_hash[:16]}... "
                    f"Re-register the LUT if the modification was intentional."
                )
        
        return entry
    
    def validate_lut_for_engine(self, lut_id: str, engine: str) -> LUTEntry:
        """
        Validate a LUT is compatible with a specific execution engine.
        
        Args:
            lut_id: The unique identifier of the LUT
            engine: Execution engine name ("ffmpeg" or "resolve")
            
        Returns:
            The validated LUTEntry
            
        Raises:
            LUTNotFoundError: If LUT ID is not in the registry
            LUTEngineCompatibilityError: If LUT format is not supported by engine
        """
        entry = self.validate_lut(lut_id)
        
        if not entry.is_compatible_with_engine(engine):
            if engine == "ffmpeg":
                supported = ", ".join(f.value for f in FFMPEG_SUPPORTED_FORMATS)
                raise LUTEngineCompatibilityError(
                    f"LUT format '{entry.format.value}' is not supported by FFmpeg. "
                    f"FFmpeg supports: {supported}. "
                    f"Convert the LUT to .cube format for FFmpeg compatibility."
                )
            else:
                supported = ", ".join(f.value for f in RESOLVE_SUPPORTED_FORMATS)
                raise LUTEngineCompatibilityError(
                    f"LUT format '{entry.format.value}' is not supported by {engine}. "
                    f"Supported formats: {supported}."
                )
        
        return entry
    
    def list_luts(self) -> List[LUTEntry]:
        """
        List all registered LUTs.
        
        Returns:
            List of all LUTEntry instances in the registry
        """
        return list(self._entries.values())
    
    def remove_lut(self, lut_id: str) -> None:
        """
        Remove a LUT from the registry.
        
        This does NOT delete the LUT file, only the registry entry.
        
        Args:
            lut_id: The unique identifier of the LUT to remove
            
        Raises:
            LUTNotFoundError: If LUT ID is not in the registry
        """
        if lut_id not in self._entries:
            raise LUTNotFoundError(f"LUT '{lut_id}' not found in registry.")
        
        del self._entries[lut_id]
        self._save_to_file()
        
        logger.info(f"Removed LUT from registry: {lut_id}")
    
    def __len__(self) -> int:
        """Return number of registered LUTs."""
        return len(self._entries)
    
    def __contains__(self, lut_id: str) -> bool:
        """Check if a LUT ID is registered."""
        return lut_id in self._entries


# =============================================================================
# Global Registry Instance
# =============================================================================
# A singleton instance used by the application.
# Initialize with a path for persistence, or None for in-memory only.
# =============================================================================

_global_registry: Optional[LUTRegistry] = None


def get_registry(registry_path: Optional[Path] = None) -> LUTRegistry:
    """
    Get the global LUT registry instance.
    
    Args:
        registry_path: Path to JSON file for persistence.
                      Only used on first call to initialize the registry.
                      
    Returns:
        The global LUTRegistry instance
    """
    global _global_registry
    
    if _global_registry is None:
        # Default path in backend directory
        if registry_path is None:
            backend_dir = Path(__file__).parent
            registry_path = backend_dir / "lut_registry.json"
        
        _global_registry = LUTRegistry(registry_path)
    
    return _global_registry


def reset_registry() -> None:
    """Reset the global registry (for testing)."""
    global _global_registry
    _global_registry = None


# =============================================================================
# Convenience Functions
# =============================================================================

def register_lut(
    filepath: Path,
    color_space_note: str,
    origin: LUTOrigin,
    lut_id: Optional[str] = None,
    description: Optional[str] = None,
) -> LUTEntry:
    """
    Register a LUT in the global registry.
    
    Convenience wrapper around LUTRegistry.register_lut().
    See that method for full documentation.
    """
    return get_registry().register_lut(
        filepath=filepath,
        color_space_note=color_space_note,
        origin=origin,
        lut_id=lut_id,
        description=description,
    )


def get_lut(lut_id: str) -> LUTEntry:
    """
    Retrieve a LUT from the global registry.
    
    Convenience wrapper around LUTRegistry.get_lut().
    """
    return get_registry().get_lut(lut_id)


def validate_lut(lut_id: str, verify_hash: bool = True) -> LUTEntry:
    """
    Validate a LUT in the global registry.
    
    Convenience wrapper around LUTRegistry.validate_lut().
    """
    return get_registry().validate_lut(lut_id, verify_hash)


def validate_lut_for_engine(lut_id: str, engine: str) -> LUTEntry:
    """
    Validate a LUT is compatible with an execution engine.
    
    Convenience wrapper around LUTRegistry.validate_lut_for_engine().
    """
    return get_registry().validate_lut_for_engine(lut_id, engine)


# =============================================================================
# CLI Interface
# =============================================================================

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(
        description="LUT Registry Management",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Register a LUT
  python lut_registry.py register /path/to/lut.cube "Log-C to Rec.709" DIT
  
  # List all registered LUTs
  python lut_registry.py list
  
  # Validate a LUT
  python lut_registry.py validate my_lut_id
  
  # Remove a LUT
  python lut_registry.py remove my_lut_id
        """
    )
    
    subparsers = parser.add_subparsers(dest="command", help="Command to execute")
    
    # Register command
    register_parser = subparsers.add_parser("register", help="Register a LUT")
    register_parser.add_argument("filepath", type=Path, help="Path to LUT file")
    register_parser.add_argument("color_space", type=str, help="Color space note (e.g., 'Log-C to Rec.709')")
    register_parser.add_argument(
        "origin",
        type=str,
        choices=[o.value for o in LUTOrigin],
        help="LUT origin classification"
    )
    register_parser.add_argument("--id", type=str, help="Custom LUT ID")
    register_parser.add_argument("--description", type=str, help="Description")
    
    # List command
    list_parser = subparsers.add_parser("list", help="List all registered LUTs")
    
    # Validate command
    validate_parser = subparsers.add_parser("validate", help="Validate a LUT")
    validate_parser.add_argument("lut_id", type=str, help="LUT ID to validate")
    validate_parser.add_argument("--engine", type=str, choices=["ffmpeg", "resolve"],
                                 help="Check engine compatibility")
    
    # Remove command
    remove_parser = subparsers.add_parser("remove", help="Remove a LUT from registry")
    remove_parser.add_argument("lut_id", type=str, help="LUT ID to remove")
    
    args = parser.parse_args()
    
    if args.command == "register":
        try:
            entry = register_lut(
                filepath=args.filepath,
                color_space_note=args.color_space,
                origin=LUTOrigin(args.origin),
                lut_id=args.id,
                description=args.description,
            )
            print(f"✓ Registered LUT: {entry.lut_id}")
            print(f"  File: {entry.filename}")
            print(f"  Format: {entry.format.value}")
            print(f"  Hash: {entry.file_hash}")
            print(f"  Origin: {entry.origin.value}")
        except LUTRegistryError as e:
            print(f"✗ Error: {e}")
            sys.exit(1)
    
    elif args.command == "list":
        registry = get_registry()
        luts = registry.list_luts()
        if not luts:
            print("No LUTs registered.")
        else:
            print(f"Registered LUTs ({len(luts)}):")
            for entry in luts:
                print(f"  • {entry.lut_id}")
                print(f"    File: {entry.filename}")
                print(f"    Format: {entry.format.value}")
                print(f"    Color Space: {entry.color_space_note}")
                print(f"    Origin: {entry.origin.value}")
                print()
    
    elif args.command == "validate":
        try:
            if args.engine:
                entry = validate_lut_for_engine(args.lut_id, args.engine)
                print(f"✓ LUT '{args.lut_id}' is valid and compatible with {args.engine}")
            else:
                entry = validate_lut(args.lut_id)
                print(f"✓ LUT '{args.lut_id}' is valid")
            print(f"  Hash verified: {entry.file_hash}")
        except LUTRegistryError as e:
            print(f"✗ Validation failed: {e}")
            sys.exit(1)
    
    elif args.command == "remove":
        try:
            registry = get_registry()
            registry.remove_lut(args.lut_id)
            print(f"✓ Removed LUT: {args.lut_id}")
        except LUTRegistryError as e:
            print(f"✗ Error: {e}")
            sys.exit(1)
    
    else:
        parser.print_help()
