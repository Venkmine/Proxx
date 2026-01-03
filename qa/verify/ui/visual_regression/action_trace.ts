/**
 * Action-Scoped QC Instrumentation
 * 
 * Provides utilities for tracing individual user actions through:
 * - Intent recording
 * - Backend signal capture
 * - UI settle detection
 * - Correlated screenshot capture
 * 
 * See: docs/QC_ACTION_TRACE.md for schema definition
 */

import { Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

// ============================================================================
// TYPES
// ============================================================================

export type WorkflowState = 'idle' | 'source_loaded' | 'job_running' | 'job_complete'
export type QCOutcome = 'VERIFIED_OK' | 'VERIFIED_NOT_OK' | 'BLOCKED_PRECONDITION'
export type SettleTrigger = 'spinner_appeared' | 'error_banner' | 'state_change' | 'timeout'
export type ErrorCategory = 'precondition' | 'backend' | 'validation' | 'unknown'

export interface BackendSignals {
  job_created?: boolean
  job_id?: string
  error_reason?: string
  error_category?: ErrorCategory
  execution_engine?: {
    ffmpeg_available: boolean
    resolve_available: boolean
  }
  response_time_ms: number
}

export interface VisualSnapshot {
  screenshot_path: string
  dom_snapshot_path?: string
  captured_at: string
  settle_trigger: SettleTrigger
}

export interface GLMObservationRef {
  report_path: string
  screenshot_id: string
  answers: Record<string, string>
}

export interface ActionTrace {
  action_id: string
  trace_id: string
  timestamp: string
  prior_workflow_state: WorkflowState
  expected_transition: {
    from: string
    to: string
    trigger: string
  }
  backend_signals: BackendSignals
  visual_snapshot: VisualSnapshot
  glm_observation_ref?: GLMObservationRef
  qc_outcome: QCOutcome
  qc_reason: string
  evaluation_details: {
    backend_ok: boolean
    ui_matches_spec: boolean
    spec_violations?: string[]
  }
}

// ============================================================================
// WORKFLOW STATE INFERENCE
// ============================================================================

/**
 * Infer current workflow state from page DOM.
 * Uses observable signals per UI_QC_WORKFLOW.md.
 */
export async function inferWorkflowState(page: Page): Promise<WorkflowState> {
  // Check for progress bar → job_running
  const progressVisible = await page.locator('[data-testid*="progress"], [class*="progress"][role="progressbar"]').isVisible().catch(() => false)
  if (progressVisible) {
    return 'job_running'
  }
  
  // Check for job completion indicators
  const completedVisible = await page.locator('[data-job-status="COMPLETED"], [data-job-status="FAILED"]').isVisible().catch(() => false)
  if (completedVisible) {
    return 'job_complete'
  }
  
  // Check for loaded source (player area with content)
  const sourceLoaded = await page.locator('[data-testid="monitor-surface"][data-state="source-loaded"], [data-testid="source-metadata"]').isVisible().catch(() => false)
  if (sourceLoaded) {
    return 'source_loaded'
  }
  
  // Check for Create Job button enabled (implies source loaded)
  const createJobEnabled = await page.locator('button:has-text("Create Job"):not([disabled])').isVisible().catch(() => false)
  if (createJobEnabled) {
    return 'source_loaded'
  }
  
  // Default to idle
  return 'idle'
}

// ============================================================================
// UI SETTLE DETECTION
// ============================================================================

export interface SettleResult {
  trigger: SettleTrigger
  elapsed_ms: number
}

/**
 * Wait for UI to settle after an action.
 * Returns the trigger that caused settlement.
 */
export async function waitForUISettle(
  page: Page,
  timeout: number = 10000
): Promise<SettleResult> {
  const start = Date.now()
  
  // Race conditions to determine what settles first
  const conditions = [
    {
      trigger: 'spinner_appeared' as SettleTrigger,
      promise: page.waitForSelector('[data-testid*="spinner"], [class*="spinner"], [class*="loading"]', { timeout, state: 'visible' }).then(() => 'spinner_appeared')
    },
    {
      trigger: 'error_banner' as SettleTrigger,
      promise: page.waitForSelector('[data-testid*="error"], [class*="error-banner"], [role="alert"]', { timeout, state: 'visible' }).then(() => 'error_banner')
    },
    {
      trigger: 'state_change' as SettleTrigger,
      promise: page.waitForSelector('[data-job-status="RUNNING"], [data-job-status="PENDING"]', { timeout, state: 'visible' }).then(() => 'state_change')
    },
  ]
  
  try {
    const result = await Promise.race([
      ...conditions.map(c => c.promise),
      new Promise<SettleTrigger>((resolve) => setTimeout(() => resolve('timeout'), timeout))
    ]) as SettleTrigger
    
    return {
      trigger: result,
      elapsed_ms: Date.now() - start
    }
  } catch {
    return {
      trigger: 'timeout',
      elapsed_ms: Date.now() - start
    }
  }
}

// ============================================================================
// BACKEND SIGNAL CAPTURE
// ============================================================================

/**
 * Capture backend signals after a job creation attempt.
 * Inspects page for evidence of backend response.
 */
export async function captureBackendSignals(
  page: Page,
  startTime: number
): Promise<BackendSignals> {
  const signals: BackendSignals = {
    response_time_ms: Date.now() - startTime
  }
  
  // Check for job creation success
  const jobCard = await page.locator('[data-job-id]').first()
  const jobExists = await jobCard.count() > 0
  
  if (jobExists) {
    signals.job_created = true
    signals.job_id = await jobCard.getAttribute('data-job-id') || undefined
  } else {
    signals.job_created = false
  }
  
  // Check for error indicators
  const errorBanner = await page.locator('[data-testid*="error"], [class*="error"], [role="alert"]').first()
  const errorExists = await errorBanner.count() > 0
  
  if (errorExists && await errorBanner.isVisible()) {
    const errorText = await errorBanner.textContent() || ''
    signals.error_reason = errorText.trim()
    
    // Categorize error
    if (errorText.toLowerCase().includes('backend') || 
        errorText.toLowerCase().includes('connection') ||
        errorText.toLowerCase().includes('unavailable')) {
      signals.error_category = 'backend'
    } else if (errorText.toLowerCase().includes('precondition') ||
               errorText.toLowerCase().includes('ffmpeg') ||
               errorText.toLowerCase().includes('resolve')) {
      signals.error_category = 'precondition'
    } else if (errorText.toLowerCase().includes('validation') ||
               errorText.toLowerCase().includes('invalid')) {
      signals.error_category = 'validation'
    } else {
      signals.error_category = 'unknown'
    }
  }
  
  // Check execution engine availability (if displayed)
  const ffmpegIndicator = await page.locator('[data-testid*="ffmpeg"], text=/ffmpeg/i').first()
  const resolveIndicator = await page.locator('[data-testid*="resolve"], text=/resolve/i').first()
  
  signals.execution_engine = {
    ffmpeg_available: (await ffmpegIndicator.count()) > 0,
    resolve_available: (await resolveIndicator.count()) > 0
  }
  
  return signals
}

// ============================================================================
// DOM SNAPSHOT CAPTURE
// ============================================================================

/**
 * Capture a structured DOM snapshot for QC analysis.
 */
export async function captureDOMSnapshot(page: Page): Promise<Record<string, unknown>> {
  return await page.evaluate(() => {
    const snapshot: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      url: window.location.href,
      title: document.title,
    }
    
    // Capture key element states
    const elements: Record<string, unknown> = {}
    
    // Queue panel
    const queuePanel = document.querySelector('[data-testid*="queue"], [class*="queue"]')
    if (queuePanel) {
      elements.queue_panel = {
        visible: window.getComputedStyle(queuePanel).display !== 'none',
        job_count: queuePanel.querySelectorAll('[data-job-id]').length
      }
    }
    
    // Create Job button
    const createJobBtn = document.querySelector('button[class*="create"], button:has-text("Create Job")')
    if (createJobBtn) {
      elements.create_job_button = {
        visible: window.getComputedStyle(createJobBtn).display !== 'none',
        disabled: (createJobBtn as HTMLButtonElement).disabled
      }
    }
    
    // Progress bar
    const progressBar = document.querySelector('[data-testid*="progress"], [role="progressbar"]')
    if (progressBar) {
      elements.progress_bar = {
        visible: window.getComputedStyle(progressBar).display !== 'none'
      }
    }
    
    // Monitor surface
    const monitor = document.querySelector('[data-testid="monitor-surface"]')
    if (monitor) {
      elements.player_area = {
        visible: window.getComputedStyle(monitor).display !== 'none',
        state: monitor.getAttribute('data-state')
      }
    }
    
    snapshot.elements = elements
    return snapshot
  })
}

