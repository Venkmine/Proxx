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

/**
 * MANDATORY: Wait for app to be fully ready (splash screen dismissed)
 * 
 * STRICT RULE: Visual QC screenshots MUST NOT be taken while splash is visible.
 * 
 * This function enforces a readiness gate:
 * - Waits for splash screen to be dismissed (removed from DOM or hidden)
 * - Uses data-testid="splash-screen" as the authoritative indicator
 * - Times out after 30 seconds
 * - On timeout: captures SPLASH_ONLY.png and throws (QC_INVALID)
 * 
 * @throws Error if splash screen never dismisses (QC becomes INVALID)
 */
export async function waitForAppReady(page: Page, artifactDir?: string): Promise<void> {
  const projectRoot = path.resolve(__dirname, '../../../..')
  const timeoutMs = 30000
  
  console.log('⏳ [READINESS GATE] Waiting for splash screen to dismiss...')
  
  try {
    // Wait for splash to be gone OR hidden
    await page.waitForFunction(() => {
      const splash = document.querySelector('[data-testid="splash-screen"]')
      
      if (!splash) {
        // Splash removed from DOM = ready
        return true
      }
      
      // Check if hidden via CSS
      const style = window.getComputedStyle(splash as Element)
      const isHidden = 
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.opacity === '0'
      
      return isHidden
    }, { timeout: timeoutMs })
    
    console.log('✅ [READINESS GATE] Splash dismissed, app ready')
    
  } catch (error) {
    // Timeout: splash never dismissed
    console.error('❌ [READINESS GATE] TIMEOUT: Splash screen never dismissed')
    
    // Capture evidence
    const invalidDir = artifactDir || path.join(projectRoot, 'artifacts/ui/visual/INVALID')
    fs.mkdirSync(invalidDir, { recursive: true })
    
    const splashOnlyPath = path.join(invalidDir, 'SPLASH_ONLY.png')
    const domSnapshotPath = path.join(invalidDir, 'SPLASH_ONLY_dom.html')
    
    await page.screenshot({ path: splashOnlyPath, fullPage: true })
    const domContent = await page.content()
    fs.writeFileSync(domSnapshotPath, domContent)
    
    console.error(`📸 Evidence captured: ${splashOnlyPath}`)
    console.error(`📄 DOM snapshot: ${domSnapshotPath}`)
    
    throw new Error(
      'App never progressed beyond splash screen – visual QC invalid. ' +
      'Screenshot and DOM snapshot saved for debugging.'
    )
  }
}

export interface ElectronFixtures {
  app: ElectronApplication
  page: Page
  visualCollector: VisualCollector
}

export interface VisualCollector {
  captureElectronScreenshot: (name: string) => Promise<string>
  getScreenshotPath: (name: string) => string
  testName: string
  artifactDir: string
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
        // Auto-set output directory to avoid OS dialogs
        QC_OUTPUT_DIR: path.join(projectRoot, 'qc/tmp/output'),
      },
    })
    
    // Set fixed window size for consistent automation
    const firstWindow = await app.firstWindow()
    await firstWindow.setViewportSize({ width: 1440, height: 900 })

    await use(app)
    await app.close()
  },
  
  page: async ({ app }, use) => {
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 })
    
    // MANDATORY: Wait for splash dismissal before ANY visual capture
    await waitForAppReady(page)
    
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
      artifactDir: visualDir,

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
 * MANDATORY PRE-CAPTURE GATE: Assert splash screen is NOT visible
 * 
 * This is a HARD assertion that MUST be called before EVERY visual screenshot capture.
 * If the splash screen is still visible, this will FAIL the test immediately.
 * 
 * Rationale:
 * - Splash screen is a transient startup UI that should NOT be captured in visual QC
 * - GLM-4.6V cannot reliably interpret whether splash "should" be visible
 * - Visual QC screenshots must capture the ACTUAL application UI, not startup states
 * 
 * This is separate from waitForAppReady() because:
 * - waitForAppReady() waits for splash to dismiss (called once in page fixture)
 * - assertNoSplashBeforeCapture() verifies splash is STILL gone (called before each screenshot)
 * 
 * Usage:
 *   await assertNoSplashBeforeCapture(page, 'idle')
 *   const screenshotPath = await captureElectronScreenshot(page, visualCollector, 'idle')
 */
export async function assertNoSplashBeforeCapture(page: Page, screenshotName: string): Promise<void> {
  const splash = await page.locator('[data-testid="splash-screen"]').first()
  const splashExists = await splash.count() > 0

  if (!splashExists) {
    // Splash element not in DOM - good!
    return
  }

  // Splash element exists in DOM - check if it's hidden via CSS
  const isVisible = await splash.isVisible()
  if (!isVisible) {
    // Splash hidden via CSS - good!
    return
  }

  // FAIL: Splash is still visible in DOM and not hidden
  throw new Error(
    `❌ PRE-CAPTURE GATE FAILED: Splash screen is still visible before capturing screenshot '${screenshotName}'. ` +
    `Visual QC screenshots MUST NOT be taken while splash is visible. ` +
    `This invalidates the entire QC run. ` +
    `Possible causes: (1) App startup is too slow, (2) Splash dismissal logic is broken, (3) Test timing issue.`
  )
}

/**
 * MANDATORY: Capture Electron screenshot
 * 
 * Requirements:
 * - Works with Electron (not browser)
 * - Saves PNG to: artifacts/ui/visual/<timestamp>/<test-name>/<name>.png
 * - Captures full window, not clipped regions
 * - MUST call assertNoSplashBeforeCapture() BEFORE calling this function
 * 
 * Usage:
 *   await assertNoSplashBeforeCapture(page, 'idle')
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
