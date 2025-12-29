"""
Fabric Intelligence Tests - Phase-2 Read-Only Intelligence Layer

THESE TESTS ENFORCE PHASE-2 INTELLIGENCE LAYER CONSTRAINTS.

Test Coverage:
--------------
1. Read-only behavior (no writes)
2. Determinism of outputs
3. Correct aggregation math
4. Stable ordering where specified
5. Empty database behavior
6. Invalid query arguments fail loudly

Minimum 20 tests required.

Invariants Tested:
------------------
- All methods return deterministic results
- All methods work with empty index
- All methods fail loudly on invalid input
- No mutations occur
- Results are stable across calls
"""

import pytest
from datetime import datetime, timezone
from typing import List

from fabric.models import IngestedJob, IngestedOutput
from fabric.index import FabricIndex
from fabric.intelligence import (
    FabricIntelligence,
    FabricError,
    FabricValidationError,
    create_intelligence,
)


# =============================================================================
# Test Fixtures
# =============================================================================

@pytest.fixture
def empty_index():
    """Create an empty in-memory index."""
    return FabricIndex()


@pytest.fixture
def populated_index():
    """Create an index with sample jobs for testing."""
    index = FabricIndex()
    
    # Job 1: Completed successfully with FFmpeg
    job1 = IngestedJob(
        job_id="job-001",
        final_status="COMPLETED",
        started_at=datetime(2024, 1, 1, 10, 0, 0, tzinfo=timezone.utc),
        completed_at=datetime(2024, 1, 1, 10, 5, 0, tzinfo=timezone.utc),
        canonical_proxy_profile="standard_proxy_ffmpeg",
        fingerprint="fp-abc123",
        engine_used="ffmpeg",
        total_clips=2,
        completed_clips=2,
        failed_clips=0,
    )
    
    # Job 2: Failed with FFmpeg
    job2 = IngestedJob(
        job_id="job-002",
        final_status="FAILED",
        started_at=datetime(2024, 1, 1, 11, 0, 0, tzinfo=timezone.utc),
        completed_at=datetime(2024, 1, 1, 11, 2, 0, tzinfo=timezone.utc),
        canonical_proxy_profile="standard_proxy_ffmpeg",
        fingerprint=None,
        engine_used="ffmpeg",
        validation_error="FFmpeg exited with code 1",
        total_clips=1,
        completed_clips=0,
        failed_clips=1,
    )
    
    # Job 3: Completed with Resolve
    job3 = IngestedJob(
        job_id="job-003",
        final_status="COMPLETED",
        started_at=datetime(2024, 1, 1, 12, 0, 0, tzinfo=timezone.utc),
        completed_at=datetime(2024, 1, 1, 12, 10, 0, tzinfo=timezone.utc),
        canonical_proxy_profile="resolve_prores",
        fingerprint="fp-def456",
        engine_used="resolve",
        resolve_preset_used="ProRes 422 Proxy",
        total_clips=3,
        completed_clips=3,
        failed_clips=0,
    )
    
    # Job 4: Partial (validation failed)
    job4 = IngestedJob(
        job_id="job-004",
        final_status="PARTIAL",
        started_at=datetime(2024, 1, 1, 13, 0, 0, tzinfo=timezone.utc),
        canonical_proxy_profile="standard_proxy_ffmpeg",
        fingerprint=None,
        engine_used="ffmpeg",
        validation_stage="validation",
        validation_error="Output directory not writable",
        total_clips=2,
        completed_clips=1,
        failed_clips=1,
    )
    
    # Job 5: Same fingerprint as job1, same profile (deterministic)
    job5 = IngestedJob(
        job_id="job-005",
        final_status="COMPLETED",
        started_at=datetime(2024, 1, 2, 10, 0, 0, tzinfo=timezone.utc),
        completed_at=datetime(2024, 1, 2, 10, 5, 0, tzinfo=timezone.utc),
        canonical_proxy_profile="standard_proxy_ffmpeg",
        fingerprint="fp-abc123",
        engine_used="ffmpeg",
        total_clips=2,
        completed_clips=2,
        failed_clips=0,
    )
    
    # Job 6: Same fingerprint as job1, same profile, but DIFFERENT outcome (non-deterministic!)
    job6 = IngestedJob(
        job_id="job-006",
        final_status="COMPLETED",
        started_at=datetime(2024, 1, 3, 10, 0, 0, tzinfo=timezone.utc),
        completed_at=datetime(2024, 1, 3, 10, 6, 0, tzinfo=timezone.utc),
        canonical_proxy_profile="standard_proxy_ffmpeg",
        fingerprint="fp-abc123",
        engine_used="ffmpeg",
        total_clips=2,
        completed_clips=1,  # Different from job1 and job5!
        failed_clips=1,      # Different from job1 and job5!
    )
    
    # Job 7: Failed with Resolve, different error
    job7 = IngestedJob(
        job_id="job-007",
        final_status="FAILED",
        started_at=datetime(2024, 1, 1, 14, 0, 0, tzinfo=timezone.utc),
        canonical_proxy_profile="resolve_prores",
        fingerprint=None,
        engine_used="resolve",
        validation_error="Resolve project not found",
        total_clips=1,
        completed_clips=0,
        failed_clips=1,
    )
    
    # Add all jobs
    for job in [job1, job2, job3, job4, job5, job6, job7]:
        index.add_job(job)
    
    return index


