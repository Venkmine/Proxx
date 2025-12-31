"""
Engine Selection Guard Tests - Verify engine availability checks.

Tests verify that:
- Resolve already running → job FAILS with explanation
- Resolve Free detected → job FAILS at creation (for RAW formats)
- FFmpeg missing → job FAILS before execution

NO SILENT FALLBACK. NO ASSUMED AVAILABILITY. NO PARTIAL EXECUTION.

Part of Forge Verification System.
"""

import pytest
import sys
import os
import shutil
import subprocess
from pathlib import Path
from typing import Optional, Tuple
from unittest.mock import patch, MagicMock
from dataclasses import dataclass
from enum import Enum

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "backend"))

from v2.source_capabilities import ExecutionEngine


# =============================================================================
# Engine Availability Types
# =============================================================================

class ResolveEdition(str, Enum):
    """DaVinci Resolve edition."""
    STUDIO = "studio"
    FREE = "free"
    NOT_INSTALLED = "not_installed"
    UNKNOWN = "unknown"


@dataclass
class EngineStatus:
    """Status of an execution engine."""
    available: bool
    running: bool
    edition: Optional[str]  # For Resolve
    version: Optional[str]
    error_message: Optional[str]


class EngineAvailabilityError(Exception):
    """Raised when required engine is not available."""
    
    def __init__(self, engine: str, reason: str, recommendation: str):
        self.engine = engine
        self.reason = reason
        self.recommendation = recommendation
        super().__init__(f"{engine} not available: {reason}. {recommendation}")


# =============================================================================
# Engine Availability Checker
# =============================================================================

