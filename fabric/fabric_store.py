"""
Mock Fabric Store for Testing

This is a simple in-memory store for testing views composition.
NOT for production use.
"""

import json
from pathlib import Path
from typing import Any


class FabricStore:
    """
    Simple file-based store for testing Fabric views.
    
    Stores jobs and snapshots as JSON files.
    """
    
    def __init__(self, storage_dir: Path):
        """
        Initialize store.
        
        Args:
            storage_dir: Directory for storing JSON files
        """
        self.storage_dir = storage_dir
        self.jobs_dir = storage_dir / "jobs"
        self.snapshots_dir = storage_dir / "snapshots"
        
        # Create directories
        self.jobs_dir.mkdir(parents=True, exist_ok=True)
        self.snapshots_dir.mkdir(parents=True, exist_ok=True)
    
    def create_job(self, job_id: str, **kwargs: Any) -> None:
        """
        Create a job record.
        
        Args:
            job_id: Job identifier
            **kwargs: Additional job data
        """
        job_data = {"job_id": job_id, **kwargs}
        job_path = self.jobs_dir / f"{job_id}.json"
        
        with open(job_path, "w") as f:
            json.dump(job_data, f, indent=2, sort_keys=True)
    
    def create_snapshot(self, job_id: str, snapshot_id: str, **kwargs: Any) -> None:
        """
        Create a snapshot record.
        
        Args:
            job_id: Job identifier
            snapshot_id: Snapshot identifier
            **kwargs: Additional snapshot data
        """
        job_snapshots_dir = self.snapshots_dir / job_id
        job_snapshots_dir.mkdir(parents=True, exist_ok=True)
        
        snapshot_data = {"snapshot_id": snapshot_id, "job_id": job_id, **kwargs}
        snapshot_path = job_snapshots_dir / f"{snapshot_id}.json"
        
        with open(snapshot_path, "w") as f:
            json.dump(snapshot_data, f, indent=2, sort_keys=True)
    
    def list_jobs(self) -> list[dict[str, Any]]:
        """
        List all jobs.
        
        Returns:
            List of job dictionaries
        """
        jobs = []
        for job_file in self.jobs_dir.glob("*.json"):
            with open(job_file, "r") as f:
                jobs.append(json.load(f))
        
        # Sort by job_id for determinism
        jobs.sort(key=lambda j: j["job_id"])
        return jobs
    
    def list_snapshots(self, job_id: str) -> list[dict[str, Any]]:
        """
        List all snapshots for a job.
        
        Args:
            job_id: Job identifier
        
        Returns:
            List of snapshot dictionaries
        """
        job_snapshots_dir = self.snapshots_dir / job_id
        if not job_snapshots_dir.exists():
            return []
        
        snapshots = []
        for snapshot_file in job_snapshots_dir.glob("*.json"):
            with open(snapshot_file, "r") as f:
                snapshots.append(json.load(f))
        
        # Sort by snapshot_id for determinism
        snapshots.sort(key=lambda s: s["snapshot_id"])
        return snapshots
