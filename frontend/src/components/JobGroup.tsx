import React, { useState, useEffect, useRef } from 'react'
import { StatusBadge } from './StatusBadge'
import { StatBox } from './StatBox'
import { ClipRow } from './ClipRow'
import { Button } from './Button'
import { JobDiagnosticsPanel } from './JobDiagnosticsPanel'
import { ContextMenu, type ContextMenuItem } from './ContextMenu'
import { FEATURE_FLAGS } from '../config/featureFlags'
import type { DeliverSettings } from './DeliverControlPanel'

/**
 * JobGroup component - renders a single job as a collapsible group.
 * 
 * Per design requirements:
 * - Each job is a GROUP that ALWAYS shows its clips by default
 * - Jobs may be collapsible, but never hidden by selection
 * - Job label uses "Job 1", "Job 2" etc. (NOT UUID)
 * - Shows: status badge, aggregate counters, drag handle
 * - Alpha: Shows settings summary on the right side
 */

interface ClipTask {
  id: string
  source_path: string
  status: string
  delivery_stage?: string  // Phase H: queued, starting, encoding, finalizing, completed, failed
  failure_reason?: string | null
  warnings?: string[]
  started_at?: string | null
  completed_at?: string | null
  // Phase 16: Media metadata
  resolution?: string | null
  codec?: string | null
  frame_rate?: string | null
  duration?: string | null
  audio_channels?: string | null
  color_space?: string | null
  // RAW folder metadata
  raw_type?: string | null
  // Phase 16.1: Output path for reveal
  output_path?: string | null
  // Phase 16.4: Progress tracking
  progress_percent?: number
  eta_seconds?: number | null
  // Phase 20: Enhanced progress
  encode_fps?: number | null
  phase?: string | null  // PREPARING | ENCODING | FINALIZING
  thumbnail?: string | null
}

// Alpha: Settings summary for job row
interface JobSettingsSummary {
  codec?: string
  resolution?: string
  fps?: string
  audio?: string
  container?: string
}

interface JobGroupProps {
  // Job data
  jobId: string
  jobNumber: number // Sequential label: 1, 2, 3...
  status: string
  createdAt: string
  startedAt?: string | null
  completedAt?: string | null
  totalTasks: number
  completedCount: number
  failedCount: number
  skippedCount: number
  runningCount: number
  queuedCount: number
  warningCount: number
  tasks: ClipTask[]
  
  // Alpha: Settings summary for the job
  settingsSummary?: JobSettingsSummary
  
  // Interaction
  isSelected?: boolean
  isExpanded?: boolean  // Phase 4B: Controlled collapse state
  onToggleExpand?: () => void  // Phase 4B: Toggle expand/collapse
  onSelect?: () => void
  onRevealClip?: (path: string) => void
  /** Phase REBUILD: Brief highlight animation after job creation */
  isHighlighted?: boolean
  
  // Actions (Phase 16: Full operator control)
  onStart?: () => void
  onPause?: () => void
  onResume?: () => void
  // REMOVED: onRetryFailed - violates golden path
  // REMOVED: onRequeue - violates golden path
  onCancel?: () => void
  onDelete?: () => void
  onRebindPreset?: () => void
  onEditSettings?: () => void  // Alpha: Open settings editor for this job
  
  // Drag & drop
  onDragStart?: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
  isDragging?: boolean
  
  // Phase 8B: Queue diagnostics clarity
  hasOtherJobRunning?: boolean
  
  // State
  loading?: boolean
  activeStatusFilters?: Set<string>
  onToggleStatusFilter?: (status: string) => void
  
  // Clip selection
  selectedClipIds?: Set<string>
  onClipClick?: (clipId: string, e: React.MouseEvent) => void
  
  // Hardening: Diagnostics data for alpha panel
  diagnostics?: {
    engine?: string
    outputDirectory?: string
    settings?: DeliverSettings
    lastError?: string | null
  }
}

