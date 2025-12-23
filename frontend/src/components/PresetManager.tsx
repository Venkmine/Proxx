/**
 * PresetManager — Preset Management UI Component (Alpha)
 * 
 * ⚠️ ALPHA LIMITATION:
 * Presets are client-side only (localStorage).
 * No backend persistence, no sync across devices.
 * 
 * Features:
 * - List all presets
 * - Create new preset from current settings
 * - Rename preset
 * - Duplicate preset
 * - Delete preset
 * - Save/Cancel editing
 * - Show unsaved changes indicator
 * - Export/Import preset JSON
 * 
 * ⚠️ VERIFY GUARD:
 * Any change to this component requires Playwright coverage.
 * Run: make verify-ui before committing changes.
 */

import React, { useState, useRef } from 'react'
import { Button } from './Button'
import type { DeliverSettings } from './DeliverControlPanel'
import type { Preset } from '../hooks/usePresets'

// ============================================================================
// TYPES
// ============================================================================

interface PresetManagerProps {
  // Preset state
  presets: Preset[]
  selectedPresetId: string | null
  isDirty: boolean
  editingPresetId: string | null
  
  // Current settings (for creating/saving presets)
  currentSettings: DeliverSettings
  
  // Actions
  onCreatePreset: (name: string, settings: DeliverSettings, description?: string) => Preset | { error: string }
  onRenamePreset: (id: string, newName: string) => boolean | { error: string }
  onDuplicatePreset: (id: string, newName?: string) => Preset | null
  onDeletePreset: (id: string) => boolean
  onSelectPreset: (id: string | null) => void
  onStartEditing: (id: string) => void
  onSaveEditing: (settings: DeliverSettings) => boolean
  onCancelEditing: () => void
  onMarkDirty: () => void
  
  // New save operations
  onSavePreset: (settings: DeliverSettings) => boolean
  onSaveAsPreset: (name: string, settings: DeliverSettings, description?: string) => Preset | { error: string }
  onIsNameTaken: (name: string, excludeId?: string) => boolean
  
  // Import/Export
  onExportPresets: () => string
  onImportPresets: (json: string) => { success: boolean; count: number; error?: string }
  onExportSinglePreset: (id: string) => string | null
  
  // When preset is selected, apply its settings
  onApplyPreset?: (settings: DeliverSettings) => void
  
  // UI state
  disabled?: boolean
}

// ============================================================================
// COMPONENT
// ============================================================================

