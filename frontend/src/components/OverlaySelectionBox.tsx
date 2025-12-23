/**
 * OverlaySelectionBox — Phase 9B/9C Overlay Bounding Box Handles
 * 
 * A preview-only component responsible for:
 * - Drawing a bounding box around the selected overlay
 * - Rendering 8 handles (4 corners, 4 edges)
 * - Handling mouse interactions for scaling
 * 
 * Rules:
 * - Only visible in overlays mode (full interaction)
 * - Can show in burn-in mode with interaction='none' (visual bounds only)
 * - Only one overlay selectable at a time
 * - Hidden in view mode
 * - All coordinate math through PreviewTransform
 * 
 * Phase 9C additions:
 * - interaction='none' mode for burn-ins (visual bounds, no handles/drag)
 * - Burn-ins must not be interactable outside burn-in mode
 * 
 * Scaling behavior:
 * - Corner handles: scale X+Y together (aspect ratio locked for images)
 * - Edge handles: scale one axis only
 * - Scaling origin: overlay center
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import * as PreviewTransform from '../utils/PreviewTransform'
import { assertOverlayHandleWithinBounds } from '../utils/invariants'
import type { PreviewMode } from './VisualPreviewWorkspace'

// ============================================================================
// TYPES
// ============================================================================

/** Handle position identifiers */
export type HandlePosition = 
  | 'top-left' | 'top' | 'top-right'
  | 'left' | 'right'
  | 'bottom-left' | 'bottom' | 'bottom-right'

/**
 * Interaction mode for the selection box.
 * - 'full': Show bounding box with handles, all interactions enabled
 * - 'none': Show bounding box only (visual bounds), no handles or drag listeners
 * 
 * Phase 9C: Burn-ins use 'none' mode for visual bounds without interactivity.
 */
export type InteractionMode = 'full' | 'none'

/** Overlay sizing info for bounding box calculation */
export interface OverlaySizeInfo {
  /** Overlay layer ID */
  layerId: string
  /** Overlay type for aspect ratio rules */
  type: 'image' | 'text' | 'timecode' | 'metadata'
  /** Normalized position (0-1) */
  position: PreviewTransform.Point
  /** Current scale value (for images/text sizing) */
  scale?: number
  /** Font size for text overlays */
  fontSize?: number
  /** Reference to the overlay DOM element for sizing */
  overlayElement: HTMLElement | null
}

