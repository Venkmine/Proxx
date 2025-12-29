"""
Fabric Intelligence - Read-only query layer for higher-level questions.

PHASE-2: READ-ONLY INTELLIGENCE

This module provides a pure read-only API that answers higher-level questions
about ingested execution results WITHOUT changing ingestion, execution, or
storage semantics.

ABSOLUTE CONSTRAINTS:
---------------------
❌ NO changes to Proxx execution code
❌ NO retries
❌ NO orchestration
❌ NO mutation of persisted data
❌ NO background jobs
❌ NO heuristics, scoring, or inference
❌ NO "recommended actions"
❌ NO auto-cleanup or migration
✅ READ-ONLY queries only
✅ Deterministic outputs
✅ Loud failures

DESIGN RULES:
-------------
- All functions are pure queries
- No writes, no deletes, no updates
- Works identically before and after process restart
- Results are stable across runs
- No ordering assumptions unless explicitly sorted
- Returns empty collections, not None

ERROR HANDLING:
---------------
- Missing database → explicit FabricError
- Corrupt rows → fail loudly
- Unknown engines/profiles → validation error
- NEVER swallow exceptions

Fabric provides facts. Humans decide.
"""

from collections import defaultdict
from typing import Dict, List, Optional, Set, Tuple

from fabric.index import FabricIndex
from fabric.models import IngestedJob


class FabricError(Exception):
    """Raised when Fabric operations fail."""
    pass


class FabricValidationError(FabricError):
    """Raised when query arguments are invalid."""
    pass


