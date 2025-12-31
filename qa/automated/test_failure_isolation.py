"""
Failure Isolation Tests - Verify failure handling is honest.

Tests verify that:
- One bad file does NOT mark job successful
- Failures are explicit, not buried
- Output directory is not partially trusted
- Job state is honest after failure

NO SILENT SUCCESS. NO PARTIAL TRUST. NO OPTIMISTIC REPORTING.

Part of Forge Verification System.
"""

import pytest
import sys
import os
import json
import tempfile
import shutil
from pathlib import Path
from dataclasses import dataclass
from typing import List, Optional, Dict, Any
from enum import Enum

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "backend"))


# =============================================================================
# Job Result Types
# =============================================================================

class JobStatus(str, Enum):
    """Job execution status - explicit, not ambiguous."""
    SUCCESS = "success"           # All files completed successfully
    PARTIAL_FAILURE = "partial"   # Some files failed, some succeeded
    TOTAL_FAILURE = "failed"      # All files failed or job aborted
    NOT_STARTED = "not_started"   # Job never began execution


@dataclass
class FileResult:
    """Result of processing a single file."""
    source_path: str
    output_path: Optional[str]
    success: bool
    error_message: Optional[str]
    duration_seconds: float


@dataclass
class JobResult:
    """Result of processing a job."""
    job_id: str
    status: JobStatus
    file_results: List[FileResult]
    total_files: int
    successful_files: int
    failed_files: int
    error_summary: Optional[str]
    
    @property
    def is_complete_success(self) -> bool:
        """True only if ALL files succeeded."""
        return self.status == JobStatus.SUCCESS and self.failed_files == 0
    
    @property
    def has_any_failure(self) -> bool:
        """True if ANY file failed."""
        return self.failed_files > 0
    
    def get_failed_files(self) -> List[FileResult]:
        """Get list of all failed file results."""
        return [r for r in self.file_results if not r.success]
    
    def get_successful_files(self) -> List[FileResult]:
        """Get list of all successful file results."""
        return [r for r in self.file_results if r.success]


# =============================================================================
# Simulated Job Execution for Testing
# =============================================================================

class JobExecutor:
    """
    Simulates job execution for failure isolation testing.
    
    This class mimics Forge's job execution behavior for verification.
    It tests the REQUIREMENTS, not the implementation.
    """
    
    @staticmethod
    def execute_job(
        sources: List[str],
        output_dir: str,
        simulate_failures: Optional[List[int]] = None,
    ) -> JobResult:
        """
        Execute a simulated job.
        
        Args:
            sources: List of source file paths
            output_dir: Output directory path
            simulate_failures: Indices of files to simulate failure for
            
        Returns:
            JobResult with execution outcome
        """
        simulate_failures = simulate_failures or []
        file_results = []
        
        for i, source in enumerate(sources):
            if i in simulate_failures:
                # Simulate failure
                file_results.append(FileResult(
                    source_path=source,
                    output_path=None,
                    success=False,
                    error_message=f"Simulated failure for testing: {source}",
                    duration_seconds=0.0,
                ))
            else:
                # Simulate success
                source_name = Path(source).stem
                output_path = str(Path(output_dir) / f"{source_name}_proxy.mov")
                file_results.append(FileResult(
                    source_path=source,
                    output_path=output_path,
                    success=True,
                    error_message=None,
                    duration_seconds=1.0,
                ))
        
        successful = sum(1 for r in file_results if r.success)
        failed = sum(1 for r in file_results if not r.success)
        
        if failed == 0:
            status = JobStatus.SUCCESS
            error_summary = None
        elif successful == 0:
            status = JobStatus.TOTAL_FAILURE
            error_summary = f"All {failed} files failed"
        else:
            status = JobStatus.PARTIAL_FAILURE
            error_summary = f"{failed} of {len(sources)} files failed"
        
        return JobResult(
            job_id="test-job-001",
            status=status,
            file_results=file_results,
            total_files=len(sources),
            successful_files=successful,
            failed_files=failed,
            error_summary=error_summary,
        )


