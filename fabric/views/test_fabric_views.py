"""
Tests for Fabric Views

Validates:
- Fabric data unchanged after composition
- Annotations unchanged after composition
- Correct attachment by job_id / snapshot_id
- Deterministic output ordering
- Empty annotations handled cleanly
- No filesystem writes
- No Fabric store mutation
"""

import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4
import pytest

from ..fabric_store import FabricStore
from ..operator_annotations.store import AnnotationStore
from ..operator_annotations.models import OperatorAnnotation
from .views import FabricViewComposer, JobWithAnnotations, SnapshotWithAnnotations


class TestFabricViewComposer:
    """Test the FabricViewComposer."""
    
    @pytest.fixture
    def fabric_store(self, tmp_path: Path) -> FabricStore:
        """Create a Fabric store with test data."""
        fabric_dir = tmp_path / "fabric"
        store = FabricStore(fabric_dir)
        
        # Create test jobs
        store.create_job(
            job_id="job_1",
            source_path="/test/source1.mxf",
            dest_path="/test/dest1.mp4",
        )
        
        store.create_job(
            job_id="job_2",
            source_path="/test/source2.mxf",
            dest_path="/test/dest2.mp4",
        )
        
        # Create test snapshots for job_1
        store.create_snapshot(
            job_id="job_1",
            snapshot_id="snapshot_1_1",
            status="failed",
            error_code="NETWORK_ERROR",
        )
        
        store.create_snapshot(
            job_id="job_1",
            snapshot_id="snapshot_1_2",
            status="failed",
            error_code="TIMEOUT",
        )
        
        # Create test snapshot for job_2
        store.create_snapshot(
            job_id="job_2",
            snapshot_id="snapshot_2_1",
            status="completed",
            error_code=None,
        )
        
        return store
    
    @pytest.fixture
    def annotation_store(self, tmp_path: Path) -> AnnotationStore:
        """Create an annotation store with test data."""
        ann_dir = tmp_path / "annotations"
        store = AnnotationStore(ann_dir)
        
        # Create annotations for job_1
        store.create_annotation(
            target_type="job",
            target_id="job_1",
            decision="retry",
            operator_id="op_1",
            note="Network was flaky",
        )
        
        store.create_annotation(
            target_type="job",
            target_id="job_1",
            decision="escalate",
            operator_id="op_2",
            note="Still failing after retry",
        )
        
        # Create annotation for snapshot_1_1
        store.create_annotation(
            target_type="snapshot",
            target_id="snapshot_1_1",
            decision="ignore",
            operator_id="op_1",
            note="Known issue",
        )
        
        return store
    
    def test_jobs_with_annotations_composes_correctly(
        self,
        tmp_path: Path,
        fabric_store: FabricStore,
        annotation_store: AnnotationStore,
    ):
        """Test that jobs are correctly composed with annotations."""
        composer = FabricViewComposer(fabric_store, annotation_store)
        
        views = composer.jobs_with_annotations()
        
        assert len(views) == 2
        
        # Find job_1
        job_1_view = next(v for v in views if v.job_id == "job_1")
        assert job_1_view.job_id == "job_1"
        assert job_1_view.fabric_data["job_id"] == "job_1"
        assert len(job_1_view.annotations) == 2
        assert job_1_view.annotations[0].decision == "retry"
        assert job_1_view.annotations[1].decision == "escalate"
        
        # Find job_2
        job_2_view = next(v for v in views if v.job_id == "job_2")
        assert job_2_view.job_id == "job_2"
        assert job_2_view.fabric_data["job_id"] == "job_2"
        assert len(job_2_view.annotations) == 0
    
    def test_snapshots_with_annotations_composes_correctly(
        self,
        tmp_path: Path,
        fabric_store: FabricStore,
        annotation_store: AnnotationStore,
    ):
        """Test that snapshots are correctly composed with annotations."""
        composer = FabricViewComposer(fabric_store, annotation_store)
        
        views = composer.snapshots_with_annotations("job_1")
        
        assert len(views) == 2
        
        # Find snapshot_1_1
        snap_1_1_view = next(v for v in views if v.snapshot_id == "snapshot_1_1")
        assert snap_1_1_view.snapshot_id == "snapshot_1_1"
        assert snap_1_1_view.fabric_data["snapshot_id"] == "snapshot_1_1"
        assert len(snap_1_1_view.annotations) == 1
        assert snap_1_1_view.annotations[0].decision == "ignore"
        
        # Find snapshot_1_2
        snap_1_2_view = next(v for v in views if v.snapshot_id == "snapshot_1_2")
        assert snap_1_2_view.snapshot_id == "snapshot_1_2"
        assert len(snap_1_2_view.annotations) == 0
    
    def test_fabric_data_unchanged_after_composition(
        self,
        tmp_path: Path,
        fabric_store: FabricStore,
        annotation_store: AnnotationStore,
    ):
        """Test that Fabric data is unchanged after composition."""
        # Read Fabric data before composition
        jobs_before = fabric_store.list_jobs()
        job_1_before = next(j for j in jobs_before if j["job_id"] == "job_1")
        job_1_before_copy = dict(job_1_before)
        
        # Compose views
        composer = FabricViewComposer(fabric_store, annotation_store)
        views = composer.jobs_with_annotations()
        
        # Read Fabric data after composition
        jobs_after = fabric_store.list_jobs()
        job_1_after = next(j for j in jobs_after if j["job_id"] == "job_1")
        
        # Verify unchanged
        assert job_1_before_copy == job_1_after
    
    def test_annotations_unchanged_after_composition(
        self,
        tmp_path: Path,
        fabric_store: FabricStore,
        annotation_store: AnnotationStore,
    ):
        """Test that annotations are unchanged after composition."""
        # Read annotations before composition
        annotations_before = annotation_store.list_annotations()
        before_count = len(annotations_before)
        before_ids = [a.annotation_id for a in annotations_before]
        
        # Compose views
        composer = FabricViewComposer(fabric_store, annotation_store)
        views = composer.jobs_with_annotations()
        
        # Read annotations after composition
        annotations_after = annotation_store.list_annotations()
        after_count = len(annotations_after)
        after_ids = [a.annotation_id for a in annotations_after]
        
        # Verify unchanged
        assert before_count == after_count
        assert before_ids == after_ids
    
    def test_deterministic_job_ordering(
        self,
        tmp_path: Path,
        fabric_store: FabricStore,
        annotation_store: AnnotationStore,
    ):
        """Test that jobs are returned in deterministic order."""
        composer = FabricViewComposer(fabric_store, annotation_store)
        
        # Call multiple times
        views_1 = composer.jobs_with_annotations()
        views_2 = composer.jobs_with_annotations()
        views_3 = composer.jobs_with_annotations()
        
        # Verify same order
        ids_1 = [v.job_id for v in views_1]
        ids_2 = [v.job_id for v in views_2]
        ids_3 = [v.job_id for v in views_3]
        
        assert ids_1 == ids_2 == ids_3
        
        # Verify sorted by job_id
        assert ids_1 == sorted(ids_1)
    
    def test_deterministic_snapshot_ordering(
        self,
        tmp_path: Path,
        fabric_store: FabricStore,
        annotation_store: AnnotationStore,
    ):
        """Test that snapshots are returned in deterministic order."""
        composer = FabricViewComposer(fabric_store, annotation_store)
        
        # Call multiple times
        views_1 = composer.snapshots_with_annotations("job_1")
        views_2 = composer.snapshots_with_annotations("job_1")
        views_3 = composer.snapshots_with_annotations("job_1")
        
        # Verify same order
        ids_1 = [v.snapshot_id for v in views_1]
        ids_2 = [v.snapshot_id for v in views_2]
        ids_3 = [v.snapshot_id for v in views_3]
        
        assert ids_1 == ids_2 == ids_3
    
    def test_deterministic_annotation_ordering_within_view(
        self,
        tmp_path: Path,
        fabric_store: FabricStore,
        annotation_store: AnnotationStore,
    ):
        """Test that annotations within a view are in deterministic order."""
        composer = FabricViewComposer(fabric_store, annotation_store)
        
        views = composer.jobs_with_annotations()
        job_1_view = next(v for v in views if v.job_id == "job_1")
        
        # Verify annotations are sorted by created_at
        annotations = job_1_view.annotations
        assert len(annotations) == 2
        
        # Earlier annotation should come first
        assert annotations[0].created_at <= annotations[1].created_at
    
    def test_empty_annotations_handled_cleanly(
        self,
        tmp_path: Path,
        fabric_store: FabricStore,
        annotation_store: AnnotationStore,
    ):
        """Test that jobs/snapshots with no annotations are handled cleanly."""
        composer = FabricViewComposer(fabric_store, annotation_store)
        
        views = composer.jobs_with_annotations()
        job_2_view = next(v for v in views if v.job_id == "job_2")
        
        # job_2 has no annotations
        assert len(job_2_view.annotations) == 0
        assert job_2_view.annotations == []
    
    def test_no_filesystem_writes_during_composition(
        self,
        tmp_path: Path,
        fabric_store: FabricStore,
        annotation_store: AnnotationStore,
    ):
        """Test that composition does not write to filesystem."""
        # Count files before composition
        fabric_files_before = list((tmp_path / "fabric").rglob("*"))
        annotation_files_before = list((tmp_path / "annotations").rglob("*"))
        
        # Compose views
        composer = FabricViewComposer(fabric_store, annotation_store)
        composer.jobs_with_annotations()
        composer.snapshots_with_annotations("job_1")
        
        # Count files after composition
        fabric_files_after = list((tmp_path / "fabric").rglob("*"))
        annotation_files_after = list((tmp_path / "annotations").rglob("*"))
        
        # Verify no new files
        assert len(fabric_files_before) == len(fabric_files_after)
        assert len(annotation_files_before) == len(annotation_files_after)
    
    def test_no_fabric_store_mutation(
        self,
        tmp_path: Path,
        fabric_store: FabricStore,
        annotation_store: AnnotationStore,
    ):
        """Test that Fabric store is not mutated during composition."""
        # Snapshot Fabric state
        fabric_dir = tmp_path / "fabric"
        fabric_files_before = {}
        for f in fabric_dir.rglob("*.json"):
            with open(f, "r") as file:
                fabric_files_before[f] = file.read()
        
        # Compose views
        composer = FabricViewComposer(fabric_store, annotation_store)
        composer.jobs_with_annotations()
        composer.snapshots_with_annotations("job_1")
        
        # Check Fabric state
        fabric_files_after = {}
        for f in fabric_dir.rglob("*.json"):
            with open(f, "r") as file:
                fabric_files_after[f] = file.read()
        
        # Verify identical
        assert fabric_files_before == fabric_files_after
    
    def test_view_objects_are_frozen(
        self,
        tmp_path: Path,
        fabric_store: FabricStore,
        annotation_store: AnnotationStore,
    ):
        """Test that view objects are immutable."""
        composer = FabricViewComposer(fabric_store, annotation_store)
        views = composer.jobs_with_annotations()
        
        job_view = views[0]
        
        # Attempt to mutate
        with pytest.raises(AttributeError):
            job_view.job_id = "modified"  # type: ignore
        
        with pytest.raises(AttributeError):
            job_view.annotations = []  # type: ignore
    
    def test_attachment_by_correct_id(
        self,
        tmp_path: Path,
        fabric_store: FabricStore,
        annotation_store: AnnotationStore,
    ):
        """Test that annotations are attached to correct jobs/snapshots by ID."""
        # Create annotation for job_2
        annotation_store.create_annotation(
            target_type="job",
            target_id="job_2",
            decision="ignore",
            operator_id="op_3",
        )
        
        composer = FabricViewComposer(fabric_store, annotation_store)
        views = composer.jobs_with_annotations()
        
        # Verify job_2 now has 1 annotation
        job_2_view = next(v for v in views if v.job_id == "job_2")
        assert len(job_2_view.annotations) == 1
        assert job_2_view.annotations[0].target_id == "job_2"
        
        # Verify job_1 still has 2 annotations
        job_1_view = next(v for v in views if v.job_id == "job_1")
        assert len(job_1_view.annotations) == 2
        assert all(a.target_id == "job_1" for a in job_1_view.annotations)
    
    def test_no_cross_contamination_between_jobs(
        self,
        tmp_path: Path,
        fabric_store: FabricStore,
        annotation_store: AnnotationStore,
    ):
        """Test that job annotations don't leak to other jobs."""
        composer = FabricViewComposer(fabric_store, annotation_store)
        views = composer.jobs_with_annotations()
        
        # Get all annotation target_ids for each job
        for view in views:
            for ann in view.annotations:
                assert ann.target_id == view.job_id
    
    def test_no_cross_contamination_between_snapshots(
        self,
        tmp_path: Path,
        fabric_store: FabricStore,
        annotation_store: AnnotationStore,
    ):
        """Test that snapshot annotations don't leak to other snapshots."""
        composer = FabricViewComposer(fabric_store, annotation_store)
        views = composer.snapshots_with_annotations("job_1")
        
        # Get all annotation target_ids for each snapshot
        for view in views:
            for ann in view.annotations:
                assert ann.target_id == view.snapshot_id


class TestViewsDoNotImportExecution:
    """Verify that views do not import execution, retry, or policy logic."""
    
    def test_no_execution_imports(self):
        """Test that views.py does not import execution modules."""
        views_path = Path(__file__).parent / "views.py"
        
        with open(views_path, "r") as f:
            views_source = f.read()
        
        # Check for prohibited imports
        prohibited_patterns = [
            "from backend.",
            "import backend.",
            "from execution",
            "import execution",
            "from ..execution",
            "retry",
            "policy",
            "scoring",
            "heuristic",
        ]
        
        for pattern in prohibited_patterns:
            assert pattern not in views_source, f"views.py contains prohibited pattern: {pattern}"
