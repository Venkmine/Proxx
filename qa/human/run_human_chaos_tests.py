#!/usr/bin/env python3
"""
Human Chaos Test Runner - Interactive verification with human-in-the-loop.

This script guides an operator through chaos tests that require physical
intervention. It waits indefinitely for human confirmation at each step.

NO AUTOMATION COSPLAY. NO TIMEOUTS. NO ASSUMPTIONS.

Usage:
    python run_human_chaos_tests.py [--output-dir PATH]

Part of Forge Verification System.
"""

import sys
import json
import argparse
from pathlib import Path
from datetime import datetime
from dataclasses import dataclass, asdict
from typing import List, Optional
from enum import Enum


# =============================================================================
# Test Result Types
# =============================================================================

class TestResult(str, Enum):
    """Human test result - explicit states only."""
    PASS = "PASS"
    FAIL = "FAIL"
    SKIPPED = "SKIPPED"
    NOT_RUN = "NOT_RUN"


@dataclass
class ChaosTestResult:
    """Result of a single chaos test."""
    test_id: str
    test_name: str
    result: TestResult
    notes: str
    timestamp: str
    duration_minutes: float


@dataclass
class ChaosTestSession:
    """Complete chaos test session."""
    session_id: str
    operator_name: str
    forge_version: str
    os_version: str
    start_time: str
    end_time: Optional[str]
    results: List[ChaosTestResult]
    
    @property
    def passed_count(self) -> int:
        return sum(1 for r in self.results if r.result == TestResult.PASS)
    
    @property
    def failed_count(self) -> int:
        return sum(1 for r in self.results if r.result == TestResult.FAIL)
    
    @property
    def total_count(self) -> int:
        return len(self.results)


# =============================================================================
# Chaos Test Definitions
# =============================================================================

