"""
Fabric Indexing - Simple in-memory indexes for ingested jobs.

Provides fast lookups by common query patterns:
- By fingerprint (future)
- By canonical proxy profile
- By status
- By engine used

Rules:
------
- No caching
- No optimization beyond basic indexing
- Correctness over performance
- Indexes rebuilt on every query (Phase 1 simplicity)

FORBIDDEN:
- Derived indexes (e.g., "jobs that might fail again")
- Health metrics
- Recommendation indexes
- Predictive indexes
"""

from collections import defaultdict
from typing import Dict, List, Set

from fabric.models import IngestedJob


class FabricIndex:
    """
    Simple in-memory index of ingested jobs.
    
    Phase 1: Stores all jobs in memory.
    Future phases may add persistent storage.
    
    This is NOT optimized. It is CORRECT.
    """
    
    def __init__(self):
        """Initialize empty index."""
        self._jobs: Dict[str, IngestedJob] = {}
        
        # Simple indexes for common queries
        self._by_fingerprint: Dict[str, Set[str]] = defaultdict(set)
        self._by_profile: Dict[str, Set[str]] = defaultdict(set)
        self._by_status: Dict[str, Set[str]] = defaultdict(set)
        self._by_engine: Dict[str, Set[str]] = defaultdict(set)
    
    def add_job(self, job: IngestedJob) -> None:
        """
        Add a job to the index.
        
        Args:
            job: IngestedJob to index
        
        Idempotent: adding same job_id twice replaces the first entry.
        This supports re-ingestion without duplication.
        """
        job_id = job.job_id
        
        # Remove old indexes if re-ingesting
        if job_id in self._jobs:
            self._remove_from_indexes(job_id)
        
        # Store job
        self._jobs[job_id] = job
        
        # Build indexes
        if job.fingerprint:
            self._by_fingerprint[job.fingerprint].add(job_id)
        
        if job.canonical_proxy_profile:
            self._by_profile[job.canonical_proxy_profile].add(job_id)
        
        self._by_status[job.final_status].add(job_id)
        
        if job.engine_used:
            self._by_engine[job.engine_used].add(job_id)
    
    def _remove_from_indexes(self, job_id: str) -> None:
        """Remove job from all indexes (for re-ingestion)."""
        old_job = self._jobs.get(job_id)
        if not old_job:
            return
        
        # Remove from fingerprint index
        if old_job.fingerprint:
            self._by_fingerprint[old_job.fingerprint].discard(job_id)
            if not self._by_fingerprint[old_job.fingerprint]:
                del self._by_fingerprint[old_job.fingerprint]
        
        # Remove from profile index
        if old_job.canonical_proxy_profile:
            self._by_profile[old_job.canonical_proxy_profile].discard(job_id)
            if not self._by_profile[old_job.canonical_proxy_profile]:
                del self._by_profile[old_job.canonical_proxy_profile]
        
        # Remove from status index
        self._by_status[old_job.final_status].discard(job_id)
        if not self._by_status[old_job.final_status]:
            del self._by_status[old_job.final_status]
        
        # Remove from engine index
        if old_job.engine_used:
            self._by_engine[old_job.engine_used].discard(job_id)
            if not self._by_engine[old_job.engine_used]:
                del self._by_engine[old_job.engine_used]
    
    def get_job(self, job_id: str) -> IngestedJob | None:
        """
        Retrieve a job by ID.
        
        Args:
            job_id: Job ID to look up
        
        Returns:
            IngestedJob if found, None otherwise
        """
        return self._jobs.get(job_id)
    
    def get_jobs_by_fingerprint(self, fingerprint: str) -> List[IngestedJob]:
        """
        Get all jobs with a specific fingerprint.
        
        Args:
            fingerprint: Output fingerprint to search for
        
        Returns:
            List of IngestedJobs with matching fingerprint
        """
        job_ids = self._by_fingerprint.get(fingerprint, set())
        return [self._jobs[jid] for jid in job_ids if jid in self._jobs]
    
    def get_jobs_by_profile(self, profile_id: str) -> List[IngestedJob]:
        """
        Get all jobs using a specific canonical proxy profile.
        
        Args:
            profile_id: Canonical proxy profile ID
        
        Returns:
            List of IngestedJobs using this profile
        """
        job_ids = self._by_profile.get(profile_id, set())
        return [self._jobs[jid] for jid in job_ids if jid in self._jobs]
    
    def get_jobs_by_status(self, status: str) -> List[IngestedJob]:
        """
        Get all jobs with a specific final status.
        
        Args:
            status: 'COMPLETED', 'FAILED', or 'PARTIAL'
        
        Returns:
            List of IngestedJobs with matching status
        """
        job_ids = self._by_status.get(status, set())
        return [self._jobs[jid] for jid in job_ids if jid in self._jobs]
    
    def get_jobs_by_engine(self, engine: str) -> List[IngestedJob]:
        """
        Get all jobs executed with a specific engine.
        
        Args:
            engine: 'ffmpeg' or 'resolve'
        
        Returns:
            List of IngestedJobs executed with this engine
        """
        job_ids = self._by_engine.get(engine, set())
        return [self._jobs[jid] for jid in job_ids if jid in self._jobs]
    
    def get_all_jobs(self) -> List[IngestedJob]:
        """
        Get all indexed jobs.
        
        Returns:
            List of all IngestedJobs in the index
        """
        return list(self._jobs.values())
    
    def count_jobs(self) -> int:
        """
        Count total number of indexed jobs.
        
        Returns:
            Number of jobs in index
        """
        return len(self._jobs)
    
    def clear(self) -> None:
        """
        Clear all jobs from the index.
        
        Used for testing or reset operations.
        """
        self._jobs.clear()
        self._by_fingerprint.clear()
        self._by_profile.clear()
        self._by_status.clear()
        self._by_engine.clear()


# FORBIDDEN: Do not add indexes like:
# - get_jobs_likely_to_fail()
# - get_jobs_needing_retry()
# - get_recommended_profiles()
# - get_health_score()
