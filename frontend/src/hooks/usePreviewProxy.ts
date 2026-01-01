/**
 * usePreviewProxy — Preview Proxy Generation Hook
 * 
 * ============================================================================
 * DESIGN PHILOSOPHY
 * ============================================================================
 * This hook manages the deterministic generation of browser-safe preview proxies.
 * 
 * Key Principles:
 * 1. UI NEVER attempts playback from original sources
 * 2. ALL playback comes from preview-safe proxy files
 * 3. Preview proxies are temporary, disposable, isolated from output jobs
 * 4. If preview proxy generation fails, UI falls back to Identification Mode
 * 5. No speculative playback. No fake scrubbers. No guessing codec support.
 * 
 * Flow:
 * 1. Source selected
 * 2. Preflight passes
 * 3. Frontend requests POST /preview/generate
 * 4. While pending: show "Preparing Preview…" overlay
 * 5. On success: store preview URL, transition to Playback Mode
 * 6. On failure: log reason, remain in Identification Mode
 * 
 * See: docs/PREVIEW_PROXY_PIPELINE.md
 * ============================================================================
 */

import { useState, useCallback, useRef, useEffect } from 'react'

// ============================================================================
// TYPES
// ============================================================================

export type PreviewProxyState = 
  | 'idle'           // No preview requested
  | 'generating'     // Preview proxy being generated
  | 'ready'          // Preview proxy available
  | 'failed'         // Preview proxy generation failed

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

interface UsePreviewProxyReturn {
  /** Current state of preview proxy generation */
  state: PreviewProxyState
  /** Preview proxy info (only valid when state === 'ready') */
  proxyInfo: PreviewProxyInfo | null
  /** Error info (only valid when state === 'failed') */
  error: PreviewProxyError | null
  /** Request preview proxy generation for a source path */
  generatePreview: (sourcePath: string) => Promise<boolean>
  /** Reset state (e.g., when source changes) */
  reset: () => void
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function usePreviewProxy(backendUrl: string): UsePreviewProxyReturn {
  const [state, setState] = useState<PreviewProxyState>('idle')
  const [proxyInfo, setProxyInfo] = useState<PreviewProxyInfo | null>(null)
  const [error, setError] = useState<PreviewProxyError | null>(null)
  
  // Track current source to detect source changes during generation
  const currentSourceRef = useRef<string | null>(null)
  // Prevent duplicate generation requests
  const generationInFlightRef = useRef(false)
  
  const reset = useCallback(() => {
    setState('idle')
    setProxyInfo(null)
    setError(null)
    currentSourceRef.current = null
    generationInFlightRef.current = false
  }, [])
  
  const generatePreview = useCallback(async (sourcePath: string): Promise<boolean> => {
    // Guard: prevent duplicate calls
    if (generationInFlightRef.current) {
      console.debug('[usePreviewProxy] Generation already in flight')
      return false
    }
    
    // Reset state for new source
    currentSourceRef.current = sourcePath
    generationInFlightRef.current = true
    setState('generating')
    setProxyInfo(null)
    setError(null)
    
    try {
      const response = await fetch(`${backendUrl}/preview/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_path: sourcePath }),
      })
      
      const data = await response.json()
      
      // Check if source changed during generation
      if (currentSourceRef.current !== sourcePath) {
        console.debug('[usePreviewProxy] Source changed during generation, discarding result')
        return false
      }
      
      // Check for error response
      if (data.error) {
        setError({ message: data.error })
        setState('failed')
        generationInFlightRef.current = false
        return false
      }
      
      // Success - build full URL
      const previewUrl = `${backendUrl}${data.preview_url}`
      
      setProxyInfo({
        previewUrl,
        duration: data.duration,
        resolution: data.resolution,
        codec: data.codec || 'h264',
      })
      setState('ready')
      generationInFlightRef.current = false
      return true
      
    } catch (err) {
      // Check if source changed during generation
      if (currentSourceRef.current !== sourcePath) {
        return false
      }
      
      const message = err instanceof Error 
        ? `Preview unavailable — ${err.message}` 
        : 'Preview unavailable — request failed'
      
      setError({ message })
      setState('failed')
      generationInFlightRef.current = false
      return false
    }
  }, [backendUrl])
  
  return {
    state,
    proxyInfo,
    error,
    generatePreview,
    reset,
  }
}

export default usePreviewProxy
