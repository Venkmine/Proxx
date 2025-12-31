/**
 * AttachProxiesInfoPanel — Read-only guidance for attaching proxies in NLEs
 * 
 * INVARIANT: Forge provides guidance only. Forge NEVER modifies NLE projects.
 * 
 * This panel displays:
 * - Links to attach documentation for each NLE
 * - What Forge guarantees
 * - What Forge does NOT do
 * 
 * Read-only. Informational only. No actions.
 */

import React from 'react'

interface AttachProxiesInfoPanelProps {
  /** Whether to show the panel expanded or collapsed */
  defaultExpanded?: boolean
  /** Optional class name for styling */
  className?: string
}

export function AttachProxiesInfoPanel({ 
  defaultExpanded = false,
  className 
}: AttachProxiesInfoPanelProps) {
  const [isExpanded, setIsExpanded] = React.useState(defaultExpanded)
  
  return (
    <div style={panelStyles} className={className} data-testid="attach-proxies-info-panel">
      {/* Header — always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        style={headerButtonStyles}
        aria-expanded={isExpanded}
        aria-label="Toggle attach proxies guidance"
      >
        <div style={headerLeftStyles}>
          <span style={iconStyles}>📎</span>
          <span style={titleStyles}>Attach Proxies</span>
          <span style={badgeStyles}>INFO</span>
        </div>
        <span style={chevronStyles(isExpanded)}>
          ▾
        </span>
      </button>
      
      {/* Expandable content */}
      {isExpanded && (
        <div style={contentStyles}>
          {/* What Forge Does */}
          <div style={sectionStyles}>
            <div style={sectionTitleStyles}>What Forge Guarantees</div>
            <ul style={listStyles}>
              <li style={listItemStyles}>
                <span style={checkStyles}>✓</span>
                Proxies match timecode and frame count
              </li>
              <li style={listItemStyles}>
                <span style={checkStyles}>✓</span>
                NLE-compatible codecs (ProRes, DNxHD)
              </li>
              <li style={listItemStyles}>
                <span style={checkStyles}>✓</span>
                Output follows your naming template
              </li>
            </ul>
          </div>
          
          {/* What Forge Does NOT Do */}
          <div style={sectionStyles}>
            <div style={sectionTitleStyles}>What Forge Does NOT Do</div>
            <ul style={listStyles}>
              <li style={listItemStyles}>
                <span style={crossStyles}>✗</span>
                Modify NLE projects automatically
              </li>
              <li style={listItemStyles}>
                <span style={crossStyles}>✗</span>
                Link proxies to your media
              </li>
              <li style={listItemStyles}>
                <span style={crossStyles}>✗</span>
                Touch original camera files
              </li>
            </ul>
          </div>
          
          {/* Divider */}
          <div style={dividerStyles} />
          
          {/* Documentation Links */}
          <div style={linksContainerStyles}>
            <span style={linkLabelStyles}>Attach Guide:</span>
            <div style={linksRowStyles}>
              <a
                href="docs/ATTACH_RESOLVE.md"
                target="_blank"
                rel="noopener noreferrer"
                style={linkStyles}
                data-testid="attach-resolve-link"
                onClick={(e) => {
                  e.preventDefault()
                  // Open in default app or show in file browser
                  if (window.electron?.openPath) {
                    window.electron.openPath('docs/ATTACH_RESOLVE.md')
                  } else {
                    window.open('docs/ATTACH_RESOLVE.md', '_blank')
                  }
                }}
              >
                <span style={nleLabelStyles}>DaVinci Resolve</span>
                <span style={externalIconStyles}>↗</span>
              </a>
              
              <a
                href="docs/ATTACH_PREMIERE.md"
                target="_blank"
                rel="noopener noreferrer"
                style={linkStyles}
                data-testid="attach-premiere-link"
                onClick={(e) => {
                  e.preventDefault()
                  if (window.electron?.openPath) {
                    window.electron.openPath('docs/ATTACH_PREMIERE.md')
                  } else {
                    window.open('docs/ATTACH_PREMIERE.md', '_blank')
                  }
                }}
              >
                <span style={nleLabelStyles}>Adobe Premiere</span>
                <span style={externalIconStyles}>↗</span>
              </a>
            </div>
          </div>
          
          {/* Footer note */}
          <div style={footerNoteStyles}>
            Proxy attachment is a manual step in your NLE.
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Styles
// ============================================================================

const panelStyles: React.CSSProperties = {
  background: 'var(--surface-secondary)',
  border: '1px solid var(--border-primary)',
  borderRadius: 'var(--radius-lg)',
  overflow: 'hidden',
}

const headerButtonStyles: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  width: '100%',
  padding: '0.75rem 1rem',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: 'inherit',
  textAlign: 'left',
}

const headerLeftStyles: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
}

const iconStyles: React.CSSProperties = {
  fontSize: '1rem',
}

const titleStyles: React.CSSProperties = {
  fontWeight: 600,
  fontSize: '0.8125rem',
  color: 'var(--text-primary)',
}

const badgeStyles: React.CSSProperties = {
  background: 'rgba(59, 130, 246, 0.2)',
  color: '#3b82f6',
  padding: '0.125rem 0.375rem',
  borderRadius: 'var(--radius-sm)',
  fontSize: '0.625rem',
  fontWeight: 600,
  letterSpacing: '0.05em',
}

const chevronStyles = (isExpanded: boolean): React.CSSProperties => ({
  color: 'var(--text-tertiary)',
  fontSize: '0.75rem',
  transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
  transition: 'transform 0.15s ease',
})

const contentStyles: React.CSSProperties = {
  padding: '0 1rem 1rem',
  borderTop: '1px solid var(--border-primary)',
}

const sectionStyles: React.CSSProperties = {
  marginTop: '0.75rem',
}

const sectionTitleStyles: React.CSSProperties = {
  fontSize: '0.6875rem',
  fontWeight: 600,
  color: 'var(--text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: '0.375rem',
}

const listStyles: React.CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
}

const listItemStyles: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.375rem',
  fontSize: '0.75rem',
  color: 'var(--text-secondary)',
  padding: '0.125rem 0',
}

