/**
 * usePresets — Client-side Preset Management Hook (Alpha)
 * 
 * ⚠️ ALPHA LIMITATION:
 * Presets are stored in localStorage only (client-side).
 * No backend persistence, no sync across devices.
 * This is intentional for Alpha — keeps implementation simple.
 * 
 * Features:
 * - Create preset from current settings
 * - Rename preset
 * - Duplicate preset
 * - Delete preset
 * - Edit preset with save/cancel
 * - Track unsaved changes (isDirty)
 * - Export/Import preset JSON
 * 
 * Presets are snapshots, not live bindings.
 * "No preset (use current settings)" is explicitly supported.
 */

import { useState, useEffect, useCallback } from 'react'
import type { DeliverSettings } from '../components/DeliverControlPanel'

// ============================================================================
// TYPES
// ============================================================================

export interface Preset {
  id: string
  name: string
  description?: string
  createdAt: string
  updatedAt: string
  settings: DeliverSettings
}

export interface PresetManagerState {
  presets: Preset[]
  selectedPresetId: string | null
  isDirty: boolean
  editingPresetId: string | null
  originalSettings: DeliverSettings | null
}

export interface UsePresetsReturn {
  // State
  presets: Preset[]
  selectedPresetId: string | null
  isDirty: boolean
  editingPresetId: string | null
  
  // Actions
  createPreset: (name: string, settings: DeliverSettings, description?: string) => Preset | { error: string }
  updatePreset: (id: string, updates: Partial<Pick<Preset, 'name' | 'description' | 'settings'>>) => boolean
  renamePreset: (id: string, newName: string) => boolean | { error: string }
  duplicatePreset: (id: string, newName?: string) => Preset | null
  deletePreset: (id: string) => boolean
  selectPreset: (id: string | null) => void
  getPreset: (id: string) => Preset | undefined
  
  // Save operations (new)
  savePreset: (settings: DeliverSettings) => boolean
  saveAsPreset: (name: string, settings: DeliverSettings, description?: string) => Preset | { error: string }
  
  // Validation (new)
  isNameTaken: (name: string, excludeId?: string) => boolean
  
  // Edit mode
  startEditing: (id: string) => void
  saveEditing: (settings: DeliverSettings) => boolean
  cancelEditing: () => void
  
  // Dirty tracking
  markDirty: () => void
  clearDirty: () => void
  checkDirty: (currentSettings: DeliverSettings) => boolean
  