export function PresetManager({
  presets,
  selectedPresetId,
  isDirty,
  editingPresetId,
  currentSettings,
  onCreatePreset,
  onRenamePreset,
  onDuplicatePreset,
  onDeletePreset,
  onSelectPreset,
  onStartEditing,
  onSaveEditing,
  onCancelEditing,
  onMarkDirty,
  onSavePreset,
  onSaveAsPreset,
  onIsNameTaken,
  onExportPresets,
  onImportPresets,
  onExportSinglePreset,
  onApplyPreset,
  disabled = false,
}: PresetManagerProps) {
  // UI state
  const [isCreating, setIsCreating] = useState(false)
  const [isSavingAs, setIsSavingAs] = useState(false)
  const [newPresetName, setNewPresetName] = useState('')
  const [saveAsName, setSaveAsName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const [showActions, setShowActions] = useState<string | null>(null)
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ============================================
  // Handlers
  // ============================================

  const handleCreatePreset = () => {
    if (!newPresetName.trim()) return
    
    // Clear any previous error
    setNameError(null)
    
    const result = onCreatePreset(newPresetName.trim(), currentSettings)
    if ('error' in result) {
      setNameError(result.error)
      return
    }
    
    setNewPresetName('')
    setIsCreating(false)
    onSelectPreset(result.id)
    if (onApplyPreset) {
      onApplyPreset(result.settings)
    }
  }

  const handleSavePreset = () => {
    if (!selectedPresetId) return
    
    const success = onSavePreset(currentSettings)
    if (success) {
      // Preset saved successfully
      onMarkDirty() // Clear dirty state is handled in the hook
    }
  }

  const handleSaveAsPreset = () => {
    if (!saveAsName.trim()) return
    
    setNameError(null)
    
    const result = onSaveAsPreset(saveAsName.trim(), currentSettings)
    if ('error' in result) {
      setNameError(result.error)
      return
    }
    
    setSaveAsName('')
    setIsSavingAs(false)
    // Selection is handled in the hook
  }

  const handleSaveAsNameChange = (value: string) => {
    setSaveAsName(value)
    // Real-time validation
    if (value.trim() && onIsNameTaken(value.trim())) {
      setNameError(`A preset named "${value.trim()}" already exists`)
    } else {
      setNameError(null)
    }
  }

  const handleNewNameChange = (value: string) => {
    setNewPresetName(value)
    // Real-time validation
    if (value.trim() && onIsNameTaken(value.trim())) {
      setNameError(`A preset named "${value.trim()}" already exists`)
    } else {
      setNameError(null)
    }
  }

  const handleSelectPreset = (id: string | null) => {
    // Warn about unsaved changes if dirty
    if (isDirty && selectedPresetId) {
      if (!confirm('You have unsaved changes. Discard them?')) {
        return
      }
    }
    
    if (editingPresetId) {
      onCancelEditing()
    }
    
    onSelectPreset(id)
    
    // Apply preset settings if a preset is selected
    if (id && onApplyPreset) {
      const preset = presets.find(p => p.id === id)
      if (preset) {
        onApplyPreset(preset.settings)
      }
    }
  }

  const handleStartRename = (id: string, currentName: string) => {
    setRenamingId(id)
    setRenameValue(currentName)
    setNameError(null)
  }

  const handleFinishRename = () => {
    if (renamingId && renameValue.trim()) {
      const result = onRenamePreset(renamingId, renameValue.trim())
      if (typeof result === 'object' && 'error' in result) {
        setNameError(result.error)
        return // Don't close rename mode if there's an error
      }
    }
    setRenamingId(null)
    setRenameValue('')
    setNameError(null)
  }

  const handleRenameValueChange = (value: string) => {
    setRenameValue(value)
    // Real-time validation (exclude current preset from duplicate check)
    if (value.trim() && renamingId && onIsNameTaken(value.trim(), renamingId)) {
      setNameError(`A preset named "${value.trim()}" already exists`)
    } else {
      setNameError(null)
    }
  }

  const handleDuplicate = (id: string) => {
    const preset = onDuplicatePreset(id)
    if (preset) {
      onSelectPreset(preset.id)
      if (onApplyPreset) {
        onApplyPreset(preset.settings)
      }
    }
    setShowActions(null)
  }

  const handleDelete = (id: string) => {
    if (!confirm('Delete this preset? This cannot be undone.')) {
      return
    }
    onDeletePreset(id)
    setShowActions(null)
  }

  const handleExportAll = () => {
    const json = onExportPresets()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `awaire_proxy_presets_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportSingle = (id: string) => {
    const json = onExportSinglePreset(id)
    if (!json) return
    
    const preset = presets.find(p => p.id === id)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${preset?.name.replace(/[^a-z0-9]/gi, '_') || 'preset'}.json`
    a.click()
    URL.revokeObjectURL(url)
    setShowActions(null)
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = (event) => {
      const json = event.target?.result as string
      const result = onImportPresets(json)
      if (result.success) {
        setImportError(null)
      } else {
        setImportError(result.error || 'Import failed')
      }
    }
    reader.readAsText(file)
    
    // Reset input so same file can be imported again
    e.target.value = ''
  }

  const handleSaveCurrentToPreset = () => {
    if (editingPresetId) {
      onSaveEditing(currentSettings)
    }
  }

  // ============================================
  // Render
  // ============================================

  return (
    <div
      data-testid="preset-manager"
      style={{
        padding: '0.75rem',
        background: 'rgba(20, 24, 32, 0.6)',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border-primary)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.75rem',
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-sans)',
          }}
        >
          Presets
          {isDirty && (
            <span
              data-testid="preset-dirty-indicator"
              style={{
                marginLeft: '0.5rem',
                fontSize: '0.6875rem',
                color: 'var(--status-warning-fg, #f59e0b)',
                fontWeight: 400,
              }}
            >
              • Unsaved changes
            </span>
          )}
        </h3>
        
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          <button
            data-testid="preset-export-all-button"
            onClick={handleExportAll}
            disabled={disabled || presets.length === 0}
            title="Export all presets"
            style={{
              padding: '0.25rem 0.5rem',
              fontSize: '0.6875rem',
              background: 'transparent',
              border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-muted)',
              cursor: presets.length === 0 ? 'not-allowed' : 'pointer',
              opacity: presets.length === 0 ? 0.5 : 1,
            }}
          >
            Export
          </button>
          <button
            data-testid="preset-import-button"
            onClick={handleImportClick}
            disabled={disabled}
            title="Import presets"
            style={{
              padding: '0.25rem 0.5rem',
              fontSize: '0.6875rem',
              background: 'transparent',
              border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            Import
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImportFile}
            style={{ display: 'none' }}
          />
        </div>
      </div>

      {/* Import Error */}
      {importError && (
        <div
          style={{
            marginBottom: '0.5rem',
            padding: '0.5rem',
            fontSize: '0.6875rem',
            color: 'var(--status-failed-fg)',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          {importError}
          <button
            onClick={() => setImportError(null)}
            style={{
              marginLeft: '0.5rem',
              background: 'none',
              border: 'none',
              color: 'var(--status-failed-fg)',
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* No Preset Option */}
      <button
        data-testid="preset-none-option"
        onClick={() => handleSelectPreset(null)}
        disabled={disabled}
        style={{
          width: '100%',
          padding: '0.5rem 0.75rem',
          marginBottom: '0.5rem',
          textAlign: 'left',
          background: selectedPresetId === null ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
          border: selectedPresetId === null 
            ? '1px solid var(--button-primary-bg)' 
            : '1px solid var(--border-secondary)',
          borderRadius: 'var(--radius-sm)',
          color: selectedPresetId === null ? 'var(--button-primary-bg)' : 'var(--text-secondary)',
          cursor: 'pointer',
          fontSize: '0.75rem',
          fontFamily: 'var(--font-sans)',
        }}
      >
        No preset (manual)
      </button>

      {/* Preset List */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.25rem',
          maxHeight: '200px',
          overflowY: 'auto',
          marginBottom: '0.5rem',
        }}
      >
        {presets.map(preset => (
          <div
            key={preset.id}
            data-testid={`preset-item-${preset.id}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.375rem 0.5rem',
              background: selectedPresetId === preset.id 
                ? 'rgba(59, 130, 246, 0.1)' 
                : 'transparent',
              border: selectedPresetId === preset.id
                ? '1px solid var(--button-primary-bg)'
                : '1px solid var(--border-secondary)',
              borderRadius: 'var(--radius-sm)',
              position: 'relative',
            }}
          >
            {renamingId === preset.id ? (
              // Rename input
              <input
                data-testid="preset-rename-input"
                type="text"
                value={renameValue}
                onChange={(e) => handleRenameValueChange(e.target.value)}
                onBlur={() => {
                  if (!nameError) handleFinishRename()
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !nameError) handleFinishRename()
                  if (e.key === 'Escape') {
                    setRenamingId(null)
                    setRenameValue('')
                    setNameError(null)
                  }
                }}
                autoFocus
                style={{
                  flex: 1,
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.75rem',
                  fontFamily: 'var(--font-sans)',
                  background: 'var(--input-bg)',
                  border: nameError ? '1px solid var(--status-failed-fg)' : '1px solid var(--button-primary-bg)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  outline: 'none',
                }}
              />
            ) : (
              // Preset name button
              <button
                onClick={() => handleSelectPreset(preset.id)}
                disabled={disabled}
                style={{
                  flex: 1,
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontFamily: 'var(--font-sans)',
                  color: selectedPresetId === preset.id 
                    ? 'var(--button-primary-bg)' 
                    : 'var(--text-secondary)',
                  fontWeight: selectedPresetId === preset.id ? 600 : 400,
                }}
              >
                {preset.name}
                {editingPresetId === preset.id && (
                  <span style={{ 
                    marginLeft: '0.25rem', 
                    fontSize: '0.625rem',
                    color: 'var(--status-warning-fg)',
                  }}>
                    (editing)
                  </span>
                )}
              </button>
            )}

            {/* Actions menu toggle */}
            <button
              data-testid={`preset-actions-toggle-${preset.id}`}
              onClick={() => setShowActions(showActions === preset.id ? null : preset.id)}
              disabled={disabled}
              style={{
                padding: '0.125rem 0.375rem',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '0.875rem',
              }}
            >
              ⋮
            </button>

            {/* Actions dropdown */}
            {showActions === preset.id && (
              <div
                data-testid={`preset-actions-menu-${preset.id}`}
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  zIndex: 100,
                  minWidth: '120px',
                  background: 'var(--card-bg)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-sm)',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                  overflow: 'hidden',
                }}
              >
                <button
                  data-testid={`preset-edit-${preset.id}`}
                  onClick={() => {
                    onStartEditing(preset.id)
                    setShowActions(null)
                  }}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    textAlign: 'left',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    fontFamily: 'var(--font-sans)',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  Edit
                </button>
                <button
                  data-testid={`preset-rename-${preset.id}`}
                  onClick={() => {
                    handleStartRename(preset.id, preset.name)
                    setShowActions(null)
                  }}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    textAlign: 'left',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    fontFamily: 'var(--font-sans)',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  Rename
                </button>
                <button
                  data-testid={`preset-duplicate-${preset.id}`}
                  onClick={() => handleDuplicate(preset.id)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    textAlign: 'left',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    fontFamily: 'var(--font-sans)',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  Duplicate
                </button>
                <button
                  data-testid={`preset-export-${preset.id}`}
                  onClick={() => handleExportSingle(preset.id)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    textAlign: 'left',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    fontFamily: 'var(--font-sans)',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  Export
                </button>
                <div style={{ 
                  height: '1px', 
                  background: 'var(--border-primary)',
                  margin: '0.25rem 0',
                }} />
                <button
                  data-testid={`preset-delete-${preset.id}`}
                  onClick={() => handleDelete(preset.id)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    textAlign: 'left',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--status-failed-fg)',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    fontFamily: 'var(--font-sans)',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        ))}
        
        {presets.length === 0 && (
          <div
            style={{
              padding: '1rem',
              textAlign: 'center',
              color: 'var(--text-dim)',
              fontSize: '0.75rem',
              fontFamily: 'var(--font-sans)',
              fontStyle: 'italic',
            }}
          >
            No presets yet. Create one from current settings.
          </div>
        )}
      </div>

      {/* Create New Preset */}
      {isCreating ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            marginBottom: '0.5rem',
          }}
        >
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              data-testid="preset-new-name-input"
              type="text"
              value={newPresetName}
              onChange={(e) => handleNewNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !nameError) handleCreatePreset()
                if (e.key === 'Escape') {
                  setIsCreating(false)
                  setNewPresetName('')
                  setNameError(null)
                }
              }}
              placeholder="Preset name..."
              autoFocus
              style={{
                flex: 1,
                padding: '0.375rem 0.5rem',
                fontSize: '0.75rem',
                fontFamily: 'var(--font-sans)',
                background: 'var(--input-bg)',
                border: nameError ? '1px solid var(--status-failed-fg)' : '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            />
            <Button
              data-testid="preset-create-confirm-button"
              variant="primary"
              size="sm"
              onClick={handleCreatePreset}
              disabled={!newPresetName.trim() || !!nameError}
            >
              Create
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsCreating(false)
                setNewPresetName('')
                setNameError(null)
              }}
            >
              Cancel
            </Button>
          </div>
          {/* Name error in create mode */}
          {nameError && isCreating && (
            <div
              style={{
                padding: '0.375rem 0.5rem',
                fontSize: '0.6875rem',
                color: 'var(--status-failed-fg)',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              {nameError}
            </div>
          )}
        </div>
      ) : (
        <Button
          data-testid="preset-new-button"
          variant="secondary"
          size="sm"
          onClick={() => {
            setIsCreating(true)
            setNameError(null)
          }}
          disabled={disabled}
          style={{ width: '100%' }}
        >
          + New Preset from Current Settings
        </Button>
      )}

      {/* Save/Cancel Edit Buttons */}
      {editingPresetId && (
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            marginTop: '0.5rem',
            paddingTop: '0.5rem',
            borderTop: '1px solid var(--border-secondary)',
          }}
        >
          <Button
            data-testid="preset-save-button"
            variant="primary"
            size="sm"
            onClick={handleSaveCurrentToPreset}
            disabled={!isDirty}
          >
            Save Changes
          </Button>
          <Button
            data-testid="preset-cancel-button"
            variant="secondary"
            size="sm"
            onClick={onCancelEditing}
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Save / Save As buttons (when a preset is selected and dirty) */}
      {selectedPresetId && isDirty && !editingPresetId && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            marginTop: '0.5rem',
            paddingTop: '0.5rem',
            borderTop: '1px solid var(--border-secondary)',
          }}
        >
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button
              data-testid="preset-save"
              variant="primary"
              size="sm"
              onClick={handleSavePreset}
              style={{ flex: 1 }}
            >
              Save
            </Button>
            <Button
              data-testid="preset-save-as"
              variant="secondary"
              size="sm"
              onClick={() => {
                setIsSavingAs(true)
                setSaveAsName('')
                setNameError(null)
              }}
              style={{ flex: 1 }}
            >
              Save As...
            </Button>
          </div>
          
          {/* Save As input */}
          {isSavingAs && (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                data-testid="preset-save-as-input"
                type="text"
                value={saveAsName}
                onChange={(e) => handleSaveAsNameChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !nameError) handleSaveAsPreset()
                  if (e.key === 'Escape') {
                    setIsSavingAs(false)
                    setSaveAsName('')
                    setNameError(null)
                  }
                }}
                placeholder="New preset name..."
                autoFocus
                style={{
                  flex: 1,
                  padding: '0.375rem 0.5rem',
                  fontSize: '0.75rem',
                  fontFamily: 'var(--font-sans)',
                  background: 'var(--input-bg)',
                  border: nameError ? '1px solid var(--status-failed-fg)' : '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  outline: 'none',
                }}
              />
              <Button
                data-testid="preset-save-as-confirm"
                variant="primary"
                size="sm"
                onClick={handleSaveAsPreset}
                disabled={!saveAsName.trim() || !!nameError}
              >
                Save
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsSavingAs(false)
                  setSaveAsName('')
                  setNameError(null)
                }}
              >
                ×
              </Button>
            </div>
          )}
          
          {/* Name error display */}
          {nameError && (
            <div
              style={{
                padding: '0.375rem 0.5rem',
                fontSize: '0.6875rem',
                color: 'var(--status-failed-fg)',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              {nameError}
            </div>
          )}
        </div>
      )}

      {/* Alpha notice */}
      <div
        style={{
          marginTop: '0.5rem',
          padding: '0.375rem 0.5rem',
          fontSize: '0.625rem',
          color: 'var(--text-dim)',
          background: 'rgba(59, 130, 246, 0.05)',
          border: '1px dashed rgba(59, 130, 246, 0.3)',
          borderRadius: 'var(--radius-sm)',
          fontFamily: 'var(--font-sans)',
        }}
      >
        Alpha: Presets are stored locally in your browser.
      </div>
    </div>
  )
}

export default PresetManager
