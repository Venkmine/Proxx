"""
Tests for image sequence detection and handling.

These tests validate the MANDATORY BEHAVIOR:
- One image sequence directory = ONE clip
- ONE output file per sequence job
- Deterministic sequence detection
- No per-frame processing allowed
"""

import pytest
from pathlib import Path
from v2.image_sequence import (
    detect_sequences_from_paths,
    validate_sequence_job,
    is_image_sequence_format,
    collapse_sequence_to_single_source,
    ImageSequence,
    ImageSequenceError,
)


# =============================================================================
# Format Detection Tests
# =============================================================================

class TestImageSequenceFormatDetection:
    """Test is_image_sequence_format() for various file types."""
    
    def test_exr_is_sequence_format(self):
        """EXR files are image sequence formats."""
        assert is_image_sequence_format(Path("/path/clip.0001.exr")) is True
    
    def test_dpx_is_sequence_format(self):
        """DPX files are image sequence formats."""
        assert is_image_sequence_format(Path("/path/clip.0001.dpx")) is True
    
    def test_tiff_is_sequence_format(self):
        """TIFF files are image sequence formats."""
        assert is_image_sequence_format(Path("/path/clip.0001.tiff")) is True
        assert is_image_sequence_format(Path("/path/clip.0001.tif")) is True
    
    def test_png_is_sequence_format(self):
        """PNG files are image sequence formats."""
        assert is_image_sequence_format(Path("/path/clip.0001.png")) is True
    
    def test_mov_is_not_sequence_format(self):
        """MOV files are NOT image sequence formats."""
        assert is_image_sequence_format(Path("/path/clip.mov")) is False
    
    def test_mp4_is_not_sequence_format(self):
        """MP4 files are NOT image sequence formats."""
        assert is_image_sequence_format(Path("/path/clip.mp4")) is False
    
    def test_braw_is_not_sequence_format(self):
        """BRAW files are NOT image sequence formats."""
        assert is_image_sequence_format(Path("/path/clip.braw")) is False


# =============================================================================
# Sequence Detection Tests
# =============================================================================

class TestSequenceDetection:
    """Test detect_sequences_from_paths() logic."""
    
    def test_detects_exr_sequence(self):
        """Detects numbered EXR frames as a sequence."""
        paths = [
            Path("/renders/shot01.0001.exr"),
            Path("/renders/shot01.0002.exr"),
            Path("/renders/shot01.0003.exr"),
        ]
        sequences, standalone = detect_sequences_from_paths(paths)
        
        assert len(sequences) == 1
        assert len(standalone) == 0
        assert sequences[0].frame_count == 3
        assert sequences[0].first_frame == 1
        assert sequences[0].last_frame == 3
    
    def test_single_frame_not_sequence(self):
        """Single EXR frame is NOT a sequence."""
        paths = [Path("/renders/shot01.0001.exr")]
        sequences, standalone = detect_sequences_from_paths(paths)
        
        assert len(sequences) == 0
        assert len(standalone) == 1
    
    def test_detects_multiple_sequences(self):
        """Detects multiple independent sequences."""
        paths = [
            Path("/renders/shot01.0001.exr"),
            Path("/renders/shot01.0002.exr"),
            Path("/renders/shot02.0001.exr"),
            Path("/renders/shot02.0002.exr"),
        ]
        sequences, standalone = detect_sequences_from_paths(paths)
        
        assert len(sequences) == 2
        assert len(standalone) == 0
    
    def test_mixed_sequence_and_standalone(self):
        """Separates sequences from standalone files."""
        paths = [
            Path("/renders/shot01.0001.exr"),
            Path("/renders/shot01.0002.exr"),
            Path("/renders/single_frame.exr"),
            Path("/renders/video.mov"),
        ]
        sequences, standalone = detect_sequences_from_paths(paths)
        
        assert len(sequences) == 1
        assert len(standalone) == 2
    
    def test_padding_detection(self):
        """Correctly detects frame padding."""
        paths = [
            Path("/renders/shot01.000001.exr"),
            Path("/renders/shot01.000002.exr"),
        ]
        sequences, standalone = detect_sequences_from_paths(paths)
        
        assert len(sequences) == 1
        assert sequences[0].frame_padding == 6
        assert "%06d" in sequences[0].pattern
    
    def test_underscore_separator(self):
        """Handles underscore separator in frame numbers."""
        paths = [
            Path("/renders/shot01_0001.exr"),
            Path("/renders/shot01_0002.exr"),
        ]
        sequences, standalone = detect_sequences_from_paths(paths)
        
        assert len(sequences) == 1
        assert sequences[0].base_name == "shot01"
    
    def test_pattern_generation(self):
        """Generates correct FFmpeg/Resolve pattern."""
        paths = [
            Path("/renders/shot01.0001.exr"),
            Path("/renders/shot01.0002.exr"),
        ]
        sequences, standalone = detect_sequences_from_paths(paths)
        
        assert sequences[0].pattern == "/renders/shot01.%04d.exr"


