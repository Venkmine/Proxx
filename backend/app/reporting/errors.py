"""
Reporting-specific errors.
"""


class ReportingError(Exception):
    """Base exception for reporting failures."""

    pass


class ReportWriteError(ReportingError):
    """Failed to write report to disk."""

    pass
