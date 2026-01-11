/**
 * MetadataPanel — Resolve-style Metadata Display
 * 
 * ============================================================================
 * DESIGN PHILOSOPHY
 * ============================================================================
 * This component provides a professional metadata display panel inspired by
 * DaVinci Resolve's metadata inspector. It shows structured metadata for the
 * currently selected source file.
 * 
 * FEATURES:
 * - Categorized metadata sections (Clip Details, Camera, Audio, Technical)
 * - Read-only display of metadata from ffprobe/exiftool
 * - Virtualized list for large metadata sets
 * - Collapsible sections for better organization
 * 
 * METADATA SOURCES:
 * - Primary: ffprobe JSON output (format, streams, tags)
 * - Secondary: exiftool (for camera/lens metadata if available)
 * - XMP: Reading supported where available (embedding NOT yet supported)
 * 
 * PLACEMENT:
 * - Located in LEFT-CENTER area: below source files list, above watch folders
 * 
 * See: docs/MONITOR_SURFACE.md
 * ============================================================================
 */

import React, { useState, useCallback, useMemo } from 'react'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Structured metadata model with sections
 */
export interface MetadataSection {
  id: string
  label: string
  icon?: string
  fields: MetadataField[]
  collapsed?: boolean
}

export interface MetadataField {
  key: string
  label: string
  value: string | number | null
  unit?: string
  tooltip?: string
}

/**
 * Raw metadata from backend (ffprobe/exiftool)
 */
export interface RawMetadata {
  // Format info
  filename?: string
  format_name?: string
  format_long_name?: string
  duration?: number
  size?: number
  bit_rate?: number
  
  // Video stream
  video_codec?: string
  video_codec_long?: string
  width?: number
  height?: number
  pixel_format?: string
  color_space?: string
  color_primaries?: string
  color_transfer?: string
  frame_rate?: string
  frames?: number
  
  // Audio stream
  audio_codec?: string
  audio_codec_long?: string
  sample_rate?: number
  channels?: number
  channel_layout?: string
  audio_bit_rate?: number
  
  // Timecode
  timecode_start?: string
  has_timecode?: boolean
  
  // Camera metadata (from exiftool/XMP)
  camera_make?: string
  camera_model?: string
  lens?: string
  iso?: number
  shutter_speed?: string
  aperture?: string
  focal_length?: string
  date_created?: string
  
  // Container tags
  encoder?: string
  creation_time?: string
  handler_name?: string
  
  // RAW specific
  raw_type?: string
  raw_compression?: string
  
  // XMP status
  xmp_available?: boolean
  xmp_read_supported?: boolean
  
  // Phase 12: Metadata provenance tracking
  /** Source of metadata: 'ffprobe' | 'resolve' | 'exiftool' | 'sidecar' */
  provenance?: 'ffprobe' | 'resolve' | 'exiftool' | 'sidecar' | 'unknown'
  /** Completeness indicator: 'complete' | 'limited' | 'minimal' */
  completeness?: 'complete' | 'limited' | 'minimal'
  /** Reason for limited metadata (for RAW files etc.) */
  completeness_reason?: string
}

interface MetadataPanelProps {
  /** Raw metadata from backend */
  metadata: RawMetadata | null
  /** Whether metadata is currently loading */
  loading?: boolean
  /** Error message if metadata fetch failed */
  error?: string | null
  /** Whether the panel is collapsed */
  collapsed?: boolean
  /** Callback when collapse state changes */
  onToggleCollapse?: () => void
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Format file size in human-readable form
 */
function formatFileSize(bytes: number | undefined): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

/**
 * Format duration in HH:MM:SS.ms
 */
function formatDuration(seconds: number | undefined): string {
  if (!seconds || !isFinite(seconds)) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 1000)
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`
  }
  return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`
}

/**
 * Format bitrate in human-readable form
 */
function formatBitrate(bps: number | undefined): string {
  if (!bps) return '—'
  if (bps < 1000) return `${bps} bps`
  if (bps < 1000000) return `${(bps / 1000).toFixed(0)} Kbps`
  return `${(bps / 1000000).toFixed(1)} Mbps`
}

/**
 * Transform raw metadata into categorized sections
 */
