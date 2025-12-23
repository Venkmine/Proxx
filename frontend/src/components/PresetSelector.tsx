/**
 * PresetSelector — Compact Preset Dropdown Component
 * 
 * A compact dropdown for selecting presets with:
 * - "No preset (manual)" as first option
 * - Dirty state indicator (unsaved changes badge)
 * - Quick Save button when dirty
 * - Warning before switching with unsaved changes
 * 
 * Phase 7B: Added scope grouping and badges:
 * - Presets grouped into "User Presets" and "Workspace Presets"
 * - Subtle scope badge (USER/WORKSPACE) on each preset
 * - Selection behavior unchanged
 * 
 * ⚠️ VERIFY GUARD:
 * Any change to this component requires Playwright coverage.
 * Run: make verify-ui before committing changes.
 */

import { useState, useRef, useEffect, useMemo } from 'react'
import type { Preset } from '../hooks/usePresets'

// ============================================================================
// TYPES
// ============================================================================

// Phase 7B: Preset scope type
type PresetScope = 'user' | 'workspace'

// Phase 7B: Extended preset type with optional scope
interface PresetWithScope extends Preset {
  scope?: PresetScope
}

interface PresetSelectorProps {
  presets: PresetWithScope[]
  selectedPresetId: string | null
  isDirty: boolean
  onSelectPreset: (id: string | null) => void
  onSavePreset?: () => void
  disabled?: boolean
  /** Compact mode shows just the dropdown, no save button */
  compact?: boolean
}

// ============================================================================
// COMPONENT
// ============================================================================

