/**
 * useTieredPreview — Tiered Preview System Hook
 * 
 * ============================================================================
 * DESIGN PHILOSOPHY
 * ============================================================================
 * This hook manages the tiered, non-blocking preview model:
 * 
 * Tier 1: POSTER FRAME (Mandatory, Instant)
 *   - Appears IMMEDIATELY on source selection
 *   - 2-second timeout, works for all formats
 *   - NEVER blocks UI
 * 
 * Tier 2: BURST THUMBNAILS (Recommended)
 *   - 7 evenly spaced frames for scrub preview
 *   - Optional, user can enable/disable
 * 
 * Tier 3: VIDEO PREVIEW (User-Initiated ONLY)
 *   - NEVER auto-generated
 *   - User must explicitly request via menu
 *   - RAW formats require confirmation dialog
 * 
 * PLAYBACK CAPABILITY:
 *   - Deterministic probe via FFmpeg (backend)
 *   - PLAYABLE → full playback + controls enabled
 *   - METADATA_ONLY → poster/burst only, controls disabled
 *   - NO_VIDEO / ERROR → no playback, explicit message
 * 
 * CORE PRINCIPLES:
 * 1. Preview must NEVER block job creation, preflight, or encoding
 * 2. Preview generation must NEVER auto-generate video for RAW media
 * 3. Something visual must appear IMMEDIATELY on source selection
 * 4. All higher-fidelity previews are OPTIONAL and user-initiated
 * 5. Preview is identification only — not editorial accuracy
 * 6. Playback capability is ALWAYS probed, never guessed
 * 
 * See: docs/PREVIEW_PIPELINE.md
 * ============================================================================
 */

import { useState, useCallback, useRef } from 'react'
import {
  probePlaybackCapability,
  deriveUIStateFromProbe,
  type PlaybackCapability,
  type PlaybackProbeResult,
  type PlaybackUIState,
} from '../utils/playbackCapability'

// ============================================================================
// TYPES
// ============================================================================

/** Preview mode indicating which tier is currently displayed */
export type PreviewMode = 'poster' | 'burst' | 'video' | 'none'

/** Source metadata from poster frame extraction */
export interface SourceInfo {
  filename?: string
  codec?: string
  resolution?: string
  width?: number
  height?: number
  fps?: number
  duration?: number
  duration_human?: string
  file_size?: number
  file_size_human?: string
}

/** Poster frame result */
export interface PosterInfo {
  posterUrl: string
  width: number | null
  height: number | null
  sourceInfo: SourceInfo | null
  cached: boolean
}

/** Single burst thumbnail */
export interface BurstThumbnail {
  index: number
  timestamp: number
  url: string
}

/** Burst thumbnails result */
export interface BurstInfo {
  hashId: string
  thumbnails: BurstThumbnail[]
  totalGenerated: number
  sourceDuration: number | null
  cached: boolean
}

/** Video preview result */
export interface VideoPreviewInfo {
  previewUrl: string
  duration: number | null
  resolution: string | null
  codec: string
}

/** Current preview state */
export interface TieredPreviewState {
  mode: PreviewMode
  
  // Playback Capability (deterministic probe)
  playbackProbing: boolean
  playbackCapability: PlaybackCapability | null
  playbackProbeResult: PlaybackProbeResult | null
  playbackUIState: PlaybackUIState | null
  
  // Tier 1: Poster
  posterLoading: boolean
  poster: PosterInfo | null
  posterError: string | null
  
  // Tier 2: Burst
  burstLoading: boolean
  burst: BurstInfo | null
  burstError: string | null
  
  // Tier 3: Video
  videoLoading: boolean
  video: VideoPreviewInfo | null
  videoError: string | null
  videoRequiresConfirmation: boolean
}

export interface UseTieredPreviewReturn extends TieredPreviewState {
  /** Probe playback capability (called automatically on source selection) */
  probePlayback: (sourcePath: string) => Promise<void>
  
  /** Request poster frame (called automatically on source selection) */
  requestPoster: (sourcePath: string) => Promise<void>
  
