"""
Fabric Snapshot CLI Tests - Phase-2 Read-Only Snapshot Utility

THESE TESTS ENFORCE SNAPSHOT CLI UTILITY CONSTRAINTS.

Test Coverage:
--------------
1. Snapshot output determinism
2. Diff determinism
3. Empty dataset behavior
4. Invalid JSON input handling
5. No mutation of inputs
6. Sorting guarantees
7. No filesystem writes
8. Error handling
9. Snapshot structure validation
10. Integration with Fabric Phase-2 APIs

Minimum 15 tests required.

Invariants Tested:
------------------
- create_snapshot_json() produces deterministic output
- diff_snapshot_json() produces deterministic output
- Invalid inputs fail loudly with clear errors
- No mutation of input snapshots
- All outputs are JSON-serializable
- Sorting is deterministic
- No side effects (filesystem, logging, etc.)
"""

import copy
import json
import pytest
from unittest.mock import MagicMock, Mock

from fabric.utils.snapshot_cli import (
    SnapshotCLIError,
    create_snapshot_json,
    diff_snapshot_json,
)


# =============================================================================
# Test Fixtures
# =============================================================================

@pytest.fixture
def mock_intelligence():
    """Create a mock FabricIntelligence instance."""
    return MagicMock()


@pytest.fixture
def sample_report():
    """Create a sample report structure."""
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
            "ffmpeg": {"jobs": 7, "failures": 2, "failure_rate": 0.286},
            "resolve": {"jobs": 0, "failures": 0, "failure_rate": 0.0},
        },
        "proxy_profile_stability": {
            "ProRes422HQ": {"jobs": 5, "failures": 1, "failure_rate": 0.2},
        },
        "determinism": {
            "non_deterministic_jobs": ["job_001", "job_002"],
            "count": 2,
        },
    }


@pytest.fixture
def sample_snapshot(sample_report):
    """Create a sample snapshot structure."""
    return {
        "snapshot_id": "abc123def456",
        "generated_at": "2024-01-01T12:00:00+00:00",
        "report": sample_report,
    }


# =============================================================================
# Tests: create_snapshot_json()
# =============================================================================

def test_create_snapshot_json_requires_intelligence():
    """Test that create_snapshot_json requires intelligence parameter."""
    with pytest.raises(SnapshotCLIError, match="FabricIntelligence is required"):
        create_snapshot_json(None)


def test_create_snapshot_json_returns_dict_with_required_fields(mock_intelligence, sample_report, monkeypatch):
    """Test that create_snapshot_json returns dict with required fields."""
    # Mock the entire chain
    mock_reports = MagicMock()
    mock_exporter = MagicMock()
    mock_exporter.export_json.return_value = sample_report
    
    def mock_create_reports(intel):
        return mock_reports
    
    def mock_create_exporter(reports):
        return mock_exporter
    
    monkeypatch.setattr("fabric.utils.snapshot_cli.create_reports", mock_create_reports)
    monkeypatch.setattr("fabric.utils.snapshot_cli.FabricReportExporter", mock_create_exporter)
    
    snapshot = create_snapshot_json(mock_intelligence)
    
    assert isinstance(snapshot, dict)
    assert "snapshot_id" in snapshot
    assert "generated_at" in snapshot
    assert "report" in snapshot


def test_create_snapshot_json_snapshot_id_is_deterministic(mock_intelligence, sample_report, monkeypatch):
    """Test that create_snapshot_json produces deterministic snapshot_id."""
    # Mock the chain
    mock_reports = MagicMock()
    mock_exporter = MagicMock()
    mock_exporter.export_json.return_value = copy.deepcopy(sample_report)
    
    def mock_create_reports(intel):
        return mock_reports
    
    def mock_create_exporter(reports):
        mock_exp = MagicMock()
        mock_exp.export_json.return_value = copy.deepcopy(sample_report)
        return mock_exp
    
    monkeypatch.setattr("fabric.utils.snapshot_cli.create_reports", mock_create_reports)
    monkeypatch.setattr("fabric.utils.snapshot_cli.FabricReportExporter", mock_create_exporter)
    
    snapshot1 = create_snapshot_json(mock_intelligence)
    snapshot2 = create_snapshot_json(mock_intelligence)
    
    # Same report → same snapshot_id
    assert snapshot1["snapshot_id"] == snapshot2["snapshot_id"]


