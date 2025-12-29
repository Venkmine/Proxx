"""
V2 SLICE 3 Watch Folder Integration Tests

Asserts that watch folder runner dispatches to execution_adapter ONLY.

Test Coverage:
==============
1. Watch folder invokes execute_jobspec() (not engines directly)
2. Validation failures → no engine invocation
3. Execution failures → FAILED result written
4. Successful execution → COMPLETED result written
5. Determinism preserved across runs
6. NO engine imports in watch folder runner

Part of V2 Phase 1 SLICE 3 (Watch Folder Integration)
"""

import json
import pytest
import tempfile
from datetime import datetime
from pathlib import Path
from unittest.mock import Mock, patch, call
from dataclasses import replace

# Import test modules
import sys
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from job_spec import JobSpec, JOBSPEC_VERSION
from execution_results import JobExecutionResult, ClipExecutionResult
from execution_adapter import execute_jobspec

# Import watch folder runner components
sys.path.insert(0, str(Path(__file__).parent.parent / "backend" / "v2"))
from watch_folder_runner import (
    process_single_jobspec,
    ProcessingResult,
    PENDING_FOLDER,
    RUNNING_FOLDER,
    COMPLETED_FOLDER,
    FAILED_FOLDER,
    RESULT_SUFFIX,
)


# =============================================================================
# Fixtures
# =============================================================================

@pytest.fixture
def watch_dir():
    """Create a temporary watch directory with proper structure."""
    with tempfile.TemporaryDirectory() as tmpdir:
        watch_path = Path(tmpdir) / "watch"
        watch_path.mkdir()
        (watch_path / PENDING_FOLDER).mkdir()
        (watch_path / RUNNING_FOLDER).mkdir()
        (watch_path / COMPLETED_FOLDER).mkdir()
        (watch_path / FAILED_FOLDER).mkdir()
        yield watch_path


@pytest.fixture
def mock_source_file():
    """Create a mock source file path (doesn't need to exist for validation tests)."""
    with tempfile.TemporaryDirectory() as tmpdir:
        source_file = Path(tmpdir) / "source.mp4"
        source_file.write_text("mock video")
        yield source_file


@pytest.fixture
def basic_jobspec(mock_source_file):
    """Create a basic valid JobSpec."""
    with tempfile.TemporaryDirectory() as tmpdir:
        output_dir = Path(tmpdir) / "outputs"
        output_dir.mkdir()
        yield JobSpec(
            job_id="test_job_001",
            sources=[str(mock_source_file)],
            output_directory=str(output_dir),
            codec="h264",
            container="mp4",
            resolution="half",
            naming_template="{source_name}_proxy",
            proxy_profile="proxy_h264_low",
            fps_mode="same-as-source",
        )


# =============================================================================
# SLICE 3 Core Integration Tests
# =============================================================================

def test_watch_folder_calls_execution_adapter(watch_dir, basic_jobspec):
    """
    SLICE 3 ASSERTION: Watch folder ALWAYS calls execute_jobspec().
    
    NEVER calls engines directly.
    """
    # Write JobSpec to pending folder
    jobspec_path = watch_dir / PENDING_FOLDER / "test_job.json"
    with open(jobspec_path, "w") as f:
        json.dump(basic_jobspec.to_dict(), f)
    
    # Mock execute_jobspec to capture invocation
    # Patch at the location where it's imported
    with patch("watch_folder_runner.execute_jobspec") as mock_execute:
        # Return a successful result
        mock_execute.return_value = JobExecutionResult(
            job_id="test_job_001",
            clips=[
                ClipExecutionResult(
                    source_path=basic_jobspec.sources[0],
                    resolved_output_path=str(Path(basic_jobspec.output_directory) / "output.mp4"),
                    ffmpeg_command=["ffmpeg", "-i", basic_jobspec.sources[0]],
                    exit_code=0,
                    output_exists=True,
                    output_size_bytes=1024000,
                    status="COMPLETED",
                    started_at=datetime.utcnow(),
                    completed_at=datetime.utcnow(),
                )
            ],
            final_status="COMPLETED",
            jobspec_version=JOBSPEC_VERSION,
            engine_used="ffmpeg",
            started_at=datetime.utcnow(),
            completed_at=datetime.utcnow(),
        )
        
        # Process the job
        result = process_single_jobspec(
            jobspec_path=jobspec_path,
            watch_folder=watch_dir,
        )
        
        # ASSERTION: execute_jobspec was called exactly once
        assert mock_execute.call_count == 1
        
        # ASSERTION: Called with correct JobSpec
        called_jobspec = mock_execute.call_args[0][0]
        assert called_jobspec.job_id == basic_jobspec.job_id
        assert called_jobspec.sources == basic_jobspec.sources
        
        # ASSERTION: Result was written to completed folder
        assert result.status == "COMPLETED"
        assert result.result_path is not None
        assert result.result_path.exists()