function buildMetadataSections(raw: RawMetadata): MetadataSection[] {
  const sections: MetadataSection[] = []
  // =========================================================================
  // Phase 12: PROVENANCE SECTION (always first to establish trust)
  // Shows metadata source and completeness so users know what they're seeing
  // =========================================================================
  const provenanceFields: MetadataField[] = []
  
  // Determine provenance display
  const provenanceSource = raw.provenance || 'ffprobe'
  const provenanceLabels: Record<string, string> = {
    'ffprobe': 'FFprobe (container)',
    'resolve': 'DaVinci Resolve (RAW)',
    'exiftool': 'ExifTool (embedded)',
    'sidecar': 'Sidecar file',
    'unknown': 'Unknown'
  }
  provenanceFields.push({
    key: 'source',
    label: 'Source',
    value: provenanceLabels[provenanceSource] || provenanceSource,
    tooltip: 'Where this metadata was extracted from'
  })
  
  // Determine completeness display
  const completeness = raw.completeness || 'complete'
  const completenessLabels: Record<string, string> = {
    'complete': '✓ COMPLETE',
    'limited': '⚠ LIMITED',
    'minimal': '⛔ MINIMAL'
  }
  const completenessTooltips: Record<string, string> = {
    'complete': 'Full metadata available from source',
    'limited': raw.completeness_reason || 'Some metadata fields unavailable',
    'minimal': 'Only basic file information available'
  }
  provenanceFields.push({
    key: 'completeness',
    label: 'Completeness',
    value: completenessLabels[completeness] || completeness,
    tooltip: completenessTooltips[completeness]
  })
  
  // Add reason for limited/minimal completeness
  if ((completeness === 'limited' || completeness === 'minimal') && raw.completeness_reason) {
    provenanceFields.push({
      key: 'completeness_reason',
      label: 'Note',
      value: raw.completeness_reason
    })
  }
  
  // Always show provenance section (first)
  sections.push({ id: 'provenance', label: 'Provenance', icon: '🔍', fields: provenanceFields })
  
  // Clip Details
  const clipFields: MetadataField[] = []
  if (raw.filename) clipFields.push({ key: 'filename', label: 'Filename', value: raw.filename })
  if (raw.format_name) clipFields.push({ key: 'format', label: 'Format', value: raw.format_long_name || raw.format_name })
  if (raw.duration) clipFields.push({ key: 'duration', label: 'Duration', value: formatDuration(raw.duration) })
  if (raw.size) clipFields.push({ key: 'size', label: 'File Size', value: formatFileSize(raw.size) })
  if (raw.bit_rate) clipFields.push({ key: 'bitrate', label: 'Bitrate', value: formatBitrate(raw.bit_rate) })
  if (raw.frames) clipFields.push({ key: 'frames', label: 'Total Frames', value: raw.frames.toLocaleString() })
  if (raw.timecode_start) clipFields.push({ key: 'tc_start', label: 'TC Start', value: raw.timecode_start })
  
  if (clipFields.length > 0) {
    sections.push({ id: 'clip', label: 'Clip Details', icon: '📎', fields: clipFields })
  }
  
  // Video
  const videoFields: MetadataField[] = []
  if (raw.video_codec) {
    videoFields.push({ 
      key: 'codec', 
      label: 'Codec', 
      value: raw.video_codec_long || raw.video_codec,
      tooltip: raw.video_codec
    })
  }
  if (raw.width && raw.height) {
    videoFields.push({ key: 'resolution', label: 'Resolution', value: `${raw.width}×${raw.height}` })
  }
  if (raw.pixel_format) videoFields.push({ key: 'pixel_format', label: 'Pixel Format', value: raw.pixel_format })
  if (raw.frame_rate) videoFields.push({ key: 'frame_rate', label: 'Frame Rate', value: raw.frame_rate, unit: 'fps' })
  if (raw.color_space) videoFields.push({ key: 'color_space', label: 'Color Space', value: raw.color_space })
  if (raw.color_primaries) videoFields.push({ key: 'color_primaries', label: 'Color Primaries', value: raw.color_primaries })
  if (raw.color_transfer) videoFields.push({ key: 'color_transfer', label: 'Transfer', value: raw.color_transfer })
  
  if (videoFields.length > 0) {
    sections.push({ id: 'video', label: 'Video', icon: '🎬', fields: videoFields })
  }
  
  // Audio
  const audioFields: MetadataField[] = []
  if (raw.audio_codec) {
    audioFields.push({ 
      key: 'codec', 
      label: 'Codec', 
      value: raw.audio_codec_long || raw.audio_codec 
    })
  }
  if (raw.sample_rate) audioFields.push({ key: 'sample_rate', label: 'Sample Rate', value: raw.sample_rate.toLocaleString(), unit: 'Hz' })
  if (raw.channels) audioFields.push({ key: 'channels', label: 'Channels', value: raw.channels.toString() })
  if (raw.channel_layout) audioFields.push({ key: 'layout', label: 'Layout', value: raw.channel_layout })
  if (raw.audio_bit_rate) audioFields.push({ key: 'bitrate', label: 'Bitrate', value: formatBitrate(raw.audio_bit_rate) })
  
  if (audioFields.length > 0) {
    sections.push({ id: 'audio', label: 'Audio', icon: '🔊', fields: audioFields })
  }
  
  // Camera / Source (from exiftool/XMP)
  const cameraFields: MetadataField[] = []
  if (raw.camera_make) cameraFields.push({ key: 'make', label: 'Make', value: raw.camera_make })
  if (raw.camera_model) cameraFields.push({ key: 'model', label: 'Model', value: raw.camera_model })
  if (raw.lens) cameraFields.push({ key: 'lens', label: 'Lens', value: raw.lens })
  if (raw.iso) cameraFields.push({ key: 'iso', label: 'ISO', value: raw.iso.toString() })
  if (raw.shutter_speed) cameraFields.push({ key: 'shutter', label: 'Shutter', value: raw.shutter_speed })
  if (raw.aperture) cameraFields.push({ key: 'aperture', label: 'Aperture', value: raw.aperture })
  if (raw.focal_length) cameraFields.push({ key: 'focal_length', label: 'Focal Length', value: raw.focal_length })
  if (raw.date_created) cameraFields.push({ key: 'date_created', label: 'Date Created', value: raw.date_created })
  
  if (cameraFields.length > 0) {
    sections.push({ id: 'camera', label: 'Camera', icon: '📷', fields: cameraFields })
  }
  
  // Technical / Container
  const techFields: MetadataField[] = []
  if (raw.encoder) techFields.push({ key: 'encoder', label: 'Encoder', value: raw.encoder })
  if (raw.creation_time) techFields.push({ key: 'creation_time', label: 'Creation Time', value: raw.creation_time })
  if (raw.handler_name) techFields.push({ key: 'handler', label: 'Handler', value: raw.handler_name })
  if (raw.raw_type) techFields.push({ key: 'raw_type', label: 'RAW Type', value: raw.raw_type })
  if (raw.raw_compression) techFields.push({ key: 'raw_compression', label: 'RAW Compression', value: raw.raw_compression })
  
  if (techFields.length > 0) {
    sections.push({ id: 'technical', label: 'Technical', icon: '⚙️', fields: techFields })
  }
  
  // XMP Status (informational only)
  /**
   * XMP IMPLEMENTATION NOTES:
   * 
   * READING XMP:
   * - Feasible via sidecar file parsing (.xmp files alongside media)
   * - Embedded XMP in MOV/MP4 can be extracted via ffprobe or exiftool
   * - Currently NOT implemented, marked as TODO
   * 
   * EMBEDDING XMP:
   * - Higher risk: requires careful file format handling
   * - MOV/MP4 requires moov atom modification
   * - Some formats don't support embedded XMP
   * - NOT planned for initial release
   * 
   * Recommendation: Implement reading first via sidecar support,
   * then consider embedding as a separate phase with extensive testing.
   */
  if (raw.xmp_available !== undefined) {
    const xmpFields: MetadataField[] = [
      { 
        key: 'xmp_status', 
        label: 'XMP Status', 
        value: raw.xmp_available 
          ? (raw.xmp_read_supported ? 'Available (read-only)' : 'Available (not parsed)')
          : 'Not available',
        tooltip: 'XMP embedding is not yet supported. Reading XMP sidecars is planned.'
      }
    ]
    sections.push({ id: 'xmp', label: 'XMP', icon: '📄', fields: xmpFields, collapsed: true })
  }
  
  return sections
}

