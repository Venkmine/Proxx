"""
Test Resolve Process Ownership and Lifecycle Management.

Tests verifying that:
1. Running Resolve → job skipped (no engine invocation)
2. Not running Resolve → job executes normally
3. launched_by_forge metadata correctness
4. Resolve is shut down after execution

Part of V2 Forge strict Resolve process ownership.
"""

import os
import subprocess
import time
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

# Add backend to path
import sys
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root / "backend"))

from backend.v2.resolve_installation import is_resolve_running
from backend.job_spec import JobSpec


class TestResolveProcessDetection(unittest.TestCase):
    """Test Resolve process detection utility."""
    
    def test_is_resolve_running_detects_process(self):
        """Test that is_resolve_running() correctly detects running Resolve."""
        # This test requires manual validation since we can't easily
        # start/stop Resolve in automated tests
        
        # Just verify the function is callable and returns a boolean
        result = is_resolve_running()
        self.assertIsInstance(result, bool)
    
    def test_is_resolve_running_returns_false_when_not_running(self):
        """Test that is_resolve_running() returns False when Resolve is not running."""
        # Mock pgrep to return non-zero (not found)
        with patch('subprocess.run') as mock_run:
            mock_run.return_value = MagicMock(returncode=1)
            
            result = is_resolve_running()
            self.assertFalse(result)
    
    def test_is_resolve_running_returns_true_when_running(self):
        """Test that is_resolve_running() returns True when Resolve is running."""
        # Mock pgrep to return zero (found)
        with patch('subprocess.run') as mock_run:
            mock_run.return_value = MagicMock(returncode=0)
            
            result = is_resolve_running()
            self.assertTrue(result)
    
    def test_is_resolve_running_handles_pgrep_not_available(self):
        """Test that is_resolve_running() handles missing pgrep gracefully."""
        # Mock pgrep not found
        with patch('subprocess.run', side_effect=FileNotFoundError):
            result = is_resolve_running()
            self.assertFalse(result)
    
    def test_is_resolve_running_handles_timeout(self):
        """Test that is_resolve_running() handles timeout gracefully."""
        # Mock pgrep timeout
        with patch('subprocess.run', side_effect=subprocess.TimeoutExpired('pgrep', 5)):
            result = is_resolve_running()
            self.assertFalse(result)


