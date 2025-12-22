/**
 * PreviewPanel — Video Preview with Settings Overlay (Alpha)
 * 
 * ⚠️ ALPHA LIMITATION:
 * Real video preview not yet implemented.
 * Shows placeholder monitor with settings summary.
 * 
 * Features:
 * - Simulated 16:9 monitor display
 * - Codec/format settings badge overlay
 * - Title/action safe area guides
 * - Watermark position preview
 * - Future: actual frame thumbnail extraction via FFmpeg
 */

import type { DeliverSettings } from './DeliverControlPanel'

// ============================================================================
// TYPES
// ============================================================================

interface PreviewPanelProps {
  settings: DeliverSettings
  sourceName?: string
  sourceCodec?: string
  sourceResolution?: string
  sourceFps?: string
  disabled?: boolean
}

// ============================================================================
// COMPONENT
// ============================================================================

export function PreviewPanel({
  settings,
  sourceName,
  sourceCodec,
  sourceResolution,
  sourceFps,
  disabled = false,
}: PreviewPanelProps) {
  // Build settings summary
  const outputCodec = settings.video.codec || 'ProRes'
  const outputResolution = settings.video.width && settings.video.height 
    ? `${settings.video.width}×${settings.video.height}` 
    : 'Source'
  const outputContainer = settings.file.container || 'mov'
  const audioChannels = settings.audio.layout || 'stereo'
  
  // Count active overlays
  const textLayers = settings.overlay.text_layers.filter(l => l.enabled).length
  const hasImageWatermark = settings.overlay.image_watermark?.enabled
  
  return (
    <div
      data-testid="preview-panel"
      style={{
        padding: '0.5rem',
        background: 'var(--card-bg)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-md)',
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
          Preview
        </span>
        <span style={{
          fontSize: '0.625rem',
          color: 'var(--text-dim)',
          fontStyle: 'italic',
        }}>
          Alpha: Visual preview coming in v1
        </span>
      </div>
      
      {/* Monitor display */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          paddingBottom: '56.25%', // 16:9 aspect ratio
          backgroundColor: '#0c0c0c',
          border: '2px solid var(--border-secondary)',
          borderRadius: 'var(--radius-sm)',
          overflow: 'hidden',
        }}
      >
        {/* Safe area guides */}
        <div style={{
          position: 'absolute',
          inset: 0,
        }}>
          {/* Action safe (5% margin) */}
          <div style={{
            position: 'absolute',
            top: '5%',
            left: '5%',
            right: '5%',
            bottom: '5%',
            border: '1px dashed rgba(59, 130, 246, 0.3)',
            borderRadius: '2px',
          }} />
          {/* Title safe (10% margin) */}
          <div style={{
            position: 'absolute',
            top: '10%',
            left: '10%',
            right: '10%',
            bottom: '10%',
            border: '1px dashed rgba(251, 191, 36, 0.4)',
            borderRadius: '2px',
          }} />
          {/* Center crosshairs */}
          <div style={{
            position: 'absolute',
            left: '50%',
            top: '45%',
            height: '10%',
            width: '1px',
            backgroundColor: 'rgba(59, 130, 246, 0.3)',
          }} />
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '45%',
            width: '10%',
            height: '1px',
            backgroundColor: 'rgba(59, 130, 246, 0.3)',
          }} />
        </div>
        
        {/* Source info (top-left) */}
        <div style={{
          position: 'absolute',
          top: '8px',
          left: '8px',
          fontSize: '0.625rem',
          fontFamily: 'var(--font-mono)',
          color: 'rgba(255, 255, 255, 0.5)',
          textShadow: '0 1px 2px rgba(0,0,0,0.8)',
        }}>
          <div style={{ marginBottom: '2px' }}>SOURCE</div>
          <div style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
            {sourceName || 'No source'}
          </div>
          <div style={{ marginTop: '4px', fontSize: '0.5625rem' }}>
            {sourceCodec && <span>{sourceCodec} • </span>}
            {sourceResolution && <span>{sourceResolution} • </span>}
            {sourceFps && <span>{sourceFps}</span>}
          </div>
        </div>
        
        {/* Output info (top-right) */}
        <div style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          textAlign: 'right',
          fontSize: '0.625rem',
          fontFamily: 'var(--font-mono)',
          color: 'rgba(255, 255, 255, 0.5)',
          textShadow: '0 1px 2px rgba(0,0,0,0.8)',
        }}>
          <div style={{ marginBottom: '2px' }}>OUTPUT</div>
          <div style={{ color: 'rgba(59, 130, 246, 0.9)' }}>
            {outputCodec} → .{outputContainer}
          </div>
          <div style={{ marginTop: '4px', fontSize: '0.5625rem' }}>
            {outputResolution} • {audioChannels}
          </div>
        </div>
        
        {/* Center placeholder */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
        }}>
          <div style={{
            fontSize: '2rem',
            opacity: 0.15,
            marginBottom: '0.25rem',
          }}>
            🎬
          </div>
          <div style={{
            fontSize: '0.6875rem',
            color: 'rgba(255, 255, 255, 0.25)',
            fontFamily: 'var(--font-mono)',
          }}>
            PREVIEW
          </div>
        </div>
        
        {/* Overlay indicators (bottom-left) */}
        {(textLayers > 0 || hasImageWatermark) && (
          <div style={{
            position: 'absolute',
            bottom: '8px',
            left: '8px',
            display: 'flex',
            gap: '4px',
          }}>
            {textLayers > 0 && (
              <span style={{
                padding: '2px 6px',
                fontSize: '0.5rem',
                fontFamily: 'var(--font-mono)',
                backgroundColor: 'rgba(251, 191, 36, 0.2)',
                border: '1px solid rgba(251, 191, 36, 0.4)',
                borderRadius: '2px',
                color: 'rgba(251, 191, 36, 0.9)',
              }}>
                TEXT ×{textLayers}
              </span>
            )}
            {hasImageWatermark && (
              <span style={{
                padding: '2px 6px',
                fontSize: '0.5rem',
                fontFamily: 'var(--font-mono)',
                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                border: '1px solid rgba(59, 130, 246, 0.4)',
                borderRadius: '2px',
                color: 'rgba(59, 130, 246, 0.9)',
              }}>
                IMAGE
              </span>
            )}
          </div>
        )}
        
        {/* Frame position indicator (bottom-right) */}
        <div style={{
          position: 'absolute',
          bottom: '8px',
          right: '8px',
          fontSize: '0.5rem',
          fontFamily: 'var(--font-mono)',
          color: 'rgba(255, 255, 255, 0.3)',
          textShadow: '0 1px 2px rgba(0,0,0,0.8)',
        }}>
          00:00:00:00
        </div>
        
        {/* Image watermark preview (if present) */}
        {hasImageWatermark && settings.overlay.image_watermark?.image_data && (
          <div
            style={{
              position: 'absolute',
              left: `${settings.overlay.image_watermark.x * 100}%`,
              top: `${settings.overlay.image_watermark.y * 100}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <img
              src={settings.overlay.image_watermark.image_data}
              alt=""
              style={{
                maxWidth: '40px',
                maxHeight: '25px',
                opacity: settings.overlay.image_watermark.opacity * 0.8,
                filter: (settings.overlay.image_watermark as { grayscale?: boolean }).grayscale 
                  ? 'grayscale(100%)' 
                  : 'none',
                pointerEvents: 'none',
              }}
            />
          </div>
        )}
      </div>
      
      {/* Quick settings bar */}
      <div style={{
        marginTop: '0.5rem',
        display: 'flex',
        gap: '0.5rem',
        flexWrap: 'wrap',
      }}>
        <SettingsBadge label="Video" value={outputCodec} />
        <SettingsBadge label="Audio" value={settings.audio.codec || 'PCM'} />
        <SettingsBadge label="Container" value={`.${outputContainer}`} />
        {settings.video.rate_control_mode === 'crf' && settings.video.quality && (
          <SettingsBadge label="CRF" value={String(settings.video.quality)} />
        )}
        {settings.video.rate_control_mode === 'bitrate' && settings.video.bitrate && (
          <SettingsBadge label="Bitrate" value={settings.video.bitrate} />
        )}
      </div>
    </div>
  )
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function SettingsBadge({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.25rem',
      padding: '0.125rem 0.375rem',
      fontSize: '0.625rem',
      fontFamily: 'var(--font-mono)',
      backgroundColor: 'rgba(51, 65, 85, 0.3)',
      border: '1px solid var(--border-secondary)',
      borderRadius: 'var(--radius-sm)',
    }}>
      <span style={{ color: 'var(--text-dim)' }}>{label}:</span>
      <span style={{ color: 'var(--text-muted)' }}>{value}</span>
    </div>
  )
}

export default PreviewPanel
