"""
E2E tests for transcoding with real FFmpeg.

Tests:
- Real FFmpeg transcode
- Output file creation
- Basic validation
"""

import pytest
import sys
import subprocess
import tempfile
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / "backend"))


def ffmpeg_available() -> bool:
    """Check if FFmpeg is available."""
    try:
        result = subprocess.run(
            ["ffmpeg", "-version"],
            capture_output=True,
            text=True,
        )
        return result.returncode == 0
    except FileNotFoundError:
        return False


def generate_test_video(output_path: Path, duration: float = 1.0) -> bool:
    """Generate a minimal test video file using FFmpeg."""
    cmd = [
        "ffmpeg",
        "-y",
        "-f", "lavfi",
        "-i", f"color=c=red:s=320x240:d={duration}",
        "-f", "lavfi",
        "-i", f"sine=frequency=440:duration={duration}",
        "-c:v", "libx264",
        "-c:a", "aac",
        "-shortest",
        str(output_path),
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.returncode == 0


@pytest.mark.skipif(not ffmpeg_available(), reason="FFmpeg not available")
class TestRealTranscode:
    """Test real FFmpeg transcoding."""
    
    def test_generate_proxy(self):
        """Should generate proxy from source video."""
        with tempfile.TemporaryDirectory() as tmpdir:
            tmppath = Path(tmpdir)
            
            # Generate test input
            input_file = tmppath / "input.mov"
            assert generate_test_video(input_file), "Failed to generate test input"
            
            # Generate proxy
            output_file = tmppath / "output_proxy.mp4"
            
            cmd = [
                "ffmpeg",
                "-y",
                "-i", str(input_file),
                "-c:v", "libx264",
                "-preset", "ultrafast",
                "-crf", "28",
                "-c:a", "aac",
                str(output_file),
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            assert result.returncode == 0, f"FFmpeg failed: {result.stderr}"
            assert output_file.exists(), "Output file not created"
            assert output_file.stat().st_size > 0, "Output file is empty"
    
    def test_prores_transcode(self):
        """Should transcode to ProRes."""
        with tempfile.TemporaryDirectory() as tmpdir:
            tmppath = Path(tmpdir)
            
            # Generate test input
            input_file = tmppath / "input.mov"
            assert generate_test_video(input_file), "Failed to generate test input"
            
            # Generate ProRes output
            output_file = tmppath / "output.mov"
            
            cmd = [
                "ffmpeg",
                "-y",
                "-i", str(input_file),
                "-c:v", "prores_ks",
                "-profile:v", "2",  # ProRes 422
                "-c:a", "pcm_s16le",
                str(output_file),
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            assert result.returncode == 0, f"FFmpeg failed: {result.stderr}"
            assert output_file.exists(), "Output file not created"


@pytest.mark.skipif(not ffmpeg_available(), reason="FFmpeg not available")
class TestOutputValidation:
    """Test output file validation."""
    
    def test_output_has_video_stream(self):
        """Output should have video stream."""
        with tempfile.TemporaryDirectory() as tmpdir:
            tmppath = Path(tmpdir)
            
            # Generate test input
            input_file = tmppath / "input.mov"
            generate_test_video(input_file)
            
            # Generate proxy
            output_file = tmppath / "output.mp4"
            subprocess.run([
                "ffmpeg", "-y", "-i", str(input_file),
                "-c:v", "libx264", "-preset", "ultrafast",
                str(output_file),
            ], capture_output=True)
            
            # Check for video stream with ffprobe
            result = subprocess.run([
                "ffprobe",
                "-v", "error",
                "-select_streams", "v:0",
                "-show_entries", "stream=codec_name",
                "-of", "csv=p=0",
                str(output_file),
            ], capture_output=True, text=True)
            
            assert result.returncode == 0
            assert "h264" in result.stdout.lower()
