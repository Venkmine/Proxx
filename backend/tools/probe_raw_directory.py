#!/usr/bin/env python3
"""
Comprehensive RAW directory probing tool.

Probes ALL media files (excluding image sequences) in:
  /Users/leon.grant/projects/Proxx/forge-tests/samples/RAW

For each file:
1. Probe with ffprobe to get container, codec, pixel format
2. Determine expected engine (resolve vs ffmpeg) using current routing logic
3. Log results in structured format
4. Identify any misrouted files

CRITICAL: This script ONLY probes and reports. It does NOT modify files.
"""

import json
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

# Add backend to path for imports
BACKEND_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from v2.source_capabilities import (
    get_execution_engine,
    ExecutionEngine,
    RAW_CODECS_RESOLVE,
    normalize_format,
    is_source_rejected,
)

# Image sequence extensions (V1 explicitly rejects these)
IMAGE_SEQUENCE_EXTENSIONS = {
    'exr', 'dpx', 'tif', 'tiff', 'png', 'jpg', 'jpeg',
    'ari',  # ARRI RAW stills
    'nef',  # Nikon RAW stills
    'cr2', 'cr3',  # Canon RAW stills
    'arw',  # Sony RAW stills
}

# RAW folder indicators
RAW_CAMERA_FOLDER_INDICATORS = {
    '.r3d', '.R3D',  # RED
    '.arx',  # ARRI
    '.nev', '.NEV',  # Nikon
    '.braw',  # Blackmagic
    '.crm',  # Canon
}


def probe_file_ffprobe(file_path: Path) -> Optional[Dict[str, Any]]:
    """
    Probe file with ffprobe to extract container, codec, and pixel format.
    
    Returns:
        Dict with 'container', 'codec', 'pix_fmt', 'width', 'height', 'duration'
        None if probe fails
    """
    try:
        result = subprocess.run(
            [
                'ffprobe',
                '-v', 'error',
                '-select_streams', 'v:0',
                '-show_entries', 'stream=codec_name,pix_fmt,width,height,duration',
                '-show_entries', 'format=format_name,duration',
                '-of', 'json',
                str(file_path),
            ],
            capture_output=True,
            text=True,
            timeout=10,
        )
        
        if result.returncode != 0:
            return None
        
        data = json.loads(result.stdout)
        
        # Extract video stream info
        streams = data.get('streams', [])
        if not streams:
            return None
        
        video_stream = streams[0]
        format_info = data.get('format', {})
        
        # Get container from format_name (first one if comma-separated)
        container = format_info.get('format_name', '').split(',')[0]
        
        return {
            'container': container or 'unknown',
            'codec': video_stream.get('codec_name', 'unknown'),
            'pix_fmt': video_stream.get('pix_fmt', 'unknown'),
            'width': video_stream.get('width', 0),
            'height': video_stream.get('height', 0),
            'duration': format_info.get('duration', '0'),
        }
    
    except (subprocess.TimeoutExpired, json.JSONDecodeError, Exception) as e:
        print(f"  ⚠️  ffprobe failed: {e}", file=sys.stderr)
        return None


def is_raw_camera_folder(path: Path) -> bool:
    """Check if directory is a RAW camera folder structure."""
    if not path.is_dir():
        return False
    
    try:
        files = list(path.iterdir())
        # Check for RAW video file extensions
        for f in files:
            if f.suffix in RAW_CAMERA_FOLDER_INDICATORS:
                return True
    except (OSError, PermissionError):
        pass
    
    return False


def is_image_sequence(path: Path) -> bool:
    """Check if path is an image sequence (V1 rejects these)."""
    ext = path.suffix.lower().lstrip('.')
    
    # Check extension
    if ext in IMAGE_SEQUENCE_EXTENSIONS and ext != 'dng':
        return True
    
    # Check if directory with multiple image files
    if path.is_dir():
        if is_raw_camera_folder(path):
            return False
        
        try:
            files = list(path.iterdir())
            image_files = [f for f in files if f.suffix.lower().lstrip('.') in IMAGE_SEQUENCE_EXTENSIONS]
            if len(image_files) > 1:
                return True
        except (OSError, PermissionError):
            pass
    
    return False


def infer_codec_from_extension(file_path: Path) -> str:
    """Infer codec from file extension (for files that fail ffprobe)."""
    ext = file_path.suffix.lower().lstrip('.')
    
    raw_extensions = {
        'r3d': 'redcode',
        'arx': 'arriraw',
        'nev': 'nikon_raw',
        'braw': 'braw',
        'crm': 'canon_raw',
        'dng': 'cinemadng',
    }
    
    return raw_extensions.get(ext, 'unknown')


