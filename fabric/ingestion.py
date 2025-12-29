"""
Fabric Ingestion - Read-only parsing of JobExecutionResult JSON.

This module reads execution results produced by Proxx and converts them
into immutable Fabric data structures.

Rules:
------
1. Read JobExecutionResult JSON verbatim
2. Validate schema strictly
3. Extract only allowed fields
4. Reject malformed or partial files LOUDLY
5. NO repair, NO guessing, NO inference
6. Idempotent: re-ingesting same file = same result

FORBIDDEN:
- Triggering retries
- Triggering execution
- Writing to Proxx directories
- Inferring missing data
- "Helpful" interpretation
"""

import hashlib
import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict

from fabric.models import IngestedJob, IngestedOutput


class IngestionError(Exception):
    """
    Raised when ingestion fails due to invalid or malformed data.
    
    Fabric rejects bad data loudly rather than guessing or repairing.
    """
    pass


def _compute_clip_id(source_path: str) -> str:
    """
    Compute stable identifier for a clip based on its source path.
    
    Uses SHA-256 hash of normalized absolute path.
    This provides stable IDs for indexing and querying.
    """
    normalized = Path(source_path).resolve().as_posix()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]


def _parse_datetime(dt_str: str) -> datetime:
    """
    Parse ISO 8601 datetime string.
    
    Raises:
        IngestionError: If datetime string is invalid
    """
    try:
        # Handle both with and without microseconds
        if "." in dt_str:
            return datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        else:
            return datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
    except (ValueError, TypeError) as e:
        raise IngestionError(f"Invalid datetime format: {dt_str}") from e


def _extract_output(clip_data: Dict[str, Any], job_id: str) -> IngestedOutput:
    """
    Extract IngestedOutput from a single clip result.
    
    Args:
        clip_data: Dictionary representing ClipExecutionResult
        job_id: Parent job ID
    
    Returns:
        IngestedOutput with facts from clip execution
    
    Raises:
        IngestionError: If required fields are missing or invalid
    """
    try:
        source_path = clip_data["source_path"]
        output_path = clip_data["resolved_output_path"]
        status = clip_data["status"]
        
        # Validate required fields
        if not isinstance(source_path, str) or not source_path:
            raise IngestionError(f"Invalid source_path: {source_path}")
        
        if not isinstance(output_path, str) or not output_path:
            raise IngestionError(f"Invalid resolved_output_path: {output_path}")
        
        if status not in ("COMPLETED", "FAILED"):
            raise IngestionError(f"Invalid status: {status}")
        
        return IngestedOutput(
            job_id=job_id,
            clip_id=_compute_clip_id(source_path),
            source_path=source_path,
            output_path=output_path,
            output_exists=clip_data.get("output_exists", False),
            output_size_bytes=clip_data.get("output_size_bytes"),
            status=status,
            failure_reason=clip_data.get("failure_reason"),
            engine_used=clip_data.get("engine_used"),
            proxy_profile_used=clip_data.get("proxy_profile_used"),
            resolve_preset_used=clip_data.get("resolve_preset_used"),
        )
    except KeyError as e:
        raise IngestionError(f"Missing required clip field: {e}") from e


def ingest_execution_result(path: str) -> IngestedJob:
    """
    Ingest a JobExecutionResult JSON file.
    
    Reads the file, validates its structure, and converts it into
    an immutable IngestedJob.
    
    Args:
        path: Absolute path to JobExecutionResult JSON file
    
    Returns:
        IngestedJob containing facts from execution result
    
    Raises:
        IngestionError: If file is missing, malformed, or invalid
        
    Guarantees:
    -----------
    - Idempotent: same file → same result
    - No side effects
    - No inference or repair
    - Loud failures on invalid data
    
    FORBIDDEN Operations:
    --------------------
    - Modifying source file
    - Writing to Proxx directories
    - Triggering execution
    - Inferring missing data
    - "Helpful" defaults
    """
    file_path = Path(path)
    
    # Validate file exists
    if not file_path.exists():
        raise IngestionError(f"File not found: {path}")
    
    if not file_path.is_file():
        raise IngestionError(f"Not a file: {path}")
    
    # Read and parse JSON
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        raise IngestionError(f"Invalid JSON in {path}: {e}") from e
    except IOError as e:
        raise IngestionError(f"Cannot read file {path}: {e}") from e
    
    # Validate required top-level fields
    required_fields = ["job_id", "final_status", "clips", "started_at"]
    missing = [f for f in required_fields if f not in data]
    if missing:
        raise IngestionError(f"Missing required fields: {missing}")
    
    job_id = data["job_id"]
    final_status = data["final_status"]
    
    # Validate job_id
    if not isinstance(job_id, str) or not job_id:
        raise IngestionError(f"Invalid job_id: {job_id}")
    
    # Validate final_status
    if final_status not in ("COMPLETED", "FAILED", "PARTIAL"):
        raise IngestionError(f"Invalid final_status: {final_status}")
    
    # Parse timestamps
    started_at = _parse_datetime(data["started_at"])
    completed_at = None
    if data.get("completed_at"):
        completed_at = _parse_datetime(data["completed_at"])
    
    # Extract metadata
    metadata = data.get("_metadata", {})
    
    # Extract outputs from clips
    clips_data = data.get("clips", [])
    if not isinstance(clips_data, list):
        raise IngestionError(f"Invalid clips field: must be list, got {type(clips_data)}")
    
    outputs = []
    for i, clip_data in enumerate(clips_data):
        try:
            output = _extract_output(clip_data, job_id)
            outputs.append(output)
        except IngestionError as e:
            raise IngestionError(f"Invalid clip at index {i}: {e}") from e
    
    # Build IngestedJob
    ingested_job = IngestedJob(
        job_id=job_id,
        final_status=final_status,
        canonical_proxy_profile=metadata.get("proxy_profile_used"),
        fingerprint=None,  # Phase 1: fingerprints not yet implemented
        validation_stage=metadata.get("validation_stage"),
        validation_error=metadata.get("validation_error"),
        engine_used=metadata.get("engine_used"),
        resolve_preset_used=metadata.get("resolve_preset_used"),
        jobspec_version=metadata.get("jobspec_version"),
        started_at=started_at,
        completed_at=completed_at,
        total_clips=data.get("total_clips", len(outputs)),
        completed_clips=data.get("completed_clips", sum(1 for o in outputs if o.status == "COMPLETED")),
        failed_clips=data.get("failed_clips", sum(1 for o in outputs if o.status == "FAILED")),
        outputs=outputs,
    )
    
    return ingested_job


# FORBIDDEN: Do not add functions like:
# - ingest_and_retry()
# - ingest_and_schedule()
# - ingest_with_recommendations()
# - repair_ingestion()
# - infer_missing_fields()
