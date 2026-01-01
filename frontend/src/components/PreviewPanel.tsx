/**
 * PreviewPanel — Settings Summary (No Preview)
 * 
 * RATIONALE:
 * Forge is a deterministic proxy engine, not a media browser.
 * The UI must reflect certainty, not speculation.
 * 
 * DESIGN (Strict):
 * - Shows output settings summary ONLY
 * - NO video frame previews (removed per Phase 2)
 * - NO thumbnails
 * - NO speculative metadata display
 * 
 * Thumbnails and visual previews were REMOVED because:
 * - They require file enumeration before preflight
 * - They create speculative UI states
 * - They imply capabilities the engine doesn't have
 */

import type { DeliverSettings } from './DeliverControlPanel'

// ============================================================================
// TYPES
// ============================================================================

interface PreviewPanelProps {
  settings: DeliverSettings
  disabled?: boolean
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * PreviewPanel — Settings summary only. No visual preview.
 * 
 * REMOVED: Video frame preview, thumbnails, source info display.
 * Forge does not support visual preview before job execution.
 */
export function PreviewPanel({
  settings,
  disabled = false,
}: PreviewPanelProps) {
  // Build settings summary
  const outputCodec = settings.video.codec || 'ProRes'
  const outputResolution = settings.video.width && settings.video.height 
    ? `${settings.video.width}×${settings.video.height}` 
    : 'Source'
  const outputContainer = settings.file.container || 'mov'
  const audioCodec = settings.audio.codec || 'PCM'
  const audioChannels = settings.audio.layout || 'stereo'
  
  // Count active overlays
  const textLayers = settings.overlay.text_layers.filter(l => l.enabled).length
  const hasImageWatermark = settings.overlay.image_watermark?.enabled
  
  return (
    <div
      data-testid="preview-panel"
      style={{
        padding: '1rem',
        background: 'var(--card-bg)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-md)',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {/* Header */}
      <div style={{
        marginBottom: '0.75rem',
        paddingBottom: '0.5rem',
        borderBottom: '1px solid var(--border-secondary)',
      }}>
        <span style={{
          fontSize: '0.75rem',
          fontWeight: 600,
          color: 'var(--text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.03em',
        }}>
          Output Settings
        </span>
      </div>
      
      {/* Settings grid — No preview, just facts */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr',
        gap: '0.5rem 1rem',
        fontSize: '0.75rem',
      }}>
        <span style={{ color: 'var(--text-dim)' }}>Codec</span>
        <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
          {outputCodec}
        </span>
        
        <span style={{ color: 'var(--text-dim)' }}>Container</span>
        <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
          .{outputContainer}
        </span>
        
        <span style={{ color: 'var(--text-dim)' }}>Resolution</span>
        <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
          {outputResolution}
        </span>
        
        <span style={{ color: 'var(--text-dim)' }}>Audio</span>
        <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
          {audioCodec} ({audioChannels})
        </span>
        
        {settings.video.rate_control_mode === 'crf' && settings.video.quality && (
          <>
            <span style={{ color: 'var(--text-dim)' }}>Quality</span>
            <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
              CRF {settings.video.quality}
            </span>
          </>
        )}
        
        {settings.video.rate_control_mode === 'bitrate' && settings.video.bitrate && (
          <>
            <span style={{ color: 'var(--text-dim)' }}>Bitrate</span>
            <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
              {settings.video.bitrate}
            </span>
          </>
        )}
      </div>
      
      {/* Overlay summary (if any) */}
      {(textLayers > 0 || hasImageWatermark) && (
        <div style={{
          marginTop: '0.75rem',
          paddingTop: '0.5rem',
          borderTop: '1px solid var(--border-secondary)',
          display: 'flex',
          gap: '0.5rem',
        }}>
          {textLayers > 0 && (
            <span style={{
              padding: '2px 8px',
              fontSize: '0.625rem',
              fontFamily: 'var(--font-mono)',
              backgroundColor: 'rgba(251, 191, 36, 0.15)',
              border: '1px solid rgba(251, 191, 36, 0.3)',
              borderRadius: '2px',
              color: 'rgba(251, 191, 36, 0.9)',
            }}>
              {textLayers} text overlay{textLayers !== 1 ? 's' : ''}
            </span>
          )}
          {hasImageWatermark && (
            <span style={{
              padding: '2px 8px',
              fontSize: '0.625rem',
              fontFamily: 'var(--font-mono)',
              backgroundColor: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: '2px',
              color: 'rgba(59, 130, 246, 0.9)',
            }}>
              image watermark
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export default PreviewPanel
