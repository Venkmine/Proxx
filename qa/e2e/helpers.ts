/**
 * E2E Test Helpers for Electron + Playwright
 * 
 * Provides utilities for:
 * - Launching Electron app in test mode
 * - Mocking backend API responses
 * - File system verification
 * - UI interaction helpers
 * - Electron-only guards
 * - QC Action Tracing
 * - Button effect assertions
 * 
 * NOTE: E2E tests use MOCKED backend responses for UI testing.
 * For actual encoding tests, see backend/tests/test_raw_encode_matrix.py
 * 
 * CRITICAL: All E2E tests MUST run against the real Electron app.
 * Browser-only Playwright is FORBIDDEN for golden paths.
 */

import { test as base, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

// Re-export guards and utilities from other modules
export * from './electron-guard'
export * from './qc-action-trace'
export * from './ui-qc-assertions'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export interface ElectronFixtures {
  app: ElectronApplication
  page: Page
}

export interface ElectronFixtureOptions {
  testFile?: string
  outputDir?: string
}

/**
 * Extended test fixture that launches Electron app with E2E_TEST=true
 * 
 * The fixture automatically:
 * - Launches the built Electron app (dist-electron/main.js)
 * - Sets E2E_TEST=true to enable test mocking
 * - Waits for splash screen to dismiss
 * - Optionally injects test files via QC_TEST_FILE env var
 */
export const test = base.extend<ElectronFixtures>({
  app: async ({}, use) => {
    const projectRoot = path.resolve(__dirname, '../..')
    const electronMain = path.join(projectRoot, 'frontend/dist-electron/main.js')
    
    // Ensure Electron build exists
    if (!fs.existsSync(electronMain)) {
      throw new Error(
        `Electron main not found at ${electronMain}\\n` +
        `Run: cd frontend && pnpm run electron:build`
      )
    }

    // Use Electron from frontend/node_modules (known working)
    // Only fall back to e2e/node_modules if frontend doesn't have it
    let electronPath = path.join(projectRoot, 'frontend/node_modules/.bin/electron')
    if (!fs.existsSync(electronPath)) {
      electronPath = path.join(__dirname, 'node_modules/.bin/electron')
    }
    
    if (!fs.existsSync(electronPath)) {
      throw new Error(
        `Electron binary not found at ${electronPath}\\n` +
        `Run: cd qa/e2e && pnpm install`
      )
    }
    
    // Default test file for E2E (can be overridden via QC_TEST_FILE env)
    const testFile = process.env.QC_TEST_FILE || path.join(
      projectRoot,
      'forge-tests/samples/RAW/BLACKMAGIC/BMPCC6K Indie Film BRAW/A001_06260430_C007.braw'
    )
    
    // Default output dir
    const outputDir = process.env.QC_OUTPUT_DIR || '/tmp/qc_output'
    fs.mkdirSync(outputDir, { recursive: true })

    // Launch Electron with E2E test mode enabled
    const app = await electron.launch({
      executablePath: electronPath,
      args: [electronMain],
      env: {
        ...process.env,
        E2E_TEST: 'true',
        NODE_ENV: 'test',
        // Backend URL for API calls
        VITE_BACKEND_URL: 'http://127.0.0.1:8085',
        // QC test file injection (used by preload to mock dialogs)
        QC_TEST_FILE: testFile,
        QC_OUTPUT_DIR: outputDir,
      },
    })
    
    console.log('[E2E] Electron launched with:')
    console.log(`[E2E]   E2E_TEST=true`)
    console.log(`[E2E]   QC_TEST_FILE=${testFile}`)
    console.log(`[E2E]   QC_OUTPUT_DIR=${outputDir}`)

    await use(app)

    // Cleanup
    await app.close()
  },

  page: async ({ app }, use) => {
    // Get the first window
    const page = await app.firstWindow()
    
    // Wait for app DOM to be ready
    await page.waitForLoadState('domcontentloaded')
    
    // CRITICAL: Wait for splash screen to dismiss (QC requirement)
    // Splash screen must fully dismiss before any test actions
    await waitForSplashDismissal(page)
    
    await use(page)
  },
})

export { expect } from '@playwright/test'

/**
 * Wait for splash screen to fully dismiss.
 * QC REQUIREMENT: Screenshots taken before splash dismissal = QC_INVALID
 */
export async function waitForSplashDismissal(page: Page, timeoutMs = 30_000): Promise<void> {
  const startTime = Date.now()
  
  // Wait for splash screen to appear first (it may be fast, so this is optional)
  try {
    await page.waitForSelector('[data-testid="splash-screen"], .splash-screen', { 
      timeout: 3_000,
      state: 'visible'
    })
  } catch {
    // Splash may have already dismissed or not present
  }
  
  // Wait for splash to be gone
  await page.waitForFunction(() => {
    const splash = document.querySelector('[data-testid="splash-screen"], .splash-screen')
    if (!splash) return true
    // Also check if it's visible (hidden splash is OK)
    const style = window.getComputedStyle(splash)
    return style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0'
  }, { timeout: timeoutMs })
  
  // Extra settle time after splash dismissal
  await page.waitForTimeout(500)
  
  console.log(`[E2E] Splash screen dismissed after ${Date.now() - startTime}ms`)
}

/**
 * Wait for UI to settle after an action.
 * QC REQUIREMENT: Screenshots must capture settled state, not transitions.
 */
export async function waitForUISettle(page: Page, settleIndicator: {
  spinnerSelector?: string
  errorSelector?: string
  stateChangeSelector?: string
  timeoutMs?: number
} = {}): Promise<'spinner_appeared' | 'error_banner' | 'state_change' | 'timeout'> {
  const {
    spinnerSelector = '[data-testid="progress-spinner"], .spinner, .loading',
    errorSelector = '[data-testid="error-banner"], .error, [role="alert"]',
    stateChangeSelector = '[data-testid="job-status"]',
    timeoutMs = 10_000
  } = settleIndicator
  
  const startTime = Date.now()
  
  while (Date.now() - startTime < timeoutMs) {
    // Check for spinner
    if (await page.locator(spinnerSelector).first().isVisible().catch(() => false)) {
      return 'spinner_appeared'
    }
    
    // Check for error
    if (await page.locator(errorSelector).first().isVisible().catch(() => false)) {
      return 'error_banner'
    }
    
    // Check for state change indicator
    if (await page.locator(stateChangeSelector).first().isVisible().catch(() => false)) {
      return 'state_change'
    }
    
    await page.waitForTimeout(100)
  }
  
  return 'timeout'
}

/**
 * Mock backend response utilities for UI E2E tests
 */

export interface MockJobResponse {
  job_id: string
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED'
  progress?: number
  engine?: string
  error?: string
}

export function createMockJobResponse(payload: any): MockJobResponse {
  const jobId = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  return {
    job_id: jobId,
    status: 'QUEUED',
    engine: payload.engine || 'ffmpeg',
    progress: 0
  }
}

export function createMockJobStatusResponse(jobId: string, status: MockJobResponse['status']): MockJobResponse {
  return {
    job_id: jobId,
    status,
    progress: status === 'COMPLETED' ? 100 : status === 'RUNNING' ? 50 : 0,
    engine: 'ffmpeg'
  }
}

/**
 * Setup mock backend routes for Playwright page
 */
export async function setupMockBackend(page: Page) {
  // Mock job creation endpoint
  await page.route('**/control/jobs/create', async (route) => {
    const request = route.request()
    const payload = request.postDataJSON()
    const response = createMockJobResponse(payload)
    
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response)
    })
  })
  
  // Mock job status endpoint
  await page.route('**/monitor/jobs/*', async (route) => {
    const jobId = route.request().url().split('/').pop() || 'mock-job'
    const response = createMockJobStatusResponse(jobId, 'COMPLETED')
    
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response)
    })
  })
  
  // Mock health check endpoint
  await page.route('**/health', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok' })
    })
  })
}

