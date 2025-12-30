"""
Tests for Fabric View Exports - Deterministic serialization.

Purpose: Verify that FabricViewExporter produces deterministic, stable outputs.
"""

import json
from datetime import datetime, timezone
from uuid import UUID

import pytest

from fabric.views.views import JobWithAnnotations, SnapshotWithAnnotations
from fabric.operator_annotations.models import OperatorAnnotation
from fabric.view_exports.export import FabricViewExporter


# Test fixtures

@pytest.fixture
def sample_annotation_1():
    """Sample annotation for testing."""
    return OperatorAnnotation(
        annotation_id=UUID("12345678-1234-5678-1234-567812345678"),
        target_type="job",
        target_id="job_001",
        decision="retry",
        note="Test annotation 1",
        operator_id="operator_alice",
        created_at=datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc),
    )


@pytest.fixture
def sample_annotation_2():
    """Another sample annotation for testing."""
    return OperatorAnnotation(
        annotation_id=UUID("87654321-4321-8765-4321-876543218765"),
        target_type="job",
        target_id="job_001",
        decision="ignore",
        note=None,
        operator_id="operator_bob",
        created_at=datetime(2024, 1, 15, 11, 0, 0, tzinfo=timezone.utc),
    )


@pytest.fixture
def sample_job_with_annotations(sample_annotation_1, sample_annotation_2):
    """Sample JobWithAnnotations for testing."""
    return JobWithAnnotations(
        job_id="job_001",
        fabric_data={
            "job_id": "job_001",
            "status": "failed",
            "created_at": "2024-01-15T10:00:00Z",
            "updated_at": "2024-01-15T10:15:00Z",
        },
        annotations=[sample_annotation_1, sample_annotation_2],
    )


@pytest.fixture
def sample_snapshot_annotation():
    """Sample annotation for snapshot testing."""
    return OperatorAnnotation(
        annotation_id=UUID("11111111-2222-3333-4444-555555555555"),
        target_type="snapshot",
        target_id="snapshot_001",
        decision="escalate",
        note="Escalate to senior operator",
        operator_id="operator_charlie",
        created_at=datetime(2024, 1, 15, 12, 0, 0, tzinfo=timezone.utc),
    )


@pytest.fixture
def sample_snapshot_with_annotations(sample_snapshot_annotation):
    """Sample SnapshotWithAnnotations for testing."""
    return SnapshotWithAnnotations(
        snapshot_id="snapshot_001",
        fabric_data={
            "snapshot_id": "snapshot_001",
            "timestamp": "2024-01-15T10:05:00Z",
            "state": "error",
            "error_message": "Connection timeout",
        },
        annotations=[sample_snapshot_annotation],
    )


@pytest.fixture
def exporter():
    """FabricViewExporter instance for testing."""
    return FabricViewExporter()


# Tests for deterministic output

def test_export_jobs_view_json_deterministic(exporter, sample_job_with_annotations):
    """Test that export_jobs_view_json produces deterministic output."""
    jobs = [sample_job_with_annotations]
    
    # Export multiple times
    output1 = exporter.export_jobs_view_json(jobs)
    output2 = exporter.export_jobs_view_json(jobs)
    output3 = exporter.export_jobs_view_json(jobs)
    
    # All outputs must be identical
    assert output1 == output2
    assert output2 == output3


def test_export_jobs_view_text_deterministic(exporter, sample_job_with_annotations):
    """Test that export_jobs_view_text produces deterministic output."""
    jobs = [sample_job_with_annotations]
    
    # Export multiple times
    output1 = exporter.export_jobs_view_text(jobs)
    output2 = exporter.export_jobs_view_text(jobs)
    output3 = exporter.export_jobs_view_text(jobs)
    
    # All outputs must be identical
    assert output1 == output2
    assert output2 == output3


def test_export_snapshots_view_json_deterministic(exporter, sample_snapshot_with_annotations):
    """Test that export_snapshots_view_json produces deterministic output."""
    snapshots = [sample_snapshot_with_annotations]
    
    # Export multiple times
    output1 = exporter.export_snapshots_view_json(snapshots)
    output2 = exporter.export_snapshots_view_json(snapshots)
    output3 = exporter.export_snapshots_view_json(snapshots)
    
    # All outputs must be identical
    assert output1 == output2
    assert output2 == output3


def test_export_snapshots_view_text_deterministic(exporter, sample_snapshot_with_annotations):
    """Test that export_snapshots_view_text produces deterministic output."""
    snapshots = [sample_snapshot_with_annotations]
    
    # Export multiple times
    output1 = exporter.export_snapshots_view_text(snapshots)
    output2 = exporter.export_snapshots_view_text(snapshots)
    output3 = exporter.export_snapshots_view_text(snapshots)
    
    # All outputs must be identical
    assert output1 == output2
    assert output2 == output3


# Tests for empty views

