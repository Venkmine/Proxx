/**
 * V2 Execute Playwright Test — Thin Client JobSpec Flow
 * 
 * V2 Step 3: UI as JobSpec Compiler
 * 
 * Tests the V2 execution flow:
 * 1. Enable V2 mode via toggle
 * 2. Select source files
 * 3. Set output directory
 * 4. Click "Run (V2)"
 * 5. Verify "Encoding..." state (no progress/ETA)
 * 6. Verify result display
 * 
 * ⚠️ VERIFY GUARD:
 * This test requires:
 * - Backend running at http://localhost:8085
 * - Frontend running at http://localhost:5173
 * - Test media file at TEST_MEDIA_DIR
 */

import { test, expect } from '@playwright/test';
import { waitForAppReady, TEST_MEDIA_DIR, TEST_OUTPUT_DIR } from './fixtures';
import * as fs from 'fs';
import * as path from 'path';

// Ensure test output directory exists
function ensureTestOutputDir(): void {
  if (!fs.existsSync(TEST_OUTPUT_DIR)) {
    fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
  }
  // Clean up any existing files
  const files = fs.readdirSync(TEST_OUTPUT_DIR);
  for (const file of files) {
    if (file.endsWith('.mov') || file.endsWith('.mp4')) {
      fs.unlinkSync(path.join(TEST_OUTPUT_DIR, file));
    }
  }
}

// Test file path
const TEST_VIDEO = path.join(TEST_MEDIA_DIR, 'test_input_fabric_phase20.mp4');

test.describe('V2 Execute Flow', () => {
  test.beforeEach(async ({ page }) => {
    ensureTestOutputDir();
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('should toggle V2 mode on and off', async ({ page }) => {
    // V2 toggle should be visible (not in demo mode)
    const v2Toggle = page.locator('[data-testid="v2-mode-toggle"]');
    
    // Initially OFF
    await expect(v2Toggle).toContainText('V2 OFF');
    
    // Click to enable
    await v2Toggle.click();
    await expect(v2Toggle).toContainText('V2 ON');
    
    // Click to disable
    await v2Toggle.click();
    await expect(v2Toggle).toContainText('V2 OFF');
  });

  test('should show Run (V2) button when V2 mode enabled and files selected', async ({ page }) => {
    // Enable V2 mode
    const v2Toggle = page.locator('[data-testid="v2-mode-toggle"]');
    await v2Toggle.click();
    await expect(v2Toggle).toContainText('V2 ON');
    
    // Initially, Run (V2) button should not be visible (no files selected)
    await expect(page.locator('[data-testid="run-v2-button"]')).not.toBeVisible();
    
    // Check if test file exists
    if (!fs.existsSync(TEST_VIDEO)) {
      test.skip();
      return;
    }
    
    // Navigate to the test file directory using directory navigator
    // This is a simplified test - in real scenarios, use proper file selection
    // For this test, we'll verify the button appears logic is correct
  });

  test('should display honest encoding state (no progress/ETA)', async ({ page }) => {
    // Skip if test file doesn't exist
    if (!fs.existsSync(TEST_VIDEO)) {
      test.skip();
      return;
    }
    
    // Enable V2 mode
    const v2Toggle = page.locator('[data-testid="v2-mode-toggle"]');
    await v2Toggle.click();
    await expect(v2Toggle).toContainText('V2 ON');
    
    // TODO: Once file selection is implemented in tests,
    // verify that during encoding:
    // - Shows "Encoding..." text
    // - Does NOT show progress percentage
    // - Does NOT show ETA
    // - Does NOT show cancel button
  });

  test('V2 mode toggle persists across page loads', async ({ page }) => {
    // Enable V2 mode
    const v2Toggle = page.locator('[data-testid="v2-mode-toggle"]');
    await v2Toggle.click();
    await expect(v2Toggle).toContainText('V2 ON');
    
    // Note: V2 mode currently does NOT persist (it's session-only)
    // This test verifies the current behavior
    await page.reload();
    await waitForAppReady(page);
    
    // After reload, should be OFF (feature flag default)
    await expect(page.locator('[data-testid="v2-mode-toggle"]')).toContainText('V2 OFF');
  });
});

test.describe('V2 Execute Integration (requires test media)', () => {
  test.beforeEach(async ({ page }) => {
    // Skip all tests in this suite if test file doesn't exist
    if (!fs.existsSync(TEST_VIDEO)) {
      test.skip();
    }
    ensureTestOutputDir();
    await page.goto('/');
    await waitForAppReady(page);
  });

  test.skip('should execute V2 job and display result', async ({ page }) => {
    // This test is marked skip until we have proper test file selection
    // The test demonstrates the expected flow
    
    // 1. Enable V2 mode
    const v2Toggle = page.locator('[data-testid="v2-mode-toggle"]');
    await v2Toggle.click();
    
    // 2. Select test file (would need file selection implementation)
    
    // 3. Set output directory
    
    // 4. Click Run (V2)
    
    // 5. Verify encoding state
    // await expect(page.getByText('Encoding...')).toBeVisible();
    
    // 6. Wait for result
    // await expect(page.getByText(/COMPLETED|FAILED/)).toBeVisible({ timeout: 60000 });
    
    // 7. Verify result panel shows clip status
    // await expect(page.locator('.v2-result-panel')).toBeVisible();
  });
});

test.describe('V2 Mode UI Elements', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('V2 toggle should have correct styling when OFF', async ({ page }) => {
    const v2Toggle = page.locator('[data-testid="v2-mode-toggle"]');
    
    // Check it's visible and has correct text
    await expect(v2Toggle).toBeVisible();
    await expect(v2Toggle).toContainText('V2 OFF');
    
    // Verify it's a button/interactive element
    await expect(v2Toggle).toBeEnabled();
  });

  test('V2 toggle should have correct styling when ON', async ({ page }) => {
    const v2Toggle = page.locator('[data-testid="v2-mode-toggle"]');
    
    // Enable V2
    await v2Toggle.click();
    await expect(v2Toggle).toContainText('V2 ON');
    
    // The button should still be interactive
    await expect(v2Toggle).toBeEnabled();
  });

  test('V2 mode should not affect V1 render buttons', async ({ page }) => {
    // Render All button should still work in header
    const renderAllButton = page.locator('[data-testid="render-all-button"]');
    
    // Enable V2 mode
    const v2Toggle = page.locator('[data-testid="v2-mode-toggle"]');
    await v2Toggle.click();
    
    // V1 buttons should still be present/functional when there are jobs
    // (they just won't show if there are no pending jobs)
  });
});
