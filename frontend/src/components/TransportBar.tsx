/**
 * TransportBar — Professional Transport Controls Component
 * 
 * ============================================================================
 * DESIGN PHILOSOPHY
 * ============================================================================
 * This component provides editor-grade transport controls for preview playback.
 * 
 * Key Principles:
 * 1. Clear, professional transport controls (Play/Pause, Frame Step, Jump, Scrub)
 * 2. Unmistakable visual state (playing/paused, muted/unmuted)
 * 3. Frame stepping is best-effort (HTML5 video is NOT frame-accurate)
 * 4. Honest tooltips about limitations
 * 5. No fake precision
 * 
 * Controls (left to right):
 * - Play/Pause
 * - Step Back (1 frame)
 * - Step Forward (1 frame)
 * - Jump Back (1 second)
 * - Jump Forward (1 second)
 * - Timeline Scrubber
 * - Mute Toggle
 * 
 * Keyboard shortcuts:
 * - Space: Play/Pause
 * - ←/→: Frame step
 * - Shift+←/→: ±1 second
 * - M: Mute toggle
 * 
 * See: docs/MONITOR_SURFACE.md
 * ============================================================================
 */

import React, { useCallback, useEffect } from 'react'
import { usePlaybackClock } from '../hooks/usePlaybackClock'

// ============================================================================
// TYPES
// ============================================================================

interface TransportBarProps {
  /** Video element ref */
  videoRef: React.RefObject<HTMLVideoElement | null>
  /** Source frame rate */
  fps: number
  /** Total duration in seconds */
  duration: number
  /** Whether controls should be enabled */
  enabled?: boolean
}

// ============================================================================
// ICON COMPONENTS
// ============================================================================

const PlayIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M4 2.5v11l9-5.5L4 2.5z" />
  </svg>
)

const PauseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <rect x="3" y="2" width="4" height="12" rx="1" />
    <rect x="9" y="2" width="4" height="12" rx="1" />
  </svg>
)

const StepBackIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <rect x="2" y="3" width="2" height="10" rx="0.5" />
    <path d="M13 3v10L5 8l8-5z" />
  </svg>
)

const StepForwardIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <rect x="12" y="3" width="2" height="10" rx="0.5" />
    <path d="M3 3v10l8-5L3 3z" />
  </svg>
)

const JumpBackIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 3v10L2 8l6-5z" />
    <path d="M14 3v10L8 8l6-5z" />
  </svg>
)

const JumpForwardIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M2 3v10l6-5L2 3z" />
    <path d="M8 3v10l6-5L8 3z" />
  </svg>
)

const SpeakerIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
    <path d="M3 6.5v5h3l4 4v-13l-4 4H3z" />
    <path d="M12.5 9c0-1.5-.7-2.8-1.8-3.5v7c1.1-.7 1.8-2 1.8-3.5z" opacity="0.7" />
    <path d="M11.7 3.3c1.7 1 2.8 2.9 2.8 5.2s-1.1 4.2-2.8 5.2v-1.5c1-.7 1.7-1.9 1.7-3.2s-.7-2.6-1.7-3.2V3.3z" opacity="0.5" />
  </svg>
)

const MutedIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
    <path d="M3 6.5v5h3l4 4v-13l-4 4H3z" />
    <path d="M12 6.5l4 5M16 6.5l-4 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
  </svg>
)

