/**
 * useIngestion — Canonical Job Ingestion Hook
 * 
 * SINGLE ENTRY POINT for all job creation from the frontend.
 * 
 * This hook:
 * 1. Manages pending source paths (pre-ingestion staging)
 * 2. Provides a single `ingest()` method for job creation
 * 3. Delegates to backend IngestionService via /control/jobs/create
 * 4. Returns the created job for UI binding
 * 
 * All input methods MUST use this hook:
 * - File browser selection
 * - Drag & drop
 * - Directory navigator (future)
 * 
 * Note: Watch folders use backend IngestionService directly.
 */

import { useState, useCallback, useRef } from 'react'
import type { DeliverSettings } from '../components/DeliverControlPanel'

// ============================================================================
// TYPES
// ============================================================================

export interface IngestionRequest {
  /** Absolute paths to source files */
  sourcePaths: string[]
  /** Absolute path to output directory */
  outputDir: string
  /** DeliverSettings to snapshot */
  deliverSettings: DeliverSettings
  /** Engine type: "ffmpeg" or "resolve" */
  engine?: string
  /** Optional legacy preset ID to bind */
  presetId?: string | null
  /** Phase 6: Optional settings preset ID (overrides deliverSettings) */
  settingsPresetId?: string | null
}

export interface IngestionResult {
  success: true
  jobId: string
  taskCount: number
  message: string
}

export interface IngestionError {
  success: false
  error: string
  invalidPaths?: string[]
}

export type IngestionOutcome = IngestionResult | IngestionError

export interface UseIngestionState {
  /** Paths staged for ingestion (pre-job) */
  pendingPaths: string[]
  /** Currently active job ID (post-ingestion) */
  activeJobId: string | null
  /** Loading state during ingestion */
  isIngesting: boolean
  /** Last error message */
  lastError: string | null
}

export interface UseIngestionReturn extends UseIngestionState {
  // Path management
  setPendingPaths: (paths: string[]) => void
  addPendingPaths: (paths: string[]) => void
  removePendingPath: (path: string) => void
  clearPendingPaths: () => void
  
  // Ingestion
  ingest: (request: IngestionRequest) => Promise<IngestionOutcome>
  
  // Active job management
  setActiveJobId: (jobId: string | null) => void
  clearActiveJob: () => void
  
