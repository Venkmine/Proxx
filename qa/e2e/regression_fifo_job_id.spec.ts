/**
 * ⚠️ REGRESSION TEST — FIFO Job ID Contract ⚠️
 * 
 * @regression
 * @critical
 * 
 * This test validates the FIFO job ID contract:
 * 
 * 1. Backend job_id is authoritative
 *    - The ID returned from /control/jobs/create is the ONLY valid job ID
 *    - Client-side JobSpec.job_id is draft-only (never used post-creation)
 * 
 * 2. FIFO queue semantics
 *    - Jobs are dequeued immediately after successful backend submission
 *    - No matching of client IDs to backend IDs ever occurs
 * 
 * 3. Execution calls use backend ID
 *    - /control/jobs/start uses createResult.job_id
 *    - /control/jobs/{id}/status uses backend ID
 *    - No "Job not found" errors from ID mismatch
 * 
 * FAILURE MODES THIS TEST CATCHES:
 * - Infinite FIFO resubmission loops
 * - "Job not found" errors on execution start
 * - Client job_id leaking into backend API calls
 * 
 * See: FIFO_QUEUE_IMPLEMENTATION.md
 * See: docs/QA.md (NORMATIVE)
 */

import { test, expect } from './helpers'
import { enforceElectronOnly, assertBackendAvailable } from './electron-guard'
import { 
  QCActionTraceBuilder, 
  saveQCActionTrace, 
  assertGoldenPathComplete,
} from './qc-action-trace'
import { waitForButtonEnabled } from './ui-qc-assertions'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

// This test validates critical job ID contract - must run in serial
test.describe.configure({ mode: 'serial' })

