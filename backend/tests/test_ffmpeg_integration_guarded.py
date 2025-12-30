"""
Pre-RAW Hardening Tests - FFmpeg Integration (Guarded)

Single guarded FFmpeg integration test with real execution.

Tests:
1. FFmpeg can execute on small local media
2. Proxy file exists after execution
3. Proxy file size > 0

Guarded: Skipped if FFmpeg not available or test media missing.

Part of Pre-RAW Hardening Suite
"""

import pytest
import shutil
import tempfile
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from job_spec import JobSpec, JOBSPEC_VERSION
from execution_adapter import execute_jobspec


# =============================================================================
# Test Media Detection
# =============================================================================

def ffmpeg_available() -> bool:
    """Check if FFmpeg is available on system."""
    return shutil.which("ffmpeg") is not None


def create_test_video(output_path: Path) -> bool:
    """
    Create a minimal test video using FFmpeg.
    
    Returns True if successful, False otherwise.
    """
    if not ffmpeg_available():
        return False
    
    try:
        import subprocess
        # Create 1-second black video at 1280x720
        cmd = [
            "ffmpeg",
            "-f", "lavfi",
            "-i", "color=c=black:s=1280x720:d=1",
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-y",
            str(output_path),
        ]
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            timeout=10,
        )
        
        return result.returncode == 0 and output_path.exists()
    except Exception:
        return False


# =============================================================================
# Guarded Integration Test
# =============================================================================

@pytest.mark.integration
def test_ffmpeg_integration_small_file():
    """
    INTEGRATION TEST: FFmpeg executes on small local file.
    
    GIVEN: Small test video file
    WHEN: JobSpec executed with FFmpeg engine
    THEN: Proxy file created
    AND: Proxy file size > 0
    AND: Job status is COMPLETED
    
    SKIP: If FFmpeg not available or test video creation fails.
    """
    if not ffmpeg_available():
        pytest.skip("FFmpeg not available on system")
    
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        # Create test video
        source_file = tmpdir_path / "test_source.mp4"
        if not create_test_video(source_file):
            pytest.skip("Could not create test video")
        
        # Verify source exists and has size
        assert source_file.exists()
        source_size = source_file.stat().st_size
        assert source_size > 0, "Source file is empty"
        
        # Create output directory
        output_dir = tmpdir_path / "output"
        output_dir.mkdir()
        
        # Create JobSpec for H.264 proxy
        jobspec = JobSpec(
            job_id="ffmpeg_integration_test",
            sources=[str(source_file)],
            output_directory=str(output_dir),
            codec="h264",
            container="mp4",
            resolution="half",  # Scale to 640x360
            naming_template="{source_name}_proxy",
            proxy_profile="proxy_h264_low",
        )
        
        # Execute job
        result = execute_jobspec(jobspec)
        
        # Assertions: Job completed
        assert result.final_status == "COMPLETED", \
            f"Expected COMPLETED, got {result.final_status}"
        
        # Assertions: Engine used
        assert result.engine_used == "ffmpeg", \
            f"Expected ffmpeg engine, got {result.engine_used}"
        
        # Assertions: Clips executed
        assert len(result.clips) == 1, \
            f"Expected 1 clip, got {len(result.clips)}"
        
        clip = result.clips[0]
        assert clip.status == "COMPLETED", \
            f"Clip status should be COMPLETED, got {clip.status}"
        
        # Assertions: Output file exists
        assert clip.output_exists, \
            "Output file should exist"
        
        output_path = Path(clip.resolved_output_path)
        assert output_path.exists(), \
            f"Output file does not exist: {output_path}"
        
        # Assertions: Output file size > 0
        output_size = output_path.stat().st_size
        assert output_size > 0, \
            f"Output file is empty (size={output_size})"
        
        assert clip.output_size_bytes == output_size, \
            f"Clip size mismatch: {clip.output_size_bytes} != {output_size}"


