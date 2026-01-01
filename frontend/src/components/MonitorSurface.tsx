/**
 * MonitorSurface — Full-Bleed Monitor with Dual-Mode Playback
 * 
 * ============================================================================
 * DESIGN PHILOSOPHY — UX TRUTHFULNESS PASS
 * ============================================================================
 * This component implements a "Monitor" abstraction with TWO distinct modes:
 * 
 * MODE A — IDENTIFICATION MODE (no playback)
 * Used when:
 * - Source is loaded but not playback-compatible
 * - Preflight has NOT completed
 * - Media is unsupported for browser playback
 * 
 * MODE B — PLAYBACK MODE (working HTML5 video)
 * Used ONLY when:
 * - Source is a supported format (H.264, ProRes, DNx in compatible containers)
 * - Local playback is possible via <video> element
 * - Playback is actually functional
 * 
 * Key principles:
 * - Full-bleed: No card borders, padding, or nested panels
 * - Edge-to-edge with centered 16:9 content area
 * - NO fake controls — if playback doesn't work, controls don't appear
 * - Real HTML5 video playback when supported
 * 
 * VISUAL STATES:
 * 1. IDLE        - Dark neutral background + logo at ~12% opacity
 * 2. SOURCE_LOADED - Either Identification Mode OR Playback Mode
 * 3. JOB_RUNNING   - Playback disabled, encoding progress overlay
 * 4. JOB_COMPLETE  - Same matte + output summary overlay
 * 
 * See: docs/MONITOR_SURFACE.md
 * ============================================================================
 */

import { useRef, useEffect, useState, useCallback } from 'react'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Monitor visual states derived from app state.
 * These are presentation states, not data states.
 */
export type MonitorState = 
  | 'idle'           // No source, show branding
  | 'source-loaded'  // Source ready, show metadata (or playback if supported)
  | 'job-running'    // Job executing, show progress
  | 'job-complete'   // Job finished, show summary

export interface SourceMetadata {
  filename?: string
  codec?: string
  resolution?: string
  fps?: string
  duration?: string
  durationSeconds?: number
  audioChannels?: number | string
  fileSize?: string
  /** Absolute path for local file:// playback */
  filePath?: string
}

export interface JobProgress {
  currentClip: number
  totalClips: number
  elapsedSeconds: number
  sourceFilename?: string
  outputCodec?: string
}

export interface JobResult {
  outputCodec?: string
  outputResolution?: string
  outputDirectory?: string
  totalClips?: number
  totalDuration?: string
}

interface MonitorSurfaceProps {
  /** Explicit monitor state — derived from app/job state externally */
  state: MonitorState
  /** Source metadata (for source-loaded state) */
  sourceMetadata?: SourceMetadata
  /** Job progress info (for job-running state) */
  jobProgress?: JobProgress
  /** Job result info (for job-complete state) */
  jobResult?: JobResult
}

// ============================================================================
// PLAYBACK SUPPORT DETECTION
// ============================================================================

/**
 * Codecs that can be played back in HTML5 <video> in most browsers.
 * Note: ProRes and DNx typically cannot play in browsers without transcoding.
 */
const PLAYBACK_SUPPORTED_CODECS = new Set([
  'h.264', 'h264', 'avc', 'avc1',
  'h.265', 'h265', 'hevc',  // Safari supports HEVC
  'vp8', 'vp9',
  'av1',
])

/**
 * File extensions that typically contain playback-compatible content.
 */
const PLAYBACK_SUPPORTED_EXTENSIONS = new Set([
  '.mp4', '.m4v', '.mov', '.webm', '.ogg', '.ogv',
])

/**
 * Check if a source is likely playable in an HTML5 video element.
 */
function isPlaybackSupported(metadata?: SourceMetadata): boolean {
  if (!metadata?.filename) return false
  
  // Check file extension first
  const filename = metadata.filename.toLowerCase()
  const hasPlayableExtension = Array.from(PLAYBACK_SUPPORTED_EXTENSIONS).some(ext => 
    filename.endsWith(ext)
  )
  
  // If we have codec info, check that too
  if (metadata.codec) {
    const codecLower = metadata.codec.toLowerCase()
    const hasPlayableCodec = Array.from(PLAYBACK_SUPPORTED_CODECS).some(codec => 
      codecLower.includes(codec)
    )
    // Need BOTH extension and codec to be compatible
    return hasPlayableExtension && hasPlayableCodec
  }
  
  // Without codec info, trust extension for common formats
  return hasPlayableExtension
}

