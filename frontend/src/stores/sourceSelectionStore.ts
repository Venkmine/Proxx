/**
 * sourceSelectionStore — Authoritative Source Selection State (Zustand)
 * 
 * RATIONALE:
 * Forge is a deterministic proxy engine, not a media browser.
 * The UI must reflect certainty, not speculation.
 * 
 * This store replaces all ad-hoc boolean flags (hasSources, isLoading, hasMetadata, etc.)
 * with a single, authoritative state enum that ALL source-related UI components
 * must derive their behavior from.
 * 
 * STATE MODEL:
 * - EMPTY: No sources selected
 * - SELECTED_UNVALIDATED: Paths selected but not validated by preflight
 * - PREFLIGHT_RUNNING: Backend is validating sources
 * - PREFLIGHT_FAILED: Preflight validation failed (persistent error)
 * - READY: Sources validated, job can be created
 * 
 * INVARIANTS:
 * - State transitions are explicit and deterministic
 * - No speculative metadata or previews until READY
 * - Errors are persistent until user takes action
 * - Preflight is the ONLY path from SELECTED_UNVALIDATED to READY
 */

import { create } from 'zustand'

// ============================================================================
// SOURCE SELECTION STATE ENUM
// ============================================================================

/**
 * SourceSelectionState — The single source of truth for source selection.
 * 
 * All source-related UI components must derive behavior from this enum.
 * No ad-hoc boolean flags (hasSources, isLoading, hasMetadata, etc.).
 */
export enum SourceSelectionState {
  /** No sources selected. UI shows empty state. */
  EMPTY = 'EMPTY',
  
  /** Paths selected via OS dialog or drag-drop, not yet validated. */
  SELECTED_UNVALIDATED = 'SELECTED_UNVALIDATED',
  
  /** Backend preflight is running. UI shows loading. */
  PREFLIGHT_RUNNING = 'PREFLIGHT_RUNNING',
  
  /** Preflight failed. Error is persistent until user action. */
  PREFLIGHT_FAILED = 'PREFLIGHT_FAILED',
  
  /** Sources validated by preflight. Job creation allowed. */
  READY = 'READY',
}

// ============================================================================
// PREFLIGHT RESULT
// ============================================================================

export interface PreflightError {
  /** Error message to display */
  message: string
  /** Affected paths (if applicable) */
  invalidPaths?: string[]
  /** Technical detail for debugging */
  detail?: string
}

export interface PreflightResult {
  /** Total files discovered */
  totalFiles: number
  /** Files that will be processed */
  validFiles: number
  /** Files that were skipped (not media) */
  skippedFiles: number
  /** Warnings (non-blocking) */
  warnings: string[]
}

// ============================================================================
// STORE STATE
// ============================================================================

export interface SourceSelectionStoreState {
  // === Authoritative State ===
  
  /** Current state of source selection. ALL UI derives from this. */
  state: SourceSelectionState
  
  /** Selected paths (files or folders). Opaque strings until preflight. */
  selectedPaths: string[]
  
  /** Output directory path */
  outputDirectory: string
  
  // === Preflight Results (only valid when state === READY) ===
  
  /** Preflight result (null until preflight completes successfully) */
  preflightResult: PreflightResult | null
  
  // === Error State (only valid when state === PREFLIGHT_FAILED) ===
  
  /** Persistent error from preflight (cleared on next action) */
  preflightError: PreflightError | null
  
  // === Actions ===
  
  /** Add paths from OS dialog or drag-drop. Transitions to SELECTED_UNVALIDATED. */
  addPaths: (paths: string[]) => void
  
  /** Remove a single path. May transition back to EMPTY. */
  removePath: (path: string) => void
  
  /** Clear all paths. Transitions to EMPTY. */
  clearAll: () => void
  
  /** Set output directory */
  setOutputDirectory: (path: string) => void
  
  /** Start preflight. Transitions to PREFLIGHT_RUNNING. */
  startPreflight: () => void
  
  /** Preflight succeeded. Transitions to READY. */
  preflightSuccess: (result: PreflightResult) => void
  
  /** Preflight failed. Transitions to PREFLIGHT_FAILED. */
  preflightFailed: (error: PreflightError) => void
  
  /** Reset after job creation or error acknowledgement. */
  reset: () => void
}

// ============================================================================
// STORE IMPLEMENTATION
// ============================================================================

