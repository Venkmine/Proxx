/**
 * PreviewMenu — User-Initiated Preview Generation Menu
 * 
 * ============================================================================
 * DESIGN PHILOSOPHY
 * ============================================================================
 * This component provides explicit user control over preview generation.
 * Video previews are NEVER auto-generated — users must request them.
 * 
 * Menu Options:
 * - 1 frame (instant) — Already shown as poster
 * - 1s video preview
 * - 5s video preview
 * - 10s video preview
 * - More... (20s, 30s, 60s)
 * 
 * For RAW media:
 * - Requires confirmation dialog
 * - Default duration capped at 5s
 * 
 * See: docs/PREVIEW_PIPELINE.md
 * ============================================================================
 */

import React, { useState, useCallback, useRef, useEffect } from 'react'

// ============================================================================
// TYPES
// ============================================================================

interface PreviewMenuProps {
  /** Whether the menu should be visible */
  visible: boolean
  /** Callback when menu visibility changes */
  onClose: () => void
  /** Request video preview with duration */
  onRequestVideo: (duration: number) => void
  /** Whether video is currently being generated */
  isGenerating: boolean
  /** Cancel video generation */
  onCancel: () => void
  /** Whether source is RAW format */
  isRaw?: boolean
  /** Error message from video generation */
  error?: string | null
  /** Whether RAW confirmation is needed */
  requiresConfirmation?: boolean
  /** Confirm RAW preview generation */
  onConfirmRaw?: () => void
}

// ============================================================================
// STYLES
// ============================================================================

const styles = {
  container: {
    position: 'relative' as const,
    display: 'inline-block',
  },
  
  button: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    padding: '0.375rem 0.625rem',
    background: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: '4px',
    color: 'var(--text-secondary, #9ca3af)',
    fontSize: '0.75rem',
    fontFamily: 'var(--font-sans)',
    cursor: 'pointer',
    transition: 'all 150ms ease',
  } as React.CSSProperties,
  
  buttonHover: {
    background: 'rgba(255, 255, 255, 0.1)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
    color: 'var(--text-primary, #e5e7eb)',
  } as React.CSSProperties,
  
  menu: {
    position: 'absolute' as const,
    top: 'calc(100% + 4px)',
    left: 0,
    minWidth: '240px',
    maxWidth: '320px',
    background: 'rgba(20, 22, 28, 0.98)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: '6px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6), 0 4px 12px rgba(0, 0, 0, 0.4)',
    overflow: 'visible',
    zIndex: 9999,  // Ensure menu floats above ALL panels
  },
  
  menuHeader: {
    padding: '0.625rem 0.75rem',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    fontSize: '0.6875rem',
    fontFamily: 'var(--font-sans)',
    color: 'var(--text-dim, #6b7280)',
    letterSpacing: '0.03em',
    textTransform: 'uppercase' as const,
  },
  
  menuItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.5rem 0.75rem',
    fontSize: '0.8125rem',
    fontFamily: 'var(--font-sans)',
    color: 'var(--text-secondary, #9ca3af)',
    cursor: 'pointer',
    transition: 'all 100ms ease',
  } as React.CSSProperties,
  
  menuItemHover: {
    background: 'rgba(59, 130, 246, 0.15)',
    color: 'var(--text-primary, #e5e7eb)',
  } as React.CSSProperties,
  
  menuItemDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  
  menuDivider: {
    height: '1px',
    background: 'rgba(255, 255, 255, 0.1)',
    margin: '0.25rem 0',
  },
  
  badge: {
    fontSize: '0.625rem',
    fontFamily: 'var(--font-mono)',
    padding: '0.125rem 0.375rem',
    borderRadius: '3px',
    background: 'rgba(59, 130, 246, 0.2)',
    color: 'var(--accent-primary, #3b82f6)',
  },
  
  rawWarning: {
    padding: '0.5rem 0.75rem',
    background: 'rgba(251, 191, 36, 0.1)',
    borderTop: '1px solid rgba(251, 191, 36, 0.3)',
    fontSize: '0.6875rem',
    color: 'var(--status-pending-fg, #fbbf24)',
  },
  
  progress: {
    padding: '0.625rem 0.75rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    background: 'rgba(59, 130, 246, 0.1)',
    borderBottom: '1px solid rgba(59, 130, 246, 0.2)',
  },
  
  spinner: {
    width: '14px',
    height: '14px',
    border: '2px solid var(--text-dim)',
    borderTopColor: 'var(--accent-primary, #3b82f6)',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  
  cancelButton: {
    marginLeft: 'auto',
    padding: '0.25rem 0.5rem',
    background: 'rgba(239, 68, 68, 0.15)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '3px',
    color: 'var(--status-failed-fg, #ef4444)',
    fontSize: '0.6875rem',
    cursor: 'pointer',
  },
}

