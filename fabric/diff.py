"""
Fabric Diff - Read-only comparison between two snapshots.

PHASE-2: SNAPSHOT & DIFF (READ-ONLY)

This module computes diffs between two FabricSnapshots.
Diffs report WHAT changed, not why, not whether it's good.

ABSOLUTE CONSTRAINTS:
---------------------
❌ NO filesystem writes
❌ NO persistence
❌ NO retries
❌ NO heuristics
❌ NO interpretation language
❌ NO thresholds, labels, or commentary
❌ NO execution coupling
❌ NO UI hooks
❌ NO mutation of snapshots or reports
✅ READ-ONLY comparison only
✅ Deterministic diff output
✅ Explicit handling of missing data
✅ Stable ordering

DESIGN PHILOSOPHY:
------------------
Diffs show movement between two points in time.
They state facts about changes.
Humans decide what changes mean.
"""

from dataclasses import dataclass
from typing import Any, Dict, List, Set

from fabric.snapshot import FabricSnapshot, FabricSnapshotError


# Float precision for delta calculations (4 decimal places)
FLOAT_PRECISION = 4


class FabricDiffError(FabricSnapshotError):
    """Raised when diff computation fails."""
    pass


@dataclass(frozen=True)
class FabricDiff:
    """
    Immutable diff between two snapshots.
    
    Attributes:
        from_snapshot: snapshot_id of the earlier snapshot
        to_snapshot: snapshot_id of the later snapshot
        changes: Dictionary of all changes between snapshots
    
    The changes dictionary contains:
    - execution_summary: Deltas for job counts
    - engine_health: Per-engine deltas
    - proxy_profile_stability: Per-profile deltas
    - determinism: New and resolved non-deterministic jobs
    
    All deltas are computed as (to_value - from_value).
    Float deltas are rounded to FLOAT_PRECISION decimal places.
    """
    
    from_snapshot: str
    to_snapshot: str
    changes: Dict[str, Any]
    
    def __post_init__(self):
        """Validate diff after creation."""
        if not self.from_snapshot:
            raise FabricDiffError("from_snapshot is required")
        if not self.to_snapshot:
            raise FabricDiffError("to_snapshot is required")
        if self.changes is None:
            raise FabricDiffError("changes is required")


def _safe_get(d: Dict, *keys, default=0):
    """
    Safely traverse nested dictionary.
    
    Args:
        d: Dictionary to traverse
        *keys: Keys to follow
        default: Value to return if key not found
    
    Returns:
        Value at key path or default
    """
    current = d
    for key in keys:
        if not isinstance(current, dict):
            return default
        current = current.get(key, default)
        if current is None:
            return default
    return current


def _round_float(value: float) -> float:
    """Round float to standard precision."""
    return round(value, FLOAT_PRECISION)


def _compute_execution_summary_diff(
    from_report: Dict[str, Any],
    to_report: Dict[str, Any]
) -> Dict[str, int]:
    """
    Compute execution summary deltas.
    
    Returns:
        {
            "completed_delta": int,
            "failed_delta": int,
            "validation_failed_delta": int,
            "total_jobs_delta": int
        }
    """
    from_summary = _safe_get(from_report, "execution_summary") or {}
    to_summary = _safe_get(to_report, "execution_summary") or {}
    
    return {
        "completed_delta": _safe_get(to_summary, "completed") - _safe_get(from_summary, "completed"),
        "failed_delta": _safe_get(to_summary, "failed") - _safe_get(from_summary, "failed"),
        "validation_failed_delta": _safe_get(to_summary, "validation_failed") - _safe_get(from_summary, "validation_failed"),
        "total_jobs_delta": _safe_get(to_summary, "total_jobs") - _safe_get(from_summary, "total_jobs"),
    }


def _compute_engine_health_diff(
    from_report: Dict[str, Any],
    to_report: Dict[str, Any]
) -> Dict[str, Dict[str, Any]]:
    """
    Compute engine health deltas.
    
    Returns:
        {
            "ffmpeg": {
                "jobs_delta": int,
                "failures_delta": int,
                "failure_rate_delta": float
            },
            "resolve": {
                "jobs_delta": int,
                "failures_delta": int,
                "failure_rate_delta": float
            }
        }
    
    Missing engines in either snapshot are treated as having zero values.
    """
    from_health = _safe_get(from_report, "engine_health") or {}
    to_health = _safe_get(to_report, "engine_health") or {}
    
    # Get all engines from both snapshots
    all_engines: Set[str] = set(from_health.keys()) | set(to_health.keys())
    
    result: Dict[str, Dict[str, Any]] = {}
    
    for engine in sorted(all_engines):
        from_engine = from_health.get(engine, {})
        to_engine = to_health.get(engine, {})
        
        from_jobs = _safe_get(from_engine, "jobs")
        to_jobs = _safe_get(to_engine, "jobs")
        from_failures = _safe_get(from_engine, "failures")
        to_failures = _safe_get(to_engine, "failures")
        from_rate = _safe_get(from_engine, "failure_rate", default=0.0)
        to_rate = _safe_get(to_engine, "failure_rate", default=0.0)
        
        result[engine] = {
            "jobs_delta": to_jobs - from_jobs,
            "failures_delta": to_failures - from_failures,
            "failure_rate_delta": _round_float(to_rate - from_rate),
        }
    
    return result


