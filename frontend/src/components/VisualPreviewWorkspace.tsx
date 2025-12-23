/**
 * VisualPreviewWorkspace — Single Source of Truth for Visual Preview
 * 
 * ALPHA CONSOLIDATION:
 * This is THE ONLY preview renderer in the application.
 * All visual overlays (timecode, text, image) render here.
 * Settings panels toggle features, but NEVER render their own previews.
 * 
 * Rule: If it's spatial, it renders in the preview workspace.
 * 
 * Features:
 * - Static preview frame (thumbnail from backend)
 * - Overlay rendering with drag-to-position
 * - Collapsible metadata strip
 * - Title-safe and action-safe guides
 * 
 * ALPHA LIMITATION: static preview frame only (no scrubbing)
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from './Button'
import { FEATURE_FLAGS } from '../config/featureFlags'
import { assertInvariant } from '../utils/invariants'
import type { OverlaySettings, ImageOverlay, TextOverlay } from './DeliverControlPanel'

// ============================================================================
// TYPES
// ============================================================================

interface SourceMetadata {
  resolution?: string
  fps?: string
  duration?: string
  codec?: string
  timecode_start?: string
  timecode_end?: string
  frames?: number
  container?: string
  audio_codec?: string
  audio_channels?: number
  reel_name?: string
  aspect_ratio?: string
}

// Compact output settings for header row
interface OutputSummary {
  codec?: string
  container?: string
  resolution?: string
  fps?: string
  audio_codec?: string
  audio_channels?: number
}

interface VisualPreviewWorkspaceProps {
  /** Source file path for display and thumbnail loading */
  sourceFilePath?: string
  /** Whether a source is loaded */
  hasSource?: boolean
  /** Callback to open the visual editor modal */
  onOpenVisualEditor?: () => void
  /** Backend URL for thumbnail fetching */
  backendUrl?: string
  /** Overlay settings for rendering */
  overlaySettings?: OverlaySettings
  /** Callback when overlay settings change (for drag positioning) */
  onOverlaySettingsChange?: (settings: OverlaySettings) => void
  /** Currently selected overlay type (legacy) */
  selectedOverlayType?: 'text' | 'image' | 'timecode' | null
  /** Currently selected text layer index (legacy) */
  selectedTextLayerIndex?: number | null
  /** Callback when an overlay is selected (legacy) */
  onOverlaySelect?: (type: 'text' | 'image' | 'timecode' | null, index?: number) => void
  /** Output summary for compact header row */
  outputSummary?: OutputSummary
  /** Phase 5A: Currently selected layer ID */
  selectedLayerId?: string | null
  /** Phase 5A: Callback when a layer is selected */
  onLayerSelect?: (layerId: string | null) => void
  /** Phase 5A: Read-only mode (for running/completed jobs) */
  isReadOnly?: boolean
}

// ============================================================================
// HELPER: Get anchor position in normalized coordinates
// ============================================================================

function getAnchorPosition(anchor: string): { x: number; y: number } {
  const positions: Record<string, { x: number; y: number }> = {
    'top_left': { x: 0.1, y: 0.1 },
    'top_center': { x: 0.5, y: 0.1 },
    'top_right': { x: 0.9, y: 0.1 },
    'center_left': { x: 0.1, y: 0.5 },
    'center': { x: 0.5, y: 0.5 },
    'center_right': { x: 0.9, y: 0.5 },
    'bottom_left': { x: 0.1, y: 0.9 },
    'bottom_center': { x: 0.5, y: 0.9 },
    'bottom_right': { x: 0.9, y: 0.9 },
    'custom': { x: 0.5, y: 0.5 },
  }
  return positions[anchor] || { x: 0.5, y: 0.5 }
}

