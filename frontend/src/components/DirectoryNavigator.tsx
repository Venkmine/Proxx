/**
 * DirectoryNavigator — Tree-based file/folder browser for Sources panel.
 * 
 * Phase 4A: Explicit source selection without drag & drop.
 * 
 * Features:
 * - Lazy-loaded directory tree
 * - Multi-select for files, single-select for folders
 * - Favorites for quick navigation
 * - Explicit "Create Job" actions (no auto-ingest)
 * 
 * Rules:
 * - All job creation calls canonical ingestion pipeline
 * - No mixed file+folder selection
 * - Visual clarity: selected ≠ queued
 * 
 * HARDENING (INC-002):
 * - Risky paths (/Volumes, network mounts) get shorter timeouts
 * - Warnings displayed for slow/unavailable volumes
 * - Explicit timeout feedback instead of indefinite spinners
 * 
 * INC-004: REQUEST SEQUENCING INVARIANT
 * - Every browse request has a unique, monotonically increasing requestId
 * - Only the LATEST requestId may mutate UI state
 * - Stale responses are logged and discarded silently
 * - loading MUST be false after any request settles (success, error, timeout)
 */

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { Button } from './Button'
import {
  recordBrowseClicked,
  recordBrowseRequestStart,
  recordBrowseSuccess,
  recordBrowseError,
} from '../utils/uiEventLog'
import {
  isRiskyPath,
  getTimeoutForPath,
  getRiskyPathWarning,
} from '../utils/filesystem'

// ============================================================================
// TYPES
// ============================================================================

interface DirectoryEntry {
  name: string
  path: string
  type: 'file' | 'dir'
  size?: number
  extension?: string
}

/**
 * DirectoryState - Explicit state machine for directory listing.
 * 
 * STATE INVARIANT (INC-003):
 * After any fetch completes (success, error, or timeout), `loading` MUST be false.
 * The UI must never show "Loading..." indefinitely after a response is received.
 * 
 * INC-004: REQUEST SEQUENCING INVARIANT
 * Only the response matching the current requestId may update this state.
 * Stale responses must be discarded.
 * 
 * Valid states:
 * - idle: entries=[], loading=false, error=null (initial state)
 * - loading: entries=[], loading=true, error=null (fetch in progress)
 * - loaded: entries=[...], loading=false, error=null (success)
 * - error: entries=[], loading=false, error="..." (fetch failed)
 * - timeout: entries=[], loading=false, error="...", timedOut=true (request timed out)
 * 
 * Note: `isRiskyPath` affects messaging only, NOT lifecycle.
 * A risky path may succeed quickly or timeout — the state transitions are identical.
 */
interface DirectoryState {
  path: string
  parent: string | null
  entries: DirectoryEntry[]
  /** INVARIANT: Must be false after any fetch completes (success, error, timeout) */
  loading: boolean
  error: string | null
  expanded: boolean
  /** INC-002: Path is risky (network mount, /Volumes root, etc.) — affects messaging only */
  isRiskyPath?: boolean
  /** INC-002: Request timed out before completing */
  timedOut?: boolean
  /** INC-002: Warning message to display (e.g., "Some volumes may be slow") */
  warning?: string | null
  /** INC-004: The requestId that set this state. Used for staleness verification. */
  requestId?: number
}

interface DirectoryNavigatorProps {
  backendUrl: string
  favorites: string[]
  onAddFavorite: (path: string) => void
  onRemoveFavorite: (path: string) => void
  onCreateJobFromFiles: (paths: string[]) => void
  onCreateJobFromFolder: (folderPath: string) => void
  disabled?: boolean
}

// ============================================================================
// ICONS (inline SVG for simplicity)
// ============================================================================

const FolderIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M1.5 3.5C1.5 2.94772 1.94772 2.5 2.5 2.5H5.79289C5.9255 2.5 6.05268 2.55268 6.14645 2.64645L7.35355 3.85355C7.44732 3.94732 7.5745 4 7.70711 4H13.5C14.0523 4 14.5 4.44772 14.5 5V12.5C14.5 13.0523 14.0523 13.5 13.5 13.5H2.5C1.94772 13.5 1.5 13.0523 1.5 12.5V3.5Z" 
      fill="var(--icon-folder, #f59e0b)" stroke="var(--icon-folder-border, #d97706)" strokeWidth="1"/>
  </svg>
)

const FileIcon = ({ extension }: { extension?: string }) => {
  // Color based on extension type
  const isVideo = ['mov', 'mp4', 'mxf', 'avi', 'mkv', 'webm', 'r3d', 'braw', 'ari'].includes(extension || '')
  const isAudio = ['wav', 'aiff', 'mp3', 'flac', 'm4a'].includes(extension || '')
  const fill = isVideo ? 'var(--icon-video, #3b82f6)' : isAudio ? 'var(--icon-audio, #8b5cf6)' : 'var(--icon-file, #6b7280)'
  
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3.5 1.5C2.94772 1.5 2.5 1.94772 2.5 2.5V13.5C2.5 14.0523 2.94772 14.5 3.5 14.5H12.5C13.0523 14.5 13.5 14.0523 13.5 13.5V5.5L9.5 1.5H3.5Z" 
        fill={fill} stroke="var(--border-secondary, #4a5568)" strokeWidth="1"/>
      <path d="M9.5 1.5V5.5H13.5" stroke="var(--border-secondary, #4a5568)" strokeWidth="1"/>
    </svg>
  )
}

const ChevronRight = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
    <path d="M4.5 2L8.5 6L4.5 10" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

const ChevronDown = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
    <path d="M2 4.5L6 8.5L10 4.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

