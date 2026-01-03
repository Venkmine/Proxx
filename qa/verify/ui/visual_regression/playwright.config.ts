/**
 * Playwright Configuration for Visual Regression Tests
 * 
 * MANDATORY for all UI change verification.
 * 
 * Captures Electron screenshots at key states to provide
 * visual evidence that UI changes are perceivable.
 */

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './',
  
  /* Maximum time one test can run for */
  timeout: 90 * 1000,
  
  /* Expect timeout for assertions */
  expect: {
    timeout: 15 * 1000,
  },
  
  /* Run tests in parallel */
  fullyParallel: false,
  
  /* No retries - screenshots must be deterministic */
  retries: 0,
  
  /* Single worker to ensure test isolation */
  workers: 1,
  
  /* Reporter configuration */
  reporter: [
    ['list'],
    ['html', { outputFolder: '../../../../logs/playwright-visual-report', open: 'never' }],
  ],
  
  /* Shared settings */
  use: {
    /* ALWAYS collect trace for debugging */
    trace: 'retain-on-failure',
    
    /* ALWAYS capture screenshot on failure */
    screenshot: 'only-on-failure',
    
    /* Timeout for actions */
    actionTimeout: 15 * 1000,
    
    /* Fixed viewport for deterministic rendering */
    viewport: { width: 1280, height: 800 },
  },
  
  /* No web server - tests launch Electron directly */
});
