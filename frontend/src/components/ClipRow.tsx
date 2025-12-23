import React, { useState } from 'react'
import { StatusBadge } from './StatusBadge'
import { Button } from './Button'

/**
 * ClipRow component - first-class clip display in the queue.
 * 
 * Displays:
 * - Source filename (not full path)
 * - Resolution, Codec, Frame Rate, Duration
 * - Output preset name
 * - Output path (truncated) with Reveal button
 * - Settings affordance for read-only preset view
 * 
 * Per design requirements:
 * - DO NOT display "N/A" — show "—" or hide the field
 * - Each clip row must expose a "Settings" affordance
 */

interface ClipMetadata {
  resolution?: string
  codec?: string
  frameRate?: string
  duration?: string
  audioLayout?: string
}

interface ClipRowProps {
  id: string
  sourcePath: string
  status: string
  failureReason?: string | null
  warnings?: string[]
  metadata?: ClipMetadata
  presetName?: string
  outputPath?: string
  isSelected?: boolean
  onClick?: (e: React.MouseEvent) => void
  onReveal?: () => void
  onSettingsClick?: () => void
  // Phase 16.4: Progress tracking
  progressPercent?: number
  etaSeconds?: number | null
  // Phase 20: Enhanced progress
  encodeFps?: number | null
  phase?: string | null  // PREPARING | ENCODING | FINALIZING
  thumbnail?: string | null
}

// Extract filename from full path
function getFilename(path: string): string {
  return path.split('/').pop() || path.split('\\').pop() || path
}

// Truncate path for display, keeping filename visible
function truncatePath(path: string, maxLength: number = 40): string {
  if (path.length <= maxLength) return path
  const filename = getFilename(path)
  if (filename.length >= maxLength - 3) {
    return '...' + filename.slice(-(maxLength - 3))
  }
  const remaining = maxLength - filename.length - 4
  return path.slice(0, remaining) + '/.../' + filename
}

// Phase 16.4: Format ETA for display
function formatEta(etaSeconds: number | null | undefined): string {
  if (etaSeconds == null || etaSeconds < 0) return ''
  
  if (etaSeconds < 60) {
    return `${Math.round(etaSeconds)}s`
  }
  
  if (etaSeconds < 3600) {
    const minutes = Math.floor(etaSeconds / 60)
    const seconds = Math.round(etaSeconds % 60)
    return `${minutes}m ${seconds}s`
  }
  
  const hours = Math.floor(etaSeconds / 3600)
  const minutes = Math.floor((etaSeconds % 3600) / 60)
  return `${hours}h ${minutes}m`
}

