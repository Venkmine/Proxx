"""
GOLDEN-PATH EXECUTION CONTRACT TEST

This test is SACRED. It proves that real rendering works end-to-end.

CONTRACT:
- Uses REAL FFmpeg (no mocks)
- Uses REAL filesystem writes (no mocks)
- Uses REAL media files
- Uses REAL execution path (execute_jobspec)

PURPOSE:
- Detects when rendering stops working
- Detects when FFmpeg integration breaks
- Detects when output generation fails
- Provides confidence for deployments

FAILURE MESSAGE:
- "Golden-path execution contract broken"
- This means: STOP. Do not deploy. Fix immediately.

EXECUTION:
- Deterministic (same inputs → same outputs)
- Self-cleaning (removes artifacts after test)
- Fast (uses small test media)
- Tagged: @integration, @slow, @execution_contract

Author: Copilot
Date: 2026-01-06
"""

import pytest
import shutil
import subprocess
import tempfile
import json
import time
from pathlib import Path
from datetime import datetime

import sys
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from job_spec import JobSpec, JOBSPEC_VERSION, FpsMode
from execution_adapter import execute_jobspec
from execution_results import JobExecutionResult


# =============================================================================
# Constants
# =============================================================================

# Known test media file (3-second H.264 clip)
TEST_MEDIA = Path("/Users/leon.grant/projects/Proxx/test_media/test_input.mp4")

# FFmpeg command for ffprobe verification
FFPROBE_CMD = "ffprobe"


# =============================================================================
# Prerequisites
# =============================================================================

def ffmpeg_available() -> bool:
    """Check if FFmpeg is available on system."""
    return shutil.which("ffmpeg") is not None


def ffprobe_available() -> bool:
    """Check if ffprobe is available on system."""
    return shutil.which(FFPROBE_CMD) is not None


def test_media_exists() -> bool:
    """Check if test media file exists."""
    return TEST_MEDIA.exists() and TEST_MEDIA.is_file()


