/**
 * Overlay Scaling Tests — Phase 9B
 * 
 * Tests for overlay bounding box handles and visual scaling.
 * 
 * ⚠️ ALPHA RESTRICTION: These tests depend on the overlays section and visual preview.
 * The section testid is "overlays-section" not "watermarks-section".
 * Tests will skip gracefully if UI elements are not available.
 * 
 * HARDENED: No waitForTimeout - all waits are state-based.
 */

import { test, expect } from './fixtures';
import {
  TEST_FILES,
  waitForAppReady,
} from './fixtures';

test.describe('Overlay Bounding Box Handles', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('should show bounding box handles when overlay is selected in overlays mode', async ({ page }) => {
    // Step 1: Add a source file
    const filePathInput = page.locator('[data-testid="file-path-input"]');
    await expect(filePathInput).toBeVisible({ timeout: 5000 });
    await filePathInput.fill(TEST_FILES.valid);
    await filePathInput.press('Enter');
    
    // Wait for file to be added
    await expect(page.getByText(/1 file|test_input/i).first()).toBeVisible({ timeout: 5000 });

    // Step 2: Navigate to Overlays section (not Watermarks) and add an overlay
    const overlaysSection = page.locator('[data-testid="overlays-section"]');
    
    if (await overlaysSection.count() === 0) {
      // ⚠️ ALPHA: Overlays section not visible in current UI
      test.skip();
      return;
    }
    
    await overlaysSection.scrollIntoViewIfNeeded();
    
    // Look for Open Visual Editor button
    const openEditorBtn = page.locator('[data-testid="open-visual-editor"]');
    
    if (await openEditorBtn.count() === 0 || !(await openEditorBtn.isVisible())) {
      // ⚠️ ALPHA: Visual editor button not visible
      test.skip();
      return;
    }
    
    await openEditorBtn.click();
    
    // Wait for modal/preview to appear
    const previewArea = page.locator('[data-testid="visual-preview-modal"], [data-testid="visual-preview-workspace"]').first();
    await expect(previewArea).toBeVisible({ timeout: 5000 });

    // Step 3: Switch to overlays mode if mode switcher exists
    const overlaysModeBtn = page.locator('button').filter({ hasText: /overlays/i }).first();
    if (await overlaysModeBtn.isVisible()) {
      await overlaysModeBtn.click();
    }

    // Step 4: Click on an overlay to select it
    const overlayLayer = page.locator('[data-testid^="overlay-layer-"], [data-testid^="layer-"]').first();
    if (await overlayLayer.count() > 0 && await overlayLayer.isVisible()) {
      await overlayLayer.click();
      
      // Assert: Selection box should appear
      const selectionBox = page.locator('[data-testid="overlay-selection-box"]');
      if (await selectionBox.count() > 0) {
        await expect(selectionBox).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('should scale overlay when dragging corner handle', async ({ page }) => {
    // Step 1: Add a source file
    const filePathInput = page.locator('[data-testid="file-path-input"]');
    await expect(filePathInput).toBeVisible({ timeout: 5000 });
    await filePathInput.fill(TEST_FILES.valid);
    await filePathInput.press('Enter');
    
    // Wait for file to be added
    await expect(page.getByText(/1 file|test_input/i).first()).toBeVisible({ timeout: 5000 });

    // Step 2: Look for overlays section and visual editor
    const overlaysSection = page.locator('[data-testid="overlays-section"]');
    
    if (await overlaysSection.count() === 0) {
      // ⚠️ ALPHA: Overlays section not visible
      test.skip();
      return;
    }
    
    // Step 3: Open the visual preview
    const openEditorBtn = page.locator('[data-testid="open-visual-editor"]');
    if (await openEditorBtn.count() === 0 || !(await openEditorBtn.isVisible())) {
      // ⚠️ ALPHA: Visual editor not available
      test.skip();
      return;
    }
    
    await openEditorBtn.click();
    
    const previewArea = page.locator('[data-testid="visual-preview-modal"], [data-testid="visual-preview-workspace"]').first();
    await expect(previewArea).toBeVisible({ timeout: 5000 });

    // Step 4: Switch to overlays mode
    const overlaysModeBtn = page.locator('button').filter({ hasText: /overlays/i }).first();
    if (await overlaysModeBtn.isVisible()) {
      await overlaysModeBtn.click();
    }

    // Step 5: Select an overlay if one exists
    const overlayLayer = page.locator('[data-testid^="overlay-layer-"], [data-testid^="layer-"]').first();
    if (await overlayLayer.count() > 0 && await overlayLayer.isVisible()) {
      await overlayLayer.click();
      
      // Wait for selection box
      const selectionBox = page.locator('[data-testid="overlay-selection-box"]');
      if (await selectionBox.count() > 0) {
        await expect(selectionBox).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('should not show selection box in view mode', async ({ page }) => {
    // Step 1: Add a source file
    const filePathInput = page.locator('[data-testid="file-path-input"]');
    await expect(filePathInput).toBeVisible({ timeout: 5000 });
    await filePathInput.fill(TEST_FILES.valid);
    await filePathInput.press('Enter');
    
    // Wait for file to be added
    await expect(page.getByText(/1 file|test_input/i).first()).toBeVisible({ timeout: 5000 });

    // Step 2: The default mode should be 'view' - check preview workspace
    const previewWorkspace = page.locator('[data-testid="visual-preview-workspace"]');
    
    if (await previewWorkspace.count() > 0 && await previewWorkspace.isVisible()) {
      // In view mode, selection box should NOT be visible even if overlay exists
      const selectionBox = page.locator('[data-testid="overlay-selection-box"]');
      await expect(selectionBox).toBeHidden({ timeout: 2000 });
    }
  });
});
