"""
Fabric Reports Tests - Phase-2 Read-Only Narrative Reports

THESE TESTS ENFORCE PHASE-2 REPORT LAYER CONSTRAINTS.

Test Coverage:
--------------
1. Deterministic output ordering
2. Empty database behavior
3. Correct aggregation math
4. Failure reason stability
5. Engine separation
6. Zero mutation guarantees
7. Return type correctness
8. Factory function behavior

Minimum 25 tests required.

Invariants Tested:
------------------
- All methods return deterministic results
- All methods work with empty index
- All methods fail loudly on invalid input
- No mutations occur
- Results are stable across calls
- Return types match specification
"""

import pytest
from datetime import datetime, timezone

from fabric.models import IngestedJob
from fabric.index import FabricIndex
from fabric.intelligence import FabricIntelligence, FabricError
from fabric.reports import FabricReports, FabricReportError, create_reports


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
    
    # Job 4: Partial (validation failed) - FFmpeg
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
    
    # Job 8: Another FFmpeg failure with same reason as job2
    job8 = IngestedJob(
        job_id="job-008",
        final_status="FAILED",
        started_at=datetime(2024, 1, 1, 15, 0, 0, tzinfo=timezone.utc),
        canonical_proxy_profile="standard_proxy_ffmpeg",
        fingerprint=None,
        engine_used="ffmpeg",
        validation_error="FFmpeg exited with code 1",
        total_clips=1,
        completed_clips=0,
        failed_clips=1,
    )
    
    # Add all jobs
    for job in [job1, job2, job3, job4, job5, job6, job7, job8]:
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


@pytest.fixture
def reports(intelligence):
    """Create reports layer with populated intelligence."""
    return FabricReports(intelligence)


@pytest.fixture
def empty_reports(empty_intelligence):
    """Create reports layer with empty intelligence."""
    return FabricReports(empty_intelligence)


# =============================================================================
# A. Factory and Initialization Tests
# =============================================================================

class TestFactoryAndInitialization:
    """Tests for factory function and initialization."""
    
    def test_create_reports_with_valid_intelligence(self, intelligence):
        """Factory function creates valid instance."""
        rpts = create_reports(intelligence)
        assert isinstance(rpts, FabricReports)
    
    def test_create_reports_with_none_intelligence_fails(self):
        """Factory function fails loudly with None intelligence."""
        with pytest.raises(FabricReportError) as exc_info:
            create_reports(None)
        assert "required" in str(exc_info.value).lower()
    
    def test_direct_init_with_none_intelligence_fails(self):
        """Direct initialization fails loudly with None intelligence."""
        with pytest.raises(FabricReportError):
            FabricReports(None)
    
    def test_error_message_is_clear(self):
        """Error message clearly states what's wrong."""
        with pytest.raises(FabricReportError) as exc_info:
            FabricReports(None)
        assert "intelligence" in str(exc_info.value).lower()


# =============================================================================
# B. Execution Summary Tests
# =============================================================================

class TestExecutionSummary:
    """Tests for execution_summary()."""
    
    def test_returns_all_required_keys(self, reports):
        """Summary always contains all required keys."""
        result = reports.execution_summary()
        assert "total_jobs" in result
        assert "completed" in result
        assert "failed" in result
        assert "validation_failed" in result
    
    def test_total_jobs_is_sum_of_statuses(self, reports):
        """Total jobs equals completed + failed + validation_failed."""
        result = reports.execution_summary()
        expected_total = result["completed"] + result["failed"] + result["validation_failed"]
        assert result["total_jobs"] == expected_total
    
    def test_correct_counts_for_populated_data(self, reports):
        """Counts match expected values for test data."""
        result = reports.execution_summary()
        # From fixture: job1,3,5,6 completed (4), job2,7,8 failed (3), job4 partial (1)
        assert result["completed"] == 4
        assert result["failed"] == 3
        assert result["validation_failed"] == 1
        assert result["total_jobs"] == 8
    
    def test_empty_database_returns_zeros(self, empty_reports):
        """Empty database returns all zeros."""
        result = empty_reports.execution_summary()
        assert result["total_jobs"] == 0
        assert result["completed"] == 0
        assert result["failed"] == 0
        assert result["validation_failed"] == 0
    
    def test_deterministic_output(self, reports):
        """Same data produces same output across calls."""
        result1 = reports.execution_summary()
        result2 = reports.execution_summary()
        assert result1 == result2
    
    def test_return_type_is_dict(self, reports):
        """Return type is dict, not None."""
        result = reports.execution_summary()
        assert isinstance(result, dict)
        assert result is not None


# =============================================================================
# C. Failure Summary Tests
# =============================================================================

