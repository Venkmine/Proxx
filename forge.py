#!/usr/bin/env python3
"""
Forge - Primary Entrypoint

This is the ONE command to start Forge.

Usage:
    python forge.py              # Run readiness check and start Forge
    python forge.py --check      # Run readiness check only
    python forge.py --json       # Output readiness as JSON
    python forge.py --version    # Print version only

Exit Codes:
    0: Ready and started (or check passed)
    1: Not ready (blocking issues)
    2: Runtime error

Part of IMPLEMENTATION SLICE 6: Operator Entrypoints and Packaging.
"""

import argparse
import os
import subprocess
import sys
from pathlib import Path

# =============================================================================
# Path Setup
# =============================================================================

# Ensure we can import from backend
FORGE_ROOT = Path(__file__).parent.resolve()
BACKEND_DIR = FORGE_ROOT / "backend"

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Change to Forge root for consistent relative paths
os.chdir(FORGE_ROOT)


# =============================================================================
# Version
# =============================================================================

def get_version() -> str:
    """Read version from VERSION file."""
    version_file = FORGE_ROOT / "VERSION"
    if version_file.exists():
        return version_file.read_text().strip()
    return "unknown"


# =============================================================================
# Readiness Check
# =============================================================================

def run_readiness_check(output_json: bool = False) -> tuple[bool, str]:
    """
    Run all readiness checks and return result.
    
    Args:
        output_json: If True, return JSON format instead of terminal format
        
    Returns:
        Tuple of (is_ready, formatted_output)
    """
    try:
        from readiness import generate_readiness_report, format_readiness_terminal
        
        report = generate_readiness_report()
        
        if output_json:
            return report.ready, report.to_json()
        else:
            return report.ready, format_readiness_terminal(report)
    except ImportError as e:
        error_msg = f"Failed to import readiness module: {e}"
        if output_json:
            import json
            return False, json.dumps({
                "version": get_version(),
                "ready": False,
                "error": error_msg,
            })
        else:
            return False, f"\n✘ READINESS CHECK FAILED\n\n{error_msg}\n"


# =============================================================================
# Service Startup
# =============================================================================

def start_forge_services():
    """
    Start Forge backend and frontend services.
    
    This launches:
    1. Backend API server (uvicorn)
    2. Frontend dev server (npm/pnpm)
    
    Both run in the foreground with output visible.
    """
    print("\n" + "=" * 60)
    print("  STARTING FORGE")
    print("=" * 60 + "\n")
    
    # Check for existing processes
    backend_pid_file = FORGE_ROOT / "uvicorn.pid"
    frontend_pid_file = FORGE_ROOT / "frontend_dev.pid"
    
    # Start backend
    print("Starting backend API server...")
    backend_process = start_backend()
    
    if backend_process:
        print(f"  Backend started (PID: {backend_process.pid})")
        print("  API: http://127.0.0.1:8085")
    else:
        print("  ✘ Backend failed to start")
        return False
    
    # Start frontend
    print("\nStarting frontend...")
    frontend_process = start_frontend()
    
    if frontend_process:
        print(f"  Frontend started (PID: {frontend_process.pid})")
        print("  UI: http://localhost:5173")
    else:
        print("  ✘ Frontend failed to start")
        # Kill backend if frontend fails
        if backend_process:
            backend_process.terminate()
        return False
    
    print("\n" + "-" * 60)
    print("  Forge is running.")
    print("  Press Ctrl+C to stop.")
    print("-" * 60 + "\n")
    
    # Wait for processes
    try:
        # Wait for either to exit
        backend_process.wait()
    except KeyboardInterrupt:
        print("\n\nShutting down Forge...")
        backend_process.terminate()
        frontend_process.terminate()
        backend_process.wait()
        frontend_process.wait()
        print("Forge stopped.\n")
    
    return True


def start_backend():
    """Start the backend uvicorn server."""
    try:
        # Use venv python if available
        venv_python = BACKEND_DIR / ".venv" / "bin" / "python"
        if not venv_python.exists():
            venv_python = FORGE_ROOT / ".venv" / "bin" / "python"
        
        if venv_python.exists():
            python_cmd = str(venv_python)
        else:
            python_cmd = sys.executable
        
        process = subprocess.Popen(
            [
                python_cmd, "-m", "uvicorn",
                "app.main:app",
                "--host", "127.0.0.1",
                "--port", "8085",
                "--reload",
            ],
            cwd=str(BACKEND_DIR),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )
        return process
    except Exception as e:
        print(f"  Error starting backend: {e}")
        return None


def start_frontend():
    """Start the frontend dev server."""
    frontend_dir = FORGE_ROOT / "frontend"
    
    if not frontend_dir.exists():
        print(f"  Frontend directory not found: {frontend_dir}")
        return None
    
    try:
        # Check for pnpm or npm
        if (frontend_dir / "pnpm-lock.yaml").exists():
            cmd = ["pnpm", "dev"]
        else:
            cmd = ["npm", "run", "dev"]
        
        process = subprocess.Popen(
            cmd,
            cwd=str(frontend_dir),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )
        return process
    except Exception as e:
        print(f"  Error starting frontend: {e}")
        return None


# =============================================================================
# CLI
# =============================================================================

def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Forge - Deterministic media proxy generation",
        epilog="Run without arguments to check readiness and start Forge.",
    )
    
    parser.add_argument(
        "--version", "-v",
        action="store_true",
        help="Print version and exit",
    )
    
    parser.add_argument(
        "--check", "-c",
        action="store_true",
        help="Run readiness check only, don't start services",
    )
    
    parser.add_argument(
        "--json", "-j",
        action="store_true",
        help="Output readiness report as JSON",
    )
    
    args = parser.parse_args()
    
    # Version only
    if args.version:
        print(f"Forge {get_version()}")
        sys.exit(0)
    
    # Print header
    if not args.json:
        print(f"\nForge {get_version()}")
    
    # Run readiness check
    is_ready, output = run_readiness_check(output_json=args.json)
    
    # Output result
    print(output)
    
    # Check only mode - exit with status
    if args.check or args.json:
        sys.exit(0 if is_ready else 1)
    
    # Not ready - don't start
    if not is_ready:
        print("Forge cannot start until blocking issues are resolved.")
        print("Run 'python forge.py --check' to see details.\n")
        sys.exit(1)
    
    # Ready - start services
    try:
        success = start_forge_services()
        sys.exit(0 if success else 2)
    except Exception as e:
        print(f"\n✘ Runtime error: {e}\n")
        sys.exit(2)


if __name__ == "__main__":
    main()
