#!/usr/bin/env python3
"""
Forge Black-Box Test Runner - Evidence-based Resolve support validation.

This test runner:
1. Loads test matrix configuration (format list with expected policies)
2. Triggers Forge jobs for each sample
3. Polls job status until completion or timeout
4. Verifies outputs exist for successful runs
5. Emits JSON report with Resolve edition/version metadata

Reports are used to drive support guardrails - no guessing.

Usage:
    python forge-tests/run_tests.py --config forge-tests/config/test_matrix_free.json
    python forge-tests/run_tests.py --config forge-tests/config/test_matrix_studio.json --dry-run
"""

import argparse
import json
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

# Add backend and project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))
sys.path.insert(0, str(project_root / "backend"))

from backend.job_spec import JobSpec
from backend.execution_adapter import execute_jobspec
from backend.v2.resolve_installation import detect_resolve_installation


# =============================================================================
# Test Result Schema
# =============================================================================

class TestResult:
    """Result of running a single test sample."""
    
    def __init__(
        self,
        sample_id: str,
        format_name: str,
        source_path: str,
        expected_policy: str,
        requires_resolve_edition: str = "either",
    ):
        self.sample_id = sample_id
        self.format_name = format_name
        self.source_path = source_path
        self.expected_policy = expected_policy
        self.requires_resolve_edition = requires_resolve_edition
        
        # Results (populated after execution)
        self.job_id: Optional[str] = None
        self.status: Optional[str] = None  # "completed" | "failed" | "blocked" | "timeout" | "skipped"
        self.engine_used: Optional[str] = None
        self.failure_reason: Optional[str] = None
        self.output_paths: List[str] = []
        self.duration_ms: Optional[int] = None
        self.validation_error: Optional[str] = None
        
        # Evidence fields (ALWAYS captured, even when null)
        self.resolve_edition_detected: Optional[str] = None  # "free" | "studio" | null
        self.resolve_version_detected: Optional[str] = None
        self.proxy_profile_used: Optional[str] = None
        self.output_verified: bool = False
        self.output_file_size_bytes: Optional[int] = None
        
        # Skip metadata (populated if status="skipped")
        self.skip_reason: Optional[str] = None
        self.detected_resolve_edition: Optional[str] = None  # Legacy field for skip metadata
        self.resolve_version: Optional[str] = None  # Legacy field for skip metadata
        self.timestamp: Optional[str] = None
    
    def to_dict(self) -> dict:
        """Serialize to dictionary for JSON report."""
        # Normalize status to standard values
        normalized_status = self.status
        if self.status == "completed":
            normalized_status = "PASSED"
        elif self.status == "failed":
            normalized_status = "FAILED"
        elif self.status == "skipped":
            normalized_status = "SKIPPED"
        elif self.status == "error":
            normalized_status = "FAILED"  # Errors are failures
        
        # Extract source basename
        source_basename = Path(self.source_path).name
        
        result = {
            "test_id": self.sample_id,
            "resolve_edition_required": self.requires_resolve_edition,
            "resolve_edition_detected": self.resolve_edition_detected,
            "resolve_version_detected": self.resolve_version_detected,
            "sources": [source_basename],
            "engine_used": self.engine_used,
            "proxy_profile": self.proxy_profile_used,
            "status": normalized_status,
            "error_message": self.failure_reason or self.validation_error,
            "output_verified": self.output_verified,
            "output_file_size_bytes": self.output_file_size_bytes,
        }
        
        # Add skip metadata if test was skipped
        if self.status == "skipped":
            result["skip_metadata"] = {
                "reason": self.skip_reason,
                "detected_resolve_edition": self.detected_resolve_edition,
                "required_resolve_edition": self.requires_resolve_edition,
                "resolve_version": self.resolve_version,
                "timestamp": self.timestamp,
            }
        
        return result


# =============================================================================
# Test Runner
# =============================================================================

