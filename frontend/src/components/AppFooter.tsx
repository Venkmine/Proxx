/**
 * AppFooter - Thin, persistent status bar at the bottom of the app.
 * 
 * Displays:
 * - App version (ALPHA + optional git hash)
 * - Tier indicator (Basic / Studio)
 * - Engine status (Resolve / FFmpeg)
 * - Support / Docs links
 * 
 * Requirements:
 * - Visually quiet, non-interactive (status-bar style)
 * - No icons, animations, or branding emphasis
 * - ~24px height
 */

interface AppFooterProps {
  /** App version string (e.g., "ALPHA" or "ALPHA-abc1234") */
  version?: string
  /** Tier: Basic or Studio */
  tier?: 'Basic' | 'Studio'
  /** Engine status indicators */
  engines?: {
    ffmpeg?: boolean
    resolve?: boolean
  }
}

export function AppFooter({
  version = 'ALPHA',
  tier = 'Basic',
  engines = {},
}: AppFooterProps) {
  const engineStatus = []
  
  if (engines.ffmpeg !== undefined) {
    engineStatus.push(engines.ffmpeg ? 'FFmpeg ✓' : 'FFmpeg ✗')
  }
  if (engines.resolve !== undefined) {
    engineStatus.push(engines.resolve ? 'Resolve ✓' : 'Resolve —')
  }
  
  return (
    <footer
      data-testid="app-footer"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '24px',
        padding: '0 0.75rem',
        background: 'rgba(10, 12, 14, 0.95)',
        borderTop: '1px solid var(--border-secondary)',
        fontSize: '0.625rem',
        fontFamily: 'var(--font-mono, monospace)',
        color: 'var(--text-muted)',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      {/* Left: Version + Tier */}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <span data-testid="footer-version">{version}</span>
        <span 
          data-testid="footer-tier"
          style={{ 
            color: tier === 'Studio' ? 'var(--button-primary-bg)' : 'var(--text-muted)',
          }}
        >
          {tier}
        </span>
      </div>
      
      {/* Center: Engine Status */}
      {engineStatus.length > 0 && (
        <div 
          data-testid="footer-engines"
          style={{ 
            display: 'flex', 
            gap: '0.75rem',
            color: 'var(--text-muted)',
          }}
        >
          {engineStatus.map((status, i) => (
            <span key={i}>{status}</span>
          ))}
        </div>
      )}
      
      {/* Right: Links */}
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <a
          href="https://docs.awaire.io/proxy"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: 'var(--text-muted)',
            textDecoration: 'none',
          }}
          data-testid="footer-docs-link"
        >
          Docs
        </a>
        <a
          href="https://awaire.io/support"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: 'var(--text-muted)',
            textDecoration: 'none',
          }}
          data-testid="footer-support-link"
        >
          Support
        </a>
      </div>
    </footer>
  )
}
