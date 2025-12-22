/**
 * JobProgressBar — Per-Job Progress Indicator (Alpha)
 * 
 * Features:
 * - Visual progress bar with percentage
 * - Status-aware coloring (pending, running, completed, failed)
 * - ETA and elapsed time display
 * - Encoder FPS display
 * - Compact and expanded modes
 */

// ============================================================================
// TYPES
// ============================================================================

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface JobProgress {
  status: JobStatus
  progress: number      // 0-100
  elapsed_seconds?: number
  eta_seconds?: number
  encoder_fps?: number
  current_frame?: number
  total_frames?: number
}

interface JobProgressBarProps {
  progress: JobProgress
  compact?: boolean
}

// ============================================================================
// HELPERS
// ============================================================================

function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0) return '--:--'
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// ============================================================================
// COMPONENT
// ============================================================================

export function JobProgressBar({
  progress,
  compact = false,
}: JobProgressBarProps) {
  const { status, progress: pct, elapsed_seconds, eta_seconds, encoder_fps } = progress
  
  // Status-based colors
  const getBarColor = () => {
    switch (status) {
      case 'running':
        return 'var(--button-primary-bg)'
      case 'completed':
        return 'var(--status-complete-bg)'
      case 'failed':
        return 'var(--status-failed-bg)'
      case 'cancelled':
        return 'var(--text-dim)'
      case 'pending':
      default:
        return 'var(--border-secondary)'
    }
  }
  
  const getStatusText = () => {
    switch (status) {
      case 'running':
        return `${Math.round(pct)}%`
      case 'completed':
        return 'Complete'
      case 'failed':
        return 'Failed'
      case 'cancelled':
        return 'Cancelled'
      case 'pending':
      default:
        return 'Pending'
    }
  }
  
  if (compact) {
    // Compact mode: just the bar with percentage
    return (
      <div
        data-testid="job-progress-bar-compact"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        <div style={{
          flex: 1,
          height: '4px',
          backgroundColor: 'var(--border-secondary)',
          borderRadius: '2px',
          overflow: 'hidden',
        }}>
          <div
            style={{
              width: `${Math.min(100, Math.max(0, pct))}%`,
              height: '100%',
              backgroundColor: getBarColor(),
              borderRadius: '2px',
              transition: 'width 0.3s ease-out',
            }}
          />
        </div>
        <span style={{
          fontSize: '0.625rem',
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-muted)',
          minWidth: '3rem',
          textAlign: 'right',
        }}>
          {getStatusText()}
        </span>
      </div>
    )
  }
  
  // Full mode: bar with metadata
  return (
    <div data-testid="job-progress-bar">
      {/* Progress bar */}
      <div style={{
        height: '6px',
        backgroundColor: 'var(--border-secondary)',
        borderRadius: '3px',
        overflow: 'hidden',
        marginBottom: '0.375rem',
      }}>
        <div
          style={{
            width: `${Math.min(100, Math.max(0, pct))}%`,
            height: '100%',
            backgroundColor: getBarColor(),
            borderRadius: '3px',
            transition: 'width 0.3s ease-out',
          }}
        />
      </div>
      
      {/* Metadata row */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '0.625rem',
        fontFamily: 'var(--font-mono)',
        color: 'var(--text-dim)',
      }}>
        {/* Left: Status and percentage */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{
            color: status === 'running' ? 'var(--button-primary-bg)' : 'var(--text-muted)',
            fontWeight: status === 'running' ? 600 : 400,
          }}>
            {getStatusText()}
          </span>
          
          {status === 'running' && encoder_fps !== undefined && encoder_fps > 0 && (
            <span style={{ color: 'var(--text-dim)' }}>
              {encoder_fps.toFixed(1)} fps
            </span>
          )}
        </div>
        
        {/* Right: Time info */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {elapsed_seconds !== undefined && elapsed_seconds > 0 && (
            <span>
              Elapsed: {formatDuration(elapsed_seconds)}
            </span>
          )}
          {status === 'running' && eta_seconds !== undefined && eta_seconds > 0 && (
            <span>
              ETA: {formatDuration(eta_seconds)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default JobProgressBar
