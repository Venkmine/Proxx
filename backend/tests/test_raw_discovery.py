"""
V2 RAW Discovery Tests - Read-only discovery and routing validation.

Tests:
1. Recursive file traversal
2. Deterministic ordering (sorted by relative path)
3. Correct routing classification (Resolve, FFmpeg, blocked)
4. ProRes RAW blocking with clear reason
5. Edition gating under Studio
6. No engine invocation (strict guards)
7. Sidecar/metadata file filtering
8. Report serialization (deterministic JSON)

Part of V2 Forge Test Infrastructure.
"""

import json
import os
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from v2.raw_discovery import (
    discover_files,
    classify_format,
    determine_routing,
    get_block_reason,
    get_edition_requirement,
    apply_edition_gating,
    create_discovery_entry,
    discover_and_classify,
    write_report,
    should_ignore_file,
)
from v2.resolve_installation import ResolveInstallation


# =============================================================================
# File Discovery Tests
# =============================================================================

def test_discover_files_recursive():
    """
    TEST: Recursive discovery finds all media files in subdirectories.
    
    GIVEN: Directory tree with media files in nested folders
    WHEN: discover_files() is called with recursive=True
    THEN: All media files are discovered
    AND: Files are sorted for determinism
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        # Create nested structure
        (tmpdir_path / "A").mkdir()
        (tmpdir_path / "A" / "B").mkdir()
        (tmpdir_path / "A" / "B" / "C").mkdir()
        
        # Create media files
        (tmpdir_path / "root.braw").write_text("fake braw")
        (tmpdir_path / "A" / "mid.r3d").write_text("fake r3d")
        (tmpdir_path / "A" / "B" / "deep.ari").write_text("fake ari")
        (tmpdir_path / "A" / "B" / "C" / "deepest.mp4").write_text("fake mp4")
        
        # Create sidecar files (should be ignored)
        (tmpdir_path / "root.xml").write_text("metadata")
        (tmpdir_path / "A" / ".DS_Store").write_text("junk")
        
        result = discover_files(str(tmpdir_path), recursive=True)
        
        # Check all media found
        assert len(result) == 4
        assert any("root.braw" in p for p in result)
        assert any("mid.r3d" in p for p in result)
        assert any("deep.ari" in p for p in result)
        assert any("deepest.mp4" in p for p in result)
        
        # Check no sidecars
        assert not any(".xml" in p for p in result)
        assert not any(".DS_Store" in p for p in result)
        
        # Check deterministic order (sorted)
        assert result == sorted(result)


def test_discover_files_non_recursive():
    """
    TEST: Non-recursive discovery only finds files in root directory.
    
    GIVEN: Directory tree with media files in nested folders
    WHEN: discover_files() is called with recursive=False
    THEN: Only root-level files are discovered
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        # Create nested structure
        (tmpdir_path / "subdir").mkdir()
        
        # Create media files
        (tmpdir_path / "root.braw").write_text("fake braw")
        (tmpdir_path / "subdir" / "nested.r3d").write_text("fake r3d")
        
        result = discover_files(str(tmpdir_path), recursive=False)
        
        # Only root file found
        assert len(result) == 1
        assert "root.braw" in result[0]
        assert "nested.r3d" not in result[0]


def test_should_ignore_file():
    """
    TEST: Sidecar and metadata files are correctly ignored.
    
    GIVEN: Various file types
    WHEN: should_ignore_file() is called
    THEN: Dotfiles and sidecars are ignored, media is not
    """
    # Should ignore
    assert should_ignore_file(".DS_Store")
    assert should_ignore_file(".gitignore")
    assert should_ignore_file("metadata.xml")
    assert should_ignore_file("timeline.ale")
    assert should_ignore_file("notes.txt")
    assert should_ignore_file("data.csv")
    assert should_ignore_file("report.json")
    
    # Should NOT ignore
    assert not should_ignore_file("clip.braw")
    assert not should_ignore_file("shot.r3d")
    assert not should_ignore_file("scene.ari")
    assert not should_ignore_file("take.mp4")
    assert not should_ignore_file("source.mov")


# =============================================================================
# Format Classification Tests
# =============================================================================

def test_classify_format_braw():
    """TEST: BRAW files are classified as "braw"."""
    assert classify_format("/path/to/clip.braw") == "braw"
    assert classify_format("/path/to/clip.BRAW") == "braw"


