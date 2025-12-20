# Regression Playbook

This document describes procedures for handling regressions.

## Adding a Regression Test

When a bug is found:

1. **Reproduce the bug**
   - Identify minimal reproduction steps
   - Note exact inputs and expected vs actual output

2. **Write a failing test**
   - Create test in appropriate category (unit/integration/e2e)
   - Test should FAIL before fix applied
   - Test should PASS after fix applied

3. **Fix the bug**
   - Apply minimal fix
   - Avoid scope creep

4. **Verify the fix**
   ```bash
   make verify-fast
   ```

5. **Run full verification**
   ```bash
   make verify-full
   ```

## Test File Naming

Regression tests should include bug reference:

```
test_bug_<short_description>.py
```

Example: `test_bug_duplicate_file_detection.py`

## Regression Test Template

```python
"""
Regression test for: [Brief description]
Bug: [Link or reference]
Date: [When discovered]
"""

def test_regression_<description>():
    """
    [Description of the bug and expected behavior]
    
    Bug: Files were detected multiple times
    Fix: Track seen files by path
    """
    # Setup: conditions that triggered the bug
    ...
    
    # Action: operation that exposed the bug
    ...
    
    # Assert: correct behavior
    assert ...
```

## Self-Validation Procedure

After implementing Verify or adding tests:

1. **Introduce intentional failure**
   ```python
   def test_intentional_failure():
       assert False, "This should fail"
   ```

2. **Run Verify**
   ```bash
   make verify-fast
   ```

3. **Confirm failure detected**
   - Verify output shows test failed
   - Verify exit code is non-zero

4. **Remove intentional failure**

5. **Confirm green**
   ```bash
   make verify-fast
   ```

## Regression Suite Maintenance

- Regression tests are never deleted
- Flaky tests are fixed, not disabled
- Tests must have clear assertions
- Tests must be deterministic
