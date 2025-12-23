import { Button } from './Button'

/**
 * PresetPositionConflictDialog - Confirmation dialog for preset vs manual position conflict.
 * 
 * Phase 9E: Preset Interaction Boundaries
 * 
 * Shown when:
 * - A preset is being applied (or re-applied)
 * - One or more overlay layers have positionSource === "manual"
 * 
 * This ensures presets never silently overwrite manual preview edits.
 */

interface PresetPositionConflictDialogProps {
  /** Whether the dialog is visible */
  isOpen: boolean
  /** Callback when user chooses to keep manual position */
  onKeepManual: () => void
  /** Callback when user chooses to reset to preset */
  onResetToPreset: () => void
}

export function PresetPositionConflictDialog({
  isOpen,
  onKeepManual,
  onResetToPreset,
}: PresetPositionConflictDialogProps) {
  if (!isOpen) return null
  
  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onKeepManual() // Default action on Escape
    } else if (e.key === 'Enter') {
      onKeepManual() // Default action on Enter
    }
  }
  
  return (
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
      onClick={onKeepManual}
      onKeyDown={handleKeyDown}
      data-testid="preset-position-conflict-backdrop"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--card-bg-solid, #1a1a1a)',
          border: '1px solid var(--border-primary)',
          borderRadius: '8px',
          padding: '1rem',
          minWidth: '300px',
          maxWidth: '420px',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
        }}
        role="dialog"
        aria-labelledby="preset-conflict-title"
        aria-modal="true"
        data-testid="preset-position-conflict-dialog"
      >
        <h3
          id="preset-conflict-title"
          style={{
            margin: '0 0 0.5rem',
            fontSize: '0.9375rem',
            fontWeight: 600,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-sans)',
          }}
        >
          Preset Position Conflict
        </h3>
        
        <p
          style={{
            margin: '0 0 1rem',
            fontSize: '0.8125rem',
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-sans)',
            lineHeight: 1.5,
          }}
        >
          One or more overlays were manually positioned in the preview.
          Applying this preset will reset their position.
        </p>
        
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <Button
            variant="primary"
            size="sm"
            onClick={onResetToPreset}
            data-testid="preset-conflict-reset"
          >
            Reset to preset
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onKeepManual}
            autoFocus
            data-testid="preset-conflict-keep"
          >
            Keep manual position
          </Button>
        </div>
      </div>
    </div>
  )
}
