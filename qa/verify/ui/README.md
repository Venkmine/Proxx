# E2E Audit Test Suites

This directory contains two complementary E2E test suites for Proxx/Awaire Proxy.

## Directory Structure

```
qa/verify/ui/
├── audit_truth_surface/     # Truth Surface E2E tests (default mode)
│   ├── helpers.ts
│   ├── playwright.config.ts
│   ├── ffmpeg_delivery_progress.spec.ts
│   ├── raw_indeterminate_progress.spec.ts
│   ├── preview_failure_non_blocking.spec.ts
│   ├── validation_submit_intent.spec.ts
│   └── unsupported_features_hidden.spec.ts
│
├── audit_internal_mode/      # Internal Audit E2E tests (audit mode)
│   ├── helpers.ts
│   ├── playwright.config.ts
│   ├── audit_banner.spec.ts
│   └── exposed_features_smoke.spec.ts
│
└── visual_regression/        # Visual Verification Tests (MANDATORY for UI changes)
    ├── helpers.ts
    ├── visual_progress_visibility.spec.ts
    └── (other visual tests)
```

## Quick Start

### Prerequisites

1. Build the Electron app:
   ```bash
   cd frontend
   pnpm run electron:build
   ```

2. Ensure backend is running (if needed for tests):
   ```bash
   # In separate terminal
   make backend
   ```

### Running Tests

**Truth Surface Tests** (validates default UI honesty):
```bash
make verify-e2e-truth
```

**Internal Audit Tests** (validates audit mode features):
```bash
make verify-e2e-audit
```

**Generate Report**:
```bash
make verify-e2e-report
```

## Test Philosophy

### Truth Surface Tests (E2E_AUDIT_MODE=0)

These tests validate that the default UI is **honest** about what's supported:

- ✅ Only shows features that work
- ✅ No "coming soon" messaging
- ✅ No fake progress indicators
- ✅ Clear error messaging
- ✅ Unsupported features are hidden

**Release Criteria**: These tests MUST pass before releasing.

### Internal Audit Tests (E2E_AUDIT_MODE=1)

These tests are **diagnostic only** - they expose experimental features:

- 🔍 Verifies audit banner is visible
- 🔍 Smoke tests for exposed features
- 🔍 Documents incomplete implementations
- 🔍 Failures are expected and informational

**Release Criteria**: These tests do NOT block releases.

### Visual Regression Tests (MANDATORY)

**Any UI change requires visual verification via Electron screenshots.**

These tests validate that UI changes are **perceivable**, not just logically correct:

- 📸 Captures Electron screenshots at key states
- 📸 Validates screenshot files exist on disk
- 📸 Provides visual evidence for code review
- 📸 Prevents false confidence in CSS-only changes

**Rule:** NO SCREENSHOTS = NO VERIFIED FIX

SeeUI_VISUAL_VERIFICATION.md](../../../docs/UI_VISUAL_VERIFICATION.md) - **MANDATORY** visual verification policy
- [E2E_AUDIT_TESTING.md](../../../docs/E2E_AUDIT_TESTING.md) - Full E2E documentation
- [OBSERVABILITY_PRINCIPLES.md](../../../docs/OBSERVABILITY_PRINCIPLES.md) - Testing principles
- [QA.md](../../../docs/QA.md) - General QA
**Running Visual Tests**:
```bash
cd qa/verify/ui/visual_regression
pnpm test visual_progress_visibility.spec.ts
```

Screenshots are saved to: `artifacts/ui/visual/<timestamp>/<test-name>/`

## Artifacts

Tests automatically collect artifacts in `artifacts/ui/<timestamp>/`:

- Screenshots (PNG)
- DOM snapshots (HTML)
- Console logs
- Network logs

View the unified report at `artifacts/ui/<timestamp>/report.html`

## See Also

- [E2E_AUDIT_TESTING.md](../../../../docs/E2E_AUDIT_TESTING.md) - Full documentation
- [OBSERVABILITY_PRINCIPLES.md](../../../../docs/OBSERVABILITY_PRINCIPLES.md) - Testing principles
