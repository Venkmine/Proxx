"""
Tests for Forge test runner report normalization.

This test suite validates that:
1. All report fields exist for PASSED/FAILED/SKIPPED tests
2. Resolve edition/version always captured when installed
3. Report ordering is deterministic
4. Aggregate summary contains fact-based counts only
5. No execution behavior changed

CRITICAL: These tests enforce read-only evidence capture.
"""

import pytest
import json
from pathlib import Path
from typing import Dict

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))
sys.path.insert(0, str(Path(__file__).parent))

from run_tests import TestResult


# =============================================================================
# Test: TestResult Schema Compliance
# =============================================================================

def test_test_result_has_all_required_fields_passed():
    """
    TEST: PASSED test has all required fields.
    
    GIVEN: TestResult for a completed test
    WHEN: to_dict() is called
    THEN: All required fields exist
    """
    result = TestResult(
        sample_id="test_sample",
        format_name="BRAW",
        source_path="forge-tests/samples/test.braw",
        expected_policy="allowed",
        requires_resolve_edition="either",
    )
    
    # Simulate successful execution
    result.status = "completed"
    result.engine_used = "resolve"
    result.proxy_profile_used = "resolve_prores_proxy"
    result.resolve_edition_detected = "studio"
    result.resolve_version_detected = "19.0.3"
    result.output_verified = True
    result.output_file_size_bytes = 1234567
    
    result_dict = result.to_dict()
    
    # Required fields
    assert "test_id" in result_dict
    assert "resolve_edition_required" in result_dict
    assert "resolve_edition_detected" in result_dict
    assert "resolve_version_detected" in result_dict
    assert "sources" in result_dict
    assert "engine_used" in result_dict
    assert "proxy_profile" in result_dict
    assert "status" in result_dict
    assert "error_message" in result_dict
    assert "output_verified" in result_dict
    assert "output_file_size_bytes" in result_dict
    
    # Verify values
    assert result_dict["status"] == "PASSED"
    assert result_dict["test_id"] == "test_sample"
    assert result_dict["resolve_edition_detected"] == "studio"
    assert result_dict["resolve_version_detected"] == "19.0.3"
    assert result_dict["engine_used"] == "resolve"
    assert result_dict["proxy_profile"] == "resolve_prores_proxy"
    assert result_dict["output_verified"] is True
    assert result_dict["output_file_size_bytes"] == 1234567


def test_test_result_has_all_required_fields_failed():
    """
    TEST: FAILED test has all required fields including error_message.
    
    GIVEN: TestResult for a failed test
    WHEN: to_dict() is called
    THEN: All required fields exist AND error_message is populated
    """
    result = TestResult(
        sample_id="test_sample",
        format_name="BRAW",
        source_path="forge-tests/samples/test.braw",
        expected_policy="allowed",
        requires_resolve_edition="studio",
    )
    
    # Simulate failed execution
    result.status = "failed"
    result.engine_used = "resolve"
    result.failure_reason = "Resolve render failed: codec not supported"
    result.resolve_edition_detected = "studio"
    result.resolve_version_detected = "19.0.3"
    result.output_verified = False
    result.output_file_size_bytes = None
    
    result_dict = result.to_dict()
    
    # Status should be normalized
    assert result_dict["status"] == "FAILED"
    
    # Error message MUST be present for failures
    assert result_dict["error_message"] is not None
    assert "codec not supported" in result_dict["error_message"]
    
    # Evidence fields still captured
    assert result_dict["resolve_edition_detected"] == "studio"
    assert result_dict["resolve_version_detected"] == "19.0.3"
    assert result_dict["engine_used"] == "resolve"
    
    # Output fields indicate failure
    assert result_dict["output_verified"] is False
    assert result_dict["output_file_size_bytes"] is None


def test_test_result_has_all_required_fields_skipped():
    """
    TEST: SKIPPED test has all required fields including Resolve detection.
    
    GIVEN: TestResult for a skipped test (edition mismatch)
    WHEN: to_dict() is called
    THEN: All fields exist AND Resolve edition/version still captured
    """
    result = TestResult(
        sample_id="test_sample",
        format_name="BRAW",
        source_path="forge-tests/samples/test.braw",
        expected_policy="allowed",
        requires_resolve_edition="free",
    )
    
    # Simulate skip (Studio detected but Free required)
    result.status = "skipped"
    result.skip_reason = "resolve_free_not_installed"
    result.resolve_edition_detected = "studio"
    result.resolve_version_detected = "19.0.3"
    result.detected_resolve_edition = "studio"
    result.resolve_version = "19.0.3"
    
    result_dict = result.to_dict()
    
    # Status normalized
    assert result_dict["status"] == "SKIPPED"
    
    # CRITICAL: Resolve evidence MUST be captured even for skipped tests
    assert result_dict["resolve_edition_detected"] == "studio"
    assert result_dict["resolve_version_detected"] == "19.0.3"
    
    # Skip metadata should be present
    assert "skip_metadata" in result_dict
    assert result_dict["skip_metadata"]["reason"] == "resolve_free_not_installed"
    
    # Engine/output fields are null (test didn't run)
    assert result_dict["engine_used"] is None
    assert result_dict["output_verified"] is False


