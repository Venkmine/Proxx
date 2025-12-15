"""
Report writers — generate CSV, JSON, and TXT reports on disk.

Writes job reports to disk in multiple formats for different audiences:
- CSV: Spreadsheet-friendly clip-level details
- JSON: Machine-readable structured data
- TXT: Human-readable summary

All reports written with timestamped filenames to prevent collisions.
"""

import csv
import json
from datetime import datetime
from pathlib import Path
from typing import Optional

from app.reporting.errors import ReportWriteError
from app.reporting.models import JobReport, ClipReport


def _generate_timestamp() -> str:
    """Generate ISO 8601 timestamp for filenames (e.g., 20251215T143052)."""
    return datetime.now().strftime("%Y%m%dT%H%M%S")


def _format_duration(seconds: Optional[float]) -> str:
    """Format duration in seconds as human-readable string."""
    if seconds is None:
        return "N/A"
    if seconds < 60:
        return f"{seconds:.1f}s"
    minutes = int(seconds // 60)
    remaining_seconds = seconds % 60
    return f"{minutes}m {remaining_seconds:.1f}s"


def _format_size(bytes_size: Optional[int]) -> str:
    """Format file size in bytes as human-readable string."""
    if bytes_size is None:
        return "N/A"
    if bytes_size < 1024:
        return f"{bytes_size} B"
    elif bytes_size < 1024 * 1024:
        return f"{bytes_size / 1024:.1f} KB"
    elif bytes_size < 1024 * 1024 * 1024:
        return f"{bytes_size / (1024 * 1024):.1f} MB"
    else:
        return f"{bytes_size / (1024 * 1024 * 1024):.2f} GB"


def write_csv_report(report: JobReport, output_dir: Path) -> Path:
    """
    Write CSV report with clip-level details.
    
    Format: One row per clip with columns for all execution metadata.
    Suitable for Excel/spreadsheet analysis.
    
    Returns path to written CSV file.
    Raises ReportWriteError if write fails.
    """
    timestamp = _generate_timestamp()
    filename = f"proxx_job_{report.job_id[:8]}_{timestamp}.csv"
    filepath = output_dir / filename

    try:
        with open(filepath, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)

            # Header
            writer.writerow([
                "task_id",
                "source_path",
                "status",
                "output_path",
                "output_size_bytes",
                "execution_duration_seconds",
                "failure_reason",
                "warnings",
                "started_at",
                "completed_at",
            ])

            # Data rows
            for clip in report.clips:
                writer.writerow([
                    clip.task_id,
                    clip.source_path,
                    clip.status.value,
                    clip.output_path or "",
                    clip.output_size_bytes or "",
                    clip.execution_duration_seconds or "",
                    clip.failure_reason or "",
                    "; ".join(clip.warnings) if clip.warnings else "",
                    clip.started_at.isoformat() if clip.started_at else "",
                    clip.completed_at.isoformat() if clip.completed_at else "",
                ])

        return filepath

    except Exception as e:
        raise ReportWriteError(f"Failed to write CSV report: {e}") from e


def write_json_report(report: JobReport, output_dir: Path) -> Path:
    """
    Write JSON report with complete structured data.
    
    Format: Full JobReport model serialized to JSON.
    Suitable for machine parsing, API integration, archiving.
    
    Returns path to written JSON file.
    Raises ReportWriteError if write fails.
    """
    timestamp = _generate_timestamp()
    filename = f"proxx_job_{report.job_id[:8]}_{timestamp}.json"
    filepath = output_dir / filename

    try:
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(
                report.model_dump(mode="json"),
                f,
                indent=2,
                default=str,  # Handle datetime serialization
            )

        return filepath

    except Exception as e:
        raise ReportWriteError(f"Failed to write JSON report: {e}") from e


def write_text_report(report: JobReport, output_dir: Path) -> Path:
    """
    Write human-readable text summary.
    
    Format: Multi-line text with job overview and clip outcomes.
    Suitable for quick review, log files, email reports.
    
    Returns path to written text file.
    Raises ReportWriteError if write fails.
    """
    timestamp = _generate_timestamp()
    filename = f"proxx_job_{report.job_id[:8]}_{timestamp}.txt"
    filepath = output_dir / filename

    try:
        with open(filepath, "w", encoding="utf-8") as f:
            # Header
            f.write("=" * 80 + "\n")
            f.write("PROXX JOB REPORT\n")
            f.write("=" * 80 + "\n\n")

            # Job summary
            f.write(f"Job ID:           {report.job_id}\n")
            f.write(f"Status:           {report.status.value.upper()}\n")
            f.write(f"Created:          {report.created_at.strftime('%Y-%m-%d %H:%M:%S')}\n")
            if report.started_at:
                f.write(f"Started:          {report.started_at.strftime('%Y-%m-%d %H:%M:%S')}\n")
            if report.completed_at:
                f.write(f"Completed:        {report.completed_at.strftime('%Y-%m-%d %H:%M:%S')}\n")
            duration = report.duration_seconds()
            if duration is not None:
                f.write(f"Duration:         {_format_duration(duration)}\n")
            f.write("\n")

            # Clip summary
            f.write(f"Total clips:      {report.total_clips}\n")
            f.write(f"Completed:        {report.completed_clips}\n")
            f.write(f"Failed:           {report.failed_clips}\n")
            f.write(f"Skipped:          {report.skipped_clips}\n")
            f.write(f"Warnings:         {report.warnings_count}\n")
            f.write("\n")

            # Diagnostics
            f.write("-" * 80 + "\n")
            f.write("DIAGNOSTICS\n")
            f.write("-" * 80 + "\n\n")
            f.write(f"Proxx version:    {report.diagnostics.proxx_version}\n")
            f.write(f"Python version:   {report.diagnostics.python_version}\n")
            f.write(f"OS:               {report.diagnostics.os_version}\n")
            f.write(f"Hostname:         {report.diagnostics.hostname}\n")
            if report.diagnostics.resolve_path:
                f.write(f"Resolve path:     {report.diagnostics.resolve_path}\n")
                f.write(f"Resolve version:  {report.diagnostics.resolve_version or 'unknown'}\n")
                f.write(f"Resolve Studio:   {report.diagnostics.resolve_studio}\n")
            f.write("\n")

            # Clip details
            f.write("-" * 80 + "\n")
            f.write("CLIP DETAILS\n")
            f.write("-" * 80 + "\n\n")

            for i, clip in enumerate(report.clips, 1):
                f.write(f"[{i}/{report.total_clips}] {Path(clip.source_path).name}\n")
                f.write(f"    Status:       {clip.status.value}\n")
                if clip.output_path:
                    f.write(f"    Output:       {clip.output_path}\n")
                    if clip.output_size_bytes is not None:
                        f.write(f"    Size:         {_format_size(clip.output_size_bytes)}\n")
                if clip.execution_duration_seconds is not None:
                    f.write(f"    Duration:     {_format_duration(clip.execution_duration_seconds)}\n")
                if clip.failure_reason:
                    f.write(f"    Failure:      {clip.failure_reason}\n")
                if clip.warnings:
                    f.write(f"    Warnings:     {len(clip.warnings)}\n")
                    for warning in clip.warnings:
                        f.write(f"                  - {warning}\n")
                f.write("\n")

            # Footer
            f.write("=" * 80 + "\n")
            f.write(f"Report generated: {report.diagnostics.generated_at.strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write("=" * 80 + "\n")

        return filepath

    except Exception as e:
        raise ReportWriteError(f"Failed to write text report: {e}") from e


def write_reports(report: JobReport, output_dir: Path) -> dict:
    """
    Write all report formats (CSV, JSON, TXT) to output directory.
    
    Args:
        report: JobReport to write
        output_dir: Directory to write reports to (must exist)
    
    Returns:
        Dict mapping format name to written filepath:
        {"csv": Path, "json": Path, "txt": Path}
    
    Raises:
        ReportWriteError: If any report fails to write
    """
    if not output_dir.exists():
        raise ReportWriteError(f"Output directory does not exist: {output_dir}")

    if not output_dir.is_dir():
        raise ReportWriteError(f"Output path is not a directory: {output_dir}")

    # Write all formats
    csv_path = write_csv_report(report, output_dir)
    json_path = write_json_report(report, output_dir)
    txt_path = write_text_report(report, output_dir)

    return {
        "csv": csv_path,
        "json": json_path,
        "txt": txt_path,
    }
