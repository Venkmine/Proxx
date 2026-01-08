/**
 * ⚠️ QC_ACTION_TRACE — SEMANTIC CORRECTNESS ARTIFACT ⚠️
 * 
 * This module defines the QC_ACTION_TRACE format for capturing and validating
 * the golden path workflow. The trace must contain, IN ORDER:
 * 
 *   SELECT_SOURCE
 *   CREATE_JOB
 *   ADD_TO_QUEUE
 *   EXECUTION_STARTED
 *   EXECUTION_COMPLETED
 * 
 * If any step is missing → test fails.
 * This guarantees semantic correctness, not just visuals.
 */

import path from 'node:path'
import fs from 'node:fs'

/**
 * The sacred golden path steps that MUST occur in order.
 */
export const GOLDEN_PATH_STEPS = [
  'SELECT_SOURCE',
  'CREATE_JOB', 
  'ADD_TO_QUEUE',
  'EXECUTION_STARTED',
  'EXECUTION_COMPLETED',
] as const

export type GoldenPathStep = typeof GOLDEN_PATH_STEPS[number]

/**
 * A single action trace entry in the QC trace log.
 */
export interface QCActionEntry {
  step: GoldenPathStep | string
  timestamp: string
  success: boolean
  details: string
  screenshotPath?: string
  backendResponse?: {
    jobId?: string
    status?: string
    error?: string
  }
  uiState?: {
    buttonsVisible: string[]
    buttonsEnabled: string[]
    currentPanel?: string
  }
}

/**
 * The complete QC_ACTION_TRACE artifact.
 */
export interface QCActionTrace {
  traceId: string
  testName: string
  startTime: string
  endTime?: string
  testPassed: boolean
  goldenPathComplete: boolean
  entries: QCActionEntry[]
  missingSteps: GoldenPathStep[]
  outputFile?: string
  outputFileExists?: boolean
  summary: {
    totalSteps: number
    successfulSteps: number
    failedSteps: number
    durationMs: number
  }
}

/**
 * Builder class for constructing QC_ACTION_TRACE incrementally.
 */
export class QCActionTraceBuilder {
  private trace: QCActionTrace
  private readonly startTime: Date
  
