"""
Operator Annotations - External Manual Records

This module provides a simple system for operators to record decisions
about jobs and snapshots. These annotations are EXTERNAL to Fabric and
do NOT affect execution, retries, or policy.
"""

from .models import OperatorAnnotation
from .store import AnnotationStore

__all__ = ["OperatorAnnotation", "AnnotationStore"]
