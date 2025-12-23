/**
 * PreviewTransform Unit Tests — Phase 9A
 * 
 * Tests for the single source of truth for preview coordinate math.
 * These tests are mandatory and must pass before Phase 9A completion.
 */

import { describe, it, expect } from 'vitest'
import * as PreviewTransform from './PreviewTransform'

// ============================================================================
// TEST DATA
// ============================================================================

/** Mock DOMRect for testing */
function createMockRect(x: number, y: number, width: number, height: number): DOMRect {
  return {
    x,
    y,
    width,
    height,
    top: y,
    left: x,
    right: x + width,
    bottom: y + height,
    toJSON: () => ({ x, y, width, height, top: y, left: x, right: x + width, bottom: y + height }),
  }
}

// ============================================================================
// NORMALIZE ↔ DENORMALIZE ROUND-TRIP TESTS
// ============================================================================

describe('normalize ↔ denormalize round-trip', () => {
  const canvasSize = { width: 1920, height: 1080 }

  it('should round-trip center point correctly', () => {
    const original = { x: 960, y: 540 }
    const normalized = PreviewTransform.normalize(original, canvasSize)
    const denormalized = PreviewTransform.denormalize(normalized, canvasSize)
    
    expect(denormalized.x).toBeCloseTo(original.x, 5)
    expect(denormalized.y).toBeCloseTo(original.y, 5)
  })

  it('should round-trip origin point correctly', () => {
    const original = { x: 0, y: 0 }
    const normalized = PreviewTransform.normalize(original, canvasSize)
    const denormalized = PreviewTransform.denormalize(normalized, canvasSize)
    
    expect(denormalized.x).toBeCloseTo(original.x, 5)
    expect(denormalized.y).toBeCloseTo(original.y, 5)
  })

  it('should round-trip corner point correctly', () => {
    const original = { x: 1920, y: 1080 }
    const normalized = PreviewTransform.normalize(original, canvasSize)
    const denormalized = PreviewTransform.denormalize(normalized, canvasSize)
    
    expect(denormalized.x).toBeCloseTo(original.x, 5)
    expect(denormalized.y).toBeCloseTo(original.y, 5)
  })

  it('should round-trip arbitrary point correctly', () => {
    const original = { x: 192, y: 864 }
    const normalized = PreviewTransform.normalize(original, canvasSize)
    const denormalized = PreviewTransform.denormalize(normalized, canvasSize)
    
    expect(denormalized.x).toBeCloseTo(original.x, 5)
    expect(denormalized.y).toBeCloseTo(original.y, 5)
  })

  it('should normalize center to 0.5, 0.5', () => {
    const center = { x: 960, y: 540 }
    const normalized = PreviewTransform.normalize(center, canvasSize)
    
    expect(normalized.x).toBeCloseTo(0.5, 5)
    expect(normalized.y).toBeCloseTo(0.5, 5)
  })

  it('should normalize origin to 0, 0', () => {
    const origin = { x: 0, y: 0 }
    const normalized = PreviewTransform.normalize(origin, canvasSize)
    
    expect(normalized.x).toBe(0)
    expect(normalized.y).toBe(0)
  })

  it('should normalize corner to 1, 1', () => {
    const corner = { x: 1920, y: 1080 }
    const normalized = PreviewTransform.normalize(corner, canvasSize)
    
    expect(normalized.x).toBe(1)
    expect(normalized.y).toBe(1)
  })
})

// ============================================================================
// SCREEN ↔ CANVAS CONVERSION TESTS
// ============================================================================

describe('screen ↔ canvas conversion', () => {
  const canvasRect = createMockRect(100, 50, 800, 450)

  it('should convert screen to canvas correctly', () => {
    const screenPoint = { x: 500, y: 275 }
    const canvasPoint = PreviewTransform.screenToCanvas(screenPoint, canvasRect)
    
    expect(canvasPoint.x).toBe(400) // 500 - 100
    expect(canvasPoint.y).toBe(225) // 275 - 50
  })

  it('should convert canvas to screen correctly', () => {
    const canvasPoint = { x: 400, y: 225 }
    const screenPoint = PreviewTransform.canvasToScreen(canvasPoint, canvasRect)
    
    expect(screenPoint.x).toBe(500) // 400 + 100
    expect(screenPoint.y).toBe(275) // 225 + 50
  })

  it('should round-trip screen coordinates', () => {
    const original = { x: 600, y: 300 }
    const canvas = PreviewTransform.screenToCanvas(original, canvasRect)
    const screen = PreviewTransform.canvasToScreen(canvas, canvasRect)
    
    expect(screen.x).toBe(original.x)
    expect(screen.y).toBe(original.y)
  })

  it('should handle canvas origin (top-left corner)', () => {
    const screenPoint = { x: 100, y: 50 }
    const canvasPoint = PreviewTransform.screenToCanvas(screenPoint, canvasRect)
    
    expect(canvasPoint.x).toBe(0)
    expect(canvasPoint.y).toBe(0)
  })
})

