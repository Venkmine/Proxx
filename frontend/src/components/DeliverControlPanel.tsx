import React, { useState, useEffect, useMemo } from 'react'
import { Button } from './Button'
import { Select } from './Select'

/**
 * DeliverControlPanel — Persistent Control Surface (Phase 17 + Phase 20)
 * 
 * Phase 20: Codec-driven UI authority.
 * - All codec options fetched from backend CodecSpec registry
 * - UI dynamically reconfigures based on codec capabilities
 * - CRF and Bitrate are mutually exclusive
 * - Container ↔ codec enforcement
 * - Invalid UI states are architecturally impossible
 * 
 * Content is driven by selection context:
 * - Pre-job files: Editable DeliverSettings
 * - Job (PENDING): Editable DeliverSettings
 * - Job (RUNNING): Read-only DeliverSettings
 * - Multiple jobs: Batch-edit common fields
 * - Clip: Clip metadata (read-only)
 */

// ============================================================================
// TYPES (Exported for use in App.tsx)
// ============================================================================

export interface VideoSettings {
  codec: string
  resolution_policy: string
  width?: number
  height?: number
  frame_rate_policy: string
  frame_rate?: string
  pixel_aspect_ratio?: string
  color_space?: string
  quality?: number  // CRF value
  bitrate?: string
  rate_control_mode?: 'crf' | 'bitrate'  // Phase 20: Explicit mode selection
  bitrate_preset?: 'low' | 'medium' | 'high' | 'broadcast'  // Phase 20: Preset selection
  preset?: string
}

export interface AudioSettings {
  codec: string
  bitrate?: string
  channels?: number
  layout: string
  sample_rate?: number
  passthrough: boolean
}

export interface FileSettings {
  container: string
  naming_template: string
  prefix?: string
  suffix?: string
  overwrite_policy: string
  preserve_source_dirs: boolean
  preserve_dir_levels: number
}

export interface MetadataSettings {
  strip_all_metadata: boolean
  passthrough_all_container_metadata: boolean
  passthrough_timecode: boolean
  passthrough_reel_name: boolean
  passthrough_camera_metadata: boolean
  passthrough_color_metadata: boolean
}

export interface TextOverlay {
  text: string
  position: string
  font_size: number
  opacity: number
  enabled: boolean
  // Phase 20: Normalized coordinates (0-1) for graphical positioning
  x?: number
  y?: number
}

export interface OverlaySettings {
  text_layers: TextOverlay[]
}

// Phase 20: Colour settings
export interface ColourSettings {
  mode: 'passthrough' | 'apply_lut' | 'simple_transform'
  lut_file?: string  // filename from LUT library
  // Simple transform controls
  gamma?: number      // 0.5 - 2.0, default 1.0
  contrast?: number   // 0.5 - 2.0, default 1.0
}

export interface DeliverSettings {
  video: VideoSettings
  audio: AudioSettings
  file: FileSettings
  metadata: MetadataSettings
  overlay: OverlaySettings
  colour?: ColourSettings  // Phase 20
  output_dir?: string
}

export type SelectionContext = 
  | { type: 'none' }
  | { type: 'pre-job'; files: string[] }
  | { type: 'job-pending'; jobId: string }
  | { type: 'job-running'; jobId: string }
  | { type: 'job-completed'; jobId: string }
  | { type: 'multiple-jobs'; jobIds: string[] }
  | { type: 'clip'; jobId: string; clipId: string }

// Phase 20: CodecSpec from backend
interface BitratePresets {
  low: string
  medium: string
  high: string
  broadcast: string
}

interface CodecSpec {
  name: string
  codec_id: string
  category: string
  supports_crf: boolean
  supports_bitrate: boolean
  supports_constant_qp: boolean
  default_rate_control: 'crf' | 'bitrate' | null
  crf_min: number
  crf_max: number
  crf_default: number
  bitrate_presets: BitratePresets | null
  supported_containers: string[]
  default_container: string
  supported_pixel_formats: string[]
  default_pixel_format: string
  supported_color_spaces: string[]
  supports_lut: boolean
  supports_hdr_metadata: boolean
  is_lossless: boolean
  is_intraframe: boolean
  notes: string
}

interface DeliverControlPanelProps {
  context: SelectionContext
  settings: DeliverSettings
  onSettingsChange: (settings: Partial<DeliverSettings>) => void
  onApply?: () => void
  isReadOnly?: boolean
  backendUrl?: string
  appliedPresetName?: string | null  // Phase 17: Show "Preset Applied" indicator
}

// ============================================================================
// STATIC OPTIONS (non-codec-dependent)
// ============================================================================

const AUDIO_CODECS = [
  { value: 'copy', label: 'Copy (Passthrough)' },
  { value: 'aac', label: 'AAC' },
  { value: 'pcm_s16le', label: 'PCM 16-bit' },
  { value: 'pcm_s24le', label: 'PCM 24-bit' },
]

// Audio bitrate presets (for lossy codecs only)
const AUDIO_BITRATE_PRESETS = [
  { value: '128k', label: '128 kbps (Low)' },
  { value: '192k', label: '192 kbps (Medium)' },
  { value: '256k', label: '256 kbps (High)' },
  { value: '320k', label: '320 kbps (Broadcast)' },
]

const RESOLUTION_POLICIES = [
  { value: 'source', label: 'Source Resolution' },
  { value: 'custom', label: 'Custom Dimensions' },
]

