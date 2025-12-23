import { useState, useRef, useEffect } from 'react'
import { Button } from './Button'
import { Select } from './Select'

/**
 * PresetEditorHeader - The ONLY place where preset state is communicated.
 * 
 * Displays:
 * - Preset selector dropdown
 * - Inline rename (double-click or edit icon)
 * - Save / Save As buttons
 * - Delete button (with confirmation)
 * - "Manage Presets" popover for Import/Export/Duplicate
 * 
 * States:
 * - Viewing preset: Clean state, no unsaved changes
 * - Editing preset (dirty): Shows unsaved indicator
 * 
 * When "No preset" is active:
 * - Disable Rename / Delete buttons (do not hide them)
 */

export interface Preset {
  id: string
  name: string
  description?: string
  createdAt: string
  updatedAt: string
  settings: unknown
}

interface PresetEditorHeaderProps {
  // Preset state (from usePresets hook)
  presets: Preset[]
  selectedPresetId: string | null
  isDirty: boolean
  
  // Actions
  onSelectPreset: (id: string | null) => void
  onRenamePreset: (id: string, newName: string) => boolean | { error: string }
  onSavePreset: () => boolean
  onSaveAsPreset: (name: string) => void
  onDeletePreset: (id: string) => boolean
  onDuplicatePreset: (id: string, newName?: string) => void
  onExportPresets: () => void
  onExportCurrentPreset?: () => void  // New: export single preset
  onImportPresets: () => void
  
  // Confirmation dialog trigger
  onConfirmDiscardChanges: (onConfirm: () => void) => void
  
  disabled?: boolean
}

