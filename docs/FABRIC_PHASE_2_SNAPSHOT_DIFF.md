# Fabric Phase-2: Snapshot & Diff

**Policy/Specification Document**

---

## Purpose

This document specifies the **Snapshot & Diff** layer of Fabric Phase-2.

This layer provides:
1. **Snapshots**: Immutable, content-addressed captures of operator report output
2. **Diffs**: Read-only comparisons between two snapshots

The layer enables comparison of system state at different points in time **without interpretation**.

---

## Core Principles

### Snapshots Freeze Truth

A snapshot captures the exact output of `FabricReportExporter.export_json()` at a moment in time.

- **Immutable**: Once created, snapshot content cannot change
- **Content-Addressed**: `snapshot_id` is a SHA256 hash of report content
- **Deterministic**: Same report data → same `snapshot_id`
- **In-Memory Only**: No persistence, no filesystem writes

### Diffs Show Movement

A diff computes what changed between two snapshots.

- **Read-Only**: Diffs never modify snapshots or reports
- **Factual**: States what changed, not why
- **No Judgement**: No "good", "bad", "improved", "degraded"
- **No Thresholds**: No filtering by significance
- **Deterministic**: Same snapshot pair → identical diff

### Humans Decide What It Means

Fabric states facts. This layer compares facts. Operators interpret meaning.

---

## What Snapshots Represent

A `FabricSnapshot` represents the complete state of operator reports at capture time.

### Structure

```python
@dataclass(frozen=True)
class FabricSnapshot:
    snapshot_id: str      # SHA256 of report content (deterministic)
    generated_at: str     # ISO-8601 UTC timestamp (informational only)
    report: dict          # EXACT output of FabricReportExporter.export_json()
```

### Properties

| Property | Description |
|----------|-------------|
| `snapshot_id` | Content hash. Same data → same ID, regardless of capture time. |
| `generated_at` | Capture timestamp. Informational only. NOT part of content hash. |
| `report` | Complete report dictionary. Immutable after creation. |

### Creation

```python
# From exporter
snapshot = create_snapshot(exporter)

# From existing report dictionary
snapshot = create_snapshot_from_report(report_dict)
```

---

## What Diffs Represent

A `FabricDiff` represents all changes between two snapshots.

### Structure

```python
@dataclass(frozen=True)
class FabricDiff:
    from_snapshot: str    # snapshot_id of earlier snapshot
    to_snapshot: str      # snapshot_id of later snapshot
    changes: dict         # All computed deltas
```

### Changes Dictionary

```json
{
  "execution_summary": {
    "completed_delta": int,
    "failed_delta": int,
    "validation_failed_delta": int,
    "total_jobs_delta": int
  },
  "engine_health": {
    "ffmpeg": {
      "jobs_delta": int,
      "failures_delta": int,
      "failure_rate_delta": float
    },
    "resolve": {
      "jobs_delta": int,
      "failures_delta": int,
      "failure_rate_delta": float
    }
  },
  "proxy_profile_stability": {
    "<profile_name>": {
      "jobs_delta": int,
      "failure_rate_delta": float
    }
  },
  "determinism": {
    "new_non_deterministic_jobs": ["job_id", ...],
    "resolved_non_deterministic_jobs": ["job_id", ...]
  }
}
```

### Delta Semantics

All deltas are computed as: `to_value - from_value`

| Delta Value | Meaning |
|-------------|---------|
| Positive | Value increased from snapshot A to B |
| Negative | Value decreased from snapshot A to B |
| Zero | No change |

### Float Precision

Float deltas are rounded to **4 decimal places** (`FLOAT_PRECISION = 4`).

### Missing Data Handling

| Scenario | Handling |
|----------|----------|
| Profile in B but not A | Delta computed from zero |
| Profile in A but not B | Delta computed to zero (negative) |
| Engine missing | Treated as having zero values |
| Section missing | Empty dict or zero values |

### Ordering

- Engine keys: alphabetical
- Profile keys: alphabetical
- Job ID lists: sorted ascending

---

## Example: Snapshot