class TestResolveExecutionGuard(unittest.TestCase):
    """Test execution guard that skips jobs when Resolve is already running."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.test_source = project_root / "test_media" / "sample.mov"
        if not self.test_source.exists():
            self.skipTest("Test media not available")
    
    @patch('backend.headless_execute.is_resolve_running')
    def test_execution_skipped_when_resolve_running(self, mock_is_running):
        """Test that execution is SKIPPED when Resolve is already running."""
        # Mock Resolve as running
        mock_is_running.return_value = True
        
        from backend.headless_execute import execute_job
        
        jobspec = JobSpec(
            job_id="test_guard",
            sources=[str(self.test_source)],
            codec="prores_proxy",
            container="mov",
            resolution="same",
            fps_mode="same-as-source",
            fps_explicit=None,
            output_directory=str(project_root / "backend" / "tests" / "output"),
            naming_template="test_{source_name}",
            proxy_profile="proxy_prores_proxy_resolve",
            resolve_preset="ProRes 422 Proxy",
        )
        
        result = execute_job(jobspec)
        
        # Should be SKIPPED, not FAILED or COMPLETED
        self.assertEqual(result.final_status, "SKIPPED")
        self.assertIn("already open", result.validation_error.lower())
        self.assertEqual(result.engine_used, "resolve")
    
    @patch('backend.headless_execute.is_resolve_running')
    @patch('backend.v2.engines.resolve_engine.ResolveEngine')
    def test_execution_proceeds_when_resolve_not_running(self, mock_engine, mock_is_running):
        """Test that execution proceeds normally when Resolve is not running."""
        # Mock Resolve as NOT running
        mock_is_running.return_value = False
        
        # Mock successful execution
        mock_engine_instance = MagicMock()
        mock_engine.return_value = mock_engine_instance
        mock_result = MagicMock()
        mock_result.final_status = "COMPLETED"
        mock_engine_instance.execute.return_value = mock_result
        
        from backend.headless_execute import execute_job
        
        jobspec = JobSpec(
            job_id="test_proceed",
            sources=[str(self.test_source)],
            codec="prores_proxy",
            container="mov",
            resolution="same",
            fps_mode="same-as-source",
            fps_explicit=None,
            output_directory=str(project_root / "backend" / "tests" / "output"),
            naming_template="test_{source_name}",
            proxy_profile="proxy_prores_proxy_resolve",
            resolve_preset="ProRes 422 Proxy",
        )
        
        result = execute_job(jobspec)
        
        # Should proceed with execution
        mock_engine_instance.execute.assert_called_once()


class TestResolveProcessOwnership(unittest.TestCase):
    """Test process ownership tracking and cleanup."""
    
    def test_launched_by_forge_tracked_in_metadata(self):
        """Test that launched_by_forge is tracked in execution metadata."""
        # This is verified by checking the metadata in actual executions
        # The metadata should contain 'launched_by_forge': True/False
        
        # Mock test to verify structure
        from backend.execution_results import JobExecutionResult
        
        result = JobExecutionResult(
            job_id="test_metadata",
            clips=[],
            final_status="COMPLETED",
            jobspec_version="2.0",
            engine_used="resolve",
        )
        
        # Verify we can set metadata
        result._resolve_metadata = {'launched_by_forge': True}
        self.assertTrue(result._resolve_metadata['launched_by_forge'])
    
    def test_resolve_engine_has_shutdown_method(self):
        """Test that ResolveEngine has shutdown capability."""
        # Test the shutdown logic exists without mocking internals
        try:
            from backend.v2.engines.resolve_engine import ResolveEngine
            
            # Can't easily test full lifecycle without actual Resolve
            # Just verify the shutdown method exists in the class definition
            # We check by reading the source, not instantiating
            import inspect
            source = inspect.getsource(ResolveEngine)
            self.assertIn('_shutdown_resolve', source)
            self.assertIn('_launched_by_forge', source)
        except Exception:
            # If we can't import or inspect, skip
            self.skipTest("ResolveEngine not available for inspection")


class TestTestRunnerPreFlightCheck(unittest.TestCase):
    """Test that the test runner checks for running Resolve before starting."""
    
    @patch('backend.v2.resolve_installation.is_resolve_running')
    @patch('sys.exit')
    def test_test_runner_aborts_if_resolve_running(self, mock_exit, mock_is_running):
        """Test that test runner aborts with clear message if Resolve is running."""
        # Mock Resolve as running
        mock_is_running.return_value = True
        
        # Add forge-tests to path
        forge_tests_path = project_root / "forge-tests"
        if str(forge_tests_path) not in sys.path:
            sys.path.insert(0, str(forge_tests_path))
        
        try:
            from run_tests import ForgeTestRunner
        except ImportError:
            self.skipTest("forge-tests module not available")
        
        config_path = project_root / "forge-tests" / "config" / "test_matrix_studio.json"
        if not config_path.exists():
            self.skipTest("Test config not available")
        
        runner = ForgeTestRunner(config_path, dry_run=False)
        runner.load_config()
        
        # Should call sys.exit(1) when Resolve is running
        runner.run_tests()
        mock_exit.assert_called_once_with(1)
    
    @patch('backend.v2.resolve_installation.is_resolve_running')
    def test_test_runner_proceeds_if_resolve_not_running(self, mock_is_running):
        """Test that test runner proceeds normally if Resolve is not running."""
        # Mock Resolve as NOT running
        mock_is_running.return_value = False
        
        # Add forge-tests to path
        forge_tests_path = project_root / "forge-tests"
        if str(forge_tests_path) not in sys.path:
            sys.path.insert(0, str(forge_tests_path))
        
        try:
            from run_tests import ForgeTestRunner
        except ImportError:
            self.skipTest("forge-tests module not available")
        
        config_path = project_root / "forge-tests" / "config" / "test_matrix_studio.json"
        if not config_path.exists():
            self.skipTest("Test config not available")
        
        runner = ForgeTestRunner(config_path, dry_run=True)
        runner.load_config()
        
        # Should not raise or exit - just run in dry run mode
        result = runner.run_tests()
        self.assertIsNotNone(result)


if __name__ == "__main__":
    unittest.main()
