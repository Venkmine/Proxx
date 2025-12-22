/**
 * presetStore — Centralized Preset State (Zustand)
 * 
 * This store provides the single source of truth for active preset state.
 * It manages UI-only state:
 * - activePresetId: Currently selected/editing preset
 * - isDirty: Whether unsaved changes exist
 * - isVisualPreviewModalOpen: Whether the Visual Preview modal is open
 * 
 * Persistence (localStorage, import/export) remains in usePresets.ts.
 * This store is strictly UI state coordination.
 * 
 * NOTE: Visual Preview Modal REPLACES BurnInsEditor and WorkspaceMode='design'.
 * There is ONE visual editing system (the modal).
 */

import { create } from 'zustand'

// ============================================================================
// TYPES
// ============================================================================

export interface PresetStoreState {
  // Core state
  activePresetId: string | null
  isDirty: boolean
  
  // Visual Preview Modal state (REPLACES BurnInsEditor)
  isVisualPreviewModalOpen: boolean
  
  // Legacy: kept for backwards compatibility during transition
  // TODO: Remove after confirming no components use this
  isBurnInsEditorOpen: boolean
  
  // Actions
  setActivePresetId: (id: string | null) => void
  markDirty: () => void
  clearDirty: () => void
  
  // Visual Preview Modal (new unified visual editor)
  openVisualPreviewModal: () => void
  closeVisualPreviewModal: () => void
  
  // Legacy: Burn-ins editor (deprecated, kept for transition)
  openBurnInsEditor: () => void
  closeBurnInsEditor: () => void
}

// ============================================================================
// STORE
// ============================================================================

export const usePresetStore = create<PresetStoreState>((set) => ({
  // Initial state
  activePresetId: null,
  isDirty: false,
  isVisualPreviewModalOpen: false,
  isBurnInsEditorOpen: false, // Legacy, kept for transition
  
  // Actions
  setActivePresetId: (id) => set({ 
    activePresetId: id, 
    isDirty: false // Selecting a preset clears dirty state
  }),
  
  markDirty: () => set({ isDirty: true }),
  
  clearDirty: () => set({ isDirty: false }),
  
  // Visual Preview Modal — new unified visual editor
  openVisualPreviewModal: () => set({ isVisualPreviewModalOpen: true }),
  closeVisualPreviewModal: () => set({ isVisualPreviewModalOpen: false }),
  
  // Legacy: Burn-ins editor (deprecated, now just opens modal)
  // These are kept for backwards compatibility during transition
  openBurnInsEditor: () => set({ 
    isBurnInsEditorOpen: true,
    isVisualPreviewModalOpen: true // Forward to new modal
  }),
  
  closeBurnInsEditor: () => set({ 
    isBurnInsEditorOpen: false,
    isVisualPreviewModalOpen: false
  }),
}))

export default usePresetStore
