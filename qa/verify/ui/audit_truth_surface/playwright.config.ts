import { defineConfig } from '@playwright/test'

/**
 * Playwright configuration for Truth Surface E2E tests
 * 
 * Tests verify that the UI is truthful about supported features:
 * - Only shows features that work
 * - No "coming soon" UI
 * - Validation respects submit intent
 * - Progress indicators are honest
 */
export default defineConfig({
  testDir: '.',
  
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
  timeout: 120_000, // 2 minutes per test
  expect: {
    timeout: 10_000, // 10s for assertions
  },
})
