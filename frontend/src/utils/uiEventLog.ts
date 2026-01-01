/**
 * UI Event Sourcing for Debug Panel
 * 
 * RATIONALE:
 * Forge is a deterministic proxy engine, not a media browser.
 * Event logging tracks deterministic state transitions only.
 * 
 * This module:
 * - Stores last 200 UI events in memory (ring buffer)
 * - Records source selection and job events with timestamps
 * - Does NOT persist to disk (debug only, session-scoped)
 * 
 * Events captured (deterministic transitions only):
 * - UI_SOURCE_ADDED: Source path added via OS dialog or drag-drop
 * - UI_SOURCE_REMOVED: Source path removed
 * - UI_PREFLIGHT_STARTED: Preflight validation started
 * - UI_PREFLIGHT_SUCCESS: Preflight completed successfully
 * - UI_PREFLIGHT_FAILED: Preflight failed with error
 * - UI_JOB_CREATED: Job created via API
 * - UI_JOB_STARTED: Job execution started
 * - UI_JOB_COMPLETED: Job finished
 * - UI_JOB_FAILED: Job failed
 * - UI_ERROR: General error
 * 
 * REMOVED (speculative):
 * - UI_PREVIEW_REQUESTED: No preview before preflight
 * - UI_PREVIEW_LOADED: No thumbnail/preview support
 * - UI_PREVIEW_ZOOM: No zoom functionality
 * - UI_BROWSE_*: Replaced with UI_SOURCE_* (OS-native)
 * 
 * Access via hidden debug panel (Cmd+Alt+D in DEV mode)
 */

export type UIEventType =
  | 'UI_SOURCE_ADDED'
  | 'UI_SOURCE_REMOVED'
  | 'UI_SOURCE_CLEARED'
  | 'UI_PREFLIGHT_STARTED'
  | 'UI_PREFLIGHT_SUCCESS'
  | 'UI_PREFLIGHT_FAILED'
  | 'UI_JOB_CREATED'
  | 'UI_JOB_STARTED'
  | 'UI_JOB_COMPLETED'
  | 'UI_JOB_FAILED'
  | 'UI_ERROR'
  // Legacy types kept for backward compatibility (deprecated)
  | 'UI_BROWSE_CLICKED'
  | 'UI_BROWSE_REQUEST_START'
  | 'UI_BROWSE_RESPONSE'
  | 'UI_BROWSE_SUCCESS'
  | 'UI_BROWSE_ERROR'

export interface UIEvent {
  id: number
  type: UIEventType
  timestamp: string  // ISO format
  message: string
  data?: Record<string, unknown>
}

// Maximum events to keep in memory (ring buffer)
const MAX_EVENTS = 200

// Event storage (in-memory, session-scoped)
let events: UIEvent[] = []
let eventIdCounter = 0

/**
 * Record a UI event.
 * 
 * @param type - Event type
 * @param message - Human-readable message
 * @param data - Optional structured data
 */
export function recordUIEvent(
  type: UIEventType,
  message: string,
  data?: Record<string, unknown>
): void {
  const event: UIEvent = {
    id: ++eventIdCounter,
    type,
    timestamp: new Date().toISOString(),
    message,
    data,
  }
  
  events.push(event)
  
  // Ring buffer: trim to max size
  if (events.length > MAX_EVENTS) {
    events = events.slice(-MAX_EVENTS)
  }
  
  // Also log to console in development
  if (import.meta.env.DEV) {
    console.debug(`[UI_EVENT] ${type}: ${message}`, data || '')
  }
}

/**
 * Get all recorded UI events.
 * 
 * @param limit - Optional limit on number of events to return
 * @returns Events, most recent first
 */
export function getUIEvents(limit?: number): UIEvent[] {
  const result = [...events].reverse()
  return limit ? result.slice(0, limit) : result
}

/**
 * Clear all recorded events.
 */
export function clearUIEvents(): void {
  events = []
  eventIdCounter = 0
}

/**
 * Get event count.
 */
export function getUIEventCount(): number {
  return events.length
}

// ============================================================================
// Convenience functions for common events
// ============================================================================

/**
 * Record browse clicked event.
 */
export function recordBrowseClicked(path: string): void {
  recordUIEvent('UI_BROWSE_CLICKED', `Browse clicked: ${path}`, { path })
}

/**
 * Record browse request start event.
 */
