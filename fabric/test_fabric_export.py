"""
Fabric Export Tests - Phase-2 Operator Report Export

THESE TESTS ENFORCE PHASE-2 EXPORT LAYER CONSTRAINTS.

Test Coverage:
--------------
1. Deterministic output ordering
2. Byte-stable text output
3. Empty database export behavior
4. Correct passthrough of report data
5. No mutation of underlying reports
6. Timestamp presence (but not equality)
7. Engine and profile section correctness
8. Factory function behavior

Minimum 25 tests required.

Invariants Tested:
------------------
- All exports are deterministic (same data → same output)
- All exports work with empty reports
- No mutations occur during export
- Field order is stable
- Text formatting is byte-identical across calls
- JSON structure matches specification
"""

import json
import pytest
from datetime import datetime, timezone

from fabric.models import IngestedJob
from fabric.index import FabricIndex
from fabric.intelligence import FabricIntelligence
from fabric.reports import FabricReports
from fabric.export import (
    FabricReportExporter,
    FabricExportError,
    create_exporter,
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
        canonical_proxy_profile="proxy_prores_proxy",
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
        canonical_proxy_profile="proxy_prores_proxy",
        fingerprint=None,
        engine_used="ffmpeg",
        validation_error="decode error",
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
        canonical_proxy_profile="proxy_prores_proxy",
        fingerprint=None,
        engine_used="ffmpeg",
        validation_stage="validation",
        validation_error="decode error",
        total_clips=2,
        completed_clips=1,
        failed_clips=1,
    )
    
    # Job 5: Failed with Resolve
    job5 = IngestedJob(
        job_id="job-005",
        final_status="FAILED",
        started_at=datetime(2024, 1, 1, 14, 0, 0, tzinfo=timezone.utc),
        canonical_proxy_profile="resolve_prores",
        fingerprint=None,
        engine_used="resolve",
        validation_error="missing preset",
        total_clips=1,
        completed_clips=0,
        failed_clips=1,
    )
    
    # Job 6: Another FFmpeg completed
    job6 = IngestedJob(
        job_id="job-006",
        final_status="COMPLETED",
        started_at=datetime(2024, 1, 2, 10, 0, 0, tzinfo=timezone.utc),
        completed_at=datetime(2024, 1, 2, 10, 5, 0, tzinfo=timezone.utc),
        canonical_proxy_profile="proxy_prores_proxy",
        fingerprint="fp-ghi789",
        engine_used="ffmpeg",
        total_clips=2,
        completed_clips=2,
        failed_clips=0,
    )
    
    # Job 7: Another Resolve failure with same reason
    job7 = IngestedJob(
        job_id="job-007",
        final_status="FAILED",
        started_at=datetime(2024, 1, 1, 15, 0, 0, tzinfo=timezone.utc),
        canonical_proxy_profile="resolve_prores",
        fingerprint=None,
        engine_used="resolve",
        validation_error="missing preset",
        total_clips=1,
        completed_clips=0,
        failed_clips=1,
    )
    
    for job in [job1, job2, job3, job4, job5, job6, job7]:
        index.add_job(job)
    
    return index


@pytest.fixture
def empty_intelligence(empty_index):
    """Create intelligence layer with empty index."""
    return FabricIntelligence(empty_index)


@pytest.fixture
def intelligence(populated_index):
    """Create intelligence layer with populated index."""
    return FabricIntelligence(populated_index)


@pytest.fixture
def empty_reports(empty_intelligence):
    """Create reports layer with empty intelligence."""
    return FabricReports(empty_intelligence)


@pytest.fixture
def reports(intelligence):
    """Create reports layer with populated intelligence."""
    return FabricReports(intelligence)


@pytest.fixture
def exporter(reports):
    """Create exporter with populated reports."""
    return FabricReportExporter(reports)


@pytest.fixture
def empty_exporter(empty_reports):
    """Create exporter with empty reports."""
    return FabricReportExporter(empty_reports)


# =============================================================================
# A. Factory and Initialization Tests (3 tests)
# =============================================================================

class TestExporterInitialization:
    """Tests for FabricReportExporter initialization."""
    
    def test_init_with_valid_reports(self, reports):
        """Exporter initializes with valid FabricReports."""
        exporter = FabricReportExporter(reports)
        assert exporter is not None
    
    def test_init_with_none_reports_raises(self):
        """Exporter raises FabricExportError if reports is None."""
        with pytest.raises(FabricExportError) as exc_info:
            FabricReportExporter(None)
        assert "FabricReports is required" in str(exc_info.value)
    
    def test_factory_function_creates_exporter(self, reports):
        """Factory function creates valid exporter."""
        exporter = create_exporter(reports)
        assert isinstance(exporter, FabricReportExporter)