@pytest.mark.integration
def test_ffmpeg_integration_output_verification():
    """
    INTEGRATION TEST: FFmpeg output is properly verified.
    
    GIVEN: Small test video
    WHEN: Processed with FFmpeg
    THEN: Output verification occurs
    AND: output_exists is True
    AND: output_size_bytes is accurate
    
    SKIP: If FFmpeg not available.
    """
    if not ffmpeg_available():
        pytest.skip("FFmpeg not available on system")
    
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        # Create test video
        source_file = tmpdir_path / "test_source.mp4"
        if not create_test_video(source_file):
            pytest.skip("Could not create test video")
        
        output_dir = tmpdir_path / "output"
        output_dir.mkdir()
        
        jobspec = JobSpec(
            job_id="verification_test",
            sources=[str(source_file)],
            output_directory=str(output_dir),
            codec="h264",
            container="mp4",
            resolution="quarter",  # Smaller output
            naming_template="verified",
            proxy_profile="proxy_h264_low",
        )
        
        result = execute_jobspec(jobspec)
        
        # Assertions: Completed
        assert result.final_status == "COMPLETED"
        assert len(result.clips) == 1
        
        clip = result.clips[0]
        
        # Assertions: Output verification data present
        assert clip.output_exists is True
        assert clip.output_size_bytes is not None
        assert clip.output_size_bytes > 0
        
        # Verify actual file matches reported data
        output_path = Path(clip.resolved_output_path)
        actual_size = output_path.stat().st_size
        assert clip.output_size_bytes == actual_size


@pytest.mark.integration
def test_ffmpeg_integration_ffmpeg_command_captured():
    """
    INTEGRATION TEST: FFmpeg command is captured in result.
    
    GIVEN: Small test video
    WHEN: Processed with FFmpeg
    THEN: ffmpeg_command is captured in ClipExecutionResult
    AND: Command is non-empty list
    AND: Contains "ffmpeg" executable
    
    SKIP: If FFmpeg not available.
    """
    if not ffmpeg_available():
        pytest.skip("FFmpeg not available on system")
    
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        # Create test video
        source_file = tmpdir_path / "test_source.mp4"
        if not create_test_video(source_file):
            pytest.skip("Could not create test video")
        
        output_dir = tmpdir_path / "output"
        output_dir.mkdir()
        
        jobspec = JobSpec(
            job_id="command_capture_test",
            sources=[str(source_file)],
            output_directory=str(output_dir),
            codec="h264",
            container="mp4",
            resolution="half",
            naming_template="captured",
            proxy_profile="proxy_h264_low",
        )
        
        result = execute_jobspec(jobspec)
        
        assert result.final_status == "COMPLETED"
        assert len(result.clips) == 1
        
        clip = result.clips[0]
        
        # Assertions: FFmpeg command captured
        assert clip.ffmpeg_command is not None
        assert isinstance(clip.ffmpeg_command, list)
        assert len(clip.ffmpeg_command) > 0
        
        # Should contain ffmpeg executable
        assert any("ffmpeg" in str(arg).lower() for arg in clip.ffmpeg_command)


@pytest.mark.integration
def test_ffmpeg_integration_exit_code_zero():
    """
    INTEGRATION TEST: Successful FFmpeg execution has exit code 0.
    
    GIVEN: Valid job that completes successfully
    WHEN: Executed
    THEN: Clip exit_code is 0
    
    SKIP: If FFmpeg not available.
    """
    if not ffmpeg_available():
        pytest.skip("FFmpeg not available on system")
    
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        # Create test video
        source_file = tmpdir_path / "test_source.mp4"
        if not create_test_video(source_file):
            pytest.skip("Could not create test video")
        
        output_dir = tmpdir_path / "output"
        output_dir.mkdir()
        
        jobspec = JobSpec(
            job_id="exit_code_test",
            sources=[str(source_file)],
            output_directory=str(output_dir),
            codec="h264",
            container="mp4",
            resolution="same",
            naming_template="success",
            proxy_profile="proxy_h264_low",
        )
        
        result = execute_jobspec(jobspec)
        
        assert result.final_status == "COMPLETED"
        assert len(result.clips) == 1
        
        clip = result.clips[0]
        
        # Assertions: Exit code is 0 for success
        assert clip.exit_code == 0, \
            f"Expected exit code 0, got {clip.exit_code}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-m", "integration"])