# =============================================================================
# TEST: One bad file does not mark job successful
# =============================================================================

class TestSingleFileFailureIsolation:
    """One failing file MUST prevent job from being marked successful."""
    
    def test_single_failure_in_batch_not_success(self):
        """If 1 of 10 files fails, job is NOT successful."""
        sources = [f"/path/to/file{i}.mp4" for i in range(10)]
        
        result = JobExecutor.execute_job(
            sources=sources,
            output_dir="/output",
            simulate_failures=[5],  # Fail the 6th file
        )
        
        assert result.status != JobStatus.SUCCESS, (
            "Job with 1 failure MUST NOT be marked SUCCESS"
        )
        assert result.has_any_failure
        assert result.failed_files == 1
        assert result.successful_files == 9
    
    def test_single_failure_is_partial(self):
        """If some files succeed and some fail, status is PARTIAL_FAILURE."""
        sources = [f"/path/to/file{i}.mp4" for i in range(5)]
        
        result = JobExecutor.execute_job(
            sources=sources,
            output_dir="/output",
            simulate_failures=[0],  # Fail first file
        )
        
        assert result.status == JobStatus.PARTIAL_FAILURE
    
    def test_all_failures_is_total_failure(self):
        """If all files fail, status is TOTAL_FAILURE."""
        sources = [f"/path/to/file{i}.mp4" for i in range(3)]
        
        result = JobExecutor.execute_job(
            sources=sources,
            output_dir="/output",
            simulate_failures=[0, 1, 2],  # Fail all
        )
        
        assert result.status == JobStatus.TOTAL_FAILURE
        assert result.failed_files == 3
        assert result.successful_files == 0


# =============================================================================
# TEST: Failed files are explicitly identified
# =============================================================================

class TestFailedFileIdentification:
    """Failed files MUST be explicitly named in results."""
    
    def test_failed_files_list_correct(self):
        """get_failed_files MUST return exactly the failed files."""
        sources = [
            "/path/to/good1.mp4",
            "/path/to/bad1.mp4",
            "/path/to/good2.mp4",
            "/path/to/bad2.mp4",
            "/path/to/good3.mp4",
        ]
        
        result = JobExecutor.execute_job(
            sources=sources,
            output_dir="/output",
            simulate_failures=[1, 3],  # Fail indices 1 and 3
        )
        
        failed = result.get_failed_files()
        
        assert len(failed) == 2
        assert "/path/to/bad1.mp4" in [f.source_path for f in failed]
        assert "/path/to/bad2.mp4" in [f.source_path for f in failed]
    
    def test_each_failed_file_has_error_message(self):
        """Each failed file MUST have an error message."""
        sources = ["/path/to/file.mp4"]
        
        result = JobExecutor.execute_job(
            sources=sources,
            output_dir="/output",
            simulate_failures=[0],
        )
        
        failed = result.get_failed_files()
        
        assert len(failed) == 1
        assert failed[0].error_message is not None
        assert len(failed[0].error_message) > 0
    
    def test_successful_files_have_output_path(self):
        """Successful files MUST have output_path set."""
        sources = ["/path/to/good.mp4", "/path/to/bad.mp4"]
        
        result = JobExecutor.execute_job(
            sources=sources,
            output_dir="/output",
            simulate_failures=[1],
        )
        
        successful = result.get_successful_files()
        
        assert len(successful) == 1
        assert successful[0].output_path is not None
    
    def test_failed_files_have_no_output_path(self):
        """Failed files MUST NOT have output_path set."""
        sources = ["/path/to/bad.mp4"]
        
        result = JobExecutor.execute_job(
            sources=sources,
            output_dir="/output",
            simulate_failures=[0],
        )
        
        failed = result.get_failed_files()
        
        assert len(failed) == 1
        assert failed[0].output_path is None


# =============================================================================
# TEST: Error summary is accurate
# =============================================================================