const StarIcon = ({ filled }: { filled: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill={filled ? 'var(--icon-star, #f59e0b)' : 'none'} stroke={filled ? 'var(--icon-star, #f59e0b)' : 'var(--text-muted, #6b7280)'} strokeWidth="1">
    <path d="M7 1L8.76 4.56L12.7 5.13L9.85 7.91L10.52 11.83L7 10L3.48 11.83L4.15 7.91L1.3 5.13L5.24 4.56L7 1Z"/>
  </svg>
)

const DriveIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2">
    <rect x="1" y="4" width="12" height="6" rx="1"/>
    <circle cx="10" cy="7" r="1" fill="currentColor"/>
  </svg>
)

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatFileSize(bytes?: number): string {
  if (bytes === undefined || bytes === null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

// ============================================================================
// DIRECTORY TREE NODE COMPONENT
// ============================================================================

interface DirectoryNodeProps {
  entry: DirectoryEntry
  level: number
  backendUrl: string
  selectedFiles: Set<string>
  selectedFolder: string | null
  onSelectFile: (path: string, isSelected: boolean) => void
  onSelectFolder: (path: string | null) => void
  favorites: string[]
  onToggleFavorite: (path: string) => void
  expandedDirs: Map<string, DirectoryState>
  onToggleExpand: (path: string) => void
}

function DirectoryNode({
  entry,
  level,
  backendUrl,
  selectedFiles,
  selectedFolder,
  onSelectFile,
  onSelectFolder,
  favorites,
  onToggleFavorite,
  expandedDirs,
  onToggleExpand,
}: DirectoryNodeProps) {
  const isDir = entry.type === 'dir'
  const dirState = expandedDirs.get(entry.path)
  const isExpanded = dirState?.expanded ?? false
  const isFavorite = favorites.includes(entry.path)
  const isFileSelected = selectedFiles.has(entry.path)
  const isFolderSelected = selectedFolder === entry.path
  
  // INC-004 DEBUG: Log only /Volumes to diagnose issue
  if (isDir && dirState && entry.path === '/Volumes') {
    console.log('[DirectoryNode] /Volumes state:', {
      loading: dirState.loading,
      error: dirState.error,
      expanded: isExpanded,
      entriesLength: dirState.entries?.length ?? 0,
      entriesArray: dirState.entries,
    })
  }
  
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    
    if (isDir) {
      // Folder: toggle selection (mutually exclusive with file selection)
      if (isFolderSelected) {
        onSelectFolder(null)
      } else {
        onSelectFolder(entry.path)
      }
    } else {
      // File: toggle in multi-select (clears folder selection)
      onSelectFile(entry.path, !isFileSelected)
    }
  }, [isDir, isFolderSelected, isFileSelected, entry.path, onSelectFile, onSelectFolder])
  
  const handleExpandClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (isDir) {
      onToggleExpand(entry.path)
    }
  }, [isDir, entry.path, onToggleExpand])
  
  const handleFavoriteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onToggleFavorite(entry.path)
  }, [entry.path, onToggleFavorite])
  
  const isSelected = isDir ? isFolderSelected : isFileSelected
  
  return (
    <div>
      <div
        onClick={handleClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.25rem',
          padding: '0.375rem 0.5rem',
          paddingLeft: `${0.5 + level * 1}rem`,
          cursor: 'pointer',
          borderRadius: 'var(--radius-sm, 4px)',
          background: isSelected 
            ? 'var(--selection-bg, rgba(59, 130, 246, 0.2))' 
            : 'transparent',
          borderLeft: isSelected 
            ? '2px solid var(--button-primary-bg, #3b82f6)' 
            : '2px solid transparent',
          transition: 'background 0.1s ease',
        }}
        onMouseEnter={(e) => {
          if (!isSelected) {
            e.currentTarget.style.background = 'var(--hover-bg, rgba(255,255,255,0.05))'
          }
        }}
        onMouseLeave={(e) => {
          if (!isSelected) {
            e.currentTarget.style.background = 'transparent'
          }
        }}
      >
        {/* Expand/collapse chevron for directories */}
        {isDir ? (
          <button
            onClick={handleExpandClick}
            style={{
              background: 'none',
              border: 'none',
              padding: '2px',
              cursor: 'pointer',
              color: 'var(--text-muted, #6b7280)',
              display: 'flex',
              alignItems: 'center',
            }}
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? <ChevronDown /> : <ChevronRight />}
          </button>
        ) : (
          <span style={{ width: '16px' }} />
        )}
        
        {/* Icon */}
        {isDir ? <FolderIcon /> : <FileIcon extension={entry.extension} />}
        
        {/* Name */}
        <span style={{
          flex: 1,
          fontSize: '0.8125rem',
          color: 'var(--text-primary, #f7fafc)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {entry.name}
        </span>
        
        {/* File size for files */}
        {!isDir && entry.size !== undefined && (
          <span style={{
            fontSize: '0.6875rem',
            color: 'var(--text-muted, #6b7280)',
            flexShrink: 0,
          }}>
            {formatFileSize(entry.size)}
          </span>
        )}
        
        {/* Favorite star for directories */}
        {isDir && (
          <button
            onClick={handleFavoriteClick}
            style={{
              background: 'none',
              border: 'none',
              padding: '2px',
              cursor: 'pointer',
              opacity: isFavorite ? 1 : 0.4,
              transition: 'opacity 0.1s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
            onMouseLeave={(e) => { if (!isFavorite) e.currentTarget.style.opacity = '0.4' }}
            aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <StarIcon filled={isFavorite} />
          </button>
        )}
      </div>
      
      {/* Children (if expanded) */}
      {isDir && isExpanded && dirState && (
        <div>
          {/* INC-002: Warning banner for risky paths */}
          {dirState.warning && !dirState.loading && !dirState.error && (
            <div style={{
              paddingLeft: `${0.5 + (level + 1) * 1}rem`,
              padding: '0.375rem 0.5rem',
              fontSize: '0.6875rem',
              color: 'var(--text-warning, #f59e0b)',
              fontStyle: 'italic',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
            }}>
              ⚠️ {dirState.warning}
            </div>
          )}
          {/* INC-002: Enhanced loading state for risky paths */}
          {dirState.loading && (
            <div style={{
              paddingLeft: `${0.5 + (level + 1) * 1}rem`,
              padding: '0.375rem 0.5rem',
              fontSize: '0.75rem',
              color: 'var(--text-muted, #6b7280)',
              fontStyle: 'italic',
            }}>
              {dirState.isRiskyPath 
                ? 'Loading (may be slow)...' 
                : 'Loading...'}
            </div>
          )}
          {/* INC-001: Error state with retry capability */}
          {/* INC-002: Enhanced with timeout-specific styling */}
          {dirState.error && (
            <div 
              onClick={(e) => {
                e.stopPropagation()
                // INC-001: Retry by triggering expand again
                onToggleExpand(entry.path) // collapse
                setTimeout(() => onToggleExpand(entry.path), 50) // re-expand to retry
              }}
              style={{
                paddingLeft: `${0.5 + (level + 1) * 1}rem`,
                padding: '0.375rem 0.5rem',
                fontSize: '0.75rem',
                // INC-002: Use warning color for timeouts, error color for other errors
                color: dirState.timedOut 
                  ? 'var(--text-warning, #f59e0b)' 
                  : 'var(--text-error, #ef4444)',
                cursor: 'pointer',
              }}
              title="Click to retry"
            >
              {dirState.timedOut ? '⏱️' : '⚠️'} {dirState.error}
            </div>
          )}
          {!dirState.loading && !dirState.error && dirState.entries.length === 0 && (
            <div style={{
              paddingLeft: `${0.5 + (level + 1) * 1}rem`,
              padding: '0.375rem 0.5rem',
              fontSize: '0.75rem',
              color: 'var(--text-muted, #6b7280)',
              fontStyle: 'italic',
            }}>
              No media files
            </div>
          )}
          {dirState.entries.map((child) => (
            <DirectoryNode
              key={child.path}
              entry={child}
              level={level + 1}
              backendUrl={backendUrl}
              selectedFiles={selectedFiles}
              selectedFolder={selectedFolder}
              onSelectFile={onSelectFile}
              onSelectFolder={onSelectFolder}
              favorites={favorites}
              onToggleFavorite={onToggleFavorite}
              expandedDirs={expandedDirs}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function DirectoryNavigator({
  backendUrl,
  favorites,
  onAddFavorite,
  onRemoveFavorite,
  onCreateJobFromFiles,
  onCreateJobFromFolder,
  disabled = false,
}: DirectoryNavigatorProps) {
  // Root directories (from backend)
  const [roots, setRoots] = useState<DirectoryEntry[]>([])
  const [rootsLoading, setRootsLoading] = useState(true)
  const [rootsError, setRootsError] = useState<string | null>(null)
  
  // Directory expansion state (path -> state)
  const [expandedDirs, setExpandedDirs] = useState<Map<string, DirectoryState>>(new Map())
  
  // Selection state
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  
  // INC-001: Request timeout for directory operations (5 seconds default)
  // INC-002: Use dynamic timeouts for risky paths
  const DEFAULT_FETCH_TIMEOUT_MS = 5000
  
  // INC-002: Track active fetch controllers for cleanup
  const activeControllersRef = useRef<Map<string, AbortController>>(new Map())
  
  // INC-004: REQUEST SEQUENCING - Monotonically increasing counter per path
  // Only responses matching the current request ID may update state
  const requestCounterRef = useRef<number>(0)
  const currentRequestIdsRef = useRef<Map<string, number>>(new Map())
  
  // INC-004: Ref to access current expandedDirs without adding to useCallback dependencies
  // This prevents infinite re-render loops when expandedDirs changes
  const expandedDirsRef = useRef(expandedDirs)
  useEffect(() => {
    expandedDirsRef.current = expandedDirs
  }, [expandedDirs])
  
  // INC-002: Helper to fetch with dynamic timeout based on path risk
  const fetchWithTimeout = useCallback(async (url: string, timeoutMs?: number): Promise<Response> => {
    const controller = new AbortController()
    const timeout = timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS
    const timeoutId = setTimeout(() => controller.abort(), timeout)
    
    try {
      const response = await fetch(url, { signal: controller.signal })
      return response
    } finally {
      clearTimeout(timeoutId)
    }
  }, [])
  
  // Fetch roots on mount
  useEffect(() => {
    const fetchRoots = async () => {
      setRootsLoading(true)
      setRootsError(null)
      
      try {
        // INC-001: Use timeout-protected fetch
        const response = await fetchWithTimeout(`${backendUrl}/filesystem/roots`)
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        const data = await response.json()
        setRoots(data.roots || [])
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          setRootsError('Request timed out. Click to retry.')
        } else {
          setRootsError(err instanceof Error ? err.message : 'Failed to load roots')
        }
      } finally {
        setRootsLoading(false)
      }
    }
    
    fetchRoots()
  }, [backendUrl, fetchWithTimeout])
  
  // Toggle directory expansion
  // INC-004 REFACTOR: Moved fetch OUTSIDE state updater to fix React anti-pattern.
  // State updaters must be pure functions - no side effects allowed.
  // Previous code started fetch() inside setExpandedDirs(), which caused
  // nested state updates to fail silently in some React versions.
  // INC-004b: Use expandedDirsRef to avoid adding expandedDirs to dependencies
  // which was causing infinite re-render loops.
  // INC-004c: REQUEST SEQUENCING - Only the latest request may update state.
  const handleToggleExpand = useCallback(async (path: string) => {
    // V1 OBSERVABILITY: Log browse click
    recordBrowseClicked(path)
    
    // Step 1: Read current state via ref (avoids dependency on expandedDirs)
    const existing = expandedDirsRef.current.get(path)
    
    if (existing?.expanded) {
      // INC-004: STATE TRANSITION: loaded/error -> collapsed (no loading change needed)
      // Just collapse - no fetch needed
      setExpandedDirs(prev => {
        const updated = new Map(prev)
        const current = prev.get(path)
        if (current) {
          updated.set(path, { ...current, expanded: false })
        }
        return updated
      })
      return
    }
    
    // Already loaded successfully? Just expand, no fetch
    if (existing && existing.entries.length > 0 && !existing.error) {
      // INC-004: STATE TRANSITION: collapsed -> expanded (no loading needed, already have data)
      setExpandedDirs(prev => {
        const updated = new Map(prev)
        const current = prev.get(path)
        if (current) {
          updated.set(path, { ...current, expanded: true })
        }
        return updated
      })
      return
    }
    
    // INC-004: REQUEST SEQUENCING - Issue new request ID BEFORE any state updates
    // This ID uniquely identifies this request. Only responses matching this ID
    // may update state for this path.
    requestCounterRef.current++
    const requestId = requestCounterRef.current
    currentRequestIdsRef.current.set(path, requestId)
    // TEMP: Debug log for request ID issuance
    console.log(`[TEMP][INC-004] Request ID ${requestId} issued for path: ${path}`)
    
    // Step 2: Set loading state FIRST (pure state update)
    // INC-004: STATE TRANSITION: idle/error -> loading
    const risky = isRiskyPath(path)
    const warning = risky ? getRiskyPathWarning(path) : null
    
    setExpandedDirs(prev => {
      const updated = new Map(prev)
      updated.set(path, {
        path,
        parent: null,
        entries: [],
        loading: true,
        error: null,
        expanded: true,
        isRiskyPath: risky,
        warning,
        requestId,  // INC-004: Track which request set this state
      })
      return updated
    })
    
    // V1 OBSERVABILITY: Log browse request start
    recordBrowseRequestStart(path)
    
    // Step 3: Perform fetch OUTSIDE state updater (side effect separated)
    const controller = new AbortController()
    const dynamicTimeout = getTimeoutForPath(path)
    const timeoutId = setTimeout(() => controller.abort(), dynamicTimeout)
    
    // INC-002: Track controller for potential cleanup
    activeControllersRef.current.set(path, controller)
    
    try {
      const res = await fetch(`${backendUrl}/filesystem/browse?path=${encodeURIComponent(path)}`, {
        signal: controller.signal,
      })
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText || 'Access denied'}`)
      }
      
      const data = await res.json()
      clearTimeout(timeoutId)
      activeControllersRef.current.delete(path)
      
      // INC-004: STALENESS CHECK - Verify this is still the current request
      const currentRequestId = currentRequestIdsRef.current.get(path)
      if (requestId !== currentRequestId) {
        // TEMP: Debug log for stale response
        console.log(`[TEMP][INC-004] STALE response ignored: requestId=${requestId}, currentRequestId=${currentRequestId}, path=${path}`)
        return  // INC-004: Discard stale response silently
      }
      // TEMP: Debug log for valid response
      console.log(`[TEMP][INC-004] Valid response: requestId=${requestId}, path=${path}`)
      
      const entries = data.entries || []
      const errorFromBackend = data.error || null
      const backendTimedOut = data.timed_out || false
      const backendRisky = data.is_risky_path || risky
      const backendWarning = data.warning || warning
      
      // V1 OBSERVABILITY: Log browse result
      if (errorFromBackend) {
        recordBrowseError(path, errorFromBackend)
      } else {
        recordBrowseSuccess(path, entries.length)
      }
      
      // TEMP: Debug log for state update
      console.log(`[TEMP][INC-004] Updating state for path: ${path}, entries: ${entries.length}, requestId: ${requestId}`)
      
      // Step 4: Update state with results (pure state update)
      // INC-004: STATE TRANSITION: loading -> loaded (or loading -> error if backend error)
      // INC-004: UI must never remain in loading state after a request settles.
      setExpandedDirs(curr => {
        const newMap = new Map(curr)
        newMap.set(path, {
          path: data.path || path,
          parent: data.parent,
          entries: entries,
          loading: false,  // INC-004: CRITICAL - Must always be false after settle
          error: errorFromBackend,
          expanded: true,
          isRiskyPath: backendRisky,
          timedOut: backendTimedOut,
          warning: backendWarning,
          requestId,  // INC-004: Track which request produced this state
        })
        return newMap
      })
      
    } catch (err: any) {
      clearTimeout(timeoutId)
      activeControllersRef.current.delete(path)
      
      // INC-004: STALENESS CHECK - Verify this is still the current request
      const currentRequestId = currentRequestIdsRef.current.get(path)
      if (requestId !== currentRequestId) {
        // TEMP: Debug log for stale error response
        console.log(`[TEMP][INC-004] STALE error ignored: requestId=${requestId}, currentRequestId=${currentRequestId}, path=${path}`)
        return  // INC-004: Discard stale error silently
      }
      
      let errorMessage: string
      let timedOut = false
      
      if (err.name === 'AbortError') {
        timedOut = true
        if (risky) {
          errorMessage = 'Volume may be slow, disconnected, or unavailable'
        } else {
          errorMessage = 'Unable to list this folder (timed out)'
        }
      } else if (err.message?.includes('HTTP 403') || err.message?.includes('403')) {
        errorMessage = 'Access denied (permissions)'
      } else if (err.message?.includes('HTTP 404') || err.message?.includes('404')) {
        errorMessage = 'Folder not found'
      } else if (err.message?.includes('HTTP')) {
        errorMessage = err.message
      } else if (err.message?.includes('NetworkError') || err.message?.includes('fetch')) {
        errorMessage = 'Network error. Backend offline?'
      } else {
        errorMessage = err.message || 'Unknown error. Click to retry.'
      }
      
      // V1 OBSERVABILITY: Log browse error
      recordBrowseError(path, errorMessage)
      
      // TEMP: Debug log for error state transition
      console.log(`[TEMP][INC-004] Error state transition for path: ${path}, error: ${errorMessage}, requestId: ${requestId}`)
      
      // Step 5: Update state with error (pure state update)
      // INC-004: STATE TRANSITION: loading -> error/timeout
      // INC-004: UI must never remain in loading state after a request settles.
      setExpandedDirs(curr => {
        const newMap = new Map(curr)
        newMap.set(path, {
          path,
          parent: null,
          entries: [],
          loading: false,  // INC-004: CRITICAL - Must always be false after settle
          error: errorMessage,
          expanded: true,
          isRiskyPath: risky,
          timedOut,
          warning: risky ? 'Some volumes may be slow or unavailable' : null,
          requestId,  // INC-004: Track which request produced this state
        })
        return newMap
      })
    }
  }, [backendUrl])  // INC-004b: removed expandedDirs, using ref instead
  
  // File selection handler
  const handleSelectFile = useCallback((path: string, isSelected: boolean) => {
    // Clear folder selection when selecting files
    setSelectedFolder(null)
    
    setSelectedFiles(prev => {
      const updated = new Set(prev)
      if (isSelected) {
        updated.add(path)
      } else {
        updated.delete(path)
      }
      return updated
    })
  }, [])
  
  // Folder selection handler
  const handleSelectFolder = useCallback((path: string | null) => {
    // Clear file selection when selecting folder
    setSelectedFiles(new Set())
    setSelectedFolder(path)
  }, [])
  
  // Toggle favorite
  const handleToggleFavorite = useCallback((path: string) => {
    if (favorites.includes(path)) {
      onRemoveFavorite(path)
    } else {
      onAddFavorite(path)
    }
  }, [favorites, onAddFavorite, onRemoveFavorite])
  
  // Navigate to favorite
  const handleNavigateToFavorite = useCallback((path: string) => {
    // Expand the path
    handleToggleExpand(path)
  }, [handleToggleExpand])
  
  // Create job from selected files
  const handleCreateJobFromFiles = useCallback(() => {
    if (selectedFiles.size === 0) return
    onCreateJobFromFiles(Array.from(selectedFiles))
    // Clear selection after job creation
    setSelectedFiles(new Set())
  }, [selectedFiles, onCreateJobFromFiles])
  
  // Create job from selected folder
  const handleCreateJobFromFolder = useCallback(() => {
    if (!selectedFolder) return
    onCreateJobFromFolder(selectedFolder)
    // Clear selection after job creation
    setSelectedFolder(null)
  }, [selectedFolder, onCreateJobFromFolder])
  
  // Clear all selections
  const handleClearSelection = useCallback(() => {
    setSelectedFiles(new Set())
    setSelectedFolder(null)
  }, [])
  
  const hasFileSelection = selectedFiles.size > 0
  const hasFolderSelection = selectedFolder !== null
  const hasSelection = hasFileSelection || hasFolderSelection
  
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '0.75rem 1rem',
        borderBottom: '1px solid var(--border-primary, #2d3748)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
      }}>
        <DriveIcon />
        <span style={{
          fontSize: '0.875rem',
          fontWeight: 600,
          color: 'var(--text-primary, #f7fafc)',
        }}>
          Browse Sources
        </span>
      </div>
      
      {/* Favorites section */}
      {favorites.length > 0 && (
        <div style={{
          padding: '0.5rem',
          borderBottom: '1px solid var(--border-primary, #2d3748)',
          background: 'var(--surface-secondary, rgba(255,255,255,0.02))',
        }}>
          <div style={{
            fontSize: '0.6875rem',
            fontWeight: 600,
            color: 'var(--text-muted, #6b7280)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '0.375rem',
            paddingLeft: '0.5rem',
          }}>
            Favorites
          </div>
          {favorites.map(fav => (
            <div
              key={fav}
              onClick={() => handleNavigateToFavorite(fav)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                padding: '0.375rem 0.5rem',
                cursor: 'pointer',
                borderRadius: 'var(--radius-sm, 4px)',
                fontSize: '0.8125rem',
                color: 'var(--text-primary, #f7fafc)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--hover-bg, rgba(255,255,255,0.05))'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              <StarIcon filled />
              <span style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {fav.split('/').pop() || fav}
              </span>
            </div>
          ))}
        </div>
      )}
      
      {/* Tree view */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '0.5rem 0',
      }}>
        {rootsLoading && (
          <div style={{
            padding: '1rem',
            textAlign: 'center',
            color: 'var(--text-muted, #6b7280)',
            fontSize: '0.8125rem',
          }}>
            Loading drives...
          </div>
        )}
        
        {rootsError && (
          <div style={{
            padding: '1rem',
            textAlign: 'center',
            color: 'var(--text-error, #ef4444)',
            fontSize: '0.8125rem',
          }}>
            {rootsError}
          </div>
        )}
        
        {!rootsLoading && !rootsError && roots.map(root => (
          <DirectoryNode
            key={root.path}
            entry={root}
            level={0}
            backendUrl={backendUrl}
            selectedFiles={selectedFiles}
            selectedFolder={selectedFolder}
            onSelectFile={handleSelectFile}
            onSelectFolder={handleSelectFolder}
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
            expandedDirs={expandedDirs}
            onToggleExpand={handleToggleExpand}
          />
        ))}
      </div>
      
      {/* Selection info & actions */}
      <div style={{
        padding: '0.75rem 1rem',
        borderTop: '1px solid var(--border-primary, #2d3748)',
        background: 'var(--surface-secondary, rgba(255,255,255,0.02))',
      }}>
        {/* Selection status */}
        <div style={{
          fontSize: '0.75rem',
          color: 'var(--text-secondary, #a0aec0)',
          marginBottom: '0.5rem',
        }}>
          {hasFileSelection && (
            <span>{selectedFiles.size} file{selectedFiles.size > 1 ? 's' : ''} selected</span>
          )}
          {hasFolderSelection && (
            <span>Folder selected: {selectedFolder?.split('/').pop()}</span>
          )}
          {!hasSelection && (
            <span style={{ color: 'var(--text-muted, #6b7280)', fontStyle: 'italic' }}>
              Select files or a folder to create a job
            </span>
          )}
        </div>
        
        {/* Action buttons — Phase 9F: Explicit tooltips for disabled state */}
        <div style={{
          display: 'flex',
          gap: '0.5rem',
        }}>
          <Button
            variant="primary"
            size="sm"
            onClick={handleCreateJobFromFiles}
            disabled={disabled || !hasFileSelection}
            title={!hasFileSelection ? 'Select at least one file first' : 'Create job from selected files'}
            style={{ flex: 1 }}
          >
            Create Job from File{selectedFiles.size > 1 ? 's' : ''}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCreateJobFromFolder}
            disabled={disabled || !hasFolderSelection}
            title={!hasFolderSelection ? 'Select a folder first' : 'Create job from folder contents'}
            style={{ flex: 1 }}
          >
            Create Job from Folder
          </Button>
        </div>
        
        {hasSelection && (
          <button
            onClick={handleClearSelection}
            style={{
              marginTop: '0.5rem',
              width: '100%',
              padding: '0.375rem',
              background: 'none',
              border: 'none',
              color: 'var(--text-muted, #6b7280)',
              fontSize: '0.75rem',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Clear selection
          </button>
        )}
      </div>
    </div>
  )
}
