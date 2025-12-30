# Resolve Edition Gating

**Status**: Implemented (V2 Phase 2 - Failure Model)  
**Date**: December 30, 2025

## Overview

Resolve edition gating handles the case where **Resolve Free is required but Resolve Studio is installed** (or vice versa), without breaking anything, guessing, or forcing reinstall loops.

### Key Principles

* Resolve edition is an **environment**, not a runtime toggle
* User may only have **Resolve Studio installed**
* Free-only validation must **not run under Studio**
* Tests and reports must remain **honest and evidence-backed**

---

## Architecture

### 1. Resolve Edition Requirement Declaration

Test matrix entries now include a required field:

```json
{
  "sample_id": "braw_sample",
  "format": "BRAW",
  "extension": ".braw",
  "policy": "allowed",
  "requires_resolve_edition": "free",
  "notes": "Blackmagic RAW - native Resolve support"
}
```

**Valid values:**
- `"free"` - Test requires Resolve Free
- `"studio"` - Test requires Resolve Studio
- `"either"` - Test can run on any edition (default)

### 2. JobSpec Edition Requirement

JobSpec also supports edition requirements:

```json
{
  "jobspec_version": "2.1",
  "job_id": "test_job",
  "sources": ["/path/to/source.ari"],
  "output_directory": "/path/to/output",
  "codec": "prores_proxy",
  "container": "mov",
  "resolution": "same",
  "naming_template": "output",
  "requires_resolve_edition": "free"
}
```

**Default**: `"either"` if omitted

---

## Runtime Edition Gate

### Execution Flow

In the test runner / job launcher:

If:
* `requires_resolve_edition == "free"`
* AND detected edition == `"studio"`

Then:
* **DO NOT execute**
* **DO NOT error**
* **DO NOT fallback**
* **DO NOT guess**

Instead:
* Mark test/job as **SKIPPED**

### Implementation

The gating logic runs in two places:

1. **execution_adapter.py** - Before engine selection
2. **forge-tests/run_tests.py** - Before job creation

This ensures:
- Jobs are skipped before any engine invocation
- No Resolve API calls occur
- No partial state or side effects
- Deterministic skip behavior

---

## Skip Result Structure

### JobExecutionResult

When a job is skipped:

```json
{
  "job_id": "test_job",
  "final_status": "SKIPPED",
  "clips": [],
  "skip_metadata": {
    "reason": "resolve_free_not_installed",
    "detected_resolve_edition": "studio",
    "required_resolve_edition": "free",
    "resolve_version": "18.6.0",
    "timestamp": "2025-12-30T12:00:00.000000+00:00"
  },
  "started_at": "2025-12-30T12:00:00.000000+00:00",
  "completed_at": "2025-12-30T12:00:00.000000+00:00"
}
```

**Skip reasons:**
- `"resolve_free_not_installed"` - Free required but Studio detected
- `"resolve_studio_not_installed"` - Studio required but Free detected

### Test Report Structure

Test reports include skip metadata per test:

```json
{
  "sample_id": "arriraw_sample",
  "format": "ARRIRAW",
  "status": "skipped",
  "requires_resolve_edition": "free",
  "skip_metadata": {
    "reason": "resolve_free_not_installed",
    "detected_resolve_edition": "studio",
    "required_resolve_edition": "free",
    "resolve_version": "18.6.0",
    "timestamp": "2025-12-30T12:00:00.000000+00:00"
  }
}
```

Summary statistics include skip counts:

```json
{
  "summary": {
    "total_tests": 10,
    "completed": 5,
    "failed": 2,
    "skipped": 3
  }
}
```

---

## Operator-Facing Messages

### Free Required, Studio Detected

```
Testing arriraw_sample (ARRIRAW)... SKIPPED (Studio installed, Free required)
  → This test requires DaVinci Resolve Free. Resolve Studio is currently installed.
  → Uninstall Studio, install Resolve Free, then re-run this test to validate Free support.
```

### Studio Required, Free Detected

```
Testing xocn_sample (X-OCN)... SKIPPED (Free installed, Studio required)
  → This test requires DaVinci Resolve Studio. Resolve Free is currently installed.
  → Upgrade to Studio, then re-run this test to validate Studio support.
```

---

## Test Coverage

### Edition Gating Tests

Location: `backend/tests/test_resolve_edition_gating.py`

**Tests:**
1. `test_free_required_studio_detected_skips_job` - Free required + Studio detected → SKIPPED
2. `test_studio_required_free_detected_skips_job` - Studio required + Free detected → SKIPPED
3. `test_either_edition_never_skips` - "either" never skips
4. `test_skip_result_serializes_deterministically` - Skip metadata serialization
5. `test_jobspec_with_edition_requirement_serializes` - JobSpec serialization
6. `test_jobspec_from_dict_with_edition_requirement` - JobSpec deserialization
7. `test_default_edition_requirement_is_either` - Default is "either"
8. `test_skip_does_not_invoke_resolve_engine` - Engine never invoked on skip
9. `test_skip_preserves_result_ordering` - Result ordering deterministic

**All tests pass** ✓

---

## Usage

### Running Tests with Edition Requirements

```bash
# Run Free edition test matrix
python forge-tests/run_tests.py --config forge-tests/config/test_matrix_free.json

# Run Studio edition test matrix
python forge-tests/run_tests.py --config forge-tests/config/test_matrix_studio.json

# Dry run to validate configuration
python forge-tests/run_tests.py --config forge-tests/config/test_matrix_free.json --dry-run
```

### Creating Jobs with Edition Requirements

```python
from backend.job_spec import JobSpec

# Create JobSpec requiring Free
jobspec = JobSpec(
    job_id="free_test",
    sources=["/path/to/source.ari"],
    output_directory="/path/to/output",
    codec="prores_proxy",
    container="mov",
    resolution="same",
    naming_template="output",
    requires_resolve_edition="free",
)

# Execute - will skip if Studio detected
from backend.execution_adapter import execute_jobspec
result = execute_jobspec(jobspec)

if result.final_status == "SKIPPED":
    print(f"Skipped: {result.skip_metadata['reason']}")
```

---

## Design Rationale

### Why Skip Instead of Error?

**Skipping is correct** because:
- Edition mismatch is an **environment constraint**, not a job failure
- User may be testing Studio capabilities while Free tests remain pending
- Support matrix can truthfully say "Free: pending validation"
- No confusion between "tested and failed" vs "not yet tested"

### Why No Auto-Uninstall?

**No environment mutation** because:
- Uninstalling/reinstalling is user decision
- Automated uninstall is dangerous and unpredictable
- Clear messaging is sufficient
- User controls their environment

### Why No Heuristics?

**Deterministic gating only** because:
- No guessing about editions
- No fallback attempts
- Explicit skip is honest
- Reports are evidence-based

---

## Completion Criteria

✓ Studio users can run all tests safely  
✓ Free gaps are explicitly marked, not hidden  
✓ Support matrix can truthfully say "Free: pending validation"  
✓ Git clean, tests green  
✓ No UI changes  
✓ No auto-uninstall logic  
✓ No environment mutation  

---

## Future Work

**Not in scope:**
- UI display of skip status (deferred to V2 Phase 3)
- Interactive prompts
- Retry mechanisms
- Support table updates
- Warning-instead-of-skip mode

---

End.
