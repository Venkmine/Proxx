/**
 * qcEngine.ts
 * 
 * QC Execution Engine - DRY-RUN ONLY
 * 
 * ⚠️ CRITICAL: This engine NEVER invokes FFmpeg or DaVinci Resolve
 * 
 * PURPOSE:
 * - Validate queued jobs before actual execution
 * - Simulate execution flow with deterministic state transitions
 * - Provide realistic timing for UI state machine testing
 * 
 * SCOPE:
 * - ✓ Real validation (files, paths, settings compatibility)
 * - ✓ Deterministic state transitions
 * - ✓ Per-clip simulation with realistic delays
 * - ❌ NO FFmpeg invocation
 * - ❌ NO Resolve invocation
 * - ❌ NO actual file generation
 * 
 * DESIGN RATIONALE:
 * This is a dry-run engine for QC purposes. The UI must treat this
 * as real execution to verify the complete user experience without
 * the overhead and complexity of actual transcoding.
 */

import type { JobSpec } from '../utils/buildJobSpec'
import type { ExecutionEvent, JobState } from './executionTypes'

/**
 * Validation result with detailed blocking reasons
 */
interface ValidationResult {
  valid: boolean
  reasons: string[]
}

/**
 * Sleep utility for deterministic simulation delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Validate source file paths
 * 
 * NOTE: In browser context, we cannot directly access filesystem.
 * This validation checks format/structure only. Backend performs
 * actual filesystem validation.
 */
function validateSources(sources: string[]): ValidationResult {
  const reasons: string[] = []
  
  if (!sources || sources.length === 0) {
    reasons.push('No source files specified')
    return { valid: false, reasons }
  }
  
  // Check for empty paths
  const emptyPaths = sources.filter(s => !s || s.trim() === '')
  if (emptyPaths.length > 0) {
    reasons.push(`Found ${emptyPaths.length} empty source path(s)`)
  }
  
  // Check for suspicious patterns (but don't block - backend validates)
  const suspiciousPaths = sources.filter(s => 
    s.includes('..') || s.includes('//') || s.endsWith('/')
  )
  if (suspiciousPaths.length > 0) {
    reasons.push(`Warning: ${suspiciousPaths.length} source path(s) have suspicious patterns`)
  }
  
  return { 
    valid: reasons.length === 0, 
    reasons 
  }
}

/**
 * Validate output directory path
 * 
 * NOTE: Browser cannot verify filesystem, only structural validation.
 */
function validateOutputDirectory(outputPath: string): ValidationResult {
  const reasons: string[] = []
  
  if (!outputPath || outputPath.trim() === '') {
    reasons.push('Output directory path is empty')
    return { valid: false, reasons }
  }
  
  // Check for suspicious patterns
  if (outputPath.includes('..')) {
    reasons.push('Output path contains relative traversal (..)')
  }
  
  // Warn if output path looks like a file (has extension)
  if (/\.[a-zA-Z0-9]+$/.test(outputPath)) {
    reasons.push('Output path appears to be a file, not a directory')
  }
  
  return { 
    valid: reasons.length === 0, 
    reasons 
  }
}

/**
 * Validate filename template
 * 
 * Ensures template can be resolved and doesn't contain invalid characters.
 */
