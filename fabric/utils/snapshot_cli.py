"""
Fabric Snapshot CLI Utilities - Read-only snapshot and diff operations.

PHASE-2: SNAPSHOT & DIFF OPERATOR UTILITY (READ-ONLY)

This module provides pure utility functions for creating and diffing snapshots.
These are building blocks for CLI tools and other operator utilities.

ABSOLUTE CONSTRAINTS:
---------------------
❌ NO filesystem writes
❌ NO persistence
❌ NO argparse side effects at import time
❌ NO execution logic
❌ NO background processes
❌ NO UI logic
❌ NO heuristics
❌ NO interpretation
✅ READ-ONLY utility functions only
✅ Deterministic outputs
✅ In-memory only
✅ Strict Phase-2 contract adherence

DESIGN PHILOSOPHY:
------------------
Pure functions that wrap Fabric Phase-2 APIs.
No operational semantics.
No defaults or assumptions.
Observational only.
"""

import json
from typing import Any, Dict

from fabric.diff import diff_snapshots
from fabric.export import FabricReportExporter
from fabric.intelligence import FabricIntelligence
from fabric.reports import create_reports
from fabric.snapshot import create_snapshot_from_report


class SnapshotCLIError(Exception):
    """Raised when snapshot CLI operations fail."""
    pass


def create_snapshot_json(intelligence: FabricIntelligence) -> Dict[str, Any]:
    """
    Create a JSON snapshot from current Fabric intelligence state.
    
    This is a pure read-only operation that captures the current state
    of Fabric reports as a JSON-serializable dictionary.
    
    Args:
        intelligence: FabricIntelligence instance to capture from
    
    Returns:
        Dictionary containing:
        {
            "snapshot_id": "content-based hash",
            "generated_at": "ISO-8601 UTC timestamp",
            "report": { ... full report structure ... }
        }
    
    Raises:
        SnapshotCLIError: If intelligence is None or snapshot creation fails
    
    Guarantees:
    - Deterministic snapshot_id from report content
    - No filesystem writes
    - No side effects
    - Same input → same snapshot_id
    """
    if intelligence is None:
        raise SnapshotCLIError("FabricIntelligence is required")
    
    try:
        # Create reports from intelligence
        reports = create_reports(intelligence)
        
        # Create exporter from reports
        exporter = FabricReportExporter(reports)
        
        # Export report as JSON
        report = exporter.export_json()
        
        # Create snapshot from report
        snapshot = create_snapshot_from_report(report)
        
        # Return snapshot as dictionary
        return {
            "snapshot_id": snapshot.snapshot_id,
            "generated_at": snapshot.generated_at,
            "report": snapshot.report,
        }
    except Exception as e:
        raise SnapshotCLIError(f"Failed to create snapshot: {e}") from e


def diff_snapshot_json(a: Dict[str, Any], b: Dict[str, Any]) -> Dict[str, Any]:
    """
    Compute diff between two snapshot JSON dictionaries.
    
    This is a pure read-only operation that compares two snapshots
    and returns the differences as a JSON-serializable dictionary.
    
    Args:
        a: First snapshot dictionary (from)
        b: Second snapshot dictionary (to)
    
    Returns:
        Dictionary containing:
        {
            "from_snapshot": "snapshot_id of a",
            "to_snapshot": "snapshot_id of b",
            "changes": { ... detailed changes ... }
        }
    
    Raises:
        SnapshotCLIError: If snapshots are invalid or diff computation fails
    
    Guarantees:
    - Deterministic diff output
    - No filesystem writes
    - No side effects
    - No mutation of inputs
    - Same inputs → same output
    """
    if a is None:
        raise SnapshotCLIError("First snapshot (a) is required")
    if b is None:
        raise SnapshotCLIError("Second snapshot (b) is required")
    
    # Validate snapshot structure
    for name, snapshot in [("a", a), ("b", b)]:
        if not isinstance(snapshot, dict):
            raise SnapshotCLIError(f"Snapshot {name} must be a dictionary")
        if "snapshot_id" not in snapshot:
            raise SnapshotCLIError(f"Snapshot {name} missing 'snapshot_id'")
        if "report" not in snapshot:
            raise SnapshotCLIError(f"Snapshot {name} missing 'report'")
    
    try:
        # Create snapshot objects from JSON
        snapshot_a = create_snapshot_from_report(a["report"])
        snapshot_b = create_snapshot_from_report(b["report"])
        
        # Compute diff
        diff = diff_snapshots(snapshot_a, snapshot_b)
        
        # Return diff as dictionary
        return {
            "from_snapshot": diff.from_snapshot,
            "to_snapshot": diff.to_snapshot,
            "changes": diff.changes,
        }
    except Exception as e:
        raise SnapshotCLIError(f"Failed to compute diff: {e}") from e