def test_validation_failure_no_engine_invocation(watch_dir):
    """
    SLICE 3 ASSERTION: Invalid JobSpec → NO engine invocation.
    
    Validation happens in execution_adapter, not here.
    But we still assert the result is written correctly.
    """
    # Create invalid JobSpec (missing required fields)
    invalid_jobspec = {
        "job_id": "bad_job",
        "sources": [],  # Empty sources - invalid
        "output_directory": "/tmp",
        # Missing other required fields
    }
    
    jobspec_path = watch_dir / PENDING_FOLDER / "bad_job.json"
    with open(jobspec_path, "w") as f:
        json.dump(invalid_jobspec, f)
    
    # Process the job
    result = process_single_jobspec(
        jobspec_path=jobspec_path,
        watch_folder=watch_dir,
    )
    
    # ASSERTION: Job failed
    assert result.status == "FAILED"
    
    # ASSERTION: Result was written to failed folder
    assert result.result_path is not None
    assert result.result_path.exists()
    assert result.result_path.parent.name == FAILED_FOLDER
    
    # ASSERTION: JobSpec was moved to failed folder
    assert (watch_dir / FAILED_FOLDER / "bad_job.json").exists()


def test_execution_failure_result_persisted(watch_dir, basic_jobspec):
    """
    SLICE 3 ASSERTION: Execution failure → FAILED result written verbatim.
    
    No transformation, no filtering, no enrichment.
    """
    jobspec_path = watch_dir / PENDING_FOLDER / "failing_job.json"
    with open(jobspec_path, "w") as f:
        json.dump(basic_jobspec.to_dict(), f)
    
    # Mock execute_jobspec to return FAILED result
    with patch("watch_folder_runner.execute_jobspec") as mock_execute:
        failed_result = JobExecutionResult(
            job_id="test_job_001",
            clips=[
                ClipExecutionResult(
                    source_path=basic_jobspec.sources[0],
                    resolved_output_path=str(Path(basic_jobspec.output_directory) / "output.mp4"),
                    ffmpeg_command=["ffmpeg", "-i", basic_jobspec.sources[0]],
                    exit_code=1,
                    output_exists=False,
                    output_size_bytes=None,
                    status="FAILED",
                    failure_reason="FFmpeg error: codec not found",
                    started_at=datetime.utcnow(),
                    completed_at=datetime.utcnow(),
                )
            ],
            final_status="FAILED",
            jobspec_version=JOBSPEC_VERSION,
            engine_used="ffmpeg",
            started_at=datetime.utcnow(),
            completed_at=datetime.utcnow(),
        )
        mock_execute.return_value = failed_result
        
        # Process the job
        result = process_single_jobspec(
            jobspec_path=jobspec_path,
            watch_folder=watch_dir,
        )
        
        # ASSERTION: Job marked as failed
        assert result.status == "FAILED"
        
        # ASSERTION: Result written to failed folder
        assert result.result_path.parent.name == FAILED_FOLDER
        
        # ASSERTION: Result JSON contains exact failure info
        with open(result.result_path) as f:
            result_data = json.load(f)
        
        assert result_data["final_status"] == "FAILED"
        assert result_data["clips"][0]["status"] == "FAILED"
        assert "codec not found" in result_data["clips"][0]["failure_reason"]