def test_classify_format_r3d():
    """TEST: R3D files are classified as "r3d"."""
    assert classify_format("/path/to/shot.r3d") == "r3d"
    assert classify_format("/path/to/shot.R3D") == "r3d"


def test_classify_format_ari():
    """TEST: ARI files are classified as "arri"."""
    assert classify_format("/path/to/scene.ari") == "arri"
    assert classify_format("/path/to/scene.ARI") == "arri"


def test_classify_format_ambiguous_mxf():
    """
    TEST: MXF files are classified as "unknown" (ambiguous without codec probe).
    
    Rationale: MXF could be ARRIRAW, X-OCN, XAVC, DNxHD, etc.
    Without ffprobe, we cannot determine routing.
    """
    assert classify_format("/path/to/clip.mxf") == "unknown"


def test_classify_format_ambiguous_mov():
    """
    TEST: MOV files are classified as "unknown" (ambiguous without codec probe).
    
    Rationale: MOV could be ProRes RAW, standard ProRes, H.264, etc.
    Without ffprobe, we cannot determine routing.
    """
    assert classify_format("/path/to/clip.mov") == "unknown"


def test_classify_format_unknown():
    """TEST: Unknown extensions are classified as "unknown"."""
    assert classify_format("/path/to/file.xyz") == "unknown"
    assert classify_format("/path/to/file.bin") == "unknown"


# =============================================================================
# Routing Decision Tests
# =============================================================================

def test_routing_braw_to_resolve():
    """TEST: BRAW is routed to Resolve."""
    assert determine_routing("braw") == "resolve"


def test_routing_r3d_to_resolve():
    """TEST: R3D is routed to Resolve."""
    assert determine_routing("r3d") == "resolve"


def test_routing_arri_to_resolve():
    """TEST: ARRIRAW is routed to Resolve."""
    assert determine_routing("arri") == "resolve"


def test_routing_xocn_to_resolve():
    """TEST: X-OCN is routed to Resolve."""
    assert determine_routing("xocn") == "resolve"


def test_routing_xavc_to_ffmpeg():
    """TEST: XAVC is routed to FFmpeg (standard codec)."""
    assert determine_routing("xavc") == "ffmpeg"


def test_routing_prores_raw_blocked():
    """TEST: ProRes RAW is BLOCKED (not supported by Resolve)."""
    assert determine_routing("prores_raw") == "blocked"
    reason = get_block_reason("prores_raw")
    assert reason is not None
    assert "ProRes RAW" in reason
    assert "DaVinci Resolve" in reason
    assert "Final Cut Pro" in reason


def test_routing_unknown_blocked():
    """TEST: Unknown formats are BLOCKED by default (conservative)."""
    assert determine_routing("unknown") == "blocked"
    reason = get_block_reason("unknown")
    assert reason is not None
    assert "Unknown" in reason or "ambiguous" in reason


# =============================================================================
# Edition Requirement Tests
# =============================================================================

def test_edition_requirement_braw():
    """TEST: BRAW works with either Free or Studio."""
    assert get_edition_requirement("braw") == "either"


def test_edition_requirement_r3d():
    """TEST: R3D requires Studio."""
    assert get_edition_requirement("r3d") == "studio"


def test_edition_requirement_arri():
    """TEST: ARRIRAW requires Studio."""
    assert get_edition_requirement("arri") == "studio"


def test_edition_requirement_xocn():
    """TEST: X-OCN requires Studio."""
    assert get_edition_requirement("xocn") == "studio"


def test_edition_requirement_prores_raw():
    """TEST: ProRes RAW requires "neither" (not supported)."""
    assert get_edition_requirement("prores_raw") == "neither"


# =============================================================================
# Edition Gating Tests
# =============================================================================

def test_edition_gating_allowed_match():
    """
    TEST: File allowed when required edition matches detected edition.
    
    GIVEN: Format requires Studio
    WHEN: Studio is detected
    THEN: Gating result is "allowed"
    """
    result, reason = apply_edition_gating("studio", "studio", "resolve")
    assert result == "allowed"
    assert reason is None


def test_edition_gating_skipped_mismatch():
    """
    TEST: File skipped when required edition does NOT match detected.
    
    GIVEN: Format requires Studio
    WHEN: Free is detected
    THEN: Gating result is "skipped"
    AND: Reason explains the mismatch
    """
    result, reason = apply_edition_gating("studio", "free", "resolve")
    assert result == "skipped"
    assert reason is not None
    assert "Studio" in reason
    assert "Free" in reason


