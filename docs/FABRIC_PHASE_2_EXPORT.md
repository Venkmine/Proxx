# Fabric Phase-2: Operator Report Export

## Purpose

Fabric Phase-2 Operator Report Export is a **read-only, deterministic export layer** that transforms Fabric Reports into **operator-consumable artifacts**.

This module exists to bridge the gap between Fabric's internal reporting structures and human operators who need to consume execution data without tooling knowledge or developer intervention.

## Intended Operator Audience

* **Post-production operators** reviewing job execution outcomes
* **Pipeline supervisors** auditing system behavior
* **QA engineers** verifying execution patterns
* **External stakeholders** requiring standardized reports

Operators consume these exports as static documents. They do not interact with Fabric internals.

## Export Guarantees

### Determinism

* **Same data produces byte-identical output** (excluding timestamp)
* Field ordering is fixed and alphabetical where applicable
* No randomization, hashing, or time-dependent formatting
* Text output is whitespace-stable

### Completeness

* All sections present in every export
* Missing data surfaces as explicit zeros, not omissions
* No hidden aggregations or summarizations beyond what `FabricReports` provides

### Neutrality

* **No interpretation**: Data is presented as-is
* **No recommendations**: Never suggests actions
* **No assessment**: No "healthy", "at-risk", or similar qualifiers
* **No inference**: Missing data remains missing

## What Export Explicitly Does NOT Do

| Forbidden | Reason |
|-----------|--------|
| Write to filesystem | Export returns data; caller writes |
| CLI integration | No command-line interface |
| Schedule exports | No automation or cron integration |
| Retry on failure | Single-shot read-only operation |
| Aggregate beyond reports | No new derived metrics |
| Mutate reports or intelligence | Pure read-only pass-through |
| Interpret or judge results | Neutral presentation only |
| Recommend actions | Operators decide meaning |
| Generate HTML/Markdown | Plain text and JSON only |

## Relationship to Reports and Intelligence

```
┌──────────────────────────────────────────────────────────────┐
│                     FabricIntelligence                       │
│        (Query layer - indexes facts, answers questions)      │
└─────────────────────────────┬────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                       FabricReports                          │
│    (Narrative layer - structures facts into report shapes)   │
└─────────────────────────────┬────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                   FabricReportExporter                       │
│   (Export layer - formats reports into consumable artifacts) │
└──────────────────────────────────────────────────────────────┘
```

* **Intelligence**: Answers questions about indexed execution data
* **Reports**: Structures intelligence responses into report shapes
* **Exporter**: Formats reports into JSON or plain text for external consumption

The Exporter adds **no logic**. It is a pure formatting layer.

## API

```python
from fabric.reports import FabricReports
from fabric.export import FabricReportExporter, create_exporter

# Create exporter from existing reports
exporter = FabricReportExporter(reports)
# or
exporter = create_exporter(reports)

# Export as structured JSON
json_data = exporter.export_json()

# Export as plain text
text_report = exporter.export_text()
```

## Example JSON Output

```json
{
  "generated_at": "2024-12-29T14:30:00.000000+00:00",
  "execution_summary": {
    "total_jobs": 123,
    "completed": 118,
    "failed": 4,
    "validation_failed": 1
  },
  "failure_summary": {
    "by_engine": {
      "ffmpeg": {
        "decode error": 2
      },
      "resolve": {
        "missing preset": 2
      }
    },
    "top_failure_reasons": ["decode error", "missing preset"]
  },
  "engine_health": {
    "ffmpeg": {
      "jobs": 90,
      "failures": 2,
      "failure_rate": 0.022
    },
    "resolve": {
      "jobs": 33,
      "failures": 2,
      "failure_rate": 0.061
    }
  },
  "proxy_profile_stability": {
    "proxy_prores_proxy": {
      "jobs": 70,
      "failure_rate": 0.014
    }
  },
  "determinism": {
    "non_deterministic_jobs": [],
    "count": 0
  }
}
```

## Example Text Output

```
FABRIC OPERATOR REPORT
======================

Execution Summary
-----------------
Total jobs: 123
Completed: 118
Failed: 4
Validation failed: 1

Engine Health
-------------
Ffmpeg:
  Jobs: 90
  Failures: 2
  Failure rate: 0.022

Resolve:
  Jobs: 33
  Failures: 2
  Failure rate: 0.061

Failure Summary
---------------
Ffmpeg:
  decode error: 2

Resolve:
  missing preset: 2

Proxy Profile Stability
-----------------------
proxy_prores_proxy:
  Jobs: 70
  Failure rate: 0.014

Determinism
-----------
Non-deterministic jobs: 0
```

## Implementation Notes

### Field Ordering

* Top-level JSON keys: Fixed order (generated_at first, then alphabetical sections)
* Engine names: Alphabetical
* Profile names: Alphabetical
* Failure reasons within engine: Sorted by count descending, then name ascending

### Numeric Formatting

* Failure rates: 3 decimal places in text output
* Counts: Integer format, no thousands separators

### Error Handling

* `FabricExportError` raised if underlying report queries fail
* No silent failures or fallback values
* Error messages include context from underlying layer

## Module Location

```
fabric/
├── export.py              # This module
├── test_fabric_export.py  # Test suite (25+ tests)
├── reports.py             # Source of report data
├── intelligence.py        # Intelligence layer
└── ...
```

## Constraints Enforced

This module enforces Fabric's core philosophy:

> **Fabric tells the truth. This prints it.**

No interpretation. No judgment. No recommendations. Facts only.