export function recordBrowseRequestStart(path: string): void {
  recordUIEvent('UI_BROWSE_REQUEST_START', `Browse request started: ${path}`, { path })
}

/**
 * Record browse success event.
 */
export function recordBrowseSuccess(path: string, entryCount: number): void {
  recordUIEvent('UI_BROWSE_SUCCESS', `Browse succeeded: ${path} (${entryCount} entries)`, {
    path,
    entryCount,
  })
}

/**
 * Record browse error event.
 */
export function recordBrowseError(path: string, error: string): void {
  recordUIEvent('UI_BROWSE_ERROR', `Browse failed: ${path} - ${error}`, {
    path,
    error,
  })
}

/**
 * Record browse response event (legacy, calls success/error internally).
 * @deprecated Use recordSourceAdded instead
 */
export function recordBrowseResponse(
  path: string,
  success: boolean,
  entryCount?: number,
  error?: string
): void {
  if (success) {
    recordUIEvent('UI_BROWSE_RESPONSE', `Browse succeeded: ${path} (${entryCount} entries)`, {
      path,
      success: true,
      entryCount,
    })
  } else {
    recordUIEvent('UI_BROWSE_RESPONSE', `Browse failed: ${path} - ${error}`, {
      path,
      success: false,
      error,
    })
  }
}

// ============================================================================
// Source Selection Events (New deterministic model)
// ============================================================================

/**
 * Record source path(s) added via OS dialog or drag-drop.
 */
export function recordSourceAdded(paths: string[]): void {
  recordUIEvent('UI_SOURCE_ADDED', `Added ${paths.length} source path(s)`, { paths })
}

/**
 * Record source path removed.
 */
export function recordSourceRemoved(path: string): void {
  recordUIEvent('UI_SOURCE_REMOVED', `Removed source: ${path}`, { path })
}

/**
 * Record all sources cleared.
 */
export function recordSourceCleared(): void {
  recordUIEvent('UI_SOURCE_CLEARED', 'All sources cleared', {})
}

/**
 * Record preflight started.
 */
export function recordPreflightStarted(pathCount: number): void {
  recordUIEvent('UI_PREFLIGHT_STARTED', `Preflight started for ${pathCount} path(s)`, { pathCount })
}

/**
 * Record preflight success.
 */
export function recordPreflightSuccess(validFiles: number, totalFiles: number): void {
  recordUIEvent('UI_PREFLIGHT_SUCCESS', `Preflight passed: ${validFiles}/${totalFiles} files valid`, {
    validFiles,
    totalFiles,
  })
}

/**
 * Record preflight failed.
 */
export function recordPreflightFailed(error: string, invalidPaths?: string[]): void {
  recordUIEvent('UI_PREFLIGHT_FAILED', `Preflight failed: ${error}`, { error, invalidPaths })
}

// ============================================================================
// REMOVED: Preview events (speculative, not supported)
// ============================================================================
// recordPreviewRequested - REMOVED
// recordPreviewLoaded - REMOVED  
// recordPreviewZoom - Kept as no-op for backward compatibility
export function recordPreviewZoom(zoom: number, x: number, y: number, sourcePath?: string): void {
  // No-op: Preview zoom events removed in refactor but function kept for compatibility
}

/**
 * Record job created event.
 */
export function recordJobCreated(jobId: string, sourcePath: string): void {
  recordUIEvent('UI_JOB_CREATED', `Job created: ${jobId.slice(0, 8)}`, { jobId, sourcePath })
}

/**
 * Record job started event.
 */
export function recordJobStarted(jobId: string): void {
  recordUIEvent('UI_JOB_STARTED', `Job started: ${jobId.slice(0, 8)}`, { jobId })
}

/**
 * Record job completed event.
 */
export function recordJobCompleted(jobId: string, status: string): void {
  recordUIEvent('UI_JOB_COMPLETED', `Job completed: ${jobId.slice(0, 8)} (${status})`, { jobId, status })
}

/**
 * Record job failed event.
 */
export function recordJobFailed(jobId: string, reason: string): void {
  recordUIEvent('UI_JOB_FAILED', `Job failed: ${jobId.slice(0, 8)} - ${reason}`, { jobId, reason })
}

/**
 * Record error event.
 */
export function recordUIError(message: string, error?: unknown): void {
  recordUIEvent('UI_ERROR', message, { 
    error: error instanceof Error ? error.message : String(error) 
  })
}
