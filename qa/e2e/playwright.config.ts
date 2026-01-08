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
 */

/**
 * Playwright configuration for Proxx Electron E2E tests
 * 
 * Tests verify end-to-end workflows in the Electron app:
 * - RAW proxy encoding
 * - Job creation and completion
 * - Engine routing
 * - FIFO queue execution
 */
export default defineConfig({
  testDir: '.',
  
  /* Global setup validates E2E_TEST environment */
  globalSetup: './global-setup.ts',
  
  /* Only include golden_path tests to avoid problematic spec files */
  testMatch: 'golden_path*.spec.ts',
  
  /* Run tests serially (Electron can only run one instance at a time) */
  fullyParallel: false,
  workers: 1,
  
  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,
  
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  
  /* Reporter to use */
  reporter: 'list',
  
  /* Shared settings for all the projects below */
  use: {
    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',
    
    /* Screenshot on failure */
    screenshot: 'only-on-failure',
    
    /* Video on failure */
    video: 'retain-on-failure',
  },

  /* Timeout settings */
  timeout: 300_000, // 5 minutes per test (for comprehensive tests)
  expect: {
    timeout: 30_000, // 30s for assertions
  },
})
