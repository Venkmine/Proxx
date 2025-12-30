# Forge Test Report Schema

**Version:** v2-phase2  
**Status:** Normalization complete (evidence capture only, no behavior changes)  
**Date:** 2025-12-30

---

## Purpose

This document defines the normalized schema for Forge black-box test reports. These reports capture **evidence only** for RAW media validation without changing execution behavior, routing, or policy decisions.

### Non-Goals (Explicit)

- ❌ No execution logic changes
- ❌ No Resolve behavior changes
- ❌ No policy decisions or interpretation
- ❌ No retries, fallbacks, or inference
- ❌ No success rates or warnings
- ✅ **Deterministic, read-only evidence capture ONLY**

---

## Report Structure

### Top-Level Fields

```json
{
  "test_suite": "string",
  "description": "string",
  "timestamp": "ISO-8601 string",
  "forge_version": "string",
  "resolve_metadata": { ... },
  "results": [ ... ],
  "summary": { ... },
  "aggregate_summary": { ... }
}
```

#### `test_suite`
- **Type:** String
- **Required:** Yes
- **Description:** Name of the test suite being run (e.g., "forge_free_edition", "forge_studio_edition")
- **Example:** `"forge_studio_validation"`

#### `description`
- **Type:** String
- **Required:** Yes
- **Description:** Human-readable description of test suite purpose
- **Example:** `"Evidence-based validation for Resolve Studio RAW format support"`

#### `timestamp`
- **Type:** String (ISO-8601 format)
- **Required:** Yes
- **Description:** When the test run started (UTC)
- **Example:** `"2025-12-30T14:32:45.123456Z"`

#### `forge_version`
- **Type:** String
- **Required:** Yes
- **Description:** Version identifier for the Forge system under test
- **Example:** `"v2-dev5"`

---

### Resolve Metadata

```json
"resolve_metadata": {
  "resolve_version": "string",
  "resolve_edition": "free" | "studio" | "unknown",
  "install_path": "string | null",
  "detection_method": "string",
  "detection_confidence": "high" | "medium" | "low" | "none"
}
```

#### `resolve_version`
- **Type:** String
- **Required:** Yes
- **Null When:** Resolve not detected
- **Description:** Detected Resolve version (e.g., "19.0.3")
- **Example:** `"19.0.3"`

#### `resolve_edition`
- **Type:** String (enum: `"free"` | `"studio"` | `"unknown"`)
- **Required:** Yes
- **Null When:** Never (defaults to "unknown")
- **Description:** Detected Resolve edition
- **Example:** `"studio"`

#### `install_path`
- **Type:** String or null
- **Required:** Yes
- **Null When:** Resolve not detected
- **Description:** Absolute path to Resolve installation
- **Example:** `"/Applications/DaVinci Resolve Studio/DaVinci Resolve.app"`

#### `detection_method`
- **Type:** String
- **Required:** Yes
- **Description:** How edition was detected
- **Examples:** `"macos_install_path"`, `"windows_registry"`, `"none"`

#### `detection_confidence`
- **Type:** String (enum: `"high"` | `"medium"` | `"low"` | `"none"`)
- **Required:** Yes
- **Description:** Confidence level in edition detection
- **Example:** `"high"`

---

### Test Results Array

```json
"results": [
  {
    "test_id": "string",
    "resolve_edition_required": "free" | "studio" | "either",
    "resolve_edition_detected": "free" | "studio" | null,
    "resolve_version_detected": "string | null",
    "sources": ["basename1", "basename2"],
    "engine_used": "resolve" | "ffmpeg" | null,
    "proxy_profile": "string | null",
    "status": "PASSED" | "FAILED" | "SKIPPED",
    "error_message": "string | null",
    "output_verified": boolean,
    "output_file_size_bytes": integer | null,
    "skip_metadata": { ... }  // Optional, only if SKIPPED
  }
]
```

#### `test_id`
- **Type:** String
- **Required:** Yes
- **Null When:** Never
- **Description:** Unique identifier for the test sample
- **Example:** `"braw_sample_001"`

