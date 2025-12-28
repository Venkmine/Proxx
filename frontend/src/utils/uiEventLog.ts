/**
 * UI Event Sourcing for Debug Panel
 * 
 * V1 OBSERVABILITY: Lightweight event logger for debugging UI interactions.
 * 
 * This module:
 * - Stores last 200 UI events in memory (ring buffer)
 * - Records browse, preview, and job events with timestamps
 * - Does NOT persist to disk (debug only, session-scoped)
 * - No styling polish - plain text is fine
 * 
 * Events captured:
 * - UI_BROWSE_CLICKED: User initiated browse action
 * - UI_BROWSE_RESPONSE: Browse completed (success or error)
 * - UI_PREVIEW_REQUESTED: Preview generation requested
 * - UI_PREVIEW_LOADED: Preview loaded in UI
 * - UI_JOB_CREATED: Job created via API
 * - UI_JOB_STARTED: Job execution started
 * 
 * Access via hidden debug panel (Cmd+Shift+D in DEV mode)
 */

export type UIEventType =
  | 'UI_BROWSE_CLICKED'
  | 'UI_BROWSE_RESPONSE'
  | 'UI_PREVIEW_REQUESTED'
  | 'UI_PREVIEW_LOADED'
  | 'UI_JOB_CREATED'
  | 'UI_JOB_STARTED'
  | 'UI_JOB_COMPLETED'
  | 'UI_JOB_FAILED'
  | 'UI_ERROR'

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
 * Record browse response event.
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

/**
 * Record preview requested event.
 */
export function recordPreviewRequested(sourcePath: string): void {
  recordUIEvent('UI_PREVIEW_REQUESTED', `Preview requested: ${sourcePath}`, { sourcePath })
}

/**
 * Record preview loaded event.
 */
export function recordPreviewLoaded(sourcePath: string, previewUrl: string): void {
  recordUIEvent('UI_PREVIEW_LOADED', `Preview loaded: ${sourcePath}`, { sourcePath, previewUrl })
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
