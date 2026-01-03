import { defineConfig } from '@playwright/test'

/**
 * Playwright configuration for Internal Audit E2E tests
 * 
 * Runs with E2E_AUDIT_MODE=1 to expose unsupported features.
 * These tests are DIAGNOSTIC - not required to pass for release.
 */
export default defineConfig({
  testDir: '.',
  
  /* Run tests serially (Electron can only run one instance at a time) */
  fullyParallel: false,
  workers: 1,
  
  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,
  
  /* Don't retry - these are diagnostic tests */
  retries: 0,
  
  /* Reporter to use */
  reporter: 'list',
  
  /* Shared settings for all the projects below */
  use: {
    /* Collect trace for all tests (diagnostic) */
    trace: 'on',
    
    /* Screenshot on failure */
    screenshot: 'on',
    
    /* Video for all tests (diagnostic) */
    video: 'on',
  },

  /* Timeout settings */
  timeout: 120_000, // 2 minutes per test
  expect: {
    timeout: 10_000, // 10s for assertions
  },
})