  // Import/Export
  exportPresets: () => string
  importPresets: (json: string) => { success: boolean; count: number; error?: string }
  exportSinglePreset: (id: string) => string | null
  importSinglePreset: (json: string) => { success: boolean; preset?: Preset; error?: string }
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEY = 'awaire_proxy_presets'
const SELECTED_PRESET_KEY = 'awaire_proxy_selected_preset'

// ============================================================================
// UTILITIES
// ============================================================================

function generateId(): string {
  return `preset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

function loadPresetsFromStorage(): Preset[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    const parsed = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []
    // Validate each preset has required fields
    return parsed.filter((p): p is Preset => 
      typeof p === 'object' &&
      typeof p.id === 'string' &&
      typeof p.name === 'string' &&
      typeof p.settings === 'object'
    )
  } catch (e) {
    console.error('Failed to load presets from localStorage:', e)
    return []
  }
}

function savePresetsToStorage(presets: Preset[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets))
  } catch (e) {
    console.error('Failed to save presets to localStorage:', e)
  }
}

function loadSelectedPresetId(): string | null {
  try {
    return localStorage.getItem(SELECTED_PRESET_KEY)
  } catch {
    return null
  }
}

function saveSelectedPresetId(id: string | null): void {
  try {
    if (id) {
      localStorage.setItem(SELECTED_PRESET_KEY, id)
    } else {
      localStorage.removeItem(SELECTED_PRESET_KEY)
    }
  } catch (e) {
    console.error('Failed to save selected preset ID:', e)
  }
}

// ============================================================================
// HOOK
// ============================================================================

export function usePresets(): UsePresetsReturn {
  const [presets, setPresets] = useState<Preset[]>([])
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null)
  // Store original settings for cancel editing and dirty comparison
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_originalSettings, setOriginalSettings] = useState<DeliverSettings | null>(null)

  // Load presets from localStorage on mount
  useEffect(() => {
    const loaded = loadPresetsFromStorage()
    setPresets(loaded)
    
    const savedSelectedId = loadSelectedPresetId()
    if (savedSelectedId && loaded.some(p => p.id === savedSelectedId)) {
      setSelectedPresetId(savedSelectedId)
    }
  }, [])

  // Persist presets to localStorage on change
  useEffect(() => {
    savePresetsToStorage(presets)
  }, [presets])

  // Persist selected preset ID on change
  useEffect(() => {
    saveSelectedPresetId(selectedPresetId)
  }, [selectedPresetId])

  // ============================================
  // Name Validation
  // ============================================

  const isNameTaken = useCallback((name: string, excludeId?: string): boolean => {
    const normalized = name.trim().toLowerCase()
    return presets.some(p => 
      p.name.trim().toLowerCase() === normalized && 
      p.id !== excludeId
    )
  }, [presets])

  // ============================================
  // CRUD Operations
  // ============================================

  const createPreset = useCallback((name: string, settings: DeliverSettings, description?: string): Preset | { error: string } => {
    const trimmedName = name.trim() || 'Untitled Preset'
    
    // Check for duplicate names
    if (isNameTaken(trimmedName)) {
      return { error: `A preset named "${trimmedName}" already exists` }
    }
    
    const now = new Date().toISOString()
    const preset: Preset = {
      id: generateId(),
      name: trimmedName,
      description,
      createdAt: now,
      updatedAt: now,
      settings: JSON.parse(JSON.stringify(settings)), // Deep copy
    }
    setPresets(prev => [...prev, preset])
    return preset
  }, [isNameTaken])

  const updatePreset = useCallback((id: string, updates: Partial<Pick<Preset, 'name' | 'description' | 'settings'>>): boolean => {
    let found = false
    setPresets(prev => prev.map(p => {
      if (p.id === id) {
        found = true
        return {
          ...p,
          ...updates,
          settings: updates.settings ? JSON.parse(JSON.stringify(updates.settings)) : p.settings,
          updatedAt: new Date().toISOString(),
        }
      }
      return p
    }))
    return found
  }, [])

  const renamePreset = useCallback((id: string, newName: string): boolean | { error: string } => {
    const trimmedName = newName.trim() || 'Untitled Preset'
    
    // Check for duplicate names (excluding the preset being renamed)
    if (isNameTaken(trimmedName, id)) {
      return { error: `A preset named "${trimmedName}" already exists` }
    }
    
    return updatePreset(id, { name: trimmedName })
  }, [updatePreset, isNameTaken])

  const duplicatePreset = useCallback((id: string, newName?: string): Preset | null => {
    const original = presets.find(p => p.id === id)
    if (!original) return null
    
    const name = newName?.trim() || `${original.name} (Copy)`
    const result = createPreset(name, original.settings, original.description)
    // If there's a duplicate name error, return null
    if ('error' in result) return null
    return result
  }, [presets, createPreset])

  const deletePreset = useCallback((id: string): boolean => {
    const exists = presets.some(p => p.id === id)
    if (!exists) return false
    
    setPresets(prev => prev.filter(p => p.id !== id))
    
    // Clear selection if deleted preset was selected
    if (selectedPresetId === id) {
      setSelectedPresetId(null)
    }
    
    // Cancel editing if deleted preset was being edited
    if (editingPresetId === id) {
      setEditingPresetId(null)
      setOriginalSettings(null)
    }
    
    return true
  }, [presets, selectedPresetId, editingPresetId])

  const selectPreset = useCallback((id: string | null): void => {
    setSelectedPresetId(id)
    setIsDirty(false)
  }, [])

  const getPreset = useCallback((id: string): Preset | undefined => {
    return presets.find(p => p.id === id)
  }, [presets])

  // ============================================
  // Edit Mode
  // ============================================

  const startEditing = useCallback((id: string): void => {
    const preset = presets.find(p => p.id === id)
    if (!preset) return
    
    setEditingPresetId(id)
    setOriginalSettings(JSON.parse(JSON.stringify(preset.settings)))
    setIsDirty(false)
  }, [presets])

  const saveEditing = useCallback((settings: DeliverSettings): boolean => {
    if (!editingPresetId) return false
    
    const success = updatePreset(editingPresetId, { settings })
    if (success) {
      setEditingPresetId(null)
      setOriginalSettings(null)
      setIsDirty(false)
    }
    return success
  }, [editingPresetId, updatePreset])

  const cancelEditing = useCallback((): void => {
    setEditingPresetId(null)
    setOriginalSettings(null)
    setIsDirty(false)
  }, [])

  // ============================================
  // Dirty Tracking
  // ============================================

  const markDirty = useCallback((): void => {
    setIsDirty(true)
  }, [])

  const clearDirty = useCallback((): void => {
    setIsDirty(false)
  }, [])

  // Check if current settings differ from selected preset
  const checkDirty = useCallback((currentSettings: DeliverSettings): boolean => {
    if (!selectedPresetId) {
      // No preset selected - cannot be "dirty" relative to a preset
      return false
    }
    
    const preset = presets.find(p => p.id === selectedPresetId)
    if (!preset) return false
    
    // Compare serialized settings
    const currentJson = JSON.stringify(currentSettings)
    const presetJson = JSON.stringify(preset.settings)
    return currentJson !== presetJson
  }, [selectedPresetId, presets])

  // Save current settings to the selected preset
  const savePreset = useCallback((settings: DeliverSettings): boolean => {
    if (!selectedPresetId) return false
    
    const success = updatePreset(selectedPresetId, { settings })
    if (success) {
      setIsDirty(false)
      setOriginalSettings(JSON.parse(JSON.stringify(settings)))
    }
    return success
  }, [selectedPresetId, updatePreset])

  // Save current settings as a new preset (Save As)
  const saveAsPreset = useCallback((name: string, settings: DeliverSettings, description?: string): Preset | { error: string } => {
    const result = createPreset(name, settings, description)
    
    // If successful, select the new preset
    if ('id' in result) {
      setSelectedPresetId(result.id)
      setIsDirty(false)
      setOriginalSettings(JSON.parse(JSON.stringify(settings)))
    }
    
    return result
  }, [createPreset])

  // ============================================
  // Import/Export
  // ============================================

  const exportPresets = useCallback((): string => {
    return JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      presets,
    }, null, 2)
  }, [presets])

  const importPresets = useCallback((json: string): { success: boolean; count: number; error?: string } => {
    try {
      const parsed = JSON.parse(json)
      
      // Handle both wrapped format and raw array
      const presetsArray = Array.isArray(parsed) ? parsed : parsed.presets
      
      if (!Array.isArray(presetsArray)) {
        return { success: false, count: 0, error: 'Invalid format: expected presets array' }
      }
      
      // Validate and generate new IDs for imported presets
      const validPresets: Preset[] = []
      for (const p of presetsArray) {
        if (typeof p.name === 'string' && typeof p.settings === 'object') {
          validPresets.push({
            id: generateId(), // New ID to avoid conflicts
            name: p.name,
            description: p.description,
            createdAt: p.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            settings: p.settings,
          })
        }
      }
      
      if (validPresets.length === 0) {
        return { success: false, count: 0, error: 'No valid presets found in import data' }
      }
      
      setPresets(prev => [...prev, ...validPresets])
      return { success: true, count: validPresets.length }
    } catch (e) {
      return { success: false, count: 0, error: `JSON parse error: ${e instanceof Error ? e.message : 'Unknown'}` }
    }
  }, [])

  const exportSinglePreset = useCallback((id: string): string | null => {
    const preset = presets.find(p => p.id === id)
    if (!preset) return null
    
    return JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      preset,
    }, null, 2)
  }, [presets])

  const importSinglePreset = useCallback((json: string): { success: boolean; preset?: Preset; error?: string } => {
    try {
      const parsed = JSON.parse(json)
      
      // Handle both wrapped format and direct preset
      const presetData = parsed.preset || parsed
      
      if (typeof presetData.name !== 'string' || typeof presetData.settings !== 'object') {
        return { success: false, error: 'Invalid preset format' }
      }
      
      const result = createPreset(presetData.name, presetData.settings, presetData.description)
      if ('error' in result) {
        return { success: false, error: result.error }
      }
      return { success: true, preset: result }
    } catch (e) {
      return { success: false, error: `JSON parse error: ${e instanceof Error ? e.message : 'Unknown'}` }
    }
  }, [createPreset])

  return {
    presets,
    selectedPresetId,
    isDirty,
    editingPresetId,
    createPreset,
    updatePreset,
    renamePreset,
    duplicatePreset,
    deletePreset,
    selectPreset,
    getPreset,
    savePreset,
    saveAsPreset,
    isNameTaken,
    startEditing,
    saveEditing,
    cancelEditing,
    markDirty,
    clearDirty,
    checkDirty,
    exportPresets,
    importPresets,
    exportSinglePreset,
    importSinglePreset,
  }
}

export default usePresets
