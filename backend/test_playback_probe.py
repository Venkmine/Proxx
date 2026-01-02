#!/usr/bin/env python3
"""
Test Playback Probe — CLI Script for Testing Playback Capability Detection

============================================================================
USAGE
============================================================================
Single file:
    python backend/test_playback_probe.py /path/to/media.mp4

Multiple files:
    python backend/test_playback_probe.py /path/to/file1.mp4 /path/to/file2.mxf

Directory (batch test):
    python backend/test_playback_probe.py /path/to/media/folder

With glob pattern:
    python backend/test_playback_probe.py "/path/to/media/*.mxf"

============================================================================
OUTPUT
============================================================================
For each file, outputs:
    [PLAYBACK PROBE] path=... capability=PLAYABLE|METADATA_ONLY|NO_VIDEO|ERROR ms=123

Summary at end:
    Total: 10 files
    PLAYABLE: 7
    METADATA_ONLY: 2
    NO_VIDEO: 0
    ERROR: 1

============================================================================
"""

import argparse
import glob
import os
import sys
from pathlib import Path
from typing import List

# Add backend to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from playback_probe import (
    probe_playback_capability,
    PlaybackCapability,
    clear_probe_cache,
)


def find_media_files(path: str) -> List[Path]:
    """
    Find media files from a path, glob pattern, or directory.
    
    Returns list of Path objects.
    """
    p = Path(path)
    
    # Glob pattern
    if '*' in path or '?' in path:
        return [Path(f) for f in glob.glob(path, recursive=True) if Path(f).is_file()]
    
    # Directory - find all media files
    if p.is_dir():
        media_extensions = {
            '.mp4', '.mov', '.mxf', '.mkv', '.avi',
            '.r3d', '.ari', '.arx', '.braw',
            '.dpx', '.exr', '.tiff', '.tif',
        }
        files = []
        for item in sorted(p.rglob('*')):
            if item.is_file() and item.suffix.lower() in media_extensions:
                files.append(item)
        return files
    
    # Single file
    if p.exists():
        return [p]
    
    return []


def main():
    parser = argparse.ArgumentParser(
        description='Test playback capability detection for media files',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    parser.add_argument(
        'paths',
        nargs='+',
        help='Media file paths, directories, or glob patterns'
    )
    parser.add_argument(
        '--no-cache',
        action='store_true',
        help='Clear cache between each probe (for benchmarking)'
    )
    parser.add_argument(
        '--json',
        action='store_true',
        help='Output results in JSON format'
    )
    
    args = parser.parse_args()
    
    # Collect all files
    all_files: List[Path] = []
    for path in args.paths:
        files = find_media_files(path)
        all_files.extend(files)
    
    if not all_files:
        print("No media files found.", file=sys.stderr)
        sys.exit(1)
    
    print(f"Found {len(all_files)} media file(s)\n")
    
    # Probe each file
    results = {cap: 0 for cap in PlaybackCapability}
    detailed_results = []
    
    for file_path in all_files:
        if args.no_cache:
            clear_probe_cache()
        
        result = probe_playback_capability(str(file_path))
        results[result.capability] += 1
        
        detailed_results.append({
            'path': str(file_path),
            'capability': result.capability.value,
            'probe_ms': result.probe_ms,
            'message': result.message,
        })
        
        # Color-coded output
        cap = result.capability
        if cap == PlaybackCapability.PLAYABLE:
            color = '\033[92m'  # Green
        elif cap == PlaybackCapability.METADATA_ONLY:
            color = '\033[93m'  # Yellow
        elif cap == PlaybackCapability.NO_VIDEO:
            color = '\033[94m'  # Blue
        else:
            color = '\033[91m'  # Red
        reset = '\033[0m'
        
        print(f"[PROBE] {file_path.name}")
        print(f"  Capability: {color}{cap.value}{reset}")
        print(f"  Time: {result.probe_ms}ms")
        if cap != PlaybackCapability.PLAYABLE:
            print(f"  Message: {result.message}")
        print()
    
    # Summary
    print("=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"Total: {len(all_files)} files")
    for cap in PlaybackCapability:
        count = results[cap]
        if count > 0:
            if cap == PlaybackCapability.PLAYABLE:
                color = '\033[92m'
            elif cap == PlaybackCapability.METADATA_ONLY:
                color = '\033[93m'
            elif cap == PlaybackCapability.NO_VIDEO:
                color = '\033[94m'
            else:
                color = '\033[91m'
            reset = '\033[0m'
            print(f"  {color}{cap.value}{reset}: {count}")
    
    # JSON output
    if args.json:
        import json
        print("\n" + "=" * 60)
        print("JSON OUTPUT")
        print("=" * 60)
        print(json.dumps(detailed_results, indent=2))


if __name__ == '__main__':
    main()