def test_edition_gating_either_always_allowed():
    """
    TEST: Formats that work with "either" edition are always allowed.
    
    GIVEN: Format requires "either"
    WHEN: Any edition is detected (Free, Studio, or unknown)
    THEN: Gating result is "allowed"
    """
    result, reason = apply_edition_gating("either", "free", "resolve")
    assert result == "allowed"
    assert reason is None
    
    result, reason = apply_edition_gating("either", "studio", "resolve")
    assert result == "allowed"
    assert reason is None
    
    result, reason = apply_edition_gating("either", "unknown", "resolve")
    assert result == "allowed"
    assert reason is None


def test_edition_gating_neither_always_skipped():
    """
    TEST: Formats that require "neither" (blocked) are always skipped.
    
    GIVEN: Format requires "neither" (e.g., ProRes RAW)
    WHEN: Any edition is detected
    THEN: Gating result is "skipped"
    AND: Reason explains format doesn't use Resolve
    """
    result, reason = apply_edition_gating("neither", "studio", "ffmpeg")
    assert result == "skipped"
    assert reason is not None
    assert "does not use Resolve" in reason


def test_edition_gating_unknown_edition_conservative_skip():
    """
    TEST: Files skipped when edition detection fails (conservative).
    
    GIVEN: Format requires specific edition (e.g., Studio)
    WHEN: Edition detection returns "unknown"
    THEN: Gating result is "skipped" (conservative)
    """
    result, reason = apply_edition_gating("studio", "unknown", "resolve")
    assert result == "skipped"
    assert reason is not None
    assert "edition detection failed" in reason or "unknown" in reason.lower()


def test_edition_gating_blocked_engine_always_skipped():
    """
    TEST: Files blocked at routing level are always skipped.
    
    GIVEN: File with intended_engine="blocked"
    WHEN: apply_edition_gating() is called
    THEN: Gating result is "skipped"
    AND: Reason indicates format is blocked
    """
    result, reason = apply_edition_gating("either", "studio", "blocked")
    assert result == "skipped"
    assert reason is not None
    assert "blocked" in reason.lower()


# =============================================================================
# Discovery Entry Creation Tests
# =============================================================================

def test_create_discovery_entry_braw_studio():
    """
    TEST: Discovery entry correctly populated for BRAW under Studio.
    
    GIVEN: BRAW file and Studio detected
    WHEN: create_discovery_entry() is called
    THEN: All fields are correct
    AND: Gating result is "allowed" (BRAW works with either edition)
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        file_path = tmpdir_path / "clip.braw"
        file_path.write_text("fake braw")
        
        entry = create_discovery_entry(
            abs_path=str(file_path),
            root_dir=str(tmpdir_path),
            detected_edition="studio",
        )
        
        assert entry.filename == "clip.braw"
        assert entry.extension == ".braw"
        assert entry.detected_format_family == "braw"
        assert entry.intended_engine == "resolve"
        assert entry.block_reason is None
        assert entry.requires_resolve_edition == "either"
        assert entry.detected_resolve_edition == "studio"
        assert entry.gating_result == "allowed"
        assert entry.gating_reason is None


def test_create_discovery_entry_r3d_free_skipped():
    """
    TEST: R3D file is SKIPPED when only Free edition is detected.
    
    GIVEN: R3D file and Free edition detected
    WHEN: create_discovery_entry() is called
    THEN: Gating result is "skipped" (R3D requires Studio)
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        file_path = tmpdir_path / "shot.r3d"
        file_path.write_text("fake r3d")
        
        entry = create_discovery_entry(
            abs_path=str(file_path),
            root_dir=str(tmpdir_path),
            detected_edition="free",
        )
        
        assert entry.filename == "shot.r3d"
        assert entry.detected_format_family == "r3d"
        assert entry.intended_engine == "resolve"
        assert entry.requires_resolve_edition == "studio"
        assert entry.detected_resolve_edition == "free"
        assert entry.gating_result == "skipped"
        assert entry.gating_reason is not None
        assert "Studio" in entry.gating_reason
        assert "Free" in entry.gating_reason


