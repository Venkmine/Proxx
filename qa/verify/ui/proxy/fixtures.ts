/**
 * Playwright Test Fixtures for Awaire Proxy UI Tests
 * 
 * AUTHORITATIVE: These fixtures provide common test utilities and page objects.
 * 
 * All UI tests must use these fixtures to interact with the application.
 * Never call backend APIs directly from tests - interact through UI only.
 */

import { test as base, expect, Page, Locator } from '@playwright/test';
import { execSync } from 'child_process';

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
    await this.page.waitForLoadState('networkidle');
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
    // Wait for dropdown options to appear
    await this.page.waitForTimeout(300);
    
    // Click the option containing the preset ID
    const option = this.page.getByRole('option', { name: new RegExp(presetId, 'i') }).or(
      this.page.locator(`[data-value="${presetId}"]`)
    ).or(
      this.page.getByText(presetId)
    );
    if (await option.isVisible()) {
      await option.click();
    }
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