```json
{
  "snapshot_id": "a1b2c3d4e5f6...",
  "generated_at": "2024-12-29T10:30:00+00:00",
  "report": {
    "generated_at": "2024-12-29T10:30:00+00:00",
    "execution_summary": {
      "total_jobs": 100,
      "completed": 90,
      "failed": 8,
      "validation_failed": 2
    },
    "failure_summary": {
      "by_engine": {
        "ffmpeg": {"decode error": 5, "timeout": 2},
        "resolve": {"render failed": 1}
      },
      "top_failure_reasons": ["decode error", "timeout", "render failed"]
    },
    "engine_health": {
      "ffmpeg": {"jobs": 70, "failures": 7, "failure_rate": 0.1},
      "resolve": {"jobs": 30, "failures": 1, "failure_rate": 0.033}
    },
    "proxy_profile_stability": {
      "proxy_prores_proxy": {"jobs": 50, "failure_rate": 0.08},
      "resolve_prores": {"jobs": 50, "failure_rate": 0.04}
    },
    "determinism": {
      "non_deterministic_jobs": ["job-042"],
      "count": 1
    }
  }
}
```

---

## Example: Diff

Given two snapshots where:
- 10 new jobs completed
- 2 new failures on ffmpeg
- Profile "resolve_prores" added 5 jobs
- "job-042" was resolved, "job-099" became non-deterministic

```json
{
  "from_snapshot": "a1b2c3d4...",
  "to_snapshot": "x9y8z7w6...",
  "changes": {
    "execution_summary": {
      "completed_delta": 10,
      "failed_delta": 2,
      "validation_failed_delta": 0,
      "total_jobs_delta": 12
    },
    "engine_health": {
      "ffmpeg": {
        "jobs_delta": 10,
        "failures_delta": 2,
        "failure_rate_delta": 0.0143
      },
      "resolve": {
        "jobs_delta": 2,
        "failures_delta": 0,
        "failure_rate_delta": -0.003
      }
    },
    "proxy_profile_stability": {
      "proxy_prores_proxy": {
        "jobs_delta": 7,
        "failure_rate_delta": 0.01
      },
      "resolve_prores": {
        "jobs_delta": 5,
        "failure_rate_delta": -0.01
      }
    },
    "determinism": {
      "new_non_deterministic_jobs": ["job-099"],
      "resolved_non_deterministic_jobs": ["job-042"]
    }
  }
}
```

---

## Explicit Non-Goals

This layer does **NOT** provide:

| Non-Goal | Reason |
|----------|--------|
| Alerts | Interpretation of changes |
| Trends | Multi-snapshot analysis |
| Recommendations | Suggestions based on changes |
| Thresholds | Significance filtering |
| Persistence | Filesystem storage |
| Execution triggers | Action based on diffs |
| Health scores | Interpreted metrics |
| "Good" / "Bad" labels | Value judgement |
| Auto-snapshots | Scheduled captures |
| Retention policies | Snapshot lifecycle |

---

## Relationship to Export Layer

```
FabricReports → FabricReportExporter → FabricSnapshot → FabricDiff
                        ↑                    ↑              ↑
                    (Phase-1)            (Phase-2)      (Phase-2)
```

- **Export Layer** (Phase-1): Formats reports as JSON/text
- **Snapshot Layer** (Phase-2): Captures export output immutably
- **Diff Layer** (Phase-2): Compares two snapshots

The snapshot layer consumes `FabricReportExporter.export_json()` output directly.

---

## API Reference

### `fabric/snapshot.py`

```python
# Create snapshot from exporter
def create_snapshot(exporter: FabricReportExporter) -> FabricSnapshot

# Create snapshot from report dict
def create_snapshot_from_report(report: Dict[str, Any]) -> FabricSnapshot
```

### `fabric/diff.py`

```python
# Compute diff between two snapshots
def diff_snapshots(a: FabricSnapshot, b: FabricSnapshot) -> FabricDiff

# Float precision constant
FLOAT_PRECISION = 4
```

---

## Errors

| Error | When Raised |
|-------|-------------|
| `FabricSnapshotError` | Snapshot creation fails (None exporter/report) |
| `FabricDiffError` | Diff computation fails (None snapshots) |

Both inherit from `FabricExportError`.

---

## Constraints

| Constraint | Enforced |
|------------|----------|
| No filesystem writes | ✅ |
| No persistence | ✅ |
| No retries | ✅ |
| No heuristics | ✅ |
| No interpretation | ✅ |
| No execution coupling | ✅ |
| No UI hooks | ✅ |
| Deterministic output | ✅ |
| Immutable snapshots | ✅ |

---

## Testing

Test file: `fabric/test_fabric_snapshot_diff.py`

Coverage includes:
- Snapshot determinism
- Diff determinism
- Empty → populated transitions
- Profile added/removed
- Engine metric changes
- Determinism job tracking
- No mutation verification
- Type safety
- Edge cases

---

**Snapshots freeze truth. Diffs show movement. Humans decide what it means.**