// Phase 20: Resolution presets for common formats
const RESOLUTION_PRESETS = [
  { value: '', label: 'Select preset...', width: 0, height: 0 },
  { value: 'pal', label: 'PAL (720×576)', width: 720, height: 576 },
  { value: 'ntsc', label: 'NTSC (720×486)', width: 720, height: 486 },
  { value: '720p', label: '720p HD (1280×720)', width: 1280, height: 720 },
  { value: '1080p', label: '1080p Full HD (1920×1080)', width: 1920, height: 1080 },
  { value: '2k_dci', label: '2K DCI (2048×1080)', width: 2048, height: 1080 },
  { value: 'uhd', label: 'UHD 4K (3840×2160)', width: 3840, height: 2160 },
  { value: '4k_dci', label: '4K DCI (4096×2160)', width: 4096, height: 2160 },
  { value: '8k', label: '8K UHD (7680×4320)', width: 7680, height: 4320 },
]

const OVERWRITE_POLICIES = [
  { value: 'never', label: 'Never (Fail if exists)' },
  { value: 'always', label: 'Always Overwrite' },
  { value: 'increment', label: 'Auto-Increment Suffix' },
]

// Phase 20: Watermark positions (renamed from TEXT_POSITIONS)
const WATERMARK_POSITIONS = [
  { value: 'top_left', label: 'Top Left' },
  { value: 'top_center', label: 'Top Center' },
  { value: 'top_right', label: 'Top Right' },
  { value: 'bottom_left', label: 'Bottom Left' },
  { value: 'bottom_center', label: 'Bottom Center' },
  { value: 'bottom_right', label: 'Bottom Right' },
  { value: 'center', label: 'Center' },
]

// Phase 20: Colour modes
const COLOUR_MODES = [
  { value: 'passthrough', label: 'Passthrough (No Change)' },
  { value: 'apply_lut', label: 'Apply LUT' },
  { value: 'simple_transform', label: 'Simple Transform' },
]

// ============================================================================
// SECTION COMPONENTS
// ============================================================================

interface SectionProps {
  title: string
  isOpen: boolean
  onToggle: () => void
  children: React.ReactNode
  badge?: string
}

function Section({ title, isOpen, onToggle, children, badge }: SectionProps) {
  return (
    <div style={{ marginBottom: '0.5rem' }}>
      <button
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          padding: '0.5rem 0.75rem',
          background: 'rgba(51, 65, 85, 0.2)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-sm)',
          cursor: 'pointer',
          color: 'var(--text-primary)',
          fontSize: '0.8125rem',
          fontWeight: 600,
          fontFamily: 'var(--font-sans)',
          textAlign: 'left',
        }}
      >
        <span style={{ 
          marginRight: '0.5rem', 
          fontSize: '0.625rem',
          transition: 'transform 0.15s',
          transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
        }}>
          ▶
        </span>
        {title}
        {badge && (
          <span style={{
            marginLeft: 'auto',
            padding: '0.125rem 0.375rem',
            fontSize: '0.625rem',
            fontWeight: 600,
            color: 'var(--text-muted)',
            background: 'rgba(51, 65, 85, 0.5)',
            borderRadius: 'var(--radius-sm)',
          }}>
            {badge}
          </span>
        )}
      </button>
      
      {isOpen && (
        <div style={{
          padding: '0.75rem',
          borderLeft: '1px solid var(--border-primary)',
          borderRight: '1px solid var(--border-primary)',
          borderBottom: '1px solid var(--border-primary)',
          borderRadius: '0 0 var(--radius-sm) var(--radius-sm)',
          marginTop: '-1px',
          background: 'rgba(20, 24, 32, 0.5)',
        }}>
          {children}
        </div>
      )}
    </div>
  )
}

interface FieldRowProps {
  label: string
  children: React.ReactNode
  description?: string
  warning?: boolean
}

function FieldRow({ label, children, description, warning }: FieldRowProps) {
  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <label style={{
        display: 'block',
        fontSize: '0.6875rem',
        fontWeight: 500,
        color: warning ? 'var(--status-failed-fg)' : 'var(--text-secondary)',
        marginBottom: '0.25rem',
        fontFamily: 'var(--font-sans)',
        textTransform: 'uppercase',
        letterSpacing: '0.03em',
      }}>
        {label}
        {warning && ' ⚠️'}
      </label>
      {children}
      {description && (
        <div style={{
          marginTop: '0.25rem',
          fontSize: '0.6875rem',
          color: 'var(--text-dim)',
          fontFamily: 'var(--font-sans)',
        }}>
          {description}
        </div>
      )}
    </div>
  )
}

interface CheckboxFieldProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  warning?: boolean
}

