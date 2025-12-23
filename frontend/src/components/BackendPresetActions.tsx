/**
 * BackendPresetActions — Phase 6 Backend Preset Management
 * 
 * Provides actions for creating and managing backend settings presets:
 * - Create preset from current settings
 * - Duplicate preset (for editing)
 * - Delete preset
 * 
 * Phase 7B: Added scope selection (user/workspace):
 * - User presets: available only to you
 * - Workspace presets: shared with this project
 * - Scope is immutable after creation
 * 
 * RULES (NON-NEGOTIABLE):
 * - Presets are snapshots, not live bindings
 * - No PATCH, no mutation
 * - Editing = duplicate + delete old (explicit workflow)
 */

import { useState } from 'react'
import { Button } from './Button'
import type { DeliverSettings } from './DeliverControlPanel'

// ============================================================================
// TYPES
// ============================================================================

// Phase 7B: Preset scope type
type PresetScope = 'user' | 'workspace'

interface SettingsPresetInfo {
  id: string
  name: string
  description: string
  scope: PresetScope  // Phase 7B
  fingerprint: string
  tags: string[]
  created_at: string
  updated_at: string
}

interface BackendPresetActionsProps {
  presets: SettingsPresetInfo[]
  currentSettings: DeliverSettings
  onCreatePreset: (name: string, settings: DeliverSettings, description?: string, scope?: PresetScope) => Promise<SettingsPresetInfo | null>
  onDuplicatePreset: (presetId: string, newName?: string) => Promise<SettingsPresetInfo | null>
  onDeletePreset: (presetId: string, force?: boolean) => Promise<{ success: boolean; referencingJobs?: string[] }>
  onRefresh: () => Promise<void>
  disabled?: boolean
}

// ============================================================================
// COMPONENT
// ============================================================================

