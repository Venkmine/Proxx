/**
 * StatusBadge component with consistent styling across the app.
 * Shows status with dot indicator and optional glow effect for active states.
 * 
 * Phase 16: Resolve-inspired status colors with animated pulse for RUNNING.
 * Hardening: All backend states explicitly supported.
 */

export type StatusType = 
  | 'PENDING'
  | 'VALIDATING'  // Hardening: explicit validating state
  | 'RUNNING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'COMPLETED_WITH_WARNINGS'
  | 'FAILED'
  | 'CANCELLED'
  | 'RECOVERY_REQUIRED'
  | 'QUEUED'
  | 'SKIPPED'
  // Backend uses lowercase, normalize in component
  | 'pending'
  | 'validating'
  | 'running'
  | 'paused'
  | 'completed'
  | 'completed_with_warnings'
  | 'failed'
  | 'cancelled'
  | 'recovery_required'
  | 'queued'
  | 'skipped'

interface StatusBadgeProps {
  status: StatusType | string
  size?: 'sm' | 'md' | 'lg'
  showDot?: boolean
  onClick?: () => void
  clickable?: boolean
}

const statusColors: Record<string, { bg: string; fg: string; glow?: string; border?: string }> = {
  PENDING: { bg: 'var(--status-pending-bg)', fg: 'var(--status-pending-fg)' },
  VALIDATING: { 
    bg: 'var(--status-pending-bg)', 
    fg: 'var(--status-pending-fg)',
    border: 'var(--status-pending-fg)',
  },  // Hardening: validating uses pending colors with border
  RUNNING: { 
    bg: 'var(--status-running-bg)', 
    fg: 'var(--status-running-fg)', 
    glow: 'var(--status-running-glow)',
    border: 'var(--status-running-border)',
  },
  PAUSED: { bg: 'var(--status-paused-bg)', fg: 'var(--status-paused-fg)' },
  COMPLETED: { bg: 'var(--status-completed-bg)', fg: 'var(--status-completed-fg)', glow: 'var(--status-completed-glow)' },
  COMPLETED_WITH_WARNINGS: { bg: 'var(--status-warning-bg)', fg: 'var(--status-warning-fg)' },
  FAILED: { bg: 'var(--status-failed-bg)', fg: 'var(--status-failed-fg)', glow: 'var(--status-failed-glow)' },
  CANCELLED: { bg: 'var(--status-cancelled-bg)', fg: 'var(--status-cancelled-fg)' },
  RECOVERY_REQUIRED: { bg: 'var(--status-recovery-bg)', fg: 'var(--status-recovery-fg)', glow: 'var(--status-recovery-glow)' },
  QUEUED: { bg: 'var(--status-queued-bg)', fg: 'var(--status-queued-fg)' },
  SKIPPED: { bg: 'var(--status-skipped-bg)', fg: 'var(--status-skipped-fg)' },
}

const sizeStyles = {
  sm: { padding: '0.125rem 0.375rem', fontSize: '0.675rem', dotSize: '0.375rem' },
  md: { padding: '0.25rem 0.5rem', fontSize: '0.75rem', dotSize: '0.5rem' },
  lg: { padding: '0.375rem 0.75rem', fontSize: '0.875rem', dotSize: '0.5rem' },
}

export function StatusBadge({ status, size = 'md', showDot = true, onClick, clickable = false }: StatusBadgeProps) {
  // Normalize status to uppercase for color lookup
  const normalizedStatus = status.toUpperCase().replace(/ /g, '_')
  const colors = statusColors[normalizedStatus] || statusColors.PENDING
  const sizeStyle = sizeStyles[size]
  
  // Format display text: replace underscores and title case
  const displayText = normalizedStatus.replace(/_/g, ' ')
  
  // Check if this is an active status that should pulse
  const isRunning = normalizedStatus === 'RUNNING'
  const isCancelled = normalizedStatus === 'CANCELLED'

  return (
    <span
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.375rem',
        padding: sizeStyle.padding,
        fontSize: sizeStyle.fontSize,
        fontFamily: 'var(--font-sans)',
        fontWeight: 600,
        letterSpacing: '0.025em',
        textTransform: 'uppercase',
        backgroundColor: colors.bg,
        color: colors.fg,
        borderRadius: 'var(--radius-sm)',
        boxShadow: colors.glow || 'none',
        border: isRunning && colors.border ? `1px solid ${colors.border}` : '1px solid transparent',
        opacity: isCancelled ? 0.7 : 1,
        cursor: clickable ? 'pointer' : 'default',
        transition: 'all 0.15s ease',
        animation: isRunning ? 'statusRunningPulse 2s ease-in-out infinite' : 'none',
      }}
    >
      {showDot && (
        <span
          style={{
            width: sizeStyle.dotSize,
            height: sizeStyle.dotSize,
            borderRadius: '50%',
            backgroundColor: colors.fg,
            boxShadow: isRunning ? `0 0 8px ${colors.fg}` : 'none',
            animation: isRunning ? 'statusRunningGlow 1.5s ease-in-out infinite' : 'none',
          }}
        />
      )}
      {displayText}
    </span>
  )
}

export default StatusBadge
