/**
 * useDirectoryListing - Async directory listing with timeout and cancellation.
 *
 * HARDENING: This hook provides safe directory listing that:
 * - Uses AbortController for cancellation when navigating away
 * - Applies appropriate timeouts based on path risk level
 * - Returns explicit states (loading, timeout, error, success)
 * - Never leaves the UI in an indefinite loading state
 *
 * Why this hook exists:
 * - Directory enumeration can hang on network volumes
 * - Users may navigate away before listing completes
 * - Different paths need different timeout strategies
 * - UI must remain responsive at all times
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
   *
   * @param path - Absolute path to list
   * @param signal - AbortSignal for cancellation
   * @returns Directory listing state
   */
  listDirectory: (path: string, signal?: AbortSignal) => Promise<DirectoryListingState>

  /**
   * Create an AbortController for a directory listing request.
   * The controller should be stored and used to cancel if the user navigates away.
   *
   * @param path - Path being listed (for timeout calculation)
   * @returns AbortController with auto-timeout
   */
  createController: (path: string) => AbortController
}

/**
 * Hook for safe, cancellable directory listing.
 *
 * Usage:
 * ```tsx
 * const { listDirectory, createController } = useDirectoryListing({ backendUrl })
 *
 * const handleExpand = async (path: string) => {
 *   const controller = createController(path)
 *   controllerRef.current = controller
 *
 *   const result = await listDirectory(path, controller.signal)
 *   // result.status is 'success', 'timeout', 'error', etc.
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
   */
  const listDirectory = useCallback(
    async (path: string, signal?: AbortSignal): Promise<DirectoryListingState> => {
      const risky = isRiskyPath(path)
      const warning = getRiskyPathWarning(path)

      // Notify start
      onStart?.(path)

      try {
        const response = await fetch(
          `${backendUrl}/filesystem/browse?path=${encodeURIComponent(path)}`,
          { signal }
        )

        // Check if aborted during fetch
        if (signal?.aborted) {
          return {
            status: 'timeout',
            entries: [],
            error: 'Request cancelled',
            warning: risky ? 'Some volumes may be slow or unavailable' : null,
            isRiskyPath: risky,
            timedOut: true,
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

          return {
            status,
            entries: data.entries || [],
            error: data.error,
            warning: data.warning || warning,
            isRiskyPath: data.is_risky_path || risky,
            timedOut: data.timed_out || false,
          }
        }

        // Success
        const entries = data.entries || []
        const status: DirectoryListingStatus = entries.length === 0 ? 'empty' : 'success'

        onSuccess?.(path, entries)

        return {
          status,
          entries,
          error: null,
          warning: data.warning || warning,
          isRiskyPath: data.is_risky_path || risky,
          timedOut: false,
        }
      } catch (err) {
        // Handle aborted requests (user navigated away or timeout)
        if (err instanceof Error && err.name === 'AbortError') {
          return {
            status: 'timeout',
            entries: [],
            error: risky
              ? 'Volume may be slow, disconnected, or unavailable'
              : 'Request timed out',
            warning,
            isRiskyPath: risky,
            timedOut: true,
          }
        }

        // Parse other errors
        const { status, message } = parseDirectoryError(err as Error, path)
        onError?.(path, message)

        return {
          status,
          entries: [],
          error: message,
          warning,
          isRiskyPath: risky,
          timedOut: status === 'timeout',
        }
      }
    },
    [backendUrl, onStart, onSuccess, onError]
  )

  return {
    listDirectory,
    createController,
  }
}

export default useDirectoryListing
