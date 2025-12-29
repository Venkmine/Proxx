"""
Tests for Operator Annotations

Validates:
- Creation
- Immutability
- Deterministic listing order
- Invalid input failures
- No mutation of Fabric data (by not importing Fabric)
"""

import json
from datetime import datetime, timezone, timedelta
from pathlib import Path
from uuid import UUID
import pytest

from .models import OperatorAnnotation
from .store import AnnotationStore


class TestOperatorAnnotationModel:
    """Test the OperatorAnnotation dataclass."""
    
    def test_create_annotation_model(self):
        """Test creating an annotation model."""
        annotation_id = UUID("12345678-1234-5678-1234-567812345678")
        created_at = datetime(2025, 12, 29, 12, 0, 0, tzinfo=timezone.utc)
        
        annotation = OperatorAnnotation(
            annotation_id=annotation_id,
            target_type="job",
            target_id="job_abc123",
            decision="retry",
            note="Transient network error",
            operator_id="operator_1",
            created_at=created_at,
        )
        
        assert annotation.annotation_id == annotation_id
        assert annotation.target_type == "job"
        assert annotation.target_id == "job_abc123"
        assert annotation.decision == "retry"
        assert annotation.note == "Transient network error"
        assert annotation.operator_id == "operator_1"
        assert annotation.created_at == created_at
    
    def test_annotation_is_frozen(self):
        """Test that annotations are immutable."""
        annotation = OperatorAnnotation(
            annotation_id=UUID("12345678-1234-5678-1234-567812345678"),
            target_type="job",
            target_id="job_abc123",
            decision="ignore",
            note=None,
            operator_id="operator_1",
            created_at=datetime.now(timezone.utc),
        )
        
        with pytest.raises(AttributeError):
            annotation.decision = "escalate"  # type: ignore
        
        with pytest.raises(AttributeError):
            annotation.note = "Changed"  # type: ignore


