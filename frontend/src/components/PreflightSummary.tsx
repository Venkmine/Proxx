/**
 * PreflightSummary - Mandatory preflight check display for job creation.
 * 
 * This component aggregates ALL validation checks before job submission:
 * - Engine availability (FFmpeg/Resolve)
 * - Resolve edition (Studio required for certain features)
 * - Worker availability vs license limits
 * - Routing validity (source → engine compatibility)
 * - Output writability
 * - Burn-in + LUT validity
 * 
 * Each check has exactly three states:
 * - ✔ Pass: Green, job can proceed
 * - ⚠ Warning: Orange, job can proceed but user should be aware
 * - ❌ Fail: Red, job CANNOT be submitted
 * 
 * If ANY ❌ exists, the submit button must be hidden.
 * 
 * DESIGN PRINCIPLES:
 * - All checks must be computed before render (no async in display)
 * - No modal popups — all feedback is inline and persistent
 * - Messages are factual, not advisory
 * - No auto-fixing, no silent fallbacks
 */

import React from 'react'

// =============================================================================
// Types
// =============================================================================

export type PreflightStatus = 'pass' | 'warning' | 'fail'

export interface PreflightCheck {
  /** Unique key for this check */
  id: string
  /** Human-readable label */
  label: string
  /** Status of the check */
  status: PreflightStatus
  /** Detailed message (shown always for fail/warning, collapsible for pass) */
  message: string
  /** Optional additional context for debugging */
  detail?: string
}

// Import AppMode type for conditional rendering
import type { AppMode } from '../types/appMode'

export interface PreflightSummaryProps {
  /** Array of all preflight checks */
  checks: PreflightCheck[]
  /** Whether the panel is loading/computing */
  loading?: boolean
  /** App mode — controls rendering behavior */
  appMode?: AppMode
}

// =============================================================================
// Status Icons
// =============================================================================

const STATUS_ICONS: Record<PreflightStatus, { icon: string; color: string; bg: string }> = {
  pass: {
    icon: '✔',
    color: 'var(--status-success-fg, #22c55e)',
    bg: 'rgba(34, 197, 94, 0.1)',
  },
  warning: {
    icon: '⚠',
    color: 'var(--status-warning-fg, #f59e0b)',
    bg: 'rgba(245, 158, 11, 0.1)',
  },
  fail: {
    icon: '✕',
    color: 'var(--status-error-fg, #ef4444)',
    bg: 'rgba(239, 68, 68, 0.15)',
  },
}

// =============================================================================
// Neutral/Soft Styling for Configuring Mode
// =============================================================================

const NEUTRAL_STATUS_ICONS: Record<PreflightStatus, { icon: string; color: string; bg: string }> = {
  pass: {
    icon: '✔',
    color: 'var(--status-success-fg, #22c55e)',
    bg: 'rgba(34, 197, 94, 0.1)',
  },
  warning: {
    icon: '○',
    color: 'var(--text-muted, #6b7280)',
    bg: 'transparent',
  },
  fail: {
    icon: '○',
    color: 'var(--text-muted, #6b7280)',
    bg: 'transparent',
  },
}

// =============================================================================
// Component
// =============================================================================