// ============================================================================
// STYLES
// ============================================================================

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem 0.75rem',
    background: 'rgba(0, 0, 0, 0.85)',
    borderTop: '1px solid rgba(255, 255, 255, 0.1)',
    backdropFilter: 'blur(8px)',
    minHeight: '48px',
  } as React.CSSProperties,
  
  controlGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
  } as React.CSSProperties,
  
  button: {
    width: '32px',
    height: '32px',
    borderRadius: '4px',
    border: 'none',
    background: 'rgba(255, 255, 255, 0.08)',
    color: 'var(--text-primary, #e5e7eb)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.15s, color 0.15s',
  } as React.CSSProperties,
  
  buttonHover: {
    background: 'rgba(255, 255, 255, 0.15)',
  } as React.CSSProperties,
  
  playButton: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    background: 'var(--accent-primary, #3b82f6)',
  } as React.CSSProperties,
  
  timecodeContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0 0.75rem',
    minWidth: '200px',
  } as React.CSSProperties,
  
  timecode: {
    fontFamily: 'var(--font-mono, "SF Mono", "Monaco", monospace)',
    fontSize: '0.8125rem',
    color: 'var(--text-primary, #e5e7eb)',
    letterSpacing: '0.02em',
    fontVariantNumeric: 'tabular-nums',
  } as React.CSSProperties,
  
  timecodeSeparator: {
    color: 'var(--text-dim, #6b7280)',
    margin: '0 0.25rem',
  } as React.CSSProperties,
  
  timecodeDuration: {
    color: 'var(--text-muted, #9ca3af)',
  } as React.CSSProperties,
  
  scrubberContainer: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    padding: '0 0.5rem',
    minWidth: '100px',
  } as React.CSSProperties,
  
  scrubber: {
    width: '100%',
    height: '6px',
    appearance: 'none',
    background: 'rgba(255, 255, 255, 0.15)',
    borderRadius: '3px',
    cursor: 'pointer',
    outline: 'none',
  } as React.CSSProperties,
  
  muteButton: {
    width: '36px',
    height: '36px',
  } as React.CSSProperties,
  
  mutedState: {
    background: 'rgba(239, 68, 68, 0.2)',
    color: '#ef4444',
  } as React.CSSProperties,
  
  proxyLabel: {
    fontSize: '0.625rem',
    fontFamily: 'var(--font-sans, system-ui)',
    color: 'var(--text-dim, #6b7280)',
    letterSpacing: '0.03em',
    padding: '0.25rem 0.5rem',
    background: 'rgba(100, 116, 139, 0.2)',
    borderRadius: '3px',
    marginLeft: 'auto',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,
}

// ============================================================================
// COMPONENT
// ============================================================================

