/**
 * MonitorSurface — Full-Bleed Monitor with Dual-Mode Playback
 * 
 * ============================================================================
 * DESIGN PHILOSOPHY — PREVIEW PROXY SYSTEM
 * ============================================================================
 * This component implements a "Monitor" abstraction with deterministic,
 * honest preview proxy playback. Modeled after Resolve/RV-class NLE monitors.
 * 
 * ARCHITECTURAL PRINCIPLES:
 * 1. UI NEVER attempts playback from original sources
 * 2. ALL playback comes from preview-safe proxy files
 * 3. Preview proxies are temporary, disposable, isolated from output jobs
 * 4. If preview proxy generation fails, UI falls back to Identification Mode
 * 5. No speculative playback. No fake scrubbers. No guessing codec support.
 * 
 * STATES:
 * - IDLE: No source, show branding
 * - PREPARING_PREVIEW: Preview proxy being generated
 * - PREVIEW_PROXY_READY: Preview proxy available, Playback Mode active
 * - IDENTIFICATION_ONLY: Preview failed, metadata-only display
 * - JOB_RUNNING: Encoding progress overlay
 * - JOB_COMPLETE: Output summary overlay
 * 
 * INTERACTION:
 * - Click on video canvas: Toggle play/pause
 * - Double-click: Toggle Fit/100% zoom
 * - Hover: Subtle play/pause cursor indicator
 * 
 * Key principles:
 * - Full-bleed: No card borders, padding, or nested panels
 * - Edge-to-edge with centered 16:9 content area
 * - NO fake controls — if playback doesn't work, controls don't appear
 * - Real HTML5 video playback ONLY from preview proxies
 * 
 * See: docs/PREVIEW_PROXY_PIPELINE.md, docs/MONITOR_SURFACE.md
 * ============================================================================
 */

import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { TransportBar } from './TransportBar'

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

/**
 * Preview proxy state for playback control.
 */
export type PreviewProxyState = 
  | 'idle'           // No preview requested
  | 'generating'     // Preview proxy being generated
  | 'ready'          // Preview proxy available
  | 'failed'         // Preview proxy generation failed

export interface SourceMetadata {
  filename?: string
  codec?: string
  resolution?: string
  fps?: string
  duration?: string
  durationSeconds?: number
  audioChannels?: number | string
  fileSize?: string
  /** Absolute path for source file (used for preview generation, NOT playback) */
  filePath?: string
  /** Source timecode start (SMPTE format or seconds) */
  sourceTimecodeStart?: string | number
  /** Whether source timecode was found in metadata */
  hasSourceTimecode?: boolean
}

export interface PreviewProxyInfo {
  /** HTTP URL to stream the preview proxy */
  previewUrl: string
  /** Duration in seconds */
  duration: number | null
  /** Resolution string (e.g., "1280x720") */
  resolution: string | null
  /** Codec (always "h264") */
  codec: string
}

export interface PreviewProxyError {
  /** Human-readable error message */
  message: string
}

