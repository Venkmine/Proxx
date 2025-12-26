/**
 * Dogfood Exhaustive Test Suite - Part 1: Startup, Health, Filesystem
 * 
 * Sections covered:
 * A) BUILD / STARTUP / HEALTH CHECKS
 * B) FILESYSTEM / PATH / BROWSE TORTURE
 * 
 * RULES:
 * - All waits are state-based (NO waitForTimeout)
 * - Tests must pass reliably or feature must be restricted
 */

import { test, expect } from './fixtures';
import {
  TEST_FILES,
  TEST_OUTPUT_DIR,
  TEST_MEDIA_DIR,
  resetBackendQueue,
  ensureOutputDir,
  cleanupOutputDir,
  waitForAppReady,
  BACKEND_URL,
} from './fixtures';
import * as fs from 'fs';
import * as path from 'path';

// Test media fixtures location
const FIXTURES_DIR = path.join(TEST_MEDIA_DIR, '../qa/fixtures/media');

// ============================================================================
// SECTION A: BUILD / STARTUP / HEALTH CHECKS
// ============================================================================

test.describe('A. Startup & Health Checks', () => {
  
  test('A1: Backend health endpoint responds', async ({ request }) => {
    const response = await request.get(`${BACKEND_URL}/health`);
    expect(response.ok()).toBe(true);
    const data = await response.json();
    expect(data.status).toBeDefined();
  });

  test('A2: Frontend loads without JavaScript errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });
    
    await page.goto('/');
    await waitForAppReady(page);
    
    // Filter out known acceptable errors (if any)
    const criticalErrors = errors.filter(e => 
      !e.includes('ResizeObserver') && // Browser quirk
      !e.includes('favicon')
    );
    
    expect(criticalErrors).toHaveLength(0);
  });

  test('A3: UI shows backend connection state', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    
    // Backend status indicator should show connected
    const statusIndicator = page.locator('[data-testid="backend-status"]');
    await expect(statusIndicator).toBeVisible({ timeout: 10000 });
    await expect(statusIndicator).toContainText(/connected/i, { timeout: 15000 });
  });

  test('A4: App root and header render correctly', async ({ page }) => {
    await page.goto('/');
    
    // App root container must be present
    await expect(page.locator('[data-testid="app-root"]')).toBeVisible({ timeout: 10000 });
    
    // Header must be present
    await expect(page.locator('[data-testid="app-header"]')).toBeVisible({ timeout: 10000 });
  });

  test('A5: Create job panel visible on startup', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    
    await expect(page.locator('[data-testid="create-job-panel"]')).toBeVisible();
  });
});

// ============================================================================
// SECTION B: FILESYSTEM / PATH / BROWSE TORTURE
// ============================================================================