// ============================================================================
// STYLES
// ============================================================================

const styles = {
  container: {
    background: 'rgba(20, 24, 32, 0.8)',
    borderTop: '1px solid var(--border-primary)',
    borderBottom: '1px solid var(--border-primary)',
    fontSize: '0.6875rem',
    maxHeight: '300px',
    overflow: 'auto',
  } as React.CSSProperties,
  
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.5rem 0.75rem',
    borderBottom: '1px solid var(--border-secondary)',
    cursor: 'pointer',
    userSelect: 'none',
  } as React.CSSProperties,
  
  headerTitle: {
    fontSize: '0.6875rem',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  } as React.CSSProperties,
  
  collapseIcon: {
    fontSize: '0.625rem',
    color: 'var(--text-dim)',
    transition: 'transform 0.15s',
  } as React.CSSProperties,
  
  section: {
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
  } as React.CSSProperties,
  
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    padding: '0.5rem 0.75rem',
    cursor: 'pointer',
    userSelect: 'none',
    background: 'rgba(255, 255, 255, 0.02)',
  } as React.CSSProperties,
  
  sectionIcon: {
    fontSize: '0.75rem',
  } as React.CSSProperties,
  
  sectionLabel: {
    fontSize: '0.625rem',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    flex: 1,
  } as React.CSSProperties,
  
  sectionChevron: {
    fontSize: '0.5rem',
    color: 'var(--text-dim)',
    transition: 'transform 0.15s',
  } as React.CSSProperties,
  
  fieldList: {
    padding: '0.25rem 0',
  } as React.CSSProperties,
  
  field: {
    display: 'grid',
    gridTemplateColumns: '100px 1fr',
    gap: '0.5rem',
    padding: '0.25rem 0.75rem',
    alignItems: 'start',
  } as React.CSSProperties,
  
  fieldLabel: {
    color: 'var(--text-dim)',
    fontSize: '0.625rem',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,
  
  fieldValue: {
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.625rem',
    wordBreak: 'break-word',
  } as React.CSSProperties,
  
  loading: {
    padding: '1rem',
    textAlign: 'center',
    color: 'var(--text-dim)',
    fontStyle: 'italic',
  } as React.CSSProperties,
  
  error: {
    padding: '0.75rem',
    background: 'rgba(239, 68, 68, 0.1)',
    borderBottom: '1px solid rgba(239, 68, 68, 0.2)',
    color: 'var(--status-failed-fg, #ef4444)',
    fontSize: '0.625rem',
  } as React.CSSProperties,
  
  empty: {
    padding: '1rem',
    textAlign: 'center',
    color: 'var(--text-dim)',
    fontStyle: 'italic',
  } as React.CSSProperties,
}