@pytest.fixture
def intelligence(populated_index):
    """Create intelligence layer with populated index."""
    return FabricIntelligence(populated_index)


@pytest.fixture
def empty_intelligence(empty_index):
    """Create intelligence layer with empty index."""
    return FabricIntelligence(empty_index)


# =============================================================================
# A. Factory and Initialization Tests
# =============================================================================

class TestFactoryAndInitialization:
    """Tests for factory function and initialization."""
    
    def test_create_intelligence_with_valid_index(self, populated_index):
        """Factory function creates valid instance."""
        intel = create_intelligence(populated_index)
        assert isinstance(intel, FabricIntelligence)
    
    def test_create_intelligence_with_none_index_fails(self):
        """Factory function fails loudly with None index."""
        with pytest.raises(FabricError) as exc_info:
            create_intelligence(None)
        assert "required" in str(exc_info.value).lower()
    
    def test_direct_init_with_none_index_fails(self):
        """Direct initialization fails loudly with None index."""
        with pytest.raises(FabricError):
            FabricIntelligence(None)


# =============================================================================
# B. Fingerprint Intelligence Tests
# =============================================================================

class TestFingerprintIntelligence:
    """Tests for fingerprint query methods."""
    
    def test_has_fingerprint_been_seen_true(self, intelligence):
        """Returns True for existing fingerprint."""
        assert intelligence.has_fingerprint_been_seen("fp-abc123") is True
    
    def test_has_fingerprint_been_seen_false(self, intelligence):
        """Returns False for non-existing fingerprint."""
        assert intelligence.has_fingerprint_been_seen("fp-nonexistent") is False
    
    def test_has_fingerprint_been_seen_empty_fails(self, intelligence):
        """Empty fingerprint fails loudly."""
        with pytest.raises(FabricValidationError):
            intelligence.has_fingerprint_been_seen("")
    
    def test_has_fingerprint_been_seen_none_fails(self, intelligence):
        """None fingerprint fails loudly."""
        with pytest.raises(FabricValidationError):
            intelligence.has_fingerprint_been_seen(None)
    
    def test_has_fingerprint_empty_database(self, empty_intelligence):
        """Returns False on empty database."""
        assert empty_intelligence.has_fingerprint_been_seen("any-fp") is False
    
    def test_list_jobs_for_fingerprint_multiple(self, intelligence):
        """Returns all jobs with fingerprint."""
        jobs = intelligence.list_jobs_for_fingerprint("fp-abc123")
        assert len(jobs) == 3
        assert "job-001" in jobs
        assert "job-005" in jobs
        assert "job-006" in jobs
    
    def test_list_jobs_for_fingerprint_single(self, intelligence):
        """Returns single job for unique fingerprint."""
        jobs = intelligence.list_jobs_for_fingerprint("fp-def456")
        assert jobs == ["job-003"]
    
    def test_list_jobs_for_fingerprint_none_found(self, intelligence):
        """Returns empty list for non-existing fingerprint."""
        jobs = intelligence.list_jobs_for_fingerprint("fp-nonexistent")
        assert jobs == []
    
    def test_list_jobs_for_fingerprint_sorted(self, intelligence):
        """Results are sorted for determinism."""
        jobs = intelligence.list_jobs_for_fingerprint("fp-abc123")
        assert jobs == sorted(jobs)
    
    def test_list_jobs_for_fingerprint_empty_fails(self, intelligence):
        """Empty fingerprint fails loudly."""
        with pytest.raises(FabricValidationError):
            intelligence.list_jobs_for_fingerprint("")
    
    def test_list_jobs_for_fingerprint_empty_database(self, empty_intelligence):
        """Returns empty list on empty database."""
        jobs = empty_intelligence.list_jobs_for_fingerprint("any-fp")
        assert jobs == []


