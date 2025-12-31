"""
V2 RAW Discovery - Read-only media discovery and routing analysis.

This module provides DISCOVERY and CLASSIFICATION only - NO execution.
Given a directory tree, it:
1. Discovers all media files recursively
2. Classifies format family (BRAW, R3D, ARRIRAW, etc.)
3. Determines routing (Resolve, FFmpeg, or blocked)
4. Applies Resolve edition gating
5. Emits a deterministic JSON report

HARD CONSTRAINTS:
- NO engine invocation (Resolve or FFmpeg)
- NO JobSpec creation
- NO proxy generation
- READ-ONLY analysis only

Part of V2 Forge Test Infrastructure.
"""

import json
import os
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import List, Dict, Optional

from backend.v2.resolve_installation import detect_resolve_installation


# =============================================================================
# Format Detection
# =============================================================================

# Extension-based format family detection
# This is CONSERVATIVE - we only classify what we can identify by extension
FORMAT_FAMILIES: Dict[str, str] = {
    # Blackmagic RAW
    ".braw": "braw",
    
    # RED RAW
    ".r3d": "r3d",
    
    # ARRI RAW
    ".ari": "arri",
    ".mxf": "arri",  # ARRIRAW in MXF - ambiguous, needs codec probe in real impl
    
    # Sony X-OCN
    # X-OCN is typically in MXF, detected via codec probe
    
    # XAVC (Sony)
    # XAVC is typically in MXF or MP4, detected via codec probe
    
    # ProRes RAW
    ".mov": "prores_raw",  # ProRes RAW in MOV - proxy generation supported (Resolve-based)
    
    # OpenEXR (not a camera RAW format, but requires Resolve routing)
    ".exr": "exr",  # OpenEXR image sequence - proxy generation supported (Resolve-based)
    
    # Common video extensions that need codec probing
    ".mp4": "unknown",
    ".mkv": "unknown",
}

# Resolve edition requirements per format
# "free" = Resolve Free can handle it
# "studio" = Requires Resolve Studio
# "either" = Works with both editions
EDITION_REQUIREMENTS: Dict[str, str] = {
    "braw": "either",  # BRAW works in both Free and Studio
    "r3d": "studio",   # RED requires Studio
    "arri": "studio",  # ARRIRAW requires Studio
    "xocn": "studio",  # X-OCN requires Studio
    "xavc": "either",  # XAVC works in both (if Resolve-routed)
    "prores_raw": "either",  # ProRes RAW proxy generation (Resolve-based, both editions)
    "exr": "either",  # OpenEXR proxy generation (Resolve-based, both editions)
    "unknown": "either",  # Unknown formats - conservative default
}

# Routing decisions per format family
# "resolve" = Route to Resolve engine
# "ffmpeg" = Route to FFmpeg engine
# "blocked" = Not supported by either engine
ROUTING_DECISIONS: Dict[str, str] = {
    "braw": "resolve",
    "r3d": "resolve",
    "arri": "resolve",
    "xocn": "resolve",
    "xavc": "ffmpeg",  # XAVC is standard codec, FFmpeg can handle it
    "prores_raw": "resolve",  # ProRes RAW routes to Resolve (proxy workflow only)
    "exr": "resolve",  # OpenEXR routes to Resolve (FFmpeg cannot handle high-bit-depth sequences)
    "unknown": "blocked",  # Unknown formats blocked by default (conservative)
}

# Block reasons for rejected formats
BLOCK_REASONS: Dict[str, str] = {
    "unknown": "Unknown or ambiguous format. Unable to determine routing without codec-level inspection.",
}


# =============================================================================
# Discovery Entry
# =============================================================================

@dataclass
class DiscoveryEntry:
    """
    Metadata for a single discovered media file.
    
    This is DISCOVERY data only - no execution, no results.
    """
    absolute_path: str
    relative_path: str
    filename: str
    extension: str
    detected_format_family: str
    intended_engine: str  # "resolve" | "ffmpeg" | "blocked"
    block_reason: Optional[str]
    requires_resolve_edition: str  # "free" | "studio" | "either" | "neither"
    detected_resolve_edition: str  # "free" | "studio" | "unknown"
    gating_result: str  # "allowed" | "skipped"
    gating_reason: Optional[str]
    
    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return asdict(self)


# =============================================================================
# Discovery Report
# =============================================================================

@dataclass
class DiscoveryReport:
    """
    Complete discovery report for a directory tree.
    """
    input_root: str
    total_files_discovered: int
    files_by_routing: Dict[str, int]  # {"resolve": N, "ffmpeg": M, "blocked": K}
    files_by_gating: Dict[str, int]  # {"allowed": N, "skipped": M}
    resolve_edition_detected: str
    entries: List[DiscoveryEntry]
    
    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "input_root": self.input_root,
            "total_files_discovered": self.total_files_discovered,
            "files_by_routing": self.files_by_routing,
            "files_by_gating": self.files_by_gating,
            "resolve_edition_detected": self.resolve_edition_detected,
            "entries": [e.to_dict() for e in self.entries],
        }


