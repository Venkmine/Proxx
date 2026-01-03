/**
 * Audit Mode Banner Component
 * 
 * Displays a persistent warning banner when E2E_AUDIT_MODE is enabled.
 * This flag exposes unsupported/experimental features for internal testing only.
 * 
 * CRITICAL: This banner MUST be visible whenever audit mode is active.
 */

import './AuditModeBanner.css'

export function AuditModeBanner() {
  // Check if running in audit mode
  const isAuditMode = typeof window !== 'undefined' && 
                      window.electron?.isAuditMode?.() === true

  if (!isAuditMode) {
    return null
  }

  return (
    <div className="audit-mode-banner" data-testid="audit-mode-banner">
      <div className="audit-mode-banner__icon">⚠️</div>
      <div className="audit-mode-banner__content">
        <strong>INTERNAL AUDIT MODE</strong>
        <span className="audit-mode-banner__detail">
          Unsupported features exposed for testing only
        </span>
      </div>
    </div>
  )
}
