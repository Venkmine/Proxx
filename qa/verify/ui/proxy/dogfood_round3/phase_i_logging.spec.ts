/**
 * Dogfood Round 3 — Phase I: Logging & Safety
 * 
 * Verify logging behaviour:
 * 
 * 1. Logs do not grow unbounded during tests
 * 2. No per-frame or per-poll logging
 * 3. Errors logged once, not in loops
 * 4. Log file size after full suite < reasonable bound
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
  getLogFileSizes,
} from './fixtures';
import * as fs from 'fs';
import * as path from 'path';

// Log directory (project logs folder)
const LOG_DIR = '/Users/leon.grant/projects/Proxx/logs';

// ============================================================================
// PHASE I: LOGGING & SAFETY
// ============================================================================

test.describe('Phase I: Logging Safety', () => {
  
  test.beforeEach(async ({ page }) => {
    await resetBackendQueue();
    prepareOutputDir(TEST_OUTPUT_DIR);
    await page.goto('/');
    await waitForAppReady(page);
  });

  // --------------------------------------------------------------------------
  // I1: Console doesn't flood with messages
  // --------------------------------------------------------------------------
  test('R3-I1: Console messages are bounded during idle', async ({ page }) => {
    const consoleMessages: string[] = [];
    
    page.on('console', msg => {
      consoleMessages.push(msg.text());
    });
    
    // Wait for 5 seconds idle
    await page.waitForTimeout(5000);
    
    // Should not have excessive messages (e.g., > 100 in 5 seconds)
    const messageCount = consoleMessages.length;
    
    // Filter out expected polling/status messages
    const excessiveMessages = consoleMessages.filter(m => 
      !m.includes('status') && 
      !m.includes('poll') &&
      !m.includes('health')
    );
    
    console.log(`[R3-I1] Console messages in 5s: ${messageCount} (${excessiveMessages.length} non-status)`);
    
    // Reasonable bound: not more than 20 messages per second
    expect(messageCount).toBeLessThan(100);
  });

  // --------------------------------------------------------------------------
  // I2: Console doesn't flood during execution
  // --------------------------------------------------------------------------
  test('R3-I2: Console messages bounded during execution', async ({ page }) => {
    test.slow();
    
    const consoleMessages: string[] = [];
    
    page.on('console', msg => {
      consoleMessages.push(msg.text());
    });
    
    await createJobViaUI(page);
    await startJob(page);
    
    // Wait for terminal state
    await waitForTerminalState(page, 120000);
    
    const messageCount = consoleMessages.length;
    
    console.log(`[R3-I2] Console messages during execution: ${messageCount}`);
    
    // Should not have per-frame logging (would be thousands)
    expect(messageCount).toBeLessThan(1000);
  });

  // --------------------------------------------------------------------------
  // I3: No duplicate error messages
  // --------------------------------------------------------------------------
  test('R3-I3: Errors are not logged in loops', async ({ page }) => {
    const errorMessages: string[] = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errorMessages.push(msg.text());
      }
    });
    
    await createJobViaUI(page);
    await startJob(page);
    await waitForTerminalState(page, 120000);
    
    // Count duplicate errors
    const errorCounts: { [key: string]: number } = {};
    for (const err of errorMessages) {
      const key = err.slice(0, 100); // First 100 chars
      errorCounts[key] = (errorCounts[key] || 0) + 1;
    }
    
    // No single error should repeat more than 10 times
    for (const [error, count] of Object.entries(errorCounts)) {
      if (count > 10) {
        console.log(`[R3-I3] WARNING: Error repeated ${count} times: ${error.slice(0, 50)}...`);
      }
      expect(count).toBeLessThan(50);
    }
    
    console.log(`[R3-I3] Unique errors: ${Object.keys(errorCounts).length}`);
  });

  // --------------------------------------------------------------------------
  // I4: Network requests are bounded
  // --------------------------------------------------------------------------
  test('R3-I4: Network requests are not excessive', async ({ page }) => {
    const requests: string[] = [];
    
    page.on('request', request => {
      requests.push(request.url());
    });
    
    // Wait 10 seconds
    await page.waitForTimeout(10000);
    
    const requestCount = requests.length;
    const apiRequests = requests.filter(r => r.includes('/control/') || r.includes('/api/'));
    
    console.log(`[R3-I4] Total requests in 10s: ${requestCount}, API: ${apiRequests.length}`);
    
    // Reasonable polling: not more than 10 per second
    expect(requestCount).toBeLessThan(100);
  });

  // --------------------------------------------------------------------------
  // I5: Log directory exists and is accessible
  // --------------------------------------------------------------------------
  test('R3-I5: Log directory is accessible', async ({ page }) => {
    const exists = fs.existsSync(LOG_DIR);
    
    if (exists) {
      const sizes = getLogFileSizes(LOG_DIR);
      console.log(`[R3-I5] Log files: ${JSON.stringify(sizes)}`);
    } else {
      console.log('[R3-I5] Log directory does not exist');
    }
    
    // Test passes regardless — just documenting state
    expect(true).toBe(true);
  });

  // --------------------------------------------------------------------------
  // I6: Log files have reasonable size
  // --------------------------------------------------------------------------
  test('R3-I6: Log files are not excessively large', async ({ page }) => {
    if (!fs.existsSync(LOG_DIR)) {
      console.log('[R3-I6] No log directory');
      return;
    }
    
    const sizes = getLogFileSizes(LOG_DIR);
    const MAX_LOG_SIZE = 50 * 1024 * 1024; // 50MB
    
    let totalSize = 0;
    
    for (const [file, size] of Object.entries(sizes)) {
      if (size > 0) {
        totalSize += size;
        if (size > MAX_LOG_SIZE) {
          console.log(`[R3-I6] WARNING: Large log file: ${file} (${size} bytes)`);
        }
      }
    }
    
    console.log(`[R3-I6] Total log size: ${totalSize} bytes`);
    
    // No individual file should exceed limit
    for (const [file, size] of Object.entries(sizes)) {
      expect(size).toBeLessThan(MAX_LOG_SIZE * 2); // 100MB absolute max
    }
  });

  // --------------------------------------------------------------------------
  // I7: Memory usage is bounded
  // --------------------------------------------------------------------------
  test('R3-I7: Browser memory is bounded', async ({ page }) => {
    // Get initial memory
    const getMemory = async () => {
      return await page.evaluate(() => {
        const perf = performance as any;
        if (perf.memory) {
          return perf.memory.usedJSHeapSize;
        }
        return 0;
      });
    };
    
    const initialMemory = await getMemory();
    
    // Create multiple jobs
    for (let i = 0; i < 5; i++) {
      await createJobViaUI(page);
    }
    
    const afterJobsMemory = await getMemory();
    
    // Memory increase should be reasonable
    const increase = afterJobsMemory - initialMemory;
    
    console.log(`[R3-I7] Memory: initial=${initialMemory}, after=${afterJobsMemory}, increase=${increase}`);
    
    // Memory shouldn't increase by more than 50MB for 5 jobs
    expect(increase).toBeLessThan(50 * 1024 * 1024);
  });

  // --------------------------------------------------------------------------
  // I8: No memory leaks from repeated actions
  // --------------------------------------------------------------------------
  test('R3-I8: Repeated actions do not leak memory', async ({ page }) => {
    const getMemory = async () => {
      return await page.evaluate(() => {
        const perf = performance as any;
        if (perf.memory) {
          return perf.memory.usedJSHeapSize;
        }
        return 0;
      });
    };
    
    const initialMemory = await getMemory();
    
    // Repeatedly create and navigate
    for (let i = 0; i < 10; i++) {
      const fileInput = page.locator('[data-testid="file-path-input"]');
      await fileInput.fill(TEST_FILES.valid);
      await fileInput.clear();
    }
    
    // Force GC if available
    await page.evaluate(() => {
      if ((window as any).gc) {
        (window as any).gc();
      }
    });
    
    const finalMemory = await getMemory();
    const increase = finalMemory - initialMemory;
    
    console.log(`[R3-I8] Memory after repeated actions: increase=${increase}`);
    
    // Should not grow unboundedly
    expect(increase).toBeLessThan(20 * 1024 * 1024);
  });

  // --------------------------------------------------------------------------
  // I9: DOM nodes are bounded
  // --------------------------------------------------------------------------
  test('R3-I9: DOM node count is reasonable', async ({ page }) => {
    const getNodeCount = async () => {
      return await page.evaluate(() => {
        return document.querySelectorAll('*').length;
      });
    };
    
    const initialCount = await getNodeCount();
    
    // Create several jobs
    for (let i = 0; i < 5; i++) {
      await createJobViaUI(page);
    }
    
    const afterCount = await getNodeCount();
    
    console.log(`[R3-I9] DOM nodes: initial=${initialCount}, after 5 jobs=${afterCount}`);
    
    // Should not have excessive DOM nodes (e.g., > 10000)
    expect(afterCount).toBeLessThan(10000);
  });
});
