/**
 * SourceList - Deterministic source path display.
 * 
 * RATIONALE:
 * Forge is a deterministic proxy engine, not a media browser.
 * The UI must reflect certainty, not speculation.
 * 
 * DESIGN (Strict):
 * - Displays selected paths ONLY (no expansion, no preview)
 * - Allows removal ONLY
 * - NO metadata display (metadata available after preflight)
 * - NO thumbnails or previews
 * - NO file enumeration before preflight
 * 
 * All behavior derives from SourceSelectionState enum.
 * No ad-hoc boolean flags.
 */

import { Button } from './Button'
import { 
  SourceSelectionState, 
  canModifySources, 
  isPreflightRunning 
} from '../stores/sourceSelectionStore'

interface SourceListProps {
  /** List of source file/folder paths (opaque strings until preflight) */
  sources: string[]
  /** Current source selection state */
  selectionState: SourceSelectionState
  /** Remove a source from the list */
  onRemove: (path: string) => void
  /** Clear all sources */
  onClearAll: () => void
}

/**
 * SourceList - Display selected paths without speculation.
 * 
 * NO expansion. NO preview. NO metadata.
 * Paths are opaque strings until preflight validates them.
 */
export function SourceList({
  sources,
  selectionState,
  onRemove,
  onClearAll,
}: SourceListProps) {
  const canModify = canModifySources(selectionState)
  const isLoading = isPreflightRunning(selectionState)

  if (sources.length === 0) {
    return (
      <div style={{
        padding: '32px 16px',
        textAlign: 'center',
        color: '#888',
        fontSize: '13px',
      }}>
        No sources selected.
        <br />
        Use Select Files or Select Folder to add media.
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      minHeight: 0,
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid #333',
        backgroundColor: '#1e1e1e',
      }}>
        <div style={{ fontSize: '13px', fontWeight: 500, color: '#fff' }}>
          {sources.length} path{sources.length !== 1 ? 's' : ''} selected
        </div>
        <Button
          onClick={onClearAll}
          disabled={!canModify || isLoading}
          style={{
            fontSize: '12px',
            padding: '4px 8px',
          }}
        >
          Clear All
        </Button>
      </div>

      {/* Path List — No metadata, no expansion */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '8px',
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}>
          {sources.map((path, index) => (
            <div
              key={index}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                backgroundColor: '#2a2a2a',
                borderRadius: '4px',
                fontSize: '12px',
                border: '1px solid #333',
              }}
            >
              {/* Path only — no metadata */}
              <div
                style={{
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: '#fff',
                  fontFamily: 'var(--font-mono, monospace)',
                }}
                title={path}
              >
                {path}
              </div>

              {/* Remove only — no favorites (simplification) */}
              <button
                onClick={() => onRemove(path)}
                disabled={!canModify || isLoading}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#888',
                  cursor: (!canModify || isLoading) ? 'not-allowed' : 'pointer',
                  padding: '4px',
                  fontSize: '14px',
                  opacity: (!canModify || isLoading) ? 0.5 : 1,
                }}
                title="Remove"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Placeholder for metadata — shown only after preflight */}
      {selectionState === SourceSelectionState.SELECTED_UNVALIDATED && (
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid #333',
          backgroundColor: '#1a1a1a',
          fontSize: '11px',
          color: '#666',
          fontStyle: 'italic',
        }}>
          Metadata available after preflight
        </div>
      )}
    </div>
  )
}
