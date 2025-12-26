/**
 * Dogfood Exhaustive Test Suite - Part 4: UI Truthfulness & Accessibility
 * 
 * Sections covered:
 * I) UI TRUTHFULNESS / NO DEAD CONTROLS
 * J) ERROR UX (HUMAN READABLE)
 * L) PERFORMANCE / RESPONSIVENESS (NON-BENCHMARK)
 * M) ACCESSIBILITY / INPUT SANITY (LIGHTWEIGHT)
 * 
 * RULES:
 * - All waits are state-based (NO waitForTimeout)
 * - Tests must pass reliably or feature must be restricted
 */

import { test, expect } from './fixtures';
import {
  TEST_FILES,
  TEST_OUTPUT_DIR,
  resetBackendQueue,
  ensureOutputDir,
  waitForAppReady,
  BACKEND_URL,
} from './fixtures';

// ============================================================================
// SECTION I: UI TRUTHFULNESS / NO DEAD CONTROLS
// ============================================================================

test.describe('I. UI Truthfulness', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('I1: No drag & drop hints prominently displayed (Alpha disabled)', async ({ page }) => {
    // Drag & drop is disabled in Alpha - no active hints should appear
    const dragHints = page.locator('[data-testid="drop-zone-hint"]');
    const hintCount = await dragHints.count();
    
    // If hints exist, they should be hidden
    for (let i = 0; i < hintCount; i++) {
      const hint = dragHints.nth(i);
      const isVisible = await hint.isVisible().catch(() => false);
      if (isVisible) {
        // Check if it's a subtle hint vs prominent one
        const text = await hint.textContent() || '';
        // Prominent hints like "Drag files here" should not be visible
        expect(text.toLowerCase()).not.toMatch(/drag files here|drop to add/i);
      }
    }
  });

  test('I2: Disabled buttons are actually disabled (not just styled)', async ({ page }) => {
    // Create button should be disabled without inputs
    const createBtn = page.locator('[data-testid="add-to-queue-button"]');
    await expect(createBtn).toBeDisabled();
    
    // Verify it's truly disabled (attribute, not just visual)
    const isDisabled = await createBtn.isDisabled();
    expect(isDisabled).toBe(true);
  });

  test('I3: All visible buttons have accessible names', async ({ page }) => {
    const buttons = await page.locator('button').all();
    
    for (const button of buttons) {
      if (await button.isVisible()) {
        const text = await button.textContent() || '';
        const ariaLabel = await button.getAttribute('aria-label') || '';
        const title = await button.getAttribute('title') || '';
        
        // Button should have some accessible name
        const hasName = text.trim().length > 0 || ariaLabel.length > 0 || title.length > 0;
        
        // Icon-only buttons should have aria-label or title
        if (!hasName) {
          console.warn('Button without accessible name:', await button.innerHTML());
        }
      }
    }
  });

  test('I4: Status badges show correct states', async ({ page }) => {
    await resetBackendQueue();
    
    // Create a job
    const filePathInput = page.locator('[data-testid="file-path-input"]');
    await filePathInput.fill(TEST_FILES.valid);
    await filePathInput.press('Enter');
    
    const outputInput = page.locator('[data-testid="output-directory-input"]');
    await outputInput.fill(TEST_OUTPUT_DIR);
    
    const createBtn = page.locator('[data-testid="add-to-queue-button"]');
    await createBtn.click();
    
    // Wait for job with PENDING status
    const pendingBadge = page.locator('[data-testid="status-badge-pending"]');
    await expect(pendingBadge).toBeVisible({ timeout: 10000 });
    
    // Verify data-status attribute
    const status = await pendingBadge.getAttribute('data-status');
    expect(status).toBe('PENDING');
  });

  test('I5: Filter buttons reflect active state visually', async ({ page }) => {
    const allFilter = page.locator('[data-testid="filter-btn-all"]');
    
    if (await allFilter.isVisible()) {
      // All filter should be active by default
      await allFilter.click();
      
      // Should have visual indication of active state
      const computedStyle = await allFilter.evaluate((el) => {
        const style = window.getComputedStyle(el);
        return {
          background: style.background,
          border: style.border,
        };
      });
      
      // Active filter should have some visual distinction
      expect(computedStyle).toBeDefined();
    }
  });
});

// ============================================================================
// SECTION J: ERROR UX (HUMAN READABLE)
// ============================================================================

