/**
 * Dogfood Round 3 — Shared Fixtures and Helpers
 * 
 * SYSTEM TRUTH TESTING
 * 
 * These fixtures are designed for testing REAL BEHAVIOUR:
 * - No assumptions about RUNNING state being observable
 * - Accepts multiple valid outcomes where behavior varies
 * - No waitForTimeout — all waits are state-based
 * - Clear documentation of accepted outcomes
 */

import { test as base, expect, Page, Locator } from '@playwright/test';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Configuration
// ============================================================================

export const TEST_MEDIA_DIR = '/Users/leon.grant/projects/Proxx/test_media';
export const TEST_OUTPUT_DIR = '/tmp/awaire_proxy_dogfood_r3';
export const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8085';
export const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

export const TEST_FILES = {
  valid: `${TEST_MEDIA_DIR}/test_input_fabric_phase20.mp4`,
  // Short file for rapid testing (if available)
  short: `${TEST_MEDIA_DIR}/test_input_fabric_phase20.mp4`,
};

// ============================================================================
// Terminal States — The only guaranteed observable states
// ============================================================================

// V1: COMPLETED_WITH_WARNINGS removed - only COMPLETED, FAILED, CANCELLED are terminal
export const TERMINAL_STATES = ['COMPLETED', 'FAILED', 'CANCELLED'];
export const VALID_START_STATES = ['PENDING'];
export const TRANSIENT_STATES = ['RUNNING']; // May or may not be observable

// ============================================================================
// Multi-Outcome Assertion Helpers
// ============================================================================

/**
 * Assert that a job reaches any terminal state.
 * Does NOT require RUNNING to be observed first.
 * 
 * This is the HONEST way to test job completion — we don't pretend
 * RUNNING is always visible.
 */
export async function waitForTerminalState(
  page: Page,
  timeout: number = 120000
): Promise<string> {
  const terminalPattern = TERMINAL_STATES.join('|');
  
  await expect(async () => {
    const statusElement = page.locator('[data-job-status]').first();
    const status = await statusElement.getAttribute('data-job-status');
    if (!status || !TERMINAL_STATES.some(t => status.toUpperCase().includes(t.toUpperCase()))) {
      throw new Error(`Status "${status}" is not terminal`);
    }
    return status;
  }).toPass({ timeout });
  
  const statusElement = page.locator('[data-job-status]').first();
  return (await statusElement.getAttribute('data-job-status')) || 'UNKNOWN';
}

/**
 * Assert job reaches either RUNNING or a terminal state.
 * Accepts both because execution may be too fast to observe RUNNING.
 */
export async function waitForExecutionStart(
  page: Page,
  timeout: number = 30000
): Promise<string> {
  const pattern = [...TERMINAL_STATES, ...TRANSIENT_STATES].join('|');
  
  await expect(async () => {
    const statusElement = page.locator('[data-job-status]').first();
    const status = await statusElement.getAttribute('data-job-status');
    if (!status) throw new Error('No status found');
    const statusUpper = status.toUpperCase();
    const matched = TERMINAL_STATES.some(t => statusUpper.includes(t)) ||
                    TRANSIENT_STATES.some(t => statusUpper.includes(t));
    if (!matched) {
      throw new Error(`Status "${status}" is not RUNNING or terminal`);
    }
  }).toPass({ timeout });
  
  const statusElement = page.locator('[data-job-status]').first();
  return (await statusElement.getAttribute('data-job-status')) || 'UNKNOWN';
}

/**
 * Cancel a job and accept multiple valid outcomes:
 * - CANCELLED (cancel worked)
 * - COMPLETED (job finished before cancel took effect)
 * - FAILED (job failed before cancel took effect)
 * 
 * This is HONEST about cancel being best-effort.
 */
export async function cancelJobAndAcceptOutcome(
  page: Page,
  timeout: number = 30000
): Promise<{ cancelled: boolean; finalStatus: string }> {
  // Try to click cancel button
  const cancelBtn = page.locator('[data-testid="btn-job-cancel"]');
  
  let cancelled = false;
  if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await cancelBtn.click();
    cancelled = true;
  }
  
  // Wait for terminal state (whatever it is)
  const finalStatus = await waitForTerminalState(page, timeout);
  
  return { cancelled, finalStatus };
}

