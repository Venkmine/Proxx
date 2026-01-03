# Phase H-UI: Delivery Progress Tests

## Purpose

These Playwright tests **enforce** that delivery progress is **visibly rendered** in the UI. They test the complete data flow from backend → API → React state → DOM.

## What These Tests Verify

1. **FFmpeg jobs** show stage progression: `Queued → Starting → Encoding → Completed`
2. **Progress bars** appear during Encoding phase (determinate)
3. **Resolve jobs** show indeterminate spinners (no fake percentages)
4. **Fast jobs** show intermediate states (no instant Queued → Completed jumps)
5. **ETA** only appears when real encoding speed data exists
6. **React re-renders** propagate delivery_stage changes to the DOM

## Prerequisites

### 1. Services Running

You need **both** backend and frontend running:

```bash
# Terminal 1: Start backend
cd /Users/leon.grant/projects/Proxx
python forge.py

# Terminal 2: Start frontend
cd /Users/leon.grant/projects/Proxx/frontend
npm run dev
```

Or use the all-in-one launcher:

```bash
cd /Users/leon.grant/projects/Proxx
make dev
```

### 2. Test Files

Tests need these sample files:
- `forge-tests/samples/standard/mp4_h264/sample_h264.mp4` (FFmpeg tests)
- `forge-tests/samples/RAW/BLACKMAGIC/BMPCC6K Indie Film BRAW/A001_06260430_C007.braw` (Resolve tests)

If missing, tests will skip gracefully.

### 3. Playwright Installed

```bash
cd /Users/leon.grant/projects/Proxx/qa/e2e
npm install
npx playwright install
```

## Running Tests

### All Tests (Headless)

```bash
cd /Users/leon.grant/projects/Proxx/qa/e2e
npx playwright test phase_h_delivery_progress.spec.ts
```

### All Tests (Headed - Watch Browser)

```bash
cd /Users/leon.grant/projects/Proxx/qa/e2e
npx playwright test phase_h_delivery_progress.spec.ts --headed
```

### Single Test

```bash
npx playwright test phase_h_delivery_progress.spec.ts -g "FFmpeg job shows all delivery stages"
```

### Debug Mode

```bash
npx playwright test phase_h_delivery_progress.spec.ts --debug
```

### UI Mode (Interactive)

```bash
npx playwright test phase_h_delivery_progress.spec.ts --ui
```

## Test Structure

### Positive Tests

1. **FFmpeg job shows all delivery stages in order**
   - Verifies stage progression: Starting → Encoding → Completed
   - Asserts each stage is visible in DOM before next appears

2. **FFmpeg job shows determinate progress bar during encoding**
   - Waits for Encoding stage
   - Asserts progress bar is visible
   - Verifies bar width > 0

3. **Resolve job shows indeterminate spinner (no percentage)**
   - Waits for Encoding stage
   - Asserts indeterminate spinner exists
   - Verifies NO determinate progress bar
   - Verifies NO percentage text in DOM

4. **Fast job shows intermediate states (no instant jump)**
   - Records all stages seen during job lifecycle
   - Asserts at least one intermediate stage was visible
   - Prevents Queued → Completed instant jumps

5. **FFmpeg job shows ETA, Resolve job does not**
   - FFmpeg: Asserts ETA element exists (once speed calculated)
   - Resolve: Asserts ETA element does NOT exist

6. **Progress updates are reflected in DOM**
   - Measures progress bar width at T=0
   - Waits 2 seconds
   - Measures progress bar width at T=2
   - Asserts width increased (progress advanced)

### Regression Tests

7. **MUST FAIL: Progress never appears**
   - This test should PASS if progress appears correctly
   - If it fails with timeout, progress is broken

8. **MUST FAIL: Job jumps from Queued to Completed**
   - Validates that intermediate stages were visible
   - Complements test #4

## Test Helpers

### `waitForDeliveryStage(page, jobId, stage, timeout)`

Waits for a specific delivery stage to appear in the DOM.

**Reactor Guard**: This helper waits for ACTUAL UI updates, not backend state. If the stage never appears in the DOM, the test WILL FAIL.

```typescript
await waitForDeliveryStage(page, jobId, 'Encoding', 30000)
```

### `waitForProgressBar(page, jobId, timeout)`

Waits for determinate progress bar to be visible.

```typescript
await waitForProgressBar(page, jobId)
```

### `waitForIndeterminateSpinner(page, jobId, timeout)`

Waits for indeterminate spinner to be visible (Resolve jobs).

```typescript
await waitForIndeterminateSpinner(page, jobId)
```

### `assertETAVisible(page, jobId)`

Asserts that ETA is visible in the DOM.

```typescript
await assertETAVisible(page, jobId)
```

