# Proxx E2E Tests

Automated end-to-end tests for Proxx using Playwright + Electron.

## Prerequisites

1. **Electron build** must exist:
   ```bash
   cd frontend
   pnpm run electron:build
   ```

2. **Backend** should be running (optional - tests can run in mock mode):
   ```bash
   cd backend
   source ../.venv/bin/activate
   uvicorn app.main:app --host 127.0.0.1 --port 8085
   ```

3. **Test RAW files** must exist in:
   ```
   forge-tests/samples/RAW/
   ```

## Running Tests

### Quick run (headless)
```bash
cd frontend
pnpm run test:e2e
```

### Interactive UI mode
```bash
cd frontend
pnpm run test:e2e:ui
```

### Debug mode (step through)
```bash
cd frontend
pnpm run test:e2e:debug
```

### Direct Playwright commands
```bash
cd qa/e2e
E2E_TEST=true npx playwright test
E2E_TEST=true npx playwright test --ui
E2E_TEST=true npx playwright test --headed
```

## Test Mode

When `E2E_TEST=true` is set:

- **ResolveEngine** skips real Resolve execution
- Mock execution creates fake proxy files
- Realistic progress/timing is simulated
- Tests verify UI → backend → engine routing → completion flow

## Test Structure

```
qa/e2e/
├── playwright.config.ts     # Playwright configuration
├── helpers.ts               # Test utilities and fixtures
├── raw_proxy_encode.spec.ts # RAW proxy encoding test
└── temp_output/             # Temporary test outputs (gitignored)
```

## What's Tested

### `raw_proxy_encode.spec.ts`

1. ✅ RAW file selection
2. ✅ Job creation via backend API
3. ✅ Engine routing (Resolve, not FFmpeg)
4. ✅ Job status transitions (QUEUED → RUNNING → COMPLETED)
5. ✅ Output proxy file creation
6. ✅ Resolve preset requirement enforcement

## Troubleshooting

### "Electron main not found"
```bash
cd frontend
pnpm run electron:build
```

### "Test RAW file not found"
Ensure RAW files exist in `forge-tests/samples/RAW/BLACKMAGIC/`

### "Backend connection failed"
Tests should work in mock mode, but for full integration:
```bash
cd backend
source ../.venv/bin/activate
E2E_TEST=true uvicorn app.main:app --host 127.0.0.1 --port 8085
```

### View test artifacts
After test run:
```bash
cd qa/e2e
open test-results/     # Screenshots
open playwright-report/ # HTML report
```

## CI/CD Integration

```yaml
- name: Build Electron
  run: cd frontend && pnpm run electron:build

- name: Run E2E Tests
  run: cd frontend && pnpm run test:e2e
  env:
    E2E_TEST: true
    CI: true
```

## Test Coverage

- ✅ RAW proxy encoding (BRAW, R3D, ProRes RAW, ARRI)
- ✅ Engine routing validation
- ✅ Job lifecycle management
- ⏸️ Preview generation (out of scope)
- ⏸️ Real Resolve rendering (mocked in test mode)
