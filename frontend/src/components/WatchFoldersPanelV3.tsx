/**
 * Watch Folders Panel V3 — PHASE 6.5: WATCH FOLDER STATE & SCALABILITY
 * 
 * INTENT.md Compliance:
 * - Detection is automatic (files appear in staged count)
 * - Execution is MANUAL (operator must click "Create Jobs")
 * - No auto-retry, no silent automation
 * - Full visibility via counts (not file lists)
 * 
 * PHASE 6.5 REQUIREMENTS:
 * A) State Clarity: Unambiguous status with icon/badge
 * B) Counts-First: Detected, Staged, Jobs Created, Completed, Failed
 * C) File List Scaling: Capped preview, no unbounded lists
 * D) Create Jobs Semantics: Clear action with helper text
 * E) Layout: Collapsed/expanded views, functional space
 * F) No automation regression
 */

import React, { useState, useCallback } from 'react'
import type { WatchFolder, PendingFile, WatchFolderConfig, WatchFolderCounts } from '../types/watchFolders'
import { DEFAULT_VIDEO_EXTENSIONS, DEFAULT_EXCLUDE_PATTERNS } from '../types/watchFolders'

/** Maximum files to show in staged file preview */
const MAX_STAGED_PREVIEW = 10

interface WatchFoldersPanelProps {
  watchFolders: WatchFolder[]
  presets: Array<{ id: string; name: string }>
  onAddWatchFolder: (config: WatchFolderConfig) => Promise<WatchFolder>
  onEnableWatchFolder: (id: string) => Promise<boolean>
  onDisableWatchFolder: (id: string) => Promise<boolean>
  onRemoveWatchFolder: (id: string) => Promise<boolean>
  onToggleFile: (watchFolderId: string, filePath: string) => Promise<boolean>
  onSelectAll: (watchFolderId: string, selected: boolean) => Promise<boolean>
  onCreateJobs: (watchFolderId: string, selectedFiles: PendingFile[], presetId?: string) => void
  onClearPending: (watchFolderId: string, filePaths: string[]) => Promise<boolean>
}

/**
 * Status indicator component with clear visual state
 */
function StatusIndicator({ status, enabled }: { status: 'watching' | 'paused'; enabled: boolean }): React.ReactElement {
  const isActive = status === 'watching' && enabled
  
  return (
    <div
      data-testid="watch-folder-status-indicator"
      data-status={status}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.375rem',
      }}
    >
      {/* Status light - clear visual indicator */}
      <div
        data-testid="status-light"
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: isActive ? 'var(--status-success)' : 'var(--text-tertiary)',
          boxShadow: isActive ? '0 0 4px var(--status-success)' : 'none',
          transition: 'background 0.2s, box-shadow 0.2s',
        }}
      />
      {/* Status label - read-only, not clickable */}
      <span
        data-testid="status-label"
        style={{
          fontSize: '0.6875rem',
          fontWeight: 500,
          color: isActive ? 'var(--status-success)' : 'var(--text-tertiary)',
          textTransform: 'uppercase',
          letterSpacing: '0.025em',
          pointerEvents: 'none', // Not clickable
          userSelect: 'none',
        }}
      >
        {isActive ? 'Watching' : 'Paused'}
      </span>
    </div>
  )
}

/**
 * Counts display component - shows lifecycle counters
 */
