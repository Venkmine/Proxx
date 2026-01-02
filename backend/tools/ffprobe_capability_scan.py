#!/usr/bin/env python3
"""
FFprobe Capability Scan - Empirical measurement of FFmpeg/ffprobe RAW format support.

This script recursively scans the RAW sample corpus and attempts to probe each file
with ffprobe to determine which formats can be decoded by FFmpeg.

Usage:
    python backend/tools/ffprobe_capability_scan.py
    
Outputs:
    artifacts/ffprobe_capability_report.json
    artifacts/ffprobe_capability_report.csv
"""

import json
import csv
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Optional, Any
from datetime import datetime


# Configuration
SCAN_ROOT = Path("/Users/leon.grant/projects/Proxx/forge-tests/samples/RAW")
ARTIFACTS_DIR = Path("/Users/leon.grant/projects/Proxx/artifacts")
JSON_OUTPUT = ARTIFACTS_DIR / "ffprobe_capability_report.json"
CSV_OUTPUT = ARTIFACTS_DIR / "ffprobe_capability_report.csv"

# Media extensions to scan
MEDIA_EXTENSIONS = {
    # Video containers
    ".mov", ".mp4", ".mxf", ".avi", ".mkv", ".webm", ".mpg", ".ts",
    # RAW formats
    ".r3d", ".ari", ".arri", ".braw", ".crm", ".dng",
    # Image sequences
    ".dpx", ".exr", ".tif", ".tiff", ".jpg", ".jpeg", ".png",
}


def run_ffprobe(file_path: Path) -> Dict[str, Any]:
    """
    Run ffprobe on a file and return structured metadata.
    
    Args:
        file_path: Path to media file
        
    Returns:
        Dictionary with probe results
    """
    result = {
        "file_path": str(file_path),
        "file_name": file_path.name,
        "file_extension": file_path.suffix.lower(),
        "file_size_mb": file_path.stat().st_size / (1024 * 1024),
        "probe_success": False,
        "error_message": None,
        "container_format": None,
        "video_codec": None,
        "width": None,
        "height": None,
        "fps": None,
        "duration_seconds": None,
        "has_video": False,
        "has_audio": False,
        "video_stream_count": 0,
        "audio_stream_count": 0,
    }
    
    try:
        # Run ffprobe with JSON output
        cmd = [
            "ffprobe",
            "-v", "error",
            "-show_streams",
            "-show_format",
            "-of", "json",
            str(file_path),
        ]
        
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30,
        )
        
        if proc.returncode != 0:
            result["error_message"] = proc.stderr.strip() or "ffprobe failed"
            return result
        
        # Parse JSON output
        data = json.loads(proc.stdout)
        
        # Extract format information
        if "format" in data:
            fmt = data["format"]
            result["container_format"] = fmt.get("format_name")
            if "duration" in fmt:
                try:
                    result["duration_seconds"] = float(fmt["duration"])
                except (ValueError, TypeError):
                    pass
        
        # Extract stream information
        if "streams" in data:
            for stream in data["streams"]:
                codec_type = stream.get("codec_type")
                
                if codec_type == "video":
                    result["has_video"] = True
                    result["video_stream_count"] += 1
                    
                    # Get first video stream details
                    if not result["video_codec"]:
                        result["video_codec"] = stream.get("codec_name", "unknown")
                        result["width"] = stream.get("width")
                        result["height"] = stream.get("height")
                        
                        # Calculate FPS from r_frame_rate
                        r_frame_rate = stream.get("r_frame_rate")
                        if r_frame_rate and "/" in r_frame_rate:
                            try:
                                num, den = r_frame_rate.split("/")
                                if int(den) != 0:
                                    result["fps"] = float(num) / float(den)
                            except (ValueError, ZeroDivisionError):
                                pass
                
                elif codec_type == "audio":
                    result["has_audio"] = True
                    result["audio_stream_count"] += 1
        
        result["probe_success"] = True
        
    except subprocess.TimeoutExpired:
        result["error_message"] = "ffprobe timeout (>30s)"
    except json.JSONDecodeError as e:
        result["error_message"] = f"Invalid JSON from ffprobe: {e}"
    except FileNotFoundError:
        result["error_message"] = "ffprobe not found in PATH"
    except Exception as e:
        result["error_message"] = f"Unexpected error: {e}"
    
    return result