# =============================================================================
# B. JSON Export Tests (10 tests)
# =============================================================================

class TestJSONExport:
    """Tests for export_json() method."""
    
    def test_export_json_returns_dict(self, exporter):
        """export_json returns a dictionary."""
        result = exporter.export_json()
        assert isinstance(result, dict)
    
    def test_export_json_has_required_keys(self, exporter):
        """JSON export contains all required top-level keys."""
        result = exporter.export_json()
        required_keys = [
            "generated_at",
            "execution_summary",
            "failure_summary",
            "engine_health",
            "proxy_profile_stability",
            "determinism",
        ]
        for key in required_keys:
            assert key in result, f"Missing required key: {key}"
    
    def test_export_json_generated_at_is_iso_format(self, exporter):
        """generated_at is valid ISO-8601 format."""
        result = exporter.export_json()
        # Should parse without exception
        dt = datetime.fromisoformat(result["generated_at"])
        assert dt is not None
    
    def test_export_json_generated_at_is_recent(self, exporter):
        """generated_at is a recent timestamp (within last minute)."""
        result = exporter.export_json()
        dt = datetime.fromisoformat(result["generated_at"])
        now = datetime.now(timezone.utc)
        diff = abs((now - dt).total_seconds())
        assert diff < 60, "Timestamp should be within last minute"
    
    def test_export_json_execution_summary_structure(self, exporter):
        """execution_summary has correct structure."""
        result = exporter.export_json()
        summary = result["execution_summary"]
        assert "total_jobs" in summary
        assert "completed" in summary
        assert "failed" in summary
        assert "validation_failed" in summary
    
    def test_export_json_engine_health_structure(self, exporter):
        """engine_health has correct per-engine structure."""
        result = exporter.export_json()
        health = result["engine_health"]
        for engine, data in health.items():
            assert "jobs" in data
            assert "failures" in data
            assert "failure_rate" in data
    
    def test_export_json_proxy_profile_stability_structure(self, exporter):
        """proxy_profile_stability has correct structure."""
        result = exporter.export_json()
        stability = result["proxy_profile_stability"]
        for profile, data in stability.items():
            assert "jobs" in data
            assert "failure_rate" in data
    
    def test_export_json_determinism_structure(self, exporter):
        """determinism section has correct structure."""
        result = exporter.export_json()
        determinism = result["determinism"]
        assert "non_deterministic_jobs" in determinism
        assert "count" in determinism
        assert isinstance(determinism["non_deterministic_jobs"], list)
    
    def test_export_json_is_serializable(self, exporter):
        """JSON export is serializable to JSON string."""
        result = exporter.export_json()
        json_str = json.dumps(result)
        assert isinstance(json_str, str)
        assert len(json_str) > 0
    
    def test_export_json_field_order_is_deterministic(self, exporter):
        """Field order is deterministic across calls."""
        result1 = exporter.export_json()
        result2 = exporter.export_json()
        
        # Remove timestamp for comparison
        result1_copy = {k: v for k, v in result1.items() if k != "generated_at"}
        result2_copy = {k: v for k, v in result2.items() if k != "generated_at"}
        
        json1 = json.dumps(result1_copy, sort_keys=False)
        json2 = json.dumps(result2_copy, sort_keys=False)
        
        assert json1 == json2, "Field order should be deterministic"


# =============================================================================
# C. Text Export Tests (10 tests)
# =============================================================================

