"""
Forge Licensing - License Store

Reads license configuration from local sources only.
NO network calls. NO activation. NO phone-home.

License Resolution Order:
1. Environment variable FORGE_LICENSE_TYPE
2. Local JSON file (forge_license.json)
3. Default FREE license

The license is cached for the lifetime of the process.
No background refresh. No silent updates.
"""

import json
import logging
import os
from pathlib import Path
from typing import Optional

from .license_model import License, LicenseTier, get_max_workers


logger = logging.getLogger(__name__)


# Environment variable for license override
LICENSE_ENV_VAR = "FORGE_LICENSE_TYPE"

# Default license file path (relative to working directory)
DEFAULT_LICENSE_FILE = Path("forge_license.json")


class LicenseStore:
    """
    Local-first license store.
    
    Reads license from environment or local file.
    Caches the result. No network calls.
    """
    
    def __init__(
        self,
        license_file: Optional[Path] = None,
        env_var: str = LICENSE_ENV_VAR,
    ):
        """
        Initialize the license store.
        
        Args:
            license_file: Path to license JSON file
            env_var: Environment variable name for tier override
        """
        self.license_file = license_file or DEFAULT_LICENSE_FILE
        self.env_var = env_var
        self._cached_license: Optional[License] = None
    
    def get_license(self) -> License:
        """
        Get the current license.
        
        Resolution order:
        1. Environment variable (FORGE_LICENSE_TYPE)
        2. Local JSON file (forge_license.json)
        3. Default FREE license
        
        The result is cached for process lifetime.
        
        Returns:
            The resolved License
        """
        if self._cached_license is not None:
            return self._cached_license
        
        # 1. Check environment variable
        license_from_env = self._load_from_env()
        if license_from_env is not None:
            self._cached_license = license_from_env
            logger.info(f"License loaded from environment: {license_from_env}")
            return license_from_env
        
        # 2. Check local file
        license_from_file = self._load_from_file()
        if license_from_file is not None:
            self._cached_license = license_from_file
            logger.info(f"License loaded from file: {license_from_file}")
            return license_from_file
        
        # 3. Default to FREE
        default_license = License.default()
        self._cached_license = default_license
        logger.info(f"Using default license: {default_license}")
        return default_license
    
    def _load_from_env(self) -> Optional[License]:
        """
        Load license from environment variable.
        
        The environment variable specifies the tier name directly.
        """
        tier_name = os.environ.get(self.env_var)
        if not tier_name:
            return None
        
        tier_name = tier_name.strip().lower()
        
        try:
            tier = LicenseTier(tier_name)
            return License.create(
                license_type=tier,
                notes=f"Set via environment variable {self.env_var}"
            )
        except ValueError:
            logger.warning(
                f"Unknown license tier '{tier_name}' in {self.env_var}. "
                f"Valid tiers: {[t.value for t in LicenseTier]}"
            )
            return None
    
    def _load_from_file(self) -> Optional[License]:
        """
        Load license from local JSON file.
        
        The file must exist and be valid JSON.
        Invalid files are logged and skipped.
        """
        if not self.license_file.exists():
            return None
        
        try:
            with open(self.license_file, "r") as f:
                data = json.load(f)
            return License.from_dict(data)
        except json.JSONDecodeError as e:
            logger.warning(f"Invalid license file {self.license_file}: {e}")
            return None
        except Exception as e:
            logger.warning(f"Error reading license file {self.license_file}: {e}")
            return None
    
    def clear_cache(self) -> None:
        """
        Clear the cached license.
        
        Useful for testing or when license file changes.
        """
        self._cached_license = None
    
    def get_license_source(self) -> str:
        """
        Get the source of the current license.
        
        Returns:
            Description of where the license came from
        """
        if os.environ.get(self.env_var):
            return f"environment variable ({self.env_var})"
        if self.license_file.exists():
            return f"file ({self.license_file})"
        return "default (FREE)"


# Module-level singleton store
_default_store: Optional[LicenseStore] = None


def get_license_store() -> LicenseStore:
    """Get the default license store singleton."""
    global _default_store
    if _default_store is None:
        _default_store = LicenseStore()
    return _default_store


def get_current_license() -> License:
    """Get the current license from the default store."""
    return get_license_store().get_license()