export interface JobProgress {
  currentClip: number
  totalClips: number
  elapsedSeconds: number
  sourceFilename?: string
  outputCodec?: string
  /** Preview proxy URL for encoding overlay (if available) */
  previewUrl?: string
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
  /** Preview proxy state */
  previewProxyState?: PreviewProxyState
  /** Preview proxy info (when previewProxyState === 'ready') */
  previewProxyInfo?: PreviewProxyInfo | null
  /** Preview proxy error (when previewProxyState === 'failed') */
  previewProxyError?: PreviewProxyError | null
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

function truncatePath(path: string, maxLength: number = 50): string {
  if (!path || path.length <= maxLength) return path || ''
  return '...' + path.slice(-maxLength + 3)
}

/**
 * Parse FPS string from metadata to numeric value.
 * Handles common formats: "23.976", "24", "29.97", "30", "23.98 fps", etc.
 * Returns 24 as fallback (NOT 30 — never assume 30fps).
 */
function parseFps(fpsString?: string): number {
  if (!fpsString) return 24
  
  // Extract numeric portion
  const match = fpsString.match(/([\d.]+)/)
  if (!match) return 24
  
  const fps = parseFloat(match[1])
  return isFinite(fps) && fps > 0 ? fps : 24
}

// ============================================================================
// NOTE: PlaybackControls replaced by TransportBar component
// See: TransportBar.tsx for professional transport controls
// ============================================================================

// ============================================================================
// COMPONENT
// ============================================================================

export function MonitorSurface({
  state,
  sourceMetadata,
  jobProgress,
  jobResult,
  previewProxyState = 'idle',
  previewProxyInfo,
  previewProxyError,
}: MonitorSurfaceProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const [logoError, setLogoError] = useState(false)
  
  // Video loading state
  const [videoError, setVideoError] = useState(false)
  const [videoLoaded, setVideoLoaded] = useState(false)
  const [duration, setDuration] = useState(0)
  
  // Playback state for click-to-play UI
  const [isPlaying, setIsPlaying] = useState(false)
  
  // Zoom state: 'fit' (default) or '100%'
  const [zoomMode, setZoomMode] = useState<'fit' | 'actual'>('fit')
  
  // Hover state for video canvas
  const [isVideoHovered, setIsVideoHovered] = useState(false)
  
  // Parse FPS from source metadata (fallback to 24fps, never assume 30fps)
  const fps = useMemo(() => parseFps(sourceMetadata?.fps), [sourceMetadata?.fps])
  
  // PREVIEW PROXY SYSTEM:
  // Playback is ONLY allowed when:
  // 1. Source is loaded
  // 2. Preview proxy is ready
  // 3. No video playback errors
  //
  // We NEVER attempt to play from the original source.
  // All playback comes from the preview proxy URL.
  const canPlayback = state === 'source-loaded' && 
    previewProxyState === 'ready' && 
    previewProxyInfo?.previewUrl &&
    !videoError

  // Is preview currently being prepared?
  const isPreparingPreview = state === 'source-loaded' && previewProxyState === 'generating'
  
  // Is preview in identification-only mode (failed or not started)?
  const isIdentificationOnly = state === 'source-loaded' && 
    (previewProxyState === 'failed' || previewProxyState === 'idle')

  // Reset states when source changes
  useEffect(() => {
    setLogoError(false)
    setVideoError(false)
    setVideoLoaded(false)
    setDuration(0)
    setIsPlaying(false)
    setZoomMode('fit')
    
    // Pause and reset video element
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.currentTime = 0
    }
  }, [sourceMetadata?.filePath, sourceMetadata?.filename, previewProxyInfo?.previewUrl])

  // Pause playback when job starts running
  useEffect(() => {
    if (state === 'job-running' && videoRef.current) {
      videoRef.current.pause()
      setIsPlaying(false)
    }
  }, [state])

