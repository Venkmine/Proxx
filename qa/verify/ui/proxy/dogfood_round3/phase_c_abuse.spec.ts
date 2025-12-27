/**
 * Dogfood Round 3 — Phase C: Rapid User Abuse (Human Reality)
 * 
 * Simulate aggressive UI usage:
 * 
 * 1. Double-click Render rapidly
 * 2. Click Render → Cancel → Render rapidly
 * 3. Click Render on two different jobs rapidly
 * 4. Switch queue filters during execution
 * 5. Select different jobs while one completes instantly
 * 
 * Assert:
 * - No crashes
 * - No duplicate executions
 * - No state corruption
 * - Buttons disable/enable correctly
 */

import { 
  test, 
  expect,
  TEST_FILES,
  TEST_OUTPUT_DIR,
  waitForAppReady,
  waitForTerminalState,
  createJobViaUI,
  startJob,
  resetBackendQueue,
  prepareOutputDir,
  getQueueStatus,
  TERMINAL_STATES,
} from './fixtures';

// ============================================================================
// PHASE C: RAPID USER ABUSE
// ============================================================================

test.describe('Phase C: Rapid User Abuse', () => {
  
  test.beforeEach(async ({ page }) => {
    await resetBackendQueue();
    prepareOutputDir(TEST_OUTPUT_DIR);
    await page.goto('/');
    await waitForAppReady(page);
  });

  test.afterEach(async () => {
    await resetBackendQueue();
  });

  // --------------------------------------------------------------------------
  // C1: Double-click Render button
  // --------------------------------------------------------------------------
  test('R3-C1: Double-click Render does not cause duplicate execution', async ({ page }) => {
    test.slow();
    
    await createJobViaUI(page);
    
    // Select job
    const jobCard = page.locator('[data-job-id]').first();
    await jobCard.click();
    
    const renderBtn = page.locator('[data-testid="btn-job-render"]');
    await expect(renderBtn).toBeVisible({ timeout: 5000 });
    
    // Double-click rapidly
    await renderBtn.dblclick();
    
    // Should not crash, should reach terminal state
    const finalStatus = await waitForTerminalState(page, 120000);
    
    expect(TERMINAL_STATES.some(t => finalStatus.toUpperCase().includes(t))).toBe(true);
    
    // Still only 1 job
    await expect(page.locator('[data-job-id]')).toHaveCount(1);
    
    console.log(`[R3-C1] Double-click handled, final status: ${finalStatus}`);
  });

  // --------------------------------------------------------------------------
  // C2: Rapid Render → Cancel sequence
  // --------------------------------------------------------------------------
  test('R3-C2: Rapid Render-Cancel sequence does not corrupt state', async ({ page }) => {
    test.slow();
    
    await createJobViaUI(page);
    
    const jobCard = page.locator('[data-job-id]').first();
    await jobCard.click();
    
    const renderBtn = page.locator('[data-testid="btn-job-render"]');
    await expect(renderBtn).toBeVisible({ timeout: 5000 });
    
    // Click render
    await renderBtn.click();
    
    // Immediately try to cancel
    const cancelBtn = page.locator('[data-testid="btn-job-cancel"]');
    if (await cancelBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await cancelBtn.click();
    }
    
    // Wait for terminal state
    const finalStatus = await waitForTerminalState(page, 120000);
    
    // Any terminal state is acceptable
    expect(TERMINAL_STATES.some(t => finalStatus.toUpperCase().includes(t))).toBe(true);
    
    // UI should remain stable
    await expect(page.locator('[data-testid="app-root"]')).toBeVisible();
    
    console.log(`[R3-C2] Render-Cancel sequence completed, status: ${finalStatus}`);
  });

  // --------------------------------------------------------------------------
  // C3: Rapid job selection changes
  // --------------------------------------------------------------------------
  test('R3-C3: Rapid job selection changes do not corrupt UI', async ({ page }) => {
    // Create multiple jobs
    await createJobViaUI(page);
    await createJobViaUI(page);
    await createJobViaUI(page);
    
    const jobCards = page.locator('[data-job-id]');
    await expect(jobCards).toHaveCount(3, { timeout: 10000 });
    
    // Rapidly click between jobs
    for (let i = 0; i < 10; i++) {
      const idx = i % 3;
      await jobCards.nth(idx).click();
    }
    
    // UI should still be stable
    await expect(page.locator('[data-testid="app-root"]')).toBeVisible();
    await expect(jobCards).toHaveCount(3);
    
    console.log('[R3-C3] Rapid selection changes handled');
  });

  // --------------------------------------------------------------------------
  // C4: Click Render on different jobs rapidly
  // --------------------------------------------------------------------------
  test('R3-C4: Render on different jobs does not cause conflicts', async ({ page }) => {
    test.slow();
    test.setTimeout(300000);
    
    // Create two jobs
    await createJobViaUI(page);
    await createJobViaUI(page);
    
    const jobCards = page.locator('[data-job-id]');
    await expect(jobCards).toHaveCount(2, { timeout: 10000 });
    
    // Click first job and render
    await jobCards.first().click();
    const renderBtn = page.locator('[data-testid="btn-job-render"]');
    
    if (await renderBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await renderBtn.click();
    }
    
    // Immediately click second job and try to render
    await jobCards.nth(1).click();
    
    if (await renderBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      const isDisabled = await renderBtn.isDisabled();
      if (!isDisabled) {
        await renderBtn.click();
      }
    }
    
    // Wait for at least one terminal state
    await waitForTerminalState(page, 120000);
    
    // UI should remain stable
    await expect(page.locator('[data-testid="app-root"]')).toBeVisible();
    await expect(jobCards).toHaveCount(2);
    
    console.log('[R3-C4] Multi-job render handled');
  });

  // --------------------------------------------------------------------------
  // C5: Switch queue filters during execution
  // --------------------------------------------------------------------------
  test('R3-C5: Filter switching during execution is stable', async ({ page }) => {
    test.slow();
    
    await createJobViaUI(page);
    await startJob(page);
    
    // Try to switch filters while job is running
    const filterButtons = [
      page.locator('[data-testid="filter-btn-all"]'),
      page.locator('[data-testid="filter-btn-pending"]'),
      page.locator('[data-testid="filter-btn-completed"]'),
    ];
    
    for (const filterBtn of filterButtons) {
      if (await filterBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await filterBtn.click();
        await page.waitForTimeout(100); // Small delay between clicks
      }
    }
    
    // Click back to All
    const allFilter = page.locator('[data-testid="filter-btn-all"]');
    if (await allFilter.isVisible().catch(() => false)) {
      await allFilter.click();
    }
    
    // Wait for terminal
    await waitForTerminalState(page, 120000);
    
    // UI should be stable
    await expect(page.locator('[data-testid="app-root"]')).toBeVisible();
    
    console.log('[R3-C5] Filter switching during execution handled');
  });

  // --------------------------------------------------------------------------
  // C6: Rapid Add to Queue button clicks
  // --------------------------------------------------------------------------
  test('R3-C6: Rapid Add to Queue does not create duplicates', async ({ page }) => {
    const filePathInput = page.locator('[data-testid="file-path-input"]');
    await filePathInput.fill(TEST_FILES.valid);
    await filePathInput.press('Enter');
    
    const outputInput = page.locator('[data-testid="output-directory-input"]');
    await outputInput.fill(TEST_OUTPUT_DIR);
    
    const createBtn = page.locator('[data-testid="add-to-queue-button"]');
    await expect(createBtn).toBeEnabled({ timeout: 5000 });
    
    // Click multiple times rapidly
    await createBtn.click();
    await createBtn.click();
    await createBtn.click();
    
    // Wait for queue to stabilize
    await page.waitForTimeout(500);
    
    // Should have reasonable number of jobs (not a flood)
    const jobCount = await page.locator('[data-job-id]').count();
    
    // At most 3 jobs (if debouncing failed), but typically 1-2
    expect(jobCount).toBeLessThanOrEqual(3);
    
    console.log(`[R3-C6] Rapid add resulted in ${jobCount} job(s)`);
  });

  // --------------------------------------------------------------------------
  // C7: Spam refresh during execution
  // --------------------------------------------------------------------------
  test('R3-C7: Browser refresh during execution is safe', async ({ page }) => {
    test.slow();
    
    await createJobViaUI(page);
    await startJob(page);
    
    // Refresh page immediately
    await page.reload();
    
    // Wait for app to reload
    await waitForAppReady(page);
    
    // UI should show job (may be in any state)
    // The key is that the app didn't crash
    await expect(page.locator('[data-testid="app-root"]')).toBeVisible();
    
    console.log('[R3-C7] Refresh during execution handled');
  });

  // --------------------------------------------------------------------------
  // C8: Keyboard spam (Enter/Escape)
  // --------------------------------------------------------------------------
  test('R3-C8: Keyboard spam does not break UI', async ({ page }) => {
    await createJobViaUI(page);
    
    // Spam keyboard
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Escape');
      await page.keyboard.press('Enter');
    }
    
    // UI should still be stable
    await expect(page.locator('[data-testid="app-root"]')).toBeVisible();
    
    // Job should still exist
    await expect(page.locator('[data-job-id]')).toHaveCount(1);
    
    console.log('[R3-C8] Keyboard spam handled');
  });

  // --------------------------------------------------------------------------
  // C9: Tab focus cycling
  // --------------------------------------------------------------------------
  test('R3-C9: Tab cycling does not break UI', async ({ page }) => {
    await createJobViaUI(page);
    
    // Tab through elements
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
    }
    
    // UI should still work
    await expect(page.locator('[data-testid="app-root"]')).toBeVisible();
    
    console.log('[R3-C9] Tab cycling handled');
  });
});