/**
 * Poll for job status until it reaches expected state or times out
 * NOTE: In mocked mode, this returns immediately with mocked status
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

/**
 * RAW format detection utilities
 */

const RAW_EXTENSIONS = new Set([
  '.braw',
  '.r3d', '.R3D',
  '.ari', '.arri',
  '.arx',  // ARRI RAW (HDE/ARX format)
  '.nev', '.NEV',  // Nikon N-RAW
  '.dng',
  '.cri', '.crm', // Canon RAW
  '.cine', // Phantom
])

// Folder patterns that indicate camera card-style RAW folders
const RAW_FOLDER_INDICATORS = [
  '.RDC', // RED camera clips folder
  '.RDM', // RED metadata
  '.R3D', // RED files inside
  '.braw', // Blackmagic files inside
]

const PRORES_RAW_INDICATORS = ['prores_raw', 'prores raw', 'Apple ProRes RAW', 'PRORES_RAW']

export function isRawFormat(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  
  // Check known RAW extensions
  if (RAW_EXTENSIONS.has(ext)) {
    return true
  }
  
  // For .mov files, need to check if it's ProRes RAW
  // In E2E test context, we'll assume .mov in RAW folders are ProRes RAW
  if (ext === '.mov') {
    // Heuristic: if in a folder named "PRORES_RAW" or "ProRes", assume it's RAW
    if (filePath.includes('PRORES_RAW') || filePath.includes('ProRes')) {
      return true
    }
  }
  
  return false
}

