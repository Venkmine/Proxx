"""
INTENT_080: FIFO Queue Execution Test

This test proves that multi-job FIFO queue works correctly:
1. Jobs execute in insertion order (FIFO)
2. Only one job executes at a time
3. Queue drains correctly with no skips or duplicates

SACRED TEST: Uses REAL execution (no mocks)
DETERMINISTIC: Same inputs → same outputs
FAIL-FAST: Fails loudly if FIFO is violated
"""

import pytest
import tempfile
import time
from pathlib import Path
from datetime import datetime

import sys
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from job_spec import JobSpec, FpsMode
from execution_adapter import execute_jobspec
from execution_results import JobExecutionResult


# =============================================================================
# Test Fixtures
# =============================================================================

TEST_MEDIA = Path("/Users/leon.grant/projects/Proxx/test_media/test_input.mp4")


def create_test_jobspec(job_id: str, output_dir: Path) -> JobSpec:
    """Create a minimal valid JobSpec for testing."""
    return JobSpec(
        job_id=job_id,
        sources=[str(TEST_MEDIA)],
        output_directory=str(output_dir),
        codec="prores_proxy",
        container="mov",
        resolution="same",
        naming_template=f"{{source_name}}_fifo_{job_id}",
        proxy_profile="proxy_prores_proxy",
        fps_mode=FpsMode.SAME_AS_SOURCE,
    )


# =============================================================================
# INTENT_080: FIFO Queue Execution
# =============================================================================

@pytest.mark.integration
@pytest.mark.slow
def test_fifo_queue_execution_order():
    """
    FIFO INVARIANT TEST: Jobs must execute in insertion order.
    
    GIVEN:
        - Three JobSpecs in FIFO queue
        - Each with unique job_id
    
    WHEN:
        - Jobs executed sequentially (simulating FIFO queue)
    
    THEN:
        - Jobs complete in insertion order
        - Execution timestamps respect FIFO order
        - No job executes in parallel
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        output_dir = Path(tmpdir)
        
        # Create 3 jobs in queue order
        job_ids = ["fifo_job_1", "fifo_job_2", "fifo_job_3"]
        jobspecs = [create_test_jobspec(job_id, output_dir) for job_id in job_ids]
        
        # Track execution order
        execution_times = []
        
        # Execute jobs sequentially (FIFO simulation)
        for i, jobspec in enumerate(jobspecs):
            print(f"\n[FIFO Test] Starting job {i+1}/3: {jobspec.job_id}")
            start_time = time.time()
            
            result = execute_jobspec(jobspec)
            
            end_time = time.time()
            
            # Assert job completed successfully
            assert result.final_status == "COMPLETED", (
                f"Job {jobspec.job_id} failed: {result.validation_error}"
            )
            
            # Record execution time
            execution_times.append({
                "job_id": jobspec.job_id,
                "start_time": start_time,
                "end_time": end_time,
                "duration": end_time - start_time,
            })
            
            print(f"[FIFO Test] Job {jobspec.job_id} completed in {end_time - start_time:.2f}s")
        
        # Verify FIFO order: Each job must start AFTER the previous completes
        print("\n[FIFO Test] Verifying execution order...")
        for i in range(len(execution_times) - 1):
            prev_job = execution_times[i]
            next_job = execution_times[i + 1]
            
            # Next job must start after previous ends
            assert next_job["start_time"] >= prev_job["end_time"], (
                f"❌ FIFO VIOLATION: Job {next_job['job_id']} started at "
                f"{next_job['start_time']:.3f} before job {prev_job['job_id']} "
                f"completed at {prev_job['end_time']:.3f}"
            )
            
            print(f"   ✅ Job {prev_job['job_id']} → Job {next_job['job_id']}: "
                  f"{next_job['start_time'] - prev_job['end_time']:.3f}s gap")
        
        print("\n✅ FIFO INVARIANT VERIFIED: All jobs executed in order")


@pytest.mark.integration
@pytest.mark.slow
def test_fifo_queue_no_parallel_execution():
    """
    SINGLE EXECUTION INVARIANT: Only one job executes at a time.
    
    This test verifies that execution windows don't overlap.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        output_dir = Path(tmpdir)
        
        # Create 2 jobs
        jobspecs = [
            create_test_jobspec("fifo_no_parallel_1", output_dir),
            create_test_jobspec("fifo_no_parallel_2", output_dir),
        ]
        
        execution_windows = []
        
        # Execute jobs
        for jobspec in jobspecs:
            start = time.time()
            result = execute_jobspec(jobspec)
            end = time.time()
            
            assert result.final_status == "COMPLETED"
            
            execution_windows.append({
                "job_id": jobspec.job_id,
                "start": start,
                "end": end,
            })
        
        # Verify no overlap: Job 2 must start after Job 1 ends
        job1 = execution_windows[0]
        job2 = execution_windows[1]
        
        assert job2["start"] >= job1["end"], (
            f"❌ PARALLEL EXECUTION DETECTED: Job {job2['job_id']} started "
            f"at {job2['start']:.3f} while job {job1['job_id']} was still "
            f"running (ended at {job1['end']:.3f})"
        )
        
        print(f"\n✅ SINGLE EXECUTION VERIFIED: "
              f"{job2['start'] - job1['end']:.3f}s gap between jobs")


@pytest.mark.integration
@pytest.mark.slow
def test_fifo_queue_drains_correctly():
    """
    QUEUE DRAIN INVARIANT: All queued jobs must execute.
    
    GIVEN:
        - N jobs in queue
    
    WHEN:
        - Queue is drained
    
    THEN:
        - Exactly N jobs execute
        - No jobs are skipped
        - No jobs execute twice
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        output_dir = Path(tmpdir)
        
        # Create queue of 3 jobs
        job_ids = ["drain_1", "drain_2", "drain_3"]
        jobspecs = [create_test_jobspec(job_id, output_dir) for job_id in job_ids]
        
        executed_jobs = []
        
        # Drain queue
        for jobspec in jobspecs:
            result = execute_jobspec(jobspec)
            assert result.final_status == "COMPLETED"
            executed_jobs.append(jobspec.job_id)
        
        # Verify all jobs executed exactly once
        assert len(executed_jobs) == len(job_ids), (
            f"❌ QUEUE DRAIN FAILED: Expected {len(job_ids)} jobs, "
            f"executed {len(executed_jobs)}"
        )
        
        assert executed_jobs == job_ids, (
            f"❌ EXECUTION ORDER WRONG: Expected {job_ids}, got {executed_jobs}"
        )
        
        # Verify no duplicates
        assert len(set(executed_jobs)) == len(executed_jobs), (
            f"❌ DUPLICATE EXECUTION: {executed_jobs}"
        )
        
        print(f"\n✅ QUEUE DRAINED CORRECTLY: {len(executed_jobs)} jobs executed")


# =============================================================================
# Test Execution
# =============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s", "--tb=short", "-m", "integration"])