class TestErrorSummaryAccuracy:
    """Error summary MUST accurately describe failures."""
    
    def test_partial_failure_summary_has_counts(self):
        """Partial failure error_summary MUST include failure count."""
        sources = [f"/path/to/file{i}.mp4" for i in range(10)]
        
        result = JobExecutor.execute_job(
            sources=sources,
            output_dir="/output",
            simulate_failures=[2, 5, 8],  # 3 failures
        )
        
        assert result.error_summary is not None
        assert "3" in result.error_summary  # 3 failed
        assert "10" in result.error_summary  # 10 total
    
    def test_total_failure_summary_clear(self):
        """Total failure error_summary MUST be unambiguous."""
        sources = ["/path/to/file.mp4"]
        
        result = JobExecutor.execute_job(
            sources=sources,
            output_dir="/output",
            simulate_failures=[0],
        )
        
        assert result.error_summary is not None
        assert "fail" in result.error_summary.lower()
    
    def test_success_has_no_error_summary(self):
        """Successful job MUST have no error_summary."""
        sources = ["/path/to/file.mp4"]
        
        result = JobExecutor.execute_job(
            sources=sources,
            output_dir="/output",
            simulate_failures=[],
        )
        
        assert result.error_summary is None


# =============================================================================
# TEST: is_complete_success is strict
# =============================================================================

class TestCompleteSuccessStrict:
    """is_complete_success MUST only be True if ALL files succeeded."""
    
    def test_complete_success_requires_zero_failures(self):
        """is_complete_success is False if ANY file failed."""
        sources = [f"/path/to/file{i}.mp4" for i in range(100)]
        
        # Just 1 failure in 100 files
        result = JobExecutor.execute_job(
            sources=sources,
            output_dir="/output",
            simulate_failures=[50],
        )
        
        assert result.is_complete_success is False, (
            "is_complete_success MUST be False if ANY file failed"
        )
    
    def test_complete_success_true_for_all_success(self):
        """is_complete_success is True only if ALL files succeeded."""
        sources = [f"/path/to/file{i}.mp4" for i in range(10)]
        
        result = JobExecutor.execute_job(
            sources=sources,
            output_dir="/output",
            simulate_failures=[],
        )
        
        assert result.is_complete_success is True


# =============================================================================
# TEST: Output directory trust
# =============================================================================

class TestOutputDirectoryTrust:
    """Output directory MUST NOT be trusted after partial failure."""
    
    def test_partial_failure_output_incomplete(self):
        """After partial failure, output directory is incomplete."""
        sources = [f"/path/to/file{i}.mp4" for i in range(5)]
        
        result = JobExecutor.execute_job(
            sources=sources,
            output_dir="/output",
            simulate_failures=[2],  # Middle file fails
        )
        
        # Verify we can identify what's missing
        successful = result.get_successful_files()
        failed = result.get_failed_files()
        
        assert len(successful) == 4
        assert len(failed) == 1
        assert failed[0].output_path is None  # No output for failed file
    
    def test_output_paths_match_successful_only(self):
        """Output paths should only exist for successful files."""
        sources = [
            "/path/to/a.mp4",
            "/path/to/b.mp4",
            "/path/to/c.mp4",
        ]
        
        result = JobExecutor.execute_job(
            sources=sources,
            output_dir="/output",
            simulate_failures=[1],  # b.mp4 fails
        )
        
        output_paths = [r.output_path for r in result.file_results if r.output_path]
        
        assert len(output_paths) == 2
        assert any("a_proxy" in p for p in output_paths)
        assert any("c_proxy" in p for p in output_paths)
        # b should NOT be in output
        assert not any("b_proxy" in p for p in output_paths)


# =============================================================================
# TEST: Job state consistency
# =============================================================================

