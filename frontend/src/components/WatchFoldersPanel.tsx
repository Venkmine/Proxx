/**
 * Watch Folders Panel V2
 * 
 * INTENT.md Compliance:
 * - Detection is automatic (files appear in pending list)
 * - Execution is MANUAL (operator must click "Create Jobs")
 * - No auto-retry, no silent automation
 * - Full visibility of pending files
 * 
 * UI Model:
 * - Each watch folder shows its pending files
 * - Operator selects which pending files to process
 * - "Create Jobs" button creates jobs from selected files
 * - Files remain pending until explicitly processed or cleared
 */

import React, { useState, useCallback, useEffect } from 'react'
import type { WatchFolder, PendingFile, WatchFolderConfig } from '../types/watchFolders'
import { DEFAULT_VIDEO_EXTENSIONS, DEFAULT_EXCLUDE_PATTERNS } from '../types/watchFolders'

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
      enabled: true, // Start watching immediately
      recursive: newFolderRecursive,
      preset_id: newFolderPresetId,
      include_extensions: DEFAULT_VIDEO_EXTENSIONS,
      exclude_patterns: DEFAULT_EXCLUDE_PATTERNS,
    }
    
    await onAddWatchFolder(config)
    
    // Reset form
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
  
  /**
   * PHASE 6: Create jobs requires preset.
   * Fails LOUDLY if no preset is configured.
   */
  const handleCreateJobs = useCallback((watchFolder: WatchFolder) => {
    const selectedFiles = watchFolder.pending_files.filter(f => f.selected)
    if (selectedFiles.length === 0) return
    
    // PHASE 6: Enforce preset requirement with visible error
    if (!watchFolder.preset_id) {
      console.error(`[PHASE 6] Watch folder ${watchFolder.id} has no preset. Cannot create jobs.`)
      // The App.tsx handler will show the alert, but we log here too
    }
    
    onCreateJobs(watchFolder.id, selectedFiles, watchFolder.preset_id)
  }, [onCreateJobs])
  
  const handleClearAll = useCallback(async (watchFolder: WatchFolder) => {
    const filePaths = watchFolder.pending_files.map(f => f.path)
    await onClearPending(watchFolder.id, filePaths)
  }, [onClearPending])
  
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }
  
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
      
      {/* Watch Folders List */}
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
      
      {watchFolders.map(wf => {
        const isExpanded = expandedFolders.has(wf.id)
        const selectedCount = wf.pending_files.filter(f => f.selected).length
        const totalPending = wf.pending_files.length
        
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
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0.5rem',
                gap: '0.5rem',
                borderBottom: isExpanded ? '1px solid var(--border-primary)' : 'none',
              }}
            >
              <button
                data-testid={`toggle-watch-folder-${wf.id}`}
                onClick={() => toggleExpanded(wf.id)}
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
              
              {/* Pending count badge */}
              {totalPending > 0 && (
                <div 
                  data-testid={`pending-count-${wf.id}`}
                  style={{
                    padding: '0.125rem 0.5rem',
                    background: 'var(--interactive-primary)',
                    borderRadius: '10px',
                    color: 'white',
                    fontSize: '0.6875rem',
                    fontWeight: 600,
                  }}
                >
                  {totalPending} pending
                </div>
              )}
              
              {/* Enable/Disable toggle */}
              <button
                data-testid={`toggle-enabled-${wf.id}`}
                onClick={() => wf.enabled ? onDisableWatchFolder(wf.id) : onEnableWatchFolder(wf.id)}
                style={{
                  padding: '0.25rem 0.5rem',
                  background: wf.enabled ? 'var(--status-success)' : 'var(--surface-tertiary)',
                  border: 'none',
                  borderRadius: '4px',
                  color: wf.enabled ? 'white' : 'var(--text-secondary)',
                  fontSize: '0.6875rem',
                  cursor: 'pointer',
                }}
              >
                {wf.enabled ? 'Watching' : 'Paused'}
              </button>
              
              {/* Remove button */}
              <button
                data-testid={`remove-watch-folder-${wf.id}`}
                onClick={() => onRemoveWatchFolder(wf.id)}
                style={{
                  padding: '0.25rem 0.5rem',
                  background: 'var(--status-error)',
                  border: 'none',
                  borderRadius: '4px',
                  color: 'white',
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
            
            {/* Expanded content: pending files */}
            {isExpanded && (
              <div style={{ padding: '0.5rem' }}>
                {totalPending === 0 ? (
                  <div style={{ 
                    padding: '1rem',
                    textAlign: 'center',
                    color: 'var(--text-tertiary)',
                    fontSize: '0.75rem',
                  }}>
                    No pending files.
                    <br />
                    {wf.enabled 
                      ? 'New files will appear here when detected.'
                      : 'Enable watching to detect new files.'}
                  </div>
                ) : (
                  <>
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
                          data-testid={`select-all-${wf.id}`}
                          onClick={() => onSelectAll(wf.id, true)}
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
                          data-testid={`deselect-all-${wf.id}`}
                          onClick={() => onSelectAll(wf.id, false)}
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
                        {selectedCount} of {totalPending} selected
                      </div>
                    </div>
                    
                    {/* File list */}
                    <div 
                      style={{ 
                        maxHeight: '150px', 
                        overflowY: 'auto',
                        marginBottom: '0.5rem',
                      }}
                    >
                      {wf.pending_files.map(file => (
                        <div
                          key={file.path}
                          data-testid={`pending-file-${file.path}`}
                          onClick={() => onToggleFile(wf.id, file.path)}
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
                    
                    {/* PHASE 6: Preset warning */}
                    {!wf.preset_id && (
                      <div 
                        data-testid={`preset-warning-${wf.id}`}
                        style={{
                          padding: '0.5rem',
                          marginBottom: '0.5rem',
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
                    
                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        data-testid={`create-jobs-${wf.id}`}
                        onClick={() => handleCreateJobs(wf)}
                        disabled={selectedCount === 0 || !wf.preset_id}
                        title={!wf.preset_id ? 'Configure a preset first' : undefined}
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
                        data-testid={`clear-pending-${wf.id}`}
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
                  </>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