CHAOS_TESTS = [
    {
        "id": "HC-01",
        "name": "Disconnect source drive mid-encode",
        "category": "Storage Failure",
        "purpose": "Verify that Forge fails cleanly when source media becomes unavailable during encoding.",
        "preconditions": [
            "External drive connected with source video files",
            "Forge is NOT running",
            "No Resolve or FFmpeg processes running",
            "Output directory is on local (non-removable) storage",
        ],
        "steps": [
            "Connect external drive with at least 3 video files (100MB+ each)",
            "Start a Forge job using these files as sources",
            "Wait until progress shows at least 1 file completed",
            "While encoding is in progress: PHYSICALLY DISCONNECT the external drive",
            "Observe Forge's response",
        ],
        "expected": [
            "Forge detects source unavailability within 30 seconds",
            "Forge reports which specific file(s) became unavailable",
            "Forge does NOT report the job as successful",
            "Forge does NOT leave orphaned/corrupt output files without warning",
            "Any completed files remain intact with correct metadata",
            "Job status reflects partial failure (not success)",
        ],
        "fail_conditions": [
            "Forge reports 'Success' or 'Complete'",
            "Forge hangs indefinitely",
            "Forge crashes without error message",
            "Corrupt output files are created without warning",
            "Error message does not identify the missing source",
        ],
    },
    {
        "id": "HC-02",
        "name": "Make output directory read-only mid-job",
        "category": "Permissions",
        "purpose": "Verify that Forge fails cleanly when write permissions are revoked during encoding.",
        "preconditions": [
            "Output directory exists with write permissions",
            "Source files are on local (reliable) storage",
            "Forge is NOT running",
            "Terminal access available to change permissions",
        ],
        "steps": [
            "Create output directory: mkdir -p /tmp/forge_test_output",
            "Verify writable: touch /tmp/forge_test_output/test && rm /tmp/forge_test_output/test",
            "Start Forge job with multiple source files (at least 5)",
            "Wait until at least 1 file is being written",
            "In separate terminal: chmod 000 /tmp/forge_test_output",
            "Observe Forge's response",
            "After test: chmod 755 /tmp/forge_test_output to cleanup",
        ],
        "expected": [
            "Forge detects write failure within 10 seconds",
            "Forge reports permission denied error clearly",
            "Forge stops processing new files",
            "Forge does NOT report job as successful",
            "Already-completed files (before chmod) are reported accurately",
            "Job status shows partial failure",
        ],
        "fail_conditions": [
            "Forge reports 'Success'",
            "Forge continues attempting to write indefinitely",
            "Forge crashes without cleanup",
            "Progress percentage increases despite failed writes",
            "Error message is generic ('Unknown error')",
        ],
    },
    {
        "id": "HC-03",
        "name": "Kill Resolve process during render",
        "category": "Process Failure",
        "purpose": "Verify that Forge handles unexpected Resolve termination gracefully.",
        "preconditions": [
            "DaVinci Resolve Studio is installed",
            "Source files require Resolve (BRAW, R3D, or ProRes RAW)",
            "Forge is NOT running",
            "Resolve is NOT running",
        ],
        "steps": [
            "Prepare at least 3 RAW format source files",
            "Start Forge job with these sources (will trigger Resolve engine)",
            "Wait until Resolve is launched and rendering begins",
            "Confirm render progress is non-zero",
            "In terminal: pkill -9 -f 'DaVinci Resolve'",
            "Observe Forge's response",
        ],
        "expected": [
            "Forge detects Resolve termination within 30 seconds",
            "Forge reports engine failure clearly",
            "Forge identifies which file was being processed",
            "Forge does NOT report job as successful",
            "Forge does NOT automatically restart Resolve",
            "Job can be retried after manual recovery",
        ],
        "fail_conditions": [
            "Forge reports 'Success'",
            "Forge hangs waiting for Resolve indefinitely",
            "Forge silently restarts Resolve and continues",
            "Forge crashes without error reporting",
            "Partial output file is marked as complete",
        ],
    },
    {
        "id": "HC-04",
        "name": "Kill FFmpeg process during encode",
        "category": "Process Failure",
        "purpose": "Verify that Forge handles unexpected FFmpeg termination gracefully.",
        "preconditions": [
            "FFmpeg is installed",
            "Source files are standard formats (H.264, ProRes)",
            "Forge is NOT running",
            "No FFmpeg processes running",
        ],
        "steps": [
            "Prepare at least 3 standard video files (H.264/ProRes, 100MB+ each)",
            "Start Forge job with these sources (will trigger FFmpeg engine)",
            "Wait until FFmpeg is actively encoding (check with: ps aux | grep ffmpeg)",
            "Note which file is being processed",
            "In terminal: pkill -9 ffmpeg",
            "Observe Forge's response",
        ],
        "expected": [
            "Forge detects FFmpeg termination within 10 seconds",
            "Forge reports encoding failure clearly",
            "Forge identifies which file was being processed",
            "Forge does NOT report job as successful",
            "Partial output file is removed or marked as incomplete",
            "Other files in job are handled according to defined policy",
        ],
        "fail_conditions": [
            "Forge reports 'Success'",
            "Forge hangs indefinitely",
            "Partial file is marked as complete",
            "Forge silently restarts and continues without acknowledgment",
            "Error message doesn't identify the failed file",
        ],
    },
    {
        "id": "HC-05",
        "name": "Eject SD card during ingest",
        "category": "Storage Removal",
        "purpose": "Verify that Forge handles sudden media removal during source reading.",
        "preconditions": [
            "SD card reader available",
            "SD card with video files (at least 5 files, 50MB+ each)",
            "Forge is NOT running",
            "Output directory on local storage",
        ],
        "steps": [
            "Insert SD card and verify files are accessible",
            "Start Forge job with all SD card files as sources",
            "Wait until at least 1 file is being processed",
            "PHYSICALLY EJECT SD card (do NOT use safe eject)",
            "Observe Forge's response",
        ],
        "expected": [
            "Forge detects source unavailability within 30 seconds",
            "Forge reports I/O error or source missing",
            "Forge stops attempting to read from missing source",
            "Forge does NOT report job as successful",
            "Already-processed files (if any) are reported correctly",
            "Clear distinction between completed and failed files",
        ],
        "fail_conditions": [
            "Forge reports 'Success'",
            "Forge hangs with spinning progress",
            "Forge crashes without error state",
            "Error message says '0 files failed'",
            "Forge attempts infinite retry on missing media",
        ],
    },
    {
        "id": "HC-06",
        "name": "Network share disappears mid-job",
        "category": "Network Failure",
        "purpose": "Verify that Forge handles network storage failures gracefully.",
        "preconditions": [
            "Network share mounted (NFS, SMB, or AFP)",
            "Source files on network share (at least 3 files, 100MB+ each)",
            "Output directory on local storage",
            "Network share control (can disconnect)",
            "Forge is NOT running",
        ],
        "steps": [
            "Mount network share and verify source files accessible",
            "Start Forge job with network-stored source files",
            "Wait until at least 1 file is being processed",
            "DISCONNECT network share (unplug cable, disable WiFi, or unmount)",
            "Observe Forge's response",
            "After test: Reconnect network (do NOT let Forge auto-recover)",
        ],
        "expected": [
            "Forge detects network failure within 60 seconds",
            "Forge reports network/I/O error clearly",
            "Forge does NOT report job as successful",
            "Forge does NOT hang waiting for network indefinitely",
            "Job state is recoverable after network restoration",
            "No data corruption on reconnection",
        ],
        "fail_conditions": [
            "Forge reports 'Success'",
            "Forge hangs for more than 2 minutes",
            "Forge crashes without saving state",
            "Forge auto-retries indefinitely without user notification",
            "Progress bar shows false progress",
        ],
    },
    {
        "id": "HC-07",
        "name": "Machine sleeps during job",
        "category": "System State",
        "purpose": "Verify that Forge handles system sleep/wake gracefully.",
        "preconditions": [
            "System sleep NOT disabled",
            "Source files on local storage",
            "Forge is NOT running",
            "Job expected duration: at least 5 minutes",
        ],
        "steps": [
            "Start Forge job with enough files to take 5+ minutes",
            "Wait until job is actively processing (25-50% progress)",
            "PUT MACHINE TO SLEEP (close laptop lid or Apple menu → Sleep)",
            "Wait 60 seconds",
            "WAKE MACHINE (open lid or press key)",
            "Observe Forge's response",
        ],
        "expected": [
            "Forge detects wake and resumes OR reports interruption",
            "If resumed: job continues from reasonable checkpoint",
            "If failed: clear message about sleep interruption",
            "No silent data corruption",
            "Progress reporting accurate after wake",
            "No duplicate processing of completed files",
        ],
        "fail_conditions": [
            "Forge reports 'Success' but files are missing/corrupt",
            "Forge hangs indefinitely after wake",
            "Progress percentage is inconsistent with actual state",
            "Forge reprocesses already-completed files without notification",
            "Job state becomes unrecoverable",
        ],
    },
    {
        "id": "HC-08",
        "name": "Resolve launched manually before job start",
        "category": "Resource Conflict",
        "purpose": "Verify that Forge detects Resolve already running and fails cleanly.",
        "preconditions": [
            "DaVinci Resolve installed",
            "RAW source files available (BRAW, R3D, etc.)",
            "Forge is NOT running",
        ],
        "steps": [
            "Launch DaVinci Resolve manually",
            "Wait until Resolve is fully loaded (project browser visible)",
            "Start Forge job with RAW source files",
            "Observe Forge's response BEFORE any encoding begins",
        ],
        "expected": [
            "Forge detects Resolve is running BEFORE starting job",
            "Forge reports clear error about Resolve conflict",
            "Forge does NOT attempt to start second Resolve instance",
            "Forge does NOT begin any encoding",
            "Error message tells user to close Resolve",
            "No partial job state created",
        ],
        "fail_conditions": [
            "Forge begins encoding despite Resolve running",
            "Forge crashes Resolve",
            "Forge starts second Resolve instance",
            "Error message is unclear ('Unknown error')",
            "Forge hangs without error",
            "Job appears to start but produces no output",
        ],
    },
]