# =============================================================================
# File Discovery
# =============================================================================

def should_ignore_file(filename: str) -> bool:
    """
    Check if a file should be ignored during discovery.
    
    Ignores:
    - Dotfiles (.DS_Store, .gitignore, etc.)
    - Sidecar files (.xml, .ale, .log, .txt, .json, .csv, etc.)
    - Non-media extensions
    """
    # Ignore dotfiles
    if filename.startswith("."):
        return True
    
    # Sidecar/metadata extensions to ignore
    IGNORE_EXTENSIONS = {
        ".xml", ".ale", ".edl", ".log", ".txt", ".csv",
        ".json", ".yaml", ".yml", ".pdf", ".doc", ".docx",
    }
    
    ext = os.path.splitext(filename)[1].lower()
    return ext in IGNORE_EXTENSIONS


def discover_files(root_dir: str, recursive: bool = True) -> List[str]:
    """
    Discover all media files in a directory tree.
    
    Args:
        root_dir: Root directory to scan
        recursive: If True, scan subdirectories recursively
        
    Returns:
        List of absolute file paths (sorted for determinism)
    """
    discovered = []
    
    if recursive:
        for dirpath, dirnames, filenames in os.walk(root_dir):
            # Sort dirnames in-place for deterministic traversal order
            dirnames.sort()
            
            for filename in sorted(filenames):
                if should_ignore_file(filename):
                    continue
                
                abs_path = os.path.join(dirpath, filename)
                if os.path.isfile(abs_path):
                    discovered.append(abs_path)
    else:
        # Non-recursive: only immediate children
        if not os.path.isdir(root_dir):
            return []
        
        for filename in sorted(os.listdir(root_dir)):
            if should_ignore_file(filename):
                continue
            
            abs_path = os.path.join(root_dir, filename)
            if os.path.isfile(abs_path):
                discovered.append(abs_path)
    
    return sorted(discovered)  # Extra sort for absolute determinism


# =============================================================================
# Format Classification
# =============================================================================

def classify_format(filepath: str) -> str:
    """
    Classify format family based on file extension.
    
    This is CONSERVATIVE - only returns a family if we can confidently
    identify it by extension alone. Otherwise returns "unknown".
    
    Returns:
        Format family string (e.g., "braw", "r3d", "arri", "unknown")
    """
    ext = os.path.splitext(filepath)[1].lower()
    
    # Direct extension match
    family = FORMAT_FAMILIES.get(ext, "unknown")
    
    # Special case: .mxf and .mov are ambiguous
    # Without codec probing, we cannot definitively classify them
    # For .mxf, it COULD be ARRIRAW, X-OCN, XAVC, DNxHD, etc.
    # For .mov, it COULD be ProRes RAW, standard ProRes, H.264, etc.
    if ext in {".mxf", ".mov"}:
        # In a real implementation, we'd probe with ffprobe here
        # For now, conservative fallback
        return "unknown"
    
    return family


def determine_routing(format_family: str) -> str:
    """
    Determine which engine should process this format.
    
    Returns:
        "resolve" | "ffmpeg" | "blocked"
    """
    return ROUTING_DECISIONS.get(format_family, "blocked")


def get_block_reason(format_family: str) -> Optional[str]:
    """
    Get block reason for a rejected format.
    
    Returns:
        Human-readable reason, or None if not blocked
    """
    if determine_routing(format_family) == "blocked":
        return BLOCK_REASONS.get(format_family, "Format not supported.")
    return None


def get_edition_requirement(format_family: str) -> str:
    """
    Get Resolve edition requirement for this format.
    
    Returns:
        "free" | "studio" | "either" | "neither"
    """
    return EDITION_REQUIREMENTS.get(format_family, "either")


def apply_edition_gating(
    requires: str,
    detected: str,
    intended_engine: str,
) -> tuple[str, Optional[str]]:
    """
    Apply Resolve edition gating logic.
    
    Args:
        requires: Required edition ("free" | "studio" | "either" | "neither")
        detected: Detected edition ("free" | "studio" | "unknown")
        intended_engine: The engine that would process this file
        
    Returns:
        Tuple of (gating_result, gating_reason)
        - gating_result: "allowed" | "skipped"
        - gating_reason: Human-readable explanation if skipped, else None
    """
    # If file is blocked at routing level, always skipped
    if intended_engine == "blocked":
        return ("skipped", "Format blocked - not supported by any engine.")
    
    # If format doesn't require Resolve, always allowed
    if requires == "neither":
        return ("skipped", "Format does not use Resolve engine.")
    
    # If format works with either edition, always allowed
    if requires == "either":
        return ("allowed", None)
    
    # If we don't know the installed edition, conservative skip
    if detected == "unknown":
        return ("skipped", f"Requires Resolve {requires.capitalize()} but edition detection failed.")
    
    # Strict edition match
    if requires == detected:
        return ("allowed", None)
    else:
        return ("skipped", f"Requires Resolve {requires.capitalize()} but {detected.capitalize()} is installed.")


# =============================================================================
# Discovery Entry Creation
# =============================================================================