function validateFilenameTemplate(template: string): ValidationResult {
  const reasons: string[] = []
  
  if (!template || template.trim() === '') {
    reasons.push('Filename template is empty')
    return { valid: false, reasons }
  }
  
  // Check for invalid filename characters (cross-platform)
  const invalidChars = /[<>:"|?*\x00-\x1f]/
  if (invalidChars.test(template)) {
    reasons.push('Filename template contains invalid characters')
  }
  
  // Check for path separators (template should be filename only)
  if (template.includes('/') || template.includes('\\')) {
    reasons.push('Filename template should not contain path separators')
  }
  
  return { 
    valid: reasons.length === 0, 
    reasons 
  }
}

/**
 * Validate container format compatibility with codec
 * 
 * Basic compatibility checks for common formats.
 */
function validateContainerCodecCompatibility(
  container: string, 
  codec: string
): ValidationResult {
  const reasons: string[] = []
  
  // ProRes compatibility
  if (codec.startsWith('prores') && !['mov', 'mxf'].includes(container)) {
    reasons.push(`ProRes codec requires MOV or MXF container, got: ${container}`)
  }
  
  // H.264/H.265 compatibility
  if ((codec === 'h264' || codec === 'h265') && !['mp4', 'mov'].includes(container)) {
    reasons.push(`${codec.toUpperCase()} codec works best with MP4 or MOV container, got: ${container}`)
  }
  
  return { 
    valid: reasons.length === 0, 
    reasons 
  }
}

/**
 * Check execution engine availability
 * 
 * NOTE: This is a STUB for dry-run. In production, this would verify:
 * - FFmpeg binary exists and is executable
 * - DaVinci Resolve is installed and accessible
 * 
 * For dry-run, we always return success with a note.
 */
function validateExecutionEngines(
  requirements: { use_ffmpeg: boolean; use_resolve: boolean }
): ValidationResult {
  const reasons: string[] = []
  
  // DRY-RUN STUB: Always pass validation with informational message
  if (requirements.use_ffmpeg) {
    reasons.push('DRY-RUN: FFmpeg validation skipped (would check binary)')
  }
  
  if (requirements.use_resolve) {
    reasons.push('DRY-RUN: Resolve validation skipped (would check installation)')
  }
  
  // Always valid in dry-run mode
  return { 
    valid: true, 
    reasons 
  }
}

/**
 * Perform comprehensive validation on JobSpec
 * 
 * Returns aggregated validation result with all blocking reasons.
 */
function validateJobSpec(jobSpec: JobSpec): ValidationResult {
  const allReasons: string[] = []
  
  // Validate sources
  const sourcesResult = validateSources(jobSpec.sources)
  if (!sourcesResult.valid) {
    allReasons.push(...sourcesResult.reasons)
  }
  
  // Validate output directory
  const outputResult = validateOutputDirectory(jobSpec.output_directory)
  if (!outputResult.valid) {
    allReasons.push(...outputResult.reasons)
  }
  
  // Validate filename template
  const templateResult = validateFilenameTemplate(jobSpec.naming_template)
  if (!templateResult.valid) {
    allReasons.push(...templateResult.reasons)
  }
  
  // Validate container/codec compatibility
  const compatResult = validateContainerCodecCompatibility(
    jobSpec.container, 
    jobSpec.codec
  )
  if (!compatResult.valid) {
    allReasons.push(...compatResult.reasons)
  }
  
  // Validate execution engines (dry-run stub)
  const engineResult = validateExecutionEngines(jobSpec.execution_engines)
  // Add informational messages even if valid
  if (engineResult.reasons.length > 0) {
    allReasons.push(...engineResult.reasons)
  }
  
  return {
    valid: allReasons.length === 0 || allReasons.every(r => r.startsWith('DRY-RUN:')),
    reasons: allReasons
  }
}

/**
 * Run QC job with validation and simulation
 * 
 * EXECUTION FLOW:
 * 1. Emit VALIDATING state
 * 2. Perform real validation checks
 * 3. If validation fails → Emit BLOCKED with reasons
 * 4. If validation passes:
 *    - Emit READY
 *    - Emit DRY_RUNNING
 *    - Simulate per-clip work (300ms per clip)
 *    - Emit COMPLETE
 * 
 * @param jobSpec - JobSpec to validate and simulate
 * @param emit - Callback to emit execution events
 */
export async function runQcJob(
  jobSpec: JobSpec,
  emit: (event: ExecutionEvent) => void
): Promise<void> {
  const jobId = jobSpec.job_id
  
  // ============================================
  // Phase 1: VALIDATING
  // ============================================
  emit({
    jobId,
    state: 'VALIDATING',
    message: 'Performing validation checks...'
  })
  
  // Small delay to make validation feel real
  await sleep(500)
  
  // Perform validation
  const validationResult = validateJobSpec(jobSpec)
  
  // ============================================
  // Phase 2: Check Validation Result
  // ============================================
  if (!validationResult.valid) {
    // Validation failed - emit BLOCKED with reasons
    emit({
      jobId,
      state: 'BLOCKED',
      message: validationResult.reasons.join('; ')
    })
    return // Stop execution
  }
  
  // ============================================
  // Phase 3: READY
  // ============================================
  emit({
    jobId,
    state: 'READY',
    message: 'Validation passed, ready to simulate'
  })
  
  await sleep(200)
  
  // ============================================
  // Phase 4: DRY_RUNNING
  // ============================================
  emit({
    jobId,
    state: 'DRY_RUNNING',
    message: `Simulating execution for ${jobSpec.sources.length} clip(s)...`
  })
  
  // Simulate per-clip work
  // Real execution would process each clip, here we just wait
  for (let i = 0; i < jobSpec.sources.length; i++) {
    // 300ms per clip as specified
    await sleep(300)
    
    // Optional: emit progress updates
    const progress = ((i + 1) / jobSpec.sources.length) * 100
    emit({
      jobId,
      state: 'DRY_RUNNING',
      message: `Processing clip ${i + 1}/${jobSpec.sources.length} (${progress.toFixed(0)}%)`
    })
  }
  
  // ============================================
  // Phase 5: COMPLETE
  // ============================================
  emit({
    jobId,
    state: 'COMPLETE',
    message: `Dry-run complete: ${jobSpec.sources.length} clip(s) simulated`
  })
}