export function ClipRow({
  id: _id,
  sourcePath,
  status,
  failureReason,
  warnings = [],
  metadata = {},
  presetName,
  outputPath,
  isSelected = false,
  onClick,
  onReveal,
  onSettingsClick,
  progressPercent = 0,
  etaSeconds,
  encodeFps,
  phase,
  thumbnail,
}: ClipRowProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const filename = getFilename(sourcePath)
  const isRunning = status.toUpperCase() === 'RUNNING'
  const isFailed = status.toUpperCase() === 'FAILED'
  
  // Format metadata for display — use "—" for missing values
  const formatValue = (val?: string) => val || '—'

  // Phase 4B: Visual hierarchy - different backgrounds for running/failed clips
  const getBackgroundColor = () => {
    if (isSelected) return 'rgba(59, 130, 246, 0.08)'
    if (isRunning) return 'rgba(59, 130, 246, 0.04)'
    if (isFailed) return 'rgba(239, 68, 68, 0.04)'
    if (isHovered) return 'rgba(255, 255, 255, 0.02)'
    return 'transparent'
  }

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        // Phase 4B: Indent clip rows to show hierarchy under job header
        padding: '0.75rem 1rem 0.75rem 2rem',
        cursor: onClick ? 'pointer' : 'default',
        backgroundColor: getBackgroundColor(),
        borderLeft: isSelected 
          ? '3px solid var(--button-primary-bg)' 
          : isRunning 
            ? '3px solid var(--status-running-fg)' 
            : isFailed
              ? '3px solid var(--status-failed-fg)'
              : '3px solid transparent',
        borderBottom: '1px solid var(--border-secondary)',
        transition: 'background-color 0.1s, border-left 0.1s',
      }}
    >
      {/* Main row: status + filename + actions */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
        }}
      >
        {/* Alpha: Thumbnail preview - graceful fallback on error */}
        {thumbnail && (
          <div
            style={{
              width: '48px',
              height: '32px',
              borderRadius: '4px',
              overflow: 'hidden',
              flexShrink: 0,
              backgroundColor: 'var(--bg-tertiary)',
            }}
          >
            <img
              src={thumbnail}
              alt=""
              onError={(e) => {
                // Hide broken image gracefully
                (e.target as HTMLImageElement).style.display = 'none'
              }}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
          </div>
        )}
        
        <StatusBadge status={status} size="sm" />
        
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.8125rem',
              fontWeight: 500,
              color: 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={sourcePath}
          >
            {filename}
          </div>
          
          {/* Metadata strip */}
          <div
            style={{
              display: 'flex',
              gap: '1rem',
              marginTop: '0.375rem',
              fontSize: '0.6875rem',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-muted)',
            }}
          >
            {metadata.resolution && (
              <span title="Resolution">{metadata.resolution}</span>
            )}
            {metadata.codec && (
              <span title="Codec">{metadata.codec}</span>
            )}
            {metadata.frameRate && (
              <span title="Frame Rate">{metadata.frameRate}</span>
            )}
            {metadata.duration && (
              <span title="Duration">{metadata.duration}</span>
            )}
            {presetName && (
              <span 
                title="Output Preset" 
                style={{ color: 'var(--text-secondary)' }}
              >
                ⚙ {presetName}
              </span>
            )}
          </div>
          
          {/* Phase 16.4 + Phase 20: Progress bar for running clips */}
          {isRunning && (
            <div style={{ marginTop: '0.5rem' }}>
              {/* Phase 20: Status phase indicator */}
              {phase && (
                <div
                  style={{
                    marginBottom: '0.25rem',
                    fontSize: '0.625rem',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 600,
                    color: phase === 'ENCODING' ? 'var(--button-primary-bg)' : 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  {phase}
                </div>
              )}
              
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                {/* Progress bar container */}
                <div
                  style={{
                    flex: 1,
                    height: '4px',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    borderRadius: '2px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(100, Math.max(0, progressPercent))}%`,
                      height: '100%',
                      backgroundColor: 'var(--button-primary-bg)',
                      borderRadius: '2px',
                      transition: 'width 0.3s ease-out',
                    }}
                  />
                </div>
                
                {/* Progress percentage */}
                <span
                  style={{
                    fontSize: '0.6875rem',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-muted)',
                    minWidth: '3rem',
                    textAlign: 'right',
                  }}
                >
                  {Math.round(progressPercent)}%
                </span>
              </div>
              
              {/* Phase 20: Enhanced progress display */}
              <div
                style={{
                  display: 'flex',
                  gap: '1rem',
                  marginTop: '0.25rem',
                  fontSize: '0.625rem',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-dim)',
                }}
              >
                {/* ETA */}
                {etaSeconds != null && etaSeconds > 0 && (
                  <span>~{formatEta(etaSeconds)} remaining</span>
                )}
                
                {/* Encode FPS */}
                {encodeFps != null && encodeFps > 0 && (
                  <span style={{ color: 'var(--text-muted)' }}>
                    {encodeFps.toFixed(1)} fps
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '0.375rem', flexShrink: 0 }}>
          {onSettingsClick && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                setShowSettings(!showSettings)
                onSettingsClick()
              }}
              title="View encoding settings"
              style={{ padding: '0.25rem 0.5rem' }}
            >
              ⚙
            </Button>
          )}
          
          {onReveal && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                onReveal()
              }}
              title="Reveal in Finder"
            >
              Reveal
            </Button>
          )}
        </div>
      </div>

      {/* Output path if available */}
      {outputPath && (
        <div
          style={{
            marginTop: '0.375rem',
            paddingLeft: '1.5rem',
            fontSize: '0.6875rem',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-dim)',
          }}
          title={outputPath}
        >
          → {truncatePath(outputPath)}
        </div>
      )}

      {/* Failure reason */}
      {failureReason && (
        <div
          style={{
            marginTop: '0.5rem',
            paddingLeft: '1.5rem',
            fontSize: '0.75rem',
            color: 'var(--status-failed-fg)',
            fontFamily: 'var(--font-sans)',
          }}
        >
          Error: {failureReason}
        </div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <div
          style={{
            marginTop: '0.375rem',
            paddingLeft: '1.5rem',
            fontSize: '0.75rem',
            color: 'var(--status-warning-fg)',
            fontFamily: 'var(--font-sans)',
          }}
        >
          Warnings: {warnings.join(', ')}
        </div>
      )}

      {/* Settings disclosure (read-only preset details) */}
      {showSettings && (
        <div
          style={{
            marginTop: '0.75rem',
            padding: '0.75rem',
            backgroundColor: 'var(--card-bg)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-secondary)',
          }}
        >
          <div
            style={{
              fontSize: '0.6875rem',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              marginBottom: '0.5rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Encoding Settings (Read-Only)
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: '0.25rem 1rem',
              fontSize: '0.75rem',
              fontFamily: 'var(--font-mono)',
            }}
          >
            <span style={{ color: 'var(--text-muted)' }}>Preset:</span>
            <span style={{ color: 'var(--text-primary)' }}>{formatValue(presetName)}</span>
            <span style={{ color: 'var(--text-muted)' }}>Resolution:</span>
            <span style={{ color: 'var(--text-primary)' }}>{formatValue(metadata.resolution)}</span>
            <span style={{ color: 'var(--text-muted)' }}>Codec:</span>
            <span style={{ color: 'var(--text-primary)' }}>{formatValue(metadata.codec)}</span>
            <span style={{ color: 'var(--text-muted)' }}>Frame Rate:</span>
            <span style={{ color: 'var(--text-primary)' }}>{formatValue(metadata.frameRate)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default ClipRow
