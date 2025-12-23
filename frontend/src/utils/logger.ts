/**
 * Minimal Logging Discipline — Hardening Pass
 * 
 * Targeted logging helpers for key events only.
 * No global debug mode. No noisy console spam.
 * 
 * Use these for:
 * - State transitions (job status changes)
 * - Invariant violations (should-not-happen conditions)
 * - Backend errors (API failures with context)
 */

type LogLevel = 'INFO' | 'WARN' | 'ERROR'

interface LogContext {
  jobId?: string
  component?: string
  [key: string]: unknown
}

function formatLog(level: LogLevel, message: string, context?: LogContext): string {
  const timestamp = new Date().toISOString()
  const contextStr = context ? ` ${JSON.stringify(context)}` : ''
  return `[${timestamp}] [${level}]${contextStr} ${message}`
}

/**
 * Log a job state transition.
 * Use when a job moves from one status to another.
 */
export function logStateTransition(
  jobId: string,
  fromStatus: string | null,
  toStatus: string,
  component?: string
): void {
  const message = fromStatus
    ? `Job ${jobId.slice(0, 8)} transitioned: ${fromStatus} → ${toStatus}`
    : `Job ${jobId.slice(0, 8)} initial status: ${toStatus}`
  
  console.info(formatLog('INFO', message, { jobId, component, fromStatus, toStatus }))
}

/**
 * Log an invariant violation.
 * Use when a condition that should never be false is false.
 * These are non-fatal but indicate a bug.
 */
export function logInvariantViolation(
  invariantName: string,
  message: string,
  context?: LogContext
): void {
  console.error(formatLog('ERROR', `INVARIANT VIOLATION [${invariantName}]: ${message}`, context))
}

/**
 * Log a backend error with context.
 * Use when an API call fails and we need to trace it.
 */
export function logBackendError(
  endpoint: string,
  error: unknown,
  context?: LogContext
): void {
  const errorMessage = error instanceof Error ? error.message : String(error)
  console.error(formatLog('ERROR', `Backend error at ${endpoint}: ${errorMessage}`, context))
}

/**
 * Log a warning about an unexpected but non-fatal condition.
 * Use sparingly — only for genuinely ambiguous situations.
 */
export function logWarning(
  message: string,
  context?: LogContext
): void {
  console.warn(formatLog('WARN', message, context))
}