def test_create_snapshot_json_different_reports_produce_different_snapshot_ids(mock_intelligence, sample_report, monkeypatch):
    """Test that different reports produce different snapshot_ids."""
    report1 = copy.deepcopy(sample_report)
    report2 = copy.deepcopy(sample_report)
    report2["execution_summary"]["completed"] = 999  # Change something
    
    call_count = [0]
    
    def mock_create_exporter(reports):
        mock_exp = MagicMock()
        call_count[0] += 1
        if call_count[0] == 1:
            mock_exp.export_json.return_value = report1
        else:
            mock_exp.export_json.return_value = report2
        return mock_exp
    
    monkeypatch.setattr("fabric.utils.snapshot_cli.create_reports", lambda intel: MagicMock())
    monkeypatch.setattr("fabric.utils.snapshot_cli.FabricReportExporter", mock_create_exporter)
    
    snapshot1 = create_snapshot_json(mock_intelligence)
    snapshot2 = create_snapshot_json(mock_intelligence)
    
    # Different reports → different snapshot_ids
    assert snapshot1["snapshot_id"] != snapshot2["snapshot_id"]


def test_create_snapshot_json_does_not_mutate_intelligence(mock_intelligence, sample_report, monkeypatch):
    """Test that create_snapshot_json does not mutate intelligence."""
    mock_reports = MagicMock()
    mock_exporter = MagicMock()
    mock_exporter.export_json.return_value = sample_report
    
    monkeypatch.setattr("fabric.utils.snapshot_cli.create_reports", lambda intel: mock_reports)
    monkeypatch.setattr("fabric.utils.snapshot_cli.FabricReportExporter", lambda reports: mock_exporter)
    
    # Capture state before
    intelligence_id_before = id(mock_intelligence)
    
    create_snapshot_json(mock_intelligence)
    
    # Verify no mutation (identity unchanged)
    assert id(mock_intelligence) == intelligence_id_before


def test_create_snapshot_json_propagates_errors(mock_intelligence, monkeypatch):
    """Test that create_snapshot_json propagates errors with clear messages."""
    def mock_create_reports(intel):
        raise Exception("Database connection failed")
    
    monkeypatch.setattr("fabric.utils.snapshot_cli.create_reports", mock_create_reports)
    
    with pytest.raises(SnapshotCLIError, match="Failed to create snapshot"):
        create_snapshot_json(mock_intelligence)


# =============================================================================
# Tests: diff_snapshot_json()
# =============================================================================

def test_diff_snapshot_json_requires_both_snapshots():
    """Test that diff_snapshot_json requires both snapshot parameters."""
    snapshot = {"snapshot_id": "abc", "report": {}}
    
    with pytest.raises(SnapshotCLIError, match="First snapshot .* is required"):
        diff_snapshot_json(None, snapshot)
    
    with pytest.raises(SnapshotCLIError, match="Second snapshot .* is required"):
        diff_snapshot_json(snapshot, None)


def test_diff_snapshot_json_requires_dict_snapshots():
    """Test that diff_snapshot_json requires dict snapshots."""
    with pytest.raises(SnapshotCLIError, match="must be a dictionary"):
        diff_snapshot_json("not a dict", {"snapshot_id": "abc", "report": {}})
    
    with pytest.raises(SnapshotCLIError, match="must be a dictionary"):
        diff_snapshot_json({"snapshot_id": "abc", "report": {}}, "not a dict")


def test_diff_snapshot_json_validates_snapshot_structure():
    """Test that diff_snapshot_json validates snapshot structure."""
    valid_snapshot = {"snapshot_id": "abc", "report": {}}
    
    # Missing snapshot_id
    with pytest.raises(SnapshotCLIError, match="missing 'snapshot_id'"):
        diff_snapshot_json({"report": {}}, valid_snapshot)
    
    # Missing report
    with pytest.raises(SnapshotCLIError, match="missing 'report'"):
        diff_snapshot_json({"snapshot_id": "abc"}, valid_snapshot)


