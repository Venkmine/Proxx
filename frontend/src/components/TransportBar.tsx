/**
 * TransportBar — Professional Transport Controls Component
 * 
 * ============================================================================
 * DESIGN PHILOSOPHY
 * ============================================================================
 * This component provides editor-grade transport controls for preview playback.
 * Modeled after Resolve/RV-class NLE transport interfaces.
 * 
 * Key Principles:
 * 1. Clear, professional transport controls (Play/Pause, Frame Step, Jump, Scrub)
 * 2. Unmistakable visual state (playing/paused, muted/unmuted)
 * 3. Frame stepping is best-effort (HTML5 video is NOT frame-accurate)
 * 4. Honest tooltips about limitations
 * 5. No fake precision
 * 6. Timeline scrubber positioned above audio controls (NLE-style)
 * 7. Timecode mode selector with clear limitations
 * 
 * Transport Control Layout (v3):
 * [ |<< ] [ ⏮ ] [ < ] [ ⏯ ] [ > ] [ ⏭ ] [ >>| ] [ Jump: 5s ▼ ]
 * 
 * Button Semantics (Non-Negotiable):
 * - |<<  : Load PREVIOUS CLIP in current job
 * - >>|  : Load NEXT CLIP in current job
 * - <    : Jump BACKWARD by selected interval
 * - >    : Jump FORWARD by selected interval
 * - ⏯    : Play / Pause
 * - ⏮ ⏭  : ±1 frame
 * 
 * Timecode Modes:
 * - SRC TC: Source timecode from metadata (if available)
 * - PREVIEW TC: Derived from preview proxy playback
 * - COUNTER: Simple elapsed counter from 00:00:00:00
 * 
 * Keyboard shortcuts:
 * - Space: Play/Pause
 * - ←/→: Frame step (±1 frame)
 * - Shift+←/→: Jump using selected interval
 * - Cmd/Ctrl+←/→: Previous/Next clip
 * - J: Reverse playback (2× optional)
 * - K: Pause
 * - L: Forward playback (2× optional)
 * - M: Mute toggle
 * 
 * See: docs/MONITOR_SURFACE.md
 * ============================================================================
 */

import React, { useCallback, useEffect, useState, useMemo } from 'react'
import { usePlaybackClock } from '../hooks/usePlaybackClock'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Timecode display mode
 */
export type TimecodeMode = 'source' | 'preview' | 'counter'

/**
 * Jump interval for < and > buttons.
 * Can be frame-based or time-based.
 */
export type JumpInterval =
  | { type: 'frames'; value: number }
  | { type: 'seconds'; value: number }

/**
 * Clip info for navigation
 */
export interface ClipInfo {
  id: string
  sourcePath: string
  index: number
}

interface TransportBarProps {
  /** Video element ref */
  videoRef: React.RefObject<HTMLVideoElement | null>
  /** Source frame rate */
  fps: number
  /** Total duration in seconds */
  duration: number
  /** Whether controls should be enabled */
  enabled?: boolean
  /** Source timecode start (from metadata, format: HH:MM:SS:FF or seconds) */
  sourceTimecodeStart?: string | number | null
  /** Whether source timecode is available from metadata */
  hasSourceTimecode?: boolean
  
  // Clip Navigation (v3)
  /** Current clip info */
  currentClip?: ClipInfo | null
  /** Total clips in current job */
  totalClips?: number
  /** Navigate to previous clip in job */
  onPreviousClip?: () => void
  /** Navigate to next clip in job */
  onNextClip?: () => void
  /** Whether at first clip (disables previous button) */
  isFirstClip?: boolean
  /** Whether at last clip (disables next button) */
  isLastClip?: boolean
  
  /** Status label when playback is disabled (shows why controls are disabled) */
  playbackDisabledLabel?: string | null
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

const ChevronDownIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
    <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
)

const PrevClipIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <rect x="2" y="3" width="2" height="10" rx="0.5" />
    <path d="M12 3v10L6 8l6-5z" />
  </svg>
)

const NextClipIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <rect x="12" y="3" width="2" height="10" rx="0.5" />
    <path d="M4 3v10l6-5-6-5z" />
  </svg>
)

// ============================================================================
// STYLES
// ============================================================================

