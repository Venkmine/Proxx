/**
 * SourceSelectionPanel — Unified Source Selection UI
 * 
 * RATIONALE:
 * Forge is a deterministic proxy engine, not a media browser.
 * The UI must reflect certainty, not speculation.
 * 
 * This component is the SINGLE entry point for source selection UI.
 * It replaces multiple nested panels with a flat, state-driven design.
 * 
 * DESIGN (Strict):
 * - All behavior derives from SourceSelectionState enum
 * - NO ad-hoc boolean flags (hasSources, isLoading, hasMetadata)
 * - Preflight is the ONLY transition to READY
 * - Errors are persistent, not toasts
 * - Empty states preferred over disabled controls
 * 
 * STATE → UI MAPPING:
 * - EMPTY: Show empty state with "Add Sources" prompt
 * - SELECTED_UNVALIDATED: Show paths, enable preflight
 * - PREFLIGHT_RUNNING: Show loading, disable inputs
 * - PREFLIGHT_FAILED: Show error banner, allow retry/clear
 * - READY: Show validated paths, enable job creation
 */

import { useCallback } from 'react'
import { Button } from './Button'
import { SourceList } from './SourceList'
import { PreflightErrorBanner } from './PreflightErrorBanner'
import { 
  SourceSelectionState,
  canModifySources,
  canRunPreflight,
  canCreateJob,
  isPreflightRunning,
  hasPreflightError,
  useSourceSelectionStore,
} from '../stores/sourceSelectionStore'

// NOTE: Electron types are declared in App.tsx (global scope)

interface SourceSelectionPanelProps {
  /** Electron IPC available */
  hasElectron: boolean
  /** Trigger preflight on backend */
  onRunPreflight: () => void
  /** Create job after preflight */
  onCreateJob: () => void
}

/**
 * SourceSelectionPanel — Flat, state-driven source selection.
 * 
 * One component. One state machine. No speculation.
 */