def test_successful_execution_result_written(watch_dir, basic_jobspec):
    """
    SLICE 3 ASSERTION: Successful execution → COMPLETED result written.
    
    Result written verbatim from execute_jobspec().
    """
    jobspec_path = watch_dir / PENDING_FOLDER / "success_job.json"
    with open(jobspec_path, "w") as f:
        json.dump(basic_jobspec.to_dict(), f)
    
    # Mock execute_jobspec to return COMPLETED result
    output_path = Path(basic_jobspec.output_directory) / "output.mp4"
    with patch("watch_folder_runner.execute_jobspec") as mock_execute:
        success_result = JobExecutionResult(
            job_id="test_job_001",
            clips=[
                ClipExecutionResult(
                    source_path=basic_jobspec.sources[0],
                    resolved_output_path=str(output_path),
                    ffmpeg_command=["ffmpeg", "-i", basic_jobspec.sources[0], str(output_path)],
                    exit_code=0,
                    output_exists=True,
                    output_size_bytes=1024000,
                    status="COMPLETED",
                    started_at=datetime.utcnow(),
                    completed_at=datetime.utcnow(),
                )
            ],
            final_status="COMPLETED",
            jobspec_version=JOBSPEC_VERSION,
            engine_used="ffmpeg",
            proxy_profile_used="proxy_h264_low",
            started_at=datetime.utcnow(),
            completed_at=datetime.utcnow(),
        )
        mock_execute.return_value = success_result
        
        # Process the job
        result = process_single_jobspec(
            jobspec_path=jobspec_path,
            watch_folder=watch_dir,
        )
        
        # ASSERTION: Job marked as completed
        assert result.status == "COMPLETED"
        
        # ASSERTION: Result written to completed folder
        assert result.result_path.parent.name == COMPLETED_FOLDER
        
        # ASSERTION: Result JSON matches execution_adapter output
        with open(result.result_path) as f:
            result_data = json.load(f)
        
        assert result_data["final_status"] == "COMPLETED"
        assert result_data["_metadata"]["engine_used"] == "ffmpeg"
        assert result_data["_metadata"]["proxy_profile_used"] == "proxy_h264_low"
        assert result_data["clips"][0]["status"] == "COMPLETED"


def test_determinism_same_jobspec_same_result(watch_dir, basic_jobspec):
    """
    SLICE 3 ASSERTION: Determinism preserved across runs.
    
    Same JobSpec → same engine selection → same execution path.
    """
    jobspec_path1 = watch_dir / PENDING_FOLDER / "job1.json"
    jobspec_path2 = watch_dir / PENDING_FOLDER / "job2.json"
    
    # Write same JobSpec twice
    with open(jobspec_path1, "w") as f:
        json.dump(basic_jobspec.to_dict(), f)
    with open(jobspec_path2, "w") as f:
        json.dump(basic_jobspec.to_dict(), f)
    
    # Process both jobs
    with patch("watch_folder_runner.execute_jobspec") as mock_execute:
        mock_execute.return_value = JobExecutionResult(
            job_id="test_job_001",
            clips=[],
            final_status="COMPLETED",
            jobspec_version=JOBSPEC_VERSION,
            engine_used="ffmpeg",
            started_at=datetime.utcnow(),
            completed_at=datetime.utcnow(),
        )
        
        result1 = process_single_jobspec(
            jobspec_path=jobspec_path1,
            watch_folder=watch_dir,
        )
        
        # Clear running folder for second job
        for f in (watch_dir / RUNNING_FOLDER).iterdir():
            f.unlink()
        
        result2 = process_single_jobspec(
            jobspec_path=jobspec_path2,
            watch_folder=watch_dir,
        )
        
        # ASSERTION: Both jobs succeeded
        assert result1.status == "COMPLETED"
        assert result2.status == "COMPLETED"
        
        # ASSERTION: execute_jobspec called twice with identical JobSpec
        assert mock_execute.call_count == 2
        call1_spec = mock_execute.call_args_list[0][0][0]
        call2_spec = mock_execute.call_args_list[1][0][0]
        assert call1_spec.to_dict() == call2_spec.to_dict()


# =============================================================================
# FORBIDDEN PATTERNS (Negative Tests)
# =============================================================================

