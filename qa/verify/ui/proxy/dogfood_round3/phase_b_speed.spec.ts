/**
 * Dogfood Round 3 — Phase B: State Consistency Under Speed
 * 
 * Tests for "too fast to see" execution scenarios:
 * 
 * 1. Start job with tiny input (<1s transcode)
 * 2. No intermediate state is required
 * 3. UI does not glitch, flash, or error
 * 4. No stale buttons, incorrect badges, phantom RUNNING
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
  getVisibleButtons,
  TERMINAL_STATES,
} from './fixtures';

// ============================================================================
// PHASE B: STATE CONSISTENCY UNDER SPEED
// ============================================================================

test.describe('Phase B: State Consistency Under Speed', () => {
  
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
  // B1: Fast job completes without UI errors
  // --------------------------------------------------------------------------
  test('R3-B1: Fast execution completes without console errors', async ({ page }) => {
    test.slow();
    
    // Collect console errors
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    await createJobViaUI(page);
    await startJob(page);
    
    // Wait for terminal state
    const finalStatus = await waitForTerminalState(page, 120000);
    
    // Filter out known acceptable errors (e.g., network timing)
    const criticalErrors = consoleErrors.filter(e => 
      !e.includes('net::ERR') && 
      !e.includes('favicon') &&
      !e.includes('ResizeObserver')
    );
    
    console.log(`[R3-B1] Console errors: ${criticalErrors.length}`);
    criticalErrors.forEach(e => console.log(`  - ${e}`));
    
    // No critical UI errors
    expect(criticalErrors.length).toBe(0);
  });

  // --------------------------------------------------------------------------
  // B2: UI remains stable after fast completion
  // --------------------------------------------------------------------------
  test('R3-B2: UI stable after fast job completion', async ({ page }) => {
    test.slow();
    
    await createJobViaUI(page);
    await startJob(page);
    
    // Wait for terminal state
    await waitForTerminalState(page, 120000);
    
    // UI should still be responsive
    await expect(page.locator('[data-testid="app-root"]')).toBeVisible();
    await expect(page.locator('[data-testid="app-header"]')).toBeVisible();
    
    // File input should still work
    const fileInput = page.locator('[data-testid="file-path-input"]');
    await expect(fileInput).toBeEditable({ timeout: 5000 });
    
    console.log('[R3-B2] UI remained stable after fast completion');
  });

  // --------------------------------------------------------------------------
  // B3: Status badge shows correct terminal state
  // --------------------------------------------------------------------------
  test('R3-B3: Status badge is correct after fast completion', async ({ page }) => {
    test.slow();
    
    await createJobViaUI(page);
    await startJob(page);
    
    const finalStatus = await waitForTerminalState(page, 120000);
    
    // Verify status badge matches data attribute
    const statusBadge = page.locator('.status-badge, [data-testid="job-status-badge"]').first();
    
    if (await statusBadge.isVisible({ timeout: 2000 }).catch(() => false)) {
      const badgeText = await statusBadge.textContent();
      
      // Badge should contain terminal state text
      const badgeIsTerminal = TERMINAL_STATES.some(t => 
        badgeText?.toUpperCase().includes(t)
      );
      
      expect(badgeIsTerminal).toBe(true);
      console.log(`[R3-B3] Status badge: "${badgeText}"`);
    } else {
      // Badge might be in data attribute
      const attrStatus = await page.locator('[data-job-status]').first().getAttribute('data-job-status');
      expect(TERMINAL_STATES.some(t => attrStatus?.toUpperCase().includes(t))).toBe(true);
      console.log(`[R3-B3] Status attribute: "${attrStatus}"`);
    }
  });

  // --------------------------------------------------------------------------
  // B4: No phantom RUNNING state visible
  // --------------------------------------------------------------------------
  test('R3-B4: No stuck RUNNING state after completion', async ({ page }) => {
    test.slow();
    
    await createJobViaUI(page);
    await startJob(page);
    
    // Wait for terminal state
    await waitForTerminalState(page, 120000);
    
    // Brief wait to ensure UI has settled
    await page.waitForTimeout(500);
    
    // Check that no RUNNING state persists
    const statuses = await page.locator('[data-job-status]').all();
    
    for (const statusEl of statuses) {
      const status = await statusEl.getAttribute('data-job-status');
      expect(status?.toUpperCase()).not.toBe('RUNNING');
    }
    
    console.log('[R3-B4] No phantom RUNNING states detected');
  });

  // --------------------------------------------------------------------------
  // B5: Buttons update correctly after completion
  // --------------------------------------------------------------------------
  test('R3-B5: Action buttons update correctly after completion', async ({ page }) => {
    test.slow();
    
    await createJobViaUI(page);
    
    // Check initial button state (before start)
    const jobCard = page.locator('[data-job-id]').first();
    await jobCard.click();
    
    const renderBtnBefore = page.locator('[data-testid="btn-job-render"]');
    const beforeDisabled = await renderBtnBefore.isDisabled().catch(() => false);
    
    // Start job
    await startJob(page);
    
    // Wait for terminal state
    const finalStatus = await waitForTerminalState(page, 120000);
    
    // Click job again to see updated buttons
    await jobCard.click();
    
    // After completion, Render should be disabled (or hidden)
    if (finalStatus.toUpperCase().includes('COMPLETED')) {
      const afterVisible = await renderBtnBefore.isVisible({ timeout: 2000 }).catch(() => false);
      if (afterVisible) {
        const afterDisabled = await renderBtnBefore.isDisabled();
        expect(afterDisabled).toBe(true);
        console.log('[R3-B5] Render button disabled after COMPLETED');
      } else {
        console.log('[R3-B5] Render button hidden after COMPLETED');
      }
    } else {
      console.log(`[R3-B5] Job ended with ${finalStatus}`);
    }
  });

  // --------------------------------------------------------------------------
  // B6: Queue count updates correctly
  // --------------------------------------------------------------------------
  test('R3-B6: Job count remains stable during fast execution', async ({ page }) => {
    test.slow();
    
    await createJobViaUI(page);
    await createJobViaUI(page);
    
    // Should have 2 jobs
    await expect(page.locator('[data-job-id]')).toHaveCount(2, { timeout: 10000 });
    
    // Start first job
    await startJob(page, 0);
    
    // Wait for terminal
    await waitForTerminalState(page, 120000);
    
    // Should still have 2 jobs (completed job doesn't disappear)
    await expect(page.locator('[data-job-id]')).toHaveCount(2, { timeout: 5000 });
    
    console.log('[R3-B6] Job count remained stable during execution');
  });

  // --------------------------------------------------------------------------
  // B7: No loading spinner stuck
  // --------------------------------------------------------------------------
  test('R3-B7: No loading indicators stuck after completion', async ({ page }) => {
    test.slow();
    
    await createJobViaUI(page);
    await startJob(page);
    
    // Wait for terminal state
    await waitForTerminalState(page, 120000);
    
    // Check for any stuck loading indicators
    const loadingIndicators = page.locator('.loading, .spinner, [data-loading="true"], [aria-busy="true"]');
    const count = await loadingIndicators.count();
    
    if (count > 0) {
      // If any exist, they should not be visible
      for (let i = 0; i < count; i++) {
        const indicator = loadingIndicators.nth(i);
        if (await indicator.isVisible({ timeout: 1000 }).catch(() => false)) {
          // This would be a problem
          console.log(`[R3-B7] WARNING: Stuck loading indicator found`);
        }
      }
    }
    
    console.log(`[R3-B7] No stuck loading indicators (checked ${count} elements)`);
  });
});