class TestFailureSummary:
    """Tests for failure_summary()."""
    
    def test_returns_required_structure(self, reports):
        """Summary contains by_engine and top_failure_reasons."""
        result = reports.failure_summary()
        assert "by_engine" in result
        assert "top_failure_reasons" in result
    
    def test_by_engine_contains_all_valid_engines(self, reports):
        """by_engine has entries for all valid engines."""
        result = reports.failure_summary()
        assert "ffmpeg" in result["by_engine"]
        assert "resolve" in result["by_engine"]
    
    def test_failure_reasons_counted_correctly_for_ffmpeg(self, reports):
        """FFmpeg failure reasons counted correctly."""
        result = reports.failure_summary()
        ffmpeg_failures = result["by_engine"]["ffmpeg"]
        # job2 and job8 have same error, job4 has different error
        assert ffmpeg_failures.get("FFmpeg exited with code 1", 0) == 2
        assert ffmpeg_failures.get("Output directory not writable", 0) == 1
    
    def test_failure_reasons_counted_correctly_for_resolve(self, reports):
        """Resolve failure reasons counted correctly."""
        result = reports.failure_summary()
        resolve_failures = result["by_engine"]["resolve"]
        assert resolve_failures.get("Resolve project not found", 0) == 1
    
    def test_top_failure_reasons_sorted_by_count_desc(self, reports):
        """Top failure reasons sorted by count descending, then name."""
        result = reports.failure_summary()
        reasons = result["top_failure_reasons"]
        # "FFmpeg exited with code 1" has count 2, others have count 1
        assert reasons[0] == "FFmpeg exited with code 1"
    
    def test_top_failure_reasons_secondary_sort_by_name(self, reports):
        """Reasons with same count sorted alphabetically."""
        result = reports.failure_summary()
        reasons = result["top_failure_reasons"]
        # Reasons with count 1: "Output directory not writable", "Resolve project not found"
        # Alphabetically: "Output directory not writable" < "Resolve project not found"
        count_one_reasons = reasons[1:]  # Skip first (count 2)
        assert count_one_reasons == sorted(count_one_reasons)
    
    def test_empty_database_returns_empty_failures(self, empty_reports):
        """Empty database returns empty failure lists."""
        result = empty_reports.failure_summary()
        assert result["by_engine"]["ffmpeg"] == {}
        assert result["by_engine"]["resolve"] == {}
        assert result["top_failure_reasons"] == []
    
    def test_deterministic_output(self, reports):
        """Same data produces same output across calls."""
        result1 = reports.failure_summary()
        result2 = reports.failure_summary()
        assert result1 == result2
    
    def test_return_type_is_dict(self, reports):
        """Return type is dict, not None."""
        result = reports.failure_summary()
        assert isinstance(result, dict)
        assert result is not None


# =============================================================================
# D. Engine Health Report Tests
# =============================================================================

class TestEngineHealthReport:
    """Tests for engine_health_report()."""
    
    def test_returns_all_valid_engines(self, reports):
        """Report contains entries for all valid engines."""
        result = reports.engine_health_report()
        assert "ffmpeg" in result
        assert "resolve" in result
    
    def test_engine_entry_has_required_keys(self, reports):
        """Each engine entry has jobs, failures, failure_rate."""
        result = reports.engine_health_report()
        for engine in ["ffmpeg", "resolve"]:
            assert "jobs" in result[engine]
            assert "failures" in result[engine]
            assert "failure_rate" in result[engine]
    
    def test_ffmpeg_counts_correct(self, reports):
        """FFmpeg job and failure counts are correct."""
        result = reports.engine_health_report()
        # job1,2,4,5,6,8 are ffmpeg (6 jobs), job2,4,8 failed (3 failures)
        assert result["ffmpeg"]["jobs"] == 6
        assert result["ffmpeg"]["failures"] == 3
    
    def test_resolve_counts_correct(self, reports):
        """Resolve job and failure counts are correct."""
        result = reports.engine_health_report()
        # job3,7 are resolve (2 jobs), job7 failed (1 failure)
        assert result["resolve"]["jobs"] == 2
        assert result["resolve"]["failures"] == 1
    
    def test_failure_rate_calculation(self, reports):
        """Failure rate calculated correctly."""
        result = reports.engine_health_report()
        # FFmpeg: 3/6 = 0.5
        assert result["ffmpeg"]["failure_rate"] == 0.5
        # Resolve: 1/2 = 0.5
        assert result["resolve"]["failure_rate"] == 0.5
    
    def test_empty_database_returns_zero_jobs(self, empty_reports):
        """Empty database returns zero jobs for all engines."""
        result = empty_reports.engine_health_report()
        assert result["ffmpeg"]["jobs"] == 0
        assert result["resolve"]["jobs"] == 0
    
    def test_empty_database_failure_rate_is_zero(self, empty_reports):
        """Empty database has zero failure rate (no division by zero)."""
        result = empty_reports.engine_health_report()
        assert result["ffmpeg"]["failure_rate"] == 0.0
        assert result["resolve"]["failure_rate"] == 0.0
    
    def test_deterministic_output(self, reports):
        """Same data produces same output across calls."""
        result1 = reports.engine_health_report()
        result2 = reports.engine_health_report()
        assert result1 == result2
    
    def test_no_interpretation_words_in_keys(self, reports):
        """Keys do not contain interpretation words."""
        result = reports.engine_health_report()
        forbidden = ["healthy", "bad", "recommend", "good", "poor", "risk"]
        for engine_data in result.values():
            for key in engine_data.keys():
                for word in forbidden:
                    assert word not in key.lower()