const styles = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(0, 0, 0, 0.85)',
    backdropFilter: 'blur(8px)',
    borderTop: '1px solid rgba(255, 255, 255, 0.1)',
  } as React.CSSProperties,
  
  // Timeline scrubber row (above controls)
  scrubberRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '0.375rem 0.75rem 0.25rem',  // Reduced top padding
    gap: '0.5rem',
  } as React.CSSProperties,
  
  // Main controls row
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.25rem 0.75rem 0.375rem',  // Reduced bottom padding
    minHeight: '40px',  // Reduced from 44px to reclaim space
  } as React.CSSProperties,
  
  controlGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    background: 'rgba(255, 255, 255, 0.04)',
    borderRadius: '6px',
    padding: '2px',
  } as React.CSSProperties,
  
  button: {
    minWidth: '40px',
    height: '40px',
    borderRadius: '4px',
    border: 'none',
    background: 'transparent',
    color: 'var(--text-primary, #e5e7eb)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.15s, color 0.15s',
    fontFamily: 'var(--font-sans, system-ui)',
    fontSize: '0.6875rem',
    fontWeight: 500,
    letterSpacing: '0.02em',
    padding: '0 0.5rem',
  } as React.CSSProperties,
  
  buttonHover: {
    background: 'rgba(255, 255, 255, 0.1)',
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
    gap: '0.375rem',
    padding: '0 0.5rem',
  } as React.CSSProperties,
  
  timecode: {
    fontFamily: 'var(--font-mono, "SF Mono", "Monaco", monospace)',
    fontSize: '0.8125rem',
    color: 'var(--text-primary, #e5e7eb)',
    letterSpacing: '0.02em',
    fontVariantNumeric: 'tabular-nums',
    cursor: 'pointer',
    padding: '0.25rem 0.375rem',
    borderRadius: '3px',
    transition: 'background 0.15s',
  } as React.CSSProperties,
  
  timecodeHover: {
    background: 'rgba(255, 255, 255, 0.08)',
  } as React.CSSProperties,
  
  timecodeSeparator: {
    color: 'var(--text-dim, #6b7280)',
    margin: '0 0.125rem',
  } as React.CSSProperties,
  
  timecodeDuration: {
    color: 'var(--text-muted, #9ca3af)',
    cursor: 'default',
  } as React.CSSProperties,
  
  timecodeModeSelector: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
    padding: '0.25rem 0.5rem',
    background: 'rgba(255, 255, 255, 0.06)',
    borderRadius: '4px',
    cursor: 'pointer',
    border: 'none',
    fontSize: '0.625rem',
    fontFamily: 'var(--font-mono, "SF Mono", monospace)',
    color: 'var(--text-muted, #9ca3af)',
    letterSpacing: '0.03em',
    textTransform: 'uppercase',
    transition: 'background 0.15s',
  } as React.CSSProperties,
  
  timecodeModeDropdown: {
    position: 'absolute',
    bottom: '100%',
    left: '50%',
    transform: 'translateX(-50%)',
    marginBottom: '4px',
    background: 'rgba(20, 20, 22, 0.98)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: '6px',
    padding: '0.25rem',
    minWidth: '120px',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
    zIndex: 100,
  } as React.CSSProperties,
  
  timecodeModeOption: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.125rem',
    padding: '0.5rem 0.625rem',
    borderRadius: '4px',
    cursor: 'pointer',
    border: 'none',
    background: 'transparent',
    width: '100%',
    textAlign: 'left',
    transition: 'background 0.15s',
  } as React.CSSProperties,
  
  timecodeModeOptionActive: {
    background: 'rgba(59, 130, 246, 0.15)',
  } as React.CSSProperties,
  
  timecodeModeOptionDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  } as React.CSSProperties,
  
  scrubberContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    minWidth: '100px',
  } as React.CSSProperties,
  
  scrubberTrack: {
    position: 'relative',
    width: '100%',
    height: '12px',
    background: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '2px',
    cursor: 'pointer',
  } as React.CSSProperties,
  
  scrubber: {
    width: '100%',
    height: '12px',
    appearance: 'none',
    background: 'transparent',
    cursor: 'pointer',
    outline: 'none',
    position: 'relative',
    zIndex: 2,
  } as React.CSSProperties,
  
  tickMarks: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingBottom: '1px',
    pointerEvents: 'none',
  } as React.CSSProperties,
  
  muteButton: {
    width: '36px',
    height: '36px',
    padding: 0,
  } as React.CSSProperties,
  
  mutedState: {
    background: 'rgba(239, 68, 68, 0.2)',
    color: '#ef4444',
  } as React.CSSProperties,
  
  proxyLabel: {
    fontSize: '0.5625rem',
    fontFamily: 'var(--font-sans, system-ui)',
    color: 'var(--text-dim, #6b7280)',
    letterSpacing: '0.03em',
    padding: '0.25rem 0.5rem',
    background: 'rgba(100, 116, 139, 0.15)',
    borderRadius: '3px',
    marginLeft: 'auto',
    whiteSpace: 'nowrap',
    textTransform: 'uppercase',
  } as React.CSSProperties,
  
  jumpIntervalSelector: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
    padding: '0.25rem 0.5rem',
    background: 'rgba(255, 255, 255, 0.06)',
    borderRadius: '4px',
    cursor: 'pointer',
    border: 'none',
    fontSize: '0.6875rem',
    fontFamily: 'var(--font-sans, system-ui)',
    color: 'var(--text-secondary, #9ca3af)',
    letterSpacing: '0.02em',
    transition: 'background 0.15s',
    minWidth: '80px',
    justifyContent: 'space-between',
  } as React.CSSProperties,
  
  jumpIntervalDropdown: {
    position: 'absolute',
    bottom: '100%',
    left: '0',
    marginBottom: '4px',
    background: 'rgba(20, 20, 22, 0.98)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: '6px',
    padding: '0.25rem',
    minWidth: '130px',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
    zIndex: 100,
  } as React.CSSProperties,
  
  jumpIntervalOption: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.5rem 0.625rem',
    borderRadius: '4px',
    cursor: 'pointer',
    border: 'none',
    background: 'transparent',
    width: '100%',
    textAlign: 'left',
    fontSize: '0.75rem',
    fontFamily: 'var(--font-sans, system-ui)',
    color: 'var(--text-primary, #e5e7eb)',
    transition: 'background 0.15s',
  } as React.CSSProperties,
  
  jumpIntervalOptionActive: {
    background: 'rgba(59, 130, 246, 0.15)',
    color: 'var(--accent-primary, #3b82f6)',
  } as React.CSSProperties,
  
  clipNavButton: {
    minWidth: '36px',
    height: '32px',
    borderRadius: '4px',
    border: 'none',
    background: 'transparent',
    color: 'var(--text-primary, #e5e7eb)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.15s, color 0.15s, opacity 0.15s',
    padding: '0 0.5rem',
  } as React.CSSProperties,
  
  clipNavButtonDisabled: {
    opacity: 0.35,
    cursor: 'not-allowed',
  } as React.CSSProperties,
  
  clipIndicator: {
    fontSize: '0.625rem',
    fontFamily: 'var(--font-mono, "SF Mono", monospace)',
    color: 'var(--text-muted, #9ca3af)',
    padding: '0 0.5rem',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,
  
  copiedToast: {
    position: 'fixed',
    bottom: '80px',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '0.5rem 1rem',
    background: 'rgba(16, 185, 129, 0.9)',
    color: '#fff',
    borderRadius: '4px',
    fontSize: '0.75rem',
    fontFamily: 'var(--font-sans, system-ui)',
    fontWeight: 500,
    zIndex: 1000,
    pointerEvents: 'none',
  } as React.CSSProperties,
}