function CheckboxField({ label, checked, onChange, disabled, warning }: CheckboxFieldProps) {
  return (
    <label style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      marginBottom: '0.5rem',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
    }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        style={{ accentColor: 'var(--button-primary-bg)' }}
      />
      <span style={{
        fontSize: '0.75rem',
        color: warning ? 'var(--status-failed-fg)' : 'var(--text-secondary)',
        fontFamily: 'var(--font-sans)',
      }}>
        {label}
        {warning && ' ⚠️'}
      </span>
    </label>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function DeliverControlPanel({
  context,
  settings,
  onSettingsChange,
  onApply,
  isReadOnly = false,
  backendUrl = 'http://127.0.0.1:8085',
  appliedPresetName,
}: DeliverControlPanelProps) {
  // Section visibility state
  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(['video', 'file'])
  )
  
  // Phase 20: Codec specs from backend (single source of truth)
  const [codecSpecs, setCodecSpecs] = useState<Record<string, CodecSpec>>({})
  const [codecsLoading, setCodecsLoading] = useState(true)
  const [codecsError, setCodecsError] = useState<string | null>(null)
  
  // Fetch codec specs on mount
  useEffect(() => {
    const fetchCodecSpecs = async () => {
      try {
        setCodecsLoading(true)
        const response = await fetch(`${backendUrl}/control/codecs`)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = await response.json()
        setCodecSpecs(data.codecs || {})
        setCodecsError(null)
      } catch (err) {
        console.error('Failed to fetch codec specs:', err)
        setCodecsError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setCodecsLoading(false)
      }
    }
    fetchCodecSpecs()
  }, [backendUrl])
  
  // Get current codec spec
  const currentCodecSpec = useMemo(() => {
    return codecSpecs[settings.video.codec] || null
  }, [codecSpecs, settings.video.codec])
  
  // Generate video codec options from specs (grouped by category)
  const videoCodecOptions = useMemo(() => {
    const categories: Record<string, { value: string; label: string }[]> = {
      prores: [],
      dnx: [],
      delivery: [],
    }
    
    Object.entries(codecSpecs).forEach(([codecId, spec]) => {
      const option = { value: codecId, label: spec.name }
      if (spec.category in categories) {
        categories[spec.category].push(option)
      } else {
        categories.delivery.push(option)
      }
    })
    
    // Flatten with group headers
    const result: { value: string; label: string; disabled?: boolean }[] = []
    if (categories.prores.length > 0) {
      result.push({ value: '', label: '── ProRes ──', disabled: true })
      result.push(...categories.prores)
    }
    if (categories.dnx.length > 0) {
      result.push({ value: '', label: '── DNx ──', disabled: true })
      result.push(...categories.dnx)
    }
    if (categories.delivery.length > 0) {
      result.push({ value: '', label: '── Delivery ──', disabled: true })
      result.push(...categories.delivery)
    }
    
    return result.length > 0 ? result : [
      { value: 'h264', label: 'H.264 / AVC' },
      { value: 'prores_422', label: 'ProRes 422' },
    ]
  }, [codecSpecs])
  
  // Generate container options filtered by current codec
  const containerOptions = useMemo(() => {
    if (!currentCodecSpec) {
      return [
        { value: 'mov', label: 'QuickTime (.mov)' },
        { value: 'mp4', label: 'MP4 (.mp4)' },
      ]
    }
    
    const containerLabels: Record<string, string> = {
      mov: 'QuickTime (.mov)',
      mxf: 'MXF (.mxf)',
      mp4: 'MP4 (.mp4)',
      mkv: 'Matroska (.mkv)',
      webm: 'WebM (.webm)',
    }
    
    return currentCodecSpec.supported_containers.map(c => ({
      value: c,
      label: containerLabels[c] || c.toUpperCase(),
    }))
  }, [currentCodecSpec])
  
  const toggleSection = (section: string) => {
    setOpenSections(prev => {
      const next = new Set(prev)
      if (next.has(section)) {
        next.delete(section)
      } else {
        next.add(section)
      }
      return next
    })
  }
  
  // Derive panel title and subtext from context
  const getPanelInfo = (): { title: string; subtext: string } => {
    switch (context.type) {
      case 'none':
        return { 
          title: 'Default Proxy Settings', 
          subtext: 'Using defaults — select files or a job to configure' 
        }
      case 'pre-job':
        return { 
          title: 'Default Proxy Settings', 
          subtext: `Configuring for ${context.files.length} file(s)` 
        }
      case 'job-pending':
        return { 
          title: 'Job Deliver Settings', 
          subtext: appliedPresetName ? `Preset: ${appliedPresetName}` : 'Overrides applied for this job' 
        }
      case 'job-running':
        return { 
          title: 'Job Deliver Settings', 
          subtext: 'Settings locked — job in progress' 
        }
      case 'job-completed':
        return { 
          title: 'Job Deliver Settings', 
          subtext: 'Settings locked — job completed' 
        }
      case 'multiple-jobs':
        return { 
          title: `Batch Settings (${context.jobIds.length} jobs)`, 
          subtext: 'Common settings across selected jobs' 
        }
      case 'clip':
        return { 
          title: 'Clip Metadata', 
          subtext: 'Read-only clip information' 
        }
    }
  }
  
  const panelInfo = getPanelInfo()
  
  // Compute metadata summary status line
  const getMetadataStatusLine = (): { text: string; isDestructive: boolean } => {
    if (settings.metadata.strip_all_metadata) {
      return { text: 'Metadata: Stripped', isDestructive: true }
    }
    const passthroughFlags = [
      settings.metadata.passthrough_timecode,
      settings.metadata.passthrough_reel_name,
      settings.metadata.passthrough_camera_metadata,
      settings.metadata.passthrough_color_metadata,
    ]
    const activeCount = passthroughFlags.filter(Boolean).length
    if (activeCount === passthroughFlags.length) {
      return { text: 'Metadata: Passthrough (Camera → Output)', isDestructive: false }
    } else if (activeCount === 0) {
      return { text: 'Metadata: None Preserved', isDestructive: true }
    } else {
      return { text: `Metadata: Partial (${activeCount}/${passthroughFlags.length})`, isDestructive: false }
    }
  }
  
  const metadataStatus = getMetadataStatusLine()
  
  // Helper to update nested settings
  const updateVideoSettings = (updates: Partial<VideoSettings>) => {
    const newVideoSettings = { ...settings.video, ...updates }
    
    // Phase 20: When codec changes, enforce container compatibility
    if (updates.codec && updates.codec !== settings.video.codec) {
      const newCodecSpec = codecSpecs[updates.codec]
      if (newCodecSpec) {
        // If current container is not valid for new codec, switch to default
        if (!newCodecSpec.supported_containers.includes(settings.file.container)) {
          onSettingsChange({
            video: newVideoSettings,
            file: { ...settings.file, container: newCodecSpec.default_container }
          })
          return
        }
        
        // Set default rate control mode for the new codec
        if (newCodecSpec.supports_crf || newCodecSpec.supports_bitrate) {
          newVideoSettings.rate_control_mode = newCodecSpec.default_rate_control as 'crf' | 'bitrate' || 'crf'
          if (newCodecSpec.supports_crf) {
            newVideoSettings.quality = newCodecSpec.crf_default
          }
          if (newCodecSpec.supports_bitrate && !newCodecSpec.supports_crf) {
            newVideoSettings.bitrate_preset = 'medium'
          }
        } else {
          // Codec doesn't support rate control (e.g., ProRes)
          newVideoSettings.rate_control_mode = undefined
          newVideoSettings.quality = undefined
          newVideoSettings.bitrate = undefined
          newVideoSettings.bitrate_preset = undefined
        }
      }
    }
    
    // Phase 20: CRF and Bitrate are mutually exclusive
    if (updates.rate_control_mode === 'crf') {
      newVideoSettings.bitrate = undefined
      newVideoSettings.bitrate_preset = undefined
    } else if (updates.rate_control_mode === 'bitrate') {
      newVideoSettings.quality = undefined
    }
    
    // When bitrate preset changes, update the actual bitrate value
    if (updates.bitrate_preset && currentCodecSpec?.bitrate_presets) {
      const presets = currentCodecSpec.bitrate_presets
      newVideoSettings.bitrate = presets[updates.bitrate_preset as keyof typeof presets]
    }
    
    onSettingsChange({ video: newVideoSettings })
  }
  
  const updateAudioSettings = (updates: Partial<AudioSettings>) => {
    onSettingsChange({
      audio: { ...settings.audio, ...updates }
    })
  }
  
  const updateFileSettings = (updates: Partial<FileSettings>) => {
    const newFileSettings = { ...settings.file, ...updates }
    
    // Phase 20: When container changes, validate codec compatibility
    if (updates.container && updates.container !== settings.file.container) {
      const codecSpec = codecSpecs[settings.video.codec]
      if (codecSpec && !codecSpec.supported_containers.includes(updates.container)) {
        // Container not valid for current codec - don't allow change
        // (UI should prevent this, but this is defensive)
        console.warn(`Container ${updates.container} not valid for codec ${settings.video.codec}`)
        return
      }
    }
    
    onSettingsChange({ file: newFileSettings })
  }
  
  const updateMetadataSettings = (updates: Partial<MetadataSettings>) => {
    onSettingsChange({
      metadata: { ...settings.metadata, ...updates }
    })
  }
  
  const updateOverlaySettings = (updates: Partial<OverlaySettings>) => {
    onSettingsChange({
      overlay: { ...settings.overlay, ...updates }
    })
  }
  
  // Phase 20: Colour settings update
  const updateColourSettings = (updates: Partial<ColourSettings>) => {
    onSettingsChange({
      colour: { ...(settings.colour || { mode: 'passthrough' }), ...updates }
    })
  }
  
  // Determine if metadata passthrough is at risk
  const metadataWarning = settings.metadata.strip_all_metadata
  
  // Count active text overlays
  const activeOverlays = settings.overlay.text_layers.filter(l => l.enabled).length

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      width: '340px',
      minWidth: '340px',
      backgroundColor: 'var(--card-bg-solid, rgba(16, 18, 20, 0.95))',
      /* Removed prominent blue divider to the left of the panel (UX request) */
      boxShadow: '-4px 0 16px rgba(0, 0, 0, 0.25)',
      overflow: 'hidden',
    }}>
      {/* Panel Header — Authoritative context indicator */}
      <div style={{
        padding: '0.75rem 1rem',
        borderBottom: '1px solid var(--border-primary)',
        background: isReadOnly 
          ? 'linear-gradient(180deg, rgba(51, 65, 85, 0.4) 0%, rgba(30, 41, 59, 0.95) 100%)'
          : 'linear-gradient(180deg, rgba(26, 32, 44, 0.95) 0%, rgba(20, 24, 32, 0.95) 100%)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {isReadOnly && (
            <span style={{ fontSize: '0.875rem' }}>🔒</span>
          )}
          <h3 style={{
            margin: 0,
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: isReadOnly ? 'var(--text-muted)' : 'var(--text-primary)',
            fontFamily: 'var(--font-sans)',
          }}>
            {panelInfo.title}
          </h3>
        </div>
        <div style={{
          marginTop: '0.25rem',
          fontSize: '0.6875rem',
          color: isReadOnly ? 'var(--text-dim)' : 'var(--text-muted)',
          fontFamily: 'var(--font-sans)',
        }}>
          {panelInfo.subtext}
        </div>
      </div>
      
      {/* Scrollable Content */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '0.75rem',
      }}>
        {/* Metadata Status Line — Always Visible */}
        <div style={{
          padding: '0.625rem 0.75rem',
          marginBottom: '0.75rem',
          backgroundColor: metadataStatus.isDestructive 
            ? 'rgba(239, 68, 68, 0.15)' 
            : 'rgba(34, 197, 94, 0.1)',
          borderRadius: 'var(--radius-sm)',
          border: `1px solid ${metadataStatus.isDestructive 
            ? 'rgba(239, 68, 68, 0.3)' 
            : 'rgba(34, 197, 94, 0.3)'}`,
        }}>
          <span style={{
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: metadataStatus.isDestructive 
              ? 'var(--status-failed-fg, #EF4444)' 
              : 'var(--status-completed-fg, #22C55E)',
          }}>
            {metadataStatus.text}
          </span>
        </div>
        
        {/* Video Section */}
        <Section
          title="Video"
          isOpen={openSections.has('video')}
          onToggle={() => toggleSection('video')}
          badge={settings.video.codec.toUpperCase()}
        >
          {codecsLoading ? (
            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading codec specs...
            </div>
          ) : codecsError ? (
            <div style={{ padding: '0.5rem', color: 'var(--status-failed-fg)', fontSize: '0.75rem' }}>
              ⚠️ Failed to load codecs: {codecsError}
            </div>
          ) : (
            <>
              <FieldRow label="Codec">
                <Select
                  value={settings.video.codec}
                  onChange={(v) => updateVideoSettings({ codec: v })}
                  options={videoCodecOptions}
                  disabled={isReadOnly}
                  fullWidth
                />
              </FieldRow>
              
              {/* Phase 20: Codec info tooltip */}
              {currentCodecSpec?.notes && (
                <div style={{
                  padding: '0.375rem 0.5rem',
                  marginBottom: '0.75rem',
                  fontSize: '0.6875rem',
                  color: 'var(--text-muted)',
                  backgroundColor: 'rgba(51, 65, 85, 0.2)',
                  borderRadius: 'var(--radius-sm)',
                  fontStyle: 'italic',
                }}>
                  ℹ️ {currentCodecSpec.notes}
                </div>
              )}
              
              {/* Phase 20: Rate control - CRF or Bitrate (mutually exclusive) */}
              {currentCodecSpec && (currentCodecSpec.supports_crf || currentCodecSpec.supports_bitrate) && (
                <>
                  <FieldRow label="Rate Control">
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {currentCodecSpec.supports_crf && (
                        <label style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.375rem',
                          cursor: isReadOnly ? 'not-allowed' : 'pointer',
                          opacity: isReadOnly ? 0.5 : 1,
                        }}>
                          <input
                            type="radio"
                            name="rate_control"
                            checked={settings.video.rate_control_mode === 'crf' || (!settings.video.rate_control_mode && currentCodecSpec.default_rate_control === 'crf')}
                            onChange={() => updateVideoSettings({ rate_control_mode: 'crf' })}
                            disabled={isReadOnly}
                          />
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>CRF (Quality)</span>
                        </label>
                      )}
                      {currentCodecSpec.supports_bitrate && (
                        <label style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.375rem',
                          cursor: isReadOnly ? 'not-allowed' : 'pointer',
                          opacity: isReadOnly ? 0.5 : 1,
                        }}>
                          <input
                            type="radio"
                            name="rate_control"
                            checked={settings.video.rate_control_mode === 'bitrate' || (!settings.video.rate_control_mode && currentCodecSpec.default_rate_control === 'bitrate')}
                            onChange={() => updateVideoSettings({ rate_control_mode: 'bitrate' })}
                            disabled={isReadOnly}
                          />
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Bitrate</span>
                        </label>
                      )}
                    </div>
                  </FieldRow>
                  
                  {/* CRF Slider (only if CRF mode selected and codec supports it) */}
                  {currentCodecSpec.supports_crf && 
                   (settings.video.rate_control_mode === 'crf' || (!settings.video.rate_control_mode && currentCodecSpec.default_rate_control === 'crf')) && (
                    <FieldRow label="Quality (CRF)" description="Lower = better quality, larger file">
                      <input
                        type="range"
                        min={currentCodecSpec.crf_min}
                        max={currentCodecSpec.crf_max}
                        value={settings.video.quality ?? currentCodecSpec.crf_default}
                        onChange={(e) => updateVideoSettings({ quality: parseInt(e.target.value) })}
                        disabled={isReadOnly}
                        style={{ width: '100%' }}
                      />
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        CRF {settings.video.quality ?? currentCodecSpec.crf_default}
                      </span>
                    </FieldRow>
                  )}
                  
                  {/* Bitrate Preset (only if Bitrate mode selected and codec supports it) */}
                  {currentCodecSpec.supports_bitrate && currentCodecSpec.bitrate_presets &&
                   settings.video.rate_control_mode === 'bitrate' && (
                    <FieldRow label="Bitrate Preset" description="No free-text entry. Presets ensure optimal quality.">
                      <Select
                        value={settings.video.bitrate_preset || 'medium'}
                        onChange={(v) => updateVideoSettings({ bitrate_preset: v as 'low' | 'medium' | 'high' | 'broadcast' })}
                        options={[
                          { value: 'low', label: `Low (${currentCodecSpec.bitrate_presets.low})` },
                          { value: 'medium', label: `Medium (${currentCodecSpec.bitrate_presets.medium})` },
                          { value: 'high', label: `High (${currentCodecSpec.bitrate_presets.high})` },
                          { value: 'broadcast', label: `Broadcast (${currentCodecSpec.bitrate_presets.broadcast})` },
                        ]}
                        disabled={isReadOnly}
                        fullWidth
                      />
                    </FieldRow>
                  )}
                </>
              )}
              
              {/* Intraframe codec indicator */}
              {currentCodecSpec?.is_intraframe && (
                <div style={{
                  padding: '0.375rem 0.5rem',
                  marginBottom: '0.75rem',
                  fontSize: '0.6875rem',
                  color: 'var(--status-completed-fg)',
                  backgroundColor: 'rgba(34, 197, 94, 0.1)',
                  borderRadius: 'var(--radius-sm)',
                }}>
                  ✓ Intraframe codec (no temporal compression)
                </div>
              )}
              
              <FieldRow label="Resolution">
                <Select
                  value={settings.video.resolution_policy}
                  onChange={(v) => updateVideoSettings({ resolution_policy: v })}
                  options={RESOLUTION_POLICIES}
                  disabled={isReadOnly}
                  fullWidth
                />
              </FieldRow>
          
          {settings.video.resolution_policy !== 'source' && (
            <>
              {/* Phase 20: Resolution preset dropdown */}
              <FieldRow label="Preset">
                <Select
                  value=""
                  onChange={(v) => {
                    const preset = RESOLUTION_PRESETS.find(p => p.value === v)
                    if (preset && preset.width > 0) {
                      updateVideoSettings({ 
                        width: preset.width, 
                        height: preset.height 
                      })
                    }
                  }}
                  options={RESOLUTION_PRESETS.map(p => ({ value: p.value, label: p.label }))}
                  disabled={isReadOnly}
                  fullWidth
                />
              </FieldRow>
              
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <FieldRow label="Width">
                  <input
                    type="number"
                    value={settings.video.width || ''}
                    onChange={(e) => updateVideoSettings({ width: parseInt(e.target.value) || undefined })}
                    disabled={isReadOnly}
                    placeholder="1920"
                    style={{
                      width: '100%',
                      padding: '0.375rem 0.5rem',
                      fontSize: '0.75rem',
                      background: 'var(--input-bg)',
                      border: '1px solid var(--border-primary)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </FieldRow>
                <FieldRow label="Height">
                  <input
                    type="number"
                    value={settings.video.height || ''}
                    onChange={(e) => updateVideoSettings({ height: parseInt(e.target.value) || undefined })}
                    disabled={isReadOnly}
                    placeholder="1080"
                    style={{
                      width: '100%',
                      padding: '0.375rem 0.5rem',
                      fontSize: '0.75rem',
                      background: 'var(--input-bg)',
                      border: '1px solid var(--border-primary)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </FieldRow>
              </div>
            </>
          )}
          
          <FieldRow label="Frame Rate">
            <Select
              value={settings.video.frame_rate_policy}
              onChange={(v) => updateVideoSettings({ frame_rate_policy: v })}
              options={[
                { value: 'source', label: 'Same as Source' },
                { value: 'custom', label: 'Custom' },
              ]}
              disabled={isReadOnly}
              fullWidth
            />
          </FieldRow>
          
          {settings.video.frame_rate_policy !== 'source' && (
            <FieldRow label="Target Frame Rate">
              <Select
                value={settings.video.frame_rate || '24'}
                onChange={(v) => updateVideoSettings({ frame_rate: v })}
                options={[
                  { value: '23.976', label: '23.976 fps' },
                  { value: '24', label: '24 fps' },
                  { value: '25', label: '25 fps' },
                  { value: '29.97', label: '29.97 fps' },
                  { value: '30', label: '30 fps' },
                  { value: '50', label: '50 fps' },
                  { value: '59.94', label: '59.94 fps' },
                  { value: '60', label: '60 fps' },
                ]}
                disabled={isReadOnly}
                fullWidth
              />
            </FieldRow>
          )}
          
          <FieldRow label="Pixel Aspect Ratio">
            <Select
              value={settings.video.pixel_aspect_ratio || 'square'}
              onChange={(v) => updateVideoSettings({ pixel_aspect_ratio: v })}
              options={[
                { value: 'square', label: 'Square Pixels (1:1)' },
                { value: 'anamorphic_2x', label: 'Anamorphic 2x' },
                { value: 'dv_ntsc', label: 'DV NTSC (0.91)' },
                { value: 'dv_pal', label: 'DV PAL (1.09)' },
              ]}
              disabled={isReadOnly}
              fullWidth
            />
          </FieldRow>
          </>
          )}
        </Section>
        
        {/* Audio Section */}
        <Section
          title="Audio"
          isOpen={openSections.has('audio')}
          onToggle={() => toggleSection('audio')}
          badge={settings.audio.codec.toUpperCase()}
        >
          <FieldRow label="Codec">
            <Select
              value={settings.audio.codec}
              onChange={(v) => updateAudioSettings({ codec: v })}
              options={AUDIO_CODECS}
              disabled={isReadOnly}
              fullWidth
            />
          </FieldRow>
          
          <CheckboxField
            label="Audio Passthrough (Copy without transcoding)"
            checked={settings.audio.passthrough}
            onChange={(v) => updateAudioSettings({ passthrough: v })}
            disabled={isReadOnly}
          />
          
          {!settings.audio.passthrough && settings.audio.codec !== 'copy' && (
            <FieldRow label="Bitrate">
              <Select
                value={settings.audio.bitrate || '192k'}
                onChange={(v) => updateAudioSettings({ bitrate: v })}
                options={AUDIO_BITRATE_PRESETS}
                disabled={isReadOnly}
                fullWidth
              />
            </FieldRow>
          )}
          
          <FieldRow label="Channel Layout">
            <Select
              value={settings.audio.layout}
              onChange={(v) => updateAudioSettings({ layout: v })}
              options={[
                { value: 'source', label: 'Same as Source' },
                { value: 'stereo', label: 'Stereo' },
                { value: 'mono', label: 'Mono' },
                { value: '5.1', label: '5.1 Surround' },
              ]}
              disabled={isReadOnly || settings.audio.passthrough}
              fullWidth
            />
          </FieldRow>
          
          <FieldRow label="Sample Rate">
            <Select
              value={String(settings.audio.sample_rate || 48000)}
              onChange={(v) => updateAudioSettings({ sample_rate: parseInt(v) })}
              options={[
                { value: '44100', label: '44.1 kHz' },
                { value: '48000', label: '48 kHz' },
                { value: '96000', label: '96 kHz' },
              ]}
              disabled={isReadOnly || settings.audio.passthrough}
              fullWidth
            />
          </FieldRow>
        </Section>
        
        {/* File Section */}
        <Section
          title="File"
          isOpen={openSections.has('file')}
          onToggle={() => toggleSection('file')}
          badge={settings.file.container.toUpperCase()}
        >
          <FieldRow label="Container" description={currentCodecSpec ? `Valid for ${currentCodecSpec.name}` : undefined}>
            <Select
              value={settings.file.container}
              onChange={(v) => updateFileSettings({ container: v })}
              options={containerOptions}
              disabled={isReadOnly}
              fullWidth
            />
          </FieldRow>
          
          <FieldRow label="Naming Template" description="Tokens: {source_name}, {reel}, {timecode}, {date}">
            <input
              type="text"
              value={settings.file.naming_template}
              onChange={(e) => updateFileSettings({ naming_template: e.target.value })}
              disabled={isReadOnly}
              style={{
                width: '100%',
                padding: '0.375rem 0.5rem',
                fontSize: '0.75rem',
                fontFamily: 'var(--font-mono)',
                background: 'var(--input-bg)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
              }}
            />
          </FieldRow>
          
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <FieldRow label="Prefix">
              <input
                type="text"
                value={settings.file.prefix || ''}
                onChange={(e) => updateFileSettings({ prefix: e.target.value || undefined })}
                disabled={isReadOnly}
                placeholder="Optional"
                style={{
                  width: '100%',
                  padding: '0.375rem 0.5rem',
                  fontSize: '0.75rem',
                  background: 'var(--input-bg)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                }}
              />
            </FieldRow>
            <FieldRow label="Suffix">
              <input
                type="text"
                value={settings.file.suffix || ''}
                onChange={(e) => updateFileSettings({ suffix: e.target.value || undefined })}
                disabled={isReadOnly}
                placeholder="Optional"
                style={{
                  width: '100%',
                  padding: '0.375rem 0.5rem',
                  fontSize: '0.75rem',
                  background: 'var(--input-bg)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                }}
              />
            </FieldRow>
          </div>
          
          <FieldRow label="Overwrite Policy">
            <Select
              value={settings.file.overwrite_policy}
              onChange={(v) => updateFileSettings({ overwrite_policy: v })}
              options={OVERWRITE_POLICIES}
              disabled={isReadOnly}
              fullWidth
            />
          </FieldRow>
          
          <CheckboxField
            label="Preserve source directory structure"
            checked={settings.file.preserve_source_dirs}
            onChange={(v) => updateFileSettings({ preserve_source_dirs: v })}
            disabled={isReadOnly}
          />
          
          {settings.file.preserve_source_dirs && (
            <FieldRow label="Directory Levels to Preserve">
              <input
                type="number"
                min="1"
                max="10"
                value={settings.file.preserve_dir_levels}
                onChange={(e) => updateFileSettings({ preserve_dir_levels: parseInt(e.target.value) || 0 })}
                disabled={isReadOnly}
                style={{
                  width: '80px',
                  padding: '0.375rem 0.5rem',
                  fontSize: '0.75rem',
                  background: 'var(--input-bg)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                }}
              />
            </FieldRow>
          )}
        </Section>
        
        {/* Metadata Section */}
        <Section
          title="Metadata"
          isOpen={openSections.has('metadata')}
          onToggle={() => toggleSection('metadata')}
          badge={metadataWarning ? '⚠️ STRIPPED' : 'PASSTHROUGH'}
        >
          <CheckboxField
            label="Strip ALL metadata (DESTRUCTIVE)"
            checked={settings.metadata.strip_all_metadata}
            onChange={(v) => updateMetadataSettings({ strip_all_metadata: v })}
            disabled={isReadOnly}
            warning={settings.metadata.strip_all_metadata}
          />
          
          {settings.metadata.strip_all_metadata && (
            <div style={{
              padding: '0.5rem',
              marginBottom: '0.5rem',
              fontSize: '0.6875rem',
              color: 'var(--status-failed-fg)',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 'var(--radius-sm)',
            }}>
              ⚠️ All source metadata will be removed. This cannot be undone.
            </div>
          )}
          
          {!settings.metadata.strip_all_metadata && (
            <>
              <CheckboxField
                label="Passthrough container metadata"
                checked={settings.metadata.passthrough_all_container_metadata}
                onChange={(v) => updateMetadataSettings({ passthrough_all_container_metadata: v })}
                disabled={isReadOnly}
              />
              <CheckboxField
                label="Passthrough timecode"
                checked={settings.metadata.passthrough_timecode}
                onChange={(v) => updateMetadataSettings({ passthrough_timecode: v })}
                disabled={isReadOnly}
              />
              <CheckboxField
                label="Passthrough reel name"
                checked={settings.metadata.passthrough_reel_name}
                onChange={(v) => updateMetadataSettings({ passthrough_reel_name: v })}
                disabled={isReadOnly}
              />
              <CheckboxField
                label="Passthrough camera metadata"
                checked={settings.metadata.passthrough_camera_metadata}
                onChange={(v) => updateMetadataSettings({ passthrough_camera_metadata: v })}
                disabled={isReadOnly}
              />
              <CheckboxField
                label="Passthrough color metadata"
                checked={settings.metadata.passthrough_color_metadata}
                onChange={(v) => updateMetadataSettings({ passthrough_color_metadata: v })}
                disabled={isReadOnly}
              />
            </>
          )}
        </Section>
        
        {/* Colour Section (Phase 20) — Planned, not fully implemented */}
        <Section
          title="Colour"
          isOpen={openSections.has('colour')}
          onToggle={() => toggleSection('colour')}
          badge="PLANNED"
        >
          {/* Disabled-with-explanation: Colour/LUT not wired to backend yet */}
          <div style={{
            padding: '0.75rem',
            marginBottom: '0.75rem',
            fontSize: '0.6875rem',
            color: 'var(--text-muted)',
            backgroundColor: 'rgba(51, 65, 85, 0.2)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-primary)',
            fontStyle: 'italic',
          }}>
            Planned — not available in Proxy v1.
            <br />
            Colour transforms and LUT application will be added in a future release.
          </div>
          
          <FieldRow label="Colour Mode">
            <Select
              value={settings.colour?.mode || 'passthrough'}
              onChange={(v) => updateColourSettings({ mode: v as 'passthrough' | 'apply_lut' | 'simple_transform' })}
              options={COLOUR_MODES}
              disabled={true} // Disabled until backend wiring is complete
              fullWidth
            />
          </FieldRow>
          
          {/* 
            NOTE: LUT Selection and Simple Transform controls are hidden since 
            the Colour section is marked as "Planned — not available in Proxy v1".
            These controls would be rendered here when the feature is implemented.
          */}
        </Section>
        
        {/* Watermarks Section (renamed from Overlays) */}
        <Section
          title="Watermarks"
          isOpen={openSections.has('overlay')}
          onToggle={() => toggleSection('overlay')}
          badge={activeOverlays > 0 ? `${activeOverlays} ACTIVE` : 'NONE'}
        >
          <div style={{ marginBottom: '0.5rem' }}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                updateOverlaySettings({
                  text_layers: [
                    ...settings.overlay.text_layers,
                    { text: '', position: 'bottom_left', font_size: 24, opacity: 1.0, enabled: true }
                  ]
                })
              }}
              disabled={isReadOnly}
            >
              + Add Watermark
            </Button>
          </div>
          
          {settings.overlay.text_layers.map((layer, index) => (
            <div 
              key={index}
              style={{
                padding: '0.5rem',
                marginBottom: '0.5rem',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-sm)',
                background: layer.enabled ? 'rgba(51, 65, 85, 0.2)' : 'rgba(51, 65, 85, 0.1)',
                opacity: layer.enabled ? 1 : 0.6,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <CheckboxField
                  label={`Layer ${index + 1}`}
                  checked={layer.enabled}
                  onChange={(v) => {
                    const newLayers = [...settings.overlay.text_layers]
                    newLayers[index] = { ...layer, enabled: v }
                    updateOverlaySettings({ text_layers: newLayers })
                  }}
                  disabled={isReadOnly}
                />
                <button
                  onClick={() => {
                    const newLayers = settings.overlay.text_layers.filter((_, i) => i !== index)
                    updateOverlaySettings({ text_layers: newLayers })
                  }}
                  disabled={isReadOnly}
                  style={{
                    marginLeft: 'auto',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-dim)',
                    cursor: isReadOnly ? 'not-allowed' : 'pointer',
                    fontSize: '0.875rem',
                  }}
                >
                  ×
                </button>
              </div>
              
              <FieldRow label="Text" description="Tokens: {TC}, {timecode}, {filename}, {reel}, {frame}, {date}, {source_name}">
                <input
                  type="text"
                  value={layer.text}
                  onChange={(e) => {
                    const newLayers = [...settings.overlay.text_layers]
                    newLayers[index] = { ...layer, text: e.target.value }
                    updateOverlaySettings({ text_layers: newLayers })
                  }}
                  disabled={isReadOnly}
                  placeholder="{source_name} - {TC}"
                  style={{
                    width: '100%',
                    padding: '0.375rem 0.5rem',
                    fontSize: '0.75rem',
                    fontFamily: 'var(--font-mono)',
                    background: 'var(--input-bg)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                  }}
                />
              </FieldRow>
              
              <FieldRow label="Position">
                <Select
                  value={layer.position}
                  onChange={(v) => {
                    const newLayers = [...settings.overlay.text_layers]
                    newLayers[index] = { ...layer, position: v }
                    updateOverlaySettings({ text_layers: newLayers })
                  }}
                  options={WATERMARK_POSITIONS}
                  disabled={isReadOnly}
                  fullWidth
                />
              </FieldRow>
              
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <FieldRow label="Font Size">
                  <input
                    type="number"
                    min="8"
                    max="72"
                    value={layer.font_size}
                    onChange={(e) => {
                      const newLayers = [...settings.overlay.text_layers]
                      newLayers[index] = { ...layer, font_size: parseInt(e.target.value) || 24 }
                      updateOverlaySettings({ text_layers: newLayers })
                    }}
                    disabled={isReadOnly}
                    style={{
                      width: '60px',
                      padding: '0.375rem 0.5rem',
                      fontSize: '0.75rem',
                      background: 'var(--input-bg)',
                      border: '1px solid var(--border-primary)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </FieldRow>
                <FieldRow label="Opacity">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={layer.opacity}
                    onChange={(e) => {
                      const newLayers = [...settings.overlay.text_layers]
                      newLayers[index] = { ...layer, opacity: parseFloat(e.target.value) }
                      updateOverlaySettings({ text_layers: newLayers })
                    }}
                    disabled={isReadOnly}
                    style={{ width: '80px' }}
                  />
                  <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginLeft: '0.25rem' }}>
                    {Math.round(layer.opacity * 100)}%
                  </span>
                </FieldRow>
              </div>
            </div>
          ))}
          
          {settings.overlay.text_layers.length === 0 && (
            <div style={{
              padding: '1rem',
              textAlign: 'center',
              fontSize: '0.75rem',
              color: 'var(--text-dim)',
              fontFamily: 'var(--font-sans)',
            }}>
              No watermarks configured
            </div>
          )}
        </Section>
      </div>
      
      {/* Apply Button (for pre-job context) */}
      {!isReadOnly && onApply && context.type !== 'none' && (
        <div style={{
          padding: '0.75rem 1rem',
          borderTop: '1px solid var(--border-primary)',
          background: 'var(--card-bg)',
        }}>
          <Button
            variant="primary"
            size="sm"
            onClick={onApply}
            fullWidth
          >
            Apply Settings
          </Button>
        </div>
      )}
    </div>
  )
}

export default DeliverControlPanel
