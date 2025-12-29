"""
Fabric Views - Read-Only Composition Layer

This module provides read-only views that compose Fabric data with
operator annotations. Views do NOT mutate data or drive execution.
"""

from .views import (
    FabricViewComposer,
    JobWithAnnotations,
    SnapshotWithAnnotations,
)

__all__ = [
    "FabricViewComposer",
    "JobWithAnnotations",
    "SnapshotWithAnnotations",
]