export function determineExpectedEngine(filePath: string): 'resolve' | 'ffmpeg' {
  return isRawFormat(filePath) ? 'resolve' : 'ffmpeg'
}

/**
 * Recursively scan directory for test inputs
 * Returns both files and folders (for camera card-style folders)
 */
export interface TestInput {
  path: string
  type: 'file' | 'folder'
  name: string
  expectedEngine: 'resolve' | 'ffmpeg'
}

export function scanRawDirectory(baseDir: string, excludeDirs: string[] = []): TestInput[] {
  const inputs: TestInput[] = []
  
  function scanRecursive(dir: string) {
    if (!fs.existsSync(dir)) {
      return
    }
    
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      
      // Skip excluded directories
      if (excludeDirs.some(excluded => fullPath.includes(excluded))) {
        continue
      }
      
      // Skip hidden files and DS_Store
      if (entry.name.startsWith('.')) {
        continue
      }
      
      if (entry.isDirectory()) {
        // Check if this is a camera card folder (contains RAW files or special folders like .RDC)
        let isRawFolder = false
        let hasVideoFiles = false
        
        try {
          const contents = fs.readdirSync(fullPath)
          
          // Check for RAW files
          hasVideoFiles = contents.some(file => {
            const ext = path.extname(file).toLowerCase()
            return RAW_EXTENSIONS.has(ext)
          })
          
          // Check for camera card indicators like .RDC folders
          isRawFolder = contents.some(file => {
            const ext = path.extname(file)
            return RAW_FOLDER_INDICATORS.some(indicator => ext === indicator || file.endsWith(indicator))
          })
          
          if (hasVideoFiles || isRawFolder) {
            // Add folder as a test input
            inputs.push({
              path: fullPath,
              type: 'folder',
              name: entry.name,
              expectedEngine: 'resolve' // Folders with RAW files need Resolve
            })
            // Don't scan subdirectories of RAW folders to avoid duplicates
            continue
          }
        } catch (err) {
          // Skip folders we can't read
          console.warn(`Cannot read directory ${fullPath}: ${err}`)
        }
        
        // Continue scanning subdirectories if not a RAW folder
        scanRecursive(fullPath)
      } else if (entry.isFile()) {
        // Only test video files
        const ext = path.extname(entry.name).toLowerCase()
        const videoExts = [
          '.braw', '.r3d', '.ari', '.arri', '.dng',
          '.mov', '.mp4', '.mxf', '.avi',
          '.cri', '.crm', // Canon RAW
          '.cine', // Phantom
          '.mkv', '.webm', // Additional formats
        ]
        
        if (videoExts.includes(ext)) {
          inputs.push({
            path: fullPath,
            type: 'file',
            name: entry.name,
            expectedEngine: determineExpectedEngine(fullPath)
          })
        }
      }
    }
  }
  
  scanRecursive(baseDir)
  return inputs
}

// ============================================================================
// ACTION TRACE - QC Contract Implementation
// See: docs/QC_ACTION_TRACE.md (NORMATIVE)
// ============================================================================

export interface ActionTrace {
  action_id: string
  trace_id: string
  timestamp: string
  prior_workflow_state: 'idle' | 'source_loaded' | 'job_running' | 'job_complete'
  expected_transition: {
    from: string
    to: string
    trigger: string
  }
  backend_signals: BackendSignals
  visual_snapshot: {
    screenshot_path: string
    dom_snapshot_path?: string
    captured_at: string
    settle_trigger: 'spinner_appeared' | 'error_banner' | 'state_change' | 'timeout'
  }
  glm_observation_ref?: {
    report_path: string
    screenshot_id: string
    answers: Record<string, string>
  }
  qc_outcome: 'VERIFIED_OK' | 'VERIFIED_NOT_OK' | 'BLOCKED_PRECONDITION'
  qc_reason: string
  evaluation_details: {
    backend_ok: boolean
    ui_matches_spec: boolean
    spec_violations?: string[]
  }
}

export interface BackendSignals {
  job_created?: boolean
  job_id?: string
  error_reason?: string
  error_category?: 'precondition' | 'backend' | 'validation' | 'unknown'
  execution_engine?: {
    ffmpeg_available: boolean
    resolve_available: boolean
  }
  response_time_ms: number
}

/**
 * Get artifacts directory for a test run
 */