# =============================================================================
# C. Failure Intelligence Tests
# =============================================================================

class TestFailureIntelligence:
    """Tests for failure analysis methods."""
    
    def test_list_failures_by_engine_ffmpeg(self, intelligence):
        """Returns failure counts for FFmpeg."""
        failures = intelligence.list_failures_by_engine("ffmpeg")
        assert "FFmpeg exited with code 1" in failures
        assert failures["FFmpeg exited with code 1"] == 1
        assert "Output directory not writable" in failures
        assert failures["Output directory not writable"] == 1
    
    def test_list_failures_by_engine_resolve(self, intelligence):
        """Returns failure counts for Resolve."""
        failures = intelligence.list_failures_by_engine("resolve")
        assert "Resolve project not found" in failures
        assert failures["Resolve project not found"] == 1
    
    def test_list_failures_by_engine_invalid_fails(self, intelligence):
        """Invalid engine fails loudly."""
        with pytest.raises(FabricValidationError) as exc_info:
            intelligence.list_failures_by_engine("invalid_engine")
        assert "Unknown engine" in str(exc_info.value)
    
    def test_list_failures_by_engine_empty_database(self, empty_intelligence):
        """Returns empty dict on empty database."""
        failures = empty_intelligence.list_failures_by_engine("ffmpeg")
        assert failures == {}
    
    def test_list_jobs_failed_for_reason_exact(self, intelligence):
        """Finds jobs with exact reason match."""
        jobs = intelligence.list_jobs_failed_for_reason("FFmpeg exited")
        assert "job-002" in jobs
    
    def test_list_jobs_failed_for_reason_case_insensitive(self, intelligence):
        """Search is case-insensitive."""
        jobs = intelligence.list_jobs_failed_for_reason("ffmpeg EXITED")
        assert "job-002" in jobs
    
    def test_list_jobs_failed_for_reason_partial_match(self, intelligence):
        """Finds jobs with partial reason match."""
        jobs = intelligence.list_jobs_failed_for_reason("not")
        # "not writable" and "not found" both contain "not"
        assert "job-004" in jobs
        assert "job-007" in jobs
    
    def test_list_jobs_failed_for_reason_no_match(self, intelligence):
        """Returns empty list when no match."""
        jobs = intelligence.list_jobs_failed_for_reason("xyz123nonexistent")
        assert jobs == []
    
    def test_list_jobs_failed_for_reason_empty_fails(self, intelligence):
        """Empty reason fails loudly."""
        with pytest.raises(FabricValidationError):
            intelligence.list_jobs_failed_for_reason("")
    
    def test_list_jobs_failed_for_reason_sorted(self, intelligence):
        """Results are sorted for determinism."""
        jobs = intelligence.list_jobs_failed_for_reason("not")
        assert jobs == sorted(jobs)
    
    def test_failure_rate_by_proxy_profile(self, intelligence):
        """Calculates correct failure rates."""
        rates = intelligence.failure_rate_by_proxy_profile()
        
        # standard_proxy_ffmpeg: 5 jobs total (001, 002, 004, 005, 006), 2 failed (job-002, job-004)
        # Rate = 2/5 = 0.4
        assert "standard_proxy_ffmpeg" in rates
        assert abs(rates["standard_proxy_ffmpeg"] - 0.4) < 0.001
        
        # resolve_prores: 2 jobs total, 1 failed (job-007)
        # Rate = 1/2 = 0.5
        assert "resolve_prores" in rates
        assert abs(rates["resolve_prores"] - 0.5) < 0.001
    
    def test_failure_rate_by_proxy_profile_empty_database(self, empty_intelligence):
        """Returns empty dict on empty database."""
        rates = empty_intelligence.failure_rate_by_proxy_profile()
        assert rates == {}


