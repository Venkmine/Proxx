/**
 * PreviewViewport16x9 — Unified Preview Component for Burn-ins and Watermarks
 * 
 * Enforces:
 * - aspect-ratio: 16/9
 * - max-width constraint (default 960px)
 * - height derived from width (no vertical stretching)
 * - Responsive width: 100%
 * 
 * Renders:
 * - Title-safe and action-safe guides (optional toggle)
 * - Image overlay layer (watermark)
 * - Text overlays layer (burn-in text)
 * - Timecode burn-in overlay layer
 * 
 * Used in:
 * - Configure mode watermarks section (embedded preview)
 * - Design mode BurnInsEditor (full takeover preview)
 */

import React, { forwardRef } from 'react'
import type { TextOverlay, ImageOverlay } from './DeliverControlPanel'

// ============================================================================
// TYPES
// ============================================================================

export interface TimecodeOverlay {
  enabled: boolean
  position: string  // Same anchor system as TextOverlay
  font?: string
  font_size: number
  opacity: number
  background: boolean  // Show background box
  x?: number
  y?: number
  // Resolve-style features
  color?: string
  background_color?: string
  background_opacity?: number
  display_first_frames?: number
  display_last_frames?: number
  timecode_source?: string
}

interface PreviewViewport16x9Props {
  /** Maximum width of the preview (default: 960px) */
  maxWidth?: number
  /** Minimum height to prevent thin strip (default: 200px) */
  minHeight?: number
  /** Show title-safe and action-safe guides */
  showGuides?: boolean
  /** Text overlay layers */
  textLayers?: TextOverlay[]
  /** Image watermark overlay */
  imageOverlay?: ImageOverlay
  /** Timecode burn-in overlay */
  timecodeOverlay?: TimecodeOverlay
  /** Currently selected layer index (for highlighting) */
  selectedLayerIndex?: number | null
  /** Active tab for image selection highlighting */
  activeTab?: 'text' | 'image' | 'timecode'
  /** Click handler for canvas (for positioning) */
  onClick?: (e: React.MouseEvent) => void
  /** Layer click handler */
  onLayerClick?: (type: 'text' | 'image' | 'timecode', index?: number) => void
  /** Disabled state */
  disabled?: boolean
  /** Show grid lines */
  showGrid?: boolean
  /** Background color */
  backgroundColor?: string
}

// ============================================================================
// HELPER: Get anchor position in normalized coordinates
// ============================================================================

function getAnchorPosition(anchor: string): { x: number; y: number } {
  const positions: Record<string, { x: number; y: number }> = {
    'top_left': { x: 0.1, y: 0.1 },
    'top_center': { x: 0.5, y: 0.1 },
    'top_right': { x: 0.9, y: 0.1 },
    'center_left': { x: 0.1, y: 0.5 },
    'center': { x: 0.5, y: 0.5 },
    'center_right': { x: 0.9, y: 0.5 },
    'bottom_left': { x: 0.1, y: 0.9 },
    'bottom_center': { x: 0.5, y: 0.9 },
    'bottom_right': { x: 0.9, y: 0.9 },
  }
  return positions[anchor] || { x: 0.5, y: 0.5 }
}

// ============================================================================
// COMPONENT
// ============================================================================

