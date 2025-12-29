#!/usr/bin/env python3
"""
Proxx V2 CLI - Thin entrypoint for operator commands.

This module provides a minimal CLI interface for Proxx V2 operations:
- Validate JobSpec JSON files
- Execute JobSpec files
- Run watch folder mode

Design Principles:
==================
- CLI is a dispatcher only
- No execution logic inside CLI
- Surface errors verbatim from execution layer
- Exit non-zero on failure
- No interactive prompts
- No smart defaults
- No retry logic
- No hidden environment inference

Exit Codes:
===========
- 0: Success
- 1: Validation error
- 2: Execution error
- 3: Partial completion
- 4: System error (file not found, permissions, etc.)

Part of V2 IMPLEMENTATION SLICE 6 (Operator Entrypoints and Packaging)
"""

import argparse
import json
import sys
from pathlib import Path
from typing import NoReturn

# Setup path for backend module imports
import sys
from pathlib import Path as _Path

# Add backend directory to path if not already there
_backend_dir = _Path(__file__).parent.resolve()
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))

# Import V2 execution components
try:
    from job_spec import JobSpec, JobSpecValidationError, JOBSPEC_VERSION
    from execution_adapter import execute_jobspec
    from execution_results import JobExecutionResult
    from v2.watch_folder_runner import run_watch_loop
except ImportError as e:
    print(f"FATAL: Failed to import Proxx V2 modules: {e}", file=sys.stderr)
    print("Ensure you are running from the project root with dependencies installed.", file=sys.stderr)
    sys.exit(4)


def _load_jobspec(jobspec_path: Path) -> JobSpec:
    """
    Load and parse JobSpec JSON from file.
    
    Args:
        jobspec_path: Path to JobSpec JSON file
        
    Returns:
        Parsed JobSpec instance
        
    Raises:
        SystemExit(4): File not found, invalid JSON, or schema error
    """
    if not jobspec_path.exists():
        print(f"ERROR: JobSpec file not found: {jobspec_path}", file=sys.stderr)
        sys.exit(4)
    
    try:
        with open(jobspec_path, 'r') as f:
            jobspec_data = json.load(f)
    except json.JSONDecodeError as e:
        print(f"ERROR: Invalid JSON in {jobspec_path}: {e}", file=sys.stderr)
        sys.exit(4)
    
    try:
        jobspec = JobSpec.from_dict(jobspec_data)
    except (KeyError, ValueError, TypeError) as e:
        print(f"ERROR: Invalid JobSpec schema in {jobspec_path}: {e}", file=sys.stderr)
        sys.exit(4)
    
    return jobspec


def cmd_validate(args: argparse.Namespace) -> NoReturn:
    """
    Validate a JobSpec JSON file.
    
    Runs all validation checks without executing the job.
    
    Exit codes:
        0: JobSpec is valid
        1: Validation error
        4: File not found or JSON parse error
    """
    jobspec_path = Path(args.jobspec).resolve()
    
    # Load JobSpec
    jobspec = _load_jobspec(jobspec_path)
    
    # Validate
    try:
        jobspec.validate(check_paths=True)
        print(f"✓ JobSpec is valid: {jobspec_path}")
        print(f"  Sources: {len(jobspec.sources)}")
        print(f"  Output: {jobspec.output_dir}")
        print(f"  Profile: {jobspec.proxy_profile}")
        sys.exit(0)
    except JobSpecValidationError as e:
        print(f"✗ JobSpec validation failed: {e}", file=sys.stderr)
        sys.exit(1)


def cmd_run(args: argparse.Namespace) -> NoReturn:
    """
    Execute a JobSpec JSON file.
    
    Validates and executes the job, writing result JSON to stdout.
    
    Exit codes:
        0: Success (all clips completed)
        1: Validation error
        2: Execution error
        3: Partial completion
        4: File not found or JSON parse error
    """
    jobspec_path = Path(args.jobspec).resolve()
    
    # Load JobSpec
    jobspec = _load_jobspec(jobspec_path)
    
    # Execute
    result: JobExecutionResult = execute_jobspec(jobspec)
    
    # Write result JSON to stdout
    result_json = result.to_json()
    print(result_json)
    
    # Determine exit code based on result status
    if result.status == "COMPLETED":
        sys.exit(0)
    elif result.validation_error is not None:
        sys.exit(1)
    elif result.status == "PARTIAL":
        sys.exit(3)
    else:  # FAILED
        sys.exit(2)