def test_export_empty_jobs_view_json(exporter):
    """Test that export_jobs_view_json handles empty list."""
    output = exporter.export_jobs_view_json([])
    
    # Should be valid JSON
    data = json.loads(output)
    assert data == []


def test_export_empty_jobs_view_text(exporter):
    """Test that export_jobs_view_text handles empty list."""
    output = exporter.export_jobs_view_text([])
    
    # Should contain header and "(no jobs)" message
    assert "FABRIC JOBS VIEW" in output
    assert "(no jobs)" in output


def test_export_empty_snapshots_view_json(exporter):
    """Test that export_snapshots_view_json handles empty list."""
    output = exporter.export_snapshots_view_json([])
    
    # Should be valid JSON
    data = json.loads(output)
    assert data == []


def test_export_empty_snapshots_view_text(exporter):
    """Test that export_snapshots_view_text handles empty list."""
    output = exporter.export_snapshots_view_text([])
    
    # Should contain header and "(no snapshots)" message
    assert "FABRIC SNAPSHOTS VIEW" in output
    assert "(no snapshots)" in output


# Tests for stable field ordering

def test_jobs_json_stable_field_ordering(exporter, sample_job_with_annotations):
    """Test that JSON output has stable field ordering."""
    jobs = [sample_job_with_annotations]
    output = exporter.export_jobs_view_json(jobs)
    
    # Parse JSON
    data = json.loads(output)
    
    # Check that fabric_data keys are ordered
    fabric_data = data[0]["fabric_data"]
    keys = list(fabric_data.keys())
    assert keys == sorted(keys), "Fabric data keys should be alphabetically sorted"
    
    # Check annotations are present
    assert len(data[0]["annotations"]) == 2


def test_snapshots_json_stable_field_ordering(exporter, sample_snapshot_with_annotations):
    """Test that JSON output has stable field ordering."""
    snapshots = [sample_snapshot_with_annotations]
    output = exporter.export_snapshots_view_json(snapshots)
    
    # Parse JSON
    data = json.loads(output)
    
    # Check that fabric_data keys are ordered
    fabric_data = data[0]["fabric_data"]
    keys = list(fabric_data.keys())
    assert keys == sorted(keys), "Fabric data keys should be alphabetically sorted"
    
    # Check annotations are present
    assert len(data[0]["annotations"]) == 1


def test_jobs_text_stable_field_ordering(exporter):
    """Test that text output orders fabric_data keys consistently."""
    job = JobWithAnnotations(
        job_id="job_test",
        fabric_data={"zebra": "last", "alpha": "first", "beta": "second"},
        annotations=[],
    )
    
    output = exporter.export_jobs_view_text([job])
    
    # Keys should appear in alphabetical order in text
    alpha_pos = output.find("alpha:")
    beta_pos = output.find("beta:")
    zebra_pos = output.find("zebra:")
    
    assert alpha_pos < beta_pos < zebra_pos, "Keys should be alphabetically ordered in text output"


def test_snapshots_text_stable_field_ordering(exporter):
    """Test that text output orders fabric_data keys consistently."""
    snapshot = SnapshotWithAnnotations(
        snapshot_id="snapshot_test",
        fabric_data={"zebra": "last", "alpha": "first", "beta": "second"},
        annotations=[],
    )
    
    output = exporter.export_snapshots_view_text([snapshot])
    
    # Keys should appear in alphabetical order in text
    alpha_pos = output.find("alpha:")
    beta_pos = output.find("beta:")
    zebra_pos = output.find("zebra:")
    
    assert alpha_pos < beta_pos < zebra_pos, "Keys should be alphabetically ordered in text output"


# Tests for no mutation

def test_jobs_export_no_mutation(exporter, sample_job_with_annotations):
    """Test that export does not mutate input."""
    jobs = [sample_job_with_annotations]
    
    # Store original values
    original_job_id = sample_job_with_annotations.job_id
    original_fabric_data = dict(sample_job_with_annotations.fabric_data)
    original_annotations_count = len(sample_job_with_annotations.annotations)
    
    # Export (should not mutate)
    exporter.export_jobs_view_json(jobs)
    exporter.export_jobs_view_text(jobs)
    
    # Verify no mutation
    assert sample_job_with_annotations.job_id == original_job_id
    assert sample_job_with_annotations.fabric_data == original_fabric_data
    assert len(sample_job_with_annotations.annotations) == original_annotations_count


def test_snapshots_export_no_mutation(exporter, sample_snapshot_with_annotations):
    """Test that export does not mutate input."""
    snapshots = [sample_snapshot_with_annotations]
    
    # Store original values
    original_snapshot_id = sample_snapshot_with_annotations.snapshot_id
    original_fabric_data = dict(sample_snapshot_with_annotations.fabric_data)
    original_annotations_count = len(sample_snapshot_with_annotations.annotations)
    
    # Export (should not mutate)
    exporter.export_snapshots_view_json(snapshots)
    exporter.export_snapshots_view_text(snapshots)
    
    # Verify no mutation
    assert sample_snapshot_with_annotations.snapshot_id == original_snapshot_id
    assert sample_snapshot_with_annotations.fabric_data == original_fabric_data
    assert len(sample_snapshot_with_annotations.annotations) == original_annotations_count