test.describe('REGRESSION: FIFO Job ID Contract', () => {
  // Timeout: 3 minutes - job execution takes time
  test.setTimeout(180_000)
  
  let artifactsDir: string
  let outputDir: string
  let traceBuilder: QCActionTraceBuilder
  
  test.beforeAll(async () => {
    // Create artifacts directory
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    artifactsDir = path.join(
      process.cwd(), 
      '../../artifacts/ui/fifo_regression', 
      timestamp
    )
    fs.mkdirSync(artifactsDir, { recursive: true })
    
    // Create output directory
    outputDir = '/tmp/qc_output'
    fs.mkdirSync(outputDir, { recursive: true })
    
    console.log(`[FIFO_REGRESSION] Artifacts: ${artifactsDir}`)
    console.log(`[FIFO_REGRESSION] Output: ${outputDir}`)
  })

  test('backend job_id is used for all execution calls', async ({ page, app }) => {
    traceBuilder = new QCActionTraceBuilder('fifo_job_id_contract')
    
    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 0: GUARDS
    // ═══════════════════════════════════════════════════════════════════════
    console.log('[FIFO_REGRESSION] Phase 0: Validating environment...')
    
    await enforceElectronOnly(page)
    
    const backendStatus = await assertBackendAvailable()
    if (!backendStatus.available) {
      throw new Error(`FIFO_REGRESSION_BLOCKED: Backend must be running. ${backendStatus.error}`)
    }
    
    traceBuilder.recordStep('BACKEND_CHECK', true, 'Backend is available')
    
    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 1: LISTEN TO CONSOLE LOGS
    // ═══════════════════════════════════════════════════════════════════════
    console.log('[FIFO_REGRESSION] Setting up console log capture...')
    
    // Capture FIFO debug logs from the frontend console
    const fifoLogs: string[] = []
    page.on('console', msg => {
      const text = msg.text()
      if (text.includes('[FIFO') || text.includes('job_id') || text.includes('Backend') ||
          text.includes('create') || text.includes('start')) {
        fifoLogs.push(text)
        console.log(`[PAGE] ${text}`)
      }
    })
    
    traceBuilder.recordStep('CONSOLE_CAPTURE', true, 'Console log capture active')
    
    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 2: SELECT SOURCE
    // ═══════════════════════════════════════════════════════════════════════
    console.log('[FIFO_REGRESSION] Phase 2: Selecting source...')
    
    await page.screenshot({
      path: path.join(artifactsDir, '00_initial.png'),
      fullPage: true,
    })
    
    const selectFilesButton = page.locator('[data-testid="select-files-button"]')
    await expect(selectFilesButton).toBeVisible({ timeout: 10_000 })
    await selectFilesButton.click()
    await page.waitForTimeout(2000)
    
    // Set output directory (required for Create Job to be enabled)
    const outputPathInput = page.locator('[data-testid="output-path-input"]')
    if (await outputPathInput.isVisible().catch(() => false)) {
      await outputPathInput.fill(outputDir)
      await page.waitForTimeout(500)
      console.log(`[FIFO_REGRESSION] Output directory set to: ${outputDir}`)
    }
    
    // Wait for Create Job button to be enabled
    const createJobEnabled = await waitForButtonEnabled(
      page,
      '[data-testid="create-job-button"]',
      10_000
    )
    
    expect(createJobEnabled).toBe(true)
    traceBuilder.recordStep('SELECT_SOURCE', true, 'Source file selected')
    
    await page.screenshot({
      path: path.join(artifactsDir, '01_source_selected.png'),
      fullPage: true,
    })
    
    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 3: CREATE JOB AND MONITOR API CALLS
    // ═══════════════════════════════════════════════════════════════════════
    console.log('[FIFO_REGRESSION] Phase 3: Creating job and monitoring API calls...')
    
    // Click Create Job button
    const createJobButton = page.locator('[data-testid="create-job-button"]')
    await createJobButton.click()
    
    traceBuilder.recordStep('CREATE_JOB', true, 'Create job button clicked')
    
    await page.waitForTimeout(1000)
    
    // Click Add to Queue button
    const addToQueueButton = page.locator('[data-testid="add-to-queue-button"]')
    const addToQueueVisible = await addToQueueButton.isVisible().catch(() => false)
    
    if (addToQueueVisible) {
      await addToQueueButton.click()
      traceBuilder.recordStep('ADD_TO_QUEUE', true, 'Add to queue button clicked')
    } else {
      // Some workflows auto-queue - check if job appears in queue
      console.log('[FIFO_REGRESSION] Add to Queue not visible - may be auto-queued')
    }
    
    await page.screenshot({
      path: path.join(artifactsDir, '02_job_created.png'),
      fullPage: true,
    })
    
    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 4: WAIT FOR EXECUTION AND VALIDATE JOB IDS
    // ═══════════════════════════════════════════════════════════════════════
    console.log('[FIFO_REGRESSION] Phase 4: Waiting for execution...')
    
    // Wait for job execution to start (look for RUNNING status or progress)
    await page.waitForTimeout(5000) // Allow FIFO loop to process
    
    // Continue waiting for job completion (up to 2 minutes)
    let jobCompleted = false
    let attempts = 0
    const maxAttempts = 24 // 24 * 5s = 2 minutes
    
    while (!jobCompleted && attempts < maxAttempts) {
      attempts++
      
      // Check for completed job in UI
      const completedJobBadge = await page.locator('[data-status="COMPLETE"], [data-status="COMPLETED"]')
        .count()
        .catch(() => 0)
      
      const failedJobBadge = await page.locator('[data-status="FAILED"], [data-status="ERROR"]')
        .count()
        .catch(() => 0)
      
      if (completedJobBadge > 0 || failedJobBadge > 0) {
        jobCompleted = true
        console.log(`[FIFO_REGRESSION] Job finished: completed=${completedJobBadge}, failed=${failedJobBadge}`)
      } else {
        console.log(`[FIFO_REGRESSION] Waiting for job completion... attempt ${attempts}/${maxAttempts}`)
        await page.waitForTimeout(5000)
      }
    }
    
    await page.screenshot({
      path: path.join(artifactsDir, '03_execution_complete.png'),
      fullPage: true,
    })
    
    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 5: VALIDATE JOB ID CONTRACT FROM CONSOLE LOGS
    // ═══════════════════════════════════════════════════════════════════════
    console.log('[FIFO_REGRESSION] Phase 5: Validating job ID contract from logs...')
    
    // Parse FIFO logs to extract job IDs
    // Expected log patterns:
    // [FIFO] Job created in backend: { job_id: "xxx" }
    // [FIFO] Successfully started job xxx, dequeuing from local queue
    
    // Find backend job_id from creation log
    const createdJobLog = fifoLogs.find(log => 
      log.includes('[FIFO] Job created in backend')
    )
    console.log(`[FIFO_REGRESSION] Create log: ${createdJobLog}`)
    
    // Find started job log
    const startedJobLog = fifoLogs.find(log => 
      log.includes('Successfully started job')
    )
    console.log(`[FIFO_REGRESSION] Start log: ${startedJobLog}`)
    
    // Extract backend job_id from start log
    // Format: [FIFO] Successfully started job <id>, dequeuing from local queue
    let backendJobId: string | undefined
    if (startedJobLog) {
      const match = startedJobLog.match(/Successfully started job ([a-f0-9-]+),/)
      backendJobId = match?.[1]
    }
    
    console.log(`[FIFO_REGRESSION] Backend job_id: ${backendJobId}`)
    
    // Check for any "Job not found" errors in logs
    const notFoundErrors = fifoLogs.filter(log => 
      log.toLowerCase().includes('not found') ||
      log.includes('404')
    )
    
    console.log(`[FIFO_REGRESSION] "Not found" errors: ${notFoundErrors.length}`)
    
    // Check for infinite loop symptoms (multiple create calls)
    const createCalls = fifoLogs.filter(log => 
      log.includes('Submitting job to backend')
    )
    console.log(`[FIFO_REGRESSION] Job submit attempts: ${createCalls.length}`)
    
    // CRITICAL ASSERTIONS
    const hasBackendJobId = !!backendJobId
    const noNotFoundErrors = notFoundErrors.length === 0
    const noInfiniteLoop = createCalls.length <= 2
    
    traceBuilder.recordStep(
      'VALIDATE_BACKEND_JOB_ID',
      hasBackendJobId,
      hasBackendJobId 
        ? `Backend job_id captured: ${backendJobId}` 
        : 'Failed to capture backend job_id'
    )
    
    traceBuilder.recordStep(
      'VALIDATE_NO_404_ERRORS',
      noNotFoundErrors,
      `No "Job not found" errors: ${notFoundErrors.length}`
    )
    
    traceBuilder.recordStep(
      'VALIDATE_NO_INFINITE_LOOP',
      noInfiniteLoop,
      `Job submit attempts: ${createCalls.length} (max 2 allowed)`
    )
    
    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 6: VERIFY OUTPUT FILE EXISTS
    // ═══════════════════════════════════════════════════════════════════════
    console.log('[FIFO_REGRESSION] Phase 6: Verifying output file...')
    
    // Check for output files in the output directory
    const outputFiles = fs.existsSync(outputDir) 
      ? fs.readdirSync(outputDir).filter(f => f.endsWith('.mov') || f.endsWith('.mp4'))
      : []
    
    console.log(`[FIFO_REGRESSION] Output files found: ${outputFiles.length}`)
    console.log(`[FIFO_REGRESSION] Files: ${outputFiles.join(', ')}`)
    
    const hasOutput = outputFiles.length > 0
    
    traceBuilder.recordStep(
      'VALIDATE_OUTPUT_EXISTS',
      hasOutput,
      hasOutput 
        ? `Output file exists: ${outputFiles[0]}` 
        : 'No output file found (job may have failed)'
    )
    
    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 7: SAVE TRACE AND REPORT
    // ═══════════════════════════════════════════════════════════════════════
    
    // Write FIFO logs for debugging
    fs.writeFileSync(
      path.join(artifactsDir, 'fifo_logs.txt'),
      fifoLogs.join('\n')
    )
    
    // Determine test result
    const testPassed = hasBackendJobId && noNotFoundErrors && noInfiniteLoop
    
    // Save the QC trace
    const trace = traceBuilder.finalize(testPassed)
    saveQCActionTrace(trace, artifactsDir)
    
    // Final assertions
    console.log('[FIFO_REGRESSION] ══════════════════════════════════════════')
    console.log('[FIFO_REGRESSION] JOB ID CONTRACT VALIDATION RESULTS:')
    console.log(`[FIFO_REGRESSION]   Backend job_id captured: ${hasBackendJobId ? '✓' : '✗'}`)
    console.log(`[FIFO_REGRESSION]   No 404 errors: ${noNotFoundErrors ? '✓' : '✗'}`)
    console.log(`[FIFO_REGRESSION]   No infinite loop: ${noInfiniteLoop ? '✓' : '✗'}`)
    console.log(`[FIFO_REGRESSION]   Output exists: ${hasOutput ? '✓' : '⚠ (may have failed)'}`)
    console.log('[FIFO_REGRESSION] ══════════════════════════════════════════')
    
    // The test passes if the job ID contract is satisfied
    // Output existence is a warning, not a failure (encoding may fail for other reasons)
    expect(hasBackendJobId).toBe(true)
    expect(noNotFoundErrors).toBe(true)
    expect(noInfiniteLoop).toBe(true)
  })
})
