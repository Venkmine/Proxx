/**
 * Status Log Message Generator
 * 
 * Converts job/task events into plain English messages for the status log.
 * Keeps messages user-friendly and avoids technical jargon.
 */

import type { StatusLogEntry, StatusLogLevel } from '../components/StatusLog'

// ============================================================================
// MESSAGE GENERATORS
// ============================================================================

let messageIdCounter = 0
const generateId = () => `msg-${Date.now()}-${++messageIdCounter}`

/**
 * Generate a status log entry with optional verbose details.
 */
function createEntry(
  level: StatusLogLevel,
  message: string,
  details?: string
): StatusLogEntry {
  return {
    id: generateId(),
    timestamp: new Date(),
    level,
    message,
    details,
  }
}

/**
 * Job was added to the queue.
 */
export function jobQueued(jobId: string, clipCount: number): StatusLogEntry {
  const clipText = clipCount === 1 ? '1 clip' : `${clipCount} clips`
  return createEntry(
    'info',
    `Job queued with ${clipText}`,
    `Job ID: ${jobId}`
  )
}

/**
 * Job execution started.
 */
export function jobStarted(jobId: string, clipCount: number): StatusLogEntry {
  const clipText = clipCount === 1 ? '1 clip' : `${clipCount} clips`
  return createEntry(
    'info',
    `Encoding started for ${clipText}`,
    `Job ID: ${jobId}`
  )
}

/**
 * Job execution resumed after pause or recovery.
 */
export function jobResumed(jobId: string): StatusLogEntry {
  return createEntry(
    'info',
    'Job resumed',
    `Job ID: ${jobId}`
  )
}

/**
 * Job paused by user.
 */
export function jobPaused(jobId: string): StatusLogEntry {
  return createEntry(
    'info',
    'Job paused',
    `Job ID: ${jobId}`
  )
}

/**
 * Job completed successfully.
 */
export function jobCompleted(
  jobId: string,
  completedCount: number,
  totalCount: number
): StatusLogEntry {
  const clipText = completedCount === 1 ? '1 clip' : `${completedCount} clips`
  return createEntry(
    'success',
    `Job completed: ${clipText} rendered`,
    `Job ID: ${jobId}\nCompleted: ${completedCount}/${totalCount}`
  )
}

/**
 * Job completed with warnings (some clips failed/skipped).
 */
export function jobCompletedWithWarnings(
  jobId: string,
  completedCount: number,
  failedCount: number,
  skippedCount: number,
  totalCount: number
): StatusLogEntry {
  const issues: string[] = []
  if (failedCount > 0) issues.push(`${failedCount} failed`)
  if (skippedCount > 0) issues.push(`${skippedCount} skipped`)
  
  return createEntry(
    'warning',
    `Job completed with issues: ${completedCount}/${totalCount} successful`,
    `Job ID: ${jobId}\nIssues: ${issues.join(', ')}`
  )
}

/**
 * Job failed (engine error, not clip failures).
 */
export function jobFailed(jobId: string, reason?: string): StatusLogEntry {
  return createEntry(
    'error',
    'Job failed',
    reason ? `Job ID: ${jobId}\nReason: ${reason}` : `Job ID: ${jobId}`
  )
}

/**
 * Job cancelled by user.
 */
export function jobCancelled(jobId: string): StatusLogEntry {
  return createEntry(
    'info',
    'Job cancelled',
    `Job ID: ${jobId}`
  )
}

/**
 * Job deleted from queue.
 */
export function jobDeleted(jobId: string): StatusLogEntry {
  return createEntry(
    'info',
    'Job removed from queue',
    `Job ID: ${jobId}`
  )
}

/**
 * Failed clips are being retried.
 */
export function jobRetrying(jobId: string, retryCount: number): StatusLogEntry {
  const clipText = retryCount === 1 ? '1 clip' : `${retryCount} clips`
  return createEntry(
    'info',
    `Retrying ${clipText}`,
    `Job ID: ${jobId}`
  )
}

/**
 * Queue cleared.
 */
export function queueCleared(jobCount: number): StatusLogEntry {
  const jobText = jobCount === 1 ? '1 job' : `${jobCount} jobs`
  return createEntry(
    'info',
    `Queue cleared: ${jobText} removed`
  )
}

/**
 * Backend connection lost.
 */
export function backendDisconnected(): StatusLogEntry {
  return createEntry(
    'error',
    'Connection to backend lost',
    'Check that the backend service is running'
  )
}

/**
 * Backend connection restored.
 */
export function backendConnected(): StatusLogEntry {
  return createEntry(
    'success',
    'Connected to backend'
  )
}

/**
 * Generic error message.
 */
export function errorOccurred(message: string, details?: string): StatusLogEntry {
  return createEntry('error', message, details)
}

/**
 * Generic info message.
 */
export function infoMessage(message: string, details?: string): StatusLogEntry {
  return createEntry('info', message, details)
}
