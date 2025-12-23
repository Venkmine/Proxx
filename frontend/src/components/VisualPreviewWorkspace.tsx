/**
 * VisualPreviewWorkspace — Single Source of Truth for Visual Preview
 * 
 * MULTIMODAL WORKSPACE:
 * This is THE primary interaction surface for the application.
 * Supports three modes:
 * - View: Playback and viewing only
 * - Overlays: Direct manipulation of overlays (drag, scale, position)
 * - Burn-In: Data burn-in preview and editing
 * 
 * Side panels are INSPECTORS ONLY. All spatial editing happens here.
 * 
 * Features:
 * - Static preview frame (thumbnail from backend)
 * - Video playback with controls
 * - Overlay rendering with drag-to-position
 * - Collapsible metadata strip
 * - Title-safe and action-safe guides
 * - Fullscreen support
 * 
 * Phase 9C: Burn-in preview parity
 * - Burn-in overlays use BURNIN_FONTS for FFmpeg-representative rendering
 * - Font constants are representative, NOT pixel-identical to FFmpeg
 * - See constants/burnin.ts for parity documentation
 * 
 * Phase 9D: Mode interaction boundaries
 * - All interactions gated through canInteractWithOverlay()
 * - View mode: no overlay interactions
 * - Overlays mode: full overlay editing
 * - Burn-in mode: only burn-in overlays editable
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from './Button'
import { FEATURE_FLAGS } from '../config/featureFlags'
import { assertInvariant, assertPreviewTransformUsed, assertModeInteractionAllowed } from '../utils/invariants'
import * as PreviewTransform from '../utils/PreviewTransform'
import { canInteractWithOverlay, getInteractionCursor } from '../utils/PreviewModeInteraction'
import type { OverlaySettings, ImageOverlay, TextOverlay, OverlayLayerType } from './DeliverControlPanel'
import { OverlaySelectionBox, type OverlaySizeInfo } from './OverlaySelectionBox'
import { 
  BURNIN_FONTS, 
  BURNIN_PREVIEW_FONT_SCALE, 
  BURNIN_LINE_HEIGHT,
  BURNIN_TIMECODE_LETTER_SPACING,
} from '../constants/burnin'

// ============================================================================
// TYPES
// ============================================================================

// Preview workspace mode
export type PreviewMode = 'view' | 'overlays' | 'burn-in'

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
  /** Preview mode (view/overlays/burn-in) */
  mode?: PreviewMode
  /** Callback when mode changes */
  onModeChange?: (mode: PreviewMode) => void
}

