/**
 * PresetSummary — Phase 7A: Read-Only Preset Summary Component
 * 
 * Displays a grouped, human-readable summary of preset settings.
 * Replaces raw JSON view with categorized, scannable information.
 * 
 * ⚠️ ALPHA RULES (NON-NEGOTIABLE):
 * - Read-only only — no editing, no actions
 * - This is a SUMMARY, not exhaustive — clearly signaled to user
 * - Overlay summaries include scope (Project vs Clip)
 * - No behavior changes, no new semantics
 */

import type { DeliverSettings, OverlayLayer } from './DeliverControlPanel'

// ============================================================================
// TYPES
// ============================================================================

interface PresetSummaryProps {
  /** The settings snapshot to summarize */
  settings: DeliverSettings
  /** Whether to show in compact mode (fewer details) */
  compact?: boolean
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get video settings summary
 */
function getVideoSummary(video: DeliverSettings['video']): string {
  const parts: string[] = []
  
  // Codec
  if (video.codec) {
    parts.push(video.codec.toUpperCase())
  }
  
  // Resolution
  if (video.resolution_preset && video.resolution_preset !== 'source') {
    parts.push(video.resolution_preset)
  } else if (video.resolution_policy === 'source') {
    parts.push('Source resolution')
  } else if (video.width && video.height) {
    parts.push(`${video.width}×${video.height}`)
  }
  
  // Frame rate
  if (video.frame_rate && video.frame_rate_policy !== 'source') {
    parts.push(`${video.frame_rate} fps`)
  } else if (video.frame_rate_policy === 'source') {
    parts.push('Source fps')
  }
  
  return parts.join(' · ') || 'Default video settings'
}

/**
 * Get audio settings summary
 */
function getAudioSummary(audio: DeliverSettings['audio']): string {
  const parts: string[] = []
  
  // Codec
  if (audio.codec) {
    parts.push(audio.codec.toUpperCase())
  }
  
  // Channels/Layout
  if (audio.layout && audio.layout !== 'source') {
    parts.push(audio.layout)
  } else if (audio.channels) {
    parts.push(`${audio.channels}ch`)
  }
  
  // Sample rate
  if (audio.sample_rate) {
    parts.push(`${audio.sample_rate / 1000}kHz`)
  }
  
  // Passthrough
  if (audio.passthrough) {
    return 'Passthrough (copy audio)'
  }
  
  return parts.join(' · ') || 'Default audio settings'
}

/**
 * Get overlay summary with scope (REQUIRED per Alpha rules)
 * Shows type + scope for each enabled overlay
 */
function getOverlaySummary(layers: OverlayLayer[] | undefined): { count: number; details: string[] } {
  if (!layers || layers.length === 0) {
    return { count: 0, details: [] }
  }
  
  const enabledLayers = layers.filter(l => l.enabled)
  if (enabledLayers.length === 0) {
    return { count: 0, details: ['All overlays disabled'] }
  }
  
  // Group by type and scope — MUST show scope per Alpha Phase 7A rules
  const details = enabledLayers.map(layer => {
    const typeLabel = layer.type.charAt(0).toUpperCase() + layer.type.slice(1)
    const scopeLabel = layer.scope === 'project' ? 'Project' : 'Clip-level'
    return `${typeLabel} (${scopeLabel})`
  })
  
  return { count: enabledLayers.length, details }
}

/**
 * Get naming template summary with example
 */
function getNamingSummary(file: DeliverSettings['file']): { template: string; example: string } {
  const template = file.naming_template || '{source}'
  
  // Render example by replacing tokens
  let example = template
    .replace('{source}', 'MyClip')
    .replace('{date}', '2025-12-23')
    .replace('{time}', '14-30-00')
    .replace('{codec}', 'h264')
    .replace('{resolution}', '1080p')
    .replace('{fps}', '24')
  
  // Add prefix/suffix if present
  if (file.prefix) {
    example = file.prefix + example
  }
  if (file.suffix) {
    example = example + file.suffix
  }
  
  // Add container
  example = example + '.' + (file.container || 'mp4')
  
  return { template, example }
}

/**
 * Get container/format summary
 */
function getContainerSummary(file: DeliverSettings['file']): string {
  return (file.container || 'mp4').toUpperCase()
}

// ============================================================================
// STYLES
// ============================================================================

const styles = {
  container: {
    padding: '0.5rem',
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    borderRadius: 'var(--radius-sm, 4px)',
    border: '1px solid var(--border-secondary, #333)',
    fontSize: '0.6875rem',
    fontFamily: 'var(--font-sans)',
    color: 'var(--text-secondary)',
  } as React.CSSProperties,
  
  section: {
    marginBottom: '0.5rem',
  } as React.CSSProperties,
  
  sectionLast: {
    marginBottom: 0,
  } as React.CSSProperties,
  
  label: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    color: 'var(--text-dim)',
    fontSize: '0.625rem',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.03em',
    marginBottom: '0.125rem',
  } as React.CSSProperties,
  
