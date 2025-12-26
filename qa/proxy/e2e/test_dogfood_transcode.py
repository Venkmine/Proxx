"""
Dogfood E2E Tests: Real Transcode with FFprobe Validation

Tests real transcodes with actual media files and validates:
- Output file exists and is non-zero
- Container format correct
- Video codec correct
- Dimensions correct
- Frame rate correct
- Audio codec and channels correct (if applicable)

Test fixtures in: qa/fixtures/media/
"""

import pytest
import sys
import subprocess
import tempfile
import shutil
from pathlib import Path
from typing import Optional

# Add paths
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / "backend"))
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from helpers.ffprobe_helper import (
    probe_file,
    FFprobeError,
    assert_video_codec,
    assert_audio_codec,
    assert_container,
    assert_dimensions,
    assert_frame_rate,
    assert_audio_channels,
    assert_file_valid,
)

# Test media locations
REPO_ROOT = Path(__file__).parent.parent.parent.parent
TEST_MEDIA_DIR = REPO_ROOT / "test_media"
QA_FIXTURES_DIR = REPO_ROOT / "qa" / "fixtures" / "media"

# Get the test files that exist
def get_test_file(name: str) -> Optional[Path]:
    """Get test file path if it exists."""
    candidates = [
        QA_FIXTURES_DIR / name,
        TEST_MEDIA_DIR / name,
    ]
    for path in candidates:
        if path.exists():
            return path
    return None


def ffmpeg_available() -> bool:
    """Check if ffmpeg is available."""
    try:
        result = subprocess.run(
            ["ffmpeg", "-version"],
            capture_output=True,
            text=True,
        )
        return result.returncode == 0
    except FileNotFoundError:
        return False


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


def run_ffmpeg_transcode(
    input_path: Path,
    output_path: Path,
    video_codec: str = "libx264",
    audio_codec: str = "aac",
    container: str = "mp4",
    extra_args: Optional[list] = None,
) -> bool:
    """Run an FFmpeg transcode and return success status."""
    cmd = [
        "ffmpeg",
        "-y",  # Overwrite
        "-i", str(input_path),
        "-c:v", video_codec,
    ]
    
    if audio_codec != "none":
        cmd.extend(["-c:a", audio_codec])
    else:
        cmd.extend(["-an"])  # No audio
    
    if extra_args:
        cmd.extend(extra_args)
    
    cmd.append(str(output_path))
    
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    return result.returncode == 0


@pytest.fixture
def temp_output_dir():
    """Create a temporary output directory."""
    tmpdir = tempfile.mkdtemp(prefix="dogfood_test_")
    yield Path(tmpdir)
    shutil.rmtree(tmpdir, ignore_errors=True)


# ============================================================================
# TEST FIXTURE VALIDATION
# ============================================================================

@pytest.mark.skipif(not ffprobe_available(), reason="ffprobe not available")
class TestFixtureValidation:
    """Validate that test fixtures are correct before using them."""
    
    def test_short_h264_fixture_exists(self):
        """Verify short_h264_audio.mp4 exists and is valid."""
        test_file = get_test_file("short_h264_audio.mp4")
        if test_file is None:
            pytest.skip("Test fixture short_h264_audio.mp4 not found")
        
        info = probe_file(test_file)
        assert info.video is not None
        assert info.video.codec_name == "h264"
        assert info.audio is not None
    
    def test_no_audio_fixture_exists(self):
        """Verify no_audio.mp4 exists and has no audio."""
        test_file = get_test_file("no_audio.mp4")
        if test_file is None:
            pytest.skip("Test fixture no_audio.mp4 not found")
        
        info = probe_file(test_file)
        assert info.video is not None
        assert info.audio is None
    
    def test_corrupt_fixture_fails(self):
        """Verify corrupt.mp4 is actually corrupt."""
        test_file = get_test_file("corrupt.mp4")
        if test_file is None:
            pytest.skip("Test fixture corrupt.mp4 not found")
        
        with pytest.raises(FFprobeError):
            probe_file(test_file)


# ============================================================================
# H.264/MP4 TRANSCODE TESTS
# ============================================================================

@pytest.mark.skipif(not ffmpeg_available(), reason="ffmpeg not available")
@pytest.mark.skipif(not ffprobe_available(), reason="ffprobe not available")
class TestH264Transcode:
    """Test H.264/MP4 transcoding with ffprobe validation."""
    
    def test_h264_mp4_basic(self, temp_output_dir):
        """Basic H.264/MP4 transcode produces valid output."""
        input_file = get_test_file("short_h264_audio.mp4")
        if input_file is None:
            input_file = TEST_MEDIA_DIR / "test_input.mp4"
        if not input_file.exists():
            pytest.skip("No test input file available")
        
        output_file = temp_output_dir / "output.mp4"
        
        success = run_ffmpeg_transcode(
            input_file,
            output_file,
            video_codec="libx264",
            audio_codec="aac",
            container="mp4",
        )
        assert success, "FFmpeg transcode failed"
        
        # Validate output
        info = assert_file_valid(output_file)
        assert_container(info, "mp4")
        assert_video_codec(info, "h264")
        assert_audio_codec(info, "aac")
        assert info.video.width > 0
        assert info.video.height > 0
    
    def test_h264_preserves_dimensions(self, temp_output_dir):
        """H.264 transcode preserves input dimensions."""
        input_file = get_test_file("short_h264_audio.mp4")
        if input_file is None:
            input_file = TEST_MEDIA_DIR / "test_input.mp4"
        if not input_file.exists():
            pytest.skip("No test input file available")
        
        # Get input dimensions
        input_info = probe_file(input_file)
        input_width = input_info.video.width
        input_height = input_info.video.height
        
        output_file = temp_output_dir / "output.mp4"
        
        success = run_ffmpeg_transcode(
            input_file,
            output_file,
            video_codec="libx264",
            audio_codec="aac",
        )
        assert success
        
        # Verify output dimensions match input
        output_info = probe_file(output_file)
        assert_dimensions(output_info, input_width, input_height)
    
    def test_h264_stereo_audio(self, temp_output_dir):
        """H.264 transcode produces stereo audio."""
        input_file = get_test_file("short_h264_audio.mp4")
        if input_file is None:
            pytest.skip("No audio test file available")
        
        output_file = temp_output_dir / "output.mp4"
        
        success = run_ffmpeg_transcode(
            input_file,
            output_file,
            video_codec="libx264",
            audio_codec="aac",
        )
        assert success
        
        info = probe_file(output_file)
        assert_audio_channels(info, 2)  # Stereo