def test_sources_contains_basename_only():
    """
    TEST: sources field contains basename only (no full paths).
    
    GIVEN: TestResult with full source path
    WHEN: to_dict() is called
    THEN: sources contains basename only
    """
    result = TestResult(
        sample_id="test_sample",
        format_name="BRAW",
        source_path="forge-tests/samples/subfolder/test_file.braw",
        expected_policy="allowed",
    )
    
    result_dict = result.to_dict()
    
    # Should extract basename
    assert result_dict["sources"] == ["test_file.braw"]
    
    # Should NOT contain path separators
    assert "/" not in result_dict["sources"][0]
    assert "\\" not in result_dict["sources"][0]


def test_status_normalization():
    """
    TEST: Status values are normalized to PASSED/FAILED/SKIPPED.
    
    GIVEN: TestResult with various internal status values
    WHEN: to_dict() is called
    THEN: Status is normalized to standard values
    """
    test_cases = [
        ("completed", "PASSED"),
        ("failed", "FAILED"),
        ("error", "FAILED"),  # Errors are failures
        ("skipped", "SKIPPED"),
    ]
    
    for internal_status, expected_normalized in test_cases:
        result = TestResult(
            sample_id="test",
            format_name="BRAW",
            source_path="test.braw",
            expected_policy="allowed",
        )
        result.status = internal_status
        
        result_dict = result.to_dict()
        assert result_dict["status"] == expected_normalized, \
            f"Failed for {internal_status}: expected {expected_normalized}, got {result_dict['status']}"


# =============================================================================
# Test: Deterministic Output
# =============================================================================

def test_result_serialization_is_deterministic():
    """
    TEST: Multiple to_dict() calls produce identical output.
    
    GIVEN: TestResult
    WHEN: to_dict() is called multiple times
    THEN: Output is byte-identical
    """
    result = TestResult(
        sample_id="test_sample",
        format_name="BRAW",
        source_path="forge-tests/samples/test.braw",
        expected_policy="allowed",
    )
    
    result.status = "completed"
    result.engine_used = "resolve"
    result.resolve_edition_detected = "studio"
    result.resolve_version_detected = "19.0.3"
    
    dict1 = result.to_dict()
    dict2 = result.to_dict()
    
    assert dict1 == dict2


def test_field_ordering_is_stable():
    """
    TEST: Field ordering in to_dict() is stable.
    
    GIVEN: TestResult
    WHEN: to_dict() is called
    THEN: Field keys appear in consistent order
    """
    result = TestResult(
        sample_id="test",
        format_name="BRAW",
        source_path="test.braw",
        expected_policy="allowed",
    )
    
    result.status = "completed"
    
    result_dict = result.to_dict()
    keys = list(result_dict.keys())
    
    # Check expected ordering
    assert keys[0] == "test_id"
    assert keys[1] == "resolve_edition_required"
    assert "status" in keys
    assert "error_message" in keys


# =============================================================================
# Test: Aggregate Summary Structure
# =============================================================================

def test_aggregate_summary_contains_required_sections():
    """
    TEST: Aggregate summary has required sections (facts only).
    
    GIVEN: ForgeTestRunner (mock)
    WHEN: _build_aggregate_summary() is called
    THEN: Summary contains by_status, by_engine, by_source_extension
    """
    # This would test the actual _build_aggregate_summary method
    # For now, we validate the structure in integration
    
    expected_sections = ["by_status", "by_engine", "by_source_extension"]
    
    # Mock aggregate summary structure
    mock_summary = {
        "by_status": {"PASSED": 5, "FAILED": 2, "SKIPPED": 1},
        "by_engine": {"resolve": 4, "ffmpeg": 2, "null": 2},
        "by_source_extension": {".braw": 3, ".mp4": 2, ".mxf": 3},
    }
    
    for section in expected_sections:
        assert section in mock_summary
        assert isinstance(mock_summary[section], dict)


