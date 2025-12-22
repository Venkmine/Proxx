/**
 * VisualPreviewModal — Overlay Controls Drawer (Alpha)
 * 
 * ARCHITECTURE DECISION (2024-12-21):
 * This component is a CONTROL PANEL ONLY. It does NOT render its own preview.
 * The ONE authoritative preview renderer is VisualPreviewWorkspace (centre top).
 * 
 * SCOPE (Non-Negotiable):
 * - Control panels for burn-ins (text + timecode)
 * - Control panels for image overlays (watermarks)
 * - Preview tab shows overlay summary (informational only)
 * 
 * NOT IN SCOPE:
 * - Preview canvas (handled by VisualPreviewWorkspace)
 * - Codec, container, audio, naming, metadata, or preset configuration
 * - Job-creation logic
 * 
 * All changes made here update `deliverSettings.overlay` which is 
 * passed to VisualPreviewWorkspace for rendering.
 * 
 * Alpha limitation: UI-only, not yet wired to FFmpeg.
 */

import React, { useState, useRef, useEffect } from 'react'
import { Button } from './Button'
import { Select } from './Select'
import { 
  TEXT_BURNIN_TOKENS,
  SEPARATOR_TOKENS,
} from '../constants/tokens'
import type { 
  TextOverlay, 
  ImageOverlay, 
  OverlaySettings 
} from './DeliverControlPanel'
import type { TimecodeOverlay } from './PreviewViewport16x9'

// ============================================================================
// TYPES
// ============================================================================

interface VisualPreviewModalProps {
  /** Whether the modal is open */
  isOpen: boolean
  /** Callback to close the modal */
  onClose: () => void
  /** Current overlay settings */
  settings: OverlaySettings
  /** Callback when settings change */
  onChange: (settings: OverlaySettings) => void
  /** Source clip name for header display */
  sourceClipName?: string
  /** Whether controls are disabled */
  disabled?: boolean
}

type ActiveTab = 'overlay' | 'image'

// Timecode source options (Alpha)
type TimecodeSource = 'record' | 'source' | 'custom'

// ============================================================================
// CONSTANTS
// ============================================================================

const FONT_OPTIONS = [
  { value: 'Arial', label: 'Arial' },
  { value: 'Helvetica', label: 'Helvetica' },
  { value: 'Courier', label: 'Courier (Monospace)' },
  { value: 'Menlo', label: 'Menlo (Monospace)' },
  { value: 'Georgia', label: 'Georgia (Serif)' },
  { value: 'Times', label: 'Times New Roman' },
  { value: 'Impact', label: 'Impact' },
  { value: 'Futura', label: 'Futura' },
]

const SIZE_PRESETS = [
  { value: 12, label: 'Small (12pt)' },
  { value: 18, label: 'Medium (18pt)' },
  { value: 24, label: 'Large (24pt)' },
  { value: 32, label: 'Extra Large (32pt)' },
  { value: 48, label: 'Huge (48pt)' },
]

const POSITION_ANCHORS = [
  { value: 'top_left', label: 'Top Left' },
  { value: 'top_center', label: 'Top Center' },
  { value: 'top_right', label: 'Top Right' },
  { value: 'center_left', label: 'Center Left' },
  { value: 'center', label: 'Center' },
  { value: 'center_right', label: 'Center Right' },
  { value: 'bottom_left', label: 'Bottom Left' },
  { value: 'bottom_center', label: 'Bottom Center' },
  { value: 'bottom_right', label: 'Bottom Right' },
]

const TIMECODE_SOURCE_OPTIONS = [
  { value: 'record', label: 'Record TC' },
  { value: 'source', label: 'Source TC' },
  { value: 'custom', label: 'Custom TC' },
]

// ============================================================================
// COMPONENT
// ============================================================================

