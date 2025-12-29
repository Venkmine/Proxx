#!/usr/bin/env python3
"""
Fabric Snapshot CLI - Minimal read-only operator utility.

PHASE-2: SNAPSHOT & DIFF OPERATOR UTILITY (READ-ONLY)

This script provides a minimal CLI for creating snapshots and diffing them.
It is PURELY OBSERVATIONAL - no execution logic, no persistence, no interpretation.

Commands:
  snapshot              Print snapshot JSON to stdout
  diff <a.json> <b.json>  Print diff JSON to stdout

Exit Codes:
  0 - Success
  1 - Invalid input (missing files, malformed JSON, etc.)
  2 - Diff error (snapshot computation failed)

ABSOLUTE CONSTRAINTS:
---------------------
❌ NO file writes
❌ NO defaults
❌ NO implicit paths
❌ NO execution logic
❌ NO background processes
❌ NO heuristics
✅ Read-only operations ONLY
✅ Explicit paths required
✅ JSON output to stdout
✅ Clear error messages

WARNING: This is an observational utility only.
Snapshots have NO operational meaning.
"""

import argparse
import json
import sys
from pathlib import Path

from fabric.intelligence import FabricIntelligence
from fabric.persistence import open_fabric_database
from fabric.utils.snapshot_cli import (
    SnapshotCLIError,
    create_snapshot_json,
    diff_snapshot_json,
)


def cmd_snapshot(db_path: str) -> int:
    """
    Create snapshot from current Fabric state and print to stdout.
    
    Args:
        db_path: Path to Fabric database
    
    Returns:
        Exit code (0 = success, 1 = error)
    """
    try:
        # Validate database path
        if not Path(db_path).exists():
            print(f"Error: Database not found: {db_path}", file=sys.stderr)
            return 1
        
        # Open database and create intelligence
        db = open_fabric_database(db_path)
        intelligence = FabricIntelligence(db)
        
        # Create snapshot
        snapshot = create_snapshot_json(intelligence)
        
        # Print to stdout as JSON
        print(json.dumps(snapshot, indent=2, sort_keys=True))
        return 0
        
    except SnapshotCLIError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"Unexpected error: {e}", file=sys.stderr)
        return 1


def cmd_diff(snapshot_a_path: str, snapshot_b_path: str) -> int:
    """
    Compute diff between two snapshot JSON files and print to stdout.
    
    Args:
        snapshot_a_path: Path to first snapshot JSON file (from)
        snapshot_b_path: Path to second snapshot JSON file (to)
    
    Returns:
        Exit code (0 = success, 1 = invalid input, 2 = diff error)
    """
    try:
        # Validate paths
        path_a = Path(snapshot_a_path)
        path_b = Path(snapshot_b_path)
        
        if not path_a.exists():
            print(f"Error: Snapshot file not found: {snapshot_a_path}", file=sys.stderr)
            return 1
        
        if not path_b.exists():
            print(f"Error: Snapshot file not found: {snapshot_b_path}", file=sys.stderr)
            return 1
        
        # Load snapshots
        try:
            with open(path_a, "r") as f:
                snapshot_a = json.load(f)
        except json.JSONDecodeError as e:
            print(f"Error: Invalid JSON in {snapshot_a_path}: {e}", file=sys.stderr)
            return 1
        
        try:
            with open(path_b, "r") as f:
                snapshot_b = json.load(f)
        except json.JSONDecodeError as e:
            print(f"Error: Invalid JSON in {snapshot_b_path}: {e}", file=sys.stderr)
            return 1
        
        # Compute diff
        diff = diff_snapshot_json(snapshot_a, snapshot_b)
        
        # Print to stdout as JSON
        print(json.dumps(diff, indent=2, sort_keys=True))
        return 0
        
    except SnapshotCLIError as e:
        print(f"Diff error: {e}", file=sys.stderr)
        return 2
    except Exception as e:
        print(f"Unexpected error: {e}", file=sys.stderr)
        return 2


def main() -> int:
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Fabric Snapshot CLI - Read-only snapshot and diff utility",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Create snapshot from current Fabric state
  python scripts/fabric_snapshot.py snapshot /path/to/fabric.db > snapshot.json
  
  # Diff two snapshots
  python scripts/fabric_snapshot.py diff snapshot_a.json snapshot_b.json > diff.json

Exit Codes:
  0 - Success
  1 - Invalid input
  2 - Diff error

WARNING: This is an observational utility only. Snapshots have NO operational meaning.
        """
    )
    
    subparsers = parser.add_subparsers(dest="command", required=True, help="Command to execute")
    
    # Snapshot command
    snapshot_parser = subparsers.add_parser(
        "snapshot",
        help="Create snapshot from current Fabric state"
    )
    snapshot_parser.add_argument(
        "db_path",
        help="Path to Fabric database"
    )
    
    # Diff command
    diff_parser = subparsers.add_parser(
        "diff",
        help="Compute diff between two snapshots"
    )
    diff_parser.add_argument(
        "snapshot_a",
        help="Path to first snapshot JSON file (from)"
    )
    diff_parser.add_argument(
        "snapshot_b",
        help="Path to second snapshot JSON file (to)"
    )
    
    args = parser.parse_args()
    
    # Execute command
    if args.command == "snapshot":
        return cmd_snapshot(args.db_path)
    elif args.command == "diff":
        return cmd_diff(args.snapshot_a, args.snapshot_b)
    else:
        parser.print_help()
        return 1


if __name__ == "__main__":
    sys.exit(main())