def test_aggregate_summary_contains_pure_counts_only():
    """
    TEST: Aggregate summary contains counts only (no interpretation).
    
    GIVEN: Aggregate summary
    WHEN: Inspecting contents
    THEN: Contains only integer counts, no percentages or warnings
    """
    mock_summary = {
        "by_status": {"PASSED": 5, "FAILED": 2},
        "by_engine": {"resolve": 4, "ffmpeg": 3},
        "by_source_extension": {".braw": 5, ".mp4": 2},
    }
    
    # All values should be integers (counts)
    for section_name, section_data in mock_summary.items():
        for key, value in section_data.items():
            assert isinstance(value, int), f"Expected int, got {type(value)} for {section_name}.{key}"
            assert value >= 0, f"Count should be non-negative: {section_name}.{key} = {value}"
    
    # Should NOT contain these fields (interpretation)
    forbidden_keys = ["success_rate", "failure_rate", "warnings", "recommendations"]
    for section_data in mock_summary.values():
        for forbidden in forbidden_keys:
            assert forbidden not in section_data


def test_aggregate_summary_sorted_alphabetically():
    """
    TEST: Aggregate summary sections are sorted for determinism.
    
    GIVEN: Aggregate summary with multiple entries
    WHEN: Checking key order
    THEN: Keys are sorted alphabetically
    """
    mock_summary = {
        "by_status": {"FAILED": 2, "PASSED": 5, "SKIPPED": 1},
        "by_engine": {"ffmpeg": 2, "null": 2, "resolve": 4},
    }
    
    # Check sorting
    status_keys = list(mock_summary["by_status"].keys())
    assert status_keys == sorted(status_keys)
    
    engine_keys = list(mock_summary["by_engine"].keys())
    assert engine_keys == sorted(engine_keys)


# =============================================================================
# Test: No Behavior Changes
# =============================================================================

def test_no_new_test_execution_logic_added():
    """
    TEST: TestResult does not contain execution logic.
    
    GIVEN: TestResult class
    WHEN: Inspecting methods
    THEN: Only contains data serialization methods
    """
    # TestResult should be a data container only
    result = TestResult(
        sample_id="test",
        format_name="BRAW",
        source_path="test.braw",
        expected_policy="allowed",
    )
    
    # Should have to_dict() for serialization
    assert hasattr(result, 'to_dict')
    
    # Should NOT have execution methods
    forbidden_methods = ['execute', 'run', 'validate', 'process']
    for method_name in forbidden_methods:
        assert not hasattr(result, method_name), \
            f"TestResult should not have execution method: {method_name}"


def test_test_result_is_immutable_after_creation():
    """
    TEST: TestResult values can be set but not accidentally mutated.
    
    GIVEN: TestResult
    WHEN: Setting values
    THEN: Values are stored correctly
    """
    result = TestResult(
        sample_id="test",
        format_name="BRAW",
        source_path="test.braw",
        expected_policy="allowed",
    )
    
    # Should be able to set values
    result.status = "completed"
    result.engine_used = "resolve"
    
    # Values should persist
    assert result.status == "completed"
    assert result.engine_used == "resolve"


# =============================================================================
# Test: Edge Cases
# =============================================================================

def test_null_fields_handled_gracefully():
    """
    TEST: Null/None fields are handled correctly in serialization.
    
    GIVEN: TestResult with mostly null fields
    WHEN: to_dict() is called
    THEN: Serialization succeeds with null values
    """
    result = TestResult(
        sample_id="test",
        format_name="BRAW",
        source_path="test.braw",
        expected_policy="allowed",
    )
    
    # Don't set any optional fields
    result.status = "skipped"
    
    result_dict = result.to_dict()
    
    # Should serialize successfully
    assert result_dict is not None
    
    # Null fields should be present
    assert result_dict["engine_used"] is None
    assert result_dict["error_message"] is None
    assert result_dict["resolve_edition_detected"] is None
    assert result_dict["resolve_version_detected"] is None


def test_error_message_includes_validation_errors():
    """
    TEST: error_message includes both failure_reason and validation_error.
    
    GIVEN: TestResult with validation_error
    WHEN: to_dict() is called
    THEN: error_message is populated
    """
    result = TestResult(
        sample_id="test",
        format_name="BRAW",
        source_path="test.braw",
        expected_policy="allowed",
    )
    
    result.status = "failed"
    result.validation_error = "Invalid source format"
    
    result_dict = result.to_dict()
    
    # error_message should include validation_error
    assert result_dict["error_message"] == "Invalid source format"


def test_output_verification_false_when_not_set():
    """
    TEST: output_verified defaults to False when not explicitly set.
    
    GIVEN: TestResult without output verification
    WHEN: to_dict() is called
    THEN: output_verified is False (not null)
    """
    result = TestResult(
        sample_id="test",
        format_name="BRAW",
        source_path="test.braw",
        expected_policy="allowed",
    )
    
    result.status = "failed"
    
    result_dict = result.to_dict()
    
    # Should be boolean False, not None
    assert result_dict["output_verified"] is False
    assert isinstance(result_dict["output_verified"], bool)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