// ============================================================================
// SCREEN TO NORMALIZED CONVENIENCE FUNCTION
// ============================================================================

describe('screenToNormalized', () => {
  const canvasRect = createMockRect(100, 50, 800, 450)

  it('should convert screen coordinates directly to normalized', () => {
    // Screen center of canvas: (100 + 400, 50 + 225) = (500, 275)
    const screenCenter = { x: 500, y: 275 }
    const normalized = PreviewTransform.screenToNormalized(screenCenter, canvasRect)
    
    expect(normalized.x).toBeCloseTo(0.5, 5)
    expect(normalized.y).toBeCloseTo(0.5, 5)
  })

  it('should match manual two-step conversion', () => {
    const screenPoint = { x: 300, y: 200 }
    
    // Two-step conversion
    const canvasPoint = PreviewTransform.screenToCanvas(screenPoint, canvasRect)
    const normalizedManual = PreviewTransform.normalize(canvasPoint, { width: 800, height: 450 })
    
    // Single-step conversion
    const normalizedDirect = PreviewTransform.screenToNormalized(screenPoint, canvasRect)
    
    expect(normalizedDirect.x).toBeCloseTo(normalizedManual.x, 10)
    expect(normalizedDirect.y).toBeCloseTo(normalizedManual.y, 10)
  })
})

// ============================================================================
// SAFE-AREA CLAMPING TESTS
// ============================================================================

describe('clampToSafeArea', () => {
  describe('title safe (10% inset)', () => {
    it('should clamp point outside left boundary', () => {
      const point = { x: 0.05, y: 0.5 }
      const clamped = PreviewTransform.clampToSafeArea(point, 'title')
      
      expect(clamped.x).toBe(0.1)
      expect(clamped.y).toBe(0.5)
    })

    it('should clamp point outside right boundary', () => {
      const point = { x: 0.95, y: 0.5 }
      const clamped = PreviewTransform.clampToSafeArea(point, 'title')
      
      expect(clamped.x).toBe(0.9)
      expect(clamped.y).toBe(0.5)
    })

    it('should clamp point outside top boundary', () => {
      const point = { x: 0.5, y: 0.05 }
      const clamped = PreviewTransform.clampToSafeArea(point, 'title')
      
      expect(clamped.x).toBe(0.5)
      expect(clamped.y).toBe(0.1)
    })

    it('should clamp point outside bottom boundary', () => {
      const point = { x: 0.5, y: 0.95 }
      const clamped = PreviewTransform.clampToSafeArea(point, 'title')
      
      expect(clamped.x).toBe(0.5)
      expect(clamped.y).toBe(0.9)
    })

    it('should not modify point inside safe area', () => {
      const point = { x: 0.5, y: 0.5 }
      const clamped = PreviewTransform.clampToSafeArea(point, 'title')
      
      expect(clamped.x).toBe(0.5)
      expect(clamped.y).toBe(0.5)
    })

    it('should clamp corner point to title-safe corner', () => {
      const point = { x: 0, y: 0 }
      const clamped = PreviewTransform.clampToSafeArea(point, 'title')
      
      expect(clamped.x).toBe(0.1)
      expect(clamped.y).toBe(0.1)
    })
  })

  describe('action safe (5% inset)', () => {
    it('should clamp with 5% inset', () => {
      const point = { x: 0.02, y: 0.98 }
      const clamped = PreviewTransform.clampToSafeArea(point, 'action')
      
      expect(clamped.x).toBe(0.05)
      expect(clamped.y).toBe(0.95)
    })

    it('should allow points inside action safe but outside title safe', () => {
      const point = { x: 0.08, y: 0.5 }
      const clamped = PreviewTransform.clampToSafeArea(point, 'action')
      
      expect(clamped.x).toBe(0.08)
      expect(clamped.y).toBe(0.5)
    })
  })

  describe('no clamping mode', () => {
    it('should not clamp when mode is none', () => {
      const point = { x: 0, y: 1 }
      const clamped = PreviewTransform.clampToSafeArea(point, 'none')
      
      expect(clamped.x).toBe(0)
      expect(clamped.y).toBe(1)
    })
  })
})

