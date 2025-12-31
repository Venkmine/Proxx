"""
Automated tests for proxy attach audio parity enforcement.

These tests validate that Forge maintains strict audio compatibility
between source and proxy files for NLE attach workflows.

Test Coverage:
- Mono audio (1 channel)
- Stereo audio (2 channels)
- Quad audio (4 channels)
- 5.1 surround (6 channels)
- Sample rate matching
- Channel layout preservation
- Container compatibility validation
"""

import pytest
import json
import subprocess
from pathlib import Path
import sys
import tempfile
import shutil

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "backend"))

from audio_probe import (
    probe_audio,
    validate_container_compatibility,
    verify_audio_parity,
    get_recommended_audio_config,
    AudioProbeError,
)


# =============================================================================
# Test Fixtures
# =============================================================================

@pytest.fixture
def temp_dir():
    """Create a temporary directory for test outputs."""
    tmp = tempfile.mkdtemp()
    yield Path(tmp)
    shutil.rmtree(tmp)


def create_test_video(output_path: Path, channels: int, sample_rate: int, duration: int = 2):
    """
    Create a test video file with specific audio properties.
    
    Args:
        output_path: Where to save the test file
        channels: Number of audio channels
        sample_rate: Audio sample rate in Hz
        duration: Video duration in seconds
    """
    cmd = [
        'ffmpeg', '-y',
        '-f', 'lavfi', '-i', f'testsrc=duration={duration}:size=1920x1080:rate=30',
        '-f', 'lavfi', '-i', f'sine=frequency=1000:sample_rate={sample_rate}:duration={duration}',
        '-c:v', 'libx264', '-preset', 'ultrafast',
        '-c:a', 'pcm_s16le',
        '-ac', str(channels),
        '-ar', str(sample_rate),
        str(output_path)
    ]
    subprocess.run(cmd, check=True, capture_output=True)


# =============================================================================
# Audio Probing Tests
# =============================================================================

def test_probe_mono_audio(temp_dir):
    """Test probing mono (1 channel) audio."""
    test_file = temp_dir / "mono_test.mov"
    create_test_video(test_file, channels=1, sample_rate=48000)
    
    props = probe_audio(test_file)
    
    assert props.channels == 1
    assert props.sample_rate == 48000
    assert props.codec == "pcm_s16le"


def test_probe_stereo_audio(temp_dir):
    """Test probing stereo (2 channel) audio."""
    test_file = temp_dir / "stereo_test.mov"
    create_test_video(test_file, channels=2, sample_rate=48000)
    
    props = probe_audio(test_file)
    
    assert props.channels == 2
    assert props.sample_rate == 48000
    assert props.codec == "pcm_s16le"
    assert props.channel_layout == "stereo"


def test_probe_quad_audio(temp_dir):
    """Test probing quad (4 channel) audio."""
    test_file = temp_dir / "quad_test.mov"
    create_test_video(test_file, channels=4, sample_rate=48000)
    
    props = probe_audio(test_file)
    
    assert props.channels == 4
    assert props.sample_rate == 48000


def test_probe_51_audio(temp_dir):
    """Test probing 5.1 surround (6 channel) audio."""
    test_file = temp_dir / "51_test.mov"
    create_test_video(test_file, channels=6, sample_rate=48000)
    
    props = probe_audio(test_file)
    
    assert props.channels == 6
    assert props.sample_rate == 48000


def test_probe_nonexistent_file():
    """Test that probing a nonexistent file raises error."""
    with pytest.raises(AudioProbeError, match="File not found"):
        probe_audio(Path("/nonexistent/file.mov"))


# =============================================================================
# Container Compatibility Tests
# =============================================================================

def test_mov_mono_compatible():
    """MOV supports mono audio."""
    compatible, error = validate_container_compatibility("mov", 1)
    assert compatible is True
    assert error is None


def test_mov_stereo_compatible():
    """MOV supports stereo audio."""
    compatible, error = validate_container_compatibility("mov", 2)
    assert compatible is True
    assert error is None


def test_mov_multichannel_compatible():
    """MOV supports multichannel audio (4+ channels)."""
    compatible, error = validate_container_compatibility("mov", 6)
    assert compatible is True
    assert error is None


def test_mp4_stereo_compatible():
    """MP4 supports stereo audio."""
    compatible, error = validate_container_compatibility("mp4", 2)
    assert compatible is True
    assert error is None


def test_mp4_multichannel_incompatible():
    """MP4 does NOT reliably support multichannel audio for NLE attach."""
    compatible, error = validate_container_compatibility("mp4", 4)
    assert compatible is False
    assert "MP4" in error
    assert "MOV" in error


def test_mp4_51_incompatible():
    """MP4 does NOT reliably support 5.1 audio for NLE attach."""
    compatible, error = validate_container_compatibility("mp4", 6)
    assert compatible is False
    assert "MP4" in error


# =============================================================================
# Audio Parity Verification Tests
# =============================================================================

def test_audio_parity_identical_files(temp_dir):
    """Identical audio properties should pass parity check."""
    source = temp_dir / "source.mov"
    proxy = temp_dir / "proxy.mov"
    
    create_test_video(source, channels=2, sample_rate=48000)
    create_test_video(proxy, channels=2, sample_rate=48000)
    
    passed, error = verify_audio_parity(source, proxy)
    assert passed is True
    assert error is None


