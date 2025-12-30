# Pre-RAW Smoke Validation Checklist

**Purpose**: Verify core Forge functionality before RAW media testing.

**Validation Date**: ____________________  
**Operator**: ____________________

---

## 1. Resolve Detection

**Test**: Non-RAW job captures Resolve metadata  
**File**: `backend/tests/test_resolve_detection_smoke.py`

- [ ] Resolve edition detected
- [ ] Resolve version detected
- [ ] Detection occurs without Resolve engine use
- [ ] FFmpeg jobs still capture metadata fields
- [ ] No JobSpec mutation

**Result**: ☐ PASS ☐ FAIL  
**Notes**:

---

## 2. Edition Gating

**Test**: Edition requirements gate execution correctly  
**File**: `backend/tests/test_resolve_edition_gating_dry_run.py`

- [ ] Free-required jobs SKIPPED under Studio
- [ ] Studio-required jobs SKIPPED under Free
- [ ] "Either" edition never skipped
- [ ] Skip metadata includes detected/required editions
- [ ] Resolve engine never invoked for skipped jobs

**Result**: ☐ PASS ☐ FAIL  
**Notes**:

---

## 3. Recursive Watch Folder

**Test**: Realistic watch folder recursion  
**File**: `backend/tests/test_watch_folder_recursive_realistic.py`

- [ ] Multi-project structure discovered
- [ ] Ordering is deterministic
- [ ] Non-recursive mode finds only top-level
- [ ] No path leakage into JobSpec
- [ ] Empty subdirectories handled correctly

**Result**: ☐ PASS ☐ FAIL  
**Notes**:

---

## 4. Report Determinism

**Test**: JSON reports are byte-stable  
**File**: `backend/tests/test_report_determinism_regression.py`

- [ ] Same job produces identical JSON (excluding timestamps)
- [ ] Hashes match exactly across runs
- [ ] No field reordering
- [ ] No schema drift
- [ ] Metadata section deterministic

**Result**: ☐ PASS ☐ FAIL  
**Notes**:

---

## 5. Test Suite Integrity

**Command**: `pytest backend/tests/test_*smoke*.py backend/tests/test_*dry_run*.py backend/tests/test_watch_folder_recursive_realistic.py backend/tests/test_report_determinism_regression.py -v`

- [ ] All smoke tests pass
- [ ] No regressions in existing tests
- [ ] Zero test failures
- [ ] Zero test errors

**Result**: ☐ PASS ☐ FAIL  
**Test Count**: ______ passed, ______ failed  
**Duration**: ______ seconds  
**Notes**:

---

## Pre-RAW Validation Status

| Area | Status | Notes |
|------|--------|-------|
| Resolve Detection | ☐ ✓ ☐ ✗ | |
| Edition Gating | ☐ ✓ ☐ ✗ | |
| Watch Folder Recursion | ☐ ✓ ☐ ✗ | |
| Report Determinism | ☐ ✓ ☐ ✗ | |
| Test Suite | ☐ ✓ ☐ ✗ | |

---

## Critical Notes

**NO RAW MEDIA VALIDATED YET**

This checklist validates:
- Resolve detection infrastructure
- Edition gating logic
- Watch folder discovery
- Report stability

**NOT validated**:
- Actual RAW decoding
- Resolve RAW rendering
- Format-specific support matrix
- Performance with real media

---

## Next Steps

If all checks pass:
- [ ] Commit validation results
- [ ] Document test coverage gaps
- [ ] Proceed to RAW media testing phase

If any checks fail:
- [ ] Document failure details
- [ ] File issues for failing tests
- [ ] Resolve before RAW testing

---

## Operator Sign-Off

**Validated By**: ____________________  
**Date**: ____________________  
**Environment**: ☐ macOS ☐ Windows ☐ Linux  
**Resolve Version**: ____________________  
**Resolve Edition**: ☐ Free ☐ Studio ☐ Not Installed  

**Overall Status**: ☐ CLEARED FOR RAW TESTING ☐ BLOCKED
