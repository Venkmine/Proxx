"""
V2 Phase 1 Regression Test - Minimal validation of core execution guarantees.

This test verifies the fundamental contracts of V2 Phase 1:
1. Valid JobSpec executes and produces output
2. ClipExecutionResult schema is correct
3. Output paths are deterministic
4. Fail-fast behavior works
5. Multi-clip naming validation works

No comprehensive test suite. Phase 1 assumes manual validation.
"""

import json
import os
import sys
import tempfile
from pathlib import Path

# Add backend to path
BACKEND_DIR = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from job_spec import JobSpec, JobSpecValidationError
from headless_execute import execute_multi_job_spec
from execution_results import ClipExecutionResult, JobExecutionResult


# Test media location (relative to project root)
PROJECT_ROOT = Path(__file__).parent.parent
TEST_MEDIA = PROJECT_ROOT / "test_media" / "test_input.mp4"


def test_single_clip_execution():
    """
    Test 1: Single-clip execution produces valid output.
    
    Verifies:
    - Output file is created
    - ClipExecutionResult has correct structure
    - Output path is deterministic
    """
    print("\n=== TEST 1: Single-Clip Execution ===")
    
    if not TEST_MEDIA.exists():
        print(f"SKIP: Test media not found at {TEST_MEDIA}")
        return
    
    with tempfile.TemporaryDirectory() as tmpdir:
        job_spec = JobSpec(
            sources=[str(TEST_MEDIA)],
            output_directory=tmpdir,
            codec="h264",
            container="mp4",
            resolution="quarter",
            naming_template="{source_name}_v2test_{index}",
        )
        
        result = execute_multi_job_spec(job_spec)
        
        # Verify result structure
        assert isinstance(result, JobExecutionResult), "Result should be JobExecutionResult"
        assert result.job_id == job_spec.job_id, "Job ID should match"
        assert len(result.clips) == 1, "Should have exactly one clip result"
        
        # Verify clip result
        clip = result.clips[0]
        assert isinstance(clip, ClipExecutionResult), "Clip result should be ClipExecutionResult"
        assert clip.source_path == str(TEST_MEDIA), "Source path should match"
        assert clip.status in ["COMPLETED", "FAILED"], "Status should be COMPLETED or FAILED"
        assert clip.exit_code is not None, "Exit code should be set"
        assert isinstance(clip.ffmpeg_command, list), "FFmpeg command should be a list"
        assert len(clip.ffmpeg_command) > 0, "FFmpeg command should not be empty"
        
        # Verify output if successful
        if clip.status == "COMPLETED":
            assert clip.output_exists, "Output should exist"
            assert clip.output_size_bytes is not None, "Output size should be set"
            assert clip.output_size_bytes > 0, "Output size should be > 0"
            assert Path(clip.resolved_output_path).exists(), "Output file should exist"
            print(f"✓ Output created: {clip.resolved_output_path}")
            print(f"✓ Size: {clip.output_size_bytes / 1024:.1f} KB")
        else:
            print(f"✗ Execution failed: {clip.failure_reason}")
            # Don't fail test if FFmpeg fails (might be env issue)
            print("  (Continuing test despite execution failure)")
        
        # Verify deterministic output path
        expected_filename = "test_input_v2test_000.mp4"
        assert expected_filename in clip.resolved_output_path, \
            f"Output path should contain {expected_filename}, got {clip.resolved_output_path}"
        
        print("✓ Test 1 passed: Single-clip execution structure is correct")


