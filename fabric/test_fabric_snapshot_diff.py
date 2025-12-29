"""
Fabric Snapshot & Diff Tests - Phase-2 Snapshot & Diff

THESE TESTS ENFORCE PHASE-2 SNAPSHOT & DIFF LAYER CONSTRAINTS.

Test Coverage:
--------------
1. Snapshot determinism (same report → same snapshot_id)
2. Diff determinism
3. Empty → populated snapshot
4. Profile added / removed cases
5. Engine metric changes
6. Determinism job appearance and resolution
7. No mutation of snapshots or reports
8. Stable ordering and types
9. Error handling
10. Edge cases

Minimum 30 tests required.

Invariants Tested:
------------------
- Same report produces same snapshot_id
- Snapshots are immutable
- Diffs are deterministic
- No mutation of underlying data
- All fields present with correct types
- Missing data handled explicitly
"""

import copy
import json
import pytest
from datetime import datetime, timezone
from unittest.mock import MagicMock

from fabric.snapshot import (
    FabricSnapshot,
    FabricSnapshotError,
    create_snapshot,
    create_snapshot_from_report,
    _compute_snapshot_id,
)
from fabric.diff import (
    FabricDiff,
    FabricDiffError,
    diff_snapshots,
    FLOAT_PRECISION,
)


# =============================================================================
# Test Fixtures
# =============================================================================

@pytest.fixture
def empty_report():
    """Create an empty report structure."""
    return {
        "generated_at": "2024-01-01T00:00:00+00:00",
        "execution_summary": {
            "total_jobs": 0,
            "completed": 0,
            "failed": 0,
            "validation_failed": 0,
        },
        "failure_summary": {
            "by_engine": {"ffmpeg": {}, "resolve": {}},
            "top_failure_reasons": [],
        },
        "engine_health": {
            "ffmpeg": {"jobs": 0, "failures": 0, "failure_rate": 0.0},
            "resolve": {"jobs": 0, "failures": 0, "failure_rate": 0.0},
        },
        "proxy_profile_stability": {},
        "determinism": {
            "non_deterministic_jobs": [],
            "count": 0,
        },
    }


@pytest.fixture
def populated_report():
    """Create a populated report structure."""
    return {
        "generated_at": "2024-01-01T12:00:00+00:00",
        "execution_summary": {
            "total_jobs": 10,
            "completed": 7,
            "failed": 2,
            "validation_failed": 1,
        },
        "failure_summary": {
            "by_engine": {
                "ffmpeg": {"decode error": 1, "timeout": 1},
                "resolve": {},
            },
            "top_failure_reasons": ["decode error", "timeout"],
        },
        "engine_health": {
            "ffmpeg": {"jobs": 6, "failures": 2, "failure_rate": 0.333},
            "resolve": {"jobs": 4, "failures": 0, "failure_rate": 0.0},
        },
        "proxy_profile_stability": {
            "proxy_prores_proxy": {"jobs": 5, "failure_rate": 0.2},
            "resolve_prores": {"jobs": 5, "failure_rate": 0.2},
        },
        "determinism": {
            "non_deterministic_jobs": ["job-003"],
            "count": 1,
        },
    }


@pytest.fixture
def mock_exporter(populated_report):
    """Create a mock exporter."""
    exporter = MagicMock()
    exporter.export_json.return_value = copy.deepcopy(populated_report)
    return exporter


@pytest.fixture
def empty_snapshot(empty_report):
    """Create a snapshot from empty report."""
    return create_snapshot_from_report(empty_report)


@pytest.fixture
def populated_snapshot(populated_report):
    """Create a snapshot from populated report."""
    return create_snapshot_from_report(populated_report)


# =============================================================================
# Snapshot Creation Tests
# =============================================================================

