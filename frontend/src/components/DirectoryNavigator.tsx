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
 */

import React, { useState, useCallback, useEffect } from 'react'
import { Button } from './Button'

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

interface DirectoryState {
  path: string
  parent: string | null
  entries: DirectoryEntry[]
  loading: boolean
  error: string | null
  expanded: boolean
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
          {dirState.loading && (
            <div style={{
              paddingLeft: `${0.5 + (level + 1) * 1}rem`,
              padding: '0.375rem 0.5rem',
              fontSize: '0.75rem',
              color: 'var(--text-muted, #6b7280)',
              fontStyle: 'italic',
            }}>
              Loading...
            </div>
          )}
          {/* INC-001: Error state with retry capability */}
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
                color: 'var(--text-error, #ef4444)',
                cursor: 'pointer',
              }}
              title="Click to retry"
            >
              ⚠️ {dirState.error}
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
  
  // INC-001: Request timeout for directory operations (5 seconds)
  const FETCH_TIMEOUT_MS = 5000
  
  // INC-001: Helper to fetch with timeout and abort controller
  const fetchWithTimeout = useCallback(async (url: string): Promise<Response> => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    
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
  const handleToggleExpand = useCallback(async (path: string) => {
    setExpandedDirs(prev => {
      const existing = prev.get(path)
      
      if (existing?.expanded) {
        // Collapse
        const updated = new Map(prev)
        updated.set(path, { ...existing, expanded: false })
        return updated
      }
      
      // Expand - need to fetch if not loaded
      const updated = new Map(prev)
      
      if (existing && existing.entries.length > 0 && !existing.error) {
        // Already loaded successfully, just expand
        updated.set(path, { ...existing, expanded: true })
        return updated
      }
      
      // Need to fetch (or retry after error)
      updated.set(path, {
        path,
        parent: null,
        entries: [],
        loading: true,
        error: null,
        expanded: true,
      })
      
      // V1 DOGFOOD FIX: Robust error handling for folder listing.
      // Ensures loading spinner always resolves with either data or error.
      // Never silently swallows errors.
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
      
      fetch(`${backendUrl}/filesystem/browse?path=${encodeURIComponent(path)}`, {
        signal: controller.signal,
      })
        .then(res => {
          if (!res.ok) {
            // V1 FIX: Handle HTTP errors explicitly
            throw new Error(`HTTP ${res.status}: ${res.statusText || 'Access denied'}`)
          }
          return res.json()
        })
        .then(data => {
          clearTimeout(timeoutId)
          setExpandedDirs(curr => {
            const newMap = new Map(curr)
            newMap.set(path, {
              path: data.path || path,
              parent: data.parent,
              entries: data.entries || [],
              loading: false,
              // V1 FIX: Backend may return error field for permission issues
              error: data.error || null,
              expanded: true,
            })
            return newMap
          })
        })
        .catch(err => {
          clearTimeout(timeoutId)
          // V1 FIX: Surface all errors clearly, never leave spinner stuck
          let errorMessage: string
          if (err.name === 'AbortError') {
            errorMessage = 'Timed out. Click to retry.'
          } else if (err.message?.includes('HTTP')) {
            errorMessage = err.message
          } else if (err.message?.includes('NetworkError') || err.message?.includes('fetch')) {
            errorMessage = 'Network error. Backend offline?'
          } else {
            errorMessage = err.message || 'Unknown error. Click to retry.'
          }
          setExpandedDirs(curr => {
            const newMap = new Map(curr)
            newMap.set(path, {
              path,
              parent: null,
              entries: [],
              loading: false,
              error: errorMessage,
              expanded: true,
            })
            return newMap
          })
        })
      
      return updated
    })
  }, [backendUrl])
  
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
