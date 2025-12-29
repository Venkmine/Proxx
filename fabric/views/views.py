"""
Fabric Views - Read-Only Composition

Purpose: Compose Fabric data with operator annotations for operator/UI consumption.
This is a READ-ONLY view layer. It does NOT mutate Fabric or annotations.
It does NOT add meaning, infer intent, or drive execution.
"""

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ..fabric_store import FabricStore
from ..operator_annotations.store import AnnotationStore
from ..operator_annotations.models import OperatorAnnotation


@dataclass(frozen=True)
class JobWithAnnotations:
    """
    Read-only view of a job with attached operator annotations.
    
    This is a pure composition for display/consumption.
    It does NOT affect execution or Fabric state.
    """
    job_id: str
    fabric_data: dict[str, Any]  # Original Fabric job data (unchanged)
    annotations: list[OperatorAnnotation]  # Annotations for this job (sorted)


@dataclass(frozen=True)
class SnapshotWithAnnotations:
    """
    Read-only view of a snapshot with attached operator annotations.
    
    This is a pure composition for display/consumption.
    It does NOT affect execution or Fabric state.
    """
    snapshot_id: str
    fabric_data: dict[str, Any]  # Original Fabric snapshot data (unchanged)
    annotations: list[OperatorAnnotation]  # Annotations for this snapshot (sorted)


class FabricViewComposer:
    """
    Composes read-only views of Fabric data + operator annotations.
    
    This is a PURE VIEW LAYER:
    - Does NOT mutate Fabric data
    - Does NOT mutate annotations
    - Does NOT persist anything
    - Does NOT add meaning or infer intent
    - Does NOT drive execution
    
    All composition is done in-memory only.
    """
    
    def __init__(self, fabric_store: FabricStore, annotation_store: AnnotationStore):
        """
        Initialize the view composer.
        
        Args:
            fabric_store: Fabric store for reading job/snapshot data
            annotation_store: Annotation store for reading operator annotations
        """
        self.fabric_store = fabric_store
        self.annotation_store = annotation_store
    
    def jobs_with_annotations(self) -> list[JobWithAnnotations]:
        """
        Compose all jobs with their operator annotations.
        
        Returns:
            List of JobWithAnnotations in deterministic order (by job_id).
            Each job includes zero or more annotations attached.
        
        Note:
            - Fabric data is unchanged
            - Annotations are unchanged
            - Composition is in-memory only
            - No persistence occurs
        """
        # Read all annotations once
        all_annotations = self.annotation_store.list_annotations()
        
        # Group annotations by target_id for jobs
        job_annotations: dict[str, list[OperatorAnnotation]] = {}
        for ann in all_annotations:
            if ann.target_type == "job":
                if ann.target_id not in job_annotations:
                    job_annotations[ann.target_id] = []
                job_annotations[ann.target_id].append(ann)
        
        # Sort annotations for each job (already sorted from store, but ensure consistency)
        for target_id in job_annotations:
            job_annotations[target_id].sort(
                key=lambda a: (a.created_at, str(a.annotation_id))
            )
        
        # Read all jobs from Fabric
        jobs = self.fabric_store.list_jobs()
        
        # Compose views
        views = []
        for job in jobs:
            job_id = job["job_id"]
            views.append(
                JobWithAnnotations(
                    job_id=job_id,
                    fabric_data=job,  # Pass as-is (no mutation)
                    annotations=job_annotations.get(job_id, []),  # Empty list if no annotations
                )
            )
        
        # Deterministic ordering by job_id
        views.sort(key=lambda v: v.job_id)
        
        return views
    
    def snapshots_with_annotations(self, job_id: str) -> list[SnapshotWithAnnotations]:
        """
        Compose all snapshots for a job with their operator annotations.
        
        Args:
            job_id: The job ID to get snapshots for
        
        Returns:
            List of SnapshotWithAnnotations in deterministic order (by snapshot timestamp).
            Each snapshot includes zero or more annotations attached.
        
        Note:
            - Fabric data is unchanged
            - Annotations are unchanged
            - Composition is in-memory only
            - No persistence occurs
        """
        # Read all annotations once
        all_annotations = self.annotation_store.list_annotations()
        
        # Group annotations by target_id for snapshots
        snapshot_annotations: dict[str, list[OperatorAnnotation]] = {}
        for ann in all_annotations:
            if ann.target_type == "snapshot":
                if ann.target_id not in snapshot_annotations:
                    snapshot_annotations[ann.target_id] = []
                snapshot_annotations[ann.target_id].append(ann)
        
        # Sort annotations for each snapshot
        for target_id in snapshot_annotations:
            snapshot_annotations[target_id].sort(
                key=lambda a: (a.created_at, str(a.annotation_id))
            )
        
        # Read all snapshots for this job from Fabric
        snapshots = self.fabric_store.list_snapshots(job_id)
        
        # Compose views
        views = []
        for snapshot in snapshots:
            snapshot_id = snapshot["snapshot_id"]
            views.append(
                SnapshotWithAnnotations(
                    snapshot_id=snapshot_id,
                    fabric_data=snapshot,  # Pass as-is (no mutation)
                    annotations=snapshot_annotations.get(snapshot_id, []),  # Empty list if no annotations
                )
            )
        
        # Deterministic ordering by snapshot timestamp
        views.sort(key=lambda v: v.fabric_data.get("timestamp", ""))
        
        return views