def scan_directory(root: Path) -> List[Dict[str, Any]]:
    """
    Recursively scan directory for media files and probe each one.
    
    Args:
        root: Root directory to scan
        
    Returns:
        List of probe results
    """
    results = []
    file_count = 0
    success_count = 0
    fail_count = 0
    
    print(f"\n{'='*80}")
    print(f"FFPROBE CAPABILITY SCAN")
    print(f"{'='*80}")
    print(f"Scan root: {root}")
    print(f"Looking for extensions: {', '.join(sorted(MEDIA_EXTENSIONS))}")
    print(f"{'='*80}\n")
    
    # Collect all media files first
    media_files = []
    for ext in MEDIA_EXTENSIONS:
        media_files.extend(root.rglob(f"*{ext}"))
    
    total_files = len(media_files)
    print(f"Found {total_files} media files to scan\n")
    
    # Probe each file
    for i, file_path in enumerate(sorted(media_files), 1):
        file_count += 1
        relative_path = file_path.relative_to(root)
        
        # Probe the file
        result = run_ffprobe(file_path)
        result["scan_index"] = i
        result["relative_path"] = str(relative_path)
        results.append(result)
        
        # Print progress
        if result["probe_success"]:
            success_count += 1
            codec = result["video_codec"] or "no-video"
            dims = f"{result['width']}x{result['height']}" if result['width'] else "unknown"
            print(f"[{i:3d}/{total_files}] [FFPROBE] ✓ OK    {relative_path}")
            print(f"          codec={codec}, container={result['container_format']}, dims={dims}")
        else:
            fail_count += 1
            error = result["error_message"][:60] if result["error_message"] else "unknown error"
            print(f"[{i:3d}/{total_files}] [FFPROBE] ✗ FAIL  {relative_path}")
            print(f"          {error}")
    
    # Print summary
    print(f"\n{'='*80}")
    print(f"SCAN COMPLETE")
    print(f"{'='*80}")
    print(f"Total files scanned: {file_count}")
    print(f"Successfully probed: {success_count} ({success_count/file_count*100:.1f}%)")
    print(f"Failed to probe:     {fail_count} ({fail_count/file_count*100:.1f}%)")
    print(f"{'='*80}\n")
    
    return results


def write_json_report(results: List[Dict[str, Any]], output_path: Path) -> None:
    """Write results to JSON file."""
    report = {
        "scan_timestamp": datetime.now().isoformat(),
        "scan_root": str(SCAN_ROOT),
        "total_files": len(results),
        "success_count": sum(1 for r in results if r["probe_success"]),
        "fail_count": sum(1 for r in results if not r["probe_success"]),
        "results": results,
    }
    
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(report, f, indent=2)
    
    print(f"✓ JSON report written: {output_path}")


def write_csv_report(results: List[Dict[str, Any]], output_path: Path) -> None:
    """Write results to CSV file."""
    if not results:
        return
    
    # Define CSV columns
    columns = [
        "scan_index",
        "probe_success",
        "file_name",
        "relative_path",
        "file_extension",
        "file_size_mb",
        "container_format",
        "video_codec",
        "width",
        "height",
        "fps",
        "duration_seconds",
        "has_video",
        "has_audio",
        "video_stream_count",
        "audio_stream_count",
        "error_message",
    ]
    
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(results)
    
    print(f"✓ CSV report written:  {output_path}")


def print_codec_summary(results: List[Dict[str, Any]]) -> None:
    """Print summary of codecs encountered."""
    print(f"\n{'='*80}")
    print(f"CODEC SUMMARY")
    print(f"{'='*80}")
    
    # Group by codec
    codec_counts = {}
    for result in results:
        if result["probe_success"] and result["video_codec"]:
            codec = result["video_codec"]
            codec_counts[codec] = codec_counts.get(codec, 0) + 1
    
    # Print sorted by count
    for codec, count in sorted(codec_counts.items(), key=lambda x: x[1], reverse=True):
        print(f"  {codec:30s} : {count:3d} files")
    
    # Unknown/failed
    unknown_count = sum(1 for r in results if not r["probe_success"])
    if unknown_count > 0:
        print(f"  {'(failed to probe)':30s} : {unknown_count:3d} files")
    
    print(f"{'='*80}\n")


def main():
    """Main entry point."""
    # Check if scan root exists
    if not SCAN_ROOT.exists():
        print(f"ERROR: Scan root does not exist: {SCAN_ROOT}", file=sys.stderr)
        print(f"       Create sample files or adjust SCAN_ROOT in script.", file=sys.stderr)
        sys.exit(1)
    
    # Check if ffprobe is available
    try:
        subprocess.run(
            ["ffprobe", "-version"],
            capture_output=True,
            check=True,
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        print(f"ERROR: ffprobe not found in PATH", file=sys.stderr)
        print(f"       Install FFmpeg to use this script.", file=sys.stderr)
        sys.exit(1)
    
    # Scan directory
    results = scan_directory(SCAN_ROOT)
    
    if not results:
        print("WARNING: No media files found to scan", file=sys.stderr)
        sys.exit(0)
    
    # Write reports
    write_json_report(results, JSON_OUTPUT)
    write_csv_report(results, CSV_OUTPUT)
    
    # Print codec summary
    print_codec_summary(results)
    
    print("✓ Scan complete!")


if __name__ == "__main__":
    main()