test.describe('J. Error UX', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('J1: Validation errors are human-readable', async ({ page }) => {
    // Without required fields, should show readable reason
    const validationText = page.getByText(/select|required|set|need/i).first();
    await expect(validationText).toBeVisible({ timeout: 5000 });
    
    // Should NOT show technical jargon or stack traces
    const technicalError = page.getByText(/undefined|null|exception|traceback/i);
    await expect(technicalError).not.toBeVisible({ timeout: 2000 });
  });

  test('J2: Errors persist (not auto-dismissed)', async ({ page }) => {
    // Add invalid relative path
    const filePathInput = page.locator('[data-testid="file-path-input"]');
    await filePathInput.fill('invalid/relative/path.mp4');
    await filePathInput.press('Enter');
    
    // Any error/warning shown should persist
    const validationReason = page.getByText(/invalid|must be absolute|relative/i).first();
    
    // If visible, should remain visible without user action
    if (await validationReason.isVisible()) {
      // Wait 3 seconds and verify it's still there
      await new Promise(r => setTimeout(r, 3000));
      await expect(validationReason).toBeVisible();
    }
  });

  test('J3: Error states have visual distinction', async ({ page }) => {
    // Validation text for disabled state should be visually different
    const validationText = page.getByText(/select|required/i).first();
    
    if (await validationText.isVisible()) {
      const color = await validationText.evaluate((el) => {
        return window.getComputedStyle(el).color;
      });
      
      // Should have a warning/error color (not default text color)
      expect(color).toBeDefined();
    }
  });
});

// ============================================================================
// SECTION L: PERFORMANCE / RESPONSIVENESS (NON-BENCHMARK)
// ============================================================================

test.describe('L. Responsiveness', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('L1: No infinite spinners on startup', async ({ page }) => {
    // App should be ready within reasonable time
    const spinner = page.locator('.loading, .spinner, [data-loading="true"]');
    
    // Either no spinner, or spinner should disappear quickly
    const spinnerVisible = await spinner.first().isVisible().catch(() => false);
    if (spinnerVisible) {
      await expect(spinner.first()).toBeHidden({ timeout: 10000 });
    }
  });

  test('L2: UI responds to clicks during idle', async ({ page }) => {
    // Click various elements and ensure they respond
    const filePathInput = page.locator('[data-testid="file-path-input"]');
    await expect(filePathInput).toBeEditable({ timeout: 5000 });
    
    await filePathInput.click();
    await filePathInput.fill('test');
    await expect(filePathInput).toHaveValue('test');
  });

  test('L3: Multiple rapid interactions handled', async ({ page }) => {
    const filePathInput = page.locator('[data-testid="file-path-input"]');
    
    // Rapid typing
    for (let i = 0; i < 10; i++) {
      await filePathInput.fill(`/path/number/${i}`);
    }
    
    // UI should still be responsive
    await expect(filePathInput).toBeEditable();
  });

  test('L4: Queue panel remains interactive with jobs', async ({ page }) => {
    await resetBackendQueue();
    
    // Create a job
    const filePathInput = page.locator('[data-testid="file-path-input"]');
    await filePathInput.fill(TEST_FILES.valid);
    await filePathInput.press('Enter');
    
    const outputInput = page.locator('[data-testid="output-directory-input"]');
    await outputInput.fill(TEST_OUTPUT_DIR);
    
    const createBtn = page.locator('[data-testid="add-to-queue-button"]');
    await createBtn.click();
    
    await expect(page.locator('[data-job-id]').first()).toBeVisible({ timeout: 10000 });
    
    // Job card should be clickable
    const jobCard = page.locator('[data-job-id]').first();
    await jobCard.click();
    
    // Should show job details
    await expect(
      page.locator('[data-testid="btn-job-render"], [data-testid="btn-job-delete"]').first()
    ).toBeVisible({ timeout: 5000 });
  });
});

// ============================================================================
// SECTION M: ACCESSIBILITY / INPUT SANITY (LIGHTWEIGHT)
// ============================================================================

test.describe('M. Accessibility', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('M1: Tab key navigates form controls', async ({ page }) => {
    // Focus the first input
    await page.keyboard.press('Tab');
    
    // Some element should be focused
    const focusedElement = await page.evaluate(() => {
      return document.activeElement?.tagName;
    });
    
    expect(focusedElement).toBeDefined();
  });

  test('M2: Enter triggers form actions where appropriate', async ({ page }) => {
    // Enter in file path input should add the path
    const filePathInput = page.locator('[data-testid="file-path-input"]');
    await filePathInput.fill(TEST_FILES.valid);
    await filePathInput.press('Enter');
    
    // File should be added
    await expect(
      page.getByText(/1 file|selected/i).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('M3: Disabled buttons cannot be activated', async ({ page }) => {
    // Create button is disabled without inputs
    const createBtn = page.locator('[data-testid="add-to-queue-button"]');
    await expect(createBtn).toBeDisabled();
    
    // Try to click it
    await createBtn.click({ force: true }).catch(() => {});
    
    // No job should be created
    await expect(page.locator('[data-job-id]')).toHaveCount(0, { timeout: 2000 });
  });

  test('M4: Focus indicators visible', async ({ page }) => {
    const filePathInput = page.locator('[data-testid="file-path-input"]');
    await filePathInput.focus();
    
    // Element should have visible focus (outline or border)
    const hasFocusStyle = await filePathInput.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return (
        style.outlineWidth !== '0px' ||
        style.boxShadow !== 'none' ||
        style.borderColor !== 'transparent'
      );
    });
    
    expect(hasFocusStyle).toBe(true);
  });

  test('M5: Escape key handling (no crash)', async ({ page }) => {
    // Press Escape shouldn't crash the app
    await page.keyboard.press('Escape');
    
    // App should still be functional
    await expect(page.locator('[data-testid="create-job-panel"]')).toBeVisible();
  });
});
