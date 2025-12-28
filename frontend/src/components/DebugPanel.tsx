/**
 * Debug Panel for UI Event Log
 * 
 * V1 OBSERVABILITY: Hidden debug panel showing UI event log.
 * 
 * Features:
 * - Toggle via keyboard shortcut (Cmd+Alt+D / Ctrl+Alt+D)
 *   NOTE: Changed from Cmd+Shift+D due to Electron/VSCode interception
 * - DEV-only fallback button (fixed, low opacity) in bottom-left corner
 * - Shows last 100 UI events with timestamps
 * - Plain text, no styling polish
 * - DEV mode only (hidden in production)
 * 
 * This panel helps debug UI interactions by showing exactly what
 * happened during browse, preview, and job operations.
 */

import { useState, useEffect, useCallback } from 'react'
import { getUIEvents, clearUIEvents, getUIEventCount, UIEvent } from '../utils/uiEventLog'

interface DebugPanelProps {
  // Allow external control of visibility
  isOpen?: boolean
  onClose?: () => void
}

export function DebugPanel({ isOpen: externalIsOpen, onClose }: DebugPanelProps) {
  const [isOpen, setIsOpen] = useState(externalIsOpen ?? false)
  const [events, setEvents] = useState<UIEvent[]>([])
  const [refreshKey, setRefreshKey] = useState(0)
  
  // Sync with external control if provided
  useEffect(() => {
    if (externalIsOpen !== undefined) {
      setIsOpen(externalIsOpen)
    }
  }, [externalIsOpen])
  
  // Keyboard shortcut: Cmd+Alt+D (Mac) or Ctrl+Alt+D (Windows/Linux)
  // NOTE: Changed from Cmd+Shift+D due to Electron/VSCode interception
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Use Alt (Option on Mac) instead of Shift to avoid editor conflicts
      if ((e.metaKey || e.ctrlKey) && e.altKey && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        e.stopPropagation()
        setIsOpen(prev => {
          const newState = !prev
          if (!newState && onClose) {
            onClose()
          }
          return newState
        })
      }
    }
    
    // Capture phase to handle before Electron intercepts
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [onClose])
  
  // Refresh events periodically when panel is open
  // Display last 100 events for readability
  useEffect(() => {
    if (!isOpen) return
    
    const refreshEvents = () => {
      setEvents(getUIEvents(100))  // Limit to 100 events for display
    }
    
    refreshEvents()
    const interval = setInterval(refreshEvents, 500)
    
    return () => clearInterval(interval)
  }, [isOpen, refreshKey])
  
  const handleClear = useCallback(() => {
    clearUIEvents()
    setRefreshKey(k => k + 1)
  }, [])
  
  const handleClose = useCallback(() => {
    setIsOpen(false)
    if (onClose) onClose()
  }, [onClose])
  
  // Only render in development mode
  if (!import.meta.env.DEV) {
    return null
  }
  
  // DEV-only fallback button when panel is closed
  // Small, fixed, low opacity - always accessible without relying on keyboard shortcuts
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={styles.devFallbackButton}
        title="Open Debug Panel (⌘⌥D)"
        aria-label="Open Debug Panel"
      >
        🔍
      </button>
    )
  }
  
  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        <div style={styles.header}>
          <span style={styles.title}>
            🔍 UI Event Log ({getUIEventCount()} events)
          </span>
          <div style={styles.buttons}>
            <button onClick={handleClear} style={styles.button}>
              Clear
            </button>
            <button onClick={handleClose} style={styles.button}>
              Close (⌘⌥D)
            </button>
          </div>
        </div>
        
        <div style={styles.eventList}>
          {events.length === 0 ? (
            <div style={styles.empty}>No events recorded yet</div>
          ) : (
            events.map(event => (
              <div key={event.id} style={styles.event}>
                <span style={styles.timestamp}>
                  {formatTimestamp(event.timestamp)}
                </span>
                <span style={getEventTypeStyle(event.type)}>
                  [{event.type}]
                </span>
                <span style={styles.message}>{event.message}</span>
                {event.data && (
                  <span style={styles.data}>
                    {JSON.stringify(event.data)}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
        
        <div style={styles.footer}>
          <span style={styles.hint}>
            V1 Observability • Session-scoped • Last 100 events • ⌘⌥D to toggle
          </span>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Helper functions
// ============================================================================

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }) + '.' + String(date.getMilliseconds()).padStart(3, '0')
}

function getEventTypeStyle(type: string): React.CSSProperties {
  const baseStyle = { ...styles.eventType }
  
  if (type.includes('ERROR') || type.includes('FAILED')) {
    return { ...baseStyle, color: '#ff6b6b' }
  }
  if (type.includes('COMPLETED') || type.includes('LOADED')) {
    return { ...baseStyle, color: '#69db7c' }
  }
  if (type.includes('REQUESTED') || type.includes('CLICKED')) {
    return { ...baseStyle, color: '#74c0fc' }
  }
  return baseStyle
}

// ============================================================================
// Inline styles (no CSS file needed)
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  // DEV-only fallback button: small, fixed, low opacity
  // Always visible in DEV mode so debug panel is accessible without keyboard
  devFallbackButton: {
    position: 'fixed',
    bottom: '12px',
    left: '12px',
    width: '28px',
    height: '28px',
    padding: 0,
    backgroundColor: 'rgba(30, 30, 50, 0.6)',
    border: '1px solid rgba(100, 100, 120, 0.4)',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    opacity: 0.4,
    zIndex: 9999,
    transition: 'opacity 0.15s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 10000,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '20px',
  },
  panel: {
    backgroundColor: '#1a1a2e',
    border: '1px solid #333',
    borderRadius: '8px',
    width: '100%',
    maxWidth: '900px',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'Monaco, Menlo, monospace',
    fontSize: '12px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid #333',
  },
  title: {
    color: '#fff',
    fontWeight: 'bold',
  },
  buttons: {
    display: 'flex',
    gap: '8px',
  },
  button: {
    backgroundColor: '#333',
    border: '1px solid #444',
    borderRadius: '4px',
    color: '#ccc',
    padding: '4px 12px',
    cursor: 'pointer',
    fontSize: '11px',
  },
  eventList: {
    flex: 1,
    overflow: 'auto',
    padding: '8px',
  },
  empty: {
    color: '#666',
    textAlign: 'center',
    padding: '40px',
  },
  event: {
    display: 'flex',
    gap: '8px',
    padding: '4px 8px',
    borderBottom: '1px solid #2a2a3e',
    alignItems: 'flex-start',
    lineHeight: 1.4,
  },
  timestamp: {
    color: '#666',
    flexShrink: 0,
  },
  eventType: {
    color: '#888',
    flexShrink: 0,
    minWidth: '180px',
  },
  message: {
    color: '#ccc',
    flex: 1,
    wordBreak: 'break-word',
  },
  data: {
    color: '#666',
    fontSize: '10px',
    maxWidth: '200px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  footer: {
    padding: '8px 16px',
    borderTop: '1px solid #333',
    textAlign: 'center',
  },
  hint: {
    color: '#555',
    fontSize: '10px',
  },
}

export default DebugPanel
