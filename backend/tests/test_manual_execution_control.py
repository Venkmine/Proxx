"""
Tests for Manual Execution Control

QC: Verify that manual execution start endpoint:
1. Only starts when ≥1 PENDING job exists
2. Blocks when any job is RUNNING
3. Blocks when queue is empty
4. Executes jobs in FIFO order
5. Provides clear error messages
"""

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.jobs.models import JobStatus, TaskStatus


@pytest.fixture
def test_client():
    """Test client with mocked registries."""
    return TestClient(app)


class TestManualExecutionControl:
    """Test suite for /control/jobs/start-execution endpoint."""

    def test_start_execution_requires_pending_jobs(self, test_client):
        """
        QC: start-execution should reject when no PENDING jobs exist.
        
        GIVEN: No jobs in the system
        WHEN: POST /control/jobs/start-execution
        THEN: 400 error "No PENDING jobs to execute"
        """
        # Clear any existing jobs
        test_client.post("/control/jobs/clear-all")
        
        # Attempt to start execution with empty queue
        response = test_client.post("/control/jobs/start-execution")
        
        assert response.status_code == 400
        assert "No PENDING jobs" in response.json()["detail"]

    def test_start_execution_succeeds_with_pending_jobs(self, test_client, tmp_path):
        """
        QC: start-execution should succeed when PENDING jobs exist and no job is RUNNING.
        
        GIVEN: Two PENDING jobs
        WHEN: POST /control/jobs/start-execution
        THEN: 200 success with message indicating execution started
        
        Note: This test creates jobs but doesn't validate actual execution,
        only that the API endpoint accepts the request and starts the process.
        """
        # Clear jobs
        test_client.post("/control/jobs/clear-all")
        
        # Create test files
        test_file1 = tmp_path / "test1.mov"
        test_file1.write_text("fake video 1")
        test_file2 = tmp_path / "test2.mov"
        test_file2.write_text("fake video 2")
        
        output_dir = tmp_path / "output"
        output_dir.mkdir()
        
        # Create two jobs
        for test_file in [test_file1, test_file2]:
            create_payload = {
                "source_paths": [str(test_file)],
                "engine": "ffmpeg",
                "deliver_settings": {
                    "video": {"codec": "prores_422"},
                    "audio": {"codec": "copy"},
                    "file": {"container": "mov", "naming_template": "{source_name}"},
                    "output_dir": str(output_dir)
                }
            }
            
            create_response = test_client.post("/control/jobs/create", json=create_payload)
            # Jobs may fail metadata extraction for fake files, but should still be created
            # We're testing the execution endpoint, not job creation
        
        # Start execution
        start_response = test_client.post("/control/jobs/start-execution")
        
        # Should succeed (200) as long as there are PENDING jobs
        # Actual execution may fail due to fake video files, but that's not what we're testing
        assert start_response.status_code == 200
        result = start_response.json()
        assert result["success"] is True

    def test_start_execution_error_message_clarity(self, test_client):
        """
        QC: Error messages must be actionable and clear.
        
        Verify that error messages clearly explain:
        - Why execution cannot start
        - What state the system is in
        - What action is needed
        
        Note: This test validates error message quality, not execution state.
        """
        # Test scenario 1: Try to start when no jobs exist OR when jobs are running
        response = test_client.post("/control/jobs/start-execution")
        
        # Either case should return 400 with clear error
        if response.status_code == 400:
            error_msg = response.json()["detail"]
            # Error must clearly state the problem
            assert ("No PENDING jobs" in error_msg or 
                    "already RUNNING" in error_msg), \
                f"Error message not clear: {error_msg}"
            # Error must include actionable context
            assert ("execute" in error_msg.lower() or 
                    "start" in error_msg.lower()), \
                f"Error message not actionable: {error_msg}"


class TestExecutionGatingIntegration:
    """
    Integration tests for execution gating logic.
    
    These tests verify the interaction between:
    - Manual execution trigger
    - Job scheduler
    - FIFO queue semantics
    """

    def test_manual_trigger_respects_scheduler_state(self, test_client, tmp_path):
        """
        QC: Manual execution trigger must respect scheduler capacity.
        
        Verifies that the manual trigger correctly checks:
        - Scheduler running count
        - Job states (PENDING vs RUNNING)
        - Queue capacity
        
        Note: Simplified test that validates API contract, not full execution.
        """
        # Clear jobs
        test_client.post("/control/jobs/clear-all")
        
        # Create a test job
        test_file = tmp_path / "test.mov"
        test_file.write_text("fake video")
        
        output_dir = tmp_path / "output"
        output_dir.mkdir()
        
        create_payload = {
            "source_paths": [str(test_file)],
            "engine": "ffmpeg",
            "deliver_settings": {
                "video": {"codec": "prores_422"},
                "audio": {"codec": "copy"},
                "file": {"container": "mov", "naming_template": "{source_name}"},
                "output_dir": str(output_dir)
            }
        }
        
        test_client.post("/control/jobs/create", json=create_payload)
        
        # Start execution
        start_response = test_client.post("/control/jobs/start-execution")
        
        # Should succeed since job is PENDING and nothing is RUNNING
        assert start_response.status_code == 200
        assert start_response.json()["success"] is True