// ============================================================================
// VIEWPORT FIT MATH TESTS
// ============================================================================

describe('fitToViewport', () => {
  it('should letterbox when viewport is taller than video', () => {
    const videoSize = { width: 1920, height: 1080 }
    const viewportSize = { width: 1920, height: 1920 } // Square viewport
    
    const rect = PreviewTransform.fitToViewport(videoSize, viewportSize)
    
    // Video should fit to width, centered vertically
    expect(rect.width).toBe(1920)
    expect(rect.height).toBeCloseTo(1080, 0)
    expect(rect.x).toBe(0)
    expect(rect.y).toBeCloseTo(420, 0) // (1920 - 1080) / 2
  })

  it('should pillarbox when viewport is wider than video', () => {
    const videoSize = { width: 1920, height: 1080 }
    const viewportSize = { width: 3840, height: 1080 } // Very wide viewport
    
    const rect = PreviewTransform.fitToViewport(videoSize, viewportSize)
    
    // Video should fit to height, centered horizontally
    expect(rect.height).toBe(1080)
    expect(rect.width).toBeCloseTo(1920, 0)
    expect(rect.y).toBe(0)
    expect(rect.x).toBeCloseTo(960, 0) // (3840 - 1920) / 2
  })

  it('should fill exactly when aspect ratios match', () => {
    const videoSize = { width: 1920, height: 1080 }
    const viewportSize = { width: 960, height: 540 } // Same aspect ratio, smaller
    
    const rect = PreviewTransform.fitToViewport(videoSize, viewportSize)
    
    expect(rect.width).toBe(960)
    expect(rect.height).toBe(540)
    expect(rect.x).toBe(0)
    expect(rect.y).toBe(0)
  })

  it('should handle 4:3 video in 16:9 viewport', () => {
    const videoSize = { width: 1440, height: 1080 } // 4:3
    const viewportSize = { width: 1920, height: 1080 } // 16:9
    
    const rect = PreviewTransform.fitToViewport(videoSize, viewportSize)
    
    // Video should fit to height with pillarboxing
    expect(rect.height).toBe(1080)
    expect(rect.width).toBeCloseTo(1440, 0)
    expect(rect.x).toBeCloseTo(240, 0) // (1920 - 1440) / 2
  })
})

// ============================================================================
// ANCHOR POSITION TESTS
// ============================================================================

describe('getAnchorPosition', () => {
  it('should return correct position for all presets', () => {
    expect(PreviewTransform.getAnchorPosition('top_left')).toEqual({ x: 0.1, y: 0.1 })
    expect(PreviewTransform.getAnchorPosition('top_center')).toEqual({ x: 0.5, y: 0.1 })
    expect(PreviewTransform.getAnchorPosition('top_right')).toEqual({ x: 0.9, y: 0.1 })
    expect(PreviewTransform.getAnchorPosition('center_left')).toEqual({ x: 0.1, y: 0.5 })
    expect(PreviewTransform.getAnchorPosition('center')).toEqual({ x: 0.5, y: 0.5 })
    expect(PreviewTransform.getAnchorPosition('center_right')).toEqual({ x: 0.9, y: 0.5 })
    expect(PreviewTransform.getAnchorPosition('bottom_left')).toEqual({ x: 0.1, y: 0.9 })
    expect(PreviewTransform.getAnchorPosition('bottom_center')).toEqual({ x: 0.5, y: 0.9 })
    expect(PreviewTransform.getAnchorPosition('bottom_right')).toEqual({ x: 0.9, y: 0.9 })
  })

  it('should return center for unknown anchor', () => {
    expect(PreviewTransform.getAnchorPosition('unknown')).toEqual({ x: 0.5, y: 0.5 })
    expect(PreviewTransform.getAnchorPosition('')).toEqual({ x: 0.5, y: 0.5 })
  })

  it('should return center for custom anchor', () => {
    expect(PreviewTransform.getAnchorPosition('custom')).toEqual({ x: 0.5, y: 0.5 })
  })
})

// ============================================================================
// RESOLVE OVERLAY POSITION TESTS
// ============================================================================