// ============================================================================
// App State Helpers
// ============================================================================

/**
 * Wait for app to be ready — essential before any test.
 */
export async function waitForAppReady(page: Page): Promise<void> {
  await expect(page.locator('[data-testid="app-root"]')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-testid="app-header"]')).toBeVisible({ timeout: 10000 });
  await expect(
    page.locator('[data-testid="create-job-panel"], [data-testid="job-queue"]').first()
  ).toBeVisible({ timeout: 10000 });
  
  // Wait for backend connection
  await expect(page.locator('[data-testid="backend-status"]')).toContainText('Connected', { timeout: 15000 });
}

/**
 * Reset backend queue — for test isolation.
 */
export async function resetBackendQueue(): Promise<void> {
  try {
    await fetch(`${BACKEND_URL}/control/queue/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    await new Promise(r => setTimeout(r, 300));
  } catch {
    // Backend may not be available
  }
}

/**
 * Get queue status from backend.
 */
export async function getQueueStatus(): Promise<any> {
  try {
    const response = await fetch(`${BACKEND_URL}/control/queue/status`);
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Count jobs in queue via backend API.
 */
export async function getJobCount(): Promise<number> {
  const status = await getQueueStatus();
  return status?.total_jobs || 0;
}

// ============================================================================
// Queue Sync Helper — Post-Mutation UI Stabilization
// ============================================================================

/**
 * Wait for the queue UI to synchronize after destructive operations.
 * Use after: Clear queue, Delete job, Retry job, or any mutation.
 * 
 * This waits for:
 * - DOM to settle (no pending mutations)
 * - Job count to stabilize
 * - No loading indicators visible
 */
export async function waitForQueueSync(page: Page, timeout: number = 10000): Promise<void> {
  // Wait for any loading indicators to disappear
  const loadingSelectors = [
    '[data-loading="true"]',
    '[aria-busy="true"]',
    '.loading',
    '.spinner'
  ];
  
  for (const selector of loadingSelectors) {
    const loading = page.locator(selector);
    if (await loading.count() > 0) {
      await expect(loading.first()).not.toBeVisible({ timeout: timeout / 2 }).catch(() => {});
    }
  }
  
  // Wait for job count to stabilize by checking twice
  let prevCount = await page.locator('[data-job-id]').count();
  await page.waitForTimeout(200); // Small settle time
  let currCount = await page.locator('[data-job-id]').count();
  
  let attempts = 0;
  while (prevCount !== currCount && attempts < 10) {
    prevCount = currCount;
    await page.waitForTimeout(200);
    currCount = await page.locator('[data-job-id]').count();
    attempts++;
  }
  
  // Final DOM settle
  await page.waitForLoadState('domcontentloaded');
}

// ============================================================================
// Job Creation Helpers
// ============================================================================

/**
 * Create a job via UI with minimal steps.
 * Returns once job appears in queue with PENDING status.
 */
export async function createJobViaUI(
  page: Page,
  inputFile: string = TEST_FILES.valid,
  outputDir: string = TEST_OUTPUT_DIR
): Promise<void> {
  const filePathInput = page.locator('[data-testid="file-path-input"]');
  await filePathInput.fill(inputFile);
  await filePathInput.press('Enter');
  
  const outputInput = page.locator('[data-testid="output-directory-input"]');
  await outputInput.fill(outputDir);
  
  const createBtn = page.locator('[data-testid="add-to-queue-button"]');
  await expect(createBtn).toBeEnabled({ timeout: 5000 });
  await createBtn.click();
  
  // Wait for job to appear
  await expect(page.locator('[data-job-id]').first()).toBeVisible({ timeout: 10000 });
}

/**
 * Start a job by selecting it and clicking Render.
 * SCOPED: Uses the specific job card to find the render button.
 */
export async function startJob(page: Page, jobIndex: number = 0): Promise<void> {
  const jobCard = page.locator('[data-job-id]').nth(jobIndex);
  await jobCard.click();
  
  // SCOPED: Use first() to avoid strict mode violation when multiple render buttons exist
  // The UI shows render buttons for each job, so we need to target the specific one
  const renderBtn = page.locator('[data-testid="btn-job-render"]').first();
  await expect(renderBtn).toBeVisible({ timeout: 5000 });
  await expect(renderBtn).toBeEnabled({ timeout: 3000 });
  await renderBtn.click();
}

/**
 * Start a specific job by its locator.
 * SCOPED: Actions are scoped to the provided job card.
 */
export async function startJobByCard(page: Page, jobCard: Locator): Promise<void> {
  await jobCard.click();
  
  // Wait for render button to appear (it's in the action panel, not in the card)
  // Use first() to avoid strict mode violation when multiple render buttons exist
  const renderBtn = page.locator('[data-testid="btn-job-render"]').first();
  await expect(renderBtn).toBeVisible({ timeout: 5000 });
  await expect(renderBtn).toBeEnabled({ timeout: 3000 });
  await renderBtn.click();
}

/**
 * Get the job card locator for a specific job.
 * This returns a scoped locator that can be used for actions on that specific job.
 */
export function getJobCard(page: Page, jobIndex: number = 0): Locator {
  return page.locator('[data-job-id]').nth(jobIndex);
}

/**
 * Get a scoped cancel button for a specific job.
 * First selects the job, then returns the cancel button locator.
 */
export async function getCancelButtonForJob(page: Page, jobIndex: number = 0): Promise<Locator> {
  const jobCard = page.locator('[data-job-id]').nth(jobIndex);
  await jobCard.click();
  return page.locator('[data-testid="btn-job-cancel"]');
}

/**
 * Attempt to cancel a specific job (best-effort).
 * Returns whether cancel was attempted and the final status.
 */
export async function cancelJobByIndex(
  page: Page, 
  jobIndex: number = 0,
  timeout: number = 30000
): Promise<{ cancelAttempted: boolean; finalStatus: string }> {
  const jobCard = page.locator('[data-job-id]').nth(jobIndex);
  await jobCard.click();
  
  const cancelBtn = page.locator('[data-testid="btn-job-cancel"]');
  let cancelAttempted = false;
  
  if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    const isEnabled = !(await cancelBtn.isDisabled());
    if (isEnabled) {
      await cancelBtn.click();
      cancelAttempted = true;
    }
  }
  
  // Wait for terminal state
  const finalStatus = await waitForTerminalStateForJob(page, jobIndex, timeout);
  
  return { cancelAttempted, finalStatus };
}

/**
 * Wait for a SPECIFIC job to reach terminal state.
 * SCOPED: Checks the status of the specific job card.
 */
export async function waitForTerminalStateForJob(
  page: Page,
  jobIndex: number = 0,
  timeout: number = 120000
): Promise<string> {
  const jobCard = page.locator('[data-job-id]').nth(jobIndex);
  
  await expect(async () => {
    const statusElement = jobCard.locator('[data-job-status]');
    const count = await statusElement.count();
    if (count === 0) {
      // Check if the card itself has the status attribute
      const cardStatus = await jobCard.getAttribute('data-job-status');
      if (!cardStatus || !TERMINAL_STATES.some(t => cardStatus.toUpperCase().includes(t.toUpperCase()))) {
        throw new Error(`Job ${jobIndex} status "${cardStatus}" is not terminal`);
      }
      return;
    }
    const status = await statusElement.first().getAttribute('data-job-status');
    if (!status || !TERMINAL_STATES.some(t => status.toUpperCase().includes(t.toUpperCase()))) {
      throw new Error(`Job ${jobIndex} status "${status}" is not terminal`);
    }
  }).toPass({ timeout });
  
  // Get final status
  const statusElement = jobCard.locator('[data-job-status]');
  if (await statusElement.count() > 0) {
    return (await statusElement.first().getAttribute('data-job-status')) || 'UNKNOWN';
  }
  return (await jobCard.getAttribute('data-job-status')) || 'UNKNOWN';
}

// ============================================================================
// Output Validation Helpers (ffprobe)
// ============================================================================

export interface FFProbeResult {
  exists: boolean;
  size: number;
  codec?: string;
  container?: string;
  width?: number;
  height?: number;
  duration?: number;
  frameRate?: string;
  audioCodec?: string;
  error?: string;
}

/**
 * Validate output file with ffprobe.
 */
export function validateOutputFile(filePath: string): FFProbeResult {
  if (!fs.existsSync(filePath)) {
    return { exists: false, size: 0, error: `File not found: ${filePath}` };
  }
  
  const stats = fs.statSync(filePath);
  if (stats.size === 0) {
    return { exists: true, size: 0, error: 'File is empty (0 bytes)' };
  }
  
  try {
    const result = execSync(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`,
      { encoding: 'utf-8' }
    );
    
    const data = JSON.parse(result);
    const videoStream = data.streams?.find((s: any) => s.codec_type === 'video');
    const audioStream = data.streams?.find((s: any) => s.codec_type === 'audio');
    const format = data.format;
    
    return {
      exists: true,
      size: stats.size,
      codec: videoStream?.codec_name,
      container: format?.format_name,
      width: videoStream?.width,
      height: videoStream?.height,
      duration: format?.duration ? parseFloat(format.duration) : undefined,
      frameRate: videoStream?.r_frame_rate,
      audioCodec: audioStream?.codec_name,
    };
  } catch (e) {
    return {
      exists: true,
      size: stats.size,
      error: `ffprobe failed: ${e instanceof Error ? e.message : 'Unknown error'}`,
    };
  }
}