function CountsDisplay({ counts, compact = false }: { counts: WatchFolderCounts; compact?: boolean }): React.ReactElement {
  if (compact) {
    // Compact view: only show staged if > 0
    if (counts.staged === 0) {
      return <span style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>No files staged</span>
    }
    return (
      <div 
        data-testid="counts-compact"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        <span
          data-testid="staged-count-badge"
          style={{
            padding: '0.125rem 0.5rem',
            background: 'var(--interactive-primary)',
            borderRadius: '10px',
            color: 'white',
            fontSize: '0.6875rem',
            fontWeight: 600,
          }}
        >
          {counts.staged} staged
        </span>
        {counts.failed > 0 && (
          <span
            data-testid="failed-count-badge"
            style={{
              padding: '0.125rem 0.5rem',
              background: 'var(--status-error)',
              borderRadius: '10px',
              color: 'white',
              fontSize: '0.6875rem',
              fontWeight: 600,
            }}
          >
            {counts.failed} failed
          </span>
        )}
      </div>
    )
  }
  
  // Full counts view
  return (
    <div
      data-testid="counts-full"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: '0.5rem',
        padding: '0.5rem',
        background: 'var(--surface-tertiary)',
        borderRadius: '4px',
        fontSize: '0.6875rem',
      }}
    >
      <CountBadge label="Detected" value={counts.detected} color="var(--text-secondary)" />
      <CountBadge label="Staged" value={counts.staged} color="var(--interactive-primary)" highlight={counts.staged > 0} />
      <CountBadge label="Jobs" value={counts.jobs_created} color="var(--text-secondary)" />
      <CountBadge label="Done" value={counts.completed} color="var(--status-success)" />
      <CountBadge label="Failed" value={counts.failed} color="var(--status-error)" highlight={counts.failed > 0} />
    </div>
  )
}

function CountBadge({ label, value, color, highlight = false }: { label: string; value: number; color: string; highlight?: boolean }): React.ReactElement {
  return (
    <div
      data-testid={`count-${label.toLowerCase()}`}
      style={{
        textAlign: 'center',
        padding: '0.25rem',
        background: highlight ? `${color}20` : 'transparent',
        borderRadius: '4px',
      }}
    >
      <div style={{ 
        fontSize: '1rem', 
        fontWeight: 600, 
        color: highlight ? color : 'var(--text-primary)',
      }}>
        {value}
      </div>
      <div style={{ color: 'var(--text-tertiary)', fontSize: '0.625rem' }}>{label}</div>
    </div>
  )
}

/**
 * Staged files preview - capped list for scalability
 */
function StagedFilesPreview({ 
  files, 
  onToggleFile,
  onSelectAll,
  watchFolderId,
}: { 
  files: PendingFile[]
  onToggleFile: (path: string) => void
  onSelectAll: (selected: boolean) => void
  watchFolderId: string
}): React.ReactElement {
  const displayFiles = files.slice(0, MAX_STAGED_PREVIEW)
  const hiddenCount = files.length - displayFiles.length
  const selectedCount = files.filter(f => f.selected).length
  
  const formatPath = (fullPath: string): string => {
    const parts = fullPath.split('/')
    return parts[parts.length - 1] || fullPath
  }
  
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }
  
  return (
    <div data-testid="staged-files-preview">
      {/* Selection controls */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '0.5rem',
        paddingBottom: '0.5rem',
        borderBottom: '1px solid var(--border-primary)',
      }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            data-testid={`select-all-${watchFolderId}`}
            onClick={() => onSelectAll(true)}
            style={{
              padding: '0.25rem 0.5rem',
              background: 'var(--surface-tertiary)',
              border: '1px solid var(--border-primary)',
              borderRadius: '4px',
              color: 'var(--text-secondary)',
              fontSize: '0.6875rem',
              cursor: 'pointer',
            }}
          >
            Select All
          </button>
          <button
            data-testid={`deselect-all-${watchFolderId}`}
            onClick={() => onSelectAll(false)}
            style={{
              padding: '0.25rem 0.5rem',
              background: 'var(--surface-tertiary)',
              border: '1px solid var(--border-primary)',
              borderRadius: '4px',
              color: 'var(--text-secondary)',
              fontSize: '0.6875rem',
              cursor: 'pointer',
            }}
          >
            Deselect All
          </button>
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          {selectedCount} of {files.length} selected
        </div>
      </div>
      
      {/* Capped file list */}
      <div 
        style={{ 
          maxHeight: '150px', 
          overflowY: 'auto',
          marginBottom: '0.5rem',
        }}
      >
        {displayFiles.map(file => (
          <div
            key={file.path}
            data-testid={`staged-file-${file.path}`}
            onClick={() => onToggleFile(file.path)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.375rem 0.5rem',
              background: file.selected ? 'var(--surface-tertiary)' : 'transparent',
              borderRadius: '4px',
              cursor: 'pointer',
              marginBottom: '0.125rem',
            }}
          >
            <input
              type="checkbox"
              checked={file.selected}
              onChange={() => {}} // Handled by parent click
              style={{ cursor: 'pointer' }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: '0.75rem',
              }}>
                {formatPath(file.path)}
              </div>
            </div>
            <div style={{ 
              fontSize: '0.6875rem', 
              color: 'var(--text-tertiary)',
              whiteSpace: 'nowrap',
            }}>
              {formatFileSize(file.size)}
            </div>
          </div>
        ))}
      </div>
      
      {/* Hidden files indicator */}
      {hiddenCount > 0 && (
        <div 
          data-testid="hidden-files-notice"
          style={{
            padding: '0.375rem',
            textAlign: 'center',
            color: 'var(--text-tertiary)',
            fontSize: '0.6875rem',
            fontStyle: 'italic',
          }}
        >
          +{hiddenCount} more files (not shown for performance)
        </div>
      )}
    </div>
  )
}

