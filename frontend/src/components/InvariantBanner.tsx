/**
 * InvariantBanner — Hardening Pass
 * 
 * A fixed banner at the top of the app that displays active invariant violations.
 * Non-fatal warnings that help developers and testers identify bugs.
 * 
 * Features:
 * - Shows all active violations
 * - Each violation shows message + context
 * - Can be dismissed (clears the violation)
 * - Auto-updates when violations change
 */

import { useState, useEffect } from 'react'
import {
  getViolations,
  subscribeToViolations,
  clearViolation,
  clearAllViolations,
  type InvariantViolation,
} from '../utils/invariants'

interface InvariantBannerProps {
  /** Whether to show the banner (can be gated by feature flag) */
  enabled?: boolean
}

export function InvariantBanner({ enabled = true }: InvariantBannerProps) {
  const [violations, setViolations] = useState<InvariantViolation[]>([])
  
  useEffect(() => {
    if (!enabled) return
    
    // Initial load
    setViolations(getViolations())
    
    // Subscribe to changes
    const unsubscribe = subscribeToViolations(() => {
      setViolations(getViolations())
    })
    
    return unsubscribe
  }, [enabled])
  
  if (!enabled || violations.length === 0) {
    return null
  }
  
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(220, 38, 38, 0.95)',
        color: '#fff',
        padding: '0.5rem 1rem',
        fontFamily: 'var(--font-sans, system-ui)',
        fontSize: '0.8125rem',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
      }}
      role="alert"
      aria-live="assertive"
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '1rem',
          maxWidth: '1400px',
          margin: '0 auto',
        }}
      >
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontWeight: 600,
              marginBottom: '0.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <span style={{ fontSize: '1rem' }}>⚠️</span>
            Invariant Violation{violations.length > 1 ? 's' : ''} ({violations.length})
          </div>
          
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.375rem',
            }}
          >
            {violations.map(v => (
              <li
                key={v.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: '0.75rem',
                    backgroundColor: 'rgba(0, 0, 0, 0.2)',
                    padding: '0.125rem 0.375rem',
                    borderRadius: '0.25rem',
                  }}
                >
                  {v.id}
                </span>
                <span>{v.message}</span>
                {v.component && (
                  <span
                    style={{
                      fontSize: '0.75rem',
                      opacity: 0.8,
                    }}
                  >
                    in {v.component}
                  </span>
                )}
                <button
                  onClick={() => clearViolation(v.id)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.2)',
                    border: 'none',
                    borderRadius: '0.25rem',
                    color: '#fff',
                    padding: '0.125rem 0.5rem',
                    fontSize: '0.6875rem',
                    cursor: 'pointer',
                    marginLeft: 'auto',
                  }}
                  title="Dismiss this violation"
                >
                  Dismiss
                </button>
              </li>
            ))}
          </ul>
        </div>
        
        {violations.length > 1 && (
          <button
            onClick={clearAllViolations}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              borderRadius: '0.25rem',
              color: '#fff',
              padding: '0.25rem 0.75rem',
              fontSize: '0.75rem',
              fontWeight: 500,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
            title="Dismiss all violations"
          >
            Clear All
          </button>
        )}
      </div>
    </div>
  )
}

export default InvariantBanner