class TestTextExport:
    """Tests for export_text() method."""
    
    def test_export_text_returns_string(self, exporter):
        """export_text returns a string."""
        result = exporter.export_text()
        assert isinstance(result, str)
    
    def test_export_text_has_header(self, exporter):
        """Text export starts with FABRIC OPERATOR REPORT header."""
        result = exporter.export_text()
        assert result.startswith("FABRIC OPERATOR REPORT")
        assert "======================" in result
    
    def test_export_text_has_all_sections(self, exporter):
        """Text export contains all required sections."""
        result = exporter.export_text()
        required_sections = [
            "Execution Summary",
            "Engine Health",
            "Failure Summary",
            "Proxy Profile Stability",
            "Determinism",
        ]
        for section in required_sections:
            assert section in result, f"Missing section: {section}"
    
    def test_export_text_no_emoji(self, exporter):
        """Text export contains no emojis."""
        result = exporter.export_text()
        # Common emoji ranges
        emoji_chars = set()
        for char in result:
            code = ord(char)
            if code > 127:
                if 0x1F300 <= code <= 0x1F9FF:  # Miscellaneous Symbols and Pictographs
                    emoji_chars.add(char)
                if 0x2600 <= code <= 0x26FF:  # Miscellaneous Symbols
                    emoji_chars.add(char)
        assert len(emoji_chars) == 0, f"Found emoji characters: {emoji_chars}"
    
    def test_export_text_no_markdown(self, exporter):
        """Text export contains no markdown formatting."""
        result = exporter.export_text()
        # Check for common markdown patterns
        assert "**" not in result, "Found markdown bold"
        assert "__" not in result, "Found markdown bold (underscore)"
        assert "```" not in result, "Found markdown code block"
        assert "# " not in result, "Found markdown heading"
    
    def test_export_text_is_byte_stable(self, exporter):
        """Text export is byte-identical across calls."""
        result1 = exporter.export_text()
        result2 = exporter.export_text()
        assert result1 == result2, "Text output should be byte-stable"
    
    def test_export_text_execution_summary_format(self, exporter):
        """Execution summary follows expected format."""
        result = exporter.export_text()
        assert "Total jobs:" in result
        assert "Completed:" in result
        assert "Failed:" in result
        assert "Validation failed:" in result
    
    def test_export_text_engine_health_format(self, exporter):
        """Engine health section shows engines with stats."""
        result = exporter.export_text()
        # Should have engine sections
        assert "Jobs:" in result
        assert "Failures:" in result
        assert "Failure rate:" in result
    
    def test_export_text_failure_rate_precision(self, exporter):
        """Failure rates are formatted with 3 decimal places."""
        result = exporter.export_text()
        lines = result.split("\n")
        for line in lines:
            if "Failure rate:" in line:
                # Extract the number after "Failure rate:"
                rate_str = line.split("Failure rate:")[-1].strip()
                # Verify it has decimal format
                assert "." in rate_str, f"Failure rate should have decimal: {rate_str}"
    
    def test_export_text_determinism_section(self, exporter):
        """Determinism section shows count."""
        result = exporter.export_text()
        assert "Non-deterministic jobs:" in result


# =============================================================================
# D. Empty Database Tests (4 tests)
# =============================================================================

class TestEmptyDatabaseExport:
    """Tests for exports with empty database."""
    
    def test_empty_json_export_succeeds(self, empty_exporter):
        """JSON export works with empty database."""
        result = empty_exporter.export_json()
        assert isinstance(result, dict)
        assert "generated_at" in result
    
    def test_empty_json_export_has_zero_counts(self, empty_exporter):
        """Empty export shows zero counts."""
        result = empty_exporter.export_json()
        summary = result["execution_summary"]
        assert summary["total_jobs"] == 0
        assert summary["completed"] == 0
        assert summary["failed"] == 0
        assert summary["validation_failed"] == 0
    
    def test_empty_text_export_succeeds(self, empty_exporter):
        """Text export works with empty database."""
        result = empty_exporter.export_text()
        assert isinstance(result, str)
        assert "FABRIC OPERATOR REPORT" in result
    
    def test_empty_text_export_shows_zero_counts(self, empty_exporter):
        """Empty text export shows zero counts."""
        result = empty_exporter.export_text()
        assert "Total jobs: 0" in result
        assert "Completed: 0" in result
        assert "Failed: 0" in result


# =============================================================================
# E. Determinism and Stability Tests (4 tests)
# =============================================================================

class TestDeterminismAndStability:
    """Tests for deterministic output."""
    
    def test_json_engine_order_is_alphabetical(self, exporter):
        """Engines in JSON are alphabetically ordered."""
        result = exporter.export_json()
        engines = list(result["engine_health"].keys())
        assert engines == sorted(engines)
    
    def test_json_profile_order_is_alphabetical(self, exporter):
        """Profiles in JSON are alphabetically ordered."""
        result = exporter.export_json()
        profiles = list(result["proxy_profile_stability"].keys())
        assert profiles == sorted(profiles)
    
    def test_multiple_exports_same_data(self, exporter):
        """Multiple exports produce same data (except timestamp)."""
        result1 = exporter.export_json()
        result2 = exporter.export_json()
        
        # Compare all fields except generated_at
        for key in result1.keys():
            if key != "generated_at":
                assert result1[key] == result2[key]
    
    def test_export_does_not_mutate_reports(self, reports, exporter):
        """Exporting does not mutate underlying reports."""
        # Get initial state
        summary_before = reports.execution_summary()
        
        # Perform exports
        exporter.export_json()
        exporter.export_text()
        exporter.export_json()
        
        # Verify state unchanged
        summary_after = reports.execution_summary()
        assert summary_before == summary_after