# =============================================================================
# E. Proxy Profile Stability Report Tests
# =============================================================================

class TestProxyProfileStabilityReport:
    """Tests for proxy_profile_stability_report()."""
    
    def test_returns_all_profiles_with_jobs(self, reports):
        """Report contains all profiles that have jobs."""
        result = reports.proxy_profile_stability_report()
        assert "standard_proxy_ffmpeg" in result
        assert "resolve_prores" in result
    
    def test_profile_entry_has_required_keys(self, reports):
        """Each profile entry has jobs and failure_rate."""
        result = reports.proxy_profile_stability_report()
        for profile_data in result.values():
            assert "jobs" in profile_data
            assert "failure_rate" in profile_data
    
    def test_standard_proxy_ffmpeg_counts_correct(self, reports):
        """standard_proxy_ffmpeg job count is correct."""
        result = reports.proxy_profile_stability_report()
        # job1,2,4,5,6,8 use standard_proxy_ffmpeg (6 jobs)
        assert result["standard_proxy_ffmpeg"]["jobs"] == 6
    
    def test_resolve_prores_counts_correct(self, reports):
        """resolve_prores job count is correct."""
        result = reports.proxy_profile_stability_report()
        # job3,7 use resolve_prores (2 jobs)
        assert result["resolve_prores"]["jobs"] == 2
    
    def test_failure_rate_matches_intelligence(self, reports, intelligence):
        """Failure rates match what intelligence returns."""
        result = reports.proxy_profile_stability_report()
        intel_rates = intelligence.failure_rate_by_proxy_profile()
        
        for profile, data in result.items():
            assert data["failure_rate"] == intel_rates.get(profile, 0.0)
    
    def test_empty_database_returns_empty_dict(self, empty_reports):
        """Empty database returns empty dict."""
        result = empty_reports.proxy_profile_stability_report()
        assert result == {}
    
    def test_deterministic_output(self, reports):
        """Same data produces same output across calls."""
        result1 = reports.proxy_profile_stability_report()
        result2 = reports.proxy_profile_stability_report()
        assert result1 == result2
    
    def test_profiles_sorted_deterministically(self, reports):
        """Profile keys are in deterministic order."""
        result = reports.proxy_profile_stability_report()
        keys = list(result.keys())
        assert keys == sorted(keys)


# =============================================================================
# F. Determinism Report Tests
# =============================================================================

class TestDeterminismReport:
    """Tests for determinism_report()."""
    
    def test_returns_required_structure(self, reports):
        """Report contains non_deterministic_jobs and count."""
        result = reports.determinism_report()
        assert "non_deterministic_jobs" in result
        assert "count" in result
    
    def test_count_matches_list_length(self, reports):
        """Count equals length of job ID list."""
        result = reports.determinism_report()
        assert result["count"] == len(result["non_deterministic_jobs"])
    
    def test_detects_non_deterministic_jobs(self, reports):
        """Correctly detects jobs with non-deterministic outcomes."""
        result = reports.determinism_report()
        # job1, job5, job6 have same fingerprint and profile but job6 has different outcome
        non_det_jobs = result["non_deterministic_jobs"]
        assert "job-001" in non_det_jobs
        assert "job-006" in non_det_jobs
    
    def test_deterministic_jobs_not_flagged(self, reports):
        """Deterministic jobs are not flagged."""
        result = reports.determinism_report()
        # job3 has unique fingerprint, should not be flagged
        assert "job-003" not in result["non_deterministic_jobs"]
    
    def test_job_ids_sorted(self, reports):
        """Job IDs are sorted for deterministic output."""
        result = reports.determinism_report()
        job_ids = result["non_deterministic_jobs"]
        assert job_ids == sorted(job_ids)
    
    def test_empty_database_returns_empty_list(self, empty_reports):
        """Empty database returns no non-deterministic jobs."""
        result = empty_reports.determinism_report()
        assert result["non_deterministic_jobs"] == []
        assert result["count"] == 0
    
    def test_deterministic_output(self, reports):
        """Same data produces same output across calls."""
        result1 = reports.determinism_report()
        result2 = reports.determinism_report()
        assert result1 == result2
    
    def test_passthrough_from_intelligence(self, reports, intelligence):
        """Result matches intelligence.detect_non_deterministic_results()."""
        result = reports.determinism_report()
        intel_result = intelligence.detect_non_deterministic_results()
        assert result["non_deterministic_jobs"] == intel_result