describe('resolveOverlayPosition', () => {
  it('should use custom coordinates when position is custom and coords provided', () => {
    const pos = PreviewTransform.resolveOverlayPosition('custom', 0.25, 0.75)
    
    expect(pos.x).toBe(0.25)
    expect(pos.y).toBe(0.75)
  })

  it('should fall back to anchor when position is custom but coords missing', () => {
    const pos = PreviewTransform.resolveOverlayPosition('custom', undefined, undefined)
    
    expect(pos.x).toBe(0.5)
    expect(pos.y).toBe(0.5)
  })

  it('should use anchor position when not custom', () => {
    const pos = PreviewTransform.resolveOverlayPosition('top_right', 0.1, 0.1)
    
    expect(pos.x).toBe(0.9)
    expect(pos.y).toBe(0.1)
  })

  it('should handle partial custom coords by falling back to anchor', () => {
    const pos = PreviewTransform.resolveOverlayPosition('custom', 0.3, undefined)
    
    // Should fall back because y is undefined
    expect(pos.x).toBe(0.5)
    expect(pos.y).toBe(0.5)
  })
})

// ============================================================================
// CSS STYLE HELPERS
// ============================================================================

describe('toPercentageStyle', () => {
  it('should convert normalized coords to CSS percentages', () => {
    const style = PreviewTransform.toPercentageStyle({ x: 0.5, y: 0.75 })
    
    expect(style.left).toBe('50%')
    expect(style.top).toBe('75%')
  })

  it('should handle edge cases', () => {
    expect(PreviewTransform.toPercentageStyle({ x: 0, y: 0 })).toEqual({ left: '0%', top: '0%' })
    expect(PreviewTransform.toPercentageStyle({ x: 1, y: 1 })).toEqual({ left: '100%', top: '100%' })
  })
})

// ============================================================================
// VALIDATION TESTS
// ============================================================================

describe('isValidNormalizedPoint', () => {
  it('should return true for valid points', () => {
    expect(PreviewTransform.isValidNormalizedPoint({ x: 0, y: 0 })).toBe(true)
    expect(PreviewTransform.isValidNormalizedPoint({ x: 1, y: 1 })).toBe(true)
    expect(PreviewTransform.isValidNormalizedPoint({ x: 0.5, y: 0.5 })).toBe(true)
  })

  it('should return false for out-of-range points', () => {
    expect(PreviewTransform.isValidNormalizedPoint({ x: -0.1, y: 0.5 })).toBe(false)
    expect(PreviewTransform.isValidNormalizedPoint({ x: 0.5, y: 1.1 })).toBe(false)
    expect(PreviewTransform.isValidNormalizedPoint({ x: 2, y: 0 })).toBe(false)
  })

  it('should return false for NaN values', () => {
    expect(PreviewTransform.isValidNormalizedPoint({ x: NaN, y: 0.5 })).toBe(false)
    expect(PreviewTransform.isValidNormalizedPoint({ x: 0.5, y: NaN })).toBe(false)
  })
})

describe('isWithinSafeArea', () => {
  it('should return true for point inside title safe', () => {
    expect(PreviewTransform.isWithinSafeArea({ x: 0.5, y: 0.5 }, 'title')).toBe(true)
    expect(PreviewTransform.isWithinSafeArea({ x: 0.1, y: 0.1 }, 'title')).toBe(true)
    expect(PreviewTransform.isWithinSafeArea({ x: 0.9, y: 0.9 }, 'title')).toBe(true)
  })

  it('should return false for point outside title safe', () => {
    expect(PreviewTransform.isWithinSafeArea({ x: 0.05, y: 0.5 }, 'title')).toBe(false)
    expect(PreviewTransform.isWithinSafeArea({ x: 0.5, y: 0.95 }, 'title')).toBe(false)
  })

  it('should work with action safe mode', () => {
    // Point at 0.08 is outside title safe but inside action safe
    expect(PreviewTransform.isWithinSafeArea({ x: 0.08, y: 0.5 }, 'title')).toBe(false)
    expect(PreviewTransform.isWithinSafeArea({ x: 0.08, y: 0.5 }, 'action')).toBe(true)
  })
})

// ============================================================================
// CONSTANTS TESTS
// ============================================================================

describe('constants', () => {
  it('should export correct safe area insets', () => {
    expect(PreviewTransform.TITLE_SAFE_INSET).toBe(0.1)
    expect(PreviewTransform.ACTION_SAFE_INSET).toBe(0.05)
  })

  it('should export correct aspect ratio', () => {
    expect(PreviewTransform.VIDEO_ASPECT_RATIO).toBeCloseTo(16 / 9, 5)
  })

  it('should export anchor positions object', () => {
    expect(PreviewTransform.ANCHOR_POSITIONS).toBeDefined()
    expect(Object.keys(PreviewTransform.ANCHOR_POSITIONS).length).toBe(10)
  })
})
