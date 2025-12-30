"""
V2 Support Policy - Report-driven format support guardrails.

This module implements support policy evaluation using test reports as
the single source of truth. No guessing, no hardcoded "should work" lists.

Runtime behavior:
- BLOCKED: Prevent job creation with explicit error
- WARN: Allow job but attach warning in metadata
- ALLOWED: Proceed normally

Part of V2 Resolve Dev 5: Evidence-based support matrix.
"""

import json
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Dict, List, Optional, Set


# =============================================================================
# Support Policy Classification
# =============================================================================

class SupportPolicy(str, Enum):
    """
    Support policy classification for source formats.
    
    ALLOWED: Format is fully supported and tested
    WARN: Format may work but has limitations or edge cases
    BLOCK: Format is not supported and must be rejected
    UNKNOWN: No test evidence available (conservative: treat as WARN)
    """
    ALLOWED = "allowed"
    WARN = "warn"
    BLOCK = "block"
    UNKNOWN = "unknown"


@dataclass
class PolicyResult:
    """
    Result of policy evaluation for a format.
    
    Attributes:
        format_name: Format being evaluated
        policy: Classification (allowed/warn/block/unknown)
        message: Human-readable explanation
        evidence_source: Where this policy came from (test report or hardcoded)
    """
    format_name: str
    policy: SupportPolicy
    message: str
    evidence_source: str
    
    @property
    def is_allowed(self) -> bool:
        """Check if format is allowed (not blocked)."""
        return self.policy in (SupportPolicy.ALLOWED, SupportPolicy.WARN)
    
    @property
    def is_blocked(self) -> bool:
        """Check if format is blocked."""
        return self.policy == SupportPolicy.BLOCK
    
    def to_dict(self) -> dict:
        """Serialize to dictionary."""
        return {
            "format_name": self.format_name,
            "policy": self.policy.value,
            "message": self.message,
            "evidence_source": self.evidence_source,
        }


# =============================================================================
# Hardcoded Blocks (Non-Negotiable)
# =============================================================================
# These are formats that must ALWAYS be blocked, regardless of test results.
# Currently empty - ProRes RAW proxy generation supported via Resolve-based workflow.
# =============================================================================

HARDCODED_BLOCKS: Dict[str, str] = {}


# =============================================================================
# Support Policy Evaluator
# =============================================================================

class SupportPolicyEvaluator:
    """
    Evaluates format support policy using test report evidence.
    
    This is the runtime enforcement point for support guardrails.
    Policies are loaded from the latest test report.
    """
    
    def __init__(self, report_path: Optional[Path] = None):
        """
        Initialize evaluator with optional report path.
        
        Args:
            report_path: Path to test report JSON. If None, uses latest report.
        """
        self.report_path = report_path
        self.report_data: Optional[dict] = None
        self.format_policies: Dict[str, PolicyResult] = {}
        
        # Load report if path provided
        if report_path:
            self.load_report(report_path)
    
    def load_report(self, report_path: Path) -> None:
        """
        Load test report and build format policy map.
        
        Args:
            report_path: Path to test report JSON
        """
        with open(report_path) as f:
            self.report_data = json.load(f)
        
        # Build format policy map from test results
        for result in self.report_data.get("results", []):
            format_name = result["format"].lower().replace(" ", "_").replace("-", "_")
            expected_policy = result["expected_policy"]
            status = result["status"]
            
            # Map test status to policy
            if expected_policy == "block":
                policy = SupportPolicy.BLOCK
                message = result.get("failure_reason", "Format not supported")
            elif status == "completed":
                policy = SupportPolicy.ALLOWED
                message = f"{result['format']} is supported (test passed)"
            elif status == "failed":
                policy = SupportPolicy.WARN
                message = f"{result['format']} may have issues: {result.get('failure_reason', 'test failed')}"
            else:
                policy = SupportPolicy.UNKNOWN
                message = f"{result['format']} has not been tested successfully"
            
            self.format_policies[format_name] = PolicyResult(
                format_name=format_name,
                policy=policy,
                message=message,
                evidence_source=str(report_path),
            )
    
    def classify_format(self, format_name: str) -> PolicyResult:
        """
        Classify a format according to support policy.
        
        Priority:
        1. Hardcoded blocks (ProRes RAW, etc.)
        2. Report-derived policy (from test results)
        3. Unknown (conservative default)
        
        Args:
            format_name: Format identifier (e.g., "braw", "r3d", "prores_raw")
            
        Returns:
            PolicyResult with classification and message
        """
        format_key = format_name.lower().replace(" ", "_").replace("-", "_")
        
        # PRIORITY 1: Check hardcoded blocks
        if format_key in HARDCODED_BLOCKS:
            return PolicyResult(
                format_name=format_name,
                policy=SupportPolicy.BLOCK,
                message=HARDCODED_BLOCKS[format_key],
                evidence_source="hardcoded_block",
            )
        
        # PRIORITY 2: Check report-derived policy
        if format_key in self.format_policies:
            return self.format_policies[format_key]
        
        # PRIORITY 3: Unknown (no evidence)
        return PolicyResult(
            format_name=format_name,
            policy=SupportPolicy.UNKNOWN,
            message=f"{format_name} has no test evidence. Proceed with caution.",
            evidence_source="default_unknown",
        )
    
    def get_resolve_edition(self) -> str:
        """
        Get Resolve edition from loaded report.
        
        Returns:
            "free" | "studio" | "unknown"
        """
        if not self.report_data:
            return "unknown"
        return self.report_data.get("resolve_metadata", {}).get("resolve_edition", "unknown")
    
    def get_resolve_version(self) -> str:
        """
        Get Resolve version from loaded report.
        
        Returns:
            Version string or "unknown"
        """
        if not self.report_data:
            return "unknown"
        return self.report_data.get("resolve_metadata", {}).get("resolve_version", "unknown")


