/**
 * Playwright Configuration for Awaire Proxy UI Verification
 * 
 * AUTHORITATIVE: This configuration drives all UI end-to-end testing.
 * 
 * Modes:
 * - Browser mode: Tests the Vite dev server (http://localhost:5173)
 * - Electron mode: Tests the packaged Electron app
 * 
 * Usage:
 * - npx playwright test                 # Run all UI tests
 * - npx playwright test --project=browser  # Browser mode only
 * - npx playwright test --project=electron # Electron mode only
 * - npx playwright test --headed        # See browser window
 * - npx playwright test --debug          # Step through tests
 */

import { defineConfig, devices } from '@playwright/test';

// Environment configuration
const CI = !!process.env.CI;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8085';

export default defineConfig({
  testDir: './proxy',
  
  /* Maximum time one test can run for */
  timeout: 60 * 1000,
  
  /* Expect timeout for assertions */
  expect: {
    timeout: 10 * 1000,
  },
  
  /* Run tests in parallel - disabled for queue state consistency */
  fullyParallel: false,
  
  /* Fail the build on CI if you accidentally left test.only in source */
  forbidOnly: CI,
  
  /* Retry failed tests - more retries in CI */
  retries: CI ? 2 : 0,
  
  /* Single worker to ensure test isolation */
  workers: 1,
  
  /* Reporter configuration */
  reporter: [
    ['list'],
    ['html', { outputFolder: '../../../logs/playwright-report', open: 'never' }],
    ['json', { outputFile: '../../../logs/playwright-results.json' }],
  ],
  
  /* Shared settings for all projects */
  use: {
    /* Base URL for page.goto() calls */
    baseURL: FRONTEND_URL,
    
    /* Collect trace when retrying failed test */
    trace: 'on-first-retry',
    
    /* Capture screenshot on failure */
    screenshot: 'only-on-failure',
    
    /* Record video on failure */
    video: 'on-first-retry',
    
    /* Timeout for actions like click, fill */
    actionTimeout: 10 * 1000,
    
    /* Timeout for navigation */
    navigationTimeout: 30 * 1000,
  },
  
  /* Configure projects for browser testing */
  projects: [
    {
      name: 'browser',
      use: {
        ...devices['Desktop Chrome'],
        // Browser mode: folder picker fallback to text input
        contextOptions: {
          permissions: [],
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
});

// Export URLs for use in tests
export { FRONTEND_URL, BACKEND_URL };
