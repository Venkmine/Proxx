/**
 * Playwright Test Fixtures for Awaire Proxy UI Tests
 * 
 * AUTHORITATIVE: These fixtures provide common test utilities and page objects.
 * HARDENED: No waitForTimeout - all waits are state-based.
 * 
 * All UI tests must use these fixtures to interact with the application.
 * Never call backend APIs directly from tests - interact through UI only.
 * 
 * ⚠️ VERIFY GUARD:
 * Any change to these fixtures requires updating dependent tests.
 * All waits must be state-based, not time-based.
 */

import { test as base, expect, Page, Locator } from '@playwright/test';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Test configuration
export const TEST_MEDIA_DIR = '/Users/leon.grant/projects/Proxx/test_media';
export const TEST_OUTPUT_DIR = '/tmp/awaire_proxy_test_output';
export const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8085';

// Test media files
export const TEST_FILES = {
  valid: `${TEST_MEDIA_DIR}/test_input_fabric_phase20.mp4`,
  // Add more test files as needed
};

// ============================================
// Hardened Wait Utilities (NO waitForTimeout)
// ============================================

/**
 * Wait for the app to be fully loaded and ready.
 * 
 * Uses UI-state-based checks (DOM selectors), NOT network probes.
 * Frontend must be started manually before Playwright runs.
 * 
 * Waits for:
 * - App root container visible
 * - Header with app title visible
 * - Create job panel or queue area visible
 * - No loading spinners
 */
export async function waitForAppReady(page: Page): Promise<void> {
  // Wait for app root container
  await expect(page.locator('[data-testid="app-root"]')).toBeVisible({ timeout: 10000 });
  
  // Wait for header to be visible (proves React has rendered)
  await expect(page.locator('[data-testid="app-header"]')).toBeVisible({ timeout: 10000 });
  
  // Wait for create job panel OR queue area (proves main UI is ready)
  await expect(
    page.locator('[data-testid="create-job-panel"], [data-testid="job-queue"]').first()
  ).toBeVisible({ timeout: 10000 });
  
  // Wait for any loading spinners to disappear
  const spinner = page.locator('.loading, .spinner, [data-loading="true"]');
  if (await spinner.count() > 0) {
    await expect(spinner.first()).toBeHidden({ timeout: 10000 });
  }
}

/**
 * Wait for a dropdown/select to be populated with options.
 */
export async function waitForDropdownReady(page: Page, dropdownLocator: Locator): Promise<void> {
  await expect(dropdownLocator).toBeVisible({ timeout: 5000 });
  await expect(dropdownLocator).toBeEnabled({ timeout: 5000 });
}

/**
 * Wait for a dropdown menu to open after clicking.
 */
export async function waitForDropdownOpen(page: Page): Promise<void> {
  // Wait for any dropdown menu to appear
  await expect(
    page.locator('[role="listbox"], [role="menu"], .dropdown-menu, [data-state="open"]').first()
  ).toBeVisible({ timeout: 5000 });
}

/**
 * Wait for job to appear in the queue with a specific status.
 */
export async function waitForJobInQueue(page: Page, expectedStatus?: string): Promise<void> {
  // Wait for at least one job card to appear
  await expect(
    page.locator('[data-job-id], .job-card, .job-group').first()
  ).toBeVisible({ timeout: 10000 });
  
  if (expectedStatus) {
    await expect(
      page.getByText(new RegExp(expectedStatus, 'i')).first()
    ).toBeVisible({ timeout: 15000 });
  }
}

/**
 * Wait for job status to change to a specific value.
 * Uses data-job-status attribute to avoid matching filter button labels.
 */
export async function waitForJobStatus(page: Page, status: string, timeout: number = 60000): Promise<void> {
  // Match against data-job-status attribute (uppercase values like RUNNING, COMPLETED)
  // The status parameter can be a regex pattern like 'running|encoding|processing'
  const statusPattern = status.toUpperCase().replace(/\|/g, '|');
  const attrSelector = `[data-job-status]`;
  
  // Find a job element whose data-job-status matches the pattern
  const jobStatusLocator = page.locator(attrSelector).filter({
    has: page.locator(':scope'),
  }).first();
  
  // Use a custom matcher to check the attribute value
  await expect(async () => {
    const elements = await page.locator(attrSelector).all();
    for (const el of elements) {
      const attrValue = await el.getAttribute('data-job-status');
      if (attrValue && new RegExp(statusPattern, 'i').test(attrValue)) {
        return;
      }
    }
    throw new Error(`No job with status matching ${statusPattern}`);
  }).toPass({ timeout });
}

