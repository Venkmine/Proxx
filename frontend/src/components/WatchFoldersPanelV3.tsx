/**
 * Watch Folders Panel V3 — PHASE 8: INGEST SOURCE ALIGNMENT
 * 
 * INTENT.md Compliance:
 * - Detection is automatic (files appear in staged count)
 * - Execution is MANUAL (operator must click "Create Jobs") UNLESS ARMED
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
 * 
 * PHASE 7 ADDITIONS:
 * G) Armed Mode: Auto job creation when armed
 * H) Arm/Disarm UI: Clear visual distinction for armed state
 * I) Pre-arm Validation: UI shows why arming is blocked
 * 
 * PHASE 8: INGEST SOURCE ALIGNMENT (Structure Only)
 * J) Counts-Only Display: No per-file UI (10k files = same UI as 1 file)
 * K) IngestSource Mental Model: Watch folders as ingest sources
 * L) Last Activity Timestamp: Show when files were last detected
 * M) Future-Ready: Prepared for copy-then-transcode (no behavior yet)
 */

import React, { useState, useCallback } from 'react'
import type { WatchFolder, PendingFile, WatchFolderConfig, WatchFolderCounts, ArmBlockReason } from '../types/watchFolders'
import { DEFAULT_VIDEO_EXTENSIONS, DEFAULT_EXCLUDE_PATTERNS } from '../types/watchFolders'

/** 
 * PHASE 8: File list preview disabled
 * UI now shows counts only - 1 file and 10,000 files produce identical UI
 */
const SHOW_FILE_LIST = false

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
  // PHASE 7: Armed watch folder callbacks
  onArmWatchFolder?: (id: string) => Promise<{ success: boolean; blockReasons?: ArmBlockReason[] }>
  onDisarmWatchFolder?: (id: string) => Promise<boolean>
}

/**
 * Status indicator component with clear visual state
 * PHASE 7: Added 'armed' status with distinct orange styling
 */
function StatusIndicator({ status, enabled }: { status: 'watching' | 'paused' | 'armed'; enabled: boolean }): React.ReactElement {
  const isActive = (status === 'watching' || status === 'armed') && enabled
  const isArmed = status === 'armed' && enabled
  
  // PHASE 7: Armed state uses orange to indicate auto-action mode
  const getStatusColor = () => {
    if (isArmed) return 'rgb(251, 146, 60)' // Orange for armed
    if (isActive) return 'var(--status-success)' // Green for watching
    return 'var(--text-tertiary)' // Gray for paused
  }
  
  const getStatusLabel = () => {
    if (isArmed) return 'Armed'
    if (isActive) return 'Watching'
    return 'Paused'
  }
  
  const statusColor = getStatusColor()
  
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
          background: statusColor,
          boxShadow: isActive ? `0 0 4px ${statusColor}` : 'none',
          transition: 'background 0.2s, box-shadow 0.2s',
        }}
      />
      {/* Status label - read-only, not clickable */}
      <span
        data-testid="status-label"
        style={{
          fontSize: '0.6875rem',
          fontWeight: 500,
          color: statusColor,
          textTransform: 'uppercase',
          letterSpacing: '0.025em',
          pointerEvents: 'none', // Not clickable
          userSelect: 'none',
        }}
      >
        {getStatusLabel()}
      </span>
    </div>
  )
}

/**
 * Counts display component - shows lifecycle counters
 * PHASE 8: Primary UI - always visible, file lists removed
 */
