/**
 * Burn-In Preview Constants — Phase 9C Font Parity
 * 
 * ============================================================================
 * IMPORTANT: FFMPEG FONT PARITY DISCLAIMER
 * ============================================================================
 * 
 * FFmpeg's `drawtext` filter uses PLATFORM-DEPENDENT default fonts:
 * - macOS: Typically uses system fonts via libfreetype (no universal default)
 * - Linux: DejaVu Sans, Liberation Sans, or system fallbacks
 * - Windows: Arial or system font fallbacks
 * 
 * There is NO single "FFmpeg font" — behavior varies by system configuration.
 * 
 * These constants define PREVIEW fonts that are:
 * ✅ FFmpeg-REPRESENTATIVE (similar visual characteristics)
 * ✅ Stable across zoom/scale operations (no reflow)
 * ✅ Consistent within the preview (deterministic rendering)
 * 
 * ❌ NOT pixel-identical to FFmpeg output
 * ❌ NOT guaranteed to match FFmpeg on all platforms
 * 
 * The goal is LAYOUT + METRICS STABILITY, not pixel perfection.
 * 
 * ============================================================================
 * ALPHA CONSTRAINTS (Phase 9C)
 * ============================================================================
 * 
 * 1. Preview uses percentage-based safe areas (10% title, 5% action)
 *    FFmpeg uses pixel offsets (e.g., x=10:y=10)
 *    These are NOT reconciled — document as known discrepancy.
 * 
 * 2. Font metrics may differ between preview and output due to:
 *    - Different font rendering engines (CSS vs libfreetype)
 *    - Platform-specific font hinting
 *    - Anti-aliasing differences
 * 
 * 3. Manual visual comparison is required for parity validation.
 *    See BURNIN_PARITY_CHECKLIST below for acceptance criteria.
 */

// ============================================================================
// BURN-IN FONT CONSTANTS
// ============================================================================

/**
 * Font configuration for burn-in overlays.
 * 
 * These fonts are chosen to be:
 * - Cross-platform available (installed by default on macOS, Windows, Linux)
 * - Monospace for timecode/metadata (stable character widths)
 * - Sans-serif for general text (clean, readable at small sizes)
 */
export const BURNIN_FONTS = {
  /**
   * Timecode font: Monospace for stable metrics
   * FFmpeg equivalent: No fontfile specified = system monospace
   * 
   * WHY: Timecode requires fixed-width characters so the overlay
   * doesn't shift when digits change during playback.
   */
  timecode: 'Menlo, Monaco, "Courier New", monospace',
  
  /**
   * Metadata font: Monospace for technical data
   * Used for: reel names, frame numbers, codec info
   */
  metadata: 'Menlo, Monaco, "Courier New", monospace',
  
  /**
   * Text overlay font: Sans-serif for readability
   * User-selectable in UI, this is the default.
   */
  text: 'Arial, Helvetica, sans-serif',
  
  /**
   * Generic fallback for unknown overlay types
   */
  fallback: 'sans-serif',
} as const

/**
 * Font size scaling factor for preview.
 * 
 * Preview canvas is typically 50% of output resolution,
 * so font sizes are scaled down proportionally.
 * 
 * This factor should match the preview canvas sizing logic.
 */
export const BURNIN_PREVIEW_FONT_SCALE = 0.5

/**
 * Line height multiplier for stable text rendering.
 * Ensures consistent vertical spacing that doesn't reflow on scale.
 */
export const BURNIN_LINE_HEIGHT = 1.2

/**
 * Letter spacing for timecode (matches FFmpeg drawtext behavior)
 */
export const BURNIN_TIMECODE_LETTER_SPACING = '0.05em'

// ============================================================================
// PARITY VALIDATION CONSTANTS
// ============================================================================

/**
 * Expected preview font for invariant checking.
 * Used by assertBurninFontParity to validate consistency.
 */
export const EXPECTED_TIMECODE_FONT = BURNIN_FONTS.timecode
export const EXPECTED_METADATA_FONT = BURNIN_FONTS.metadata
export const EXPECTED_TEXT_FONT = BURNIN_FONTS.text

// ============================================================================
// MANUAL ACCEPTANCE CHECKLIST
// ============================================================================

/**
 * BURNIN_PARITY_CHECKLIST
 * 
 * This checklist defines what "visual equivalence" means for burn-in parity.
 * Use this for manual acceptance testing.
 * 
 * MUST PASS (hard requirements):
 * ✅ Relative position matches (same corner/anchor)
 * ✅ Anchor alignment is correct (e.g., top-left actually in top-left)
 * ✅ No font jumps during zoom/scale operations
 * ✅ No text clipping at safe area boundaries
 * ✅ No scaling drift (overlay size stable across renders)
 * ✅ Timecode characters don't reflow when digits change
 * 
 * ALLOWED DIFFERENCES (alpha tolerances):
 * ⚠️ Kerning may differ slightly
 * ⚠️ Font weight may appear different (hinting differences)
 * ⚠️ Exact pixel position may differ (percentage vs pixel offsets)
 * ⚠️ Anti-aliasing appearance may differ
 * ⚠️ Background box padding may vary
 * 
 * NOT REQUIRED:
 * ❌ Pixel-perfect match
 * ❌ Identical font rendering
 * ❌ Exact same background opacity rendering
 * 
 * VALIDATION PROCEDURE:
 * 1. Create a test job with burn-in overlays enabled
 * 2. Screenshot the preview at 100% zoom
 * 3. Render the job to output
 * 4. Extract a frame from output at same timecode
 * 5. Compare visually against checklist above
 */
export const BURNIN_PARITY_CHECKLIST = {
  version: '9C',
  hardRequirements: [
    'Relative position matches (same corner/anchor)',
    'Anchor alignment is correct',
    'No font jumps during zoom/scale',
    'No text clipping at boundaries',
    'No scaling drift across renders',
    'Timecode characters stable on digit change',
  ],
  allowedDifferences: [
    'Kerning variations',
    'Font weight appearance',
    'Exact pixel position (percentage vs pixel)',
    'Anti-aliasing rendering',
    'Background box padding',
  ],
  notRequired: [
    'Pixel-perfect match',
    'Identical font rendering',
    'Exact background opacity',
  ],
} as const

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type BurninFontType = keyof typeof BURNIN_FONTS
