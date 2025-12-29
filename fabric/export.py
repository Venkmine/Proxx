"""
Fabric Report Export - Read-only, deterministic export layer.

PHASE-2: OPERATOR REPORT EXPORT (READ-ONLY)

This module provides exportable artifacts from FabricReports.
Operators consume these exports without needing tooling knowledge.

ABSOLUTE CONSTRAINTS:
---------------------
❌ NO filesystem writes
❌ NO CLI integration
❌ NO retries or orchestration
❌ NO aggregation logic beyond reports
❌ NO mutation of reports or intelligence
❌ NO conditional phrasing ("healthy", "risk", "recommend")
❌ NO interpretation of data
✅ READ-ONLY from FabricReports only
✅ Deterministic outputs (same data → byte-identical output)
✅ Explicit field ordering
✅ No hidden or inferred data

DESIGN PHILOSOPHY:
------------------
Fabric STATES FACTS. This layer FORMATS THEM.

Exports must be:
- Deterministic (same data → byte-identical output)
- Explicit and boring
- Never recommend actions
- Never hide missing data
- Never change meaning
"""

from datetime import datetime, timezone
from typing import Any, Dict

from fabric.reports import FabricReports, FabricReportError


class FabricExportError(FabricReportError):
    """Raised when export generation fails."""
    pass


