/**
 * PreviewIntent — Explicit Preview Generation State Machine
 * 
 * ============================================================================
 * DESIGN PHILOSOPHY
 * ============================================================================
 * PreviewIntent is a per-source state that tracks preview generation ONLY.
 * It is completely decoupled from proxy job creation.
 * 
 * KEY PRINCIPLES:
 * 1. Preview generation is EXPLICIT — user must request it
 * 2. Preview generation is NON-QUEUED — runs immediately, not as a job
 * 3. Preview generation is NON-BLOCKING — never blocks proxy job creation
 * 4. Preview state is PER-SOURCE, not per-job
 * 
 * RULES:
 * - Clicking "Generate Preview" affects PreviewIntent ONLY
 * - It does NOT create a Job
 * - It does NOT appear in Queue
 * - It does NOT affect AppMode
 * 
 * Preview uses:
 * - FFmpeg for playable sources
 * - Resolve for RAW sources
 * - Short duration (default 5s unless user chooses otherwise)
 * ============================================================================
 */

/**
 * PreviewIntent — Per-source preview generation state.
 * 
 * States:
 * - none: No preview requested, show neutral placeholder
 * - requested: User clicked "Generate Preview", waiting to start
 * - generating: Preview proxy is being generated (FFmpeg or Resolve)
 * - available: Preview proxy is ready for playback
 * - failed: Preview generation failed (non-blocking warning)
 */
export type PreviewIntent =
  | 'none'
  | 'requested'
  | 'generating'
  | 'available'
  | 'failed'

/**
 * Preview generation error info.
 * Non-fatal — does not block proxy job creation.
 */
export interface PreviewError {
  /** Human-readable error message */
  message: string
  /** Technical detail for debugging */
  detail?: string
  /** Timestamp of failure */
  timestamp: Date
}

/**
 * Preview generation result info.
 */
export interface PreviewInfo {
  /** HTTP URL to stream the preview proxy */
  previewUrl: string
  /** Duration in seconds */
  duration: number | null
  /** Resolution string (e.g., "1280x720") */
  resolution: string | null
  /** Codec used (typically "h264") */
  codec: string
  /** Whether preview was cached */
  cached: boolean
  /** Generation timestamp */
  generatedAt: Date
}

/**
 * Complete preview state for a source.
 */
export interface SourcePreviewState {
  /** Source file path (key) */
  sourcePath: string
  /** Current preview intent state */
  intent: PreviewIntent
  /** Preview info (only valid when intent === 'available') */
  preview: PreviewInfo | null
  /** Error info (only valid when intent === 'failed') */
  error: PreviewError | null
  /** Duration requested by user (default 5s) */
  requestedDuration: number
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if preview is in a loading state.
 */
export function isPreviewLoading(intent: PreviewIntent): boolean {
  return intent === 'requested' || intent === 'generating'
}

/**
 * Check if preview is ready for playback.
 */
export function isPreviewAvailable(intent: PreviewIntent): boolean {
  return intent === 'available'
}

/**
 * Check if preview generation failed.
 * Note: Failed preview does NOT block proxy job creation.
 */
export function isPreviewFailed(intent: PreviewIntent): boolean {
  return intent === 'failed'
}

/**
 * Check if playback should be disabled based on preview state.
 * Playback is disabled unless preview is available OR source is natively playable.
 */
export function isPlaybackDisabled(
  intent: PreviewIntent,
  isNativelyPlayable: boolean
): boolean {
  // Native playback doesn't require preview
  if (isNativelyPlayable) return false
  // Preview available = playback enabled
  if (intent === 'available') return false
  // All other states = playback disabled
  return true
}

/**
 * Get display message for preview state.
 */
export function getPreviewStatusMessage(intent: PreviewIntent): string {
  switch (intent) {
    case 'none':
      return ''
    case 'requested':
      return 'Starting preview generation…'
    case 'generating':
      return 'Generating preview…'
    case 'available':
      return 'Preview ready'
    case 'failed':
      return 'Preview unavailable'
  }
}

/**
 * Create initial preview state for a source.
 */
export function createInitialPreviewState(sourcePath: string): SourcePreviewState {
  return {
    sourcePath,
    intent: 'none',
    preview: null,
    error: null,
    requestedDuration: 5, // Default 5 seconds
  }
}
