/**
 * PreflightErrorBanner — Persistent error display for preflight failures.
 * 
 * RATIONALE:
 * Forge is a deterministic proxy engine, not a media browser.
 * Errors are surfaced once, persistently, no toasts.
 * 
 * DESIGN (Strict):
 * - Errors are displayed inline, not as toasts
 * - Errors persist until user takes corrective action
 * - Clear, actionable error messages
 * - No auto-dismiss
 */

import { 
  SourceSelectionState, 
  hasPreflightError,
  type PreflightError 
} from '../stores/sourceSelectionStore'
import { Button } from './Button'

interface PreflightErrorBannerProps {
  /** Current source selection state */
  selectionState: SourceSelectionState
  /** Error details (only valid when state === PREFLIGHT_FAILED) */
  error: PreflightError | null
  /** Callback to retry preflight */
  onRetry?: () => void
  /** Callback to clear sources and start over */
  onClear?: () => void
}

/**
 * PreflightErrorBanner — Persistent, inline error display.
 * 
 * NO toasts. NO auto-dismiss. Errors persist until resolved.
 */
export function PreflightErrorBanner({
  selectionState,
  error,
  onRetry,
  onClear,
}: PreflightErrorBannerProps) {
  // Only show when in error state
  if (!hasPreflightError(selectionState) || !error) {
    return null
  }

  return (
    <div
      data-testid="preflight-error-banner"
      style={{
        padding: '1rem',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        border: '1px solid rgba(239, 68, 68, 0.4)',
        borderRadius: 'var(--radius-md)',
        marginBottom: '1rem',
      }}
    >
      {/* Error header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        marginBottom: '0.5rem',
      }}>
        <span style={{ 
          color: 'var(--status-error-fg, #ef4444)',
          fontSize: '1rem',
        }}>
          ✕
        </span>
        <span style={{
          fontWeight: 600,
          color: 'var(--status-error-fg, #ef4444)',
          fontSize: '0.875rem',
        }}>
          Preflight Failed
        </span>
      </div>

      {/* Error message */}
      <div style={{
        color: 'var(--text-primary)',
        fontSize: '0.8125rem',
        marginBottom: error.invalidPaths?.length ? '0.75rem' : '1rem',
        lineHeight: 1.5,
      }}>
        {error.message}
      </div>

      {/* Invalid paths list (if applicable) */}
      {error.invalidPaths && error.invalidPaths.length > 0 && (
        <div style={{
          marginBottom: '1rem',
          padding: '0.5rem',
          backgroundColor: 'rgba(0, 0, 0, 0.2)',
          borderRadius: 'var(--radius-sm)',
          fontSize: '0.75rem',
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-muted)',
          maxHeight: '100px',
          overflowY: 'auto',
        }}>
          {error.invalidPaths.slice(0, 5).map((path, i) => (
            <div key={i} style={{ marginBottom: '0.25rem' }}>
              {path}
            </div>
          ))}
          {error.invalidPaths.length > 5 && (
            <div style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>
              ...and {error.invalidPaths.length - 5} more
            </div>
          )}
        </div>
      )}

      {/* Technical detail (if available) */}
      {error.detail && (
        <div style={{
          marginBottom: '1rem',
          fontSize: '0.6875rem',
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-dim)',
        }}>
          Detail: {error.detail}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {onRetry && (
          <Button onClick={onRetry} style={{ fontSize: '0.75rem' }}>
            Retry Preflight
          </Button>
        )}
        {onClear && (
          <Button 
            onClick={onClear} 
            style={{ 
              fontSize: '0.75rem',
              backgroundColor: 'transparent',
              border: '1px solid var(--border-primary)',
            }}
          >
            Clear & Start Over
          </Button>
        )}
      </div>
    </div>
  )
}
