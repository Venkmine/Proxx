"""
Image Sequence Detection and Handling for V2 Pipeline.

This module provides utilities for detecting and collapsing numbered image
sequences into logical single sources for proxy generation.

MANDATORY BEHAVIOR:
- One image sequence directory = ONE clip
- One image sequence job = ONE output video file
- Image sequences are NEVER processed as individual frames

Supported formats:
- OpenEXR (.exr)
- DPX (.dpx)
- TIFF (.tif, .tiff)
- PNG (.png)
- JPEG (.jpg, .jpeg)
- Cineon (.cin)
- Targa (.tga)
"""

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from collections import defaultdict


# Image sequence extensions
IMAGE_SEQUENCE_EXTENSIONS = {
    'dpx', 'exr', 'tif', 'tiff', 'png', 'jpg', 'jpeg', 'cin', 'tga'
}

# Pattern to detect numbered sequences: name.NNNNN.ext or name_NNNNN.ext
SEQUENCE_PATTERN = re.compile(r'^(.+?)[\._](\d{2,8})\.([\w]+)$')


@dataclass
class ImageSequence:
    """
    Represents a detected image sequence.
    
    Attributes:
        pattern: FFmpeg/Resolve-compatible pattern (e.g., "/path/clip.%06d.exr")
        directory: Directory containing the sequence
        base_name: Base name before frame number
        extension: File extension (without dot)
        frame_padding: Number of digits in frame numbers
        first_frame: First frame number
        last_frame: Last frame number
        frame_count: Total number of frames
        frame_files: List of all frame file paths
    """
    pattern: str
    directory: Path
    base_name: str
    extension: str
    frame_padding: int
    first_frame: int
    last_frame: int
    frame_count: int
    frame_files: List[Path]
    
    def to_resolve_import_path(self) -> str:
        """
        Return the path Resolve should import to detect sequence.
        
        For image sequences, Resolve needs:
        - The directory path (will auto-detect sequences)
        - OR the first frame (will detect rest of sequence)
        
        We use the first frame approach for explicit control.
        """
        return str(self.frame_files[0])
    
    def to_pattern_string(self) -> str:
        """
        Return FFmpeg-style pattern string.
        
        Example: "/path/clip.%06d.exr"
        """
        return self.pattern


class ImageSequenceError(Exception):
    """Raised when image sequence validation fails."""
    pass


def is_image_sequence_format(path: Path) -> bool:
    """
    Check if file extension is an image sequence format.
    
    Args:
        path: Path to check
        
    Returns:
        True if extension is in IMAGE_SEQUENCE_EXTENSIONS
    """
    ext = path.suffix.lower().lstrip('.')
    return ext in IMAGE_SEQUENCE_EXTENSIONS


def detect_sequences_from_paths(paths: List[Path]) -> Tuple[List[ImageSequence], List[Path]]:
    """
    Detect image sequences from a list of file paths.
    
    Groups numbered files into sequences and returns both:
    - Detected sequences (2+ frames with sequential numbering)
    - Standalone files (single images, videos, etc.)
    
    Args:
        paths: List of file paths to analyze
        
    Returns:
        Tuple of (sequences, standalone_files)
        - sequences: List of ImageSequence objects
        - standalone_files: List of paths that aren't part of sequences
        
    Raises:
        ImageSequenceError: If sequence detection logic encounters invalid state
    """
    # Group files by potential sequence pattern
    sequence_groups: Dict[str, List[Tuple[int, Path, int]]] = defaultdict(list)
    standalone_files: List[Path] = []
    
    for path in paths:
        # Only process image sequence formats
        if not is_image_sequence_format(path):
            standalone_files.append(path)
            continue
        
        # Try to match sequence pattern
        match = SEQUENCE_PATTERN.match(path.name)
        if not match:
            # File doesn't match numbering pattern
            standalone_files.append(path)
            continue
        
        base_name, frame_str, extension = match.groups()
        frame_num = int(frame_str)
        frame_padding = len(frame_str)
        
        # Create group key: directory + base_name + extension + padding
        # This ensures sequences are grouped correctly even if multiple
        # sequences exist in the same directory
        group_key = f"{path.parent}|{base_name}|{extension}|{frame_padding}"
        sequence_groups[group_key].append((frame_num, path, frame_padding))
    
    # Convert groups to ImageSequence objects
    sequences: List[ImageSequence] = []
    
    for group_key, frame_list in sequence_groups.items():
        if len(frame_list) < 2:
            # Single frame - not a sequence
            standalone_files.append(frame_list[0][1])
            continue
        
        # This is a valid sequence (2+ frames)
        parts = group_key.split('|')
        directory = Path(parts[0])
        base_name = parts[1]
        extension = parts[2]
        frame_padding = int(parts[3])
        
        # Sort frames by frame number
        sorted_frames = sorted(frame_list, key=lambda x: x[0])
        first_frame = sorted_frames[0][0]
        last_frame = sorted_frames[-1][0]
        frame_count = len(sorted_frames)
        frame_files = [frame[1] for frame in sorted_frames]
        
        # Create FFmpeg/Resolve-compatible pattern
        pattern = f"{directory}/{base_name}.%0{frame_padding}d.{extension}"
        
        sequence = ImageSequence(
            pattern=pattern,
            directory=directory,
            base_name=base_name,
            extension=extension,
            frame_padding=frame_padding,
            first_frame=first_frame,
            last_frame=last_frame,
            frame_count=frame_count,
            frame_files=frame_files,
        )
        
        sequences.append(sequence)
    
    return sequences, standalone_files