class TestSnapshotCreation:
    """Tests for snapshot creation."""
    
    def test_create_snapshot_from_exporter(self, mock_exporter):
        """Snapshot can be created from exporter."""
        snapshot = create_snapshot(mock_exporter)
        
        assert snapshot is not None
        assert snapshot.snapshot_id
        assert snapshot.generated_at
        assert snapshot.report is not None
    
    def test_create_snapshot_from_report(self, populated_report):
        """Snapshot can be created directly from report dict."""
        snapshot = create_snapshot_from_report(populated_report)
        
        assert snapshot is not None
        assert snapshot.snapshot_id
        assert snapshot.generated_at
        assert snapshot.report == populated_report
    
    def test_create_snapshot_none_exporter_raises(self):
        """Creating snapshot with None exporter raises error."""
        with pytest.raises(FabricSnapshotError) as exc:
            create_snapshot(None)
        
        assert "FabricReportExporter is required" in str(exc.value)
    
    def test_create_snapshot_none_report_raises(self):
        """Creating snapshot with None report raises error."""
        with pytest.raises(FabricSnapshotError) as exc:
            create_snapshot_from_report(None)
        
        assert "report is required" in str(exc.value)
    
    def test_snapshot_is_frozen(self, populated_snapshot):
        """Snapshot dataclass is frozen (immutable)."""
        with pytest.raises(Exception):  # FrozenInstanceError
            populated_snapshot.snapshot_id = "new-id"


# =============================================================================
# Snapshot Determinism Tests
# =============================================================================

class TestSnapshotDeterminism:
    """Tests for snapshot determinism."""
    
    def test_same_report_same_snapshot_id(self, populated_report):
        """Same report produces same snapshot_id."""
        snapshot1 = create_snapshot_from_report(copy.deepcopy(populated_report))
        snapshot2 = create_snapshot_from_report(copy.deepcopy(populated_report))
        
        assert snapshot1.snapshot_id == snapshot2.snapshot_id
    
    def test_different_generated_at_same_snapshot_id(self, populated_report):
        """Different generated_at does not affect snapshot_id."""
        report1 = copy.deepcopy(populated_report)
        report1["generated_at"] = "2024-01-01T00:00:00+00:00"
        
        report2 = copy.deepcopy(populated_report)
        report2["generated_at"] = "2024-12-31T23:59:59+00:00"
        
        snapshot1 = create_snapshot_from_report(report1)
        snapshot2 = create_snapshot_from_report(report2)
        
        assert snapshot1.snapshot_id == snapshot2.snapshot_id
    
    def test_different_data_different_snapshot_id(self, populated_report):
        """Different report data produces different snapshot_id."""
        report1 = copy.deepcopy(populated_report)
        report2 = copy.deepcopy(populated_report)
        report2["execution_summary"]["completed"] = 100
        
        snapshot1 = create_snapshot_from_report(report1)
        snapshot2 = create_snapshot_from_report(report2)
        
        assert snapshot1.snapshot_id != snapshot2.snapshot_id
    
    def test_snapshot_id_is_sha256(self, populated_report):
        """Snapshot ID is a valid SHA256 hex digest."""
        snapshot = create_snapshot_from_report(populated_report)
        
        # SHA256 produces 64 hex characters
        assert len(snapshot.snapshot_id) == 64
        assert all(c in '0123456789abcdef' for c in snapshot.snapshot_id)
    
    def test_compute_snapshot_id_excludes_generated_at(self):
        """_compute_snapshot_id excludes generated_at from hash."""
        report = {"generated_at": "2024-01-01", "data": "test"}
        
        id1 = _compute_snapshot_id(report)
        report["generated_at"] = "2025-12-31"
        id2 = _compute_snapshot_id(report)
        
        assert id1 == id2
    
    def test_compute_snapshot_id_deterministic_ordering(self):
        """_compute_snapshot_id produces same result regardless of key order."""
        report1 = {"a": 1, "b": 2, "c": 3}
        report2 = {"c": 3, "a": 1, "b": 2}
        
        assert _compute_snapshot_id(report1) == _compute_snapshot_id(report2)


# =============================================================================
# Snapshot Immutability Tests
# =============================================================================

class TestSnapshotImmutability:
    """Tests for snapshot immutability."""
    
    def test_snapshot_report_not_mutated_by_source(self, populated_report):
        """Mutating source report does not affect snapshot."""
        original_completed = populated_report["execution_summary"]["completed"]
        snapshot = create_snapshot_from_report(populated_report)
        
        # Mutate source
        populated_report["execution_summary"]["completed"] = 999
        
        # Snapshot should retain original value
        assert snapshot.report["execution_summary"]["completed"] == original_completed
    
    def test_snapshot_dataclass_frozen(self, populated_snapshot):
        """Snapshot attributes cannot be reassigned."""
        with pytest.raises(Exception):
            populated_snapshot.report = {}


