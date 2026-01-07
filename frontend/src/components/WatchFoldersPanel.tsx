/**
 * WatchFoldersPanel — First-Class Watch Folder Management UI
 * 
 * Provides visibility and control for automated watch folder jobs.
 * Does NOT alter execution behavior — only exposes existing functionality.
 * 
 * STATUS MEANINGS:
 * - OK: Watch folder enabled and monitoring
 * - DISABLED: Explicitly disabled by user
 * - ERROR: Failed to initialize or watch (details shown)
 * 
 * RESPONSIBILITIES:
 * - Display all configured watch folders
 * - CRUD operations (Add, Edit, Remove)
 * - Status visibility (OK, DISABLED, ERROR)
 * - Error display (persistent until user action)
 * - Activity tracking (job count, last activity)
 * 
 * NON-RESPONSIBILITIES:
 * - Job creation (delegated to existing integration)
 * - Execution logic (no changes to watch folder engine)
 * - Filesystem browsing (text input only)
 * - Auto-retry or auto-clear errors
 */

import { useState, useCallback, useMemo } from 'react'
import { Button } from './Button'
import type { WatchFolder } from '../types/watchFolders'
import type { Preset } from '../hooks/usePresets'

interface WatchFolderWithStatus extends WatchFolder {
  status: 'OK' | 'DISABLED' | 'ERROR'
  error_message?: string
  job_count: number
  last_activity: string | null
}

interface WatchFoldersPanelProps {
  watchFolders: WatchFolder[]
  presets: Preset[]
  watchFolderEvents: Array<{
    watch_folder_id: string
    timestamp: string
    eligible: boolean
    job_id?: string
  }>
  watchFolderErrors: Map<string, string>
  onAddWatchFolder: (config: Omit<WatchFolder, 'id'>) => string
  onUpdateWatchFolder: (id: string, updates: Partial<Omit<WatchFolder, 'id'>>) => void
  onRemoveWatchFolder: (id: string) => void
  onEnableWatchFolder: (id: string) => void
  onDisableWatchFolder: (id: string) => void
  onClearError: (id: string) => void
}

