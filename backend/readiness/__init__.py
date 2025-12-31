"""
Forge Readiness Checks - First-run validation for environment and dependencies.

This module provides honest, transparent readiness checking for Forge.
Each check returns an explicit pass/fail status with no hidden recovery.

Principles:
- Explicit: Every check returns pass/fail with clear messaging
- Honest: No silent failures, no auto-fixing
- Actionable: Hints provided for resolution (text only, no actions)
- Local: All checks run locally, no network calls
"""

from .checks import (
    ReadinessCheck,
    CheckResult,
    CheckStatus,
    # Individual checks
    check_python_version,
    check_ffmpeg_available,
    check_resolve_installed,
    check_resolve_edition,
    check_directories_writable,
    check_license_valid,
    check_worker_capacity,
    check_monitoring_db,
    # Aggregation
    run_all_checks,
    is_ready,
)

from .readiness_report import (
    ReadinessReport,
    generate_readiness_report,
    format_readiness_terminal,
)

__all__ = [
    # Check types
    "ReadinessCheck",
    "CheckResult",
    "CheckStatus",
    # Individual checks
    "check_python_version",
    "check_ffmpeg_available",
    "check_resolve_installed",
    "check_resolve_edition",
    "check_directories_writable",
    "check_license_valid",
    "check_worker_capacity",
    "check_monitoring_db",
    # Aggregation
    "run_all_checks",
    "is_ready",
    # Report
    "ReadinessReport",
    "generate_readiness_report",
    "format_readiness_terminal",
]