# =============================================================================
# Diff Creation Tests
# =============================================================================

class TestDiffCreation:
    """Tests for diff creation."""
    
    def test_diff_snapshots_basic(self, empty_snapshot, populated_snapshot):
        """Basic diff creation works."""
        diff = diff_snapshots(empty_snapshot, populated_snapshot)
        
        assert diff is not None
        assert diff.from_snapshot == empty_snapshot.snapshot_id
        assert diff.to_snapshot == populated_snapshot.snapshot_id
        assert diff.changes is not None
    
    def test_diff_none_first_snapshot_raises(self, populated_snapshot):
        """Diff with None first snapshot raises error."""
        with pytest.raises(FabricDiffError) as exc:
            diff_snapshots(None, populated_snapshot)
        
        assert "First snapshot (a) is required" in str(exc.value)
    
    def test_diff_none_second_snapshot_raises(self, populated_snapshot):
        """Diff with None second snapshot raises error."""
        with pytest.raises(FabricDiffError) as exc:
            diff_snapshots(populated_snapshot, None)
        
        assert "Second snapshot (b) is required" in str(exc.value)
    
    def test_diff_is_frozen(self, empty_snapshot, populated_snapshot):
        """Diff dataclass is frozen (immutable)."""
        diff = diff_snapshots(empty_snapshot, populated_snapshot)
        
        with pytest.raises(Exception):
            diff.from_snapshot = "new-id"


# =============================================================================
# Diff Determinism Tests
# =============================================================================

class TestDiffDeterminism:
    """Tests for diff determinism."""
    
    def test_same_snapshots_same_diff(self, empty_snapshot, populated_snapshot):
        """Same snapshot pair produces identical diff."""
        diff1 = diff_snapshots(empty_snapshot, populated_snapshot)
        diff2 = diff_snapshots(empty_snapshot, populated_snapshot)
        
        assert diff1.from_snapshot == diff2.from_snapshot
        assert diff1.to_snapshot == diff2.to_snapshot
        assert diff1.changes == diff2.changes
    
    def test_diff_ordering_deterministic(self, populated_report):
        """Diff sections have deterministic ordering."""
        report1 = copy.deepcopy(populated_report)
        report2 = copy.deepcopy(populated_report)
        report2["execution_summary"]["completed"] = 10
        
        snapshot1 = create_snapshot_from_report(report1)
        snapshot2 = create_snapshot_from_report(report2)
        
        diff = diff_snapshots(snapshot1, snapshot2)
        
        # Verify all required sections exist
        assert "execution_summary" in diff.changes
        assert "engine_health" in diff.changes
        assert "proxy_profile_stability" in diff.changes
        assert "determinism" in diff.changes


# =============================================================================
# Execution Summary Diff Tests
# =============================================================================

class TestExecutionSummaryDiff:
    """Tests for execution summary diff."""
    
    def test_empty_to_populated_diff(self, empty_snapshot, populated_snapshot):
        """Diff from empty to populated shows increases."""
        diff = diff_snapshots(empty_snapshot, populated_snapshot)
        summary = diff.changes["execution_summary"]
        
        assert summary["total_jobs_delta"] == 10
        assert summary["completed_delta"] == 7
        assert summary["failed_delta"] == 2
        assert summary["validation_failed_delta"] == 1
    
    def test_populated_to_empty_diff(self, empty_snapshot, populated_snapshot):
        """Diff from populated to empty shows decreases."""
        diff = diff_snapshots(populated_snapshot, empty_snapshot)
        summary = diff.changes["execution_summary"]
        
        assert summary["total_jobs_delta"] == -10
        assert summary["completed_delta"] == -7
        assert summary["failed_delta"] == -2
        assert summary["validation_failed_delta"] == -1
    
    def test_no_change_diff(self, populated_snapshot):
        """Diff of same snapshot shows zero deltas."""
        diff = diff_snapshots(populated_snapshot, populated_snapshot)
        summary = diff.changes["execution_summary"]
        
        assert summary["total_jobs_delta"] == 0
        assert summary["completed_delta"] == 0
        assert summary["failed_delta"] == 0
        assert summary["validation_failed_delta"] == 0


# =============================================================================
# Engine Health Diff Tests
# =============================================================================

