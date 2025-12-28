/**
 * v2ModeStore — V2 Engine Mode State (Zustand)
 * 
 * V2 Step 3: UI as JobSpec Compiler (Thin Client)
 * 
 * This store manages the V2 mode toggle and execution state.
 * When V2 mode is enabled:
 * - UI compiles settings into a JobSpec
 * - JobSpec is sent to POST /v2/execute_jobspec
 * - Result is displayed from JobExecutionResult
 * 
 * Honesty invariants:
 * - No progress percent/ETA during encoding
 * - Shows only: "Encoding..." then final result
 * - No cancel (not supported in sync flow)
 */

import { create } from 'zustand'
import { FEATURE_FLAGS } from '../config/featureFlags'

// ============================================================================
// TYPES
// ============================================================================

export type V2ExecutionStatus = 'idle' | 'encoding' | 'completed' | 'failed'

export interface V2ClipResult {
  source_path: string
  resolved_output_path: string
  status: 'COMPLETED' | 'FAILED'
  failure_reason: string | null
  output_size_bytes: number | null
  duration_seconds: number | null
}

export interface V2JobResult {
  job_id: string
  final_status: 'COMPLETED' | 'FAILED' | 'PARTIAL'
  clips: V2ClipResult[]
  started_at: string
  completed_at: string | null
  duration_seconds: number | null
  total_clips: number
  completed_clips: number
  failed_clips: number
}

export interface V2ModeState {
  // Feature toggle (DEV-only)
  isV2ModeEnabled: boolean
  
  // Execution state
  v2ExecutionStatus: V2ExecutionStatus
  
  // Latest result (null if no execution yet)
  v2LastResult: V2JobResult | null
  
  // Error message (for validation or unexpected failures)
  v2Error: string | null
  
  // Actions
  toggleV2Mode: () => void
  setV2ModeEnabled: (enabled: boolean) => void
  
  // Execution lifecycle
  startV2Execution: () => void
  setV2Result: (result: V2JobResult) => void
  setV2Error: (error: string) => void
  clearV2Result: () => void
}

// ============================================================================
// STORE
// ============================================================================

export const useV2ModeStore = create<V2ModeState>((set) => ({
  // Initial state from feature flag
  isV2ModeEnabled: FEATURE_FLAGS.V2_MODE_ENABLED,
  
  v2ExecutionStatus: 'idle',
  v2LastResult: null,
  v2Error: null,
  
  // Toggle V2 mode
  toggleV2Mode: () => set((state) => ({
    isV2ModeEnabled: !state.isV2ModeEnabled,
    // Clear any stale result when toggling
    v2LastResult: null,
    v2Error: null,
    v2ExecutionStatus: 'idle',
  })),
  
  setV2ModeEnabled: (enabled: boolean) => set({
    isV2ModeEnabled: enabled,
    v2LastResult: null,
    v2Error: null,
    v2ExecutionStatus: 'idle',
  }),
  
  // Execution lifecycle
  startV2Execution: () => set({
    v2ExecutionStatus: 'encoding',
    v2LastResult: null,
    v2Error: null,
  }),
  
  setV2Result: (result: V2JobResult) => set({
    v2ExecutionStatus: result.final_status === 'COMPLETED' ? 'completed' : 'failed',
    v2LastResult: result,
    v2Error: null,
  }),
  
  setV2Error: (error: string) => set({
    v2ExecutionStatus: 'failed',
    v2Error: error,
  }),
  
  clearV2Result: () => set({
    v2ExecutionStatus: 'idle',
    v2LastResult: null,
    v2Error: null,
  }),
}))