// ============================================================================
// COORDINATE MATH — Delegated to PreviewTransform utility
// All coordinate transformations flow through PreviewTransform.
// See: src/utils/PreviewTransform.ts
// ============================================================================

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
  // Multimodal preview
  mode = 'view',
  onModeChange,
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
  const [previewStatus, setPreviewStatus] = useState<'idle' | 'generating' | 'ready' | 'error' | 'unsupported'>('idle')
  const [previewProgress, setPreviewProgress] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [videoError, setVideoError] = useState<string | null>(null)
  
  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false)
  const workspaceRef = useRef<HTMLDivElement>(null)
  
  // Refs
  const canvasRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  
  // Phase 9B: Overlay element refs for bounding box handles
  const overlayElementRefs = useRef<Map<string, HTMLElement>>(new Map())
  const [canvasRect, setCanvasRect] = useState<DOMRect | null>(null)
  const [isScaling, setIsScaling] = useState(false)

  // Phase 9B: Update canvas rect on resize/zoom changes
  useEffect(() => {
    if (!canvasRef.current) return
    
    const updateCanvasRect = () => {
      if (canvasRef.current) {
        setCanvasRect(canvasRef.current.getBoundingClientRect())
      }
    }
    
    // Initial update
    updateCanvasRect()
    
    // Update on resize
    const resizeObserver = new ResizeObserver(updateCanvasRect)
    resizeObserver.observe(canvasRef.current)
    
    // Also update on scroll/zoom
    window.addEventListener('scroll', updateCanvasRect, true)
    window.addEventListener('resize', updateCanvasRect)
    
    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('scroll', updateCanvasRect, true)
      window.removeEventListener('resize', updateCanvasRect)
    }
  }, [zoom, panOffset])

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

  // Handle video errors - show thumbnail fallback with message
  const handleVideoError = useCallback(() => {
    console.log('[VisualPreviewWorkspace] Video playback error - falling back to thumbnail')
    setVideoError('Playback not supported for this format')
    setPreviewStatus('unsupported')
    setIsPlaying(false)
  }, [])

  // Parse frame rate from metadata (e.g., "24 fps", "29.97", "30000/1001")
  const getFrameRate = useCallback((): number => {
    if (!metadata?.fps) return 24
    const fpsStr = metadata.fps.toLowerCase().replace('fps', '').trim()
    // Handle fractional formats like "30000/1001"
    if (fpsStr.includes('/')) {
      const [num, den] = fpsStr.split('/').map(s => parseFloat(s))
      if (num && den) return num / den
    }
    const parsed = parseFloat(fpsStr)
    return isNaN(parsed) ? 24 : parsed
  }, [metadata?.fps])

  // Format seconds to timecode (frame-rate aware)
  const formatTimecode = useCallback((seconds: number, fps?: number): string => {
    const frameRate = fps || getFrameRate()
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    const f = Math.floor((seconds % 1) * frameRate)
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`
  }, [getFrameRate])

  // Calculate SRC TC from source metadata timecode start + current playback position
  const getSrcTimecode = useCallback((): string => {
    if (!metadata?.timecode_start) return '--:--:--:--'
    
    // Parse source timecode start
    const tcParts = metadata.timecode_start.split(':').map(s => parseInt(s, 10))
    if (tcParts.length !== 4 || tcParts.some(isNaN)) return metadata.timecode_start
    
    const [startH, startM, startS, startF] = tcParts
    const frameRate = getFrameRate()
    
    // Convert start timecode to total frames
    const startTotalFrames = (startH * 3600 + startM * 60 + startS) * frameRate + startF
    
    // Add current playback frames
    const currentFrames = Math.floor(currentTime * frameRate)
    const totalFrames = startTotalFrames + currentFrames
    
    // Convert back to timecode
    const totalSeconds = Math.floor(totalFrames / frameRate)
    const frames = Math.floor(totalFrames % frameRate)
    const h = Math.floor(totalSeconds / 3600)
    const m = Math.floor((totalSeconds % 3600) / 60)
    const s = totalSeconds % 60
    
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`
  }, [metadata?.timecode_start, currentTime, getFrameRate])

  // ============================================
  // Fullscreen handlers
  // ============================================
  
  const toggleFullscreen = useCallback(async () => {
    if (!workspaceRef.current) return
    
    try {
      if (!document.fullscreenElement) {
        await workspaceRef.current.requestFullscreen()
        setIsFullscreen(true)
      } else {
        await document.exitFullscreen()
        setIsFullscreen(false)
      }
    } catch (err) {
      console.error('Fullscreen error:', err)
    }
  }, [])
  
  // Listen for fullscreen changes (ESC key exits fullscreen)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [])
  
  // ESC key handler for fullscreen (browsers handle this automatically, but we sync state)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        // Browser will exit fullscreen, we just sync state
        setIsFullscreen(false)
      }
    }
    
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isFullscreen])

  // ============================================
  // Drag-to-position handlers
  // ============================================

  // Helper to get layer type by ID for interaction gating
  const getLayerTypeById = useCallback((layerId: string): OverlayLayerType | null => {
    const layer = overlaySettings?.layers?.find(l => l.id === layerId)
    return layer?.type || null
  }, [overlaySettings])

  // Phase 5A: Handle layer mouse down for new layer system
  // Phase 9D: Gated through canInteractWithOverlay
  const handleLayerMouseDown = useCallback((
    e: React.MouseEvent,
    layerId: string
  ) => {
    // Phase 9D: Check mode interaction before any state changes
    const layerType = getLayerTypeById(layerId)
    if (!layerType) return
    
    const interactionCheck = canInteractWithOverlay(mode, layerType, 'select', isReadOnly)
    if (!interactionCheck.allowed) {
      // Fire invariant but do NOT mutate state
      assertModeInteractionAllowed(
        false,
        mode,
        layerId,
        layerType,
        'select',
        'VisualPreviewWorkspace.handleLayerMouseDown'
      )
      return // Hard block — no partial updates
    }
    
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
  }, [mode, isReadOnly, getLayerTypeById, onLayerSelect])

  // Legacy overlay handler with mode gating
  const handleMouseDown = useCallback((
    e: React.MouseEvent,
    type: 'text' | 'image' | 'timecode',
    index?: number
  ) => {
    // Phase 9D: Check mode interaction before any state changes
    const interactionCheck = canInteractWithOverlay(mode, type, 'select', isReadOnly)
    if (!interactionCheck.allowed) {
      // Fire invariant but do NOT mutate state
      assertModeInteractionAllowed(
        false,
        mode,
        index !== undefined ? `${type}-${index}` : type,
        type,
        'select',
        'VisualPreviewWorkspace.handleMouseDown'
      )
      return // Hard block — no partial updates
    }
    
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
    setDragTarget({ type, index })
    onOverlaySelect?.(type, index)
  }, [mode, isReadOnly, onOverlaySelect])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !dragTarget || !canvasRef.current || !overlaySettings || !onOverlaySettingsChange) return
    
    // Phase 9D: Get overlay type for drag gating
    let overlayType: string = dragTarget.type
    let overlayId: string = dragTarget.layerId || (dragTarget.index !== undefined ? `${dragTarget.type}-${dragTarget.index}` : dragTarget.type)
    
    if (dragTarget.type === 'layer' && dragTarget.layerId) {
      const layer = overlaySettings.layers?.find(l => l.id === dragTarget.layerId)
      if (layer) {
        overlayType = layer.type
        overlayId = dragTarget.layerId
      }
    }
    
    // Phase 9D: Check mode interaction for drag
    const interactionCheck = canInteractWithOverlay(mode, overlayType, 'drag', isReadOnly)
    if (!interactionCheck.allowed) {
      // Fire invariant and abort drag
      assertModeInteractionAllowed(
        false,
        mode,
        overlayId,
        overlayType,
        'drag',
        'VisualPreviewWorkspace.handleMouseMove'
      )
      // Stop dragging — this should not happen if mouseDown was gated correctly
      setIsDragging(false)
      setDragTarget(null)
      return
    }
    
    const rect = canvasRef.current.getBoundingClientRect()
    // Phase 9A: All coordinate math through PreviewTransform
    const rawPoint = PreviewTransform.screenToNormalized(
      { x: e.clientX, y: e.clientY },
      rect
    )
    
    // Clamp to title-safe area via PreviewTransform
    const { x, y } = PreviewTransform.clampToSafeArea(rawPoint, 'title')
    
    // Phase 9A: Defensive invariant — validate coordinates before applying
    assertPreviewTransformUsed({ x, y }, 'VisualPreviewWorkspace.handleMouseMove')
    
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
  }, [isDragging, dragTarget, overlaySettings, onOverlaySettingsChange, isReadOnly, mode])

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

  // ============================================
  // Phase 9B: Scale change handler for bounding box handles
  // Phase 9D: Gated through canInteractWithOverlay
  // ============================================
  const handleOverlayScaleChange = useCallback((layerId: string, newScale: number) => {
    if (!overlaySettings || !onOverlaySettingsChange) return
    
    // Phase 9D: Get layer type for scale gating
    const layer = overlaySettings.layers?.find(l => l.id === layerId)
    if (!layer) return
    
    const interactionCheck = canInteractWithOverlay(mode, layer.type, 'scale', isReadOnly)
    if (!interactionCheck.allowed) {
      // Fire invariant but do NOT mutate state
      assertModeInteractionAllowed(
        false,
        mode,
        layerId,
        layer.type,
        'scale',
        'VisualPreviewWorkspace.handleOverlayScaleChange'
      )
      return // Hard block — no partial updates
    }
    
    const newSettings = { ...overlaySettings }
    
    if (newSettings.layers) {
      const layers = [...newSettings.layers]
      const layerIndex = layers.findIndex(l => l.id === layerId)
      if (layerIndex !== -1) {
        const layerToUpdate = layers[layerIndex]
        layers[layerIndex] = {
          ...layerToUpdate,
          settings: {
            ...layerToUpdate.settings,
            scale: newScale,
          }
        }
        newSettings.layers = layers
        onOverlaySettingsChange(newSettings)
      }
    }
  }, [mode, isReadOnly, overlaySettings, onOverlaySettingsChange])

  // Phase 9B: Get selected overlay info for bounding box
  const getSelectedOverlayInfo = useCallback((): OverlaySizeInfo | null => {
    if (!selectedLayerId || !overlaySettings?.layers) return null
    
    const layer = overlaySettings.layers.find(l => l.id === selectedLayerId)
    if (!layer) return null
    
    const pos = PreviewTransform.resolveOverlayPosition(
      layer.settings.position || 'center',
      layer.settings.x,
      layer.settings.y
    )
    
    const overlayElement = overlayElementRefs.current.get(selectedLayerId) || null
    
    return {
      layerId: selectedLayerId,
      type: layer.type,
      position: pos,
      scale: layer.settings.scale,
      fontSize: layer.settings.font_size,
      overlayElement,
    }
  }, [selectedLayerId, overlaySettings])

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
      ref={workspaceRef}
      data-testid="visual-preview-workspace"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        background: isFullscreen ? '#000' : 'var(--card-bg-solid, rgba(16, 18, 20, 0.98))',
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

      {/* Header with Mode Switcher & Zoom Controls */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Mode Switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', borderRight: '1px solid var(--border-primary)', paddingRight: '0.75rem' }}>
            {(['view', 'overlays', 'burn-in'] as const).map((m) => (
              <button
                key={m}
                onClick={() => onModeChange?.(m)}
                disabled={!onModeChange}
                style={{
                  padding: '0.375rem 0.625rem',
                  fontSize: '0.6875rem',
                  fontWeight: 600,
                  textTransform: 'capitalize',
                  background: mode === m ? 'var(--button-primary-bg)' : 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-sm)',
                  color: mode === m ? '#fff' : 'var(--text-muted)',
                  cursor: onModeChange ? 'pointer' : 'default',
                  transition: 'all 0.15s ease',
                }}
              >
                {m === 'burn-in' ? 'Burn-In' : m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
          
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
          
          {/* Fullscreen toggle */}
          <button
            onClick={toggleFullscreen}
            data-testid="fullscreen-toggle-btn"
            title={isFullscreen ? 'Exit Fullscreen (ESC)' : 'Fullscreen'}
            style={{
              padding: '0.25rem 0.5rem',
              fontSize: '0.625rem',
              fontWeight: 600,
              background: isFullscreen ? 'var(--button-primary-bg)' : 'rgba(255,255,255,0.05)',
              border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-sm)',
              color: isFullscreen ? '#fff' : 'var(--text-muted)',
              cursor: 'pointer',
              marginLeft: '0.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
            }}
          >
            {isFullscreen ? '⛶ Exit' : '⛶ Fullscreen'}
          </button>
          
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
          {/* Video element for playback - only for supported formats */}
          {previewVideoUrl && previewStatus === 'ready' && (
            <video
              ref={videoRef}
              src={previewVideoUrl}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={handleVideoEnded}
              onError={handleVideoError}
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
          
          {/* Fallback thumbnail - shown for unsupported formats, error states, or while generating */}
          {thumbnailUrl && (previewStatus !== 'ready' || previewStatus === 'unsupported') && (
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
          
          {/* Unsupported format message */}
          {previewStatus === 'unsupported' && thumbnailUrl && (
            <div style={{
              position: 'absolute',
              bottom: '0.75rem',
              left: '50%',
              transform: 'translateX(-50%)',
              padding: '0.375rem 0.75rem',
              background: 'rgba(251, 191, 36, 0.9)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.6875rem',
              color: '#1a202c',
              fontWeight: 500,
              zIndex: 30,
            }}>
              {videoError || 'Playback not supported — showing static frame'}
            </div>
          )}
          
          {/* Error state with thumbnail fallback */}
          {previewStatus === 'error' && thumbnailUrl && (
            <div style={{
              position: 'absolute',
              bottom: '0.75rem',
              left: '50%',
              transform: 'translateX(-50%)',
              padding: '0.375rem 0.75rem',
              background: 'rgba(239, 68, 68, 0.9)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.6875rem',
              color: 'white',
              fontWeight: 500,
              zIndex: 30,
            }}>
              Preview generation failed — showing static frame
            </div>
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

          {/* On-screen Timecode Reader (visible in fullscreen mode) */}
          {hasSource && isFullscreen && (
            <div
              data-testid="fullscreen-timecode"
              style={{
                position: 'absolute',
                bottom: '1rem',
                left: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                padding: '0.375rem 0.75rem',
                background: 'rgba(0, 0, 0, 0.75)',
                borderRadius: 'var(--radius-sm)',
                pointerEvents: 'none',
                zIndex: 40,
              }}
            >
              {/* REC TC */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <span style={{
                  fontSize: '0.5rem',
                  fontWeight: 600,
                  color: 'rgba(255, 255, 255, 0.5)',
                  textTransform: 'uppercase',
                }}>
                  REC
                </span>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: 'white',
                  letterSpacing: '0.03em',
                }}>
                  {formatTimecode(currentTime)}
                </span>
              </div>
              
              <div style={{ width: '1px', height: '1rem', background: 'rgba(255, 255, 255, 0.3)' }} />
              
              {/* SRC TC */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <span style={{
                  fontSize: '0.5rem',
                  fontWeight: 600,
                  color: 'rgba(255, 255, 255, 0.5)',
                  textTransform: 'uppercase',
                }}>
                  SRC
                </span>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: metadata?.timecode_start ? 'rgb(59, 130, 246)' : 'rgba(255, 255, 255, 0.4)',
                  letterSpacing: '0.03em',
                }}>
                  {getSrcTimecode()}
                </span>
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
              // Phase 9A: All position resolution through PreviewTransform
              const pos = PreviewTransform.resolveOverlayPosition(
                layer.settings.position || 'center',
                layer.settings.x,
                layer.settings.y
              )
              const isSelected = layer.id === selectedLayerId
              const zIndex = isSelected ? 30 : 10 + layer.order
              
              // Render based on layer type
              if (layer.type === 'text') {
                return (
                  <div
                    key={layer.id}
                    ref={(el) => {
                      if (el) overlayElementRefs.current.set(layer.id, el)
                      else overlayElementRefs.current.delete(layer.id)
                    }}
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
                      // Phase 9D: Cursor reflects interaction legality
                      cursor: getInteractionCursor(mode, layer.type, isReadOnly, isScaling),
                      border: isSelected && mode !== 'overlays' ? '2px solid var(--button-primary-bg)' : '2px solid transparent',
                      boxShadow: isSelected && mode !== 'overlays' ? '0 0 8px rgba(59, 130, 246, 0.5)' : 'none',
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
                    ref={(el) => {
                      if (el) overlayElementRefs.current.set(layer.id, el)
                      else overlayElementRefs.current.delete(layer.id)
                    }}
                    data-testid={`overlay-layer-${layer.id}`}
                    onMouseDown={(e) => handleLayerMouseDown(e, layer.id)}
                    style={{
                      position: 'absolute',
                      left: `${pos.x * 100}%`,
                      top: `${pos.y * 100}%`,
                      transform: 'translate(-50%, -50%)',
                      // Phase 9D: Cursor reflects interaction legality
                      cursor: getInteractionCursor(mode, layer.type, isReadOnly, isScaling),
                      border: isSelected && mode !== 'overlays' ? '2px solid var(--button-primary-bg)' : '2px solid transparent',
                      boxShadow: isSelected && mode !== 'overlays' ? '0 0 8px rgba(59, 130, 246, 0.5)' : 'none',
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
                // Phase 9C: Use BURNIN_FONTS for FFmpeg-representative rendering
                const timecodeFont = layer.settings.font || BURNIN_FONTS.timecode
                return (
                  <div
                    key={layer.id}
                    ref={(el) => {
                      if (el) overlayElementRefs.current.set(layer.id, el)
                      else overlayElementRefs.current.delete(layer.id)
                    }}
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
                      fontSize: `${(layer.settings.font_size || 24) * BURNIN_PREVIEW_FONT_SCALE}px`,
                      fontFamily: timecodeFont,
                      lineHeight: BURNIN_LINE_HEIGHT,
                      color: layer.settings.color || 'white',
                      opacity: layer.settings.opacity || 1,
                      // Phase 9D: Cursor reflects interaction legality
                      cursor: getInteractionCursor(mode, layer.type, isReadOnly, isScaling),
                      border: isSelected && mode !== 'overlays' ? '2px solid var(--button-primary-bg)' : '2px solid transparent',
                      boxShadow: isSelected && mode !== 'overlays' ? '0 0 8px rgba(59, 130, 246, 0.5)' : 'none',
                      whiteSpace: 'nowrap',
                      textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                      letterSpacing: BURNIN_TIMECODE_LETTER_SPACING,
                      userSelect: 'none',
                      zIndex,
                    }}
                  >
                    {metadata?.timecode_start || '00:00:00:00'}
                  </div>
                )
              }
              
              if (layer.type === 'metadata') {
                // Phase 9C: Use BURNIN_FONTS for FFmpeg-representative rendering
                return (
                  <div
                    key={layer.id}
                    ref={(el) => {
                      if (el) overlayElementRefs.current.set(layer.id, el)
                      else overlayElementRefs.current.delete(layer.id)
                    }}
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
                      fontSize: `${(layer.settings.font_size || 16) * BURNIN_PREVIEW_FONT_SCALE}px`,
                      fontFamily: BURNIN_FONTS.metadata,
                      lineHeight: BURNIN_LINE_HEIGHT,
                      color: 'white',
                      opacity: layer.settings.opacity || 1,
                      // Phase 9D: Cursor reflects interaction legality
                      cursor: getInteractionCursor(mode, layer.type, isReadOnly, isScaling),
                      border: isSelected && mode !== 'overlays' ? '2px solid var(--button-primary-bg)' : '2px solid transparent',
                      boxShadow: isSelected && mode !== 'overlays' ? '0 0 8px rgba(59, 130, 246, 0.5)' : 'none',
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
            // Phase 9A: All position resolution through PreviewTransform
            const pos = PreviewTransform.resolveOverlayPosition(
              layer.position,
              layer.x,
              layer.y
            )
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
                  // Phase 9D: Cursor reflects interaction legality
                  cursor: getInteractionCursor(mode, 'text', isReadOnly, isScaling),
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
                // Phase 9D: Cursor reflects interaction legality
                cursor: getInteractionCursor(mode, 'image', false, false),
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
            // Phase 9A: All position resolution through PreviewTransform
            const pos = PreviewTransform.resolveOverlayPosition(
              tc.position,
              tc.x,
              tc.y
            )
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
                  // Phase 9C: Use burn-in font constants for parity
                  fontSize: `${tc.font_size * BURNIN_PREVIEW_FONT_SCALE}px`,
                  fontFamily: tc.font || BURNIN_FONTS.timecode,
                  lineHeight: BURNIN_LINE_HEIGHT,
                  color: 'white',
                  opacity: tc.opacity,
                  // Phase 9D: Cursor reflects interaction legality
                  cursor: getInteractionCursor(mode, 'timecode', false, false),
                  border: isSelected ? '2px solid var(--button-primary-bg)' : '2px solid transparent',
                  boxShadow: isSelected ? '0 0 8px rgba(59, 130, 246, 0.5)' : 'none',
                  whiteSpace: 'nowrap',
                  textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                  letterSpacing: BURNIN_TIMECODE_LETTER_SPACING,
                  userSelect: 'none',
                  zIndex: isSelected ? 20 : 10,
                }}
              >
                {metadata?.timecode_start || '00:00:00:00'}
              </div>
            )
          })()}

          {/* Phase 9B: Overlay Selection Box with Handles */}
          <OverlaySelectionBox
            mode={mode}
            isReadOnly={isReadOnly}
            overlayInfo={getSelectedOverlayInfo()}
            canvasRect={canvasRect}
            onScaleChange={handleOverlayScaleChange}
            onScaleStart={() => setIsScaling(true)}
            onScaleEnd={() => setIsScaling(false)}
          />
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
        {/* Timecode Reader — REC TC & SRC TC Display */}
        {/* ============================================ */}
        {hasSource && (
          <div
            data-testid="timecode-reader"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '1.5rem',
              marginTop: '0.5rem',
              padding: '0.5rem 1rem',
              background: 'rgba(0, 0, 0, 0.6)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-primary)',
              width: '100%',
              maxWidth: '960px',
            }}
          >
            {/* REC TC - Player-based timecode starting at 00:00:00:00 */}
            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontSize: '0.5625rem',
                fontWeight: 600,
                color: 'var(--text-dim)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '0.125rem',
              }}>
                REC TC
              </div>
              <div
                data-testid="rec-timecode"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '1.125rem',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  letterSpacing: '0.03em',
                  textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                }}
              >
                {formatTimecode(currentTime)}
              </div>
            </div>

            {/* Divider */}
            <div style={{
              width: '1px',
              height: '2rem',
              background: 'var(--border-secondary)',
            }} />

            {/* SRC TC - Source metadata timecode */}
            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontSize: '0.5625rem',
                fontWeight: 600,
                color: 'var(--text-dim)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '0.125rem',
              }}>
                SRC TC
              </div>
              <div
                data-testid="src-timecode"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '1.125rem',
                  fontWeight: 600,
                  color: metadata?.timecode_start ? 'rgb(59, 130, 246)' : 'var(--text-dim)',
                  letterSpacing: '0.03em',
                  textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                }}
              >
                {getSrcTimecode()}
              </div>
            </div>

            {/* Frame Rate Badge */}
            <div style={{
              marginLeft: '0.5rem',
              padding: '0.125rem 0.375rem',
              fontSize: '0.5625rem',
              fontWeight: 600,
              background: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-muted)',
            }}>
              {metadata?.fps || '24 fps'}
            </div>
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