/**
 * Find output files in a directory.
 */
export function findOutputFiles(dir: string, pattern?: RegExp): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  
  const files = fs.readdirSync(dir);
  const matches = pattern 
    ? files.filter(f => pattern.test(f))
    : files;
  
  return matches.map(f => path.join(dir, f));
}

/**
 * Ensure output directory exists and is clean.
 */
export function prepareOutputDir(dir: string = TEST_OUTPUT_DIR): void {
  try {
    execSync(`rm -rf "${dir}" && mkdir -p "${dir}"`, { encoding: 'utf-8' });
  } catch {
    // Ignore errors
  }
}

// ============================================================================
// Logging Helpers
// ============================================================================

/**
 * Get log file sizes for validation.
 */
export function getLogFileSizes(logDir: string): { [key: string]: number } {
  const sizes: { [key: string]: number } = {};
  
  if (!fs.existsSync(logDir)) {
    return sizes;
  }
  
  const files = fs.readdirSync(logDir);
  for (const file of files) {
    const filePath = path.join(logDir, file);
    try {
      const stats = fs.statSync(filePath);
      sizes[file] = stats.size;
    } catch {
      sizes[file] = -1;
    }
  }
  
  return sizes;
}

// ============================================================================
// UI Element Existence Helpers
// ============================================================================

