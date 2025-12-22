/**
 * SourceMetadataPanel — Displays source file metadata
 * 
 * Shows metadata for the currently selected source file or job file.
 * Located below the Sources panel in the left sidebar.
 */

import { useEffect, useState } from 'react'

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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch metadata when source file changes
  useEffect(() => {
    if (customMetadata) {
      setMetadata(customMetadata)
      return
    }

    if (!sourceFilePath) {
      setMetadata(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    const fetchMetadata = async () => {
      try {
        const response = await fetch(`${backendUrl}/metadata/extract`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source_path: sourceFilePath }),
        })

        if (!cancelled) {
          if (response.ok) {
            const data = await response.json()
            setMetadata({
              resolution: data.width && data.height ? `${data.width}×${data.height}` : undefined,
              width: data.width,
              height: data.height,
              fps: data.frame_rate,
              frame_rate: data.frame_rate,
              duration: data.duration,
              video_codec: data.video_codec,
              codec: data.video_codec,
              timecode_start: data.timecode_start,
              timecode_end: data.timecode_end,
              frames: data.frames,
              container: data.container,
              audio_codec: data.audio_codec,
              audio_channels: data.audio_channels,
              reel_name: data.reel_name,
              aspect_ratio: data.aspect_ratio,
              bit_rate: data.bit_rate,
              file_size: data.file_size,
            })
          } else {
            setError('Failed to load metadata')
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError('Failed to connect')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    fetchMetadata()

    return () => {
      cancelled = true
    }
  }, [sourceFilePath, backendUrl, customMetadata])

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
        {loading && (
          <span style={{ color: 'var(--text-muted)', fontSize: '0.625rem' }}>Loading...</span>
        )}
      </div>

      {/* No source state */}
      {!sourceFilePath && (
        <div style={{ color: 'var(--text-dim)', fontStyle: 'italic', padding: '0.5rem 0' }}>
          Select a source file to view metadata
        </div>
      )}

      {/* Error state */}
      {error && sourceFilePath && (
        <div style={{ color: 'var(--text-warning)', fontSize: '0.625rem' }}>
          {error}
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
