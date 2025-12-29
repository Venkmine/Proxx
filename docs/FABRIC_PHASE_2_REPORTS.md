# FABRIC PHASE-2: NARRATIVE REPORTS

**Specification Document**

---

## 1. PURPOSE

Fabric Phase-2 Reports provides a **read-only reporting layer** that produces **human-readable summaries** from persisted Fabric data.

Reports are:

- **Deterministic**: Same data → Same output
- **Derived only from FabricIntelligence**: No direct access to indexes, persistence, or execution internals
- **Pure queries**: No side effects, no mutations, no caching

---

## 2. NON-GOALS

This module explicitly does NOT:

- ❌ Recommend actions
- ❌ Trigger workflows or retries
- ❌ Infer failure causes
- ❌ Score or rank results
- ❌ Predict outcomes
- ❌ Suggest improvements
- ❌ Make value judgments ("healthy", "bad", "risky")
- ❌ Access raw Proxx execution internals
- ❌ Modify any persisted state

**Fabric describes reality. It does not suggest changes to it.**

---

## 3. API SPECIFICATION

### Module: `fabric/reports.py`

### Class: `FabricReports`

```python
class FabricReports:
    def __init__(self, intelligence: FabricIntelligence)
    
    def execution_summary(self) -> dict
    def failure_summary(self) -> dict
    def engine_health_report(self) -> dict
    def proxy_profile_stability_report(self) -> dict
    def determinism_report(self) -> dict
```

---

## 4. REPORT DEFINITIONS

### 4.1 `execution_summary()`

**Purpose**: Aggregate count of job outcomes.

**Source**: `FabricIntelligence.job_outcome_summary()`

**Returns**:

```json
{
  "total_jobs": 150,
  "completed": 120,
  "failed": 25,
  "validation_failed": 5
}
```

| Field | Type | Description |
|-------|------|-------------|
| `total_jobs` | int | Sum of completed + failed + validation_failed |
| `completed` | int | Jobs with final_status="COMPLETED" |
| `failed` | int | Jobs with final_status="FAILED" |
| `validation_failed` | int | Jobs with final_status="PARTIAL" |

---

### 4.2 `failure_summary()`

**Purpose**: Failure reason counts grouped by engine.

**Source**: `FabricIntelligence.list_failures_by_engine()`

**Returns**:

```json
{
  "by_engine": {
    "ffmpeg": {
      "FFmpeg exited with code 1": 15,
      "Output directory not writable": 3
    },
    "resolve": {
      "Resolve project not found": 2
    }
  },
  "top_failure_reasons": [
    "FFmpeg exited with code 1",
    "Output directory not writable",
    "Resolve project not found"
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `by_engine` | dict | Engine → (reason → count) |
| `top_failure_reasons` | list[str] | All reasons sorted by count desc, then name asc |

**Sorting**: Deterministic. No heuristics.

---

### 4.3 `engine_health_report()`

**Purpose**: Job counts and failure rates per execution engine.

**Source**: `FabricIntelligence.list_jobs_by_engine()`, `FabricIntelligence.list_failures_by_engine()`

**Returns**:

```json
{
  "ffmpeg": {
    "jobs": 100,
    "failures": 20,
    "failure_rate": 0.2
  },
  "resolve": {
    "jobs": 50,
    "failures": 5,
    "failure_rate": 0.1
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `jobs` | int | Total jobs using this engine |
| `failures` | int | Jobs that failed or were partial |
| `failure_rate` | float | failures / jobs (0.0 if no jobs) |

**Note**: No thresholds. No judgments. Numbers only.

---

### 4.4 `proxy_profile_stability_report()`

**Purpose**: Job counts and failure rates per proxy profile.

**Source**: `FabricIntelligence.get_all_profiles()`, `FabricIntelligence.failure_rate_by_proxy_profile()`, `FabricIntelligence.list_jobs_by_proxy_profile()`

**Returns**:

```json
{
  "standard_proxy_ffmpeg": {
    "jobs": 80,
    "failure_rate": 0.15
  },
  "resolve_prores": {
    "jobs": 40,
    "failure_rate": 0.05
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `jobs` | int | Total jobs using this profile |
| `failure_rate` | float | Ratio of failed/partial jobs (0.0 to 1.0) |

**Note**: Profiles with zero jobs are excluded.

---

### 4.5 `determinism_report()`

**Purpose**: Identify jobs with non-deterministic behavior.

**Source**: `FabricIntelligence.detect_non_deterministic_results()` (direct passthrough)

**Returns**:

```json
{
  "non_deterministic_jobs": ["job-001", "job-006", "job-005"],
  "count": 3
}
```

| Field | Type | Description |
|-------|------|-------------|
| `non_deterministic_jobs` | list[str] | Sorted list of flagged job IDs |
| `count` | int | Number of flagged jobs |

---

## 5. EXAMPLE OUTPUTS

### Empty Database

All reports return empty/zero values:

```python
reports.execution_summary()
# {"total_jobs": 0, "completed": 0, "failed": 0, "validation_failed": 0}

reports.failure_summary()
# {"by_engine": {"ffmpeg": {}, "resolve": {}}, "top_failure_reasons": []}

reports.engine_health_report()
# {"ffmpeg": {"jobs": 0, "failures": 0, "failure_rate": 0.0}, "resolve": {...}}

reports.proxy_profile_stability_report()
# {}

reports.determinism_report()
# {"non_deterministic_jobs": [], "count": 0}
```

---

## 6. FORBIDDEN PATTERNS

### Code Patterns

```python
# ❌ FORBIDDEN: Recommendations
def get_recommended_profile() -> str: ...

# ❌ FORBIDDEN: Predictions
def predict_failure(job) -> bool: ...

# ❌ FORBIDDEN: Judgments
def is_healthy(engine: str) -> bool: ...

# ❌ FORBIDDEN: Caching
self._cached_summary = None  # NO state caching

# ❌ FORBIDDEN: Writes
self._intelligence._index.add_job(...)  # NO mutations

# ❌ FORBIDDEN: Direct index access
self._intelligence._index.get_all_jobs()  # Use Intelligence API only
```

### Language Patterns

```python
# ❌ FORBIDDEN: Interpretation words in output
{"status": "healthy"}  # NO
{"risk_level": "high"}  # NO
{"recommendation": "retry"}  # NO

# ✅ ALLOWED: Facts only
{"failure_rate": 0.15}  # YES
{"failures": 20}  # YES
{"count": 3}  # YES
```

---

## 7. RELATIONSHIP TO INTELLIGENCE

```
┌─────────────────────────────────────────────────────────────┐
│                     FabricReports                           │
│                   (Read-Only Layer)                         │
│                                                             │
│  execution_summary()                                        │
│  failure_summary()                                          │
│  engine_health_report()                                     │
│  proxy_profile_stability_report()                           │
│  determinism_report()                                       │
└─────────────────────┬───────────────────────────────────────┘
                      │ READS ONLY (no writes)
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                   FabricIntelligence                        │
│                  (Query Layer)                              │
│                                                             │
│  job_outcome_summary()                                      │
│  list_failures_by_engine(engine)                            │
│  failure_rate_by_proxy_profile()                            │
│  detect_non_deterministic_results()                         │
│  list_jobs_by_engine(engine)                                │
│  list_jobs_by_proxy_profile(profile)                        │
│  get_all_engines()                                          │
│  get_all_profiles()                                         │
└─────────────────────┬───────────────────────────────────────┘
                      │ READS ONLY (no writes)
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                      FabricIndex                            │
│                  (In-Memory Index)                          │
└─────────────────────────────────────────────────────────────┘
```

**Key Invariant**: Reports ONLY access Intelligence public API. Never raw index or persistence.

---

## 8. TESTING REQUIREMENTS

Tests must verify:

1. **Deterministic output ordering** - Same data → same output
2. **Empty database behavior** - Returns zeros/empty, not errors
3. **Correct aggregation math** - Sums and rates are accurate
4. **Failure reason stability** - Sorting is consistent
5. **Engine separation** - Each engine reported independently
6. **Zero mutation guarantees** - Intelligence state unchanged after reports
7. **Return type correctness** - Types match specification

Minimum: **25 tests** in `fabric/test_fabric_reports.py`

---

## 9. ERROR HANDLING

Reports fail loudly with `FabricReportError` when:

- Intelligence is None at initialization
- Intelligence query raises FabricError
- Required data is malformed

Reports do NOT:

- Swallow exceptions
- Return partial data on error
- Infer missing values

---

## 10. USAGE EXAMPLE

```python
from fabric.index import FabricIndex
from fabric.intelligence import FabricIntelligence
from fabric.reports import FabricReports

# Initialize layers
index = FabricIndex()
intelligence = FabricIntelligence(index)
reports = FabricReports(intelligence)

# Generate reports
print(reports.execution_summary())
# {"total_jobs": 150, "completed": 120, "failed": 25, "validation_failed": 5}

print(reports.failure_summary())
# {"by_engine": {...}, "top_failure_reasons": [...]}

print(reports.engine_health_report())
# {"ffmpeg": {...}, "resolve": {...}}

print(reports.proxy_profile_stability_report())
# {"standard_proxy_ffmpeg": {...}, ...}

print(reports.determinism_report())
# {"non_deterministic_jobs": [...], "count": 3}
```

---

**Fabric reports facts. Humans decide what they mean.**

