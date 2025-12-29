"""
Fabric Query API - Read-only queries for ingested execution results.

Answers questions about WHAT HAPPENED.
Does NOT answer questions about WHAT TO DO NEXT.

Example queries Fabric can answer:
- "Have we seen this fingerprint before?"
- "What happened to job X?"
- "Which outputs exist for profile Y?"
- "How many jobs failed with engine Z?"

Example queries Fabric CANNOT answer:
- "Should we retry this job?"
- "What's the best profile to use?"
- "Is this job healthy?"
- "What should we do next?"

Fabric provides facts. Humans decide.

Phase 2: Queries work identically with persistent storage.
Query semantics unchanged from Phase 1.
"""

from typing import List, Optional

from fabric.index import FabricIndex
from fabric.models import IngestedJob, IngestedOutput


class FabricQueries:
    """
    Read-only query interface for Fabric index.
    
    All methods return facts as they were observed.
    No interpretation, recommendation, or prediction.
    
    Phase 2: Queries backed by persistent storage.
    Semantics identical to Phase 1.
    """
    
    def __init__(self, index: FabricIndex):
        """
        Initialize query interface.
        
        Args:
            index: FabricIndex to query
        """
        self._index = index
    
    def get_job(self, job_id: str) -> Optional[IngestedJob]:
        """
        Get a specific job by ID.
        
        Args:
            job_id: Job ID to retrieve
        
        Returns:
            IngestedJob if found, None otherwise
        """
        return self._index.get_job(job_id)
    
    def get_jobs_by_fingerprint(self, fingerprint: str) -> List[IngestedJob]:
        """
        Get all jobs that produced a specific output fingerprint.
        
        Use case: "Have we seen this output before?"
        
        Args:
            fingerprint: Output fingerprint to search for
        
        Returns:
            List of jobs with matching fingerprint (may be empty)
        """
        return self._index.get_jobs_by_fingerprint(fingerprint)
    
    def get_jobs_by_profile(self, profile_id: str) -> List[IngestedJob]:
        """
        Get all jobs executed with a specific canonical proxy profile.
        
        Use case: "What jobs used profile X?"
        
        Args:
            profile_id: Canonical proxy profile ID
        
        Returns:
            List of jobs using this profile (may be empty)
        """
        return self._index.get_jobs_by_profile(profile_id)
    
    def get_completed_jobs(self) -> List[IngestedJob]:
        """
        Get all jobs that completed successfully.
        
        Returns:
            List of jobs with final_status='COMPLETED'
        """
        return self._index.get_jobs_by_status("COMPLETED")
    
    def get_failed_jobs(self) -> List[IngestedJob]:
        """
        Get all jobs that failed.
        
        Returns:
            List of jobs with final_status='FAILED'
        """
        return self._index.get_jobs_by_status("FAILED")
    
    def get_partial_jobs(self) -> List[IngestedJob]:
        """
        Get all jobs that stopped before completion.
        
        Returns:
            List of jobs with final_status='PARTIAL'
        """
        return self._index.get_jobs_by_status("PARTIAL")
    
    def get_jobs_by_engine(self, engine: str) -> List[IngestedJob]:
        """
        Get all jobs executed with a specific engine.
        
        Args:
            engine: 'ffmpeg' or 'resolve'
        
        Returns:
            List of jobs executed with this engine
        """
        return self._index.get_jobs_by_engine(engine)
    
    def get_job_history(self, job_id: str) -> Optional[IngestedJob]:
        """
        Get execution history for a specific job.
        
        Phase 1: Returns single IngestedJob (no retry tracking).
        Future phases may track multiple execution attempts.
        
        Args:
            job_id: Job ID to look up
        
        Returns:
            IngestedJob if found, None otherwise
        """
        return self._index.get_job(job_id)
    
    def get_outputs_for_job(self, job_id: str) -> List[IngestedOutput]:
        """
        Get all outputs produced by a specific job.
        
        Args:
            job_id: Job ID to look up
        
        Returns:
            List of IngestedOutputs (empty if job not found)
        """
        job = self._index.get_job(job_id)
        if not job:
            return []
        return list(job.outputs)
    
    def count_jobs(self) -> int:
        """
        Count total number of indexed jobs.
        
        Returns:
            Number of jobs in index
        """
        return self._index.count_jobs()
    
    def count_jobs_by_status(self, status: str) -> int:
        """
        Count jobs with a specific status.
        
        Args:
            status: 'COMPLETED', 'FAILED', or 'PARTIAL'
        
        Returns:
            Number of jobs with this status
        """
        return len(self._index.get_jobs_by_status(status))
    
    def get_all_jobs(self) -> List[IngestedJob]:
        """
        Get all indexed jobs.
        
        Returns:
            List of all jobs in index
        """
        return self._index.get_all_jobs()
    
    # FORBIDDEN: Do not add queries like:
    # - should_retry_job()
    # - get_recommended_profile()
    # - get_job_health_score()
    # - get_next_action()
    # - get_failure_predictions()
    # - get_optimization_suggestions()


def create_fabric_queries(index: FabricIndex) -> FabricQueries:
    """
    Factory function for creating FabricQueries instance.
    
    Args:
        index: FabricIndex to query
    
    Returns:
        FabricQueries instance
    """
    return FabricQueries(index)
