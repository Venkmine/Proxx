/**
 * FirstRunStatus - Read-only readiness status panel.
 *
 * Displays Forge readiness state on first launch:
 * - Shows all checks with ✔ / ✘ status
 * - Highlights blocking issues
 * - Read-only, no actions
 * - Dismissible once READY
 *
 * Part of IMPLEMENTATION SLICE 6: Operator Entrypoints and Packaging.
 */

import { useState, useEffect, useCallback } from 'react'

// Types matching backend readiness report
interface CheckResult {
  id: string
  status: 'pass' | 'fail'
  message: string
  hint?: string
}

interface ReadinessReport {
  version: string
  ready: boolean
  timestamp: string
  summary: {
    total_checks: number
    passed: number
    failed: number
    blocking_failures: number
  }
  checks: CheckResult[]
}

// Checks that block startup
const BLOCKING_CHECKS = new Set([
  'python_version',
  'directories_writable',
  'license_valid',
  'worker_capacity',
])

// LocalStorage key for dismissal
const DISMISSED_KEY = 'forge_first_run_dismissed'
const DISMISSED_VERSION_KEY = 'forge_first_run_dismissed_version'

interface FirstRunStatusProps {
  /**
   * API base URL for fetching readiness
   * @default 'http://127.0.0.1:8085'
   */
  apiUrl?: string

  /**
   * Callback when panel is dismissed
   */
  onDismiss?: () => void

  /**
   * Force show even if previously dismissed
   */
  forceShow?: boolean
}

