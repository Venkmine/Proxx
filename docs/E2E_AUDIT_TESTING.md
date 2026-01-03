# E2E Audit Testing Strategy

## Overview

The Proxx/Awaire Proxy E2E testing strategy consists of two complementary modes:

1. **Truth Surface E2E** - Validates that the default UI is honest about supported features
2. **Internal Audit E2E** - Exposes experimental/unsupported features for diagnostic testing

## Design Principles

### UI Truthfulness

The core principle: **visibility implies support**. If a feature is shown in the UI, it must work. Conversely, features that are not yet ready MUST NOT be visible in the default mode.

**Non-negotiables:**
- No "coming soon" messaging in production UI
- No disabled/grayed-out controls that "will work later"
- Validation errors only show after submit attempt (respect `hasSubmitIntent`)
- Preview failures do not block delivery job creation
- RAW jobs show indeterminate progress (no fake percentages)

### Two-Mode Strategy

#### Default Mode (E2E_AUDIT_MODE=0)
- Shows only production-ready features
- Truth Surface E2E tests validate honesty
- This is what users see

#### Audit Mode (E2E_AUDIT_MODE=1)
- Exposes experimental/unsupported features
- Displays persistent warning banner
- Internal Audit E2E tests are diagnostic only
- NOT required to pass for release

## Running Tests

### Prerequisites

Build the Electron app first:
```bash
cd frontend
pnpm run electron:build
```

### Truth Surface E2E Tests

Tests that validate UI honesty in default mode:

```bash
# Using npm script
cd frontend
pnpm run test:e2e:truth

# Using make target
make verify-e2e-truth
```

**Test coverage:**
- FFmpeg delivery job shows honest progress UI
- RAW jobs show indeterminate spinner (no fake percent)
- Preview failure does not block delivery
- Validation errors respect submit intent
- Unsupported features are hidden

### Internal Audit E2E Tests

Diagnostic tests for exposed features in audit mode:

```bash
# Using npm script
cd frontend
pnpm run test:e2e:audit

# Using make target
make verify-e2e-audit
```

**Test coverage:**
- Audit mode banner is visible
- Watch folders UI (if exposed)
- Autonomous ingestion UI (if exposed)
- Settings/configuration panels
- Overlays/burnins UI (if exposed)

**Note:** These tests are diagnostic. Failures indicate features are not yet implemented, which is expected.

### Generating Audit Reports

After running tests, generate a unified HTML report:

```bash
# Using npm script
cd frontend
pnpm run test:e2e:report

# Using make target
make verify-e2e-report

# Manual with specific timestamp
node scripts/build_e2e_audit_report.mjs 2026-01-03T12-34-56-789Z
```

The report includes:
- Screenshots for each test step
- DOM snapshots
- Console logs
- Network logs
- Summary statistics

Reports are written to: `artifacts/ui/<timestamp>/report.html`

## Artifact Collection

Truth Surface tests automatically collect artifacts for each step:

```
artifacts/ui/<timestamp>/
├── <scenario-name>/
│   ├── <step-name>/
│   │   ├── screenshot.png
│   │   ├── dom.html
│   │   ├── console.log
│   │   └── network.log
│   └── ...
├── ...
└── report.html
```

Artifacts are useful for:
- Debugging test failures
- Documenting UI behavior
- Compliance/audit trails
- Visual regression testing

## Implementation Details

### Audit Mode Flag

The `E2E_AUDIT_MODE` environment variable controls which features are exposed:

**In Electron main process:**
```typescript
writeLog('INFO', `E2E_AUDIT_MODE: ${process.env.E2E_AUDIT_MODE || '0'}`)
```

**In preload:**
```typescript
const E2E_AUDIT_MODE = process.env.E2E_AUDIT_MODE === '1'

contextBridge.exposeInMainWorld('electron', {
  // ... other APIs
  isAuditMode: () => E2E_AUDIT_MODE,
})
```

