"""
Forge Licensing - License Model

Defines explicit license tiers with worker limits.
No encryption. No obfuscation. This is policy, not anti-piracy.

LICENSE TIERS (LOCKED FOR V1):
------------------------------
1. FREE
   - Max workers: 1
   - Monitoring: local only
   - No LAN exposure
   - Intended for evaluation

2. FREELANCE
   - Max workers: 3
   - Monitoring: LAN allowed
   - Intended for individuals with spare machines

3. FACILITY
   - Max workers: unlimited (None)
   - Monitoring: LAN allowed
   - Cloud admin: NOT IMPLEMENTED (flag only)

No other tiers.
No dynamic scaling.
No "temporary boosts".
"""

from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Dict, Optional, Any


class LicenseTier(str, Enum):
    """
    License tier enumeration.
    
    These are the ONLY valid tiers. No dynamic tiers.
    No trial tiers. No enterprise tiers. No "pro" tiers.
    """
    FREE = "free"
    FREELANCE = "freelance"
    FACILITY = "facility"


# Locked tier limits - DO NOT ADD DYNAMIC BEHAVIOR
TIER_LIMITS: Dict[LicenseTier, Optional[int]] = {
    LicenseTier.FREE: 1,
    LicenseTier.FREELANCE: 3,
    LicenseTier.FACILITY: None,  # None = unlimited
}


def get_max_workers(tier: LicenseTier) -> Optional[int]:
    """
    Get the maximum worker count for a license tier.
    
    Args:
        tier: License tier
        
    Returns:
        Maximum worker count, or None for unlimited
    """
    return TIER_LIMITS[tier]


@dataclass(frozen=True)
class License:
    """
    Immutable license record.
    
    Attributes:
        license_type: The license tier (FREE, FREELANCE, FACILITY)
        max_workers: Maximum concurrent workers (None = unlimited)
        issued_at: ISO 8601 timestamp when license was created
        notes: Optional free-text notes
    """
    license_type: LicenseTier
    max_workers: Optional[int]
    issued_at: str
    notes: Optional[str] = None
    
    @classmethod
    def create(
        cls,
        license_type: LicenseTier,
        notes: Optional[str] = None
    ) -> "License":
        """
        Create a new license with auto-derived limits.
        
        Args:
            license_type: The license tier
            notes: Optional notes
            
        Returns:
            Immutable License instance
        """
        return cls(
            license_type=license_type,
            max_workers=get_max_workers(license_type),
            issued_at=datetime.now(timezone.utc).isoformat(),
            notes=notes,
        )
    
    @classmethod
    def default(cls) -> "License":
        """
        Create the default FREE license.
        
        This is what users get without any license file or override.
        Forge is honest about what the free tier provides.
        """
        return cls.create(
            license_type=LicenseTier.FREE,
            notes="Default free license for evaluation"
        )
    
    def to_dict(self) -> Dict[str, Any]:
        """Serialize license to dictionary."""
        return {
            "license_type": self.license_type.value,
            "max_workers": self.max_workers,
            "issued_at": self.issued_at,
            "notes": self.notes,
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "License":
        """
        Deserialize license from dictionary.
        
        Validates that the license type is known.
        Unknown types fall back to FREE tier with a note.
        """
        try:
            license_type = LicenseTier(data["license_type"].lower())
        except (ValueError, KeyError):
            # Unknown tier falls back to FREE
            # This is explicit, not silent
            return cls(
                license_type=LicenseTier.FREE,
                max_workers=get_max_workers(LicenseTier.FREE),
                issued_at=data.get("issued_at", datetime.now(timezone.utc).isoformat()),
                notes=f"Unknown tier '{data.get('license_type')}' - defaulted to FREE"
            )
        
        return cls(
            license_type=license_type,
            max_workers=data.get("max_workers", get_max_workers(license_type)),
            issued_at=data.get("issued_at", datetime.now(timezone.utc).isoformat()),
            notes=data.get("notes"),
        )
    
    def is_unlimited(self) -> bool:
        """Check if this license has unlimited workers."""
        return self.max_workers is None
    
    def allows_lan_monitoring(self) -> bool:
        """Check if this license allows LAN monitoring."""
        # FREE tier is local only
        return self.license_type != LicenseTier.FREE
    
    def __str__(self) -> str:
        workers = "unlimited" if self.max_workers is None else str(self.max_workers)
        return f"License({self.license_type.value}, max_workers={workers})"
