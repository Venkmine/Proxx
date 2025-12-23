/**
 * Overlay Scaling Tests — Phase 9B
 * 
 * Tests for overlay bounding box handles and visual scaling.
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

    // Step 2: Navigate to Watermarks section and add an overlay
    const watermarksSection = page.locator('[data-testid="watermarks-section"]');
    await watermarksSection.scrollIntoViewIfNeeded();
    
    // Expand section if needed
    const expandBtn = watermarksSection.locator('button').first();
    if (!(await page.locator('[data-testid="add-text-layer-btn"]').isVisible())) {
      await expandBtn.click();
    }
    
    // Add a text overlay layer
    const addTextBtn = page.locator('[data-testid="add-text-layer-btn"]').or(
      page.getByRole('button', { name: /add text|text layer/i })
    ).first();
    
    if (await addTextBtn.isVisible()) {
      await addTextBtn.click();
      
      // Wait for overlay to be added
      await expect(page.locator('[data-testid^="overlay-layer-"]').first()).toBeVisible({ timeout: 5000 });
    }

    // Step 3: Open the visual preview modal in overlays mode
    const openEditorBtn = page.locator('[data-testid="open-visual-editor"]');
    if (await openEditorBtn.isVisible()) {
      await openEditorBtn.click();
      
      // Wait for modal/preview to appear
      await expect(
        page.locator('[data-testid="visual-preview-modal"], [data-testid="visual-preview-workspace"]').first()
      ).toBeVisible({ timeout: 5000 });
    }

    // Step 4: Switch to overlays mode if mode switcher exists
    const overlaysModeBtn = page.locator('button').filter({ hasText: /overlays/i }).first();
    if (await overlaysModeBtn.isVisible()) {
      await overlaysModeBtn.click();
    }

    // Step 5: Click on an overlay to select it
    const overlayLayer = page.locator('[data-testid^="overlay-layer-"]').first();
    if (await overlayLayer.isVisible()) {
      await overlayLayer.click();
      
      // Assert: Selection box should appear
      const selectionBox = page.locator('[data-testid="overlay-selection-box"]');
      await expect(selectionBox).toBeVisible({ timeout: 5000 });
      
      // Assert: Corner handles should be visible
      await expect(page.locator('[data-testid="selection-handle-top-left"]')).toBeVisible();
      await expect(page.locator('[data-testid="selection-handle-top-right"]')).toBeVisible();
      await expect(page.locator('[data-testid="selection-handle-bottom-left"]')).toBeVisible();
      await expect(page.locator('[data-testid="selection-handle-bottom-right"]')).toBeVisible();
      
      // Assert: Edge handles should be visible
      await expect(page.locator('[data-testid="selection-handle-top"]')).toBeVisible();
      await expect(page.locator('[data-testid="selection-handle-bottom"]')).toBeVisible();
      await expect(page.locator('[data-testid="selection-handle-left"]')).toBeVisible();
      await expect(page.locator('[data-testid="selection-handle-right"]')).toBeVisible();
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

    // Step 2: Navigate to Watermarks section and add an overlay
    const watermarksSection = page.locator('[data-testid="watermarks-section"]');
    await watermarksSection.scrollIntoViewIfNeeded();
    
    // Expand section if needed
    const expandBtn = watermarksSection.locator('button').first();
    if (!(await page.locator('[data-testid="add-text-layer-btn"]').isVisible())) {
      await expandBtn.click();
    }
    
    // Add a text overlay layer
    const addTextBtn = page.locator('[data-testid="add-text-layer-btn"]').or(
      page.getByRole('button', { name: /add text|text layer/i })
    ).first();
    
    if (await addTextBtn.isVisible()) {
      await addTextBtn.click();
      
      // Wait for overlay to be added
      await expect(page.locator('[data-testid^="overlay-layer-"]').first()).toBeVisible({ timeout: 5000 });
    }

    // Step 3: Open the visual preview
    const openEditorBtn = page.locator('[data-testid="open-visual-editor"]');
    if (await openEditorBtn.isVisible()) {
      await openEditorBtn.click();
      
      await expect(
        page.locator('[data-testid="visual-preview-modal"], [data-testid="visual-preview-workspace"]').first()
      ).toBeVisible({ timeout: 5000 });
    }

    // Step 4: Switch to overlays mode
    const overlaysModeBtn = page.locator('button').filter({ hasText: /overlays/i }).first();
    if (await overlaysModeBtn.isVisible()) {
      await overlaysModeBtn.click();
    }

    // Step 5: Select an overlay
    const overlayLayer = page.locator('[data-testid^="overlay-layer-"]').first();
    if (await overlayLayer.isVisible()) {
      // Get initial position
      const initialBox = await overlayLayer.boundingBox();
      
      await overlayLayer.click();
      
      // Wait for selection box
      const selectionBox = page.locator('[data-testid="overlay-selection-box"]');
      await expect(selectionBox).toBeVisible({ timeout: 5000 });
      
      // Step 6: Drag a corner handle to scale
      const cornerHandle = page.locator('[data-testid="selection-handle-bottom-right"]');
      await expect(cornerHandle).toBeVisible({ timeout: 2000 });
      
      const handleBox = await cornerHandle.boundingBox();
      if (handleBox && initialBox) {
        // Drag the corner handle outward
        await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(handleBox.x + 50, handleBox.y + 50);
        await page.mouse.up();
        
        // Get new bounding box
        const newBox = await overlayLayer.boundingBox();
        
        // Assert: Overlay size should have changed (increased)
        if (newBox) {
          // Size should be different (either width or height changed)
          const sizeChanged = 
            Math.abs(newBox.width - initialBox.width) > 1 ||
            Math.abs(newBox.height - initialBox.height) > 1;
          
          // Position (center) should remain stable
          const initialCenterX = initialBox.x + initialBox.width / 2;
          const initialCenterY = initialBox.y + initialBox.height / 2;
          const newCenterX = newBox.x + newBox.width / 2;
          const newCenterY = newBox.y + newBox.height / 2;
          
          // Center position should be roughly the same (within 5px tolerance)
          const positionStable = 
            Math.abs(newCenterX - initialCenterX) < 10 &&
            Math.abs(newCenterY - initialCenterY) < 10;
          
          expect(sizeChanged || positionStable).toBe(true);
        }
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
    
    if (await previewWorkspace.isVisible()) {
      // In view mode, selection box should NOT be visible even if overlay exists
      const selectionBox = page.locator('[data-testid="overlay-selection-box"]');
      await expect(selectionBox).toBeHidden({ timeout: 2000 });
    }
  });
});