**In renderer:**
```typescript
const isAuditMode = window.electron?.isAuditMode?.() === true
```

### Audit Mode Banner

When `E2E_AUDIT_MODE=1`, a persistent banner appears at the top of the app:

```tsx
<AuditModeBanner />
```

The banner:
- Is always visible (cannot be dismissed)
- Displays: "INTERNAL AUDIT MODE (UNSUPPORTED FEATURES EXPOSED)"
- Uses high-contrast red styling
- Has `data-testid="audit-mode-banner"` for testing

### Guarding Features

Features should check audit mode before rendering:

```tsx
// Feature should ONLY show in audit mode
const isAuditMode = window.electron?.isAuditMode?.() === true

if (!isAuditMode) {
  return null
}

return <WatchFoldersPanel />
```

Or inversely, hide features in audit mode:

```tsx
// Show only in default mode
const isAuditMode = window.electron?.isAuditMode?.() === true

if (isAuditMode) {
  // In audit mode, show additional debug info
  return <DebugInfoPanel />
}

return <StandardPanel />
```

## Testing Best Practices

### Truth Surface Tests

1. **Focus on negative assertions**: Verify unsupported features are NOT visible
2. **Test real workflows**: Job creation, progress tracking, error handling
3. **Capture artifacts**: Every step should save screenshot, DOM, logs
4. **No mocking**: Use real backend (or documented mock layer)

### Internal Audit Tests

1. **Expect failures**: These tests document incomplete features
2. **Smoke test only**: Just verify no crashes, basic rendering
3. **Document intent**: Each test should explain what SHOULD happen when complete
4. **Never block release**: Audit test failures are informational only

## CI/CD Integration

### Recommended Pipeline

```yaml
test-truth-surface:
  runs-on: macos-latest
  steps:
    - checkout
    - setup-node
    - cd frontend && pnpm install
    - pnpm run electron:build
    - pnpm run test:e2e:truth
    - upload artifacts if failed

test-internal-audit:
  runs-on: macos-latest
  allow-failure: true  # Diagnostic only
  steps:
    - checkout
    - setup-node
    - cd frontend && pnpm install
    - pnpm run electron:build
    - pnpm run test:e2e:audit
    - pnpm run test:e2e:report
    - upload report artifacts
```

### Release Criteria

**Truth Surface tests MUST pass** before releasing.

**Internal Audit tests are informational** - failures do not block release.

## Troubleshooting

### Electron Build Issues

```bash
cd frontend
pnpm run electron:build
```

Verify `frontend/dist-electron/main.mjs` exists.

### Test Timeouts

Tests use 2-minute timeout by default. Increase if needed:

```typescript
// In playwright.config.ts
timeout: 180_000, // 3 minutes
```

### Artifacts Not Generated

Ensure `artifacts/ui/` directory exists and is writable:

```bash
mkdir -p artifacts/ui
chmod 755 artifacts/ui
```

### Audit Banner Not Showing

Verify environment variable is set:

```bash
E2E_AUDIT_MODE=1 pnpm run test:e2e:audit
```

Check preload exposes `isAuditMode`:

```javascript
// In browser console
window.electron.isAuditMode()  // Should return true
```

## Future Enhancements

- [ ] Visual regression testing (screenshot diffs)
- [ ] Performance metrics collection
- [ ] Accessibility audits (axe-core integration)
- [ ] Network traffic recording/replay
- [ ] Cross-platform testing (Windows, Linux)
- [ ] Parallel test execution (when backend supports it)

## References

- [Playwright Documentation](https://playwright.dev/)
- [Electron Testing Guide](https://www.electronjs.org/docs/latest/tutorial/automated-testing)
- `qa/verify/ui/audit_truth_surface/` - Truth surface test suite
- `qa/verify/ui/audit_internal_mode/` - Internal audit test suite
- `scripts/build_e2e_audit_report.mjs` - Report generator