// ============================================================================
// ACTION TRACE BUILDER
// ============================================================================

export class ActionTraceBuilder {
  private trace: Partial<ActionTrace> = {}
  private artifactDir: string
  
  constructor(
    public readonly actionId: string,
    baseArtifactDir: string
  ) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    this.trace.action_id = actionId
    this.trace.trace_id = `${actionId}_${timestamp}`
    this.trace.timestamp = new Date().toISOString()
    
    this.artifactDir = path.join(baseArtifactDir, timestamp, actionId)
    fs.mkdirSync(this.artifactDir, { recursive: true })
  }
  
  setPriorState(state: WorkflowState): this {
    this.trace.prior_workflow_state = state
    return this
  }
  
  setExpectedTransition(from: string, to: string, trigger: string): this {
    this.trace.expected_transition = { from, to, trigger }
    return this
  }
  
  setBackendSignals(signals: BackendSignals): this {
    this.trace.backend_signals = signals
    return this
  }
  
  setVisualSnapshot(snapshot: VisualSnapshot): this {
    this.trace.visual_snapshot = snapshot
    return this
  }
  
  setGLMObservation(ref: GLMObservationRef): this {
    this.trace.glm_observation_ref = ref
    return this
  }
  
  /**
   * Evaluate QC outcome based on backend signals and UI state.
   * Implements rules from QC_ACTION_TRACE.md.
   */
  evaluateOutcome(uiMatchesSpec: boolean, specViolations?: string[]): this {
    const backend = this.trace.backend_signals!
    
    this.trace.evaluation_details = {
      backend_ok: backend.job_created === true,
      ui_matches_spec: uiMatchesSpec,
      spec_violations: specViolations
    }
    
    // Rule 1: Backend failure with precondition/backend category
    if (!backend.job_created && 
        (backend.error_category === 'precondition' || backend.error_category === 'backend')) {
      this.trace.qc_outcome = 'BLOCKED_PRECONDITION'
      this.trace.qc_reason = `Backend unavailable or precondition not met: ${backend.error_reason || 'unknown'}`
      return this
    }
    
    // Rule 2: Backend failure with other category
    if (!backend.job_created) {
      this.trace.qc_outcome = 'VERIFIED_NOT_OK'
      this.trace.qc_reason = `Job creation failed unexpectedly: ${backend.error_reason || 'unknown'}`
      return this
    }
    
    // Rule 3: Backend success but UI violation
    if (backend.job_created && !uiMatchesSpec) {
      this.trace.qc_outcome = 'VERIFIED_NOT_OK'
      this.trace.qc_reason = `UI does not match expected state: ${specViolations?.join(', ') || 'unknown violations'}`
      return this
    }
    
    // Rule 4: Backend success and UI matches
    this.trace.qc_outcome = 'VERIFIED_OK'
    this.trace.qc_reason = 'Action completed successfully, UI reflects expected state'
    return this
  }
  
  getArtifactDir(): string {
    return this.artifactDir
  }
  
  build(): ActionTrace {
    return this.trace as ActionTrace
  }
  
  /**
   * Save trace to artifact directory.
   */
  save(): string {
    const tracePath = path.join(this.artifactDir, 'action_trace.json')
    fs.writeFileSync(tracePath, JSON.stringify(this.build(), null, 2))
    return tracePath
  }
}