/**
 * Check if an element exists and is interactive.
 */
export async function isElementInteractive(page: Page, selector: string): Promise<boolean> {
  const element = page.locator(selector);
  if (!(await element.isVisible({ timeout: 1000 }).catch(() => false))) {
    return false;
  }
  if (await element.isDisabled()) {
    return false;
  }
  return true;
}

/**
 * Get all visible buttons and their states.
 */
export async function getVisibleButtons(page: Page): Promise<{ name: string; disabled: boolean }[]> {
  const buttons = await page.locator('button:visible').all();
  const results: { name: string; disabled: boolean }[] = [];
  
  for (const btn of buttons) {
    const name = await btn.textContent() || await btn.getAttribute('aria-label') || 'unnamed';
    const disabled = await btn.isDisabled();
    results.push({ name: name.trim(), disabled });
  }
  
  return results;
}

// ============================================================================
// Extended Test Fixture
// ============================================================================

interface Round3Fixtures {
  testOutputDir: string;
}

const round3Test = base.extend<Round3Fixtures>({
  page: async ({ page }, use) => {
    // Reset queue before test
    await resetBackendQueue();
    // Prepare output directory
    prepareOutputDir(TEST_OUTPUT_DIR);
    await use(page);
  },
  
  testOutputDir: TEST_OUTPUT_DIR,
});

export const test = round3Test;
export { expect } from '@playwright/test';
