/**
 * useDirectoryListing - Async directory listing with timeout and cancellation.
 *
 * HARDENING: This hook provides safe directory listing that:
 * - Uses AbortController for cancellation when navigating away
 * - Applies appropriate timeouts based on path risk level
 * - Returns explicit states (loading, timeout, error, success)
 * - Never leaves the UI in an indefinite loading state
 *
 * INC-004: REQUEST SEQUENCING INVARIANT
 * - Every browse request has a unique, monotonically increasing requestId
 * - Only the LATEST requestId may mutate UI state
 * - Stale responses are logged and discarded silently
 *
 * Why this hook exists:
 * - Directory enumeration can hang on network volumes
 * - Users may navigate away before listing completes
 * - Different paths need different timeout strategies
 * - UI must remain responsive at all times
 * - Race conditions between async responses must be prevented
 */

import { useCallback, useRef } from 'react'
import {
  DirectoryEntry,
  DirectoryListingState,
  DirectoryListingStatus,
  getTimeoutForPath,
  isRiskyPath,
  parseDirectoryError,
  getRiskyPathWarning,
} from '../utils/filesystem'

// =============================================================================
// INC-004: REQUEST SEQUENCING
// Module-level counter ensures monotonic IDs across all hook instances
// =============================================================================
let globalRequestCounter = 0

interface BrowseResponse {
  path: string
  parent: string | null
  entries: DirectoryEntry[]
  error: string | null
  is_risky_path: boolean
  timed_out: boolean
  warning: string | null
}

interface UseDirectoryListingOptions {
  /** Backend API base URL */
  backendUrl: string
  /** Callback when listing starts */
  onStart?: (path: string) => void
  /** Callback when listing succeeds */
  onSuccess?: (path: string, entries: DirectoryEntry[]) => void
  /** Callback when listing fails */
  onError?: (path: string, error: string) => void
}

interface UseDirectoryListingResult {
  /**
   * Fetch directory contents with timeout and cancellation support.
   * INC-004: Returns requestId for caller to verify before state mutation.
   *
   * @param path - Absolute path to list
   * @param signal - AbortSignal for cancellation
   * @returns Directory listing state with requestId
   */
  listDirectory: (path: string, signal?: AbortSignal) => Promise<DirectoryListingState & { requestId: number }>

  /**
   * Create an AbortController for a directory listing request.
   * The controller should be stored and used to cancel if the user navigates away.
   *
   * @param path - Path being listed (for timeout calculation)
   * @returns AbortController with auto-timeout
   */
  createController: (path: string) => AbortController

  /**
   * INC-004: Get the current request ID for a path.
   * Used to verify if a response is stale before applying state.
   */
  getCurrentRequestId: (path: string) => number | undefined

  /**
   * INC-004: Issue a new request ID for a path.
   * Must be called before starting a request.
   */
  issueRequestId: (path: string) => number
}

/**
 * Hook for safe, cancellable directory listing.
 * INC-004: Implements request sequencing to prevent race conditions.
 *
 * Usage:
 * ```tsx
 * const { listDirectory, createController, issueRequestId, getCurrentRequestId } = useDirectoryListing({ backendUrl })
 *
 * const handleExpand = async (path: string) => {
 *   const requestId = issueRequestId(path)  // INC-004: Get unique ID before fetch
 *   const controller = createController(path)
 *   controllerRef.current = controller
 *
 *   const result = await listDirectory(path, controller.signal)
 *   
 *   // INC-004: Verify this response is still current before applying
 *   if (result.requestId !== getCurrentRequestId(path)) {
 *     console.log('[TEMP] Stale response ignored:', result.requestId)
 *     return
 *   }
 *   // Apply state...
 * }
 *
 * // On unmount or navigation away:
 * controllerRef.current?.abort()
 * ```
 */