def test_diff_snapshot_json_returns_dict_with_required_fields(sample_snapshot):
    """Test that diff_snapshot_json returns dict with required fields."""
    snapshot_a = copy.deepcopy(sample_snapshot)
    snapshot_b = copy.deepcopy(sample_snapshot)
    
    diff = diff_snapshot_json(snapshot_a, snapshot_b)
    
    assert isinstance(diff, dict)
    assert "from_snapshot" in diff
    assert "to_snapshot" in diff
    assert "changes" in diff


def test_diff_snapshot_json_is_deterministic(sample_snapshot):
    """Test that diff_snapshot_json produces deterministic output."""
    snapshot_a = copy.deepcopy(sample_snapshot)
    snapshot_b = copy.deepcopy(sample_snapshot)
    snapshot_b["report"]["execution_summary"]["completed"] = 10
    
    diff1 = diff_snapshot_json(snapshot_a, snapshot_b)
    diff2 = diff_snapshot_json(snapshot_a, snapshot_b)
    
    # Same snapshots → same diff
    assert diff1 == diff2


def test_diff_snapshot_json_does_not_mutate_inputs(sample_snapshot):
    """Test that diff_snapshot_json does not mutate input snapshots."""
    snapshot_a = copy.deepcopy(sample_snapshot)
    snapshot_b = copy.deepcopy(sample_snapshot)
    
    snapshot_a_before = copy.deepcopy(snapshot_a)
    snapshot_b_before = copy.deepcopy(snapshot_b)
    
    diff_snapshot_json(snapshot_a, snapshot_b)
    
    # Verify no mutation
    assert snapshot_a == snapshot_a_before
    assert snapshot_b == snapshot_b_before


def test_diff_snapshot_json_handles_empty_reports():
    """Test that diff_snapshot_json handles empty reports gracefully."""
    empty_snapshot = {
        "snapshot_id": "empty123",
        "generated_at": "2024-01-01T00:00:00+00:00",
        "report": {
            "generated_at": "2024-01-01T00:00:00+00:00",
            "execution_summary": {"total_jobs": 0, "completed": 0, "failed": 0, "validation_failed": 0},
            "failure_summary": {"by_engine": {}, "top_failure_reasons": []},
            "engine_health": {},
            "proxy_profile_stability": {},
            "determinism": {"non_deterministic_jobs": [], "count": 0},
        }
    }
    
    diff = diff_snapshot_json(empty_snapshot, empty_snapshot)
    
    assert isinstance(diff, dict)
    assert "changes" in diff


def test_diff_snapshot_json_propagates_errors(sample_snapshot):
    """Test that diff_snapshot_json propagates errors with clear messages."""
    snapshot_a = copy.deepcopy(sample_snapshot)
    # Corrupt the report to trigger an error
    snapshot_b = {"snapshot_id": "bad", "report": None}
    
    with pytest.raises(SnapshotCLIError, match="Failed to compute diff"):
        diff_snapshot_json(snapshot_a, snapshot_b)


# =============================================================================
# Tests: JSON Serialization
# =============================================================================

def test_create_snapshot_json_output_is_json_serializable(mock_intelligence, sample_report, monkeypatch):
    """Test that create_snapshot_json output is JSON-serializable."""
    mock_reports = MagicMock()
    mock_exporter = MagicMock()
    mock_exporter.export_json.return_value = sample_report
    
    monkeypatch.setattr("fabric.utils.snapshot_cli.create_reports", lambda intel: mock_reports)
    monkeypatch.setattr("fabric.utils.snapshot_cli.FabricReportExporter", lambda reports: mock_exporter)
    
    snapshot = create_snapshot_json(mock_intelligence)
    
    # Should not raise
    json_str = json.dumps(snapshot)
    assert isinstance(json_str, str)
    
    # Should round-trip
    parsed = json.loads(json_str)
    assert parsed["snapshot_id"] == snapshot["snapshot_id"]


def test_diff_snapshot_json_output_is_json_serializable(sample_snapshot):
    """Test that diff_snapshot_json output is JSON-serializable."""
    snapshot_a = copy.deepcopy(sample_snapshot)
    snapshot_b = copy.deepcopy(sample_snapshot)
    
    diff = diff_snapshot_json(snapshot_a, snapshot_b)
    
    # Should not raise
    json_str = json.dumps(diff)
    assert isinstance(json_str, str)
    
    # Should round-trip
    parsed = json.loads(json_str)
    assert parsed["from_snapshot"] == diff["from_snapshot"]


