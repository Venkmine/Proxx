/**
 * useSettingsPresets — Backend Settings Preset Management Hook (Phase 6)
 * 
 * Settings presets are IMMUTABLE SNAPSHOTS:
 * - Applied only at job creation (copied, not linked)
 * - Jobs own their settings forever after creation
 * - Editing a preset = duplicate + delete old
 * - No PATCH, no mutation
 * 
 * Phase 7B: Added scope (user/workspace) for visibility:
 * - Scope is metadata only — no behavior differences
 * - User presets: available only to you
 * - Workspace presets: shared with this project
 * 
 * This hook manages Phase 6 backend settings presets,
 * NOT to be confused with the client-side presets in usePresets.ts
 */

import { useState, useEffect, useCallback } from 'react'
import type { DeliverSettings } from '../components/DeliverControlPanel'

// ============================================================================
// TYPES
// ============================================================================

// Phase 7B: Preset scope type
export type PresetScope = 'user' | 'workspace'

export interface SettingsPresetInfo {
  id: string
  name: string
  description: string
  scope: PresetScope  // Phase 7B: user or workspace
  fingerprint: string
  tags: string[]
  created_at: string
  updated_at: string
}

export interface SettingsPresetDetail extends SettingsPresetInfo {
  settings_snapshot: DeliverSettings
}

export interface UseSettingsPresetsReturn {
  // State
  presets: SettingsPresetInfo[]
  loading: boolean
  error: string | null
  
  // Actions
  refreshPresets: () => Promise<void>
  createPreset: (name: string, settings: DeliverSettings, description?: string, scope?: PresetScope) => Promise<SettingsPresetInfo | null>
  duplicatePreset: (presetId: string, newName?: string) => Promise<SettingsPresetInfo | null>
  deletePreset: (presetId: string, force?: boolean) => Promise<{ success: boolean; referencingJobs?: string[] }>
  getPresetDetails: (presetId: string) => Promise<SettingsPresetDetail | null>
}

// ============================================================================
// HOOK
// ============================================================================

export function useSettingsPresets(backendUrl: string): UseSettingsPresetsReturn {
  const [presets, setPresets] = useState<SettingsPresetInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Fetch all presets
  const refreshPresets = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch(`${backendUrl}/control/settings-presets`)
      if (!response.ok) {
        throw new Error(`Failed to fetch presets: ${response.status}`)
      }
      
      const data = await response.json()
      setPresets(data.presets || [])
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to fetch presets'
      setError(message)
      console.error('[useSettingsPresets] Fetch error:', e)
    } finally {
      setLoading(false)
    }
  }, [backendUrl])
  
  // Fetch on mount
  useEffect(() => {
    refreshPresets()
  }, [refreshPresets])
  
  // Create a new preset
  const createPreset = useCallback(async (
    name: string,
    settings: DeliverSettings,
    description: string = '',
    scope: PresetScope = 'user'  // Phase 7B
  ): Promise<SettingsPresetInfo | null> => {
    try {
      const response = await fetch(`${backendUrl}/control/settings-presets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          scope,  // Phase 7B
          settings_snapshot: settings,
          tags: [],
        }),
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.detail || 'Failed to create preset')
      }
      
      if (data.success && data.preset) {
        // Refresh the list
        await refreshPresets()
        return data.preset
      }
      
      return null
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to create preset'
      console.error('[useSettingsPresets] Create error:', message)
      throw e
    }
  }, [backendUrl, refreshPresets])
  
  // Duplicate a preset
  const duplicatePreset = useCallback(async (
    presetId: string,
    newName?: string
  ): Promise<SettingsPresetInfo | null> => {
    try {
      const url = new URL(`${backendUrl}/control/settings-presets/${presetId}/duplicate`)
      if (newName) {
        url.searchParams.set('new_name', newName)
      }
      
      const response = await fetch(url.toString(), {
        method: 'POST',
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.detail || 'Failed to duplicate preset')
      }
      
      if (data.success && data.preset) {
        // Refresh the list
        await refreshPresets()
        return data.preset
      }
      
      return null
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to duplicate preset'
      console.error('[useSettingsPresets] Duplicate error:', message)
      throw e
    }
  }, [backendUrl, refreshPresets])
  
  // Delete a preset
  const deletePreset = useCallback(async (
    presetId: string,
    force: boolean = false
  ): Promise<{ success: boolean; referencingJobs?: string[] }> => {
    try {
      const url = new URL(`${backendUrl}/control/settings-presets/${presetId}`)
      if (force) {
        url.searchParams.set('force', 'true')
      }
      
      const response = await fetch(url.toString(), {
        method: 'DELETE',
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.detail || 'Failed to delete preset')
      }
      
      if (data.success) {
        // Refresh the list
        await refreshPresets()
      }
      
      return {
        success: data.success,
        referencingJobs: data.referencing_job_ids,
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to delete preset'
      console.error('[useSettingsPresets] Delete error:', message)
      throw e
    }
  }, [backendUrl, refreshPresets])
  
  // Get full preset details
  const getPresetDetails = useCallback(async (
    presetId: string
  ): Promise<SettingsPresetDetail | null> => {
    try {
      const response = await fetch(`${backendUrl}/control/settings-presets/${presetId}`)
      
      if (!response.ok) {
        throw new Error(`Failed to fetch preset: ${response.status}`)
      }
      
      return await response.json()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to fetch preset'
      console.error('[useSettingsPresets] Get details error:', message)
      return null
    }
  }, [backendUrl])
  
  return {
    presets,
    loading,
    error,
    refreshPresets,
    createPreset,
    duplicatePreset,
    deletePreset,
    getPresetDetails,
  }
}

export default useSettingsPresets
