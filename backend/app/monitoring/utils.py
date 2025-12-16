"""
Monitoring utility functions.

Helpers for report discovery, path formatting, and response construction.
"""

from pathlib import Path
from typing import List, Optional
import re


def find_job_reports(job_id: str, output_dir: Optional[str] = None) -> List[Path]:
    """
    Find all report files for a given job ID.
    
    Scans the output directory for files matching the pattern:
        proxx_job_{job_id[:8]}_{timestamp}.{csv|json|txt}
    
    Args:
        job_id: The full job ID (UUID)
        output_dir: The directory to search (defaults to current working directory)
        
    Returns:
        List of Path objects for matching report files, sorted by modification time (newest first)
    """
    if output_dir is None:
        search_dir = Path.cwd()
    else:
        search_dir = Path(output_dir)
    
    if not search_dir.exists() or not search_dir.is_dir():
        return []
    
    # Match pattern: proxx_job_{first_8_chars}_{timestamp}.{ext}
    job_id_prefix = job_id[:8]
    pattern = re.compile(rf"^proxx_job_{re.escape(job_id_prefix)}_\d{{8}}T\d{{6}}\.(csv|json|txt)$")
    
    matching_files = []
    for file_path in search_dir.iterdir():
        if file_path.is_file() and pattern.match(file_path.name):
            matching_files.append(file_path)
    
    # Sort by modification time, newest first
    matching_files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    
    return matching_files


def format_report_reference(file_path: Path) -> dict:
    """
    Format a report file path as a reference object.
    
    Args:
        file_path: Path to the report file
        
    Returns:
        Dictionary with filename, path, size, and modified timestamp
    """
    stat = file_path.stat()
    
    return {
        "filename": file_path.name,
        "path": str(file_path.absolute()),
        "size_bytes": stat.st_size,
        "modified_at": stat.st_mtime
    }
