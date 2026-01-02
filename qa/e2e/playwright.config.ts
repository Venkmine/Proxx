import { defineConfig } from '@playwright/test'

/**
 * Playwright configuration for Proxx Electron E2E tests
 * 
 * Tests verify end-to-end workflows in the Electron app:
 * - RAW proxy encoding
 * - Job creation and completion
 * - Engine routing
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
  timeout: 60_000, // 60s per test
  expect: {
    timeout: 10_000, // 10s for assertions
  },
})