  value: {
    color: 'var(--text-primary)',
    fontSize: '0.6875rem',
  } as React.CSSProperties,
  
  mono: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.625rem',
    color: 'var(--text-muted)',
  } as React.CSSProperties,
  
  overlayList: {
    marginTop: '0.125rem',
    paddingLeft: '0.75rem',
    listStyle: 'none',
    margin: 0,
    padding: 0,
  } as React.CSSProperties,
  
  overlayItem: {
    fontSize: '0.625rem',
    color: 'var(--text-muted)',
    padding: '0.0625rem 0',
  } as React.CSSProperties,
  
  disclaimer: {
    marginTop: '0.625rem',
    paddingTop: '0.5rem',
    borderTop: '1px solid var(--border-secondary, #333)',
    fontSize: '0.5625rem',
    color: 'var(--text-dim)',
    fontStyle: 'italic',
    lineHeight: 1.4,
  } as React.CSSProperties,
} as const

// ============================================================================
// COMPONENT
// ============================================================================

export function PresetSummary({ settings, compact = false }: PresetSummaryProps) {
  const videoSummary = getVideoSummary(settings.video)
  const audioSummary = getAudioSummary(settings.audio)
  const overlaySummary = getOverlaySummary(settings.overlay?.layers)
  const namingSummary = getNamingSummary(settings.file)
  const containerSummary = getContainerSummary(settings.file)
  
  return (
    <div style={styles.container}>
      {/* Video */}
      <div style={styles.section}>
        <div style={styles.label}>
          <span>📹</span>
          <span>Video</span>
        </div>
        <div style={styles.value}>{videoSummary}</div>
      </div>
      
      {/* Audio */}
      <div style={styles.section}>
        <div style={styles.label}>
          <span>🔊</span>
          <span>Audio</span>
        </div>
        <div style={styles.value}>{audioSummary}</div>
      </div>
      
      {/* Overlays */}
      <div style={styles.section}>
        <div style={styles.label}>
          <span>🎨</span>
          <span>Overlays</span>
        </div>
        {overlaySummary.count === 0 ? (
          <div style={styles.value}>None configured</div>
        ) : (
          <>
            <div style={styles.value}>{overlaySummary.count} enabled</div>
            {!compact && (
              <ul style={styles.overlayList}>
                {overlaySummary.details.map((detail, i) => (
                  <li key={i} style={styles.overlayItem}>• {detail}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      
      {/* Naming Template */}
      {!compact && (
        <div style={styles.section}>
          <div style={styles.label}>
            <span>📝</span>
            <span>Naming</span>
          </div>
          <div style={styles.mono}>{namingSummary.template}</div>
          <div style={{ ...styles.value, fontSize: '0.5625rem', color: 'var(--text-muted)', marginTop: '0.125rem' }}>
            Example: {namingSummary.example}
          </div>
        </div>
      )}
      
      {/* Output Container */}
      <div style={styles.sectionLast}>
        <div style={styles.label}>
          <span>📦</span>
          <span>Container</span>
        </div>
        <div style={styles.value}>{containerSummary}</div>
      </div>
      
      {/* REQUIRED: Summary disclaimer per Alpha Phase 7A rules */}
      <div style={styles.disclaimer}>
        This is a summary of key settings. Use &apos;View raw snapshot&apos; for the full preset.
      </div>
    </div>
  )
}

/**
 * Generate a one-line preset description for dropdown secondary text.
 * Format: "ProRes Proxy · 2 overlays · TC burn-in"
 */
export function getPresetDescriptionLine(settings: DeliverSettings): string {
  const parts: string[] = []
  
  // Codec
  if (settings.video?.codec) {
    const codecLabel = settings.video.codec.toUpperCase()
    // Add resolution hint if not source
    if (settings.video.resolution_preset && settings.video.resolution_preset !== 'source') {
      parts.push(`${codecLabel} ${settings.video.resolution_preset}`)
    } else {
      parts.push(codecLabel)
    }
  }
  
  // Overlay count
  const enabledOverlays = settings.overlay?.layers?.filter(l => l.enabled) || []
  if (enabledOverlays.length > 0) {
    parts.push(`${enabledOverlays.length} overlay${enabledOverlays.length > 1 ? 's' : ''}`)
    
    // Mention timecode if present
    const hasTimecode = enabledOverlays.some(l => l.type === 'timecode')
    if (hasTimecode) {
      parts.push('TC burn-in')
    }
  }
  
  return parts.join(' · ') || 'Default settings'
}

export default PresetSummary