class EngineChecker:
    """
    Check engine availability before job execution.
    
    This is a verification-focused implementation that tests requirements.
    """
    
    @staticmethod
    def check_ffmpeg() -> EngineStatus:
        """
        Check if FFmpeg is available.
        
        Returns:
            EngineStatus with availability info
        """
        ffmpeg_path = shutil.which("ffmpeg")
        
        if not ffmpeg_path:
            return EngineStatus(
                available=False,
                running=False,
                edition=None,
                version=None,
                error_message="FFmpeg not found in PATH",
            )
        
        # Get version
        try:
            result = subprocess.run(
                [ffmpeg_path, "-version"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            version_line = result.stdout.split("\n")[0] if result.stdout else "unknown"
        except Exception as e:
            version_line = f"error: {e}"
        
        return EngineStatus(
            available=True,
            running=False,  # FFmpeg doesn't run as daemon
            edition=None,
            version=version_line,
            error_message=None,
        )
    
    @staticmethod
    def check_resolve() -> EngineStatus:
        """
        Check if DaVinci Resolve is available.
        
        This checks:
        1. Is Resolve installed?
        2. Is Resolve currently running?
        3. Is it Studio or Free edition?
        
        Returns:
            EngineStatus with availability info
        """
        # Check if Resolve is running
        is_running = EngineChecker._is_resolve_running()
        
        # Check installation
        install_info = EngineChecker._get_resolve_installation()
        
        if install_info is None:
            return EngineStatus(
                available=False,
                running=False,
                edition=None,
                version=None,
                error_message="DaVinci Resolve not installed",
            )
        
        edition, version = install_info
        
        return EngineStatus(
            available=True,
            running=is_running,
            edition=edition,
            version=version,
            error_message=None,
        )
    
    @staticmethod
    def _is_resolve_running() -> bool:
        """Check if Resolve process is currently running."""
        try:
            if sys.platform == "darwin":
                # macOS
                result = subprocess.run(
                    ["pgrep", "-f", "DaVinci Resolve"],
                    capture_output=True,
                    timeout=5,
                )
                return result.returncode == 0
            elif sys.platform == "win32":
                # Windows
                result = subprocess.run(
                    ["tasklist", "/FI", "IMAGENAME eq Resolve.exe"],
                    capture_output=True,
                    text=True,
                    timeout=5,
                )
                return "Resolve.exe" in result.stdout
            else:
                # Linux
                result = subprocess.run(
                    ["pgrep", "-f", "resolve"],
                    capture_output=True,
                    timeout=5,
                )
                return result.returncode == 0
        except Exception:
            return False
    
    @staticmethod
    def _get_resolve_installation() -> Optional[Tuple[str, str]]:
        """
        Get Resolve installation info.
        
        Returns:
            Tuple of (edition, version) or None if not installed
        """
        if sys.platform == "darwin":
            # Check for Resolve on macOS
            studio_path = Path("/Applications/DaVinci Resolve Studio/DaVinci Resolve.app")
            free_path = Path("/Applications/DaVinci Resolve/DaVinci Resolve.app")
            
            if studio_path.exists():
                return ("studio", "detected")
            elif free_path.exists():
                return ("free", "detected")
        
        # Add Windows/Linux detection as needed
        return None
    
    @classmethod
    def validate_engine_for_job(
        cls,
        engine: ExecutionEngine,
        requires_studio: bool = False,
    ) -> None:
        """
        Validate that required engine is available for job execution.
        
        Args:
            engine: Required execution engine
            requires_studio: If True, Resolve Studio is required (RAW formats)
            
        Raises:
            EngineAvailabilityError: If engine is not available
        """
        if engine == ExecutionEngine.FFMPEG:
            status = cls.check_ffmpeg()
            
            if not status.available:
                raise EngineAvailabilityError(
                    engine="FFmpeg",
                    reason=status.error_message or "FFmpeg not found",
                    recommendation="Install FFmpeg: brew install ffmpeg (macOS) or apt install ffmpeg (Linux)",
                )
        
        elif engine == ExecutionEngine.RESOLVE:
            status = cls.check_resolve()
            
            if not status.available:
                raise EngineAvailabilityError(
                    engine="DaVinci Resolve",
                    reason="DaVinci Resolve is not installed",
                    recommendation="Install DaVinci Resolve from https://www.blackmagicdesign.com/products/davinciresolve",
                )
            
            if status.running:
                raise EngineAvailabilityError(
                    engine="DaVinci Resolve",
                    reason="DaVinci Resolve is already running. Forge requires exclusive control.",
                    recommendation="Close DaVinci Resolve before running Forge jobs.",
                )
            
            if requires_studio and status.edition == "free":
                raise EngineAvailabilityError(
                    engine="DaVinci Resolve Studio",
                    reason="RAW format processing requires DaVinci Resolve Studio (paid license).",
                    recommendation="Upgrade to DaVinci Resolve Studio or convert RAW files to ProRes/DNxHR first.",
                )


# =============================================================================
# TEST: Resolve already running → FAIL
# =============================================================================

class TestResolveAlreadyRunning:
    """Resolve running MUST fail job with clear explanation."""
    
    def test_resolve_running_fails_job(self):
        """If Resolve is running, job MUST fail."""
        with patch.object(EngineChecker, 'check_resolve') as mock_check:
            mock_check.return_value = EngineStatus(
                available=True,
                running=True,  # RUNNING
                edition="studio",
                version="19.0",
                error_message=None,
            )
            
            with pytest.raises(EngineAvailabilityError) as excinfo:
                EngineChecker.validate_engine_for_job(
                    ExecutionEngine.RESOLVE,
                    requires_studio=False,
                )
            
            error = excinfo.value
            assert error.engine == "DaVinci Resolve"
            assert "already running" in error.reason.lower()
            assert "close" in error.recommendation.lower()
    
    def test_resolve_running_error_is_actionable(self):
        """Resolve running error MUST provide actionable guidance."""
        with patch.object(EngineChecker, 'check_resolve') as mock_check:
            mock_check.return_value = EngineStatus(
                available=True,
                running=True,
                edition="studio",
                version="19.0",
                error_message=None,
            )
            
            with pytest.raises(EngineAvailabilityError) as excinfo:
                EngineChecker.validate_engine_for_job(ExecutionEngine.RESOLVE)
            
            # Must tell user what to do
            assert "Close" in excinfo.value.recommendation or "close" in excinfo.value.recommendation


# =============================================================================
# TEST: Resolve Free detected → FAIL for RAW
# =============================================================================

class TestResolveFreeRejection:
    """Resolve Free MUST fail at creation for RAW formats."""
    
    def test_resolve_free_fails_for_raw(self):
        """Resolve Free MUST fail when requires_studio=True."""
        with patch.object(EngineChecker, 'check_resolve') as mock_check:
            mock_check.return_value = EngineStatus(
                available=True,
                running=False,
                edition="free",  # FREE edition
                version="19.0",
                error_message=None,
            )
            
            with pytest.raises(EngineAvailabilityError) as excinfo:
                EngineChecker.validate_engine_for_job(
                    ExecutionEngine.RESOLVE,
                    requires_studio=True,  # Requires Studio
                )
            
            error = excinfo.value
            assert "Studio" in error.reason
    
    def test_resolve_free_ok_for_non_raw(self):
        """Resolve Free is OK when requires_studio=False."""
        with patch.object(EngineChecker, 'check_resolve') as mock_check:
            mock_check.return_value = EngineStatus(
                available=True,
                running=False,
                edition="free",
                version="19.0",
                error_message=None,
            )
            
            # Should not raise
            EngineChecker.validate_engine_for_job(
                ExecutionEngine.RESOLVE,
                requires_studio=False,
            )
    
    def test_resolve_studio_works_for_raw(self):
        """Resolve Studio MUST work for RAW formats."""
        with patch.object(EngineChecker, 'check_resolve') as mock_check:
            mock_check.return_value = EngineStatus(
                available=True,
                running=False,
                edition="studio",  # STUDIO edition
                version="19.0",
                error_message=None,
            )
            
            # Should not raise
            EngineChecker.validate_engine_for_job(
                ExecutionEngine.RESOLVE,
                requires_studio=True,
            )
    
    def test_resolve_free_error_mentions_upgrade(self):
        """Resolve Free error MUST mention upgrade option."""
        with patch.object(EngineChecker, 'check_resolve') as mock_check:
            mock_check.return_value = EngineStatus(
                available=True,
                running=False,
                edition="free",
                version="19.0",
                error_message=None,
            )
            
            with pytest.raises(EngineAvailabilityError) as excinfo:
                EngineChecker.validate_engine_for_job(
                    ExecutionEngine.RESOLVE,
                    requires_studio=True,
                )
            
            # Must mention upgrade or alternative
            rec = excinfo.value.recommendation.lower()
            assert "upgrade" in rec or "studio" in rec or "convert" in rec


# =============================================================================
# TEST: FFmpeg missing → FAIL before execution
# =============================================================================

class TestFFmpegMissing:
    """FFmpeg missing MUST fail before execution."""
    
    def test_ffmpeg_missing_fails(self):
        """Missing FFmpeg MUST fail job."""
        with patch.object(EngineChecker, 'check_ffmpeg') as mock_check:
            mock_check.return_value = EngineStatus(
                available=False,
                running=False,
                edition=None,
                version=None,
                error_message="FFmpeg not found in PATH",
            )
            
            with pytest.raises(EngineAvailabilityError) as excinfo:
                EngineChecker.validate_engine_for_job(ExecutionEngine.FFMPEG)
            
            error = excinfo.value
            assert error.engine == "FFmpeg"
            assert "not found" in error.reason.lower()
    
    def test_ffmpeg_missing_error_has_install_instructions(self):
        """FFmpeg missing error MUST include install instructions."""
        with patch.object(EngineChecker, 'check_ffmpeg') as mock_check:
            mock_check.return_value = EngineStatus(
                available=False,
                running=False,
                edition=None,
                version=None,
                error_message="FFmpeg not found in PATH",
            )
            
            with pytest.raises(EngineAvailabilityError) as excinfo:
                EngineChecker.validate_engine_for_job(ExecutionEngine.FFMPEG)
            
            # Must include install command
            rec = excinfo.value.recommendation.lower()
            assert "install" in rec
            assert "ffmpeg" in rec
    
    def test_ffmpeg_available_works(self):
        """Available FFmpeg MUST not raise."""
        with patch.object(EngineChecker, 'check_ffmpeg') as mock_check:
            mock_check.return_value = EngineStatus(
                available=True,
                running=False,
                edition=None,
                version="ffmpeg version 6.0",
                error_message=None,
            )
            
            # Should not raise
            EngineChecker.validate_engine_for_job(ExecutionEngine.FFMPEG)


# =============================================================================
# TEST: Resolve not installed
# =============================================================================

class TestResolveNotInstalled:
    """Resolve not installed MUST fail with clear message."""
    
    def test_resolve_not_installed_fails(self):
        """Missing Resolve MUST fail job."""
        with patch.object(EngineChecker, 'check_resolve') as mock_check:
            mock_check.return_value = EngineStatus(
                available=False,
                running=False,
                edition=None,
                version=None,
                error_message="DaVinci Resolve not installed",
            )
            
            with pytest.raises(EngineAvailabilityError) as excinfo:
                EngineChecker.validate_engine_for_job(ExecutionEngine.RESOLVE)
            
            error = excinfo.value
            assert "not installed" in error.reason.lower()
    
    def test_resolve_not_installed_has_download_link(self):
        """Missing Resolve error MUST include download information."""
        with patch.object(EngineChecker, 'check_resolve') as mock_check:
            mock_check.return_value = EngineStatus(
                available=False,
                running=False,
                edition=None,
                version=None,
                error_message="DaVinci Resolve not installed",
            )
            
            with pytest.raises(EngineAvailabilityError) as excinfo:
                EngineChecker.validate_engine_for_job(ExecutionEngine.RESOLVE)
            
            rec = excinfo.value.recommendation.lower()
            assert "blackmagic" in rec or "install" in rec


# =============================================================================
# TEST: Engine check before job creation
# =============================================================================

class TestEngineCheckTiming:
    """Engine checks MUST happen before job creation, not during."""
    
    def test_check_happens_synchronously(self):
        """Engine check MUST be synchronous (not deferred)."""
        call_count = 0
        
        def mock_check():
            nonlocal call_count
            call_count += 1
            return EngineStatus(
                available=True,
                running=False,
                edition="studio",
                version="19.0",
                error_message=None,
            )
        
        with patch.object(EngineChecker, 'check_resolve', mock_check):
            EngineChecker.validate_engine_for_job(ExecutionEngine.RESOLVE)
        
        # Check happened immediately
        assert call_count == 1
    
    def test_failure_is_immediate(self):
        """Engine failure MUST raise immediately."""
        with patch.object(EngineChecker, 'check_ffmpeg') as mock_check:
            mock_check.return_value = EngineStatus(
                available=False,
                running=False,
                edition=None,
                version=None,
                error_message="FFmpeg not found",
            )
            
            # Must raise immediately, not return error
            with pytest.raises(EngineAvailabilityError):
                EngineChecker.validate_engine_for_job(ExecutionEngine.FFMPEG)


# =============================================================================
# TEST: Real engine detection (integration)
# =============================================================================

class TestRealEngineDetection:
    """Integration tests with real system state."""
    
    def test_ffmpeg_check_returns_status(self):
        """FFmpeg check MUST return valid EngineStatus."""
        status = EngineChecker.check_ffmpeg()
        
        assert isinstance(status, EngineStatus)
        # available should be a boolean
        assert isinstance(status.available, bool)
        
        if status.available:
            assert status.error_message is None
            assert status.version is not None
        else:
            assert status.error_message is not None
    
    def test_resolve_check_returns_status(self):
        """Resolve check MUST return valid EngineStatus."""
        status = EngineChecker.check_resolve()
        
        assert isinstance(status, EngineStatus)
        assert isinstance(status.available, bool)
        assert isinstance(status.running, bool)
    
    @pytest.mark.skipif(
        shutil.which("ffmpeg") is None,
        reason="FFmpeg not installed"
    )
    def test_ffmpeg_available_on_system(self):
        """Verify FFmpeg is detected when installed."""
        status = EngineChecker.check_ffmpeg()
        
        assert status.available is True
        assert "ffmpeg" in status.version.lower()


# =============================================================================
# TEST: Error message clarity
# =============================================================================

class TestErrorMessageClarity:
    """Error messages MUST be clear and actionable."""
    
    def test_error_identifies_engine(self):
        """Error MUST identify which engine failed."""
        with patch.object(EngineChecker, 'check_ffmpeg') as mock:
            mock.return_value = EngineStatus(
                available=False, running=False, edition=None,
                version=None, error_message="not found"
            )
            
            with pytest.raises(EngineAvailabilityError) as excinfo:
                EngineChecker.validate_engine_for_job(ExecutionEngine.FFMPEG)
            
            assert excinfo.value.engine == "FFmpeg"
    
    def test_error_has_reason(self):
        """Error MUST include reason for failure."""
        with patch.object(EngineChecker, 'check_resolve') as mock:
            mock.return_value = EngineStatus(
                available=True, running=True, edition="studio",
                version="19.0", error_message=None
            )
            
            with pytest.raises(EngineAvailabilityError) as excinfo:
                EngineChecker.validate_engine_for_job(ExecutionEngine.RESOLVE)
            
            assert len(excinfo.value.reason) > 0
    
    def test_error_has_recommendation(self):
        """Error MUST include actionable recommendation."""
        with patch.object(EngineChecker, 'check_resolve') as mock:
            mock.return_value = EngineStatus(
                available=False, running=False, edition=None,
                version=None, error_message="not installed"
            )
            
            with pytest.raises(EngineAvailabilityError) as excinfo:
                EngineChecker.validate_engine_for_job(ExecutionEngine.RESOLVE)
            
            assert len(excinfo.value.recommendation) > 0


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
