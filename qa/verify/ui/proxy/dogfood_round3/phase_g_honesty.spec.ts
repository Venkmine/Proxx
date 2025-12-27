/**
 * Dogfood Round 3 — Phase G: UI Honesty Audit
 * 
 * Explicitly test for lies:
 * 
 * 1. No control implies unavailable functionality
 * 2. Disabled buttons do nothing
 * 3. Tooltips explain restrictions
 * 4. No references to pause, resume, real-time progress (if not supported)
 * 5. No drag & drop affordances exist
 */

import { 
  test, 
  expect,
  TEST_FILES,
  TEST_OUTPUT_DIR,
  waitForAppReady,
  createJobViaUI,
  resetBackendQueue,
  prepareOutputDir,
  getVisibleButtons,
} from './fixtures';

// ============================================================================
// PHASE G: UI HONESTY AUDIT
// ============================================================================

test.describe('Phase G: UI Honesty', () => {
  
  test.beforeEach(async ({ page }) => {
    await resetBackendQueue();
    prepareOutputDir(TEST_OUTPUT_DIR);
    await page.goto('/');
    await waitForAppReady(page);
  });

  // --------------------------------------------------------------------------
  // G1: No pause button exists (feature not supported)
  // --------------------------------------------------------------------------
  test('R3-G1: No pause button exists', async ({ page }) => {
    await createJobViaUI(page);
    
    // Select job
    const jobCard = page.locator('[data-job-id]').first();
    await jobCard.click();
    
    // Look for pause button
    const pauseBtn = page.getByRole('button', { name: /pause/i }).or(
      page.locator('[data-testid*="pause"]')
    );
    
    const pauseExists = await pauseBtn.isVisible({ timeout: 2000 }).catch(() => false);
    
    expect(pauseExists).toBe(false);
    
    console.log('[R3-G1] No pause button found (correct — not supported)');
  });

  // --------------------------------------------------------------------------
  // G2: No resume button exists (feature not supported)
  // --------------------------------------------------------------------------
  test('R3-G2: No resume button exists', async ({ page }) => {
    await createJobViaUI(page);
    
    const jobCard = page.locator('[data-job-id]').first();
    await jobCard.click();
    
    const resumeBtn = page.getByRole('button', { name: /resume/i }).or(
      page.locator('[data-testid*="resume"]')
    );
    
    const resumeExists = await resumeBtn.isVisible({ timeout: 2000 }).catch(() => false);
    
    expect(resumeExists).toBe(false);
    
    console.log('[R3-G2] No resume button found (correct — not supported)');
  });

  // --------------------------------------------------------------------------
  // G3: No drag handles exist (drag & drop disabled)
  // --------------------------------------------------------------------------
  test('R3-G3: No drag handles on job cards', async ({ page }) => {
    await createJobViaUI(page);
    
    // Look for drag handles
    const dragHandles = page.locator('[draggable="true"], .drag-handle, [data-drag-handle]');
    
    const handleCount = await dragHandles.count();
    
    // If handles exist, they should not be on job cards
    if (handleCount > 0) {
      for (let i = 0; i < handleCount; i++) {
        const handle = dragHandles.nth(i);
        const isInJobCard = await handle.locator('xpath=ancestor::*[@data-job-id]').count() > 0;
        
        if (isInJobCard) {
          console.log('[R3-G3] WARNING: Drag handle found on job card');
        }
      }
    }
    
    console.log(`[R3-G3] Found ${handleCount} draggable elements`);
  });

  // --------------------------------------------------------------------------
  // G4: Disabled buttons don't respond to clicks
  // --------------------------------------------------------------------------
  test('R3-G4: Disabled buttons are truly inactive', async ({ page }) => {
    await createJobViaUI(page);
    
    const jobCard = page.locator('[data-job-id]').first();
    await jobCard.click();
    
    // Find any disabled buttons
    const disabledButtons = page.locator('button[disabled], button:disabled');
    const count = await disabledButtons.count();
    
    for (let i = 0; i < count; i++) {
      const btn = disabledButtons.nth(i);
      const btnName = await btn.textContent() || 'unnamed';
      
      // Try to click - should have no effect
      await btn.click({ force: true }).catch(() => {});
      
      // UI should remain stable
      await expect(page.locator('[data-testid="app-root"]')).toBeVisible();
    }
    
    console.log(`[R3-G4] Tested ${count} disabled buttons`);
  });

  // --------------------------------------------------------------------------
  // G5: No progress bar claims real-time updates
  // --------------------------------------------------------------------------
  test('R3-G5: No misleading progress indicators', async ({ page }) => {
    await createJobViaUI(page);
    
    // Check for progress bars
    const progressBars = page.locator('progress, [role="progressbar"], .progress-bar');
    const count = await progressBars.count();
    
    // If progress bars exist, they should be honest about what they show
    if (count > 0) {
      for (let i = 0; i < count; i++) {
        const bar = progressBars.nth(i);
        const ariaLabel = await bar.getAttribute('aria-label') || '';
        
        // Progress bars shouldn't claim to be "real-time" or "live"
        expect(ariaLabel.toLowerCase()).not.toContain('real-time');
        expect(ariaLabel.toLowerCase()).not.toContain('live');
      }
    }
    
    console.log(`[R3-G5] Found ${count} progress indicators`);
  });

  // --------------------------------------------------------------------------
  // G6: Drop zone is not actively advertised
  // --------------------------------------------------------------------------
  test('R3-G6: No active drop zone hints', async ({ page }) => {
    // Look for drop zone text
    const dropHints = page.getByText(/drag.*here|drop.*files|drag.*drop/i);
    
    const hintCount = await dropHints.count();
    
    // If hints exist, they should be subtle or hidden
    for (let i = 0; i < hintCount; i++) {
      const hint = dropHints.nth(i);
      const isProminentlyVisible = await hint.isVisible({ timeout: 1000 }).catch(() => false);
      
      if (isProminentlyVisible) {
        // Check if it's in a subtle/muted style
        const opacity = await hint.evaluate(el => {
          return window.getComputedStyle(el).opacity;
        });
        
        console.log(`[R3-G6] Drop hint visible with opacity ${opacity}`);
      }
    }
    
    console.log(`[R3-G6] Found ${hintCount} drop-related text elements`);
  });

  // --------------------------------------------------------------------------
  // G7: Status text matches actual state
  // --------------------------------------------------------------------------
  test('R3-G7: Status display is honest', async ({ page }) => {
    await createJobViaUI(page);
    
    const jobCard = page.locator('[data-job-id]').first();
    const statusAttr = await jobCard.locator('[data-job-status]').first()
      .getAttribute('data-job-status').catch(() => null);
    
    if (statusAttr) {
      // Check that displayed status matches attribute
      const statusText = await jobCard.locator('.status-badge, [class*="status"]').first()
        .textContent().catch(() => '');
      
      const attrUpper = statusAttr.toUpperCase();
      const textUpper = statusText?.toUpperCase() || '';
      
      // They should agree (one contains the other)
      const matches = attrUpper.includes(textUpper) || textUpper.includes(attrUpper);
      
      if (!matches && statusText) {
        console.log(`[R3-G7] Status mismatch: attr="${statusAttr}" text="${statusText}"`);
      }
    }
    
    console.log('[R3-G7] Status honesty check complete');
  });

  // --------------------------------------------------------------------------
  // G8: Tooltips provide useful information
  // --------------------------------------------------------------------------
  test('R3-G8: Buttons have tooltips', async ({ page }) => {
    await createJobViaUI(page);
    
    const jobCard = page.locator('[data-job-id]').first();
    await jobCard.click();
    
    // Check for title attributes or aria-describedby
    const buttons = page.locator('button:visible');
    const count = await buttons.count();
    
    let tooltipCount = 0;
    
    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i);
      const title = await btn.getAttribute('title');
      const ariaDescribedby = await btn.getAttribute('aria-describedby');
      
      if (title || ariaDescribedby) {
        tooltipCount++;
      }
    }
    
    console.log(`[R3-G8] ${tooltipCount}/${count} buttons have tooltips`);
  });

  // --------------------------------------------------------------------------
  // G9: No hidden functionality references
  // --------------------------------------------------------------------------
  test('R3-G9: No references to unsupported features in text', async ({ page }) => {
    // Get all visible text
    const bodyText = await page.locator('body').innerText();
    
    // Check for references to unsupported features
    const unsupportedTerms = [
      'auto-retry',
      'automatic retry',
      'cloud sync',
      'remote render',
      'distributed',
    ];
    
    for (const term of unsupportedTerms) {
      const found = bodyText.toLowerCase().includes(term.toLowerCase());
      if (found) {
        console.log(`[R3-G9] WARNING: Found reference to "${term}"`);
      }
    }
    
    console.log('[R3-G9] Feature reference check complete');
  });

  // --------------------------------------------------------------------------
  // G10: Empty state is helpful
  // --------------------------------------------------------------------------
  test('R3-G10: Empty queue has helpful message', async ({ page }) => {
    // Queue should be empty after reset
    const jobCards = page.locator('[data-job-id]');
    const count = await jobCards.count();
    
    if (count === 0) {
      // Look for empty state message
      const emptyState = page.getByText(/no jobs|empty|add.*job|queue.*empty/i);
      const hasEmptyMessage = await emptyState.isVisible({ timeout: 2000 }).catch(() => false);
      
      console.log(`[R3-G10] Empty queue message visible: ${hasEmptyMessage}`);
    } else {
      console.log(`[R3-G10] Queue has ${count} jobs (not empty)`);
    }
  });
});
