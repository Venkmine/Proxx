/**
 * Feature Flags — Alpha Stability Controls
 * 
 * Phase 0: Stabilization flags to disable features that cause crashes or instability.
 * These flags allow gradual re-enablement as issues are fixed.
 */

export const FEATURE_FLAGS = {
  /**
   * Global Drag & Drop
   * When false: Disables document-level drag/drop listeners to prevent whitescreen crashes.
   * Re-enable only after thorough testing of drag/drop handling.
   */
  GLOBAL_DRAG_DROP_ENABLED: false,
  
  /**
   * Output Settings Summary Bar (Preview Panel)
   * When false: Hides the output settings strip below the preview panel.
   * Re-enable when the summary bar is properly implemented.
   */
  OUTPUT_SETTINGS_STRIP_ENABLED: false,
} as const

export type FeatureFlag = keyof typeof FEATURE_FLAGS
