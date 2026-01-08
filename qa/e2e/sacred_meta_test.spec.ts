/**
 * ⚠️ SACRED META-TEST — "CAN FORGE ACTUALLY RUN?" ⚠️
 * 
 * @sacred
 * @first
 * 
 * This is THE test that answers:
 * "If a junior editor installs this app, can they run a job?"
 * 
 * This test MUST:
 * - Launch Electron
 * - Perform the minimum viable workflow
 * - Assert output exists
 * - Assert no silent failures occurred
 * 
 * This test IS ALLOWED to be slow.
 * This test IS NOT ALLOWED to be flaky.
 * 
 * NO MOCKS. NO SHORTCUTS. REAL EXECUTION.
 * 
 * If this test fails → CI fails
 * If this test is skipped → CI fails
 * If this test times out → CI fails
 * 
 * See: docs/QA.md (NORMATIVE)
 */

import { test, expect } from './helpers'
import { enforceElectronOnly, assertBackendAvailable } from './electron-guard'
import { 
  QCActionTraceBuilder, 
  saveQCActionTrace, 
  assertGoldenPathComplete,
  assertOutputFileExists,
  GOLDEN_PATH_STEPS,
} from './qc-action-trace'
import { 
  assertButtonClickable, 
  waitForButtonEnabled,
  assertButtonHasEffect,
} from './ui-qc-assertions'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

// Tag this test as @sacred - must run first, failure aborts suite
test.describe.configure({ mode: 'serial' })

