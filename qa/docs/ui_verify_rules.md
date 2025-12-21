# UI Verify Rules

## AUTHORITATIVE DOCUMENT

This document defines the rules governing UI verification in Awaire Proxy.

---

## Core Principle

> **If a feature exists in the UI, Verify must test it. If Verify cannot test it, the feature must be hidden or removed.**

---

## What Verify UI Tests

### In Scope (Proxy v1)

| Feature | Test File | Coverage |
|---------|-----------|----------|
| File selection (browser mode) | `create_job.spec.ts` | Text input for file paths |
| File selection (Electron mode) | `browser_vs_electron.spec.ts` | Native dialog stubs |
| Preset selection | `create_job.spec.ts` | Dropdown selection, validation |
| Output directory | `create_job.spec.ts` | Path input, validation |
| Create Job button | `create_job.spec.ts` | Click, job creation |
| Queue display | `queue_lifecycle.spec.ts` | Job list, status updates |
| Job cancellation | `queue_lifecycle.spec.ts` | Cancel button, state change |
| Job retry | `reset_and_retry.spec.ts` | Retry button, re-queue |
| Queue reset | `reset_and_retry.spec.ts` | Clear all jobs |
| Validation errors | `validation_errors.spec.ts` | Missing inputs, error messages |
| FFmpeg execution | `create_job.spec.ts` | Job RUNNING → COMPLETED |
| Output verification | `create_job.spec.ts` | File exists, ffprobe validation |

### Out of Scope (Must Not Appear in UI)

- Watch folders
- Colour pipeline configuration
- Resolve integration
- Network ingest
- Multi-module workflows

---

## Definition of Done (UI Feature)

A UI feature is **COMPLETE** only if:

1. ✅ It appears in the UI
2. ✅ Verify UI tests exercise it end-to-end
3. ✅ Verify passes without manual steps
4. ✅ No hidden or untestable UI paths exist

---

## Test Structure

```
qa/verify/ui/
├── playwright.config.ts     # Configuration
├── global-setup.ts          # Backend/frontend startup
├── global-teardown.ts       # Cleanup
├── package.json             # Dependencies
└── proxy/
    ├── fixtures.ts              # Page objects, helpers
    ├── create_job.spec.ts       # Job creation workflow
    ├── queue_lifecycle.spec.ts  # Queue operations
    ├── validation_errors.spec.ts # Error handling
    ├── reset_and_retry.spec.ts  # Recovery flows
    └── browser_vs_electron.spec.ts # Mode differences
```

---

## Running UI Tests

```bash
# Run all UI tests
make verify-ui

# Or directly via npm
cd qa/verify/ui
npx playwright test

# Run with visible browser
npx playwright test --headed

# Debug mode (step through)
npx playwright test --debug

# Browser mode only
npx playwright test --project=browser

# View report
npx playwright show-report ../../../logs/playwright-report
```

---

## How New Features Extend Verify

### Adding a New UI Feature

1. **Design the feature** with testability in mind
2. **Add data-testid attributes** to key elements
3. **Create test spec** in `qa/verify/ui/proxy/`
4. **Update fixtures.ts** if new page objects needed
5. **Run `make verify-ui`** before marking complete

### Test Writing Guidelines

```typescript
// GOOD: Use accessible selectors
page.getByRole('button', { name: /create job/i })
page.getByPlaceholder(/output/i)
page.getByTestId('job-queue')

// AVOID: Fragile CSS selectors
page.locator('.btn-primary')
page.locator('#create-job-btn')
```

---

## Regression Rules

### Hard Requirements

1. **UI changes require test changes** - If you modify a UI component, update its tests
2. **Failing UI tests block merge** - No PRs merged with red UI tests
3. **No temporary skips** - `test.skip()` is not allowed without tracking issue
4. **No manual testing fallback** - "Tested manually" is not acceptable

### CI Integration

| Trigger | Test Level |
|---------|-----------|
| PR touching `frontend/` | `verify-ui` |
| PR touching `backend/routes/` | `verify-ui` |
| Nightly | `verify-full` |
| Pre-release | `verify-full` |

---

## Verification Levels

| Level | Command | Includes |
|-------|---------|----------|
| Fast | `make verify-fast` | Lint, unit, schema |
| Standard | `make verify` | Fast + integration |
| UI | `make verify-ui` | Playwright E2E |
| Full | `make verify-full` | All of the above |

---

## Troubleshooting

### Common Issues

**Tests timeout waiting for element**
- Add `data-testid` to the element
- Check if element is conditionally rendered
- Increase timeout in `playwright.config.ts`

**Backend not responding**
- Ensure backend is running on port 8085
- Check `global-setup.ts` for startup logic
- Review logs in `logs/playwright-backend.log`

**File picker tests fail**
- Browser mode cannot use native dialogs
- Use text input path instead
- See `browser_vs_electron.spec.ts` for mode handling

---

## Final Authority

This document is **AUTHORITATIVE**. If there is conflict between this document and other documentation, this document wins for UI testing matters.

**Fail fast. Fail loud. No silent regressions.**

---

## Hardening Rules (MANDATORY)

### No Time-Based Waits

```typescript
// ❌ FORBIDDEN - Brittle, non-deterministic
await page.waitForTimeout(2000);
await page.waitForTimeout(300);

// ✅ REQUIRED - State-based, deterministic
await waitForAppReady(page);
await waitForDropdownOpen(page);
await waitForJobInQueue(page);
await waitForJobStatus(page, 'completed');
await waitForEmptyQueue(page);
```

### Assert Before AND After State Changes

```typescript
// ✅ CORRECT - Assert before/after
const countBefore = await jobs.count();
await createBtn.click();
await expect(jobs).toHaveCount(countBefore + 1);
```

### Filesystem Truth Validation

All E2E tests that create output files MUST validate:

```typescript
// ✅ REQUIRED for E2E tests
const validation = validateOutputFile(outputPath);
expect(validation.exists).toBe(true);
expect(validation.error).toBeUndefined();
expect(validation.codec).toBeDefined();
expect(validation.duration).toBeGreaterThan(0);
```

### Never Click Hidden/Disabled Elements

```typescript
// ✅ CORRECT - Wait for enabled state first
await expect(createBtn).toBeEnabled({ timeout: 5000 });
await createBtn.click();
```

---

## Debug Mode

For debugging failing tests:

```bash
# Headed mode (visible browser)
make verify-ui-debug

# Or directly:
cd qa/verify/ui && npx playwright test --headed --debug
```

On failure, check:
- `logs/playwright-report/` - HTML report
- `logs/playwright-artifacts/` - Screenshots, videos, traces
- Console output captured automatically

---

## CI Integration Rules

| Trigger | Action | Failure Behavior |
|---------|--------|------------------|
| PR → `frontend/` | Run `verify-ui` | Block merge |
| PR → `backend/routes/` | Run `verify-ui` | Block merge |
| Nightly build | Run `verify-full` | Alert team |
| Release tag | Run `verify-full` | Block release |

---

## Proxy v1 Release Gate

**Proxy v1 is ONLY shippable if:**

1. `make verify-full` passes with zero failures
2. All E2E tests validate filesystem output
3. No `test.skip()` exists without tracking issue
4. No `waitForTimeout` exists in any spec file

---

*Last updated: 21 December 2025*