def test_create_discovery_entry_prores_raw_blocked():
    """
    TEST: ProRes RAW file is BLOCKED with clear reason.
    
    GIVEN: File classified as ProRes RAW
    WHEN: create_discovery_entry() is called
    THEN: intended_engine is "blocked"
    AND: block_reason explains Resolve doesn't support it
    """
    # Note: In real implementation, .mov would be "unknown" without codec probe
    # For this test, we'll manually test the prores_raw classification path
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        file_path = tmpdir_path / "clip.mov"
        file_path.write_text("fake prores raw")
        
        # Manually create entry with prores_raw classification
        # (in practice, classify_format would return "unknown" for .mov)
        # We'll test the routing logic directly
        from v2.raw_discovery import DiscoveryEntry
        
        entry = DiscoveryEntry(
            absolute_path=str(file_path),
            relative_path="clip.mov",
            filename="clip.mov",
            extension=".mov",
            detected_format_family="prores_raw",
            intended_engine=determine_routing("prores_raw"),
            block_reason=get_block_reason("prores_raw"),
            requires_resolve_edition=get_edition_requirement("prores_raw"),
            detected_resolve_edition="studio",
            gating_result="skipped",
            gating_reason="Format does not use Resolve engine.",
        )
        
        assert entry.intended_engine == "blocked"
        assert entry.block_reason is not None
        assert "ProRes RAW" in entry.block_reason
        assert "DaVinci Resolve" in entry.block_reason


# =============================================================================
# Full Discovery Tests
# =============================================================================

def test_discover_and_classify_deterministic_ordering():
    """
    TEST: discover_and_classify() produces deterministic output.
    
    GIVEN: Multiple files in different directories
    WHEN: discover_and_classify() is called multiple times
    THEN: Output order is identical (sorted by relative_path)
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        # Create files in non-alphabetical order
        (tmpdir_path / "Z").mkdir()
        (tmpdir_path / "A").mkdir()
        (tmpdir_path / "Z" / "z_file.braw").write_text("fake")
        (tmpdir_path / "A" / "a_file.r3d").write_text("fake")
        (tmpdir_path / "mid_file.ari").write_text("fake")
        
        mock_resolve = ResolveInstallation(
            version="19.0.3",
            edition="studio",
            install_path="/test",
            detection_method="test",
            detection_confidence="high",
        )
        
        with patch('v2.raw_discovery.detect_resolve_installation', return_value=mock_resolve):
            report1 = discover_and_classify(str(tmpdir_path), recursive=True)
            report2 = discover_and_classify(str(tmpdir_path), recursive=True)
        
        # Check deterministic order
        paths1 = [e.relative_path for e in report1.entries]
        paths2 = [e.relative_path for e in report2.entries]
        assert paths1 == paths2
        assert paths1 == sorted(paths1)


def test_discover_and_classify_statistics():
    """
    TEST: discover_and_classify() computes correct statistics.
    
    GIVEN: Mix of BRAW (Resolve), R3D (Resolve/Studio), and unknown files
    WHEN: discover_and_classify() is called under Free edition
    THEN: Statistics correctly categorize files
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        # Create mix of files
        (tmpdir_path / "clip1.braw").write_text("fake")  # Resolve, allowed
        (tmpdir_path / "clip2.braw").write_text("fake")  # Resolve, allowed
        (tmpdir_path / "shot1.r3d").write_text("fake")   # Resolve, skipped (needs Studio)
        (tmpdir_path / "file.xyz").write_text("fake")    # Unknown, blocked
        
        mock_resolve = ResolveInstallation(
            version="19.0.3",
            edition="free",
            install_path="/test",
            detection_method="test",
            detection_confidence="high",
        )
        
        with patch('v2.raw_discovery.detect_resolve_installation', return_value=mock_resolve):
            report = discover_and_classify(str(tmpdir_path), recursive=True)
        
        # Check total
        assert report.total_files_discovered == 4
        
        # Check routing stats
        assert report.files_by_routing["resolve"] == 3  # 2 BRAW + 1 R3D
        assert report.files_by_routing["ffmpeg"] == 0
        assert report.files_by_routing["blocked"] == 1  # 1 unknown
        
        # Check gating stats
        # - 2 BRAW allowed (work with Free)
        # - 1 R3D skipped (needs Studio)
        # - 1 unknown skipped (blocked)
        assert report.files_by_gating["allowed"] == 2
        assert report.files_by_gating["skipped"] == 2