export function PresetSelector({
  presets,
  selectedPresetId,
  isDirty,
  onSelectPreset,
  onSavePreset,
  disabled = false,
  compact = false,
}: PresetSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [pendingSelection, setPendingSelection] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Phase 7B: Group presets by scope
  const { userPresets, workspacePresets } = useMemo(() => {
    const user: PresetWithScope[] = []
    const workspace: PresetWithScope[] = []
    
    for (const preset of presets) {
      if (preset.scope === 'workspace') {
        workspace.push(preset)
      } else {
        // Default to user if scope is undefined (legacy presets)
        user.push(preset)
      }
    }
    
    return { userPresets: user, workspacePresets: workspace }
  }, [presets])
  
  // Phase 7B: Check if we have any scoped presets
  const hasWorkspacePresets = workspacePresets.length > 0

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Get selected preset name
  const selectedPreset = presets.find(p => p.id === selectedPresetId)
  const displayName = selectedPreset?.name || 'No preset'

  const handleSelect = (id: string | null) => {
    if (id === selectedPresetId) {
      setIsOpen(false)
      return
    }

    // If dirty, show confirmation
    if (isDirty && selectedPresetId) {
      setPendingSelection(id)
      setShowConfirm(true)
      return
    }

    onSelectPreset(id)
    setIsOpen(false)
  }

  const handleConfirmSwitch = () => {
    if (pendingSelection !== null || pendingSelection === null) {
      onSelectPreset(pendingSelection)
    }
    setShowConfirm(false)
    setPendingSelection(null)
    setIsOpen(false)
  }

  const handleCancelSwitch = () => {
    setShowConfirm(false)
    setPendingSelection(null)
  }
  
  // Phase 7B: Render a preset option with scope badge
  const renderPresetOption = (preset: PresetWithScope) => (
    <button
      key={preset.id}
      data-testid={`preset-option-${preset.id}`}
      onClick={() => handleSelect(preset.id)}
      style={{
        width: '100%',
        padding: '0.5rem 0.75rem',
        textAlign: 'left',
        background: selectedPresetId === preset.id ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
        border: 'none',
        color: selectedPresetId === preset.id ? 'var(--button-primary-bg)' : 'var(--text-secondary)',
        fontSize: '0.75rem',
        fontFamily: 'var(--font-sans)',
        fontWeight: selectedPresetId === preset.id ? 600 : 400,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '0.375rem',
      }}
      onMouseEnter={(e) => {
        if (selectedPresetId !== preset.id) {
          e.currentTarget.style.background = 'rgba(59, 130, 246, 0.05)'
        }
      }}
      onMouseLeave={(e) => {
        if (selectedPresetId !== preset.id) {
          e.currentTarget.style.background = 'transparent'
        }
      }}
    >
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {preset.name}
      </span>
      {/* Phase 7B: Scope badge */}
      {preset.scope && (
        <span
          style={{
            padding: '0.0625rem 0.25rem',
            fontSize: '0.5rem',
            fontWeight: 600,
            background: preset.scope === 'workspace' 
              ? 'rgba(34, 197, 94, 0.15)' 
              : 'rgba(59, 130, 246, 0.15)',
            color: preset.scope === 'workspace' 
              ? 'rgb(34, 197, 94)' 
              : 'var(--button-primary-bg)',
            borderRadius: '2px',
            textTransform: 'uppercase',
            letterSpacing: '0.03em',
            flexShrink: 0,
          }}
        >
          {preset.scope}
        </span>
      )}
    </button>
  )

  return (
    <div
      ref={dropdownRef}
      data-testid="preset-selector"
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
      }}
    >
      {/* Dropdown trigger */}
      <button
        data-testid="preset-selector-trigger"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.375rem 0.625rem',
          background: 'var(--input-bg)',
          border: isDirty ? '1px solid var(--status-warning-fg)' : '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--text-primary)',
          fontSize: '0.75rem',
          fontFamily: 'var(--font-sans)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          minWidth: '140px',
          textAlign: 'left',
        }}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {displayName}
        </span>
        {isDirty && (
          <span
            data-testid="preset-dirty-badge"
            style={{
              padding: '0.125rem 0.375rem',
              fontSize: '0.5625rem',
              fontWeight: 600,
              background: 'rgba(245, 158, 11, 0.2)',
              color: 'var(--status-warning-fg)',
              borderRadius: 'var(--radius-sm)',
              textTransform: 'uppercase',
              letterSpacing: '0.02em',
            }}
          >
            Modified
          </span>
        )}
        <span style={{ color: 'var(--text-dim)', fontSize: '0.625rem' }}>▼</span>
      </button>

      {/* Quick Save button (when dirty and not compact) */}
      {isDirty && !compact && onSavePreset && selectedPresetId && (
        <button
          data-testid="preset-quick-save"
          onClick={onSavePreset}
          disabled={disabled}
          title="Save changes to preset"
          style={{
            padding: '0.375rem 0.625rem',
            background: 'var(--button-primary-bg)',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--button-primary-fg)',
            fontSize: '0.6875rem',
            fontWeight: 600,
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.5 : 1,
          }}
        >
          Save
        </button>
      )}

      {/* Dropdown menu */}
      {isOpen && (
        <div
          data-testid="preset-selector-menu"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: compact ? 0 : 'auto',
            zIndex: 1000,
            marginTop: '0.25rem',
            minWidth: '200px',
            maxHeight: '300px',
            overflowY: 'auto',
            background: 'var(--card-bg)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          }}
        >
          {/* No preset option */}
          <button
            data-testid="preset-option-none"
            onClick={() => handleSelect(null)}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              textAlign: 'left',
              background: selectedPresetId === null ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
              border: 'none',
              color: selectedPresetId === null ? 'var(--button-primary-bg)' : 'var(--text-secondary)',
              fontSize: '0.75rem',
              fontFamily: 'var(--font-sans)',
              fontStyle: 'italic',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              if (selectedPresetId !== null) {
                e.currentTarget.style.background = 'rgba(59, 130, 246, 0.05)'
              }
            }}
            onMouseLeave={(e) => {
              if (selectedPresetId !== null) {
                e.currentTarget.style.background = 'transparent'
              }
            }}
          >
            No preset (manual)
          </button>

          {presets.length > 0 && (
            <div style={{ height: '1px', background: 'var(--border-primary)', margin: '0.25rem 0' }} />
          )}

          {/* Phase 7B: Grouped preset options by scope */}
          {hasWorkspacePresets ? (
            <>
              {/* User Presets Group */}
              {userPresets.length > 0 && (
                <>
                  <div
                    style={{
                      padding: '0.375rem 0.75rem',
                      fontSize: '0.5625rem',
                      fontWeight: 600,
                      color: 'var(--text-dim)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      background: 'rgba(0, 0, 0, 0.1)',
                    }}
                  >
                    User Presets
                  </div>
                  {userPresets.map(renderPresetOption)}
                </>
              )}
              
              {/* Workspace Presets Group */}
              {workspacePresets.length > 0 && (
                <>
                  <div
                    style={{
                      padding: '0.375rem 0.75rem',
                      fontSize: '0.5625rem',
                      fontWeight: 600,
                      color: 'var(--text-dim)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      background: 'rgba(0, 0, 0, 0.1)',
                      marginTop: userPresets.length > 0 ? '0.25rem' : 0,
                    }}
                  >
                    Workspace Presets
                  </div>
                  {workspacePresets.map(renderPresetOption)}
                </>
              )}
            </>
          ) : (
            // No workspace presets — render flat list (backward compat)
            presets.map(renderPresetOption)
          )}

          {presets.length === 0 && (
            <div
              style={{
                padding: '0.75rem',
                textAlign: 'center',
                color: 'var(--text-dim)',
                fontSize: '0.6875rem',
                fontStyle: 'italic',
              }}
            >
              No presets saved yet
            </div>
          )}
        </div>
      )}

      {/* Confirmation dialog */}
      {showConfirm && (
        <div
          data-testid="preset-confirm-dialog"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCancelSwitch()
          }}
        >
          <div
            style={{
              background: 'var(--card-bg)',
              border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-md)',
              padding: '1rem',
              maxWidth: '320px',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
            }}
          >
            <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', color: 'var(--text-primary)' }}>
              Unsaved Changes
            </h4>
            <p style={{ margin: '0 0 1rem 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              You have unsaved changes to the current preset. Do you want to discard them?
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                data-testid="preset-confirm-cancel"
                onClick={handleCancelSwitch}
                style={{
                  padding: '0.375rem 0.75rem',
                  background: 'transparent',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-secondary)',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                data-testid="preset-confirm-discard"
                onClick={handleConfirmSwitch}
                style={{
                  padding: '0.375rem 0.75rem',
                  background: 'var(--status-warning-fg)',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  color: '#000',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Discard Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PresetSelector