export function TransportBar({
  videoRef,
  fps,
  duration,
  enabled = true,
}: TransportBarProps) {
  // Use the playback clock for smooth timecode updates
  const clock = usePlaybackClock({
    videoRef,
    fps,
    enabled,
  })
  
  // Track mute state locally (not in clock)
  const [isMuted, setIsMuted] = React.useState(false)
  
  // Sync mute state with video element
  useEffect(() => {
    const video = videoRef.current
    if (video) {
      setIsMuted(video.muted)
    }
  }, [videoRef])
  
  // Format duration timecode
  const durationTimecode = React.useMemo(() => {
    if (!isFinite(duration) || duration <= 0) return '00:00:00:00'
    const totalFrames = Math.floor(duration * fps)
    const h = Math.floor(totalFrames / (fps * 3600))
    const m = Math.floor((totalFrames % (fps * 3600)) / (fps * 60))
    const s = Math.floor((totalFrames % (fps * 60)) / fps)
    const f = Math.floor(totalFrames % fps)
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`
  }, [duration, fps])
  
  // Control handlers
  const handlePlayPause = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    
    if (clock.isPlaying) {
      video.pause()
    } else {
      video.play().catch(() => {
        // Ignore autoplay restrictions
      })
    }
  }, [videoRef, clock.isPlaying])
  
  const handleStepBack = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    
    const frameTime = 1 / fps
    video.currentTime = Math.max(0, video.currentTime - frameTime)
  }, [videoRef, fps])
  
  const handleStepForward = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    
    const frameTime = 1 / fps
    video.currentTime = Math.min(duration, video.currentTime + frameTime)
  }, [videoRef, fps, duration])
  
  const handleJumpBack = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    
    video.currentTime = Math.max(0, video.currentTime - 1.0)
  }, [videoRef])
  
  const handleJumpForward = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    
    video.currentTime = Math.min(duration, video.currentTime + 1.0)
  }, [videoRef, duration])
  
  const handleScrub = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current
    if (!video) return
    
    video.currentTime = parseFloat(e.target.value)
  }, [videoRef])
  
  const handleMuteToggle = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    
    video.muted = !video.muted
    setIsMuted(video.muted)
  }, [videoRef])
  
  // Keyboard shortcuts
  useEffect(() => {
    if (!enabled) return
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if focus is in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return
      }
      
      switch (e.code) {
        case 'Space':
          e.preventDefault()
          handlePlayPause()
          break
        case 'ArrowLeft':
          e.preventDefault()
          if (e.shiftKey) {
            handleJumpBack()
          } else {
            handleStepBack()
          }
          break
        case 'ArrowRight':
          e.preventDefault()
          if (e.shiftKey) {
            handleJumpForward()
          } else {
            handleStepForward()
          }
          break
        case 'KeyM':
          e.preventDefault()
          handleMuteToggle()
          break
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    enabled,
    handlePlayPause,
    handleStepBack,
    handleStepForward,
    handleJumpBack,
    handleJumpForward,
    handleMuteToggle,
  ])
  
  if (!enabled) return null
  
  return (
    <div style={styles.container} data-testid="transport-bar">
      {/* Play/Pause */}
      <button
        onClick={handlePlayPause}
        style={{ ...styles.button, ...styles.playButton }}
        title={clock.isPlaying ? 'Pause (Space)' : 'Play (Space)'}
        data-testid="transport-play-pause"
      >
        {clock.isPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>
      
      {/* Frame Step Controls */}
      <div style={styles.controlGroup}>
        <button
          onClick={handleStepBack}
          style={styles.button}
          title="Step back 1 frame (←)&#10;Frame stepping is approximate in preview mode"
          data-testid="transport-step-back"
        >
          <StepBackIcon />
        </button>
        <button
          onClick={handleStepForward}
          style={styles.button}
          title="Step forward 1 frame (→)&#10;Frame stepping is approximate in preview mode"
          data-testid="transport-step-forward"
        >
          <StepForwardIcon />
        </button>
      </div>
      
      {/* Jump Controls */}
      <div style={styles.controlGroup}>
        <button
          onClick={handleJumpBack}
          style={styles.button}
          title="Jump back 1 second (Shift+←)"
          data-testid="transport-jump-back"
        >
          <JumpBackIcon />
        </button>
        <button
          onClick={handleJumpForward}
          style={styles.button}
          title="Jump forward 1 second (Shift+→)"
          data-testid="transport-jump-forward"
        >
          <JumpForwardIcon />
        </button>
      </div>
      
      {/* Timecode Display */}
      <div style={styles.timecodeContainer}>
        <span style={styles.timecode} data-testid="transport-timecode">
          {clock.timecode}
        </span>
        <span style={styles.timecodeSeparator}>/</span>
        <span style={{ ...styles.timecode, ...styles.timecodeDuration }}>
          {durationTimecode}
        </span>
      </div>
      
      {/* Timeline Scrubber */}
      <div style={styles.scrubberContainer}>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step="any"
          value={clock.currentTimeSeconds}
          onChange={handleScrub}
          style={styles.scrubber}
          title="Scrub timeline"
          data-testid="transport-scrubber"
        />
      </div>
      
      {/* Mute Toggle */}
      <button
        onClick={handleMuteToggle}
        style={{
          ...styles.button,
          ...styles.muteButton,
          ...(isMuted ? styles.mutedState : {}),
        }}
        title={isMuted ? 'Unmute (M) — Audio is muted' : 'Mute (M)'}
        data-testid="transport-mute"
      >
        {isMuted ? <MutedIcon /> : <SpeakerIcon />}
      </button>
      
      {/* Proxy Label */}
      <span style={styles.proxyLabel}>
        Preview proxy — not source media
      </span>
      
      {/* Custom scrubber styles */}
      <style>{`
        input[type="range"][data-testid="transport-scrubber"] {
          -webkit-appearance: none;
          appearance: none;
          background: rgba(255, 255, 255, 0.15);
          border-radius: 3px;
          height: 6px;
        }
        input[type="range"][data-testid="transport-scrubber"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #fff;
          cursor: pointer;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
        }
        input[type="range"][data-testid="transport-scrubber"]::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #fff;
          cursor: pointer;
          border: none;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
        }
        input[type="range"][data-testid="transport-scrubber"]:focus {
          outline: none;
        }
        input[type="range"][data-testid="transport-scrubber"]::-webkit-slider-runnable-track {
          background: linear-gradient(
            to right,
            var(--accent-primary, #3b82f6) 0%,
            var(--accent-primary, #3b82f6) var(--progress, 0%),
            rgba(255, 255, 255, 0.15) var(--progress, 0%),
            rgba(255, 255, 255, 0.15) 100%
          );
          border-radius: 3px;
          height: 6px;
        }
      `}</style>
    </div>
  )
}

export default TransportBar