// ============================================================================
// TIMECODE MODE CONFIG
// ============================================================================

const TIMECODE_MODES: { 
  id: TimecodeMode
  label: string
  shortLabel: string
  tooltip: string 
}[] = [
  { 
    id: 'source', 
    label: 'Source TC', 
    shortLabel: 'SRC',
    tooltip: 'Source timecode from media metadata.\nMay not align with proxy playback position.'
  },
  { 
    id: 'preview', 
    label: 'Preview TC', 
    shortLabel: 'PREV',
    tooltip: 'Timecode derived from preview proxy playback.\nRepresents approximate position in media.'
  },
  { 
    id: 'counter', 
    label: 'Counter', 
    shortLabel: 'CTR',
    tooltip: 'Simple counter from 00:00:00:00.\nCounts elapsed playback time.'
  },
]

// V1 Hardening: localStorage key for timecode mode persistence (persists across sessions)
const TC_MODE_STORAGE_KEY = 'proxx.timecodeMode'

// V1 Hardening: localStorage key for jump interval persistence (persists across sessions)
const JUMP_INTERVAL_STORAGE_KEY = 'proxx.jumpInterval'

// ============================================================================
// JUMP INTERVAL CONFIGURATION
// ============================================================================

const JUMP_INTERVALS: {
  id: string
  label: string
  interval: JumpInterval
}[] = [
  { id: 'frame-1', label: '1 frame', interval: { type: 'frames', value: 1 } },
  { id: 'frame-5', label: '5 frames', interval: { type: 'frames', value: 5 } },
  { id: 'frame-10', label: '10 frames', interval: { type: 'frames', value: 10 } },
  { id: 'sec-1', label: '1 second', interval: { type: 'seconds', value: 1 } },
  { id: 'sec-5', label: '5 seconds', interval: { type: 'seconds', value: 5 } },
  { id: 'sec-10', label: '10 seconds', interval: { type: 'seconds', value: 10 } },
  { id: 'sec-30', label: '30 seconds', interval: { type: 'seconds', value: 30 } },
  { id: 'sec-60', label: '60 seconds', interval: { type: 'seconds', value: 60 } },
  { id: 'min-5', label: '5 minutes', interval: { type: 'seconds', value: 300 } },
]

// Default jump interval: 5 seconds
const DEFAULT_JUMP_INTERVAL = JUMP_INTERVALS.find(j => j.id === 'sec-5')!

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate tick mark positions for timeline (1 second intervals)
 */
function generateTickMarks(duration: number): number[] {
  if (!isFinite(duration) || duration <= 0) return []
  const ticks: number[] = []
  const interval = 1 // 1 second
  for (let t = interval; t < duration; t += interval) {
    ticks.push(t / duration)
  }
  return ticks
}

/**
 * Parse source timecode string to seconds
 */