# =============================================================================
# Sequence Validation Tests
# =============================================================================

class TestSequenceValidation:
    """Test validate_sequence_job() enforces rules."""
    
    def test_validates_single_sequence(self):
        """Accepts a valid single sequence."""
        paths = [
            Path("/renders/shot01.0001.exr"),
            Path("/renders/shot01.0002.exr"),
            Path("/renders/shot01.0003.exr"),
        ]
        sequence = validate_sequence_job(paths)
        
        assert sequence.frame_count == 3
        assert sequence.first_frame == 1
        assert sequence.last_frame == 3
    
    def test_rejects_no_sequences(self):
        """Rejects job with no sequences (single frame)."""
        paths = [Path("/renders/single.exr")]
        
        with pytest.raises(ImageSequenceError) as exc_info:
            validate_sequence_job(paths)
        
        assert "No image sequences detected" in str(exc_info.value)
    
    def test_rejects_multiple_sequences(self):
        """Rejects job with multiple sequences."""
        paths = [
            Path("/renders/shot01.0001.exr"),
            Path("/renders/shot01.0002.exr"),
            Path("/renders/shot02.0001.exr"),
            Path("/renders/shot02.0002.exr"),
        ]
        
        with pytest.raises(ImageSequenceError) as exc_info:
            validate_sequence_job(paths)
        
        assert "Multiple sequences detected" in str(exc_info.value)
    
    def test_rejects_mixed_sequence_and_standalone(self):
        """Rejects job with sequence + standalone files."""
        paths = [
            Path("/renders/shot01.0001.exr"),
            Path("/renders/shot01.0002.exr"),
            Path("/renders/video.mov"),
        ]
        
        with pytest.raises(ImageSequenceError) as exc_info:
            validate_sequence_job(paths)
        
        assert "Mixed sources detected" in str(exc_info.value)
    
    def test_warns_on_frame_gaps(self, capsys):
        """Warns about missing frames but doesn't fail."""
        paths = [
            Path("/renders/shot01.0001.exr"),
            Path("/renders/shot01.0002.exr"),
            # Frame 3 missing
            Path("/renders/shot01.0004.exr"),
        ]
        
        # Should not raise, just warn
        sequence = validate_sequence_job(paths)
        
        assert sequence.frame_count == 3  # Found 3 files
        captured = capsys.readouterr()
        assert "WARNING" in captured.out
        assert "Frame gaps detected" in captured.out


# =============================================================================
# Sequence Collapse Tests
# =============================================================================

