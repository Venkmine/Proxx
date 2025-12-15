"""
Reporting and diagnostics for job execution.

Phase 8 — Generate machine-readable and human-readable reports
for job and clip-level outcomes. Observational only.
"""

from app.reporting.errors import ReportingError
from app.reporting.models import JobReport, ClipReport, DiagnosticsInfo
from app.reporting.writers import write_reports

__all__ = [
    "ReportingError",
    "JobReport",
    "ClipReport",
    "DiagnosticsInfo",
    "write_reports",
]
