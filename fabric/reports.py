"""
Fabric Reports - Read-only narrative summaries from Fabric Intelligence.

PHASE-2: NARRATIVE REPORTS (READ-ONLY)

This module provides human-readable summaries derived ONLY from
FabricIntelligence. It does not access raw execution data, index
internals, or persistence layers directly.

ABSOLUTE CONSTRAINTS:
---------------------
❌ NO writes to any storage
❌ NO retries or orchestration
❌ NO state caching between calls
❌ NO mutation of intelligence or persistence
❌ NO conditional logic that changes meaning
❌ NO interpretation words ("healthy", "bad", "recommend")
❌ NO triggering of workflows
❌ NO inspection of raw Proxx internals
✅ READ-ONLY derived from FabricIntelligence only
✅ Deterministic outputs (same data → same output)
✅ Explicit sorting (count desc, then name asc)
✅ Loud failures with clear messages

DESIGN PHILOSOPHY:
------------------
Fabric DESCRIBES REALITY. It does not suggest changes to it.
Reports present FACTS. Humans decide what they mean.

This module summarizes facts only.
"""

from collections import defaultdict
from typing import Any, Dict, List

from fabric.intelligence import FabricIntelligence, FabricError


class FabricReportError(FabricError):
    """Raised when report generation fails."""
    pass