export function WatchFoldersPanel({
  watchFolders,
  presets,
  watchFolderEvents,
  watchFolderErrors,
  onAddWatchFolder,
  onUpdateWatchFolder,
  onRemoveWatchFolder,
  onEnableWatchFolder,
  onDisableWatchFolder,
  onClearError,
}: WatchFoldersPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  
  // Form state
  const [formPath, setFormPath] = useState('')
  const [formPresetId, setFormPresetId] = useState('')
  const [formExtensions, setFormExtensions] = useState('')
  const [formExcludePatterns, setFormExcludePatterns] = useState('')

  // Compute watch folder statuses
  const watchFoldersWithStatus = useMemo((): WatchFolderWithStatus[] => {
    return watchFolders.map(wf => {
      // Check for error
      const error_message = watchFolderErrors.get(wf.id)
      
      // Determine status
      let status: 'OK' | 'DISABLED' | 'ERROR'
      if (error_message) {
        status = 'ERROR'
      } else if (!wf.enabled) {
        status = 'DISABLED'
      } else {
        status = 'OK'
      }
      
      // Count jobs created by this watch folder
      const job_count = watchFolderEvents.filter(
        e => e.watch_folder_id === wf.id && e.eligible && e.job_id
      ).length
      
      // Find last activity
      const events = watchFolderEvents.filter(e => e.watch_folder_id === wf.id)
      const last_activity = events.length > 0 ? events[events.length - 1].timestamp : null
      
      return {
        ...wf,
        status,
        error_message,
        job_count,
        last_activity,
      }
    })
  }, [watchFolders, watchFolderEvents, watchFolderErrors])

  const resetForm = useCallback(() => {
    setFormPath('')
    setFormPresetId('')
    setFormExtensions('')
    setFormExcludePatterns('')
    setEditingId(null)
    setShowAddForm(false)
  }, [])

  const handleAdd = useCallback(() => {
    if (!formPath.trim() || !formPresetId) {
      alert('Path and preset are required')
      return
    }
    
    const config: Omit<WatchFolder, 'id'> = {
      path: formPath.trim(),
      preset_id: formPresetId,
      enabled: true,
      recursive: true,
      include_extensions: formExtensions.trim() 
        ? formExtensions.split(',').map(s => s.trim()).filter(Boolean)
        : undefined,
      exclude_patterns: formExcludePatterns.trim()
        ? formExcludePatterns.split(',').map(s => s.trim()).filter(Boolean)
        : undefined,
    }
    
    onAddWatchFolder(config)
    resetForm()
  }, [formPath, formPresetId, formExtensions, formExcludePatterns, onAddWatchFolder, resetForm])

  const handleEdit = useCallback((wf: WatchFolderWithStatus) => {
    setEditingId(wf.id)
    setFormPath(wf.path)
    setFormPresetId(wf.preset_id)
    setFormExtensions(wf.include_extensions?.join(', ') || '')
    setFormExcludePatterns(wf.exclude_patterns?.join(', ') || '')
    setShowAddForm(false)
  }, [])

  const handleUpdate = useCallback(() => {
    if (!editingId || !formPath.trim() || !formPresetId) {
      alert('Path and preset are required')
      return
    }
    
    const updates: Partial<Omit<WatchFolder, 'id'>> = {
      path: formPath.trim(),
      preset_id: formPresetId,
      include_extensions: formExtensions.trim()
        ? formExtensions.split(',').map(s => s.trim()).filter(Boolean)
        : undefined,
      exclude_patterns: formExcludePatterns.trim()
        ? formExcludePatterns.split(',').map(s => s.trim()).filter(Boolean)
        : undefined,
    }
    
    onUpdateWatchFolder(editingId, updates)
    resetForm()
  }, [editingId, formPath, formPresetId, formExtensions, formExcludePatterns, onUpdateWatchFolder, resetForm])

  const handleRemove = useCallback((id: string) => {
    if (confirm('Remove this watch folder? This will not delete any files.')) {
      onRemoveWatchFolder(id)
    }
  }, [onRemoveWatchFolder])

  const handleToggleEnabled = useCallback((wf: WatchFolderWithStatus) => {
    if (wf.enabled) {
      onDisableWatchFolder(wf.id)
    } else {
      onEnableWatchFolder(wf.id)
    }
  }, [onEnableWatchFolder, onDisableWatchFolder])

  const formatTimestamp = (timestamp: string | null): string => {
    if (!timestamp) return 'Never'
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)
    
    if (days > 0) return `${days}d ago`
    if (hours > 0) return `${hours}h ago`
    if (minutes > 0) return `${minutes}m ago`
    return 'Just now'
  }

  const getPresetName = (presetId: string): string => {
    const preset = presets.find(p => p.id === presetId)
    return preset?.name || `Unknown (${presetId})`
  }

  const getStatusColor = (status: 'OK' | 'DISABLED' | 'ERROR'): string => {
    switch (status) {
      case 'OK': return 'var(--status-completed-fg)'
      case 'DISABLED': return 'var(--text-dim)'
      case 'ERROR': return 'var(--status-failed-fg)'
    }
  }

  return (
    <div
      data-testid="watch-folders-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--surface-primary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '1rem',
          borderBottom: '1px solid var(--border-primary)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--surface-secondary)',
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: '1rem',
            fontWeight: 600,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-sans)',
          }}
        >
          Watch Folders
        </h2>
        <Button
          data-testid="add-watch-folder-button"
          variant="primary"
          size="sm"
          onClick={() => {
            setShowAddForm(true)
            setEditingId(null)
            resetForm()
          }}
        >
          + Add Watch Folder
        </Button>
      </div>

      {/* Add/Edit Form */}
      {(showAddForm || editingId) && (
        <div
          style={{
            padding: '1rem',
            background: 'var(--surface-secondary)',
            borderBottom: '1px solid var(--border-primary)',
          }}
        >
          <h3
            style={{
              margin: '0 0 0.75rem 0',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}
          >
            {editingId ? 'Edit Watch Folder' : 'Add Watch Folder'}
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <label
                style={{
                  display: 'block',
                  marginBottom: '0.25rem',
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary)',
                }}
              >
                Folder Path *
              </label>
              <input
                type="text"
                value={formPath}
                onChange={e => setFormPath(e.target.value)}
                placeholder="/path/to/watch/folder"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  fontSize: '0.875rem',
                  background: 'var(--surface-primary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono)',
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  marginBottom: '0.25rem',
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary)',
                }}
              >
                Preset *
              </label>
              <select
                value={formPresetId}
                onChange={e => setFormPresetId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  fontSize: '0.875rem',
                  background: 'var(--surface-primary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                }}
              >
                <option value="">Select preset...</option>
                {presets.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  marginBottom: '0.25rem',
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary)',
                }}
              >
                Include Extensions (comma-separated)
              </label>
              <input
                type="text"
                value={formExtensions}
                onChange={e => setFormExtensions(e.target.value)}
                placeholder="mov, mp4, mxf, braw"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  fontSize: '0.875rem',
                  background: 'var(--surface-primary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono)',
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  marginBottom: '0.25rem',
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary)',
                }}
              >
                Exclude Patterns (comma-separated)
              </label>
              <input
                type="text"
                value={formExcludePatterns}
                onChange={e => setFormExcludePatterns(e.target.value)}
                placeholder="/Proxy/, /\.cache/"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  fontSize: '0.875rem',
                  background: 'var(--surface-primary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono)',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <Button
                variant="ghost"
                size="sm"
                onClick={resetForm}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={editingId ? handleUpdate : handleAdd}
              >
                {editingId ? 'Update' : 'Add'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Watch Folder List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1rem',
        }}
      >
        {watchFoldersWithStatus.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '3rem 1rem',
              color: 'var(--text-dim)',
              fontSize: '0.875rem',
            }}
          >
            No watch folders configured.
            <br />
            Add a watch folder to automate job creation.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {watchFoldersWithStatus.map(wf => (
              <div
                key={wf.id}
                data-testid={`watch-folder-${wf.id}`}
                style={{
                  padding: '1rem',
                  background: 'var(--surface-secondary)',
                  border: `1px solid ${wf.status === 'ERROR' ? 'var(--error-border)' : 'var(--border-primary)'}`,
                  borderRadius: 'var(--radius-md)',
                }}
              >
                {/* Header Row */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '0.75rem',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        marginBottom: '0.25rem',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color: getStatusColor(wf.status),
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                        }}
                      >
                        {wf.status}
                      </span>
                      {wf.status === 'OK' && (
                        <span style={{ color: 'var(--status-completed-fg)' }}>●</span>
                      )}
                    </div>
                    <div
                      title={wf.path}
                      style={{
                        fontSize: '0.875rem',
                        color: 'var(--text-primary)',
                        fontFamily: 'var(--font-mono)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {wf.path}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleEnabled(wf)}
                    >
                      {wf.enabled ? 'Disable' : 'Enable'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(wf)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemove(wf.id)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>

                {/* Details Grid */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    gap: '0.75rem',
                    fontSize: '0.75rem',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <div>
                    <div style={{ color: 'var(--text-dim)', marginBottom: '0.125rem' }}>
                      Preset
                    </div>
                    <div style={{ color: 'var(--text-primary)' }}>
                      {getPresetName(wf.preset_id)}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-dim)', marginBottom: '0.125rem' }}>
                      Jobs Created
                    </div>
                    <div style={{ color: 'var(--text-primary)' }}>
                      {wf.job_count}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-dim)', marginBottom: '0.125rem' }}>
                      Last Activity
                    </div>
                    <div style={{ color: 'var(--text-primary)' }}>
                      {formatTimestamp(wf.last_activity)}
                    </div>
                  </div>
                </div>

                {/* Error Display */}
                {wf.error_message && (
                  <div
                    style={{
                      marginTop: '0.75rem',
                      padding: '0.75rem',
                      background: 'var(--error-bg)',
                      border: '1px solid var(--error-border)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: '0.5rem',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: 'var(--error-fg)',
                            marginBottom: '0.25rem',
                          }}
                        >
                          ERROR
                        </div>
                        <div
                          style={{
                            fontSize: '0.75rem',
                            color: 'var(--error-fg)',
                            lineHeight: 1.4,
                          }}
                        >
                          {wf.error_message}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onClearError(wf.id)}
                        style={{
                          flexShrink: 0,
                          color: 'var(--error-fg)',
                        }}
                      >
                        Clear
                      </Button>
                    </div>
                  </div>
                )}

                {/* Optional Details */}
                {(wf.include_extensions || wf.exclude_patterns) && (
                  <div
                    style={{
                      marginTop: '0.75rem',
                      paddingTop: '0.75rem',
                      borderTop: '1px solid var(--border-primary)',
                      fontSize: '0.75rem',
                      color: 'var(--text-dim)',
                    }}
                  >
                    {wf.include_extensions && (
                      <div>
                        Extensions: {wf.include_extensions.join(', ')}
                      </div>
                    )}
                    {wf.exclude_patterns && (
                      <div>
                        Exclude: {wf.exclude_patterns.join(', ')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