const checkStyles: React.CSSProperties = {
  color: '#10b981',
  fontWeight: 600,
}

const crossStyles: React.CSSProperties = {
  color: '#ef4444',
  fontWeight: 600,
}

const dividerStyles: React.CSSProperties = {
  height: '1px',
  background: 'var(--border-primary)',
  margin: '0.75rem 0',
}

const linksContainerStyles: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.375rem',
}

const linkLabelStyles: React.CSSProperties = {
  fontSize: '0.6875rem',
  fontWeight: 600,
  color: 'var(--text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const linksRowStyles: React.CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
}

const linkStyles: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.25rem',
  padding: '0.375rem 0.625rem',
  background: 'var(--surface-tertiary)',
  borderRadius: 'var(--radius)',
  color: 'var(--text-primary)',
  textDecoration: 'none',
  fontSize: '0.75rem',
  fontWeight: 500,
  border: '1px solid var(--border-secondary)',
  cursor: 'pointer',
  transition: 'background 0.1s ease, border-color 0.1s ease',
}

const nleLabelStyles: React.CSSProperties = {
  // Inherit from linkStyles
}

const externalIconStyles: React.CSSProperties = {
  fontSize: '0.625rem',
  color: 'var(--text-tertiary)',
}

const footerNoteStyles: React.CSSProperties = {
  marginTop: '0.75rem',
  fontSize: '0.6875rem',
  color: 'var(--text-tertiary)',
  fontStyle: 'italic',
}

// Type declaration for electron bridge
declare global {
  interface Window {
    electron?: {
      openPath?: (path: string) => void
    }
  }
}