def _compute_proxy_profile_stability_diff(
    from_report: Dict[str, Any],
    to_report: Dict[str, Any]
) -> Dict[str, Dict[str, Any]]:
    """
    Compute proxy profile stability deltas.
    
    Returns:
        {
            "profile_name": {
                "jobs_delta": int,
                "failure_rate_delta": float
            },
            ...
        }
    
    Missing profiles in either snapshot are handled explicitly:
    - Profile in to_report only: delta from zero
    - Profile in from_report only: delta to zero (negative values)
    """
    from_stability = _safe_get(from_report, "proxy_profile_stability") or {}
    to_stability = _safe_get(to_report, "proxy_profile_stability") or {}
    
    # Get all profiles from both snapshots
    all_profiles: Set[str] = set(from_stability.keys()) | set(to_stability.keys())
    
    result: Dict[str, Dict[str, Any]] = {}
    
    for profile in sorted(all_profiles):
        from_profile = from_stability.get(profile, {})
        to_profile = to_stability.get(profile, {})
        
        from_jobs = _safe_get(from_profile, "jobs")
        to_jobs = _safe_get(to_profile, "jobs")
        from_rate = _safe_get(from_profile, "failure_rate", default=0.0)
        to_rate = _safe_get(to_profile, "failure_rate", default=0.0)
        
        result[profile] = {
            "jobs_delta": to_jobs - from_jobs,
            "failure_rate_delta": _round_float(to_rate - from_rate),
        }
    
    return result


def _compute_determinism_diff(
    from_report: Dict[str, Any],
    to_report: Dict[str, Any]
) -> Dict[str, List[str]]:
    """
    Compute determinism changes.
    
    Returns:
        {
            "new_non_deterministic_jobs": [job_id, ...],
            "resolved_non_deterministic_jobs": [job_id, ...]
        }
    
    - new_non_deterministic_jobs: Jobs in to_report but not in from_report
    - resolved_non_deterministic_jobs: Jobs in from_report but not in to_report
    """
    from_determinism = _safe_get(from_report, "determinism") or {}
    to_determinism = _safe_get(to_report, "determinism") or {}
    
    from_jobs = set(_safe_get(from_determinism, "non_deterministic_jobs") or [])
    to_jobs = set(_safe_get(to_determinism, "non_deterministic_jobs") or [])
    
    new_jobs = sorted(to_jobs - from_jobs)
    resolved_jobs = sorted(from_jobs - to_jobs)
    
    return {
        "new_non_deterministic_jobs": new_jobs,
        "resolved_non_deterministic_jobs": resolved_jobs,
    }


def diff_snapshots(a: FabricSnapshot, b: FabricSnapshot) -> FabricDiff:
    """
    Compute read-only diff between two snapshots.
    
    Args:
        a: Earlier snapshot (from)
        b: Later snapshot (to)
    
    Returns:
        FabricDiff with all changes between a and b
    
    Raises:
        FabricDiffError: If either snapshot is None
    
    Rules:
    - Diff reports WHAT changed, not why
    - No thresholds, labels, or commentary
    - Missing data is handled explicitly
    - Ordering is deterministic
    - Float deltas are rounded to FLOAT_PRECISION decimal places
    """
    if a is None:
        raise FabricDiffError("First snapshot (a) is required")
    if b is None:
        raise FabricDiffError("Second snapshot (b) is required")
    
    from_report = a.report or {}
    to_report = b.report or {}
    
    changes = {
        "execution_summary": _compute_execution_summary_diff(from_report, to_report),
        "engine_health": _compute_engine_health_diff(from_report, to_report),
        "proxy_profile_stability": _compute_proxy_profile_stability_diff(from_report, to_report),
        "determinism": _compute_determinism_diff(from_report, to_report),
    }
    
    return FabricDiff(
        from_snapshot=a.snapshot_id,
        to_snapshot=b.snapshot_id,
        changes=changes,
    )


# =============================================================================
# FORBIDDEN
# =============================================================================
# DO NOT ADD:
# - interpret_diff() -> str
# - is_regression() -> bool
# - is_improvement() -> bool
# - severity_score() -> float
# - recommend_action() -> str
# - alert_on_change()
# - trend_analysis()
# - diff_summary() with judgement words
# - threshold-based filtering
# - "significant" change detection