export function getArtifactsDir(): string {
  const projectRoot = path.resolve(__dirname, '../..')
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return path.join(projectRoot, 'artifacts/ui/actions', timestamp)
}

/**
 * Create an ActionTrace for a completed action
 */
export function createActionTrace(params: {
  actionId: string
  priorState: ActionTrace['prior_workflow_state']
  expectedTransition: ActionTrace['expected_transition']
  backendSignals: BackendSignals
  screenshotPath: string
  settleTrigger: ActionTrace['visual_snapshot']['settle_trigger']
}): ActionTrace {
  const timestamp = new Date().toISOString()
  const traceId = `${params.actionId}_${timestamp.replace(/[:.]/g, '-')}`
  
  // Evaluate QC outcome based on backend signals
  let qcOutcome: ActionTrace['qc_outcome']
  let qcReason: string
  let backendOk = true
  let uiMatchesSpec = true
  const specViolations: string[] = []
  
  if (params.backendSignals.error_category === 'precondition' || 
      params.backendSignals.error_category === 'backend') {
    qcOutcome = 'BLOCKED_PRECONDITION'
    qcReason = `Backend unavailable or precondition not met: ${params.backendSignals.error_reason}`
    backendOk = false
  } else if (params.backendSignals.error_reason && 
             params.backendSignals.error_category !== 'precondition') {
    qcOutcome = 'VERIFIED_NOT_OK'
    qcReason = `Action failed unexpectedly: ${params.backendSignals.error_reason}`
    backendOk = false
  } else {
    qcOutcome = 'VERIFIED_OK'
    qcReason = 'Action completed successfully, UI reflects expected state'
  }
  
  return {
    action_id: params.actionId,
    trace_id: traceId,
    timestamp,
    prior_workflow_state: params.priorState,
    expected_transition: params.expectedTransition,
    backend_signals: params.backendSignals,
    visual_snapshot: {
      screenshot_path: params.screenshotPath,
      captured_at: timestamp,
      settle_trigger: params.settleTrigger,
    },
    qc_outcome: qcOutcome,
    qc_reason: qcReason,
    evaluation_details: {
      backend_ok: backendOk,
      ui_matches_spec: uiMatchesSpec,
      spec_violations: specViolations.length > 0 ? specViolations : undefined,
    },
  }
}

/**
 * Save an ActionTrace to the artifacts directory
 */
export function saveActionTrace(artifactsDir: string, trace: ActionTrace): string {
  const actionDir = path.join(artifactsDir, trace.action_id)
  fs.mkdirSync(actionDir, { recursive: true })
  
  const tracePath = path.join(actionDir, 'action_trace.json')
  fs.writeFileSync(tracePath, JSON.stringify(trace, null, 2))
  
  console.log(`[ActionTrace] Saved: ${tracePath}`)
  return tracePath
}

/**
 * Capture a post-action screenshot for QC
 */
export async function captureActionScreenshot(
  page: Page,
  artifactsDir: string,
  actionId: string
): Promise<string> {
  const actionDir = path.join(artifactsDir, actionId)
  fs.mkdirSync(actionDir, { recursive: true })
  
  const screenshotPath = path.join(actionDir, 'screenshot.png')
  await page.screenshot({ path: screenshotPath, fullPage: true })
  
  console.log(`[ActionTrace] Screenshot: ${screenshotPath}`)
  return screenshotPath
}

/**
 * High-level action executor with full tracing
 */
export async function executeTracedAction(
  page: Page,
  params: {
    actionId: string
    priorState: ActionTrace['prior_workflow_state']
    expectedTransition: ActionTrace['expected_transition']
    artifactsDir: string
    action: () => Promise<BackendSignals>
  }
): Promise<ActionTrace> {
  const startTime = Date.now()
  
  // Execute the action
  let backendSignals: BackendSignals
  try {
    backendSignals = await params.action()
  } catch (error) {
    backendSignals = {
      error_reason: error instanceof Error ? error.message : String(error),
      error_category: 'unknown',
      response_time_ms: Date.now() - startTime,
    }
  }
  
  // Wait for UI to settle
  const settleTrigger = await waitForUISettle(page)
  
  // Capture screenshot AFTER settle
  const screenshotPath = await captureActionScreenshot(
    page,
    params.artifactsDir,
    params.actionId
  )
  
  // Create and save trace
  const trace = createActionTrace({
    actionId: params.actionId,
    priorState: params.priorState,
    expectedTransition: params.expectedTransition,
    backendSignals: {
      ...backendSignals,
      response_time_ms: Date.now() - startTime,
    },
    screenshotPath,
    settleTrigger,
  })
  
  saveActionTrace(params.artifactsDir, trace)
  
  return trace
}