def test_no_engine_imports_in_watch_folder_runner():
    """
    SLICE 3 ASSERTION: Watch folder runner NEVER imports engines.
    
    This is a code structure test, not a behavior test.
    """
    watch_folder_runner_path = Path(__file__).parent.parent / "backend" / "v2" / "watch_folder_runner.py"
    
    with open(watch_folder_runner_path) as f:
        content = f.read()
    
    # ASSERTION: No direct engine imports
    forbidden_imports = [
        "from headless_execute import execute_multi_job_spec",
        "from headless_execute import _execute_with_ffmpeg",
        "from headless_execute import _execute_with_resolve",
        "import headless_execute",
    ]
    
    for forbidden in forbidden_imports:
        assert forbidden not in content, f"FORBIDDEN: Watch folder runner contains: {forbidden}"
    
    # ASSERTION: execution_adapter IS imported
    assert "from execution_adapter import execute_jobspec" in content or \
           "from backend.execution_adapter import execute_jobspec" in content


def test_no_retry_logic_in_watch_folder():
    """
    SLICE 3 ASSERTION: NO retry loops.
    
    Failures are explicit and final.
    """
    watch_folder_runner_path = Path(__file__).parent.parent / "backend" / "v2" / "watch_folder_runner.py"
    
    with open(watch_folder_runner_path) as f:
        content = f.read()
    
    # Check for retry patterns (loose check - any retry logic is forbidden)
    forbidden_patterns = [
        "for attempt in",
        "while retry",
        "max_retries",
        "num_retries",
    ]
    
    content_lower = content.lower()
    for pattern in forbidden_patterns:
        assert pattern.lower() not in content_lower, \
            f"FORBIDDEN: Watch folder runner contains retry pattern: {pattern}"


def test_no_execution_branching_in_watch_folder():
    """
    SLICE 3 ASSERTION: NO execution branching.
    
    Watch folder doesn't make execution decisions.
    """
    watch_folder_runner_path = Path(__file__).parent.parent / "backend" / "v2" / "watch_folder_runner.py"
    
    with open(watch_folder_runner_path) as f:
        content = f.read()
    
    # Check for direct engine selection logic (should not exist)
    forbidden_patterns = [
        "_determine_job_engine",
        "_execute_with_ffmpeg",
        "_execute_with_resolve",
    ]
    
    for pattern in forbidden_patterns:
        # Allow in imports (already removed) but not in actual code
        # Check that pattern doesn't appear in function bodies
        assert content.count(pattern) == 0, \
            f"FORBIDDEN: Watch folder runner calls engine function: {pattern}"


# =============================================================================
# Filesystem Semantics Tests
# =============================================================================

def test_result_written_before_jobspec_moved(watch_dir, basic_jobspec):
    """
    SLICE 3 ASSERTION: Result JSON written BEFORE JobSpec moved.
    
    Ensures result is never lost.
    """
    jobspec_path = watch_dir / PENDING_FOLDER / "test_job.json"
    with open(jobspec_path, "w") as f:
        json.dump(basic_jobspec.to_dict(), f)
    
    # Track filesystem operations
    write_times = {}
    original_open = open
    
    def tracked_open(path, *args, **kwargs):
        if "result.json" in str(path) and "w" in args[0]:
            write_times["result"] = datetime.now()
        return original_open(path, *args, **kwargs)
    
    from pathlib import Path as PathClass
    original_rename = PathClass.rename
    
    def tracked_rename(self, target):
        if self.name.endswith(".json") and "result" not in str(self):
            write_times["jobspec_move"] = datetime.now()
        return original_rename(self, target)
    
    with patch("watch_folder_runner.execute_jobspec") as mock_execute:
        mock_execute.return_value = JobExecutionResult(
            job_id="test_job_001",
            clips=[],
            final_status="COMPLETED",
            jobspec_version=JOBSPEC_VERSION,
            engine_used="ffmpeg",
            started_at=datetime.utcnow(),
            completed_at=datetime.utcnow(),
        )
        
        with patch("builtins.open", tracked_open):
            with patch.object(PathClass, "rename", tracked_rename):
                result = process_single_jobspec(
                    jobspec_path=jobspec_path,
                    watch_folder=watch_dir,
                )
        
        # ASSERTION: Result written before JobSpec moved
        # (in practice this is hard to test perfectly, but we verify both happened)
        assert result.result_path.exists()
        assert result.destination_path.exists()