// ============================================================================
// CREATE JOB ACTION INSTRUMENTATION
// ============================================================================

/**
 * Instrument the "Create Job" action with full QC trace.
 * 
 * This is the canonical implementation of action-scoped QC.
 */
export async function instrumentCreateJobAction(
  page: Page,
  baseArtifactDir: string
): Promise<ActionTrace> {
  const builder = new ActionTraceBuilder('click_create_job', baseArtifactDir)
  
  // 1. Record prior workflow state
  const priorState = await inferWorkflowState(page)
  builder.setPriorState(priorState)
  builder.setExpectedTransition('source_loaded', 'job_running', 'User clicks Create Job button')
  
  console.log(`🎯 [ACTION TRACE] click_create_job`)
  console.log(`   Prior state: ${priorState}`)
  
  // 2. Record timestamp and trigger backend action
  const actionStart = Date.now()
  
  // Find and click Create Job button
  const createJobButton = page.locator('button:has-text("Create Job"), button:has-text("Create"), button[data-testid*="create-job"]').first()
  
  if (await createJobButton.count() === 0) {
    // No button found - this is a precondition failure
    builder.setBackendSignals({
      job_created: false,
      error_reason: 'Create Job button not found in DOM',
      error_category: 'precondition',
      response_time_ms: Date.now() - actionStart
    })
    builder.setVisualSnapshot({
      screenshot_path: '',
      captured_at: new Date().toISOString(),
      settle_trigger: 'timeout'
    })
    builder.evaluateOutcome(false, ['Create Job button not found'])
    return builder.build()
  }
  
  // Click the button
  await createJobButton.click()
  console.log(`   Button clicked at: ${new Date().toISOString()}`)
  
  // 3. Wait for UI to settle
  const settleResult = await waitForUISettle(page, 10000)
  console.log(`   UI settled via: ${settleResult.trigger} (${settleResult.elapsed_ms}ms)`)
  
  // 4. Capture backend signals
  const backendSignals = await captureBackendSignals(page, actionStart)
  builder.setBackendSignals(backendSignals)
  console.log(`   Job created: ${backendSignals.job_created}`)
  
  // 5. Capture screenshot
  const screenshotPath = path.join(builder.getArtifactDir(), 'screenshot.png')
  await page.screenshot({ path: screenshotPath, fullPage: true })
  
  // 6. Capture DOM snapshot
  const domSnapshotPath = path.join(builder.getArtifactDir(), 'dom_snapshot.json')
  const domSnapshot = await captureDOMSnapshot(page)
  fs.writeFileSync(domSnapshotPath, JSON.stringify(domSnapshot, null, 2))
  
  builder.setVisualSnapshot({
    screenshot_path: screenshotPath,
    dom_snapshot_path: domSnapshotPath,
    captured_at: new Date().toISOString(),
    settle_trigger: settleResult.trigger
  })
  
  // 7. Evaluate outcome (GLM analysis would be added here in full implementation)
  // For now, use DOM-based spec checking
  const currentState = await inferWorkflowState(page)
  const expectedState = backendSignals.job_created ? 'job_running' : priorState
  const uiMatchesSpec = currentState === expectedState || 
                        (backendSignals.job_created && currentState === 'source_loaded') // PENDING is source_loaded
  
  const violations: string[] = []
  if (backendSignals.job_created && currentState === 'idle') {
    violations.push('Job created but UI shows idle state')
  }
  
  builder.evaluateOutcome(uiMatchesSpec, violations.length > 0 ? violations : undefined)
  
  // 8. Save trace
  const tracePath = builder.save()
  console.log(`   Trace saved: ${tracePath}`)
  console.log(`   QC Outcome: ${builder.build().qc_outcome}`)
  
  return builder.build()
}