  // Error handling
  clearError: () => void
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function useIngestion(backendUrl: string): UseIngestionReturn {
  // State
  const [pendingPaths, setPendingPathsState] = useState<string[]>([])
  const [activeJobId, setActiveJobIdState] = useState<string | null>(null)
  const [isIngesting, setIsIngesting] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  
  // DOGFOOD FIX: Idempotency guard to prevent duplicate submissions
  // React state updates are async, so rapid clicks can call ingest() before
  // isIngesting=true has been rendered. Use a ref to block immediately.
  const ingestionInFlight = useRef(false)
  
  // Path management
  const setPendingPaths = useCallback((paths: string[]) => {
    console.log('[useIngestion] setPendingPaths called with:', paths)
    setPendingPathsState(paths)
    setLastError(null)
  }, [])
  
  const addPendingPaths = useCallback((paths: string[]) => {
    setPendingPathsState(prev => {
      const combined = [...prev, ...paths]
      // Deduplicate
      return [...new Set(combined)]
    })
    setLastError(null)
  }, [])
  
  const removePendingPath = useCallback((path: string) => {
    setPendingPathsState(prev => prev.filter(p => p !== path))
  }, [])
  
  const clearPendingPaths = useCallback(() => {
    setPendingPathsState([])
  }, [])
  
  // Active job management
  const setActiveJobId = useCallback((jobId: string | null) => {
    setActiveJobIdState(jobId)
  }, [])
  
  const clearActiveJob = useCallback(() => {
    setActiveJobIdState(null)
  }, [])
  
  // Error handling
  const clearError = useCallback(() => {
    setLastError(null)
  }, [])
  
  // Canonical ingestion method
  const ingest = useCallback(async (request: IngestionRequest): Promise<IngestionOutcome> => {
    // DOGFOOD FIX: Idempotency guard — reject duplicate submissions immediately
    if (ingestionInFlight.current) {
      console.debug('[useIngestion] Blocked duplicate submission')
      return { success: false, error: 'Job creation already in progress' }
    }
    ingestionInFlight.current = true
    
    // Pre-flight validation
    if (!request.sourcePaths.length) {
      ingestionInFlight.current = false
      const error = 'At least one source file required'
      setLastError(error)
      return { success: false, error }
    }
    
    // Validate paths are absolute (contain /)
    const invalidPaths = request.sourcePaths.filter(p => !p.includes('/'))
    if (invalidPaths.length > 0) {
      ingestionInFlight.current = false
      const error = `Invalid source paths (must be absolute): ${invalidPaths.join(', ')}`
      setLastError(error)
      return { success: false, error, invalidPaths }
    }
    
    if (!request.outputDir) {
      ingestionInFlight.current = false
      const error = 'Output directory is required'
      setLastError(error)
      return { success: false, error }
    }
    
    setIsIngesting(true)
    setLastError(null)
    
    try {
      // Build request body for backend
      // IMPORTANT: Strip fields that backend doesn't accept (extra="forbid"):
      // - overlay.layers (backend only accepts text_layers, image_watermark, timecode_overlay)
      // - colour (not accepted in Proxy v1)
      const overlayForBackend = request.deliverSettings.overlay ? {
        text_layers: request.deliverSettings.overlay.text_layers,
        image_watermark: request.deliverSettings.overlay.image_watermark,
        timecode_overlay: request.deliverSettings.overlay.timecode_overlay,
        // NOTE: 'layers' field intentionally omitted - backend rejects it
      } : undefined
      
      // NOTE: preset_id is NOT sent to backend because frontend localStorage presets
      // cannot be resolved by the backend. The deliverSettings already contain all
      // the settings from the preset. Only settings_preset_id (backend-synced presets)
      // should be sent.
      const body = {
        source_paths: request.sourcePaths,
        // TRUST STABILISATION: Do NOT send localStorage preset IDs to backend
        // preset_id was for legacy GlobalPreset system which is not used in Alpha
        preset_id: null,
        settings_preset_id: request.settingsPresetId || null,  // Phase 6 backend presets only
        engine: request.engine || 'ffmpeg',
        deliver_settings: {
          output_dir: request.outputDir,
          video: request.deliverSettings.video,
          audio: request.deliverSettings.audio,
          file: request.deliverSettings.file,
          metadata: request.deliverSettings.metadata,
          overlay: overlayForBackend,
          // NOTE: 'colour' field intentionally omitted - backend rejects it in Proxy v1
        },
      }
      
      const response = await fetch(`${backendUrl}/control/jobs/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        // Phase 9F: Ensure error is always a human-readable string
        let error: string
        if (typeof data.detail === 'string') {
          error = data.detail
        } else if (Array.isArray(data.detail)) {
          // FastAPI validation errors are arrays of {loc, msg, type}
          error = data.detail.map((e: { msg?: string; message?: string }) => 
            e.msg || e.message || 'Validation error'
          ).join('; ')
        } else if (typeof data.detail === 'object' && data.detail !== null) {
          error = (data.detail as { message?: string }).message || JSON.stringify(data.detail)
        } else if (typeof data.message === 'string') {
          error = data.message
        } else {
          error = `HTTP ${response.status}`
        }
        setLastError(error)
        return { success: false, error }
      }
      
      // Success: clear pending paths, set active job
      clearPendingPaths()
      setActiveJobIdState(data.job_id)
      
      return {
        success: true,
        jobId: data.job_id,
        taskCount: request.sourcePaths.length,
        message: data.message || `Job created with ${request.sourcePaths.length} clip(s)`,
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error during ingestion'
      setLastError(error)
      return { success: false, error }
    } finally {
      setIsIngesting(false)
      ingestionInFlight.current = false  // DOGFOOD FIX: Reset idempotency guard
    }
  }, [backendUrl, clearPendingPaths])
  
  return {
    // State
    pendingPaths,
    activeJobId,
    isIngesting,
    lastError,
    
    // Path management
    setPendingPaths,
    addPendingPaths,
    removePendingPath,
    clearPendingPaths,
    
    // Ingestion
    ingest,
    
    // Active job management
    setActiveJobId,
    clearActiveJob,
    
    // Error handling
    clearError,
  }
}
