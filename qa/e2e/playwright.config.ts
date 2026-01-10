import { defineConfig } from '@playwright/test'

/**
 * ⚠️ ELECTRON-ONLY QC GUARD ⚠️
 * 
 * This E2E test suite MUST be run against the real Electron application.
 * Running against Vite dev server or browser will cause immediate failure.
 * 
 * The guard ensures:
 * 1. E2E_TEST environment variable is set
 * 2. Tests use Electron _electron API, not HTTP browser
 * 3. All UI interactions go through real Electron IPC
 * 
 * To run these tests:
 *   cd frontend && npm run build
 *   E2E_TEST=true npx playwright test -c ../qa/e2e/playwright.config.ts
 * 
 * DO NOT:
 * - Run with Vite dev server
 * - Run in browser mode
 * - Skip the Electron-only guard check
 * 
 * TEST ORDERING:
 * 1. sacred_meta_test.spec.ts RUNS FIRST (tagged @sacred)
 *    - If this fails → entire suite aborts
 *    - This validates the basic "can a user run a job?" flow
 * 
 * 2. golden_path_ui_workflow.spec.ts RUNS SECOND
 *    - Full golden path with detailed assertions
 * 
 * 3. Other golden_path tests run after
 */

/**
 * Playwright configuration for Proxx Electron E2E tests
 * 
 * Tests verify end-to-end workflows in the Electron app:
 * - RAW proxy encoding
 * - Job creation and completion
 * - Engine routing
 * - FIFO queue execution
 * 
 * Backend Lifecycle (deterministic):
 * - globalSetup starts backend if not running
 * - globalTeardown stops backend if we started it
 * - One backend per test run
 */
export default defineConfig({
  testDir: '.',
  
  /* Global setup validates E2E environment and starts backend */
  globalSetup: './global-setup.ts',
  
  /* Global teardown stops backend if we started it */
  globalTeardown: './global-teardown.ts',
  
  /* 
   * Test matching order - SACRED TESTS FIRST
   * sacred_meta_test runs before all other tests.
   * If it fails, CI should abort immediately.
   */
  testMatch: [
    'sacred_meta_test.spec.ts',        // @sacred - MUST RUN FIRST
    'golden_path_ui_workflow.spec.ts', // Primary golden path
    'golden_path*.spec.ts',            // Other golden path variants
    'ui_qc_phase10.spec.ts',           // UI QC Phase 10 verification
    'watch_folder_enforcement.spec.ts', // Watch Folder E2E validation
    'phase_6_5_watch_folder_state.spec.ts', // Phase 6.5: Watch Folder State & Scalability
    'preset_persistence.spec.ts',       // Preset persistence validation
    'phase6_preset_truth.spec.ts',      // Phase 6: Preset system truth
    'workflow_matrix.spec.ts',         // Phase 5: All core workflows
    'button_coverage_audit.spec.ts',   // Phase 5: Zero dead UI
    'lifecycle_crosscheck.spec.ts',    // Phase 5: Truth convergence
    'regression_*.spec.ts',            // Regression tests
  ],
  
  /* Run tests serially (Electron can only run one instance at a time) */
  fullyParallel: false,
  workers: 1,
  
  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,
  
  /* 
   * NO RETRIES FOR SACRED TESTS
   * If the sacred test fails, it's a real failure, not flakiness.
   * Other tests can retry on CI.
   */
  retries: process.env.CI ? 1 : 0,
  
  /* Reporter to use - include HTML report for detailed analysis */
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: '../../artifacts/ui/playwright-report' }],
    ['json', { outputFile: '../../artifacts/ui/test-results.json' }],
  ],
  
  /* Shared settings for all the projects below */
  use: {
    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',
    
    /* Screenshot on failure */
    screenshot: 'only-on-failure',
    
    /* Video on failure - critical for debugging sacred test issues */
    video: 'retain-on-failure',
  },

  /* Timeout settings */
  timeout: 300_000, // 5 minutes per test (for comprehensive tests)
  expect: {
    timeout: 30_000, // 30s for assertions
  },
  
  /* Output directory for test artifacts */
  outputDir: '../../artifacts/ui/test-results',
})