def get_container_format(file_path: Path) -> str:
    """
    Get container format using ffprobe.
    
    Returns:
        Container format name (e.g., "mov", "mp4")
    """
    cmd = [
        FFPROBE_CMD,
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        str(file_path),
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
    
    if result.returncode != 0:
        raise AssertionError(f"ffprobe failed: {result.stderr}")
    
    data = json.loads(result.stdout)
    format_name = data.get("format", {}).get("format_name", "")
    
    return format_name


def get_video_codec(file_path: Path) -> str:
    """
    Get video codec using ffprobe.
    
    Returns:
        Video codec name (e.g., "prores", "h264")
    """
    cmd = [
        FFPROBE_CMD,
        "-v", "quiet",
        "-print_format", "json",
        "-show_streams",
        "-select_streams", "v:0",
        str(file_path),
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
    
    if result.returncode != 0:
        raise AssertionError(f"ffprobe failed: {result.stderr}")
    
    data = json.loads(result.stdout)
    streams = data.get("streams", [])
    
    if not streams:
        raise AssertionError("No video stream found")
    
    codec_name = streams[0].get("codec_name", "")
    return codec_name


# =============================================================================
# GOLDEN-PATH EXECUTION CONTRACT TEST
# =============================================================================

@pytest.mark.integration
@pytest.mark.slow
@pytest.mark.execution_contract
def test_golden_path_execution_contract():
    """
    GOLDEN-PATH EXECUTION CONTRACT TEST
    
    This test MUST pass for deployments.
    
    GIVEN:
        - Real H.264 test media file
        - Real FFmpeg installation
        - Real filesystem
    
    WHEN:
        - JobSpec executed via execute_jobspec()
        - ProRes Proxy MOV output requested
    
    THEN:
        - Execution returns success status
        - Output file exists on filesystem
        - Output file size > 0
        - Container format is MOV
        - Video codec is ProRes
        - No fatal errors in stderr
    
    FAILURE:
        - "Golden-path execution contract broken"
        - This means: STOP. Fix immediately before deploying.
    """
    # -------------------------------------------------------------------------
    # Prerequisites Check
    # -------------------------------------------------------------------------
    
    if not ffmpeg_available():
        pytest.skip("FFmpeg not available - cannot verify execution contract")
    
    if not ffprobe_available():
        pytest.skip("ffprobe not available - cannot verify output contract")
    
    if not test_media_exists():
        pytest.skip(f"Test media not found: {TEST_MEDIA}")
    
    # -------------------------------------------------------------------------
    # Test Setup
    # -------------------------------------------------------------------------
    
    start_time = time.time()
    
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        output_dir = tmpdir_path / "outputs"
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # Build minimal valid JobSpec for ProRes Proxy
        jobspec = JobSpec(
            job_id="golden_path_contract",
            sources=[str(TEST_MEDIA)],
            output_directory=str(output_dir),
            codec="prores_proxy",
            container="mov",
            resolution="same",
            naming_template="{source_name}_golden_contract",
            proxy_profile="proxy_prores_proxy",
            fps_mode=FpsMode.SAME_AS_SOURCE,
        )
        
        # -------------------------------------------------------------------------
        # Execute Job (REAL EXECUTION - NO MOCKS)
        # -------------------------------------------------------------------------
        
        result: JobExecutionResult = execute_jobspec(jobspec)
        
        execution_duration = time.time() - start_time
        
        # -------------------------------------------------------------------------
        # Assertions (ALL REQUIRED)
        # -------------------------------------------------------------------------
        
        # ASSERTION 1: Execution returns success
        if result.final_status != "COMPLETED":
            raise AssertionError(
                f"❌ Golden-path execution contract broken: "
                f"Expected COMPLETED status, got {result.final_status}\n"
                f"Validation error: {result.validation_error}\n"
                f"Clips: {len(result.clips)}"
            )
        
        assert result.success is True, (
            f"❌ Golden-path execution contract broken: "
            f"result.success is False"
        )
        
        # ASSERTION 2: Clips executed successfully
        if len(result.clips) != 1:
            raise AssertionError(
                f"❌ Golden-path execution contract broken: "
                f"Expected 1 clip, got {len(result.clips)}"
            )
        
        clip = result.clips[0]
        
        if clip.status != "COMPLETED":
            raise AssertionError(
                f"❌ Golden-path execution contract broken: "
                f"Clip status is {clip.status}\n"
                f"Failure reason: {clip.failure_reason}\n"
                f"Exit code: {clip.exit_code}\n"
                f"FFmpeg command: {' '.join(clip.ffmpeg_command or [])}"
            )
        
        # ASSERTION 3: Output file exists
        output_path = Path(clip.resolved_output_path)
        
        if not output_path.exists():
            raise AssertionError(
                f"❌ Golden-path execution contract broken: "
                f"Output file does not exist: {output_path}\n"
                f"FFmpeg command: {' '.join(clip.ffmpeg_command or [])}\n"
                f"Exit code: {clip.exit_code}"
            )
        
        # ASSERTION 4: Output file size > 0
        output_size = output_path.stat().st_size
        
        if output_size == 0:
            raise AssertionError(
                f"❌ Golden-path execution contract broken: "
                f"Output file is empty (0 bytes): {output_path}"
            )
        
        # ASSERTION 5: Container format matches expected (MOV)
        try:
            container_format = get_container_format(output_path)
        except Exception as e:
            raise AssertionError(
                f"❌ Golden-path execution contract broken: "
                f"Cannot verify container format: {e}"
            )
        
        if "mov" not in container_format and "quicktime" not in container_format:
            raise AssertionError(
                f"❌ Golden-path execution contract broken: "
                f"Expected MOV container, got: {container_format}"
            )
        
        # ASSERTION 6: Video codec is ProRes
        try:
            video_codec = get_video_codec(output_path)
        except Exception as e:
            raise AssertionError(
                f"❌ Golden-path execution contract broken: "
                f"Cannot verify video codec: {e}"
            )
        
        if "prores" not in video_codec.lower():
            raise AssertionError(
                f"❌ Golden-path execution contract broken: "
                f"Expected ProRes codec, got: {video_codec}"
            )
        
        # ASSERTION 7: No fatal errors in stderr
        # (FFmpeg always writes to stderr, but exit_code=0 means success)
        if clip.exit_code != 0:
            raise AssertionError(
                f"❌ Golden-path execution contract broken: "
                f"FFmpeg exited with non-zero code: {clip.exit_code}"
            )
        
        # -------------------------------------------------------------------------
        # Success Reporting
        # -------------------------------------------------------------------------
        
        print("\n" + "="*80)
        print("✅ GOLDEN-PATH EXECUTION CONTRACT: PASSED")
        print("="*80)
        print(f"Test Duration:    {execution_duration:.2f}s")
        print(f"Source:           {TEST_MEDIA.name}")
        print(f"Output:           {output_path.name}")
        print(f"Output Size:      {output_size:,} bytes ({output_size / 1024 / 1024:.2f} MB)")
        print(f"Container:        {container_format}")
        print(f"Codec:            {video_codec}")
        print(f"Engine:           {result.engine_used}")
        print(f"Job Status:       {result.final_status}")
        print(f"Clip Status:      {clip.status}")
        print("="*80)
        print("\nGUARANTEES:")
        print("  - Real FFmpeg execution works")
        print("  - execute_jobspec() produces valid output")
        print("  - ProRes encoding works")
        print("  - Output files are written to filesystem")
        print("  - ffprobe can verify output metadata")
        print("="*80 + "\n")
        
        # Cleanup is automatic (tmpdir deleted after context)


# =============================================================================
# Test Execution
# =============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s", "--tb=short", "-m", "execution_contract"])
