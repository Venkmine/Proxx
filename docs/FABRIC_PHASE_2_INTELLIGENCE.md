# Fabric Phase-2 Intelligence Layer

**Status:** ARCHITECTURAL CONSTRAINT DOCUMENT  
**Scope:** Read-only intelligence queries for Proxx V2 execution history  
**Enforcement:** All intelligence queries MUST comply with these rules  

---

## Purpose

The Fabric Intelligence layer provides read-only queries that answer higher-level questions about ingested execution results.

Fabric Intelligence is an **observation layer**. It reports facts. It does not interpret, recommend, or act.

---

## Non-Goals

The following are explicitly **NOT** goals of this layer:

- Retry logic
- Orchestration
- Recommendations
- Heuristics or scoring
- Inference of missing data
- Prediction of outcomes
- Health monitoring
- Alerting
- Auto-cleanup
- Migration
- Background jobs
- Any form of mutation

These are forbidden. They will never be added to this layer.

---

## Questions Fabric CAN Answer

### Fingerprint Intelligence

| Question | Method | Returns |
|----------|--------|---------|
| Has this fingerprint been seen before? | `has_fingerprint_been_seen(fingerprint)` | `bool` |
| Which jobs produced this fingerprint? | `list_jobs_for_fingerprint(fingerprint)` | `list[job_id]` |

### Failure Intelligence

| Question | Method | Returns |
|----------|--------|---------|
| What failures occurred with this engine? | `list_failures_by_engine(engine)` | `dict[reason, count]` |
| Which jobs failed with this error message? | `list_jobs_failed_for_reason(substring)` | `list[job_id]` |
| What is the failure rate per profile? | `failure_rate_by_proxy_profile()` | `dict[profile, ratio]` |

### Operational History

| Question | Method | Returns |
|----------|--------|---------|
| Which jobs used this profile? | `list_jobs_by_proxy_profile(profile)` | `list[job_id]` |
| Which jobs used this engine? | `list_jobs_by_engine(engine)` | `list[job_id]` |
| How many jobs completed/failed/partial? | `job_outcome_summary()` | `dict[status, count]` |

### Determinism Checks

| Question | Method | Returns |
|----------|--------|---------|
| Which jobs show non-deterministic behavior? | `detect_non_deterministic_results()` | `list[job_id]` |

### Utility Queries

| Question | Method | Returns |
|----------|--------|---------|
| What engines have been used? | `get_all_engines()` | `list[engine]` |
| What profiles have been used? | `get_all_profiles()` | `list[profile]` |

---

## Questions Fabric CANNOT Answer

| Question | Why Not |
|----------|---------|
| Should we retry this job? | Requires policy decision (forbidden) |
| What profile should we use? | Requires recommendation (forbidden) |
| Is this job healthy? | Requires heuristics/scoring (forbidden) |
| What will happen if we run this? | Requires prediction (forbidden) |
| Why did this job fail? | Requires inference (forbidden) |
| What should we do next? | Requires orchestration (forbidden) |
| Which jobs need attention? | Requires prioritization (forbidden) |
| How can we improve success rate? | Requires recommendation (forbidden) |

Fabric provides facts. Humans decide what to do with them.

---

## Guarantees and Invariants

### Read-Only Guarantee

**Every method in FabricIntelligence is a pure query.**

- No writes to storage
- No deletes from storage
- No updates to storage
- No side effects
- No background operations
- No network calls
- No file system modifications

This is non-negotiable.

### Determinism Guarantee

**Same inputs produce same outputs, always.**

- Results are stable across calls
- Results are stable across process restarts
- Results are stable across time (for same underlying data)
- Ordered results are sorted explicitly

### Fail-Loud Guarantee

**Invalid inputs cause immediate, explicit failures.**

- Empty or None arguments → `FabricValidationError`
- Unknown engines → `FabricValidationError`
- Missing database → `FabricError`
- Corrupt data → Exception propagates (no swallowing)

Errors are never silently ignored.

### Empty Collection Guarantee

**Methods return empty collections, never None.**

- `list_jobs_for_fingerprint("x")` → `[]` (not `None`)
- `failure_rate_by_proxy_profile()` → `{}` (not `None`)
- `job_outcome_summary()` → `{completed: 0, failed: 0, validation_failed: 0}` (all keys present)

### Ordering Guarantee

**List results are sorted for determinism unless otherwise specified.**

All `list_*` methods return sorted lists to ensure deterministic output.

---

## Explicit Rejection of Forbidden Patterns

### NO Retry Logic

```python
# FORBIDDEN - will never exist
def should_retry(job_id: str) -> bool: ...
def schedule_retry(job_id: str) -> None: ...
def get_retry_count(job_id: str) -> int: ...
```

Retry decisions are made by humans or external orchestration layers.

### NO Orchestration

```python
# FORBIDDEN - will never exist
def trigger_execution(job_id: str) -> None: ...
def queue_job(job_spec: dict) -> str: ...
def cancel_job(job_id: str) -> None: ...
```

Orchestration belongs in execution layers, not observation layers.

### NO Recommendations

```python
# FORBIDDEN - will never exist
def recommend_profile(source: str) -> str: ...
def suggest_retry(job_id: str) -> bool: ...
def optimal_engine() -> str: ...
```

Recommendations require policy. Fabric has no policy.

### NO Heuristics or Scoring

```python
# FORBIDDEN - will never exist
def job_health_score(job_id: str) -> float: ...
def estimate_success_rate() -> float: ...
def risk_level(job_id: str) -> str: ...
```

Heuristics require judgment. Fabric records facts.

### NO Inference

```python
# FORBIDDEN - will never exist
def infer_failure_cause(job_id: str) -> str: ...
def predict_outcome(job_spec: dict) -> str: ...
def likely_to_fail(job_id: str) -> bool: ...
```

Inference fills gaps with assumptions. Fabric does not assume.

---

## Integration Rules

### Dependency Direction

```
FabricIntelligence
       ↓
  FabricIndex
       ↓
FabricPersistence
       ↓
  FabricStorage
```

Intelligence depends on Index. Index depends on Persistence.

**The reverse is NEVER true:**
- Index does not know Intelligence exists
- Persistence does not know Intelligence exists
- Storage does not know Intelligence exists

### No Behavioral Changes

Intelligence adds functionality on top of existing layers.
It does NOT change:
- Ingestion behavior
- Storage behavior
- Index behavior
- Query semantics

Existing code continues to work identically.

---

## Error Classes

| Exception | When Raised |
|-----------|-------------|
| `FabricError` | Base error for Fabric operations. Missing database, initialization failures. |
| `FabricValidationError` | Invalid query arguments. Empty strings, None values, unknown engines. |

All exceptions propagate. None are swallowed.

---

## Testing Requirements

All intelligence methods must have tests covering:

1. **Happy path** - Valid inputs, expected results
2. **Empty database** - Behavior with no data
3. **Invalid inputs** - Fail-loud behavior
4. **Determinism** - Same call twice = same result
5. **Read-only** - No index modification after query
6. **Return types** - Lists/dicts never None

Minimum test coverage: 20 tests.

---

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 1.0.0 | 2024-12 | Initial Phase-2 Intelligence layer |

---

## Summary

Fabric Intelligence is a read-only observation layer.

It answers questions about what happened.
It does not suggest what should happen next.
It does not take actions.
It does not infer or predict.

**Fabric observes. Humans decide.**