export function PreflightSummary({ checks, loading = false, appMode = 'ready' }: PreflightSummaryProps) {
  // =========================================================================
  // APP MODE GATING
  // =========================================================================
  // - idle: PreflightSummary is NOT rendered at all
  // - configuring: Render with neutral/soft styling (no red errors)
  // - ready: Render normally (green/amber/red)
  // - running/completed: Render collapsed summary (1-line status only)
  
  // In idle mode, don't render anything
  if (appMode === 'idle') {
    return null
  }
  
  // Count statuses
  const failCount = checks.filter(c => c.status === 'fail').length
  const warningCount = checks.filter(c => c.status === 'warning').length
  const passCount = checks.filter(c => c.status === 'pass').length

  // Determine header status
  const hasBlockingFailures = failCount > 0
  
  // Use neutral styling in configuring mode (no red errors by default)
  const isConfiguringMode = appMode === 'configuring'
  const isCollapsedMode = appMode === 'running' || appMode === 'completed'
  
  // In configuring mode, use neutral header style
  const headerStatus: PreflightStatus = isConfiguringMode 
    ? 'warning'  // Neutral appearance
    : hasBlockingFailures ? 'fail' : warningCount > 0 ? 'warning' : 'pass'
  const statusIcons = isConfiguringMode ? NEUTRAL_STATUS_ICONS : STATUS_ICONS
  const headerStyle = statusIcons[headerStatus]

  // Sort checks: failures first, then warnings, then passes
  const sortedChecks = [...checks].sort((a, b) => {
    const order: Record<PreflightStatus, number> = { fail: 0, warning: 1, pass: 2 }
    return order[a.status] - order[b.status]
  })
  
  // =========================================================================
  // COLLAPSED MODE (running/completed)
  // =========================================================================
  if (isCollapsedMode) {
    return (
      <div
        data-testid="preflight-summary"
        data-mode="collapsed"
        style={{
          padding: '0.5rem 0.75rem',
          background: 'rgba(26, 32, 44, 0.6)',
          border: '1px solid var(--border-secondary)',
          borderRadius: 'var(--radius-sm)',
          marginTop: '0.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        <span style={{ fontSize: '0.75rem', color: 'var(--status-success-fg, #22c55e)' }}>
          ✔
        </span>
        <span style={{
          fontSize: '0.6875rem',
          fontFamily: 'var(--font-sans)',
          color: 'var(--text-secondary)',
        }}>
          Preflight: {passCount} pass · {warningCount} warn · {failCount} fail
        </span>
      </div>
    )
  }

  return (
    <div
      data-testid="preflight-summary"
      data-mode={appMode}
      style={{
        padding: '1rem 1.25rem',
        background: 'linear-gradient(180deg, rgba(26, 32, 44, 0.98) 0%, rgba(17, 24, 39, 0.98) 100%)',
        // In configuring mode, use neutral border (no red)
        border: `1px solid ${
          isConfiguringMode 
            ? 'var(--border-primary)' 
            : hasBlockingFailures 
              ? 'rgba(239, 68, 68, 0.4)' 
              : 'var(--border-primary)'
        }`,
        borderRadius: 'var(--radius)',
        marginTop: '0.75rem',
        // Phase E2: Ensure proper layout
        position: 'relative',
        overflow: 'visible',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: '0.75rem',
          paddingBottom: '0.5rem',
          borderBottom: '1px solid var(--border-secondary)',
        }}
      >
        <span
          style={{
            fontSize: '1rem',
            color: headerStyle.color,
          }}
        >
          {loading ? '◌' : (isConfiguringMode ? '○' : headerStyle.icon)}
        </span>
        <h3
          style={{
            margin: 0,
            fontSize: '0.8125rem',
            fontFamily: 'var(--font-sans)',
            fontWeight: 600,
            color: 'var(--text-primary)',
            letterSpacing: '-0.01em',
          }}
        >
          {isConfiguringMode ? 'Setup Required' : 'Preflight Summary'}
        </h3>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: '0.6875rem',
            fontFamily: 'var(--font-sans)',
            color: 'var(--text-muted)',
          }}
        >
          {loading ? 'Checking...' : `${passCount} pass · ${warningCount} warn · ${failCount} fail`}
        </span>
      </div>

      {/* Loading State */}
      {loading && (
        <div
          style={{
            padding: '1rem',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: '0.75rem',
            fontStyle: 'italic',
          }}
        >
          Running preflight checks...
        </div>
      )}

      {/* No Checks */}
      {!loading && checks.length === 0 && (
        <div
          style={{
            padding: '0.75rem',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: '0.75rem',
          }}
        >
          No checks configured
        </div>
      )}

      {/* Check List */}
      {!loading && checks.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
          {sortedChecks.map((check) => {
            // Use neutral icons in configuring mode
            const icons = isConfiguringMode ? NEUTRAL_STATUS_ICONS : STATUS_ICONS
            const { icon, color, bg } = icons[check.status]
            
            // In configuring mode, use subtle borders
            const getBorder = () => {
              if (isConfiguringMode) {
                return check.status === 'pass' 
                  ? '1px solid transparent' 
                  : '1px solid var(--border-secondary)'
              }
              if (check.status === 'fail') return '1px solid rgba(239, 68, 68, 0.3)'
              if (check.status === 'warning') return '1px solid rgba(245, 158, 11, 0.3)'
              return '1px solid transparent'
            }
            
            return (
              <div
                key={check.id}
                data-testid={`preflight-check-${check.id}`}
                data-status={check.status}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.5rem',
                  padding: '0.5rem 0.625rem',
                  background: check.status === 'pass' ? 'transparent' : (isConfiguringMode ? 'transparent' : bg),
                  borderRadius: 'var(--radius-sm)',
                  border: getBorder(),
                }}
              >
                {/* Status Icon */}
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: color,
                    fontWeight: 600,
                    flexShrink: 0,
                    width: '1rem',
                    textAlign: 'center',
                  }}
                >
                  {icon}
                </span>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Label */}
                  <div
                    style={{
                      fontSize: '0.75rem',
                      fontFamily: 'var(--font-sans)',
                      fontWeight: 500,
                      // In configuring mode, use secondary text for all statuses
                      color: isConfiguringMode 
                        ? 'var(--text-secondary)' 
                        : (check.status === 'pass' ? 'var(--text-secondary)' : color),
                    }}
                  >
                    {check.label}
                  </div>

                  {/* Message - always shown for fail/warning */}
                  {(check.status !== 'pass' || check.message) && (
                    <div
                      style={{
                        fontSize: '0.6875rem',
                        fontFamily: 'var(--font-sans)',
                        color: check.status === 'pass' ? 'var(--text-muted)' : 'var(--text-secondary)',
                        marginTop: '0.125rem',
                        lineHeight: 1.4,
                        // Phase E2: Ensure proper text wrapping
                        wordWrap: 'break-word',
                        overflowWrap: 'break-word',
                      }}
                    >
                      {check.message}
                    </div>
                  )}

                  {/* Detail - shown only for failures */}
                  {check.detail && check.status === 'fail' && (
                    <div
                      style={{
                        fontSize: '0.625rem',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-dim)',
                        marginTop: '0.25rem',
                        padding: '0.375rem',
                        background: 'rgba(0, 0, 0, 0.2)',
                        borderRadius: 'var(--radius-sm)',
                        // Phase E2: Ensure proper text wrapping
                        wordWrap: 'break-word',
                        overflowWrap: 'break-word',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {check.detail}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Blocking Failures Summary — neutral in configuring mode, red in ready mode */}
      {!loading && hasBlockingFailures && (
        <div
          style={{
            marginTop: '0.75rem',
            padding: '0.5rem 0.75rem',
            // In configuring mode, use neutral styling (not accusatory)
            background: isConfiguringMode 
              ? 'rgba(107, 114, 128, 0.1)'  // Neutral gray
              : 'rgba(239, 68, 68, 0.1)',
            border: isConfiguringMode
              ? '1px solid rgba(107, 114, 128, 0.3)'
              : '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.6875rem',
            fontFamily: 'var(--font-sans)',
            fontWeight: 500,
            color: isConfiguringMode
              ? 'var(--text-secondary, #9ca3af)'
              : 'var(--status-error-fg, #ef4444)',
            textAlign: 'center',
          }}
        >
          {isConfiguringMode 
            ? `Complete ${failCount} item${failCount > 1 ? 's' : ''} to continue`
            : `${failCount} blocking issue${failCount > 1 ? 's' : ''} must be resolved`
          }
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Helper: Check if preflight allows submission
// =============================================================================

export function canSubmitWithPreflight(checks: PreflightCheck[]): boolean {
  return !checks.some(c => c.status === 'fail')
}

// =============================================================================
// Helper: Get blocking failure messages
// =============================================================================

export function getBlockingFailures(checks: PreflightCheck[]): PreflightCheck[] {
  return checks.filter(c => c.status === 'fail')
}

export default PreflightSummary