export function JobGroup({
  jobId: _jobId,
  jobNumber,
  status,
  createdAt,
  startedAt,
  completedAt,
  totalTasks,
  completedCount,
  failedCount,
  skippedCount,
  runningCount,
  queuedCount,
  warningCount,
  tasks,
  settingsSummary,
  isSelected = false,
  isExpanded = true,  // Phase 4B: Default to expanded for backwards compatibility
  onToggleExpand,
  onSelect,
  onRevealClip,
  isHighlighted = false,
  onStart,
  onPause,
  onResume,
  // REMOVED: onRetryFailed
  // REMOVED: onRequeue
  onCancel,
  onDelete,
  onRebindPreset,
  onEditSettings,  // Alpha
  onDragStart,
  onDragOver,
  onDrop,
  isDragging = false,
  hasOtherJobRunning = false,
  loading = false,
  activeStatusFilters = new Set(),
  onToggleStatusFilter,
  selectedClipIds = new Set(),
  onClipClick,
  diagnostics,
}: JobGroupProps) {
  // Phase 4B: Use controlled isExpanded prop instead of internal state
  // The isCollapsed variable is derived for backwards compatibility with existing code
  const isCollapsed = !isExpanded
  const [isHovered, setIsHovered] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const runningClipRef = useRef<HTMLDivElement>(null)

  // Phase REBUILD: Elapsed time tracking for running jobs
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const elapsedIntervalRef = useRef<number | null>(null)
  
  // Phase REBUILD: Stalled job detection (no clip progress for 60s)
  const [isStalled, setIsStalled] = useState(false)
  const lastCompletedCountRef = useRef(completedCount)
  const stalledTimerRef = useRef<number | null>(null)

  // Normalize status to uppercase for comparison
  const normalizedStatus = status.toUpperCase()
  const isJobRunning = normalizedStatus === 'RUNNING'
  
  // Job Lifecycle Truth: Detect terminal states for visual dimming
  // V1: COMPLETED_WITH_WARNINGS removed - only COMPLETED, FAILED, CANCELLED are terminal
  const isTerminalState = ['COMPLETED', 'FAILED', 'CANCELLED'].includes(normalizedStatus)
  const isCompleted = normalizedStatus === 'COMPLETED'

  // Phase REBUILD: Elapsed time counter for RUNNING jobs
  useEffect(() => {
    if (isJobRunning && startedAt) {
      // Initialize elapsed time from startedAt
      const started = new Date(startedAt).getTime()
      const updateElapsed = () => {
        const now = Date.now()
        setElapsedSeconds(Math.floor((now - started) / 1000))
      }
      updateElapsed()
      
      // Update every second
      elapsedIntervalRef.current = window.setInterval(updateElapsed, 1000)
      
      return () => {
        if (elapsedIntervalRef.current) {
          clearInterval(elapsedIntervalRef.current)
          elapsedIntervalRef.current = null
        }
      }
    } else {
      // Job not running, clear interval
      if (elapsedIntervalRef.current) {
        clearInterval(elapsedIntervalRef.current)
        elapsedIntervalRef.current = null
      }
      // Reset elapsed if job becomes terminal
      if (isTerminalState) {
        setElapsedSeconds(0)
      }
    }
  }, [isJobRunning, startedAt, isTerminalState])

  // Phase REBUILD: Stalled job detection
  useEffect(() => {
    if (isJobRunning) {
      // Check if completed count changed
      if (completedCount !== lastCompletedCountRef.current) {
        // Progress detected, reset stalled state
        lastCompletedCountRef.current = completedCount
        setIsStalled(false)
        
        // Reset stalled timer
        if (stalledTimerRef.current) {
          clearTimeout(stalledTimerRef.current)
        }
        
        // Start new 60s timer
        stalledTimerRef.current = window.setTimeout(() => {
          setIsStalled(true)
        }, 60000)
      } else if (!stalledTimerRef.current) {
        // No timer running, start one
        stalledTimerRef.current = window.setTimeout(() => {
          setIsStalled(true)
        }, 60000)
      }
      
      return () => {
        if (stalledTimerRef.current) {
          clearTimeout(stalledTimerRef.current)
          stalledTimerRef.current = null
        }
      }
    } else {
      // Job not running, reset
      setIsStalled(false)
      lastCompletedCountRef.current = completedCount
      if (stalledTimerRef.current) {
        clearTimeout(stalledTimerRef.current)
        stalledTimerRef.current = null
      }
    }
  }, [isJobRunning, completedCount])

  // Phase 4B: Auto-expand when job starts running (call parent's toggle if collapsed)
  useEffect(() => {
    if (isJobRunning && isCollapsed && onToggleExpand) {
      onToggleExpand()
    }
  }, [isJobRunning, isCollapsed, onToggleExpand])

  // Phase 16.4: Auto-scroll to first running clip when job starts
  useEffect(() => {
    if (isJobRunning && runningClipRef.current) {
      runningClipRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [isJobRunning, runningCount])

  // Filter clips by active status filters
  const filteredTasks = tasks.filter(task => {
    if (activeStatusFilters.size === 0) return true
    return activeStatusFilters.has(task.status.toUpperCase())
  })

  // Find the first running clip for scroll reference
  const firstRunningClipId = tasks.find(t => t.status.toUpperCase() === 'RUNNING')?.id

  // Determine which action buttons to show based on job status (Phase 16: Full control)
  const showStart = normalizedStatus === 'PENDING'
  const showPause = normalizedStatus === 'RUNNING'
  const showResume = normalizedStatus === 'RECOVERY_REQUIRED' || normalizedStatus === 'PAUSED'
  // REMOVED: showRetryFailed - violates golden path
  // REMOVED: showRequeue - violates golden path
  const showCancel = ['PENDING', 'RUNNING', 'PAUSED', 'RECOVERY_REQUIRED'].includes(normalizedStatus)
  // V1: COMPLETED_WITH_WARNINGS removed
  const showDelete = ['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED'].includes(normalizedStatus)
  const showRebind = normalizedStatus === 'PENDING' || normalizedStatus === 'RECOVERY_REQUIRED'

  // Phase E: Context menu items for completed jobs
  const hasOutputPath = isCompleted && tasks.some(t => t.output_path)
  const contextMenuItems: ContextMenuItem[] = [
    {
      label: 'Copy Job ID',
      icon: '📋',
      onClick: () => {
        navigator.clipboard.writeText(_jobId)
      },
    },
    {
      label: 'Copy Output Path',
      icon: '📂',
      disabled: !hasOutputPath,
      onClick: () => {
        const firstOutputPath = tasks.find(t => t.output_path)?.output_path
        if (firstOutputPath) {
          // Extract directory from file path
          const directory = firstOutputPath.substring(0, firstOutputPath.lastIndexOf('/'))
          navigator.clipboard.writeText(directory)
        }
      },
    },
    {
      label: 'Reveal in Finder',
      icon: '👁',
      disabled: !hasOutputPath,
      onClick: () => {
        const firstOutputPath = tasks.find(t => t.output_path)?.output_path
        if (firstOutputPath && window.electron?.showItemInFolder) {
          window.electron.showItemInFolder(firstOutputPath)
        }
      },
    },
  ]

  return (
    <ContextMenu items={contextMenuItems} testId="job-group-context">
      <div
        ref={containerRef}
        data-testid="job-group"
        data-job-id={_jobId}
        data-job-status={normalizedStatus}
        draggable={!!onDragStart}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          marginBottom: '1rem',
          borderRadius: 'var(--radius)',
          border: isSelected 
            ? '1px solid var(--button-primary-bg)' 
            : isHighlighted
              ? '1px solid var(--button-primary-bg)'
              : isTerminalState
                ? '1px solid var(--border-secondary)'
                : '1px solid var(--border-primary)',
          backgroundColor: isHighlighted 
            ? 'rgba(59, 130, 246, 0.08)' 
            : isTerminalState && !isSelected 
              ? 'var(--bg-secondary)' 
              : 'var(--card-bg)',
          opacity: isDragging ? 0.5 : isTerminalState && !isSelected ? 0.7 : 1,
          transition: 'all 0.15s ease',
          boxShadow: isHighlighted
            ? '0 0 0 2px var(--button-primary-bg), 0 4px 16px rgba(59, 130, 246, 0.3)'
            : isSelected 
              ? '0 0 0 1px var(--button-primary-bg), 0 4px 12px rgba(0,0,0,0.2)' 
              : isHovered && !isTerminalState
                ? '0 4px 12px rgba(0,0,0,0.15)' 
                : 'none',
          minWidth: 0,
          maxWidth: '100%',
          overflow: 'hidden',
        }}
      >
        {/* Job Header */}
        <div
          onClick={onSelect}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.875rem 1rem',
            cursor: 'pointer',
            borderBottom: isCollapsed ? 'none' : '1px solid var(--border-secondary)',
            backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.05)' : 'transparent',
            borderRadius: isCollapsed ? 'var(--radius)' : 'var(--radius) var(--radius) 0 0',
          }}
        >
        {/* Drag Handle */}
        {onDragStart && (
          <div
            style={{
              cursor: 'grab',
              color: 'var(--text-dim)',
              fontSize: '1rem',
              padding: '0 0.25rem',
              opacity: isHovered ? 1 : 0.5,
              transition: 'opacity 0.15s',
            }}
            title="Drag to reorder"
          >
            ⋮⋮
          </div>
        )}

        {/* Collapse Toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggleExpand?.()
          }}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '0.25rem',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s',
          }}
          title={isCollapsed ? 'Expand job' : 'Collapse job'}
        >
          ▼
        </button>

        {/* Job Label */}
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontWeight: 600,
            fontSize: '0.9375rem',
            color: 'var(--text-primary)',
          }}
        >
          Job {jobNumber}
        </div>

        <StatusBadge status={status} size="md" />
        
        {/* Phase 8B: Queue diagnostics clarity - explain why job is waiting */}
        {normalizedStatus === 'PENDING' && hasOtherJobRunning && (
          <span
            style={{
              fontSize: '0.6875rem',
              color: 'var(--text-dim)',
              fontStyle: 'italic',
            }}
            title="This job will start when the current job completes"
          >
            Waiting — another job is running
          </span>
        )}

        {/* Aggregate Counters */}
        <div
          style={{
            display: 'flex',
            gap: '0.75rem',
            marginLeft: 'auto',
            fontSize: '0.75rem',
            fontFamily: 'var(--font-mono)',
            alignItems: 'center',
          }}
        >
          {/* Aggregate progress bar for running jobs */}
          {isJobRunning && (() => {
            // Calculate aggregate progress from all tasks
            const totalProgress = tasks.reduce((sum, task) => sum + (task.progress_percent || 0), 0)
            const avgProgress = tasks.length > 0 ? totalProgress / tasks.length : 0
            
            return avgProgress > 0 ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <div
                  style={{
                    width: '80px',
                    height: '4px',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    borderRadius: '2px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(100, Math.max(0, avgProgress))}%`,
                      height: '100%',
                      backgroundColor: 'var(--button-primary-bg)',
                      transition: 'width 300ms ease-out',
                    }}
                  />
                </div>
                <span
                  style={{
                    color: 'var(--text-secondary)',
                    fontSize: '0.6875rem',
                    fontWeight: 500,
                  }}
                >
                  {Math.round(avgProgress)}%
                </span>
              </div>
            ) : null
          })()}
          
          {/* Phase REBUILD: Clip completion counter for running jobs */}
          {isJobRunning && (
            <span 
              style={{ 
                color: 'var(--text-primary)',
                fontWeight: 500,
                fontFamily: 'var(--font-mono)',
                fontSize: '0.6875rem',
              }}
              title="Clips completed"
            >
              {completedCount} / {totalTasks} \u00b7 {Math.round((completedCount / totalTasks) * 100)}%
            </span>
          )}
          {completedCount > 0 && !isJobRunning && (
            <span style={{ color: 'var(--stat-completed)' }}>
              ✓ {completedCount}
            </span>
          )}
          {failedCount > 0 && (
            <span style={{ color: 'var(--stat-failed)' }}>
              ✗ {failedCount}
            </span>
          )}
          {runningCount > 0 && (
            <span style={{ color: 'var(--stat-running)' }}>
              ● {runningCount}
            </span>
          )}
          {queuedCount > 0 && !isJobRunning && (
            <span style={{ color: 'var(--text-muted)' }}>
              ○ {queuedCount}
            </span>
          )}
        </div>

        {/* Phase REBUILD: Elapsed time display for running jobs */}
        {isJobRunning && elapsedSeconds > 0 && (
          <div
            style={{
              fontSize: '0.6875rem',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-secondary)',
              padding: '0.125rem 0.375rem',
              background: 'rgba(59, 130, 246, 0.1)',
              borderRadius: '3px',
            }}
            title="Elapsed time since job started"
          >
            {Math.floor(elapsedSeconds / 3600).toString().padStart(2, '0')}:
            {Math.floor((elapsedSeconds % 3600) / 60).toString().padStart(2, '0')}:
            {(elapsedSeconds % 60).toString().padStart(2, '0')}
          </div>
        )}

        {/* Trust Stabilisation: Settings Summary - Shows export intent (what will be produced) */}
        {/* Format: Preset name or "Manual" · Codec Container · Resolution */}
        {settingsSummary && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
              fontSize: '0.6875rem',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
              padding: '0.25rem 0.5rem',
              backgroundColor: 'rgba(51, 65, 85, 0.2)',
              borderRadius: 'var(--radius-sm)',
            }}
            title="Output settings for this job"
          >
            {/* Codec + Container (e.g., "ProRes Proxy · MOV") */}
            {settingsSummary.codec && (
              <span>
                {settingsSummary.codec}
                {settingsSummary.container && ` · ${settingsSummary.container.toUpperCase()}`}
              </span>
            )}
            {/* Resolution (e.g., "1920×1080") */}
            {settingsSummary.resolution && settingsSummary.resolution !== 'Source' && (
              <span>• {settingsSummary.resolution}</span>
            )}
          </div>
        )}

        {/* Clip count */}
        <div
          style={{
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {totalTasks} clip{totalTasks !== 1 ? 's' : ''}
        </div>

        {/* Trust Stabilisation: Always-visible action buttons in header */}
        <div style={{ 
          display: 'flex', 
          gap: '0.25rem', 
          alignItems: 'center',
          flexShrink: 0,
        }}>
          {/* Render button for PENDING jobs - always visible */}
          {showStart && onStart && (
            <button
              data-testid="btn-job-render"
              onClick={(e) => {
                e.stopPropagation()
                onStart()
              }}
              disabled={loading}
              style={{
                background: 'var(--success-bg)',
                border: '1px solid var(--success-border)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.25rem 0.5rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '0.6875rem',
                fontFamily: 'var(--font-sans)',
                color: 'var(--success-fg)',
                opacity: loading ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}
              title="Start rendering this job"
            >
              ▶ Render
            </button>
          )}
          {/* Cancel button for RUNNING jobs - UI Honesty: styled as subdued/best-effort */}
          {showCancel && onCancel && (
            <button
              data-testid="btn-job-cancel"
              onClick={(e) => {
                e.stopPropagation()
                onCancel()
              }}
              disabled={loading}
              style={{
                background: 'none',
                border: '1px solid var(--border-secondary)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.25rem 0.5rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '0.6875rem',
                fontFamily: 'var(--font-sans)',
                color: 'var(--text-muted)',
                opacity: loading ? 0.5 : 0.8,
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}
              title="Request cancellation (best-effort, may not stop immediately)"
            >
              ⏹ Stop
            </button>
          )}
          {/* Delete button for non-running jobs */}
          {showDelete && onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
              disabled={loading}
              style={{
                background: 'none',
                border: '1px solid var(--border-secondary)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.25rem 0.5rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '0.6875rem',
                fontFamily: 'var(--font-sans)',
                color: 'var(--text-muted)',
                opacity: loading ? 0.5 : 0.8,
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}
              title="Remove this job from queue"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Phase REBUILD: Stalled job warning */}
      {isJobRunning && isStalled && (
        <div
          style={{
            padding: '0.5rem 1rem',
            background: 'rgba(251, 191, 36, 0.1)',
            borderBottom: '1px solid rgba(251, 191, 36, 0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.6875rem',
            color: 'rgb(251, 191, 36)',
          }}
          data-testid="stalled-warning"
        >
          <span style={{ fontSize: '0.875rem' }}>⚠️</span>
          <span>No progress detected — job may be stalled</span>
        </div>
      )}

      {/* Collapsible Content */}
      {!isCollapsed && (
        <div>
          {/* Stats and Actions Row (shown when selected) */}
          {isSelected && (
            <div
              style={{
                padding: '0.75rem 1rem',
                borderBottom: '1px solid var(--border-secondary)',
                backgroundColor: 'rgba(59, 130, 246, 0.02)',
              }}
            >
              {/* Stat Boxes */}
              <div
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                  marginBottom: '0.75rem',
                  flexWrap: 'wrap',
                }}
              >
                <StatBox
                  label="Completed"
                  value={completedCount}
                  color="var(--stat-completed)"
                  isActive={activeStatusFilters.has('COMPLETED')}
                  onClick={() => onToggleStatusFilter?.('COMPLETED')}
                />
                <StatBox
                  label="Failed"
                  value={failedCount}
                  color="var(--stat-failed)"
                  isActive={activeStatusFilters.has('FAILED')}
                  onClick={() => onToggleStatusFilter?.('FAILED')}
                />
                <StatBox
                  label="Running"
                  value={runningCount}
                  color="var(--stat-running)"
                  isActive={activeStatusFilters.has('RUNNING')}
                  onClick={() => onToggleStatusFilter?.('RUNNING')}
                />
                <StatBox
                  label="Queued"
                  value={queuedCount}
                  color="var(--text-muted)"
                  isActive={activeStatusFilters.has('QUEUED')}
                  onClick={() => onToggleStatusFilter?.('QUEUED')}
                />
                <StatBox
                  label="Skipped"
                  value={skippedCount}
                  color="var(--stat-skipped)"
                  isActive={activeStatusFilters.has('SKIPPED')}
                  onClick={() => onToggleStatusFilter?.('SKIPPED')}
                />
                {warningCount > 0 && (
                  <StatBox
                    label="Warnings"
                    value={warningCount}
                    color="var(--stat-warning)"
                    isActive={activeStatusFilters.has('WARNING')}
                    onClick={() => onToggleStatusFilter?.('WARNING')}
                  />
                )}
              </div>

              {/* Action Buttons - excludes Start/Cancel which are in header */}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {/* NOTE: Render and Cancel buttons are in the header for single-control-surface principle */}
                {showPause && (
                  <Button
                    data-testid="btn-job-pause"
                    variant="warning"
                    size="sm"
                    onClick={onPause}
                    disabled={loading}
                  >
                    ⏸ Pause
                  </Button>
                )}
                {showResume && (
                  <Button
                    data-testid="btn-job-resume"
                    variant="primary"
                    size="sm"
                    onClick={onResume}
                    disabled={loading}
                  >
                    ▶ Resume
                  </Button>
                )}
                {/* REMOVED: Retry Failed and Requeue buttons - violate golden path */}
                {showDelete && (
                  <Button
                    data-testid="btn-job-delete"
                    variant="destructive"
                    size="sm"
                    onClick={onDelete}
                    disabled={loading}
                  >
                    🗑 Delete
                  </Button>
                )}
                {/* Alpha: Edit Settings button for PENDING jobs */}
                {normalizedStatus === 'PENDING' && onEditSettings && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={onEditSettings}
                    disabled={loading}
                    title="Edit output settings for this job"
                  >
                    ✏ Edit Settings
                  </Button>
                )}
                {/* V1: Non-functional Settings button removed - onRebindPreset only selects job with no action */}
              </div>

              {/* Timestamps - labels use sans, values use mono */}
              <div
                style={{
                  marginTop: '0.75rem',
                  fontSize: '0.6875rem',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  gap: '1.5rem',
                }}
              >
                <span>
                  <span style={{ fontFamily: 'var(--font-sans)' }}>Created </span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{new Date(createdAt).toLocaleString()}</span>
                </span>
                {startedAt && (
                  <span>
                    <span style={{ fontFamily: 'var(--font-sans)' }}>Started </span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{new Date(startedAt).toLocaleString()}</span>
                  </span>
                )}
                {completedAt && (
                  <span>
                    <span style={{ fontFamily: 'var(--font-sans)' }}>Completed </span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{new Date(completedAt).toLocaleString()}</span>
                  </span>
                )}
              </div>
              
              {/* Hardening: Job Diagnostics Panel (Alpha-only) */}
              {FEATURE_FLAGS.ALPHA_DIAGNOSTICS_ENABLED && (
                <JobDiagnosticsPanel
                  data={{
                    jobId: _jobId,
                    engine: diagnostics?.engine,
                    outputDirectory: diagnostics?.outputDirectory,
                    settings: diagnostics?.settings,
                    status: status,
                    createdAt: createdAt,
                    startedAt: startedAt,
                    completedAt: completedAt,
                    lastError: diagnostics?.lastError || tasks.find(t => t.failure_reason)?.failure_reason,
                    totalTasks: totalTasks,
                    failedCount: failedCount,
                    completedCount: completedCount,
                  }}
                  enabled={true}
                />
              )}
            </div>
          )}

          {/* Clips List */}
          <div
            style={{
              maxHeight: isSelected ? 'none' : '300px',
              overflow: isSelected ? 'visible' : 'auto',
            }}
          >
            {filteredTasks.length === 0 ? (
              <div
                style={{
                  padding: '1rem',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: '0.875rem',
                }}
              >
                {activeStatusFilters.size > 0 
                  ? 'No clips match the selected filters' 
                  : 'No clips in this job'}
              </div>
            ) : (
              filteredTasks.map((task) => {
                const isFirstRunning = task.id === firstRunningClipId
                return (
                  <div
                    key={task.id}
                    ref={isFirstRunning ? runningClipRef : undefined}
                  >
                    <ClipRow
                      id={task.id}
                      sourcePath={task.source_path}
                      status={task.status}
                      deliveryStage={task.delivery_stage}
                      failureReason={task.failure_reason}
                      warnings={task.warnings}
                      metadata={{
                        resolution: task.resolution || undefined,
                        codec: task.codec || undefined,
                        frameRate: task.frame_rate || undefined,
                        duration: task.duration || undefined,
                        audioLayout: task.audio_channels || undefined,
                        rawType: task.raw_type || undefined,
                      }}
                      outputPath={task.output_path || undefined}
                      isSelected={selectedClipIds.has(task.id)}
                      onClick={(e) => onClipClick?.(task.id, e)}
                      onReveal={
                        // Phase 16.1: Only enable reveal when output_path exists
                        onRevealClip && task.output_path 
                          ? () => onRevealClip(task.output_path!) 
                          : undefined
                      }
                      thumbnail={task.thumbnail}
                      progressPercent={task.progress_percent}
                      etaSeconds={task.eta_seconds}
                    />
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
      </div>
    </ContextMenu>
  )
}

export default JobGroup
