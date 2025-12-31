#!/usr/bin/env python3
"""
Golden Render Media Setup - Generate test media fixtures on demand.

This script generates the synthetic test media required for golden render
verification. It must be run before running the golden verification suite.

Real media files are NOT committed to the repository per the Test Media Policy
(see docs/QA.md section 10). This script generates them on demand using FFmpeg.

For BRAW samples, this script will:
1. Check if forge-tests/samples contains a BRAW file
2. Create a symlink to that file in qa/media/

Usage:
======
    python qa/media/setup_golden_media.py

This only needs to be run once, or after cleaning the qa/media/ directory.
"""

from pathlib import Path
import subprocess
import shutil
import sys

# Paths
REPO_ROOT = Path(__file__).parent.parent.parent
MEDIA_DIR = Path(__file__).parent
SAMPLES_DIR = REPO_ROOT / "forge-tests" / "samples"


def check_ffmpeg() -> bool:
    """Check if FFmpeg is available."""
    return shutil.which("ffmpeg") is not None


def generate_ffmpeg_sample_mov() -> bool:
    """
    Generate a synthetic test video (ProRes Proxy with test pattern and tone).
    
    Specs:
    - Duration: 3 seconds
    - Resolution: 1920x1080
    - Frame rate: 24fps
    - Codec: ProRes Proxy
    - Audio: 48kHz mono PCM
    - Timecode: 01:00:00:00
    """
    output = MEDIA_DIR / "ffmpeg_sample.mov"
    
    if output.exists():
        print(f"  ✓ {output.name} already exists")
        return True
    
    print(f"  Generating {output.name}...")
    
    result = subprocess.run(
        [
            "ffmpeg",
            "-f", "lavfi", "-i", "testsrc2=duration=3:size=1920x1080:rate=24",
            "-f", "lavfi", "-i", "sine=frequency=1000:duration=3:sample_rate=48000",
            "-c:v", "prores_ks", "-profile:v", "0",
            "-c:a", "pcm_s16le",
            "-timecode", "01:00:00:00",
            "-y",
            str(output),
        ],
        capture_output=True,
        text=True,
    )
    
    if result.returncode != 0:
        print(f"  ✗ Failed to generate {output.name}")
        print(f"    stderr: {result.stderr[:500]}")
        return False
    
    print(f"  ✓ Generated {output.name}")
    return True


def generate_ffmpeg_sample_wav() -> bool:
    """
    Generate a synthetic test audio file (stereo WAV with 440Hz tone).
    
    Specs:
    - Duration: 3 seconds
    - Sample rate: 48kHz
    - Channels: 2 (stereo)
    - Format: PCM 16-bit
    """
    output = MEDIA_DIR / "ffmpeg_sample.wav"
    
    if output.exists():
        print(f"  ✓ {output.name} already exists")
        return True
    
    print(f"  Generating {output.name}...")
    
    result = subprocess.run(
        [
            "ffmpeg",
            "-f", "lavfi", "-i", "sine=frequency=440:duration=3:sample_rate=48000",
            "-ac", "2",
            "-c:a", "pcm_s16le",
            "-y",
            str(output),
        ],
        capture_output=True,
        text=True,
    )
    
    if result.returncode != 0:
        print(f"  ✗ Failed to generate {output.name}")
        print(f"    stderr: {result.stderr[:500]}")
        return False
    
    print(f"  ✓ Generated {output.name}")
    return True


def setup_resolve_raw_sample() -> bool:
    """
    Set up the BRAW sample for Resolve tests.
    
    This creates a symlink to an existing BRAW file in forge-tests/samples,
    since BRAW files cannot be synthetically generated.
    """
    output = MEDIA_DIR / "resolve_raw_sample.braw"
    
    if output.exists():
        print(f"  ✓ {output.name} already exists")
        return True
    
    # Look for existing BRAW sample in forge-tests/samples
    braw_sample = SAMPLES_DIR / "braw_sample.braw"
    
    if not braw_sample.exists():
        # Try to find any .braw file
        braw_files = list(SAMPLES_DIR.rglob("*.braw"))
        if braw_files:
            braw_sample = braw_files[0]
    
    if not braw_sample.exists():
        print(f"  ⚠ No BRAW sample found in forge-tests/samples/")
        print(f"    Resolve tests will not be available.")
        print(f"    To enable: copy a short BRAW clip to forge-tests/samples/braw_sample.braw")
        return False
    
    print(f"  Creating symlink to {braw_sample.name}...")
    
    try:
        # Use relative path for portability
        relative_target = Path("../../forge-tests/samples") / braw_sample.name
        output.symlink_to(relative_target)
        print(f"  ✓ Created symlink {output.name} -> {relative_target}")
        return True
    except OSError as e:
        print(f"  ✗ Failed to create symlink: {e}")
        # Fall back to copy
        try:
            shutil.copy2(braw_sample, output)
            print(f"  ✓ Copied {braw_sample.name} to {output.name}")
            return True
        except Exception as e2:
            print(f"  ✗ Failed to copy: {e2}")
            return False


def main() -> int:
    """Set up all golden render test media."""
    print("=" * 60)
    print("Golden Render Media Setup")
    print("=" * 60)
    print()
    
    if not check_ffmpeg():
        print("✗ FFmpeg not found. Cannot generate synthetic media.")
        return 1
    
    print("Generating synthetic test media...")
    print()
    
    # Ensure media directory exists
    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    
    results = []
    
    # Generate FFmpeg samples
    results.append(("ffmpeg_sample.mov", generate_ffmpeg_sample_mov()))
    results.append(("ffmpeg_sample.wav", generate_ffmpeg_sample_wav()))
    
    # Set up Resolve sample
    results.append(("resolve_raw_sample.braw", setup_resolve_raw_sample()))
    
    print()
    print("=" * 60)
    print("Summary")
    print("=" * 60)
    
    all_ok = True
    for name, success in results:
        status = "✓" if success else "✗"
        print(f"  {status} {name}")
        if not success:
            all_ok = False
    
    print()
    if all_ok:
        print("All media ready. You can now run golden verification:")
        print("  python qa/golden/run_golden_verification.py")
        return 0
    else:
        print("Some media could not be set up. See above for details.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