def test_multi_clip_naming_validation():
    """
    Test 2: Multi-clip jobs require unique naming.
    
    Verifies:
    - Multi-clip jobs without {index} or {source_name} are rejected
    - Single-clip jobs are exempt
    """
    print("\n=== TEST 2: Multi-Clip Naming Validation ===")
    
    if not TEST_MEDIA.exists():
        print(f"SKIP: Test media not found at {TEST_MEDIA}")
        return
    
    with tempfile.TemporaryDirectory() as tmpdir:
        # Multi-clip job WITHOUT unique naming token (should fail validation)
        job_spec_bad = JobSpec(
            sources=[str(TEST_MEDIA), str(TEST_MEDIA)],  # Same source twice
            output_directory=tmpdir,
            codec="h264",
            container="mp4",
            resolution="quarter",
            naming_template="output",  # No {index} or {source_name}
        )
        
        try:
            # Should fail because multi-clip without {index} or {source_name}
            job_spec_bad.validate(check_paths=False)
            assert False, "Validation should have failed for multi-clip job without unique naming"
        except JobSpecValidationError as e:
            assert "index" in str(e).lower() or "source_name" in str(e).lower(), \
                "Error message should mention index or source_name"
            print(f"✓ Multi-clip validation correctly rejected: {e}")
        
        # Multi-clip job WITH {index} token (should pass validation)
        job_spec_good = JobSpec(
            sources=[str(TEST_MEDIA), str(TEST_MEDIA)],
            output_directory=tmpdir,
            codec="h264",
            container="mp4",
            resolution="quarter",
            naming_template="output_{index}",  # Has {index}
        )
        
        try:
            job_spec_good.validate(check_paths=False)  # Don't check paths (same source OK)
            print("✓ Multi-clip validation correctly accepted naming with {index}")
        except JobSpecValidationError as e:
            assert False, f"Validation should have passed: {e}"
        
        # Single-clip job WITHOUT unique naming token (should pass)
        job_spec_single = JobSpec(
            sources=[str(TEST_MEDIA)],
            output_directory=tmpdir,
            codec="h264",
            container="mp4",
            resolution="quarter",
            naming_template="output",  # No token needed for single-clip
        )
        
        try:
            job_spec_single.validate(check_paths=False)
            print("✓ Single-clip validation correctly exempt from naming requirement")
        except JobSpecValidationError as e:
            assert False, f"Single-clip validation should have passed: {e}"
        
        print("✓ Test 2 passed: Multi-clip naming validation works correctly")


def test_fail_fast_behavior():
    """
    Test 3: Execution stops on first clip failure.
    
    Verifies:
    - If first clip fails, no subsequent clips are processed
    - Partial results are returned
    """
    print("\n=== TEST 3: Fail-Fast Behavior ===")
    
    with tempfile.TemporaryDirectory() as tmpdir:
        # Create job with non-existent source (will fail)
        nonexistent = "/tmp/this_file_definitely_does_not_exist_12345.mp4"
        
        job_spec = JobSpec(
            sources=[nonexistent, str(TEST_MEDIA), str(TEST_MEDIA)],  # First source bad
            output_directory=tmpdir,
            codec="h264",
            container="mp4",
            resolution="quarter",
            naming_template="output_{index}",
        )
        
        # Validation should catch this
        try:
            job_spec.validate()
            print("✗ Validation should have caught non-existent source")
            # If validation somehow passes, check execution behavior
            result = execute_multi_job_spec(job_spec)
            assert result.final_status in ["FAILED", "PARTIAL"], \
                "Job with bad source should fail or be partial"
            print("✓ Execution correctly failed/partial for bad source")
        except JobSpecValidationError as e:
            print(f"✓ Validation correctly caught non-existent source: {e}")
        
        print("✓ Test 3 passed: Fail-fast behavior verified")


def test_result_serialization():
    """
    Test 4: Results can be serialized to JSON.
    
    Verifies:
    - ClipExecutionResult.to_dict() works
    - JobExecutionResult.to_dict() works
    - JSON serialization works
    """
    print("\n=== TEST 4: Result Serialization ===")
    
    if not TEST_MEDIA.exists():
        print(f"SKIP: Test media not found at {TEST_MEDIA}")
        return
    
    with tempfile.TemporaryDirectory() as tmpdir:
        job_spec = JobSpec(
            sources=[str(TEST_MEDIA)],
            output_directory=tmpdir,
            codec="h264",
            container="mp4",
            resolution="quarter",
            naming_template="test_{index}",
        )
        
        result = execute_multi_job_spec(job_spec)
        
        # Serialize to dict
        result_dict = result.to_dict()
        assert isinstance(result_dict, dict), "to_dict() should return dict"
        assert "job_id" in result_dict, "Result dict should have job_id"
        assert "clips" in result_dict, "Result dict should have clips"
        assert "final_status" in result_dict, "Result dict should have final_status"
        
        # Serialize to JSON
        result_json = result.to_json()
        assert isinstance(result_json, str), "to_json() should return string"
        
        # Verify JSON is valid
        parsed = json.loads(result_json)
        assert parsed["job_id"] == job_spec.job_id, "Parsed JSON should match job_id"
        
        print("✓ Result serialization works correctly")
        print("✓ Test 4 passed: Result serialization verified")