/**
 * Wait for the queue to be empty.
 */
export async function waitForEmptyQueue(page: Page): Promise<void> {
  // Either no job cards or empty state message
  const jobCards = page.locator('[data-job-id], .job-card, .job-group');
  await expect(jobCards).toHaveCount(0, { timeout: 10000 });
}

/**
 * Wait for progress indicator to update.
 */
export async function waitForProgressUpdate(page: Page): Promise<void> {
  // Wait for any progress indicator
  await expect(
    page.locator('[data-progress], .progress, progress, [role="progressbar"]').first()
  ).toBeVisible({ timeout: 10000 });
}

// ============================================
// Page Object: Create Job Panel
// ============================================

export class CreateJobPage {
  readonly page: Page;
  
  // Locators for Create Job panel
  readonly fileDropZone: Locator;
  readonly selectFilesButton: Locator;
  readonly fileList: Locator;
  readonly presetDropdown: Locator;
  readonly outputDirInput: Locator;
  readonly selectFolderButton: Locator;
  readonly createJobButton: Locator;
  readonly clearButton: Locator;
  readonly engineDropdown: Locator;
  
  constructor(page: Page) {
    this.page = page;
    
    // Use text-based and role-based selectors (accessible selectors)
    this.selectFilesButton = page.getByRole('button', { name: /select files/i });
    this.fileDropZone = page.locator('[draggable], .drop-zone').first();
    this.fileList = page.locator('.selected-files, [data-selected-files]');
    this.presetDropdown = page.getByRole('combobox').filter({ hasText: /preset/i }).or(
      page.locator('select').filter({ hasText: /preset/i })
    ).or(page.locator('[aria-label*="preset" i]'));
    this.outputDirInput = page.getByPlaceholder(/output|folder|directory/i).or(
      page.locator('input[type="text"]').filter({ hasText: /output/i })
    );
    this.selectFolderButton = page.getByRole('button', { name: /select folder|browse/i });
    this.createJobButton = page.getByRole('button', { name: /create job|add to queue/i });
    this.clearButton = page.getByRole('button', { name: /clear/i });
    this.engineDropdown = page.getByRole('combobox').filter({ hasText: /engine/i });
  }
  
  async goto() {
    await this.page.goto('/');
    await waitForAppReady(this.page);
  }
  
  async setFilesViaInput(filePaths: string[]) {
    // For browser mode: we need to input file paths as text
    // Find the file input area and enter paths
    const fileInput = this.page.locator('input[type="text"]').first();
    for (const path of filePaths) {
      // Find a text input that accepts file paths
      const pathInput = this.page.getByPlaceholder(/path|file/i).first();
      if (await pathInput.isVisible()) {
        await pathInput.fill(path);
        await this.page.keyboard.press('Enter');
      }
    }
  }
  
  async selectPreset(presetId: string) {
    // Find the preset select element and click to open dropdown
    const selectButtons = await this.page.locator('button').filter({ hasText: /preset|select preset/i }).all();
    for (const btn of selectButtons) {
      if (await btn.isVisible()) {
        await btn.click();
        break;
      }
    }
    // Wait for dropdown options to appear (state-based, not time-based)
    await waitForDropdownOpen(this.page);
    
    // Click the option containing the preset ID
    const option = this.page.getByRole('option', { name: new RegExp(presetId, 'i') }).or(
      this.page.locator(`[data-value="${presetId}"]`)
    ).or(
      this.page.getByText(presetId)
    );
    await expect(option).toBeVisible({ timeout: 5000 });
    await option.click();
  }
  
  async setOutputDirectory(dir: string) {
    // In browser mode, find text input for output directory
    const dirInputs = await this.page.locator('input[type="text"]').all();
    for (const input of dirInputs) {
      const placeholder = await input.getAttribute('placeholder') || '';
      const label = await input.evaluate(el => {
        const label = el.closest('label')?.textContent || '';
        const prev = el.previousElementSibling?.textContent || '';
        return label + prev;
      });
      if (placeholder.toLowerCase().includes('output') || 
          placeholder.toLowerCase().includes('folder') ||
          placeholder.toLowerCase().includes('directory') ||
          label.toLowerCase().includes('output')) {
        await input.fill(dir);
        return;
      }
    }
    // Fallback: fill the last text input (usually output dir)
    const lastInput = this.page.locator('input[type="text"]').last();
    await lastInput.fill(dir);
  }
  