interface OverlaySelectionBoxProps {
  /** Current preview mode */
  mode: PreviewMode
  /** Whether the preview is read-only */
  isReadOnly: boolean
  /** Size info for the selected overlay */
  overlayInfo: OverlaySizeInfo | null
  /** Canvas rect for coordinate transformations */
  canvasRect: DOMRect | null
  /** Callback when scale changes */
  onScaleChange?: (layerId: string, newScale: number) => void
  /** Callback when scaling starts */
  onScaleStart?: () => void
  /** Callback when scaling ends */
  onScaleEnd?: () => void
  /**
   * Interaction mode for the selection box.
   * - 'full' (default): Show handles, enable scaling interactions
   * - 'none': Visual bounds only, no handles or interactions
   * 
   * Phase 9C: Burn-ins must not be interactable outside burn-in mode.
   * Use interaction='none' to show bounds without enabling drag/scale.
   */
  interaction?: InteractionMode
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Handle size in pixels */
const HANDLE_SIZE = 8

/** Minimum scale value */
const MIN_SCALE = 0.1

/** Maximum scale value */
const MAX_SCALE = 5.0

// ============================================================================
// COMPONENT
// ============================================================================

export function OverlaySelectionBox({
  mode,
  isReadOnly,
  overlayInfo,
  canvasRect,
  onScaleChange,
  onScaleStart,
  onScaleEnd,
  interaction = 'full',
}: OverlaySelectionBoxProps) {
  // Phase 9C: Support burn-in mode for visual bounds only
  // In burn-in mode, we show bounds but with interaction='none'
  const showInBurnInMode = mode === 'burn-in' && interaction === 'none'
  
  // Only show in overlays mode (full interaction) or burn-in mode (visual only)
  if (!showInBurnInMode && (mode !== 'overlays' || isReadOnly)) {
    return null
  }
  
  if (!overlayInfo || !canvasRect) {
    return null
  }

  // If no overlay element reference, we can't calculate bounds
  if (!overlayInfo.overlayElement) {
    return null
  }

  // Scaling state
  const [isScaling, setIsScaling] = useState(false)
  const [activeHandle, setActiveHandle] = useState<HandlePosition | null>(null)
  const scaleStartRef = useRef<{ scale: number; mouseX: number; mouseY: number } | null>(null)

  // Get overlay element bounds relative to canvas
  const overlayRect = overlayInfo.overlayElement.getBoundingClientRect()
  
  // Calculate bounding box in canvas-relative coordinates
  const boxLeft = overlayRect.left - canvasRect.left
  const boxTop = overlayRect.top - canvasRect.top
  const boxWidth = overlayRect.width
  const boxHeight = overlayRect.height

  // Handle cursor styles based on handle position
  const getCursorForHandle = (pos: HandlePosition): string => {
    switch (pos) {
      case 'top-left':
      case 'bottom-right':
        return 'nwse-resize'
      case 'top-right':
      case 'bottom-left':
        return 'nesw-resize'
      case 'top':
      case 'bottom':
        return 'ns-resize'
      case 'left':
      case 'right':
        return 'ew-resize'
      default:
        return 'default'
    }
  }

  // Calculate handle positions
  const handlePositions: Record<HandlePosition, { x: number; y: number }> = {
    'top-left': { x: boxLeft, y: boxTop },
    'top': { x: boxLeft + boxWidth / 2, y: boxTop },
    'top-right': { x: boxLeft + boxWidth, y: boxTop },
    'left': { x: boxLeft, y: boxTop + boxHeight / 2 },
    'right': { x: boxLeft + boxWidth, y: boxTop + boxHeight / 2 },
    'bottom-left': { x: boxLeft, y: boxTop + boxHeight },
    'bottom': { x: boxLeft + boxWidth / 2, y: boxTop + boxHeight },
    'bottom-right': { x: boxLeft + boxWidth, y: boxTop + boxHeight },
  }

  // Check if position is a corner handle
  const isCornerHandle = (pos: HandlePosition): boolean => {
    return ['top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(pos)
  }

  // Handle mouse down on a handle
  const handleMouseDown = useCallback((
    e: React.MouseEvent,
    handlePos: HandlePosition
  ) => {
    e.preventDefault()
    e.stopPropagation()

    const currentScale = overlayInfo?.scale ?? 1.0
    scaleStartRef.current = {
      scale: currentScale,
      mouseX: e.clientX,
      mouseY: e.clientY,
    }

    setIsScaling(true)
    setActiveHandle(handlePos)
    onScaleStart?.()
  }, [overlayInfo, onScaleStart])

  // Handle mouse move during scaling
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isScaling || !activeHandle || !scaleStartRef.current || !canvasRect || !overlayInfo) {
      return
    }

    const { scale: startScale, mouseX: startX, mouseY: startY } = scaleStartRef.current

    // Calculate delta based on handle type
    let scaleDelta: number

    if (isCornerHandle(activeHandle)) {
      // Corner handles: scale both axes together
      // Calculate scale factor based on distance from overlay center
      // Moving away from center = increase scale
      const centerX = canvasRect.left + canvasRect.width * overlayInfo.position.x
      const centerY = canvasRect.top + canvasRect.height * overlayInfo.position.y
      
      const startFromCenter = Math.sqrt(
        Math.pow(startX - centerX, 2) + Math.pow(startY - centerY, 2)
      )
      const currentFromCenter = Math.sqrt(
        Math.pow(e.clientX - centerX, 2) + Math.pow(e.clientY - centerY, 2)
      )
      
      if (startFromCenter > 0) {
        scaleDelta = (currentFromCenter - startFromCenter) / 100
      } else {
        scaleDelta = 0
      }
    } else {
      // Edge handles: scale one axis only
      // For now, use horizontal/vertical delta based on handle orientation
      if (activeHandle === 'left' || activeHandle === 'right') {
        const direction = activeHandle === 'right' ? 1 : -1
        scaleDelta = (e.clientX - startX) * direction / 100
      } else {
        const direction = activeHandle === 'bottom' ? 1 : -1
        scaleDelta = (e.clientY - startY) * direction / 100
      }
    }

    // Calculate new scale
    let newScale = startScale + scaleDelta
    
    // Clamp scale to valid range
    newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale))

    // Phase 9B: Defensive invariant - check if scaling would push overlay out of bounds
    // We validate against title-safe area
    const estimatedSize = newScale * 100 // Approximate pixel size
    const halfSizeNorm = estimatedSize / (2 * canvasRect.width)
    
    const wouldExceedBounds = 
      (overlayInfo.position.x - halfSizeNorm < 0.1) ||
      (overlayInfo.position.x + halfSizeNorm > 0.9) ||
      (overlayInfo.position.y - halfSizeNorm < 0.1) ||
      (overlayInfo.position.y + halfSizeNorm > 0.9)
    
    if (wouldExceedBounds) {
      // Trigger invariant but don't crash - just limit the scale
      assertOverlayHandleWithinBounds(
        false,
        overlayInfo.layerId,
        newScale,
        'OverlaySelectionBox'
      )
      // Limit scale to prevent going out of bounds
      return
    }

    onScaleChange?.(overlayInfo.layerId, newScale)
  }, [isScaling, activeHandle, canvasRect, overlayInfo, onScaleChange])

  // Handle mouse up to end scaling
  const handleMouseUp = useCallback(() => {
    if (isScaling) {
      setIsScaling(false)
      setActiveHandle(null)
      scaleStartRef.current = null
      onScaleEnd?.()
    }
  }, [isScaling, onScaleEnd])

  // Add/remove global event listeners for scaling
  useEffect(() => {
    if (isScaling) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isScaling, handleMouseMove, handleMouseUp])

  // Render the bounding box and handles
  // Phase 9C: In 'none' interaction mode, render box only (no handles)
  const showHandles = interaction === 'full'
  
  return (
    <div
      data-testid="overlay-selection-box"
      style={{
        position: 'absolute',
        left: boxLeft,
        top: boxTop,
        width: boxWidth,
        height: boxHeight,
        pointerEvents: 'none',
        zIndex: 100,
      }}
    >
      {/* Bounding box border */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          border: interaction === 'none' 
            ? '1px dashed rgba(59, 130, 246, 0.6)' 
            : '1px solid var(--button-primary-bg, #3b82f6)',
          borderRadius: '2px',
          pointerEvents: 'none',
        }}
      />

      {/* Render all 8 handles — only in 'full' interaction mode */}
      {showHandles && (Object.entries(handlePositions) as [HandlePosition, { x: number; y: number }][]).map(
        ([pos, coords]) => (
          <div
            key={pos}
            data-testid={`selection-handle-${pos}`}
            onMouseDown={(e) => handleMouseDown(e, pos)}
            style={{
              position: 'absolute',
              left: coords.x - boxLeft - HANDLE_SIZE / 2,
              top: coords.y - boxTop - HANDLE_SIZE / 2,
              width: HANDLE_SIZE,
              height: HANDLE_SIZE,
              backgroundColor: activeHandle === pos ? '#fff' : 'var(--button-primary-bg, #3b82f6)',
              border: '1px solid rgba(0, 0, 0, 0.5)',
              borderRadius: '2px',
              cursor: getCursorForHandle(pos),
              pointerEvents: 'auto',
              // Expand hit area with pseudo-element
              boxSizing: 'border-box',
            }}
          />
        )
      )}
    </div>
  )
}

export default OverlaySelectionBox