def test_audio_parity_channel_mismatch(temp_dir):
    """Different channel counts should fail parity check."""
    source = temp_dir / "source.mov"
    proxy = temp_dir / "proxy.mov"
    
    create_test_video(source, channels=2, sample_rate=48000)
    create_test_video(proxy, channels=1, sample_rate=48000)
    
    passed, error = verify_audio_parity(source, proxy)
    assert passed is False
    assert "Channel mismatch" in error
    assert "source=2" in error
    assert "proxy=1" in error


def test_audio_parity_sample_rate_mismatch(temp_dir):
    """Different sample rates should fail parity check."""
    source = temp_dir / "source.mov"
    proxy = temp_dir / "proxy.mov"
    
    create_test_video(source, channels=2, sample_rate=48000)
    create_test_video(proxy, channels=2, sample_rate=44100)
    
    passed, error = verify_audio_parity(source, proxy)
    assert passed is False
    assert "Sample rate mismatch" in error
    assert "48000" in error
    assert "44100" in error


def test_audio_parity_multichannel(temp_dir):
    """Multichannel audio parity should be enforced."""
    source = temp_dir / "source.mov"
    proxy = temp_dir / "proxy.mov"
    
    create_test_video(source, channels=6, sample_rate=48000)
    create_test_video(proxy, channels=6, sample_rate=48000)
    
    passed, error = verify_audio_parity(source, proxy)
    assert passed is True


def test_audio_parity_multichannel_mismatch(temp_dir):
    """Multichannel downmix should fail parity check."""
    source = temp_dir / "source.mov"
    proxy = temp_dir / "proxy.mov"
    
    create_test_video(source, channels=6, sample_rate=48000)
    create_test_video(proxy, channels=2, sample_rate=48000)  # Downmixed
    
    passed, error = verify_audio_parity(source, proxy)
    assert passed is False
    assert "Channel mismatch" in error


# =============================================================================
# Recommended Configuration Tests
# =============================================================================

def test_recommended_config_stereo(temp_dir):
    """Test recommended config for stereo source."""
    test_file = temp_dir / "stereo.mov"
    create_test_video(test_file, channels=2, sample_rate=48000)
    
    props = probe_audio(test_file)
    config = get_recommended_audio_config(props)
    
    assert config['codec'] == 'pcm_s16le'
    assert config['sample_rate'] == 48000
    assert config['channels'] == 2
    assert config['container'] == 'mov'


def test_recommended_config_multichannel(temp_dir):
    """Test recommended config for multichannel source."""
    test_file = temp_dir / "multichannel.mov"
    create_test_video(test_file, channels=6, sample_rate=48000)
    
    props = probe_audio(test_file)
    config = get_recommended_audio_config(props)
    
    assert config['codec'] == 'pcm_s16le'
    assert config['sample_rate'] == 48000
    assert config['channels'] == 6
    assert config['container'] == 'mov'  # Always MOV for compatibility


def test_recommended_config_preserves_sample_rate(temp_dir):
    """Test that recommended config preserves source sample rate."""
    test_file = temp_dir / "44k.mov"
    create_test_video(test_file, channels=2, sample_rate=44100)
    
    props = probe_audio(test_file)
    config = get_recommended_audio_config(props)
    
    assert config['sample_rate'] == 44100  # Preserved from source


# =============================================================================
# Integration Tests
# =============================================================================

def test_full_workflow_mono(temp_dir):
    """Test complete workflow for mono audio."""
    source = temp_dir / "source.mov"
    create_test_video(source, channels=1, sample_rate=48000)
    
    # Probe source
    source_props = probe_audio(source)
    assert source_props.channels == 1
    
    # Get recommended config
    config = get_recommended_audio_config(source_props)
    
    # Validate container
    compatible, _ = validate_container_compatibility(config['container'], config['channels'])
    assert compatible is True
    
    # Create proxy with same specs
    proxy = temp_dir / "proxy.mov"
    create_test_video(proxy, channels=config['channels'], sample_rate=config['sample_rate'])
    
    # Verify parity
    passed, error = verify_audio_parity(source, proxy)
    assert passed is True, f"Parity check failed: {error}"


def test_full_workflow_stereo(temp_dir):
    """Test complete workflow for stereo audio."""
    source = temp_dir / "source.mov"
    create_test_video(source, channels=2, sample_rate=48000)
    
    source_props = probe_audio(source)
    config = get_recommended_audio_config(source_props)
    
    proxy = temp_dir / "proxy.mov"
    create_test_video(proxy, channels=config['channels'], sample_rate=config['sample_rate'])
    
    passed, error = verify_audio_parity(source, proxy)
    assert passed is True


def test_full_workflow_quad(temp_dir):
    """Test complete workflow for quad audio."""
    source = temp_dir / "source.mov"
    create_test_video(source, channels=4, sample_rate=48000)
    
    source_props = probe_audio(source)
    config = get_recommended_audio_config(source_props)
    
    proxy = temp_dir / "proxy.mov"
    create_test_video(proxy, channels=config['channels'], sample_rate=config['sample_rate'])
    
    passed, error = verify_audio_parity(source, proxy)
    assert passed is True


def test_full_workflow_51(temp_dir):
    """Test complete workflow for 5.1 surround audio."""
    source = temp_dir / "source.mov"
    create_test_video(source, channels=6, sample_rate=48000)
    
    source_props = probe_audio(source)
    config = get_recommended_audio_config(source_props)
    
    proxy = temp_dir / "proxy.mov"
    create_test_video(proxy, channels=config['channels'], sample_rate=config['sample_rate'])
    
    passed, error = verify_audio_parity(source, proxy)
    assert passed is True


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
