/**
 * MonitorSurface — Full-Bleed Monitor with Tiered Preview System
 * 
 * ============================================================================
 * DESIGN PHILOSOPHY — TIERED PREVIEW SYSTEM
 * ============================================================================
 * This component implements a "Monitor" abstraction with tiered, non-blocking,
 * editor-grade previews. Modeled after Resolve/RV-class NLE monitors.
 * 
 * PREVIEW TIERS:
 * 1. POSTER (default) — Single frame, appears IMMEDIATELY
 * 2. BURST (if generated) — Thumbnail strip for scrub preview
 * 3. VIDEO (if explicitly generated) — Full playback proxy
 * 
 * ARCHITECTURAL PRINCIPLES:
 * 1. Preview must NEVER block job creation, preflight, or encoding
 * 2. Preview generation must NEVER auto-generate video for RAW media
 * 3. Something visual must appear IMMEDIATELY on source selection
 * 4. All higher-fidelity previews are OPTIONAL and user-initiated
 * 5. Preview is identification only — not editorial accuracy
 * 
 * STATES:
 * - IDLE: No source, show branding
 * - SOURCE_LOADED: Source ready, show poster + metadata
 * - JOB_RUNNING: Encoding progress overlay
 * - JOB_COMPLETE: Output summary overlay
 * 
 * Key principles:
 * - Full-bleed: No card borders, padding, or nested panels
 * - Edge-to-edge with centered 16:9 content area
 * - NO blocking spinners — poster appears instantly
 * - Video playback ONLY when user explicitly requests it
 * 
 * See: docs/PREVIEW_PIPELINE.md, docs/MONITOR_SURFACE.md
 * ============================================================================
 */

import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { TransportBar, ClipInfo } from './TransportBar'
import { BurstStrip } from './BurstStrip'
import { PreviewMenu, PreviewModeBadge, PreviewDisclaimer } from './PreviewMenu'
import type { UseTieredPreviewReturn } from '../hooks/useTieredPreview'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Monitor visual states derived from app state.
 * These are presentation states, not data states.
 */
export type MonitorState = 
  | 'idle'           // No source, show branding
  | 'source-loaded'  // Source ready, show preview (poster/burst/video)
  | 'job-running'    // Job executing, show progress
  | 'job-complete'   // Job finished, show summary

