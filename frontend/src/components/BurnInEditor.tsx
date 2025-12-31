/**
 * BurnInEditor — Burn-In Preset Editor with Schema Enforcement
 *
 * An editor component for burn-in presets that enforces:
 * - Industry presets are immutable (edit disabled)
 * - Locked fields trigger derived preset creation
 * - Mutable fields can be edited in-place (user/derived presets only)
 *
 * Field Classification:
 * LOCKED (modification creates derived preset):
 * - id, fields, position
 *
 * MUTABLE (can modify in-place for non-industry presets):
 * - text_opacity, background_enabled, background_opacity, font_scale
 *
 * ⚠️ ANTI-FEATURES (explicitly NOT implemented):
 * - Drag positioning
 * - Freeform text
 * - Per-job overrides
 */

import { useState, useCallback, useMemo } from 'react'
import type { BurnInPreset, PresetType } from './BurnInSelector'

// ============================================================================
// TYPES
// ============================================================================

type FieldType = 'locked' | 'mutable'

interface FieldModification {
  field: string
  oldValue: unknown
  newValue: unknown
  fieldType: FieldType
}

interface DerivedPresetDialogProps {
  isOpen: boolean
  parentPresetId: string
  lockedFieldsModified: string[]
  suggestedId: string
  onConfirm: (newId: string) => void
  onCancel: () => void
}

interface BurnInEditorProps {
  preset: BurnInPreset | null
  onSave: (preset: BurnInPreset) => void
  onCreateDerived: (parentId: string, modifications: Partial<BurnInPreset>, newId: string) => void
  disabled?: boolean
}

// ============================================================================
// SCHEMA CONSTANTS
// ============================================================================

const FIELD_SCHEMA: Record<string, FieldType> = {
  id: 'locked',
  fields: 'locked',
  position: 'locked',
  text_opacity: 'mutable',
  background_enabled: 'mutable',
  background_opacity: 'mutable',
  font_scale: 'mutable',
}

const LOCKED_FIELDS = new Set(
  Object.entries(FIELD_SCHEMA)
    .filter(([_, type]) => type === 'locked')
    .map(([field]) => field)
)

const MUTABLE_FIELDS = new Set(
  Object.entries(FIELD_SCHEMA)
    .filter(([_, type]) => type === 'mutable')
    .map(([field]) => field)
)

const POSITION_OPTIONS = [
  { value: 'TL', label: 'Top Left' },
  { value: 'TR', label: 'Top Right' },
  { value: 'BL', label: 'Bottom Left' },
  { value: 'BR', label: 'Bottom Right' },
  { value: 'TC', label: 'Top Center' },
  { value: 'BC', label: 'Bottom Center' },
]

const FONT_SCALE_OPTIONS = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
]

const AVAILABLE_FIELDS = [
  'Source Timecode',
  'File Name',
  'Source Frame',
  'Codec',
  'Resolution',
  'Frame Rate',
  'Clip Name',
  'Render Date',
  'Render Time',
]

// ============================================================================
// ICONS
// ============================================================================

function LockIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M4 4a4 4 0 0 1 8 0v2h.25c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 12.25 15h-8.5A1.75 1.75 0 0 1 2 13.25v-5.5C2 6.784 2.784 6 3.75 6H4V4Zm8.5 3.75a.25.25 0 0 0-.25-.25h-8.5a.25.25 0 0 0-.25.25v5.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-5.5ZM10.5 6V4a2.5 2.5 0 1 0-5 0v2h5Z"
      />
    </svg>
  )
}

function InfoIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" />
    </svg>
  )
}

function GitBranchIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" />
    </svg>
  )
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function FieldLabel({
  label,
  fieldType,
  tooltip,
}: {
  label: string
  fieldType: FieldType
  tooltip?: string
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.375rem',
        marginBottom: '0.25rem',
      }}
    >
      <span
        style={{
          fontSize: '0.75rem',
          fontWeight: 500,
          color: 'var(--text-secondary)',
        }}
      >
        {label}
      </span>
      {fieldType === 'locked' && (
        <span
          title="Locked field — modifying will create a derived preset"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            color: 'var(--text-muted)',
          }}
        >
          <LockIcon size={12} />
        </span>
      )}
      {tooltip && (
        <span
          title={tooltip}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            color: 'var(--text-muted)',
          }}
        >
          <InfoIcon size={12} />
        </span>
      )}
    </div>
  )
}

function ImmutableBanner({ presetId }: { presetId: string }) {
  return (
    <div
      data-testid="immutable-preset-banner"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.75rem',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        border: '1px solid rgba(59, 130, 246, 0.3)',
        borderRadius: '0.375rem',
        marginBottom: '1rem',
      }}
    >
      <LockIcon size={16} />
      <div>
        <div
          style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            color: 'rgb(96, 165, 250)',
          }}
        >
          Industry Preset
        </div>
        <div
          style={{
            fontSize: '0.6875rem',
            color: 'var(--text-muted)',
          }}
        >
          "{presetId}" is an industry standard and cannot be modified.
          Changing any field will create a derived preset.
        </div>
      </div>
    </div>
  )
}

