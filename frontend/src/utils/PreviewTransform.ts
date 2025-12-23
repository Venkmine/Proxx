/**
 * PreviewTransform — Single Source of Truth for Preview Coordinate Math
 *
 * PHASE 9A: All preview coordinate transformations MUST flow through this utility.
 * No overlay position, guide, or hit-test logic may bypass it.
 *
 * COORDINATE SYSTEMS:
 * - Normalized (0-1): Relative to video frame, origin at top-left
 * - Screen/Pixel: Absolute pixel coordinates on screen
 * - Canvas: Pixel coordinates relative to the preview canvas element
 *
 * SAFE AREAS:
 * - Title Safe: 10% inset (0.1 - 0.9)
 * - Action Safe: 5% inset (0.05 - 0.95)
 *
 * This module exports PURE FUNCTIONS only. No React hooks, no state.
 */

// ============================================================================
// TYPES
// ============================================================================

/** A 2D point with x and y coordinates */
export interface Point {
  x: number
  y: number
}

/** Size dimensions */
export interface Size {
  width: number
  height: number
}

/** A rectangle with position and size */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Safe area mode for clamping */
export type SafeAreaMode = 'title' | 'action' | 'none'

// ============================================================================
// CONSTANTS — No Magic Numbers
// ============================================================================

/** Title safe area inset (10%) */
export const TITLE_SAFE_INSET = 0.1

/** Action safe area inset (5%) */
export const ACTION_SAFE_INSET = 0.05

/** Standard video aspect ratio */
export const VIDEO_ASPECT_RATIO = 16 / 9

/** Anchor preset positions in normalized coordinates */
export const ANCHOR_POSITIONS: Record<string, Point> = {
  'top_left': { x: 0.1, y: 0.1 },
  'top_center': { x: 0.5, y: 0.1 },
  'top_right': { x: 0.9, y: 0.1 },
  'center_left': { x: 0.1, y: 0.5 },
  'center': { x: 0.5, y: 0.5 },
  'center_right': { x: 0.9, y: 0.5 },
  'bottom_left': { x: 0.1, y: 0.9 },
  'bottom_center': { x: 0.5, y: 0.9 },
  'bottom_right': { x: 0.9, y: 0.9 },
  'custom': { x: 0.5, y: 0.5 },
}

// ============================================================================
// VIEWPORT FITTING
// ============================================================================

/**
 * Calculate the fitted video rectangle within a viewport.
 * Maintains aspect ratio (letterbox/pillarbox as needed).
 *
 * @param videoSize - Natural video dimensions
 * @param viewportSize - Available viewport dimensions
 * @returns The positioned and sized rectangle for the video
 */
export function fitToViewport(videoSize: Size, viewportSize: Size): Rect {
  const videoAspect = videoSize.width / videoSize.height
  const viewportAspect = viewportSize.width / viewportSize.height

  let width: number
  let height: number

  if (viewportAspect > videoAspect) {
    // Viewport is wider than video — fit to height (pillarbox)
    height = viewportSize.height
    width = height * videoAspect
  } else {
    // Viewport is taller than video — fit to width (letterbox)
    width = viewportSize.width
    height = width / videoAspect
  }

  // Center the video in the viewport
  const x = (viewportSize.width - width) / 2
  const y = (viewportSize.height - height) / 2

  return { x, y, width, height }
}

/**
 * Get the video rectangle for a 16:9 aspect ratio canvas.
 * Assumes the canvas element uses aspect-ratio: 16/9 CSS.
 *
 * @param canvasRect - The bounding client rect of the canvas element
 * @returns The video rectangle (same as canvas for 16:9)
 */
export function getVideoRect(canvasRect: DOMRect): Rect {
  return {
    x: 0,
    y: 0,
    width: canvasRect.width,
    height: canvasRect.height,
  }
}

// ============================================================================
// COORDINATE CONVERSIONS
// ============================================================================

/**
 * Convert screen (page) coordinates to canvas-relative coordinates.
 *
 * @param screenPoint - Absolute screen coordinates (e.g., from MouseEvent)
 * @param canvasRect - The bounding client rect of the canvas element
 * @returns Canvas-relative pixel coordinates
 */
export function screenToCanvas(screenPoint: Point, canvasRect: DOMRect): Point {
  return {
    x: screenPoint.x - canvasRect.left,
    y: screenPoint.y - canvasRect.top,
  }
}

/**
 * Convert canvas-relative coordinates to screen (page) coordinates.
 *
 * @param canvasPoint - Canvas-relative pixel coordinates
 * @param canvasRect - The bounding client rect of the canvas element
 * @returns Absolute screen coordinates
 */
export function canvasToScreen(canvasPoint: Point, canvasRect: DOMRect): Point {
  return {
    x: canvasPoint.x + canvasRect.left,
    y: canvasPoint.y + canvasRect.top,
  }
}

/**
 * Normalize canvas coordinates to 0-1 range.
 *
 * @param canvasPoint - Canvas-relative pixel coordinates
 * @param canvasSize - The size of the canvas element
 * @returns Normalized coordinates (0-1)
 */
export function normalize(canvasPoint: Point, canvasSize: Size): Point {
  return {
    x: canvasPoint.x / canvasSize.width,
    y: canvasPoint.y / canvasSize.height,
  }
}

