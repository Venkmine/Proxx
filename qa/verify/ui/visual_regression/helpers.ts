/**
 * Visual Regression Test Helpers
 * 
 * MANDATORY for all UI change verification.
 * 
 * Provides:
 * - Electron screenshot capture
 * - Timestamped artifact storage
 * - DOM state capture for debugging
 * 
 * CRITICAL:
 * - Works with Electron only (not browser/chromium)
 * - Captures full window, no clipping
 * - Saves to artifacts/ui/visual/<timestamp>/<test-name>/<screenshot>.png
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
  visualCollector: VisualCollector
}

export interface VisualCollector {
  captureElectronScreenshot: (name: string) => Promise<string>
  getScreenshotPath: (name: string) => string
  testName: string
}

/**
 * Extended test fixture with visual verification
 */
export const test = base.extend<ElectronFixtures>({
  app: async ({}, use) => {
    const projectRoot = path.resolve(__dirname, '../../../..')
    const electronMain = path.join(projectRoot, 'frontend/dist-electron/main.mjs')
    
    // Ensure Electron build exists
    if (!fs.existsSync(electronMain)) {
      throw new Error(
        `Electron main not found at ${electronMain}\n` +
        `Run: cd frontend && pnpm run electron:build`
      )
    }

    const electronPath = path.join(projectRoot, 'frontend/node_modules/.bin/electron')

    // Launch Electron with test mode enabled
    const app = await electron.launch({
      executablePath: electronPath,
      args: [electronMain],
      env: {
        ...process.env,
        E2E_TEST: 'true',
        E2E_AUDIT_MODE: '0', // Not audit mode - normal operation
        NODE_ENV: 'test',
      },
    })

    await use(app)
    await app.close()
  },
  
  page: async ({ app }, use) => {
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 })
    
    // Wait for splash screen to disappear before proceeding
    // Splash screen typically has data-testid="splash" or class containing "splash"
    console.log('⏳ Waiting for splash screen to disappear...')
    try {
      await page.waitForFunction(() => {
        const splash = document.querySelector('[data-testid="splash"], [class*="splash"], [class*="Splash"], #splash')
        return !splash || (splash as HTMLElement).style.display === 'none' || (splash as HTMLElement).style.opacity === '0'
      }, { timeout: 15000 })
      console.log('✓ Splash screen gone, app ready')
    } catch (e) {
      // If no splash found or timeout, continue anyway
      console.log('⚠️ Splash wait timeout or not found, continuing...')
    }
    
    // Additional wait for app to stabilize
    await page.waitForTimeout(1000)
    
    await use(page)
  },

  visualCollector: async ({}, use, testInfo) => {
    const projectRoot = path.resolve(__dirname, '../../../..')
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const testName = testInfo.title.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase()
    const visualDir = path.join(projectRoot, 'artifacts/ui/visual', timestamp, testName)

    // Ensure directory exists
    fs.mkdirSync(visualDir, { recursive: true })

    const collector: VisualCollector = {
      testName,

      captureElectronScreenshot: async (name: string) => {
        const screenshotPath = path.join(visualDir, `${name}.png`)
        
        // Get the first (and usually only) window
        const windows = testInfo.project.use?.app 
          ? [(testInfo.project.use.app as ElectronApplication)]
          : []
        
        // Use the page from the test context
        const page = await (windows[0] || (await electron.launch({
          executablePath: path.join(projectRoot, 'frontend/node_modules/.bin/electron'),
          args: [path.join(projectRoot, 'frontend/dist-electron/main.mjs')],
        }))).firstWindow()

        // Capture full window screenshot
        await page.screenshot({ 
          path: screenshotPath,
          fullPage: true,
        })

        console.log(`📸 Screenshot captured: ${name} -> ${screenshotPath}`)
        
        return screenshotPath
      },

      getScreenshotPath: (name: string) => {
        return path.join(visualDir, `${name}.png`)
      }
    }

    await use(collector)
  }
})

export { expect } from '@playwright/test'

/**
 * MANDATORY: Capture Electron screenshot
 * 
 * Requirements:
 * - Works with Electron (not browser)
 * - Saves PNG to: artifacts/ui/visual/<timestamp>/<test-name>/<name>.png
 * - Captures full window, not clipped regions
 * 
 * Usage:
 *   const screenshotPath = await captureElectronScreenshot(page, visualCollector, 'idle')
 *   expect(fs.existsSync(screenshotPath)).toBe(true)
 */
export async function captureElectronScreenshot(
  page: Page,
  visualCollector: VisualCollector,
  name: string
): Promise<string> {
  const screenshotPath = visualCollector.getScreenshotPath(name)
  
  // Capture full window screenshot
  await page.screenshot({ 
    path: screenshotPath,
    fullPage: true,
  })

  // Verify file exists
  if (!fs.existsSync(screenshotPath)) {
    throw new Error(`Screenshot file not created: ${screenshotPath}`)
  }

  const stats = fs.statSync(screenshotPath)
  console.log(`📸 Screenshot captured: ${name} (${Math.round(stats.size / 1024)}KB) -> ${screenshotPath}`)
  
  return screenshotPath
}

/**
 * Wait for job to transition from queued/pending to running
 */
export async function waitForJobRunning(page: Page, timeout = 10000): Promise<boolean> {
  try {
    // Wait for job to show "RUNNING" status
    await page.waitForSelector('[data-job-status="RUNNING"], text=/status.*running/i', {
      timeout,
      state: 'visible'
    })
    return true
  } catch {
    return false
  }
}

/**
 * Wait for progress bar to be visible
 */
export async function waitForProgressVisible(page: Page, timeout = 10000): Promise<boolean> {
  try {
    // Wait for any progress indicator
    await page.waitForSelector('[data-testid*="progress"], [class*="progress"]', {
      timeout,
      state: 'visible'
    })
    return true
  } catch {
    return false
  }
}
