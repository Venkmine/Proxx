/**
 * Feature Flags — Alpha Stability Controls
 * 
 * Phase 0: Stabilization flags to disable features that cause crashes or instability.
 * These flags allow gradual re-enablement as issues are fixed.
 */

export const FEATURE_FLAGS = {
  /**
   * Demo Mode — V1 Stability Guardrails
   * When true:
   * - Disables advanced UI elements (diagnostics panel, verbose toggles)
   * - Suppresses raw backend error banners (shows simplified errors)
   * - Forces StatusLog to simple mode (no details toggle)
   * 
   * Enable this for customer demos and presentations.
   * Default: false (development mode with full diagnostics)
   */
  DEMO_MODE: false,
  
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
  
  /**
   * Alpha Diagnostics Panel
   * When true: Shows a collapsible diagnostics panel per job with:
   * - Job ID, engine, output directory
   * - Settings snapshot (collapsed JSON)
   * - Overlay layer summary
   * - Last state transition + timestamp
   * - Last error message
   * 
   * This is a debugging tool for alpha/dev use only.
   */
  ALPHA_DIAGNOSTICS_ENABLED: true,
  
  /**
   * Explicit Drop Zone
   * REMOVED: Drag & drop completely removed from UI for honesty.
   * Use explicit "Select Files" and "Select Folder" buttons instead.
   */
  EXPLICIT_DROP_ZONE_ENABLED: false,
  
  /**
   * V2 Mode — Thin Client JobSpec Compiler
   * When true: Enables the V2 execution flow where UI compiles JobSpec,
   * sends to /v2/execute_jobspec, and displays JobExecutionResult.
   * 
   * V2 Step 3: UI is a compiler, not authority.
   * - No progress percent/ETA shown
   * - Shows only: "Encoding..." then final result
   * - No cancel during encode (not supported in sync flow)
   * 
   * This is a DEV-only toggle for testing V2 engine.
   */
  V2_MODE_ENABLED: false,
} as const

export type FeatureFlag = keyof typeof FEATURE_FLAGS
