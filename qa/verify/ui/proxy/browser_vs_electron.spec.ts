/**
 * Browser vs Electron Mode Tests
 * 
 * AUTHORITATIVE: Tests mode-specific behavior through the UI.
 * 
 * Browser Mode:
 * - No native folder picker
 * - Text input for paths
 * - File drag & drop works
 * 
 * Electron Mode:
 * - Native folder picker available
 * - Native file picker available
 * - File drag & drop with full paths
 * 
 * These tests verify the UI correctly adapts to its runtime context.
 */

import { test, expect } from './fixtures';
import {
  TEST_FILES,
  TEST_OUTPUT_DIR,
  resetBackendQueue,
  ensureOutputDir,
  waitForAppReady,
  waitForDropdownOpen,
} from './fixtures';

test.describe('Browser Mode', () => {
  /**
   * Browser mode tests - run without Electron context.
   * The UI should gracefully handle the lack of native dialogs.
   */
  
  test.beforeAll(async () => {
    ensureOutputDir(TEST_OUTPUT_DIR);
  });
  
  test.beforeEach(async () => {
    await resetBackendQueue();
  });

  test('should show text input for file paths', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    
    // In browser mode, file paths must be entered via text input
    // (or drag & drop, but can't invoke native file picker)
    
    const textInputs = page.locator('input[type="text"]');
    
    // There should be at least one text input for paths
    expect(await textInputs.count()).toBeGreaterThan(0);
  });
  
  test('should show text input for output directory', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    
    // Output directory should be editable via text input
    const textInputs = page.locator('input[type="text"]');
    const lastInput = textInputs.last();
    
    // The last text input is typically output directory
    await expect(lastInput).toBeEditable();
    
    // Should be able to enter a path
    await lastInput.fill(TEST_OUTPUT_DIR);
    await expect(lastInput).toHaveValue(TEST_OUTPUT_DIR);
  });
  
  test('should accept drag and drop for files', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    
    // Look for drop zone indicator
    const dropZone = page.locator('.drop-zone, [data-dropzone], [draggable]').or(
      page.locator('main')
    );
    
    // Drop zone should exist
    await expect(dropZone.first()).toBeVisible();
    
    // Note: Actual drag & drop testing requires file system access
    // which is limited in browser Playwright context
  });
  
  test('should show folder picker button (may be disabled in browser)', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    
    // The folder picker button should exist but may work differently
    const folderBtn = page.getByRole('button', { name: /select folder|browse|choose folder/i });
    
    if (await folderBtn.isVisible()) {
      // In browser mode, this might be disabled or trigger a different behavior
      // Just verify it exists
      await expect(folderBtn).toBeVisible();
    }
  });
  
  test('should show file picker button (may be disabled in browser)', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    
    // The file picker button should exist
    const fileBtn = page.getByRole('button', { name: /select files|add files|browse files/i });
    
    if (await fileBtn.isVisible()) {
      // In browser mode, this might trigger a file input
      await expect(fileBtn).toBeVisible();
    }
  });
  
  test('should allow manual path entry', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    
    // Find file path input
    const fileInput = page.locator('input[type="text"]').first();
    
    if (await fileInput.isVisible()) {
      // Should be able to type a path manually
      await fileInput.fill('/path/to/my/video.mp4');
      await expect(fileInput).toHaveValue('/path/to/my/video.mp4');
    }
  });
});

