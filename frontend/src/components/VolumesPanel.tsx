/**
 * VolumesPanel — Source/Destination Volume Management (Alpha)
 * 
 * ⚠️ ALPHA LIMITATION:
 * Volume detection not yet wired to backend.
 * UI-only for Alpha — shows placeholder volumes.
 * 
 * Features:
 * - Source volume indicator
 * - Destination volume selector
 * - Free space display
 * - Volume status (online/offline)
 */

import { Button } from './Button'

// ============================================================================
// TYPES
// ============================================================================

export interface Volume {
  id: string
  name: string
  path: string
  type: 'local' | 'network' | 'cloud'
  freeSpace?: number       // bytes
  totalSpace?: number      // bytes
  isOnline: boolean
}

interface VolumesPanelProps {
  sourceVolume?: Volume
  destinationVolume?: Volume
  availableVolumes?: Volume[]
  onDestinationChange?: (volumeId: string) => void
  disabled?: boolean
}

// ============================================================================
// HELPERS
// ============================================================================

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function getVolumeIcon(type: Volume['type']): string {
  switch (type) {
    case 'network': return '🌐'
    case 'cloud': return '☁️'
    case 'local':
    default: return '💾'
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

export function VolumesPanel({
  sourceVolume,
  destinationVolume,
  availableVolumes = [],
  onDestinationChange,
  disabled = false,
}: VolumesPanelProps) {
  return (
    <div
      data-testid="volumes-panel"
      style={{
        padding: '0.5rem',
        background: 'var(--card-bg)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-sm)',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '0.5rem',
      }}>
        <span style={{
          fontSize: '0.75rem',
          fontWeight: 600,
          color: 'var(--text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.03em',
        }}>
          Volumes
        </span>
        <span style={{
          fontSize: '0.625rem',
          color: 'var(--text-dim)',
          fontStyle: 'italic',
        }}>
          Alpha
        </span>
      </div>
      
      {/* Alpha notice */}
      <div style={{
        padding: '0.375rem 0.5rem',
        marginBottom: '0.5rem',
        fontSize: '0.625rem',
        color: 'var(--text-dim)',
        background: 'rgba(251, 191, 36, 0.1)',
        border: '1px dashed rgba(251, 191, 36, 0.3)',
        borderRadius: 'var(--radius-sm)',
      }}>
        Volume detection coming in v1. Currently uses manual output path.
      </div>
      
      {/* Source Volume */}
      <div style={{ marginBottom: '0.5rem' }}>
        <label style={{
          display: 'block',
          fontSize: '0.625rem',
          color: 'var(--text-dim)',
          marginBottom: '0.25rem',
          textTransform: 'uppercase',
        }}>
          Source
        </label>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.375rem 0.5rem',
          backgroundColor: 'rgba(51, 65, 85, 0.2)',
          border: '1px solid var(--border-secondary)',
          borderRadius: 'var(--radius-sm)',
        }}>
          <span style={{ fontSize: '0.875rem' }}>
            {sourceVolume ? getVolumeIcon(sourceVolume.type) : '📁'}
          </span>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: '0.75rem',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
            }}>
              {sourceVolume?.name || 'No source selected'}
            </div>
            {sourceVolume?.path && (
              <div style={{
                fontSize: '0.625rem',
                color: 'var(--text-dim)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {sourceVolume.path}
              </div>
            )}
          </div>
          <div style={{
            fontSize: '0.5rem',
            padding: '0.125rem 0.25rem',
            borderRadius: '2px',
            backgroundColor: sourceVolume?.isOnline !== false 
              ? 'rgba(34, 197, 94, 0.2)' 
              : 'rgba(239, 68, 68, 0.2)',
            color: sourceVolume?.isOnline !== false 
              ? 'var(--status-complete-fg)' 
              : 'var(--status-failed-fg)',
          }}>
            {sourceVolume?.isOnline !== false ? 'ONLINE' : 'OFFLINE'}
          </div>
        </div>
      </div>
      
      {/* Destination Volume */}
      <div>
        <label style={{
          display: 'block',
          fontSize: '0.625rem',
          color: 'var(--text-dim)',
          marginBottom: '0.25rem',
          textTransform: 'uppercase',
        }}>
          Destination
        </label>
        {availableVolumes.length > 0 ? (
          <select
            value={destinationVolume?.id || ''}
            onChange={(e) => onDestinationChange?.(e.target.value)}
            disabled={disabled}
            style={{
              width: '100%',
              padding: '0.375rem 0.5rem',
              fontSize: '0.75rem',
              fontFamily: 'var(--font-mono)',
              backgroundColor: 'var(--input-bg)',
              border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}
          >
            {availableVolumes.map(vol => (
              <option key={vol.id} value={vol.id}>
                {getVolumeIcon(vol.type)} {vol.name}
                {vol.freeSpace !== undefined && ` (${formatBytes(vol.freeSpace)} free)`}
              </option>
            ))}
          </select>
        ) : (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.375rem 0.5rem',
            backgroundColor: 'rgba(51, 65, 85, 0.2)',
            border: '1px solid var(--border-secondary)',
            borderRadius: 'var(--radius-sm)',
          }}>
            <span style={{ fontSize: '0.875rem' }}>
              {destinationVolume ? getVolumeIcon(destinationVolume.type) : '📂'}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: '0.75rem',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
              }}>
                {destinationVolume?.name || 'Output path from settings'}
              </div>
              {destinationVolume?.freeSpace !== undefined && (
                <div style={{
                  fontSize: '0.625rem',
                  color: 'var(--text-dim)',
                }}>
                  {formatBytes(destinationVolume.freeSpace)} free
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {/* TODO: Browse for destination */}}
              disabled={disabled}
            >
              Browse...
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

export default VolumesPanel
