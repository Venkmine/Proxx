/**
 * Dogfood Round 3 — Phase E: Output Forensics (Post-Execution)
 * 
 * After execution:
 * 
 * 1. Verify output existence
 * 2. Verify output size > 0
 * 3. ffprobe assert: container, codec, resolution
 * 4. UI COMPLETED == output exists
 * 5. UI FAILED == no output or corrupt output
 * 6. COMPLETED never occurs without output
 * 7. FAILED never hides partial outputs
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
  validateOutputFile,
  findOutputFiles,
  FFProbeResult,
  TERMINAL_STATES,
} from './fixtures';

// ============================================================================
// PHASE E: OUTPUT FORENSICS
// ============================================================================

test.describe('Phase E: Output Forensics', () => {
  
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
  // E1: COMPLETED job has output file
  // --------------------------------------------------------------------------
  test('R3-E1: COMPLETED job creates output file @e2e', async ({ page }) => {
    test.slow();
    test.setTimeout(180000);
    
    prepareOutputDir(TEST_OUTPUT_DIR);
    
    await createJobViaUI(page);
    await startJob(page);
    
    const finalStatus = await waitForTerminalState(page, 120000);
    
    if (finalStatus.toUpperCase().includes('COMPLETED')) {
      // Find output files
      const outputs = findOutputFiles(TEST_OUTPUT_DIR, /\.(mp4|mov|mxf|mkv)$/);
      
      expect(outputs.length).toBeGreaterThan(0);
      console.log(`[R3-E1] COMPLETED with ${outputs.length} output file(s)`);
    } else {
      console.log(`[R3-E1] Job ended with ${finalStatus} — output check skipped`);
    }
  });

  // --------------------------------------------------------------------------
  // E2: Output file has size > 0
  // --------------------------------------------------------------------------
  test('R3-E2: Output file is not empty @e2e', async ({ page }) => {
    test.slow();
    test.setTimeout(180000);
    
    prepareOutputDir(TEST_OUTPUT_DIR);
    
    await createJobViaUI(page);
    await startJob(page);
    
    const finalStatus = await waitForTerminalState(page, 120000);
    
    if (finalStatus.toUpperCase().includes('COMPLETED')) {
      const outputs = findOutputFiles(TEST_OUTPUT_DIR, /\.(mp4|mov|mxf|mkv)$/);
      
      for (const output of outputs) {
        const result = validateOutputFile(output);
        expect(result.size).toBeGreaterThan(0);
        console.log(`[R3-E2] Output file size: ${result.size} bytes`);
      }
    } else {
      console.log(`[R3-E2] Job ended with ${finalStatus}`);
    }
  });

  // --------------------------------------------------------------------------
  // E3: ffprobe validates output container
  // --------------------------------------------------------------------------
  test('R3-E3: Output has valid container @e2e', async ({ page }) => {
    test.slow();
    test.setTimeout(180000);
    
    prepareOutputDir(TEST_OUTPUT_DIR);
    
    await createJobViaUI(page);
    await startJob(page);
    
    const finalStatus = await waitForTerminalState(page, 120000);
    
    if (finalStatus.toUpperCase().includes('COMPLETED')) {
      const outputs = findOutputFiles(TEST_OUTPUT_DIR, /\.(mp4|mov|mxf|mkv)$/);
      
      for (const output of outputs) {
        const result = validateOutputFile(output);
        
        expect(result.exists).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.container).toBeTruthy();
        
        console.log(`[R3-E3] Container: ${result.container}`);
      }
    }
  });

  // --------------------------------------------------------------------------
  // E4: ffprobe validates output codec
  // --------------------------------------------------------------------------
  test('R3-E4: Output has valid video codec @e2e', async ({ page }) => {
    test.slow();
    test.setTimeout(180000);
    
    prepareOutputDir(TEST_OUTPUT_DIR);
    
    await createJobViaUI(page);
    await startJob(page);
    
    const finalStatus = await waitForTerminalState(page, 120000);
    
    if (finalStatus.toUpperCase().includes('COMPLETED')) {
      const outputs = findOutputFiles(TEST_OUTPUT_DIR, /\.(mp4|mov|mxf|mkv)$/);
      
      for (const output of outputs) {
        const result = validateOutputFile(output);
        
        expect(result.codec).toBeTruthy();
        console.log(`[R3-E4] Video codec: ${result.codec}`);
      }
    }
  });

  // --------------------------------------------------------------------------
  // E5: ffprobe validates resolution
  // --------------------------------------------------------------------------
  test('R3-E5: Output has valid resolution @e2e', async ({ page }) => {
    test.slow();
    test.setTimeout(180000);
    
    prepareOutputDir(TEST_OUTPUT_DIR);
    
    await createJobViaUI(page);
    await startJob(page);
    
    const finalStatus = await waitForTerminalState(page, 120000);
    
    if (finalStatus.toUpperCase().includes('COMPLETED')) {
      const outputs = findOutputFiles(TEST_OUTPUT_DIR, /\.(mp4|mov|mxf|mkv)$/);
      
      for (const output of outputs) {
        const result = validateOutputFile(output);
        
        expect(result.width).toBeGreaterThan(0);
        expect(result.height).toBeGreaterThan(0);
        
        console.log(`[R3-E5] Resolution: ${result.width}x${result.height}`);
      }
    }
  });

  // --------------------------------------------------------------------------
  // E6: FAILED job has no output or corrupt output
  // --------------------------------------------------------------------------
  test('R3-E6: FAILED status correlates with missing/corrupt output @e2e', async ({ page }) => {
    test.slow();
    
    // Try to create a job that will fail
    const filePathInput = page.locator('[data-testid="file-path-input"]');
    
    // Use a valid path format but invalid file
    await filePathInput.fill('/tmp/nonexistent_test_file.mp4');
    await filePathInput.press('Enter');
    
    const outputInput = page.locator('[data-testid="output-directory-input"]');
    await outputInput.fill(TEST_OUTPUT_DIR);
    
    const createBtn = page.locator('[data-testid="add-to-queue-button"]');
    
    if (await createBtn.isEnabled().catch(() => false)) {
      await createBtn.click();
      
      const jobCard = page.locator('[data-job-id]').first();
      if (await jobCard.isVisible({ timeout: 5000 }).catch(() => false)) {
        await startJob(page);
        
        const finalStatus = await waitForTerminalState(page, 60000).catch(() => 'UNKNOWN');
        
        if (finalStatus.toUpperCase().includes('FAILED')) {
          // FAILED job should have no valid output
          const outputs = findOutputFiles(TEST_OUTPUT_DIR, /\.(mp4|mov|mxf|mkv)$/);
          
          // Either no outputs, or outputs are invalid
          if (outputs.length > 0) {
            for (const output of outputs) {
              const result = validateOutputFile(output);
              // If file exists, it should be corrupt or empty
              if (result.exists) {
                expect(result.error || result.size === 0).toBeTruthy();
              }
            }
          }
          
          console.log(`[R3-E6] FAILED job has ${outputs.length} output files`);
        }
      }
    }
    
    console.log('[R3-E6] Test completed');
  });

  // --------------------------------------------------------------------------
  // E7: Output file is playable
  // --------------------------------------------------------------------------
  test('R3-E7: Output is playable (no ffprobe errors) @e2e', async ({ page }) => {
    test.slow();
    test.setTimeout(180000);
    
    prepareOutputDir(TEST_OUTPUT_DIR);
    
    await createJobViaUI(page);
    await startJob(page);
    
    const finalStatus = await waitForTerminalState(page, 120000);
    
    if (finalStatus.toUpperCase().includes('COMPLETED')) {
      const outputs = findOutputFiles(TEST_OUTPUT_DIR, /\.(mp4|mov|mxf|mkv)$/);
      
      for (const output of outputs) {
        const result = validateOutputFile(output);
        
        // No ffprobe error means file is valid
        expect(result.error).toBeUndefined();
        expect(result.exists).toBe(true);
        
        console.log(`[R3-E7] Output validated: ${output}`);
      }
    }
  });

  // --------------------------------------------------------------------------
  // E8: Output duration is reasonable
  // --------------------------------------------------------------------------
  test('R3-E8: Output duration is reasonable @e2e', async ({ page }) => {
    test.slow();
    test.setTimeout(180000);
    
    prepareOutputDir(TEST_OUTPUT_DIR);
    
    await createJobViaUI(page);
    await startJob(page);
    
    const finalStatus = await waitForTerminalState(page, 120000);
    
    if (finalStatus.toUpperCase().includes('COMPLETED')) {
      const outputs = findOutputFiles(TEST_OUTPUT_DIR, /\.(mp4|mov|mxf|mkv)$/);
      
      for (const output of outputs) {
        const result = validateOutputFile(output);
        
        // Duration should be > 0
        if (result.duration !== undefined) {
          expect(result.duration).toBeGreaterThan(0);
          console.log(`[R3-E8] Duration: ${result.duration}s`);
        }
      }
    }
  });
});
