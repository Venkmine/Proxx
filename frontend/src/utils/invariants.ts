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

// ============================================================================
// PHASE 9B: OVERLAY BOUNDING BOX HANDLES
// ============================================================================

/**
 * Assert that an overlay handle drag does not push the overlay outside bounds.
 * 
 * This invariant is triggered when scaling via bounding box handles would
 * cause the overlay to exceed the title-safe or action-safe area.
 * 
 * @param isWithinBounds - Whether the overlay remains within bounds after scaling
 * @param layerId - The overlay layer being scaled
 * @param attemptedScale - The scale value that was attempted
 * @param component - Where the scaling originated
 */
export function assertOverlayHandleWithinBounds(
  isWithinBounds: boolean,
  layerId: string,
  attemptedScale: number,
  component: string = 'OverlaySelectionBox'
): boolean {
  return assertInvariant(
    isWithinBounds,
    'OVERLAY_HANDLE_OUT_OF_BOUNDS',
    `Scaling overlay ${layerId} would push it outside the safe area (attempted scale: ${attemptedScale.toFixed(2)})`,
    { component, layerId, attemptedScale }
  )
}

// ============================================================================
// PHASE 9C: BURN-IN PREVIEW PARITY
// ============================================================================

/**
 * Assert that burn-in font matches the expected preview constant.
 * 
 * This invariant checks PREVIEW SELF-CONSISTENCY, not output equivalence.
 * It validates that the preview is using the documented burn-in font,
 * not that it matches FFmpeg output (which is platform-dependent).
 * 
 * WHAT THIS CHECKS:
 * ✅ Font family equals the chosen constant
 * ✅ Consistent rendering within preview
 * 
 * WHAT THIS DOES NOT CHECK:
 * ❌ Pixel comparisons to FFmpeg output
 * ❌ Runtime measurements vs backend output
 * ❌ Canvas-based font metric calculations
 * 
 * @param actualFont - The font currently being used in preview
 * @param expectedFont - The expected font from burnin.ts constants
 * @param overlayType - Type of overlay being checked (timecode, metadata, text)
 * @param component - Where the check originated
 */
export function assertBurninFontParity(
  actualFont: string,
  expectedFont: string,
  overlayType: string,
  component: string = 'VisualPreviewWorkspace'
): boolean {
  return assertInvariant(
    actualFont === expectedFont,
    'BURNIN_FONT_MISMATCH',
    `Burn-in ${overlayType} font mismatch: using '${actualFont}', expected '${expectedFont}'`,
    { component, overlayType, actualFont, expectedFont }
  )
}

/**
 * Assert that burn-in font size is stable (hasn't changed unexpectedly).
 * 
 * This invariant helps detect font size drift or reflow during scaling.
 * 
 * @param currentSize - Current rendered font size
 * @param expectedSize - Expected font size based on settings
 * @param tolerance - Acceptable variance (default 0.1 = 10%)
 * @param component - Where the check originated
 */
export function assertBurninFontSizeStable(
  currentSize: number,
  expectedSize: number,
  tolerance: number = 0.1,
  component: string = 'VisualPreviewWorkspace'
): boolean {
  const variance = Math.abs(currentSize - expectedSize) / expectedSize
  return assertInvariant(
    variance <= tolerance,
    'BURNIN_FONT_SIZE_DRIFT',
    `Burn-in font size unstable: ${currentSize}px (expected ${expectedSize}px, variance ${(variance * 100).toFixed(1)}%)`,
    { component, currentSize, expectedSize, variance }
  )
}

// ============================================================================
// PHASE 9D: MODE INTERACTION BOUNDARIES
// ============================================================================

/**
 * Assert that an overlay interaction is allowed in the current mode.
 * 
 * This invariant fires when an illegal interaction is attempted:
 * - Any overlay interaction in view mode
 * - Non-burn-in overlay interaction in burn-in mode
 * 
 * This is a HARD BLOCK — the interaction should not proceed.
 * 
 * @param allowed - Whether the interaction is allowed
 * @param mode - Current preview mode
 * @param overlayId - ID of the overlay being interacted with
 * @param overlayType - Type of the overlay
 * @param action - The action being attempted (select, drag, scale)
 * @param component - Where the violation originated
 */
export function assertModeInteractionAllowed(
  allowed: boolean,
  mode: string,
  overlayId: string,
  overlayType: string,
  action: string,
  component: string = 'VisualPreviewWorkspace'
): boolean {
  return assertInvariant(
    allowed,
    'MODE_INTERACTION_VIOLATION',
    `Illegal ${action} on ${overlayType} overlay in ${mode} mode`,
    { component, mode, overlayId, overlayType, action }
  )
}

// ============================================================================
// PHASE 9E: PRESET POSITION CONFLICT
// ============================================================================

/**
 * Assert that a preset is not overwriting manual preview edits silently.
 * 
 * This invariant fires when:
 * - A preset is being applied
 * - Overlays with positionSource === "manual" exist
 * - No confirmation dialog was shown to the user
 * 
 * This should NEVER fire in normal operation — the UI must always
 * show a confirmation dialog when this conflict exists.
 * 
 * @param hasManualEdits - Whether any overlay has positionSource === "manual"
 * @param showedConfirmation - Whether the confirmation dialog was shown
 * @param component - Where the preset application originated
 */
export function assertNoSilentPresetOverwrite(
  hasManualEdits: boolean,
  showedConfirmation: boolean,
  component: string = 'PresetApplication'
): boolean {
  // Invariant holds if:
  // - No manual edits exist (no conflict), OR
  // - Confirmation was shown (user was informed)
  const invariantHolds = !hasManualEdits || showedConfirmation
  
  return assertInvariant(
    invariantHolds,
    'PRESET_POSITION_CONFLICT',
    'Preset applied over manually edited overlay positions without user confirmation',
    { component, hasManualEdits, showedConfirmation }
  )
}

