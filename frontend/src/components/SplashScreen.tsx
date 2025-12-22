import { useEffect, useState } from 'react'
import { Button } from './Button'

/**
 * SplashScreen - Minimal startup screen shown during engine detection.
 * 
 * Displays:
 * - Awaire Proxy logo
 * - Resolve detected status
 * - FFmpeg detected status
 * - Tier message (Basic: Camera RAW formats not supported)
 * 
 * Behavior:
 * - Auto-dismiss once engine checks complete AND minimum time elapsed
 * - Minimum visible time: 1.5s
 * - Allow user click to dismiss early AFTER engine checks complete
 * - If engines are missing, show "Continue" button to dismiss anyway
 * - Never block user unnecessarily
 */

interface SplashScreenProps {
  /** Whether engine checks are complete */
  isReady: boolean
  /** FFmpeg availability */
  ffmpegAvailable?: boolean
  /** Resolve availability */
  resolveAvailable?: boolean
  /** Current tier */
  tier?: 'Basic' | 'Studio'
  /** Callback when splash should dismiss */
  onDismiss: () => void
}

export function SplashScreen({
  isReady,
  ffmpegAvailable,
  resolveAvailable,
  tier = 'Basic',
  onDismiss,
}: SplashScreenProps) {
  const [minTimeElapsed, setMinTimeElapsed] = useState(false)
  const [timeoutElapsed, setTimeoutElapsed] = useState(false)
  
  // Minimum visibility timer (1.5s)
  useEffect(() => {
    const timer = setTimeout(() => {
      setMinTimeElapsed(true)
    }, 1500)
    
    return () => clearTimeout(timer)
  }, [])
  
  // Fallback timeout (5s) - allow dismiss even if backend never connects
  useEffect(() => {
    const timer = setTimeout(() => {
      setTimeoutElapsed(true)
    }, 5000)
    
    return () => clearTimeout(timer)
  }, [])
  
  // Auto-dismiss when ready AND minimum time elapsed
  useEffect(() => {
    if (isReady && minTimeElapsed && ffmpegAvailable) {
      onDismiss()
    }
  }, [isReady, minTimeElapsed, ffmpegAvailable, onDismiss])
  
  // Can dismiss early if checks are complete (even if some engines missing)
  // OR if timeout has elapsed (backend never connected)
  const canDismissEarly = (isReady && minTimeElapsed) || timeoutElapsed
  // Show continue button if engines are missing but checks complete, OR timeout elapsed
  const showContinueButton = (isReady && (!ffmpegAvailable || !resolveAvailable)) || timeoutElapsed
  
  // Handle click on backdrop to dismiss (only if allowed)
  const handleBackdropClick = () => {
    if (canDismissEarly) {
      onDismiss()
    }
  }
  
  return (
    <div
      data-testid="splash-screen"
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(180deg, #0a0c0e 0%, #12151a 100%)',
        zIndex: 9999,
        cursor: canDismissEarly ? 'pointer' : 'default',
      }}
    >
      {/* Logo Area */}
      <div
        style={{
          marginBottom: '2rem',
          textAlign: 'center',
        }}
      >
        {/* Placeholder logo - simple text for now */}
        <div
          style={{
            fontSize: '2rem',
            fontWeight: 700,
            fontFamily: 'var(--font-sans)',
            color: 'var(--text-primary)',
            letterSpacing: '-0.02em',
          }}
        >
          Awaire Proxy
        </div>
        <div
          style={{
            fontSize: '0.75rem',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-muted)',
            marginTop: '0.5rem',
          }}
        >
          ALPHA
        </div>
      </div>
      
      {/* Engine Status */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          minWidth: '200px',
          marginBottom: '1.5rem',
        }}
      >
        {/* FFmpeg Status */}
        <div
          data-testid="splash-ffmpeg-status"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.5rem 0.75rem',
            background: 'rgba(255, 255, 255, 0.03)',
            borderRadius: '4px',
            fontSize: '0.75rem',
            fontFamily: 'var(--font-sans)',
          }}
        >
          <span style={{ color: 'var(--text-secondary)' }}>FFmpeg</span>
          {ffmpegAvailable === undefined ? (
            <span style={{ color: 'var(--text-muted)' }}>Checking...</span>
          ) : ffmpegAvailable ? (
            <span style={{ color: 'var(--status-success-fg)' }}>Available</span>
          ) : (
            <span style={{ color: 'var(--status-error-fg)' }}>Not Found</span>
          )}
        </div>
        
        {/* Resolve Status */}
        <div
          data-testid="splash-resolve-status"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.5rem 0.75rem',
            background: 'rgba(255, 255, 255, 0.03)',
            borderRadius: '4px',
            fontSize: '0.75rem',
            fontFamily: 'var(--font-sans)',
          }}
        >
          <span style={{ color: 'var(--text-secondary)' }}>DaVinci Resolve</span>
          {resolveAvailable === undefined ? (
            <span style={{ color: 'var(--text-muted)' }}>Checking...</span>
          ) : resolveAvailable ? (
            <span style={{ color: 'var(--status-success-fg)' }}>Available</span>
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>Not Connected</span>
          )}
        </div>
      </div>
      
      {/* Tier Message */}
      {tier === 'Basic' && (
        <div
          data-testid="splash-tier-message"
          style={{
            padding: '0.5rem 1rem',
            background: 'rgba(255, 193, 7, 0.1)',
            border: '1px solid rgba(255, 193, 7, 0.2)',
            borderRadius: '4px',
            fontSize: '0.6875rem',
            fontFamily: 'var(--font-sans)',
            color: 'var(--status-warning-fg)',
            textAlign: 'center',
            maxWidth: '280px',
          }}
        >
          Basic: Camera RAW formats not supported
        </div>
      )}
      
      {/* Continue button when engines are missing */}
      {showContinueButton && minTimeElapsed && (
        <Button
          data-testid="splash-continue-btn"
          variant="secondary"
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            onDismiss()
          }}
          style={{ marginTop: '1.5rem' }}
        >
          Continue →
        </Button>
      )}
      
      {/* Loading indicator OR click hint */}
      {!isReady && !timeoutElapsed ? (
        <div
          style={{
            marginTop: '1.5rem',
            fontSize: '0.6875rem',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-sans)',
          }}
        >
          Initializing...
        </div>
      ) : timeoutElapsed && !isReady ? (
        <div
          style={{
            marginTop: '1.5rem',
            fontSize: '0.6875rem',
            color: 'var(--status-warning-fg)',
            fontFamily: 'var(--font-sans)',
          }}
        >
          Backend not connected — click Continue to proceed
        </div>
      ) : canDismissEarly && !showContinueButton ? (
        <div
          style={{
            marginTop: '1.5rem',
            fontSize: '0.6875rem',
            color: 'var(--text-dim)',
            fontFamily: 'var(--font-sans)',
          }}
        >
          Click anywhere to continue
        </div>
      ) : null}
    </div>
  )
}
