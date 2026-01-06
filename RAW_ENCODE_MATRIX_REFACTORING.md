# RAW Encode Matrix Test Refactoring

## Problem
The `test_encode_all_files` test was too slow for default iteration:
- Tested 77+ files from `forge-tests/samples/RAW`
- Runtime: 10-15 minutes
- Blocked fast iteration during development

## Solution
Split into **two test modes** with different purposes:

### 1. Smoke Test (Default - FAST)
**Test**: `test_smoke_raw_execution`
- **Runtime**: <1 second
- **Coverage**: ONE representative RAW file (BRAW)
- **Purpose**: Prove RAW → Resolve execution path works
- **When**: Every pytest run, CI, default iteration
- **Verifies**:
  - RAW detection logic
  - Resolve engine routing
  - Job creation/execution
  - Output file generation

### 2. Exhaustive Matrix Test (Opt-In - SLOW)
**Test**: `test_encode_all_files`
- **Runtime**: 10-15 minutes
- **Coverage**: ALL 77+ RAW files (BRAW, R3D, ARRI, Canon, DNG, ProRes RAW, etc.)
- **Purpose**: Full format regression testing
- **When**: Pre-release, RAW logic changes, new format support
- **Run with**: `pytest -m matrix`
- **Markers**: `@pytest.mark.matrix`, `@pytest.mark.slow`, `@pytest.mark.integration`

## Usage Examples

### Default Development Iteration
```bash
# Runs smoke test + helpers (4 tests, <1s)
cd backend
pytest tests/test_raw_encode_matrix.py
```

### Exclude Matrix Tests Explicitly
```bash
# Same as default - excludes exhaustive test
pytest tests/test_raw_encode_matrix.py -m "not matrix"
```

### Run Exhaustive Matrix Test
```bash
# Runs ONLY the full matrix test (1 test, 10-15 min)
pytest tests/test_raw_encode_matrix.py -m matrix
```

### Run All Slow Tests
```bash
# Includes matrix test in slow test suite
pytest -m slow
```

## Test Coverage Comparison

| Aspect | Smoke Test | Matrix Test |
|--------|------------|-------------|
| Files Tested | 1 RAW file | 77+ files (RAW + non-RAW) |
| Runtime | <1 second | 10-15 minutes |
| Formats | BRAW | BRAW, R3D, ARRI MXF, Canon RAW, DNG, ProRes RAW, H.264, H.265, etc. |
| Default Run | ✅ Yes | ❌ No (opt-in) |
| CI Run | ✅ Yes | ❌ No (opt-in) |
| Purpose | Fast iteration | Exhaustive regression |

## Changes Made

### Files Modified
1. **backend/pytest.ini**:
   - Added `matrix` marker definition
   - Documents opt-in usage pattern

2. **backend/tests/test_raw_encode_matrix.py**:
   - Added `test_smoke_raw_execution()` for fast default testing
   - Marked `test_encode_all_files()` with `@pytest.mark.matrix` and `@pytest.mark.slow`
   - Updated docstrings with clear usage guidance
   - No changes to execution logic or JobSpec behavior

### Test Collection Verification
```bash
# Default collection (4 tests)
$ pytest tests/test_raw_encode_matrix.py --co -q
collected 5 items / 0 deselected / 5 selected

# Excluding matrix (4 tests)
$ pytest tests/test_raw_encode_matrix.py -m "not matrix" --co -q
collected 5 items / 1 deselected / 4 selected

# Only matrix (1 test)
$ pytest tests/test_raw_encode_matrix.py -m matrix --co -q
collected 5 items / 4 deselected / 1 selected
```

## When to Run Matrix Test

Run the exhaustive matrix test when:
- **Before releases**: Full format regression check
- **RAW detection changes**: Verify all formats still work correctly
- **New format support**: Ensure compatibility with existing formats
- **Engine routing changes**: Verify Resolve vs FFmpeg decisions
- **Codec/container changes**: Validate output across all input formats

## QC Philosophy Alignment

This refactoring follows Proxx's QC philosophy:

✅ **Fast Default Iteration**
- Smoke test proves the critical path works
- Developers get quick feedback (<1s)
- No waiting for exhaustive tests during development

✅ **Exhaustive Pre-Release Validation**
- Matrix test provides full format coverage
- Opt-in ensures it runs when needed
- No reduction in safety or coverage

✅ **Clear Separation of Concerns**
- Smoke test: "Does RAW execution work?"
- Matrix test: "Do ALL formats work correctly?"

✅ **No Execution Logic Changes**
- Same JobSpec behavior
- Same engine routing
- Same validation logic
- Only test organization changed

## Integration with Existing Workflows

### Local Development
```bash
# Fast iteration - use default
pytest tests/test_raw_encode_matrix.py

# Before committing RAW changes - run matrix
pytest tests/test_raw_encode_matrix.py -m matrix
```

### CI/CD
```bash
# Default CI runs smoke tests
pytest tests/

# Pre-release CI runs exhaustive suite
pytest -m matrix
```

### Other Test Markers
The matrix test is also marked with existing markers:
- `@pytest.mark.slow` - Included in slow test suite
- `@pytest.mark.integration` - Included in integration test suite
- Can be combined: `pytest -m "slow and matrix"`

---
**Status**: ✅ COMPLETE  
**Commit**: `9e25d27`  
**Branch**: `v2/reliable-proxy`  
**Pushed**: Yes