  constructor(testName: string) {
    this.startTime = new Date()
    this.trace = {
      traceId: `qc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      testName,
      startTime: this.startTime.toISOString(),
      testPassed: false,
      goldenPathComplete: false,
      entries: [],
      missingSteps: [...GOLDEN_PATH_STEPS],
      summary: {
        totalSteps: 0,
        successfulSteps: 0,
        failedSteps: 0,
        durationMs: 0,
      },
    }
  }
  
  /**
   * Records a step in the golden path.
   */
  recordStep(
    step: GoldenPathStep | string,
    success: boolean,
    details: string,
    options: {
      screenshotPath?: string
      backendResponse?: QCActionEntry['backendResponse']
      uiState?: QCActionEntry['uiState']
    } = {}
  ): this {
    const entry: QCActionEntry = {
      step,
      timestamp: new Date().toISOString(),
      success,
      details,
      ...options,
    }
    
    this.trace.entries.push(entry)
    this.trace.summary.totalSteps++
    
    if (success) {
      this.trace.summary.successfulSteps++
      
      // Remove from missing steps if it's a golden path step
      const stepIndex = this.trace.missingSteps.indexOf(step as GoldenPathStep)
      if (stepIndex !== -1) {
        this.trace.missingSteps.splice(stepIndex, 1)
      }
    } else {
      this.trace.summary.failedSteps++
    }
    
    console.log(`[QC_TRACE] ${success ? '✓' : '✗'} ${step}: ${details}`)
    
    return this
  }
  
  /**
   * Records the output file and whether it exists.
   */
  recordOutput(outputPath: string): this {
    this.trace.outputFile = outputPath
    this.trace.outputFileExists = fs.existsSync(outputPath)
    
    if (this.trace.outputFileExists) {
      const stats = fs.statSync(outputPath)
      console.log(`[QC_TRACE] ✓ Output file exists: ${outputPath} (${stats.size} bytes)`)
    } else {
      console.log(`[QC_TRACE] ✗ Output file NOT FOUND: ${outputPath}`)
    }
    
    return this
  }
  
  /**
   * Finalizes the trace and returns the complete artifact.
   */
  finalize(testPassed: boolean): QCActionTrace {
    const endTime = new Date()
    
    this.trace.endTime = endTime.toISOString()
    this.trace.testPassed = testPassed
    this.trace.goldenPathComplete = this.trace.missingSteps.length === 0
    this.trace.summary.durationMs = endTime.getTime() - this.startTime.getTime()
    
    return this.trace
  }
  
  /**
   * Gets the current trace (for intermediate inspection).
   */
  getTrace(): QCActionTrace {
    return { ...this.trace }
  }
}

/**
 * Saves a QC_ACTION_TRACE to the artifacts directory.
 */
export function saveQCActionTrace(
  trace: QCActionTrace,
  artifactsDir: string
): string {
  fs.mkdirSync(artifactsDir, { recursive: true })
  
  const filename = `qc_action_trace_${trace.traceId}.json`
  const filepath = path.join(artifactsDir, filename)
  
  fs.writeFileSync(filepath, JSON.stringify(trace, null, 2))
  console.log(`[QC_TRACE] Saved trace: ${filepath}`)
  
  // Also create a human-readable summary
  const summaryPath = path.join(artifactsDir, `qc_action_trace_${trace.traceId}_summary.txt`)
  const summary = generateTraceSummary(trace)
  fs.writeFileSync(summaryPath, summary)
  
  return filepath
}

/**
 * Generates a human-readable summary of the trace.
 */
function generateTraceSummary(trace: QCActionTrace): string {
  const lines: string[] = [
    '═══════════════════════════════════════════════════════════════════════════',
    '                         QC_ACTION_TRACE SUMMARY',
    '═══════════════════════════════════════════════════════════════════════════',
    '',
    `Test Name:          ${trace.testName}`,
    `Trace ID:           ${trace.traceId}`,
    `Start Time:         ${trace.startTime}`,
    `End Time:           ${trace.endTime || 'N/A'}`,
    `Duration:           ${trace.summary.durationMs}ms`,
    '',
    `Test Passed:        ${trace.testPassed ? '✓ YES' : '✗ NO'}`,
    `Golden Path:        ${trace.goldenPathComplete ? '✓ COMPLETE' : '✗ INCOMPLETE'}`,
    '',
    '─── GOLDEN PATH STEPS ────────────────────────────────────────────────────',
    '',
  ]
  
  for (const step of GOLDEN_PATH_STEPS) {
    const entry = trace.entries.find(e => e.step === step)
    if (entry) {
      lines.push(`  ${entry.success ? '✓' : '✗'} ${step}`)
      lines.push(`      ${entry.details}`)
      lines.push(`      @ ${entry.timestamp}`)
    } else {
      lines.push(`  ✗ ${step}`)
      lines.push(`      MISSING - step not recorded`)
    }
    lines.push('')
  }
  
  if (trace.missingSteps.length > 0) {
    lines.push('─── MISSING STEPS ────────────────────────────────────────────────────────')
    lines.push('')
    for (const step of trace.missingSteps) {
      lines.push(`  ✗ ${step}`)
    }
    lines.push('')
  }
  
  if (trace.outputFile) {
    lines.push('─── OUTPUT FILE ──────────────────────────────────────────────────────────')
    lines.push('')
    lines.push(`  Path:   ${trace.outputFile}`)
    lines.push(`  Exists: ${trace.outputFileExists ? '✓ YES' : '✗ NO'}`)
    lines.push('')
  }
  
  lines.push('─── STEP SUMMARY ─────────────────────────────────────────────────────────')
  lines.push('')
  lines.push(`  Total Steps:      ${trace.summary.totalSteps}`)
  lines.push(`  Successful:       ${trace.summary.successfulSteps}`)
  lines.push(`  Failed:           ${trace.summary.failedSteps}`)
  lines.push('')
  lines.push('═══════════════════════════════════════════════════════════════════════════')
  
  return lines.join('\n')
}

/**
 * Validates that a QC_ACTION_TRACE contains all required golden path steps.
 * Throws if any step is missing.
 */
export function assertGoldenPathComplete(trace: QCActionTrace): void {
  if (trace.missingSteps.length > 0) {
    const missing = trace.missingSteps.join(', ')
    throw new Error(
      `GOLDEN_PATH_INCOMPLETE: Missing steps: ${missing}\n` +
      `The test did not complete the full golden path workflow.`
    )
  }
  
  // Verify steps occurred in correct order
  const recordedSteps = trace.entries
    .filter(e => GOLDEN_PATH_STEPS.includes(e.step as GoldenPathStep))
    .map(e => e.step)
  
  let lastIndex = -1
  for (const step of recordedSteps) {
    const expectedIndex = GOLDEN_PATH_STEPS.indexOf(step as GoldenPathStep)
    if (expectedIndex < lastIndex) {
      throw new Error(
        `GOLDEN_PATH_OUT_OF_ORDER: Step "${step}" occurred after a later step.\n` +
        `Expected order: ${GOLDEN_PATH_STEPS.join(' → ')}`
      )
    }
    lastIndex = expectedIndex
  }
  
  console.log('✓ Golden path complete and in correct order')
}

/**
 * Validates that the output file exists and has non-zero size.
 */
export function assertOutputFileExists(trace: QCActionTrace): void {
  if (!trace.outputFile) {
    throw new Error('OUTPUT_NOT_SET: No output file was recorded in the trace')
  }
  
  if (!trace.outputFileExists) {
    throw new Error(
      `OUTPUT_NOT_FOUND: Output file does not exist: ${trace.outputFile}\n` +
      `The job may have failed to produce output.`
    )
  }
  
  const stats = fs.statSync(trace.outputFile)
  if (stats.size === 0) {
    throw new Error(
      `OUTPUT_EMPTY: Output file exists but has zero size: ${trace.outputFile}`
    )
  }
  
  console.log(`✓ Output file exists and has content: ${trace.outputFile}`)
}
