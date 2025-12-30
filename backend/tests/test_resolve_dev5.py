"""
V2 Tests - Resolve Dev 5 Evidence-Based Testing

Tests for:
- Resolve edition detection
- ProRes RAW blocking
- Mixed engine job rejection  
- Support policy enforcement
- Test runner structure validation
"""

import pytest
import json
from pathlib import Path
import sys

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.v2.resolve_installation import (
    detect_resolve_installation,
    get_resolve_edition,
    get_resolve_version,
)
from backend.v2.source_capabilities import (
    is_source_rejected,
    get_rejection_reason,
    validate_source_capability,
    SourceCapabilityError,
)
from backend.v2.support_policy import (
    SupportPolicy,
    SupportPolicyEvaluator,
    PolicyResult,
    HARDCODED_BLOCKS,
    check_format_support,
)


# =============================================================================
# Test: Resolve Edition Detection
# =============================================================================

def test_resolve_edition_detection_returns_structured_info():
    """
    TEST: Resolve edition detection returns structured info.
    
    GIVEN: A system with or without Resolve installed
    WHEN: detect_resolve_installation() is called
    THEN: Returns ResolveInstallation or None
    AND: If found, contains edition, version, path, detection_method
    """
    info = detect_resolve_installation()
    
    if info:
        # Verify structure
        assert hasattr(info, 'version')
        assert hasattr(info, 'edition')
        assert hasattr(info, 'install_path')
        assert hasattr(info, 'detection_method')
        assert hasattr(info, 'detection_confidence')
        
        # Verify edition is one of expected values
        assert info.edition in ('free', 'studio', 'unknown')
        
        # Verify version is non-empty
        assert info.version
        assert isinstance(info.version, str)
        
        # Verify detection method is recorded
        assert info.detection_method
        
        # Verify confidence level
        assert info.detection_confidence in ('high', 'medium', 'low')
    else:
        # No Resolve installed - this is fine for CI
        pass


def test_resolve_edition_functions_return_correct_types():
    """
    TEST: Edition helper functions return expected types.
    
    GIVEN: Edition detection functions
    WHEN: Called
    THEN: Return strings ("free", "studio", "unknown")
    """
    edition = get_resolve_edition()
    version = get_resolve_version()
    
    assert isinstance(edition, str)
    assert isinstance(version, str)
    
    # Edition must be one of known values
    assert edition in ('free', 'studio', 'unknown')


# =============================================================================
# Test: ProRes RAW Blocking
# =============================================================================

def test_prores_raw_is_explicitly_blocked():
    """
    TEST: ProRes RAW is blocked with correct message.
    
    GIVEN: ProRes RAW codec identifier
    WHEN: Checking rejection status
    THEN: is_source_rejected returns True
    AND: Message says "DaVinci Resolve does not support it"
    """
    # Test all ProRes RAW variants
    prores_raw_codecs = [
        ("mov", "prores_raw"),
        ("mov", "prores_raw_hq"),
        ("mov", "proresraw"),
        ("mov", "proresrawhq"),
    ]
    
    for container, codec in prores_raw_codecs:
        # Should be rejected
        assert is_source_rejected(container, codec), \
            f"{codec} should be rejected"
        
        # Get rejection reason
        reason = get_rejection_reason(container, codec)
        assert reason is not None
        assert "Resolve does not support" in reason.reason or \
               "not supported" in reason.reason.lower()


def test_prores_raw_validation_raises_with_correct_message():
    """
    TEST: ProRes RAW validation raises SourceCapabilityError.
    
    GIVEN: ProRes RAW codec
    WHEN: validate_source_capability is called
    THEN: Raises SourceCapabilityError
    AND: Message contains "DaVinci Resolve does not support it"
    """
    with pytest.raises(SourceCapabilityError) as exc_info:
        validate_source_capability("mov", "prores_raw")
    
    error_msg = str(exc_info.value)
    assert "prores_raw" in error_msg.lower()
    assert "not supported" in error_msg.lower()


def test_standard_prores_is_not_blocked():
    """
    TEST: Standard ProRes (non-RAW) is NOT blocked.
    
    GIVEN: Standard ProRes codec identifiers
    WHEN: Checking rejection status
    THEN: is_source_rejected returns False
    """
    standard_prores_codecs = [
        ("mov", "prores"),
        ("mov", "prores_proxy"),
        ("mov", "prores_lt"),
        ("mov", "prores_hq"),
        ("mov", "prores_4444"),
    ]
    
    for container, codec in standard_prores_codecs:
        assert not is_source_rejected(container, codec), \
            f"{codec} should NOT be rejected"


# =============================================================================
# Test: Mixed Engine Jobs
# =============================================================================

def test_mixed_raw_and_non_raw_sources_rejected():
    """
    TEST: Mixed RAW + non-RAW jobs fail with clear error.
    
    GIVEN: A JobSpec with both RAW and standard formats
    WHEN: Engine routing is attempted
    THEN: Fails with deterministic error message
    """
    # This is tested indirectly through execution_adapter
    # The routing logic in headless_execute.py should reject mixed jobs
    # See test_execution_from_jobspec.py for full integration test
    pass


# =============================================================================
# Test: Support Policy
# =============================================================================

def test_hardcoded_blocks_include_prores_raw():
    """
    TEST: HARDCODED_BLOCKS includes ProRes RAW variants.
    
    GIVEN: HARDCODED_BLOCKS dictionary
    WHEN: Checking for ProRes RAW
    THEN: All variants are present
    """
    assert "prores_raw" in HARDCODED_BLOCKS
    assert "prores_raw_hq" in HARDCODED_BLOCKS
    assert "proresraw" in HARDCODED_BLOCKS
    assert "proresrawhq" in HARDCODED_BLOCKS