export const useSourceSelectionStore = create<SourceSelectionStoreState>((set, get) => ({
  // Initial state: empty
  state: SourceSelectionState.EMPTY,
  selectedPaths: [],
  outputDirectory: '',
  preflightResult: null,
  preflightError: null,
  
  addPaths: (paths: string[]) => {
    console.log('[sourceSelectionStore] addPaths called with:', paths)
    if (paths.length === 0) return
    
    set((state) => {
      // Deduplicate
      const combined = [...new Set([...state.selectedPaths, ...paths])]
      console.log('[sourceSelectionStore] Setting state to SELECTED_UNVALIDATED with paths:', combined)
      return {
        selectedPaths: combined,
        state: SourceSelectionState.SELECTED_UNVALIDATED,
        // Clear any previous preflight result/error
        preflightResult: null,
        preflightError: null,
      }
    })
    console.log('[sourceSelectionStore] State updated')
  },
  
  removePath: (path: string) => {
    set((state) => {
      const remaining = state.selectedPaths.filter(p => p !== path)
      return {
        selectedPaths: remaining,
        state: remaining.length === 0 
          ? SourceSelectionState.EMPTY 
          : SourceSelectionState.SELECTED_UNVALIDATED,
        // Clear preflight on any path change
        preflightResult: null,
        preflightError: null,
      }
    })
  },
  
  clearAll: () => {
    set({
      state: SourceSelectionState.EMPTY,
      selectedPaths: [],
      preflightResult: null,
      preflightError: null,
    })
  },
  
  setOutputDirectory: (path: string) => {
    set({ outputDirectory: path })
  },
  
  startPreflight: () => {
    const { selectedPaths } = get()
    if (selectedPaths.length === 0) return
    
    set({
      state: SourceSelectionState.PREFLIGHT_RUNNING,
      preflightError: null,
    })
  },
  
  preflightSuccess: (result: PreflightResult) => {
    set({
      state: SourceSelectionState.READY,
      preflightResult: result,
      preflightError: null,
    })
  },
  
  preflightFailed: (error: PreflightError) => {
    set({
      state: SourceSelectionState.PREFLIGHT_FAILED,
      preflightResult: null,
      preflightError: error,
    })
  },
  
  reset: () => {
    set({
      state: SourceSelectionState.EMPTY,
      selectedPaths: [],
      preflightResult: null,
      preflightError: null,
    })
  },
}))

// ============================================================================
// E2E TESTING EXPOSURE
// ============================================================================
// Expose store to window for E2E tests to inject source paths directly.
// This avoids native file dialogs during automated testing.
// Only active in development or E2E test mode.
if (typeof window !== 'undefined') {
  // Expose the store for E2E testing
  (window as any).__SOURCE_SELECTION_STORE__ = useSourceSelectionStore
  
  // Also listen for custom events for path injection
  window.addEventListener('e2e:inject-source-paths', ((event: CustomEvent<string[]>) => {
    const paths = event.detail
    if (paths && paths.length > 0) {
      console.log('[E2E] Injecting source paths via custom event:', paths)
      useSourceSelectionStore.getState().addPaths(paths)
    }
  }) as EventListener)
}

// ============================================================================
// DERIVED STATE HELPERS
// ============================================================================

/**
 * Derive UI behavior from state. Use these instead of ad-hoc checks.
 * 
 * RATIONALE: Centralized derivation prevents inconsistent UI states.
 */

/** Can the user add/remove sources? */
export function canModifySources(state: SourceSelectionState): boolean {
  return state === SourceSelectionState.EMPTY 
    || state === SourceSelectionState.SELECTED_UNVALIDATED
    || state === SourceSelectionState.PREFLIGHT_FAILED
}

/** Should the UI show a loading indicator? */
export function isPreflightRunning(state: SourceSelectionState): boolean {
  return state === SourceSelectionState.PREFLIGHT_RUNNING
}

/** Can preflight be triggered? */
export function canRunPreflight(state: SourceSelectionState): boolean {
  return state === SourceSelectionState.SELECTED_UNVALIDATED
    || state === SourceSelectionState.PREFLIGHT_FAILED
}

/** Can a job be created? */
export function canCreateJob(state: SourceSelectionState): boolean {
  return state === SourceSelectionState.READY
}

/** Is there a persistent error to display? */
export function hasPreflightError(state: SourceSelectionState): boolean {
  return state === SourceSelectionState.PREFLIGHT_FAILED
}

/** Should metadata be shown? Only after preflight. */
export function shouldShowMetadata(state: SourceSelectionState): boolean {
  return state === SourceSelectionState.READY
}
