/**
 * E2E Test Helpers for Electron + Playwright
 * 
 * Provides utilities for:
 * - Launching Electron app in test mode
 * - Polling job status
 * - File system verification
 * - UI interaction helpers
 */

import { test as base, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export interface ElectronFixtures {
  app: ElectronApplication
  page: Page
}

/**
 * Extended test fixture that launches Electron app with E2E_TEST=true
 */
export const test = base.extend<ElectronFixtures>({
  app: async ({}, use) => {
    const projectRoot = path.resolve(__dirname, '../..')
    const electronMain = path.join(projectRoot, 'frontend/dist-electron/main.mjs')
    
    // Ensure Electron build exists
    if (!fs.existsSync(electronMain)) {
      throw new Error(
        `Electron main not found at ${electronMain}\n` +
        `Run: cd frontend && pnpm run electron:build`
      )
    }

    // Launch Electron with test mode enabled
    const app = await electron.launch({
      args: [electronMain],
      env: {
        ...process.env,
        E2E_TEST: 'true',
        NODE_ENV: 'test',
        // Don't launch actual backend/vite - app should handle missing services gracefully
      },
    })

    await use(app)

    // Cleanup
    await app.close()
  },

  page: async ({ app }, use) => {
    // Get the first window
    const page = await app.firstWindow()
    
    // Wait for app to be ready
    await page.waitForLoadState('domcontentloaded')
    
    await use(page)
  },
})

export { expect } from '@playwright/test'

/**
 * Poll for job status until it reaches expected state or times out
 */
export async function pollJobStatus(
  page: Page,
  jobId: string,
  expectedStatus: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED',
  timeoutMs = 30_000
): Promise<void> {
  const startTime = Date.now()
  
  while (Date.now() - startTime < timeoutMs) {
    // Query the UI for job status
    const jobRow = page.locator(`[data-job-id="${jobId}"]`)
    
    if (await jobRow.count() > 0) {
      const statusCell = jobRow.locator('[data-testid="job-status"]')
      const currentStatus = await statusCell.textContent()
      
      if (currentStatus?.includes(expectedStatus)) {
        return // Success!
      }
    }
    
    // Wait before next poll
    await page.waitForTimeout(500)
  }
  
  throw new Error(
    `Job ${jobId} did not reach status ${expectedStatus} within ${timeoutMs}ms`
  )
}

/**
 * Wait for file to exist on disk
 */
export async function waitForFile(
  filePath: string,
  timeoutMs = 10_000
): Promise<void> {
  const startTime = Date.now()
  
  while (Date.now() - startTime < timeoutMs) {
    if (fs.existsSync(filePath)) {
      return // File exists!
    }
    
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  
  throw new Error(`File ${filePath} did not appear within ${timeoutMs}ms`)
}

/**
 * Get test media path
 */
export function getTestMediaPath(filename: string): string {
  const projectRoot = path.resolve(__dirname, '../..')
  return path.join(projectRoot, 'test_media', filename)
}

/**
 * Get temporary output directory for tests
 */
export function getTempOutputDir(): string {
  const projectRoot = path.resolve(__dirname, '../..')
  const tempDir = path.join(projectRoot, 'qa/e2e/temp_output')
  
  // Ensure directory exists
  fs.mkdirSync(tempDir, { recursive: true })
  
  return tempDir
}

/**
 * Clean up temporary test files
 */
export function cleanupTempFiles(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}