export function SourceSelectionPanel({
  hasElectron,
  onRunPreflight,
  onCreateJob,
}: SourceSelectionPanelProps) {
  // Get state from store
  const {
    state,
    selectedPaths,
    preflightResult,
    preflightError,
    addPaths,
    removePath,
    clearAll,
  } = useSourceSelectionStore()

  // Derived booleans (from state, not ad-hoc)
  const canModify = canModifySources(state)
  const canPreflight = canRunPreflight(state)
  const canCreate = canCreateJob(state)
  const isLoading = isPreflightRunning(state)
  const hasError = hasPreflightError(state)

  // OS dialog handlers
  // NOTE: window.electron types are declared in App.tsx
  const handleSelectFiles = useCallback(async () => {
    if (!hasElectron || !window.electron) return
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const electron = window.electron as any
      const result = await electron.openFiles()
      if (result && result.length > 0) {
        addPaths(result)
      }
    } catch (err) {
      console.error('Error selecting files:', err)
    }
  }, [hasElectron, addPaths])

  const handleSelectFolder = useCallback(async () => {
    if (!hasElectron || !window.electron) return
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const electron = window.electron as any
      const result = await electron.openFolder()
      if (result) {
        addPaths([result])
      }
    } catch (err) {
      console.error('Error selecting folder:', err)
    }
  }, [hasElectron, addPaths])

  return (
    <div
      data-testid="source-selection-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
      }}
    >
      {/* Header with state indicator */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border-primary)',
        backgroundColor: 'var(--bg-secondary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{
          fontSize: '0.8125rem',
          fontWeight: 600,
          color: 'var(--text-primary)',
          textTransform: 'uppercase',
          letterSpacing: '-0.01em',
        }}>
          Sources
        </span>
        <StateIndicator state={state} />
      </div>

      {/* Error banner (persistent, not toast) */}
      {hasError && (
        <div style={{ padding: '16px 16px 0' }}>
          <PreflightErrorBanner
            selectionState={state}
            error={preflightError}
            onRetry={onRunPreflight}
            onClear={clearAll}
          />
        </div>
      )}

      {/* Content area */}
      <div style={{ 
        flex: 1, 
        minHeight: 0, 
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* EMPTY state: Show add prompt */}
        {state === SourceSelectionState.EMPTY && (
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '32px',
            gap: '16px',
            color: 'var(--text-dim)',
          }}>
            <div style={{ fontSize: '0.875rem', textAlign: 'center' }}>
              No sources selected
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button onClick={handleSelectFiles} disabled={!hasElectron}>
                📁 Select Files
              </Button>
              <Button onClick={handleSelectFolder} disabled={!hasElectron}>
                📂 Select Folder
              </Button>
            </div>
          </div>
        )}

        {/* Other states: Show path list */}
        {state !== SourceSelectionState.EMPTY && (
          <SourceList
            sources={selectedPaths}
            selectionState={state}
            onRemove={removePath}
            onClearAll={clearAll}
          />
        )}
      </div>

      {/* Action bar */}
      {state !== SourceSelectionState.EMPTY && (
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border-primary)',
          backgroundColor: 'var(--bg-secondary)',
          display: 'flex',
          gap: '8px',
          justifyContent: 'flex-end',
        }}>
          {/* Add more sources */}
          {canModify && (
            <>
              <Button 
                onClick={handleSelectFiles} 
                disabled={!hasElectron || isLoading}
                style={{ fontSize: '0.75rem' }}
              >
                + Files
              </Button>
              <Button 
                onClick={handleSelectFolder} 
                disabled={!hasElectron || isLoading}
                style={{ fontSize: '0.75rem' }}
              >
                + Folder
              </Button>
            </>
          )}

          {/* Preflight button */}
          {canPreflight && (
            <Button 
              onClick={onRunPreflight}
              style={{ 
                fontSize: '0.75rem',
                backgroundColor: 'var(--accent-primary)',
              }}
            >
              Run Preflight
            </Button>
          )}

          {/* Loading indicator */}
          {isLoading && (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px',
              color: 'var(--text-muted)',
              fontSize: '0.75rem',
            }}>
              <span>⏳</span>
              Validating sources...
            </div>
          )}

          {/* Create job button (only when READY) */}
          {canCreate && (
            <Button 
              onClick={onCreateJob}
              style={{ 
                fontSize: '0.75rem',
                backgroundColor: 'var(--status-success-bg, #22c55e)',
                color: 'white',
              }}
            >
              Create Job ({preflightResult?.validFiles || 0} files)
            </Button>
          )}
        </div>
      )}

      {/* Preflight result summary (when READY) */}
      {state === SourceSelectionState.READY && preflightResult && (
        <div style={{
          padding: '8px 16px',
          borderTop: '1px solid var(--border-secondary)',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          fontSize: '0.6875rem',
          color: 'var(--text-muted)',
          display: 'flex',
          justifyContent: 'space-between',
        }}>
          <span>✔ Preflight passed</span>
          <span>
            {preflightResult.validFiles} valid 
            {preflightResult.skippedFiles > 0 && ` · ${preflightResult.skippedFiles} skipped`}
          </span>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// State Indicator
// =============================================================================

function StateIndicator({ state }: { state: SourceSelectionState }) {
  const config: Record<SourceSelectionState, { label: string; color: string }> = {
    [SourceSelectionState.EMPTY]: { 
      label: 'Empty', 
      color: 'var(--text-dim)' 
    },
    [SourceSelectionState.SELECTED_UNVALIDATED]: { 
      label: 'Needs preflight', 
      color: 'var(--status-warning-fg, #f59e0b)' 
    },
    [SourceSelectionState.PREFLIGHT_RUNNING]: { 
      label: 'Validating...', 
      color: 'var(--accent-primary)' 
    },
    [SourceSelectionState.PREFLIGHT_FAILED]: { 
      label: 'Failed', 
      color: 'var(--status-error-fg, #ef4444)' 
    },
    [SourceSelectionState.READY]: { 
      label: 'Ready', 
      color: 'var(--status-success-fg, #22c55e)' 
    },
  }

  const { label, color } = config[state]

  return (
    <span style={{
      fontSize: '0.625rem',
      fontFamily: 'var(--font-mono)',
      padding: '2px 6px',
      borderRadius: '2px',
      backgroundColor: `${color}20`,
      color,
      textTransform: 'uppercase',
    }}>
      {label}
    </span>
  )
}
