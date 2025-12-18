import React, { useState, useEffect, useRef } from 'react'
import { StatusBadge } from './StatusBadge'
import { StatBox } from './StatBox'
import { ClipRow } from './ClipRow'
import { Button } from './Button'

/**
 * JobGroup component - renders a single job as a collapsible group.
 * 
 * Per design requirements:
 * - Each job is a GROUP that ALWAYS shows its clips by default
 * - Jobs may be collapsible, but never hidden by selection
 * - Job label uses "Job 1", "Job 2" etc. (NOT UUID)
 * - Shows: status badge, aggregate counters, drag handle
 */

interface ClipTask {
  id: string
  source_path: string
  status: string
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
  // Phase 16.1: Output path for reveal
  output_path?: string | null
  // Phase 16.4: Progress tracking
  progress_percent?: number
  eta_seconds?: number | null
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
  
  // Interaction
  isSelected?: boolean
  onSelect?: () => void
  onRevealClip?: (path: string) => void
  
  // Actions (Phase 16: Full operator control)
  onStart?: () => void
  onPause?: () => void
  onResume?: () => void
  onRetryFailed?: () => void
  onCancel?: () => void
  onDelete?: () => void
  onRebindPreset?: () => void
  
  // Drag & drop
  onDragStart?: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
  isDragging?: boolean
  
  // State
  loading?: boolean
  activeStatusFilters?: Set<string>
  onToggleStatusFilter?: (status: string) => void
  
  // Clip selection
  selectedClipIds?: Set<string>
  onClipClick?: (clipId: string, e: React.MouseEvent) => void
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
  isSelected = false,
  onSelect,
  onRevealClip,
  onStart,
  onPause,
  onResume,
  onRetryFailed,
  onCancel,
  onDelete,
  onRebindPreset,
  onDragStart,
  onDragOver,
  onDrop,
  isDragging = false,
  loading = false,
  activeStatusFilters = new Set(),
  onToggleStatusFilter,
  selectedClipIds = new Set(),
  onClipClick,
}: JobGroupProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const runningClipRef = useRef<HTMLDivElement>(null)

  // Normalize status to uppercase for comparison
  const normalizedStatus = status.toUpperCase()
  const isJobRunning = normalizedStatus === 'RUNNING'

  // Phase 16.4: Auto-expand when job starts running
  useEffect(() => {
    if (isJobRunning && isCollapsed) {
      setIsCollapsed(false)
    }
  }, [isJobRunning])

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
  const showRetryFailed = failedCount > 0 && ['COMPLETED', 'COMPLETED_WITH_WARNINGS', 'FAILED'].includes(normalizedStatus)
  const showCancel = ['PENDING', 'RUNNING', 'PAUSED', 'RECOVERY_REQUIRED'].includes(normalizedStatus)
  const showDelete = ['PENDING', 'COMPLETED', 'COMPLETED_WITH_WARNINGS', 'FAILED', 'CANCELLED'].includes(normalizedStatus)
  const showRebind = normalizedStatus === 'PENDING' || normalizedStatus === 'RECOVERY_REQUIRED'

  return (
    <div
      ref={containerRef}
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
          : '1px solid var(--border-primary)',
        backgroundColor: 'var(--card-bg)',
        opacity: isDragging ? 0.5 : 1,
        transition: 'all 0.15s ease',
        boxShadow: isSelected 
          ? '0 0 0 1px var(--button-primary-bg), 0 4px 12px rgba(0,0,0,0.2)' 
          : isHovered 
            ? '0 4px 12px rgba(0,0,0,0.15)' 
            : 'none',
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
            setIsCollapsed(!isCollapsed)
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

        {/* Aggregate Counters */}
        <div
          style={{
            display: 'flex',
            gap: '0.75rem',
            marginLeft: 'auto',
            fontSize: '0.75rem',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {completedCount > 0 && (
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
          {queuedCount > 0 && (
            <span style={{ color: 'var(--text-muted)' }}>
              ○ {queuedCount}
            </span>
          )}
        </div>

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
      </div>

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
                    isActive={activeStatusFilters.has('COMPLETED_WITH_WARNINGS')}
                    onClick={() => onToggleStatusFilter?.('COMPLETED_WITH_WARNINGS')}
                  />
                )}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {showStart && (
                  <Button
                    variant="success"
                    size="sm"
                    onClick={onStart}
                    disabled={loading}
                  >
                    ▶ Render
                  </Button>
                )}
                {showPause && (
                  <Button
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
                    variant="primary"
                    size="sm"
                    onClick={onResume}
                    disabled={loading}
                  >
                    ▶ Resume
                  </Button>
                )}
                {showRetryFailed && (
                  <Button
                    variant="warning"
                    size="sm"
                    onClick={onRetryFailed}
                    disabled={loading}
                  >
                    🔁 Retry Failed
                  </Button>
                )}
                {showCancel && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={onCancel}
                    disabled={loading}
                  >
                    ⏹ Stop
                  </Button>
                )}
                {showDelete && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={onDelete}
                    disabled={loading}
                  >
                    🗑 Delete
                  </Button>
                )}
                {showRebind && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={onRebindPreset}
                    disabled={loading}
                  >
                    ⚙ Settings
                  </Button>
                )}
              </div>

              {/* Timestamps */}
              <div
                style={{
                  marginTop: '0.75rem',
                  fontSize: '0.6875rem',
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                  display: 'flex',
                  gap: '1.5rem',
                }}
              >
                <span>Created: {new Date(createdAt).toLocaleString()}</span>
                {startedAt && <span>Started: {new Date(startedAt).toLocaleString()}</span>}
                {completedAt && <span>Completed: {new Date(completedAt).toLocaleString()}</span>}
              </div>
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
                      failureReason={task.failure_reason}
                      warnings={task.warnings}
                      metadata={{
                        resolution: task.resolution || undefined,
                        codec: task.codec || undefined,
                        frameRate: task.frame_rate || undefined,
                        duration: task.duration || undefined,
                        audioLayout: task.audio_channels || undefined,
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
                      // Phase 16.4: Progress tracking
                      progressPercent={task.progress_percent || 0}
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
  )
}

export default JobGroup
