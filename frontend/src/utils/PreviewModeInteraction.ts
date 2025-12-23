/**
 * PreviewModeInteraction — Phase 9D Mode Interaction Boundaries
 * 
 * Centralized gating for preview mode interactions.
 * All interaction entry points MUST consult this module.
 * 
 * RULES:
 * - view mode: No overlay interaction at all
 * - overlays mode: Full overlay editing (select, drag, scale)
 * - burn-in mode: Only burn-in overlays can be edited
 * 
 * This module provides:
 * - canInteractWithOverlay() — Single source of truth for interaction gating
 * - getInteractionCursor() — Returns appropriate cursor for current state
 * - InteractionAction type — Enum of possible actions
 */

import type { PreviewMode } from '../components/VisualPreviewWorkspace'
import type { OverlayLayerType } from '../components/DeliverControlPanel'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Actions that can be performed on an overlay.
 */
export type InteractionAction = 'select' | 'drag' | 'scale'

/**
 * Result of checking if an interaction is allowed.
 */
export interface InteractionCheckResult {
  /** Whether the interaction is allowed */
  allowed: boolean
  /** Reason for blocking (if not allowed) */
  reason?: string
}

// ============================================================================
// BURN-IN OVERLAY DETECTION
// ============================================================================

/**
 * Overlay types that are considered "burn-in" overlays.
 * These are data-driven overlays that represent embedded metadata.
 * 
 * In burn-in mode, ONLY these types can be edited.
 */
const BURN_IN_OVERLAY_TYPES: Set<OverlayLayerType | 'timecode'> = new Set([
  'timecode',
  'metadata',
])

/**
 * Check if an overlay type is a burn-in overlay.
 */
export function isBurnInOverlay(overlayType: OverlayLayerType | string): boolean {
  return BURN_IN_OVERLAY_TYPES.has(overlayType as OverlayLayerType)
}

// ============================================================================
// INTERACTION GATING — Single Source of Truth
// ============================================================================

/**
 * Check if an interaction is allowed for the given overlay in the current mode.
 * 
 * ALL interaction entry points must call this function:
 * - Mouse down handlers
 * - Drag start handlers
 * - Handle drag handlers
 * - Selection handlers
 * 
 * RULES:
 * - view mode: NO interactions allowed
 * - overlays mode: ALL overlay interactions allowed (except burn-in specific)
 * - burn-in mode: ONLY burn-in overlays can be interacted with
 * 
 * @param mode - Current preview mode
 * @param overlayType - Type of overlay being interacted with
 * @param action - The action being attempted
 * @param isReadOnly - Whether the preview is in read-only mode
 * @returns InteractionCheckResult with allowed status and reason
 */
export function canInteractWithOverlay(
  mode: PreviewMode,
  overlayType: OverlayLayerType | string,
  action: InteractionAction,
  isReadOnly: boolean = false
): InteractionCheckResult {
  // Read-only mode blocks all interactions
  if (isReadOnly) {
    return {
      allowed: false,
      reason: 'Preview is read-only',
    }
  }

  // View mode: No overlay interactions allowed
  if (mode === 'view') {
    return {
      allowed: false,
      reason: `Cannot ${action} overlay in view mode — switch to overlays or burn-in mode`,
    }
  }

  // Overlays mode: All overlay interactions allowed
  if (mode === 'overlays') {
    return { allowed: true }
  }

  // Burn-in mode: Only burn-in overlays can be interacted with
  if (mode === 'burn-in') {
    const isBurnIn = isBurnInOverlay(overlayType)
    if (isBurnIn) {
      return { allowed: true }
    } else {
      return {
        allowed: false,
        reason: `Cannot ${action} ${overlayType} overlay in burn-in mode — only burn-in overlays can be edited`,
      }
    }
  }

  // Unknown mode — block by default
  return {
    allowed: false,
    reason: `Unknown preview mode: ${mode}`,
  }
}

/**
 * Shorthand to check if ANY interaction is possible in current mode.
 * Used for cursor and visual affordance decisions.
 */
export function canInteractInMode(
  mode: PreviewMode,
  overlayType: OverlayLayerType | string,
  isReadOnly: boolean = false
): boolean {
  return canInteractWithOverlay(mode, overlayType, 'select', isReadOnly).allowed
}

// ============================================================================
// CURSOR HELPERS
// ============================================================================

/**
 * Get the appropriate cursor for an overlay based on current mode and state.
 * 
 * - view mode: default cursor (no affordance)
 * - overlays mode: move cursor for allowed overlays
 * - burn-in mode: move cursor only for burn-in overlays
 * 
 * @param mode - Current preview mode
 * @param overlayType - Type of overlay
 * @param isReadOnly - Whether preview is read-only
 * @param isScaling - Whether currently scaling (overrides with default)
 */
export function getInteractionCursor(
  mode: PreviewMode,
  overlayType: OverlayLayerType | string,
  isReadOnly: boolean = false,
  isScaling: boolean = false
): string {
  // During scaling, use default cursor (handles have their own cursors)
  if (isScaling) {
    return 'default'
  }

  // Check if interaction is allowed
  const canInteract = canInteractInMode(mode, overlayType, isReadOnly)
  
  if (canInteract) {
    return 'move'
  }
  
  return 'default'
}

/**
 * Check if selection box handles should be visible.
 * Handles are only visible in overlays mode.
 */
export function shouldShowHandles(mode: PreviewMode): boolean {
  return mode === 'overlays'
}

/**
 * Check if selection box should be visible at all.
 * Box is visible in overlays mode (with handles) and burn-in mode (no handles).
 */
export function shouldShowSelectionBox(
  mode: PreviewMode,
  overlayType: OverlayLayerType | string
): boolean {
  if (mode === 'overlays') {
    return true
  }
  if (mode === 'burn-in') {
    return isBurnInOverlay(overlayType)
  }
  return false
}
