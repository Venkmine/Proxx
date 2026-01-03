import React, { useState } from 'react'
import { StatusBadge } from './StatusBadge'
import { Button } from './Button'
import { JobProgressBar, type DeliveryStage as DeliveryStageType } from './JobProgressBar'

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
 * 
 * V1 Hardening:
 * - Failure reasons are mapped to human-readable messages
 * - No stack traces or raw Python errors shown to users
 */

// ============================================================================
// FAILURE REASON MAPPING
// ============================================================================
// Maps technical error patterns to human-readable messages.
// This prevents raw Python errors from appearing in the UI.
// ============================================================================

function humanizeFailureReason(reason: string | null | undefined): string | null {
  if (!reason) return null
  
  // Normalize for pattern matching
  const normalized = reason.toLowerCase()
  
  // Output file issues
  if (normalized.includes('output file not found') || normalized.includes('output missing')) {
    return 'Output file was not created. Check disk space and permissions.'
  }
  if (normalized.includes('output collision') || normalized.includes('file exists')) {
    return 'Output file already exists. Change naming or enable overwrite.'
  }
  
  // FFmpeg specific
  if (normalized.includes('ffmpeg') && normalized.includes('not found')) {
    return 'FFmpeg is not installed or not in PATH.'
  }
  if (normalized.includes('exit code') || normalized.includes('non-zero')) {
    return 'Encoding failed. Check source file compatibility.'
  }
  
  // Permission issues
  if (normalized.includes('permission denied') || normalized.includes('access denied')) {
    return 'Permission denied. Check file and folder permissions.'
  }
  
  // Source file issues
  if (normalized.includes('source') && (normalized.includes('not found') || normalized.includes('missing'))) {
    return 'Source file not found. File may have been moved or deleted.'
  }
  if (normalized.includes('invalid') && normalized.includes('source')) {
    return 'Source file is invalid or corrupted.'
  }
  
  // Codec issues
  if (normalized.includes('codec') && (normalized.includes('unsupported') || normalized.includes('not supported'))) {
    return 'Unsupported codec. Try a different output format.'
  }
  
  // Generic execution failures - hide technical details
  if (normalized.includes('engine execution failed')) {
    // Strip the Python exception details
    return 'Encoding engine failed. See logs for details.'
  }
  
  // If the reason is short and readable, use it directly
  if (reason.length < 60 && !normalized.includes('traceback') && !normalized.includes('exception')) {
    return reason
  }
  
  // Fallback: truncate long technical messages
  return 'Encoding failed. Check system logs for details.'
}

interface ClipMetadata {
  resolution?: string
  codec?: string
  frameRate?: string
  duration?: string
  audioLayout?: string
  rawType?: string  // "R3D", "ARRIRAW", "SONY_RAW", "IMAGE_SEQUENCE"
}

interface ClipRowProps {
  id: string
  sourcePath: string
  status: string
  deliveryStage?: string  // Phase H: queued, starting, encoding, finalizing, completed, failed
  failureReason?: string | null
  warnings?: string[]
  metadata?: ClipMetadata
  presetName?: string
  outputPath?: string
  isSelected?: boolean
  onClick?: (e: React.MouseEvent) => void
  onReveal?: () => void
  onSettingsClick?: () => void
  // Thumbnail preview
  thumbnail?: string | null
  // Progress tracking (Phase H: honest progress reporting)
  progressPercent?: number  // 0-100, only when real data available
  etaSeconds?: number | null  // Only when calculable from real signal
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

// Removed: formatEta - no longer displaying fake ETA

export function ClipRow({
  id: _id,
  sourcePath,
  status,
  deliveryStage,
  failureReason,
  warnings = [],
  metadata = {},
  presetName,
  outputPath,
  isSelected = false,
  onClick,
  onReveal,
  onSettingsClick,
  thumbnail,
  progressPercent = 0,
  etaSeconds,
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
            {metadata.rawType && (
              <span 
                title="RAW Folder Type" 
                style={{ 
                  color: 'var(--accent-primary)',
                  fontWeight: 600,
                }}
              >
                {metadata.rawType}
              </span>
            )}
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
          
          {/* Phase H: Honest delivery progress indicator */}
          {isRunning && (
            <div style={{ marginTop: '0.5rem' }}>
              <JobProgressBar
                progress={{
                  status: 'running',
                  delivery_stage: deliveryStage as DeliveryStageType,
                  progress_percent: progressPercent,
                  eta_seconds: etaSeconds,
                }}
                compact={false}
              />
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

      {/* Failure reason - humanized for user display */}
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
          <span style={{ fontWeight: 600 }}>Error:</span>{' '}
          {humanizeFailureReason(failureReason)}
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
            fontFamily: 'var(--font-mono)',
          }}
        >
          <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 500 }}>Warnings:</span> {warnings.join(', ')}
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
