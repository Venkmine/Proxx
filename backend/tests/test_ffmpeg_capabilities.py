"""
Tests for FFmpeg hardware capability detection.

These tests use mocked ffmpeg output to verify parsing logic
without requiring actual GPU hardware.
"""

import pytest
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

# Add backend to path for imports
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from execution.ffmpegCapabilities import (
    detect_ffmpeg_capabilities,
    _detect_hwaccels,
    _detect_encoders,
    FFmpegCapabilitiesError,
)


# Sample ffmpeg -hwaccels output (macOS with VideoToolbox)
SAMPLE_HWACCELS_MACOS = """ffmpeg version 6.1 Copyright (c) 2000-2023 the FFmpeg developers
Hardware acceleration methods:
videotoolbox
"""

# Sample ffmpeg -hwaccels output (Linux with CUDA)
SAMPLE_HWACCELS_LINUX_CUDA = """ffmpeg version 6.1 Copyright (c) 2000-2023 the FFmpeg developers
Hardware acceleration methods:
cuda
nvdec
vaapi
"""

# Sample ffmpeg -hwaccels output (no GPU)
SAMPLE_HWACCELS_NONE = """ffmpeg version 6.1 Copyright (c) 2000-2023 the FFmpeg developers
Hardware acceleration methods:
"""

# Sample ffmpeg -encoders output (subset with relevant encoders)
SAMPLE_ENCODERS = """ffmpeg version 6.1 Copyright (c) 2000-2023 the FFmpeg developers
Encoders:
 V..... = Video
 A..... = Audio
 S..... = Subtitle
 .F.... = Frame-level multithreading
 ..S... = Slice-level multithreading
 ...X.. = Codec is experimental
 ....B. = Supports draw_horiz_band
 .....D = Supports direct rendering method 1
 ------
 V..... av1_nvenc            NVIDIA NVENC AV1 encoder (codec av1)
 V..... h264_nvenc           NVIDIA NVENC H.264 encoder (codec h264)
 V..... hevc_nvenc           NVIDIA NVENC H.265 encoder (codec hevc)
 V..... h264_videotoolbox    VideoToolbox H.264 Encoder (codec h264)
 V..... hevc_videotoolbox    VideoToolbox H.265 Encoder (codec hevc)
 V..... libx264              libx264 H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10 (codec h264)
 V..... libx265              libx265 H.265 / HEVC (codec hevc)
 V..... prores_ks            Apple ProRes (iCodec Pro) (codec prores)
"""


