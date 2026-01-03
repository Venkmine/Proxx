/**
 * Audit Mode Banner Component
 * 
 * Displays a persistent warning banner when E2E_AUDIT_MODE is enabled.
 * This flag exposes unsupported/experimental features for internal testing only.
 * 
 * CRITICAL: This banner MUST be visible whenever audit mode is active.
 */

import { useEffect, useState } from 'react'
import './AuditModeBanner.css'

export function AuditModeBanner() {
  const [isAuditMode, setIsAuditMode] = useState(false)
  const [isClient, setIsClient] = useState(false)

  // Hydration effect - ensure we're on the client
  useEffect(() => {
    setIsClient(true)
  }, [])

  // Check audit mode after hydration
  useEffect(() => {
    if (!isClient) return

    const checkAuditMode = () => {
      if (typeof window !== 'undefined' && window.electron?.isAuditMode) {
        const auditMode = window.electron.isAuditMode()
        setIsAuditMode(auditMode)
      }
    }

    // Check immediately
    checkAuditMode()
    
    // Also check after a short delay to ensure Electron IPC is ready
    const timer = setTimeout(checkAuditMode, 100)
    return () => clearTimeout(timer)
  }, [isClient])

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