# Tests for JSON validity

def test_jobs_json_validity(exporter, sample_job_with_annotations):
    """Test that jobs JSON output is valid JSON."""
    jobs = [sample_job_with_annotations]
    output = exporter.export_jobs_view_json(jobs)
    
    # Should parse without errors
    data = json.loads(output)
    
    # Basic structure checks
    assert isinstance(data, list)
    assert len(data) == 1
    assert "job_id" in data[0]
    assert "fabric_data" in data[0]
    assert "annotations" in data[0]


def test_snapshots_json_validity(exporter, sample_snapshot_with_annotations):
    """Test that snapshots JSON output is valid JSON."""
    snapshots = [sample_snapshot_with_annotations]
    output = exporter.export_snapshots_view_json(snapshots)
    
    # Should parse without errors
    data = json.loads(output)
    
    # Basic structure checks
    assert isinstance(data, list)
    assert len(data) == 1
    assert "snapshot_id" in data[0]
    assert "fabric_data" in data[0]
    assert "annotations" in data[0]


# Tests for text output stability

def test_jobs_text_output_structure(exporter):
    """Test that jobs text output has consistent structure."""
    job_no_annotations = JobWithAnnotations(
        job_id="job_001",
        fabric_data={"status": "ok"},
        annotations=[],
    )
    
    output = exporter.export_jobs_view_text([job_no_annotations])
    
    # Check for expected sections
    assert "FABRIC JOBS VIEW" in output
    assert "[Job 1]" in output
    assert "job_001" in output
    assert "Fabric Data:" in output
    assert "Annotations: (none)" in output


def test_snapshots_text_output_structure(exporter):
    """Test that snapshots text output has consistent structure."""
    snapshot_no_annotations = SnapshotWithAnnotations(
        snapshot_id="snapshot_001",
        fabric_data={"state": "ok"},
        annotations=[],
    )
    
    output = exporter.export_snapshots_view_text([snapshot_no_annotations])
    
    # Check for expected sections
    assert "FABRIC SNAPSHOTS VIEW" in output
    assert "[Snapshot 1]" in output
    assert "snapshot_001" in output
    assert "Fabric Data:" in output
    assert "Annotations: (none)" in output


def test_jobs_text_with_multiple_annotations(exporter, sample_annotation_1, sample_annotation_2):
    """Test that text output handles multiple annotations correctly."""
    job = JobWithAnnotations(
        job_id="job_001",
        fabric_data={"status": "failed"},
        annotations=[sample_annotation_1, sample_annotation_2],
    )
    
    output = exporter.export_jobs_view_text([job])
    
    # Should show annotation count and details
    assert "Annotations (2):" in output
    assert "[1]" in output
    assert "[2]" in output
    assert "operator_alice" in output
    assert "operator_bob" in output


def test_snapshots_text_with_annotation(exporter, sample_snapshot_annotation):
    """Test that text output handles annotations correctly."""
    snapshot = SnapshotWithAnnotations(
        snapshot_id="snapshot_001",
        fabric_data={"state": "error"},
        annotations=[sample_snapshot_annotation],
    )
    
    output = exporter.export_snapshots_view_text([snapshot])
    
    # Should show annotation details
    assert "Annotations (1):" in output
    assert "operator_charlie" in output
    assert "escalate" in output
    assert "Escalate to senior operator" in output


# Tests for multiple items

def test_multiple_jobs_json(exporter):
    """Test exporting multiple jobs to JSON."""
    job1 = JobWithAnnotations(job_id="job_001", fabric_data={"status": "ok"}, annotations=[])
    job2 = JobWithAnnotations(job_id="job_002", fabric_data={"status": "failed"}, annotations=[])
    
    output = exporter.export_jobs_view_json([job1, job2])
    data = json.loads(output)
    
    assert len(data) == 2
    assert data[0]["job_id"] == "job_001"
    assert data[1]["job_id"] == "job_002"


def test_multiple_snapshots_json(exporter):
    """Test exporting multiple snapshots to JSON."""
    snapshot1 = SnapshotWithAnnotations(
        snapshot_id="snapshot_001", 
        fabric_data={"state": "ok"}, 
        annotations=[]
    )
    snapshot2 = SnapshotWithAnnotations(
        snapshot_id="snapshot_002", 
        fabric_data={"state": "error"}, 
        annotations=[]
    )
    
    output = exporter.export_snapshots_view_json([snapshot1, snapshot2])
    data = json.loads(output)
    
    assert len(data) == 2
    assert data[0]["snapshot_id"] == "snapshot_001"
    assert data[1]["snapshot_id"] == "snapshot_002"