  async createJob() {
    const createBtn = this.page.getByRole('button', { name: /create job|add to queue/i });
    await expect(createBtn).toBeEnabled({ timeout: 5000 });
    await createBtn.click();
  }
  
  async clearPanel() {
    const clearBtn = this.page.getByRole('button', { name: /clear/i });
    if (await clearBtn.isVisible()) {
      await clearBtn.click();
    }
  }
}

// ============================================
// Page Object: Job Queue
// ============================================

export class JobQueuePage {
  readonly page: Page;
  
  // Locators for job queue
  readonly jobList: Locator;
  readonly emptyState: Locator;
  
  constructor(page: Page) {
    this.page = page;
    this.jobList = page.locator('[data-job-list], .job-list, .queue-list').or(
      page.locator('main')
    );
    this.emptyState = page.getByText(/no jobs|queue is empty|no items/i);
  }
  
  getJobCard(jobId: string): Locator {
    return this.page.locator(`[data-job-id="${jobId}"]`).or(
      this.page.locator(`[id="${jobId}"]`)
    ).or(
      this.page.getByText(jobId.slice(0, 8))
    );
  }
  
  async getJobCount(): Promise<number> {
    // Count job cards by looking for job-related elements
    const jobCards = await this.page.locator('[data-job-id], .job-card, .job-group').all();
    return jobCards.length;
  }
  
  async selectJob(jobId: string) {
    const jobCard = this.getJobCard(jobId);
    await jobCard.click();
  }
  
  async waitForJobStatus(jobId: string, status: string, timeout: number = 60000) {
    const jobCard = this.getJobCard(jobId);
    await expect(jobCard.getByText(new RegExp(status, 'i'))).toBeVisible({ timeout });
  }
  
  async getJobStatus(index: number = 0): Promise<string> {
    // Get status badge from nth job
    const statusBadges = await this.page.locator('.status-badge, [data-status]').all();
    if (statusBadges[index]) {
      return await statusBadges[index].textContent() || '';
    }
    return '';
  }
  
  async cancelJob(jobId: string) {
    await this.selectJob(jobId);
    const cancelBtn = this.page.getByRole('button', { name: /cancel|stop/i });
    if (await cancelBtn.isVisible()) {
      await cancelBtn.click();
    }
  }
  
  async retryJob(jobId: string) {
    await this.selectJob(jobId);
    const retryBtn = this.page.getByRole('button', { name: /retry/i });
    if (await retryBtn.isVisible()) {
      await retryBtn.click();
    }
  }
  
  async deleteJob(jobId: string) {
    await this.selectJob(jobId);
    const deleteBtn = this.page.getByRole('button', { name: /delete|remove/i });
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click();
    }
  }
}

// ============================================
// Page Object: Error Display
// ============================================

export class ErrorDisplayPage {
  readonly page: Page;
  
  readonly errorMessages: Locator;
  readonly errorToast: Locator;
  
  constructor(page: Page) {
    this.page = page;
    this.errorMessages = page.locator('.error-message, [role="alert"], .toast-error');
    this.errorToast = page.locator('.toast, [role="status"]').filter({ hasText: /error/i });
  }
  
  async getErrorText(): Promise<string | null> {
    const errors = await this.errorMessages.all();
    if (errors.length > 0) {
      return await errors[0].textContent();
    }
    return null;
  }
  
