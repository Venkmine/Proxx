/**
 * JobProgressBar — Honest Delivery Progress Indicator
 * 
 * Phase H: Shows delivery stage with honest progress reporting.
 * - Stage-based labels (queued, starting, encoding, finalizing, completed, failed)
 * - Progress bar only when real data exists (FFmpeg with timing)
 * - ETA only when derived from real signal
 * - Indeterminate spinner for Resolve or FFmpeg without timing
 * - No fake percentages
 * 
 * Visual honesty rules:
 * - Determinate bar: Only when progress_percent > 0
 * - ETA: Only when eta_seconds exists and > 0
 * - Indeterminate bar: Resolve jobs or FFmpeg without timing data
 * - Fast jobs: Still show brief "Encoding" phase
 */

// ============================================================================
// TYPES
// ============================================================================

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
export type DeliveryStage = 'queued' | 'starting' | 'encoding' | 'finalizing' | 'completed' | 'failed'

export interface JobProgress {
  status: JobStatus
  delivery_stage?: DeliveryStage
  progress_percent?: number  // 0-100, only set when real data available
  eta_seconds?: number | null  // Estimated seconds remaining, only when calculable
}

interface JobProgressBarProps {
  progress: JobProgress
  compact?: boolean
}

// ============================================================================
// HELPERS
// ============================================================================

function getStageLabel(stage: DeliveryStage | undefined, status: JobStatus): string {
  if (stage) {
    switch (stage) {
      case 'queued': return 'Queued'
      case 'starting': return 'Starting'
      case 'encoding': return 'Encoding'
      case 'finalizing': return 'Finalizing'
      case 'completed': return 'Completed'
      case 'failed': return 'Failed'
    }
  }
  
  // Fallback to status
  switch (status) {
    case 'running': return 'Encoding'
    case 'completed': return 'Completed'
    case 'failed': return 'Failed'
    case 'cancelled': return 'Cancelled'
    case 'pending': return 'Pending'
    default: return 'Pending'
  }
}

function getStageColor(stage: DeliveryStage | undefined, status: JobStatus): string {
  if (stage === 'completed' || status === 'completed') {
    return 'var(--status-complete-bg)'
  }
  if (stage === 'failed' || status === 'failed') {
    return 'var(--status-failed-bg)'
  }
  if (status === 'cancelled') {
    return 'var(--text-dim)'
  }
  if (stage === 'encoding' || status === 'running') {
    return 'var(--button-primary-bg)'
  }
  return 'var(--text-muted)'
}

function formatETA(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`
  }
  const minutes = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  return `${minutes}m ${secs}s`
}

function shouldShowProgress(progress: JobProgress): boolean {
  // Only show progress bar when we have real progress data
  return (
    (progress.status === 'running' || progress.delivery_stage === 'encoding') &&
    typeof progress.progress_percent === 'number' &&
    progress.progress_percent > 0
  )
}

function shouldShowIndeterminate(progress: JobProgress): boolean {
  // Show indeterminate for active stages without progress data
  return (
    (progress.status === 'running' ||
     progress.delivery_stage === 'starting' ||
     progress.delivery_stage === 'encoding') &&
    (!progress.progress_percent || progress.progress_percent === 0)
  )
}

function shouldShowETA(progress: JobProgress): boolean {
  // Only show ETA if we have real signal and it's meaningful
  return (
    typeof progress.eta_seconds === 'number' &&
    progress.eta_seconds > 0 &&
    progress.eta_seconds < 86400  // Less than 24 hours
  )
}

// ============================================================================
// COMPONENT
// ============================================================================

export function JobProgressBar({
  progress,
  compact = false,
}: JobProgressBarProps) {
  const stageLabel = getStageLabel(progress.delivery_stage, progress.status)
  const stageColor = getStageColor(progress.delivery_stage, progress.status)
  const showProgress = shouldShowProgress(progress)
  const showIndeterminate = shouldShowIndeterminate(progress)
  const showETA = shouldShowETA(progress)
  
  // DIAGNOSTIC: Log every render when diagnostic mode is enabled
  if (typeof window !== 'undefined' && (window as any).DIAGNOSTIC_MODE) {
    console.log('[DIAGNOSTIC] JobProgressBar render', {
      delivery_stage: progress.delivery_stage,
      progress_percent: progress.progress_percent,
      eta_seconds: progress.eta_seconds,
      status: progress.status,
      showProgress,
      showIndeterminate,
      showETA,
    })
  }
  
  return (
    <div 
      data-testid={compact ? "job-progress-bar-compact" : "job-progress-bar"}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.25rem',
        minWidth: compact ? '120px' : '160px',
      }}
    >
      {/* Stage label and ETA row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        justifyContent: 'space-between',
      }}>
        {/* Stage indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          {/* Spinner for active stages */}
          {showIndeterminate && (
            <span
              data-testid="progress-spinner"
              style={{
                display: 'inline-block',
                width: compact ? '0.625rem' : '0.75rem',
                height: compact ? '0.625rem' : '0.75rem',
                borderRadius: '50%',
                border: '2px solid var(--text-muted)',
                borderTopColor: stageColor,
                animation: 'spin 1s linear infinite',
                flexShrink: 0,
              }}
            />
          )}
          
          {/* Stage label */}
          <span style={{
            fontSize: compact ? '0.625rem' : '0.6875rem',
            fontFamily: 'var(--font-mono)',
            fontWeight: (showProgress || showIndeterminate) ? 600 : 400,
            color: stageColor,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            {stageLabel}
          </span>
        </div>
        
        {/* ETA (only when reliable) */}
        {showETA && progress.eta_seconds && (
          <span
            data-testid="progress-eta"
            style={{
              fontSize: compact ? '0.625rem' : '0.6875rem',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-dim)',
              whiteSpace: 'nowrap',
            }}
            title="Estimated time remaining (based on encoding speed)"
          >
            ~{formatETA(progress.eta_seconds)}
          </span>
        )}
      </div>
      
      {/* Progress bar (determinate only when real data exists) */}
      {showProgress && (
        <div
          data-testid="progress-bar-container"
          style={{
            width: '100%',
            height: compact ? '5px' : '6px',
            backgroundColor: 'rgba(30, 41, 59, 0.6)',
            borderRadius: '3px',
            overflow: 'hidden',
            boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.3)',
          }}
        >
          <div
            data-testid="progress-bar-fill"
            style={{
              width: `${Math.min(100, Math.max(0, progress.progress_percent || 0))}%`,
              height: '100%',
              backgroundColor: stageColor,
              transition: 'width 0.3s ease-out',
              boxShadow: '0 0 4px rgba(59, 130, 246, 0.5)',
            }}
          />
        </div>
      )}
      
      {/* Indeterminate bar (for Resolve or FFmpeg without timing) */}
      {showIndeterminate && (
        <div
          data-testid="progress-bar-indeterminate"
          style={{
            width: '100%',
            height: compact ? '5px' : '6px',
            backgroundColor: 'rgba(30, 41, 59, 0.6)',
            borderRadius: '3px',
            overflow: 'hidden',
            position: 'relative',
            boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.3)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              width: '30%',
              height: '100%',
              backgroundColor: stageColor,
              animation: 'indeterminate 1.5s ease-in-out infinite',
              boxShadow: '0 0 4px rgba(59, 130, 246, 0.5)',
            }}
          />
        </div>
      )}
    </div>
  )
}

export default JobProgressBar
