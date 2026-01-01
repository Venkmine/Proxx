/**
 * SourceMetadataPanel — Displays source file metadata
 * 
 * Shows metadata for the currently selected source file or job file.
 * Located below the Sources panel in the left sidebar.
 * 
 * INC-003 (v1): The /metadata/extract endpoint was intentionally removed
 * to preserve determinism and avoid misleading previews.
 * This component now ONLY displays customMetadata passed from parent.
 * It does NOT fetch metadata from the backend.
 */

import { useState } from 'react'

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
  timecode_end?: string
  frames?: number
  container?: string
  audio_codec?: string
  audio_channels?: number
  reel_name?: string
  aspect_ratio?: string
  bit_rate?: string
  file_size?: string
}

interface SourceMetadataPanelProps {
  /** Path to the source file */
  sourceFilePath?: string
  /** Backend URL for API calls */
  backendUrl?: string
  /** Whether to show the panel */
  isVisible?: boolean
  /** Custom metadata to display (overrides fetch) */
  customMetadata?: SourceMetadata
}

export function SourceMetadataPanel({
  sourceFilePath,
  backendUrl = 'http://127.0.0.1:8085',
  isVisible = true,
  customMetadata,
}: SourceMetadataPanelProps) {
  const [metadata, setMetadata] = useState<SourceMetadata | null>(null)
  // INC-003: Removed loading/error state since we no longer fetch from backend.
  // The /metadata/extract endpoint was intentionally removed in v1
  // to preserve determinism and avoid misleading previews.
  // Metadata is ONLY provided via customMetadata prop from parent.

  // Set metadata from custom prop (no backend fetch)
  if (customMetadata && metadata !== customMetadata) {
    setMetadata(customMetadata)
  } else if (!customMetadata && !sourceFilePath && metadata !== null) {
    setMetadata(null)
  }

  if (!isVisible) {
    return null
  }

  const fileName = sourceFilePath ? sourceFilePath.split('/').pop() : null

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
          Source Info
        </span>
        {/* INC-003: Loading indicator removed - no backend fetch */}
      </div>

      {/* No source state */}
      {!sourceFilePath && (
        <div style={{ color: 'var(--text-dim)', fontStyle: 'italic', padding: '0.5rem 0' }}>
          Select a source file to view metadata
        </div>
      )}

      {/* INC-003: No metadata available state (backend endpoint removed) */}
      {sourceFilePath && !metadata && (
        <div style={{ color: 'var(--text-dim)', fontStyle: 'italic', padding: '0.5rem 0' }}>
          Metadata not available
        </div>
      )}

      {/* Metadata display */}
      {metadata && sourceFilePath && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
          {/* Filename */}
          {fileName && (
            <div style={{
              color: 'var(--text-primary)',
              fontSize: '0.75rem',
              fontFamily: 'var(--font-mono)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              marginBottom: '0.25rem',
            }}>
              {fileName}
            </div>
          )}

          {/* Metadata grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '0.25rem 0.75rem',
            color: 'var(--text-muted)',
          }}>
            {metadata.resolution && (
              <>
                <span style={{ color: 'var(--text-dim)' }}>Resolution</span>
                <span>{metadata.resolution}</span>
              </>
            )}
            {(metadata.fps || metadata.frame_rate) && (
              <>
                <span style={{ color: 'var(--text-dim)' }}>Frame Rate</span>
                <span>{metadata.fps || metadata.frame_rate} fps</span>
              </>
            )}
            {metadata.duration && (
              <>
                <span style={{ color: 'var(--text-dim)' }}>Duration</span>
                <span>{metadata.duration}</span>
              </>
            )}
            {(metadata.video_codec || metadata.codec) && (
              <>
                <span style={{ color: 'var(--text-dim)' }}>Video Codec</span>
                <span>{metadata.video_codec || metadata.codec}</span>
              </>
            )}
            {metadata.container && (
              <>
                <span style={{ color: 'var(--text-dim)' }}>Container</span>
                <span>{metadata.container.toUpperCase()}</span>
              </>
            )}
            {metadata.timecode_start && (
              <>
                <span style={{ color: 'var(--text-dim)' }}>TC Start</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{metadata.timecode_start}</span>
              </>
            )}
            {metadata.timecode_end && (
              <>
                <span style={{ color: 'var(--text-dim)' }}>TC End</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{metadata.timecode_end}</span>
              </>
            )}
            {metadata.frames && (
              <>
                <span style={{ color: 'var(--text-dim)' }}>Frames</span>
                <span>{metadata.frames.toLocaleString()}</span>
              </>
            )}
            {metadata.audio_codec && (
              <>
                <span style={{ color: 'var(--text-dim)' }}>Audio</span>
                <span>{metadata.audio_codec}{metadata.audio_channels ? ` (${metadata.audio_channels}ch)` : ''}</span>
              </>
            )}
            {metadata.reel_name && (
              <>
                <span style={{ color: 'var(--text-dim)' }}>Reel</span>
                <span>{metadata.reel_name}</span>
              </>
            )}
            {metadata.aspect_ratio && (
              <>
                <span style={{ color: 'var(--text-dim)' }}>Aspect</span>
                <span>{metadata.aspect_ratio}</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
