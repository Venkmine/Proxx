/**
 * Store Registry for QC Inspection
 * 
 * Exposes Zustand stores to window for INTENT_030 state integrity checks.
 * This is a QC-only feature that allows Playwright tests to inspect store state.
 * 
 * CRITICAL:
 * - Only enabled in QC mode (E2E_TEST=true or QC_MODE=true)
 * - Does NOT modify store behavior
 * - Read-only access for inspection
 */

import { useSourceSelectionStore } from './sourceSelectionStore'
import { useV2ModeStore } from './v2ModeStore'
import { usePresetStore } from './presetStore'
import { useWorkspaceModeStore } from './workspaceModeStore'

declare global {
  interface Window {
    __ZUSTAND_STORES__?: {
      sourceSelection: typeof useSourceSelectionStore
      v2Mode: typeof useV2ModeStore
      preset: typeof usePresetStore
      workspaceMode: typeof useWorkspaceModeStore
    }
  }
}

/**
 * Register stores for QC inspection.
 * Call this once during app initialization.
 */
export function registerStoresForQC(): void {
  const isQCMode = 
    import.meta.env.MODE === 'qc' ||
    (typeof process !== 'undefined' && process.env.E2E_TEST === 'true') ||
    (typeof process !== 'undefined' && process.env.QC_MODE === 'true')
  
  if (!isQCMode) {
    console.log('[QC] Not in QC mode, skipping store registration')
    return
  }
  
  if (typeof window === 'undefined') {
    console.warn('[QC] Cannot register stores: window not available')
    return
  }
  
  window.__ZUSTAND_STORES__ = {
    sourceSelection: useSourceSelectionStore,
    v2Mode: useV2ModeStore,
    preset: usePresetStore,
    workspaceMode: useWorkspaceModeStore,
  }
  
  console.log('[QC] Stores registered for inspection:', Object.keys(window.__ZUSTAND_STORES__))
}