class TestEngineHealthDiff:
    """Tests for engine health diff."""
    
    def test_engine_health_diff_structure(self, empty_snapshot, populated_snapshot):
        """Engine health diff has correct structure."""
        diff = diff_snapshots(empty_snapshot, populated_snapshot)
        health = diff.changes["engine_health"]
        
        assert "ffmpeg" in health
        assert "resolve" in health
        
        for engine in ["ffmpeg", "resolve"]:
            assert "jobs_delta" in health[engine]
            assert "failures_delta" in health[engine]
            assert "failure_rate_delta" in health[engine]
    
    def test_engine_health_values(self, empty_snapshot, populated_snapshot):
        """Engine health diff shows correct deltas."""
        diff = diff_snapshots(empty_snapshot, populated_snapshot)
        health = diff.changes["engine_health"]
        
        assert health["ffmpeg"]["jobs_delta"] == 6
        assert health["ffmpeg"]["failures_delta"] == 2
        assert health["ffmpeg"]["failure_rate_delta"] == 0.333
        
        assert health["resolve"]["jobs_delta"] == 4
        assert health["resolve"]["failures_delta"] == 0
        assert health["resolve"]["failure_rate_delta"] == 0.0
    
    def test_engine_health_float_precision(self, populated_report):
        """Float deltas are rounded to FLOAT_PRECISION."""
        report1 = copy.deepcopy(populated_report)
        report1["engine_health"]["ffmpeg"]["failure_rate"] = 0.33333333
        
        report2 = copy.deepcopy(populated_report)
        report2["engine_health"]["ffmpeg"]["failure_rate"] = 0.66666666
        
        snapshot1 = create_snapshot_from_report(report1)
        snapshot2 = create_snapshot_from_report(report2)
        
        diff = diff_snapshots(snapshot1, snapshot2)
        rate_delta = diff.changes["engine_health"]["ffmpeg"]["failure_rate_delta"]
        
        # Should be rounded to FLOAT_PRECISION decimal places
        assert rate_delta == round(0.66666666 - 0.33333333, FLOAT_PRECISION)


# =============================================================================
# Proxy Profile Stability Diff Tests
# =============================================================================

class TestProxyProfileStabilityDiff:
    """Tests for proxy profile stability diff."""
    
    def test_profile_added(self, empty_snapshot, populated_snapshot):
        """New profile in to_snapshot shows positive delta."""
        diff = diff_snapshots(empty_snapshot, populated_snapshot)
        stability = diff.changes["proxy_profile_stability"]
        
        assert "proxy_prores_proxy" in stability
        assert stability["proxy_prores_proxy"]["jobs_delta"] == 5
        assert stability["proxy_prores_proxy"]["failure_rate_delta"] == 0.2
    
    def test_profile_removed(self, empty_snapshot, populated_snapshot):
        """Profile in from_snapshot but not to_snapshot shows negative delta."""
        diff = diff_snapshots(populated_snapshot, empty_snapshot)
        stability = diff.changes["proxy_profile_stability"]
        
        assert "proxy_prores_proxy" in stability
        assert stability["proxy_prores_proxy"]["jobs_delta"] == -5
        assert stability["proxy_prores_proxy"]["failure_rate_delta"] == -0.2
    
    def test_profile_changed(self, populated_report):
        """Profile with changed values shows correct deltas."""
        report1 = copy.deepcopy(populated_report)
        report1["proxy_profile_stability"]["proxy_prores_proxy"]["jobs"] = 5
        report1["proxy_profile_stability"]["proxy_prores_proxy"]["failure_rate"] = 0.2
        
        report2 = copy.deepcopy(populated_report)
        report2["proxy_profile_stability"]["proxy_prores_proxy"]["jobs"] = 10
        report2["proxy_profile_stability"]["proxy_prores_proxy"]["failure_rate"] = 0.1
        
        snapshot1 = create_snapshot_from_report(report1)
        snapshot2 = create_snapshot_from_report(report2)
        
        diff = diff_snapshots(snapshot1, snapshot2)
        profile = diff.changes["proxy_profile_stability"]["proxy_prores_proxy"]
        
        assert profile["jobs_delta"] == 5
        assert profile["failure_rate_delta"] == -0.1
    
    def test_multiple_profiles_diff(self, populated_report):
        """Multiple profiles are all included in diff."""
        report1 = copy.deepcopy(populated_report)
        report1["proxy_profile_stability"] = {
            "profile_a": {"jobs": 10, "failure_rate": 0.1},
            "profile_b": {"jobs": 5, "failure_rate": 0.0},
        }
        
        report2 = copy.deepcopy(populated_report)
        report2["proxy_profile_stability"] = {
            "profile_b": {"jobs": 10, "failure_rate": 0.1},
            "profile_c": {"jobs": 3, "failure_rate": 0.33},
        }
        
        snapshot1 = create_snapshot_from_report(report1)
        snapshot2 = create_snapshot_from_report(report2)
        
        diff = diff_snapshots(snapshot1, snapshot2)
        stability = diff.changes["proxy_profile_stability"]
        
        # All profiles from both snapshots should be present
        assert "profile_a" in stability  # Removed
        assert "profile_b" in stability  # Changed
        assert "profile_c" in stability  # Added
        
        assert stability["profile_a"]["jobs_delta"] == -10  # Removed
        assert stability["profile_b"]["jobs_delta"] == 5    # Changed
        assert stability["profile_c"]["jobs_delta"] == 3    # Added