test.describe('B. Filesystem Path Validation', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('B1: Absolute file path accepted', async ({ page }) => {
    const filePathInput = page.locator('[data-testid="file-path-input"]');
    await expect(filePathInput).toBeVisible({ timeout: 5000 });
    
    await filePathInput.fill(TEST_FILES.valid);
    await filePathInput.press('Enter');
    
    // Should show file count or filename
    await expect(
      page.getByText(/1 file|selected/i).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('B2: Relative file path rejected with clear message', async ({ page }) => {
    const filePathInput = page.locator('[data-testid="file-path-input"]');
    await expect(filePathInput).toBeVisible({ timeout: 5000 });
    
    // Enter relative path
    await filePathInput.fill('relative/path/video.mp4');
    await filePathInput.press('Enter');
    
    // File should NOT be added
    // Check that "1 file selected" does NOT appear
    const fileCountText = page.getByText(/1 file.*selected/i);
    await expect(fileCountText).not.toBeVisible({ timeout: 2000 });
  });

  test('B3: Non-existent file path - job creation fails at validation', async ({ page }) => {
    const filePathInput = page.locator('[data-testid="file-path-input"]');
    await filePathInput.fill('/nonexistent/path/video.mp4');
    await filePathInput.press('Enter');
    
    const outputInput = page.locator('[data-testid="output-directory-input"]');
    await outputInput.fill(TEST_OUTPUT_DIR);
    
    // The create button may be disabled, or if enabled, creating should fail
    // This test documents current behavior
    const createBtn = page.locator('[data-testid="add-to-queue-button"]');
    
    // If button is enabled and we click, verify error occurs
    if (await createBtn.isEnabled()) {
      await createBtn.click();
      
      // Should see validation error or job fails
      await expect(
        page.getByText(/not found|does not exist|invalid|error/i).first()
      ).toBeVisible({ timeout: 10000 });
    }
  });

  test('B4: Empty string path rejected', async ({ page }) => {
    const filePathInput = page.locator('[data-testid="file-path-input"]');
    await filePathInput.fill('');
    await filePathInput.press('Enter');
    
    // No file should be added
    const fileCountText = page.getByText(/1 file.*selected/i);
    await expect(fileCountText).not.toBeVisible({ timeout: 2000 });
  });

  test('B5: File with spaces in path accepted', async ({ page }) => {
    // Skip if test fixture doesn't exist
    const testFile = path.join(FIXTURES_DIR, 'test with spaces.mp4');
    if (!fs.existsSync(testFile)) {
      test.skip();
      return;
    }
    
    const filePathInput = page.locator('[data-testid="file-path-input"]');
    await filePathInput.fill(testFile);
    await filePathInput.press('Enter');
    
    // Should be accepted
    await expect(
      page.getByText(/1 file|selected/i).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('B6: File with unicode characters in path accepted', async ({ page }) => {
    const testFile = path.join(FIXTURES_DIR, 'unicode_テスト_🎬.mp4');
    if (!fs.existsSync(testFile)) {
      test.skip();
      return;
    }
    
    const filePathInput = page.locator('[data-testid="file-path-input"]');
    await filePathInput.fill(testFile);
    await filePathInput.press('Enter');
    
    await expect(
      page.getByText(/1 file|selected/i).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('B7: UI remains responsive after path errors', async ({ page }) => {
    const filePathInput = page.locator('[data-testid="file-path-input"]');
    
    // Enter invalid path
    await filePathInput.fill('invalid');
    await filePathInput.press('Enter');
    
    // UI should still be responsive
    const outputInput = page.locator('[data-testid="output-directory-input"]');
    await expect(outputInput).toBeEditable({ timeout: 3000 });
    await outputInput.fill('/tmp/test');
    await expect(outputInput).toHaveValue('/tmp/test');
  });

  test('B8: Output directory input accepts absolute path', async ({ page }) => {
    const outputInput = page.locator('[data-testid="output-directory-input"]');
    await expect(outputInput).toBeVisible({ timeout: 5000 });
    
    await outputInput.fill(TEST_OUTPUT_DIR);
    await expect(outputInput).toHaveValue(TEST_OUTPUT_DIR);
  });

  test('B9: Multiple files can be added sequentially', async ({ page }) => {
    const filePathInput = page.locator('[data-testid="file-path-input"]');
    
    // Add first file
    await filePathInput.fill(TEST_FILES.valid);
    await filePathInput.press('Enter');
    
    // Add same file again (duplicate handling test)
    await filePathInput.fill(TEST_FILES.valid);
    await filePathInput.press('Enter');
    
    // Should show file count (may be 1 if deduped, or 2 if allowed)
    await expect(
      page.getByText(/file.*selected/i).first()
    ).toBeVisible({ timeout: 5000 });
  });
});

// ============================================================================
// SECTION B (Extended): Permission & Edge Cases
// ============================================================================

test.describe('B. Filesystem Edge Cases', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('B10: Directory path where file required - handled', async ({ page }) => {
    const filePathInput = page.locator('[data-testid="file-path-input"]');
    
    // Enter a directory path instead of file
    await filePathInput.fill('/tmp');
    await filePathInput.press('Enter');
    
    // UI should handle gracefully - either reject or accept for browsing
    // No crash or hang
    await expect(page.locator('[data-testid="create-job-panel"]')).toBeVisible();
  });

  test('B11: Long filename handled', async ({ page }) => {
    // Create path with long filename
    const longName = 'a'.repeat(200);
    const testPath = `/tmp/${longName}.mp4`;
    
    const filePathInput = page.locator('[data-testid="file-path-input"]');
    await filePathInput.fill(testPath);
    await filePathInput.press('Enter');
    
    // UI should not crash
    await expect(page.locator('[data-testid="create-job-panel"]')).toBeVisible();
  });

  test('B12: Path with special characters handled', async ({ page }) => {
    // Reserved characters in various OSes
    const filePathInput = page.locator('[data-testid="file-path-input"]');
    await filePathInput.fill("/tmp/test'file\"name.mp4");
    await filePathInput.press('Enter');
    
    // Should not crash UI
    await expect(page.locator('[data-testid="create-job-panel"]')).toBeVisible();
  });
});
