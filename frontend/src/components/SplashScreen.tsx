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
  
  // Minimum visibility timer (3s) - splash never dismisses before this
  useEffect(() => {
    const timer = setTimeout(() => {
      setMinTimeElapsed(true)
    }, 3000)
    
    return () => clearTimeout(timer)
  }, [])
  
  // Fallback timeout (3s) - hard cap splash duration
  useEffect(() => {
    const timer = setTimeout(() => {
      setTimeoutElapsed(true)
    }, 3000)
    
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
      {/* Brand Area — Product launch moment, confident presence */}
      <div
        style={{
          marginBottom: '2.5rem',
          textAlign: 'center',
        }}
      >
        {/* FORGE wordmark — large, centered, commanding */}
        <div
          data-testid="forge-wordmark"
          data-branding-type="wordmark-text"
          style={{
            fontSize: '2.5rem',
            fontWeight: 700,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: 'var(--text-primary)',
            marginBottom: '0.75rem',
          }}
        >
          Forge
        </div>
        <div
          style={{
            fontSize: '0.6875rem',
            fontFamily: 'var(--font-mono)',
            fontWeight: 500,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            opacity: 0.7,
          }}
        >
          Alpha
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
