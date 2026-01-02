/**
 * usePreflight — Preflight Validation Hook
 * 
 * RATIONALE:
 * Forge is a deterministic proxy engine, not a media browser.
 * Preflight is the ONLY transition from SELECTED_UNVALIDATED to READY.
 * 
 * This hook:
 * 1. Calls backend preflight API to validate selected paths
 * 2. Updates SourceSelectionStore state based on result
 * 3. Does NOT attempt to enumerate files before preflight
 * 
 * INVARIANTS:
 * - Preflight runs ONLY when state === SELECTED_UNVALIDATED or PREFLIGHT_FAILED
 * - On success: state → READY
 * - On failure: state → PREFLIGHT_FAILED (persistent until user action)
 * - UI must not speculate about file contents before preflight
 */

import { useCallback, useRef } from 'react'
import { 
  useSourceSelectionStore,
  SourceSelectionState,
  type PreflightResult,
  type PreflightError,
} from '../stores/sourceSelectionStore'
import { 
  recordPreflightStarted, 
  recordPreflightSuccess, 
  recordPreflightFailed 
} from '../utils/uiEventLog'

interface UsePreflightReturn {
  /** Run preflight validation on selected paths */
  runPreflight: () => Promise<boolean>
  /** Whether preflight can be triggered in current state */
  canRunPreflight: boolean
  /** Whether preflight is currently running */
  isRunning: boolean
}

/**
 * usePreflight — Validate sources before job creation.
 * 
 * Preflight is mandatory. No job creation without preflight success.
 */
export function usePreflight(backendUrl: string): UsePreflightReturn {
  // Idempotency guard
  const preflightInFlight = useRef(false)
  
  // Get store state and actions
  const {
    state,
    selectedPaths,
    outputDirectory,
    startPreflight,
    preflightSuccess,
    preflightFailed,
  } = useSourceSelectionStore()
  
  // Derived state
  const canRun = state === SourceSelectionState.SELECTED_UNVALIDATED 
    || state === SourceSelectionState.PREFLIGHT_FAILED
  const isRunning = state === SourceSelectionState.PREFLIGHT_RUNNING
  
  const runPreflight = useCallback(async (): Promise<boolean> => {
    // Guard: prevent duplicate calls
    if (preflightInFlight.current) {
      console.debug('[usePreflight] Blocked duplicate preflight')
      return false
    }
    
    // Guard: check state
    if (!canRun) {
      console.warn('[usePreflight] Cannot run preflight in state:', state)
      return false
    }
    
    // Guard: check paths
    if (selectedPaths.length === 0) {
      preflightFailed({ message: 'No source paths selected' })
      return false
    }
    
    preflightInFlight.current = true
    startPreflight()
    recordPreflightStarted(selectedPaths.length)
    
    try {
      const response = await fetch(`${backendUrl}/v2/preflight`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_paths: selectedPaths,
          output_directory: outputDirectory || undefined,
        }),
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        // Parse error from response
        const error: PreflightError = {
          message: typeof data.detail === 'string' 
            ? data.detail 
            : data.message || `Preflight failed (HTTP ${response.status})`,
          invalidPaths: data.invalid_paths,
          detail: data.error_detail,
        }
        preflightFailed(error)
        recordPreflightFailed(error.message, error.invalidPaths)
        return false
      }
      
      // Parse success result
      const result: PreflightResult = {
        totalFiles: data.total_files || 0,
        validFiles: data.valid_files || data.total_files || 0,
        skippedFiles: data.skipped_files || 0,
        warnings: data.warnings || [],
      }
      
      preflightSuccess(result)
      recordPreflightSuccess(result.validFiles, result.totalFiles)
      return true
      
    } catch (err) {
      const error: PreflightError = {
        message: err instanceof Error ? err.message : 'Preflight request failed',
        detail: String(err),
      }
      preflightFailed(error)
      recordPreflightFailed(error.message)
      return false
    } finally {
      preflightInFlight.current = false
    }
  }, [
    backendUrl, 
    canRun, 
    state, 
    selectedPaths, 
    outputDirectory,
    startPreflight, 
    preflightSuccess, 
    preflightFailed
  ])
  
  return {
    runPreflight,
    canRunPreflight: canRun,
    isRunning,
  }
}
