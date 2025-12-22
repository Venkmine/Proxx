import { Button } from './Button'

/**
 * DiscardChangesDialog - Confirmation dialog for unsaved preset changes.
 * 
 * Shown when:
 * - Switching presets AND isDirty === true
 * 
 * NOT shown when:
 * - Exiting Burn-ins mode (returns to same preset with state preserved)
 */

interface DiscardChangesDialogProps {
  /** Whether the dialog is visible */
  isOpen: boolean
  /** Callback when user chooses to discard changes */
  onDiscard: () => void
  /** Callback when user cancels (keeps current preset) */
  onCancel: () => void
  /** Optional preset name being switched away from */
  presetName?: string
}

export function DiscardChangesDialog({
  isOpen,
  onDiscard,
  onCancel,
  presetName,
}: DiscardChangesDialogProps) {
  if (!isOpen) return null
  
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
      onClick={onCancel}
      data-testid="discard-changes-backdrop"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--card-bg-solid, #1a1a1a)',
          border: '1px solid var(--border-primary)',
          borderRadius: '8px',
          padding: '1rem',
          minWidth: '300px',
          maxWidth: '400px',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
        }}
        data-testid="discard-changes-dialog"
      >
        <h3
          style={{
            margin: '0 0 0.5rem',
            fontSize: '0.9375rem',
            fontWeight: 600,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-sans)',
          }}
        >
          Discard changes?
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
          {presetName
            ? `You have unsaved changes to "${presetName}". These changes will be lost.`
            : 'You have unsaved changes. These changes will be lost.'}
        </p>
        
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            data-testid="discard-changes-cancel"
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onDiscard}
            style={{
              background: 'var(--status-warning-bg)',
              borderColor: 'var(--status-warning-bg)',
            }}
            data-testid="discard-changes-confirm"
          >
            Discard
          </Button>
        </div>
      </div>
    </div>
  )
}