# =============================================================================
# D. Operational History Tests
# =============================================================================

class TestOperationalHistory:
    """Tests for operational history methods."""
    
    def test_list_jobs_by_proxy_profile(self, intelligence):
        """Returns jobs for profile."""
        jobs = intelligence.list_jobs_by_proxy_profile("standard_proxy_ffmpeg")
        assert len(jobs) == 5
        assert "job-001" in jobs
        assert "job-002" in jobs
        assert "job-004" in jobs
        assert "job-005" in jobs
        assert "job-006" in jobs
    
    def test_list_jobs_by_proxy_profile_empty_fails(self, intelligence):
        """Empty profile fails loudly."""
        with pytest.raises(FabricValidationError):
            intelligence.list_jobs_by_proxy_profile("")
    
    def test_list_jobs_by_proxy_profile_none_fails(self, intelligence):
        """None profile fails loudly."""
        with pytest.raises(FabricValidationError):
            intelligence.list_jobs_by_proxy_profile(None)
    
    def test_list_jobs_by_proxy_profile_not_found(self, intelligence):
        """Returns empty list for unknown profile."""
        jobs = intelligence.list_jobs_by_proxy_profile("nonexistent_profile")
        assert jobs == []
    
    def test_list_jobs_by_proxy_profile_sorted(self, intelligence):
        """Results are sorted for determinism."""
        jobs = intelligence.list_jobs_by_proxy_profile("standard_proxy_ffmpeg")
        assert jobs == sorted(jobs)
    
    def test_list_jobs_by_engine_ffmpeg(self, intelligence):
        """Returns jobs for FFmpeg engine."""
        jobs = intelligence.list_jobs_by_engine("ffmpeg")
        assert len(jobs) == 5
        assert "job-001" in jobs
        assert "job-002" in jobs
    
    def test_list_jobs_by_engine_resolve(self, intelligence):
        """Returns jobs for Resolve engine."""
        jobs = intelligence.list_jobs_by_engine("resolve")
        assert len(jobs) == 2
        assert "job-003" in jobs
        assert "job-007" in jobs
    
    def test_list_jobs_by_engine_invalid_fails(self, intelligence):
        """Invalid engine fails loudly."""
        with pytest.raises(FabricValidationError):
            intelligence.list_jobs_by_engine("premiere")
    
    def test_list_jobs_by_engine_sorted(self, intelligence):
        """Results are sorted for determinism."""
        jobs = intelligence.list_jobs_by_engine("ffmpeg")
        assert jobs == sorted(jobs)
    
    def test_job_outcome_summary(self, intelligence):
        """Returns correct outcome counts."""
        summary = intelligence.job_outcome_summary()
        
        assert summary["completed"] == 4  # job-001, job-003, job-005, job-006
        assert summary["failed"] == 2      # job-002, job-007
        assert summary["validation_failed"] == 1  # job-004
    
    def test_job_outcome_summary_all_keys_present(self, intelligence):
        """Summary always has all keys."""
        summary = intelligence.job_outcome_summary()
        assert "completed" in summary
        assert "failed" in summary
        assert "validation_failed" in summary
    
    def test_job_outcome_summary_empty_database(self, empty_intelligence):
        """Returns zeros on empty database."""
        summary = empty_intelligence.job_outcome_summary()
        assert summary == {
            "completed": 0,
            "failed": 0,
            "validation_failed": 0,
        }


# =============================================================================
# E. Determinism Detection Tests
# =============================================================================