/**
 * Denormalize 0-1 coordinates to canvas pixel coordinates.
 *
 * @param normalizedPoint - Normalized coordinates (0-1)
 * @param canvasSize - The size of the canvas element
 * @returns Canvas-relative pixel coordinates
 */
export function denormalize(normalizedPoint: Point, canvasSize: Size): Point {
  return {
    x: normalizedPoint.x * canvasSize.width,
    y: normalizedPoint.y * canvasSize.height,
  }
}

/**
 * Convert screen coordinates directly to normalized coordinates.
 * Convenience function combining screenToCanvas + normalize.
 *
 * @param screenPoint - Absolute screen coordinates
 * @param canvasRect - The bounding client rect of the canvas element
 * @returns Normalized coordinates (0-1)
 */
export function screenToNormalized(screenPoint: Point, canvasRect: DOMRect): Point {
  const canvasPoint = screenToCanvas(screenPoint, canvasRect)
  return normalize(canvasPoint, { width: canvasRect.width, height: canvasRect.height })
}

/**
 * Convert normalized coordinates directly to screen coordinates.
 * Convenience function combining denormalize + canvasToScreen.
 *
 * @param normalizedPoint - Normalized coordinates (0-1)
 * @param canvasRect - The bounding client rect of the canvas element
 * @returns Absolute screen coordinates
 */
export function normalizedToScreen(normalizedPoint: Point, canvasRect: DOMRect): Point {
  const canvasPoint = denormalize(normalizedPoint, { width: canvasRect.width, height: canvasRect.height })
  return canvasToScreen(canvasPoint, canvasRect)
}

// ============================================================================
// SAFE AREA CLAMPING
// ============================================================================

/**
 * Get the inset value for a safe area mode.
 *
 * @param mode - The safe area mode
 * @returns The inset value (0-0.5)
 */
export function getSafeAreaInset(mode: SafeAreaMode): number {
  switch (mode) {
    case 'title':
      return TITLE_SAFE_INSET
    case 'action':
      return ACTION_SAFE_INSET
    case 'none':
      return 0
  }
}

/**
 * Clamp a normalized point to stay within a safe area.
 *
 * @param point - Normalized coordinates (0-1)
 * @param mode - The safe area mode ('title' = 10%, 'action' = 5%, 'none' = no clamping)
 * @returns Clamped normalized coordinates
 */
export function clampToSafeArea(point: Point, mode: SafeAreaMode = 'title'): Point {
  const inset = getSafeAreaInset(mode)
  const min = inset
  const max = 1 - inset

  return {
    x: Math.max(min, Math.min(max, point.x)),
    y: Math.max(min, Math.min(max, point.y)),
  }
}

/**
 * Check if a normalized point is within a safe area.
 *
 * @param point - Normalized coordinates (0-1)
 * @param mode - The safe area mode
 * @returns True if the point is within the safe area
 */
export function isWithinSafeArea(point: Point, mode: SafeAreaMode): boolean {
  const inset = getSafeAreaInset(mode)
  const min = inset
  const max = 1 - inset

  return point.x >= min && point.x <= max && point.y >= min && point.y <= max
}

// ============================================================================
// ANCHOR POSITION RESOLUTION
// ============================================================================

/**
 * Get the normalized position for an anchor preset.
 *
 * @param anchor - Anchor name (e.g., 'top_left', 'center', 'custom')
 * @returns Normalized coordinates for the anchor
 */
export function getAnchorPosition(anchor: string): Point {
  return ANCHOR_POSITIONS[anchor] || ANCHOR_POSITIONS['center']
}

/**
 * Resolve overlay position from settings.
 * If position is 'custom' and x/y are provided, use them.
 * Otherwise, use the anchor preset position.
 *
 * @param position - Position type or anchor name
 * @param customX - Optional custom x coordinate (normalized)
 * @param customY - Optional custom y coordinate (normalized)
 * @returns Resolved normalized coordinates
 */
export function resolveOverlayPosition(
  position: string,
  customX?: number,
  customY?: number
): Point {
  if (position === 'custom' && customX !== undefined && customY !== undefined) {
    return { x: customX, y: customY }
  }
  return getAnchorPosition(position)
}

// ============================================================================
// CSS STYLE HELPERS
// ============================================================================

/**
 * Convert normalized position to CSS percentage style values.
 * Used for positioning overlays with CSS.
 *
 * @param point - Normalized coordinates (0-1)
 * @returns CSS left and top percentage values
 */
export function toPercentageStyle(point: Point): { left: string; top: string } {
  return {
    left: `${point.x * 100}%`,
    top: `${point.y * 100}%`,
  }
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Check if a point has valid normalized coordinates (0-1 range).
 *
 * @param point - The point to validate
 * @returns True if coordinates are in valid 0-1 range
 */
export function isValidNormalizedPoint(point: Point): boolean {
  return (
    typeof point.x === 'number' &&
    typeof point.y === 'number' &&
    !isNaN(point.x) &&
    !isNaN(point.y) &&
    point.x >= 0 &&
    point.x <= 1 &&
    point.y >= 0 &&
    point.y <= 1
  )
}