// Duration options
const PRIMARY_DURATIONS = [1, 5, 10]
const EXTENDED_DURATIONS = [20, 30, 60]

// ============================================================================
// COMPONENT
// ============================================================================

export function PreviewMenu({
  visible,
  onClose,
  onRequestVideo,
  isGenerating,
  onCancel,
  isRaw = false,
  error,
  requiresConfirmation,
  onConfirmRaw,
}: PreviewMenuProps) {
  const [showExtended, setShowExtended] = useState(false)
  const [hoveredItem, setHoveredItem] = useState<number | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  
  // Close menu on outside click
  useEffect(() => {
    if (!visible) return
    
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [visible, onClose])
  
  const handleSelectDuration = useCallback((duration: number) => {
    onRequestVideo(duration)
    setShowExtended(false)
  }, [onRequestVideo])
  
  if (!visible) {
    return null
  }
  
  return (
    <div ref={menuRef} style={styles.menu}>
      {/* Header */}
      <div style={styles.menuHeader}>
        Generate Preview…
      </div>
      
      {/* Generating progress */}
      {isGenerating && (
        <div style={styles.progress}>
          <div style={styles.spinner} />
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Generating…
          </span>
          <button 
            style={styles.cancelButton}
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      )}
      
      {/* RAW confirmation dialog */}
      {requiresConfirmation && (
        <div style={{
          padding: '0.75rem',
          background: 'rgba(251, 191, 36, 0.15)',
          borderBottom: '1px solid rgba(251, 191, 36, 0.3)',
        }}>
          <div style={{ 
            fontSize: '0.75rem', 
            color: 'var(--status-pending-fg, #fbbf24)',
            marginBottom: '0.5rem',
          }}>
            RAW format detected. Video preview may take longer.
          </div>
          <button
            onClick={onConfirmRaw}
            style={{
              padding: '0.375rem 0.75rem',
              background: 'rgba(251, 191, 36, 0.2)',
              border: '1px solid rgba(251, 191, 36, 0.4)',
              borderRadius: '4px',
              color: 'var(--status-pending-fg, #fbbf24)',
              fontSize: '0.75rem',
              cursor: 'pointer',
            }}
          >
            Generate Anyway
          </button>
        </div>
      )}
      
      {/* Error message */}
      {error && !requiresConfirmation && (
        <div style={{
          padding: '0.5rem 0.75rem',
          background: 'rgba(239, 68, 68, 0.1)',
          borderBottom: '1px solid rgba(239, 68, 68, 0.2)',
          fontSize: '0.6875rem',
          color: 'var(--status-failed-fg, #ef4444)',
        }}>
          {error}
        </div>
      )}
      
      {/* Primary duration options */}
      {PRIMARY_DURATIONS.map(duration => (
        <div
          key={duration}
          style={{
            ...styles.menuItem,
            ...(hoveredItem === duration ? styles.menuItemHover : {}),
            ...(isGenerating ? styles.menuItemDisabled : {}),
          }}
          onMouseEnter={() => setHoveredItem(duration)}
          onMouseLeave={() => setHoveredItem(null)}
          onClick={() => !isGenerating && handleSelectDuration(duration)}
        >
          <span>{duration === 1 ? '1 second' : `${duration} seconds`}</span>
          {isRaw && duration > 5 && (
            <span style={styles.badge}>RAW +time</span>
          )}
        </div>
      ))}
      
      {/* More options toggle */}
      {!showExtended && (
        <div
          style={{
            ...styles.menuItem,
            ...(hoveredItem === -1 ? styles.menuItemHover : {}),
          }}
          onMouseEnter={() => setHoveredItem(-1)}
          onMouseLeave={() => setHoveredItem(null)}
          onClick={() => setShowExtended(true)}
        >
          <span>More…</span>
          <span style={{ fontSize: '0.625rem', color: 'var(--text-dim)' }}>
            ›
          </span>
        </div>
      )}
      
      {/* Extended duration options */}
      {showExtended && (
        <>
          <div style={styles.menuDivider} />
          {EXTENDED_DURATIONS.map(duration => (
            <div
              key={duration}
              style={{
                ...styles.menuItem,
                ...(hoveredItem === duration ? styles.menuItemHover : {}),
                ...(isGenerating ? styles.menuItemDisabled : {}),
              }}
              onMouseEnter={() => setHoveredItem(duration)}
              onMouseLeave={() => setHoveredItem(null)}
              onClick={() => !isGenerating && handleSelectDuration(duration)}
            >
              <span>{duration} seconds</span>
              {isRaw && (
                <span style={styles.badge}>RAW +time</span>
              )}
            </div>
          ))}
        </>
      )}
      
      {/* RAW warning */}
      {isRaw && (
        <div style={styles.rawWarning}>
          ⚠ RAW format — preview generation may be slow
        </div>
      )}
    </div>
  )
}

// ============================================================================
// PREVIEW MODE BADGE
// ============================================================================

interface PreviewModeBadgeProps {
  mode: 'poster' | 'burst' | 'video' | 'native' | 'raw-pending' | 'generating' | 'failed' | 'none'
  onClick?: () => void
}

export function PreviewModeBadge({ mode, onClick }: PreviewModeBadgeProps) {
  const labels: Record<string, string> = {
    poster: 'Poster Preview',
    burst: 'Burst Preview',
    video: 'Preview Proxy',
    native: 'Playback Ready',
    'raw-pending': 'RAW – Preview Required',
    generating: 'Generating Preview…',
    failed: 'Preview Failed',
    none: 'No Preview',
  }
  
  const colors: Record<string, { bg: string; border: string; text: string }> = {
    poster: {
      bg: 'rgba(100, 116, 139, 0.15)',
      border: 'rgba(100, 116, 139, 0.35)',
      text: 'var(--text-muted, #94a3b8)',
    },
    burst: {
      bg: 'rgba(59, 130, 246, 0.15)',
      border: 'rgba(59, 130, 246, 0.35)',
      text: 'var(--accent-primary, #3b82f6)',
    },
    video: {
      bg: 'rgba(16, 185, 129, 0.15)',
      border: 'rgba(16, 185, 129, 0.35)',
      text: 'var(--status-completed-fg, #10b981)',
    },
    native: {
      bg: 'rgba(16, 185, 129, 0.15)',
      border: 'rgba(16, 185, 129, 0.35)',
      text: 'var(--status-completed-fg, #10b981)',
    },
    'raw-pending': {
      bg: 'rgba(234, 179, 8, 0.15)',
      border: 'rgba(234, 179, 8, 0.35)',
      text: '#eab308',
    },
    generating: {
      bg: 'rgba(59, 130, 246, 0.15)',
      border: 'rgba(59, 130, 246, 0.35)',
      text: 'var(--accent-primary, #3b82f6)',
    },
    failed: {
      bg: 'rgba(239, 68, 68, 0.15)',
      border: 'rgba(239, 68, 68, 0.35)',
      text: 'var(--status-failed-fg, #ef4444)',
    },
    none: {
      bg: 'rgba(100, 116, 139, 0.1)',
      border: 'rgba(100, 116, 139, 0.2)',
      text: 'var(--text-dim, #6b7280)',
    },
  }
  
  const color = colors[mode] || colors.none
  
  return (
    <div
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.375rem',
        padding: '0.25rem 0.5rem',
        background: color.bg,
        border: `1px solid ${color.border}`,
        borderRadius: '4px',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: color.text,
        }}
      />
      <span
        style={{
          fontSize: '0.625rem',
          fontFamily: 'var(--font-sans)',
          color: color.text,
          fontWeight: 500,
          letterSpacing: '0.02em',
        }}
      >
        {labels[mode]}
      </span>
    </div>
  )
}

// ============================================================================
// PREVIEW DISCLAIMER LABEL
// ============================================================================

export function PreviewDisclaimer() {
  return (
    <div
      style={{
        fontSize: '0.5625rem',
        fontFamily: 'var(--font-sans)',
        color: 'var(--text-dim, #6b7280)',
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        opacity: 0.7,
      }}
    >
      Preview media — not source
    </div>
  )
}

export default PreviewMenu