class FabricReportExporter:
    """
    Export layer for Fabric Reports.
    
    Produces structured exports from FabricReports.
    All methods are pure - no mutations, no side effects.
    
    FORBIDDEN:
    ----------
    - Filesystem writes
    - CLI integration
    - Retries
    - Aggregation beyond what reports expose
    - Mutation of underlying reports
    - Conditional phrasing
    - Interpretation or judgment
    """
    
    def __init__(self, reports: FabricReports):
        """
        Initialize exporter.
        
        Args:
            reports: FabricReports instance to export from. Must not be None.
        
        Raises:
            FabricExportError: If reports is None
        """
        if reports is None:
            raise FabricExportError(
                "FabricReports is required - cannot export without reports"
            )
        self._reports = reports
    
    # =========================================================================
    # JSON Export
    # =========================================================================
    
    def export_json(self) -> Dict[str, Any]:
        """
        Export reports as structured JSON-serializable dictionary.
        
        Returns:
            {
                "generated_at": "ISO-8601 UTC timestamp",
                "execution_summary": { ... },
                "failure_summary": { ... },
                "engine_health": { ... },
                "proxy_profile_stability": { ... },
                "determinism": { ... }
            }
        
        Field order is deterministic.
        No derived data beyond what reports expose.
        Timestamp is generation time only.
        
        Raises:
            FabricExportError: If report query fails
        """
        try:
            execution_summary = self._reports.execution_summary()
            failure_summary = self._reports.failure_summary()
            engine_health = self._reports.engine_health_report()
            proxy_profile_stability = self._reports.proxy_profile_stability_report()
            determinism = self._reports.determinism_report()
        except FabricReportError as e:
            raise FabricExportError(f"Failed to query reports for export: {e}") from e
        
        # Generate timestamp at export time (not persisted)
        generated_at = datetime.now(timezone.utc).isoformat()
        
        # Return with explicit, deterministic field ordering
        return {
            "generated_at": generated_at,
            "execution_summary": self._format_execution_summary_json(execution_summary),
            "failure_summary": self._format_failure_summary_json(failure_summary),
            "engine_health": self._format_engine_health_json(engine_health),
            "proxy_profile_stability": self._format_proxy_profile_stability_json(proxy_profile_stability),
            "determinism": self._format_determinism_json(determinism),
        }
    
    def _format_execution_summary_json(self, summary: Dict[str, int]) -> Dict[str, int]:
        """Format execution summary with deterministic key order."""
        return {
            "total_jobs": summary["total_jobs"],
            "completed": summary["completed"],
            "failed": summary["failed"],
            "validation_failed": summary["validation_failed"],
        }
    
    def _format_failure_summary_json(self, summary: Dict[str, Any]) -> Dict[str, Any]:
        """Format failure summary with deterministic key order."""
        by_engine = summary["by_engine"]
        
        # Ensure deterministic engine ordering
        formatted_by_engine = {}
        for engine in sorted(by_engine.keys()):
            engine_failures = by_engine[engine]
            # Ensure deterministic reason ordering within each engine
            formatted_by_engine[engine] = {
                reason: engine_failures[reason]
                for reason in sorted(engine_failures.keys())
            }
        
        return {
            "by_engine": formatted_by_engine,
            "top_failure_reasons": summary["top_failure_reasons"],
        }
    
    def _format_engine_health_json(self, health: Dict[str, Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
        """Format engine health with deterministic key order."""
        result = {}
        for engine in sorted(health.keys()):
            engine_data = health[engine]
            result[engine] = {
                "jobs": engine_data["jobs"],
                "failures": engine_data["failures"],
                "failure_rate": engine_data["failure_rate"],
            }
        return result
    
    def _format_proxy_profile_stability_json(self, stability: Dict[str, Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
        """Format proxy profile stability with deterministic key order."""
        result = {}
        for profile in sorted(stability.keys()):
            profile_data = stability[profile]
            result[profile] = {
                "jobs": profile_data["jobs"],
                "failure_rate": profile_data["failure_rate"],
            }
        return result
    
    def _format_determinism_json(self, determinism: Dict[str, Any]) -> Dict[str, Any]:
        """Format determinism report with deterministic key order."""
        return {
            "non_deterministic_jobs": determinism["non_deterministic_jobs"],
            "count": determinism["count"],
        }
    
    # =========================================================================
    # Text Export
    # =========================================================================
    
    def export_text(self) -> str:
        """
        Export reports as plain-text, human-readable report.
        
        Format rules:
        - Fixed section headers
        - Stable ordering
        - No emojis, colors, markdown, or styling
        - No opinionated language
        - Deterministic down to whitespace
        
        Returns:
            Plain text report string
        
        Raises:
            FabricExportError: If report query fails
        """
        try:
            execution_summary = self._reports.execution_summary()
            failure_summary = self._reports.failure_summary()
            engine_health = self._reports.engine_health_report()
            proxy_profile_stability = self._reports.proxy_profile_stability_report()
            determinism = self._reports.determinism_report()
        except FabricReportError as e:
            raise FabricExportError(f"Failed to query reports for export: {e}") from e
        
        lines = []
        
        # Header
        lines.append("FABRIC OPERATOR REPORT")
        lines.append("======================")
        lines.append("")
        
        # Execution Summary
        lines.extend(self._format_execution_summary_text(execution_summary))
        lines.append("")
        
        # Engine Health
        lines.extend(self._format_engine_health_text(engine_health))
        lines.append("")
        
        # Failure Summary
        lines.extend(self._format_failure_summary_text(failure_summary))
        lines.append("")
        
        # Proxy Profile Stability
        lines.extend(self._format_proxy_profile_stability_text(proxy_profile_stability))
        lines.append("")
        
        # Determinism
        lines.extend(self._format_determinism_text(determinism))
        
        return "\n".join(lines)
    
    def _format_execution_summary_text(self, summary: Dict[str, int]) -> list:
        """Format execution summary as text lines."""
        return [
            "Execution Summary",
            "-----------------",
            f"Total jobs: {summary['total_jobs']}",
            f"Completed: {summary['completed']}",
            f"Failed: {summary['failed']}",
            f"Validation failed: {summary['validation_failed']}",
        ]
    
    def _format_engine_health_text(self, health: Dict[str, Dict[str, Any]]) -> list:
        """Format engine health as text lines."""
        lines = [
            "Engine Health",
            "-------------",
        ]
        
        for engine in sorted(health.keys()):
            engine_data = health[engine]
            # Capitalize engine name for display
            display_name = engine.capitalize() + ":"
            lines.append(display_name)
            lines.append(f"  Jobs: {engine_data['jobs']}")
            lines.append(f"  Failures: {engine_data['failures']}")
            lines.append(f"  Failure rate: {engine_data['failure_rate']:.3f}")
            lines.append("")
        
        # Remove trailing empty line if engines were added
        if lines and lines[-1] == "":
            lines = lines[:-1]
        
        return lines
    
    def _format_failure_summary_text(self, summary: Dict[str, Any]) -> list:
        """Format failure summary as text lines."""
        lines = [
            "Failure Summary",
            "---------------",
        ]
        
        by_engine = summary["by_engine"]
        has_any_failures = False
        
        for engine in sorted(by_engine.keys()):
            engine_failures = by_engine[engine]
            if not engine_failures:
                continue
            
            has_any_failures = True
            # Capitalize engine name for display
            display_name = engine.capitalize() + ":"
            lines.append(display_name)
            
            # Sort reasons: by count desc, then name asc (deterministic)
            sorted_reasons = sorted(
                engine_failures.keys(),
                key=lambda r: (-engine_failures[r], r)
            )
            
            for reason in sorted_reasons:
                count = engine_failures[reason]
                lines.append(f"  {reason}: {count}")
            
            lines.append("")
        
        # Remove trailing empty line if failures were added
        if lines and lines[-1] == "":
            lines = lines[:-1]
        
        # If no failures, add explicit message
        if not has_any_failures:
            lines.append("No failures recorded.")
        
        return lines
    
    def _format_proxy_profile_stability_text(self, stability: Dict[str, Dict[str, Any]]) -> list:
        """Format proxy profile stability as text lines."""
        lines = [
            "Proxy Profile Stability",
            "-----------------------",
        ]
        
        if not stability:
            lines.append("No profiles recorded.")
            return lines
        
        for profile in sorted(stability.keys()):
            profile_data = stability[profile]
            lines.append(f"{profile}:")
            lines.append(f"  Jobs: {profile_data['jobs']}")
            lines.append(f"  Failure rate: {profile_data['failure_rate']:.3f}")
            lines.append("")
        
        # Remove trailing empty line if profiles were added
        if lines and lines[-1] == "":
            lines = lines[:-1]
        
        return lines
    
    def _format_determinism_text(self, determinism: Dict[str, Any]) -> list:
        """Format determinism report as text lines."""
        lines = [
            "Determinism",
            "-----------",
            f"Non-deterministic jobs: {determinism['count']}",
        ]
        
        # List job IDs if any exist
        if determinism["non_deterministic_jobs"]:
            lines.append("")
            lines.append("Affected jobs:")
            for job_id in determinism["non_deterministic_jobs"]:
                lines.append(f"  {job_id}")
        
        return lines


# =============================================================================
# Factory Function
# =============================================================================

def create_exporter(reports: FabricReports) -> FabricReportExporter:
    """
    Factory function for creating FabricReportExporter.
    
    Args:
        reports: FabricReports instance to export from
    
    Returns:
        Initialized FabricReportExporter instance
    
    Raises:
        FabricExportError: If reports is None
    """
    return FabricReportExporter(reports)


# =============================================================================
# FORBIDDEN
# =============================================================================
# DO NOT ADD:
# - write_json_file() -> None
# - write_text_file() -> None
# - export_html() -> str
# - export_markdown() -> str
# - email_report() -> None
# - schedule_export() -> None
# - interpret_results() -> str
# - generate_recommendations() -> List[str]
# - summarize_health() -> str
# - cli_integration()