# =============================================================================
# Determinism Diff Tests
# =============================================================================

class TestDeterminismDiff:
    """Tests for determinism diff."""
    
    def test_new_non_deterministic_jobs(self, empty_snapshot, populated_snapshot):
        """New non-deterministic jobs are identified."""
        diff = diff_snapshots(empty_snapshot, populated_snapshot)
        determinism = diff.changes["determinism"]
        
        assert "job-003" in determinism["new_non_deterministic_jobs"]
        assert determinism["resolved_non_deterministic_jobs"] == []
    
    def test_resolved_non_deterministic_jobs(self, empty_snapshot, populated_snapshot):
        """Resolved non-deterministic jobs are identified."""
        diff = diff_snapshots(populated_snapshot, empty_snapshot)
        determinism = diff.changes["determinism"]
        
        assert determinism["new_non_deterministic_jobs"] == []
        assert "job-003" in determinism["resolved_non_deterministic_jobs"]
    
    def test_no_determinism_changes(self, populated_snapshot):
        """Same snapshot shows no determinism changes."""
        diff = diff_snapshots(populated_snapshot, populated_snapshot)
        determinism = diff.changes["determinism"]
        
        assert determinism["new_non_deterministic_jobs"] == []
        assert determinism["resolved_non_deterministic_jobs"] == []
    
    def test_determinism_jobs_sorted(self, populated_report):
        """Determinism job lists are sorted."""
        report1 = copy.deepcopy(populated_report)
        report1["determinism"]["non_deterministic_jobs"] = ["job-z", "job-a"]
        
        report2 = copy.deepcopy(populated_report)
        report2["determinism"]["non_deterministic_jobs"] = ["job-m", "job-b"]
        
        snapshot1 = create_snapshot_from_report(report1)
        snapshot2 = create_snapshot_from_report(report2)
        
        diff = diff_snapshots(snapshot1, snapshot2)
        determinism = diff.changes["determinism"]
        
        # New jobs: in report2 but not report1
        assert determinism["new_non_deterministic_jobs"] == ["job-b", "job-m"]
        # Resolved jobs: in report1 but not report2
        assert determinism["resolved_non_deterministic_jobs"] == ["job-a", "job-z"]


# =============================================================================
# No Mutation Tests
# =============================================================================

class TestNoMutation:
    """Tests ensuring no mutation of underlying data."""
    
    def test_snapshot_does_not_mutate_report(self, populated_report):
        """Creating snapshot does not mutate source report."""
        original = json.dumps(populated_report, sort_keys=True)
        create_snapshot_from_report(populated_report)
        after = json.dumps(populated_report, sort_keys=True)
        
        assert original == after
    
    def test_diff_does_not_mutate_snapshots(self, empty_snapshot, populated_snapshot):
        """Computing diff does not mutate snapshots."""
        original_from = empty_snapshot.snapshot_id
        original_to = populated_snapshot.snapshot_id
        original_from_report = json.dumps(empty_snapshot.report, sort_keys=True)
        original_to_report = json.dumps(populated_snapshot.report, sort_keys=True)
        
        diff_snapshots(empty_snapshot, populated_snapshot)
        
        assert empty_snapshot.snapshot_id == original_from
        assert populated_snapshot.snapshot_id == original_to
        assert json.dumps(empty_snapshot.report, sort_keys=True) == original_from_report
        assert json.dumps(populated_snapshot.report, sort_keys=True) == original_to_report


