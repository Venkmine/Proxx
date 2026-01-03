#!/usr/bin/env python3
"""
Empirical routing matrix generator.

Probes every media file in the RAW corpus and generates routing recommendations
based on ffprobe metadata + ffmpeg decode tests.
"""

import json
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Optional


# Exclusions
EXCLUDE_DIRS = {'Image_SEQS'}
EXCLUDE_EXTENSIONS = {
    '.xml', '.json', '.txt', '.zip', '.csv', '.md', '.aae', '.xmp', '.thm',
    '.log', '.pdf', '.html', '.rtf'
}

# Known RAW extensions that always route to Resolve
RAW_EXTENSIONS = {
    '.r3d',      # RED
    '.crm',      # Canon RAW
    '.cine',     # Phantom
    '.braw',     # Blackmagic RAW
    '.ari',      # ARRIRAW
    '.arri',     # ARRIRAW
}


def run_ffprobe(file_path: Path) -> Optional[Dict]:
    """Run ffprobe and return parsed JSON metadata."""
    try:
        cmd = [
            'ffprobe',
            '-v', 'error',
            '-show_streams',
            '-show_format',
            '-of', 'json',
            str(file_path)
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        if result.returncode == 0:
            return json.loads(result.stdout)
        return None
    except Exception as e:
        print(f"  ⚠️  ffprobe failed: {e}", file=sys.stderr)
        return None


def test_ffmpeg_decode(file_path: Path) -> bool:
    """Test if ffmpeg can decode at least one video frame."""
    try:
        cmd = [
            'ffmpeg',
            '-v', 'error',
            '-i', str(file_path),
            '-map', '0:v:0',
            '-frames:v', '1',
            '-f', 'null',
            '-'
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        return result.returncode == 0
    except Exception as e:
        print(f"  ⚠️  ffmpeg decode test failed: {e}", file=sys.stderr)
        return False


def extract_video_stream_info(probe_data: Dict) -> Optional[Dict]:
    """Extract video stream information from ffprobe output."""
    if not probe_data or 'streams' not in probe_data:
        return None
    
    for stream in probe_data['streams']:
        if stream.get('codec_type') == 'video':
            return {
                'codec_name': stream.get('codec_name', 'unknown'),
                'codec_tag_string': stream.get('codec_tag_string', ''),
                'profile': stream.get('profile', ''),
                'pix_fmt': stream.get('pix_fmt', ''),
                'bit_depth': stream.get('bits_per_raw_sample') or stream.get('bit_depth', ''),
                'color_space': stream.get('color_space', ''),
                'width': stream.get('width', ''),
                'height': stream.get('height', ''),
            }
    return None


def classify_file(file_path: Path, probe_data: Optional[Dict], ffmpeg_decodable: bool) -> Dict:
    """Classify file and determine routing."""
    
    ext = file_path.suffix.lower()
    rel_path = str(file_path.relative_to('/Users/leon.grant/projects/Proxx/forge-tests/samples/RAW'))
    
    # RED RAW files - route directly to Resolve without probing
    # RED files require RED SDK and often fail standard ffprobe
    if ext == '.r3d':
        return {
            'relpath': rel_path,
            'ext': ext,
            'container': 'r3d',
            'codec_name': 'redcode',
            'codec_tag': 'RED',
            'profile': '',
            'pix_fmt': '',
            'bit_depth': '',
            'width': '',
            'height': '',
            'ffmpeg_decodable': False,
            'classification': 'METADATA_ONLY',
            'engine': 'resolve',
            'reason': 'RED RAW requires Resolve (ffprobe requires RED SDK)',
        }
    
    # Extract metadata
    container = probe_data.get('format', {}).get('format_name', 'unknown') if probe_data else 'unknown'
    video_info = extract_video_stream_info(probe_data) if probe_data else None
    
    codec_name = video_info.get('codec_name', 'none') if video_info else 'none'
    
    # Classification logic
    classification = 'ERROR'
    engine = 'reject'
    reason = 'Unknown error'
    
    if not probe_data:
        classification = 'ERROR'
        engine = 'reject'
        reason = 'ffprobe failed - file may be corrupted or unsupported format'
    
    elif not video_info:
        classification = 'NO_VIDEO'
        engine = 'reject'
        reason = 'No video stream detected'
    
    elif ext in RAW_EXTENSIONS:
        classification = 'METADATA_ONLY'
        engine = 'resolve'
        reason = f'Extension {ext} is known RAW format'
    
    elif codec_name in ('none', 'unknown', ''):
        classification = 'METADATA_ONLY'
        engine = 'resolve'
        reason = f'codec_name={codec_name} - no FFmpeg decoder available'
    
    elif codec_name == 'prores' and 'raw' in video_info.get('codec_tag_string', '').lower():
        classification = 'METADATA_ONLY'
        engine = 'resolve'
        reason = 'ProRes RAW (codec_tag indicates RAW variant)'
    
    elif not ffmpeg_decodable:
        classification = 'METADATA_ONLY'
        engine = 'resolve'
        reason = 'FFmpeg decode test failed - requires Resolve'
    
    elif ffmpeg_decodable:
        classification = 'PLAYABLE'
        engine = 'ffmpeg'
        reason = 'FFmpeg can decode successfully'
    
    return {
        'relpath': rel_path,
        'ext': ext,
        'container': container,
        'codec_name': codec_name,
        'codec_tag': video_info.get('codec_tag_string', '') if video_info else '',
        'profile': video_info.get('profile', '') if video_info else '',
        'pix_fmt': video_info.get('pix_fmt', '') if video_info else '',
        'bit_depth': video_info.get('bit_depth', '') if video_info else '',
        'width': video_info.get('width', '') if video_info else '',
        'height': video_info.get('height', '') if video_info else '',
        'ffmpeg_decodable': ffmpeg_decodable,
        'classification': classification,
        'engine': engine,
        'reason': reason,
    }


def scan_corpus(root_dir: Path) -> List[Dict]:
    """Scan corpus and generate routing table."""
    
    results = []
    
    print(f"🔍 Scanning: {root_dir}")
    print(f"   Excluding dirs: {EXCLUDE_DIRS}")
    print(f"   Excluding extensions: {EXCLUDE_EXTENSIONS}\n")
    
    # Find all files
    all_files = []
    for file_path in root_dir.rglob('*'):
        if not file_path.is_file():
            continue
        
        # Skip excluded directories
        if any(excluded in file_path.parts for excluded in EXCLUDE_DIRS):
            continue
        
        # Skip excluded extensions
        if file_path.suffix.lower() in EXCLUDE_EXTENSIONS:
            continue
        
        all_files.append(file_path)
    
    print(f"📊 Found {len(all_files)} files to probe\n")
    
    # Process each file
    for i, file_path in enumerate(all_files, 1):
        print(f"[{i}/{len(all_files)}] Probing: {file_path.name}")
        
        # RED RAW files - skip ffprobe, classify immediately
        if file_path.suffix.lower() == '.r3d':
            result = classify_file(file_path, None, False)
            results.append(result)
            engine_emoji = '🎨'
            print(f"  {engine_emoji} {result['engine'].upper()} => {result['reason']}")
            continue
        
        # Run ffprobe
        probe_data = run_ffprobe(file_path)
        
        # Test ffmpeg decode
        ffmpeg_decodable = False
        if probe_data:
            video_info = extract_video_stream_info(probe_data)
            if video_info and video_info.get('codec_name') not in ('none', 'unknown', ''):
                print(f"  🎬 Testing FFmpeg decode...")
                ffmpeg_decodable = test_ffmpeg_decode(file_path)
        
        # Classify and determine routing
        result = classify_file(file_path, probe_data, ffmpeg_decodable)
        results.append(result)
        
        # Print result
        engine_emoji = '✅' if result['engine'] == 'ffmpeg' else '🎨' if result['engine'] == 'resolve' else '❌'
        print(f"  {engine_emoji} {result['classification']} => {result['engine']}: {result['reason']}\n")
    
    return results


def generate_markdown_table(results: List[Dict]) -> str:
    """Generate markdown routing table."""
    
    md = "# RAW Corpus Routing Matrix\n\n"
    md += f"Generated: {subprocess.check_output(['date']).decode().strip()}\n\n"
    
    # Summary
    total = len(results)
    ffmpeg_count = sum(1 for r in results if r['engine'] == 'ffmpeg')
    resolve_count = sum(1 for r in results if r['engine'] == 'resolve')
    reject_count = sum(1 for r in results if r['engine'] == 'reject')
    
    md += "## Summary\n\n"
    md += f"- **Total Files**: {total}\n"
    md += f"- **FFmpeg**: {ffmpeg_count} ({ffmpeg_count/total*100:.1f}%)\n"
    md += f"- **Resolve**: {resolve_count} ({resolve_count/total*100:.1f}%)\n"
    md += f"- **Reject**: {reject_count} ({reject_count/total*100:.1f}%)\n\n"
    
    # Table
    md += "## Routing Table\n\n"
    md += "| File | Ext | Container | Codec | Decodable | Engine | Reason |\n"
    md += "|------|-----|-----------|-------|-----------|--------|--------|\n"
    
    for r in sorted(results, key=lambda x: (x['engine'], x['relpath'])):
        md += f"| {r['relpath']} | {r['ext']} | {r['container']} | {r['codec_name']} | "
        md += f"{'✅' if r['ffmpeg_decodable'] else '❌'} | **{r['engine']}** | {r['reason']} |\n"
    
    return md


def main():
    corpus_root = Path('/Users/leon.grant/projects/Proxx/forge-tests/samples/RAW')
    
    if not corpus_root.exists():
        print(f"❌ Corpus not found: {corpus_root}")
        sys.exit(1)
    
    # Scan and classify
    results = scan_corpus(corpus_root)
    
    # Save JSON
    json_path = Path('/Users/leon.grant/projects/Proxx/artifacts/routing_matrix.json')
    json_path.parent.mkdir(exist_ok=True)
    with open(json_path, 'w') as f:
        json.dump(results, f, indent=2)
    print(f"✅ Saved routing matrix: {json_path}")
    
    # Save Markdown
    md_path = Path('/Users/leon.grant/projects/Proxx/artifacts/routing_matrix.md')
    markdown = generate_markdown_table(results)
    with open(md_path, 'w') as f:
        f.write(markdown)
    print(f"✅ Saved routing table: {md_path}")
    
    # Print summary
    print(f"\n{'='*70}")
    print("📊 ROUTING SUMMARY")
    print(f"{'='*70}")
    
    engines = {}
    for r in results:
        engines[r['engine']] = engines.get(r['engine'], 0) + 1
    
    for engine, count in sorted(engines.items()):
        print(f"  {engine.upper()}: {count} files")
    
    print(f"{'='*70}\n")


if __name__ == '__main__':
    main()
