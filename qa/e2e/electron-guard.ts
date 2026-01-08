/**
 * ⚠️ ELECTRON-ONLY GUARD ⚠️
 * 
 * This module provides hard guards to ensure E2E tests ONLY run against
 * the real Electron application. Any attempt to run tests against Vite,
 * localhost, or browser mode will fail immediately.
 * 
 * REQUIREMENTS:
 * 1. process.env.E2E_TARGET === "electron" (or E2E_TEST=true)
 * 2. window.__ELECTRON__ must be detected in renderer
 * 3. No connections to Vite dev server allowed
 * 
 * DO NOT BYPASS THESE GUARDS.
 */

import { Page } from '@playwright/test'

/**
 * Environment guard - validates test environment is correctly configured
 * for Electron-only testing. Throws immediately if not.
 */
export function assertElectronEnvironment(): void {
  const e2eTarget = process.env.E2E_TARGET
  const e2eTest = process.env.E2E_TEST
  
  // E2E_TARGET=electron is preferred, but E2E_TEST=true is also valid (legacy)
  const isElectronMode = e2eTarget === 'electron' || e2eTest === 'true'
  
  if (!isElectronMode) {
    console.error(`
╔════════════════════════════════════════════════════════════════════════════╗
║  ❌ ELECTRON-ONLY GUARD FAILED                                              ║
╠════════════════════════════════════════════════════════════════════════════╣
║  E2E tests MUST run against the real Electron application.                  ║
║                                                                             ║
║  Current settings:                                                          ║
║    E2E_TARGET = ${e2eTarget || '(not set)'}
║    E2E_TEST = ${e2eTest || '(not set)'}
║                                                                             ║
║  Required: E2E_TARGET=electron OR E2E_TEST=true                             ║
║                                                                             ║
║  Run with: E2E_TEST=true npx playwright test                                ║
╚════════════════════════════════════════════════════════════════════════════╝
    `)
    throw new Error('ELECTRON_ONLY_GUARD: E2E_TARGET !== "electron" and E2E_TEST !== "true"')
  }
  
  console.log('✓ Electron environment guard passed')
}

/**
 * Runtime guard - validates that the page is running in Electron, not browser.
 * Must be called after page is loaded.
 */
export async function assertElectronRuntime(page: Page): Promise<void> {
  // Check 1: __PRELOAD_RAN__ must be set (proves Electron preload script ran)
  const preloadRan = await page.evaluate(() => (window as any).__PRELOAD_RAN__ === true)
  
  if (!preloadRan) {
    const screenshotPath = '/tmp/electron_guard_failure.png'
    await page.screenshot({ path: screenshotPath })
    
    console.error(`
╔════════════════════════════════════════════════════════════════════════════╗
║  ❌ ELECTRON RUNTIME GUARD FAILED                                           ║
╠════════════════════════════════════════════════════════════════════════════╣
║  window.__PRELOAD_RAN__ is not set.                                         ║
║                                                                             ║
║  This means the test is running in browser mode, NOT Electron.              ║
║  Browser-only tests are FORBIDDEN for golden paths.                         ║
║                                                                             ║
║  Screenshot saved to: ${screenshotPath}                                     ║
╚════════════════════════════════════════════════════════════════════════════╝
    `)
    throw new Error('ELECTRON_RUNTIME_GUARD: window.__PRELOAD_RAN__ not detected')
  }
  
  // Check 2: Verify not connected to Vite dev server
  const currentUrl = page.url()
  const isViteUrl = currentUrl.includes('localhost:5173') || 
                   currentUrl.includes('127.0.0.1:5173') ||
                   currentUrl.includes(':5173')
  
  if (isViteUrl) {
    console.error(`
╔════════════════════════════════════════════════════════════════════════════╗
║  ❌ VITE DEV SERVER DETECTED                                                ║
╠════════════════════════════════════════════════════════════════════════════╣
║  Current URL: ${currentUrl}
║                                                                             ║
║  E2E tests MUST NOT connect to Vite dev server.                             ║
║  Use the built Electron app only.                                           ║
║                                                                             ║
║  Run: cd frontend && pnpm run electron:build                                ║
╚════════════════════════════════════════════════════════════════════════════╝
    `)
    throw new Error('VITE_FORBIDDEN: Test is connecting to Vite dev server')
  }
  
  // Check 3: electron object must be exposed
  const hasElectronAPI = await page.evaluate(() => typeof (window as any).electron === 'object')
  
  if (!hasElectronAPI) {
    console.error(`
╔════════════════════════════════════════════════════════════════════════════╗
║  ❌ ELECTRON API NOT EXPOSED                                                ║
╠════════════════════════════════════════════════════════════════════════════╣
║  window.electron is not available.                                          ║
║                                                                             ║
║  This indicates the preload script did not run correctly.                   ║
║  Ensure you are running the Electron app, not a browser.                    ║
╚════════════════════════════════════════════════════════════════════════════╝
    `)
    throw new Error('ELECTRON_API_GUARD: window.electron not exposed')
  }
  
  console.log('✓ Electron runtime guard passed')
}

/**
 * Asserts that a URL is NOT a web/browser URL.
 * Only file:// or app:// URLs are allowed in Electron E2E.
 */
export function assertNotWebUrl(url: string): void {
  const isWebUrl = url.startsWith('http://') || url.startsWith('https://')
  const isVitePort = url.includes(':5173') || url.includes(':3000')
  
  if (isWebUrl && isVitePort) {
    throw new Error(`WEB_URL_FORBIDDEN: URL "${url}" appears to be a dev server URL`)
  }
}

/**
 * Combined guard that runs all Electron-only validations.
 * Call this at the start of every E2E test.
 */
export async function enforceElectronOnly(page: Page): Promise<void> {
  assertElectronEnvironment()
  await assertElectronRuntime(page)
  console.log('✓ All Electron-only guards passed')
}

/**
 * Guard to prevent test execution if backend is not available.
 * Returns backend health status.
 */
export async function assertBackendAvailable(
  backendUrl: string = 'http://127.0.0.1:8085'
): Promise<{ available: boolean; error?: string }> {
  try {
    const response = await fetch(`${backendUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    })
    
    if (response.ok) {
      console.log(`✓ Backend available at ${backendUrl}`)
      return { available: true }
    } else {
      return { 
        available: false, 
        error: `Backend returned status ${response.status}` 
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`⚠ Backend not available at ${backendUrl}: ${message}`)
    return { 
      available: false, 
      error: message 
    }
  }
}
