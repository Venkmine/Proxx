/**
 * JobSubmitButton - Single-action submit button for job creation.
 * 
 * V1 SIMPLIFICATION:
 * - Removed confirmation dialog (was double confirmation)
 * - Single click on "Create Job" → job appears in queue
 * - If validation fails, inline errors shown (no modals)
 * 
 * Rules:
 * - If ANY ❌ failure exists: Button is HIDDEN, show "Fix issues above to continue"
 * - If only ⚠ warnings exist: Button is SHOWN, warnings remain visible
 * - On submit: Job is created immediately (no confirmation modal)
 */

import { Button } from './Button'
import type { PreflightCheck } from './PreflightSummary'

// =============================================================================
// Types
// =============================================================================

export interface JobSummary {
  /** Number of source files */
  sourceCount: number
  /** List of source paths (truncated display) */
  sourcePaths: string[]
  /** Output directory */
  outputDirectory: string
  /** Proxy profile name */
  proxyProfile: string
  /** Execution engine */
  engine: string
  /** Optional burn-in recipe */
  burnInRecipe?: string
  /** Optional LUT */
  lut?: string
}

export interface JobSubmitButtonProps {
  /** Preflight checks to evaluate */
  preflightChecks: PreflightCheck[]
  /** Job summary for confirmation dialog */
  jobSummary: JobSummary
  /** Called when user confirms job creation */
  onSubmit: () => void
  /** Whether submission is in progress */
  loading?: boolean
  /** Additional disabled state (external conditions) */
  disabled?: boolean
  /** Called when user clicks submit to trigger deferred validation (e.g., output directory) */
  onValidationTrigger?: () => void
}

// =============================================================================
// Component
// =============================================================================

export function JobSubmitButton({
  preflightChecks,
  jobSummary: _jobSummary,
  onSubmit,
  loading = false,
  disabled = false,
  onValidationTrigger,
}: JobSubmitButtonProps) {
  // Evaluate preflight status
  const hasBlockingFailures = preflightChecks.some(c => c.status === 'fail')
  const hasWarnings = preflightChecks.some(c => c.status === 'warning')
  const blockingFailures = preflightChecks.filter(c => c.status === 'fail')

  // Cannot submit if there are blocking failures
  const canSubmit = !hasBlockingFailures && !disabled && !loading
  
  // Handle submit button click - trigger validation first, then submit
  const handleSubmitClick = () => {
    // Trigger deferred validation (e.g., output directory)
    if (onValidationTrigger) {
      onValidationTrigger()
    }
    // Submit immediately if no blocking failures
    if (!hasBlockingFailures && canSubmit) {
      onSubmit()
    }
  }

  // If there are blocking failures, show the blocker message instead of button
  if (hasBlockingFailures) {
    return (
      <div
        data-testid="job-submit-blocked"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          padding: '0.75rem 1rem',
          background: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: 'var(--radius)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.8125rem',
            fontFamily: 'var(--font-sans)',
            fontWeight: 600,
            color: 'var(--status-error-fg, #ef4444)',
          }}
        >
          <span>✕</span>
          Fix issues above to continue
        </div>
        <div
          style={{
            fontSize: '0.6875rem',
            fontFamily: 'var(--font-sans)',
            color: 'var(--text-muted)',
          }}
        >
          {blockingFailures.length} blocking issue{blockingFailures.length > 1 ? 's' : ''} preventing job creation
        </div>
      </div>
    )
  }

  // Normal submit button state (no confirmation dialog - single action)
  return (
    <div
      data-testid="job-submit-ready"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}
    >
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <Button
          data-testid="job-submit-button"
          variant={hasWarnings ? 'warning' : 'primary'}
          size="md"
          onClick={handleSubmitClick}
          disabled={!canSubmit}
          loading={loading}
        >
          {hasWarnings ? '⚠ Create Job (with warnings)' : '+ Create Job'}
        </Button>
      </div>
      {hasWarnings && (
        <div
          style={{
            fontSize: '0.6875rem',
            fontFamily: 'var(--font-sans)',
            color: 'var(--status-warning-fg, #f59e0b)',
            fontStyle: 'italic',
          }}
        >
          Review warnings above before proceeding
        </div>
      )}
    </div>
  )
}

export default JobSubmitButton
