/**
 * PreviewIntent — Explicit Preview Proxy Generation State Machine
 * 
 * ============================================================================
 * DESIGN PHILOSOPHY
 * ============================================================================
 * PreviewIntent is a per-source state that tracks Preview Proxy generation ONLY.
 * It is completely decoupled from delivery job creation.
 * 
 * KEY PRINCIPLES:
 * 1. Preview Proxy generation is EXPLICIT — user must request it
 * 2. Preview Proxy generation is NON-QUEUED — runs immediately, not as a job
 * 3. Preview Proxy generation is NON-BLOCKING — never blocks delivery job creation
 * 4. Preview Proxy state is PER-SOURCE, not per-job
 * 
 * RULES:
 * - Clicking "Generate Preview Proxy" affects PreviewIntent ONLY
 * - It does NOT create a Delivery Job
 * - It does NOT appear in Queue
 * - It does NOT affect AppMode
 * 
 * Preview Proxy uses:
 * - FFmpeg for playable sources
 * - Resolve for RAW sources
 * - Short duration (default 5s unless user chooses otherwise)
 * ============================================================================
 */

/**
 * PreviewIntent — Per-source Preview Proxy generation state.
 * 
 * States:
 * - none: No Preview Proxy requested, show neutral placeholder
 * - requested: User clicked "Generate Preview Proxy", waiting to start
 * - generating: Preview Proxy is being generated (FFmpeg or Resolve)
 * - available: Preview Proxy is ready for playback
 * - failed: Preview Proxy generation failed (non-blocking warning, delivery still possible)
 */
export type PreviewIntent =
  | 'none'
  | 'requested'
  | 'generating'
  | 'available'
  | 'failed'

/**
 * Preview Proxy generation error info.
 * Non-fatal — does not block delivery job creation.
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
 * Preview Proxy generation result info.
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
 * Note: Failed preview does NOT block delivery job creation.
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
      return 'Starting Preview Proxy generation…'
    case 'generating':
      return 'Generating Preview Proxy…'
    case 'available':
      return 'Preview Proxy ready'
    case 'failed':
      return 'Preview unavailable (delivery still possible)'
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
