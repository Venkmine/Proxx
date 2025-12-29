"""
Operator Annotations - Immutable Data Models

Purpose: Define frozen dataclasses for operator annotations.
These are external records only. They do NOT affect Fabric or execution.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Literal
from uuid import UUID


@dataclass(frozen=True)
class OperatorAnnotation:
    """
    An immutable operator annotation record.
    
    This is a manual record of an operator's decision about a target.
    It does NOT trigger any automation, retries, or policy changes.
    It is EXTERNAL to Fabric and execution logic.
    """
    
    annotation_id: UUID
    target_type: Literal["job", "snapshot"]
    target_id: str
    decision: Literal["retry", "ignore", "escalate"]
    note: str | None
    operator_id: str
    created_at: datetime  # Must be UTC
