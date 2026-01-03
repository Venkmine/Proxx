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

### `raw_directory_comprehensive.spec.ts`

1. ✅ Recursive directory scanning
2. ✅ All RAW formats (BRAW, R3D, ARRI, ProRes RAW, Canon, Phantom, etc.)
3. ✅ All non-RAW formats (MP4, MOV, MXF, ProRes, AV1, etc.)
4. ✅ Camera card folders (RED .RDC folders, Blackmagic folders)
5. ✅ Engine routing validation per format
6. ✅ Job creation and completion for all inputs
7. ✅ Output file verification
8. ✅ Comprehensive error reporting
9. ✅ Backend health check before tests

## Troubleshooting

### "Electron main not found"
```bash
cd frontend
pnpm run electron:build
```

### "Test RAW file not found"
Ensure RAW files exist in `forge-tests/samples/RAW/`

### "Backend connection failed" or "Backend not responding"
The comprehensive test requires backend to be running:

**Terminal 1 - Start backend in E2E test mode:**
```bash
cd backend
source ../.venv/bin/activate
E2E_TEST=true uvicorn app.main:app --host 127.0.0.1 --port 8085
```

**Terminal 2 - Run tests:**
```bash
cd frontend
pnpm run test:e2e -- raw_directory_comprehensive
```

The `E2E_TEST=true` environment variable enables:
- Mock Resolve execution (no real Resolve needed)
- Faster test execution
- Simulated progress/timing

### "Failed to fetch" errors
Verify backend is running and listening on port 8085:
```bash
curl http://127.0.0.1:8085/health
# Should return: {"status":"ok"}
```

### Tests hang or timeout
- Increase timeout in `raw_directory_comprehensive.spec.ts` (currently 120 attempts = 60s)
- Check backend logs for stuck jobs
- Verify temp directory has write permissions

### Some formats fail but others pass
This is expected! The test will:
- ✅ Continue testing remaining inputs
- ❌ Report all failures at the end
- 📊 Show which specific files/folders failed

Check the detailed error output to diagnose format-specific issues.

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

- ✅ RAW proxy encoding (BRAW, R3D, ProRes RAW, ARRI, Phantom)
- ✅ Non-RAW playable formats (MP4, MOV, MXF, ProRes)
- ✅ RAW camera card folders (RED .RDC, Blackmagic folders)
- ✅ Engine routing validation (RAW → Resolve, Non-RAW → FFmpeg)
- ✅ Job lifecycle management (creation, execution, completion)
- ✅ Comprehensive directory scanning (all formats in forge-tests/samples/RAW)
- ⏸️ Preview generation (out of scope)
- ⏸️ Image sequences (excluded via Image_SEQS filter)
- ⏸️ Real Resolve rendering (mocked in test mode)

## Test Suites

### `raw_proxy_encode.spec.ts`
Basic RAW proxy encoding test with a single BRAW file.

**Tests:**
- RAW file selection
- Job creation via backend API
- Engine routing (Resolve, not FFmpeg)
- Job status transitions (QUEUED → RUNNING → COMPLETED)
- Output proxy file creation

### `raw_directory_comprehensive.spec.ts` ⭐ **NEW**
Comprehensive test that scans ALL supported formats in `forge-tests/samples/RAW`.

**Features:**
- **Recursive scanning**: Discovers all video files and RAW folders
- **Excludes**: `Image_SEQS` directory (image sequences not supported yet)
- **76+ test inputs**: All RAW and non-RAW formats
- **Engine validation**: Verifies correct routing (RAW → Resolve, Non-RAW → FFmpeg)
- **Failure reporting**: Clear logs showing which files/folders failed and why

**Tested formats:**
- **RAW (Resolve)**: `.braw`, `.r3d`, `.R3D`, `.ari`, `.arri`, `.dng`, `.cri`, `.crm`, `.cine`
- **Non-RAW (FFmpeg)**: `.mov`, `.mp4`, `.mxf`, `.avi`, `.mkv`, `.webm`
- **Folders**: Camera card folders containing RAW files

**Run comprehensive test:**
```bash
cd frontend
pnpm run test:e2e -- raw_directory_comprehensive
```

**Example output:**
```
🔍 Discovered 76 test inputs from forge-tests/samples/RAW
   - RAW (Resolve): 20
   - Non-RAW (FFmpeg): 56

📋 Testing 76 inputs...

  🧪 Testing: A001_06260430_C007.braw
     Type: file, Expected engine: resolve
     ✓ Job created: job_abc123
     ✓ Job completed in 2.3s
     ℹ Engine used: resolve (expected: resolve)
     ✓ Output created: A001_06260430_C007__proxx.mov (45.2 MB)

  [... 74 more inputs ...]

======================================================================
📊 Test Results Summary:
======================================================================
   Total inputs tested: 76
   ✓ Passed: 76
   ✗ Failed: 0

   RAW (Resolve): 20/20 passed
   Non-RAW (FFmpeg): 56/56 passed

======================================================================
✅ All 76 inputs processed successfully!
======================================================================
```