# =============================================================================
# Console Helpers
# =============================================================================

def print_header(text: str):
    """Print a section header."""
    width = 70
    print()
    print("=" * width)
    print(text.center(width))
    print("=" * width)
    print()


def print_subheader(text: str):
    """Print a subsection header."""
    print()
    print("-" * 50)
    print(f"  {text}")
    print("-" * 50)


def print_list(items: List[str], prefix: str = "•"):
    """Print a bulleted list."""
    for item in items:
        print(f"  {prefix} {item}")


def wait_for_confirmation(prompt: str) -> str:
    """Wait for user input. No timeout. No default."""
    print()
    print(f">>> {prompt}")
    print()
    return input("    Your response: ").strip()


def get_result_input() -> tuple:
    """
    Get test result from operator.
    
    Returns:
        Tuple of (TestResult, notes)
    """
    print()
    print("=" * 50)
    print("  RECORD YOUR RESULT")
    print("=" * 50)
    print()
    print("  Enter one of:")
    print("    PASS     - All expected behaviors observed")
    print("    FAIL     - Any fail condition observed")
    print("    SKIP     - Could not complete test (explain why)")
    print()
    
    while True:
        response = input("  Result (PASS/FAIL/SKIP): ").strip().upper()
        
        if response in ("PASS", "FAIL", "SKIP"):
            break
        
        print("  Invalid response. Enter PASS, FAIL, or SKIP.")
    
    # Get notes
    print()
    print("  Enter any notes (press Enter twice when done):")
    notes_lines = []
    while True:
        line = input("  > ")
        if line == "":
            if notes_lines:
                break
            continue
        notes_lines.append(line)
    
    notes = "\n".join(notes_lines)
    
    if response == "PASS":
        return (TestResult.PASS, notes)
    elif response == "FAIL":
        return (TestResult.FAIL, notes)
    else:
        return (TestResult.SKIPPED, notes)


