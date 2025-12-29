"""
Fabric Snapshot - Immutable capture of operator report output.

PHASE-2: SNAPSHOT & DIFF (READ-ONLY)

This module provides point-in-time snapshots of FabricReportExporter output.
Snapshots are immutable, content-addressed captures used for comparison.

ABSOLUTE CONSTRAINTS:
---------------------
❌ NO filesystem writes
❌ NO persistence
❌ NO retries
❌ NO heuristics
❌ NO interpretation language
❌ NO execution coupling
❌ NO UI hooks
✅ READ-ONLY from FabricReportExporter only
✅ Deterministic snapshot_id from content
✅ Immutable after creation
✅ In-memory only

DESIGN PHILOSOPHY:
------------------
Snapshots freeze truth at a moment in time.
They enable comparison without interpretation.
Humans decide what changes mean.
"""

import copy
import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict

from fabric.export import FabricReportExporter, FabricExportError


class FabricSnapshotError(FabricExportError):
    """Raised when snapshot creation fails."""
    pass


@dataclass(frozen=True)
class FabricSnapshot:
    """
    Immutable point-in-time capture of operator report output.
    
    Attributes:
        snapshot_id: Deterministic content hash (SHA256 of report JSON)
        generated_at: ISO-8601 UTC timestamp of snapshot creation (informational only)
        report: EXACT output of FabricReportExporter.export_json()
    
    Constraints:
    - snapshot_id is deterministic from content (same report → same id)
    - generated_at is informational only, not part of content hash
    - Report content is immutable after creation
    - No persistence - in-memory only
    """
    
    snapshot_id: str
    generated_at: str  # ISO-8601 UTC
    report: Dict[str, Any]
    
    def __post_init__(self):
        """Validate snapshot after creation."""
        if not self.snapshot_id:
            raise FabricSnapshotError("snapshot_id is required")
        if not self.generated_at:
            raise FabricSnapshotError("generated_at is required")
        if self.report is None:
            raise FabricSnapshotError("report is required")


def _compute_snapshot_id(report: Dict[str, Any]) -> str:
    """
    Compute deterministic snapshot ID from report content.
    
    Uses SHA256 of JSON-serialized report with deterministic key ordering.
    Excludes 'generated_at' from hash to ensure same data → same ID.
    
    Args:
        report: Report dictionary from FabricReportExporter.export_json()
    
    Returns:
        SHA256 hex digest of content
    """
    # Create a copy without generated_at for hashing
    # This ensures same data produces same snapshot_id regardless of when captured
    hashable_content = {
        k: v for k, v in report.items() if k != "generated_at"
    }
    
    # Serialize with deterministic ordering
    canonical_json = json.dumps(
        hashable_content,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    )
    
    # Compute SHA256
    return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()


def create_snapshot(exporter: FabricReportExporter) -> FabricSnapshot:
    """
    Create a point-in-time snapshot of operator report output.
    
    Args:
        exporter: FabricReportExporter to capture from. Must not be None.
    
    Returns:
        Immutable FabricSnapshot with deterministic snapshot_id
    
    Raises:
        FabricSnapshotError: If exporter is None or export fails
    
    Rules:
    - snapshot_id is deterministic from content (same report → same id)
    - generated_at is informational only
    - Snapshot content is immutable
    - No persistence - in-memory only
    """
    if exporter is None:
        raise FabricSnapshotError(
            "FabricReportExporter is required - cannot create snapshot without exporter"
        )
    
    try:
        report = exporter.export_json()
    except FabricExportError as e:
        raise FabricSnapshotError(f"Failed to export report for snapshot: {e}") from e
    
    # Deep copy to ensure immutability
    report = copy.deepcopy(report)
    
    snapshot_id = _compute_snapshot_id(report)
    generated_at = datetime.now(timezone.utc).isoformat()
    
    return FabricSnapshot(
        snapshot_id=snapshot_id,
        generated_at=generated_at,
        report=report,
    )


def create_snapshot_from_report(report: Dict[str, Any]) -> FabricSnapshot:
    """
    Create a snapshot directly from a report dictionary.
    
    Useful for testing and for creating snapshots from previously captured data.
    
    Args:
        report: Report dictionary matching FabricReportExporter.export_json() format
    
    Returns:
        Immutable FabricSnapshot with deterministic snapshot_id
    
    Raises:
        FabricSnapshotError: If report is None
    """
    if report is None:
        raise FabricSnapshotError("report is required - cannot create snapshot without report")
    
    # Deep copy to ensure immutability
    report = copy.deepcopy(report)
    
    snapshot_id = _compute_snapshot_id(report)
    generated_at = datetime.now(timezone.utc).isoformat()
    
    return FabricSnapshot(
        snapshot_id=snapshot_id,
        generated_at=generated_at,
        report=report,
    )


# =============================================================================
# FORBIDDEN
# =============================================================================
# DO NOT ADD:
# - save_snapshot() -> path
# - load_snapshot(path) -> FabricSnapshot
# - persist_snapshot()
# - compare_snapshots() (use diff.py)
# - get_snapshot_history()
# - auto_snapshot_on_change()
# - snapshot_diff() (use diff.py)
# - trend_from_snapshots()
# - aggregate_snapshots()