class FabricReports:
    """
    Read-only reporting layer for Fabric.
    
    Produces human-readable summaries from FabricIntelligence.
    All methods are pure queries - no mutations, no side effects.
    
    FORBIDDEN:
    ----------
    - Writes of any kind
    - Caching between calls
    - Recommendations or suggestions
    - Interpretation or judgment
    - Triggering any workflows
    """
    
    def __init__(self, intelligence: FabricIntelligence):
        """
        Initialize reports layer.
        
        Args:
            intelligence: FabricIntelligence to query. Must be initialized.
        
        Raises:
            FabricReportError: If intelligence is None
        """
        if intelligence is None:
            raise FabricReportError(
                "FabricIntelligence is required - cannot generate reports without intelligence"
            )
        self._intelligence = intelligence
    
    # =========================================================================
    # A. Execution Summary
    # =========================================================================
    
    def execution_summary(self) -> Dict[str, int]:
        """
        Summary of job execution outcomes.
        
        Derived ONLY from job_outcome_summary().
        
        Returns:
            {
                "total_jobs": int,
                "completed": int,
                "failed": int,
                "validation_failed": int
            }
            
            All keys always present with counts >= 0.
            Never returns None.
        
        Raises:
            FabricReportError: If intelligence query fails
        """
        try:
            outcome = self._intelligence.job_outcome_summary()
        except FabricError as e:
            raise FabricReportError(f"Failed to query job outcomes: {e}") from e
        
        completed = outcome.get("completed", 0)
        failed = outcome.get("failed", 0)
        validation_failed = outcome.get("validation_failed", 0)
        
        return {
            "total_jobs": completed + failed + validation_failed,
            "completed": completed,
            "failed": failed,
            "validation_failed": validation_failed,
        }
    
    # =========================================================================
    # B. Failure Summary
    # =========================================================================
    
    def failure_summary(self) -> Dict[str, Any]:
        """
        Summary of failures grouped by engine and reason.
        
        Returns:
            {
                "by_engine": {
                    "ffmpeg": { "reason": count, ... },
                    "resolve": { "reason": count, ... }
                },
                "top_failure_reasons": ["reason1", "reason2", ...]
            }
            
            - by_engine: Failure reason counts per engine
            - top_failure_reasons: All reasons sorted by count desc, then name asc
            
            No ranking heuristics. Sorting is deterministic.
            Never returns None.
        
        Raises:
            FabricReportError: If intelligence query fails
        """
        try:
            engines = self._intelligence.get_all_engines()
            valid_engines = self._intelligence.VALID_ENGINES
        except FabricError as e:
            raise FabricReportError(f"Failed to query engines: {e}") from e
        
        by_engine: Dict[str, Dict[str, int]] = {}
        all_reasons: Dict[str, int] = defaultdict(int)
        
        # Query failures for each valid engine
        for engine in sorted(valid_engines):
            try:
                engine_failures = self._intelligence.list_failures_by_engine(engine)
            except FabricError as e:
                raise FabricReportError(
                    f"Failed to query failures for engine '{engine}': {e}"
                ) from e
            
            by_engine[engine] = engine_failures
            
            # Aggregate all reasons
            for reason, count in engine_failures.items():
                all_reasons[reason] += count
        
        # Sort top reasons: count desc, then name asc (deterministic)
        top_failure_reasons = sorted(
            all_reasons.keys(),
            key=lambda r: (-all_reasons[r], r)
        )
        
        return {
            "by_engine": by_engine,
            "top_failure_reasons": top_failure_reasons,
        }
    
    # =========================================================================
    # C. Engine Health Report
    # =========================================================================
    
    def engine_health_report(self) -> Dict[str, Dict[str, Any]]:
        """
        Job counts and failure rates per engine.
        
        Returns:
            {
                "ffmpeg": {
                    "jobs": int,
                    "failures": int,
                    "failure_rate": float
                },
                "resolve": {
                    "jobs": int,
                    "failures": int,
                    "failure_rate": float
                }
            }
            
            - jobs: Total jobs executed with this engine
            - failures: Number of failed/partial jobs
            - failure_rate: failures / jobs (0.0 if no jobs)
            
            No thresholds. No judgement. Numbers only.
            Never returns None.
        
        Raises:
            FabricReportError: If intelligence query fails
        """
        try:
            valid_engines = self._intelligence.VALID_ENGINES
        except AttributeError:
            raise FabricReportError("Intelligence does not expose VALID_ENGINES")
        
        result: Dict[str, Dict[str, Any]] = {}
        
        for engine in sorted(valid_engines):
            try:
                job_ids = self._intelligence.list_jobs_by_engine(engine)
                engine_failures = self._intelligence.list_failures_by_engine(engine)
            except FabricError as e:
                raise FabricReportError(
                    f"Failed to query engine '{engine}': {e}"
                ) from e
            
            total_jobs = len(job_ids)
            failure_count = sum(engine_failures.values())
            failure_rate = failure_count / total_jobs if total_jobs > 0 else 0.0
            
            result[engine] = {
                "jobs": total_jobs,
                "failures": failure_count,
                "failure_rate": failure_rate,
            }
        
        return result
    
    # =========================================================================
    # D. Proxy Profile Stability Report
    # =========================================================================
    
    def proxy_profile_stability_report(self) -> Dict[str, Dict[str, Any]]:
        """
        Job counts and failure rates per proxy profile.
        
        Returns:
            {
                "profile_name": {
                    "jobs": int,
                    "failure_rate": float
                },
                ...
            }
            
            - jobs: Total jobs executed with this profile
            - failure_rate: Ratio of failed/partial jobs (0.0 to 1.0)
            
            Profiles with zero jobs are not included.
            Never returns None.
        
        Raises:
            FabricReportError: If intelligence query fails
        """
        try:
            profiles = self._intelligence.get_all_profiles()
            failure_rates = self._intelligence.failure_rate_by_proxy_profile()
        except FabricError as e:
            raise FabricReportError(f"Failed to query profiles: {e}") from e
        
        result: Dict[str, Dict[str, Any]] = {}
        
        for profile in sorted(profiles):
            try:
                job_ids = self._intelligence.list_jobs_by_proxy_profile(profile)
            except FabricError as e:
                raise FabricReportError(
                    f"Failed to query profile '{profile}': {e}"
                ) from e
            
            job_count = len(job_ids)
            if job_count == 0:
                continue
            
            result[profile] = {
                "jobs": job_count,
                "failure_rate": failure_rates.get(profile, 0.0),
            }
        
        return result
    
    # =========================================================================
    # E. Determinism Report
    # =========================================================================
    
    def determinism_report(self) -> Dict[str, Any]:
        """
        Report of jobs with non-deterministic behavior.
        
        Direct passthrough from detect_non_deterministic_results().
        
        Returns:
            {
                "non_deterministic_jobs": [job_id, ...],
                "count": int
            }
            
            - non_deterministic_jobs: Sorted list of flagged job IDs
            - count: Number of flagged jobs
            
            Never returns None.
        
        Raises:
            FabricReportError: If intelligence query fails
        """
        try:
            job_ids = self._intelligence.detect_non_deterministic_results()
        except FabricError as e:
            raise FabricReportError(
                f"Failed to detect non-deterministic results: {e}"
            ) from e
        
        return {
            "non_deterministic_jobs": job_ids,
            "count": len(job_ids),
        }


# =============================================================================
# Factory Function
# =============================================================================

def create_reports(intelligence: FabricIntelligence) -> FabricReports:
    """
    Factory function for creating FabricReports.
    
    Args:
        intelligence: FabricIntelligence to query
    
    Returns:
        Initialized FabricReports instance
    
    Raises:
        FabricReportError: If intelligence is None
    """
    return FabricReports(intelligence)


# =============================================================================
# FORBIDDEN
# =============================================================================
# DO NOT ADD:
# - get_health_score() -> float
# - get_recommended_profile() -> str
# - should_retry(job_id) -> bool
# - predict_next_failure() -> str
# - suggest_improvements() -> List[str]
# - auto_generate_insights()
# - trend_analysis()
# - risk_assessment()
# - anomaly_detection()  (detection is ok, assessment is not)