def determine_engine_from_routing(container: str, codec: str) -> Optional[str]:
    """Use the actual routing logic to determine engine."""
    engine = get_execution_engine(container, codec)
    
    if engine == ExecutionEngine.RESOLVE:
        return 'resolve'
    elif engine == ExecutionEngine.FFMPEG:
        return 'ffmpeg'
    else:
        return None


def scan_directory(base_dir: Path, exclude_dirs: List[str]) -> List[Dict[str, Any]]:
    """
    Recursively scan directory for all media files.
    
    Returns list of dicts with:
    - path: absolute path
    - type: 'file' or 'folder'
    - name: filename
    - container: container format
    - codec: video codec
    - pix_fmt: pixel format
    - engine: 'resolve' or 'ffmpeg' or 'unknown'
    - reason: why it routes to this engine
    - probe_status: 'success', 'failed', or 'skipped'
    """
    results = []
    
    def scan_recursive(dir_path: Path):
        if not dir_path.exists():
            return
        
        try:
            entries = list(dir_path.iterdir())
        except (OSError, PermissionError):
            return
        
        for entry in entries:
            # Skip excluded directories
            if any(excluded in str(entry) for excluded in exclude_dirs):
                continue
            
            # Skip hidden files and .DS_Store
            if entry.name.startswith('.'):
                continue
            
            if entry.is_dir():
                # Check if RAW camera folder
                if is_raw_camera_folder(entry):
                    results.append({
                        'path': str(entry),
                        'type': 'folder',
                        'name': entry.name,
                        'container': 'camera_folder',
                        'codec': 'raw_camera_folder',
                        'pix_fmt': 'n/a',
                        'engine': 'resolve',
                        'reason': 'RAW camera folder structure',
                        'probe_status': 'skipped',
                        'width': 0,
                        'height': 0,
                        'duration': '0',
                    })
                    # Don't recurse into RAW camera folders
                    continue
                
                # Check if image sequence folder
                if is_image_sequence(entry):
                    results.append({
                        'path': str(entry),
                        'type': 'folder',
                        'name': entry.name,
                        'container': 'image_sequence',
                        'codec': 'rejected',
                        'pix_fmt': 'n/a',
                        'engine': 'REJECTED',
                        'reason': 'Image sequence (V1 unsupported)',
                        'probe_status': 'skipped',
                        'width': 0,
                        'height': 0,
                        'duration': '0',
                    })
                    continue
                
                # Recurse into regular directories
                scan_recursive(entry)
            
            elif entry.is_file():
                ext = entry.suffix.lower().lstrip('.')
                
                # Skip if image sequence
                if is_image_sequence(entry):
                    results.append({
                        'path': str(entry),
                        'type': 'file',
                        'name': entry.name,
                        'container': ext,
                        'codec': 'rejected',
                        'pix_fmt': 'n/a',
                        'engine': 'REJECTED',
                        'reason': 'Image sequence (V1 unsupported)',
                        'probe_status': 'skipped',
                        'width': 0,
                        'height': 0,
                        'duration': '0',
                    })
                    continue
                
                # Only process video files
                video_exts = {
                    'braw', 'r3d', 'arx', 'nev', 'crm', 'dng',
                    'mov', 'mp4', 'mxf', 'avi', 'mkv', 'webm',
                    'cine', 'ts', 'mpg', 'm2ts',
                }
                
                if ext not in video_exts:
                    continue
                
                # Probe the file
                probe_data = probe_file_ffprobe(entry)
                
                if probe_data:
                    container = probe_data['container']
                    codec = probe_data['codec']
                    pix_fmt = probe_data['pix_fmt']
                    width = probe_data['width']
                    height = probe_data['height']
                    duration = probe_data['duration']
                    probe_status = 'success'
                else:
                    # Probe failed - infer from extension
                    container = ext
                    codec = infer_codec_from_extension(entry)
                    pix_fmt = 'unknown'
                    width = 0
                    height = 0
                    duration = '0'
                    probe_status = 'failed'
                
                # Determine engine from routing logic
                engine = determine_engine_from_routing(container, codec)
                
                # Check if explicitly rejected
                if is_source_rejected(container, codec):
                    engine = 'REJECTED'
                
                # Determine reason
                codec_norm = normalize_format(codec)
                if engine == 'REJECTED':
                    reason = f'Rejected format ({codec} in {container})'
                elif codec_norm in RAW_CODECS_RESOLVE:
                    reason = f'RAW codec ({codec})'
                elif engine == 'resolve':
                    reason = 'Resolve-only format'
                elif engine == 'ffmpeg':
                    reason = 'Standard format'
                else:
                    reason = 'Unknown/unsupported format'
                
                results.append({
                    'path': str(entry),
                    'type': 'file',
                    'name': entry.name,
                    'container': container,
                    'codec': codec,
                    'pix_fmt': pix_fmt,
                    'engine': engine or 'UNKNOWN',
                    'reason': reason,
                    'probe_status': probe_status,
                    'width': width,
                    'height': height,
                    'duration': duration,
                })
    
    scan_recursive(base_dir)
    return results