  async hasError(text: string): Promise<boolean> {
    try {
      await expect(this.page.getByText(new RegExp(text, 'i'))).toBeVisible({ timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }
}

// ============================================
// Backend API Helpers (for test setup/teardown only)
// ============================================

export async function resetBackendQueue(): Promise<void> {
  try {
    await fetch(`${BACKEND_URL}/control/queue/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    // Backend may not be available
  }
}

export async function waitForJobCompletion(jobId: string, timeoutMs: number = 60000): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetch(`${BACKEND_URL}/control/jobs/${jobId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'COMPLETED' || data.status === 'FAILED') {
          return data.status === 'COMPLETED';
        }
      }
    } catch {
      // Continue waiting
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

export async function getBackendJobStatus(jobId: string): Promise<string | null> {
  try {
    const response = await fetch(`${BACKEND_URL}/control/jobs/${jobId}`);
    if (response.ok) {
      const data = await response.json();
      return data.status;
    }
  } catch {
    // Backend not available
  }
  return null;
}

// ============================================
// File System Helpers
// ============================================

export function outputFileExists(outputDir: string, expectedPattern: string): boolean {
  try {
    const result = execSync(`ls -la "${outputDir}" | grep -E "${expectedPattern}"`, {
      encoding: 'utf-8',
    });
    return result.trim().length > 0;
  } catch {
    return false;
  }
}

export function cleanupOutputDir(dir: string = TEST_OUTPUT_DIR): void {
  try {
    execSync(`rm -rf "${dir}"/*`, { encoding: 'utf-8' });
  } catch {
    // Directory might not exist yet
  }
}

export function ensureOutputDir(dir: string = TEST_OUTPUT_DIR): void {
  try {
    execSync(`mkdir -p "${dir}"`, { encoding: 'utf-8' });
  } catch {
    // Ignore errors
  }
}

export function getOutputFileCodec(filePath: string): string | null {
  try {
    const result = execSync(
      `ffprobe -v quiet -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 "${filePath}"`,
      { encoding: 'utf-8' }
    );
    return result.trim();
  } catch {
    return null;
  }
}

export function getOutputFileDuration(filePath: string): number | null {
  try {
    const result = execSync(
      `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`,
      { encoding: 'utf-8' }
    );
    return parseFloat(result.trim());
  } catch {
    return null;
  }
}

// ============================================
// Comprehensive ffprobe Validation (HARDENED)
// ============================================

export interface FFProbeResult {
  exists: boolean;
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
 * Comprehensive ffprobe validation for output files.
 * Returns detailed information or error if file is corrupt/missing.
 */
export function validateOutputFile(filePath: string): FFProbeResult {
  // Check file exists first
  if (!fs.existsSync(filePath)) {
    return { exists: false, error: `File not found: ${filePath}` };
  }
  
  const stats = fs.statSync(filePath);
  if (stats.size === 0) {
    return { exists: true, error: 'File is empty (0 bytes)' };
  }
  
  try {
    // Get comprehensive ffprobe data
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
      error: `ffprobe failed: ${e instanceof Error ? e.message : 'Unknown error'}`,
    };
  }
}

/**
 * Assert that an output file is valid with specific expectations.
 */
export function assertOutputFileValid(
  filePath: string,
  expectations: {
    codec?: string;
    container?: string;
    minDuration?: number;
    maxDuration?: number;
    minWidth?: number;
    minHeight?: number;
  }
): void {
  const result = validateOutputFile(filePath);
  
  if (!result.exists) {
    throw new Error(`Output file validation failed: ${result.error}`);
  }
  
  if (result.error) {
    throw new Error(`Output file is corrupt: ${result.error}`);
  }
  
  if (expectations.codec && result.codec !== expectations.codec) {
    throw new Error(`Expected codec ${expectations.codec}, got ${result.codec}`);
  }
  
  if (expectations.container && !result.container?.includes(expectations.container)) {
    throw new Error(`Expected container ${expectations.container}, got ${result.container}`);
  }
  
  if (expectations.minDuration && (result.duration || 0) < expectations.minDuration) {
    throw new Error(`Expected duration >= ${expectations.minDuration}, got ${result.duration}`);
  }
  
  if (expectations.maxDuration && (result.duration || Infinity) > expectations.maxDuration) {
    throw new Error(`Expected duration <= ${expectations.maxDuration}, got ${result.duration}`);
  }
  
  if (expectations.minWidth && (result.width || 0) < expectations.minWidth) {
    throw new Error(`Expected width >= ${expectations.minWidth}, got ${result.width}`);
  }
  
  if (expectations.minHeight && (result.height || 0) < expectations.minHeight) {
    throw new Error(`Expected height >= ${expectations.minHeight}, got ${result.height}`);
  }
}

/**
 * Find output files matching a pattern in a directory.
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

// ============================================
// Extended Test Fixture
// ============================================

interface ProxyFixtures {
  createJobPage: CreateJobPage;
  jobQueuePage: JobQueuePage;
  errorDisplayPage: ErrorDisplayPage;
}

export const test = base.extend<ProxyFixtures>({
  createJobPage: async ({ page }, use) => {
    const createJobPage = new CreateJobPage(page);
    await createJobPage.goto();
    await use(createJobPage);
  },
  
  jobQueuePage: async ({ page }, use) => {
    const jobQueuePage = new JobQueuePage(page);
    await use(jobQueuePage);
  },
  
  errorDisplayPage: async ({ page }, use) => {
    const errorDisplayPage = new ErrorDisplayPage(page);
    await use(errorDisplayPage);
  },
});

export { expect } from '@playwright/test';