# =============================================================================
# Type Safety Tests
# =============================================================================

class TestTypeSafety:
    """Tests for type safety of outputs."""
    
    def test_execution_summary_types(self, empty_snapshot, populated_snapshot):
        """Execution summary deltas are integers."""
        diff = diff_snapshots(empty_snapshot, populated_snapshot)
        summary = diff.changes["execution_summary"]
        
        assert isinstance(summary["total_jobs_delta"], int)
        assert isinstance(summary["completed_delta"], int)
        assert isinstance(summary["failed_delta"], int)
        assert isinstance(summary["validation_failed_delta"], int)
    
    def test_engine_health_types(self, empty_snapshot, populated_snapshot):
        """Engine health deltas have correct types."""
        diff = diff_snapshots(empty_snapshot, populated_snapshot)
        health = diff.changes["engine_health"]
        
        for engine in health:
            assert isinstance(health[engine]["jobs_delta"], int)
            assert isinstance(health[engine]["failures_delta"], int)
            assert isinstance(health[engine]["failure_rate_delta"], float)
    
    def test_proxy_profile_types(self, empty_snapshot, populated_snapshot):
        """Proxy profile deltas have correct types."""
        diff = diff_snapshots(empty_snapshot, populated_snapshot)
        stability = diff.changes["proxy_profile_stability"]
        
        for profile in stability:
            assert isinstance(stability[profile]["jobs_delta"], int)
            assert isinstance(stability[profile]["failure_rate_delta"], float)
    
    def test_determinism_types(self, empty_snapshot, populated_snapshot):
        """Determinism changes are lists of strings."""
        diff = diff_snapshots(empty_snapshot, populated_snapshot)
        determinism = diff.changes["determinism"]
        
        assert isinstance(determinism["new_non_deterministic_jobs"], list)
        assert isinstance(determinism["resolved_non_deterministic_jobs"], list)
        
        for job_id in determinism["new_non_deterministic_jobs"]:
            assert isinstance(job_id, str)
        for job_id in determinism["resolved_non_deterministic_jobs"]:
            assert isinstance(job_id, str)


# =============================================================================
# Edge Case Tests
# =============================================================================