def main():
    """Main entry point."""
    raw_dir = Path('/Users/leon.grant/projects/Proxx/forge-tests/samples/RAW')
    exclude_dirs = ['Image_SEQS']
    
    print(f"\n🔍 Probing RAW directory: {raw_dir}")
    print(f"   Excluding: {', '.join(exclude_dirs)}\n")
    
    results = scan_directory(raw_dir, exclude_dirs)
    
    # Sort results by engine then path
    results.sort(key=lambda x: (x['engine'], x['path']))
    
    # Print summary
    print(f"\n📊 SUMMARY")
    print(f"   Total files/folders: {len(results)}")
    print(f"   Resolve engine: {len([r for r in results if r['engine'] == 'resolve'])}")
    print(f"   FFmpeg engine: {len([r for r in results if r['engine'] == 'ffmpeg'])}")
    print(f"   Unknown/Rejected: {len([r for r in results if r['engine'] not in ['resolve', 'ffmpeg']])}")
    print(f"   Probe failures: {len([r for r in results if r['probe_status'] == 'failed'])}")
    
    # Print detailed results
    print(f"\n\n📋 DETAILED RESULTS")
    print("=" * 120)
    
    current_engine = None
    for result in results:
        if result['engine'] != current_engine:
            current_engine = result['engine']
            print(f"\n{'='*120}")
            print(f"ENGINE: {current_engine}")
            print(f"{'='*120}")
        
        print(f"\n{result['name']}")
        print(f"  Type: {result['type']}")
        print(f"  Container: {result['container']}")
        print(f"  Codec: {result['codec']}")
        print(f"  Pixel Format: {result['pix_fmt']}")
        print(f"  Resolution: {result['width']}x{result['height']}")
        print(f"  Duration: {result['duration']}s")
        print(f"  Engine: {result['engine']}")
        print(f"  Reason: {result['reason']}")
        print(f"  Probe Status: {result['probe_status']}")
        print(f"  Path: {result['path']}")
    
    # Save JSON report
    output_file = Path(__file__).parent / 'probe_raw_directory_report.json'
    with open(output_file, 'w') as f:
        json.dump(results, f, indent=2)
    
    print(f"\n\n✅ Report saved to: {output_file}")
    
    # Identify potential issues
    print(f"\n\n⚠️  POTENTIAL ISSUES")
    print("=" * 120)
    
    issues = []
    
    # Find files that should go to Resolve but might be misrouted
    for result in results:
        if result['engine'] == 'ffmpeg':
            # Check if codec name suggests RAW
            codec = result['codec'].lower()
            if any(x in codec for x in ['raw', 'redcode', 'arri', 'braw', 'venice', 'xocn']):
                issues.append({
                    'file': result['name'],
                    'issue': f'RAW codec ({result["codec"]}) routed to FFmpeg',
                    'recommendation': 'Should route to Resolve',
                })
        
        # Check for unknown codecs routed to FFmpeg
        if result['engine'] == 'ffmpeg' and result['codec'] == 'unknown':
            issues.append({
                'file': result['name'],
                'issue': f'Unknown codec routed to FFmpeg',
                'recommendation': 'Unknown codecs should route to Resolve',
            })
        
        # Check for probe failures on non-RAW files
        if result['probe_status'] == 'failed' and result['engine'] == 'ffmpeg':
            issues.append({
                'file': result['name'],
                'issue': 'ffprobe failed but routed to FFmpeg',
                'recommendation': 'May need manual verification',
            })
    
    if issues:
        for issue in issues:
            print(f"\n❌ {issue['file']}")
            print(f"   Issue: {issue['issue']}")
            print(f"   Recommendation: {issue['recommendation']}")
    else:
        print("\n✅ No obvious routing issues detected!")
    
    print("\n")


if __name__ == '__main__':
    main()
