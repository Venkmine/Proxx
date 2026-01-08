/**
 * ⚠️ ELECTRON-ONLY QC GUARD ⚠️
 * 
 * This global setup validates that E2E tests are run against the real
 * Electron application, not Vite dev server or browser.
 * 
 * REQUIREMENTS:
 * 1. E2E_TEST=true environment variable must be set
 * 2. Electron app must be built (frontend/dist-electron/main.js exists)
 * 3. E2E_TARGET must NOT be "browser" or "vite"
 * 
 * DO NOT BYPASS THIS GUARD.
 * 
 * These guards exist because:
 * - Browser-only Playwright runs are FORBIDDEN for golden paths
 * - Tests must click REAL buttons in REAL Electron
 * - Vite dev server cannot test IPC, dialogs, or Electron APIs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function globalSetup() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗')
  console.log('║  🔍 ELECTRON-ONLY QC GUARD                                      ║')
  console.log('╚════════════════════════════════════════════════════════════════╝\n')
  
  // =========================================================================
  // CHECK 1: E2E_TEST environment variable
  // =========================================================================
  if (!process.env.E2E_TEST) {
    console.error('╔════════════════════════════════════════════════════════════════╗')
    console.error('║  ❌ GUARD FAILED: E2E_TEST not set                              ║')
    console.error('╠════════════════════════════════════════════════════════════════╣')
    console.error('║  This QC suite must be run against the Electron app,           ║')
    console.error('║  not Vite or browser. Set E2E_TEST=true to acknowledge.        ║')
    console.error('║                                                                ║')
    console.error('║  Run: E2E_TEST=true npx playwright test                        ║')
    console.error('╚════════════════════════════════════════════════════════════════╝\n')
    throw new Error('E2E_TEST environment variable not set')
  }
  
  // =========================================================================
  // CHECK 2: E2E_TARGET must not be browser/vite (Electron-only enforcement)
  // =========================================================================
  const e2eTarget = process.env.E2E_TARGET?.toLowerCase()
  if (e2eTarget === 'browser' || e2eTarget === 'vite' || e2eTarget === 'web') {
    console.error('╔════════════════════════════════════════════════════════════════╗')
    console.error('║  ❌ GUARD FAILED: E2E_TARGET is browser/vite                    ║')
    console.error('╠════════════════════════════════════════════════════════════════╣')
    console.error('║  Browser-only Playwright runs are FORBIDDEN for golden paths.  ║')
    console.error('║                                                                ║')
    console.error('║  Current E2E_TARGET: ' + (e2eTarget || '(not set)').padEnd(41) + '║')
    console.error('║                                                                ║')
    console.error('║  Use: E2E_TARGET=electron or unset E2E_TARGET                  ║')
    console.error('╚════════════════════════════════════════════════════════════════╝\n')
    throw new Error('E2E_TARGET cannot be browser/vite - Electron only')
  }
  
  // =========================================================================
  // CHECK 3: Electron build exists
  // =========================================================================
  const projectRoot = path.resolve(__dirname, '../..')
  const electronMain = path.join(projectRoot, 'frontend/dist-electron/main.js')
  
  if (!fs.existsSync(electronMain)) {
    console.error('╔════════════════════════════════════════════════════════════════╗')
    console.error('║  ❌ GUARD FAILED: Electron build not found                      ║')
    console.error('╠════════════════════════════════════════════════════════════════╣')
    console.error('║  The Electron app must be built before running E2E tests.      ║')
    console.error('║                                                                ║')
    console.error('║  Expected: ' + electronMain.slice(-50).padEnd(50) + '║')
    console.error('║                                                                ║')
    console.error('║  Run: cd frontend && pnpm run electron:build                   ║')
    console.error('╚════════════════════════════════════════════════════════════════╝\n')
    throw new Error(`Electron main not found at ${electronMain}`)
  }
  
  // =========================================================================
  // CHECK 4: No Vite dev server should be running on :5173
  // =========================================================================
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 2000)
    
    const response = await fetch('http://localhost:5173', { 
      signal: controller.signal 
    }).catch(() => null)
    
    clearTimeout(timeoutId)
    
    if (response?.ok) {
      console.warn('╔════════════════════════════════════════════════════════════════╗')
      console.warn('║  ⚠️  WARNING: Vite dev server detected on :5173                 ║')
      console.warn('╠════════════════════════════════════════════════════════════════╣')
      console.warn('║  A dev server is running, but E2E tests will use Electron.     ║')
      console.warn('║  Ensure your tests are NOT connecting to localhost:5173.       ║')
      console.warn('╚════════════════════════════════════════════════════════════════╝\n')
    }
  } catch {
    // No server running - good
  }
  
  // =========================================================================
  // ALL CHECKS PASSED
  // =========================================================================
  console.log('✓ E2E_TEST environment set')
  console.log('✓ E2E_TARGET is not browser/vite')
  console.log('✓ Electron build found')
  console.log('✓ Guard passed - proceeding with Electron E2E tests\n')
  
  console.log('╔════════════════════════════════════════════════════════════════╗')
  console.log('║  📋 TEST ORDER                                                  ║')
  console.log('╠════════════════════════════════════════════════════════════════╣')
  console.log('║  1. sacred_meta_test.spec.ts (@sacred - MUST PASS)             ║')
  console.log('║  2. golden_path_ui_workflow.spec.ts                            ║')
  console.log('║  3. Other golden_path tests                                    ║')
  console.log('╚════════════════════════════════════════════════════════════════╝\n')
}

export default globalSetup
