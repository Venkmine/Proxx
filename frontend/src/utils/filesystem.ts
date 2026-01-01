/**
 * Filesystem utilities for safe directory browsing.
 *
 * HARDENING: This module provides utilities for detecting and handling
 * risky filesystem paths that may cause UI hangs.
 *
 * Why these utilities exist:
 * - /Volumes on macOS can contain dead network mounts
 * - Network shares may hang indefinitely
 * - FUSE filesystems have unpredictable latency
 * - Removable media may be slow or unresponsive
 *
 * These utilities help the UI provide appropriate warnings and
 * use defensive timeouts for risky paths.
 */

// =============================================================================
// RISKY PATH DETECTION
// =============================================================================
// Paths matching these prefixes may be slow or hang indefinitely.
// We apply special handling: shorter timeouts, explicit warnings,
// and lazy expansion (no auto-enumerate).
// =============================================================================

const RISKY_PATH_PREFIXES = [
  '/Volumes',      // macOS mounted volumes (may include dead network shares)
  '/mnt',          // Linux mount points
  '/media',        // Linux removable media
  '/net',          // Network automounts
  '/Network',      // macOS network
  '//',            // UNC paths (Windows-style)
  'smb://',        // SMB URLs
  'afp://',        // AFP URLs
]

/**
 * Check if a path is potentially risky (slow or may hang).
 *
 * Risky paths include:
 * - /Volumes (macOS mounted volumes including network shares)
 * - /mnt, /media (Linux mount points)
 * - Network paths (UNC, SMB, AFP)
 *
 * @param path - The filesystem path to check
 * @returns true if the path may be slow or cause hangs
 */
export function isRiskyPath(path: string): boolean {
  return RISKY_PATH_PREFIXES.some(prefix => path.startsWith(prefix))
}

/**
 * Check if a path is the /Volumes root itself.
 * 
 * INC-005: /Volumes is NOT a browsable directory — it's a volume selector.
 * This prevents UI deadlock from attempting to enumerate volumes like normal directories.
 * 
 * @param path - The filesystem path to check
 * @returns true if the path is exactly '/Volumes'
 */
export function isVolumesRoot(path: string): boolean {
  return path === '/Volumes'
}

/**
 * Check if a path is a volume root (direct child of /Volumes).
 *
 * Volume roots get special treatment:
 * - Not auto-enumerated
 * - Show warning about slow/unavailable volumes
 * - Require explicit user click to expand
 *
 * @param path - The filesystem path to check
 * @returns true if the path is a volume root
 */
export function isVolumeRoot(path: string): boolean {
  // Match /Volumes/VolumeName but not deeper paths
  const match = path.match(/^\/Volumes\/[^/]+$/)
  return match !== null
}

/**
 * Get a warning message for risky paths.
 *
 * @param path - The filesystem path
 * @returns Warning message or null if path is not risky
 */
export function getRiskyPathWarning(path: string): string | null {
  if (path === '/Volumes' || path.startsWith('/Volumes/')) {
    return 'Some volumes may be slow or unavailable'
  }
  if (path.startsWith('/mnt') || path.startsWith('/media')) {
    return 'Mount points may be slow or unavailable'
  }
  if (path.startsWith('//') || path.startsWith('smb://') || path.startsWith('afp://')) {
    return 'Network shares may be slow or unavailable'
  }
  return null
}

// =============================================================================
// TIMEOUT CONFIGURATION
// =============================================================================
// Different paths get different timeouts based on expected latency.
// =============================================================================

/** Default timeout for directory listing requests (ms) */
export const DEFAULT_BROWSE_TIMEOUT_MS = 5000

/** Shorter timeout for risky paths (ms) */
export const RISKY_PATH_TIMEOUT_MS = 2000

/** Very short timeout for volume root enumeration (ms) */
export const VOLUME_ROOT_TIMEOUT_MS = 1000

/**
 * Get the appropriate timeout for a path.
 *
 * @param path - The filesystem path
 * @returns Timeout in milliseconds
 */
