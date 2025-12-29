"""
Operator Annotations - File-Backed JSON Store

Purpose: Persist operator annotations as individual JSON files.
Operations: CREATE and LIST only. NO updates, NO deletes, NO interpretation.
"""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from .models import OperatorAnnotation


class AnnotationStore:
    """
    Simple file-backed store for operator annotations.
    
    Each annotation is stored as a separate JSON file.
    Validation errors are LOUD and fail immediately.
    
    NO updates allowed.
    NO deletes allowed.
    NO interpretation of annotations.
    """
    
    def __init__(self, storage_dir: Path):
        """
        Initialize the annotation store.
        
        Args:
            storage_dir: Directory where annotation JSON files will be stored.
        """
        self.storage_dir = storage_dir
        self.storage_dir.mkdir(parents=True, exist_ok=True)
    
    def create_annotation(
        self,
        target_type: str,
        target_id: str,
        decision: str,
        operator_id: str,
        note: str | None = None,
    ) -> OperatorAnnotation:
        """
        Create a new operator annotation.
        
        Args:
            target_type: Must be "job" or "snapshot"
            target_id: The ID of the target (job_id or snapshot_id)
            decision: Must be "retry", "ignore", or "escalate"
            operator_id: Identifier of the operator making this annotation
            note: Optional free-text note
            
        Returns:
            The created OperatorAnnotation
            
        Raises:
            ValueError: If validation fails (LOUD failure)
        """
        # LOUD validation
        if target_type not in ("job", "snapshot"):
            raise ValueError(f"Invalid target_type: {target_type}. Must be 'job' or 'snapshot'.")
        
        if decision not in ("retry", "ignore", "escalate"):
            raise ValueError(f"Invalid decision: {decision}. Must be 'retry', 'ignore', or 'escalate'.")
        
        if not target_id or not target_id.strip():
            raise ValueError("target_id cannot be empty.")
        
        if not operator_id or not operator_id.strip():
            raise ValueError("operator_id cannot be empty.")
        
        # Create annotation with new UUID and current UTC time
        annotation = OperatorAnnotation(
            annotation_id=uuid4(),
            target_type=target_type,  # type: ignore
            target_id=target_id.strip(),
            decision=decision,  # type: ignore
            note=note.strip() if note else None,
            operator_id=operator_id.strip(),
            created_at=datetime.now(timezone.utc),
        )
        
        # Persist to file
        self._write_annotation(annotation)
        
        return annotation
    
    def list_annotations(self, target_id: str | None = None) -> list[OperatorAnnotation]:
        """
        List all annotations, optionally filtered by target_id.
        
        Args:
            target_id: Optional filter by target_id
            
        Returns:
            List of annotations in deterministic order (sorted by created_at, then annotation_id)
        """
        annotations = []
        
        for json_file in self.storage_dir.glob("*.json"):
            try:
                annotation = self._read_annotation(json_file)
                if target_id is None or annotation.target_id == target_id:
                    annotations.append(annotation)
            except Exception as e:
                # LOUD failure for corrupt data
                raise RuntimeError(f"Failed to read annotation from {json_file}: {e}") from e
        
        # Deterministic ordering: by created_at, then by annotation_id
        annotations.sort(key=lambda a: (a.created_at, str(a.annotation_id)))
        
        return annotations
    
    def _write_annotation(self, annotation: OperatorAnnotation) -> None:
        """Write annotation to JSON file."""
        file_path = self.storage_dir / f"{annotation.annotation_id}.json"
        
        data = {
            "annotation_id": str(annotation.annotation_id),
            "target_type": annotation.target_type,
            "target_id": annotation.target_id,
            "decision": annotation.decision,
            "note": annotation.note,
            "operator_id": annotation.operator_id,
            "created_at": annotation.created_at.isoformat(),
        }
        
        with open(file_path, "w") as f:
            json.dump(data, f, indent=2)
    
    def _read_annotation(self, file_path: Path) -> OperatorAnnotation:
        """Read annotation from JSON file with LOUD validation."""
        with open(file_path, "r") as f:
            data = json.load(f)
        
        # LOUD validation during read
        try:
            return OperatorAnnotation(
                annotation_id=UUID(data["annotation_id"]),
                target_type=data["target_type"],
                target_id=data["target_id"],
                decision=data["decision"],
                note=data["note"],
                operator_id=data["operator_id"],
                created_at=datetime.fromisoformat(data["created_at"]),
            )
        except (KeyError, ValueError, TypeError) as e:
            raise ValueError(f"Invalid annotation data in {file_path}: {e}") from e
