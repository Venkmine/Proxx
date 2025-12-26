# Dogfood Test Suite Results

**Date:** 2024-12-26
**Commit:** 0ffca41

## Summary

- **Total Tests:** 80
- **Passing:** 69 (86%)
- **Failing:** 11 (14%)

## Status

### ✅ Fixed Issues

1. **Frontend Syntax Error** - Fixed missing brace in QueueFilterBar.tsx `style` prop
   - Error: `Unexpected token, expected "}" at line 133`
   - Fix: Changed `style={` to `style={{`
   - Impact: Prevented React app from loading entirely

### ✅ Passing Test Suites (69 tests)

- **A. Startup & Health Checks** - 5/5 passing
- **B. Filesystem Path Validation** - 11/12 passing (B2 failing - see below)
- **C. Job Creation Contracts** - 8/9 passing
- **D. Queue Determinism** - 2/7 passing
- **E. Output Safety** - 0/3 passing
- **I. UI Truthfulness** - 5/5 passing
- **J. Error UX** - 3/3 passing
- **L. Responsiveness** - 3/4 passing
- **M. Accessibility** - 4/5 passing
- **N. Snapshot Immutability** - 2/3 passing

### ❌ Failing Tests (11)

| Test | Reason | Category |
|------|--------|----------|
| B2: Relative file path rejected | App accepts relative paths (should reject) | Product Bug |
| D3: Job can be selected | Missing selector or selection behavior | Missing testid |
| D4: Render button starts execution | Missing btn-job-render selector | Missing testid |
| D5: Delete removes job | Missing btn-job-delete selector | Missing testid |
| D6: Cancel stops running job | Missing btn-job-cancel selector | Missing testid |
| E2: Output directory must be absolute | Path validation not enforced | Product Bug |
| E3: Successful transcode creates output | E2E transcode flow issue | Product Bug |
| L4: Queue panel interactive with jobs | Missing action button selectors | Missing testid |
| M3: Disabled buttons cannot be activated | Disabled button still creates job | Product Bug |
| N3: Form state doesn't mutate jobs | Job creation timing/coordination issue | Product Bug |
| C. Preset immutability | Similar to N3 - job creation timing | Product Bug |

## Root Causes

### Missing data-testid Selectors (5 tests)

The following action buttons need data-testid attributes:
- `btn-job-render` (render/start button)
- `btn-job-delete` (delete button)  
- `btn-job-cancel` (cancel button)

**Location:** Likely in JobGroup.tsx or job action button components

### Product Validation Bugs (6 tests)

1. **Path Validation**
   - Relative paths should be rejected but are accepted
   - Output directory absolute path not validated
   
2. **Button State Management**
   - Disabled buttons can still trigger actions (M3)
   - Button activation should be blocked at interaction level

3. **Job Creation Timing**
   - Race conditions in job creation flow (N3, C immutability)
   - Form state coordination issues

## Recommendations

### Immediate Actions (High Priority)

1. **Add Missing data-testid Attributes**
   - Add to render/delete/cancel buttons in queue UI
   - Should take ~10 minutes
   - Would fix 5 failing tests immediately

2. **Fix Path Validation**
   - Enforce absolute path requirement in frontend
   - Add validation before job creation
   - Would fix 2 tests (B2, E2)

### Medium Priority

3. **Button State Management**
   - Ensure disabled buttons cannot trigger actions
   - Add proper pointer-events handling
   - Would fix M3 test

4. **Job Creation Flow**
   - Review job creation coordination
   - Add proper state guards
   - Would fix N3 and C immutability tests

### Documentation

5. **Update Test Coverage in TODO.md**
   - Mark B2, E2, E3 as known failing
   - Document missing testids
   - Track remediation work

## Running Tests

```bash
# Full suite
make verify-dogfood

# Individual spec files
cd qa/verify/ui
npx playwright test proxy/dogfood_startup_filesystem.spec.ts --project=browser
npx playwright test proxy/dogfood_job_creation.spec.ts --project=browser
npx playwright test proxy/dogfood_queue_execution.spec.ts --project=browser
npx playwright test proxy/dogfood_ui_accessibility.spec.ts --project=browser
```

## Next Steps

1. Add missing data-testid attributes to action buttons
2. Implement path validation (absolute paths only)
3. Fix button disabled state enforcement
4. Review job creation timing/coordination
5. Update documentation with known issues