// ============================================================================
// COMPONENT
// ============================================================================

export function MetadataPanel({
  metadata,
  loading = false,
  error = null,
  collapsed = false,
  onToggleCollapse,
}: MetadataPanelProps) {
  // Track which sections are collapsed
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set(['xmp']))
  
  const toggleSection = useCallback((sectionId: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev)
      if (next.has(sectionId)) {
        next.delete(sectionId)
      } else {
        next.add(sectionId)
      }
      return next
    })
  }, [])
  
  // Build sections from raw metadata
  const sections = useMemo(() => {
    if (!metadata) return []
    return buildMetadataSections(metadata)
  }, [metadata])
  
  return (
    <div 
      data-testid="metadata-panel"
      style={styles.container}
    >
      {/* Panel Header */}
      <div 
        style={styles.header}
        onClick={onToggleCollapse}
        title={collapsed ? 'Expand metadata panel' : 'Collapse metadata panel'}
      >
        <span style={styles.headerTitle}>Metadata</span>
        <span style={{
          ...styles.collapseIcon,
          transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
        }}>
          ▼
        </span>
      </div>
      
      {/* Panel Content */}
      {!collapsed && (
        <>
          {/* Loading State */}
          {loading && (
            <div style={styles.loading as React.CSSProperties}>
              Loading metadata…
            </div>
          )}
          
          {/* Error State */}
          {error && !loading && (
            <div style={styles.error}>
              {error}
            </div>
          )}
          
          {/* Empty State */}
          {!loading && !error && !metadata && (
            <div style={styles.empty as React.CSSProperties}>
              Select a source to view metadata
            </div>
          )}
          
          {/* Metadata Sections */}
          {!loading && !error && metadata && sections.length > 0 && (
            <div data-testid="metadata-sections">
              {sections.map(section => {
                const isCollapsed = collapsedSections.has(section.id)
                return (
                  <div key={section.id} style={styles.section}>
                    {/* Section Header */}
                    <div
                      style={styles.sectionHeader}
                      onClick={() => toggleSection(section.id)}
                    >
                      {section.icon && <span style={styles.sectionIcon}>{section.icon}</span>}
                      <span style={styles.sectionLabel}>{section.label}</span>
                      <span style={{
                        ...styles.sectionChevron,
                        transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                      }}>
                        ▼
                      </span>
                    </div>
                    
                    {/* Section Fields */}
                    {!isCollapsed && (
                      <div style={styles.fieldList}>
                        {section.fields.map(field => (
                          <div 
                            key={field.key} 
                            style={styles.field}
                            title={field.tooltip}
                          >
                            <span style={styles.fieldLabel}>{field.label}</span>
                            <span style={styles.fieldValue}>
                              {field.value ?? '—'}
                              {field.unit && field.value && ` ${field.unit}`}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default MetadataPanel
