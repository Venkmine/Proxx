/**
 * usePreviewIntent — Preview Generation State Management Hook
 * 
 * ============================================================================
 * DESIGN PHILOSOPHY
 * ============================================================================
 * This hook manages preview intent state, completely decoupled from proxy jobs.
 * 
 * KEY PRINCIPLES:
 * 1. Preview generation is EXPLICIT — user must request it
 * 2. Preview generation is NON-QUEUED — runs immediately, not as a job
 * 3. Preview generation is NON-BLOCKING — never blocks proxy job creation
 * 4. Preview state is PER-SOURCE, not per-job
 * 
 * This hook replaces the preview-related parts of useTieredPreview for
 * video proxy generation, while keeping poster/burst generation separate.
 * ============================================================================
 */

import { useState, useCallback, useRef } from 'react'
import type {
  PreviewIntent,
  PreviewInfo,
  PreviewError,
  SourcePreviewState,
} from '../types/previewIntent'
import { createInitialPreviewState } from '../types/previewIntent'

// ============================================================================
// TYPES
// ============================================================================

export interface UsePreviewIntentReturn {
  /** Current preview state for the active source */
  previewState: SourcePreviewState
  
  /** Current preview intent */
  intent: PreviewIntent
  
  /** Preview info (when available) */
  preview: PreviewInfo | null
  
  /** Error info (when failed) */
  error: PreviewError | null
  
  /** Whether preview is currently loading */
  isLoading: boolean
  
  /**
   * Request preview generation for a source.
   * This is EXPLICIT and user-initiated ONLY.
   * @param sourcePath - Path to the source file
   * @param duration - Preview duration in seconds (default 5)
   * @param confirmRaw - Whether user confirmed RAW processing
   */
  requestPreview: (
    sourcePath: string,
    duration?: number,
    confirmRaw?: boolean
  ) => Promise<void>
  
  /**
   * Cancel ongoing preview generation.
   */
  cancelPreview: () => void
  
  /**
   * Reset preview state (e.g., when source changes).
   */
  reset: () => void
  
  /**
   * Clear error and allow retry.
   */
  clearError: () => void
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

const DEFAULT_DURATION = 5 // 5 seconds default preview

export function usePreviewIntent(backendUrl: string): UsePreviewIntentReturn {
  const [previewState, setPreviewState] = useState<SourcePreviewState>(
    createInitialPreviewState('')
  )
  
  // Track current source to detect changes during async operations
  const currentSourceRef = useRef<string | null>(null)
  
  // Abort controller for cancellation
  const abortControllerRef = useRef<AbortController | null>(null)
  
  const reset = useCallback(() => {
    // Cancel any ongoing generation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    
    currentSourceRef.current = null
    setPreviewState(createInitialPreviewState(''))
  }, [])
  
  const clearError = useCallback(() => {
    setPreviewState(prev => ({
      ...prev,
      intent: 'none',
      error: null,
    }))
  }, [])
  
  const cancelPreview = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    
    setPreviewState(prev => ({
      ...prev,
      intent: 'none',
    }))
  }, [])
  
  const requestPreview = useCallback(async (
    sourcePath: string,
    duration: number = DEFAULT_DURATION,
    confirmRaw: boolean = false
  ) => {
    // Cancel any previous generation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    
    abortControllerRef.current = new AbortController()
    currentSourceRef.current = sourcePath
    
    // Transition to requested state
    setPreviewState({
      sourcePath,
      intent: 'requested',
      preview: null,
      error: null,
      requestedDuration: duration,
    })
    
    // Brief delay to show "requested" state, then transition to "generating"
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Check if source changed
    if (currentSourceRef.current !== sourcePath) {
      return
    }
    
    // Transition to generating state
    setPreviewState(prev => ({
      ...prev,
      intent: 'generating',
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
        signal: abortControllerRef.current?.signal,
      })
      
      const data = await response.json()
      
      // Check if source changed during generation
      if (currentSourceRef.current !== sourcePath) {
        return
      }
      
      // Check for error response
      if (data.error) {
        setPreviewState(prev => ({
          ...prev,
          intent: 'failed',
          error: {
            message: data.error,
            detail: data.detail,
            timestamp: new Date(),
          },
        }))
        return
      }
      
      // Check for RAW confirmation required
      if (data.requires_confirmation) {
        setPreviewState(prev => ({
          ...prev,
          intent: 'none', // Reset to allow user to confirm
          error: {
            message: 'RAW format requires confirmation',
            detail: 'Click "Generate Preview" again to confirm Resolve processing',
            timestamp: new Date(),
          },
        }))
        return
      }
      
      // Success - build preview info
      const previewInfo: PreviewInfo = {
        previewUrl: `${backendUrl}${data.preview_url}`,
        duration: data.duration,
        resolution: data.resolution,
        codec: data.codec || 'h264',
        cached: data.cached || false,
        generatedAt: new Date(),
      }
      
      setPreviewState(prev => ({
        ...prev,
        intent: 'available',
        preview: previewInfo,
        error: null,
      }))
      
    } catch (err) {
      // Handle abort
      if (err instanceof Error && err.name === 'AbortError') {
        return
      }
      
      // Check if source changed
      if (currentSourceRef.current !== sourcePath) {
        return
      }
      
      // Network or other error
      const message = err instanceof Error
        ? `Preview generation failed: ${err.message}`
        : 'Preview generation failed'
      
      setPreviewState(prev => ({
        ...prev,
        intent: 'failed',
        error: {
          message,
          timestamp: new Date(),
        },
      }))
    }
  }, [backendUrl])
  
  return {
    previewState,
    intent: previewState.intent,
    preview: previewState.preview,
    error: previewState.error,
    isLoading: previewState.intent === 'requested' || previewState.intent === 'generating',
    requestPreview,
    cancelPreview,
    reset,
    clearError,
  }
}

export default usePreviewIntent