  /** Request burst thumbnails (optional, user-initiated) */
  requestBurst: (sourcePath: string) => Promise<void>
  
  /** Request video preview (optional, user-initiated) */
  requestVideo: (sourcePath: string, duration?: number, confirmRaw?: boolean) => Promise<void>
  
  /** Cancel any ongoing video generation */
  cancelVideo: () => void
  
  /** Switch display mode */
  setMode: (mode: PreviewMode) => void
  
  /** Reset all preview state */
  reset: () => void
  
  /** Currently selected burst thumbnail index (for scrub) */
  burstIndex: number
  setBurstIndex: (index: number) => void
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

const initialState: TieredPreviewState = {
  mode: 'none',
  playbackProbing: false,
  playbackCapability: null,
  playbackProbeResult: null,
  playbackUIState: null,
  posterLoading: false,
  poster: null,
  posterError: null,
  burstLoading: false,
  burst: null,
  burstError: null,
  videoLoading: false,
  video: null,
  videoError: null,
  videoRequiresConfirmation: false,
}

export function useTieredPreview(backendUrl: string): UseTieredPreviewReturn {
  const [state, setState] = useState<TieredPreviewState>(initialState)
  const [burstIndex, setBurstIndex] = useState(0)
  
  // Track current source to detect changes during async operations
  const currentSourceRef = useRef<string | null>(null)
  
  // Abort controller for video generation
  const abortControllerRef = useRef<AbortController | null>(null)
  
  const reset = useCallback(() => {
    // Cancel any ongoing operations
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    
    currentSourceRef.current = null
    setBurstIndex(0)
    setState(initialState)
  }, [])
  
  const setMode = useCallback((mode: PreviewMode) => {
    setState(prev => ({ ...prev, mode }))
  }, [])
  
  // ============================================
  // PLAYBACK CAPABILITY PROBE (DETERMINISTIC)
  // ============================================
  const probePlayback = useCallback(async (sourcePath: string) => {
    setState(prev => ({
      ...prev,
      playbackProbing: true,
      playbackCapability: null,
      playbackProbeResult: null,
      playbackUIState: null,
    }))
    
    try {
      const result = await probePlaybackCapability(sourcePath, backendUrl)
      
      // Check if source changed during probe
      if (currentSourceRef.current !== sourcePath) {
        return
      }
      
      const uiState = deriveUIStateFromProbe(result)
      
      setState(prev => ({
        ...prev,
        playbackProbing: false,
        playbackCapability: result.capability,
        playbackProbeResult: result,
        playbackUIState: uiState,
      }))
      
    } catch (err) {
      if (currentSourceRef.current !== sourcePath) {
        return
      }
      
      setState(prev => ({
        ...prev,
        playbackProbing: false,
        playbackCapability: 'ERROR',
        playbackProbeResult: {
          capability: 'ERROR',
          engine: 'ffmpeg',
          probe_ms: 0,
          message: err instanceof Error ? err.message : 'Probe failed',
        },
        playbackUIState: {
          canMountVideo: false,
          transportEnabled: false,
          transportVisible: true,
          canShowPoster: false,
          canShowBurst: false,
          canGenerateProxy: false,
          disabledMessage: 'Unable to probe file',
          isRawFormat: false,
        },
      }))
    }
  }, [backendUrl])
  
  // ============================================
  // TIER 1: POSTER FRAME
  // ============================================
  const requestPoster = useCallback(async (sourcePath: string) => {
    currentSourceRef.current = sourcePath
    
    setState(prev => ({
      ...prev,
      mode: 'poster',
      posterLoading: true,
      posterError: null,
      poster: null,
    }))
    
    try {
      const response = await fetch(`${backendUrl}/preview/poster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_path: sourcePath }),
      })
      
      const data = await response.json()
      
      // Check if source changed during request
      if (currentSourceRef.current !== sourcePath) {
        return
      }
      
      if (data.error) {
        setState(prev => ({
          ...prev,
          posterLoading: false,
          posterError: data.error,
          // Still store source_info even on error
          poster: data.source_info ? {
            posterUrl: '',
            width: null,
            height: null,
            sourceInfo: data.source_info,
            cached: false,
          } : null,
        }))
        return
      }
      
      setState(prev => ({
        ...prev,
        posterLoading: false,
        poster: {
          posterUrl: `${backendUrl}${data.poster_url}`,
          width: data.width,
          height: data.height,
          sourceInfo: data.source_info || null,
          cached: data.cached,
        },
      }))
      
    } catch (err) {
      if (currentSourceRef.current !== sourcePath) {
        return
      }
      
      setState(prev => ({
        ...prev,
        posterLoading: false,
        posterError: err instanceof Error ? err.message : 'Poster request failed',
      }))
    }
  }, [backendUrl])
  
  // ============================================
  // TIER 2: BURST THUMBNAILS
  // ============================================
  const requestBurst = useCallback(async (sourcePath: string) => {
    setState(prev => ({
      ...prev,
      burstLoading: true,
      burstError: null,
    }))
    
    try {
      const response = await fetch(`${backendUrl}/preview/burst`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_path: sourcePath }),
      })
      
      const data = await response.json()
      
      if (currentSourceRef.current !== sourcePath) {
        return
      }
      
      if (data.error) {
        setState(prev => ({
          ...prev,
          burstLoading: false,
          burstError: data.error,
        }))
        return
      }
      
      // Build full URLs for thumbnails
      const thumbnails: BurstThumbnail[] = data.thumbnails.map((t: any) => ({
        index: t.index,
        timestamp: t.timestamp,
        url: `${backendUrl}${t.url}`,
      }))
      
      setState(prev => ({
        ...prev,
        burstLoading: false,
        mode: 'burst',
        burst: {
          hashId: data.hash_id,
          thumbnails,
          totalGenerated: data.total_generated,
          sourceDuration: data.source_duration,
          cached: data.cached,
        },
      }))
      
      setBurstIndex(0)
      
    } catch (err) {
      if (currentSourceRef.current !== sourcePath) {
        return
      }
      
      setState(prev => ({
        ...prev,
        burstLoading: false,
        burstError: err instanceof Error ? err.message : 'Burst request failed',
      }))
    }
  }, [backendUrl])
  
  // ============================================
  // TIER 3: VIDEO PREVIEW
  // ============================================
  const requestVideo = useCallback(async (
    sourcePath: string, 
    duration?: number,
    confirmRaw: boolean = false
  ) => {
    // Cancel any previous video generation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    
    abortControllerRef.current = new AbortController()
    
    setState(prev => ({
      ...prev,
      videoLoading: true,
      videoError: null,
      videoRequiresConfirmation: false,
    }))
    
    try {
      const response = await fetch(`${backendUrl}/preview/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          source_path: sourcePath,
          duration: duration,
          confirm_raw: confirmRaw,
        }),
        signal: abortControllerRef.current.signal,
      })
      
      const data = await response.json()
      
      if (currentSourceRef.current !== sourcePath) {
        return
      }
      
      if (data.error) {
        setState(prev => ({
          ...prev,
          videoLoading: false,
          videoError: data.error,
          videoRequiresConfirmation: data.requires_confirmation || false,
        }))
        return
      }
      
      setState(prev => ({
        ...prev,
        videoLoading: false,
        mode: 'video',
        video: {
          previewUrl: `${backendUrl}${data.preview_url}`,
          duration: data.duration,
          resolution: data.resolution,
          codec: data.codec,
        },
      }))
      
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Cancelled, don't update state
        return
      }
      
      if (currentSourceRef.current !== sourcePath) {
        return
      }
      
      setState(prev => ({
        ...prev,
        videoLoading: false,
        videoError: err instanceof Error ? err.message : 'Video request failed',
      }))
    }
  }, [backendUrl])
  
  const cancelVideo = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    
    setState(prev => ({
      ...prev,
      videoLoading: false,
    }))
  }, [])
  
  return {
    ...state,
    probePlayback,
    requestPoster,
    requestBurst,
    requestVideo,
    cancelVideo,
    setMode,
    reset,
    burstIndex,
    setBurstIndex,
  }
}

export default useTieredPreview
