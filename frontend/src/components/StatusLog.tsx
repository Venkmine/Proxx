/**
 * StatusLog — FLOATING Status Panel (Independent of Layout)
 * 
 * ╔════════════════════════════════════════════════════════════════════╗
 * ║  FLOATS INDEPENDENTLY — NOT PART OF 3-ZONE LAYOUT                  ║
 * ║  Uses position: fixed to overlay bottom-left corner                ║
 * ║  NEVER affects layout or zone dimensions                           ║
 * ╚════════════════════════════════════════════════════════════════════╝
 * 
 * Bottom-left floating panel showing:
 * - Job queued
 * - Encoding started
 * - Job completed / failed
 * 
 * Features:
 * - Plain English messages
 * - Timestamped entries
 * - Scrollable list
 * - Optional "Show details" toggle for verbose logs
 * - Does NOT expose raw system logs by default
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
}

// ============================================================================
// COMPONENT
// ============================================================================

export function StatusLog({ entries, maxHeight = 200 }: StatusLogProps) {
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

  return (
    <div
      data-testid="status-log"
      style={{
        position: 'fixed',
        bottom: '32px', // Above footer
        left: '8px',
        width: '340px',
        maxHeight: `${maxHeight}px`,
        background: 'rgba(16, 18, 20, 0.98)',
        border: '1px solid var(--border-primary)',
        borderRadius: '6px',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
        zIndex: 100,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--border-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(26, 32, 44, 0.6)',
        }}
      >
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Status
        </span>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowDetails(!showDetails)}
          title={showDetails ? 'Hide details' : 'Show details'}
          style={{
            fontSize: '10px',
            padding: '2px 6px',
            height: 'auto',
          }}
        >
          {showDetails ? 'Simple' : 'Details'}
        </Button>
      </div>

      {/* Log entries */}
      <div
        ref={scrollRef}
        data-testid="status-log-entries"
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '6px',
          display: 'flex',
          flexDirection: 'column',
          gap: '3px',
        }}
      >
        {entries.length === 0 ? (
          <div
            style={{
              padding: '16px',
              textAlign: 'center',
              color: 'var(--text-dim)',
              fontSize: '12px',
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
                padding: '6px 8px',
                background: 'rgba(30, 35, 45, 0.6)',
                borderRadius: '4px',
                borderLeft: `3px solid ${getLevelColor(entry.level)}`,
                fontSize: '11px',
                lineHeight: '1.4',
              }}
            >
              {/* Timestamp and level */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginBottom: '3px',
                }}
              >
                <span
                  style={{
                    color: getLevelColor(entry.level),
                    fontSize: '10px',
                    fontWeight: 700,
                  }}
                >
                  {getLevelIcon(entry.level)}
                </span>
                <span
                  style={{
                    fontSize: '10px',
                    color: 'var(--text-dim)',
                    fontFamily: 'monospace',
                  }}
                >
                  {formatTime(entry.timestamp)}
                </span>
              </div>

              {/* Message */}
              <div
                style={{
                  color: 'var(--text-primary)',
                  wordBreak: 'break-word',
                }}
              >
                {entry.message}
              </div>

              {/* Optional details (only shown when toggle is on) */}
              {showDetails && entry.details && (
                <div
                  style={{
                    marginTop: '4px',
                    paddingTop: '4px',
                    borderTop: '1px solid var(--border-secondary)',
                    color: 'var(--text-dim)',
                    fontSize: '10px',
                    fontFamily: 'monospace',
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
