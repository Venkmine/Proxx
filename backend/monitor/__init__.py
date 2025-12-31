"""
Forge Monitor - Read-Only Observability Layer

This module provides read-only visibility into Forge job execution.
It is strictly observational and provides NO control capabilities.

WARNING: This is NOT an orchestration layer.
- No job creation
- No job modification  
- No retry logic
- No queue manipulation
- No state mutation after terminal states

Components:
- event_model: Immutable event definitions
- state_store: Append-only persistence
- heartbeat: Worker status tracking
- monitor_api: Read-only HTTP endpoints
"""

__version__ = "1.0.0"