export function getTimeoutForPath(path: string): number {
  if (isVolumeRoot(path)) {
    return VOLUME_ROOT_TIMEOUT_MS
  }
  if (isRiskyPath(path)) {
    return RISKY_PATH_TIMEOUT_MS
  }
  return DEFAULT_BROWSE_TIMEOUT_MS
}

// =============================================================================
// DIRECTORY LISTING STATE
// =============================================================================

export type DirectoryListingStatus =
  | 'idle'
  | 'loading'
  | 'success'
  | 'timeout'
  | 'permission_denied'
  | 'not_found'
  | 'error'
  | 'empty'

export interface DirectoryListingState {
  status: DirectoryListingStatus
  entries: DirectoryEntry[]
  error: string | null
  warning: string | null
  isRiskyPath: boolean
  timedOut: boolean
}

export interface DirectoryEntry {
  name: string
  path: string
  type: 'file' | 'dir'
  size?: number
  extension?: string
}

/**
 * Parse an error into a user-friendly status and message.
 *
 * @param error - The error to parse
 * @param path - The path that was being accessed
 * @returns Object with status and error message
 */
export function parseDirectoryError(
  error: Error | string,
  path: string
): { status: DirectoryListingStatus; message: string } {
  const errorMessage = typeof error === 'string' ? error : error.message

  // AbortError indicates timeout (request was cancelled)
  if (errorMessage.includes('AbortError') || errorMessage.includes('aborted')) {
    return {
      status: 'timeout',
      message: isRiskyPath(path)
        ? 'Volume may be slow, disconnected, or unavailable'
        : 'Request timed out',
    }
  }

  // Permission errors
  if (
    errorMessage.includes('403') ||
    errorMessage.includes('Permission') ||
    errorMessage.includes('permission')
  ) {
    return {
      status: 'permission_denied',
      message: 'Permission denied',
    }
  }

  // Not found errors
  if (
    errorMessage.includes('404') ||
    errorMessage.includes('not found') ||
    errorMessage.includes('does not exist')
  ) {
    return {
      status: 'not_found',
      message: 'Folder not found',
    }
  }

  // Network errors
  if (
    errorMessage.includes('NetworkError') ||
    errorMessage.includes('fetch') ||
    errorMessage.includes('Failed to fetch')
  ) {
    return {
      status: 'error',
      message: 'Network error. Backend offline?',
    }
  }

  // Default
  return {
    status: 'error',
    message: errorMessage || 'Unknown error',
  }
}

// =============================================================================
// PATH VALIDATION (for manual entry)
// =============================================================================

export interface PathValidationResult {
  path: string
  exists: boolean
  isDirectory: boolean
  isFile: boolean
  isReadable: boolean
  isRiskyPath: boolean
  error: string | null
}

/**
 * Validate a path exists without enumerating its contents.
 *
 * This is the SAFE escape hatch for manual path entry.
 * It only checks existence, not contents.
 *
 * @param backendUrl - Backend API base URL
 * @param path - Path to validate
 * @param signal - AbortSignal for cancellation
 * @returns Validation result
 */
export async function validatePath(
  backendUrl: string,
  path: string,
  signal?: AbortSignal
): Promise<PathValidationResult> {
  try {
    const response = await fetch(
      `${backendUrl}/filesystem/validate-path?path=${encodeURIComponent(path)}`,
      { signal }
    )

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()

    return {
      path: data.path,
      exists: data.exists,
      isDirectory: data.is_directory,
      isFile: data.is_file,
      isReadable: data.is_readable,
      isRiskyPath: data.is_risky_path,
      error: data.error || null,
    }
  } catch (err) {
    return {
      path,
      exists: false,
      isDirectory: false,
      isFile: false,
      isReadable: false,
      isRiskyPath: isRiskyPath(path),
      error: err instanceof Error ? err.message : 'Validation failed',
    }
  }
}