class TestFFmpegCapabilityDetection:
    """Test FFmpeg capability detection functions."""
    
    def test_detect_hwaccels_macos(self):
        """Test parsing hwaccels on macOS (VideoToolbox)."""
        with patch("execution.ffmpegCapabilities._run_ffmpeg_command") as mock_run:
            mock_run.return_value = SAMPLE_HWACCELS_MACOS
            
            hwaccels = _detect_hwaccels()
            
            assert "videotoolbox" in hwaccels
            mock_run.assert_called_once_with(["-hwaccels"])
    
    def test_detect_hwaccels_linux_cuda(self):
        """Test parsing hwaccels on Linux with CUDA."""
        with patch("execution.ffmpegCapabilities._run_ffmpeg_command") as mock_run:
            mock_run.return_value = SAMPLE_HWACCELS_LINUX_CUDA
            
            hwaccels = _detect_hwaccels()
            
            assert "cuda" in hwaccels
            assert "nvdec" in hwaccels
            assert "vaapi" in hwaccels
    
    def test_detect_hwaccels_none(self):
        """Test parsing hwaccels when no GPU available."""
        with patch("execution.ffmpegCapabilities._run_ffmpeg_command") as mock_run:
            mock_run.return_value = SAMPLE_HWACCELS_NONE
            
            hwaccels = _detect_hwaccels()
            
            assert hwaccels == []
    
    def test_detect_hwaccels_error_handling(self):
        """Test hwaccels detection handles errors gracefully."""
        with patch("execution.ffmpegCapabilities._run_ffmpeg_command") as mock_run:
            mock_run.side_effect = FFmpegCapabilitiesError("ffmpeg not found")
            
            hwaccels = _detect_hwaccels()
            
            # Should return empty list on error, not raise
            assert hwaccels == []
    
    def test_detect_encoders_gpu(self):
        """Test parsing GPU encoders."""
        with patch("execution.ffmpegCapabilities._run_ffmpeg_command") as mock_run:
            mock_run.return_value = SAMPLE_ENCODERS
            
            encoders = _detect_encoders()
            
            # Check GPU encoders
            gpu = encoders["gpu"]
            assert "h264_nvenc" in gpu
            assert "hevc_nvenc" in gpu
            assert "av1_nvenc" in gpu
            assert "h264_videotoolbox" in gpu
            assert "hevc_videotoolbox" in gpu
            
            # ProRes should NOT be in GPU
            assert not any("prores" in e for e in gpu)
    
    def test_detect_encoders_cpu(self):
        """Test parsing CPU encoders."""
        with patch("execution.ffmpegCapabilities._run_ffmpeg_command") as mock_run:
            mock_run.return_value = SAMPLE_ENCODERS
            
            encoders = _detect_encoders()
            
            # Check CPU encoders
            cpu = encoders["cpu"]
            assert "prores_ks" in cpu
            assert "libx264" in cpu
            assert "libx265" in cpu
    
    def test_detect_encoders_error_handling(self):
        """Test encoder detection handles errors gracefully."""
        with patch("execution.ffmpegCapabilities._run_ffmpeg_command") as mock_run:
            mock_run.side_effect = FFmpegCapabilitiesError("ffmpeg not found")
            
            encoders = _detect_encoders()
            
            # Should return empty dicts on error, not raise
            assert encoders == {"gpu": [], "cpu": []}
    
    def test_detect_ffmpeg_capabilities_full(self):
        """Test full capability detection."""
        with patch("execution.ffmpegCapabilities._run_ffmpeg_command") as mock_run:
            # Mock both commands
            def side_effect(args):
                if args == ["-hwaccels"]:
                    return SAMPLE_HWACCELS_MACOS
                elif args == ["-encoders"]:
                    return SAMPLE_ENCODERS
                return ""
            
            mock_run.side_effect = side_effect
            
            capabilities = detect_ffmpeg_capabilities()
            
            # Check structure
            assert "hwaccels" in capabilities
            assert "encoders" in capabilities
            assert "prores_gpu_supported" in capabilities
            
            # Check hwaccels
            assert "videotoolbox" in capabilities["hwaccels"]
            
            # Check encoders
            assert "gpu" in capabilities["encoders"]
            assert "cpu" in capabilities["encoders"]
            assert "h264_videotoolbox" in capabilities["encoders"]["gpu"]
            assert "prores_ks" in capabilities["encoders"]["cpu"]
            
            # Check ProRes GPU assertion
            assert capabilities["prores_gpu_supported"] is False
    
    def test_prores_gpu_always_false(self):
        """Test that ProRes GPU support is ALWAYS false."""
        with patch("execution.ffmpegCapabilities._run_ffmpeg_command") as mock_run:
            def side_effect(args):
                if args == ["-hwaccels"]:
                    return SAMPLE_HWACCELS_LINUX_CUDA
                elif args == ["-encoders"]:
                    return SAMPLE_ENCODERS
                return ""
            
            mock_run.side_effect = side_effect
            
            capabilities = detect_ffmpeg_capabilities()
            
            # This is a hard assertion - ProRes has no GPU encoder
            assert capabilities["prores_gpu_supported"] is False
    
    def test_prores_never_in_gpu_encoders(self):
        """Test that ProRes never appears in GPU encoder list."""
        # Even if ffmpeg output is corrupted, we should filter it
        corrupted_encoders = SAMPLE_ENCODERS + "\n V..... prores_gpu_fake    Fake ProRes GPU (should not exist)"
        
        with patch("execution.ffmpegCapabilities._run_ffmpeg_command") as mock_run:
            def side_effect(args):
                if args == ["-hwaccels"]:
                    return SAMPLE_HWACCELS_NONE
                elif args == ["-encoders"]:
                    return corrupted_encoders
                return ""
            
            mock_run.side_effect = side_effect
            
            capabilities = detect_ffmpeg_capabilities()
            
            # ProRes should never be in GPU list
            gpu_encoders = capabilities["encoders"]["gpu"]
            assert not any("prores" in e.lower() for e in gpu_encoders)
            
            # It should be moved to CPU list
            cpu_encoders = capabilities["encoders"]["cpu"]
            assert any("prores" in e.lower() for e in cpu_encoders)
    
    def test_no_gpu_system(self):
        """Test detection on system with no GPU."""
        with patch("execution.ffmpegCapabilities._run_ffmpeg_command") as mock_run:
            def side_effect(args):
                if args == ["-hwaccels"]:
                    return SAMPLE_HWACCELS_NONE
                elif args == ["-encoders"]:
                    # Only CPU encoders
                    return """Encoders:
 V..... libx264              libx264 H.264
 V..... prores_ks            Apple ProRes
"""
                return ""
            
            mock_run.side_effect = side_effect
            
            capabilities = detect_ffmpeg_capabilities()
            
            # No hwaccels
            assert capabilities["hwaccels"] == []
            
            # No GPU encoders
            assert capabilities["encoders"]["gpu"] == []
            
            # CPU encoders available
            assert "libx264" in capabilities["encoders"]["cpu"]
            assert "prores_ks" in capabilities["encoders"]["cpu"]
            
            # ProRes GPU still false
            assert capabilities["prores_gpu_supported"] is False


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
