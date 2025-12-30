"""
Fabric View Exports - Deterministic serialization of composed views.

Purpose: Convert composed views from FabricViewComposer to JSON/text formats.
This is a PURE PRESENTATION LAYER:
- No filesystem writes (returns strings only)
- No mutation of inputs
- No interpretation or summarization
- Deterministic ordering required
- No filtering, aggregation, or alerts

Inputs are outputs from FabricViewComposer only.
"""

import json
from typing import Any

from fabric.views.views import JobWithAnnotations, SnapshotWithAnnotations


class FabricViewExporter:
    """
    Deterministic serialization of composed views to JSON and text formats.
    
    This is a PURE PRESENTATION LAYER:
    - All methods are pure functions (no side effects)
    - No filesystem operations
    - No mutation of inputs
    - No interpretation or summarization
    - Deterministic and stable output
    
    Explicit non-goals:
    - No filtering
    - No aggregation
    - No alerts
    - No execution triggers
    """
    
    def export_jobs_view_json(self, jobs: list[JobWithAnnotations]) -> str:
        """
        Export jobs with annotations to JSON format.
        
        Args:
            jobs: List of JobWithAnnotations from FabricViewComposer.
                  Must be in deterministic order.
        
        Returns:
            JSON string with stable field ordering and deterministic output.
        
        Note:
            - Does not mutate inputs
            - Does not write to filesystem
            - Output is deterministic and reproducible
        """
        # Convert to serializable format with explicit field ordering
        jobs_data = []
        for job in jobs:
            job_dict = {
                "job_id": job.job_id,
                "fabric_data": self._ordered_dict(job.fabric_data),
                "annotations": [
                    self._serialize_annotation(ann) for ann in job.annotations
                ]
            }
            jobs_data.append(job_dict)
        
        # Use sort_keys for deterministic ordering at JSON level
        return json.dumps(jobs_data, indent=2, sort_keys=True, default=str)
    
    def export_jobs_view_text(self, jobs: list[JobWithAnnotations]) -> str:
        """
        Export jobs with annotations to human-readable text format.
        
        Args:
            jobs: List of JobWithAnnotations from FabricViewComposer.
                  Must be in deterministic order.
        
        Returns:
            Plain text string with stable formatting.
        
        Note:
            - Does not mutate inputs
            - Does not write to filesystem
            - Output is deterministic and reproducible
        """
        lines = []
        lines.append("=" * 80)
        lines.append("FABRIC JOBS VIEW")
        lines.append("=" * 80)
        lines.append("")
        
        for idx, job in enumerate(jobs, 1):
            lines.append(f"[Job {idx}] {job.job_id}")
            lines.append("-" * 80)
            
            # Fabric data in stable order
            lines.append("Fabric Data:")
            for key in sorted(job.fabric_data.keys()):
                value = job.fabric_data[key]
                lines.append(f"  {key}: {value}")
            
            # Annotations in stable order
            if job.annotations:
                lines.append("")
                lines.append(f"Annotations ({len(job.annotations)}):")
                for ann_idx, ann in enumerate(job.annotations, 1):
                    lines.append(f"  [{ann_idx}] {ann.annotation_id}")
                    lines.append(f"      Decision: {ann.decision}")
                    lines.append(f"      Operator: {ann.operator_id}")
                    lines.append(f"      Created: {ann.created_at}")
                    if ann.note:
                        lines.append(f"      Note: {ann.note}")
            else:
                lines.append("")
                lines.append("Annotations: (none)")
            
            lines.append("")
        
        if not jobs:
            lines.append("(no jobs)")
            lines.append("")
        
        return "\n".join(lines)
    
    def export_snapshots_view_json(self, snapshots: list[SnapshotWithAnnotations]) -> str:
        """
        Export snapshots with annotations to JSON format.
        
        Args:
            snapshots: List of SnapshotWithAnnotations from FabricViewComposer.
                       Must be in deterministic order.
        
        Returns:
            JSON string with stable field ordering and deterministic output.
        
        Note:
            - Does not mutate inputs
            - Does not write to filesystem
            - Output is deterministic and reproducible
        """
        # Convert to serializable format with explicit field ordering
        snapshots_data = []
        for snapshot in snapshots:
            snapshot_dict = {
                "snapshot_id": snapshot.snapshot_id,
                "fabric_data": self._ordered_dict(snapshot.fabric_data),
                "annotations": [
                    self._serialize_annotation(ann) for ann in snapshot.annotations
                ]
            }
            snapshots_data.append(snapshot_dict)
        
        # Use sort_keys for deterministic ordering at JSON level
        return json.dumps(snapshots_data, indent=2, sort_keys=True, default=str)
    
    def export_snapshots_view_text(self, snapshots: list[SnapshotWithAnnotations]) -> str:
        """
        Export snapshots with annotations to human-readable text format.
        
        Args:
            snapshots: List of SnapshotWithAnnotations from FabricViewComposer.
                       Must be in deterministic order.
        
        Returns:
            Plain text string with stable formatting.
        
        Note:
            - Does not mutate inputs
            - Does not write to filesystem
            - Output is deterministic and reproducible
        """
        lines = []
        lines.append("=" * 80)
        lines.append("FABRIC SNAPSHOTS VIEW")
        lines.append("=" * 80)
        lines.append("")
        
        for idx, snapshot in enumerate(snapshots, 1):
            lines.append(f"[Snapshot {idx}] {snapshot.snapshot_id}")
            lines.append("-" * 80)
            
            # Fabric data in stable order
            lines.append("Fabric Data:")
            for key in sorted(snapshot.fabric_data.keys()):
                value = snapshot.fabric_data[key]
                lines.append(f"  {key}: {value}")
            
            # Annotations in stable order
            if snapshot.annotations:
                lines.append("")
                lines.append(f"Annotations ({len(snapshot.annotations)}):")
                for ann_idx, ann in enumerate(snapshot.annotations, 1):
                    lines.append(f"  [{ann_idx}] {ann.annotation_id}")
                    lines.append(f"      Decision: {ann.decision}")
                    lines.append(f"      Operator: {ann.operator_id}")
                    lines.append(f"      Created: {ann.created_at}")
                    if ann.note:
                        lines.append(f"      Note: {ann.note}")
            else:
                lines.append("")
                lines.append("Annotations: (none)")
            
            lines.append("")
        
        if not snapshots:
            lines.append("(no snapshots)")
            lines.append("")
        
        return "\n".join(lines)
    
    # Private helper methods
    
    def _serialize_annotation(self, ann: Any) -> dict[str, Any]:
        """
        Serialize an OperatorAnnotation to a dict with stable field ordering.
        
        Args:
            ann: OperatorAnnotation instance
        
        Returns:
            Dictionary with stable key ordering
        """
        return {
            "annotation_id": str(ann.annotation_id),
            "target_type": ann.target_type,
            "target_id": ann.target_id,
            "decision": ann.decision,
            "note": ann.note,
            "operator_id": ann.operator_id,
            "created_at": ann.created_at.isoformat(),
        }
    
    def _ordered_dict(self, data: dict[str, Any]) -> dict[str, Any]:
        """
        Return a dictionary with sorted keys for deterministic output.
        
        Args:
            data: Input dictionary
        
        Returns:
            New dictionary with sorted keys (does not mutate input)
        """
        return {k: data[k] for k in sorted(data.keys())}