# =============================================================================
# G. No Mutation Guarantee Tests
# =============================================================================

class TestNoMutationGuarantees:
    """Tests verifying reports do not mutate any state."""
    
    def test_execution_summary_does_not_mutate_intelligence(self, reports, intelligence):
        """execution_summary() does not change intelligence state."""
        before = intelligence.job_outcome_summary()
        reports.execution_summary()
        after = intelligence.job_outcome_summary()
        assert before == after
    
    def test_failure_summary_does_not_mutate_intelligence(self, reports, intelligence):
        """failure_summary() does not change intelligence state."""
        before_ffmpeg = intelligence.list_failures_by_engine("ffmpeg")
        before_resolve = intelligence.list_failures_by_engine("resolve")
        reports.failure_summary()
        after_ffmpeg = intelligence.list_failures_by_engine("ffmpeg")
        after_resolve = intelligence.list_failures_by_engine("resolve")
        assert before_ffmpeg == after_ffmpeg
        assert before_resolve == after_resolve
    
    def test_engine_health_does_not_mutate_intelligence(self, reports, intelligence):
        """engine_health_report() does not change intelligence state."""
        before = intelligence.get_all_engines()
        reports.engine_health_report()
        after = intelligence.get_all_engines()
        assert before == after
    
    def test_profile_stability_does_not_mutate_intelligence(self, reports, intelligence):
        """proxy_profile_stability_report() does not change intelligence state."""
        before = intelligence.get_all_profiles()
        reports.proxy_profile_stability_report()
        after = intelligence.get_all_profiles()
        assert before == after
    
    def test_determinism_does_not_mutate_intelligence(self, reports, intelligence):
        """determinism_report() does not change intelligence state."""
        before = intelligence.detect_non_deterministic_results()
        reports.determinism_report()
        after = intelligence.detect_non_deterministic_results()
        assert before == after
    
    def test_multiple_calls_produce_same_results(self, reports):
        """Multiple report calls produce identical results."""
        exec1 = reports.execution_summary()
        fail1 = reports.failure_summary()
        health1 = reports.engine_health_report()
        profile1 = reports.proxy_profile_stability_report()
        det1 = reports.determinism_report()
        
        exec2 = reports.execution_summary()
        fail2 = reports.failure_summary()
        health2 = reports.engine_health_report()
        profile2 = reports.proxy_profile_stability_report()
        det2 = reports.determinism_report()
        
        assert exec1 == exec2
        assert fail1 == fail2
        assert health1 == health2
        assert profile1 == profile2
        assert det1 == det2


# =============================================================================
# H. Return Type Correctness Tests
# =============================================================================

class TestReturnTypeCorrectness:
    """Tests verifying correct return types per specification."""
    
    def test_execution_summary_types(self, reports):
        """execution_summary() returns correct types."""
        result = reports.execution_summary()
        assert isinstance(result["total_jobs"], int)
        assert isinstance(result["completed"], int)
        assert isinstance(result["failed"], int)
        assert isinstance(result["validation_failed"], int)
    
    def test_failure_summary_types(self, reports):
        """failure_summary() returns correct types."""
        result = reports.failure_summary()
        assert isinstance(result["by_engine"], dict)
        assert isinstance(result["top_failure_reasons"], list)
        for engine, failures in result["by_engine"].items():
            assert isinstance(engine, str)
            assert isinstance(failures, dict)
            for reason, count in failures.items():
                assert isinstance(reason, str)
                assert isinstance(count, int)
    
    def test_engine_health_types(self, reports):
        """engine_health_report() returns correct types."""
        result = reports.engine_health_report()
        for engine, data in result.items():
            assert isinstance(engine, str)
            assert isinstance(data["jobs"], int)
            assert isinstance(data["failures"], int)
            assert isinstance(data["failure_rate"], float)
    
    def test_profile_stability_types(self, reports):
        """proxy_profile_stability_report() returns correct types."""
        result = reports.proxy_profile_stability_report()
        for profile, data in result.items():
            assert isinstance(profile, str)
            assert isinstance(data["jobs"], int)
            assert isinstance(data["failure_rate"], float)
    
    def test_determinism_report_types(self, reports):
        """determinism_report() returns correct types."""
        result = reports.determinism_report()
        assert isinstance(result["non_deterministic_jobs"], list)
        assert isinstance(result["count"], int)
        for job_id in result["non_deterministic_jobs"]:
            assert isinstance(job_id, str)

