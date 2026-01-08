/**
 * ⚠️ ELECTRON-ONLY QC GUARD ⚠️
 * 
 * This global setup validates that E2E tests are run against the real
 * Electron application, not Vite dev server or browser.
 * 
 * REQUIREMENTS:
 * 1. E2E_TEST=true environment variable must be set
 * 2. Electron app must be built (frontend/dist-electron/main.js exists)
 * 
 * DO NOT BYPASS THIS GUARD.
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
  
  // Check 1: E2E_TEST environment variable
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
  
  // Check 2: Electron build exists
  const projectRoot = path.resolve(__dirname, '../..')
  const electronMain = path.join(projectRoot, 'frontend/dist-electron/main.js')
  
  if (!fs.existsSync(electronMain)) {
    console.error('╔════════════════════════════════════════════════════════════════╗')
    console.error('║  ❌ GUARD FAILED: Electron build not found                      ║')
    console.error('╠════════════════════════════════════════════════════════════════╣')
    console.error('║  The Electron app must be built before running E2E tests.      ║')
    console.error('║                                                                ║')
    console.error('║  Run: cd frontend && npm run build                             ║')
    console.error('╚════════════════════════════════════════════════════════════════╝\n')
    throw new Error(`Electron main not found at ${electronMain}`)
  }
  
  console.log('✓ E2E_TEST environment set')
  console.log('✓ Electron build found')
  console.log('✓ Guard passed - proceeding with Electron E2E tests\n')
}

export default globalSetup
