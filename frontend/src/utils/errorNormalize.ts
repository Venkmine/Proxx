/**
 * Error Normalization Utility — Hardening Pass
 * 
 * Normalizes backend errors into a consistent shape:
 * - message: Human-readable error text
 * - jobId: Associated job ID (if applicable)
 * - source: Where the error came from (endpoint, component)
 * 
 * Removes generic "Something went wrong" messages.
 * Always surfaces the backend-provided error text.
 */

import { logBackendError } from './logger'

// ============================================================================
// TYPES
// ============================================================================

export interface NormalizedError {
  /** Human-readable error message — never generic */
  message: string
  /** Associated job ID (if applicable) */
  jobId?: string
  /** Source of the error (endpoint, component) */
  source: string
  /** Original error object for debugging */
  raw?: unknown
  /** HTTP status code (if from a response) */
  statusCode?: number
}

// ============================================================================
// NORMALIZATION FUNCTIONS
// ============================================================================

/**
 * Extract error message from a backend response body.
 * Handles various backend response formats.
 */
function extractMessageFromResponseBody(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  
  const obj = body as Record<string, unknown>
  
  // FastAPI style: { detail: "message" } or { detail: { message: "..." } }
  if (obj.detail) {
    if (typeof obj.detail === 'string') {
      return obj.detail
    }
    if (typeof obj.detail === 'object' && obj.detail !== null) {
      const detail = obj.detail as Record<string, unknown>
      if (typeof detail.message === 'string') return detail.message
      if (typeof detail.msg === 'string') return detail.msg
      // Array of validation errors
      if (Array.isArray(obj.detail)) {
        return obj.detail
          .map((e: unknown) => {
            if (typeof e === 'string') return e
            if (typeof e === 'object' && e !== null) {
              const err = e as Record<string, unknown>
              return err.msg || err.message || JSON.stringify(e)
            }
            return String(e)
          })
          .join('; ')
      }
      return JSON.stringify(obj.detail)
    }
  }
  
  // Standard error formats
  if (typeof obj.error === 'string') return obj.error
  if (typeof obj.message === 'string') return obj.message
  if (typeof obj.msg === 'string') return obj.msg
  
  return null
}

/**
 * Normalize a Response object from fetch into a NormalizedError.
 * 
 * @param response - The fetch Response object
 * @param source - Endpoint or component name
 * @param jobId - Optional job ID to associate
 */
export async function normalizeResponseError(
  response: Response,
  source: string,
  jobId?: string
): Promise<NormalizedError> {
  let message = `HTTP ${response.status}: ${response.statusText || 'Unknown error'}`
  let raw: unknown
  
  try {
    const contentType = response.headers.get('content-type')
    if (contentType?.includes('application/json')) {
      raw = await response.json()
      const extracted = extractMessageFromResponseBody(raw)
      if (extracted) {
        message = extracted
      }
    } else {
      const text = await response.text()
      if (text && text.length < 500) {
        message = text
        raw = text
      }
    }
  } catch {
    // Failed to parse response body — keep the HTTP status message
  }
  
  const normalized: NormalizedError = {
    message,
    source,
    statusCode: response.status,
    raw,
  }
  
  if (jobId) {
    normalized.jobId = jobId
  }
  
  // Log for debugging
  logBackendError(source, message, { jobId, statusCode: response.status })
  
  return normalized
}

/**
 * Normalize any error into a NormalizedError.
 * Handles Error objects, strings, and unknown types.
 * 
 * @param error - The error to normalize
 * @param source - Where the error came from
 * @param jobId - Optional job ID to associate
 */
export function normalizeError(
  error: unknown,
  source: string,
  jobId?: string
): NormalizedError {
  let message: string
  
  if (error instanceof Error) {
    message = error.message
  } else if (typeof error === 'string') {
    message = error
  } else if (error && typeof error === 'object') {
    const extracted = extractMessageFromResponseBody(error)
    message = extracted || JSON.stringify(error)
  } else {
    message = 'An unexpected error occurred'
  }
  
  // Log for debugging
  logBackendError(source, message, { jobId })
  
  return {
    message,
    source,
    jobId,
    raw: error,
  }
}

/**
 * Format a NormalizedError for display.
 * If jobId is present, includes it in the message.
 */
export function formatErrorForDisplay(error: NormalizedError): string {
  if (error.jobId) {
    return `[Job ${error.jobId.slice(0, 8)}] ${error.message}`
  }
  return error.message
}

/**
 * Create an error message with job context.
 * Use this instead of generic string concatenation.
 */
export function createJobError(
  action: string,
  jobId: string,
  errorMessage: string
): string {
  return `Failed to ${action} job ${jobId.slice(0, 8)}: ${errorMessage}`
}