# =============================================================================
# Test Runner
# =============================================================================

def run_chaos_test(test: dict) -> ChaosTestResult:
    """
    Run a single chaos test with human interaction.
    
    Args:
        test: Test definition dictionary
        
    Returns:
        ChaosTestResult with operator's recorded result
    """
    start_time = datetime.now()
    
    print_header(f"{test['id']}: {test['name']}")
    
    # Purpose
    print(f"PURPOSE: {test['purpose']}")
    print()
    
    # Preconditions
    print_subheader("PRECONDITIONS (verify before proceeding)")
    print_list(test['preconditions'], prefix="[ ]")
    
    # Wait for precondition confirmation
    wait_for_confirmation("Have you verified ALL preconditions? (type 'yes' to continue)")
    
    # Steps
    print_subheader("STEPS TO EXECUTE")
    for i, step in enumerate(test['steps'], 1):
        print(f"  {i}. {step}")
    
    print()
    print("  ⚠️  DO NOT CONTINUE until you have completed ALL steps.")
    print()
    
    wait_for_confirmation("Type 'done' when you have completed all steps")
    
    # Expected behavior
    print_subheader("EXPECTED BEHAVIOR (verify each)")
    print_list(test['expected'], prefix="[ ]")
    
    # Fail conditions
    print_subheader("FAIL CONDITIONS (if ANY occurred, test FAILS)")
    print_list(test['fail_conditions'], prefix="❌")
    
    # Get result
    result, notes = get_result_input()
    
    end_time = datetime.now()
    duration = (end_time - start_time).total_seconds() / 60
    
    return ChaosTestResult(
        test_id=test['id'],
        test_name=test['name'],
        result=result,
        notes=notes,
        timestamp=end_time.isoformat(),
        duration_minutes=round(duration, 1),
    )


def run_all_tests(output_dir: Path) -> ChaosTestSession:
    """
    Run all chaos tests interactively.
    
    Args:
        output_dir: Directory to save results
        
    Returns:
        ChaosTestSession with all results
    """
    print_header("FORGE HUMAN CHAOS TEST RUNNER")
    
    print("This runner will guide you through chaos tests that require")
    print("physical intervention. Each test will:")
    print()
    print("  1. Display purpose and preconditions")
    print("  2. Wait for you to verify preconditions")
    print("  3. Display steps to execute")
    print("  4. Wait for you to complete steps")
    print("  5. Ask you to record PASS or FAIL")
    print()
    print("There are NO timeouts. Take as long as needed.")
    print("There are NO assumptions. You decide the result.")
    print()
    
    # Session info
    print_subheader("SESSION INFORMATION")
    
    operator = input("  Operator name: ").strip() or "Unknown"
    forge_version = input("  Forge version: ").strip() or "Unknown"
    
    import platform
    os_version = f"{platform.system()} {platform.release()}"
    
    session = ChaosTestSession(
        session_id=datetime.now().strftime("%Y%m%d_%H%M%S"),
        operator_name=operator,
        forge_version=forge_version,
        os_version=os_version,
        start_time=datetime.now().isoformat(),
        end_time=None,
        results=[],
    )
    
    print()
    print(f"  OS detected: {os_version}")
    print(f"  Session ID: {session.session_id}")
    print()
    
    # Confirm start
    wait_for_confirmation("Type 'start' to begin chaos tests")
    
    # Run each test
    for i, test in enumerate(CHAOS_TESTS, 1):
        print()
        print(f"  Test {i} of {len(CHAOS_TESTS)}")
        
        result = run_chaos_test(test)
        session.results.append(result)
        
        # Save after each test (in case of crash)
        save_session(session, output_dir)
        
        if i < len(CHAOS_TESTS):
            print()
            response = wait_for_confirmation(
                "Continue to next test? (type 'next' or 'quit')"
            )
            if response.lower() == 'quit':
                print("  Session ended by operator.")
                break
    
    session.end_time = datetime.now().isoformat()
    save_session(session, output_dir)
    
    return session