export function BackendPresetActions({
  presets,
  currentSettings,
  onCreatePreset,
  onDuplicatePreset,
  onDeletePreset,
  onRefresh,
  disabled = false,
}: BackendPresetActionsProps) {
  const [isCreating, setIsCreating] = useState(false)
  const [newPresetName, setNewPresetName] = useState('')
  const [newPresetDescription, setNewPresetDescription] = useState('')
  const [newPresetScope, setNewPresetScope] = useState<PresetScope>('user')  // Phase 7B
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showManageList, setShowManageList] = useState(false)
  
  const handleCreatePreset = async () => {
    if (!newPresetName.trim()) {
      setError('Name is required')
      return
    }
    
    setError(null)
    setIsSubmitting(true)
    
    try {
      const result = await onCreatePreset(
        newPresetName.trim(),
        currentSettings,
        newPresetDescription.trim() || undefined,
        newPresetScope  // Phase 7B
      )
      
      if (result) {
        // Success - reset form
        setNewPresetName('')
        setNewPresetDescription('')
        setNewPresetScope('user')  // Phase 7B: Reset to default
        setIsCreating(false)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create preset')
    } finally {
      setIsSubmitting(false)
    }
  }
  
  const handleDuplicate = async (presetId: string) => {
    try {
      await onDuplicatePreset(presetId)
    } catch (e) {
      console.error('Failed to duplicate preset:', e)
    }
  }
  
  const handleDelete = async (presetId: string) => {
    const preset = presets.find(p => p.id === presetId)
    if (!preset) return
    
    if (!confirm(`Delete preset "${preset.name}"? This cannot be undone.`)) {
      return
    }
    
    try {
      const result = await onDeletePreset(presetId, false)
      
      if (!result.success && result.referencingJobs && result.referencingJobs.length > 0) {
        // Preset is referenced by jobs - ask for force delete
        if (confirm(
          `Preset is referenced by ${result.referencingJobs.length} job(s).\n\n` +
          `Deleting it will NOT affect those jobs (they own their settings).\n\n` +
          `Delete anyway?`
        )) {
          await onDeletePreset(presetId, true)
        }
      }
    } catch (e) {
      console.error('Failed to delete preset:', e)
    }
  }
  
  return (
    <div
      style={{
        padding: '0.75rem',
        background: 'rgba(20, 24, 32, 0.6)',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border-primary)',
        marginTop: '0.75rem',
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
          Backend Presets
          <span
            style={{
              marginLeft: '0.5rem',
              fontSize: '0.625rem',
              color: 'var(--text-dim)',
              fontWeight: 400,
            }}
          >
            (Phase 6)
          </span>
        </h3>
        
        <button
          onClick={onRefresh}
          disabled={disabled}
          title="Refresh preset list"
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
          ↻ Refresh
        </button>
      </div>
      
      {/* Create Preset Section */}
      {isCreating ? (
        <div
          style={{
            padding: '0.75rem',
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: 'var(--radius-sm)',
            marginBottom: '0.75rem',
          }}
        >
          <div style={{ marginBottom: '0.5rem' }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.6875rem',
                color: 'var(--text-secondary)',
                marginBottom: '0.25rem',
              }}
            >
              Preset Name *
            </label>
            <input
              type="text"
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              placeholder="e.g., ProRes 422 HQ Proxy"
              autoFocus
              disabled={isSubmitting}
              style={{
                width: '100%',
                padding: '0.5rem',
                fontSize: '0.75rem',
                background: 'var(--input-bg)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
          
          <div style={{ marginBottom: '0.5rem' }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.6875rem',
                color: 'var(--text-secondary)',
                marginBottom: '0.25rem',
              }}
            >
              Description (optional)
            </label>
            <input
              type="text"
              value={newPresetDescription}
              onChange={(e) => setNewPresetDescription(e.target.value)}
              placeholder="e.g., For offline editing"
              disabled={isSubmitting}
              style={{
                width: '100%',
                padding: '0.5rem',
                fontSize: '0.75rem',
                background: 'var(--input-bg)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
          
          {/* Phase 7B: Scope selector */}
          <div style={{ marginBottom: '0.5rem' }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.6875rem',
                color: 'var(--text-secondary)',
                marginBottom: '0.25rem',
              }}
            >
              Scope
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  padding: '0.375rem 0.625rem',
                  background: newPresetScope === 'user' ? 'rgba(59, 130, 246, 0.15)' : 'var(--input-bg)',
                  border: newPresetScope === 'user' ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  fontSize: '0.6875rem',
                  color: newPresetScope === 'user' ? 'var(--button-primary-bg)' : 'var(--text-secondary)',
                }}
              >
                <input
                  type="radio"
                  name="presetScope"
                  value="user"
                  checked={newPresetScope === 'user'}
                  onChange={() => setNewPresetScope('user')}
                  disabled={isSubmitting}
                  style={{ margin: 0 }}
                />
                User
              </label>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  padding: '0.375rem 0.625rem',
                  background: newPresetScope === 'workspace' ? 'rgba(34, 197, 94, 0.15)' : 'var(--input-bg)',
                  border: newPresetScope === 'workspace' ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  fontSize: '0.6875rem',
                  color: newPresetScope === 'workspace' ? 'rgb(34, 197, 94)' : 'var(--text-secondary)',
                }}
              >
                <input
                  type="radio"
                  name="presetScope"
                  value="workspace"
                  checked={newPresetScope === 'workspace'}
                  onChange={() => setNewPresetScope('workspace')}
                  disabled={isSubmitting}
                  style={{ margin: 0 }}
                />
                Workspace
              </label>
            </div>
            <div
              style={{
                marginTop: '0.25rem',
                fontSize: '0.5625rem',
                color: 'var(--text-dim)',
                fontStyle: 'italic',
              }}
            >
              {newPresetScope === 'user'
                ? 'User presets are available only to you'
                : 'Workspace presets are shared with this project'}
            </div>
          </div>
          
          {error && (
            <div
              style={{
                padding: '0.5rem',
                marginBottom: '0.5rem',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.6875rem',
                color: 'var(--status-failed-fg, #ef4444)',
              }}
            >
              {error}
            </div>
          )}
          
          <div
            style={{
              fontSize: '0.625rem',
              color: 'var(--text-dim)',
              marginBottom: '0.5rem',
              fontStyle: 'italic',
            }}
          >
            Current Deliver settings will be saved as a preset snapshot. Applied at job creation only.
          </div>
          
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreatePreset}
              disabled={isSubmitting || !newPresetName.trim()}
              loading={isSubmitting}
            >
              Save Preset
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setIsCreating(false)
                setNewPresetName('')
                setNewPresetDescription('')
                setError(null)
              }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setIsCreating(true)}
          disabled={disabled}
          style={{ marginBottom: '0.75rem' }}
        >
          + Create Preset from Current Settings
        </Button>
      )}
      
      {/* Preset List */}
      <div>
        <button
          onClick={() => setShowManageList(!showManageList)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: '0.6875rem',
            cursor: 'pointer',
            padding: '0.25rem 0',
          }}
        >
          <span style={{ transform: showManageList ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>▶</span>
          Manage Presets ({presets.length})
        </button>
        
        {showManageList && (
          <div
            style={{
              marginTop: '0.5rem',
              maxHeight: '200px',
              overflow: 'auto',
            }}
          >
            {presets.length === 0 ? (
              <div
                style={{
                  padding: '0.75rem',
                  fontSize: '0.6875rem',
                  color: 'var(--text-dim)',
                  textAlign: 'center',
                  fontStyle: 'italic',
                }}
              >
                No presets yet
              </div>
            ) : (
              presets.map((preset) => (
                <div
                  key={preset.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0.5rem',
                    background: 'rgba(0, 0, 0, 0.1)',
                    borderRadius: 'var(--radius-sm)',
                    marginBottom: '0.25rem',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.375rem',
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        color: 'var(--text-primary)',
                      }}
                    >
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {preset.name}
                      </span>
                      {/* Phase 7B: Scope badge */}
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
                    </div>
                    {preset.description && (
                      <div
                        style={{
                          fontSize: '0.625rem',
                          color: 'var(--text-dim)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {preset.description}
                      </div>
                    )}
                    <div
                      style={{
                        fontSize: '0.5625rem',
                        color: 'var(--text-dim)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {preset.fingerprint}
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button
                      onClick={() => handleDuplicate(preset.id)}
                      disabled={disabled}
                      title="Duplicate (to edit)"
                      style={{
                        padding: '0.25rem 0.375rem',
                        fontSize: '0.625rem',
                        background: 'transparent',
                        border: '1px solid var(--border-primary)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                      }}
                    >
                      ⎘
                    </button>
                    <button
                      onClick={() => handleDelete(preset.id)}
                      disabled={disabled}
                      title="Delete"
                      style={{
                        padding: '0.25rem 0.375rem',
                        fontSize: '0.625rem',
                        background: 'transparent',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--status-failed-fg, #ef4444)',
                        cursor: 'pointer',
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default BackendPresetActions
