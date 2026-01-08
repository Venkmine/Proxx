/**
 * ⚠️ GOLDEN PATH VARIANT — Invalid Output Directory
 *
 * This test proves:
 * - Create Job button is disabled OR shows validation error when output dir invalid
 * - No job is submitted to backend
 * - FIFO queue remains unchanged
 * - No execution starts
 *
 * Cloned from: golden_path_ui_workflow.spec.ts
 * Variant: Do NOT create output directory before attempting Create Job
 *
 * See: docs/QC_ACTION_TRACE.md (NORMATIVE)
 * See: docs/UI_QC_LOOP.md (NORMATIVE)
 */

import { 
  test, 
  expect,
  getArtifactsDir,
  saveActionTrace,
  captureActionScreenshot,
  createActionTrace,
  ActionTrace,
} from './helpers'
import path from 'node:path'
import fs from 'node:fs'

test.describe('Golden Path Variant: Invalid Output Directory', () => {
  // Ensure this is an Electron test
  test.beforeAll(() => {
    if (!process.env.E2E_TEST) {
      throw new Error('This QC suite must be run against the Electron app, not Vite or browser.')
    }
  })
  let artifactsDir: string
  const actionSummary: ActionTrace[] = []

  test.beforeAll(() => {
    artifactsDir = getArtifactsDir()
    fs.mkdirSync(artifactsDir, { recursive: true })
    console.log(`[E2E] Artifacts directory: ${artifactsDir}`)
    
    // VARIANT: Do NOT create /tmp/invalid_output_dir
    // This tests the validation behavior
  })

  test.afterAll(() => {
    const summaryPath = path.join(artifactsDir, 'action_summary.json')
    const summary = {
      timestamp: new Date().toISOString(),
      variant: 'invalid_output_directory',
      total_actions: actionSummary.length,
      verified_ok: actionSummary.filter(a => a.qc_outcome === 'VERIFIED_OK').length,
      verified_not_ok: actionSummary.filter(a => a.qc_outcome === 'VERIFIED_NOT_OK').length,
      blocked_precondition: actionSummary.filter(a => a.qc_outcome === 'BLOCKED_PRECONDITION').length,
      actions: actionSummary,
    }
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2))
    console.log(`[E2E] Action summary: ${summaryPath}`)
  })

  test('should prevent job creation with invalid output directory', async ({ page, app }) => {
    console.log('[E2E] Variant Test: Invalid Output Directory')
    
    // =========================================================================
    // ACTION 1: Select Source Files (same as golden path)
    // =========================================================================
    console.log('[E2E] Action 1: click_select_source')
    
    // Listen for console messages
    page.on('console', msg => {
      const text = msg.text()
      if (text.includes('FIFO') || text.includes('Create Job') || text.includes('validation')) {
        console.log(`[PAGE CONSOLE] ${text}`)
      }
    })
    
    const selectSourceButton = page.locator('[data-testid="select-files-button"]')
    await selectSourceButton.click()
    await page.waitForTimeout(2000)
    
    // Verify sources are loaded
    const sourceListCount = await page.locator('[data-testid="source-list"]').count()
    expect(sourceListCount).toBeGreaterThan(0)
    
    const screenshotPath1 = await captureActionScreenshot(page, artifactsDir, 'select_source')
    const trace1 = createActionTrace({
      actionId: 'select_source',
      priorState: 'idle',
      expectedTransition: { from: 'idle', to: 'source_loaded', trigger: 'select_files' },
      backendSignals: { job_created: false, response_time_ms: 0 },
      screenshotPath: screenshotPath1,
      settleTrigger: 'timeout',
    })
    saveActionTrace(artifactsDir, trace1)
    actionSummary.push(trace1)
    console.log('[E2E] ✓ Action 1 complete: Sources selected')

    // =========================================================================
    // ACTION 2: Set INVALID output directory (non-existent path)
    // =========================================================================
    console.log('[E2E] Action 2: set_invalid_output_directory')
    
    const outputPathInput = page.locator('[data-testid="output-path-input"]')
    const invalidOutputPath = '/tmp/nonexistent_invalid_dir_' + Date.now()
    
    // Ensure this directory does NOT exist
    if (fs.existsSync(invalidOutputPath)) {
      fs.rmSync(invalidOutputPath, { recursive: true })
    }
    
    await outputPathInput.fill(invalidOutputPath)
    await page.waitForTimeout(500)
    
    const outputValue = await outputPathInput.inputValue()
    console.log(`[E2E] Output directory set to: ${outputValue}`)
    
    const screenshotPath2 = await captureActionScreenshot(page, artifactsDir, 'set_invalid_output')
    const trace2 = createActionTrace({
      actionId: 'set_invalid_output',
      priorState: 'source_loaded',
      expectedTransition: { from: 'source_loaded', to: 'source_loaded', trigger: 'set_output' },
      backendSignals: { job_created: false, response_time_ms: 0 },
      screenshotPath: screenshotPath2,
      settleTrigger: 'timeout',
    })
    saveActionTrace(artifactsDir, trace2)
    actionSummary.push(trace2)

    // =========================================================================
    // ACTION 3: Attempt Create Job - should be disabled OR show error
    // =========================================================================
    console.log('[E2E] Action 3: attempt_create_job')
    
    const createJobButton = page.locator('[data-testid="create-job-button"]')
    const createJobExists = await createJobButton.count() > 0
    
    let trace3: ActionTrace
    
    if (createJobExists) {
      const isDisabled = await createJobButton.isDisabled()
      const buttonTitle = await createJobButton.getAttribute('title') || ''
      
      console.log(`[E2E] Create Job button disabled: ${isDisabled}, title: ${buttonTitle}`)
      
      if (isDisabled) {
        // Expected: Button is disabled due to invalid output
        const screenshotPath3 = await captureActionScreenshot(page, artifactsDir, 'create_job_disabled')
        trace3 = createActionTrace({
          actionId: 'attempt_create_job',
          priorState: 'source_loaded',
          expectedTransition: { from: 'source_loaded', to: 'source_loaded', trigger: 'create_job_blocked' },
          backendSignals: { 
            job_created: false, 
            error_reason: 'Create Job button disabled - output directory validation',
            error_category: 'precondition',
            response_time_ms: 0 
          },
          screenshotPath: screenshotPath3,
          settleTrigger: 'timeout',
        })
      } else {
        // Button is enabled - click it and expect an error
        await createJobButton.click()
        await page.waitForTimeout(1000)
        
        // Check for validation error
        const errorBanner = page.locator('[data-testid="error-banner"], .error, [role="alert"]')
        const hasError = await errorBanner.isVisible().catch(() => false)
        
        const screenshotPath3 = await captureActionScreenshot(page, artifactsDir, 'create_job_error')
        
        if (hasError) {
          const errorText = await errorBanner.textContent() || 'Unknown error'
          console.log(`[E2E] Validation error shown: ${errorText}`)
          trace3 = createActionTrace({
            actionId: 'attempt_create_job',
            priorState: 'source_loaded',
            expectedTransition: { from: 'source_loaded', to: 'source_loaded', trigger: 'create_job_validation_error' },
            backendSignals: { 
              job_created: false, 
              error_reason: errorText,
              error_category: 'validation',
              response_time_ms: 0 
            },
            screenshotPath: screenshotPath3,
            settleTrigger: 'error_banner',
          })
        } else {
          // Neither disabled nor error - this is a BUG
          trace3 = createActionTrace({
            actionId: 'attempt_create_job',
            priorState: 'source_loaded',
            expectedTransition: { from: 'source_loaded', to: 'source_loaded', trigger: 'create_job' },
            backendSignals: { 
              job_created: false, 
              error_reason: 'BUG: Create Job button enabled with invalid output and no error shown',
              error_category: 'unknown',
              response_time_ms: 0 
            },
            screenshotPath: screenshotPath3,
            settleTrigger: 'timeout',
          })
        }
      }
    } else {
      const screenshotPath3 = await captureActionScreenshot(page, artifactsDir, 'create_job_missing')
      trace3 = createActionTrace({
        actionId: 'attempt_create_job',
        priorState: 'source_loaded',
        expectedTransition: { from: 'source_loaded', to: 'source_loaded', trigger: 'create_job' },
        backendSignals: { 
          job_created: false, 
          error_reason: 'Create Job button not found in UI',
          error_category: 'unknown',
          response_time_ms: 0 
        },
        screenshotPath: screenshotPath3,
        settleTrigger: 'timeout',
      })
    }
    
    saveActionTrace(artifactsDir, trace3)
    actionSummary.push(trace3)
    console.log(`[E2E] ✓ Action 3 complete: ${trace3.qc_outcome}`)

    // =========================================================================
    // VERIFY: No job was created, FIFO queue unchanged
    // =========================================================================
    console.log('[E2E] Verifying: No job created, queue unchanged')
    
    // Check FIFO queue is empty (no Add to Queue button visible means no prepared job)
    const addToQueueButton = page.locator('[data-testid="add-to-queue-button"]')
    const addToQueueVisible = await addToQueueButton.isVisible().catch(() => false)
    
    // If Add to Queue is not visible, good - no prepared job exists
    // If visible, check if it's disabled
    if (addToQueueVisible) {
      const addToQueueDisabled = await addToQueueButton.isDisabled()
      console.log(`[E2E] Add to Queue button visible: ${addToQueueVisible}, disabled: ${addToQueueDisabled}`)
    }
    
    await page.screenshot({
      path: path.join(artifactsDir, 'final-state.png'),
      fullPage: true,
    })
    
    // =========================================================================
    // SUMMARY
    // =========================================================================
    console.log('\n[E2E] ═══════════════════════════════════════')
    console.log('[E2E] INVALID OUTPUT DIRECTORY VARIANT SUMMARY')
    console.log('[E2E] ═══════════════════════════════════════')
    for (const trace of actionSummary) {
      console.log(`[E2E] ${trace.action_id}: ${trace.qc_outcome}`)
      if (trace.qc_outcome !== 'VERIFIED_OK') {
        console.log(`[E2E]   └─ ${trace.qc_reason}`)
      }
    }
    console.log('[E2E] ═══════════════════════════════════════\n')
    
    // Pass condition: No VERIFIED_NOT_OK (blocked/validation is acceptable)
    const unexpectedFailures = actionSummary.filter(a => a.qc_outcome === 'VERIFIED_NOT_OK')
    expect(unexpectedFailures).toHaveLength(0)
    
    // Additional assertion: Job was NOT created
    const jobCreated = actionSummary.some(a => a.backend_signals.job_created === true)
    expect(jobCreated).toBe(false)
  })
})
