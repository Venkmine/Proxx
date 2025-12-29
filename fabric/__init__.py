"""
Fabric - Read-only ingestion and querying layer for Proxx execution results.

Fabric consumes JobExecutionResult JSON produced by Proxx.
Fabric indexes immutable facts.
Fabric enables querying and comparison.
Fabric NEVER influences execution.

Constraints:
- Read-only
- No JobSpec mutation
- No retries
- No orchestration
- No execution triggers
- No heuristics
- No "insights"

Fabric observes. Humans decide.
"""
