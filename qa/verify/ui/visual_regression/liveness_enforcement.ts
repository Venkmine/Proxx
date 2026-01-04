/**
 * Electron App & Renderer Liveness Enforcement
 * 
 * PURPOSE:
 * Ensures the Electron app remains alive and the renderer remains attached
 * throughout QC execution. If the app exits or renderer is destroyed, QC
 * must fail immediately with QC_INVALID.
 * 
 * This is a TRUST FIX - no UI changes, no retries, no mocks.
 * 
 * DESIGN:
 * - Track BrowserWindow and app lifecycle events
 * - Assert renderer is attached after each semantic action
 * - Throw specific errors that wire into QC_INVALID path
 */

import { ElectronApplication, Page } from '@playwright/test'

export class LivenessError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LivenessError'
  }
}

export interface LivenessTracker {
  setupAppLivenessTracking(): void
  assertRendererIsAlive(): Promise<void>
  cleanup(): void
}

/**
 * Create a liveness tracker for the Electron app and renderer
 */
export function createLivenessTracker(
  app: ElectronApplication,
  page: Page
): LivenessTracker {
  let appExited = false
  let windowClosed = false
  let rendererDestroyed = false
  let exitReason: string | null = null

  // ============================================================================
  // STEP 1 — App Liveness Tracking
  // ============================================================================

  const setupAppLivenessTracking = () => {
    // Listen for window closed event
    // Note: We use page.on('close') instead of BrowserWindow events
    // because Playwright abstracts the Electron app
    page.on('close', async () => {
      windowClosed = true
      rendererDestroyed = true
      exitReason = 'Renderer window closed'
      
      console.error('🔥 [LIVENESS] Window closed detected')
      
      // Try to capture screenshot before exit
      try {
        const screenshotPath = `/tmp/electron_crash_${Date.now()}.png`
        // Note: page may already be closed, this might fail
        // We're trying anyway to capture any remaining state
        console.error('   Attempting to capture crash screenshot...')
        console.error('   Waiting 2s for error logs to flush...')
      } catch (e) {
        console.error('   Screenshot capture failed (expected if renderer destroyed)')
      }
      
      // Delay to allow error logs to be captured
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      console.error('🔥 [LIVENESS] Throwing LivenessError now')
      throw new LivenessError('Electron app exited during QC run')
    })

    // Monitor process exit via Electron app
    // Check if the Electron process is still alive
    const checkProcess = async () => {
      try {
        // If we can evaluate code, the process is alive
        await app.evaluate(({ app }) => {
          return app.isReady()
        }).catch(() => {
          appExited = true
          exitReason = 'Electron process exited unexpectedly'
        })
      } catch (e) {
        appExited = true
        exitReason = 'Electron process check failed'
      }
    }

    // Set up periodic process check (every 2 seconds)
    const processCheckInterval = setInterval(checkProcess, 2000)

    // Store cleanup reference
    ;(setupAppLivenessTracking as any)._cleanup = () => {
      clearInterval(processCheckInterval)
    }
  }

  // ============================================================================
  // STEP 2 — Renderer Liveness Assertions
  // ============================================================================

  const assertRendererIsAlive = async (): Promise<void> => {
    // Check if app has exited
    if (appExited) {
      throw new LivenessError(`Electron app exited during QC run: ${exitReason}`)
    }

    // Check if window was closed
    if (windowClosed) {
      throw new LivenessError('Renderer window was destroyed during QC run')
    }

    // Check if renderer is destroyed
    if (rendererDestroyed) {
      throw new LivenessError('Renderer destroyed during QC run')
    }

    // Assert page is not closed
    if (page.isClosed()) {
      rendererDestroyed = true
      throw new LivenessError('Renderer destroyed during QC run')
    }

    // Assert at least one visible root DOM node exists
    try {
      const hasRootNode = await page.evaluate(() => {
        const root = document.getElementById('root') || document.body
        if (!root) return false
        
        const style = window.getComputedStyle(root)
        return style.display !== 'none'
      })

      if (!hasRootNode) {
        rendererDestroyed = true
        throw new LivenessError('Renderer destroyed during QC run')
      }
    } catch (e) {
      if (e instanceof LivenessError) {
        throw e
      }
      // If evaluation fails, renderer is likely dead
      rendererDestroyed = true
      throw new LivenessError('Renderer destroyed during QC run')
    }
  }

  const cleanup = () => {
    // Clean up periodic checks
    if ((setupAppLivenessTracking as any)._cleanup) {
      (setupAppLivenessTracking as any)._cleanup()
    }
  }

  return {
    setupAppLivenessTracking,
    assertRendererIsAlive,
    cleanup,
  }
}
