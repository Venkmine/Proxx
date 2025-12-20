"""
E2E tests for ffprobe validation.

Tests:
- Codec validation
- Duration validation
- Frame rate validation
- Audio validation
"""

import pytest
import sys
import subprocess
import json
import tempfile
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / "backend"))


def ffprobe_available() -> bool:
    """Check if ffprobe is available."""
    try:
        result = subprocess.run(
            ["ffprobe", "-version"],
            capture_output=True,
            text=True,
        )
        return result.returncode == 0
    except FileNotFoundError:
        return False


def generate_test_video(output_path: Path, duration: float = 1.0, fps: int = 24) -> bool:
    """Generate a test video with specific parameters."""
    cmd = [
        "ffmpeg",
        "-y",
        "-f", "lavfi",
        "-i", f"color=c=blue:s=640x480:r={fps}:d={duration}",
        "-f", "lavfi",
        "-i", f"sine=frequency=440:duration={duration}:sample_rate=48000",
        "-c:v", "libx264",
        "-c:a", "aac",
        "-ar", "48000",
        "-ac", "2",
        str(output_path),
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.returncode == 0


def get_video_info(file_path: Path) -> dict:
    """Get video info using ffprobe."""
    cmd = [
        "ffprobe",
        "-v", "error",
        "-show_format",
        "-show_streams",
        "-print_format", "json",
        str(file_path),
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        return {}
    
    return json.loads(result.stdout)


@pytest.mark.skipif(not ffprobe_available(), reason="ffprobe not available")
class TestCodecValidation:
    """Test codec validation with ffprobe."""
    
    def test_validate_h264_codec(self):
        """Should detect H.264 codec correctly."""
        with tempfile.TemporaryDirectory() as tmpdir:
            video_path = Path(tmpdir) / "test.mp4"
            generate_test_video(video_path)
            
            info = get_video_info(video_path)
            
            video_stream = next(
                (s for s in info.get("streams", []) if s["codec_type"] == "video"),
                None
            )
            
            assert video_stream is not None
            assert video_stream["codec_name"] == "h264"
    
    def test_validate_audio_codec(self):
        """Should detect AAC audio codec correctly."""
        with tempfile.TemporaryDirectory() as tmpdir:
            video_path = Path(tmpdir) / "test.mp4"
            generate_test_video(video_path)
            
            info = get_video_info(video_path)
            
            audio_stream = next(
                (s for s in info.get("streams", []) if s["codec_type"] == "audio"),
                None
            )
            
            assert audio_stream is not None
            assert audio_stream["codec_name"] == "aac"


@pytest.mark.skipif(not ffprobe_available(), reason="ffprobe not available")
class TestDurationValidation:
    """Test duration validation with ffprobe."""
    
    def test_validate_duration(self):
        """Should report correct duration."""
        with tempfile.TemporaryDirectory() as tmpdir:
            video_path = Path(tmpdir) / "test.mp4"
            generate_test_video(video_path, duration=2.0)
            
            info = get_video_info(video_path)
            
            format_info = info.get("format", {})
            duration = float(format_info.get("duration", 0))
            
            # Allow some tolerance
            assert 1.5 < duration < 2.5


@pytest.mark.skipif(not ffprobe_available(), reason="ffprobe not available")
class TestFrameRateValidation:
    """Test frame rate validation with ffprobe."""
    
    def test_validate_frame_rate(self):
        """Should report correct frame rate."""
        with tempfile.TemporaryDirectory() as tmpdir:
            video_path = Path(tmpdir) / "test.mp4"
            generate_test_video(video_path, fps=30)
            
            info = get_video_info(video_path)
            
            video_stream = next(
                (s for s in info.get("streams", []) if s["codec_type"] == "video"),
                None
            )
            
            assert video_stream is not None
            
            # Frame rate may be reported as fraction
            fps_str = video_stream.get("r_frame_rate", "0/1")
            if "/" in fps_str:
                num, denom = fps_str.split("/")
                fps = float(num) / float(denom)
            else:
                fps = float(fps_str)
            
            assert 29 < fps < 31  # Allow tolerance


@pytest.mark.skipif(not ffprobe_available(), reason="ffprobe not available")
class TestAudioValidation:
    """Test audio validation with ffprobe."""
    
    def test_validate_sample_rate(self):
        """Should report correct sample rate."""
        with tempfile.TemporaryDirectory() as tmpdir:
            video_path = Path(tmpdir) / "test.mp4"
            generate_test_video(video_path)
            
            info = get_video_info(video_path)
            
            audio_stream = next(
                (s for s in info.get("streams", []) if s["codec_type"] == "audio"),
                None
            )
            
            assert audio_stream is not None
            assert int(audio_stream.get("sample_rate", 0)) == 48000
    
    def test_validate_channel_count(self):
        """Should report correct channel count."""
        with tempfile.TemporaryDirectory() as tmpdir:
            video_path = Path(tmpdir) / "test.mp4"
            generate_test_video(video_path)
            
            info = get_video_info(video_path)
            
            audio_stream = next(
                (s for s in info.get("streams", []) if s["codec_type"] == "audio"),
                None
            )
            
            assert audio_stream is not None
            assert int(audio_stream.get("channels", 0)) == 2