#### `resolve_edition_required`
- **Type:** String (enum: `"free"` | `"studio"` | `"either"`)
- **Required:** Yes
- **Null When:** Never (defaults to "either")
- **Description:** Which Resolve edition this test requires
- **Example:** `"studio"`

#### `resolve_edition_detected`
- **Type:** String or null
- **Required:** Yes
- **Null When:** Resolve not installed OR test skipped before detection
- **Description:** Detected Resolve edition at test time
- **Example:** `"studio"`
- **CRITICAL:** Always captured when Resolve is installed, even for SKIPPED tests

#### `resolve_version_detected`
- **Type:** String or null
- **Required:** Yes
- **Null When:** Resolve not installed OR test skipped before detection
- **Description:** Detected Resolve version at test time
- **Example:** `"19.0.3"`
- **CRITICAL:** Always captured when Resolve is installed, even for SKIPPED tests

#### `sources`
- **Type:** Array of strings
- **Required:** Yes
- **Null When:** Never (empty array if no sources)
- **Description:** List of source file **basenames** (no full paths)
- **Example:** `["sample_clip.braw"]`
- **Note:** Contains basenames only for portability

#### `engine_used`
- **Type:** String or null
- **Required:** Yes
- **Null When:** Test did not execute (SKIPPED, validation failure, etc.)
- **Description:** Execution engine that processed the test
- **Allowed Values:** `"resolve"`, `"ffmpeg"`, `null`
- **Example:** `"resolve"`

#### `proxy_profile`
- **Type:** String or null
- **Required:** Yes
- **Null When:** Test did not execute
- **Description:** Proxy profile used for encoding
- **Example:** `"resolve_prores_proxy"`

#### `status`
- **Type:** String (enum: `"PASSED"` | `"FAILED"` | `"SKIPPED"`)
- **Required:** Yes
- **Null When:** Never
- **Description:** Final test outcome
- **Values:**
  - `"PASSED"`: Test executed successfully, output verified
  - `"FAILED"`: Test executed but failed (execution error, validation failure, etc.)
  - `"SKIPPED"`: Test was skipped (edition mismatch, missing sample, etc.)

#### `error_message`
- **Type:** String or null
- **Required:** Yes
- **Null When:** Test PASSED or SKIPPED without error
- **Description:** Human-readable error/failure reason
- **Example:** `"Resolve render failed: unsupported codec"`
- **CRITICAL:** MUST be present for FAILED tests

#### `output_verified`
- **Type:** Boolean
- **Required:** Yes
- **Null When:** Never (always boolean)
- **Description:** Whether output file was verified to exist and have non-zero size
- **Example:** `true`
- **Values:**
  - `true`: Output file exists and is > 0 bytes
  - `false`: Output file missing, 0 bytes, or test didn't complete

#### `output_file_size_bytes`
- **Type:** Integer or null
- **Required:** Yes
- **Null When:** Output file doesn't exist OR test didn't execute
- **Description:** Size of output file in bytes
- **Example:** `12345678`
- **CRITICAL:** MUST be present for PASSED tests

#### `skip_metadata` (Optional)
- **Type:** Object or undefined
- **Required:** Only if `status == "SKIPPED"`
- **Description:** Additional context for skipped tests
- **Structure:**
  ```json
  {
    "reason": "resolve_free_not_installed" | "resolve_studio_not_installed" | "sample_not_found",
    "detected_resolve_edition": "free" | "studio" | null,
    "required_resolve_edition": "free" | "studio" | "either",
    "resolve_version": "string | null",
    "timestamp": "ISO-8601 string"
  }
  ```

---

### Summary Section

```json
"summary": {
  "total_tests": integer,
  "completed": integer,
  "failed": integer,
  "blocked": integer,
  "skipped": integer,
  "errors": integer
}
```

#### Fields
- **Type:** All integers
- **Required:** Yes
- **Description:** Basic counts of test outcomes
- **Note:** This is a legacy summary for backwards compatibility. Use `aggregate_summary` for normalized reporting.

---

### Aggregate Summary Section

```json
"aggregate_summary": {
  "by_status": {
    "PASSED": integer,
    "FAILED": integer,
    "SKIPPED": integer
  },
  "by_engine": {
    "resolve": integer,
    "ffmpeg": integer,
    "null": integer
  },
  "by_source_extension": {
    ".braw": integer,
    ".mp4": integer,
    ".mxf": integer,
    ...
  }
}
```