  // Sync isPlaying state with video element
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    
    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)
    const handleEnded = () => setIsPlaying(false)
    
    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)
    video.addEventListener('ended', handleEnded)
    
    return () => {
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
      video.removeEventListener('ended', handleEnded)
    }
  }, [videoLoaded])

  // Video event handlers
  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration)
      setVideoLoaded(true)
    }
  }, [])

  const handleVideoError = useCallback(() => {
    setVideoError(true)
    setVideoLoaded(false)
  }, [])
  
  // Click-to-play handler
  const handleVideoClick = useCallback((e: React.MouseEvent) => {
    // Ignore if clicking on controls (transport bar)
    const target = e.target as HTMLElement
    if (target.closest('[data-testid="transport-bar"]')) return
    
    const video = videoRef.current
    if (!video) return
    
    if (video.paused) {
      video.play().catch(() => {
        // Ignore autoplay restrictions
      })
    } else {
      video.pause()
    }
  }, [])
  
  // Double-click to toggle zoom
  const handleVideoDoubleClick = useCallback((e: React.MouseEvent) => {
    // Ignore if clicking on controls
    const target = e.target as HTMLElement
    if (target.closest('[data-testid="transport-bar"]')) return
    
    setZoomMode(prev => prev === 'fit' ? 'actual' : 'fit')
  }, [])

  // Determine if we're in a "content" state (not idle)
  const hasContent = state !== 'idle'
  
  // PREVIEW PROXY SYSTEM:
  // Video source is the preview proxy URL from the backend.
  // We NEVER use file:// URLs directly — all playback comes from HTTP-served proxies.
  const videoSrc = previewProxyInfo?.previewUrl || undefined

  return (
    <div
      ref={containerRef}
      data-testid="monitor-surface"
      style={{
        /* Full-bleed container — fills entire center zone */
        display: 'flex',
        flexDirection: 'column',
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
        ref={viewportRef}
        data-testid="monitor-viewport"
        onClick={canPlayback ? handleVideoClick : undefined}
        onDoubleClick={canPlayback ? handleVideoDoubleClick : undefined}
        onMouseEnter={() => setIsVideoHovered(true)}
        onMouseLeave={() => setIsVideoHovered(false)}
        style={{
          position: 'relative',
          flex: '1 1 auto',
          width: '100%',
          maxWidth: zoomMode === 'fit' 
            ? 'calc((100vh - 120px) * 16 / 9)' 
            : 'none', // Allow overflow in 100% mode
          aspectRatio: zoomMode === 'fit' ? '16 / 9' : undefined,
          background: hasContent ? '#000000' : 'transparent',
          borderRadius: hasContent ? '2px' : 0,
          overflow: zoomMode === 'fit' ? 'hidden' : 'auto',
          /* Subtle shadow for content states to separate from background */
          boxShadow: hasContent ? '0 0 60px rgba(0, 0, 0, 0.5)' : 'none',
          /* Cursor changes to indicate click-to-play when video is loaded */
          cursor: canPlayback && isVideoHovered 
            ? (isPlaying ? 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\'%3E%3Crect x=\'6\' y=\'5\' width=\'4\' height=\'14\' rx=\'1\' fill=\'white\' opacity=\'0.8\'/%3E%3Crect x=\'14\' y=\'5\' width=\'4\' height=\'14\' rx=\'1\' fill=\'white\' opacity=\'0.8\'/%3E%3C/svg%3E") 12 12, pointer' 
              : 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\'%3E%3Cpath d=\'M8 5v14l11-7L8 5z\' fill=\'white\' opacity=\'0.8\'/%3E%3C/svg%3E") 12 12, pointer')
            : 'default',
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
        {/* STATE: SOURCE_LOADED — Three Sub-States */}
        {/* 1. PREPARING_PREVIEW: Generating proxy */}
        {/* 2. PLAYBACK_MODE: Preview proxy ready */}
        {/* 3. IDENTIFICATION_ONLY: Preview failed */}
        {/* ============================================ */}
        {state === 'source-loaded' && sourceMetadata && (
          <div
            data-testid="monitor-state-source-loaded"
            style={{
              position: 'absolute',
              inset: 0,
            }}
          >
            {/* PREPARING PREVIEW — Show loading overlay */}
            {isPreparingPreview && (
              <div
                data-testid="preparing-preview-overlay"
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                  gap: '1rem',
                }}
              >
                {/* Preparing Preview badge */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.75rem 1.25rem',
                    background: 'rgba(59, 130, 246, 0.15)',
                    border: '1px solid rgba(59, 130, 246, 0.35)',
                    borderRadius: '6px',
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
                      borderTopColor: 'var(--accent-primary, #3b82f6)',
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
                    Preparing Preview…
                  </span>
                </div>

                {/* Source filename */}
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-muted)',
                  }}
                >
                  {sourceMetadata.filename || 'Unknown source'}
                </span>
              </div>
            )}

            {/* PLAYBACK MODE — Show video when preview proxy is ready */}
            {canPlayback && videoSrc && (
              <>
                {/* Playback Mode badge */}
                <div
                  data-testid="playback-mode-badge"
                  style={{
                    position: 'absolute',
                    top: '0.75rem',
                    left: '0.75rem',
                    zIndex: 10,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.375rem 0.625rem',
                      background: 'rgba(16, 185, 129, 0.15)',
                      border: '1px solid rgba(16, 185, 129, 0.35)',
                      borderRadius: '4px',
                    }}
                  >
                    <span
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: 'var(--status-completed-fg, #10b981)',
                      }}
                    />
                    <span
                      style={{
                        fontSize: '0.6875rem',
                        fontFamily: 'var(--font-sans)',
                        color: 'var(--status-completed-fg, #10b981)',
                        fontWeight: 500,
                        letterSpacing: '0.02em',
                      }}
                    >
                      Playback Mode
                    </span>
                  </div>
                  
                  {/* Zoom indicator */}
                  {zoomMode === 'actual' && (
                    <div
                      style={{
                        padding: '0.375rem 0.625rem',
                        background: 'rgba(59, 130, 246, 0.15)',
                        border: '1px solid rgba(59, 130, 246, 0.35)',
                        borderRadius: '4px',
                      }}
                      title="Double-click to toggle Fit/100% zoom"
                    >
                      <span
                        style={{
                          fontSize: '0.6875rem',
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--accent-primary, #3b82f6)',
                          fontWeight: 500,
                        }}
                      >
                        100%
                      </span>
                    </div>
                  )}
                </div>

                <video
                  ref={videoRef}
                  src={videoSrc}
                  style={{
                    position: zoomMode === 'fit' ? 'absolute' : 'relative',
                    inset: zoomMode === 'fit' ? 0 : undefined,
                    width: zoomMode === 'fit' ? '100%' : 'auto',
                    height: zoomMode === 'fit' ? '100%' : 'auto',
                    objectFit: zoomMode === 'fit' ? 'contain' : undefined,
                    background: '#000',
                    margin: zoomMode === 'actual' ? 'auto' : undefined,
                    display: 'block',
                  }}
                  onLoadedMetadata={handleLoadedMetadata}
                  onError={handleVideoError}
                  playsInline
                  crossOrigin="anonymous"
                />
              </>
            )}

            {/* IDENTIFICATION MODE — Show metadata overlay when preview failed or not available */}
            {isIdentificationOnly && (
              <>
                {/* Mode label at top — include error reason if available */}
                <div
                  data-testid="identification-mode-label"
                  style={{
                    position: 'absolute',
                    top: '1rem',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    padding: '0.375rem 0.75rem',
                    background: previewProxyError 
                      ? 'rgba(239, 68, 68, 0.15)' 
                      : 'rgba(100, 116, 139, 0.3)',
                    borderRadius: '4px',
                    border: previewProxyError 
                      ? '1px solid rgba(239, 68, 68, 0.35)' 
                      : '1px solid rgba(100, 116, 139, 0.4)',
                    maxWidth: '90%',
                    textAlign: 'center',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.6875rem',
                      fontFamily: 'var(--font-sans)',
                      color: previewProxyError ? 'var(--status-failed-fg, #ef4444)' : 'var(--text-muted)',
                      letterSpacing: '0.03em',
                    }}
                  >
                    {previewProxyError 
                      ? previewProxyError.message 
                      : 'Preview (Identification Only)'}
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
        {/* Reuses preview proxy as background if available */}
        {/* ============================================ */}
        {state === 'job-running' && (
          <div
            data-testid="monitor-state-job-running"
            style={{
              position: 'absolute',
              inset: 0,
            }}
          >
            {/* Background: Preview proxy video (paused) if available */}
            {jobProgress?.previewUrl && (
              <video
                src={jobProgress.previewUrl}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  background: '#000',
                  opacity: 0.4,  // Dim to make overlay readable
                  filter: 'blur(2px)',  // Slight blur for visual separation
                }}
                muted
                playsInline
              />
            )}
            
            {/* Center encoding indicator */}
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

      {/* TransportBar — Professional transport controls below the monitor */}
      {canPlayback && videoLoaded && (
        <TransportBar
          videoRef={videoRef}
          fps={fps}
          duration={duration}
          enabled={true}
          sourceTimecodeStart={sourceMetadata?.sourceTimecodeStart}
          hasSourceTimecode={sourceMetadata?.hasSourceTimecode}
        />
      )}

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