def save_session(session: ChaosTestSession, output_dir: Path):
    """Save session to files."""
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Save JSON
    json_path = output_dir / f"human_chaos_session_{session.session_id}.json"
    with open(json_path, 'w') as f:
        json.dump(asdict(session), f, indent=2)
    
    # Save markdown summary
    md_path = output_dir / f"human_chaos_results_{session.session_id}.md"
    with open(md_path, 'w') as f:
        f.write(generate_markdown_report(session))


def generate_markdown_report(session: ChaosTestSession) -> str:
    """Generate markdown report from session."""
    lines = [
        "# Human Chaos Test Results",
        "",
        "## Session Information",
        "",
        f"- **Session ID**: {session.session_id}",
        f"- **Operator**: {session.operator_name}",
        f"- **Forge Version**: {session.forge_version}",
        f"- **OS Version**: {session.os_version}",
        f"- **Start Time**: {session.start_time}",
        f"- **End Time**: {session.end_time or 'In progress'}",
        "",
        "## Summary",
        "",
        f"- **Total Tests**: {session.total_count}",
        f"- **Passed**: {session.passed_count}",
        f"- **Failed**: {session.failed_count}",
        f"- **Skipped**: {sum(1 for r in session.results if r.result == TestResult.SKIPPED)}",
        "",
    ]
    
    # Credibility assessment
    if session.failed_count == 0 and session.passed_count == len(CHAOS_TESTS):
        credibility = "**YES** - All chaos tests passed"
    elif session.failed_count > 0:
        credibility = f"**NO** - {session.failed_count} chaos test(s) failed"
    else:
        credibility = "**INCOMPLETE** - Not all tests were run"
    
    lines.extend([
        f"**Forge is credible for real-world use**: {credibility}",
        "",
        "## Detailed Results",
        "",
    ])
    
    for result in session.results:
        status_emoji = {
            TestResult.PASS: "✅",
            TestResult.FAIL: "❌",
            TestResult.SKIPPED: "⏭️",
            TestResult.NOT_RUN: "⬜",
        }.get(result.result, "?")
        
        lines.extend([
            f"### {result.test_id}: {result.test_name}",
            "",
            f"**Result**: {status_emoji} {result.result.value}",
            f"**Duration**: {result.duration_minutes} minutes",
            f"**Timestamp**: {result.timestamp}",
            "",
        ])
        
        if result.notes:
            lines.extend([
                "**Notes**:",
                "```",
                result.notes,
                "```",
                "",
            ])
    
    return "\n".join(lines)


def print_summary(session: ChaosTestSession):
    """Print final summary to console."""
    print_header("CHAOS TEST SESSION COMPLETE")
    
    print(f"  Session ID: {session.session_id}")
    print(f"  Operator: {session.operator_name}")
    print()
    print(f"  Results:")
    print(f"    PASS:    {session.passed_count}")
    print(f"    FAIL:    {session.failed_count}")
    print(f"    SKIPPED: {sum(1 for r in session.results if r.result == TestResult.SKIPPED)}")
    print()
    
    if session.failed_count == 0 and session.passed_count == len(CHAOS_TESTS):
        print("  ✅ Forge is CREDIBLE for real-world use")
    elif session.failed_count > 0:
        print("  ❌ Forge is NOT credible for real-world use")
        print()
        print("  Failed tests:")
        for r in session.results:
            if r.result == TestResult.FAIL:
                print(f"    - {r.test_id}: {r.test_name}")
    else:
        print("  ⚠️  INCOMPLETE - Not all tests were run")
    
    print()


# =============================================================================
# Main
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Run human chaos tests for Forge verification"
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("artifacts/verification_run"),
        help="Directory to save results",
    )
    
    args = parser.parse_args()
    
    # Add timestamp to output dir
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_dir = args.output_dir.parent / f"{args.output_dir.name}_{timestamp}"
    
    try:
        session = run_all_tests(output_dir)
        print_summary(session)
        
        print(f"  Results saved to: {output_dir}")
        print()
        
        # Exit code based on results
        if session.failed_count > 0:
            sys.exit(1)
        
    except KeyboardInterrupt:
        print()
        print("  Session interrupted by operator.")
        sys.exit(1)


if __name__ == "__main__":
    main()