class ForgeTestRunner:
    """Black-box test runner for Resolve support validation."""
    
    def __init__(self, config_path: Path, dry_run: bool = False):
        self.config_path = config_path
        self.dry_run = dry_run
        self.config: dict = {}
        self.results: List[TestResult] = []
        
    def load_config(self) -> None:
        """Load test matrix configuration."""
        with open(self.config_path) as f:
            self.config = json.load(f)
        
        print(f"Loaded test suite: {self.config['test_suite']}")
        print(f"Description: {self.config['description']}")
        print(f"Samples: {len(self.config['samples'])}")
    
    def run_tests(self) -> dict:
        """
        Run all tests and return report.
        
        Returns:
            Dictionary report with results and metadata
        """
        print(f"\n{'='*60}")
        print("FORGE RESOLVE SUPPORT TEST RUNNER")
        print(f"{'='*60}\n")
        
        # Detect Resolve installation
        resolve_info = detect_resolve_installation()
        if resolve_info:
            print(f"Resolve detected: {resolve_info.edition} {resolve_info.version}")
            print(f"  Path: {resolve_info.install_path}\n")
        else:
            print("WARNING: Resolve not detected on this system\n")
        
        # Get project root
        project_root = Path(__file__).parent.parent
        output_dir = project_root / self.config['output_directory']
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # Run each test sample
        for sample_config in self.config['samples']:
            result = self._run_single_test(sample_config, output_dir)
            self.results.append(result)
        
        # Build report
        report = self._build_report(resolve_info)
        
        # Save report
        report_path = self._save_report(report)
        print(f"\nReport saved: {report_path}")
        
        # Print summary
        self._print_summary()
        
        return report
    
    def _run_single_test(
        self,
        sample_config: dict,
        output_dir: Path,
    ) -> TestResult:
        """Run a single test sample."""
        sample_id = sample_config['sample_id']
        format_name = sample_config['format']
        expected_policy = sample_config['policy']
        requires_edition = sample_config.get('requires_resolve_edition', 'either')
        
        print(f"Testing {sample_id} ({format_name})... ", end='', flush=True)
        
        # Create test result
        result = TestResult(
            sample_id=sample_id,
            format_name=format_name,
            source_path=f"forge-tests/samples/{sample_id}{sample_config['extension']}",
            expected_policy=expected_policy,
            requires_resolve_edition=requires_edition,
        )
        
        # Dry run - just validate structure
        if self.dry_run:
            result.status = "dry_run"
            print("DRY RUN")
            return result
        
        # =====================================================================
        # EDITION GATING: Check if test should be skipped
        # =====================================================================
        resolve_info = detect_resolve_installation()
        
        # ALWAYS capture Resolve evidence (even for skipped tests)
        if resolve_info:
            result.resolve_edition_detected = resolve_info.edition
            result.resolve_version_detected = resolve_info.version
        
        if requires_edition == "free" and resolve_info and resolve_info.edition == "studio":
            # Free required but Studio detected - SKIP
            result.status = "skipped"
            result.skip_reason = "resolve_free_not_installed"
            result.detected_resolve_edition = resolve_info.edition
            result.resolve_version = resolve_info.version
            result.timestamp = datetime.now(timezone.utc).isoformat()
            
            print(f"SKIPPED (Studio installed, Free required)")
            print(f"  → This test requires DaVinci Resolve Free. Resolve Studio is currently installed.")
            print(f"  → Uninstall Studio, install Resolve Free, then re-run this test to validate Free support.")
            return result
        
        if requires_edition == "studio" and resolve_info and resolve_info.edition == "free":
            # Studio required but Free detected - SKIP
            result.status = "skipped"
            result.skip_reason = "resolve_studio_not_installed"
            result.detected_resolve_edition = resolve_info.edition
            result.resolve_version = resolve_info.version
            result.timestamp = datetime.now(timezone.utc).isoformat()
            
            print(f"SKIPPED (Free installed, Studio required)")
            print(f"  → This test requires DaVinci Resolve Studio. Resolve Free is currently installed.")
            print(f"  → Upgrade to Studio, then re-run this test to validate Studio support.")
            return result
        
        # Check if sample exists
        project_root = Path(__file__).parent.parent
        sample_path = project_root / result.source_path
        
        if not sample_path.exists():
            result.status = "skipped"
            result.failure_reason = f"Sample file not found: {sample_path}"
            print(f"SKIPPED (no sample file)")
            return result
        
        # Create JobSpec
        job_id = f"test_{sample_id}_{uuid.uuid4().hex[:8]}"
        
        try:
            jobspec = JobSpec(
                job_id=job_id,
                sources=[str(sample_path)],
                codec="prores_proxy",
                container="mov",
                resolution="same",
                fps_mode="same-as-source",
                fps_value=None,
                output_directory=str(output_dir),
                naming_template=f"{sample_id}_{{source_name}}",
                proxy_profile="resolve_prores_proxy",  # Use Resolve profile for RAW
            )
            
            result.job_id = job_id
            
            # Execute job
            start_time = time.time()
            execution_result = execute_jobspec(jobspec)
            duration_ms = int((time.time() - start_time) * 1000)
            
            result.duration_ms = duration_ms
            result.status = execution_result.final_status.lower()
            result.engine_used = execution_result.engine_used
            result.validation_error = execution_result.validation_error
            result.proxy_profile_used = execution_result.proxy_profile_used
            
            # Collect outputs and verify
            for clip in execution_result.clips:
                if clip.output_exists:
                    result.output_paths.append(clip.resolved_output_path)
                    result.output_verified = True
                    result.output_file_size_bytes = clip.output_size_bytes
                if clip.failure_reason:
                    result.failure_reason = clip.failure_reason
            
            # Print result
            if execution_result.success:
                print(f"✓ COMPLETED ({duration_ms}ms)")
            else:
                print(f"✗ FAILED: {result.failure_reason or result.validation_error}")
        
        except Exception as e:
            result.status = "error"
            result.failure_reason = str(e)
            print(f"✗ ERROR: {e}")
        
        return result
    
    def _build_report(self, resolve_info: Optional[object]) -> dict:
        """Build JSON report from test results."""
        report = {
            "test_suite": self.config['test_suite'],
            "description": self.config['description'],
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "forge_version": "v2-dev5",
            "resolve_metadata": {},
            "results": []
        }
        
        # Add Resolve metadata if available
        if resolve_info:
            report["resolve_metadata"] = {
                "resolve_version": resolve_info.version,
                "resolve_edition": resolve_info.edition,
                "install_path": resolve_info.install_path,
                "detection_method": resolve_info.detection_method,
                "detection_confidence": resolve_info.detection_confidence,
            }
        else:
            report["resolve_metadata"] = {
                "resolve_version": "unknown",
                "resolve_edition": "unknown",
                "install_path": None,
                "detection_method": "none",
                "detection_confidence": "none",
            }
        
        # Add test results (sorted by sample_id for determinism)
        sorted_results = sorted(self.results, key=lambda r: r.sample_id)
        report["results"] = [r.to_dict() for r in sorted_results]
        
        # Summary statistics
        report["summary"] = {
            "total_tests": len(self.results),
            "completed": sum(1 for r in self.results if r.status == "completed"),
            "failed": sum(1 for r in self.results if r.status == "failed"),
            "blocked": sum(1 for r in self.results if r.status == "blocked"),
            "skipped": sum(1 for r in self.results if r.status == "skipped"),
            "errors": sum(1 for r in self.results if r.status == "error"),
        }
        
        # Aggregate evidence summary (facts only, no interpretation)
        report["aggregate_summary"] = self._build_aggregate_summary()
        
        return report
    
    def _build_aggregate_summary(self) -> dict:
        """
        Build aggregate summary with pure fact counts (no interpretation).
        
        Returns counts by:
        - status (PASSED/FAILED/SKIPPED)
        - engine_used
        - source_extension
        """
        from collections import Counter
        
        # Count by status (normalized)
        status_counts = Counter()
        for r in self.results:
            if r.status == "completed":
                status_counts["PASSED"] += 1
            elif r.status == "failed" or r.status == "error":
                status_counts["FAILED"] += 1
            elif r.status == "skipped":
                status_counts["SKIPPED"] += 1
        
        # Count by engine
        engine_counts = Counter()
        for r in self.results:
            engine = r.engine_used or "null"
            engine_counts[engine] += 1
        
        # Count by source extension
        extension_counts = Counter()
        for r in self.results:
            ext = Path(r.source_path).suffix.lower()
            if ext:
                extension_counts[ext] += 1
            else:
                extension_counts["no_extension"] += 1
        
        return {
            "by_status": dict(sorted(status_counts.items())),
            "by_engine": dict(sorted(engine_counts.items())),
            "by_source_extension": dict(sorted(extension_counts.items())),
        }
    
    def _save_report(self, report: dict) -> Path:
        """Save report to JSON file."""
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        edition = report["resolve_metadata"]["resolve_edition"]
        
        filename = f"test_report_{edition}_{timestamp}.json"
        report_path = Path(__file__).parent / "reports" / filename
        
        with open(report_path, 'w') as f:
            json.dump(report, f, indent=2, sort_keys=False)
        
        return report_path
    
    def _print_summary(self) -> None:
        """Print test run summary."""
        print(f"\n{'='*60}")
        print("TEST SUMMARY")
        print(f"{'='*60}")
        
        total = len(self.results)
        completed = sum(1 for r in self.results if r.status == "completed")
        failed = sum(1 for r in self.results if r.status == "failed")
        skipped = sum(1 for r in self.results if r.status == "skipped")
        
        print(f"Total: {total}")
        print(f"Completed: {completed}")
        print(f"Failed: {failed}")
        print(f"Skipped: {skipped}")
        print(f"{'='*60}\n")


# =============================================================================
# CLI Entry Point
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Forge black-box test runner for Resolve support validation",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--config",
        type=Path,
        required=True,
        help="Path to test matrix configuration JSON",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate configuration without running actual tests",
    )
    
    args = parser.parse_args()
    
    if not args.config.exists():
        print(f"ERROR: Config file not found: {args.config}")
        sys.exit(1)
    
    # Run tests
    runner = ForgeTestRunner(args.config, dry_run=args.dry_run)
    runner.load_config()
    report = runner.run_tests()
    
    # Exit with appropriate code
    if report["summary"]["failed"] > 0 or report["summary"]["errors"] > 0:
        sys.exit(1)
    else:
        sys.exit(0)


if __name__ == "__main__":
    main()