export function WatchFoldersPanel({
  watchFolders,
  presets,
  onAddWatchFolder,
  onEnableWatchFolder,
  onDisableWatchFolder,
  onRemoveWatchFolder,
  onToggleFile,
  onSelectAll,
  onCreateJobs,
  onClearPending,
}: WatchFoldersPanelProps): React.ReactElement {
  const [showAddForm, setShowAddForm] = useState(false)
  const [newFolderPath, setNewFolderPath] = useState('')
  const [newFolderRecursive, setNewFolderRecursive] = useState(true)
  const [newFolderPresetId, setNewFolderPresetId] = useState<string | undefined>()
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [showStagedFiles, setShowStagedFiles] = useState<Set<string>>(new Set())
  
  const hasElectron = typeof window !== 'undefined' && window.electron !== undefined
  
  const handleBrowseFolder = useCallback(async () => {
    if (!hasElectron || !window.electron?.openFolder) return
    const folder = await window.electron.openFolder()
    if (folder) {
      setNewFolderPath(folder)
    }
  }, [hasElectron])
  
  const handleAddFolder = useCallback(async () => {
    if (!newFolderPath.trim()) return
    
    const config: WatchFolderConfig = {
      path: newFolderPath.trim(),
      enabled: true,
      recursive: newFolderRecursive,
      preset_id: newFolderPresetId,
      include_extensions: DEFAULT_VIDEO_EXTENSIONS,
      exclude_patterns: DEFAULT_EXCLUDE_PATTERNS,
    }
    
    await onAddWatchFolder(config)
    
    setNewFolderPath('')
    setNewFolderRecursive(true)
    setNewFolderPresetId(undefined)
    setShowAddForm(false)
  }, [newFolderPath, newFolderRecursive, newFolderPresetId, onAddWatchFolder])
  
  const toggleExpanded = useCallback((id: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])
  
  const toggleShowStagedFiles = useCallback((id: string) => {
    setShowStagedFiles(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])
  
  /**
   * Create jobs from staged files
   * PHASE 6.5: Clear action with explicit semantics
   */
  const handleCreateJobs = useCallback((watchFolder: WatchFolder) => {
    const selectedFiles = watchFolder.pending_files.filter(f => f.selected)
    if (selectedFiles.length === 0) return
    
    if (!watchFolder.preset_id) {
      console.error(`[PHASE 6.5] Watch folder ${watchFolder.id} has no preset. Cannot create jobs.`)
    }
    
    onCreateJobs(watchFolder.id, selectedFiles, watchFolder.preset_id)
  }, [onCreateJobs])
  
  const handleClearAll = useCallback(async (watchFolder: WatchFolder) => {
    const filePaths = watchFolder.pending_files.map(f => f.path)
    await onClearPending(watchFolder.id, filePaths)
  }, [onClearPending])
  
  const formatPath = (fullPath: string): string => {
    const parts = fullPath.split('/')
    return parts[parts.length - 1] || fullPath
  }
  
  return (
    <div 
      data-testid="watch-folders-panel"
      style={{ 
        padding: '0.5rem',
        fontSize: '0.8125rem',
      }}
    >
      {/* Add Watch Folder Button */}
      {!showAddForm && (
        <button
          data-testid="add-watch-folder-button"
          onClick={() => setShowAddForm(true)}
          style={{
            width: '100%',
            padding: '0.5rem',
            marginBottom: '0.5rem',
            background: 'var(--interactive-primary)',
            border: 'none',
            borderRadius: '4px',
            color: 'white',
            cursor: 'pointer',
            fontSize: '0.8125rem',
            fontWeight: 500,
          }}
        >
          + Add Watch Folder
        </button>
      )}
      
      {/* Add Form */}
      {showAddForm && (
        <div 
          data-testid="add-watch-folder-form"
          style={{ 
            marginBottom: '0.75rem',
            padding: '0.75rem',
            background: 'var(--surface-tertiary)',
            borderRadius: '4px',
          }}
        >
          <div style={{ marginBottom: '0.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>
              Folder Path
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                data-testid="watch-folder-path-input"
                type="text"
                value={newFolderPath}
                onChange={(e) => setNewFolderPath(e.target.value)}
                placeholder="/path/to/watch"
                style={{
                  flex: 1,
                  padding: '0.375rem 0.5rem',
                  background: 'var(--surface-primary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '4px',
                  color: 'var(--text-primary)',
                  fontSize: '0.8125rem',
                }}
              />
              <button
                data-testid="browse-folder-button"
                onClick={handleBrowseFolder}
                style={{
                  padding: '0.375rem 0.75rem',
                  background: 'var(--surface-secondary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '4px',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                Browse
              </button>
            </div>
          </div>
          
          <div style={{ marginBottom: '0.5rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                data-testid="watch-folder-recursive-checkbox"
                type="checkbox"
                checked={newFolderRecursive}
                onChange={(e) => setNewFolderRecursive(e.target.checked)}
              />
              <span>Watch subdirectories recursively</span>
            </label>
          </div>
          
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>
              Preset <span style={{ color: 'rgb(239, 68, 68)', fontWeight: 500 }}>*</span>
              <span style={{ fontSize: '0.6875rem', marginLeft: '0.5rem', color: 'var(--text-tertiary)' }}>
                (required for job creation)
              </span>
            </label>
            <select
              data-testid="watch-folder-preset-select"
              value={newFolderPresetId || ''}
              onChange={(e) => setNewFolderPresetId(e.target.value || undefined)}
              style={{
                width: '100%',
                padding: '0.375rem 0.5rem',
                background: 'var(--surface-primary)',
                border: newFolderPresetId ? '1px solid var(--border-primary)' : '1px solid rgba(239, 68, 68, 0.5)',
                borderRadius: '4px',
                color: 'var(--text-primary)',
                fontSize: '0.8125rem',
              }}
            >
              <option value="">Select a preset...</option>
              {presets.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {!newFolderPresetId && (
              <div style={{ 
                marginTop: '0.25rem', 
                fontSize: '0.6875rem', 
                color: 'rgb(239, 68, 68)' 
              }}>
                A preset is required to create jobs from watch folders.
              </div>
            )}
          </div>
          
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              data-testid="confirm-add-watch-folder"
              onClick={handleAddFolder}
              disabled={!newFolderPath.trim()}
              style={{
                flex: 1,
                padding: '0.5rem',
                background: newFolderPath.trim() ? 'var(--interactive-primary)' : 'var(--surface-secondary)',
                border: 'none',
                borderRadius: '4px',
                color: 'white',
                cursor: newFolderPath.trim() ? 'pointer' : 'not-allowed',
                opacity: newFolderPath.trim() ? 1 : 0.5,
              }}
            >
              Add & Start Watching
            </button>
            <button
              data-testid="cancel-add-watch-folder"
              onClick={() => {
                setShowAddForm(false)
                setNewFolderPath('')
              }}
              style={{
                padding: '0.5rem 1rem',
                background: 'var(--surface-secondary)',
                border: '1px solid var(--border-primary)',
                borderRadius: '4px',
                color: 'var(--text-primary)',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      
      {/* Empty state */}
      {watchFolders.length === 0 && !showAddForm && (
        <div style={{ 
          padding: '1rem',
          textAlign: 'center',
          color: 'var(--text-tertiary)',
        }}>
          No watch folders configured.
          <br />
          <span style={{ fontSize: '0.75rem' }}>
            Add a folder to automatically detect new media files.
          </span>
        </div>
      )}
      
      {/* Watch Folders List */}
      {watchFolders.map(wf => {
        const isExpanded = expandedFolders.has(wf.id)
        const showFiles = showStagedFiles.has(wf.id)
        const selectedCount = wf.pending_files.filter(f => f.selected).length
        const stagedCount = wf.counts?.staged ?? wf.pending_files.length
        // Ensure counts object exists (backwards compatibility)
        const counts: WatchFolderCounts = wf.counts || {
          detected: wf.pending_files.length,
          staged: wf.pending_files.length,
          jobs_created: 0,
          completed: 0,
          failed: 0,
        }
        
        return (
          <div 
            key={wf.id}
            data-testid={`watch-folder-${wf.id}`}
            style={{
              marginBottom: '0.5rem',
              background: 'var(--surface-secondary)',
              borderRadius: '4px',
              overflow: 'hidden',
            }}
          >
            {/* Collapsed Header - Shows key info */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0.5rem',
                gap: '0.5rem',
                borderBottom: isExpanded ? '1px solid var(--border-primary)' : 'none',
              }}
            >
              {/* Expand/collapse button */}
              <button
                data-testid={`toggle-watch-folder-${wf.id}`}
                onClick={() => toggleExpanded(wf.id)}
                aria-label={isExpanded ? 'Collapse' : 'Expand'}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  padding: '0.25rem',
                  transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                  transition: 'transform 0.15s',
                }}
              >
                ▶
              </button>
              
              {/* Folder name and path */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ 
                  fontWeight: 500,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {formatPath(wf.path)}
                </div>
                <div style={{ 
                  fontSize: '0.6875rem',
                  color: 'var(--text-tertiary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {wf.path}
                  {wf.recursive && ' (recursive)'}
                </div>
              </div>
              
              {/* Status indicator (read-only) */}
              <StatusIndicator status={wf.status || (wf.enabled ? 'watching' : 'paused')} enabled={wf.enabled} />
              
              {/* Counts badge (compact) */}
              <CountsDisplay counts={counts} compact={true} />
              
              {/* Pause/Resume action button */}
              <button
                data-testid={`pause-resume-${wf.id}`}
                onClick={() => wf.enabled ? onDisableWatchFolder(wf.id) : onEnableWatchFolder(wf.id)}
                style={{
                  padding: '0.25rem 0.5rem',
                  background: 'var(--surface-tertiary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '4px',
                  color: 'var(--text-primary)',
                  fontSize: '0.6875rem',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                {wf.enabled ? 'Pause' : 'Resume'}
              </button>
              
              {/* Remove button */}
              <button
                data-testid={`remove-watch-folder-${wf.id}`}
                onClick={() => onRemoveWatchFolder(wf.id)}
                aria-label="Remove watch folder"
                style={{
                  padding: '0.25rem 0.5rem',
                  background: 'var(--surface-tertiary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '4px',
                  color: 'var(--status-error)',
                  fontSize: '0.6875rem',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>
            
            {/* Error message */}
            {wf.error && (
              <div 
                data-testid={`watch-folder-error-${wf.id}`}
                style={{
                  padding: '0.5rem',
                  background: 'var(--status-error-bg)',
                  color: 'var(--status-error)',
                  fontSize: '0.75rem',
                }}
              >
                ⚠ {wf.error}
              </div>
            )}
            
            {/* Expanded content */}
            {isExpanded && (
              <div style={{ padding: '0.5rem' }}>
                {/* Full counts display */}
                <CountsDisplay counts={counts} compact={false} />
                
                {/* Preset warning */}
                {!wf.preset_id && (
                  <div 
                    data-testid={`preset-warning-${wf.id}`}
                    style={{
                      marginTop: '0.5rem',
                      padding: '0.5rem',
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: '4px',
                      color: 'rgb(239, 68, 68)',
                      fontSize: '0.75rem',
                    }}
                  >
                    ⚠️ No preset configured. Cannot create jobs.
                  </div>
                )}
                
                {/* Staged files section */}
                {stagedCount > 0 && (
                  <div style={{ marginTop: '0.5rem' }}>
                    {/* Helper text for Create Jobs */}
                    <div 
                      data-testid="create-jobs-helper"
                      style={{
                        padding: '0.5rem',
                        marginBottom: '0.5rem',
                        background: 'rgba(var(--interactive-primary-rgb, 59, 130, 246), 0.1)',
                        border: '1px solid rgba(var(--interactive-primary-rgb, 59, 130, 246), 0.3)',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      📁 <strong>{stagedCount} files detected.</strong> Click "Create Jobs" to encode them.
                    </div>
                    
                    {/* View staged files toggle */}
                    <button
                      data-testid={`toggle-staged-files-${wf.id}`}
                      onClick={() => toggleShowStagedFiles(wf.id)}
                      style={{
                        width: '100%',
                        padding: '0.375rem',
                        marginBottom: '0.5rem',
                        background: 'var(--surface-tertiary)',
                        border: '1px solid var(--border-primary)',
                        borderRadius: '4px',
                        color: 'var(--text-secondary)',
                        fontSize: '0.6875rem',
                        cursor: 'pointer',
                        textAlign: 'center',
                      }}
                    >
                      {showFiles ? '▲ Hide staged files' : `▼ View staged files (${Math.min(stagedCount, MAX_STAGED_PREVIEW)} of ${stagedCount})`}
                    </button>
                    
                    {/* Staged files preview (capped) */}
                    {showFiles && (
                      <StagedFilesPreview
                        files={wf.pending_files}
                        onToggleFile={(path) => onToggleFile(wf.id, path)}
                        onSelectAll={(selected) => onSelectAll(wf.id, selected)}
                        watchFolderId={wf.id}
                      />
                    )}
                    
                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                      <button
                        data-testid={`create-jobs-${wf.id}`}
                        onClick={() => handleCreateJobs(wf)}
                        disabled={selectedCount === 0 || !wf.preset_id}
                        title={!wf.preset_id ? 'Configure a preset first' : `Create ${selectedCount} jobs`}
                        style={{
                          flex: 1,
                          padding: '0.5rem',
                          background: (selectedCount > 0 && wf.preset_id) ? 'var(--interactive-primary)' : 'var(--surface-tertiary)',
                          border: !wf.preset_id ? '1px solid rgba(239, 68, 68, 0.5)' : 'none',
                          borderRadius: '4px',
                          color: 'white',
                          cursor: (selectedCount > 0 && wf.preset_id) ? 'pointer' : 'not-allowed',
                          opacity: (selectedCount > 0 && wf.preset_id) ? 1 : 0.5,
                          fontWeight: 500,
                        }}
                      >
                        {wf.preset_id ? `Create Jobs (${selectedCount})` : 'No Preset'}
                      </button>
                      <button
                        data-testid={`clear-staged-${wf.id}`}
                        onClick={() => handleClearAll(wf)}
                        style={{
                          padding: '0.5rem 1rem',
                          background: 'var(--surface-tertiary)',
                          border: '1px solid var(--border-primary)',
                          borderRadius: '4px',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                        }}
                      >
                        Clear All
                      </button>
                    </div>
                  </div>
                )}
                
                {/* Empty staged state */}
                {stagedCount === 0 && (
                  <div style={{ 
                    marginTop: '0.5rem',
                    padding: '1rem',
                    textAlign: 'center',
                    color: 'var(--text-tertiary)',
                    fontSize: '0.75rem',
                  }}>
                    No files staged.
                    <br />
                    {wf.enabled 
                      ? 'New files will appear here when detected.'
                      : 'Resume watching to detect new files.'}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