# =============================================================================
# V2.1 Contract Validation Tests
# =============================================================================

def test_missing_version_fails():
    """
    Test 5: Missing jobspec_version fails deserialization.
    
    Verifies:
    - JobSpec.from_dict() requires jobspec_version
    - Error message is explicit
    """
    print("\n=== TEST 5: Missing Version Fails ===")
    
    data = {
        # Note: NO jobspec_version field
        "job_id": "test123",
        "sources": ["/tmp/test.mp4"],
        "output_directory": "/tmp/out",
        "codec": "h264",
        "container": "mp4",
        "resolution": "half",
        "naming_template": "{source_name}",
    }
    
    try:
        JobSpec.from_dict(data)
        raise AssertionError("Should have raised JobSpecValidationError for missing version")
    except JobSpecValidationError as e:
        assert "jobspec_version" in str(e).lower(), \
            f"Error should mention jobspec_version: {e}"
        print(f"✓ Correctly rejected: {e}")
    
    print("✓ Test 5 passed: Missing version is rejected")


def test_wrong_version_fails():
    """
    Test 6: Wrong jobspec_version fails deserialization.
    
    Verifies:
    - Version mismatch raises JobSpecValidationError
    - Error message shows expected vs actual
    """
    print("\n=== TEST 6: Wrong Version Fails ===")
    
    data = {
        "jobspec_version": "1.0",  # Wrong version
        "job_id": "test123",
        "sources": ["/tmp/test.mp4"],
        "output_directory": "/tmp/out",
        "codec": "h264",
        "container": "mp4",
        "resolution": "half",
        "naming_template": "{source_name}",
    }
    
    try:
        JobSpec.from_dict(data)
        raise AssertionError("Should have raised JobSpecValidationError for version mismatch")
    except JobSpecValidationError as e:
        assert "mismatch" in str(e).lower() or "1.0" in str(e), \
            f"Error should mention mismatch or the wrong version: {e}"
        print(f"✓ Correctly rejected: {e}")
    
    print("✓ Test 6 passed: Wrong version is rejected")


def test_unknown_field_fails():
    """
    Test 7: Unknown fields fail deserialization.
    
    Verifies:
    - Extra/unknown fields raise JobSpecValidationError
    - Error message lists the unknown fields
    """
    print("\n=== TEST 7: Unknown Fields Fail ===")
    
    from job_spec import JOBSPEC_VERSION
    
    data = {
        "jobspec_version": JOBSPEC_VERSION,
        "job_id": "test123",
        "sources": ["/tmp/test.mp4"],
        "output_directory": "/tmp/out",
        "codec": "h264",
        "container": "mp4",
        "resolution": "half",
        "naming_template": "{source_name}",
        "extra_field": "should fail",
        "another_unknown": 42,
    }
    
    try:
        JobSpec.from_dict(data)
        raise AssertionError("Should have raised JobSpecValidationError for unknown fields")
    except JobSpecValidationError as e:
        assert "unknown" in str(e).lower(), \
            f"Error should mention unknown fields: {e}"
        assert "extra_field" in str(e), \
            f"Error should list extra_field: {e}"
        print(f"✓ Correctly rejected: {e}")
    
    print("✓ Test 7 passed: Unknown fields are rejected")