def validate_sequence_job(sources: List[Path]) -> ImageSequence:
    """
    Validate that sources form a single valid image sequence.
    
    This enforces the contract:
    - All sources must be from the same sequence
    - No mixed formats allowed
    - No standalone files allowed
    
    Args:
        sources: List of source paths from JobSpec
        
    Returns:
        ImageSequence object representing the validated sequence
        
    Raises:
        ImageSequenceError: If validation fails
    """
    if not sources:
        raise ImageSequenceError("No sources provided")
    
    sequences, standalone = detect_sequences_from_paths(sources)
    
    # Must have exactly one sequence, no standalone files
    if len(sequences) == 0:
        raise ImageSequenceError(
            f"No image sequences detected. Sources must be numbered frames "
            f"(e.g., clip.0001.exr, clip.0002.exr, ...). "
            f"Single images or mixed formats are not supported."
        )
    
    if len(sequences) > 1:
        raise ImageSequenceError(
            f"Multiple sequences detected ({len(sequences)} sequences). "
            f"Each job must contain only ONE image sequence. "
            f"Split sequences into separate jobs."
        )
    
    if standalone:
        raise ImageSequenceError(
            f"Mixed sources detected: {len(sequences)} sequence(s) and "
            f"{len(standalone)} standalone file(s). "
            f"Image sequence jobs must contain ONLY sequence frames, no other files."
        )
    
    sequence = sequences[0]
    
    # Validate frame continuity (warn about gaps, don't fail)
    expected_frames = sequence.last_frame - sequence.first_frame + 1
    if sequence.frame_count != expected_frames:
        # Calculate missing frames
        frame_numbers = {int(re.search(r'(\d+)', f.stem).group(1)) for f in sequence.frame_files}
        all_frames = set(range(sequence.first_frame, sequence.last_frame + 1))
        missing = sorted(all_frames - frame_numbers)
        
        # This is a warning, not an error - Resolve can handle gaps
        print(
            f"WARNING: Frame gaps detected in sequence. "
            f"Expected {expected_frames} frames ({sequence.first_frame}-{sequence.last_frame}), "
            f"found {sequence.frame_count}. Missing frames: {missing[:10]}"
            f"{'...' if len(missing) > 10 else ''}"
        )
    
    return sequence


def collapse_sequence_to_single_source(sources: List[str]) -> Tuple[str, Dict[str, any]]:
    """
    Collapse a list of sequence frame paths into a single logical source.
    
    This is the main entry point for JobSpec pre-processing.
    
    Args:
        sources: List of source paths (may be sequence frames)
        
    Returns:
        Tuple of (collapsed_source, metadata)
        - collapsed_source: Single path representing the sequence (first frame)
        - metadata: Dict with sequence info for downstream use
        
    Raises:
        ImageSequenceError: If sources don't form a valid sequence
    """
    source_paths = [Path(s) for s in sources]
    
    # Validate and detect sequence
    sequence = validate_sequence_job(source_paths)
    
    # Return first frame as the "source" + metadata
    metadata = {
        'is_sequence': True,
        'pattern': sequence.pattern,
        'frame_count': sequence.frame_count,
        'first_frame': sequence.first_frame,
        'last_frame': sequence.last_frame,
        'frame_padding': sequence.frame_padding,
    }
    
    # Use first frame as the single source
    # Resolve will detect the sequence from this
    return str(sequence.frame_files[0]), metadata
