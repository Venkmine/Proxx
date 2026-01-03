# Proxx E2E Tests

Automated end-to-end UI tests for Proxx using Playwright + Electron.

**⚠️ IMPORTANT: Test Architecture Split**

This directory contains **UI-only E2E tests** using mocked backend responses.  
For **backend integration tests** (actual encoding), see: `backend/tests/test_raw_encode_matrix.py`

## Test Architecture

### UI E2E Tests (This Directory)
- **Purpose**: Test Electron UI behavior and user interactions
- **Technology**: Playwright + Electron
- **Backend**: Mocked responses (no real encoding)
- **Tests**:
  - Job rows appear in UI
  - Status transitions display correctly
  - Error messages render properly
  - "Generate proxy to play" messaging for RAW sources

### Backend Integration Tests (`backend/tests/`)
- **Purpose**: Test actual job creation, encoding, and file output
- **Technology**: pytest + FastAPI TestClient
- **Backend**: Real backend API (with mocked Resolve in E2E_TEST mode)
- **Tests**:
  - Job creation via API
  - Engine routing (RAW → Resolve, non-RAW → FFmpeg)
  - Job execution completion
  - Output file validation

**File:** `backend/tests/test_raw_encode_matrix.py`

## Prerequisites

1. **Electron build** must exist:
   ```bash
   cd frontend
   pnpm run electron:build
   ```

2. **Backend NOT required** - UI tests use mocked responses

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

**UI E2E tests use MOCKED backend responses:**
- No real backend required
- Fast execution
- Tests UI behavior only

**For real encoding tests, run backend integration tests:**
```bash
cd backend
pytest tests/test_raw_encode_matrix.py -v
```

This will test:
- Real job creation
- Engine routing
- Execution completion  
- Output file validation

Against ALL files in `forge-tests/samples/RAW`

## Test Structure

```
qa/e2e/
├── playwright.config.ts          # Playwright configuration
├── helpers.ts                    # Test utilities and fixtures  
├── raw_proxy_encode.spec.ts      # Basic RAW UI test
├── raw_directory_comprehensive.spec.ts # Comprehensive UI test (mocked backend)
└── temp_output/                  # Temporary test outputs (gitignored)

backend/tests/
└── test_raw_encode_matrix.py     # ⭐ Backend integration tests for actual encoding
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

### Want to test actual encoding?
UI E2E tests use mocked backend. For real encoding tests:

```bash
cd backend
pytest tests/test_raw_encode_matrix.py -v
```

This runs:
- Real backend job creation
- Actual engine routing
- Full encode execution (with mocked Resolve in E2E_TEST mode)
- Output file validation

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

### `raw_directory_comprehensive.spec.ts` ⭐ **UI-ONLY with Mocked Backend**
Comprehensive UI test that validates UI behavior for all RAW/non-RAW formats.

**Features:**
- **Mocked backend** - No real API calls
- **Fast execution** - No actual encoding
- **UI validation** - Job rows, status display, error handling
- **59 format samples** - Comprehensive UI coverage

**What it tests:**
1. ✅ Job creation UI interaction
2. ✅ Status display in UI
3. ✅ RAW format messaging ("Generate proxy to play")
4. ✅ Error state rendering

**What it does NOT test:**
- ❌ Actual encoding
- ❌ Engine routing validation
- ❌ Output file creation
- ❌ Real backend API

**For actual encoding tests, see:** `backend/tests/test_raw_encode_matrix.py`