class FabricIntelligence:
    """
    Read-only intelligence layer for Fabric.
    
    Answers higher-level questions about ingested execution results.
    All methods are pure queries - no mutations, no side effects.
    
    FORBIDDEN:
    ----------
    - Retry logic
    - Orchestration
    - Recommendations
    - Heuristics
    - Inference
    - Scoring
    """
    
    # Valid engines that can be queried
    VALID_ENGINES = frozenset({"ffmpeg", "resolve"})
    
    def __init__(self, index: FabricIndex):
        """
        Initialize intelligence layer.
        
        Args:
            index: FabricIndex to query. Must be initialized and open.
        
        Raises:
            FabricError: If index is None
        """
        if index is None:
            raise FabricError("FabricIndex is required - cannot operate without index")
        self._index = index
    
    # =========================================================================
    # A. Fingerprint Intelligence
    # =========================================================================
    
    def has_fingerprint_been_seen(self, fingerprint: str) -> bool:
        """
        Check if a fingerprint has been observed in any completed job.
        
        This is a pure existence check - no interpretation of what seeing
        the fingerprint means. That is for humans to decide.
        
        Args:
            fingerprint: Output fingerprint to search for
        
        Returns:
            True if fingerprint has been seen, False otherwise
        
        Raises:
            FabricValidationError: If fingerprint is empty or None
        """
        if not fingerprint:
            raise FabricValidationError("fingerprint cannot be empty or None")
        
        jobs = self._index.get_jobs_by_fingerprint(fingerprint)
        return len(jobs) > 0
    
    def list_jobs_for_fingerprint(self, fingerprint: str) -> List[str]:
        """
        List all job IDs that produced a specific fingerprint.
        
        Returns job IDs only - caller must look up full job details
        if needed. Order is not guaranteed unless explicitly sorted.
        
        Args:
            fingerprint: Output fingerprint to search for
        
        Returns:
            List of job IDs (may be empty, never None)
        
        Raises:
            FabricValidationError: If fingerprint is empty or None
        """
        if not fingerprint:
            raise FabricValidationError("fingerprint cannot be empty or None")
        
        jobs = self._index.get_jobs_by_fingerprint(fingerprint)
        # Return sorted for deterministic output
        return sorted([job.job_id for job in jobs])
    
    # =========================================================================
    # B. Failure Intelligence
    # =========================================================================
    
    def list_failures_by_engine(self, engine: str) -> Dict[str, int]:
        """
        Get failure reason counts for jobs executed with a specific engine.
        
        Aggregates failure reasons across all failed jobs for the engine.
        Jobs without failure reasons (validation_error=None) are counted
        under the key "<no failure reason>".
        
        Args:
            engine: Engine name ('ffmpeg' or 'resolve')
        
        Returns:
            Dict mapping failure reason to count (may be empty, never None)
        
        Raises:
            FabricValidationError: If engine is not recognized
        """
        if engine not in self.VALID_ENGINES:
            raise FabricValidationError(
                f"Unknown engine '{engine}'. Valid engines: {sorted(self.VALID_ENGINES)}"
            )
        
        jobs = self._index.get_jobs_by_engine(engine)
        failure_counts: Dict[str, int] = defaultdict(int)
        
        for job in jobs:
            if job.final_status in ("FAILED", "PARTIAL"):
                reason = job.validation_error or "<no failure reason>"
                failure_counts[reason] += 1
        
        # Return regular dict for serialization compatibility
        return dict(failure_counts)
    
    def list_jobs_failed_for_reason(self, reason_substring: str) -> List[str]:
        """
        List job IDs where failure reason contains the given substring.
        
        Case-insensitive substring match against validation_error field.
        Returns job IDs only - caller must look up full job details.
        
        Args:
            reason_substring: Substring to search for in failure reasons
        
        Returns:
            List of job IDs (may be empty, never None)
        
        Raises:
            FabricValidationError: If reason_substring is empty or None
        """
        if not reason_substring:
            raise FabricValidationError("reason_substring cannot be empty or None")
        
        all_jobs = self._index.get_all_jobs()
        search_lower = reason_substring.lower()
        
        matching_job_ids = []
        for job in all_jobs:
            if job.final_status in ("FAILED", "PARTIAL"):
                if job.validation_error and search_lower in job.validation_error.lower():
                    matching_job_ids.append(job.job_id)
        
        # Return sorted for deterministic output
        return sorted(matching_job_ids)
    
    def failure_rate_by_proxy_profile(self) -> Dict[str, float]:
        """
        Calculate failure rate for each proxy profile.
        
        Failure rate = (failed + partial) / total for each profile.
        Profiles with zero jobs are not included in results.
        
        Returns:
            Dict mapping proxy profile to failure ratio (0.0 to 1.0).
            Returns empty dict if no profiles found, never None.
        
        Note:
            This is a pure calculation - no interpretation of what
            constitutes an "acceptable" failure rate.
        """
        profile_stats: Dict[str, Tuple[int, int]] = defaultdict(lambda: (0, 0))
        
        all_jobs = self._index.get_all_jobs()
        
        for job in all_jobs:
            profile = job.canonical_proxy_profile
            if not profile:
                continue
            
            total, failed = profile_stats[profile]
            if job.final_status in ("FAILED", "PARTIAL"):
                profile_stats[profile] = (total + 1, failed + 1)
            else:
                profile_stats[profile] = (total + 1, failed)
        
        # Calculate ratios
        result: Dict[str, float] = {}
        for profile, (total, failed) in profile_stats.items():
            if total > 0:
                result[profile] = failed / total
        
        return result
    
    # =========================================================================
    # C. Operational History
    # =========================================================================
    
    def list_jobs_by_proxy_profile(self, profile: str) -> List[str]:
        """
        List all job IDs executed with a specific proxy profile.
        
        Args:
            profile: Canonical proxy profile ID
        
        Returns:
            List of job IDs (may be empty, never None)
        
        Raises:
            FabricValidationError: If profile is empty or None
        """
        if not profile:
            raise FabricValidationError("profile cannot be empty or None")
        
        jobs = self._index.get_jobs_by_profile(profile)
        # Return sorted for deterministic output
        return sorted([job.job_id for job in jobs])
    
    def list_jobs_by_engine(self, engine: str) -> List[str]:
        """
        List all job IDs executed with a specific engine.
        
        Args:
            engine: Engine name ('ffmpeg' or 'resolve')
        
        Returns:
            List of job IDs (may be empty, never None)
        
        Raises:
            FabricValidationError: If engine is not recognized
        """
        if engine not in self.VALID_ENGINES:
            raise FabricValidationError(
                f"Unknown engine '{engine}'. Valid engines: {sorted(self.VALID_ENGINES)}"
            )
        
        jobs = self._index.get_jobs_by_engine(engine)
        # Return sorted for deterministic output
        return sorted([job.job_id for job in jobs])
    
    def job_outcome_summary(self) -> Dict[str, int]:
        """
        Get summary of job outcomes.
        
        Counts jobs by final status.
        
        Returns:
            Dict with keys 'completed', 'failed', 'validation_failed'.
            All keys always present with counts >= 0.
            Never returns None.
        
        Note:
            'validation_failed' counts jobs with final_status='PARTIAL'
            (jobs that failed validation before execution could complete).
        """
        completed = len(self._index.get_jobs_by_status("COMPLETED"))
        failed = len(self._index.get_jobs_by_status("FAILED"))
        validation_failed = len(self._index.get_jobs_by_status("PARTIAL"))
        
        return {
            "completed": completed,
            "failed": failed,
            "validation_failed": validation_failed,
        }
    
    # =========================================================================
    # D. Determinism Checks
    # =========================================================================
    
    def detect_non_deterministic_results(self) -> List[str]:
        """
        Detect jobs with potentially non-deterministic results.
        
        A job is flagged if:
        - Same fingerprint
        - Same canonical proxy profile
        - Different final_status OR different outcome metadata
        
        This is a DETECTION tool, not an assertion. It surfaces anomalies
        for human review. Humans decide what to do with the information.
        
        Returns:
            List of job IDs that show non-deterministic behavior.
            May be empty, never None. Sorted for deterministic output.
        
        Note:
            Outcome metadata compared: final_status, failed_clips, completed_clips.
            Other fields like timestamps are NOT compared (expected to differ).
        """
        # Group jobs by (fingerprint, profile)
        grouped: Dict[Tuple[Optional[str], Optional[str]], List[IngestedJob]] = defaultdict(list)
        
        all_jobs = self._index.get_all_jobs()
        for job in all_jobs:
            # Only consider jobs with fingerprints (successful or partially successful)
            if job.fingerprint:
                key = (job.fingerprint, job.canonical_proxy_profile)
                grouped[key].append(job)
        
        non_deterministic_job_ids: Set[str] = set()
        
        for (fingerprint, profile), jobs in grouped.items():
            if len(jobs) < 2:
                continue  # Need at least 2 jobs to compare
            
            # Compare outcome metadata
            reference_job = jobs[0]
            reference_outcome = (
                reference_job.final_status,
                reference_job.completed_clips,
                reference_job.failed_clips,
            )
            
            for other_job in jobs[1:]:
                other_outcome = (
                    other_job.final_status,
                    other_job.completed_clips,
                    other_job.failed_clips,
                )
                
                if reference_outcome != other_outcome:
                    # Both jobs show non-deterministic behavior
                    non_deterministic_job_ids.add(reference_job.job_id)
                    non_deterministic_job_ids.add(other_job.job_id)
        
        return sorted(non_deterministic_job_ids)
    
    # =========================================================================
    # Utility Methods
    # =========================================================================
    
    def get_all_engines(self) -> List[str]:
        """
        Get list of all engines that have been used.
        
        Returns:
            Sorted list of engine names observed in jobs.
        """
        all_jobs = self._index.get_all_jobs()
        engines: Set[str] = set()
        
        for job in all_jobs:
            if job.engine_used:
                engines.add(job.engine_used)
        
        return sorted(engines)
    
    def get_all_profiles(self) -> List[str]:
        """
        Get list of all proxy profiles that have been used.
        
        Returns:
            Sorted list of profile names observed in jobs.
        """
        all_jobs = self._index.get_all_jobs()
        profiles: Set[str] = set()
        
        for job in all_jobs:
            if job.canonical_proxy_profile:
                profiles.add(job.canonical_proxy_profile)
        
        return sorted(profiles)


# =============================================================================
# Factory Function
# =============================================================================

def create_intelligence(index: FabricIndex) -> FabricIntelligence:
    """
    Factory function for creating FabricIntelligence.
    
    Args:
        index: FabricIndex to query
    
    Returns:
        Initialized FabricIntelligence instance
    
    Raises:
        FabricError: If index is None
    """
    return FabricIntelligence(index)


# =============================================================================
# FORBIDDEN
# =============================================================================
# DO NOT ADD:
# - recommend_retry(job_id) -> bool
# - suggest_profile(source) -> str
# - estimate_success_rate() -> float
# - predict_failure(job) -> bool
# - auto_cleanup_old_jobs()
# - schedule_retry(job_id)
# - infer_failure_cause(job) -> str
# - score_job_health(job) -> float
