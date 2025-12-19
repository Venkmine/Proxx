"""
DeliverSettings — Canonical settings for render outputs.

BREAKING RENAME: JobSettings → DeliverSettings
This is a pre-1.0 breaking change. No legacy support.

Phase 17: Full Deliver capability model integration.

DeliverSettings define HOW outputs will be created:
- Set BEFORE render starts
- Editable ONLY while job.status == PENDING
- Frozen once any clip enters RUNNING
- Backend MUST enforce immutability (UI disabling insufficient)

This module re-exports from app.deliver.settings for backward compatibility
during migration. New code should import from app.deliver directly.
"""

# Re-export DeliverSettings as the canonical interface
from app.deliver.settings import DeliverSettings, DEFAULT_DELIVER_SETTINGS

# DEPRECATED: Legacy aliases for migration
# These will be removed in a future version
JobSettings = DeliverSettings  # DEPRECATED: Use DeliverSettings
DEFAULT_JOB_SETTINGS = DEFAULT_DELIVER_SETTINGS  # DEPRECATED: Use DEFAULT_DELIVER_SETTINGS
