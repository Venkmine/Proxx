/**
 * Runtime Invariant Assertions — Hardening Pass
 * 
 * Assertions for conditions that should NEVER be false.
 * When violated:
 * - Does NOT crash the app
 * - Records the violation
 * - Logs a structured error
 * - Makes the violation visible in UI via InvariantBanner
 * 
 * Usage:
 *   assertInvariant(selectedJob !== null, 'NO_SELECTED_JOB', 'Preview requires a selected job')
 */

import { logInvariantViolation } from './logger'

// ============================================================================
// TYPES
// ============================================================================

export interface InvariantViolation {
  /** Unique identifier for the invariant */
  id: string
  /** Human-readable description */
  message: string
  /** Where the violation occurred */
  component?: string
  /** Additional context (e.g., job ID, layer ID) */
  context?: Record<string, unknown>
  /** When the violation was first detected */
  timestamp: Date
}

// ============================================================================
// STATE — Global store for active violations
// ============================================================================

// Singleton state for tracking active violations
// This is intentionally NOT in React state — we need it accessible from anywhere
let violations: InvariantViolation[] = []
let listeners: Set<() => void> = new Set()

/**
 * Subscribe to violation changes.
 * Returns an unsubscribe function.
 */
export function subscribeToViolations(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Get all current violations.
 */
export function getViolations(): InvariantViolation[] {
  return [...violations]
}

/**
 * Clear a specific violation by ID.
 */
export function clearViolation(id: string): void {
  violations = violations.filter(v => v.id !== id)
  notifyListeners()
}

/**
 * Clear all violations.
 */
export function clearAllViolations(): void {
  violations = []
  notifyListeners()
}

function notifyListeners(): void {
  listeners.forEach(listener => listener())
}

function addViolation(violation: InvariantViolation): void {
  // Don't add duplicates — update timestamp instead
  const existing = violations.find(v => v.id === violation.id)
  if (existing) {
    existing.timestamp = violation.timestamp
  } else {
    violations.push(violation)
  }
  notifyListeners()
}

// ============================================================================
// ASSERTION API
// ============================================================================

/**
 * Assert an invariant condition.
 * 
 * If the condition is false:
 * - Logs a structured error
 * - Records the violation for UI display
 * - Returns false
 * 
 * If the condition is true:
 * - Clears any existing violation with this ID
 * - Returns true
 * 
 * @param condition - The condition that should be true
 * @param id - Unique identifier for this invariant (e.g., 'PREVIEW_NO_JOB')
 * @param message - Human-readable description of what's wrong
 * @param context - Optional context (component name, job ID, etc.)
 * @returns The condition value (for chaining)
 */
export function assertInvariant(
  condition: boolean,
  id: string,
  message: string,
  context?: { component?: string; [key: string]: unknown }
): boolean {
  if (condition) {
    // Invariant holds — clear any existing violation with this ID
    const hadViolation = violations.some(v => v.id === id)
    if (hadViolation) {
      clearViolation(id)
    }
    return true
  }
  
  // Invariant violated
  logInvariantViolation(id, message, context)
  
  addViolation({
    id,
    message,
    component: context?.component,
    context,
    timestamp: new Date(),
  })
  
  return false
}

/**
 * Check an invariant without asserting.
 * Useful for conditional logic that depends on invariant state.
 * 
 * @returns true if the invariant holds
 */
export function checkInvariant(
  condition: boolean,
  id: string,
  message: string,
  context?: { component?: string; [key: string]: unknown }
): boolean {
  return assertInvariant(condition, id, message, context)
}

// ============================================================================
// PREDEFINED INVARIANT CHECKS
// ============================================================================

/**
 * Assert that a job is selected before showing preview.
 */
export function assertJobSelectedForPreview(
  selectedJobId: string | null | undefined,
  component: string = 'VisualPreviewWorkspace'
): boolean {
  return assertInvariant(
    selectedJobId != null,
    'PREVIEW_NO_SELECTED_JOB',
    'Preview shown with no selected job',
    { component, selectedJobId }
  )
}

/**
 * Assert that a layer is selected before overlay edits.
 */
export function assertLayerSelectedForEdit(
  selectedLayerId: string | null | undefined,
  component: string = 'OverlayLayerPanel'
): boolean {
  return assertInvariant(
    selectedLayerId != null,
    'OVERLAY_NO_SELECTED_LAYER',
    'Overlay edit attempted with no selected layer',
    { component, selectedLayerId }
  )
}

/**
 * Assert that a clip is selected for clip-scoped overlay.
 */
export function assertClipSelectedForOverlay(
  selectedClipId: string | null | undefined,
  component: string = 'OverlaySettings'
): boolean {
  return assertInvariant(
    selectedClipId != null,
    'OVERLAY_NO_SELECTED_CLIP',
    'Clip-scoped overlay with no selected clip',
    { component, selectedClipId }
  )
}

/**
 * Assert that a job is in pending status before render.
 */
export function assertJobPendingForRender(
  jobId: string,
  jobStatus: string,
  component: string = 'RenderControl'
): boolean {
  const normalizedStatus = jobStatus.toUpperCase()
  return assertInvariant(
    normalizedStatus === 'PENDING',
    `RENDER_NON_PENDING_JOB_${jobId.slice(0, 8)}`,
    `Render triggered on non-pending job (status: ${jobStatus})`,
    { component, jobId, jobStatus }
  )
}

// ============================================================================
// PHASE 9A: PREVIEW TRANSFORM AUTHORITY
// ============================================================================

/**
 * Assert that overlay position updates flow through PreviewTransform.
 * 
 * This invariant should be triggered if position math is detected
 * outside of the PreviewTransform utility. Since we cannot statically
 * enforce this at runtime, this function is called defensively when
 * position updates occur to validate the coordinates are reasonable.
 * 
 * @param point - The normalized coordinates being set
 * @param component - Where the update originated
 */
export function assertPreviewTransformUsed(
  point: { x: number; y: number },
  component: string = 'VisualPreviewWorkspace'
): boolean {
  // Validate that coordinates are in valid normalized range (0-1)
  // Invalid coordinates suggest bypass of PreviewTransform clamping
  const isValidRange = 
    typeof point.x === 'number' &&
    typeof point.y === 'number' &&
    !isNaN(point.x) &&
    !isNaN(point.y) &&
    point.x >= 0 &&
    point.x <= 1 &&
    point.y >= 0 &&
    point.y <= 1
  
  return assertInvariant(
    isValidRange,
    'PREVIEW_TRANSFORM_BYPASS',
    `Overlay position update with invalid coordinates (x: ${point.x}, y: ${point.y}) — may indicate PreviewTransform bypass`,
    { component, x: point.x, y: point.y }
  )
}