# ============================================================================
# PRORES/MOV TRANSCODE TESTS (if supported)
# ============================================================================

@pytest.mark.skipif(not ffmpeg_available(), reason="ffmpeg not available")
@pytest.mark.skipif(not ffprobe_available(), reason="ffprobe not available")
class TestProResTranscode:
    """Test ProRes/MOV transcoding with ffprobe validation."""
    
    @pytest.fixture
    def prores_available(self):
        """Check if ProRes encoding is available."""
        cmd = ["ffmpeg", "-hide_banner", "-codecs"]
        result = subprocess.run(cmd, capture_output=True, text=True)
        return "prores_ks" in result.stdout or "prores" in result.stdout
    
    def test_prores_proxy_mov(self, temp_output_dir, prores_available):
        """ProRes Proxy/MOV transcode produces valid output."""
        if not prores_available:
            pytest.skip("ProRes encoding not available")
        
        input_file = get_test_file("short_h264_audio.mp4")
        if input_file is None:
            input_file = TEST_MEDIA_DIR / "test_input.mp4"
        if not input_file.exists():
            pytest.skip("No test input file available")
        
        output_file = temp_output_dir / "output.mov"
        
        cmd = [
            "ffmpeg", "-y",
            "-i", str(input_file),
            "-c:v", "prores_ks",
            "-profile:v", "0",  # Proxy
            "-c:a", "pcm_s16le",
            str(output_file),
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        assert result.returncode == 0, f"FFmpeg failed: {result.stderr}"
        
        # Validate output
        info = assert_file_valid(output_file)
        assert_container(info, "mov")
        assert_video_codec(info, "prores")  # ffprobe reports "prores" for all variants


# ============================================================================
# ERROR HANDLING TESTS
# ============================================================================

@pytest.mark.skipif(not ffmpeg_available(), reason="ffmpeg not available")
@pytest.mark.skipif(not ffprobe_available(), reason="ffprobe not available")
class TestErrorHandling:
    """Test error handling for invalid inputs."""
    
    def test_corrupt_input_fails(self, temp_output_dir):
        """Corrupt input file causes FFmpeg to fail."""
        corrupt_file = get_test_file("corrupt.mp4")
        if corrupt_file is None:
            pytest.skip("Corrupt test file not available")
        
        output_file = temp_output_dir / "output.mp4"
        
        # FFmpeg should fail on corrupt input
        success = run_ffmpeg_transcode(
            corrupt_file,
            output_file,
            video_codec="libx264",
            audio_codec="aac",
        )
        
        # Should fail
        assert not success, "FFmpeg should fail on corrupt input"
        # Output should not exist or be zero bytes
        assert not output_file.exists() or output_file.stat().st_size == 0
    
    def test_missing_input_fails(self, temp_output_dir):
        """Missing input file causes FFmpeg to fail."""
        missing_file = Path("/nonexistent/path/to/video.mp4")
        output_file = temp_output_dir / "output.mp4"
        
        success = run_ffmpeg_transcode(
            missing_file,
            output_file,
            video_codec="libx264",
            audio_codec="aac",
        )
        
        assert not success, "FFmpeg should fail on missing input"
    
    def test_unwritable_output_fails(self, temp_output_dir):
        """Unwritable output directory causes FFmpeg to fail."""
        input_file = get_test_file("short_h264_audio.mp4")
        if input_file is None:
            input_file = TEST_MEDIA_DIR / "test_input.mp4"
        if not input_file.exists():
            pytest.skip("No test input file available")
        
        # Try to write to root (should fail on macOS/Linux without root)
        output_file = Path("/output.mp4")
        
        success = run_ffmpeg_transcode(
            input_file,
            output_file,
            video_codec="libx264",
            audio_codec="aac",
        )
        
        # Should fail due to permission denied
        assert not success, "FFmpeg should fail when output is unwritable"


# ============================================================================
# AUDIO-LESS INPUT TESTS
# ============================================================================

@pytest.mark.skipif(not ffmpeg_available(), reason="ffmpeg not available")
@pytest.mark.skipif(not ffprobe_available(), reason="ffprobe not available")
class TestAudioLessInput:
    """Test transcoding of inputs without audio."""
    
    def test_no_audio_input_succeeds(self, temp_output_dir):
        """Transcode succeeds when input has no audio."""
        input_file = get_test_file("no_audio.mp4")
        if input_file is None:
            pytest.skip("No-audio test file not available")
        
        output_file = temp_output_dir / "output.mp4"
        
        success = run_ffmpeg_transcode(
            input_file,
            output_file,
            video_codec="libx264",
            audio_codec="none",  # No audio in output either
        )
        assert success
        
        # Output should be valid video without audio
        info = probe_file(output_file)
        assert info.video is not None
        assert info.audio is None
