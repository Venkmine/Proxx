"""
FFmpeg progress parsing.

Phase 16.4: Real-time progress extraction from FFmpeg stderr.

FFmpeg outputs progress to stderr in this format:
    frame=   24 fps= 12 q=28.0 size=       0kB time=00:00:01.00 bitrate=   0.0kbits/s

We parse:
- time=HH:MM:SS.ss → current position
- Compare against clip duration → percentage
- Track encoding speed for ETA estimation
"""

import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional, Callable
from collections import deque


# Regex to extract time= value from FFmpeg stderr
# Matches: time=00:00:01.00 or time=00:01:23.45
TIME_PATTERN = re.compile(r'time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})')

# Regex to extract frame count
FRAME_PATTERN = re.compile(r'frame=\s*(\d+)')

# Regex to extract fps (encoding speed)
FPS_PATTERN = re.compile(r'fps=\s*([\d.]+)')

# Regex to extract current size
SIZE_PATTERN = re.compile(r'size=\s*([\d.]+)kB')


@dataclass
class ProgressInfo:
    """Progress information for a running clip."""
    
    clip_id: str
    
    # Progress percentage (0-100)
    progress_percent: float = 0.0
    
    # Current position in seconds
    current_time: float = 0.0
    
    # Total duration in seconds (from clip metadata)
    total_duration: float = 0.0
    
    # Current frame number
    current_frame: int = 0
    
    # Encoding speed (fps)
    encoding_fps: float = 0.0
    
    # Estimated time remaining in seconds
    eta_seconds: Optional[float] = None
    
    # Estimated output size in bytes
    estimated_size_bytes: Optional[int] = None
    
    # Current output size in bytes
    current_size_bytes: int = 0
    
    # Timestamps
    started_at: datetime = field(default_factory=datetime.now)
    last_update: datetime = field(default_factory=datetime.now)