export function PresetEditorHeader({
  presets,
  selectedPresetId,
  isDirty,
  onSelectPreset,
  onRenamePreset,
  onSavePreset,
  onSaveAsPreset,
  onDeletePreset,
  onDuplicatePreset,
  onExportPresets,
  onExportCurrentPreset,
  onImportPresets,
  onConfirmDiscardChanges,
  disabled = false,
}: PresetEditorHeaderProps) {
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)
  const [showManagePopover, setShowManagePopover] = useState(false)
  const [showSaveAsDialog, setShowSaveAsDialog] = useState(false)
  const [saveAsName, setSaveAsName] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  
  const renameInputRef = useRef<HTMLInputElement>(null)
  const managePopoverRef = useRef<HTMLDivElement>(null)
  
  const selectedPreset = presets.find(p => p.id === selectedPresetId)
  const hasPreset = !!selectedPresetId && !!selectedPreset
  
  // Focus rename input when entering rename mode
  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [isRenaming])
  
  // Close popover on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (managePopoverRef.current && !managePopoverRef.current.contains(e.target as Node)) {
        setShowManagePopover(false)
      }
    }
    if (showManagePopover) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showManagePopover])
  
  // Handle preset selection with dirty check
  const handlePresetChange = (presetId: string) => {
    const newId = presetId === '' ? null : presetId
    
    if (isDirty && selectedPresetId !== newId) {
      onConfirmDiscardChanges(() => {
        onSelectPreset(newId)
      })
    } else {
      onSelectPreset(newId)
    }
  }
  
  // Start rename mode
  const startRename = () => {
    if (!hasPreset || disabled) return
    setRenameValue(selectedPreset?.name || '')
    setRenameError(null)
    setIsRenaming(true)
  }
  
  // Commit rename
  const commitRename = () => {
    if (selectedPresetId && renameValue.trim()) {
      const result = onRenamePreset(selectedPresetId, renameValue.trim())
      if (typeof result === 'object' && 'error' in result) {
        setRenameError(result.error)
        return // Don't close rename mode on error
      }
    }
    setIsRenaming(false)
    setRenameError(null)
  }
  
  // Cancel rename
  const cancelRename = () => {
    setIsRenaming(false)
    setRenameValue('')
    setRenameError(null)
  }
  
  // Handle rename key events
  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      commitRename()
    } else if (e.key === 'Escape') {
      cancelRename()
    }
  }
  
  // Save As dialog
  const openSaveAsDialog = () => {
    setSaveAsName(selectedPreset ? `${selectedPreset.name} Copy` : 'New Preset')
    setShowSaveAsDialog(true)
  }
  
  const commitSaveAs = () => {
    if (saveAsName.trim()) {
      onSaveAsPreset(saveAsName.trim())
      setShowSaveAsDialog(false)
      setSaveAsName('')
    }
  }
  
  // Delete confirmation
  const handleDelete = () => {
    if (!selectedPresetId) return
    setShowDeleteConfirm(true)
  }
  
  const confirmDelete = () => {
    if (selectedPresetId) {
      onDeletePreset(selectedPresetId)
    }
    setShowDeleteConfirm(false)
  }
  
  // Build preset options for dropdown
  const presetOptions = [
    { value: '', label: 'No preset (manual)' },
    ...presets.map(p => ({
      value: p.id,
      label: p.name,
    })),
  ]
  
  return (
    <div
      data-testid="preset-editor-header"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.75rem 1rem',
        background: 'var(--card-bg-solid, rgba(16, 18, 20, 0.95))',
        flexWrap: 'wrap',
      }}
    >
      {/* Preset Selector */}
      <div style={{ flex: '1 1 200px', minWidth: '150px', maxWidth: '280px' }}>
        {isRenaming ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <input
              ref={renameInputRef}
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={handleRenameKeyDown}
              onBlur={commitRename}
              style={{
                width: '100%',
                padding: '0.375rem 0.5rem',
                fontSize: '0.8125rem',
                fontFamily: 'var(--font-sans)',
                background: 'var(--input-bg)',
                border: renameError ? '1px solid var(--status-failed-fg)' : '1px solid var(--button-primary-bg)',
                borderRadius: '4px',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
              data-testid="preset-rename-input"
            />
            {renameError && (
              <span style={{ fontSize: '0.625rem', color: 'var(--status-failed-fg)' }}>
                {renameError}
              </span>
            )}
          </div>
        ) : (
          <Select
            value={selectedPresetId || ''}
            onChange={handlePresetChange}
            options={presetOptions}
            disabled={disabled}
            data-testid="preset-selector"
          />
        )}
      </div>
      
      {/* Dirty Indicator */}
      {isDirty && (
        <span
          style={{
            fontSize: '0.6875rem',
            color: 'var(--status-warning-fg)',
            fontFamily: 'var(--font-sans)',
            whiteSpace: 'nowrap',
          }}
          data-testid="preset-dirty-indicator"
        >
          Unsaved changes
        </span>
      )}
      
      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
        {/* Rename */}
        <Button
          variant="ghost"
          size="sm"
          onClick={startRename}
          disabled={!hasPreset || disabled}
          title={hasPreset ? 'Rename preset' : 'Select a preset to rename'}
          data-testid="preset-rename-btn"
          style={{ padding: '0.25rem 0.5rem', fontSize: '0.6875rem' }}
        >
          Rename
        </Button>
        
        {/* Save */}
        <Button
          variant={isDirty ? 'primary' : 'ghost'}
          size="sm"
          onClick={onSavePreset}
          disabled={!hasPreset || !isDirty || disabled}
          title={isDirty ? 'Save changes to preset' : 'No changes to save'}
          data-testid="preset-save-btn"
          style={{ padding: '0.25rem 0.5rem', fontSize: '0.6875rem' }}
        >
          Save
        </Button>
        
        {/* Save As */}
        <Button
          variant="ghost"
          size="sm"
          onClick={openSaveAsDialog}
          disabled={disabled}
          title="Save current settings as new preset"
          data-testid="preset-save-as-btn"
          style={{ padding: '0.25rem 0.5rem', fontSize: '0.6875rem' }}
        >
          Save As
        </Button>
        
        {/* Delete */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          disabled={!hasPreset || disabled}
          title={hasPreset ? 'Delete preset' : 'Select a preset to delete'}
          data-testid="preset-delete-btn"
          style={{ padding: '0.25rem 0.5rem', fontSize: '0.6875rem', color: 'var(--status-error-fg)' }}
        >
          Delete
        </Button>
        
        {/* Manage Presets Popover */}
        <div style={{ position: 'relative' }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowManagePopover(!showManagePopover)}
            disabled={disabled}
            title="Manage presets (import, export, duplicate)"
            data-testid="preset-manage-btn"
            style={{ padding: '0.25rem 0.5rem', fontSize: '0.6875rem' }}
          >
            ⋮
          </Button>
          
          {showManagePopover && (
            <div
              ref={managePopoverRef}
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '0.25rem',
                background: 'var(--card-bg-solid, #1a1a1a)',
                border: '1px solid var(--border-primary)',
                borderRadius: '6px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
                zIndex: 100,
                minWidth: '140px',
                padding: '0.25rem 0',
              }}
              data-testid="preset-manage-popover"
            >
              <button
                onClick={() => {
                  if (hasPreset) {
                    onDuplicatePreset(selectedPresetId!)
                  }
                  setShowManagePopover(false)
                }}
                disabled={!hasPreset}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  color: hasPreset ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontSize: '0.75rem',
                  fontFamily: 'var(--font-sans)',
                  cursor: hasPreset ? 'pointer' : 'not-allowed',
                }}
              >
                Duplicate
              </button>
              <div style={{ height: '1px', background: 'var(--border-secondary)', margin: '0.25rem 0' }} />
              <button
                onClick={() => {
                  if (hasPreset && onExportCurrentPreset) {
                    onExportCurrentPreset()
                  }
                  setShowManagePopover(false)
                }}
                disabled={!hasPreset || !onExportCurrentPreset}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  color: hasPreset && onExportCurrentPreset ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontSize: '0.75rem',
                  fontFamily: 'var(--font-sans)',
                  cursor: hasPreset && onExportCurrentPreset ? 'pointer' : 'not-allowed',
                }}
              >
                Export Current Preset…
              </button>
              <button
                onClick={() => {
                  onExportPresets()
                  setShowManagePopover(false)
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-primary)',
                  fontSize: '0.75rem',
                  fontFamily: 'var(--font-sans)',
                  cursor: 'pointer',
                }}
              >
                Export All Presets…
              </button>
              <button
                onClick={() => {
                  onImportPresets()
                  setShowManagePopover(false)
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-primary)',
                  fontSize: '0.75rem',
                  fontFamily: 'var(--font-sans)',
                  cursor: 'pointer',
                }}
              >
                Import
              </button>
            </div>
          )}
        </div>
      </div>
      
      {/* Save As Dialog (inline modal) */}
      {showSaveAsDialog && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowSaveAsDialog(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--card-bg-solid, #1a1a1a)',
              border: '1px solid var(--border-primary)',
              borderRadius: '8px',
              padding: '1rem',
              minWidth: '280px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
            }}
            data-testid="preset-save-as-dialog"
          >
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.875rem', color: 'var(--text-primary)' }}>
              Save As New Preset
            </h3>
            <input
              type="text"
              value={saveAsName}
              onChange={(e) => setSaveAsName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitSaveAs()
                if (e.key === 'Escape') setShowSaveAsDialog(false)
              }}
              autoFocus
              style={{
                width: '100%',
                padding: '0.5rem',
                fontSize: '0.8125rem',
                fontFamily: 'var(--font-sans)',
                background: 'var(--input-bg)',
                border: '1px solid var(--border-secondary)',
                borderRadius: '4px',
                color: 'var(--text-primary)',
                marginBottom: '0.75rem',
              }}
              placeholder="Preset name"
            />
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <Button variant="ghost" size="sm" onClick={() => setShowSaveAsDialog(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={commitSaveAs} disabled={!saveAsName.trim()}>
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--card-bg-solid, #1a1a1a)',
              border: '1px solid var(--border-primary)',
              borderRadius: '8px',
              padding: '1rem',
              minWidth: '280px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
            }}
            data-testid="preset-delete-dialog"
          >
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.875rem', color: 'var(--text-primary)' }}>
              Delete Preset?
            </h3>
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              "{selectedPreset?.name}" will be permanently deleted.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <Button variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={confirmDelete}
                style={{ background: 'var(--status-error-bg)', borderColor: 'var(--status-error-bg)' }}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