export function VisualPreviewModal({
  isOpen,
  onClose,
  settings,
  onChange,
  // sourceClipName is retained in props for future use but not displayed in drawer mode
  sourceClipName: _sourceClipName = 'No source selected',
  disabled = false,
}: VisualPreviewModalProps) {
  // Tab state
  const [activeTab, setActiveTab] = useState<ActiveTab>('overlay')
  
  // Text burn-in state
  const [selectedLayerIndex, setSelectedLayerIndex] = useState<number | null>(
    settings.text_layers.length > 0 ? 0 : null
  )
  
  // Timecode source state (Alpha: UI-only)
  const [timecodeSource, setTimecodeSource] = useState<TimecodeSource>('source')
  const [customTimecodeStart, setCustomTimecodeStart] = useState('01:00:00:00')
  
  // Image drag state
  const [isDraggingImage, setIsDraggingImage] = useState(false)
  
  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null)
  // NOTE: canvasRef removed — rendering is handled by VisualPreviewWorkspace

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Don't render if not open
  if (!isOpen) return null

  // ============================================
  // Text Layer Handlers
  // ============================================

  const addTextLayer = () => {
    const newLayer: TextOverlay = {
      text: '',
      position: 'bottom_left',
      font_size: 24,
      opacity: 1.0,
      enabled: true,
      x: 0,
      y: 0,
    }
    const newLayers = [...settings.text_layers, newLayer]
    onChange({ ...settings, text_layers: newLayers })
    setSelectedLayerIndex(newLayers.length - 1)
  }

  const updateTextLayer = (index: number, updates: Partial<TextOverlay>) => {
    const newLayers = [...settings.text_layers]
    newLayers[index] = { ...newLayers[index], ...updates }
    onChange({ ...settings, text_layers: newLayers })
  }

  const removeTextLayer = (index: number) => {
    const newLayers = settings.text_layers.filter((_, i) => i !== index)
    onChange({ ...settings, text_layers: newLayers })
    if (selectedLayerIndex === index) {
      setSelectedLayerIndex(newLayers.length > 0 ? Math.min(index, newLayers.length - 1) : null)
    } else if (selectedLayerIndex !== null && selectedLayerIndex > index) {
      setSelectedLayerIndex(selectedLayerIndex - 1)
    }
  }

  const insertToken = (token: string) => {
    if (selectedLayerIndex === null) return
    const layer = settings.text_layers[selectedLayerIndex]
    updateTextLayer(selectedLayerIndex, { text: layer.text + token })
  }

  // ============================================
  // Timecode Handlers
  // ============================================

  const currentTimecodeOverlay = settings.timecode_overlay || {
    enabled: false,
    position: 'bottom_left',
    font: 'Menlo',
    font_size: 24,
    opacity: 1.0,
    background: true,
    x: 0,
    y: 0,
  }

  const updateTimecodeOverlay = (updates: Partial<TimecodeOverlay>) => {
    onChange({
      ...settings,
      timecode_overlay: { ...currentTimecodeOverlay, ...updates },
    })
  }

  // ============================================
  // Image Overlay Handlers
  // ============================================

  const handleFileUpload = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result as string
      onChange({
        ...settings,
        image_watermark: {
          enabled: true,
          image_data: base64,
          image_name: file.name,
          x: 0.05,
          y: 0.05,
          opacity: 1.0,
          scale: 1.0,
          grayscale: false,
        } as ImageOverlay & { scale?: number; grayscale?: boolean },
      })
    }
    reader.readAsDataURL(file)
  }

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDraggingImage(false)
    
    const files = e.dataTransfer.files
    if (files.length > 0) {
      const file = files[0]
      const validTypes = ['image/png', 'image/jpeg', 'image/tiff']
      if (validTypes.includes(file.type) || file.name.match(/\.(png|jpg|jpeg|tiff|tif)$/i)) {
        handleFileUpload(file)
      }
    }
  }

  const updateImageOverlay = (updates: Partial<ImageOverlay & { scale?: number; grayscale?: boolean }>) => {
    if (!settings.image_watermark) return
    onChange({
      ...settings,
      image_watermark: { ...settings.image_watermark, ...updates } as ImageOverlay,
    })
  }

  const removeImageOverlay = () => {
    onChange({ ...settings, image_watermark: undefined })
  }

  const resetImagePosition = () => {
    if (!settings.image_watermark) return
    onChange({
      ...settings,
      image_watermark: { ...settings.image_watermark, x: 0.05, y: 0.05 },
    })
  }

  // NOTE: Canvas click handler removed — drag positioning is handled by VisualPreviewWorkspace

  // Extended types
  const extendedImageOverlay = settings.image_watermark as (ImageOverlay & { scale?: number; grayscale?: boolean }) | undefined

  // ============================================
  // Render — Right-side Control Drawer
  // NOTE: No canvas here. VisualPreviewWorkspace is the ONE preview renderer.
  // ============================================

  return (
    <>
      {/* Semi-transparent backdrop — click to close, but doesn't block main view */}
      <div
        data-testid="visual-preview-modal"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.4)',
          zIndex: 999,
        }}
        onClick={onClose}
      />
      
      {/* Right-side Control Drawer */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '360px',
          background: 'var(--card-bg-solid, rgba(16, 18, 20, 0.98))',
          borderLeft: '1px solid var(--border-primary)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '-8px 0 32px rgba(0, 0, 0, 0.4)',
          zIndex: 1000,
        }}
      >
        {/* ============================================ */}
        {/* Header */}
        {/* ============================================ */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.75rem 1rem',
            borderBottom: '1px solid var(--border-primary)',
            background: 'linear-gradient(180deg, rgba(26, 32, 44, 0.95) 0%, rgba(20, 24, 32, 0.95) 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <h2
              style={{
                margin: 0,
                fontSize: '0.875rem',
                fontWeight: 600,
                color: 'var(--text-primary)',
              }}
            >
              🎨 Overlay Controls
            </h2>
            <span
              style={{
                padding: '0.125rem 0.375rem',
                fontSize: '0.5625rem',
                fontWeight: 600,
                color: 'var(--text-dim)',
                background: 'rgba(251, 191, 36, 0.15)',
                border: '1px solid rgba(251, 191, 36, 0.3)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              Alpha
            </span>
          </div>
          <Button
            data-testid="visual-preview-close"
            variant="secondary"
            size="sm"
            onClick={onClose}
          >
            ✕
          </Button>
        </div>

        {/* Info banner — explains where to see preview */}
        <div
          style={{
            padding: '0.5rem 1rem',
            fontSize: '0.6875rem',
            color: 'var(--text-secondary)',
            background: 'rgba(59, 130, 246, 0.08)',
            borderBottom: '1px solid var(--border-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <span style={{ fontSize: '0.875rem' }}>👈</span>
          <span>
            Configure overlays here. See them rendered in the <strong>center preview</strong>.
            Drag to reposition directly on the preview.
          </span>
        </div>

        {/* ============================================ */}
        {/* Controls Panel (no canvas wrapper) */}
        {/* ============================================ */}

        {/* Tabs */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border-primary)',
          }}
        >
          {[
            { id: 'overlay' as const, label: 'Overlay' },
            { id: 'image' as const, label: 'Watermark' },
          ].map((tab) => (
            <button
              key={tab.id}
              data-testid={`tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1,
                padding: '0.75rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: activeTab === tab.id 
                  ? 'var(--text-primary)' 
                  : 'var(--text-secondary)',
                background: activeTab === tab.id 
                  ? 'rgba(59, 130, 246, 0.1)' 
                  : 'transparent',
                border: 'none',
                borderBottom: activeTab === tab.id 
                  ? '2px solid var(--button-primary-bg)' 
                  : '2px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '1rem',
          }}
        >
          {/* ============================================ */}
          {/* Overlay Tab */}
          {/* ============================================ */}
          {activeTab === 'overlay' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Timecode Section */}
              <div
                style={{
                  padding: '0.75rem',
                  background: 'rgba(51, 65, 85, 0.15)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-secondary)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: currentTimecodeOverlay.enabled ? '0.75rem' : 0,
                  }}
                >
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      data-testid="tc-enabled"
                      checked={currentTimecodeOverlay.enabled}
                      onChange={(e) => updateTimecodeOverlay({ enabled: e.target.checked })}
                      disabled={disabled}
                      style={{ accentColor: 'var(--button-primary-bg)' }}
                        />
                        Timecode Burn-In
                      </label>
                    </div>

                    {currentTimecodeOverlay.enabled && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {/* TC Source */}
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <label style={{ width: '70px', fontSize: '0.6875rem', color: 'var(--text-secondary)' }}>
                            Source
                          </label>
                          <Select
                            value={timecodeSource}
                            onChange={(val) => setTimecodeSource(val as TimecodeSource)}
                            options={TIMECODE_SOURCE_OPTIONS}
                            disabled={disabled}
                            size="sm"
                            style={{ flex: 1 }}
                          />
                        </div>

                        {/* Custom TC Start (only when custom) */}
                        {timecodeSource === 'custom' && (
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <label style={{ width: '70px', fontSize: '0.6875rem', color: 'var(--text-secondary)' }}>
                              Start
                            </label>
                            <input
                              type="text"
                              value={customTimecodeStart}
                              onChange={(e) => setCustomTimecodeStart(e.target.value)}
                              placeholder="01:00:00:00"
                              disabled={disabled}
                              style={{
                                flex: 1,
                                padding: '0.375rem 0.5rem',
                                fontSize: '0.75rem',
                                fontFamily: 'var(--font-mono)',
                                background: 'var(--input-bg)',
                                border: '1px solid var(--border-primary)',
                                borderRadius: 'var(--radius-sm)',
                                color: 'var(--text-primary)',
                              }}
                            />
                          </div>
                        )}

                        {/* Position */}
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <label style={{ width: '70px', fontSize: '0.6875rem', color: 'var(--text-secondary)' }}>
                            Position
                          </label>
                          <Select
                            value={currentTimecodeOverlay.position}
                            onChange={(val) => updateTimecodeOverlay({ position: val })}
                            options={POSITION_ANCHORS}
                            disabled={disabled}
                            size="sm"
                            style={{ flex: 1 }}
                          />
                        </div>

                        {/* Font */}
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <label style={{ width: '70px', fontSize: '0.6875rem', color: 'var(--text-secondary)' }}>
                            Font
                          </label>
                          <Select
                            value={currentTimecodeOverlay.font || 'Menlo'}
                            onChange={(val) => updateTimecodeOverlay({ font: val })}
                            options={FONT_OPTIONS}
                            disabled={disabled}
                            size="sm"
                            style={{ flex: 1 }}
                          />
                        </div>

                        {/* Size */}
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <label style={{ width: '70px', fontSize: '0.6875rem', color: 'var(--text-secondary)' }}>
                            Size
                          </label>
                          <Select
                            value={String(currentTimecodeOverlay.font_size)}
                            onChange={(val) => updateTimecodeOverlay({ font_size: parseInt(val) || 24 })}
                            options={SIZE_PRESETS.map(s => ({ value: String(s.value), label: s.label }))}
                            disabled={disabled}
                            size="sm"
                            style={{ flex: 1 }}
                          />
                        </div>

                        {/* Background */}
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.6875rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={currentTimecodeOverlay.background}
                            onChange={(e) => updateTimecodeOverlay({ background: e.target.checked })}
                            disabled={disabled}
                            style={{ accentColor: 'var(--button-primary-bg)' }}
                          />
                          Show background box
                        </label>

                        {/* Font Color */}
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <label style={{ width: '70px', fontSize: '0.6875rem', color: 'var(--text-secondary)' }}>
                            Font Color
                          </label>
                          <input
                            type="color"
                            value={currentTimecodeOverlay.color || '#FFFFFF'}
                            onChange={(e) => updateTimecodeOverlay({ color: e.target.value })}
                            disabled={disabled}
                            style={{
                              width: '40px',
                              height: '24px',
                              border: '1px solid var(--border-primary)',
                              borderRadius: 'var(--radius-sm)',
                              cursor: 'pointer',
                            }}
                          />
                          <input
                            type="text"
                            value={currentTimecodeOverlay.color || '#FFFFFF'}
                            onChange={(e) => updateTimecodeOverlay({ color: e.target.value })}
                            disabled={disabled}
                            style={{
                              flex: 1,
                              padding: '0.25rem 0.5rem',
                              fontSize: '0.625rem',
                              fontFamily: 'var(--font-mono)',
                              background: 'var(--input-bg)',
                              border: '1px solid var(--border-primary)',
                              borderRadius: 'var(--radius-sm)',
                              color: 'var(--text-primary)',
                            }}
                          />
                        </div>

                        {/* Background Color (when enabled) */}
                        {currentTimecodeOverlay.background && (
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginLeft: '1rem' }}>
                            <label style={{ width: '60px', fontSize: '0.6875rem', color: 'var(--text-secondary)' }}>
                              BG Color
                            </label>
                            <input
                              type="color"
                              value={currentTimecodeOverlay.background_color || '#000000'}
                              onChange={(e) => updateTimecodeOverlay({ background_color: e.target.value })}
                              disabled={disabled}
                              style={{
                                width: '40px',
                                height: '24px',
                                border: '1px solid var(--border-primary)',
                                borderRadius: 'var(--radius-sm)',
                                cursor: 'pointer',
                              }}
                            />
                          </div>
                        )}

                        {/* Text Opacity */}
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <label style={{ width: '70px', fontSize: '0.6875rem', color: 'var(--text-secondary)' }}>
                            Opacity
                          </label>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={currentTimecodeOverlay.opacity ?? 1.0}
                            onChange={(e) => updateTimecodeOverlay({ opacity: parseFloat(e.target.value) })}
                            disabled={disabled}
                            style={{ flex: 1 }}
                          />
                          <span style={{ width: '35px', fontSize: '0.625rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                            {Math.round((currentTimecodeOverlay.opacity ?? 1.0) * 100)}%
                          </span>
                        </div>

                        {/* Background Opacity (when enabled) */}
                        {currentTimecodeOverlay.background && (
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginLeft: '1rem' }}>
                            <label style={{ width: '60px', fontSize: '0.6875rem', color: 'var(--text-secondary)' }}>
                              BG Opacity
                            </label>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.05"
                              value={currentTimecodeOverlay.background_opacity ?? 0.7}
                              onChange={(e) => updateTimecodeOverlay({ background_opacity: parseFloat(e.target.value) })}
                              disabled={disabled}
                              style={{ flex: 1 }}
                            />
                            <span style={{ width: '35px', fontSize: '0.625rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                              {Math.round((currentTimecodeOverlay.background_opacity ?? 0.7) * 100)}%
                            </span>
                          </div>
                        )}

                        {/* Display During (First/Last Frames) - Resolve style */}
                        <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'rgba(51, 65, 85, 0.2)', borderRadius: 'var(--radius-sm)' }}>
                          <div style={{ fontSize: '0.625rem', color: 'var(--text-dim)', marginBottom: '0.375rem' }}>
                            Display During
                          </div>
                          <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <label style={{ fontSize: '0.625rem', color: 'var(--text-secondary)' }}>First</label>
                              <input
                                type="number"
                                min="0"
                                placeholder="—"
                                value={currentTimecodeOverlay.display_first_frames ?? ''}
                                onChange={(e) => updateTimecodeOverlay({ display_first_frames: e.target.value ? parseInt(e.target.value) : undefined })}
                                disabled={disabled}
                                style={{
                                  width: '50px',
                                  padding: '0.25rem',
                                  fontSize: '0.625rem',
                                  background: 'var(--input-bg)',
                                  border: '1px solid var(--border-primary)',
                                  borderRadius: 'var(--radius-sm)',
                                  color: 'var(--text-primary)',
                                  textAlign: 'center',
                                }}
                              />
                              <span style={{ fontSize: '0.5625rem', color: 'var(--text-dim)' }}>frames</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <label style={{ fontSize: '0.625rem', color: 'var(--text-secondary)' }}>Last</label>
                              <input
                                type="number"
                                min="0"
                                placeholder="—"
                                value={currentTimecodeOverlay.display_last_frames ?? ''}
                                onChange={(e) => updateTimecodeOverlay({ display_last_frames: e.target.value ? parseInt(e.target.value) : undefined })}
                                disabled={disabled}
                                style={{
                                  width: '50px',
                                  padding: '0.25rem',
                                  fontSize: '0.625rem',
                                  background: 'var(--input-bg)',
                                  border: '1px solid var(--border-primary)',
                                  borderRadius: 'var(--radius-sm)',
                                  color: 'var(--text-primary)',
                                  textAlign: 'center',
                                }}
                              />
                              <span style={{ fontSize: '0.5625rem', color: 'var(--text-dim)' }}>frames</span>
                            </div>
                          </div>
                        </div>

                        {/* Alpha: Advanced options (disabled) */}
                        <div
                          style={{
                            marginTop: '0.5rem',
                            padding: '0.5rem',
                            background: 'rgba(251, 191, 36, 0.05)',
                            border: '1px dashed rgba(251, 191, 36, 0.2)',
                            borderRadius: 'var(--radius-sm)',
                          }}
                        >
                          <div style={{ fontSize: '0.625rem', color: 'var(--text-dim)', marginBottom: '0.375rem' }}>
                            Advanced Options (Alpha)
                          </div>
                          <label 
                            style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '0.5rem', 
                              fontSize: '0.6875rem', 
                              color: 'var(--text-dim)',
                              cursor: 'not-allowed',
                              opacity: 0.5,
                            }}
                            title="Alpha limitation: Requires backend implementation"
                          >
                            <input
                              type="checkbox"
                              disabled
                              style={{ accentColor: 'var(--button-primary-bg)' }}
                            />
                            Reset per reel
                            {/* Alpha limitation: UI-only, not yet wired to FFmpeg */}
                          </label>
                          <label 
                            style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '0.5rem', 
                              fontSize: '0.6875rem', 
                              color: 'var(--text-dim)',
                              cursor: 'not-allowed',
                              opacity: 0.5,
                              marginTop: '0.25rem',
                            }}
                            title="Alpha limitation: Requires backend implementation"
                          >
                            <input
                              type="checkbox"
                              disabled
                              style={{ accentColor: 'var(--button-primary-bg)' }}
                            />
                            Frame rate override
                            {/* Alpha limitation: UI-only, not yet wired to FFmpeg */}
                          </label>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Text Layers Section */}
                  <div
                    style={{
                      padding: '0.75rem',
                      background: 'rgba(51, 65, 85, 0.15)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-secondary)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '0.75rem',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '0.8125rem',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                        }}
                      >
                        Text Layers
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={addTextLayer}
                        disabled={disabled}
                        data-testid="add-text-layer"
                      >
                        + Add
                      </Button>
                    </div>

                    {/* Layer List */}
                    {settings.text_layers.length === 0 ? (
                      <div
                        style={{
                          padding: '1rem',
                          textAlign: 'center',
                          fontSize: '0.6875rem',
                          color: 'var(--text-dim)',
                        }}
                      >
                        No text layers. Click "Add" to create one.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {settings.text_layers.map((layer, index) => (
                          <div
                            key={index}
                            data-testid={`text-layer-control-${index}`}
                            onClick={() => setSelectedLayerIndex(index)}
                            style={{
                              padding: '0.5rem',
                              background: selectedLayerIndex === index 
                                ? 'rgba(59, 130, 246, 0.15)' 
                                : 'rgba(51, 65, 85, 0.2)',
                              border: selectedLayerIndex === index 
                                ? '1px solid rgba(59, 130, 246, 0.4)' 
                                : '1px solid transparent',
                              borderRadius: 'var(--radius-sm)',
                              cursor: 'pointer',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
                              <input
                                type="checkbox"
                                checked={layer.enabled}
                                onChange={(e) => {
                                  e.stopPropagation()
                                  updateTextLayer(index, { enabled: e.target.checked })
                                }}
                                disabled={disabled}
                                style={{ accentColor: 'var(--button-primary-bg)' }}
                              />
                              <span
                                style={{
                                  flex: 1,
                                  fontSize: '0.6875rem',
                                  color: layer.enabled ? 'var(--text-primary)' : 'var(--text-dim)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {layer.text || `Layer ${index + 1}`}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  removeTextLayer(index)
                                }}
                                disabled={disabled}
                                style={{
                                  padding: '0.125rem 0.25rem',
                                  fontSize: '0.625rem',
                                  background: 'transparent',
                                  border: '1px solid rgba(239, 68, 68, 0.3)',
                                  borderRadius: 'var(--radius-sm)',
                                  color: 'var(--status-failed-fg)',
                                  cursor: 'pointer',
                                }}
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Selected Layer Controls */}
                    {selectedLayerIndex !== null && settings.text_layers[selectedLayerIndex] && (
                      <div
                        style={{
                          marginTop: '0.75rem',
                          padding: '0.75rem',
                          background: 'rgba(51, 65, 85, 0.2)',
                          borderRadius: 'var(--radius-sm)',
                        }}
                      >
                        {/* Text Input */}
                        <div style={{ marginBottom: '0.5rem' }}>
                          <label style={{ fontSize: '0.6875rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>
                            Text Content
                          </label>
                          <input
                            type="text"
                            data-testid="text-layer-input"
                            value={settings.text_layers[selectedLayerIndex].text}
                            onChange={(e) => updateTextLayer(selectedLayerIndex, { text: e.target.value })}
                            placeholder="Enter text or insert tokens..."
                            disabled={disabled}
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
                        </div>

                        {/* Token Buttons */}
                        <div style={{ marginBottom: '0.5rem' }}>
                          <label style={{ fontSize: '0.625rem', color: 'var(--text-dim)', display: 'block', marginBottom: '0.25rem' }}>
                            Insert Token
                          </label>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                            {TEXT_BURNIN_TOKENS.map((t) => (
                              <button
                                key={t.id}
                                onClick={() => insertToken(t.token)}
                                disabled={disabled}
                                title={t.description}
                                style={{
                                  padding: '0.25rem 0.375rem',
                                  fontSize: '0.625rem',
                                  background: 'rgba(59, 130, 246, 0.1)',
                                  border: '1px solid rgba(59, 130, 246, 0.3)',
                                  borderRadius: 'var(--radius-sm)',
                                  color: 'var(--button-primary-bg)',
                                  cursor: 'pointer',
                                }}
                              >
                                {t.label}
                              </button>
                            ))}
                          </div>
                          {/* Separator Tokens */}
                          <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.375rem' }}>
                            <span style={{ fontSize: '0.5625rem', color: 'var(--text-dim)', marginRight: '0.25rem', lineHeight: '1.6' }}>Separators:</span>
                            {SEPARATOR_TOKENS.map((s) => (
                              <button
                                key={s.id}
                                onClick={() => insertToken(s.token)}
                                disabled={disabled}
                                title={s.description}
                                style={{
                                  padding: '0.25rem 0.5rem',
                                  fontSize: '0.75rem',
                                  fontWeight: 600,
                                  fontFamily: 'var(--font-mono)',
                                  background: 'rgba(100, 116, 139, 0.15)',
                                  border: '1px solid rgba(100, 116, 139, 0.3)',
                                  borderRadius: 'var(--radius-sm)',
                                  color: 'var(--text-secondary)',
                                  cursor: 'pointer',
                                  minWidth: '28px',
                                }}
                              >
                                {s.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Font Family */}
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.375rem' }}>
                          <label style={{ width: '50px', fontSize: '0.6875rem', color: 'var(--text-secondary)' }}>
                            Font
                          </label>
                          <Select
                            value={settings.text_layers[selectedLayerIndex].font || 'Arial'}
                            onChange={(val) => updateTextLayer(selectedLayerIndex, { font: val })}
                            options={FONT_OPTIONS}
                            disabled={disabled}
                            size="sm"
                            style={{ flex: 1 }}
                          />
                        </div>

                        {/* Position */}
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.375rem' }}>
                          <label style={{ width: '50px', fontSize: '0.6875rem', color: 'var(--text-secondary)' }}>
                            Position
                          </label>
                          <Select
                            value={settings.text_layers[selectedLayerIndex].position}
                            onChange={(val) => updateTextLayer(selectedLayerIndex, { position: val })}
                            options={POSITION_ANCHORS}
                            disabled={disabled}
                            size="sm"
                            style={{ flex: 1 }}
                          />
                        </div>

                        {/* Size */}
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.375rem' }}>
                          <label style={{ width: '50px', fontSize: '0.6875rem', color: 'var(--text-secondary)' }}>
                            Size
                          </label>
                          <Select
                            value={String(settings.text_layers[selectedLayerIndex].font_size)}
                            onChange={(val) => updateTextLayer(selectedLayerIndex, { font_size: parseInt(val) || 24 })}
                            options={SIZE_PRESETS.map(s => ({ value: String(s.value), label: s.label }))}
                            disabled={disabled}
                            size="sm"
                            style={{ flex: 1 }}
                          />
                        </div>

                        {/* Text Color */}
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.375rem' }}>
                          <label style={{ width: '50px', fontSize: '0.6875rem', color: 'var(--text-secondary)' }}>
                            Color
                          </label>
                          <input
                            type="color"
                            value={settings.text_layers[selectedLayerIndex].color || '#FFFFFF'}
                            onChange={(e) => updateTextLayer(selectedLayerIndex, { color: e.target.value })}
                            disabled={disabled}
                            style={{
                              width: '40px',
                              height: '28px',
                              border: '1px solid var(--border-primary)',
                              borderRadius: 'var(--radius-sm)',
                              cursor: 'pointer',
                            }}
                          />
                          <input
                            type="text"
                            value={settings.text_layers[selectedLayerIndex].color || '#FFFFFF'}
                            onChange={(e) => updateTextLayer(selectedLayerIndex, { color: e.target.value })}
                            disabled={disabled}
                            placeholder="#FFFFFF"
                            style={{
                              flex: 1,
                              padding: '0.25rem 0.5rem',
                              fontSize: '0.6875rem',
                              fontFamily: 'var(--font-mono)',
                              background: 'var(--input-bg)',
                              border: '1px solid var(--border-primary)',
                              borderRadius: 'var(--radius-sm)',
                              color: 'var(--text-primary)',
                            }}
                          />
                        </div>

                        {/* Background Box */}
                        <div style={{ marginBottom: '0.375rem' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.6875rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={settings.text_layers[selectedLayerIndex].background || false}
                              onChange={(e) => updateTextLayer(selectedLayerIndex, { background: e.target.checked })}
                              disabled={disabled}
                              style={{ accentColor: 'var(--button-primary-bg)' }}
                            />
                            Show background box
                          </label>
                        </div>

                        {/* Background Color (if enabled) */}
                        {settings.text_layers[selectedLayerIndex].background && (
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.375rem', marginLeft: '1.5rem' }}>
                            <label style={{ width: '50px', fontSize: '0.6875rem', color: 'var(--text-secondary)' }}>
                              BG Color
                            </label>
                            <input
                              type="color"
                              value={settings.text_layers[selectedLayerIndex].background_color || '#000000'}
                              onChange={(e) => updateTextLayer(selectedLayerIndex, { background_color: e.target.value })}
                              disabled={disabled}
                              style={{
                                width: '40px',
                                height: '28px',
                                border: '1px solid var(--border-primary)',
                                borderRadius: 'var(--radius-sm)',
                                cursor: 'pointer',
                              }}
                            />
                            <input
                              type="text"
                              value={settings.text_layers[selectedLayerIndex].background_color || '#000000'}
                              onChange={(e) => updateTextLayer(selectedLayerIndex, { background_color: e.target.value })}
                              disabled={disabled}
                              placeholder="#000000"
                              style={{
                                flex: 1,
                                padding: '0.25rem 0.5rem',
                                fontSize: '0.6875rem',
                                fontFamily: 'var(--font-mono)',
                                background: 'var(--input-bg)',
                                border: '1px solid var(--border-primary)',
                                borderRadius: 'var(--radius-sm)',
                                color: 'var(--text-primary)',
                              }}
                            />
                          </div>
                        )}

                        {/* Opacity */}
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <label style={{ width: '50px', fontSize: '0.6875rem', color: 'var(--text-secondary)' }}>
                            Opacity
                          </label>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={settings.text_layers[selectedLayerIndex].opacity}
                            onChange={(e) => updateTextLayer(selectedLayerIndex, { opacity: parseFloat(e.target.value) })}
                            disabled={disabled}
                            style={{ flex: 1 }}
                          />
                          <span style={{ width: '35px', fontSize: '0.625rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                            {Math.round(settings.text_layers[selectedLayerIndex].opacity * 100)}%
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ============================================ */}
              {/* Image Tab */}
              {/* ============================================ */}
              {activeTab === 'image' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {/* Upload Zone (when no overlay) */}
                  {!extendedImageOverlay && (
                    <div
                      data-testid="image-upload-zone"
                      onDragOver={(e) => { e.preventDefault(); setIsDraggingImage(true) }}
                      onDragLeave={(e) => { e.preventDefault(); setIsDraggingImage(false) }}
                      onDrop={handleFileDrop}
                      onClick={() => !disabled && fileInputRef.current?.click()}
                      style={{
                        padding: '2rem',
                        border: isDraggingImage 
                          ? '2px dashed var(--button-primary-bg)' 
                          : '2px dashed var(--border-primary)',
                        borderRadius: 'var(--radius-sm)',
                        background: isDraggingImage 
                          ? 'rgba(59, 130, 246, 0.1)' 
                          : 'rgba(51, 65, 85, 0.1)',
                        textAlign: 'center',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      <div style={{ fontSize: '2rem', marginBottom: '0.5rem', opacity: 0.5 }}>🖼️</div>
                      <div style={{ fontSize: '0.8125rem', color: isDraggingImage ? 'var(--button-primary-bg)' : 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                        {isDraggingImage ? 'Drop image here' : 'Drag & drop image here'}
                      </div>
                      <div style={{ fontSize: '0.6875rem', color: 'var(--text-dim)' }}>
                        or click to browse • PNG, JPG, TIFF
                      </div>
                    </div>
                  )}

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".png,.jpg,.jpeg,.tiff,.tif"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleFileUpload(file)
                      e.target.value = ''
                    }}
                    style={{ display: 'none' }}
                  />

                  {/* Image Controls */}
                  {extendedImageOverlay && (
                    <div
                      style={{
                        padding: '0.75rem',
                        background: 'rgba(51, 65, 85, 0.15)',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-secondary)',
                      }}
                    >
                      {/* Header */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={extendedImageOverlay.enabled}
                            onChange={(e) => updateImageOverlay({ enabled: e.target.checked })}
                            disabled={disabled}
                            style={{ accentColor: 'var(--button-primary-bg)' }}
                          />
                          Enable Overlay
                        </label>
                        <button
                          onClick={removeImageOverlay}
                          disabled={disabled}
                          style={{
                            padding: '0.25rem 0.5rem',
                            fontSize: '0.625rem',
                            background: 'transparent',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--status-failed-fg)',
                            cursor: 'pointer',
                          }}
                        >
                          Remove
                        </button>
                      </div>

                      {/* Filename */}
                      <div style={{ marginBottom: '0.75rem', padding: '0.375rem 0.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-sm)' }}>
                        <span style={{ fontSize: '0.6875rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                          {extendedImageOverlay.image_name}
                        </span>
                      </div>

                      {/* Scale */}
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <label style={{ width: '70px', fontSize: '0.6875rem', color: 'var(--text-secondary)' }}>Scale</label>
                        <input
                          type="range"
                          min="0.25"
                          max="2"
                          step="0.05"
                          value={extendedImageOverlay.scale || 1}
                          onChange={(e) => updateImageOverlay({ scale: parseFloat(e.target.value) })}
                          disabled={disabled}
                          style={{ flex: 1 }}
                        />
                        <span style={{ width: '40px', fontSize: '0.6875rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                          {Math.round((extendedImageOverlay.scale || 1) * 100)}%
                        </span>
                      </div>

                      {/* Opacity */}
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <label style={{ width: '70px', fontSize: '0.6875rem', color: 'var(--text-secondary)' }}>Opacity</label>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={extendedImageOverlay.opacity}
                          onChange={(e) => updateImageOverlay({ opacity: parseFloat(e.target.value) })}
                          disabled={disabled}
                          style={{ flex: 1 }}
                        />
                        <span style={{ width: '40px', fontSize: '0.6875rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                          {Math.round(extendedImageOverlay.opacity * 100)}%
                        </span>
                      </div>

                      {/* B&W Toggle */}
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.6875rem', color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: '0.5rem' }}>
                        <input
                          type="checkbox"
                          checked={extendedImageOverlay.grayscale || false}
                          onChange={(e) => updateImageOverlay({ grayscale: e.target.checked })}
                          disabled={disabled}
                          style={{ accentColor: 'var(--button-primary-bg)' }}
                        />
                        Black & White
                      </label>

                      {/* Position Display */}
                      <div style={{ marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.625rem', color: 'var(--text-dim)' }}>
                          Position: X={extendedImageOverlay.x.toFixed(2)}, Y={extendedImageOverlay.y.toFixed(2)}
                        </span>
                      </div>

                      {/* Reset & Change buttons */}
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={resetImagePosition}
                          disabled={disabled}
                        >
                          Reset Position
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={disabled}
                        >
                          Change Image
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
        </div>
      </>
    )
  }

export default VisualPreviewModal