function parseSourceTimecode(tc: string | number | null | undefined, fps: number): number {
  if (tc === null || tc === undefined) return 0
  if (typeof tc === 'number') return tc
  
  // Parse HH:MM:SS:FF or HH:MM:SS;FF (drop-frame)
  const match = tc.match(/^(\d{2}):(\d{2}):(\d{2})[:;](\d{2})$/)
  if (!match) return 0
  
  const [, h, m, s, f] = match.map(Number)
  return h * 3600 + m * 60 + s + f / fps
}

// ============================================================================
// COMPONENT
// ============================================================================

export function TransportBar({
  videoRef,
  fps,
  duration,
  enabled = true,
  sourceTimecodeStart,
  hasSourceTimecode = false,
  // Clip navigation (v3)
  currentClip,
  totalClips,
  onPreviousClip,
  onNextClip,
  isFirstClip = true,
  isLastClip = true,
  // Playback status (v3 hardening)
  playbackDisabledLabel,
}: TransportBarProps) {
  // Use the playback clock for smooth timecode updates
  const clock = usePlaybackClock({
    videoRef,
    fps,
    enabled,
  })
  
  // Track mute state locally (not in clock)
  const [isMuted, setIsMuted] = useState(false)
  
  // Volume level (0-100), persisted to localStorage
  const [volume, setVolume] = useState<number>(() => {
    try {
      const stored = localStorage.getItem('proxx.volume')
      if (stored) {
        const val = parseInt(stored, 10)
        if (!isNaN(val) && val >= 0 && val <= 100) return val
      }
    } catch {
      // localStorage not available
    }
    return 100
  })
  
  // Previous volume (before mute) for restore
  const [previousVolume, setPreviousVolume] = useState<number>(100)
  
  // Timecode mode state - persist to localStorage (V1 Hardening)
  const [timecodeMode, setTimecodeMode] = useState<TimecodeMode>(() => {
    try {
      const stored = localStorage.getItem(TC_MODE_STORAGE_KEY)
      if (stored && ['source', 'preview', 'counter'].includes(stored)) {
        // If stored mode is 'source' but source TC not available, default to 'preview'
        if (stored === 'source' && !hasSourceTimecode) {
          return 'preview'
        }
        return stored as TimecodeMode
      }
    } catch {
      // localStorage not available
    }
    return 'preview'
  })
  
  // Timecode mode dropdown state
  const [showTimecodeDropdown, setShowTimecodeDropdown] = useState(false)
  
  // Jump interval state - persist to localStorage (V1 Hardening: persist across sessions)
  const [jumpInterval, setJumpInterval] = useState<typeof JUMP_INTERVALS[0]>(() => {
    try {
      const stored = localStorage.getItem(JUMP_INTERVAL_STORAGE_KEY)
      if (stored) {
        const found = JUMP_INTERVALS.find(j => j.id === stored)
        if (found) return found
      }
    } catch {
      // localStorage not available
    }
    return DEFAULT_JUMP_INTERVAL
  })
  
  // Jump interval dropdown state
  const [showJumpIntervalDropdown, setShowJumpIntervalDropdown] = useState(false)
  
  // Copy feedback state
  const [showCopiedToast, setShowCopiedToast] = useState(false)
  
  // Playback speed for J/K/L shuttle
  const [playbackRate, setPlaybackRate] = useState(1)
  
  // Track hover state for timecode
  const [timecodeHovered, setTimecodeHovered] = useState(false)
  
  // Parse source timecode offset
  const sourceOffset = useMemo(() => 
    parseSourceTimecode(sourceTimecodeStart, fps),
    [sourceTimecodeStart, fps]
  )
  
  // Persist timecode mode to localStorage (V1 Hardening)
  useEffect(() => {
    try {
      localStorage.setItem(TC_MODE_STORAGE_KEY, timecodeMode)
    } catch {
      // localStorage not available
    }
  }, [timecodeMode])
  
  // Persist jump interval to localStorage (V1 Hardening)
  useEffect(() => {
    try {
      localStorage.setItem(JUMP_INTERVAL_STORAGE_KEY, jumpInterval.id)
    } catch {
      // localStorage not available
    }
  }, [jumpInterval])
  
  // Persist volume to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('proxx.volume', String(volume))
    } catch {
      // localStorage not available
    }
  }, [volume])
  
  // Sync volume with video element
  useEffect(() => {
    const video = videoRef.current
    if (video) {
      video.volume = volume / 100
      video.muted = isMuted || volume === 0
    }
  }, [videoRef, volume, isMuted])
  
  // Sync mute state with video element
  useEffect(() => {
    const video = videoRef.current
    if (video) {
      setIsMuted(video.muted)
    }
  }, [videoRef])
  
  // Format duration timecode
  const durationTimecode = useMemo(() => {
    if (!isFinite(duration) || duration <= 0) return '00:00:00:00'
    const totalFrames = Math.floor(duration * fps)
    const h = Math.floor(totalFrames / (fps * 3600))
    const m = Math.floor((totalFrames % (fps * 3600)) / (fps * 60))
    const s = Math.floor((totalFrames % (fps * 60)) / fps)
    const f = Math.floor(totalFrames % fps)
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`
  }, [duration, fps])
  
  // Generate displayed timecode based on mode
  const displayedTimecode = useMemo(() => {
    switch (timecodeMode) {
      case 'source':
        if (!hasSourceTimecode) return clock.timecode
        // Add source offset to current time
        const sourceTime = clock.currentTimeSeconds + sourceOffset
        const totalFrames = Math.floor(sourceTime * fps)
        const h = Math.floor(totalFrames / (fps * 3600))
        const m = Math.floor((totalFrames % (fps * 3600)) / (fps * 60))
        const s = Math.floor((totalFrames % (fps * 60)) / fps)
        const f = Math.floor(totalFrames % fps)
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`
      case 'counter':
        // Just use current playback time from 0
        return clock.timecode
      case 'preview':
      default:
        return clock.timecode
    }
  }, [timecodeMode, clock.timecode, clock.currentTimeSeconds, sourceOffset, fps, hasSourceTimecode])
  
  // Generate tick marks
  const tickMarks = useMemo(() => generateTickMarks(duration), [duration])
  
  // Control handlers
  const handlePlayPause = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    
    if (clock.isPlaying) {
      video.pause()
    } else {
      video.playbackRate = 1
      setPlaybackRate(1)
      video.play().catch(() => {
        // Ignore autoplay restrictions
      })
    }
  }, [videoRef, clock.isPlaying])
  
  const handleStepBack = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    
    video.pause()
    const frameTime = 1 / fps
    video.currentTime = Math.max(0, video.currentTime - frameTime)
  }, [videoRef, fps])
  
  const handleStepForward = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    
    video.pause()
    const frameTime = 1 / fps
    video.currentTime = Math.min(duration, video.currentTime + frameTime)
  }, [videoRef, fps, duration])
  
  const handleJumpBack = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    
    const jumpAmount = jumpInterval.interval.type === 'frames'
      ? jumpInterval.interval.value / fps
      : jumpInterval.interval.value
    
    video.currentTime = Math.max(0, video.currentTime - jumpAmount)
  }, [videoRef, jumpInterval, fps])
  
  const handleJumpForward = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    
    const jumpAmount = jumpInterval.interval.type === 'frames'
      ? jumpInterval.interval.value / fps
      : jumpInterval.interval.value
    
    video.currentTime = Math.min(duration, video.currentTime + jumpAmount)
  }, [videoRef, jumpInterval, fps, duration])
  
  const handleScrub = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current
    if (!video) return
    
    video.currentTime = parseFloat(e.target.value)
  }, [videoRef])
  
  const handleMuteToggle = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    
    if (isMuted || volume === 0) {
      // Unmute: restore previous volume (or 100 if was 0)
      const restoreVolume = previousVolume > 0 ? previousVolume : 100
      setVolume(restoreVolume)
      setIsMuted(false)
      video.volume = restoreVolume / 100
      video.muted = false
    } else {
      // Mute: save current volume and set to 0
      setPreviousVolume(volume)
      setIsMuted(true)
      video.muted = true
    }
  }, [videoRef, isMuted, volume, previousVolume])
  
  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current
    const newVolume = parseInt(e.target.value, 10)
    
    setVolume(newVolume)
    
    if (video) {
      video.volume = newVolume / 100
      // Auto-unmute when adjusting volume from 0
      if (newVolume > 0 && (isMuted || video.muted)) {
        setIsMuted(false)
        video.muted = false
      }
    }
  }, [videoRef, isMuted])
  
  // J/K/L shuttle controls
  const handleShuttleReverse = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    
    // HTML5 video doesn't support negative playback rate in all browsers
    // Simulate by pausing and stepping back
    video.pause()
    handleJumpBack()
  }, [videoRef, handleJumpBack])
  
  const handleShuttlePause = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    
    video.pause()
    setPlaybackRate(1)
  }, [videoRef])
  
  const handleShuttleForward = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    
    if (!clock.isPlaying) {
      video.playbackRate = 1
      setPlaybackRate(1)
      video.play().catch(() => {})
    } else if (playbackRate < 2) {
      video.playbackRate = 2
      setPlaybackRate(2)
    }
  }, [videoRef, clock.isPlaying, playbackRate])
  
  // Copy timecode to clipboard
  const handleCopyTimecode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(displayedTimecode)
      setShowCopiedToast(true)
      setTimeout(() => setShowCopiedToast(false), 1500)
    } catch {
      // Clipboard API not available
    }
  }, [displayedTimecode])
  
  // Handle timecode mode change
  const handleTimecodeModeChange = useCallback((mode: TimecodeMode) => {
    if (mode === 'source' && !hasSourceTimecode) return
    setTimecodeMode(mode)
    setShowTimecodeDropdown(false)
  }, [hasSourceTimecode])
  
  // Handle jump interval change
  const handleJumpIntervalChange = useCallback((interval: typeof JUMP_INTERVALS[0]) => {
    setJumpInterval(interval)
    setShowJumpIntervalDropdown(false)
  }, [])
  
  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showTimecodeDropdown && !showJumpIntervalDropdown) return
    
    const handleClickOutside = () => {
      setShowTimecodeDropdown(false)
      setShowJumpIntervalDropdown(false)
    }
    const timer = setTimeout(() => {
      window.addEventListener('click', handleClickOutside)
    }, 0)
    
    return () => {
      clearTimeout(timer)
      window.removeEventListener('click', handleClickOutside)
    }
  }, [showTimecodeDropdown, showJumpIntervalDropdown])
  
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
          if (e.metaKey || e.ctrlKey) {
            // Cmd/Ctrl + ← = Previous clip
            if (!isFirstClip && onPreviousClip) onPreviousClip()
          } else if (e.shiftKey) {
            // Shift + ← = Jump back using selected interval
            handleJumpBack()
          } else {
            // ← = Step back 1 frame
            handleStepBack()
          }
          break
        case 'ArrowRight':
          e.preventDefault()
          if (e.metaKey || e.ctrlKey) {
            // Cmd/Ctrl + → = Next clip
            if (!isLastClip && onNextClip) onNextClip()
          } else if (e.shiftKey) {
            // Shift + → = Jump forward using selected interval
            handleJumpForward()
          } else {
            // → = Step forward 1 frame
            handleStepForward()
          }
          break
        case 'KeyM':
          e.preventDefault()
          handleMuteToggle()
          break
        case 'KeyJ':
          e.preventDefault()
          handleShuttleReverse()
          break
        case 'KeyK':
          e.preventDefault()
          handleShuttlePause()
          break
        case 'KeyL':
          e.preventDefault()
          handleShuttleForward()
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
    handleShuttleReverse,
    handleShuttlePause,
    handleShuttleForward,
    isFirstClip,
    isLastClip,
    onPreviousClip,
    onNextClip,
  ])
  
  // INC-CTRL-001: Transport controls must never disappear once preview is available
  // Controls are always rendered, but may be disabled
  // REMOVED: if (!enabled) return null
  
  const currentModeConfig = TIMECODE_MODES.find(m => m.id === timecodeMode) || TIMECODE_MODES[1]
  
  // Styles for disabled state
  const disabledButtonStyle = !enabled ? {
    opacity: 0.4,
    cursor: 'not-allowed',
    pointerEvents: 'none' as const,
  } : {}
  
  return (
    <div style={styles.wrapper} data-testid="transport-bar">
      {/* Timeline Scrubber Row — Above controls (NLE-style) */}
      <div style={styles.scrubberRow}>
        <div style={styles.scrubberContainer}>
          {/* Tick marks layer */}
          <div style={styles.tickMarks}>
            {tickMarks.map((pos, i) => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: `${pos * 100}%`,
                  bottom: 0,
                  width: '1px',
                  height: i % 5 === 4 ? '6px' : '3px', // Every 5th tick is taller
                  background: 'rgba(255, 255, 255, 0.2)',
                }}
              />
            ))}
          </div>
          
          {/* Scrubber input */}
          <input
            type="range"
            min={0}
            max={duration || 0}
            step="any"
            value={clock.currentTimeSeconds}
            onChange={enabled ? handleScrub : undefined}
            disabled={!enabled}
            style={{
              ...styles.scrubber,
              ...(enabled ? {} : { opacity: 0.4, cursor: 'not-allowed' }),
            }}
            title={enabled ? "Scrub timeline (drag to seek)" : "Scrubbing unavailable"}
            data-testid="transport-scrubber"
          />
        </div>
      </div>
      
      {/* Main Controls Row */}
      <div style={styles.container}>
        {/* Clip Navigation: [ |<< ] */}
        {(onPreviousClip || onNextClip) && (
          <div style={styles.controlGroup}>
            <button
              onClick={onPreviousClip}
              disabled={isFirstClip}
              style={{
                ...styles.clipNavButton,
                ...(isFirstClip ? styles.clipNavButtonDisabled : {}),
              }}
              title={isFirstClip 
                ? 'At first clip in job' 
                : 'Previous clip (Cmd+←)'}
              data-testid="transport-prev-clip"
            >
              <PrevClipIcon />
            </button>
          </div>
        )}
        
        {/* Frame Step and Jump Controls: [ ⏮ ] [ < ] [ Play ] [ > ] [ ⏭ ] */}
        <div style={styles.controlGroup}>
          <button
            onClick={enabled ? handleStepBack : undefined}
            disabled={!enabled}
            style={{ ...styles.button, ...disabledButtonStyle }}
            title={"±1 frame (←)\nFrame stepping uses preview proxy decode resolution"}
            data-testid="transport-step-back"
          >
            ⏮
          </button>
          <button
            onClick={enabled ? handleJumpBack : undefined}
            disabled={!enabled}
            style={{ ...styles.button, ...disabledButtonStyle }}
            title={`Jump back (${jumpInterval.label}) — Shift+←`}
            data-testid="transport-jump-back"
          >
            &lt;
          </button>
        </div>
        
        {/* Play/Pause */}
        <button
          onClick={enabled ? handlePlayPause : undefined}
          disabled={!enabled}
          style={{ 
            ...styles.button, 
            ...styles.playButton,
            ...disabledButtonStyle,
          }}
          title={!enabled 
            ? (playbackDisabledLabel || 'Playback unavailable')
            : clock.isPlaying ? 'Pause (Space or K)' : 'Play (Space or L)'}
          data-testid="transport-play-pause"
        >
          {clock.isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
        
        <div style={styles.controlGroup}>
          <button
            onClick={enabled ? handleJumpForward : undefined}
            disabled={!enabled}
            style={{ ...styles.button, ...disabledButtonStyle }}
            title={`Jump forward (${jumpInterval.label}) — Shift+→`}
            data-testid="transport-jump-forward"
          >
            &gt;
          </button>
          <button
            onClick={enabled ? handleStepForward : undefined}
            disabled={!enabled}
            style={{ ...styles.button, ...disabledButtonStyle }}
            title={"±1 frame (→)\nFrame stepping uses preview proxy decode resolution"}
            data-testid="transport-step-forward"
          >
            ⏭
          </button>
        </div>
        
        {/* Clip Navigation: [ >>| ] */}
        {(onPreviousClip || onNextClip) && (
          <div style={styles.controlGroup}>
            <button
              onClick={onNextClip}
              disabled={isLastClip}
              style={{
                ...styles.clipNavButton,
                ...(isLastClip ? styles.clipNavButtonDisabled : {}),
              }}
              title={isLastClip 
                ? 'At last clip in job' 
                : 'Next clip (Cmd+→)'}
              data-testid="transport-next-clip"
            >
              <NextClipIcon />
            </button>
          </div>
        )}
        
        {/* Spacer */}
        <div style={{ width: '0.5rem' }} />
        
        {/* Jump Interval Selector */}
        <div style={{ position: 'relative' }}>
          <button
            style={styles.jumpIntervalSelector}
            onClick={(e) => {
              e.stopPropagation()
              setShowJumpIntervalDropdown(!showJumpIntervalDropdown)
            }}
            title="Select jump interval for < and > buttons"
            data-testid="transport-jump-interval-selector"
          >
            <span>Jump:</span>
            <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>
              {jumpInterval.label}
            </span>
            <ChevronDownIcon />
          </button>
          
          {showJumpIntervalDropdown && (
            <div style={styles.jumpIntervalDropdown} onClick={(e) => e.stopPropagation()}>
              {JUMP_INTERVALS.map((interval) => {
                const isActive = interval.id === jumpInterval.id
                return (
                  <button
                    key={interval.id}
                    style={{
                      ...styles.jumpIntervalOption,
                      ...(isActive ? styles.jumpIntervalOptionActive : {}),
                    }}
                    onClick={() => handleJumpIntervalChange(interval)}
                  >
                    <span>{interval.label}</span>
                    {isActive && <span>✓</span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>
        
        {/* Spacer */}
        <div style={{ width: '0.5rem' }} />
        
        {/* Timecode Mode Selector */}
        <div style={{ position: 'relative' }}>
          <button
            style={styles.timecodeModeSelector}
            onClick={(e) => {
              e.stopPropagation()
              setShowTimecodeDropdown(!showTimecodeDropdown)
            }}
            title={currentModeConfig.tooltip}
            data-testid="transport-tc-mode-selector"
          >
            {currentModeConfig.shortLabel}
            <ChevronDownIcon />
          </button>
          
          {showTimecodeDropdown && (
            <div style={styles.timecodeModeDropdown} onClick={(e) => e.stopPropagation()}>
              {TIMECODE_MODES.map((mode) => {
                const isDisabled = mode.id === 'source' && !hasSourceTimecode
                const isActive = mode.id === timecodeMode
                return (
                  <button
                    key={mode.id}
                    style={{
                      ...styles.timecodeModeOption,
                      ...(isActive ? styles.timecodeModeOptionActive : {}),
                      ...(isDisabled ? styles.timecodeModeOptionDisabled : {}),
                    }}
                    onClick={() => handleTimecodeModeChange(mode.id)}
                    disabled={isDisabled}
                    title={isDisabled ? 'Source timecode not available in metadata' : mode.tooltip}
                  >
                    <span style={{
                      fontSize: '0.75rem',
                      fontFamily: 'var(--font-sans)',
                      color: isActive ? 'var(--accent-primary, #3b82f6)' : 'var(--text-primary)',
                      fontWeight: isActive ? 600 : 400,
                    }}>
                      {mode.label}
                    </span>
                    <span style={{
                      fontSize: '0.625rem',
                      fontFamily: 'var(--font-sans)',
                      color: 'var(--text-dim)',
                    }}>
                      {mode.tooltip.split('\n')[0]}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
        
        {/* Timecode Display */}
        <div style={styles.timecodeContainer}>
          <span 
            style={{
              ...styles.timecode,
              ...(timecodeHovered ? styles.timecodeHover : {}),
            }}
            onClick={handleCopyTimecode}
            onMouseEnter={() => setTimecodeHovered(true)}
            onMouseLeave={() => setTimecodeHovered(false)}
            title="Click to copy timecode"
            data-testid="transport-timecode"
          >
            {displayedTimecode}
          </span>
          <span style={styles.timecodeSeparator}>/</span>
          <span style={{ ...styles.timecode, ...styles.timecodeDuration }}>
            {durationTimecode}
          </span>
        </div>
        
        {/* Volume Control — Speaker icon + horizontal slider */}
        <div
          data-testid="transport-volume-control"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
            padding: '0 0.375rem',
          }}
        >
          <button
            onClick={handleMuteToggle}
            style={{
              ...styles.button,
              ...styles.muteButton,
              ...((isMuted || volume === 0) ? styles.mutedState : {}),
            }}
            title={(isMuted || volume === 0) ? 'Unmute (M) — Audio is muted' : 'Mute (M)'}
            data-testid="transport-mute"
          >
            {(isMuted || volume === 0) ? <MutedIcon /> : <SpeakerIcon />}
          </button>
          
          <input
            type="range"
            min={0}
            max={100}
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            data-testid="transport-volume-slider"
            title={`Volume: ${isMuted ? 0 : volume}%`}
            style={{
              width: '60px',
              height: '4px',
              appearance: 'none',
              background: `linear-gradient(to right, var(--text-secondary) 0%, var(--text-secondary) ${isMuted ? 0 : volume}%, rgba(255, 255, 255, 0.15) ${isMuted ? 0 : volume}%, rgba(255, 255, 255, 0.15) 100%)`,
              borderRadius: '2px',
              cursor: 'pointer',
              outline: 'none',
            }}
          />
        </div>
        
        {/* Clip Indicator (X of Y) - only show when in multi-clip job */}
        {currentClip && totalClips && totalClips > 1 && (
          <span 
            style={styles.clipIndicator}
            title={`Clip ${currentClip.index + 1} of ${totalClips}`}
          >
            {currentClip.index + 1} / {totalClips}
          </span>
        )}
        
        {/* Playback Disabled Label - shown when controls are visible but playback unavailable */}
        {playbackDisabledLabel && (
          <span 
            style={{
              ...styles.proxyLabel,
              background: 'rgba(234, 179, 8, 0.15)',
              color: 'var(--text-warning, #eab308)',
              border: '1px solid rgba(234, 179, 8, 0.3)',
            }}
            title={playbackDisabledLabel}
            data-testid="transport-playback-disabled-label"
          >
            {playbackDisabledLabel}
          </span>
        )}
        
        {/* Proxy Label - only show when playback is enabled */}
        {!playbackDisabledLabel && (
          <span style={styles.proxyLabel} title="You are viewing a preview proxy, not source media">
            Preview Proxy
          </span>
        )}
      </div>
      
      {/* Copied Toast */}
      {showCopiedToast && (
        <div style={styles.copiedToast}>
          Timecode copied
        </div>
      )}
      
      {/* Custom scrubber styles for NLE-like timeline appearance */}
      <style>{`
        input[type="range"][data-testid="transport-scrubber"] {
          -webkit-appearance: none;
          appearance: none;
          background: linear-gradient(
            to right,
            var(--accent-primary, #3b82f6) 0%,
            var(--accent-primary, #3b82f6) var(--progress, 0%),
            rgba(255, 255, 255, 0.1) var(--progress, 0%),
            rgba(255, 255, 255, 0.1) 100%
          );
          border-radius: 2px;
          height: 12px;
        }
        input[type="range"][data-testid="transport-scrubber"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 4px;
          height: 20px;
          border-radius: 2px;
          background: #fff;
          cursor: pointer;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
          margin-top: -4px;
        }
        input[type="range"][data-testid="transport-scrubber"]::-moz-range-thumb {
          width: 4px;
          height: 20px;
          border-radius: 2px;
          background: #fff;
          cursor: pointer;
          border: none;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
        }
        input[type="range"][data-testid="transport-scrubber"]:focus {
          outline: none;
        }
        input[type="range"][data-testid="transport-scrubber"]:hover::-webkit-slider-thumb {
          background: #e5e7eb;
        }
        input[type="range"][data-testid="transport-scrubber"]:hover::-moz-range-thumb {
          background: #e5e7eb;
        }
      `}</style>
    </div>
  )
}

export default TransportBar
