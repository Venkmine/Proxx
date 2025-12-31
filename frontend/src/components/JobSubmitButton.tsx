/**
 * JobSubmitButton - Conditional submit button for job creation.
 * 
 * This component enforces the submit rules:
 * - If ANY ❌ failure exists: Button is HIDDEN, show "Fix issues above to continue"
 * - If only ⚠ warnings exist: Button is SHOWN, warnings remain visible
 * - On submit: Show immutable job summary with explicit confirmation
 * 
 * DESIGN PRINCIPLES:
 * - No modal popups for validation
 * - All errors are inline and persistent
 * - Messages are factual, not advisory
 * - No optimistic submission
 */

import React, { useState } from 'react'
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
}

// =============================================================================
// Component
// =============================================================================

export function JobSubmitButton({
  preflightChecks,
  jobSummary,
  onSubmit,
  loading = false,
  disabled = false,
}: JobSubmitButtonProps) {
  const [showConfirmation, setShowConfirmation] = useState(false)

  // Evaluate preflight status
  const hasBlockingFailures = preflightChecks.some(c => c.status === 'fail')
  const hasWarnings = preflightChecks.some(c => c.status === 'warning')
  const blockingFailures = preflightChecks.filter(c => c.status === 'fail')

  // Cannot submit if there are blocking failures
  const canSubmit = !hasBlockingFailures && !disabled && !loading

  // Handle confirmation
  const handleConfirm = () => {
    setShowConfirmation(false)
    onSubmit()
  }

  const handleCancel = () => {
    setShowConfirmation(false)
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

  // Show confirmation dialog
  if (showConfirmation) {
    return (
      <div
        data-testid="job-submit-confirmation"
        style={{
          padding: '1rem',
          background: 'linear-gradient(180deg, rgba(26, 32, 44, 0.98) 0%, rgba(17, 24, 39, 0.98) 100%)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius)',
        }}
      >
        {/* Header */}
        <div
          style={{
            marginBottom: '0.75rem',
            paddingBottom: '0.5rem',
            borderBottom: '1px solid var(--border-secondary)',
          }}
        >
          <h4
            style={{
              margin: 0,
              fontSize: '0.8125rem',
              fontFamily: 'var(--font-sans)',
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}
          >
            Confirm Job Creation
          </h4>
          <p
            style={{
              margin: '0.25rem 0 0',
              fontSize: '0.6875rem',
              color: 'var(--text-muted)',
            }}
          >
            Review job parameters before submission
          </p>
        </div>

        {/* Job Summary */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.375rem',
            marginBottom: '1rem',
            fontSize: '0.6875rem',
            fontFamily: 'var(--font-sans)',
          }}
        >
          <SummaryRow label="Sources" value={`${jobSummary.sourceCount} file${jobSummary.sourceCount > 1 ? 's' : ''}`} />
          {jobSummary.sourcePaths.length > 0 && (
            <div
              style={{
                marginLeft: '0.75rem',
                padding: '0.375rem 0.5rem',
                background: 'rgba(0, 0, 0, 0.15)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.625rem',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-muted)',
                maxHeight: '60px',
                overflow: 'auto',
              }}
            >
              {jobSummary.sourcePaths.slice(0, 3).map((path, i) => (
                <div key={i} style={{ marginBottom: '0.125rem' }}>
                  {path}
                </div>
              ))}
              {jobSummary.sourcePaths.length > 3 && (
                <div style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>
                  +{jobSummary.sourcePaths.length - 3} more
                </div>
              )}
            </div>
          )}
          <SummaryRow label="Output" value={jobSummary.outputDirectory} mono />
          <SummaryRow label="Profile" value={jobSummary.proxyProfile} />
          <SummaryRow label="Engine" value={jobSummary.engine} />
          {jobSummary.burnInRecipe && (
            <SummaryRow label="Burn-in" value={jobSummary.burnInRecipe} />
          )}
          {jobSummary.lut && (
            <SummaryRow label="LUT" value={jobSummary.lut} />
          )}
        </div>

        {/* Warnings reminder */}
        {hasWarnings && (
          <div
            style={{
              marginBottom: '0.75rem',
              padding: '0.5rem 0.75rem',
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.625rem',
              fontFamily: 'var(--font-sans)',
              color: 'var(--status-warning-fg, #f59e0b)',
            }}
          >
            ⚠ This job has warnings. Proceed with caution.
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCancel}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleConfirm}
            data-testid="job-confirm-create"
          >
            Create Job
          </Button>
        </div>
      </div>
    )
  }

  // Normal submit button state
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
          onClick={() => setShowConfirmation(true)}
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

// =============================================================================
// Summary Row Helper
// =============================================================================

interface SummaryRowProps {
  label: string
  value: string
  mono?: boolean
}

function SummaryRow({ label, value, mono = false }: SummaryRowProps) {
  return (
    <div
      style={{
        display: 'flex',
        gap: '0.5rem',
      }}
    >
      <span
        style={{
          color: 'var(--text-muted)',
          minWidth: '60px',
        }}
      >
        {label}:
      </span>
      <span
        style={{
          color: 'var(--text-secondary)',
          fontFamily: mono ? 'var(--font-mono)' : 'inherit',
          wordBreak: 'break-all',
        }}
      >
        {value}
      </span>
    </div>
  )
}

export default JobSubmitButton