export function useDirectoryListing({
  backendUrl,
  onStart,
  onSuccess,
  onError,
}: UseDirectoryListingOptions): UseDirectoryListingResult {
  // Track active requests for cleanup
  const activeControllersRef = useRef<Map<string, AbortController>>(new Map())
  
  // INC-004: Track current request ID per path
  // Only responses matching the current ID should update state
  const currentRequestIdsRef = useRef<Map<string, number>>(new Map())

  /**
   * INC-004: Issue a new request ID for a path.
   * This MUST be called before starting any request.
   * The returned ID becomes the "current" ID for that path.
   */
  const issueRequestId = useCallback((path: string): number => {
    globalRequestCounter++
    const requestId = globalRequestCounter
    currentRequestIdsRef.current.set(path, requestId)
    // TEMP: Debug log for request ID issuance
    console.log(`[TEMP][INC-004] Request ID ${requestId} issued for path: ${path}`)
    return requestId
  }, [])

  /**
   * INC-004: Get the current request ID for a path.
   * Used to verify if a response is stale.
   */
  const getCurrentRequestId = useCallback((path: string): number | undefined => {
    return currentRequestIdsRef.current.get(path)
  }, [])

  /**
   * Create an AbortController with auto-timeout for a path.
   */
  const createController = useCallback((path: string): AbortController => {
    // Cancel any existing request for this path
    const existing = activeControllersRef.current.get(path)
    if (existing) {
      existing.abort()
    }

    const controller = new AbortController()
    const timeout = getTimeoutForPath(path)

    // Auto-abort after timeout
    const timeoutId = setTimeout(() => {
      controller.abort()
    }, timeout)

    // Clean up timeout when aborted
    controller.signal.addEventListener('abort', () => {
      clearTimeout(timeoutId)
      activeControllersRef.current.delete(path)
    })

    activeControllersRef.current.set(path, controller)
    return controller
  }, [])

  /**
   * List directory contents with full error handling.
   * INC-004: Now includes requestId in return for staleness checking.
   */
  const listDirectory = useCallback(
    async (path: string, signal?: AbortSignal): Promise<DirectoryListingState & { requestId: number }> => {
      const risky = isRiskyPath(path)
      const warning = getRiskyPathWarning(path)
      
      // INC-004: Capture the current request ID at invocation time
      // This is used by the caller to verify if the response is still current
      const requestId = currentRequestIdsRef.current.get(path) ?? 0
      // TEMP: Debug log for request start
      console.log(`[TEMP][INC-004] listDirectory started for path: ${path}, requestId: ${requestId}`)

      // Notify start
      onStart?.(path)

      try {
        const response = await fetch(
          `${backendUrl}/filesystem/browse?path=${encodeURIComponent(path)}`,
          { signal }
        )

        // Check if aborted during fetch
        if (signal?.aborted) {
          // TEMP: Debug log for aborted request
          console.log(`[TEMP][INC-004] Request aborted for path: ${path}, requestId: ${requestId}`)
          // INC-004: UI must never remain in loading state after a request settles.
          return {
            status: 'timeout',
            entries: [],
            error: 'Request cancelled',
            warning: risky ? 'Some volumes may be slow or unavailable' : null,
            isRiskyPath: risky,
            timedOut: true,
            requestId,  // INC-004: Include for staleness check
          }
        }

        if (!response.ok) {
          const errorText = await response.text().catch(() => response.statusText)
          throw new Error(`HTTP ${response.status}: ${errorText}`)
        }

        const data: BrowseResponse = await response.json()

        // Backend returned an error
        if (data.error) {
          const status: DirectoryListingStatus = data.timed_out
            ? 'timeout'
            : data.error.includes('Permission')
              ? 'permission_denied'
              : 'error'

          onError?.(path, data.error)

          // TEMP: Debug log for backend error
          console.log(`[TEMP][INC-004] Backend error for path: ${path}, requestId: ${requestId}, error: ${data.error}`)
          // INC-004: UI must never remain in loading state after a request settles.
          return {
            status,
            entries: data.entries || [],
            error: data.error,
            warning: data.warning || warning,
            isRiskyPath: data.is_risky_path || risky,
            timedOut: data.timed_out || false,
            requestId,  // INC-004: Include for staleness check
          }
        }

        // Success
        const entries = data.entries || []
        const status: DirectoryListingStatus = entries.length === 0 ? 'empty' : 'success'

        onSuccess?.(path, entries)

        // TEMP: Debug log for successful response
        console.log(`[TEMP][INC-004] Success for path: ${path}, requestId: ${requestId}, entries: ${entries.length}`)
        // INC-004: UI must never remain in loading state after a request settles.
        return {
          status,
          entries,
          error: null,
          warning: data.warning || warning,
          isRiskyPath: data.is_risky_path || risky,
          timedOut: false,
          requestId,  // INC-004: Include for staleness check
        }
      } catch (err) {
        // Handle aborted requests (user navigated away or timeout)
        if (err instanceof Error && err.name === 'AbortError') {
          // TEMP: Debug log for timeout
          console.log(`[TEMP][INC-004] Timeout/abort for path: ${path}, requestId: ${requestId}`)
          // INC-004: UI must never remain in loading state after a request settles.
          return {
            status: 'timeout',
            entries: [],
            error: risky
              ? 'Volume may be slow, disconnected, or unavailable'
              : 'Request timed out',
            warning,
            isRiskyPath: risky,
            timedOut: true,
            requestId,  // INC-004: Include for staleness check
          }
        }

        // Parse other errors
        const { status, message } = parseDirectoryError(err as Error, path)
        onError?.(path, message)

        // TEMP: Debug log for other errors
        console.log(`[TEMP][INC-004] Error for path: ${path}, requestId: ${requestId}, error: ${message}`)
        // INC-004: UI must never remain in loading state after a request settles.
        return {
          status,
          entries: [],
          error: message,
          warning,
          isRiskyPath: risky,
          timedOut: status === 'timeout',
          requestId,  // INC-004: Include for staleness check
        }
      }
    },
    [backendUrl, onStart, onSuccess, onError]
  )

  return {
    listDirectory,
    createController,
    getCurrentRequestId,  // INC-004: Exposed for staleness verification
    issueRequestId,       // INC-004: Exposed to issue new request IDs
  }
}

export default useDirectoryListing
