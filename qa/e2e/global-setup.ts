/**
 * ⚠️ ELECTRON-ONLY QC GUARD + BACKEND LIFECYCLE ⚠️
 * 
 * This global setup:
 * 1. Validates E2E tests are run against the real Electron application
 * 2. Starts the backend if not already running
 * 3. Verifies /health before tests proceed
 * 
 * REQUIREMENTS:
 * 1. E2E_TEST=true environment variable must be set
 * 2. Electron app must be built (frontend/dist-electron/main.js exists)
 * 3. E2E_TARGET must NOT be "browser" or "vite"
 * 4. Backend must be healthy on :8085 before tests run
 * 
 * DO NOT BYPASS THIS GUARD.
 * 
 * These guards exist because:
 * - Browser-only Playwright runs are FORBIDDEN for golden paths
 * - Tests must click REAL buttons in REAL Electron
 * - Vite dev server cannot test IPC, dialogs, or Electron APIs
 * - Backend must be available for job execution
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, ChildProcess, execSync } from 'node:child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const BACKEND_URL = 'http://127.0.0.1:8085'
const BACKEND_HEALTH_TIMEOUT_MS = 30_000
const BACKEND_STARTUP_DELAY_MS = 2000

// Store backend process for cleanup
let backendProcess: ChildProcess | null = null

/**
 * Check if backend is already running and healthy
 */
async function isBackendHealthy(): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)
    
    const response = await fetch(`${BACKEND_URL}/health`, {
      signal: controller.signal,
    })
    
    clearTimeout(timeoutId)
    return response.ok
  } catch {
    return false
  }
}

/**
 * Wait for backend to become healthy
 */
async function waitForBackendHealth(maxWaitMs: number): Promise<boolean> {
  const startTime = Date.now()
  
  while (Date.now() - startTime < maxWaitMs) {
    if (await isBackendHealthy()) {
      return true
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  
  return false
}

/**
 * Start the backend server
 */
async function startBackend(projectRoot: string): Promise<void> {
  const backendDir = path.join(projectRoot, 'backend')
  const venvPython = path.join(backendDir, '.venv/bin/python')
  
  // Check if virtual environment exists
  if (!fs.existsSync(venvPython)) {
    throw new Error(`Backend virtual environment not found at ${venvPython}. Run: cd backend && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`)
  }
  
  console.log('[BACKEND] Starting backend server...')
  
  // Start uvicorn with the backend's Python environment
  backendProcess = spawn(
    venvPython,
    ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8085'],
    {
      cwd: backendDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
      env: {
        ...process.env,
        PYTHONPATH: backendDir,
      },
    }
  )
  
  // Log backend output for debugging
  backendProcess.stdout?.on('data', (data) => {
    const line = data.toString().trim()
    if (line) console.log(`[BACKEND] ${line}`)
  })
  
  backendProcess.stderr?.on('data', (data) => {
    const line = data.toString().trim()
    if (line) console.log(`[BACKEND] ${line}`)
  })
  
  backendProcess.on('error', (error) => {
    console.error(`[BACKEND] Process error: ${error.message}`)
  })
  
  backendProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[BACKEND] Process exited with code ${code}`)
    }
  })
  
  // Store process reference for globalTeardown
  process.env.__BACKEND_PID__ = String(backendProcess.pid)
  
  console.log(`[BACKEND] Started with PID ${backendProcess.pid}`)
}

async function globalSetup() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗')
  console.log('║  🔍 ELECTRON-ONLY QC GUARD + BACKEND LIFECYCLE                  ║')
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
  // ALL GUARDS PASSED - Now ensure backend is available
  // =========================================================================
  console.log('✓ E2E_TEST environment set')
  console.log('✓ E2E_TARGET is not browser/vite')
  console.log('✓ Electron build found')
  
  // =========================================================================
  // CHECK 5: Backend lifecycle management
  // =========================================================================
  console.log('\n[BACKEND] Checking backend availability...')
  
  const backendAlreadyRunning = await isBackendHealthy()
  
  if (backendAlreadyRunning) {
    console.log('✓ Backend already running and healthy')
    process.env.__BACKEND_MANAGED__ = 'false'
  } else {
    console.log('[BACKEND] Backend not running, starting it...')
    
    try {
      await startBackend(projectRoot)
      
      // Wait for backend to become healthy
      console.log('[BACKEND] Waiting for backend to become healthy...')
      const healthy = await waitForBackendHealth(BACKEND_HEALTH_TIMEOUT_MS)
      
      if (!healthy) {
        console.error('╔════════════════════════════════════════════════════════════════╗')
        console.error('║  ❌ BACKEND STARTUP FAILED                                      ║')
        console.error('╠════════════════════════════════════════════════════════════════╣')
        console.error('║  Backend did not become healthy within timeout.                ║')
        console.error('║                                                                ║')
        console.error('║  Troubleshooting:                                              ║')
        console.error('║  1. Check backend logs above for errors                        ║')
        console.error('║  2. Ensure port 8085 is not in use                             ║')
        console.error('║  3. Try: cd backend && source .venv/bin/activate               ║')
        console.error('║     python -m uvicorn app.main:app --port 8085                 ║')
        console.error('╚════════════════════════════════════════════════════════════════╝\n')
        throw new Error('Backend failed to start')
      }
      
      console.log('✓ Backend started and healthy')
      process.env.__BACKEND_MANAGED__ = 'true'
    } catch (error) {
      console.error(`[BACKEND] Failed to start: ${error}`)
      throw error
    }
  }
  
  console.log('✓ All guards passed - proceeding with Electron E2E tests\n')
  
  console.log('╔════════════════════════════════════════════════════════════════╗')
  console.log('║  📋 TEST ORDER                                                  ║')
  console.log('╠════════════════════════════════════════════════════════════════╣')
  console.log('║  1. sacred_meta_test.spec.ts (@sacred - MUST PASS)             ║')
  console.log('║  2. golden_path_ui_workflow.spec.ts                            ║')
  console.log('║  3. Other golden_path tests                                    ║')
  console.log('╚════════════════════════════════════════════════════════════════╝\n')
}

export default globalSetup
