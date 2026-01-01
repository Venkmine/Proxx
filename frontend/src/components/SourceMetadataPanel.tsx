/**
 * SourceMetadataPanel — Preflight-gated metadata display.
 * 
 * RATIONALE:
 * Forge is a deterministic proxy engine, not a media browser.
 * The UI must reflect certainty, not speculation.
 * 
 * DESIGN (Strict):
 * - Shows metadata ONLY after preflight completes successfully
 * - NO automatic metadata fetch on selection
 * - NO thumbnails or previews
 * - Displays explicit placeholder before preflight
 * 
 * REMOVED (per INC-003):
 * - /metadata/extract endpoint was intentionally removed
 * - Loading states for metadata fetch
 * - Speculative preview functionality
 * 
 * All behavior derives from SourceSelectionState enum.
 */

import { 
  SourceSelectionState, 
  shouldShowMetadata 
} from '../stores/sourceSelectionStore'

interface SourceMetadata {
  resolution?: string
  width?: number
  height?: number
  fps?: string
  frame_rate?: string
  duration?: string
  video_codec?: string
  codec?: string
  timecode_start?: string
  container?: string
  frames?: number
}

interface SourceMetadataPanelProps {
  /** Current source selection state */
  selectionState: SourceSelectionState
  /** Metadata from preflight (only valid when state === READY) */
  preflightMetadata?: SourceMetadata | null
}

/**
 * SourceMetadataPanel — Shows metadata only after preflight.
 * 
 * Before preflight: Shows placeholder message.
 * After preflight: Shows validated metadata from backend.
 * NO speculative metadata. NO thumbnails.
 */
export function SourceMetadataPanel({
  selectionState,
  preflightMetadata,
}: SourceMetadataPanelProps) {
  const canShowMetadata = shouldShowMetadata(selectionState)

  // Empty state
  if (selectionState === SourceSelectionState.EMPTY) {
    return null
  }

  // Pre-preflight: Explicit placeholder
  if (!canShowMetadata) {
    return (
      <div
        data-testid="source-metadata-panel"
        style={{
          padding: '0.75rem 1rem',
          borderTop: '1px solid var(--border-primary)',
          background: 'rgba(20, 24, 32, 0.6)',
          fontSize: '0.6875rem',
        }}
      >
        <div style={{ 
          color: 'var(--text-dim)', 
          fontStyle: 'italic', 
          padding: '0.5rem 0',
          textAlign: 'center',
        }}>
          Metadata available after preflight
        </div>
      </div>
    )
  }

  // Post-preflight: Show metadata if available
  if (!preflightMetadata) {
    return (
      <div
        data-testid="source-metadata-panel"
        style={{
          padding: '0.75rem 1rem',
          borderTop: '1px solid var(--border-primary)',
          background: 'rgba(20, 24, 32, 0.6)',
          fontSize: '0.6875rem',
        }}
      >
        <div style={{ 
          color: 'var(--text-dim)', 
          fontStyle: 'italic', 
          padding: '0.5rem 0' 
        }}>
          No metadata in preflight result
        </div>
      </div>
    )
  }

  return (
    <div
      data-testid="source-metadata-panel"
      style={{
        padding: '0.75rem 1rem',
        borderTop: '1px solid var(--border-primary)',
        background: 'rgba(20, 24, 32, 0.6)',
        fontSize: '0.6875rem',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '0.5rem',
      }}>
        <span style={{
          fontSize: '0.6875rem',
          fontWeight: 600,
          color: 'var(--text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          Source Info (from preflight)
        </span>
      </div>

      {/* Metadata grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr',
        gap: '0.25rem 0.75rem',
        color: 'var(--text-muted)',
      }}>
        {preflightMetadata.resolution && (
          <>
            <span style={{ color: 'var(--text-dim)' }}>Resolution</span>
            <span>{preflightMetadata.resolution}</span>
          </>
        )}
        {(preflightMetadata.fps || preflightMetadata.frame_rate) && (
          <>
            <span style={{ color: 'var(--text-dim)' }}>Frame Rate</span>
            <span>{preflightMetadata.fps || preflightMetadata.frame_rate} fps</span>
          </>
        )}
        {preflightMetadata.duration && (
          <>
            <span style={{ color: 'var(--text-dim)' }}>Duration</span>
            <span>{preflightMetadata.duration}</span>
          </>
        )}
        {(preflightMetadata.video_codec || preflightMetadata.codec) && (
          <>
            <span style={{ color: 'var(--text-dim)' }}>Video Codec</span>
            <span>{preflightMetadata.video_codec || preflightMetadata.codec}</span>
          </>
        )}
        {preflightMetadata.container && (
          <>
            <span style={{ color: 'var(--text-dim)' }}>Container</span>
            <span>{preflightMetadata.container.toUpperCase()}</span>
          </>
        )}
        {preflightMetadata.timecode_start && (
          <>
            <span style={{ color: 'var(--text-dim)' }}>TC Start</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>{preflightMetadata.timecode_start}</span>
          </>
        )}
        {preflightMetadata.frames && (
          <>
            <span style={{ color: 'var(--text-dim)' }}>Frames</span>
            <span>{preflightMetadata.frames.toLocaleString()}</span>
          </>
        )}
      </div>
    </div>
  )
}