class ProgressParser:
    """
    Parse FFmpeg stderr output for progress information.
    
    Usage:
        parser = ProgressParser(clip_id="abc", duration=120.0)
        for line in ffmpeg_stderr:
            progress = parser.parse_line(line)
            if progress:
                update_ui(progress)
    """
    
    def __init__(
        self,
        clip_id: str,
        duration: float,
        on_progress: Optional[Callable[[ProgressInfo], None]] = None,
    ):
        """
        Initialize progress parser.
        
        Args:
            clip_id: Clip task ID
            duration: Total clip duration in seconds
            on_progress: Optional callback for progress updates
        """
        self.clip_id = clip_id
        self.duration = duration
        self.on_progress = on_progress
        
        self._progress = ProgressInfo(
            clip_id=clip_id,
            total_duration=duration,
        )
        
        # Rolling average for ETA calculation (last N speed samples)
        self._speed_samples: deque[float] = deque(maxlen=10)
    
    def parse_line(self, line: str) -> Optional[ProgressInfo]:
        """
        Parse a single line of FFmpeg stderr output.
        
        Args:
            line: Single line from FFmpeg stderr
            
        Returns:
            Updated ProgressInfo if line contained progress, None otherwise
        """
        # Look for time= pattern
        time_match = TIME_PATTERN.search(line)
        if not time_match:
            return None
        
        # Extract current time
        hours = int(time_match.group(1))
        minutes = int(time_match.group(2))
        seconds = int(time_match.group(3))
        centiseconds = int(time_match.group(4))
        
        current_time = hours * 3600 + minutes * 60 + seconds + centiseconds / 100.0
        self._progress.current_time = current_time
        
        # Calculate progress percentage
        if self.duration > 0:
            self._progress.progress_percent = min(100.0, (current_time / self.duration) * 100.0)
        else:
            self._progress.progress_percent = 0.0
        
        # Extract frame count
        frame_match = FRAME_PATTERN.search(line)
        if frame_match:
            self._progress.current_frame = int(frame_match.group(1))
        
        # Extract encoding fps
        fps_match = FPS_PATTERN.search(line)
        if fps_match:
            fps = float(fps_match.group(1))
            self._progress.encoding_fps = fps
            if fps > 0:
                self._speed_samples.append(fps)
        
        # Extract current size
        size_match = SIZE_PATTERN.search(line)
        if size_match:
            size_kb = float(size_match.group(1))
            self._progress.current_size_bytes = int(size_kb * 1024)
        
        # Calculate ETA
        self._progress.eta_seconds = self._calculate_eta()
        
        # Estimate final size
        self._progress.estimated_size_bytes = self._estimate_final_size()
        
        # Update timestamp
        self._progress.last_update = datetime.now()
        
        # Invoke callback if provided
        if self.on_progress:
            self.on_progress(self._progress)
        
        return self._progress
    
    def _calculate_eta(self) -> Optional[float]:
        """
        Calculate estimated time remaining.
        
        Uses rolling average of encoding speed for smoother estimates.
        
        Returns:
            Estimated seconds remaining, or None if not calculable
        """
        if not self._speed_samples:
            return None
        
        if self.duration <= 0:
            return None
        
        remaining_time = self.duration - self._progress.current_time
        if remaining_time <= 0:
            return 0.0
        
        # Average encoding speed (in fps, but we need time ratio)
        # FFmpeg fps is frames per second of encoding, not playback
        # For rough ETA: elapsed_real_time / encoded_time * remaining_time
        
        elapsed = (self._progress.last_update - self._progress.started_at).total_seconds()
        if elapsed <= 0 or self._progress.current_time <= 0:
            return None
        
        # Speed ratio: how much real time per encoded second
        speed_ratio = elapsed / self._progress.current_time
        
        # ETA = remaining encoded time * speed ratio
        return remaining_time * speed_ratio
    
    def _estimate_final_size(self) -> Optional[int]:
        """
        Estimate final output file size.
        
        Based on current size and progress percentage.
        
        Returns:
            Estimated final size in bytes, or None if not calculable
        """
        if self._progress.progress_percent <= 0:
            return None
        
        if self._progress.current_size_bytes <= 0:
            return None
        
        # Estimate: current_size / (progress% / 100)
        estimated = int(self._progress.current_size_bytes / (self._progress.progress_percent / 100.0))
        
        return estimated
    
    def get_progress(self) -> ProgressInfo:
        """Get current progress info."""
        return self._progress
    
    def reset(self) -> None:
        """Reset progress state."""
        self._progress = ProgressInfo(
            clip_id=self.clip_id,
            total_duration=self.duration,
        )
        self._speed_samples.clear()


def format_eta(eta_seconds: Optional[float]) -> str:
    """
    Format ETA for display.
    
    Args:
        eta_seconds: Estimated seconds remaining
        
    Returns:
        Human-readable ETA string
    """
    if eta_seconds is None:
        return "Estimating..."
    
    if eta_seconds < 0:
        return "Almost done..."
    
    if eta_seconds < 60:
        return f"{int(eta_seconds)}s remaining"
    
    if eta_seconds < 3600:
        minutes = int(eta_seconds / 60)
        seconds = int(eta_seconds % 60)
        return f"{minutes}m {seconds}s remaining"
    
    hours = int(eta_seconds / 3600)
    minutes = int((eta_seconds % 3600) / 60)
    return f"{hours}h {minutes}m remaining"


def format_size(size_bytes: Optional[int]) -> str:
    """
    Format file size for display.
    
    Args:
        size_bytes: Size in bytes
        
    Returns:
        Human-readable size string
    """
    if size_bytes is None:
        return "Unknown"
    
    if size_bytes < 1024:
        return f"{size_bytes} B"
    
    if size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    
    if size_bytes < 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.1f} MB"
    
    return f"{size_bytes / (1024 * 1024 * 1024):.2f} GB"