def create_discovery_entry(
    abs_path: str,
    root_dir: str,
    detected_edition: str,
) -> DiscoveryEntry:
    """
    Create a discovery entry for a single file.
    
    Args:
        abs_path: Absolute file path
        root_dir: Root directory (for relative path calculation)
        detected_edition: Detected Resolve edition
        
    Returns:
        DiscoveryEntry with all metadata populated
    """
    # Basic file info
    rel_path = os.path.relpath(abs_path, root_dir)
    filename = os.path.basename(abs_path)
    ext = os.path.splitext(filename)[1].lower()
    
    # Classification
    format_family = classify_format(abs_path)
    intended_engine = determine_routing(format_family)
    block_reason = get_block_reason(format_family)
    requires_edition = get_edition_requirement(format_family)
    
    # Edition gating
    gating_result, gating_reason = apply_edition_gating(
        requires_edition,
        detected_edition,
        intended_engine,
    )
    
    return DiscoveryEntry(
        absolute_path=abs_path,
        relative_path=rel_path,
        filename=filename,
        extension=ext,
        detected_format_family=format_family,
        intended_engine=intended_engine,
        block_reason=block_reason,
        requires_resolve_edition=requires_edition,
        detected_resolve_edition=detected_edition,
        gating_result=gating_result,
        gating_reason=gating_reason,
    )


# =============================================================================
# Main Discovery Function
# =============================================================================

def discover_and_classify(
    input_root: str,
    recursive: bool = True,
) -> DiscoveryReport:
    """
    Discover and classify all media files in a directory tree.
    
    This is a READ-ONLY operation. No engines are invoked.
    
    Args:
        input_root: Root directory to scan
        recursive: If True, scan recursively
        
    Returns:
        DiscoveryReport with all files classified and gated
    """
    # Detect Resolve edition
    resolve_info = detect_resolve_installation()
    detected_edition = resolve_info.edition if resolve_info else "unknown"
    
    # Discover files
    file_paths = discover_files(input_root, recursive=recursive)
    
    # Create entries
    entries = [
        create_discovery_entry(fp, input_root, detected_edition)
        for fp in file_paths
    ]
    
    # Sort entries by relative path for determinism
    entries.sort(key=lambda e: e.relative_path)
    
    # Compute statistics
    files_by_routing = {
        "resolve": sum(1 for e in entries if e.intended_engine == "resolve"),
        "ffmpeg": sum(1 for e in entries if e.intended_engine == "ffmpeg"),
        "blocked": sum(1 for e in entries if e.intended_engine == "blocked"),
    }
    
    files_by_gating = {
        "allowed": sum(1 for e in entries if e.gating_result == "allowed"),
        "skipped": sum(1 for e in entries if e.gating_result == "skipped"),
    }
    
    return DiscoveryReport(
        input_root=input_root,
        total_files_discovered=len(entries),
        files_by_routing=files_by_routing,
        files_by_gating=files_by_gating,
        resolve_edition_detected=detected_edition,
        entries=entries,
    )


# =============================================================================
# Report Serialization
# =============================================================================

def write_report(report: DiscoveryReport, output_path: str) -> None:
    """
    Write discovery report to JSON file.
    
    Output is deterministic:
    - Keys are sorted
    - Entries are sorted by relative_path
    - Formatted with 2-space indentation
    """
    output_dir = os.path.dirname(output_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)
    
    with open(output_path, "w") as f:
        json.dump(
            report.to_dict(),
            f,
            indent=2,
            sort_keys=True,
        )


# =============================================================================
# CLI Entrypoint
# =============================================================================

def main():
    """
    CLI entrypoint for RAW discovery.
    
    Usage:
        python -m backend.v2.raw_discovery \\
            --input forge-tests/samples/RAW \\
            --output forge-tests/reports/raw_discovery_report.json
    """
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Discover and classify RAW media files (read-only analysis)."
    )
    parser.add_argument(
        "--input",
        required=True,
        help="Input root directory to scan",
    )
    parser.add_argument(
        "--output",
        required=True,
        help="Output JSON report path",
    )
    parser.add_argument(
        "--no-recursive",
        action="store_true",
        help="Disable recursive directory traversal",
    )
    
    args = parser.parse_args()
    
    # Run discovery
    print(f"Discovering media in: {args.input}")
    report = discover_and_classify(
        input_root=args.input,
        recursive=not args.no_recursive,
    )
    
    # Write report
    print(f"Writing report to: {args.output}")
    write_report(report, args.output)
    
    # Print summary
    print(f"\nDiscovery Summary:")
    print(f"  Total files: {report.total_files_discovered}")
    print(f"  Resolve-routed: {report.files_by_routing['resolve']}")
    print(f"  FFmpeg-routed: {report.files_by_routing['ffmpeg']}")
    print(f"  Blocked: {report.files_by_routing['blocked']}")
    print(f"  Edition gated (allowed): {report.files_by_gating['allowed']}")
    print(f"  Edition gated (skipped): {report.files_by_gating['skipped']}")
    print(f"  Resolve edition detected: {report.resolve_edition_detected}")


if __name__ == "__main__":
    main()
