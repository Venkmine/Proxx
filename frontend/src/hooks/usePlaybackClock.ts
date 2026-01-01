/**
 * usePlaybackClock — High-Frequency Playback Clock Hook
 * 
 * ============================================================================
 * DESIGN PHILOSOPHY
 * ============================================================================
 * HTML5 video fires timeupdate events at ~4–10Hz, causing visible timecode
 * stepping and "laggy" counters. This hook drives timecode display using
 * requestAnimationFrame for smooth, editor-grade updates.
 * 
 * Key Principles:
 * 1. Sample video.currentTime every frame (~60Hz)
 * 2. Derive frame number from FPS (NEVER assume 30fps)
 * 3. Generate SMPTE timecode string
 * 4. Stop RAF loop when paused or unmounted
 * 5. No frame interpolation — no fake precision
 * 
 * IMPORTANT: HTML5 video is NOT frame-accurate for all codecs.
 * Frame stepping is best-effort approximation.
 * 
 * See: docs/MONITOR_SURFACE.md
 * ============================================================================
 */

import { useState, useEffect, useRef, useCallback } from 'react'

// ============================================================================
// TYPES
// ============================================================================

export interface PlaybackClockState {
  /** Current playback time in seconds */
  currentTimeSeconds: number
  /** Current frame number (floor(currentTime * fps)) */
  frameNumber: number
  /** SMPTE timecode string (HH:MM:SS:FF) */
  timecode: string
  /** Whether video is currently playing */
  isPlaying: boolean
}

interface UsePlaybackClockOptions {
  /** Video element ref */
  videoRef: React.RefObject<HTMLVideoElement | null>
  /** Source frame rate (e.g., 23.976, 24, 25, 29.97, 30) */
  fps: number
  /** Whether clock should be active */
  enabled?: boolean
}

// ============================================================================
// TIMECODE FORMATTING
// ============================================================================

/**
 * Convert seconds and FPS to SMPTE timecode string.
 * Format: HH:MM:SS:FF
 * 
 * IMPORTANT: This is best-effort approximation, not frame-accurate.
 * HTML5 video currentTime is not guaranteed to be frame-aligned.
 */
function formatSMPTETimecode(seconds: number, fps: number): string {
  if (!isFinite(seconds) || seconds < 0) {
    return '00:00:00:00'
  }
  
  const totalFrames = Math.floor(seconds * fps)
  const h = Math.floor(totalFrames / (fps * 3600))
  const m = Math.floor((totalFrames % (fps * 3600)) / (fps * 60))
  const s = Math.floor((totalFrames % (fps * 60)) / fps)
  const f = Math.floor(totalFrames % fps)
  
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function usePlaybackClock({
  videoRef,
  fps,
  enabled = true,
}: UsePlaybackClockOptions): PlaybackClockState {
  const [state, setState] = useState<PlaybackClockState>({
    currentTimeSeconds: 0,
    frameNumber: 0,
    timecode: '00:00:00:00',
    isPlaying: false,
  })
  
  // Track animation frame ID for cleanup
  const rafIdRef = useRef<number | null>(null)
  // Track playing state for RAF loop control
  const isPlayingRef = useRef(false)
  
  // Update function called every frame
  const updateClock = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    
    const currentTime = video.currentTime
    const frameNumber = Math.floor(currentTime * fps)
    const timecode = formatSMPTETimecode(currentTime, fps)
    
    setState(prev => {
      // Only update if values changed (avoid unnecessary re-renders)
      if (
        prev.currentTimeSeconds === currentTime &&
        prev.frameNumber === frameNumber &&
        prev.isPlaying === isPlayingRef.current
      ) {
        return prev
      }
      return {
        currentTimeSeconds: currentTime,
        frameNumber,
        timecode,
        isPlaying: isPlayingRef.current,
      }
    })
  }, [videoRef, fps])
  
  // RAF loop function
  const tick = useCallback(() => {
    updateClock()
    
    // Continue loop only if playing
    if (isPlayingRef.current) {
      rafIdRef.current = requestAnimationFrame(tick)
    }
  }, [updateClock])
  
  // Start/stop RAF loop based on play state
  const startLoop = useCallback(() => {
    if (rafIdRef.current !== null) return // Already running
    rafIdRef.current = requestAnimationFrame(tick)
  }, [tick])
  
  const stopLoop = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }
  }, [])
  
  // Video event handlers
  useEffect(() => {
    if (!enabled) return
    
    const video = videoRef.current
    if (!video) return
    
    const handlePlay = () => {
      isPlayingRef.current = true
      setState(prev => ({ ...prev, isPlaying: true }))
      startLoop()
    }
    
    const handlePause = () => {
      isPlayingRef.current = false
      setState(prev => ({ ...prev, isPlaying: false }))
      stopLoop()
      // One final update to capture exact pause position
      updateClock()
    }
    
    const handleSeeked = () => {
      // Update immediately on seek
      updateClock()
    }
    
    const handleEnded = () => {
      isPlayingRef.current = false
      setState(prev => ({ ...prev, isPlaying: false }))
      stopLoop()
      updateClock()
    }
    
    const handleLoadedMetadata = () => {
      // Initial update when video metadata loads
      updateClock()
    }
    
    // Attach event listeners
    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)
    video.addEventListener('seeked', handleSeeked)
    video.addEventListener('ended', handleEnded)
    video.addEventListener('loadedmetadata', handleLoadedMetadata)
    
    // Check if video is already playing (e.g., autoplay)
    if (!video.paused) {
      isPlayingRef.current = true
      setState(prev => ({ ...prev, isPlaying: true }))
      startLoop()
    }
    
    // Initial clock update
    updateClock()
    
    return () => {
      stopLoop()
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
      video.removeEventListener('seeked', handleSeeked)
      video.removeEventListener('ended', handleEnded)
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
    }
  }, [videoRef, enabled, startLoop, stopLoop, updateClock])
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopLoop()
    }
  }, [stopLoop])
  
  // Reset state when FPS changes
  useEffect(() => {
    updateClock()
  }, [fps, updateClock])
  
  return state
}

export default usePlaybackClock