class TestAnnotationStore:
    """Test the AnnotationStore."""
    
    def test_create_annotation(self, tmp_path: Path):
        """Test creating an annotation."""
        store = AnnotationStore(tmp_path)
        
        annotation = store.create_annotation(
            target_type="job",
            target_id="job_abc123",
            decision="retry",
            operator_id="operator_1",
            note="Test note",
        )
        
        assert isinstance(annotation.annotation_id, UUID)
        assert annotation.target_type == "job"
        assert annotation.target_id == "job_abc123"
        assert annotation.decision == "retry"
        assert annotation.note == "Test note"
        assert annotation.operator_id == "operator_1"
        assert isinstance(annotation.created_at, datetime)
        assert annotation.created_at.tzinfo == timezone.utc
    
    def test_create_annotation_persists_to_file(self, tmp_path: Path):
        """Test that annotations are persisted to JSON files."""
        store = AnnotationStore(tmp_path)
        
        annotation = store.create_annotation(
            target_type="snapshot",
            target_id="snapshot_xyz789",
            decision="escalate",
            operator_id="operator_2",
            note=None,
        )
        
        json_file = tmp_path / f"{annotation.annotation_id}.json"
        assert json_file.exists()
        
        with open(json_file, "r") as f:
            data = json.load(f)
        
        assert data["annotation_id"] == str(annotation.annotation_id)
        assert data["target_type"] == "snapshot"
        assert data["target_id"] == "snapshot_xyz789"
        assert data["decision"] == "escalate"
        assert data["note"] is None
        assert data["operator_id"] == "operator_2"
    
    def test_list_annotations(self, tmp_path: Path):
        """Test listing all annotations."""
        store = AnnotationStore(tmp_path)
        
        ann1 = store.create_annotation(
            target_type="job",
            target_id="job_1",
            decision="retry",
            operator_id="op_1",
        )
        
        ann2 = store.create_annotation(
            target_type="job",
            target_id="job_2",
            decision="ignore",
            operator_id="op_1",
        )
        
        annotations = store.list_annotations()
        
        assert len(annotations) == 2
        assert ann1 in annotations
        assert ann2 in annotations
    
    def test_list_annotations_filtered_by_target(self, tmp_path: Path):
        """Test listing annotations filtered by target_id."""
        store = AnnotationStore(tmp_path)
        
        ann1 = store.create_annotation(
            target_type="job",
            target_id="job_target_1",
            decision="retry",
            operator_id="op_1",
        )
        
        store.create_annotation(
            target_type="job",
            target_id="job_target_2",
            decision="ignore",
            operator_id="op_1",
        )
        
        annotations = store.list_annotations(target_id="job_target_1")
        
        assert len(annotations) == 1
        assert annotations[0].annotation_id == ann1.annotation_id
    
    def test_list_annotations_deterministic_order(self, tmp_path: Path):
        """Test that annotations are listed in deterministic order."""
        store = AnnotationStore(tmp_path)
        
        # Create annotations with controlled timestamps
        base_time = datetime(2025, 12, 29, 12, 0, 0, tzinfo=timezone.utc)
        
        # Create multiple annotations - they'll have slightly different timestamps
        annotations_created = []
        for i in range(5):
            ann = store.create_annotation(
                target_type="job",
                target_id=f"job_{i}",
                decision="retry",
                operator_id="op_1",
            )
            annotations_created.append(ann)
        
        # List multiple times and verify order is consistent
        list1 = store.list_annotations()
        list2 = store.list_annotations()
        list3 = store.list_annotations()
        
        assert [a.annotation_id for a in list1] == [a.annotation_id for a in list2]
        assert [a.annotation_id for a in list2] == [a.annotation_id for a in list3]
    
    def test_invalid_target_type_fails_loudly(self, tmp_path: Path):
        """Test that invalid target_type raises ValueError."""
        store = AnnotationStore(tmp_path)
        
        with pytest.raises(ValueError, match="Invalid target_type"):
            store.create_annotation(
                target_type="invalid",
                target_id="target_1",
                decision="retry",
                operator_id="op_1",
            )
    
    def test_invalid_decision_fails_loudly(self, tmp_path: Path):
        """Test that invalid decision raises ValueError."""
        store = AnnotationStore(tmp_path)
        
        with pytest.raises(ValueError, match="Invalid decision"):
            store.create_annotation(
                target_type="job",
                target_id="target_1",
                decision="invalid",
                operator_id="op_1",
            )
    
    def test_empty_target_id_fails_loudly(self, tmp_path: Path):
        """Test that empty target_id raises ValueError."""
        store = AnnotationStore(tmp_path)
        
        with pytest.raises(ValueError, match="target_id cannot be empty"):
            store.create_annotation(
                target_type="job",
                target_id="",
                decision="retry",
                operator_id="op_1",
            )
    
    def test_empty_operator_id_fails_loudly(self, tmp_path: Path):
        """Test that empty operator_id raises ValueError."""
        store = AnnotationStore(tmp_path)
        
        with pytest.raises(ValueError, match="operator_id cannot be empty"):
            store.create_annotation(
                target_type="job",
                target_id="target_1",
                decision="retry",
                operator_id="",
            )
    
    def test_whitespace_is_stripped(self, tmp_path: Path):
        """Test that whitespace is stripped from string fields."""
        store = AnnotationStore(tmp_path)
        
        annotation = store.create_annotation(
            target_type="job",
            target_id="  target_1  ",
            decision="retry",
            operator_id="  op_1  ",
            note="  test note  ",
        )
        
        assert annotation.target_id == "target_1"
        assert annotation.operator_id == "op_1"
        assert annotation.note == "test note"
    
    def test_corrupt_json_fails_loudly(self, tmp_path: Path):
        """Test that corrupt JSON files cause loud failures."""
        store = AnnotationStore(tmp_path)
        
        # Create a corrupt JSON file
        corrupt_file = tmp_path / "corrupt.json"
        with open(corrupt_file, "w") as f:
            f.write("{invalid json")
        
        with pytest.raises(RuntimeError, match="Failed to read annotation"):
            store.list_annotations()
    
    def test_missing_field_fails_loudly(self, tmp_path: Path):
        """Test that missing required fields cause loud failures."""
        store = AnnotationStore(tmp_path)
        
        # Create a JSON file with missing field
        incomplete_file = tmp_path / "incomplete.json"
        with open(incomplete_file, "w") as f:
            json.dump({
                "annotation_id": "12345678-1234-5678-1234-567812345678",
                "target_type": "job",
                # Missing target_id
                "decision": "retry",
                "note": None,
                "operator_id": "op_1",
                "created_at": "2025-12-29T12:00:00+00:00",
            }, f)
        
        with pytest.raises(RuntimeError, match="Failed to read annotation"):
            store.list_annotations()


class TestNoFabricDependency:
    """Verify that operator annotations do not import or depend on Fabric."""
    
    def test_no_fabric_imports(self):
        """Test that models and store do not import Fabric modules."""
        import sys
        
        # Get all currently loaded modules
        loaded_modules = list(sys.modules.keys())
        
        # Verify no Fabric execution modules are loaded by these imports
        fabric_execution_modules = [
            mod for mod in loaded_modules
            if "fabric" in mod and "operator_annotations" not in mod
        ]
        
        # If Fabric modules are loaded, they were imported elsewhere, not by operator_annotations
        # This test would be more meaningful in a fresh Python process, but this is a basic check
        # The real validation is in the imports themselves - models.py and store.py have no Fabric imports
        
        # Read the source files and verify no fabric imports
        models_path = Path(__file__).parent / "models.py"
        store_path = Path(__file__).parent / "store.py"
        
        with open(models_path, "r") as f:
            models_source = f.read()
        
        with open(store_path, "r") as f:
            store_source = f.read()
        
        # Check for prohibited imports
        prohibited_patterns = [
            "from fabric.",
            "import fabric.",
            "from backend.",
            "import backend.",
            "from ..fabric",
            "from execution",
        ]
        
        for pattern in prohibited_patterns:
            assert pattern not in models_source, f"models.py contains prohibited import: {pattern}"
            assert pattern not in store_source, f"store.py contains prohibited import: {pattern}"
