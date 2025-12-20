"""
File stability detection.

Uses polling to determine when files have finished copying/writing.
A file is considered stable when its size has not changed for N consecutive checks.
"""

import os
import time
from pathlib import Path
from typing import Dict, Tuple

from .models import FileStabilityCheck
from .errors import FileStabilityError


class FileStabilityChecker:
    """
    Poll-based file stability detector.

    Tracks file sizes over time and considers files stable when size
    remains unchanged for a configured number of consecutive checks.

    Configuration:
        check_interval: Seconds between size checks (default: 5)
        required_stable_checks: Number of consecutive stable checks required (default: 3)
        min_age_seconds: Minimum file age before checking stability (default: 10)

    Example:
        With defaults, a file must:
        - Be at least 10 seconds old
        - Have unchanged size for 3 consecutive checks @ 5 second intervals (15 seconds)
        - Total stability time: ~25 seconds from file creation
    """

    def __init__(
        self,
        check_interval: float = 5.0,
        required_stable_checks: int = 3,
        min_age_seconds: float = 10.0,
    ):
        self.check_interval = check_interval
        self.required_stable_checks = required_stable_checks
        self.min_age_seconds = min_age_seconds

        # Track file sizes and check counts: {path: (size, check_count)}
        self._file_state: Dict[str, Tuple[int, int]] = {}

    def check_stability(self, path: Path) -> FileStabilityCheck:
        """
        Check if a file is stable.

        Returns:
            FileStabilityCheck with stability status

        A file is considered stable when:
        1. File exists
        2. File is at least min_age_seconds old
        3. File size has not changed for required_stable_checks consecutive checks
        """
        path_str = str(path.resolve())

        # Check if file exists
        if not path.exists():
            # File disappeared - remove from tracking
            self._file_state.pop(path_str, None)
            return FileStabilityCheck(
                path=path_str,
                is_stable=False,
                size_bytes=None,
                check_count=0,
                reason="File does not exist",
            )

        # Check if file is accessible
        try:
            stat = path.stat()
            current_size = stat.st_size
            file_age = time.time() - stat.st_mtime
        except (OSError, PermissionError) as e:
            # File is not accessible - remove from tracking
            self._file_state.pop(path_str, None)
            return FileStabilityCheck(
                path=path_str,
                is_stable=False,
                size_bytes=None,
                check_count=0,
                reason=f"File not accessible: {e}",
            )

        # Check minimum age requirement
        if file_age < self.min_age_seconds:
            # Too young - don't track yet
            return FileStabilityCheck(
                path=path_str,
                is_stable=False,
                size_bytes=current_size,
                check_count=0,
                reason=f"File too recent (age: {file_age:.1f}s, required: {self.min_age_seconds}s)",
            )

        # Check if we've seen this file before
        if path_str not in self._file_state:
            # First check - record size
            self._file_state[path_str] = (current_size, 1)
            return FileStabilityCheck(
                path=path_str,
                is_stable=False,
                size_bytes=current_size,
                check_count=1,
                reason=f"First stability check (need {self.required_stable_checks} consecutive stable checks)",
            )

        # Compare with previous size
        prev_size, prev_count = self._file_state[path_str]

        if current_size == prev_size:
            # Size unchanged - increment check count
            new_count = prev_count + 1
            self._file_state[path_str] = (current_size, new_count)

            if new_count >= self.required_stable_checks:
                # File is stable!
                return FileStabilityCheck(
                    path=path_str,
                    is_stable=True,
                    size_bytes=current_size,
                    check_count=new_count,
                    reason=None,
                )
            else:
                # Not enough consecutive checks yet
                return FileStabilityCheck(
                    path=path_str,
                    is_stable=False,
                    size_bytes=current_size,
                    check_count=new_count,
                    reason=f"Stable for {new_count}/{self.required_stable_checks} checks",
                )
        else:
            # Size changed - reset count
            self._file_state[path_str] = (current_size, 1)
            return FileStabilityCheck(
                path=path_str,
                is_stable=False,
                size_bytes=current_size,
                check_count=1,
                reason=f"File size changed (prev: {prev_size}, current: {current_size})",
            )

    def reset_tracking(self, path: Path) -> None:
        """
        Reset stability tracking for a file.

        Used after a file has been successfully ingested or if tracking
        should be restarted.
        """
        path_str = str(path.resolve())
        self._file_state.pop(path_str, None)

    def clear_all_tracking(self) -> None:
        """
        Clear all file stability tracking.

        Used primarily for testing or when resetting watch folder state.
        """
        self._file_state.clear()