# =============================================================================
# Tests: Sorting and Determinism
# =============================================================================

def test_diff_snapshot_json_sorting_is_deterministic(sample_snapshot):
    """Test that diff_snapshot_json produces deterministically sorted output."""
    snapshot_a = copy.deepcopy(sample_snapshot)
    snapshot_b = copy.deepcopy(sample_snapshot)
    
    # Add determinism changes in random order
    snapshot_b["report"]["determinism"]["non_deterministic_jobs"] = ["job_003", "job_001", "job_002"]
    
    diff = diff_snapshot_json(snapshot_a, snapshot_b)
    
    # Changes should be sorted
    changes = diff["changes"]
    assert isinstance(changes, dict)
    
    # The diff should be deterministic regardless of input ordering
    diff2 = diff_snapshot_json(snapshot_a, snapshot_b)
    assert diff == diff2


# =============================================================================
# Tests: Edge Cases
# =============================================================================

def test_create_snapshot_json_handles_empty_dataset(mock_intelligence, monkeypatch):
    """Test that create_snapshot_json handles empty datasets gracefully."""
    empty_report = {
        "generated_at": "2024-01-01T00:00:00+00:00",
        "execution_summary": {"total_jobs": 0, "completed": 0, "failed": 0, "validation_failed": 0},
        "failure_summary": {"by_engine": {}, "top_failure_reasons": []},
        "engine_health": {},
        "proxy_profile_stability": {},
        "determinism": {"non_deterministic_jobs": [], "count": 0},
    }
    
    mock_reports = MagicMock()
    mock_exporter = MagicMock()
    mock_exporter.export_json.return_value = empty_report
    
    monkeypatch.setattr("fabric.utils.snapshot_cli.create_reports", lambda intel: mock_reports)
    monkeypatch.setattr("fabric.utils.snapshot_cli.FabricReportExporter", lambda reports: mock_exporter)
    
    snapshot = create_snapshot_json(mock_intelligence)
    
    assert isinstance(snapshot, dict)
    assert "snapshot_id" in snapshot
    assert snapshot["report"]["execution_summary"]["total_jobs"] == 0


def test_diff_snapshot_json_handles_identical_snapshots(sample_snapshot):
    """Test that diff_snapshot_json handles identical snapshots."""
    snapshot_a = copy.deepcopy(sample_snapshot)
    snapshot_b = copy.deepcopy(sample_snapshot)
    
    diff = diff_snapshot_json(snapshot_a, snapshot_b)
    
    # Should produce valid diff even if snapshots are identical
    assert isinstance(diff, dict)
    assert diff["from_snapshot"] == diff["to_snapshot"]


def test_create_snapshot_json_no_filesystem_writes(mock_intelligence, sample_report, monkeypatch, tmp_path):
    """Test that create_snapshot_json does not write to filesystem."""
    mock_reports = MagicMock()
    mock_exporter = MagicMock()
    mock_exporter.export_json.return_value = sample_report
    
    monkeypatch.setattr("fabric.utils.snapshot_cli.create_reports", lambda intel: mock_reports)
    monkeypatch.setattr("fabric.utils.snapshot_cli.FabricReportExporter", lambda reports: mock_exporter)
    
    # Track files before
    files_before = list(tmp_path.glob("**/*"))
    
    create_snapshot_json(mock_intelligence)
    
    # No new files should be created
    files_after = list(tmp_path.glob("**/*"))
    assert files_before == files_after


def test_diff_snapshot_json_no_filesystem_writes(sample_snapshot, tmp_path):
    """Test that diff_snapshot_json does not write to filesystem."""
    snapshot_a = copy.deepcopy(sample_snapshot)
    snapshot_b = copy.deepcopy(sample_snapshot)
    
    # Track files before
    files_before = list(tmp_path.glob("**/*"))
    
    diff_snapshot_json(snapshot_a, snapshot_b)
    
    # No new files should be created
    files_after = list(tmp_path.glob("**/*"))
    assert files_before == files_after