#### `by_status`
- **Type:** Object (key: status, value: count)
- **Required:** Yes
- **Description:** Count of tests by normalized status
- **Keys:** `"PASSED"`, `"FAILED"`, `"SKIPPED"`
- **Values:** Non-negative integers
- **Ordering:** Alphabetically sorted
- **Example:** `{"FAILED": 2, "PASSED": 15, "SKIPPED": 3}`

#### `by_engine`
- **Type:** Object (key: engine, value: count)
- **Required:** Yes
- **Description:** Count of tests by execution engine
- **Keys:** `"resolve"`, `"ffmpeg"`, `"null"` (for skipped/failed-before-execution)
- **Values:** Non-negative integers
- **Ordering:** Alphabetically sorted
- **Example:** `{"ffmpeg": 5, "null": 3, "resolve": 12}`

#### `by_source_extension`
- **Type:** Object (key: extension, value: count)
- **Required:** Yes
- **Description:** Count of tests by source file extension
- **Keys:** File extensions (lowercase, with leading dot)
- **Values:** Non-negative integers
- **Ordering:** Alphabetically sorted
- **Example:** `{".braw": 8, ".mp4": 7, ".mxf": 5}`

---

## Schema Guarantees

### Determinism
1. **Field Ordering:** All fields appear in consistent order across runs
2. **Array Ordering:** Test results sorted by `test_id` alphabetically
3. **Key Ordering:** All object keys sorted alphabetically
4. **No Randomness:** No timestamps, UUIDs, or random values in deterministic fields

### Completeness
1. **Required Fields:** All required fields MUST exist (even when null)
2. **Evidence Capture:** Resolve edition/version captured for ALL tests (including SKIPPED)
3. **Error Messages:** Present for all FAILED tests
4. **Output Verification:** Present for all PASSED tests

### Read-Only Guarantees
1. **No Mutation:** Report generation does not modify execution state
2. **No Side Effects:** Serialization is pure (same input → same output)
3. **No Interpretation:** Aggregate summary contains counts only, no rates or warnings

---

## Usage Examples

### Checking if Resolve was detected
```python
if report["resolve_metadata"]["resolve_edition"] != "unknown":
    print(f"Resolve {report['resolve_metadata']['resolve_edition']} detected")
```

### Counting passed tests
```python
passed_count = report["aggregate_summary"]["by_status"]["PASSED"]
```

### Finding failed tests
```python
failed_tests = [
    test for test in report["results"]
    if test["status"] == "FAILED"
]
```

### Checking engine distribution
```python
resolve_tests = report["aggregate_summary"]["by_engine"].get("resolve", 0)
ffmpeg_tests = report["aggregate_summary"]["by_engine"].get("ffmpeg", 0)
```

---

## Validation Rules

### Test Result Validation
1. If `status == "PASSED"`:
   - `output_verified` MUST be `true`
   - `output_file_size_bytes` MUST be non-null and > 0
   - `error_message` MUST be null

2. If `status == "FAILED"`:
   - `error_message` MUST be non-null
   - `output_verified` MUST be `false`
   - `output_file_size_bytes` MUST be null

3. If `status == "SKIPPED"`:
   - `skip_metadata` MUST exist
   - `engine_used` MUST be null
   - `resolve_edition_detected` and `resolve_version_detected` MAY be populated (if detected before skip)

---

## Version History

### v2-phase2 (2025-12-30)
- Added evidence capture hooks to JobExecutionResult
- Normalized test report schema
- Added `resolve_edition_detected` and `resolve_version_detected`
- Added `source_files` and `source_extensions`
- Added `aggregate_summary` section
- NO behavior changes

---

## See Also

- [V2_PHASE_2_FAILURE_MODEL.md](V2_PHASE_2_FAILURE_MODEL.md) - Failure handling philosophy
- [V2_RESOLVE_EDITION_GATING.md](V2_RESOLVE_EDITION_GATING.md) - Edition gating implementation
- [forge-tests/README.md](../forge-tests/README.md) - Test runner usage guide
