"""
Forge Readiness Report - Structured output for first-run validation.

This module generates and formats readiness reports for:
- Terminal output (CLI)
- JSON output (API/frontend)

Part of IMPLEMENTATION SLICE 6: Operator Entrypoints and Packaging.
"""

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from .checks import CheckResult, CheckStatus, run_all_checks, is_ready, BLOCKING_CHECKS


@dataclass
class ReadinessReport:
    """
    Structured readiness report.
    
    Attributes:
        version: Forge version string
        ready: Overall readiness status
        checks: List of individual check results
        timestamp: Report generation time (ISO format)
        blocking_failures: Count of blocking check failures
        total_failures: Count of all check failures
    """
    version: str
    ready: bool
    checks: List[CheckResult]
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    
    @property
    def blocking_failures(self) -> int:
        """Count of blocking check failures."""
        return sum(
            1 for c in self.checks 
            if c.id in BLOCKING_CHECKS and not c.passed
        )
    
    @property
    def total_failures(self) -> int:
        """Count of all check failures."""
        return sum(1 for c in self.checks if not c.passed)
    
    @property
    def passed_checks(self) -> List[CheckResult]:
        """List of checks that passed."""
        return [c for c in self.checks if c.passed]
    
    @property
    def failed_checks(self) -> List[CheckResult]:
        """List of checks that failed."""
        return [c for c in self.checks if not c.passed]
    
    @property
    def blocking_failed_checks(self) -> List[CheckResult]:
        """List of blocking checks that failed."""
        return [c for c in self.checks if c.id in BLOCKING_CHECKS and not c.passed]
    
    def to_dict(self) -> dict:
        """Serialize to dictionary for JSON output."""
        return {
            "version": self.version,
            "ready": self.ready,
            "timestamp": self.timestamp,
            "summary": {
                "total_checks": len(self.checks),
                "passed": len(self.passed_checks),
                "failed": self.total_failures,
                "blocking_failures": self.blocking_failures,
            },
            "checks": [c.to_dict() for c in self.checks],
        }
    
    def to_json(self, indent: int = 2) -> str:
        """Serialize to JSON string."""
        return json.dumps(self.to_dict(), indent=indent)


def get_version() -> str:
    """
    Read Forge version from VERSION file.
    
    Falls back to "unknown" if file not found.
    """
    # Try multiple possible locations
    version_paths = [
        Path(__file__).parent.parent.parent / "VERSION",  # repo root from backend/readiness
        Path.cwd() / "VERSION",
        Path(__file__).parent.parent / "VERSION",  # backend/VERSION
    ]
    
    for version_path in version_paths:
        if version_path.exists():
            try:
                return version_path.read_text().strip()
            except (OSError, IOError):
                continue
    
    return "unknown"


def generate_readiness_report() -> ReadinessReport:
    """
    Generate a complete readiness report.
    
    Runs all checks and returns a structured report.
    
    Returns:
        ReadinessReport instance with all check results
    """
    version = get_version()
    checks = run_all_checks()
    ready = is_ready(checks)
    
    return ReadinessReport(
        version=version,
        ready=ready,
        checks=checks,
    )


def format_readiness_terminal(report: ReadinessReport) -> str:
    """
    Format readiness report for terminal output.
    
    Uses Unicode symbols and color hints for clarity.
    
    Args:
        report: ReadinessReport to format
        
    Returns:
        Formatted string for terminal display
    """
    lines = []
    
    # Header
    lines.append("")
    lines.append("=" * 60)
    lines.append(f"  FORGE READINESS CHECK  v{report.version}")
    lines.append("=" * 60)
    lines.append("")
    
    # Individual checks
    for check in report.checks:
        if check.passed:
            symbol = "✔"
            status_label = "PASS"
        else:
            symbol = "✘"
            status_label = "FAIL"
        
        # Mark blocking checks
        blocking_marker = " [BLOCKING]" if check.id in BLOCKING_CHECKS and not check.passed else ""
        
        lines.append(f"  {symbol} {check.id}: {check.message}{blocking_marker}")
        
        # Add hint for failures
        if not check.passed and check.hint:
            lines.append(f"      ↳ {check.hint}")
    
    lines.append("")
    
    # Summary
    lines.append("-" * 60)
    
    if report.ready:
        lines.append("")
        lines.append("  ✔ READY")
        lines.append("")
        lines.append("  Forge is ready to start.")
        if report.total_failures > 0:
            lines.append(f"  Note: {report.total_failures} non-blocking check(s) failed.")
            lines.append("  Some features may be limited.")
    else:
        lines.append("")
        lines.append("  ✘ NOT READY")
        lines.append("")
        lines.append(f"  {report.blocking_failures} blocking issue(s) must be resolved:")
        for check in report.blocking_failed_checks:
            lines.append(f"    • {check.id}: {check.message}")
        lines.append("")
        lines.append("  Forge will not start until these are fixed.")
    
    lines.append("")
    lines.append("-" * 60)
    lines.append("")
    
    return "\n".join(lines)


def save_readiness_report(report: ReadinessReport, path: Optional[Path] = None) -> Path:
    """
    Save readiness report to JSON file.
    
    Args:
        report: ReadinessReport to save
        path: Output path (default: forge_readiness.json in cwd)
        
    Returns:
        Path to saved file
    """
    if path is None:
        path = Path.cwd() / "forge_readiness.json"
    
    path.write_text(report.to_json())
    return path
