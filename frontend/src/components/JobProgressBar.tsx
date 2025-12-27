/**
 * JobProgressBar — Per-Job Status Indicator
 * 
 * Simplified to show only real states:
 * - Encoding (running)
 * - Completed
 * - Failed
 * 
 * No fake progress, no percentage, no ETA, no interpolation.
 */

// ============================================================================
// TYPES
// ============================================================================

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface JobProgress {
  status: JobStatus
}

interface JobProgressBarProps {
  progress: JobProgress
  compact?: boolean
}

// ============================================================================
// COMPONENT
// ============================================================================

export function JobProgressBar({
  progress,
  compact = false,
}: JobProgressBarProps) {
  const { status } = progress
  
  // Status-based colors
  const getStatusColor = () => {
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
        return 'var(--text-muted)'
    }
  }
  
  const getStatusText = () => {
    switch (status) {
      case 'running':
        return 'Encoding'
      case 'completed':
        return 'Completed'
      case 'failed':
        return 'Failed'
      case 'cancelled':
        return 'Cancelled'
      case 'pending':
      default:
        return 'Pending'
    }
  }
  
  // Simple status display - no progress bar, no fake progress
  return (
    <div 
      data-testid={compact ? "job-progress-bar-compact" : "job-progress-bar"}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
      }}
    >
      {/* Spinner for running state */}
      {status === 'running' && (
        <span
          style={{
            display: 'inline-block',
            width: compact ? '0.625rem' : '0.75rem',
            height: compact ? '0.625rem' : '0.75rem',
            borderRadius: '50%',
            border: '2px solid var(--text-muted)',
            borderTopColor: 'var(--button-primary-bg)',
            animation: 'spin 1s linear infinite',
            flexShrink: 0,
          }}
        />
      )}
      
      {/* Status text */}
      <span style={{
        fontSize: compact ? '0.625rem' : '0.6875rem',
        fontFamily: 'var(--font-mono)',
        fontWeight: status === 'running' ? 600 : 400,
        color: getStatusColor(),
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        {getStatusText()}
      </span>
    </div>
  )
}

export default JobProgressBar