def cmd_watch(args: argparse.Namespace) -> NoReturn:
    """
    Run watch folder mode.
    
    Watches a folder for pending JobSpecs and processes them.
    
    Exit codes:
        0: Shutdown via signal (normal)
        1: Fatal error (watch folder invalid, permissions, etc.)
    """
    watch_folder = Path(args.folder).resolve()
    
    # Validate watch folder exists
    if not watch_folder.exists():
        print(f"ERROR: Watch folder not found: {watch_folder}", file=sys.stderr)
        sys.exit(1)
    
    if not watch_folder.is_dir():
        print(f"ERROR: Watch folder path is not a directory: {watch_folder}", file=sys.stderr)
        sys.exit(1)
    
    # Extract arguments
    poll_seconds = args.poll_seconds
    max_workers = args.max_workers
    run_once = args.once
    
    # Validate arguments
    if poll_seconds is not None and poll_seconds <= 0:
        print(f"ERROR: --poll-seconds must be positive: {poll_seconds}", file=sys.stderr)
        sys.exit(1)
    
    if max_workers <= 0:
        print(f"ERROR: --max-workers must be positive: {max_workers}", file=sys.stderr)
        sys.exit(1)
    
    # Run watch folder
    try:
        exit_code = run_watch_loop(
            watch_folder=watch_folder,
            poll_seconds=poll_seconds,
            max_workers=max_workers,
            run_once=run_once
        )
        sys.exit(exit_code)
    except KeyboardInterrupt:
        print("\nWatch folder runner stopped by user.", file=sys.stderr)
        sys.exit(0)
    except Exception as e:
        print(f"FATAL: Watch folder runner error: {e}", file=sys.stderr)
        sys.exit(1)


def main() -> NoReturn:
    """
    Main CLI entrypoint.
    
    Parses arguments and dispatches to subcommands.
    """
    parser = argparse.ArgumentParser(
        prog='proxx',
        description='Proxx V2 - Deterministic media proxy generation',
        epilog='See docs/V2_OPERATOR_RUNBOOK.md for detailed usage.'
    )
    
    subparsers = parser.add_subparsers(dest='command', required=True, help='Command to execute')
    
    # Validate command
    parser_validate = subparsers.add_parser(
        'validate',
        help='Validate a JobSpec JSON file without executing it'
    )
    parser_validate.add_argument(
        'jobspec',
        help='Path to JobSpec JSON file'
    )
    parser_validate.set_defaults(func=cmd_validate)
    
    # Run command
    parser_run = subparsers.add_parser(
        'run',
        help='Execute a JobSpec JSON file'
    )
    parser_run.add_argument(
        'jobspec',
        help='Path to JobSpec JSON file'
    )
    parser_run.set_defaults(func=cmd_run)
    
    # Watch command
    parser_watch = subparsers.add_parser(
        'watch',
        help='Run watch folder mode'
    )
    parser_watch.add_argument(
        'folder',
        help='Path to watch folder root'
    )
    parser_watch.add_argument(
        '--poll-seconds',
        type=float,
        default=None,
        help='Poll interval in seconds (default: instant processing with inotify/fsevents)'
    )
    parser_watch.add_argument(
        '--max-workers',
        type=int,
        default=1,
        help='Maximum number of concurrent jobs (default: 1)'
    )
    parser_watch.add_argument(
        '--once',
        action='store_true',
        help='Process pending jobs once and exit (no continuous watching)'
    )
    parser_watch.set_defaults(func=cmd_watch)
    
    # Parse and dispatch
    args = parser.parse_args()
    args.func(args)


if __name__ == '__main__':
    main()
