/**
 * Visual Preview Modal Tests
 * 
 * Tests for the Visual Preview Modal functionality (Phase 23)
 * Entry point: "Open Visual Editor" button in Watermarks & Burn-Ins section
 */

import { test, expect } from './fixtures';
import {
  TEST_FILES,
  waitForAppReady,
} from './fixtures';

test.describe('Visual Preview Modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('should show Open Visual Editor button in Watermarks section', async ({ page }) => {
    // Expand the Watermarks & Burn-Ins section
    const watermarksSection = page.locator('[data-testid="watermarks-section"]');
    await watermarksSection.scrollIntoViewIfNeeded();
    
    // Click to expand if not already expanded
    const sectionHeader = watermarksSection.locator('[data-section-header]').or(
      watermarksSection.locator('button').first()
    );
    
    // Check if section is collapsed (button with "Open Visual Editor" not visible)
    const openEditorBtn = page.locator('[data-testid="open-visual-editor"]');
    if (!(await openEditorBtn.isVisible())) {
      // Try clicking the section header to expand
      await sectionHeader.click();
    }
    
    // The Open Visual Editor button should now be visible
    await expect(openEditorBtn).toBeVisible({ timeout: 5000 });
  });

  test('should open modal when clicking Open Visual Editor with files selected', async ({ page }) => {
    // Step 1: Add a source file via the file path input
    const filePathInput = page.locator('[data-testid="file-path-input"]');
    await expect(filePathInput).toBeVisible({ timeout: 5000 });
    await filePathInput.fill(TEST_FILES.valid);
    await filePathInput.press('Enter');
    
    // Wait for file to be added (look for file indicator)
    await expect(page.getByText(/1 file|test_input/i).first()).toBeVisible({ timeout: 5000 });

    // Step 2: Expand Watermarks section if needed
    const watermarksSection = page.locator('[data-testid="watermarks-section"]');
    await watermarksSection.scrollIntoViewIfNeeded();
    
    const openEditorBtn = page.locator('[data-testid="open-visual-editor"]');
    if (!(await openEditorBtn.isVisible())) {
      const sectionHeader = watermarksSection.locator('button').first();
      await sectionHeader.click();
    }
    
    // The button should be enabled now that files are selected
    await expect(openEditorBtn).toBeEnabled({ timeout: 5000 });
    
    // Click the button to open the modal
    await openEditorBtn.click();
    
    // Modal should appear with the testid
    const modal = page.locator('[data-testid="visual-preview-modal"]');
    await expect(modal).toBeVisible({ timeout: 5000 });
  });

  test('should close modal when pressing Escape', async ({ page }) => {
    // Add a source file first
    const filePathInput = page.locator('[data-testid="file-path-input"]');
    await expect(filePathInput).toBeVisible({ timeout: 5000 });
    await filePathInput.fill(TEST_FILES.valid);
    await filePathInput.press('Enter');
    
    // Wait for file to be added
    await expect(page.getByText(/1 file|test_input/i).first()).toBeVisible({ timeout: 5000 });
    
    // Expand Watermarks section
    const watermarksSection = page.locator('[data-testid="watermarks-section"]');
    await watermarksSection.scrollIntoViewIfNeeded();
    
    const openEditorBtn = page.locator('[data-testid="open-visual-editor"]');
    if (!(await openEditorBtn.isVisible())) {
      const sectionHeader = watermarksSection.locator('button').first();
      await sectionHeader.click();
    }
    
    // Open modal
    await expect(openEditorBtn).toBeEnabled({ timeout: 5000 });
    await openEditorBtn.click();
    
    const modal = page.locator('[data-testid="visual-preview-modal"]');
    await expect(modal).toBeVisible({ timeout: 5000 });
    
    // Press Escape to close
    await page.keyboard.press('Escape');
    
    // Modal should be hidden
    await expect(modal).toBeHidden({ timeout: 5000 });
  });
  
  test('should show tabs for Burn-In, Image, and Preview', async ({ page }) => {
    // Add a source file first
    const filePathInput = page.locator('[data-testid="file-path-input"]');
    await expect(filePathInput).toBeVisible({ timeout: 5000 });
    await filePathInput.fill(TEST_FILES.valid);
    await filePathInput.press('Enter');
    
    // Wait for file to be added
    await expect(page.getByText(/1 file|test_input/i).first()).toBeVisible({ timeout: 5000 });
    
    // Open the modal
    const watermarksSection = page.locator('[data-testid="watermarks-section"]');
    await watermarksSection.scrollIntoViewIfNeeded();
    
    const openEditorBtn = page.locator('[data-testid="open-visual-editor"]');
    if (!(await openEditorBtn.isVisible())) {
      const sectionHeader = watermarksSection.locator('button').first();
      await sectionHeader.click();
    }
    await expect(openEditorBtn).toBeEnabled({ timeout: 5000 });
    await openEditorBtn.click();
    
    // Verify tabs are present
    await expect(page.locator('[data-testid="tab-burnin"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="tab-image"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="tab-preview"]')).toBeVisible({ timeout: 5000 });
  });
});