// Clamp to title-safe area (10% inset)
function clampToTitleSafe(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.max(0.1, Math.min(0.9, x)),
    y: Math.max(0.1, Math.min(0.9, y)),
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

// Zoom preset options
const ZOOM_PRESETS = [
  { label: 'Fit', value: 'fit' },
  { label: '25%', value: 0.25 },
  { label: '50%', value: 0.5 },
  { label: '100%', value: 1 },
  { label: '200%', value: 2 },
] as const

export function VisualPreviewWorkspace({
  sourceFilePath,
  hasSource = false,
  onOpenVisualEditor,
  backendUrl = 'http://127.0.0.1:8085',
  overlaySettings,
  onOverlaySettingsChange,
  selectedOverlayType,
  selectedTextLayerIndex,
  onOverlaySelect,
  outputSummary,
  // Phase 5A: Layer-based selection
  selectedLayerId,
  onLayerSelect,
  isReadOnly = false,
}: VisualPreviewWorkspaceProps) {
  // Extract filename from path
  const fileName = sourceFilePath ? sourceFilePath.split('/').pop() : null
  
  // State
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)
  const [thumbnailLoading, setThumbnailLoading] = useState(false)
  const [metadata, setMetadata] = useState<SourceMetadata | null>(null)
  const [metadataExpanded, setMetadataExpanded] = useState(true)
  const [isDragging, setIsDragging] = useState(false)
  const [dragTarget, setDragTarget] = useState<{ type: 'text' | 'image' | 'timecode' | 'layer'; index?: number; layerId?: string } | null>(null)
  
  // Zoom state
  const [zoom, setZoom] = useState<number | 'fit'>('fit')
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })
  
  // Safe area guides visibility
  const [showTitleSafe, setShowTitleSafe] = useState(true)
  const [showActionSafe, setShowActionSafe] = useState(true)
  const [showCenterCross, setShowCenterCross] = useState(false)
  
  // Video playback state
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null)
  const [previewStatus, setPreviewStatus] = useState<'idle' | 'generating' | 'ready' | 'error'>('idle')
  const [previewProgress, setPreviewProgress] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  
  // Refs
  const canvasRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  // ALPHA LIMITATION: static preview frame only (no scrubbing)
  // Auto-load preview when source changes
  useEffect(() => {
    if (!sourceFilePath || !hasSource) {
      setThumbnailUrl(null)
      setMetadata(null)
      return
    }

    let cancelled = false
    
    const fetchThumbnail = async () => {
      setThumbnailLoading(true)
      try {
        const response = await fetch(`${backendUrl}/preview/thumbnail`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source_path: sourceFilePath, frame: 0 }),
        })
        
        if (!cancelled && response.ok) {
          const blob = await response.blob()
          const url = URL.createObjectURL(blob)
          setThumbnailUrl(prev => {
            if (prev) URL.revokeObjectURL(prev)
            return url
          })
        }
      } catch (err) {
        console.warn('Thumbnail fetch error:', err)
      } finally {
        if (!cancelled) setThumbnailLoading(false)
      }
    }

    const fetchMetadata = async () => {
      try {
        const response = await fetch(`${backendUrl}/metadata/extract`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source_path: sourceFilePath }),
        })
        
        if (!cancelled && response.ok) {
          const data = await response.json()
          setMetadata({
            resolution: data.width && data.height ? `${data.width}×${data.height}` : undefined,
            fps: data.frame_rate,
            duration: data.duration,
            codec: data.video_codec,
            timecode_start: data.timecode_start,
            reel_name: data.reel_name,
          })
        }
      } catch (err) {
        console.warn('Metadata fetch error:', err)
      }
    }

    fetchThumbnail()
    fetchMetadata()

    return () => {
      cancelled = true
    }
  }, [sourceFilePath, hasSource, backendUrl])

  // Cleanup thumbnail URL on unmount
  useEffect(() => {
    return () => {
      if (thumbnailUrl) URL.revokeObjectURL(thumbnailUrl)
    }
  }, [])

  // ============================================
  // Preview Video Generation & Polling
  // ============================================
  
  useEffect(() => {
    if (!sourceFilePath || !hasSource) {
      setPreviewVideoUrl(null)
      setPreviewStatus('idle')
      setPreviewProgress(0)
      return
    }

    let cancelled = false
    let pollInterval: ReturnType<typeof setInterval> | null = null
    
    const checkPreviewStatus = async () => {
      try {
        const response = await fetch(`${backendUrl}/preview/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source_path: sourceFilePath }),
        })
        
        if (cancelled) return
        
        if (response.ok) {
          const data = await response.json()
          
          if (data.status === 'ready') {
            setPreviewStatus('ready')
            setPreviewProgress(100)
            // Build the stream URL
            const streamUrl = `${backendUrl}/preview/stream?source_path=${encodeURIComponent(sourceFilePath)}`
            setPreviewVideoUrl(streamUrl)
            if (pollInterval) {
              clearInterval(pollInterval)
              pollInterval = null
            }
          } else if (data.status === 'generating') {
            setPreviewStatus('generating')
            setPreviewProgress(data.progress || 0)
          } else if (data.status === 'error') {
            setPreviewStatus('error')
            if (pollInterval) {
              clearInterval(pollInterval)
              pollInterval = null
            }
          }
        }
      } catch (err) {
        console.warn('Preview status check error:', err)
      }
    }
    
    // Initial check
    checkPreviewStatus()
    
    // Poll every 500ms while generating
    pollInterval = setInterval(() => {
      if (!cancelled) {
        checkPreviewStatus()
      }
    }, 500)
    
    return () => {
      cancelled = true
      if (pollInterval) {
        clearInterval(pollInterval)
      }
    }
  }, [sourceFilePath, hasSource, backendUrl])

  // Video playback controls
  const handlePlayPause = useCallback(() => {
    if (!videoRef.current) return
    if (isPlaying) {
      videoRef.current.pause()
    } else {
      videoRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }, [isPlaying])

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime)
    }
  }, [])

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration)
    }
  }, [])

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value)
    if (videoRef.current) {
      videoRef.current.currentTime = time
      setCurrentTime(time)
    }
  }, [])

  const handleVideoEnded = useCallback(() => {
    setIsPlaying(false)
    if (videoRef.current) {
      videoRef.current.currentTime = 0
      setCurrentTime(0)
    }
  }, [])

  const formatTimecode = useCallback((seconds: number): string => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    const f = Math.floor((seconds % 1) * 24) // Assume 24fps for display
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`
  }, [])

  // ============================================
  // Drag-to-position handlers
  // ============================================

  // Phase 5A: Handle layer mouse down for new layer system
  const handleLayerMouseDown = useCallback((
    e: React.MouseEvent,
    layerId: string
  ) => {
    if (isReadOnly) return
    
    // Hardening: Assert layer is selected before editing
    assertInvariant(
      layerId != null && layerId.length > 0,
      'OVERLAY_DRAG_NO_LAYER',
      'Overlay drag attempted with no layer ID',
      { component: 'VisualPreviewWorkspace', layerId }
    )
    
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
    setDragTarget({ type: 'layer', layerId })
    onLayerSelect?.(layerId)
  }, [isReadOnly, onLayerSelect])

  const handleMouseDown = useCallback((
    e: React.MouseEvent,
    type: 'text' | 'image' | 'timecode',
    index?: number
  ) => {
    if (isReadOnly) return
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
    setDragTarget({ type, index })
    onOverlaySelect?.(type, index)
  }, [isReadOnly, onOverlaySelect])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !dragTarget || !canvasRef.current || !overlaySettings || !onOverlaySettingsChange) return
    if (isReadOnly) return
    
    const rect = canvasRef.current.getBoundingClientRect()
    const rawX = (e.clientX - rect.left) / rect.width
    const rawY = (e.clientY - rect.top) / rect.height
    
    // Clamp to title-safe area
    const { x, y } = clampToTitleSafe(rawX, rawY)
    
    const newSettings = { ...overlaySettings }
    
    // Phase 5A: Handle layer-based dragging
    if (dragTarget.type === 'layer' && dragTarget.layerId && newSettings.layers) {
      const layers = [...newSettings.layers]
      const layerIndex = layers.findIndex(l => l.id === dragTarget.layerId)
      if (layerIndex !== -1) {
        const layer = layers[layerIndex]
        layers[layerIndex] = {
          ...layer,
          settings: {
            ...layer.settings,
            x,
            y,
            position: 'custom',
          }
        }
        newSettings.layers = layers
      }
    } else if (dragTarget.type === 'text' && dragTarget.index !== undefined) {
      const layers = [...newSettings.text_layers]
      layers[dragTarget.index] = {
        ...layers[dragTarget.index],
        x,
        y,
        position: 'custom',
      }
      newSettings.text_layers = layers
    } else if (dragTarget.type === 'image' && newSettings.image_watermark) {
      newSettings.image_watermark = { ...newSettings.image_watermark, x, y }
    } else if (dragTarget.type === 'timecode' && newSettings.timecode_overlay) {
      newSettings.timecode_overlay = { ...newSettings.timecode_overlay, x, y, position: 'custom' }
    }
    
    onOverlaySettingsChange(newSettings)
  }, [isDragging, dragTarget, overlaySettings, onOverlaySettingsChange, isReadOnly])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
    setDragTarget(null)
    setIsPanning(false)
  }, [])

  useEffect(() => {
    if (isDragging || isPanning) {
      const handleGlobalMouseUp = () => {
        setIsDragging(false)
        setDragTarget(null)
        setIsPanning(false)
      }
      window.addEventListener('mouseup', handleGlobalMouseUp)
      return () => window.removeEventListener('mouseup', handleGlobalMouseUp)
    }
  }, [isDragging, isPanning])

  // Wheel zoom handler - zoom follows mouse cursor
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    
    if (!canvasRef.current) return
    
    const rect = canvasRef.current.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    
    // Calculate normalized mouse position (0-1)
    const normX = mouseX / rect.width
    const normY = mouseY / rect.height
    
    setZoom(prevZoom => {
      const currentZoom = prevZoom === 'fit' ? 1 : prevZoom
      const delta = e.deltaY > 0 ? 0.9 : 1.1 // Scroll down = zoom out, up = zoom in
      const newZoom = Math.max(0.25, Math.min(4, currentZoom * delta))
      
      // Adjust pan to keep mouse position stable
      if (newZoom !== currentZoom) {
        const zoomDelta = newZoom / currentZoom
        setPanOffset(prev => ({
          x: normX - (normX - prev.x) * zoomDelta,
          y: normY - (normY - prev.y) * zoomDelta,
        }))
      }
      
      return newZoom
    })
  }, [])
  
  // Middle mouse button pan
  const handleMouseDownPan = useCallback((e: React.MouseEvent) => {
    // Middle mouse button (button 1) for panning
    if (e.button === 1) {
      e.preventDefault()
      setIsPanning(true)
      setPanStart({ x: e.clientX - panOffset.x * 100, y: e.clientY - panOffset.y * 100 })
    }
  }, [panOffset])
  
  const handleMouseMovePan = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setPanOffset({
        x: (e.clientX - panStart.x) / 100,
        y: (e.clientY - panStart.y) / 100,
      })
    }
  }, [isPanning, panStart])

  const extendedImageOverlay = overlaySettings?.image_watermark as (ImageOverlay & { scale?: number; grayscale?: boolean }) | undefined

  // Reset zoom/pan when source changes
  useEffect(() => {
    setZoom('fit')
    setPanOffset({ x: 0, y: 0 })
  }, [sourceFilePath])

  return (
    <div
      data-testid="visual-preview-workspace"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        background: 'var(--card-bg-solid, rgba(16, 18, 20, 0.98))',
      }}
    >
      {/* Source Timecode Bar */}
      {hasSource && metadata?.timecode_start && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0.375rem 0.75rem',
            background: 'rgba(0, 0, 0, 0.4)',
            borderBottom: '1px solid var(--border-primary)',
          }}
        >
          <span style={{
            fontSize: '1rem',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-primary)',
            fontWeight: 600,
            letterSpacing: '0.05em',
          }}>
            {metadata.timecode_start}
          </span>
          {metadata.fps && (
            <span style={{
              fontSize: '0.625rem',
              color: 'var(--text-muted)',
              marginLeft: '0.75rem',
            }}>
              @ {metadata.fps} fps
            </span>
          )}
        </div>
      )}

      {/* Header with Zoom Controls */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.5rem 0.75rem',
          borderBottom: '1px solid var(--border-primary)',
          background: 'rgba(26, 32, 44, 0.6)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
            }}
          >
            Preview
          </span>
          {fileName && (
            <span
              style={{
                fontSize: '0.6875rem',
                color: 'var(--text-muted)',
                maxWidth: '200px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              — {fileName}
            </span>
          )}
        </div>
        
        {/* Zoom & Guide Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {/* Zoom presets */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            {ZOOM_PRESETS.map(preset => (
              <button
                key={preset.label}
                onClick={() => {
                  if (preset.value === 'fit') {
                    setZoom('fit')
                    setPanOffset({ x: 0, y: 0 })
                  } else {
                    setZoom(preset.value)
                  }
                }}
                style={{
                  padding: '0.25rem 0.375rem',
                  fontSize: '0.625rem',
                  fontFamily: 'var(--font-mono)',
                  background: zoom === preset.value ? 'var(--button-primary-bg)' : 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-sm)',
                  color: zoom === preset.value ? '#fff' : 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
          
          {/* Guide toggles */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginLeft: '0.5rem' }}>
            <button
              onClick={() => setShowTitleSafe(!showTitleSafe)}
              title="Title Safe (10%)"
              style={{
                padding: '0.25rem 0.375rem',
                fontSize: '0.5rem',
                background: showTitleSafe ? 'rgba(251, 191, 36, 0.2)' : 'rgba(255,255,255,0.05)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-sm)',
                color: showTitleSafe ? 'rgb(251, 191, 36)' : 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              TS
            </button>
            <button
              onClick={() => setShowActionSafe(!showActionSafe)}
              title="Action Safe (5%)"
              style={{
                padding: '0.25rem 0.375rem',
                fontSize: '0.5rem',
                background: showActionSafe ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.05)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-sm)',
                color: showActionSafe ? 'rgb(59, 130, 246)' : 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              AS
            </button>
            <button
              onClick={() => setShowCenterCross(!showCenterCross)}
              title="Center Cross"
              style={{
                padding: '0.25rem 0.375rem',
                fontSize: '0.5rem',
                background: showCenterCross ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255,255,255,0.05)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-sm)',
                color: showCenterCross ? 'rgb(34, 197, 94)' : 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              +
            </button>
          </div>
          
          {onOpenVisualEditor && hasSource && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onOpenVisualEditor}
              data-testid="open-visual-editor-btn"
              style={{ marginLeft: '0.5rem' }}
            >
              Edit Overlays
            </Button>
          )}
        </div>
      </div>

      {/* Preview Area - Resizes with panel */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          padding: '1rem',
          minHeight: 0, // Important for flex shrinking
        }}
      >
        {/* 16:9 Preview Container with Zoom/Pan */}
        <div
          ref={canvasRef}
          data-testid="preview-viewport-container"
          onMouseDown={handleMouseDownPan}
          onMouseMove={(e) => { handleMouseMove(e); handleMouseMovePan(e); }}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          style={{
            position: 'relative',
            width: zoom === 'fit' ? '100%' : `${(zoom as number) * 100}%`,
            maxWidth: zoom === 'fit' ? '100%' : 'none',
            aspectRatio: '16 / 9',
            transform: zoom !== 'fit' ? `translate(${panOffset.x * 50}px, ${panOffset.y * 50}px)` : undefined,
            background: 'linear-gradient(135deg, rgba(30, 35, 45, 0.9) 0%, rgba(20, 24, 30, 0.95) 100%)',
            borderRadius: 'var(--radius-md, 6px)',
            border: '1px solid var(--border-primary)',
            overflow: 'hidden',
            cursor: isPanning ? 'grabbing' : isDragging ? 'grabbing' : 'default',
            transition: zoom === 'fit' ? 'width 0.2s ease' : undefined,
          }}
        >
          {/* Video element for playback */}
          {previewVideoUrl && previewStatus === 'ready' && (
            <video
              ref={videoRef}
              src={previewVideoUrl}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={handleVideoEnded}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'contain',
              }}
              playsInline
              muted={false}
            />
          )}
          
          {/* Fallback thumbnail when video not ready */}
          {thumbnailUrl && previewStatus !== 'ready' && (
            <img
              src={thumbnailUrl}
              alt="Preview thumbnail"
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'contain',
              }}
            />
          )}
          
          {/* Preview generation progress */}
          {previewStatus === 'generating' && (
            <div style={{
              position: 'absolute',
              bottom: '0.75rem',
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.375rem 0.75rem',
              background: 'rgba(0, 0, 0, 0.8)',
              borderRadius: 'var(--radius-sm)',
              zIndex: 30,
            }}>
              <div style={{
                width: '100px',
                height: '4px',
                background: 'rgba(255, 255, 255, 0.2)',
                borderRadius: '2px',
                overflow: 'hidden',
              }}>
                <div style={{
                  width: `${previewProgress}%`,
                  height: '100%',
                  background: 'var(--button-primary-bg)',
                  transition: 'width 0.2s ease',
                }} />
              </div>
              <span style={{ fontSize: '0.625rem', color: 'var(--text-muted)' }}>
                Generating preview...
              </span>
            </div>
          )}

          {/* Loading indicator */}
          {thumbnailLoading && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              Loading preview...
            </div>
          )}

          {/* Empty state when no source */}
          {!hasSource && !thumbnailLoading && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', color: 'var(--text-dim)' }}>
              <div style={{ fontSize: '3rem', opacity: 0.2 }}>📁</div>
              <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>No Source Selected</div>
              <div style={{ fontSize: '0.75rem', opacity: 0.7, textAlign: 'center', maxWidth: '280px' }}>
                Add source files in the left panel to preview
              </div>
            </div>
          )}

          {/* Placeholder when thumbnail not loaded but source exists */}
          {hasSource && !thumbnailUrl && !thumbnailLoading && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '3rem', opacity: 0.3 }}>🎬</div>
              <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>Preview Placeholder</div>
              <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                {/* ALPHA LIMITATION: static preview frame only */}
                Frame preview loading...
              </div>
            </div>
          )}

          {/* Safe Area Guides - Toggleable */}
          {hasSource && (
            <>
              {/* Title Safe (10% inset) */}
              {showTitleSafe && (
                <div style={{ position: 'absolute', inset: '10%', border: '1px dashed rgba(251, 191, 36, 0.4)', borderRadius: '2px', pointerEvents: 'none' }} />
              )}
              {/* Action Safe (5% inset) */}
              {showActionSafe && (
                <div style={{ position: 'absolute', inset: '5%', border: '1px dashed rgba(59, 130, 246, 0.3)', borderRadius: '2px', pointerEvents: 'none' }} />
              )}
              {/* Center Cross */}
              {showCenterCross && (
                <>
                  <div style={{ position: 'absolute', left: '50%', top: '40%', height: '20%', width: '1px', background: 'rgba(34, 197, 94, 0.5)', pointerEvents: 'none' }} />
                  <div style={{ position: 'absolute', top: '50%', left: '40%', width: '20%', height: '1px', background: 'rgba(34, 197, 94, 0.5)', pointerEvents: 'none' }} />
                </>
              )}
            </>
          )}

          {/* ============================================ */}
          {/* OVERLAY RENDERING — Single Source of Truth */}
          {/* ============================================ */}

          {/* Phase 5A: Render layers sorted by order (higher order = on top) */}
          {overlaySettings?.layers && [...overlaySettings.layers]
            .filter(layer => layer.enabled)
            .sort((a, b) => a.order - b.order)
            .map(layer => {
              const pos = layer.settings.position === 'custom' && layer.settings.x !== undefined && layer.settings.y !== undefined
                ? { x: layer.settings.x, y: layer.settings.y }
                : getAnchorPosition(layer.settings.position || 'center')
              const isSelected = layer.id === selectedLayerId
              const zIndex = isSelected ? 30 : 10 + layer.order
              
              // Render based on layer type
              if (layer.type === 'text') {
                return (
                  <div
                    key={layer.id}
                    data-testid={`overlay-layer-${layer.id}`}
                    onMouseDown={(e) => handleLayerMouseDown(e, layer.id)}
                    style={{
                      position: 'absolute',
                      left: `${pos.x * 100}%`,
                      top: `${pos.y * 100}%`,
                      transform: 'translate(-50%, -50%)',
                      padding: '0.25rem 0.5rem',
                      backgroundColor: layer.settings.background 
                        ? (layer.settings.background_color || 'rgba(0, 0, 0, 0.6)') 
                        : 'rgba(0, 0, 0, 0.6)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: `${(layer.settings.font_size || 24) * 0.5}px`,
                      fontFamily: layer.settings.font || 'Arial, sans-serif',
                      color: layer.settings.color || 'white',
                      opacity: layer.settings.opacity || 1,
                      cursor: isReadOnly ? 'default' : 'move',
                      border: isSelected ? '2px solid var(--button-primary-bg)' : '2px solid transparent',
                      boxShadow: isSelected ? '0 0 8px rgba(59, 130, 246, 0.5)' : 'none',
                      whiteSpace: 'nowrap',
                      textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                      userSelect: 'none',
                      zIndex,
                    }}
                  >
                    {layer.settings.text || 'Text Layer'}
                  </div>
                )
              }
              
              if (layer.type === 'image') {
                return (
                  <div
                    key={layer.id}
                    data-testid={`overlay-layer-${layer.id}`}
                    onMouseDown={(e) => handleLayerMouseDown(e, layer.id)}
                    style={{
                      position: 'absolute',
                      left: `${pos.x * 100}%`,
                      top: `${pos.y * 100}%`,
                      transform: 'translate(-50%, -50%)',
                      cursor: isReadOnly ? 'default' : 'move',
                      border: isSelected ? '2px solid var(--button-primary-bg)' : '2px solid transparent',
                      boxShadow: isSelected ? '0 0 8px rgba(59, 130, 246, 0.5)' : 'none',
                      borderRadius: 'var(--radius-sm)',
                      padding: '2px',
                      userSelect: 'none',
                      zIndex,
                    }}
                  >
                    {layer.settings.image_data ? (
                      <img
                        src={layer.settings.image_data}
                        alt=""
                        draggable={false}
                        style={{
                          maxWidth: `${(layer.settings.scale || 1.0) * 100}px`,
                          maxHeight: `${(layer.settings.scale || 1.0) * 75}px`,
                          opacity: layer.settings.opacity || 1,
                          filter: layer.settings.grayscale ? 'grayscale(100%)' : 'none',
                          borderRadius: '2px',
                          pointerEvents: 'none',
                        }}
                      />
                    ) : (
                      <div style={{ 
                        width: '60px', 
                        height: '45px', 
                        background: 'rgba(51, 65, 85, 0.5)', 
                        borderRadius: '2px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.5rem',
                        opacity: 0.5,
                      }}>
                        🖼
                      </div>
                    )}
                  </div>
                )
              }
              
              if (layer.type === 'timecode') {
                return (
                  <div
                    key={layer.id}
                    data-testid={`overlay-layer-${layer.id}`}
                    onMouseDown={(e) => handleLayerMouseDown(e, layer.id)}
                    style={{
                      position: 'absolute',
                      left: `${pos.x * 100}%`,
                      top: `${pos.y * 100}%`,
                      transform: 'translate(-50%, -50%)',
                      padding: layer.settings.background ? '0.25rem 0.5rem' : '0',
                      backgroundColor: layer.settings.background ? 'rgba(0, 0, 0, 0.7)' : 'transparent',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: `${(layer.settings.font_size || 24) * 0.5}px`,
                      fontFamily: layer.settings.font || 'Menlo, monospace',
                      color: layer.settings.color || 'white',
                      opacity: layer.settings.opacity || 1,
                      cursor: isReadOnly ? 'default' : 'move',
                      border: isSelected ? '2px solid var(--button-primary-bg)' : '2px solid transparent',
                      boxShadow: isSelected ? '0 0 8px rgba(59, 130, 246, 0.5)' : 'none',
                      whiteSpace: 'nowrap',
                      textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                      letterSpacing: '0.05em',
                      userSelect: 'none',
                      zIndex,
                    }}
                  >
                    {metadata?.timecode_start || '00:00:00:00'}
                  </div>
                )
              }
              
              if (layer.type === 'metadata') {
                return (
                  <div
                    key={layer.id}
                    data-testid={`overlay-layer-${layer.id}`}
                    onMouseDown={(e) => handleLayerMouseDown(e, layer.id)}
                    style={{
                      position: 'absolute',
                      left: `${pos.x * 100}%`,
                      top: `${pos.y * 100}%`,
                      transform: 'translate(-50%, -50%)',
                      padding: '0.25rem 0.5rem',
                      backgroundColor: 'rgba(0, 0, 0, 0.6)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: `${(layer.settings.font_size || 16) * 0.5}px`,
                      fontFamily: 'Menlo, monospace',
                      color: 'white',
                      opacity: layer.settings.opacity || 1,
                      cursor: isReadOnly ? 'default' : 'move',
                      border: isSelected ? '2px solid var(--button-primary-bg)' : '2px solid transparent',
                      boxShadow: isSelected ? '0 0 8px rgba(59, 130, 246, 0.5)' : 'none',
                      whiteSpace: 'nowrap',
                      textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                      userSelect: 'none',
                      zIndex,
                    }}
                  >
                    {layer.settings.metadata_field === 'filename' && fileName}
                    {layer.settings.metadata_field === 'resolution' && metadata?.resolution}
                    {layer.settings.metadata_field === 'fps' && metadata?.fps}
                    {layer.settings.metadata_field === 'codec' && metadata?.codec}
                    {layer.settings.metadata_field === 'reel' && metadata?.reel_name}
                    {!layer.settings.metadata_field && 'Metadata'}
                  </div>
                )
              }
              
              return null
            })}

          {/* Legacy Text Overlay Layers */}
          {overlaySettings?.text_layers.map((layer, index) => {
            if (!layer.enabled) return null
            const pos = layer.position === 'custom' && layer.x !== undefined && layer.y !== undefined
              ? { x: layer.x, y: layer.y }
              : getAnchorPosition(layer.position)
            const isSelected = selectedOverlayType === 'text' && selectedTextLayerIndex === index
            // Type assertion for extended properties
            const extLayer = layer as TextOverlay & { font?: string; color?: string; background?: boolean; background_color?: string; background_opacity?: number }
            
            return (
              <div
                key={`text-${index}`}
                data-testid={`overlay-text-${index}`}
                onMouseDown={(e) => handleMouseDown(e, 'text', index)}
                style={{
                  position: 'absolute',
                  left: `${pos.x * 100}%`,
                  top: `${pos.y * 100}%`,
                  transform: 'translate(-50%, -50%)',
                  padding: '0.25rem 0.5rem',
                  backgroundColor: extLayer.background 
                    ? (extLayer.background_color || 'rgba(0, 0, 0, 0.6)') 
                    : 'rgba(0, 0, 0, 0.6)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: `${layer.font_size * 0.5}px`,
                  fontFamily: extLayer.font || 'Arial, sans-serif',
                  color: extLayer.color || 'white',
                  opacity: layer.opacity,
                  cursor: 'move',
                  border: isSelected ? '2px solid var(--button-primary-bg)' : '2px solid transparent',
                  boxShadow: isSelected ? '0 0 8px rgba(59, 130, 246, 0.5)' : 'none',
                  whiteSpace: 'nowrap',
                  textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                  userSelect: 'none',
                  zIndex: isSelected ? 20 : 10,
                }}
              >
                {layer.text || `Text Layer ${index + 1}`}
              </div>
            )
          })}

          {/* Image Overlay (Watermark) */}
          {overlaySettings?.image_watermark?.enabled && overlaySettings.image_watermark.image_data && (
            <div
              data-testid="overlay-image"
              onMouseDown={(e) => handleMouseDown(e, 'image')}
              style={{
                position: 'absolute',
                left: `${overlaySettings.image_watermark.x * 100}%`,
                top: `${overlaySettings.image_watermark.y * 100}%`,
                transform: 'translate(-50%, -50%)',
                cursor: 'move',
                border: selectedOverlayType === 'image' ? '2px solid var(--button-primary-bg)' : '2px solid transparent',
                boxShadow: selectedOverlayType === 'image' ? '0 0 8px rgba(59, 130, 246, 0.5)' : 'none',
                borderRadius: 'var(--radius-sm)',
                padding: '2px',
                userSelect: 'none',
                zIndex: selectedOverlayType === 'image' ? 20 : 10,
              }}
            >
              <img
                src={overlaySettings.image_watermark.image_data}
                alt=""
                draggable={false}
                style={{
                  maxWidth: `${(extendedImageOverlay?.scale || 1.0) * 100}px`,
                  maxHeight: `${(extendedImageOverlay?.scale || 1.0) * 75}px`,
                  opacity: overlaySettings.image_watermark.opacity,
                  filter: extendedImageOverlay?.grayscale ? 'grayscale(100%)' : 'none',
                  borderRadius: '2px',
                  pointerEvents: 'none',
                }}
              />
            </div>
          )}

          {/* Timecode Overlay */}
          {overlaySettings?.timecode_overlay?.enabled && (() => {
            const tc = overlaySettings.timecode_overlay!
            const pos = tc.position === 'custom' && tc.x !== undefined && tc.y !== undefined
              ? { x: tc.x, y: tc.y }
              : getAnchorPosition(tc.position)
            const isSelected = selectedOverlayType === 'timecode'
            
            return (
              <div
                data-testid="overlay-timecode"
                onMouseDown={(e) => handleMouseDown(e, 'timecode')}
                style={{
                  position: 'absolute',
                  left: `${pos.x * 100}%`,
                  top: `${pos.y * 100}%`,
                  transform: 'translate(-50%, -50%)',
                  padding: tc.background ? '0.25rem 0.5rem' : '0',
                  backgroundColor: tc.background ? 'rgba(0, 0, 0, 0.7)' : 'transparent',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: `${tc.font_size * 0.5}px`,
                  fontFamily: tc.font || 'Menlo, monospace',
                  color: 'white',
                  opacity: tc.opacity,
                  cursor: 'move',
                  border: isSelected ? '2px solid var(--button-primary-bg)' : '2px solid transparent',
                  boxShadow: isSelected ? '0 0 8px rgba(59, 130, 246, 0.5)' : 'none',
                  whiteSpace: 'nowrap',
                  textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                  letterSpacing: '0.05em',
                  userSelect: 'none',
                  zIndex: isSelected ? 20 : 10,
                }}
              >
                {metadata?.timecode_start || '00:00:00:00'}
              </div>
            )
          })()}
        </div>

        {/* ============================================ */}
        {/* Playback Controls — Below Preview */}
        {/* ============================================ */}
        {hasSource && previewStatus === 'ready' && (
          <div
            data-testid="playback-controls"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              marginTop: '0.75rem',
              padding: '0.5rem 0.75rem',
              background: 'rgba(26, 32, 44, 0.6)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-secondary)',
              width: '100%',
              maxWidth: '960px',
            }}
          >
            {/* Play/Pause Button */}
            <button
              onClick={handlePlayPause}
              data-testid="play-pause-btn"
              style={{
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--button-primary-bg)',
                border: 'none',
                borderRadius: '50%',
                color: 'white',
                cursor: 'pointer',
                fontSize: '0.875rem',
              }}
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? '⏸' : '▶'}
            </button>

            {/* Current Time */}
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              color: 'var(--text-primary)',
              minWidth: '90px',
            }}>
              {formatTimecode(currentTime)}
            </span>

            {/* Scrub Bar */}
            <input
              type="range"
              min={0}
              max={duration || 1}
              step={0.001}
              value={currentTime}
              onChange={handleSeek}
              data-testid="scrub-bar"
              style={{
                flex: 1,
                height: '4px',
                background: `linear-gradient(to right, var(--button-primary-bg) ${(currentTime / (duration || 1)) * 100}%, rgba(255,255,255,0.2) ${(currentTime / (duration || 1)) * 100}%)`,
                borderRadius: '2px',
                cursor: 'pointer',
                appearance: 'none',
                WebkitAppearance: 'none',
              }}
            />

            {/* Duration */}
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
              minWidth: '90px',
              textAlign: 'right',
            }}>
              {formatTimecode(duration)}
            </span>
          </div>
        )}

        {/* ============================================ */}
        {/* Metadata Strip — Collapsible */}
        {/* ============================================ */}
        {hasSource && (
          <div data-testid="metadata-strip" style={{ marginTop: '0.75rem', width: '100%', maxWidth: '960px' }}>
            <button
              onClick={() => setMetadataExpanded(!metadataExpanded)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.375rem 0.75rem',
                background: 'rgba(26, 32, 44, 0.6)',
                borderRadius: metadataExpanded ? 'var(--radius-sm) var(--radius-sm) 0 0' : 'var(--radius-sm)',
                border: '1px solid var(--border-secondary)',
                borderBottom: metadataExpanded ? 'none' : '1px solid var(--border-secondary)',
                cursor: 'pointer',
                color: 'var(--text-muted)',
              }}
            >
              <span style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                Source Metadata
              </span>
              <span style={{ fontSize: '0.625rem', transform: metadataExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
                ▼
              </span>
            </button>
            
            {metadataExpanded && (
              <div style={{
                padding: '0.5rem 0.75rem',
                background: 'rgba(26, 32, 44, 0.4)',
                borderRadius: '0 0 var(--radius-sm) var(--radius-sm)',
                border: '1px solid var(--border-secondary)',
                borderTop: 'none',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '1rem',
                fontSize: '0.6875rem',
                color: 'var(--text-muted)',
              }}>
                <div><span style={{ color: 'var(--text-dim)', marginRight: '0.25rem' }}>Resolution:</span><span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{metadata?.resolution || '—'}</span></div>
                <div><span style={{ color: 'var(--text-dim)', marginRight: '0.25rem' }}>Aspect Ratio:</span><span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{metadata?.aspect_ratio || '—'}</span></div>
                <div><span style={{ color: 'var(--text-dim)', marginRight: '0.25rem' }}>FPS:</span><span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{metadata?.fps || '—'}</span></div>
                <div><span style={{ color: 'var(--text-dim)', marginRight: '0.25rem' }}>Duration:</span><span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{metadata?.duration || '—'}</span></div>
                {metadata?.frames && <div><span style={{ color: 'var(--text-dim)', marginRight: '0.25rem' }}>Frames:</span><span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{metadata.frames}</span></div>}
                <div><span style={{ color: 'var(--text-dim)', marginRight: '0.25rem' }}>Container:</span><span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{metadata?.container || '—'}</span></div>
                <div><span style={{ color: 'var(--text-dim)', marginRight: '0.25rem' }}>Codec:</span><span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{metadata?.codec || '—'}</span></div>
                {metadata?.timecode_start && <div><span style={{ color: 'var(--text-dim)', marginRight: '0.25rem' }}>TC Start:</span><span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{metadata.timecode_start}</span></div>}
                {metadata?.timecode_end && <div><span style={{ color: 'var(--text-dim)', marginRight: '0.25rem' }}>TC End:</span><span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{metadata.timecode_end}</span></div>}
                <div><span style={{ color: 'var(--text-dim)', marginRight: '0.25rem' }}>Audio Codec:</span><span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{metadata?.audio_codec || '—'}</span></div>
                {metadata?.audio_channels && <div><span style={{ color: 'var(--text-dim)', marginRight: '0.25rem' }}>Audio Ch:</span><span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{metadata.audio_channels}</span></div>}
                {metadata?.reel_name && <div><span style={{ color: 'var(--text-dim)', marginRight: '0.25rem' }}>Reel:</span><span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{metadata.reel_name}</span></div>}
              </div>
            )}
          </div>
        )}

        {/* ============================================ */}
        {/* Output Settings Strip - PHASE 0: Disabled behind feature flag */}
        {/* ============================================ */}
        {FEATURE_FLAGS.OUTPUT_SETTINGS_STRIP_ENABLED && outputSummary && (outputSummary.codec || outputSummary.container) && (
          <div data-testid="output-settings-strip" style={{ marginTop: '0.5rem', width: '100%', maxWidth: '960px' }}>
            <div
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.375rem 0.75rem',
                background: 'rgba(59, 130, 246, 0.15)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
              }}
            >
              <span style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-secondary)' }}>
                Output Settings
              </span>
              <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                {outputSummary.codec && <span><span style={{ color: 'var(--text-dim)' }}>Codec:</span> {outputSummary.codec}</span>}
                {outputSummary.container && <span><span style={{ color: 'var(--text-dim)' }}>Container:</span> {outputSummary.container.toUpperCase()}</span>}
                {outputSummary.resolution && <span><span style={{ color: 'var(--text-dim)' }}>Res:</span> {outputSummary.resolution}</span>}
                {outputSummary.fps && <span><span style={{ color: 'var(--text-dim)' }}>FPS:</span> {outputSummary.fps}</span>}
                {outputSummary.audio_codec && <span><span style={{ color: 'var(--text-dim)' }}>Audio:</span> {outputSummary.audio_codec}</span>}
                {outputSummary.audio_channels && <span><span style={{ color: 'var(--text-dim)' }}>Ch:</span> {outputSummary.audio_channels}</span>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default VisualPreviewWorkspace