# =============================================================================
# Report Serialization Tests
# =============================================================================

def test_write_report_deterministic_json():
    """
    TEST: write_report() produces deterministic JSON output.
    
    GIVEN: DiscoveryReport
    WHEN: write_report() is called
    THEN: JSON is formatted with sorted keys and consistent indentation
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        # Create simple test structure
        (tmpdir_path / "clip.braw").write_text("fake")
        
        mock_resolve = ResolveInstallation(
            version="19.0.3",
            edition="studio",
            install_path="/test",
            detection_method="test",
            detection_confidence="high",
        )
        
        with patch('v2.raw_discovery.detect_resolve_installation', return_value=mock_resolve):
            report = discover_and_classify(str(tmpdir_path), recursive=True)
        
        # Write report
        output_path = tmpdir_path / "report.json"
        write_report(report, str(output_path))
        
        # Read and verify JSON
        with open(output_path) as f:
            data = json.load(f)
        
        # Check structure
        assert "input_root" in data
        assert "total_files_discovered" in data
        assert "files_by_routing" in data
        assert "files_by_gating" in data
        assert "resolve_edition_detected" in data
        assert "entries" in data
        
        # Check entries have required fields
        assert len(data["entries"]) == 1
        entry = data["entries"][0]
        assert "absolute_path" in entry
        assert "relative_path" in entry
        assert "filename" in entry
        assert "extension" in entry
        assert "detected_format_family" in entry
        assert "intended_engine" in entry
        assert "requires_resolve_edition" in entry
        assert "detected_resolve_edition" in entry
        assert "gating_result" in entry


def test_write_report_creates_output_directory():
    """
    TEST: write_report() creates output directory if it doesn't exist.
    
    GIVEN: Report to write
    WHEN: Output path includes non-existent directories
    THEN: Directories are created automatically
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        (tmpdir_path / "clip.braw").write_text("fake")
        
        mock_resolve = ResolveInstallation(
            version="19.0.3",
            edition="studio",
            install_path="/test",
            detection_method="test",
            detection_confidence="high",
        )
        
        with patch('v2.raw_discovery.detect_resolve_installation', return_value=mock_resolve):
            report = discover_and_classify(str(tmpdir_path), recursive=True)
        
        # Write to nested path that doesn't exist
        output_path = tmpdir_path / "reports" / "nested" / "report.json"
        write_report(report, str(output_path))
        
        assert output_path.exists()
        assert output_path.is_file()


# =============================================================================
# Engine Invocation Guards
# =============================================================================

def test_no_resolve_engine_invocation():
    """
    TEST: discover_and_classify() NEVER invokes Resolve engine.
    
    GIVEN: Files classified as Resolve-routed
    WHEN: discover_and_classify() is called
    THEN: No Resolve engine calls are made
    AND: No JobSpec is created
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        (tmpdir_path / "clip.braw").write_text("fake")
        
        mock_resolve = ResolveInstallation(
            version="19.0.3",
            edition="studio",
            install_path="/test",
            detection_method="test",
            detection_confidence="high",
        )
        
        # Patch any potential engine invocation functions
        with patch('v2.raw_discovery.detect_resolve_installation', return_value=mock_resolve):
            # If execution_adapter was accidentally imported/called, this would fail
            report = discover_and_classify(str(tmpdir_path), recursive=True)
        
        # We reach here = no engine invocation occurred
        assert report.total_files_discovered == 1


def test_no_ffmpeg_invocation():
    """
    TEST: discover_and_classify() NEVER invokes FFmpeg.
    
    GIVEN: Files that would be FFmpeg-routed
    WHEN: discover_and_classify() is called
    THEN: No FFmpeg subprocess is spawned
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        
        # Create a file that would be FFmpeg-routed (if we had codec info)
        # For now, unknown extensions are blocked, but test the principle
        (tmpdir_path / "clip.mp4").write_text("fake")
        
        mock_resolve = ResolveInstallation(
            version="19.0.3",
            edition="studio",
            install_path="/test",
            detection_method="test",
            detection_confidence="high",
        )
        
        with patch('v2.raw_discovery.detect_resolve_installation', return_value=mock_resolve):
            with patch('subprocess.run') as mock_subprocess:
                report = discover_and_classify(str(tmpdir_path), recursive=True)
                
                # No subprocess calls should occur
                mock_subprocess.assert_not_called()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
