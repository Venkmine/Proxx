/**
 * workspaceModeStore — Centralized Workspace Mode State (Zustand)
 * 
 * This store provides the SINGLE SOURCE OF TRUTH for workspace mode.
 * WorkspaceMode is AUTHORITATIVE, not advisory.
 * 
 * Rules:
 * - App.tsx MUST branch layout based on workspaceMode
 * - Child components MUST NOT infer layout from screen size or content
 * - No panel may "adapt itself" without checking WorkspaceMode
 * - If a layout decision does not reference workspaceMode, it is INCORRECT
 * 
 * Modes:
 * - "configure": Tune settings, prepare jobs (default)
 * - "design": Spatial visual work (Burn-ins / Watermark)
 * - "execute": Monitor progress, manage jobs
 */

import { create } from 'zustand'

// ============================================================================
// TYPES
// ============================================================================

/**
 * WorkspaceMode determines layout, visibility, and sizing — not just component rendering.
 */
export type WorkspaceMode = 'configure' | 'design' | 'execute'

export interface WorkspaceModeState {
  // Current workspace mode (authoritative)
  workspaceMode: WorkspaceMode
  
  // Previous mode for restoration (e.g., exiting design mode)
  previousMode: WorkspaceMode
  
  // Actions
  setWorkspaceMode: (mode: WorkspaceMode) => void
  
  // Convenience: Enter design mode (saves previous mode for restoration)
  enterDesignMode: () => void
  
  // Convenience: Exit design mode (restores previous mode)
  exitDesignMode: () => void
  
  // Convenience: Enter execute mode
  enterExecuteMode: () => void
  
  // Convenience: Return to configure mode
  returnToConfigureMode: () => void
}

// ============================================================================
// STORE
// ============================================================================

export const useWorkspaceModeStore = create<WorkspaceModeState>((set) => ({
  // Initial state
  workspaceMode: 'configure',
  previousMode: 'configure',
  
  // Direct mode setter
  setWorkspaceMode: (mode) => set((state) => ({
    previousMode: state.workspaceMode,
    workspaceMode: mode,
  })),
  
  // Enter design mode (saves current mode for restoration)
  enterDesignMode: () => set((state) => ({
    previousMode: state.workspaceMode,
    workspaceMode: 'design',
  })),
  
  // Exit design mode (restores previous mode, typically 'configure')
  exitDesignMode: () => set((state) => ({
    workspaceMode: state.previousMode !== 'design' ? state.previousMode : 'configure',
    // Keep previousMode as-is for history
  })),
  
  // Enter execute mode
  enterExecuteMode: () => set((state) => ({
    previousMode: state.workspaceMode,
    workspaceMode: 'execute',
  })),
  
  // Return to configure mode (standard exit from execute)
  returnToConfigureMode: () => set({
    previousMode: 'configure',
    workspaceMode: 'configure',
  }),
}))

export default useWorkspaceModeStore