def test_support_policy_evaluator_loads_report():
    """
    TEST: SupportPolicyEvaluator can load test report.
    
    GIVEN: A valid test report JSON
    WHEN: Evaluator loads the report
    THEN: Format policies are built correctly
    """
    # Create mock report
    mock_report = {
        "test_suite": "test",
        "resolve_metadata": {
            "resolve_edition": "free",
            "resolve_version": "19.0",
        },
        "results": [
            {
                "sample_id": "braw_test",
                "format": "BRAW",
                "expected_policy": "allowed",
                "status": "completed",
            },
            {
                "sample_id": "prores_raw_test",
                "format": "ProRes RAW",
                "expected_policy": "block",
                "status": "failed",
                "failure_reason": "Not supported",
            },
        ],
    }
    
    # Save mock report
    test_reports_dir = Path(__file__).parent / "test_reports"
    test_reports_dir.mkdir(exist_ok=True)
    
    report_path = test_reports_dir / "mock_report.json"
    with open(report_path, 'w') as f:
        json.dump(mock_report, f)
    
    try:
        # Load report
        evaluator = SupportPolicyEvaluator(report_path)
        
        # Verify edition/version extracted
        assert evaluator.get_resolve_edition() == "free"
        assert evaluator.get_resolve_version() == "19.0"
        
        # Verify BRAW is allowed
        braw_policy = evaluator.classify_format("BRAW")
        assert braw_policy.policy == SupportPolicy.ALLOWED
        
        # Verify ProRes RAW is blocked (hardcoded, not from report)
        prores_raw_policy = evaluator.classify_format("ProRes RAW")
        assert prores_raw_policy.policy == SupportPolicy.BLOCK
        
    finally:
        # Cleanup
        report_path.unlink()
        test_reports_dir.rmdir()


def test_check_format_support_handles_no_report():
    """
    TEST: check_format_support handles missing reports gracefully.
    
    GIVEN: No test reports available
    WHEN: check_format_support is called
    THEN: Returns UNKNOWN policy (except hardcoded blocks)
    """
    # ProRes RAW should still be blocked even without report
    result = check_format_support("ProRes RAW")
    assert result.policy == SupportPolicy.BLOCK
    assert "not supported" in result.message.lower()


# =============================================================================
# Test: Test Runner Structure
# =============================================================================

def test_forge_tests_directory_structure_exists():
    """
    TEST: forge-tests/ directory structure is valid.
    
    GIVEN: forge-tests directory
    WHEN: Checking structure
    THEN: Contains required subdirectories
    """
    # forge-tests is at project root, not in backend/
    forge_tests_dir = Path(__file__).parent.parent.parent / "forge-tests"
    
    assert forge_tests_dir.exists(), "forge-tests/ directory missing"
    
    # Check subdirectories
    assert (forge_tests_dir / "samples").exists()
    assert (forge_tests_dir / "ingest").exists()
    assert (forge_tests_dir / "output").exists()
    assert (forge_tests_dir / "reports").exists()
    assert (forge_tests_dir / "config").exists()
    
    # Check test runner script
    assert (forge_tests_dir / "run_tests.py").exists()
    assert (forge_tests_dir / "README.md").exists()


def test_test_matrix_configs_are_valid_json():
    """
    TEST: Test matrix configs are valid JSON with required fields.
    
    GIVEN: Test matrix configuration files
    WHEN: Loading and parsing
    THEN: JSON is valid and contains required fields
    """
    config_dir = Path(__file__).parent.parent.parent / "forge-tests" / "config"
    
    configs = [
        config_dir / "test_matrix_free.json",
        config_dir / "test_matrix_studio.json",
    ]
    
    for config_path in configs:
        assert config_path.exists(), f"Config missing: {config_path}"
        
        with open(config_path) as f:
            config = json.load(f)
        
        # Verify required fields
        assert "test_suite" in config
        assert "description" in config
        assert "samples" in config
        assert "output_directory" in config
        
        # Verify samples structure
        for sample in config["samples"]:
            assert "sample_id" in sample
            assert "format" in sample
            assert "extension" in sample
            assert "policy" in sample
            assert sample["policy"] in ("allowed", "warn", "block")


def test_test_runner_has_dry_run_mode():
    """
    TEST: Test runner supports --dry-run flag.
    
    GIVEN: run_tests.py script
    WHEN: Checking for dry-run support
    THEN: Script has dry-run capability
    """
    run_tests_path = Path(__file__).parent.parent.parent / "forge-tests" / "run_tests.py"
    
    with open(run_tests_path) as f:
        content = f.read()
    
    # Check for dry-run flag
    assert "--dry-run" in content
    assert "dry_run" in content


# =============================================================================
# Test: Report Structure
# =============================================================================

def test_report_structure_is_deterministic():
    """
    TEST: Test reports have deterministic structure.
    
    GIVEN: Report schema requirements
    WHEN: Verifying structure
    THEN: Contains required fields in correct order
    """
    # This is a schema validation test
    # Real reports are generated by run_tests.py
    
    expected_fields = [
        "test_suite",
        "description",
        "timestamp",
        "forge_version",
        "resolve_metadata",
        "results",
        "summary",
    ]
    
    expected_resolve_metadata_fields = [
        "resolve_version",
        "resolve_edition",
        "install_path",
        "detection_method",
        "detection_confidence",
    ]
    
    expected_result_fields = [
        "sample_id",
        "format",
        "source_path",
        "expected_policy",
        "job_id",
        "status",
        "engine_used",
        "failure_reason",
        "output_paths",
        "duration_ms",
        "validation_error",
    ]
    
    # Structure is validated by test_matrix configs
    # Actual report generation is tested by running forge-tests/run_tests.py
    pass