class TestSequenceCollapse:
    """Test collapse_sequence_to_single_source() behavior."""
    
    def test_collapses_to_first_frame(self):
        """Collapses sequence to first frame path."""
        sources = [
            "/renders/shot01.0001.exr",
            "/renders/shot01.0002.exr",
            "/renders/shot01.0003.exr",
        ]
        
        collapsed_source, metadata = collapse_sequence_to_single_source(sources)
        
        # Should return first frame
        assert collapsed_source == "/renders/shot01.0001.exr"
        assert metadata['is_sequence'] is True
        assert metadata['frame_count'] == 3
    
    def test_metadata_contains_pattern(self):
        """Metadata includes FFmpeg pattern."""
        sources = [
            "/renders/shot01.0001.exr",
            "/renders/shot01.0002.exr",
        ]
        
        collapsed_source, metadata = collapse_sequence_to_single_source(sources)
        
        assert 'pattern' in metadata
        assert "%04d" in metadata['pattern']
    
    def test_metadata_contains_frame_info(self):
        """Metadata includes frame range information."""
        sources = [
            "/renders/shot01.0005.exr",
            "/renders/shot01.0006.exr",
            "/renders/shot01.0007.exr",
        ]
        
        collapsed_source, metadata = collapse_sequence_to_single_source(sources)
        
        assert metadata['first_frame'] == 5
        assert metadata['last_frame'] == 7
        assert metadata['frame_count'] == 3
        assert metadata['frame_padding'] == 4


# =============================================================================
# Edge Cases and Error Handling
# =============================================================================

class TestSequenceEdgeCases:
    """Test edge cases and error conditions."""
    
    def test_empty_sources_list(self):
        """Handles empty sources list."""
        with pytest.raises(ImageSequenceError) as exc_info:
            validate_sequence_job([])
        
        assert "No sources provided" in str(exc_info.value)
    
    def test_non_sequential_numbers(self):
        """Detects sequences even with non-sequential numbering."""
        paths = [
            Path("/renders/shot01.0001.exr"),
            Path("/renders/shot01.0005.exr"),
            Path("/renders/shot01.0010.exr"),
        ]
        
        sequence = validate_sequence_job(paths)
        assert sequence.frame_count == 3
        assert sequence.first_frame == 1
        assert sequence.last_frame == 10
    
    def test_high_frame_numbers(self):
        """Handles high frame numbers correctly."""
        paths = [
            Path("/renders/shot01.1001.exr"),
            Path("/renders/shot01.1002.exr"),
        ]
        
        sequence = validate_sequence_job(paths)
        assert sequence.first_frame == 1001
        assert sequence.last_frame == 1002
    
    def test_mixed_padding_rejected(self):
        """Different padding treated as different sequences."""
        paths = [
            Path("/renders/shot01.01.exr"),    # 2 digits
            Path("/renders/shot01.001.exr"),   # 3 digits
        ]
        
        sequences, standalone = detect_sequences_from_paths(paths)
        # These should be treated as separate (different padding = different sequences)
        assert len(sequences) == 0
        assert len(standalone) == 2


# =============================================================================
# Integration Tests
# =============================================================================

class TestSequenceDetectionIntegration:
    """Integration tests for full workflow."""
    
    def test_exr_sequence_workflow(self):
        """Complete workflow: detect → validate → collapse."""
        sources = [
            "/renders/City_Output AOV 3_0001.exr",
            "/renders/City_Output AOV 3_0002.exr",
            "/renders/City_Output AOV 3_0003.exr",
            "/renders/City_Output AOV 3_0004.exr",
            "/renders/City_Output AOV 3_0005.exr",
        ]
        
        # Step 1: Detect
        paths = [Path(s) for s in sources]
        sequences, standalone = detect_sequences_from_paths(paths)
        assert len(sequences) == 1
        
        # Step 2: Validate
        sequence = validate_sequence_job(paths)
        assert sequence.frame_count == 5
        
        # Step 3: Collapse
        collapsed, metadata = collapse_sequence_to_single_source(sources)
        assert collapsed == sources[0]
        assert metadata['frame_count'] == 5
    
    def test_dpx_sequence_workflow(self):
        """Workflow works for DPX sequences too."""
        sources = [
            "/dpx/shot_0001.dpx",
            "/dpx/shot_0002.dpx",
            "/dpx/shot_0003.dpx",
        ]
        
        collapsed, metadata = collapse_sequence_to_single_source(sources)
        assert collapsed == sources[0]
        assert metadata['is_sequence'] is True