/**
 * Preview proxy state for playback control.
 * @deprecated Use tieredPreview.mode instead
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
  /** Tiered preview system state and controls */
  tieredPreview?: UseTieredPreviewReturn
  /** Current source path for preview requests */
  currentSourcePath?: string | null
  
  // Clip Navigation (v3)
  /** Current clip info for display and navigation */
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
  
  // Legacy props for backward compatibility
  /** @deprecated Use tieredPreview instead */
  previewProxyState?: PreviewProxyState
  /** @deprecated Use tieredPreview instead */
  previewProxyInfo?: PreviewProxyInfo | null
  /** @deprecated Use tieredPreview instead */
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
  tieredPreview,
  currentSourcePath,
  // Clip navigation (v3)
  currentClip,
  totalClips,
  onPreviousClip,
  onNextClip,
  isFirstClip = true,
  isLastClip = true,
  // Legacy props - ignored if tieredPreview is provided
  previewProxyState: _legacyState,
  previewProxyInfo: _legacyInfo,
  previewProxyError: _legacyError,
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
  
  // Preview menu state
  const [showPreviewMenu, setShowPreviewMenu] = useState(false)
  const [pendingRawConfirmation, setPendingRawConfirmation] = useState<number | null>(null)
  
  // Parse FPS from source metadata (fallback to 24fps, never assume 30fps)
  const fps = useMemo(() => parseFps(sourceMetadata?.fps), [sourceMetadata?.fps])
  
  // Derive preview mode from tiered preview state
  const previewMode = tieredPreview?.mode || 'none'
  
  // Check if source is RAW format
  const isRaw = useMemo(() => {
    if (!sourceMetadata?.codec) return false
    const codec = sourceMetadata.codec.toLowerCase()
    return ['arriraw', 'redcode', 'braw', 'r3d', 'prores_raw', 'prores raw'].some(
      raw => codec.includes(raw)
    )
  }, [sourceMetadata?.codec])
  
  // NON-RAW NATIVE PLAYBACK:
  // Non-RAW files (mp4/mov/prores) can play directly via native HTML5 video.
  // No preview pipeline required. Video src is served via backend static route.
  const isNativePlayback = useMemo(() => {
    if (!sourceMetadata?.filePath) return false
    // Non-RAW files can use native playback
    return !isRaw
  }, [sourceMetadata?.filePath, isRaw])
  
  // Compute native video source URL (served via backend)
  const nativeVideoSrc = useMemo(() => {
    if (!isNativePlayback || !sourceMetadata?.filePath) return undefined
    // Encode the file path for the backend source streaming endpoint
    const encodedPath = encodeURIComponent(sourceMetadata.filePath)
    return `http://127.0.0.1:8000/preview/source/${encodedPath}`
  }, [isNativePlayback, sourceMetadata?.filePath])
  
  // PLAYBACK LOGIC:
  // Video playback is allowed when:
  // A) Non-RAW: Native HTML5 video (no preview required)
  // B) RAW: Video preview proxy ready (user explicitly generated it)
  const canPlayback = state === 'source-loaded' && !videoError && (
    // Non-RAW: Native playback (file served via backend)
    isNativePlayback ||
    // RAW: Preview proxy ready
    !!(previewMode === 'video' && tieredPreview?.video?.previewUrl)
  )
  
  // INC-CTRL-002: Transport controls MUST be visible when source is loaded.
  // Controls visibility is based on "can play", not preview tier.
  // Rules:
  // - Non-RAW: Controls always visible and enabled (native HTML5 video)
  // - RAW: Controls visible but disabled until preview proxy exists
  // Controls NEVER hidden when a source is selected.
  const canShowTransportControls = state === 'source-loaded' && (
    // Non-RAW files: Always show controls (native playback)
    isNativePlayback ||
    // RAW files: Always show controls (may be disabled)
    isRaw ||
    // Fallback: Any preview tier available
    !!tieredPreview?.poster?.posterUrl ||
    !!tieredPreview?.video?.previewUrl ||
    !!(tieredPreview?.burst?.thumbnails && tieredPreview.burst.thumbnails.length > 0)
  )
  
  // Transport controls are ENABLED when video can actually play:
  // - Non-RAW: Enabled when native video is loaded
  // - RAW: Enabled when proxy video is loaded
  const transportEnabled = canPlayback && videoLoaded
  
  // Determine playback status label for disabled controls
  // Clear status labels per the contract:
  // - "RAW – Preview Required" for RAW without proxy
  // - "Playback Ready" when playable
  // - "Loading..." during load
  const playbackStatusLabel = useMemo(() => {
    if (canPlayback && videoLoaded) return null // No label needed when playback available
    if (isNativePlayback && !videoLoaded) return 'Loading video…'
    if (tieredPreview?.videoLoading) return 'Generating preview proxy…'
    if (tieredPreview?.videoError) return `Preview error: ${tieredPreview.videoError}`
    if (isRaw && !tieredPreview?.video?.previewUrl) return 'Generate preview to enable playback'
    if (!videoLoaded && canPlayback) return 'Loading video…'
    return null
  }, [canPlayback, videoLoaded, isNativePlayback, tieredPreview?.videoLoading, tieredPreview?.videoError, tieredPreview?.video?.previewUrl, isRaw])
  
  // Show poster frame as default visual
  // For non-RAW files with native playback, poster is only shown while video loads
  const showPoster = state === 'source-loaded' && 
    !isNativePlayback &&  // Non-RAW uses video directly
    (previewMode === 'poster' || previewMode === 'none') && 
    tieredPreview?.poster?.posterUrl
  
  // Show burst thumbnails when in burst mode (RAW only)
  const showBurst = state === 'source-loaded' && 
    !isNativePlayback &&  // Non-RAW doesn't need burst
    previewMode === 'burst' && 
    tieredPreview?.burst?.thumbnails && 
    tieredPreview.burst.thumbnails.length > 0
  
  // Get current burst frame URL for display
  const currentBurstUrl = showBurst 
    ? tieredPreview?.burst?.thumbnails[tieredPreview?.burstIndex || 0]?.url 
    : null

  // Reset states when source changes
  useEffect(() => {
    setLogoError(false)
    setVideoError(false)
    setVideoLoaded(false)
    setDuration(0)
    setIsPlaying(false)
    setZoomMode('fit')
    setShowPreviewMenu(false)
    setPendingRawConfirmation(null)
    
    // Pause and reset video element
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.currentTime = 0
    }
  }, [sourceMetadata?.filePath, sourceMetadata?.filename, tieredPreview?.video?.previewUrl])

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
    if (target.closest('[data-testid="preview-menu"]')) return
    if (target.closest('[data-testid="burst-strip"]')) return
    
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
  
  // Preview menu handlers
  const handleRequestVideo = useCallback((duration: number) => {
    if (!currentSourcePath || !tieredPreview) return
    
    if (isRaw && pendingRawConfirmation === null) {
      setPendingRawConfirmation(duration)
      return
    }
    
    tieredPreview.requestVideo(currentSourcePath, duration, isRaw)
    setPendingRawConfirmation(null)
  }, [currentSourcePath, tieredPreview, isRaw, pendingRawConfirmation])
  
  const handleConfirmRaw = useCallback(() => {
    if (!currentSourcePath || !tieredPreview || pendingRawConfirmation === null) return
    tieredPreview.requestVideo(currentSourcePath, pendingRawConfirmation, true)
    setPendingRawConfirmation(null)
  }, [currentSourcePath, tieredPreview, pendingRawConfirmation])

  // Determine if we're in a "content" state (not idle)
  const hasContent = state !== 'idle'
  
  // VIDEO SOURCE ROUTING:
  // - Non-RAW files: Use native source URL (served via backend static route)
  // - RAW files: Use preview proxy URL (user-initiated generation)
  const videoSrc = isNativePlayback 
    ? nativeVideoSrc 
    : tieredPreview?.video?.previewUrl || undefined
  
  // Get metadata from poster extraction or props
  const displayMetadata = tieredPreview?.poster?.sourceInfo || {
    filename: sourceMetadata?.filename,
    codec: sourceMetadata?.codec,
    resolution: sourceMetadata?.resolution,
    fps: sourceMetadata?.fps ? parseFloat(sourceMetadata.fps) : undefined,
    duration_human: sourceMetadata?.duration,
    file_size_human: sourceMetadata?.fileSize,
  }

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
        {/* STATE: SOURCE_LOADED — Tiered Preview System */}
        {/* 1. POSTER: Single frame (default, instant) */}
        {/* 2. BURST: Thumbnail strip (optional) */}
        {/* 3. VIDEO: Full playback (user-initiated only) */}
        {/* 4. NATIVE: Non-RAW direct playback */}
        {/* ============================================ */}
        {state === 'source-loaded' && sourceMetadata && (
          <div
            data-testid="monitor-state-source-loaded"
            style={{
              position: 'absolute',
              inset: 0,
            }}
          >
            {/* TOP-LEFT: Preview Mode Badge + Zoom Indicator */}
            <div
              data-testid="preview-mode-header"
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
              {/* Badge mode: native (non-RAW), raw-pending (RAW without proxy), or preview tier */}
              <PreviewModeBadge 
                mode={
                  isNativePlayback 
                    ? 'native' 
                    : (isRaw && !tieredPreview?.video?.previewUrl)
                      ? 'raw-pending'
                      : previewMode
                } 
              />
              
              {/* Zoom indicator (only in video mode) */}
              {canPlayback && zoomMode === 'actual' && (
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

            {/* TOP-RIGHT: Preview Menu Button + Dropdown */}
            <div
              data-testid="preview-menu-container"
              style={{
                position: 'absolute',
                top: '0.75rem',
                right: '0.75rem',
                zIndex: 10,
              }}
            >
              {/* Menu trigger button */}
              <button
                onClick={() => setShowPreviewMenu(prev => !prev)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  padding: '0.375rem 0.625rem',
                  background: showPreviewMenu 
                    ? 'rgba(59, 130, 246, 0.2)' 
                    : 'rgba(255, 255, 255, 0.06)',
                  border: showPreviewMenu 
                    ? '1px solid rgba(59, 130, 246, 0.4)' 
                    : '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '4px',
                  color: showPreviewMenu 
                    ? 'var(--accent-primary, #3b82f6)' 
                    : 'var(--text-secondary, #9ca3af)',
                  fontSize: '0.75rem',
                  fontFamily: 'var(--font-sans)',
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                }}
              >
                {tieredPreview?.videoLoading ? (
                  <>
                    <span
                      style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        border: '2px solid var(--text-dim)',
                        borderTopColor: 'var(--accent-primary, #3b82f6)',
                        animation: 'monitorSpin 1s linear infinite',
                      }}
                    />
                    Generating…
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: '0.875rem' }}>▶</span>
                    Preview
                  </>
                )}
              </button>

              {/* Dropdown menu */}
              <PreviewMenu
                visible={showPreviewMenu}
                onClose={() => setShowPreviewMenu(false)}
                onRequestVideo={handleRequestVideo}
                isGenerating={tieredPreview?.videoLoading || false}
                onCancel={() => tieredPreview?.cancelVideo()}
                isRaw={isRaw}
                error={tieredPreview?.videoError}
                requiresConfirmation={pendingRawConfirmation !== null}
                onConfirmRaw={handleConfirmRaw}
              />
            </div>

            {/* POSTER MODE — Single frame (default, appears instantly) */}
            {showPoster && tieredPreview?.poster?.posterUrl && (
              <div
                data-testid="poster-frame-container"
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <img
                  src={tieredPreview.poster.posterUrl}
                  alt={displayMetadata.filename || 'Preview'}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                  }}
                  draggable={false}
                />
              </div>
            )}

            {/* BURST MODE — Show current burst frame + thumbnail strip */}
            {showBurst && currentBurstUrl && (
              <>
                {/* Current burst frame as main display */}
                <div
                  data-testid="burst-frame-container"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <img
                    src={currentBurstUrl}
                    alt={`Frame ${(tieredPreview?.burstIndex || 0) + 1}`}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '100%',
                      objectFit: 'contain',
                    }}
                    draggable={false}
                  />
                </div>

                {/* Burst thumbnail strip at bottom */}
                <div
                  data-testid="burst-strip-container"
                  style={{
                    position: 'absolute',
                    bottom: '4.5rem', // Above transport bar
                    left: '1rem',
                    right: '1rem',
                  }}
                >
                  <BurstStrip
                    thumbnails={tieredPreview?.burst?.thumbnails || []}
                    selectedIndex={tieredPreview?.burstIndex || 0}
                    onSelectIndex={(index: number) => tieredPreview?.setBurstIndex?.(index)}
                    sourceDuration={tieredPreview?.burst?.sourceDuration || null}
                  />
                </div>
              </>
            )}

            {/* VIDEO MODE — Full playback (user-initiated only) */}
            {canPlayback && videoSrc && (
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
            )}

            {/* FALLBACK — Show metadata when no visual is available */}
            {!showPoster && !showBurst && !canPlayback && (
              <div
                data-testid="metadata-fallback"
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
                  </div>
                </div>
              </div>
            )}

            {/* Bottom-left metadata overlay — shown in video playback mode */}
            {canPlayback && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '4.5rem',
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

            {/* RAW Preview Disclaimer (shown when generating video for RAW) */}
            {isRaw && tieredPreview?.videoLoading && previewMode === 'video' && (
              <PreviewDisclaimer />
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
      {/* INC-CTRL-001: Transport controls must never disappear once preview is available */}
      {/* Controls may be disabled, but must always be VISIBLE when any preview tier exists */}
      {canShowTransportControls && (
        <TransportBar
          videoRef={videoRef}
          fps={fps}
          duration={duration}
          enabled={transportEnabled}
          sourceTimecodeStart={sourceMetadata?.sourceTimecodeStart}
          hasSourceTimecode={sourceMetadata?.hasSourceTimecode}
          // Clip navigation (v3)
          currentClip={currentClip}
          totalClips={totalClips}
          onPreviousClip={onPreviousClip}
          onNextClip={onNextClip}
          isFirstClip={isFirstClip}
          isLastClip={isLastClip}
          // Playback status label (v3 hardening)
          playbackDisabledLabel={playbackStatusLabel}
        />
      )}

      {/* Debug Overlay — DEV ONLY (FORGE_DEBUG_UI=true) */}
      {import.meta.env.DEV && import.meta.env.VITE_FORGE_DEBUG_UI === 'true' && state === 'source-loaded' && (
        <div
          data-testid="monitor-debug-overlay"
          style={{
            position: 'absolute',
            bottom: canShowTransportControls ? '4.5rem' : '0.5rem',
            left: '0.5rem',
            padding: '0.5rem',
            background: 'rgba(0, 0, 0, 0.85)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '4px',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.625rem',
            color: 'var(--text-muted)',
            lineHeight: 1.6,
            zIndex: 100,
          }}
        >
          <div>Transport: <span style={{ color: canShowTransportControls ? '#22c55e' : '#ef4444' }}>{canShowTransportControls ? 'VISIBLE' : 'HIDDEN'}</span></div>
          <div>Preview: <span style={{ color: previewMode === 'video' ? '#22c55e' : '#eab308' }}>{previewMode.toUpperCase()}</span></div>
          <div>Source: <span style={{ color: isRaw ? '#eab308' : '#22c55e' }}>{isRaw ? 'RAW' : 'NON-RAW'}</span></div>
          <div>Playback: <span style={{ color: transportEnabled ? '#22c55e' : '#ef4444' }}>{transportEnabled ? 'ENABLED' : 'DISABLED'}</span></div>
          <div>VideoLoaded: <span style={{ color: videoLoaded ? '#22c55e' : '#6b7280' }}>{videoLoaded ? 'YES' : 'NO'}</span></div>
        </div>
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