### `assertETANotVisible(page, jobId)`

Asserts that ETA is NOT visible in the DOM.

```typescript
await assertETANotVisible(page, jobId)
```

## Test Data Selectors

Tests rely on these `data-testid` attributes:

- `data-job-id="{jobId}"` - Job card container
- `data-testid="app-root"` - App root element
- `data-testid="progress-bar-container"` - Determinate progress bar container
- `data-testid="progress-bar-fill"` - Progress bar fill element
- `data-testid="progress-bar-indeterminate"` - Indeterminate progress bar
- `data-testid="progress-spinner"` - Spinner for active stages
- `data-testid="progress-eta"` - ETA text element

## Expected Behavior

### FFmpeg Jobs

1. Stage: `Queued` (initial)
2. Stage: `Starting` (brief, may be skipped on fast jobs)
3. Stage: `Encoding` + determinate progress bar + ETA (if speed known)
4. Stage: `Completed`

### Resolve Jobs

1. Stage: `Queued` (initial)
2. Stage: `Starting` (brief)
3. Stage: `Encoding` + indeterminate spinner (NO progress bar, NO ETA)
4. Stage: `Completed`

## Failure Modes

### Test Fails: "Delivery stage never appeared"

**Cause**: React state updates not propagating to DOM.

**Debug**:
1. Check browser console for errors
2. Verify `delivery_stage` is in API response (`/monitor/jobs`)
3. Confirm `JobProgressBar` receives `delivery_stage` prop
4. Check React DevTools for state updates

### Test Fails: "Progress bar never appeared"

**Cause**: `showProgress` condition not met in `JobProgressBar`.

**Debug**:
1. Verify `progress_percent > 0` in API response
2. Check `showProgress` logic in JobProgressBar.tsx
3. Confirm progress callback is firing in JobEngine

### Test Fails: "ETA should not be visible"

**Cause**: ETA shown for Resolve jobs (violates honesty rule).

**Debug**:
1. Check `showETA` logic in JobProgressBar.tsx
2. Verify `eta_seconds` is `null` for Resolve jobs
3. Confirm Resolve engine doesn't send ETA

## Environment Variables

- `BACKEND_URL` - Backend API URL (default: `http://127.0.0.1:8085`)
- `FRONTEND_URL` - Frontend URL (default: `http://127.0.0.1:5173`)

Override for custom setups:

```bash
BACKEND_URL=http://localhost:8000 FRONTEND_URL=http://localhost:5000 npx playwright test phase_h_delivery_progress.spec.ts
```

## CI Integration

For CI pipelines, use headless mode with retries:

```bash
npx playwright test phase_h_delivery_progress.spec.ts --retries=2 --reporter=github
```

## Troubleshooting

### Services Not Running

**Error**: `net::ERR_CONNECTION_REFUSED`

**Solution**: Start backend and frontend first (see Prerequisites).

### Test Files Missing

**Error**: `Test RAW file not found`

**Solution**: Tests skip gracefully if files don't exist. Add files or ignore skipped tests.

### Timeout Errors

**Error**: `Timeout 30000ms exceeded`

**Solution**:
1. Increase timeout in test code
2. Check if backend is healthy (`curl http://127.0.0.1:8085/health`)
3. Verify frontend is responding (`curl http://127.0.0.1:5173`)
4. Check if job is stuck (backend logs)

### React Not Re-Rendering

**Error**: Stage visible in API but not in DOM

**Solution**:
1. Verify `fetchJobs()` updates `jobs` state in App.tsx
2. Check `useEffect` polling is active (500ms/1.5s intervals)
3. Confirm `JobGroup` receives updated props
4. Use React DevTools to trace prop flow

## Related Files

- [/backend/app/jobs/models.py](../../backend/app/jobs/models.py) - DeliveryStage enum
- [/backend/app/jobs/engine.py](../../backend/app/jobs/engine.py) - Stage transitions
- [/backend/app/monitoring/queries.py](../../backend/app/monitoring/queries.py) - API exports
- [/frontend/src/components/JobProgressBar.tsx](../../frontend/src/components/JobProgressBar.tsx) - Progress UI
- [/frontend/src/App.tsx](../../frontend/src/App.tsx) - Polling logic

## Phase H Compliance

These tests enforce Phase H requirements:

✅ **Honesty**: No fake progress, no misleading ETAs  
✅ **Visibility**: All stages must appear in DOM  
✅ **Determinism**: Stage transitions follow predictable order  
✅ **Reactor Pattern**: Wait for UI updates, not backend state  
✅ **Regression Guard**: Tests fail if progress disappears

---

**Last Updated**: 2026-01-03  
**Phase**: H-UI (Visible Delivery Progress Enforcement)
