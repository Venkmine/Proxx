//Alpha scope defined in docs/ALPHA_REALITY.md.
//Do not add features that contradict it without updating that file first.

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Button } from './Button'
import { Select } from './Select'
import { TokenPalette } from './TokenPalette'
import { OverlayLayerStack } from './OverlayLayerStack'
// Phase 23: Watermark panels moved to VisualPreviewModal
// Imports kept for backwards compatibility but components no longer rendered inline
import type { TimecodeOverlay } from './PreviewViewport16x9'

/**
 * DeliverControlPanel — Persistent Control Surface (Alpha)
 * 
 * ⚠️ VERIFY GUARD:
 * Any change to this component requires Playwright coverage.
 * Tests: qa/verify/ui/proxy/create_job.spec.ts
 *        qa/verify/ui/proxy/validation_errors.spec.ts
 * Run: make verify-ui before committing changes.
 * 
 * Alpha: Codec-driven UI authority.
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
  resolution_preset?: string  // Phase 21: Named preset (source, 1080p, 2k, 720p, 540p)
  width?: number
  height?: number
  frame_rate_policy: string
  frame_rate?: string
  pixel_aspect_ratio?: string
  color_space?: string
  quality?: number  // CRF value
  bitrate?: string
  custom_bitrate?: string  // Phase 21: Custom bitrate input (e.g., "8M", "15000k")
  rate_control_mode?: 'crf' | 'bitrate'  // Phase 20: Explicit mode selection
  bitrate_preset?: 'low' | 'medium' | 'high' | 'broadcast' | 'custom'  // Phase 21: Added custom option
  preset?: string
  framing_mode?: 'fit' | 'fill' | 'stretch'  // Phase 21: Aspect ratio handling
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
  // Normalized coordinates (0-1) for graphical positioning
  x?: number
  y?: number
  // Phase 22: Additional text styling options
  font?: string
  color?: string
  background?: boolean
  background_color?: string
}

// Alpha: Image watermark support
export interface ImageOverlay {
  enabled: boolean
  // Image data (base64 for Alpha, will be file path in v1)
  image_data?: string
  image_name?: string
  // Normalized coordinates (0-1) for positioning
  x: number
  y: number
  opacity: number
  // Alpha: New scale and grayscale options
  scale?: number       // 0.25 - 2.0, default 1.0
  grayscale?: boolean  // B&W toggle
}

// ============================================================================
// PHASE 5A: OVERLAY LAYER SYSTEM
// ============================================================================

/**
 * OverlayLayer — Unified overlay model for all overlay types.
 * - Project scope: applies to all clips in the job
 * - Clip scope: applies only to the selected clip
 * - Order: higher values render on top (z-index)
 */
export type OverlayLayerType = 'image' | 'text' | 'timecode' | 'metadata'
export type OverlayLayerScope = 'project' | 'clip'

/**
 * Position source tracking for preset vs preview authority.
 * - "preset": Position was set by applying a preset (default)
 * - "manual": Position was set by dragging/scaling in preview
 */
export type PositionSource = 'preset' | 'manual'

export interface OverlayLayerSettings {
  // Text layer settings
  text?: string
  position?: string
  font_size?: number
  opacity?: number
  x?: number
  y?: number
  font?: string
  color?: string
  background?: boolean
  background_color?: string
  // Image layer settings
  image_data?: string
  image_name?: string
  scale?: number
  grayscale?: boolean
  // Timecode layer settings
  timecode_source?: string
  // Metadata layer settings
  metadata_field?: string
  // Phase 9E: Position source tracking
  positionSource?: PositionSource
}

export interface OverlayLayer {
  id: string
  type: OverlayLayerType
  scope: OverlayLayerScope
  enabled: boolean
  order: number
  settings: OverlayLayerSettings
  // Clip ID for clip-scoped layers (undefined for project-scoped)
  clipId?: string
}