class TestDeterminismDetection:
    """Tests for non-determinism detection."""
    
    def test_detect_non_deterministic_results(self, intelligence):
        """Detects jobs with different outcomes for same fingerprint+profile."""
        # job-006 has same fingerprint and profile as job-001 and job-005,
        # but different completed_clips/failed_clips.
        # The algorithm compares each job to the reference (first job).
        # job-001 (reference) and job-006 differ, so both are flagged.
        # job-005 matches job-001 outcome, so only flagged if compared to job-006.
        non_det = intelligence.detect_non_deterministic_results()
        
        # At minimum, job-001 and job-006 should be flagged (they differ)
        assert "job-001" in non_det
        assert "job-006" in non_det
        # job-005 may or may not be in the list depending on comparison order
        # The algorithm flags jobs that differ from the reference
    
    def test_detect_non_deterministic_results_sorted(self, intelligence):
        """Results are sorted for determinism."""
        non_det = intelligence.detect_non_deterministic_results()
        assert non_det == sorted(non_det)
    
    def test_detect_non_deterministic_results_empty_database(self, empty_intelligence):
        """Returns empty list on empty database."""
        non_det = empty_intelligence.detect_non_deterministic_results()
        assert non_det == []
    
    def test_detect_non_deterministic_only_considers_fingerprinted_jobs(self, populated_index):
        """Jobs without fingerprints are not considered."""
        # Add a job without fingerprint
        job_no_fp = IngestedJob(
            job_id="job-no-fp",
            final_status="FAILED",
            started_at=datetime(2024, 1, 1, 10, 0, 0, tzinfo=timezone.utc),
            canonical_proxy_profile="standard_proxy_ffmpeg",
            fingerprint=None,
            engine_used="ffmpeg",
            total_clips=1,
            completed_clips=0,
            failed_clips=1,
        )
        populated_index.add_job(job_no_fp)
        
        intel = FabricIntelligence(populated_index)
        non_det = intel.detect_non_deterministic_results()
        
        # job-no-fp should NOT be in the list
        assert "job-no-fp" not in non_det


# =============================================================================
# F. Utility Method Tests
# =============================================================================

class TestUtilityMethods:
    """Tests for utility methods."""
    
    def test_get_all_engines(self, intelligence):
        """Returns all engines used."""
        engines = intelligence.get_all_engines()
        assert "ffmpeg" in engines
        assert "resolve" in engines
    
    def test_get_all_engines_sorted(self, intelligence):
        """Engines are sorted for determinism."""
        engines = intelligence.get_all_engines()
        assert engines == sorted(engines)
    
    def test_get_all_engines_empty_database(self, empty_intelligence):
        """Returns empty list on empty database."""
        engines = empty_intelligence.get_all_engines()
        assert engines == []
    
    def test_get_all_profiles(self, intelligence):
        """Returns all profiles used."""
        profiles = intelligence.get_all_profiles()
        assert "standard_proxy_ffmpeg" in profiles
        assert "resolve_prores" in profiles
    
    def test_get_all_profiles_sorted(self, intelligence):
        """Profiles are sorted for determinism."""
        profiles = intelligence.get_all_profiles()
        assert profiles == sorted(profiles)
    
    def test_get_all_profiles_empty_database(self, empty_intelligence):
        """Returns empty list on empty database."""
        profiles = empty_intelligence.get_all_profiles()
        assert profiles == []


# =============================================================================
# G. Determinism and Stability Tests
# =============================================================================

class TestDeterminismAndStability:
    """Tests ensuring deterministic, stable outputs."""
    
    def test_multiple_calls_same_result(self, intelligence):
        """Calling same method multiple times yields identical results."""
        result1 = intelligence.list_jobs_for_fingerprint("fp-abc123")
        result2 = intelligence.list_jobs_for_fingerprint("fp-abc123")
        result3 = intelligence.list_jobs_for_fingerprint("fp-abc123")
        
        assert result1 == result2 == result3
    
    def test_summary_stable_across_calls(self, intelligence):
        """Job outcome summary is stable across calls."""
        summary1 = intelligence.job_outcome_summary()
        summary2 = intelligence.job_outcome_summary()
        
        assert summary1 == summary2
    
    def test_failure_rates_stable(self, intelligence):
        """Failure rates are stable across calls."""
        rates1 = intelligence.failure_rate_by_proxy_profile()
        rates2 = intelligence.failure_rate_by_proxy_profile()
        
        assert rates1 == rates2
    
    def test_non_determinism_detection_stable(self, intelligence):
        """Non-determinism detection is stable."""
        detect1 = intelligence.detect_non_deterministic_results()
        detect2 = intelligence.detect_non_deterministic_results()
        
        assert detect1 == detect2


# =============================================================================
# H. Read-Only Behavior Tests
# =============================================================================