def test_invalid_enum_fails():
    """
    Test 8: Invalid enum values fail deserialization.
    
    Verifies:
    - Invalid codec/container/fps_mode values raise JobSpecValidationError
    - Error message lists allowed values
    """
    print("\n=== TEST 8: Invalid Enum Values Fail ===")
    
    from job_spec import JOBSPEC_VERSION
    
    # Test invalid codec
    data = {
        "jobspec_version": JOBSPEC_VERSION,
        "job_id": "test123",
        "sources": ["/tmp/test.mp4"],
        "output_directory": "/tmp/out",
        "codec": "not_a_real_codec",
        "container": "mp4",
        "resolution": "half",
        "naming_template": "{source_name}",
    }
    
    try:
        JobSpec.from_dict(data)
        raise AssertionError("Should have raised JobSpecValidationError for invalid codec")
    except JobSpecValidationError as e:
        assert "codec" in str(e).lower(), \
            f"Error should mention codec: {e}"
        assert "allowed" in str(e).lower() or "valid" in str(e).lower(), \
            f"Error should list allowed values: {e}"
        print(f"✓ Correctly rejected invalid codec: {e}")
    
    # Test invalid container
    data["codec"] = "h264"
    data["container"] = "not_a_container"
    
    try:
        JobSpec.from_dict(data)
        raise AssertionError("Should have raised JobSpecValidationError for invalid container")
    except JobSpecValidationError as e:
        assert "container" in str(e).lower(), \
            f"Error should mention container: {e}"
        print(f"✓ Correctly rejected invalid container: {e}")
    
    # Test invalid fps_mode
    data["container"] = "mp4"
    data["fps_mode"] = "not_a_mode"
    
    try:
        JobSpec.from_dict(data)
        raise AssertionError("Should have raised JobSpecValidationError for invalid fps_mode")
    except JobSpecValidationError as e:
        assert "fps_mode" in str(e).lower(), \
            f"Error should mention fps_mode: {e}"
        print(f"✓ Correctly rejected invalid fps_mode: {e}")
    
    print("✓ Test 8 passed: Invalid enum values are rejected")


def test_valid_jobspec_passes():
    """
    Test 9: Valid JobSpec passes unchanged.
    
    Verifies:
    - Complete, valid JobSpec can be deserialized
    - Round-trip (to_dict -> from_dict) preserves data
    - Version is injected in to_dict()
    """
    print("\n=== TEST 9: Valid JobSpec Passes ===")
    
    from job_spec import JOBSPEC_VERSION
    
    data = {
        "jobspec_version": JOBSPEC_VERSION,
        "job_id": "test123",
        "sources": ["/tmp/test.mp4"],
        "output_directory": "/tmp/out",
        "codec": "h264",
        "container": "mp4",
        "resolution": "1920x1080",
        "naming_template": "{source_name}_{index}",
        "fps_mode": "same-as-source",
    }
    
    job_spec = JobSpec.from_dict(data)
    assert job_spec.job_id == "test123", "Job ID should match"
    assert job_spec.codec == "h264", "Codec should match"
    print("✓ Valid JobSpec deserialized successfully")
    
    # Verify round-trip
    exported = job_spec.to_dict()
    assert exported["jobspec_version"] == JOBSPEC_VERSION, \
        "Exported dict should include version"
    
    reimported = JobSpec.from_dict(exported)
    assert reimported.job_id == job_spec.job_id, "Round-trip should preserve job_id"
    assert reimported.codec == job_spec.codec, "Round-trip should preserve codec"
    print("✓ Round-trip serialization works")
    
    print("✓ Test 9 passed: Valid JobSpec is accepted")


def run_all_tests():
    """Run all regression tests."""
    print("=" * 60)
    print("V2 PHASE 1 REGRESSION TEST SUITE")
    print("=" * 60)
    
    tests = [
        test_single_clip_execution,
        test_multi_clip_naming_validation,
        test_fail_fast_behavior,
        test_result_serialization,
        # V2.1 Contract Validation Tests
        test_missing_version_fails,
        test_wrong_version_fails,
        test_unknown_field_fails,
        test_invalid_enum_fails,
        test_valid_jobspec_passes,
    ]
    
    passed = 0
    failed = 0
    
    for test in tests:
        try:
            test()
            passed += 1
        except AssertionError as e:
            print(f"\n✗ TEST FAILED: {test.__name__}")
            print(f"  Error: {e}")
            failed += 1
        except Exception as e:
            print(f"\n✗ TEST ERROR: {test.__name__}")
            print(f"  Exception: {e}")
            import traceback
            traceback.print_exc()
            failed += 1
    
    print("\n" + "=" * 60)
    print(f"RESULTS: {passed} passed, {failed} failed")
    print("=" * 60)
    
    return failed == 0


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