function DerivedPresetDialog({
  isOpen,
  parentPresetId,
  lockedFieldsModified,
  suggestedId,
  onConfirm,
  onCancel,
}: DerivedPresetDialogProps) {
  const [newId, setNewId] = useState(suggestedId)

  if (!isOpen) return null

  return (
    <div
      data-testid="derived-preset-dialog"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: 100,
      }}
    >
      <div
        style={{
          width: '24rem',
          padding: '1.5rem',
          backgroundColor: 'var(--dialog-bg)',
          border: '1px solid var(--dialog-border)',
          borderRadius: '0.5rem',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '1rem',
          }}
        >
          <GitBranchIcon size={20} />
          <h3
            style={{
              fontSize: '1rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: 0,
            }}
          >
            Create Derived Preset
          </h3>
        </div>

        {/* Content */}
        <div style={{ marginBottom: '1rem' }}>
          <p
            style={{
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              marginBottom: '0.75rem',
            }}
          >
            You're modifying locked fields on "{parentPresetId}".
            A new derived preset will be created with your changes.
          </p>

          <div
            style={{
              padding: '0.5rem',
              backgroundColor: 'rgba(249, 115, 22, 0.1)',
              border: '1px solid rgba(249, 115, 22, 0.3)',
              borderRadius: '0.25rem',
              marginBottom: '0.75rem',
            }}
          >
            <div
              style={{
                fontSize: '0.6875rem',
                fontWeight: 500,
                color: 'rgb(251, 146, 60)',
                marginBottom: '0.25rem',
              }}
            >
              Locked fields modified:
            </div>
            <div
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
              }}
            >
              {lockedFieldsModified.join(', ')}
            </div>
          </div>

          <FieldLabel label="New Preset ID" fieldType="mutable" />
          <input
            type="text"
            value={newId}
            onChange={(e) => setNewId(e.target.value)}
            data-testid="derived-preset-id-input"
            style={{
              width: '100%',
              padding: '0.5rem',
              backgroundColor: 'var(--input-bg)',
              border: '1px solid var(--input-border)',
              borderRadius: '0.25rem',
              color: 'var(--text-primary)',
              fontSize: '0.75rem',
            }}
          />
        </div>

        {/* Actions */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.5rem',
          }}
        >
          <button
            onClick={onCancel}
            data-testid="derived-preset-cancel"
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: 'transparent',
              border: '1px solid var(--button-secondary-border)',
              borderRadius: '0.25rem',
              color: 'var(--text-secondary)',
              fontSize: '0.75rem',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(newId)}
            data-testid="derived-preset-confirm"
            disabled={!newId.trim()}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: 'var(--button-primary-bg)',
              border: 'none',
              borderRadius: '0.25rem',
              color: 'var(--button-primary-text)',
              fontSize: '0.75rem',
              fontWeight: 500,
              cursor: newId.trim() ? 'pointer' : 'not-allowed',
              opacity: newId.trim() ? 1 : 0.5,
            }}
          >
            Create Derived Preset
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function BurnInEditor({
  preset,
  onSave,
  onCreateDerived,
  disabled = false,
}: BurnInEditorProps) {
  // Local edit state
  const [localPreset, setLocalPreset] = useState<BurnInPreset | null>(preset)
  const [pendingModifications, setPendingModifications] = useState<FieldModification[]>([])
  const [showDerivedDialog, setShowDerivedDialog] = useState(false)

  // Update local state when preset changes
  useMemo(() => {
    setLocalPreset(preset)
    setPendingModifications([])
  }, [preset])

  // Check if preset is immutable (industry)
  const isImmutable = preset?.preset_type === 'industry'

  // Get locked fields that have been modified
  const lockedFieldsModified = useMemo(() => {
    return pendingModifications
      .filter((m) => m.fieldType === 'locked')
      .map((m) => m.field)
  }, [pendingModifications])

  // Check if any modifications exist
  const hasModifications = pendingModifications.length > 0

  // Generate suggested derived preset ID
  const suggestedDerivedId = useMemo(() => {
    if (!preset) return ''
    const shortId = Math.random().toString(36).substring(2, 10)
    return `${preset.id}_derived_${shortId}`
  }, [preset])

  // Handle field modification
  const handleFieldChange = useCallback(
    (field: string, newValue: unknown) => {
      if (!preset || !localPreset) return

      const fieldType = FIELD_SCHEMA[field] || 'mutable'
      const oldValue = preset[field as keyof BurnInPreset]

      // Update local state
      setLocalPreset((prev) => (prev ? { ...prev, [field]: newValue } : null))

      // Track modification
      const existingIndex = pendingModifications.findIndex((m) => m.field === field)
      const modification: FieldModification = {
        field,
        oldValue,
        newValue,
        fieldType,
      }

      if (existingIndex >= 0) {
        // Update existing modification
        const newMods = [...pendingModifications]
        newMods[existingIndex] = modification
        setPendingModifications(newMods)
      } else {
        // Add new modification
        setPendingModifications((prev) => [...prev, modification])
      }
    },
    [preset, localPreset, pendingModifications]
  )

  // Handle save
  const handleSave = useCallback(() => {
    if (!localPreset || !preset) return

    // Check if locked fields were modified
    if (lockedFieldsModified.length > 0 || isImmutable) {
      // Must create derived preset
      setShowDerivedDialog(true)
      return
    }

    // Can save directly (only mutable fields changed on non-industry preset)
    onSave(localPreset)
    setPendingModifications([])
  }, [localPreset, preset, lockedFieldsModified, isImmutable, onSave])

  // Handle derived preset creation
  const handleCreateDerived = useCallback(
    (newId: string) => {
      if (!preset || !localPreset) return

      const modifications: Partial<BurnInPreset> = {}
      for (const mod of pendingModifications) {
        ;(modifications as Record<string, unknown>)[mod.field] = mod.newValue
      }

      onCreateDerived(preset.id, modifications, newId)
      setShowDerivedDialog(false)
      setPendingModifications([])
    },
    [preset, localPreset, pendingModifications, onCreateDerived]
  )

  // Render nothing if no preset
  if (!preset || !localPreset) {
    return (
      <div
        data-testid="burnin-editor-empty"
        style={{
          padding: '2rem',
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: '0.75rem',
        }}
      >
        Select a burn-in preset to edit
      </div>
    )
  }

  return (
    <div data-testid="burnin-editor" style={{ padding: '1rem' }}>
      {/* Immutable banner for industry presets */}
      {isImmutable && <ImmutableBanner presetId={preset.id} />}

      {/* Preset ID (locked) */}
      <div style={{ marginBottom: '1rem' }}>
        <FieldLabel
          label="Preset ID"
          fieldType="locked"
          tooltip="Changing the ID will create a derived preset"
        />
        <input
          type="text"
          value={localPreset.id}
          onChange={(e) => handleFieldChange('id', e.target.value)}
          disabled={disabled}
          data-testid="burnin-field-id"
          style={{
            width: '100%',
            padding: '0.5rem',
            backgroundColor: 'var(--input-bg)',
            border: '1px solid var(--input-border)',
            borderRadius: '0.25rem',
            color: 'var(--text-primary)',
            fontSize: '0.75rem',
          }}
        />
      </div>

      {/* Position (locked) */}
      <div style={{ marginBottom: '1rem' }}>
        <FieldLabel
          label="Position"
          fieldType="locked"
          tooltip="Changing position will create a derived preset"
        />
        <select
          value={localPreset.position}
          onChange={(e) => handleFieldChange('position', e.target.value)}
          disabled={disabled}
          data-testid="burnin-field-position"
          style={{
            width: '100%',
            padding: '0.5rem',
            backgroundColor: 'var(--input-bg)',
            border: '1px solid var(--input-border)',
            borderRadius: '0.25rem',
            color: 'var(--text-primary)',
            fontSize: '0.75rem',
          }}
        >
          {POSITION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Fields (locked) */}
      <div style={{ marginBottom: '1rem' }}>
        <FieldLabel
          label="Data Fields"
          fieldType="locked"
          tooltip="Changing fields will create a derived preset"
        />
        <div
          style={{
            padding: '0.5rem',
            backgroundColor: 'var(--input-bg)',
            border: '1px solid var(--input-border)',
            borderRadius: '0.25rem',
          }}
        >
          {AVAILABLE_FIELDS.map((field) => (
            <label
              key={field}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.25rem 0',
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={localPreset.fields.includes(field)}
                onChange={(e) => {
                  const newFields = e.target.checked
                    ? [...localPreset.fields, field]
                    : localPreset.fields.filter((f) => f !== field)
                  handleFieldChange('fields', newFields)
                }}
                disabled={disabled}
                data-testid={`burnin-field-${field.replace(/\s+/g, '-').toLowerCase()}`}
              />
              {field}
            </label>
          ))}
        </div>
      </div>

      {/* Text Opacity (mutable) */}
      <div style={{ marginBottom: '1rem' }}>
        <FieldLabel label="Text Opacity" fieldType="mutable" />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={localPreset.text_opacity}
            onChange={(e) => handleFieldChange('text_opacity', parseFloat(e.target.value))}
            disabled={disabled}
            data-testid="burnin-field-text-opacity"
            style={{ flex: 1 }}
          />
          <span
            style={{
              width: '3rem',
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              textAlign: 'right',
            }}
          >
            {Math.round(localPreset.text_opacity * 100)}%
          </span>
        </div>
      </div>

      {/* Background Enabled (mutable) */}
      <div style={{ marginBottom: '1rem' }}>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={localPreset.background_enabled}
            onChange={(e) => handleFieldChange('background_enabled', e.target.checked)}
            disabled={disabled}
            data-testid="burnin-field-background-enabled"
          />
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 500,
              color: 'var(--text-secondary)',
            }}
          >
            Background Enabled
          </span>
        </label>
      </div>

      {/* Background Opacity (mutable) */}
      {localPreset.background_enabled && (
        <div style={{ marginBottom: '1rem' }}>
          <FieldLabel label="Background Opacity" fieldType="mutable" />
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={localPreset.background_opacity ?? 0.5}
              onChange={(e) =>
                handleFieldChange('background_opacity', parseFloat(e.target.value))
              }
              disabled={disabled}
              data-testid="burnin-field-background-opacity"
              style={{ flex: 1 }}
            />
            <span
              style={{
                width: '3rem',
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                textAlign: 'right',
              }}
            >
              {Math.round((localPreset.background_opacity ?? 0.5) * 100)}%
            </span>
          </div>
        </div>
      )}

      {/* Font Scale (mutable) */}
      <div style={{ marginBottom: '1rem' }}>
        <FieldLabel label="Font Scale" fieldType="mutable" />
        <select
          value={localPreset.font_scale}
          onChange={(e) => handleFieldChange('font_scale', e.target.value)}
          disabled={disabled}
          data-testid="burnin-field-font-scale"
          style={{
            width: '100%',
            padding: '0.5rem',
            backgroundColor: 'var(--input-bg)',
            border: '1px solid var(--input-border)',
            borderRadius: '0.25rem',
            color: 'var(--text-primary)',
            fontSize: '0.75rem',
          }}
        >
          {FONT_SCALE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Modification summary */}
      {hasModifications && (
        <div
          data-testid="modification-summary"
          style={{
            padding: '0.75rem',
            backgroundColor:
              lockedFieldsModified.length > 0
                ? 'rgba(249, 115, 22, 0.1)'
                : 'rgba(34, 197, 94, 0.1)',
            border: `1px solid ${
              lockedFieldsModified.length > 0
                ? 'rgba(249, 115, 22, 0.3)'
                : 'rgba(34, 197, 94, 0.3)'
            }`,
            borderRadius: '0.375rem',
            marginBottom: '1rem',
          }}
        >
          <div
            style={{
              fontSize: '0.6875rem',
              fontWeight: 500,
              color:
                lockedFieldsModified.length > 0
                  ? 'rgb(251, 146, 60)'
                  : 'rgb(74, 222, 128)',
              marginBottom: '0.25rem',
            }}
          >
            {lockedFieldsModified.length > 0 || isImmutable
              ? 'Saving will create a derived preset'
              : `${pendingModifications.length} field(s) modified`}
          </div>
          {lockedFieldsModified.length > 0 && (
            <div
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
              }}
            >
              Locked fields: {lockedFieldsModified.join(', ')}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '0.5rem',
          paddingTop: '0.5rem',
          borderTop: '1px solid var(--border-subtle)',
        }}
      >
        <button
          onClick={() => {
            setLocalPreset(preset)
            setPendingModifications([])
          }}
          disabled={disabled || !hasModifications}
          data-testid="burnin-editor-reset"
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: 'transparent',
            border: '1px solid var(--button-secondary-border)',
            borderRadius: '0.25rem',
            color: 'var(--text-secondary)',
            fontSize: '0.75rem',
            cursor: disabled || !hasModifications ? 'not-allowed' : 'pointer',
            opacity: disabled || !hasModifications ? 0.5 : 1,
          }}
        >
          Reset
        </button>
        <button
          onClick={handleSave}
          disabled={disabled || !hasModifications}
          data-testid="burnin-editor-save"
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: 'var(--button-primary-bg)',
            border: 'none',
            borderRadius: '0.25rem',
            color: 'var(--button-primary-text)',
            fontSize: '0.75rem',
            fontWeight: 500,
            cursor: disabled || !hasModifications ? 'not-allowed' : 'pointer',
            opacity: disabled || !hasModifications ? 0.5 : 1,
          }}
        >
          {lockedFieldsModified.length > 0 || isImmutable ? 'Create Derived...' : 'Save'}
        </button>
      </div>

      {/* Derived preset dialog */}
      <DerivedPresetDialog
        isOpen={showDerivedDialog}
        parentPresetId={preset.id}
        lockedFieldsModified={lockedFieldsModified}
        suggestedId={suggestedDerivedId}
        onConfirm={handleCreateDerived}
        onCancel={() => setShowDerivedDialog(false)}
      />
    </div>
  )
}

export default BurnInEditor