export const PreviewViewport16x9 = forwardRef<HTMLDivElement, PreviewViewport16x9Props>(
  function PreviewViewport16x9(
    {
      maxWidth = 960,
      minHeight = 200,
      showGuides = true,
      textLayers = [],
      imageOverlay,
      timecodeOverlay,
      selectedLayerIndex,
      activeTab,
      onClick,
      onLayerClick,
      disabled = false,
      showGrid = true,
      backgroundColor = '#1a1a2e',
    },
    ref
  ) {
    const extendedImageOverlay = imageOverlay as (ImageOverlay & { scale?: number; grayscale?: boolean }) | undefined

    return (
      <div
        data-testid="preview-viewport-wrapper"
        style={{
          width: '100%',
          maxWidth: `${maxWidth}px`,
          minHeight: `${minHeight}px`,
          flexShrink: 0,
        }}
      >
        <div
          ref={ref}
          data-testid="preview-viewport-16x9"
          onClick={onClick}
          style={{
            width: '100%',
            aspectRatio: '16 / 9',
            backgroundColor,
            border: '2px solid var(--border-primary)',
            borderRadius: 'var(--radius-sm)',
            position: 'relative',
            overflow: 'hidden',
            cursor: disabled ? 'default' : 'crosshair',
          }}
        >
          {/* Grid lines */}
          {showGrid && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundImage:
                  'linear-gradient(to right, rgba(59, 130, 246, 0.1) 1px, transparent 1px), linear-gradient(to bottom, rgba(59, 130, 246, 0.1) 1px, transparent 1px)',
                backgroundSize: '10% 10%',
                pointerEvents: 'none',
              }}
            />
          )}

          {/* Title Safe (10%) */}
          {showGuides && (
            <>
              <div
                style={{
                  position: 'absolute',
                  top: '10%',
                  left: '10%',
                  right: '10%',
                  bottom: '10%',
                  border: '1px dashed rgba(251, 191, 36, 0.5)',
                  pointerEvents: 'none',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: '10%',
                  left: '10%',
                  fontSize: '0.5rem',
                  color: 'rgba(251, 191, 36, 0.7)',
                  fontFamily: 'var(--font-mono)',
                  transform: 'translateY(-100%)',
                  padding: '0 0.25rem',
                  pointerEvents: 'none',
                }}
              >
                TITLE SAFE
              </div>
            </>
          )}

          {/* Action Safe (5%) */}
          {showGuides && (
            <div
              style={{
                position: 'absolute',
                top: '5%',
                left: '5%',
                right: '5%',
                bottom: '5%',
                border: '1px dashed rgba(59, 130, 246, 0.4)',
                pointerEvents: 'none',
              }}
            />
          )}

          {/* Center crosshair */}
          {showGuides && (
            <>
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '45%',
                  bottom: '45%',
                  width: '1px',
                  backgroundColor: 'rgba(255, 255, 255, 0.2)',
                  pointerEvents: 'none',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '45%',
                  right: '45%',
                  height: '1px',
                  backgroundColor: 'rgba(255, 255, 255, 0.2)',
                  pointerEvents: 'none',
                }}
              />
            </>
          )}

          {/* Render text layers */}
          {textLayers.map((layer, index) => {
            if (!layer.enabled) return null
            const pos = getAnchorPosition(layer.position)
            return (
              <div
                key={index}
                data-testid={`preview-text-layer-${index}`}
                onClick={(e) => {
                  e.stopPropagation()
                  onLayerClick?.('text', index)
                }}
                style={{
                  position: 'absolute',
                  left: `calc(${pos.x * 100}% + ${layer.x || 0}px)`,
                  top: `calc(${pos.y * 100}% + ${layer.y || 0}px)`,
                  transform: 'translate(-50%, -50%)',
                  padding: '0.25rem 0.5rem',
                  backgroundColor: (layer as any).background ? 'rgba(0, 0, 0, 0.6)' : 'transparent',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: `${layer.font_size * 0.4}px`,
                  fontFamily: (layer as any).font || 'Arial',
                  color: 'white',
                  opacity: layer.opacity,
                  cursor: 'pointer',
                  border: selectedLayerIndex === index && activeTab === 'text' 
                    ? '2px solid var(--button-primary-bg)' 
                    : '2px solid transparent',
                  whiteSpace: 'nowrap',
                  textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                  pointerEvents: 'auto',
                }}
              >
                {layer.text || `Text ${index + 1}`}
              </div>
            )
          })}

          {/* Render image overlay (watermark) */}
          {imageOverlay?.enabled && imageOverlay.image_data && (
            <div
              data-testid="preview-image-overlay"
              onClick={(e) => {
                e.stopPropagation()
                onLayerClick?.('image')
              }}
              style={{
                position: 'absolute',
                left: `${imageOverlay.x * 100}%`,
                top: `${imageOverlay.y * 100}%`,
                transform: 'translate(-50%, -50%)',
                cursor: 'pointer',
                border: activeTab === 'image' 
                  ? '2px solid var(--button-primary-bg)' 
                  : '2px solid transparent',
                borderRadius: 'var(--radius-sm)',
                padding: '2px',
                pointerEvents: 'auto',
              }}
            >
              <img
                src={imageOverlay.image_data}
                alt=""
                style={{
                  maxWidth: `${(extendedImageOverlay?.scale || 1.0) * 80}px`,
                  maxHeight: `${(extendedImageOverlay?.scale || 1.0) * 60}px`,
                  opacity: imageOverlay.opacity,
                  filter: extendedImageOverlay?.grayscale ? 'grayscale(100%)' : 'none',
                  borderRadius: '2px',
                  pointerEvents: 'none',
                }}
              />
            </div>
          )}

          {/* Render timecode overlay */}
          {timecodeOverlay?.enabled && (
            <div
              data-testid="preview-timecode-overlay"
              onClick={(e) => {
                e.stopPropagation()
                onLayerClick?.('timecode')
              }}
              style={{
                position: 'absolute',
                left: `calc(${getAnchorPosition(timecodeOverlay.position).x * 100}% + ${timecodeOverlay.x || 0}px)`,
                top: `calc(${getAnchorPosition(timecodeOverlay.position).y * 100}% + ${timecodeOverlay.y || 0}px)`,
                transform: 'translate(-50%, -50%)',
                padding: timecodeOverlay.background ? '0.25rem 0.5rem' : '0',
                backgroundColor: timecodeOverlay.background ? 'rgba(0, 0, 0, 0.7)' : 'transparent',
                borderRadius: 'var(--radius-sm)',
                fontSize: `${timecodeOverlay.font_size * 0.4}px`,
                fontFamily: timecodeOverlay.font || 'Menlo, monospace',
                color: 'white',
                opacity: timecodeOverlay.opacity,
                cursor: 'pointer',
                border: activeTab === 'timecode' 
                  ? '2px solid var(--button-primary-bg)' 
                  : '2px solid transparent',
                whiteSpace: 'nowrap',
                textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                letterSpacing: '0.05em',
                pointerEvents: 'auto',
              }}
            >
              00:00:00:00
            </div>
          )}

          {/* Empty state */}
          {textLayers.filter(l => l.enabled).length === 0 && 
           !imageOverlay?.enabled && 
           !timecodeOverlay?.enabled && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-dim)',
                fontSize: '0.875rem',
                pointerEvents: 'none',
              }}
            >
              Add overlays to preview
            </div>
          )}
        </div>
      </div>
    )
  }
)

export default PreviewViewport16x9