export interface OverlaySettings {
  // Phase 5A: Layer-based overlay system
  layers: OverlayLayer[]
  // Legacy support (deprecated, kept for backwards compatibility)
  text_layers: TextOverlay[]
  // Alpha: Image watermark
  image_watermark?: ImageOverlay
  // Alpha: Timecode burn-in overlay
  timecode_overlay?: TimecodeOverlay
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
  onOpenVisualEditor?: () => void  // Phase 23: Open Visual Preview Modal
  hasQueuedJobSelected?: boolean  // Phase 0: Enable visual editor only when a queued job is selected
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

// Kept for future use
// const RESOLUTION_POLICIES = [
//   { value: 'source', label: 'Source Resolution' },
//   { value: 'custom', label: 'Custom Dimensions' },
// ]

// Phase 21: Simplified resolution presets for common proxy formats
const RESOLUTION_PRESETS = [
  { value: 'source', label: 'Source (Original)', width: 0, height: 0 },
  { value: '8k_dci', label: '8K DCI (8192×4320)', width: 8192, height: 4320 },
  { value: '8k', label: '8K UHD (7680×4320)', width: 7680, height: 4320 },
  { value: '6k_dci', label: '6K DCI (6144×3240)', width: 6144, height: 3240 },
  { value: '6k', label: '6K (6016×3384)', width: 6016, height: 3384 },
  { value: '4k_dci', label: '4K DCI (4096×2160)', width: 4096, height: 2160 },
  { value: '4k', label: '4K UHD (3840×2160)', width: 3840, height: 2160 },
  { value: '2k', label: '2K (2048×1080)', width: 2048, height: 1080 },
  { value: '1080p', label: '1080p Full HD (1920×1080)', width: 1920, height: 1080 },
  { value: '720p', label: '720p HD (1280×720)', width: 1280, height: 720 },
  { value: '540p', label: '540p (960×540)', width: 960, height: 540 },
]

// Phase 21: Aspect ratio framing options (when output AR ≠ source AR)
const FRAMING_OPTIONS = [
  { value: 'fit', label: 'Fit (Letterbox / Pillarbox)', description: 'Scale to fit within frame, add padding' },
  { value: 'fill', label: 'Fill (Crop)', description: 'Scale to fill frame, crop overflow' },
  { value: 'stretch', label: 'Stretch (Distort)', description: 'Scale to fill frame, distort aspect' },
]

const OVERWRITE_POLICIES = [
  { value: 'never', label: 'Never (Fail if exists)' },
  { value: 'always', label: 'Always Overwrite' },
  { value: 'increment', label: 'Auto-Increment Suffix' },
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
  'data-testid'?: string
}

function Section({ title, isOpen, onToggle, children, badge, 'data-testid': testId }: SectionProps) {
  return (
    <div style={{ marginBottom: '0.5rem' }} data-testid={testId}>
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
          padding: '0.75rem 0.5rem',
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

// Responsive two-column grid for field groupings (unused, kept for reference)
// interface FieldGridProps {
//   children: React.ReactNode
// }

// function FieldGrid({ children }: FieldGridProps) {
//   return (
//     <div style={{
//       display: 'flex',
//       flexWrap: 'wrap',
//       gap: '0.75rem 1.5rem',
//     }}>
//       {children}
//     </div>
//   )
// }

// Field item that can span half or full width (unused, kept for reference)
// interface FieldItemProps {
//   children: React.ReactNode
//   fullWidth?: boolean
// }

// function FieldItem({ children, fullWidth = false }: FieldItemProps) {
//   return (
//     <div style={{
//       flex: fullWidth ? '1 1 100%' : '1 1 200px',
//       minWidth: fullWidth ? '100%' : '200px',
//       maxWidth: fullWidth ? '100%' : undefined,
//     }}>
//       {children}
//     </div>
//   )
// }

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
  onOpenVisualEditor,
  hasQueuedJobSelected = false,
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
    
    // Flatten with group headers (unique values to avoid React key warnings)
    const result: { value: string; label: string; disabled?: boolean }[] = []
    if (categories.prores.length > 0) {
      result.push({ value: '__header_prores', label: '── ProRes ──', disabled: true })
      result.push(...categories.prores)
    }
    if (categories.dnx.length > 0) {
      result.push({ value: '__header_dnx', label: '── DNx ──', disabled: true })
      result.push(...categories.dnx)
    }
    if (categories.delivery.length > 0) {
      result.push({ value: '__header_delivery', label: '── Delivery ──', disabled: true })
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
      mxf: 'MXF OP1a (.mxf)',
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
  
  // Compute metadata summary status line (commented out for now, kept for future)
  // const getMetadataStatusLine = (): { text: string; isDestructive: boolean } => {
  //   if (settings.metadata.strip_all_metadata) {
  //     return { text: 'Metadata: Stripped', isDestructive: true }
  //   }
  //   const passthroughFlags = [
  //     settings.metadata.passthrough_timecode,
  //     settings.metadata.passthrough_reel_name,
  //     settings.metadata.passthrough_camera_metadata,
  //     settings.metadata.passthrough_color_metadata,
  //   ]
  //   const activeCount = passthroughFlags.filter(Boolean).length
  //   if (activeCount === passthroughFlags.length) {
  //     return { text: 'Metadata: Passthrough (Camera → Output)', isDestructive: false }
  //   } else if (activeCount === 0) {
  //     return { text: 'Metadata: None Preserved', isDestructive: true }
  //   } else {
  //     return { text: `Metadata: Partial (${activeCount}/${passthroughFlags.length})`, isDestructive: false }
  //   }
  // }
  
  // const metadataStatus = getMetadataStatusLine()
  
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
  
  // Overlay settings helper (for watermarks section)
  const updateOverlaySettings = (updates: Partial<OverlaySettings>) => {
    onSettingsChange({
      overlay: { ...settings.overlay, ...updates }
    })
  }
  
  // Phase 5A: Layer state for the new overlay system
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null)
  
  // Phase 5A: Generate unique ID for new layers
  const generateLayerId = useCallback(() => {
    return `layer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }, [])
  
  // Phase 5A: Add new overlay layer
  const handleAddOverlayLayer = useCallback((type: OverlayLayerType, scope: OverlayLayerScope) => {
    const layers = settings.overlay.layers || []
    const maxOrder = layers.length > 0 ? Math.max(...layers.map(l => l.order)) : 0
    
    const newLayer: OverlayLayer = {
      id: generateLayerId(),
      type,
      scope,
      enabled: true,
      order: maxOrder + 1,
      settings: {
        opacity: 1.0,
        position: 'bottom_left',
        font_size: 24,
        ...(type === 'text' ? { text: '' } : {}),
        ...(type === 'image' ? { scale: 1.0, x: 0.5, y: 0.5 } : {}),
        ...(type === 'timecode' ? { background: true } : {}),
        ...(type === 'metadata' ? { metadata_field: 'filename' } : {}),
      },
      clipId: scope === 'clip' ? undefined : undefined, // Will be set when clip is selected
    }
    
    updateOverlaySettings({ layers: [...layers, newLayer] })
    setSelectedLayerId(newLayer.id)
  }, [settings.overlay.layers, generateLayerId, updateOverlaySettings])
  
  // Phase 5A: Update layers array
  const handleLayersChange = useCallback((layers: OverlayLayer[]) => {
    updateOverlaySettings({ layers })
  }, [updateOverlaySettings])
  
  // Count active overlays (from both legacy and new layer system)
  const activeLayerCount = (settings.overlay.layers || []).filter(l => l.enabled).length
  const activeLegacyOverlays = settings.overlay.text_layers.filter(l => l.enabled).length
  const activeOverlays = activeLayerCount + activeLegacyOverlays
  
  // Determine if metadata passthrough is at risk
  const metadataWarning = settings.metadata.strip_all_metadata

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      flex: 1,
      width: '100%',
      backgroundColor: 'var(--card-bg-solid, rgba(16, 18, 20, 0.95))',
      overflow: 'hidden',
    }}>
      {/* Panel Header — Matches PresetEditorHeader visual style */}
      <div style={{
        padding: '0.75rem 1.25rem',
        background: 'var(--card-bg-solid, rgba(16, 18, 20, 0.95))',
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
        
        {/* Phase 23: Metadata status banner moved into Metadata section header badge */}
        {/* Removed duplicate callout from panel header */}
      </div>
      
      {/* Scrollable Content */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '1rem 1.25rem',
      }}>
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
              {/* Container first, then Codec */}
              <FieldRow label="Container" description={currentCodecSpec ? `Valid for ${currentCodecSpec.name}` : undefined}>
                <Select
                  value={settings.file.container}
                  onChange={(v) => updateFileSettings({ container: v })}
                  options={containerOptions}
                  disabled={isReadOnly}
                  fullWidth
                />
              </FieldRow>

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
                    <>
                      <FieldRow label="Bitrate Preset">
                        <Select
                          data-testid="bitrate-preset-select"
                          value={settings.video.bitrate_preset || 'medium'}
                          onChange={(v) => updateVideoSettings({ 
                            bitrate_preset: v as 'low' | 'medium' | 'high' | 'broadcast' | 'custom',
                            custom_bitrate: v === 'custom' ? settings.video.custom_bitrate : undefined,
                          })}
                          options={[
                            { value: 'low', label: `Low (${currentCodecSpec.bitrate_presets.low})` },
                            { value: 'medium', label: `Medium (${currentCodecSpec.bitrate_presets.medium})` },
                            { value: 'high', label: `High (${currentCodecSpec.bitrate_presets.high})` },
                            { value: 'broadcast', label: `Broadcast (${currentCodecSpec.bitrate_presets.broadcast})` },
                            { value: 'custom', label: 'Custom...' },
                          ]}
                          disabled={isReadOnly}
                          fullWidth
                        />
                      </FieldRow>
                      
                      {/* Custom Bitrate Input (Advanced disclosure) */}
                      {settings.video.bitrate_preset === 'custom' && (
                        <FieldRow label="Custom Bitrate" description="Enter bitrate (e.g., 8M, 15000k, 50000000)">
                          <input
                            type="text"
                            data-testid="custom-bitrate-input"
                            value={settings.video.custom_bitrate || ''}
                            onChange={(e) => updateVideoSettings({ 
                              custom_bitrate: e.target.value,
                              bitrate: e.target.value,
                            })}
                            disabled={isReadOnly}
                            placeholder="e.g., 8M, 15000k"
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
                      )}
                    </>
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
                  data-testid="resolution-preset-select"
                  value={settings.video.resolution_preset || 'source'}
                  onChange={(v) => {
                    const preset = RESOLUTION_PRESETS.find(p => p.value === v)
                    if (preset) {
                      if (v === 'source') {
                        updateVideoSettings({ 
                          resolution_policy: 'source',
                          resolution_preset: 'source',
                          width: undefined, 
                          height: undefined,
                          framing_mode: undefined,
                        })
                      } else {
                        updateVideoSettings({ 
                          resolution_policy: 'custom',
                          resolution_preset: v,
                          width: preset.width, 
                          height: preset.height,
                        })
                      }
                    }
                  }}
                  options={RESOLUTION_PRESETS.map(p => ({ value: p.value, label: p.label }))}
                  disabled={isReadOnly}
                  fullWidth
                />
              </FieldRow>
          
          {/* Framing/Scaling controls - only when output AR may differ from source */}
          {settings.video.resolution_policy !== 'source' && settings.video.width && settings.video.height && (
            <FieldRow label="Framing / Scaling" description="How to handle aspect ratio differences">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                {FRAMING_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.5rem',
                      cursor: isReadOnly ? 'not-allowed' : 'pointer',
                      opacity: isReadOnly ? 0.5 : 1,
                    }}
                  >
                    <input
                      type="radio"
                      name="framing_mode"
                      data-testid={`framing-${option.value}`}
                      checked={(settings.video.framing_mode || 'fit') === option.value}
                      onChange={() => updateVideoSettings({ framing_mode: option.value as 'fit' | 'fill' | 'stretch' })}
                      disabled={isReadOnly}
                      style={{ marginTop: '0.125rem' }}
                    />
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                        {option.label}
                      </span>
                      <div style={{ fontSize: '0.625rem', color: 'var(--text-dim)' }}>
                        {option.description}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </FieldRow>
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
        
        {/* File Naming Section - Container moved to Video for codec grouping */}
        <Section
          title="File Naming"
          isOpen={openSections.has('file')}
          onToggle={() => toggleSection('file')}
        >
          <FieldRow label="Naming Template" description="Click tokens or type to build template">
            <TokenPalette
              value={settings.file.naming_template}
              onChange={(v) => updateFileSettings({ naming_template: v })}
              disabled={isReadOnly}
              backendUrl={backendUrl}
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
        
        {/* Metadata Section — Reorganized with Passthrough at top */}
        <Section
          title="Metadata"
          isOpen={openSections.has('metadata')}
          onToggle={() => toggleSection('metadata')}
          badge={metadataWarning ? '⚠️ STRIPPED' : 'PASSTHROUGH'}
        >
          {/* Master Passthrough Toggle - Always visible at top */}
          <div 
            data-testid="metadata-passthrough-group"
            style={{
              padding: '0.625rem',
              marginBottom: '0.75rem',
              backgroundColor: settings.metadata.strip_all_metadata 
                ? 'rgba(239, 68, 68, 0.1)' 
                : 'rgba(34, 197, 94, 0.1)',
              borderRadius: 'var(--radius-sm)',
              border: `1px solid ${settings.metadata.strip_all_metadata 
                ? 'rgba(239, 68, 68, 0.3)' 
                : 'rgba(34, 197, 94, 0.3)'}`,
            }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: settings.metadata.strip_all_metadata ? 0 : '0.5rem',
            }}>
              <input
                type="checkbox"
                data-testid="metadata-passthrough-toggle"
                checked={!settings.metadata.strip_all_metadata}
                onChange={(v) => updateMetadataSettings({ 
                  strip_all_metadata: !v.target.checked,
                  // When enabling passthrough, enable all by default
                  ...(!v.target.checked ? {} : {
                    passthrough_all_container_metadata: true,
                    passthrough_timecode: true,
                    passthrough_reel_name: true,
                    passthrough_camera_metadata: true,
                    passthrough_color_metadata: true,
                  })
                })}
                disabled={isReadOnly}
                style={{ accentColor: 'var(--status-completed-fg)' }}
              />
              <span style={{
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: settings.metadata.strip_all_metadata 
                  ? 'var(--status-failed-fg)' 
                  : 'var(--status-completed-fg)',
              }}>
                {settings.metadata.strip_all_metadata 
                  ? '⚠️ Metadata: STRIPPED (Destructive)' 
                  : '✓ Passthrough (Camera → Output)'}
              </span>
            </div>
            
            {/* Individual passthrough options - immediately visible when enabled */}
            {!settings.metadata.strip_all_metadata && (
              <div style={{ 
                paddingLeft: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.375rem',
              }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary)',
                  cursor: isReadOnly ? 'not-allowed' : 'pointer',
                }}>
                  <input
                    type="checkbox"
                    data-testid="metadata-container"
                    checked={settings.metadata.passthrough_all_container_metadata}
                    onChange={(v) => updateMetadataSettings({ passthrough_all_container_metadata: v.target.checked })}
                    disabled={isReadOnly}
                    style={{ accentColor: 'var(--button-primary-bg)' }}
                  />
                  Container metadata
                </label>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary)',
                  cursor: isReadOnly ? 'not-allowed' : 'pointer',
                }}>
                  <input
                    type="checkbox"
                    data-testid="metadata-timecode"
                    checked={settings.metadata.passthrough_timecode}
                    onChange={(v) => updateMetadataSettings({ passthrough_timecode: v.target.checked })}
                    disabled={isReadOnly}
                    style={{ accentColor: 'var(--button-primary-bg)' }}
                  />
                  Timecode
                </label>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary)',
                  cursor: isReadOnly ? 'not-allowed' : 'pointer',
                }}>
                  <input
                    type="checkbox"
                    data-testid="metadata-reel"
                    checked={settings.metadata.passthrough_reel_name}
                    onChange={(v) => updateMetadataSettings({ passthrough_reel_name: v.target.checked })}
                    disabled={isReadOnly}
                    style={{ accentColor: 'var(--button-primary-bg)' }}
                  />
                  Reel name
                </label>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary)',
                  cursor: isReadOnly ? 'not-allowed' : 'pointer',
                }}>
                  <input
                    type="checkbox"
                    data-testid="metadata-camera"
                    checked={settings.metadata.passthrough_camera_metadata}
                    onChange={(v) => updateMetadataSettings({ passthrough_camera_metadata: v.target.checked })}
                    disabled={isReadOnly}
                    style={{ accentColor: 'var(--button-primary-bg)' }}
                  />
                  Camera metadata
                </label>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary)',
                  cursor: isReadOnly ? 'not-allowed' : 'pointer',
                }}>
                  <input
                    type="checkbox"
                    data-testid="metadata-color"
                    checked={settings.metadata.passthrough_color_metadata}
                    onChange={(v) => updateMetadataSettings({ passthrough_color_metadata: v.target.checked })}
                    disabled={isReadOnly}
                    style={{ accentColor: 'var(--button-primary-bg)' }}
                  />
                  Color metadata
                </label>
              </div>
            )}
          </div>
        </Section>
        
        {/* Overlays Section — Text overlays, image overlay, timecode overlay */}
        <Section
          title="Overlays"
          isOpen={openSections.has('overlay')}
          onToggle={() => toggleSection('overlay')}
          badge={activeOverlays > 0 || settings.overlay.image_watermark?.enabled || settings.overlay.timecode_overlay?.enabled ? 'ACTIVE' : 'NONE'}
          data-testid="overlays-section"
        >
          {/* Visual Editor Button */}
          {onOpenVisualEditor && (
            <div style={{ marginBottom: '0.75rem' }}>
              <Button
                variant="primary"
                size="sm"
                onClick={onOpenVisualEditor}
                disabled={isReadOnly || !hasQueuedJobSelected}
                fullWidth
                data-testid="open-visual-editor"
              >
                🎨 Open Visual Editor
              </Button>
              {!hasQueuedJobSelected && (
                <div style={{
                  marginTop: '0.375rem',
                  fontSize: '0.625rem',
                  color: 'var(--text-dim)',
                  textAlign: 'center',
                  fontStyle: 'italic',
                }}>
                  Select a queued job to enable visual editor
                </div>
              )}
            </div>
          )}
          
          {/* Phase 5A: Overlay Layer Stack */}
          <OverlayLayerStack
            layers={settings.overlay.layers || []}
            onLayersChange={handleLayersChange}
            selectedLayerId={selectedLayerId}
            onLayerSelect={setSelectedLayerId}
            isReadOnly={isReadOnly}
            onAddLayer={handleAddOverlayLayer}
          />
          
          {/* Legacy overlays (deprecated, shown for backwards compatibility) */}
          {/* STRUCTURAL FIX: Clarify that these overlays ARE rendered to output */}
          {(settings.overlay.text_layers.length > 0 || settings.overlay.image_watermark?.enabled || settings.overlay.timecode_overlay?.enabled) && (
            <div style={{
              marginTop: '1rem',
              padding: '0.5rem',
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              borderRadius: 'var(--radius-sm)',
            }}>
              <div style={{ fontSize: '0.625rem', color: 'rgb(59, 130, 246)', fontWeight: 600, marginBottom: '0.5rem' }}>
                Active Overlays (Will Render to Output)
              </div>
              
              {/* Text Layers List */}
              {settings.overlay.text_layers.map((layer, index) => (
                <div 
                  key={index}
                  style={{
                    padding: '0.375rem',
                    marginBottom: '0.375rem',
                    background: layer.enabled ? 'rgba(59, 130, 246, 0.1)' : 'rgba(51, 65, 85, 0.15)',
                    border: `1px solid ${layer.enabled ? 'rgba(59, 130, 246, 0.3)' : 'var(--border-secondary)'}`,
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.6875rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)' }}>
                      Text: {layer.text || '(empty)'} 
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const updated = settings.overlay.text_layers.filter((_, i) => i !== index)
                        updateOverlaySettings({ text_layers: updated })
                      }}
                      disabled={isReadOnly}
                      style={{ padding: '0.125rem 0.25rem', fontSize: '0.5rem' }}
                    >
                      ✕
                    </Button>
                  </div>
                </div>
              ))}
              
              {settings.overlay.image_watermark?.enabled && (
                <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                  • Image Overlay (enabled)
                </div>
              )}
              {settings.overlay.timecode_overlay?.enabled && (
                <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)' }}>
                  • Timecode Overlay (enabled)
                </div>
              )}
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
