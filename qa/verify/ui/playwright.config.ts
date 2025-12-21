/**
 * Playwright Configuration for Awaire Proxy UI Verification
 * 
 * AUTHORITATIVE: This configuration drives all UI end-to-end testing.
 * 
 * HARDENED FOR PRODUCTION:
 * - Fixed viewport for deterministic screenshots
 * - Disabled animations for consistent timing
 * - Forced locale/timezone for reproducibility
 * - Full trace + screenshot capture on failure
 * - Console log capture for debugging
 * 
 * Usage:
 * - npx playwright test                 # Run all UI tests
 * - npx playwright test --project=browser  # Browser mode only
 * - npx playwright test --headed        # See browser window (make verify-ui-debug)
 * - npx playwright test --debug          # Step through tests
 */

import { defineConfig, devices } from '@playwright/test';

// Environment configuration
const CI = !!process.env.CI;
const DEBUG = !!process.env.DEBUG;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8085';

export default defineConfig({
  testDir: './proxy',
  
  /* Maximum time one test can run for */
  timeout: 90 * 1000,
  
  /* Expect timeout for assertions */
  expect: {
    timeout: 15 * 1000,
  },
  
  /* Run tests in parallel - disabled for queue state consistency */
  fullyParallel: false,
  
  /* Fail the build on CI if you accidentally left test.only in source */
  forbidOnly: CI,
  
  /* No retries - do not hide flakiness */
  retries: 0,
  
  /* Single worker to ensure test isolation */
  workers: 1,
  
  /* Reporter configuration */
  reporter: [
    ['list'],
    ['html', { outputFolder: '../../../logs/playwright-report', open: 'never' }],
    ['json', { outputFile: '../../../logs/playwright-results.json' }],
  ],
  
  /* Shared settings for all projects - HARDENED FOR DETERMINISM */
  use: {
    /* Base URL for page.goto() calls */
    baseURL: FRONTEND_URL,
    
    /* ALWAYS collect trace for debugging failed tests */
    trace: 'retain-on-failure',
    
    /* ALWAYS capture screenshot on failure */
    screenshot: 'only-on-failure',
    
    /* ALWAYS record video on failure */
    video: 'retain-on-failure',
    
    /* Timeout for actions like click, fill */
    actionTimeout: 15 * 1000,
    
    /* Timeout for navigation */
    navigationTimeout: 30 * 1000,
    
    /* Fixed viewport for deterministic rendering */
    viewport: { width: 1280, height: 800 },
    
    /* Force consistent locale for date/number formatting */
    locale: 'en-US',
    
    /* Force consistent timezone */
    timezoneId: 'UTC',
    
    /* Ignore HTTPS errors for local development */
    ignoreHTTPSErrors: true,
    
    /* Reduce motion for consistent animations */
    reducedMotion: 'reduce',
    
    /* Color scheme for consistent styling */
    colorScheme: 'dark',
  },
  
  /* Configure projects for browser testing */
  projects: [
    {
      name: 'browser',
      use: {
        ...devices['Desktop Chrome'],
        // Fixed channel for reproducibility
        channel: 'chromium',
        // Browser mode: folder picker fallback to text input
        contextOptions: {
          permissions: [],
        },
        // Launch options for consistency
        launchOptions: {
          // Disable GPU for CI consistency
          args: CI ? ['--disable-gpu', '--no-sandbox'] : [],
        },
      },
      testMatch: /.*\.spec\.ts$/,
      testIgnore: /electron\.spec\.ts$/,
    },
    // Electron project - requires separate setup
    // Uncomment when Electron testing is implemented
    // {
    //   name: 'electron',
    //   testMatch: /.*electron\.spec\.ts$/,
    // },
  ],
  
  /* Global setup - ensures backend and frontend are running */
  globalSetup: require.resolve('./global-setup'),
  
  /* Global teardown - cleanup */
  globalTeardown: require.resolve('./global-teardown'),
  
  /* Output folder for test artifacts */
  outputDir: '../../../logs/playwright-artifacts',
  
  /* Preserve output on failure for debugging */
  preserveOutput: 'failures-only',
});

// Export URLs for use in tests
export { FRONTEND_URL, BACKEND_URL };

/**
 * ⚠️ DO NOT start Vite or backend servers from Playwright or Verify.
 *
 * The frontend MUST be started manually before running UI tests.
 * Copilot must not add webServer, pnpm run dev, or port management here.
 */