// ============================================================================
// HELPERS
// ============================================================================

function formatElapsedTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

function formatTimecode(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const f = Math.floor((seconds % 1) * 24) // Assume 24fps for timecode display
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`
}

function truncatePath(path: string, maxLength: number = 50): string {
  if (!path || path.length <= maxLength) return path || ''
  return '...' + path.slice(-maxLength + 3)
}

// ============================================================================
// PLAYBACK CONTROLS COMPONENT (Only shown when playback is supported)
// ============================================================================

interface PlaybackControlsProps {
  videoRef: React.RefObject<HTMLVideoElement | null>
  isPlaying: boolean
  currentTime: number
  duration: number
  isMuted: boolean
  onPlayPause: () => void
  onSeek: (time: number) => void
  onMuteToggle: () => void
}

function PlaybackControls({
  isPlaying,
  currentTime,
  duration,
  isMuted,
  onPlayPause,
  onSeek,
  onMuteToggle,
}: PlaybackControlsProps) {
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div
      data-testid="playback-controls"
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(transparent, rgba(0, 0, 0, 0.85))',
        padding: '2rem 1rem 0.75rem',
      }}
    >
      {/* Scrub Bar */}
      <div
        style={{
          position: 'relative',
          height: '4px',
          background: 'rgba(255, 255, 255, 0.2)',
          borderRadius: '2px',
          cursor: 'pointer',
          marginBottom: '0.75rem',
        }}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const x = e.clientX - rect.left
          const percent = x / rect.width
          onSeek(percent * duration)
        }}
      >
        {/* Progress fill */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            width: `${progressPercent}%`,
            background: 'var(--accent-primary, #3b82f6)',
            borderRadius: '2px',
            transition: 'width 0.1s linear',
          }}
        />
        {/* Playhead */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: `${progressPercent}%`,
            transform: 'translate(-50%, -50%)',
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            background: '#fff',
            boxShadow: '0 1px 4px rgba(0, 0, 0, 0.3)',
          }}
        />
      </div>

      {/* Controls row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
        }}
      >
        {/* Play/Pause button */}
        <button
          data-testid="play-pause-button"
          onClick={onPlayPause}
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            border: 'none',
            background: 'rgba(255, 255, 255, 0.1)',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1rem',
          }}
          title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>

        {/* Timecode display */}
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.75rem',
            color: '#fff',
            minWidth: '180px',
          }}
        >
          <span>{formatTimecode(currentTime)}</span>
          <span style={{ color: 'var(--text-muted)', margin: '0 0.5rem' }}>/</span>
          <span style={{ color: 'var(--text-muted)' }}>{formatTimecode(duration)}</span>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Mute toggle */}
        <button
          data-testid="mute-button"
          onClick={onMuteToggle}
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '4px',
            border: 'none',
            background: 'rgba(255, 255, 255, 0.1)',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.875rem',
          }}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? '🔇' : '🔊'}
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// COMPONENT
// ============================================================================

export function MonitorSurface({
  state,
  sourceMetadata,
  jobProgress,
  jobResult,
}: MonitorSurfaceProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [logoError, setLogoError] = useState(false)
  
  // Playback state
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [videoError, setVideoError] = useState(false)
  const [videoLoaded, setVideoLoaded] = useState(false)
  
  // Determine if playback is supported for current source
  const canPlayback = state === 'source-loaded' && 
    isPlaybackSupported(sourceMetadata) && 
    !videoError &&
    sourceMetadata?.filePath // Need file path for local playback

  // Reset states when source changes
  useEffect(() => {
    setLogoError(false)
    setVideoError(false)
    setVideoLoaded(false)
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    
    // Pause and reset video element
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.currentTime = 0
    }
  }, [sourceMetadata?.filePath, sourceMetadata?.filename])

  // Pause playback when job starts running
  useEffect(() => {
    if (state === 'job-running' && videoRef.current) {
      videoRef.current.pause()
      setIsPlaying(false)
    }
  }, [state])

  // Video event handlers
  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration)
      setVideoLoaded(true)
    }
  }, [])

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime)
    }
  }, [])

  const handleVideoError = useCallback(() => {
    setVideoError(true)
    setVideoLoaded(false)
    setIsPlaying(false)
  }, [])

  const handleVideoEnded = useCallback(() => {
    setIsPlaying(false)
  }, [])

  // Playback controls
  const handlePlayPause = useCallback(() => {
    if (!videoRef.current) return
    
    if (isPlaying) {
      videoRef.current.pause()
      setIsPlaying(false)
    } else {
      videoRef.current.play().catch(() => {
        setVideoError(true)
      })
      setIsPlaying(true)
    }
  }, [isPlaying])

  const handleSeek = useCallback((time: number) => {
    if (!videoRef.current) return
    videoRef.current.currentTime = Math.max(0, Math.min(time, duration))
    setCurrentTime(videoRef.current.currentTime)
  }, [duration])

  const handleMuteToggle = useCallback(() => {
    if (!videoRef.current) return
    videoRef.current.muted = !isMuted
    setIsMuted(!isMuted)
  }, [isMuted])

  // Keyboard shortcuts for playback
  useEffect(() => {
    if (state !== 'source-loaded' || !canPlayback) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if focus is in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      switch (e.code) {
        case 'Space':
          e.preventDefault()
          handlePlayPause()
          break
        case 'ArrowLeft':
          e.preventDefault()
          handleSeek(currentTime - 5)
          break
        case 'ArrowRight':
          e.preventDefault()
          handleSeek(currentTime + 5)
          break
        case 'KeyM':
          e.preventDefault()
          handleMuteToggle()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [state, canPlayback, handlePlayPause, handleSeek, handleMuteToggle, currentTime])

  // Determine if we're in a "content" state (not idle)
  const hasContent = state !== 'idle'
  
  // Build video source URL (file:// protocol for local files in Electron)
  const videoSrc = sourceMetadata?.filePath 
    ? `file://${sourceMetadata.filePath}`
    : undefined

  return (
    <div
      ref={containerRef}
      data-testid="monitor-surface"
      style={{
        /* Full-bleed container — fills entire center zone */
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        position: 'relative',
        /* Dark neutral background for idle, true black for content states */
        background: hasContent ? '#000000' : '#0a0b0d',
      }}
    >
      {/* 16:9 Content Area — centered matte */}
      <div
        data-testid="monitor-viewport"
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 'calc((100vh - 120px) * 16 / 9)', // Maintain 16:9, account for header/footer
          aspectRatio: '16 / 9',
          background: hasContent ? '#000000' : 'transparent',
          borderRadius: hasContent ? '2px' : 0,
          overflow: 'hidden',
          /* Subtle shadow for content states to separate from background */
          boxShadow: hasContent ? '0 0 60px rgba(0, 0, 0, 0.5)' : 'none',
        }}
      >
        {/* ============================================ */}
        {/* STATE: IDLE — Logo branding */}
        {/* ============================================ */}
        {state === 'idle' && (
          <div
            data-testid="monitor-state-idle"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {!logoError ? (
              <img
                src="/branding/awaire-logo.png"
                alt=""
                draggable={false}
                style={{
                  height: '4rem',
                  width: 'auto',
                  opacity: 0.12,
                  filter: 'grayscale(100%)',
                  userSelect: 'none',
                  pointerEvents: 'none',
                }}
                onError={() => setLogoError(true)}
              />
            ) : (
              /* Fallback: Text-based logo if image fails */
              <span
                style={{
                  fontSize: '2rem',
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 300,
                  letterSpacing: '0.2em',
                  color: 'var(--text-dim)',
                  opacity: 0.25,
                  textTransform: 'uppercase',
                  userSelect: 'none',
                }}
              >
                Forge
              </span>
            )}
          </div>
        )}

        {/* ============================================ */}
        {/* STATE: SOURCE_LOADED — Dual Mode Display */}
        {/* MODE A: Identification Mode (no playback) */}
        {/* MODE B: Playback Mode (working HTML5 video) */}
        {/* ============================================ */}
        {state === 'source-loaded' && sourceMetadata && (
          <div
            data-testid="monitor-state-source-loaded"
            style={{
              position: 'absolute',
              inset: 0,
            }}
          >
            {/* MODE B: Playback Mode — Show video if playback is supported */}
            {canPlayback && videoSrc && (
              <>
                <video
                  ref={videoRef}
                  src={videoSrc}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    background: '#000',
                  }}
                  onLoadedMetadata={handleLoadedMetadata}
                  onTimeUpdate={handleTimeUpdate}
                  onError={handleVideoError}
                  onEnded={handleVideoEnded}
                  muted={isMuted}
                  playsInline
                />
                {/* Playback controls — only shown when video is loaded */}
                {videoLoaded && (
                  <PlaybackControls
                    videoRef={videoRef}
                    isPlaying={isPlaying}
                    currentTime={currentTime}
                    duration={duration}
                    isMuted={isMuted}
                    onPlayPause={handlePlayPause}
                    onSeek={handleSeek}
                    onMuteToggle={handleMuteToggle}
                  />
                )}
              </>
            )}

            {/* MODE A: Identification Mode — Show metadata overlay when playback not supported */}
            {!canPlayback && (
              <>
                {/* Mode label at top */}
                <div
                  data-testid="identification-mode-label"
                  style={{
                    position: 'absolute',
                    top: '1rem',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    padding: '0.375rem 0.75rem',
                    background: 'rgba(100, 116, 139, 0.3)',
                    borderRadius: '4px',
                    border: '1px solid rgba(100, 116, 139, 0.4)',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.6875rem',
                      fontFamily: 'var(--font-sans)',
                      color: 'var(--text-muted)',
                      letterSpacing: '0.03em',
                    }}
                  >
                    Preview (Identification Only — Playback unavailable)
                  </span>
                </div>

                {/* Center metadata display */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '1.5rem',
                      padding: '2rem',
                      background: 'rgba(0, 0, 0, 0.6)',
                      borderRadius: '8px',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      maxWidth: '80%',
                    }}
                  >
                    {/* Filename */}
                    <span
                      style={{
                        fontSize: '1.125rem',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-primary)',
                        fontWeight: 500,
                        textAlign: 'center',
                        wordBreak: 'break-all',
                      }}
                    >
                      {sourceMetadata.filename || 'Unknown source'}
                    </span>

                    {/* Metadata grid */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, auto)',
                        gap: '0.5rem 2rem',
                        fontSize: '0.8125rem',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {sourceMetadata.codec && (
                        <>
                          <span style={{ color: 'var(--text-dim)' }}>Codec</span>
                          <span style={{ color: 'var(--text-secondary)' }}>{sourceMetadata.codec}</span>
                        </>
                      )}
                      {sourceMetadata.resolution && (
                        <>
                          <span style={{ color: 'var(--text-dim)' }}>Resolution</span>
                          <span style={{ color: 'var(--text-secondary)' }}>{sourceMetadata.resolution}</span>
                        </>
                      )}
                      {sourceMetadata.fps && (
                        <>
                          <span style={{ color: 'var(--text-dim)' }}>Frame Rate</span>
                          <span style={{ color: 'var(--text-secondary)' }}>{sourceMetadata.fps}</span>
                        </>
                      )}
                      {sourceMetadata.duration && (
                        <>
                          <span style={{ color: 'var(--text-dim)' }}>Duration</span>
                          <span style={{ color: 'var(--text-secondary)' }}>{sourceMetadata.duration}</span>
                        </>
                      )}
                      {sourceMetadata.audioChannels && (
                        <>
                          <span style={{ color: 'var(--text-dim)' }}>Audio</span>
                          <span style={{ color: 'var(--text-secondary)' }}>{sourceMetadata.audioChannels}ch</span>
                        </>
                      )}
                      {sourceMetadata.fileSize && (
                        <>
                          <span style={{ color: 'var(--text-dim)' }}>Size</span>
                          <span style={{ color: 'var(--text-secondary)' }}>{sourceMetadata.fileSize}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Bottom-left metadata overlay — shown for both modes */}
            {canPlayback && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '4.5rem', // Above controls
                  left: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem',
                  padding: '0.5rem 0.625rem',
                  background: 'rgba(0, 0, 0, 0.65)',
                  borderRadius: '4px',
                  backdropFilter: 'blur(8px)',
                  opacity: 0.9,
                }}
              >
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-primary)',
                    fontWeight: 500,
                  }}
                >
                  {sourceMetadata.filename || 'Unknown source'}
                </span>
                <div
                  style={{
                    display: 'flex',
                    gap: '0.75rem',
                    fontSize: '0.625rem',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-muted)',
                  }}
                >
                  {sourceMetadata.codec && <span>{sourceMetadata.codec}</span>}
                  {sourceMetadata.resolution && <span>{sourceMetadata.resolution}</span>}
                  {sourceMetadata.fps && <span>{sourceMetadata.fps}</span>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================ */}
        {/* STATE: JOB_RUNNING — Progress overlay */}
        {/* ============================================ */}
        {state === 'job-running' && (
          <div
            data-testid="monitor-state-job-running"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Center encoding indicator */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '1rem',
              }}
            >
              {/* Encoding badge with pulse */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.75rem 1.25rem',
                  background: 'rgba(14, 116, 144, 0.2)',
                  border: '1px solid rgba(34, 211, 238, 0.35)',
                  borderRadius: '6px',
                  animation: 'monitorPulse 2.5s ease-in-out infinite',
                }}
              >
                {/* Spinner */}
                <span
                  style={{
                    display: 'inline-block',
                    width: '1rem',
                    height: '1rem',
                    borderRadius: '50%',
                    border: '2px solid var(--text-muted)',
                    borderTopColor: 'var(--status-running-fg)',
                    animation: 'monitorSpin 1s linear infinite',
                  }}
                />
                <span
                  style={{
                    fontSize: '0.875rem',
                    fontFamily: 'var(--font-sans)',
                    color: 'var(--text-primary)',
                    fontWeight: 500,
                  }}
                >
                  Encoding clip {jobProgress?.currentClip || 1} of {jobProgress?.totalClips || 1}
                </span>
              </div>

              {/* Transform indicator: source → output */}
              {jobProgress?.outputCodec && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.625rem',
                    fontSize: '0.75rem',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-muted)',
                  }}
                >
                  <span>{jobProgress.sourceFilename || 'source'}</span>
                  <span style={{ color: 'var(--text-dim)' }}>→</span>
                  <span style={{ color: 'var(--status-running-fg)' }}>
                    {jobProgress.outputCodec}
                  </span>
                </div>
              )}

              {/* Elapsed time */}
              <span
                style={{
                  fontSize: '0.8125rem',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-secondary)',
                }}
              >
                {formatElapsedTime(jobProgress?.elapsedSeconds || 0)}
              </span>

              {/* Playback disabled notice */}
              <span
                style={{
                  fontSize: '0.6875rem',
                  fontFamily: 'var(--font-sans)',
                  color: 'var(--text-dim)',
                  fontStyle: 'italic',
                  marginTop: '0.5rem',
                }}
              >
                Playback disabled while encoding is in progress
              </span>
            </div>

            {/* Bottom-left: current source filename */}
            {jobProgress?.sourceFilename && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '1rem',
                  left: '1rem',
                  padding: '0.5rem 0.625rem',
                  background: 'rgba(0, 0, 0, 0.7)',
                  borderRadius: '4px',
                }}
              >
                <span
                  style={{
                    fontSize: '0.6875rem',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {jobProgress.sourceFilename}
                </span>
              </div>
            )}
          </div>
        )}

        {/* ============================================ */}
        {/* STATE: JOB_COMPLETE — Result overlay */}
        {/* ============================================ */}
        {state === 'job-complete' && (
          <div
            data-testid="monitor-state-job-complete"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Center completion badge */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.75rem',
              }}
            >
              {/* Success badge */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.625rem 1rem',
                  background: 'rgba(6, 78, 59, 0.25)',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                  borderRadius: '6px',
                }}
              >
                <span
                  style={{
                    fontSize: '1.125rem',
                    color: 'var(--status-completed-fg)',
                  }}
                >
                  ✓
                </span>
                <span
                  style={{
                    fontSize: '0.875rem',
                    fontFamily: 'var(--font-sans)',
                    color: 'var(--status-completed-fg)',
                    fontWeight: 500,
                  }}
                >
                  Completed
                </span>
              </div>

              {/* Output details */}
              <div
                style={{
                  display: 'flex',
                  gap: '1rem',
                  fontSize: '0.75rem',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-muted)',
                }}
              >
                {jobResult?.outputCodec && <span>{jobResult.outputCodec}</span>}
                {jobResult?.outputResolution && <span>{jobResult.outputResolution}</span>}
                {jobResult?.totalClips && (
                  <span>{jobResult.totalClips} clip{jobResult.totalClips > 1 ? 's' : ''}</span>
                )}
              </div>
            </div>

            {/* Bottom-left: output directory */}
            {jobResult?.outputDirectory && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '1rem',
                  left: '1rem',
                  right: '1rem',
                  padding: '0.5rem 0.625rem',
                  background: 'rgba(0, 0, 0, 0.7)',
                  borderRadius: '4px',
                }}
                title={jobResult.outputDirectory}
              >
                <span
                  style={{
                    fontSize: '0.625rem',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-dim)',
                    marginRight: '0.5rem',
                  }}
                >
                  Output:
                </span>
                <span
                  style={{
                    fontSize: '0.625rem',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {truncatePath(jobResult.outputDirectory)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* CSS Keyframes for animations */}
      <style>{`
        @keyframes monitorSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes monitorPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }
      `}</style>
    </div>
  )
}

export default MonitorSurface