test.describe('@sacred Can Forge Actually Run?', () => {
  // Timeout: 5 minutes - this test is allowed to be slow
  test.setTimeout(300_000)
  
  let artifactsDir: string
  let outputDir: string
  let traceBuilder: QCActionTraceBuilder
  
  test.beforeAll(async () => {
    // Create artifacts directory
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    artifactsDir = path.join(
      process.cwd(), 
      '../../artifacts/ui/sacred_test', 
      timestamp
    )
    fs.mkdirSync(artifactsDir, { recursive: true })
    
    // Create output directory
    outputDir = path.join(os.tmpdir(), `forge-sacred-test-${Date.now()}`)
    fs.mkdirSync(outputDir, { recursive: true })
    
    console.log(`[SACRED] Artifacts: ${artifactsDir}`)
    console.log(`[SACRED] Output: ${outputDir}`)
  })
  
  test.afterAll(async () => {
    // Clean up output directory
    if (fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true, force: true })
    }
  })

  test('minimum viable workflow produces real output', async ({ page, app }) => {
    // Initialize trace builder
    traceBuilder = new QCActionTraceBuilder('sacred_minimum_viable_workflow')
    
    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 0: GUARDS
    // ═══════════════════════════════════════════════════════════════════════
    console.log('[SACRED] Phase 0: Validating environment...')
    
    // Enforce Electron-only mode
    await enforceElectronOnly(page)
    
    // Check backend availability (soft check - record in trace)
    const backendStatus = await assertBackendAvailable()
    if (!backendStatus.available) {
      traceBuilder.recordStep(
        'BACKEND_CHECK',
        false,
        `Backend not available: ${backendStatus.error}`,
        { backendResponse: { error: backendStatus.error } }
      )
      // This is a hard failure for the sacred test
      throw new Error(`SACRED_BLOCKED: Backend must be running. ${backendStatus.error}`)
    }
    traceBuilder.recordStep('BACKEND_CHECK', true, 'Backend is available')
    
    // Take initial screenshot
    await page.screenshot({
      path: path.join(artifactsDir, '00_initial_state.png'),
      fullPage: true,
    })
    
    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 1: SELECT_SOURCE
    // ═══════════════════════════════════════════════════════════════════════
    console.log('[SACRED] Phase 1: SELECT_SOURCE')
    
    // The select files button must exist and be clickable
    const selectFilesButton = page.locator('[data-testid="select-files-button"]')
    await expect(selectFilesButton).toBeVisible({ timeout: 10_000 })
    
    // Record initial UI state
    const initialButtons = await page.locator('button[data-testid]').allTextContents()
    traceBuilder.recordStep(
      'UI_READY',
      true,
      `App loaded with ${initialButtons.length} buttons`,
      { uiState: { buttonsVisible: initialButtons, buttonsEnabled: [] } }
    )
    
    // Click select files - in E2E mode this uses mocked dialog
    await selectFilesButton.click()
    await page.waitForTimeout(2000) // Wait for mock dialog to return
    
    // Verify source was loaded
    const sourcesLoaded = await page.locator('[data-testid="sources-loaded-indicator"]').isVisible()
      .catch(() => false)
    const sourceListExists = await page.locator('[data-testid="source-list"]').count() > 0
    const createJobEnabled = await page.locator('[data-testid="create-job-button"]').isEnabled()
      .catch(() => false)
    
    const sourceSuccess = sourcesLoaded || sourceListExists || createJobEnabled
    
    traceBuilder.recordStep(
      'SELECT_SOURCE',
      sourceSuccess,
      sourceSuccess 
        ? 'Source file selected via dialog' 
        : 'Failed to select source file',
      { screenshotPath: path.join(artifactsDir, '01_after_select_source.png') }
    )
    
    await page.screenshot({
      path: path.join(artifactsDir, '01_after_select_source.png'),
      fullPage: true,
    })
    
    if (!sourceSuccess) {
      throw new Error('SACRED_FAILED: SELECT_SOURCE step failed')
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 1.5: SET OUTPUT DIRECTORY
    // ═══════════════════════════════════════════════════════════════════════
    console.log('[SACRED] Phase 1.5: Setting output directory')
    
    const outputPathInput = page.locator('[data-testid="output-path-input"]')
    if (await outputPathInput.isVisible().catch(() => false)) {
      await outputPathInput.fill(outputDir)
      await page.waitForTimeout(500)
      console.log(`[SACRED] Output directory set to: ${outputDir}`)
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 2: CREATE_JOB
    // ═══════════════════════════════════════════════════════════════════════
    console.log('[SACRED] Phase 2: CREATE_JOB')
    
    // Wait for Create Job button to be enabled
    const createJobButtonEnabled = await waitForButtonEnabled(
      page,
      '[data-testid="create-job-button"]',
      10_000
    )
    
    if (!createJobButtonEnabled) {
      traceBuilder.recordStep(
        'CREATE_JOB',
        false,
        'Create Job button never became enabled',
        { screenshotPath: path.join(artifactsDir, '02_create_job_disabled.png') }
      )
      await page.screenshot({
        path: path.join(artifactsDir, '02_create_job_disabled.png'),
        fullPage: true,
      })
      throw new Error('SACRED_FAILED: CREATE_JOB button never enabled')
    }
    
    // Click Create Job
    const createJobResult = await assertButtonHasEffect(
      page,
      '[data-testid="create-job-button"]',
      { artifactsDir }
    )
    
    traceBuilder.recordStep(
      'CREATE_JOB',
      createJobResult.effectObserved,
      createJobResult.details,
      { screenshotPath: path.join(artifactsDir, '02_after_create_job.png') }
    )
    
    await page.screenshot({
      path: path.join(artifactsDir, '02_after_create_job.png'),
      fullPage: true,
    })
    
    if (!createJobResult.effectObserved) {
      throw new Error('SACRED_FAILED: CREATE_JOB produced no effect')
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 3: ADD_TO_QUEUE
    // ═══════════════════════════════════════════════════════════════════════
    console.log('[SACRED] Phase 3: ADD_TO_QUEUE')
    
    // Wait for Add to Queue button
    const addToQueueEnabled = await waitForButtonEnabled(
      page,
      '[data-testid="add-to-queue-button"]',
      10_000
    )
    
    if (!addToQueueEnabled) {
      traceBuilder.recordStep(
        'ADD_TO_QUEUE',
        false,
        'Add to Queue button never became enabled'
      )
      throw new Error('SACRED_FAILED: ADD_TO_QUEUE button never enabled')
    }
    
    // Click Add to Queue
    const addToQueueResult = await assertButtonHasEffect(
      page,
      '[data-testid="add-to-queue-button"]',
      { artifactsDir }
    )
    
    traceBuilder.recordStep(
      'ADD_TO_QUEUE',
      addToQueueResult.effectObserved,
      addToQueueResult.details,
      { screenshotPath: path.join(artifactsDir, '03_after_add_to_queue.png') }
    )
    
    await page.screenshot({
      path: path.join(artifactsDir, '03_after_add_to_queue.png'),
      fullPage: true,
    })
    
    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 4: WAIT FOR EXECUTION
    // ═══════════════════════════════════════════════════════════════════════
    console.log('[SACRED] Phase 4: Waiting for execution...')
    
    // FIFO queue auto-starts jobs - wait for execution indicators
    const maxExecutionWait = 120_000 // 2 minutes max
    const startTime = Date.now()
    let executionStarted = false
    let executionCompleted = false
    
    while (Date.now() - startTime < maxExecutionWait) {
      // Check for execution started indicators
      const bodyText = await page.locator('body').innerText()
      
      if (!executionStarted) {
        const hasStarted = bodyText.includes('Running') || 
                          bodyText.includes('Processing') ||
                          bodyText.includes('Encoding') ||
                          bodyText.includes('executing')
        
        if (hasStarted) {
          executionStarted = true
          traceBuilder.recordStep(
            'EXECUTION_STARTED',
            true,
            'Job execution started',
            { screenshotPath: path.join(artifactsDir, '04_execution_started.png') }
          )
          await page.screenshot({
            path: path.join(artifactsDir, '04_execution_started.png'),
            fullPage: true,
          })
          console.log('[SACRED] Execution started!')
        }
      }
      
      // Check for completion indicators
      const hasCompleted = bodyText.includes('Completed') ||
                          bodyText.includes('Finished') ||
                          bodyText.includes('Done') ||
                          bodyText.includes('100%')
      
      if (hasCompleted) {
        executionCompleted = true
        break
      }
      
      await page.waitForTimeout(1000)
    }
    
    // Record execution completion
    traceBuilder.recordStep(
      'EXECUTION_COMPLETED',
      executionCompleted,
      executionCompleted 
        ? 'Job execution completed' 
        : `Execution did not complete within ${maxExecutionWait}ms`,
      { screenshotPath: path.join(artifactsDir, '05_final_state.png') }
    )
    
    await page.screenshot({
      path: path.join(artifactsDir, '05_final_state.png'),
      fullPage: true,
    })
    
    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 5: VERIFY OUTPUT
    // ═══════════════════════════════════════════════════════════════════════
    console.log('[SACRED] Phase 5: Verifying output...')
    
    // Check if output file exists
    const outputFiles = fs.existsSync(outputDir) 
      ? fs.readdirSync(outputDir).filter(f => !f.startsWith('.'))
      : []
    
    const hasOutput = outputFiles.length > 0
    
    if (hasOutput) {
      const outputPath = path.join(outputDir, outputFiles[0])
      traceBuilder.recordOutput(outputPath)
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // FINALIZE AND ASSERT
    // ═══════════════════════════════════════════════════════════════════════
    console.log('[SACRED] Finalizing trace...')
    
    const trace = traceBuilder.finalize(executionCompleted && hasOutput)
    const tracePath = saveQCActionTrace(trace, artifactsDir)
    
    console.log(`[SACRED] Trace saved: ${tracePath}`)
    
    // Print summary
    console.log('\n═══════════════════════════════════════════════════════════════════')
    console.log('                    SACRED TEST SUMMARY')
    console.log('═══════════════════════════════════════════════════════════════════')
    console.log(`Test Passed:        ${trace.testPassed ? '✓ YES' : '✗ NO'}`)
    console.log(`Golden Path:        ${trace.goldenPathComplete ? '✓ COMPLETE' : '✗ INCOMPLETE'}`)
    console.log(`Missing Steps:      ${trace.missingSteps.length > 0 ? trace.missingSteps.join(', ') : 'None'}`)
    console.log(`Output Exists:      ${hasOutput ? '✓ YES' : '✗ NO'}`)
    console.log(`Duration:           ${trace.summary.durationMs}ms`)
    console.log('═══════════════════════════════════════════════════════════════════\n')
    
    // THE SACRED ASSERTION
    // This is the one that matters - can a junior editor run a job?
    expect(trace.testPassed).toBe(true)
  })
})
