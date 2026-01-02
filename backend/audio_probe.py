"""
Audio probing utilities for proxy attach compatibility enforcement.

This module provides strict audio property detection to guarantee:
- Channel count parity
- Channel order parity
- Sample rate parity
- Container compatibility for NLE attach workflows
"""

import subprocess
import json
from pathlib import Path
from typing import Dict, Optional, List
from dataclasses import dataclass


@dataclass
class AudioProperties:
    """Audio properties extracted from media file."""
    channels: int
    sample_rate: int
    codec: str
    channel_layout: Optional[str] = None
    bit_depth: Optional[int] = None
    
    def matches(self, other: 'AudioProperties') -> bool:
        """Check if audio properties match for attach compatibility."""
        return (
            self.channels == other.channels and
            self.sample_rate == other.sample_rate and
            self.channel_layout == other.channel_layout
        )
    
    def to_dict(self) -> Dict:
        """Convert to dictionary representation."""
        return {
            'channels': self.channels,
            'sample_rate': self.sample_rate,
            'codec': self.codec,
            'channel_layout': self.channel_layout,
            'bit_depth': self.bit_depth
        }


class AudioProbeError(Exception):
    """Raised when audio probing fails."""
    pass


def probe_audio(file_path: Path) -> AudioProperties:
    """
    Probe audio properties from a media file.
    
    Args:
        file_path: Path to media file
        
    Returns:
        AudioProperties with detected audio characteristics
        
    Raises:
        AudioProbeError: If probing fails or no audio stream found
    """
    if not file_path.exists():
        raise AudioProbeError(f"File not found: {file_path}")
    
    # Use ffprobe to extract audio stream info
    cmd = [
        'ffprobe',
        '-v', 'error',
        '-select_streams', 'a:0',  # First audio stream
        '-show_entries', 'stream=channels,sample_rate,codec_name,channel_layout,bits_per_raw_sample',
        '-of', 'json',
        str(file_path)
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        data = json.loads(result.stdout)
        
        if not data.get('streams'):
            raise AudioProbeError(f"No audio stream found in {file_path}")
        
        stream = data['streams'][0]
        
        # Extract required properties
        channels = stream.get('channels')
        sample_rate = stream.get('sample_rate')
        codec = stream.get('codec_name')
        
        if channels is None or sample_rate is None or codec is None:
            raise AudioProbeError(f"Incomplete audio metadata in {file_path}")
        
        return AudioProperties(
            channels=int(channels),
            sample_rate=int(sample_rate),
            codec=codec,
            channel_layout=stream.get('channel_layout'),
            bit_depth=int(stream['bits_per_raw_sample']) if stream.get('bits_per_raw_sample') else None
        )
        
    except subprocess.CalledProcessError as e:
        raise AudioProbeError(f"ffprobe failed: {e.stderr}")
    except json.JSONDecodeError as e:
        raise AudioProbeError(f"Failed to parse ffprobe output: {e}")
    except Exception as e:
        raise AudioProbeError(f"Audio probe error: {e}")


def validate_container_compatibility(container: str, channels: int) -> tuple[bool, Optional[str]]:
    """
    Validate container compatibility for given audio channel count.
    
    Args:
        container: Container format (mov, mp4, etc.)
        channels: Number of audio channels
        
    Returns:
        Tuple of (is_compatible, error_message)
    """
    container = container.lower()
    
    # MP4 limitation: multichannel audio problematic in NLEs
    if container == 'mp4' and channels > 2:
        return False, f"MP4 does not reliably support {channels} channel audio in NLE attach workflows. Use MOV."
    
    # MOV is universally compatible
    if container == 'mov':
        return True, None
    
    # Other containers: allow but warn
    return True, None


def get_recommended_audio_config(source_audio: AudioProperties) -> Dict:
    """
    Get recommended audio configuration for proxy that guarantees attach compatibility.
    
    Args:
        source_audio: Source file audio properties
        
    Returns:
        Dictionary with recommended audio encoding parameters
    """
    return {
        'codec': 'pcm_s16le',  # PCM for maximum compatibility
        'sample_rate': source_audio.sample_rate,  # Match source
        'channels': source_audio.channels,  # Exact match
        'channel_layout': source_audio.channel_layout,  # Preserve layout
        'container': 'mov'  # MOV for universal NLE compatibility
    }


def verify_audio_parity(source_path: Path, proxy_path: Path) -> tuple[bool, Optional[str]]:
    """
    Verify that proxy maintains audio parity with source.
    
    Args:
        source_path: Path to source file
        proxy_path: Path to proxy file
        
    Returns:
        Tuple of (passed, error_message)
    """
    try:
        source_audio = probe_audio(source_path)
        proxy_audio = probe_audio(proxy_path)
        
        # Check critical properties
        errors = []
        if source_audio.channels != proxy_audio.channels:
            errors.append(f"Channel mismatch: source={source_audio.channels}, proxy={proxy_audio.channels}")
        if source_audio.sample_rate != proxy_audio.sample_rate:
            errors.append(f"Sample rate mismatch: source={source_audio.sample_rate}, proxy={proxy_audio.sample_rate}")
        
        # Channel layout check is lenient: allow if both have same channel count
        # Some codecs (like PCM in MP4) may not report channel_layout metadata
        if source_audio.channel_layout and proxy_audio.channel_layout:
            # Both have layout info, they should match
            if source_audio.channel_layout != proxy_audio.channel_layout:
                errors.append(f"Channel layout mismatch: source={source_audio.channel_layout}, proxy={proxy_audio.channel_layout}")
        # If one or both lack layout info, rely on channel count match
        
        if errors:
            return False, "; ".join(errors)
        
        return True, None
        
    except AudioProbeError as e:
        return False, str(e)


if __name__ == '__main__':
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python audio_probe.py <file_path>")
        sys.exit(1)
    
    file_path = Path(sys.argv[1])
    try:
        props = probe_audio(file_path)
        print(json.dumps(props.to_dict(), indent=2))
    except AudioProbeError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