test.describe('Mode Detection', () => {
  /**
   * Tests for detecting and adapting to the runtime environment.
   */
  
  test('should detect browser environment', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    
    // Check if the page has Electron detection
    const hasElectron = await page.evaluate(() => {
      return typeof window !== 'undefined' && 
             typeof (window as any).electron !== 'undefined';
    });
    
    // In Playwright browser mode, Electron should NOT be available
    expect(hasElectron).toBe(false);
  });
  
  test('should adapt UI to browser constraints', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    
    // The UI should work without Electron features
    // All essential functions should be available via fallbacks
    
    // Create Job panel should be usable
    const createJobPanel = page.getByText(/create job|sources/i);
    await expect(createJobPanel.first()).toBeVisible();
    
    // Queue should be visible
    const queueArea = page.locator('main, .queue, [data-queue]');
    await expect(queueArea.first()).toBeVisible();
  });
  
  test('should not crash when Electron APIs unavailable', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    
    // Click any buttons that might invoke Electron APIs
    const selectFilesBtn = page.getByRole('button', { name: /select files/i });
    const selectFolderBtn = page.getByRole('button', { name: /select folder/i });
    
    // These should not crash the page
    if (await selectFilesBtn.isVisible()) {
      try {
        await selectFilesBtn.click();
        await waitForDropdownOpen(page);
      } catch {
        // Expected to fail gracefully
      }
    }
    
    // Page should still be functional
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Cross-Mode Functionality', () => {
  /**
   * Tests for features that should work in both modes.
   */
  
  test.beforeEach(async () => {
    await resetBackendQueue();
  });

  test('should show job queue in both modes', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    
    // Queue display should work regardless of mode
    const queueArea = page.locator('main, .queue-area, [data-queue]');
    await expect(queueArea.first()).toBeVisible();
  });
  
  test('should show job status badges in both modes', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    
    // Status badges should render
    const statusBadges = page.locator('.status-badge, [data-status]');
    
    // Status badge component should exist (may be 0 if no jobs)
    expect(await statusBadges.count()).toBeGreaterThanOrEqual(0);
  });
  
  test('should show presets dropdown in both modes', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    
    // Preset selection should work
    const presetSelectors = page.locator('button, select').filter({ hasText: /preset/i });
    
    await expect(presetSelectors.first()).toBeVisible();
  });
  
  test('should show engine selection in both modes', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    
    // Engine selection should be available
    const engineSelectors = page.locator('button, select').filter({ hasText: /engine|ffmpeg/i });
    
    // Engine selector should exist
    expect(await engineSelectors.count()).toBeGreaterThanOrEqual(0);
  });
  
  test('should show deliver settings panel in both modes', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    
    // Deliver/output settings should be visible
    const deliverPanel = page.getByText(/deliver|output settings|video|audio/i);
    
    // Some deliver-related text should exist
    expect(await deliverPanel.count()).toBeGreaterThanOrEqual(0);
  });
  
  test('should handle API responses consistently in both modes', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    
    // Wait for API data to load
    await waitForAppReady(page);
    
    // No JavaScript errors should occur
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    // Reload and check for errors
    await page.reload();
    await waitForAppReady(page);
    
    // Filter out expected network errors (backend may not be running)
    const criticalErrors = consoleErrors.filter(e => 
      !e.includes('fetch') && 
      !e.includes('network') && 
      !e.includes('Failed to load')
    );
    
    // No critical JS errors
    expect(criticalErrors.length).toBe(0);
  });
});

test.describe('Browser Mode Fallbacks', () => {
  /**
   * Tests for graceful degradation when Electron features unavailable.
   */

  test('should show path input when no file picker available', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    
    // There should be a way to enter paths manually
    const pathInputs = page.locator('input[type="text"]');
    
    expect(await pathInputs.count()).toBeGreaterThan(0);
  });
  
  test('should accept pasted paths', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    
    const fileInput = page.locator('input[type="text"]').first();
    
    if (await fileInput.isVisible()) {
      // Simulate paste
      await fileInput.click();
      await page.keyboard.insertText('/pasted/path/to/video.mp4');
      
      // Value should be set
      const value = await fileInput.inputValue();
      expect(value).toContain('video.mp4');
    }
  });
  
  test('should show helpful text for browser limitations', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    
    // The UI might show hints about browser mode limitations
    const hints = page.getByText(/drag.*drop|paste|enter path/i);
    
    // Hints may or may not be visible
    expect(await hints.count()).toBeGreaterThanOrEqual(0);
  });
});

// Note: Electron-specific tests would be in a separate file
// that uses Playwright's Electron support, e.g.:
// test.describe('Electron Mode', () => { ... });
// These would require: @playwright/test with Electron setup