export function FirstRunStatus({
  apiUrl = 'http://127.0.0.1:8085',
  onDismiss,
  forceShow = false,
}: FirstRunStatusProps) {
  const [report, setReport] = useState<ReadinessReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  // Check if already dismissed for this version
  useEffect(() => {
    if (forceShow) return

    const dismissedVersion = localStorage.getItem(DISMISSED_VERSION_KEY)
    const wasDismissed = localStorage.getItem(DISMISSED_KEY) === 'true'

    if (wasDismissed && report?.version === dismissedVersion) {
      setDismissed(true)
    }
  }, [forceShow, report?.version])

  // Fetch readiness report
  useEffect(() => {
    async function fetchReadiness() {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch(`${apiUrl}/api/readiness`)

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const data: ReadinessReport = await response.json()
        setReport(data)
      } catch (err) {
        // If API not available, try local readiness
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to fetch readiness status'
        )
      } finally {
        setLoading(false)
      }
    }

    fetchReadiness()
  }, [apiUrl])

  // Handle dismiss
  const handleDismiss = useCallback(() => {
    if (report?.ready) {
      localStorage.setItem(DISMISSED_KEY, 'true')
      localStorage.setItem(DISMISSED_VERSION_KEY, report.version)
      setDismissed(true)
      onDismiss?.()
    }
  }, [report, onDismiss])

  // Don't render if dismissed
  if (dismissed) {
    return null
  }

  // Loading state
  if (loading) {
    return (
      <div className="first-run-status first-run-status--loading">
        <div className="first-run-status__header">
          <h2>Checking Forge Readiness...</h2>
        </div>
        <div className="first-run-status__body">
          <div className="first-run-status__spinner" />
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="first-run-status first-run-status--error">
        <div className="first-run-status__header">
          <h2>Readiness Check Failed</h2>
        </div>
        <div className="first-run-status__body">
          <p className="first-run-status__error-message">{error}</p>
          <p className="first-run-status__hint">
            Run <code>python forge.py --check</code> in terminal for details.
          </p>
        </div>
      </div>
    )
  }

  // No report
  if (!report) {
    return null
  }

  // Render readiness panel
  const statusClass = report.ready
    ? 'first-run-status--ready'
    : 'first-run-status--not-ready'

  return (
    <div className={`first-run-status ${statusClass}`}>
      <div className="first-run-status__header">
        <h2>
          {report.ready ? '✔ Forge Ready' : '✘ Forge Not Ready'}
        </h2>
        <span className="first-run-status__version">v{report.version}</span>
      </div>

      <div className="first-run-status__body">
        {/* Summary */}
        <div className="first-run-status__summary">
          <span className="first-run-status__stat first-run-status__stat--passed">
            {report.summary.passed} passed
          </span>
          <span className="first-run-status__stat first-run-status__stat--failed">
            {report.summary.failed} failed
          </span>
          {report.summary.blocking_failures > 0 && (
            <span className="first-run-status__stat first-run-status__stat--blocking">
              {report.summary.blocking_failures} blocking
            </span>
          )}
        </div>

        {/* Check list */}
        <ul className="first-run-status__checks">
          {report.checks.map((check) => {
            const isPassed = check.status === 'pass'
            const isBlocking = BLOCKING_CHECKS.has(check.id)
            const checkClass = isPassed
              ? 'first-run-status__check--passed'
              : isBlocking
                ? 'first-run-status__check--blocking'
                : 'first-run-status__check--failed'

            return (
              <li
                key={check.id}
                className={`first-run-status__check ${checkClass}`}
              >
                <span className="first-run-status__check-icon">
                  {isPassed ? '✔' : '✘'}
                </span>
                <span className="first-run-status__check-id">{check.id}</span>
                <span className="first-run-status__check-message">
                  {check.message}
                </span>
                {isBlocking && !isPassed && (
                  <span className="first-run-status__check-blocking-tag">
                    BLOCKING
                  </span>
                )}
                {check.hint && !isPassed && (
                  <p className="first-run-status__check-hint">{check.hint}</p>
                )}
              </li>
            )
          })}
        </ul>

        {/* Not ready message */}
        {!report.ready && (
          <div className="first-run-status__not-ready-message">
            <p>Forge cannot start until blocking issues are resolved.</p>
            <p>
              Run <code>python forge.py --check</code> for details.
            </p>
          </div>
        )}

        {/* Dismiss button (only when ready) */}
        {report.ready && (
          <div className="first-run-status__actions">
            <button
              type="button"
              className="first-run-status__dismiss-button"
              onClick={handleDismiss}
            >
              Dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// CSS styles (inline for portability)
const styles = `
.first-run-status {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 8px;
  max-width: 600px;
  margin: 24px auto;
  overflow: hidden;
}

.first-run-status__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: #222;
  border-bottom: 1px solid #333;
}

.first-run-status__header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.first-run-status--ready .first-run-status__header h2 {
  color: #4ade80;
}

.first-run-status--not-ready .first-run-status__header h2 {
  color: #f87171;
}

.first-run-status__version {
  font-size: 12px;
  color: #888;
  font-family: monospace;
}

.first-run-status__body {
  padding: 16px 20px;
}

.first-run-status__summary {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
  font-size: 13px;
}

.first-run-status__stat--passed {
  color: #4ade80;
}

.first-run-status__stat--failed {
  color: #fbbf24;
}

.first-run-status__stat--blocking {
  color: #f87171;
  font-weight: 600;
}

.first-run-status__checks {
  list-style: none;
  margin: 0;
  padding: 0;
}

.first-run-status__check {
  display: grid;
  grid-template-columns: 20px auto 1fr auto;
  gap: 8px;
  align-items: start;
  padding: 8px 0;
  border-bottom: 1px solid #2a2a2a;
  font-size: 13px;
}

.first-run-status__check:last-child {
  border-bottom: none;
}

.first-run-status__check-icon {
  font-size: 14px;
}

.first-run-status__check--passed .first-run-status__check-icon {
  color: #4ade80;
}

.first-run-status__check--failed .first-run-status__check-icon,
.first-run-status__check--blocking .first-run-status__check-icon {
  color: #f87171;
}

.first-run-status__check-id {
  font-family: monospace;
  color: #888;
  font-size: 12px;
}

.first-run-status__check-message {
  color: #ccc;
}

.first-run-status__check-blocking-tag {
  background: #7f1d1d;
  color: #fecaca;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
}

.first-run-status__check-hint {
  grid-column: 2 / -1;
  margin: 4px 0 0;
  padding-left: 8px;
  border-left: 2px solid #444;
  color: #888;
  font-size: 12px;
}

.first-run-status__not-ready-message {
  margin-top: 16px;
  padding: 12px;
  background: #2a1a1a;
  border: 1px solid #7f1d1d;
  border-radius: 4px;
  color: #fecaca;
  font-size: 13px;
}

.first-run-status__not-ready-message code {
  background: #3a2a2a;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: monospace;
}

.first-run-status__actions {
  margin-top: 16px;
  text-align: right;
}

.first-run-status__dismiss-button {
  background: #2563eb;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s;
}

.first-run-status__dismiss-button:hover {
  background: #1d4ed8;
}

.first-run-status__spinner {
  width: 24px;
  height: 24px;
  border: 2px solid #333;
  border-top-color: #888;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 20px auto;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.first-run-status__error-message {
  color: #f87171;
  font-family: monospace;
  font-size: 13px;
  margin-bottom: 12px;
}

.first-run-status__hint {
  color: #888;
  font-size: 13px;
}

.first-run-status__hint code {
  background: #2a2a2a;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: monospace;
}
`

// Inject styles on module load
if (typeof document !== 'undefined') {
  const styleId = 'first-run-status-styles'
  if (!document.getElementById(styleId)) {
    const styleEl = document.createElement('style')
    styleEl.id = styleId
    styleEl.textContent = styles
    document.head.appendChild(styleEl)
  }
}

export default FirstRunStatus