class TestEdgeCases:
    """Tests for edge cases."""
    
    def test_missing_execution_summary(self):
        """Handle report with missing execution_summary."""
        report1 = {"generated_at": "2024-01-01"}
        report2 = {"generated_at": "2024-01-01", "execution_summary": {"completed": 5, "failed": 0, "validation_failed": 0, "total_jobs": 5}}
        
        snapshot1 = create_snapshot_from_report(report1)
        snapshot2 = create_snapshot_from_report(report2)
        
        diff = diff_snapshots(snapshot1, snapshot2)
        summary = diff.changes["execution_summary"]
        
        assert summary["completed_delta"] == 5
        assert summary["total_jobs_delta"] == 5
    
    def test_missing_engine_health(self):
        """Handle report with missing engine_health."""
        report1 = {"generated_at": "2024-01-01"}
        report2 = {"generated_at": "2024-01-01", "engine_health": {"ffmpeg": {"jobs": 10, "failures": 1, "failure_rate": 0.1}}}
        
        snapshot1 = create_snapshot_from_report(report1)
        snapshot2 = create_snapshot_from_report(report2)
        
        diff = diff_snapshots(snapshot1, snapshot2)
        health = diff.changes["engine_health"]
        
        assert health["ffmpeg"]["jobs_delta"] == 10
    
    def test_missing_determinism(self):
        """Handle report with missing determinism."""
        report1 = {"generated_at": "2024-01-01"}
        report2 = {"generated_at": "2024-01-01", "determinism": {"non_deterministic_jobs": ["job-1"], "count": 1}}
        
        snapshot1 = create_snapshot_from_report(report1)
        snapshot2 = create_snapshot_from_report(report2)
        
        diff = diff_snapshots(snapshot1, snapshot2)
        determinism = diff.changes["determinism"]
        
        assert determinism["new_non_deterministic_jobs"] == ["job-1"]
    
    def test_empty_proxy_profiles_both_sides(self):
        """Handle empty proxy profiles in both snapshots."""
        report1 = {"generated_at": "2024-01-01", "proxy_profile_stability": {}}
        report2 = {"generated_at": "2024-01-01", "proxy_profile_stability": {}}
        
        snapshot1 = create_snapshot_from_report(report1)
        snapshot2 = create_snapshot_from_report(report2)
        
        diff = diff_snapshots(snapshot1, snapshot2)
        stability = diff.changes["proxy_profile_stability"]
        
        assert stability == {}
    
    def test_snapshot_validation_empty_id(self):
        """FabricSnapshot validates empty snapshot_id."""
        with pytest.raises(FabricSnapshotError) as exc:
            FabricSnapshot(snapshot_id="", generated_at="2024-01-01", report={})
        
        assert "snapshot_id is required" in str(exc.value)
    
    def test_snapshot_validation_empty_generated_at(self):
        """FabricSnapshot validates empty generated_at."""
        with pytest.raises(FabricSnapshotError) as exc:
            FabricSnapshot(snapshot_id="abc", generated_at="", report={})
        
        assert "generated_at is required" in str(exc.value)
    
    def test_snapshot_validation_none_report(self):
        """FabricSnapshot validates None report."""
        with pytest.raises(FabricSnapshotError) as exc:
            FabricSnapshot(snapshot_id="abc", generated_at="2024-01-01", report=None)
        
        assert "report is required" in str(exc.value)
    
    def test_diff_validation_empty_from_snapshot(self, populated_snapshot):
        """FabricDiff validates empty from_snapshot."""
        with pytest.raises(FabricDiffError) as exc:
            FabricDiff(from_snapshot="", to_snapshot="abc", changes={})
        
        assert "from_snapshot is required" in str(exc.value)
    
    def test_diff_validation_empty_to_snapshot(self):
        """FabricDiff validates empty to_snapshot."""
        with pytest.raises(FabricDiffError) as exc:
            FabricDiff(from_snapshot="abc", to_snapshot="", changes={})
        
        assert "to_snapshot is required" in str(exc.value)
    
    def test_diff_validation_none_changes(self):
        """FabricDiff validates None changes."""
        with pytest.raises(FabricDiffError) as exc:
            FabricDiff(from_snapshot="abc", to_snapshot="def", changes=None)
        
        assert "changes is required" in str(exc.value)


# =============================================================================
# Integration Tests
# =============================================================================

class TestIntegration:
    """Integration tests for snapshot and diff workflow."""
    
    def test_full_workflow(self, mock_exporter):
        """Full workflow: create snapshots, compute diff."""
        # Create first snapshot
        snapshot1 = create_snapshot(mock_exporter)
        
        # Modify exporter return
        modified_report = copy.deepcopy(mock_exporter.export_json())
        modified_report["execution_summary"]["completed"] = 20
        mock_exporter.export_json.return_value = modified_report
        
        # Create second snapshot
        snapshot2 = create_snapshot(mock_exporter)
        
        # Compute diff
        diff = diff_snapshots(snapshot1, snapshot2)
        
        assert diff.changes["execution_summary"]["completed_delta"] == 13  # 20 - 7
    
    def test_reversible_diff(self, empty_snapshot, populated_snapshot):
        """Diff A→B and B→A are opposites."""
        forward = diff_snapshots(empty_snapshot, populated_snapshot)
        backward = diff_snapshots(populated_snapshot, empty_snapshot)
        
        # Execution summary deltas should be negated
        assert forward.changes["execution_summary"]["completed_delta"] == -backward.changes["execution_summary"]["completed_delta"]
        assert forward.changes["execution_summary"]["failed_delta"] == -backward.changes["execution_summary"]["failed_delta"]
        
        # Engine health deltas should be negated
        for engine in ["ffmpeg", "resolve"]:
            assert forward.changes["engine_health"][engine]["jobs_delta"] == -backward.changes["engine_health"][engine]["jobs_delta"]
        
        # Determinism new/resolved should swap
        assert forward.changes["determinism"]["new_non_deterministic_jobs"] == backward.changes["determinism"]["resolved_non_deterministic_jobs"]
        assert forward.changes["determinism"]["resolved_non_deterministic_jobs"] == backward.changes["determinism"]["new_non_deterministic_jobs"]