class TestReadOnlyBehavior:
    """Tests ensuring read-only behavior."""
    
    def test_no_index_modification_after_fingerprint_query(self, populated_index):
        """Fingerprint queries don't modify index."""
        initial_count = populated_index.count_jobs()
        
        intel = FabricIntelligence(populated_index)
        intel.has_fingerprint_been_seen("fp-abc123")
        intel.list_jobs_for_fingerprint("fp-abc123")
        
        assert populated_index.count_jobs() == initial_count
    
    def test_no_index_modification_after_failure_query(self, populated_index):
        """Failure queries don't modify index."""
        initial_count = populated_index.count_jobs()
        
        intel = FabricIntelligence(populated_index)
        intel.list_failures_by_engine("ffmpeg")
        intel.list_jobs_failed_for_reason("error")
        intel.failure_rate_by_proxy_profile()
        
        assert populated_index.count_jobs() == initial_count
    
    def test_no_index_modification_after_history_query(self, populated_index):
        """History queries don't modify index."""
        initial_count = populated_index.count_jobs()
        
        intel = FabricIntelligence(populated_index)
        intel.list_jobs_by_proxy_profile("standard_proxy_ffmpeg")
        intel.list_jobs_by_engine("ffmpeg")
        intel.job_outcome_summary()
        
        assert populated_index.count_jobs() == initial_count
    
    def test_no_index_modification_after_determinism_check(self, populated_index):
        """Determinism detection doesn't modify index."""
        initial_count = populated_index.count_jobs()
        
        intel = FabricIntelligence(populated_index)
        intel.detect_non_deterministic_results()
        
        assert populated_index.count_jobs() == initial_count


# =============================================================================
# I. Error Handling Tests
# =============================================================================

class TestErrorHandling:
    """Tests for error handling behavior."""
    
    def test_validation_error_has_clear_message(self, intelligence):
        """Validation errors have clear messages."""
        with pytest.raises(FabricValidationError) as exc_info:
            intelligence.list_jobs_by_engine("invalid")
        
        error_msg = str(exc_info.value)
        assert "Unknown engine" in error_msg
        assert "invalid" in error_msg
    
    def test_empty_string_treated_as_invalid(self, intelligence):
        """Empty strings fail validation."""
        with pytest.raises(FabricValidationError):
            intelligence.has_fingerprint_been_seen("")
        
        with pytest.raises(FabricValidationError):
            intelligence.list_jobs_for_fingerprint("")
        
        with pytest.raises(FabricValidationError):
            intelligence.list_jobs_failed_for_reason("")
        
        with pytest.raises(FabricValidationError):
            intelligence.list_jobs_by_proxy_profile("")
    
    def test_none_treated_as_invalid(self, intelligence):
        """None values fail validation."""
        with pytest.raises(FabricValidationError):
            intelligence.has_fingerprint_been_seen(None)
        
        with pytest.raises(FabricValidationError):
            intelligence.list_jobs_by_proxy_profile(None)


# =============================================================================
# J. Return Type Guarantees Tests
# =============================================================================

class TestReturnTypeGuarantees:
    """Tests for return type guarantees."""
    
    def test_lists_never_none(self, empty_intelligence):
        """List-returning methods never return None."""
        assert empty_intelligence.list_jobs_for_fingerprint("x") is not None
        assert empty_intelligence.list_jobs_failed_for_reason("x") is not None
        assert empty_intelligence.list_jobs_by_proxy_profile("x") is not None
        assert empty_intelligence.list_jobs_by_engine("ffmpeg") is not None
        assert empty_intelligence.detect_non_deterministic_results() is not None
        assert empty_intelligence.get_all_engines() is not None
        assert empty_intelligence.get_all_profiles() is not None
    
    def test_dicts_never_none(self, empty_intelligence):
        """Dict-returning methods never return None."""
        assert empty_intelligence.list_failures_by_engine("ffmpeg") is not None
        assert empty_intelligence.failure_rate_by_proxy_profile() is not None
        assert empty_intelligence.job_outcome_summary() is not None
    
    def test_summary_always_has_all_keys(self, empty_intelligence):
        """job_outcome_summary always returns all keys."""
        summary = empty_intelligence.job_outcome_summary()
        assert "completed" in summary
        assert "failed" in summary
        assert "validation_failed" in summary