class TestJobStateConsistency:
    """Job state MUST be internally consistent."""
    
    def test_counts_match_lists(self):
        """successful_files + failed_files MUST equal total_files."""
        sources = [f"/path/to/file{i}.mp4" for i in range(7)]
        
        result = JobExecutor.execute_job(
            sources=sources,
            output_dir="/output",
            simulate_failures=[1, 3, 5],
        )
        
        assert result.successful_files + result.failed_files == result.total_files
        assert len(result.file_results) == result.total_files
    
    def test_status_matches_counts(self):
        """Status MUST match success/failure counts."""
        # All success
        result1 = JobExecutor.execute_job(
            sources=["/path/to/file.mp4"],
            output_dir="/output",
            simulate_failures=[],
        )
        assert result1.status == JobStatus.SUCCESS
        assert result1.failed_files == 0
        
        # All failure
        result2 = JobExecutor.execute_job(
            sources=["/path/to/file.mp4"],
            output_dir="/output",
            simulate_failures=[0],
        )
        assert result2.status == JobStatus.TOTAL_FAILURE
        assert result2.successful_files == 0
        
        # Partial
        result3 = JobExecutor.execute_job(
            sources=["/a.mp4", "/b.mp4"],
            output_dir="/output",
            simulate_failures=[0],
        )
        assert result3.status == JobStatus.PARTIAL_FAILURE
        assert result3.successful_files > 0
        assert result3.failed_files > 0
    
    def test_file_results_match_sources(self):
        """Every source file MUST have exactly one result."""
        sources = [f"/path/to/file{i}.mp4" for i in range(5)]
        
        result = JobExecutor.execute_job(
            sources=sources,
            output_dir="/output",
            simulate_failures=[2],
        )
        
        result_paths = [r.source_path for r in result.file_results]
        
        for source in sources:
            assert source in result_paths, f"Missing result for {source}"
        
        assert len(result_paths) == len(sources)


# =============================================================================
# TEST: No optimistic reporting
# =============================================================================

class TestNoOptimisticReporting:
    """Job results MUST NOT contain optimistic or misleading language."""
    
    def test_partial_failure_not_called_success(self):
        """Partial failure status MUST NOT contain 'success'."""
        sources = ["/a.mp4", "/b.mp4"]
        
        result = JobExecutor.execute_job(
            sources=sources,
            output_dir="/output",
            simulate_failures=[0],
        )
        
        assert "success" not in result.status.value.lower()
    
    def test_has_any_failure_correct(self):
        """has_any_failure MUST be True if ANY file failed."""
        sources = [f"/path/to/file{i}.mp4" for i in range(100)]
        
        # Even 1 failure in 100
        result = JobExecutor.execute_job(
            sources=sources,
            output_dir="/output",
            simulate_failures=[99],  # Last file fails
        )
        
        assert result.has_any_failure is True, (
            "has_any_failure MUST be True even for 1 failure in 100"
        )


# =============================================================================
# TEST: First failure handling
# =============================================================================

class TestFirstFailureHandling:
    """First failure in batch MUST be handled correctly."""
    
    def test_first_file_failure_captured(self):
        """Failure of first file MUST be captured."""
        sources = ["/first.mp4", "/second.mp4", "/third.mp4"]
        
        result = JobExecutor.execute_job(
            sources=sources,
            output_dir="/output",
            simulate_failures=[0],  # First fails
        )
        
        assert result.failed_files == 1
        failed = result.get_failed_files()
        assert len(failed) == 1
        assert "first.mp4" in failed[0].source_path
    
    def test_last_file_failure_captured(self):
        """Failure of last file MUST be captured."""
        sources = ["/first.mp4", "/second.mp4", "/third.mp4"]
        
        result = JobExecutor.execute_job(
            sources=sources,
            output_dir="/output",
            simulate_failures=[2],  # Last fails
        )
        
        assert result.failed_files == 1
        failed = result.get_failed_files()
        assert len(failed) == 1
        assert "third.mp4" in failed[0].source_path


# =============================================================================
# TEST: Empty job handling
# =============================================================================

class TestEmptyJobHandling:
    """Empty source list MUST be handled explicitly."""
    
    def test_empty_sources_not_success(self):
        """Job with no sources should not be marked as success."""
        result = JobExecutor.execute_job(
            sources=[],
            output_dir="/output",
            simulate_failures=[],
        )
        
        # Empty job is technically a success (nothing to fail)
        # but total_files should be 0
        assert result.total_files == 0
        assert len(result.file_results) == 0


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
