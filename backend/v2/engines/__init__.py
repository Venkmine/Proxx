"""
V2 Execution Engines - Pluggable execution backends for proxy transcoding.

This package contains execution engines for different transcoding backends.
Each engine implements a consistent interface for executing JobSpec instances.

Available Engines:
------------------
- ResolveEngine: DaVinci Resolve scripting API backend (headless worker)

Design Philosophy:
------------------
All engines in this package share these principles:
1. Headless execution only - no UI interaction whatsoever
2. Deterministic execution - same input produces same output
3. Explicit failures - structured errors, no silent swallowing
4. No retries or recovery - fail fast, fail clearly
5. Output verification - files must exist on disk before COMPLETED
"""

try:
    from backend.v2.engines.resolve_engine import ResolveEngine
except ImportError:
    from v2.engines.resolve_engine import ResolveEngine

__all__ = ["ResolveEngine"]