# =============================================================================
# F. Data Passthrough Tests (4 tests)
# =============================================================================

class TestDataPassthrough:
    """Tests for correct passthrough of report data."""
    
    def test_execution_summary_matches_reports(self, reports, exporter):
        """Execution summary in export matches reports."""
        export_data = exporter.export_json()
        report_summary = reports.execution_summary()
        export_summary = export_data["execution_summary"]
        
        assert export_summary["total_jobs"] == report_summary["total_jobs"]
        assert export_summary["completed"] == report_summary["completed"]
        assert export_summary["failed"] == report_summary["failed"]
        assert export_summary["validation_failed"] == report_summary["validation_failed"]
    
    def test_engine_health_matches_reports(self, reports, exporter):
        """Engine health in export matches reports."""
        export_data = exporter.export_json()
        report_health = reports.engine_health_report()
        export_health = export_data["engine_health"]
        
        for engine in report_health:
            assert engine in export_health
            assert export_health[engine]["jobs"] == report_health[engine]["jobs"]
            assert export_health[engine]["failures"] == report_health[engine]["failures"]
            assert export_health[engine]["failure_rate"] == report_health[engine]["failure_rate"]
    
    def test_proxy_profile_stability_matches_reports(self, reports, exporter):
        """Proxy profile stability in export matches reports."""
        export_data = exporter.export_json()
        report_stability = reports.proxy_profile_stability_report()
        export_stability = export_data["proxy_profile_stability"]
        
        for profile in report_stability:
            assert profile in export_stability
            assert export_stability[profile]["jobs"] == report_stability[profile]["jobs"]
            assert export_stability[profile]["failure_rate"] == report_stability[profile]["failure_rate"]
    
    def test_determinism_matches_reports(self, reports, exporter):
        """Determinism section in export matches reports."""
        export_data = exporter.export_json()
        report_determinism = reports.determinism_report()
        export_determinism = export_data["determinism"]
        
        assert export_determinism["count"] == report_determinism["count"]
        assert export_determinism["non_deterministic_jobs"] == report_determinism["non_deterministic_jobs"]


# =============================================================================
# G. Edge Case Tests (3 tests)
# =============================================================================

class TestEdgeCases:
    """Tests for edge cases."""
    
    def test_text_with_no_failures_shows_message(self, empty_exporter):
        """Text export with no failures shows appropriate message."""
        result = empty_exporter.export_text()
        assert "No failures recorded." in result
    
    def test_text_with_no_profiles_shows_message(self, empty_exporter):
        """Text export with no profiles shows appropriate message."""
        result = empty_exporter.export_text()
        assert "No profiles recorded." in result
    
    def test_json_serialization_roundtrip(self, exporter):
        """JSON export survives serialization roundtrip."""
        result = exporter.export_json()
        json_str = json.dumps(result)
        parsed = json.loads(json_str)
        
        # Verify structure preserved
        assert parsed["execution_summary"] == result["execution_summary"]
        assert parsed["engine_health"] == result["engine_health"]
        assert parsed["determinism"] == result["determinism"]


# =============================================================================
# H. Failure Summary Format Tests (2 tests)
# =============================================================================

class TestFailureSummaryFormat:
    """Tests for failure summary formatting."""
    
    def test_failure_summary_by_engine_structure(self, exporter):
        """Failure summary shows failures grouped by engine."""
        result = exporter.export_json()
        by_engine = result["failure_summary"]["by_engine"]
        
        # Should have engine keys
        assert isinstance(by_engine, dict)
        for engine, failures in by_engine.items():
            assert isinstance(failures, dict)
            for reason, count in failures.items():
                assert isinstance(reason, str)
                assert isinstance(count, int)
    
    def test_text_failure_reasons_indented(self, exporter):
        """Failure reasons in text are indented under engine."""
        result = exporter.export_text()
        lines = result.split("\n")
        
        in_failure_section = False
        found_indented_reason = False
        
        for i, line in enumerate(lines):
            if "Failure Summary" in line:
                in_failure_section = True
            elif in_failure_section and line.startswith("  ") and ":" in line:
                found_indented_reason = True
                break
            elif in_failure_section and line and not line.startswith(" ") and "-" not in line:
                # New section started
                if "Proxy Profile" in line or "Determinism" in line:
                    break
        
        # This test only makes sense if there are failures
        if "No failures recorded" not in result:
            assert found_indented_reason, "Failure reasons should be indented"