function CountsDisplay({ counts, compact = false }: { counts: WatchFolderCounts; compact?: boolean }): React.ReactElement {
  if (compact) {
    // Compact view: show staged count prominently
    if (counts.staged === 0) {
      return <span style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>No files staged</span>
    }
    return (
      <span style={{ 
        fontSize: '0.6875rem', 
        fontWeight: 600,
        color: 'var(--interactive-primary)',
        padding: '0.25rem 0.5rem',
        background: 'rgba(var(--interactive-primary-rgb, 59, 130, 246), 0.1)',
        borderRadius: '4px',
      }}>
        {counts.staged} staged
      </span>
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
 * PHASE 8: Staged files summary - counts only, no file lists
 * UI does not grow with file count - 1 file and 10,000 files show identically
 */
function StagedFilesSummary({ 
  fileCount,
  selectedCount,
  lastActivityAt,
  onSelectAll,
  watchFolderId,
}: { 
  fileCount: number
  selectedCount: number
  lastActivityAt: string
  onSelectAll: (selected: boolean) => void
  watchFolderId: string
}): React.ReactElement {
  const formatTimestamp = (isoString: string): string => {
    const date = new Date(isoString)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    
    if (seconds < 60) return 'just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    return date.toLocaleDateString()
  }
  
  return (
    <div data-testid="staged-files-summary">
      {/* Summary card - shows counts only */}
      <div style={{
        padding: '0.75rem',
        background: 'var(--surface-tertiary)',
        borderRadius: '4px',
        marginBottom: '0.5rem',
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.5rem',
        }}>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              {fileCount}
            </div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>
              {fileCount === 1 ? 'file ready' : 'files ready'}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.6875rem', color: 'var(--text-secondary)' }}>
              Last activity
            </div>
            <div style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-primary)' }}>
              {formatTimestamp(lastActivityAt)}
            </div>
          </div>
        </div>
        
        {/* Selection controls */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          paddingTop: '0.5rem',
          borderTop: '1px solid var(--border-primary)',
        }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            {selectedCount} of {fileCount} selected
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              data-testid={`select-all-${watchFolderId}`}
              onClick={() => onSelectAll(true)}
              style={{
                padding: '0.25rem 0.5rem',
                background: 'var(--surface-primary)',
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
                background: 'var(--surface-primary)',
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
        </div>
      </div>
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
  // PHASE 7: Armed watch folder callbacks
  onArmWatchFolder,
  onDisarmWatchFolder,
}: WatchFoldersPanelProps): React.ReactElement {
  const [showAddForm, setShowAddForm] = useState(false)
  const [newFolderPath, setNewFolderPath] = useState('')
  const [newFolderRecursive, setNewFolderRecursive] = useState(true)
  const [newFolderPresetId, setNewFolderPresetId] = useState<string | undefined>()
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [armBlockReasons, setArmBlockReasons] = useState<Map<string, ArmBlockReason[]>>(new Map())
  
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
  
  /**
   * PHASE 7: Arm a watch folder for auto job creation
   */
  const handleArmWatchFolder = useCallback(async (id: string) => {
    if (!onArmWatchFolder) return
    
    const result = await onArmWatchFolder(id)
    if (!result.success && result.blockReasons) {
      // Store block reasons for display
      setArmBlockReasons(prev => new Map(prev).set(id, result.blockReasons!))
      // Clear after 5 seconds
      setTimeout(() => {
        setArmBlockReasons(prev => {
          const next = new Map(prev)
          next.delete(id)
          return next
        })
      }, 5000)
    }
  }, [onArmWatchFolder])
  
  /**
   * PHASE 7: Disarm a watch folder
   */
  const handleDisarmWatchFolder = useCallback(async (id: string) => {
    if (!onDisarmWatchFolder) return
    await onDisarmWatchFolder(id)
  }, [onDisarmWatchFolder])
  
  /**
   * PHASE 7: Get human-readable block reason
   */
  const getBlockReasonText = (reason: ArmBlockReason): string => {
    switch (reason) {
      case 'NO_PRESET': return 'No preset configured'
      case 'PAUSED': return 'Watch folder is paused'
      case 'ALREADY_ARMED': return 'Already armed'
      case 'WATCHER_ERROR': return 'Watcher has an error'
      default: return 'Unknown reason'
    }
  }
  
  /**
   * PHASE 7: Check if watch folder can be armed (client-side pre-check)
   */
  const canArm = (wf: WatchFolder): boolean => {
    return wf.enabled && 
           !wf.armed && 
           !!wf.preset_id && 
           !wf.error
  }
  
  /**
   * Format path for display - show end-of-path summary
   * UI QC: Show meaningful context (…/ShootA/Day03/CameraB), not blind truncation
   */
  const formatPath = (fullPath: string): string => {
    const parts = fullPath.split('/').filter(Boolean)
    if (parts.length <= 3) return fullPath
    // Show last 3 path segments with ellipsis prefix
    const lastThree = parts.slice(-3).join('/')
    return `…/${lastThree}`
  }
  
  /**
   * Get tooltip for full path display
   */
  const getFullPathTooltip = (fullPath: string): string => {
    return fullPath
  }
  
  return (
    <div 
      data-testid="watch-folders-panel"
      style={{ 
        padding: '0.5rem',
        fontSize: '0.8125rem',
        minHeight: '200px',
        maxHeight: '400px',
        overflowY: 'auto',
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
              Preset
              <span style={{ fontSize: '0.6875rem', marginLeft: '0.5rem', color: 'var(--text-tertiary)' }}>
                (optional, can be set later)
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
                border: '1px solid var(--border-primary)',
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
            {/* UI QC: Neutral guidance, NOT an error state */}
            {!newFolderPresetId && (
              <div style={{ 
                marginTop: '0.25rem', 
                fontSize: '0.6875rem', 
                color: 'var(--text-tertiary)' 
              }}>
                💡 A preset is needed to create jobs. You can configure it after adding the folder.
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
              
              {/* Folder name and path - with tooltip for full path */}
              <div 
                style={{ flex: 1, minWidth: 0 }}
                title={getFullPathTooltip(wf.path)}
              >
                <div style={{ 
                  fontWeight: 500,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: 'var(--text-primary)',
                }}>
                  {formatPath(wf.path)}
                </div>
                <div style={{ 
                  fontSize: '0.6875rem',
                  color: 'var(--text-tertiary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  direction: 'rtl',
                  textAlign: 'left',
                }}>
                  {wf.path}{wf.recursive && ' (recursive)'}
                </div>
              </div>
              
              {/* Status indicator (read-only) */}
              <StatusIndicator status={wf.status || (wf.armed ? 'armed' : wf.enabled ? 'watching' : 'paused')} enabled={wf.enabled} />
              
              {/* Counts badge (compact) */}
              <CountsDisplay counts={counts} compact={true} />
              
              {/* PHASE 7: Arm/Disarm button */}
              {onArmWatchFolder && onDisarmWatchFolder && (
                <button
                  data-testid={`arm-disarm-${wf.id}`}
                  onClick={() => wf.armed ? handleDisarmWatchFolder(wf.id) : handleArmWatchFolder(wf.id)}
                  disabled={!wf.armed && !canArm(wf)}
                  title={
                    wf.armed 
                      ? 'Disarm (stop auto job creation)' 
                      : canArm(wf) 
                        ? 'Arm (enable auto job creation)' 
                        : !wf.preset_id 
                          ? 'Cannot arm: No preset configured'
                          : !wf.enabled
                            ? 'Cannot arm: Watcher is paused'
                            : 'Cannot arm'
                  }
                  style={{
                    padding: '0.25rem 0.5rem',
                    background: wf.armed 
                      ? 'rgb(251, 146, 60)' 
                      : canArm(wf) 
                        ? 'var(--surface-tertiary)' 
                        : 'var(--surface-tertiary)',
                    border: wf.armed 
                      ? '1px solid rgb(251, 146, 60)' 
                      : '1px solid var(--border-primary)',
                    borderRadius: '4px',
                    color: wf.armed ? 'white' : canArm(wf) ? 'var(--text-primary)' : 'var(--text-tertiary)',
                    fontSize: '0.6875rem',
                    cursor: (wf.armed || canArm(wf)) ? 'pointer' : 'not-allowed',
                    fontWeight: 600,
                    opacity: (wf.armed || canArm(wf)) ? 1 : 0.5,
                  }}
                >
                  {wf.armed ? '⚡ Armed' : 'Arm'}
                </button>
              )}
              
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
            
            {/* PHASE 7: Arm block reasons message (temporary) */}
            {armBlockReasons.get(wf.id) && (
              <div 
                data-testid={`arm-block-reasons-${wf.id}`}
                style={{
                  padding: '0.5rem',
                  background: 'rgba(251, 146, 60, 0.1)',
                  borderBottom: '1px solid rgba(251, 146, 60, 0.3)',
                  color: 'rgb(251, 146, 60)',
                  fontSize: '0.75rem',
                }}
              >
                ⚠ Cannot arm: {armBlockReasons.get(wf.id)!.map(getBlockReasonText).join(', ')}
              </div>
            )}
            
            {/* Expanded content */}
            {isExpanded && (
              <div style={{ padding: '0.5rem' }}>
                {/* Full counts display */}
                <CountsDisplay counts={counts} compact={false} />
                
                {/* Preset guidance - NEUTRAL state, NOT an error */}
                {/* UI QC: Errors only appear after user attempts an action that requires preset */}
                {!wf.preset_id && (
                  <div 
                    data-testid={`preset-guidance-${wf.id}`}
                    style={{
                      marginTop: '0.5rem',
                      padding: '0.5rem',
                      background: 'rgba(59, 130, 246, 0.1)',
                      border: '1px solid rgba(59, 130, 246, 0.25)',
                      borderRadius: '4px',
                      color: 'var(--text-secondary)',
                      fontSize: '0.75rem',
                    }}
                  >
                    💡 Select a preset to enable job creation for this watch folder.
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
                      📁 <strong>{stagedCount} files ready.</strong> Click "Create Jobs" to encode them.
                    </div>
                    
                    {/* PHASE 8: Counts-only summary (no file list) */}
                    <StagedFilesSummary
                      fileCount={wf.pending_files.length}
                      selectedCount={selectedCount}
                      lastActivityAt={wf.updated_at}
                      onSelectAll={(selected) => onSelectAll(wf.id, selected)}
                      watchFolderId={wf.id}
                    />
                    
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
