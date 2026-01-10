/**
 * StatusLog — DOCKED Status Panel (Bottom of Queue Column)
 * 
 * ╔════════════════════════════════════════════════════════════════════╗
 * ║  DOCKED IN QUEUE PANEL — NEVER OVERLAPS OTHER CONTROLS             ║
 * ║  Uses flex layout, not fixed positioning                           ║
 * ║  Collapses when empty, expands with content                        ║
 * ╚════════════════════════════════════════════════════════════════════╝
 * 
 * Bottom of Queue panel showing:
 * - Job queued
 * - Encoding started
 * - Job completed / failed
 * 
 * Features:
 * - Plain English messages
 * - Timestamped entries
 * - Scrollable list (internal scroll, never covers other UI)
 * - Collapses to minimal height when no entries
 * - Optional "Show details" toggle for verbose logs
 */

import { useState, useEffect, useRef } from 'react'
import { Button } from './Button'

// ============================================================================
// TYPES
// ============================================================================

export type StatusLogLevel = 'info' | 'success' | 'warning' | 'error'

export interface StatusLogEntry {
  id: string
  timestamp: Date
  level: StatusLogLevel
  message: string
  details?: string // Optional verbose details
}

interface StatusLogProps {
  entries: StatusLogEntry[]
  maxHeight?: number
  /** Demo mode: hides details toggle, forces simple view */
  demoMode?: boolean
}

// ============================================================================
// COMPONENT
// ============================================================================

export function StatusLog({ entries, maxHeight = 200, demoMode = false }: StatusLogProps) {
  // In demo mode, always force simple view (no details toggle)
  const [showDetails, setShowDetails] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries])

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit',
      hour12: false 
    })
  }

  const getLevelColor = (level: StatusLogLevel) => {
    switch (level) {
      case 'success':
        return 'var(--status-complete-bg)'
      case 'warning':
        return 'var(--status-warning-bg, #f59e0b)'
      case 'error':
        return 'var(--status-failed-bg)'
      case 'info':
      default:
        return 'var(--button-primary-bg)'
    }
  }

  const getLevelIcon = (level: StatusLogLevel) => {
    switch (level) {
      case 'success':
        return '✓'
      case 'warning':
        return '⚠'
      case 'error':
        return '✗'
      case 'info':
      default:
        return '●'
    }
  }

  // Collapse when no entries (telemetry-style: minimal when idle)
  const hasEntries = entries.length > 0
  const hasRecentActivity = entries.some(e => {
    const age = Date.now() - e.timestamp.getTime()
    return age < 30000 // Active within last 30 seconds
  })
  const isExpanded = hasEntries && hasRecentActivity

  // Collapsed state: one-line minimal height
  if (!isExpanded && entries.length === 0) {
    return (
      <div
        data-testid="status-log"
        style={{
          flexShrink: 0,
          borderTop: '1px solid var(--border-secondary)',
          padding: '0.5rem 0.75rem',
          background: 'rgba(20, 24, 32, 0.6)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.6875rem',
          color: 'var(--text-dim)',
        }}
      >
        <span style={{ opacity: 0.5 }}>●</span>
        <span>No recent activity</span>
      </div>
    )
  }

  return (
    <div
      data-testid="status-log"
      style={{
        flexShrink: 0,
        maxHeight: `${maxHeight}px`,
        borderTop: '1px solid var(--border-secondary)',
        background: 'rgba(20, 24, 32, 0.95)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header — subtle, not modal-like */}
      <div
        style={{
          padding: '0.375rem 0.75rem',
          borderBottom: '1px solid var(--border-secondary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(26, 32, 44, 0.4)',
        }}
      >
        <span
          style={{
            fontSize: '0.625rem',
            fontWeight: 600,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          Status
        </span>
        
        {/* Demo mode: hide details toggle for cleaner presentation */}
        {!demoMode && entries.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDetails(!showDetails)}
            title={showDetails ? 'Hide details' : 'Show details'}
            style={{
              fontSize: '0.5625rem',
              padding: '2px 6px',
              height: 'auto',
            }}
          >
            {showDetails ? 'Simple' : 'Details'}
          </Button>
        )}
      </div>

      {/* Log entries — internal scroll, never exceeds container */}
      <div
        ref={scrollRef}
        data-testid="status-log-entries"
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '0.375rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.25rem',
          minHeight: 0,
          maxHeight: '120px',
        }}
      >
        {entries.length === 0 ? (
          <div
            style={{
              padding: '0.75rem',
              textAlign: 'center',
              color: 'var(--text-dim)',
              fontSize: '0.6875rem',
            }}
          >
            No status messages
          </div>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              data-testid="status-log-entry"
              data-level={entry.level}
              style={{
                padding: '0.375rem 0.5rem',
                background: 'rgba(30, 35, 45, 0.4)',
                borderRadius: '3px',
                borderLeft: `2px solid ${getLevelColor(entry.level)}`,
                fontSize: '0.6875rem',
                lineHeight: 1.4,
              }}
            >
              {/* Timestamp and level */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  marginBottom: '0.125rem',
                }}
              >
                <span
                  style={{
                    color: getLevelColor(entry.level),
                    fontSize: '0.625rem',
                    fontWeight: 600,
                  }}
                >
                  {getLevelIcon(entry.level)}
                </span>
                <span
                  style={{
                    fontSize: '0.5625rem',
                    color: 'var(--text-dim)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {formatTime(entry.timestamp)}
                </span>
              </div>

              {/* Message */}
              <div
                style={{
                  color: 'var(--text-secondary)',
                  wordBreak: 'break-word',
                }}
              >
                {entry.message}
              </div>

              {/* Optional details (only shown when toggle is on AND not in demo mode) */}
              {!demoMode && showDetails && entry.details && (
                <div
                  style={{
                    marginTop: '0.25rem',
                    paddingTop: '0.25rem',
                    borderTop: '1px solid var(--border-secondary)',
                    color: 'var(--text-dim)',
                    fontSize: '0.5625rem',
                    fontFamily: 'var(--font-mono)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {entry.details}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default StatusLog