# =============================================================================
# Convenience Functions
# =============================================================================

def find_latest_report(reports_dir: Path = None) -> Optional[Path]:
    """
    Find the latest test report in reports directory.
    
    Args:
        reports_dir: Directory containing test reports. If None, uses default.
        
    Returns:
        Path to latest report, or None if no reports found
    """
    if reports_dir is None:
        # Default to forge-tests/reports relative to this file
        reports_dir = Path(__file__).parent.parent.parent / "forge-tests" / "reports"
    
    if not reports_dir.exists():
        return None
    
    # Find all JSON reports sorted by modification time
    reports = sorted(
        reports_dir.glob("test_report_*.json"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    
    return reports[0] if reports else None


def load_latest_policy() -> Optional[SupportPolicyEvaluator]:
    """
    Load support policy from latest test report.
    
    Returns:
        SupportPolicyEvaluator if report found, None otherwise
    """
    latest_report = find_latest_report()
    if not latest_report:
        return None
    
    evaluator = SupportPolicyEvaluator(latest_report)
    return evaluator


def check_format_support(format_name: str) -> PolicyResult:
    """
    Quick check of format support using latest report.
    
    Args:
        format_name: Format to check (e.g., "BRAW", "R3D", "ProRes RAW")
        
    Returns:
        PolicyResult with classification
    """
    evaluator = load_latest_policy()
    
    if not evaluator:
        # No report available - conservative default
        # Check hardcoded blocks first
        format_key = format_name.lower().replace(" ", "_").replace("-", "_")
        if format_key in HARDCODED_BLOCKS:
            return PolicyResult(
                format_name=format_name,
                policy=SupportPolicy.BLOCK,
                message=HARDCODED_BLOCKS[format_key],
                evidence_source="hardcoded_block",
            )
        
        return PolicyResult(
            format_name=format_name,
            policy=SupportPolicy.UNKNOWN,
            message=f"No test reports available. {format_name} support cannot be verified.",
            evidence_source="no_report",
        )
    
    return evaluator.classify_format(format_name)


# =============================================================================
# Test/Debug Utility
# =============================================================================

if __name__ == "__main__":
    """
    Test/debug utility to check format support policies.
    
    Run: python -m backend.v2.support_policy
    """
    import sys
    
    evaluator = load_latest_policy()
    
    if not evaluator:
        print("No test reports found")
        print("Run forge-tests/run_tests.py to generate reports")
        sys.exit(1)
    
    print("Support Policy Evaluator")
    print(f"Edition: {evaluator.get_resolve_edition()}")
    print(f"Version: {evaluator.get_resolve_version()}")
    print(f"Report: {evaluator.report_path}\n")
    
    # Test some formats
    test_formats = ["BRAW", "R3D", "ARRIRAW", "ProRes RAW", "X-OCN", "H.264"]
    
    print("Format Support Status:")
    print(f"{'Format':<20} {'Policy':<10} {'Message'}")
    print("-" * 80)
    
    for fmt in test_formats:
        result = evaluator.classify_format(fmt)
        print(f"{fmt:<20} {result.policy.value:<10} {result.message[:50]}")
