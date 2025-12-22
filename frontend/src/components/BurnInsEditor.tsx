/**
 * BurnInsEditor — Unified Burn-Ins Editor (Centre Panel Takeover)
 * 
 * ⚠️ ALPHA LIMITATION:
 * Burn-in execution not yet wired to FFmpeg.
 * UI-only for Alpha — settings are saved to job payload.
 * 
 * This component combines text and image overlays into a single spatial editor
 * that temporarily takes over the centre panel. Features:
 * - Static 16:9 preview canvas
 * - Drag positioning for overlays
 * - Text layer controls (font, size, position, opacity, tokens)
 * - Image overlay controls (drag-drop upload, scale, opacity, grayscale)
 * - Title/Action safe guides
 * - Exit returns to Preset Editor with state preserved
 */

import React, { useState, useRef } from 'react'
import { Button } from './Button'
import { Select } from './Select'
import type { TextOverlay, ImageOverlay, OverlaySettings } from './DeliverControlPanel'

// ============================================================================
// TYPES
// ============================================================================

interface BurnInsEditorProps {
  settings: OverlaySettings
  onChange: (settings: OverlaySettings) => void
  onClose: () => void
  disabled?: boolean
}

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

const TEXT_TOKENS = [
  { token: '{source_name}', label: 'Filename', description: 'Original filename' },
  { token: '{reel}', label: 'Reel', description: 'Reel name' },
  { token: '{timecode}', label: 'Timecode', description: 'Source TC' },
  { token: '{date}', label: 'Date', description: 'Current date' },
  { token: '{frame}', label: 'Frame', description: 'Frame number' },
  { token: '{fps}', label: 'FPS', description: 'Frame rate' },
]

// ============================================================================
// HELPER: Get anchor position in canvas coordinates
// ============================================================================

function getAnchorPosition(anchor: string): { x: number; y: number } {
  const positions: Record<string, { x: number; y: number }> = {
    'top_left': { x: 0.1, y: 0.1 },
    'top_center': { x: 0.5, y: 0.1 },
    'top_right': { x: 0.9, y: 0.1 },
    'center_left': { x: 0.1, y: 0.5 },
    'center': { x: 0.5, y: 0.5 },
    'center_right': { x: 0.9, y: 0.5 },
    'bottom_left': { x: 0.1, y: 0.9 },
    'bottom_center': { x: 0.5, y: 0.9 },
    'bottom_right': { x: 0.9, y: 0.9 },
  }
  return positions[anchor] || { x: 0.5, y: 0.5 }
}

// ============================================================================
// COMPONENT
// ============================================================================

export function BurnInsEditor({
  settings,
  onChange,
  onClose,
  disabled = false,
}: BurnInsEditorProps) {
  const [activeTab, setActiveTab] = useState<'text' | 'image'>('text')
  const [selectedLayerIndex, setSelectedLayerIndex] = useState<number | null>(
    settings.text_layers.length > 0 ? 0 : null
  )
  const [isDraggingImage, setIsDraggingImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)

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

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (disabled || !canvasRef.current) return
    
    const rect = canvasRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
    
    // If image tab is active and we have an image, update its position
    if (activeTab === 'image' && settings.image_watermark) {
      updateImageOverlay({ x, y })
    }
  }

  const extendedImageOverlay = settings.image_watermark as (ImageOverlay & { scale?: number; grayscale?: boolean }) | undefined

  // ============================================
  // Render
  // ============================================

  return (
    <div
      data-testid="burnins-editor"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: 'var(--card-bg-solid, rgba(16, 18, 20, 0.98))',
      }}
    >
      {/* Header */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <h2
            style={{
              margin: 0,
              fontSize: '0.9375rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}
          >
            Burn-Ins Editor
          </h2>
          <span
            style={{
              padding: '0.125rem 0.375rem',
              fontSize: '0.625rem',
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
          data-testid="burnins-editor-close"
          variant="secondary"
          size="sm"
          onClick={onClose}
        >
          ← Back to Settings
        </Button>
      </div>

      {/* Main Content */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          overflow: 'hidden',
        }}
      >
        {/* Left: Preview Canvas Container */}
        {/* 
          LAYOUT RULE: Preview canvas must maintain 16:9 aspect ratio.
          Height is derived from width, NOT stretched to fill vertical space.
          The canvas is a viewport, not a form field.
        */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start',
            padding: '1rem',
            overflow: 'auto',
          }}
        >
          {/* Preview canvas wrapper — constrains maximum size */}
          <div
            style={{
              width: '100%',
              maxWidth: '960px',  // Maximum canvas width
              flexShrink: 0,     // Do not shrink below aspect ratio
            }}
          >
            <div
              ref={canvasRef}
              data-testid="burnins-preview-canvas"
              onClick={handleCanvasClick}
              style={{
                width: '100%',
                aspectRatio: '16 / 9',
                backgroundColor: '#1a1a2e',
                border: '2px solid var(--border-primary)',
                borderRadius: 'var(--radius-sm)',
                position: 'relative',
                overflow: 'hidden',
                cursor: disabled ? 'default' : 'crosshair',
              }}
            >
            {/* Grid lines */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundImage:
                  'linear-gradient(to right, rgba(59, 130, 246, 0.1) 1px, transparent 1px), linear-gradient(to bottom, rgba(59, 130, 246, 0.1) 1px, transparent 1px)',
                backgroundSize: '10% 10%',
              }}
            />

            {/* Title Safe (10%) */}
            <div
              style={{
                position: 'absolute',
                top: '10%',
                left: '10%',
                right: '10%',
                bottom: '10%',
                border: '1px dashed rgba(251, 191, 36, 0.5)',
                pointerEvents: 'none',
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: '10%',
                left: '10%',
                fontSize: '0.5rem',
                color: 'rgba(251, 191, 36, 0.7)',
                fontFamily: 'var(--font-mono)',
                transform: 'translateY(-100%)',
                padding: '0 0.25rem',
              }}
            >
              TITLE SAFE
            </div>

            {/* Action Safe (5%) */}
            <div
              style={{
                position: 'absolute',
                top: '5%',
                left: '5%',
                right: '5%',
                bottom: '5%',
                border: '1px dashed rgba(59, 130, 246, 0.4)',
                pointerEvents: 'none',
              }}
            />

            {/* Center crosshair */}
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '45%',
                bottom: '45%',
                width: '1px',
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '45%',
                right: '45%',
                height: '1px',
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
              }}
            />

            {/* Render text layers */}
            {settings.text_layers.map((layer, index) => {
              if (!layer.enabled) return null
              const pos = getAnchorPosition(layer.position)
              return (
                <div
                  key={index}
                  data-testid={`burnin-text-preview-${index}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setActiveTab('text')
                    setSelectedLayerIndex(index)
                  }}
                  style={{
                    position: 'absolute',
                    left: `calc(${pos.x * 100}% + ${layer.x || 0}px)`,
                    top: `calc(${pos.y * 100}% + ${layer.y || 0}px)`,
                    transform: 'translate(-50%, -50%)',
                    padding: '0.25rem 0.5rem',
                    backgroundColor: (layer as any).background ? 'rgba(0, 0, 0, 0.6)' : 'transparent',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: `${layer.font_size * 0.4}px`,
                    fontFamily: (layer as any).font || 'Arial',
                    color: 'white',
                    opacity: layer.opacity,
                    cursor: 'pointer',
                    border: selectedLayerIndex === index ? '2px solid var(--button-primary-bg)' : '2px solid transparent',
                    whiteSpace: 'nowrap',
                    textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                    pointerEvents: 'auto',
                  }}
                >
                  {layer.text || `Text ${index + 1}`}
                </div>
              )
            })}

            {/* Render image overlay */}
            {settings.image_watermark?.enabled && settings.image_watermark.image_data && (
              <div
                data-testid="burnin-image-preview"
                onClick={(e) => {
                  e.stopPropagation()
                  setActiveTab('image')
                }}
                style={{
                  position: 'absolute',
                  left: `${settings.image_watermark.x * 100}%`,
                  top: `${settings.image_watermark.y * 100}%`,
                  transform: 'translate(-50%, -50%)',
                  cursor: 'pointer',
                  border: activeTab === 'image' ? '2px solid var(--button-primary-bg)' : '2px solid transparent',
                  borderRadius: 'var(--radius-sm)',
                  padding: '2px',
                }}
              >
                <img
                  src={settings.image_watermark.image_data}
                  alt=""
                  style={{
                    maxWidth: `${(extendedImageOverlay?.scale || 1.0) * 80}px`,
                    maxHeight: `${(extendedImageOverlay?.scale || 1.0) * 60}px`,
                    opacity: settings.image_watermark.opacity,
                    filter: extendedImageOverlay?.grayscale ? 'grayscale(100%)' : 'none',
                    borderRadius: '2px',
                    pointerEvents: 'none',
                  }}
                />
              </div>
            )}

            {/* Empty state */}
            {settings.text_layers.length === 0 && !settings.image_watermark && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-dim)',
                  fontSize: '0.875rem',
                }}
              >
                Add text or image overlays to preview
              </div>
            )}
          </div>
          </div>

          {/* Guide legend */}
          <div
            style={{
              display: 'flex',
              gap: '1rem',
              marginTop: '0.5rem',
              fontSize: '0.625rem',
              color: 'var(--text-dim)',
              fontFamily: 'var(--font-mono)',
              maxWidth: '960px',
              width: '100%',
            }}
          >
            <span>
              <span style={{ color: 'rgba(251, 191, 36, 0.7)' }}>━</span> Title Safe (10%)
            </span>
            <span>
              <span style={{ color: 'rgba(59, 130, 246, 0.7)' }}>━</span> Action Safe (5%)
            </span>
          </div>
        </div>

        {/* Right: Controls */}
        <div
          style={{
            width: '320px',
            minWidth: '280px',
            borderLeft: '1px solid var(--border-primary)',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'rgba(20, 24, 32, 0.95)',
          }}
        >
          {/* Tab buttons */}
          <div
            style={{
              display: 'flex',
              borderBottom: '1px solid var(--border-primary)',
            }}
          >
            <button
              data-testid="burnins-tab-text"
              onClick={() => setActiveTab('text')}
              style={{
                flex: 1,
                padding: '0.75rem',
                background: activeTab === 'text' ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                border: 'none',
                borderBottom: activeTab === 'text' ? '2px solid var(--button-primary-bg)' : '2px solid transparent',
                color: activeTab === 'text' ? 'var(--button-primary-bg)' : 'var(--text-muted)',
                fontSize: '0.8125rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Text ({settings.text_layers.length})
            </button>
            <button
              data-testid="burnins-tab-image"
              onClick={() => setActiveTab('image')}
              style={{
                flex: 1,
                padding: '0.75rem',
                background: activeTab === 'image' ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                border: 'none',
                borderBottom: activeTab === 'image' ? '2px solid var(--button-primary-bg)' : '2px solid transparent',
                color: activeTab === 'image' ? 'var(--button-primary-bg)' : 'var(--text-muted)',
                fontSize: '0.8125rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Image {settings.image_watermark ? '✓' : ''}
            </button>
          </div>

          {/* Tab content */}
          <div
            style={{
              flex: 1,
              overflow: 'auto',
              padding: '0.75rem',
            }}
          >
            {activeTab === 'text' && (
              <div data-testid="burnins-text-controls">
                {/* Add layer button */}
                <Button
                  data-testid="burnins-add-text"
                  variant="secondary"
                  size="sm"
                  onClick={addTextLayer}
                  disabled={disabled}
                  style={{ width: '100%', marginBottom: '0.75rem' }}
                >
                  + Add Text Layer
                </Button>

                {/* Layer list */}
                {settings.text_layers.map((layer, index) => (
                  <div
                    key={index}
                    data-testid={`burnins-text-layer-${index}`}
                    onClick={() => setSelectedLayerIndex(index)}
                    style={{
                      padding: '0.5rem',
                      marginBottom: '0.5rem',
                      border: selectedLayerIndex === index
                        ? '1px solid var(--button-primary-bg)'
                        : '1px solid var(--border-primary)',
                      borderRadius: 'var(--radius-sm)',
                      background: selectedLayerIndex === index
                        ? 'rgba(59, 130, 246, 0.1)'
                        : 'rgba(51, 65, 85, 0.1)',
                      cursor: 'pointer',
                      opacity: layer.enabled ? 1 : 0.5,
                    }}
                  >
                    {/* Header row */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        marginBottom: selectedLayerIndex === index ? '0.5rem' : 0,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={layer.enabled}
                        onChange={(e) => {
                          e.stopPropagation()
                          updateTextLayer(index, { enabled: !layer.enabled })
                        }}
                        disabled={disabled}
                        style={{ accentColor: 'var(--button-primary-bg)' }}
                      />
                      <span
                        style={{
                          flex: 1,
                          fontSize: '0.75rem',
                          fontWeight: 500,
                          color: 'var(--text-secondary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {layer.text || `Text Layer ${index + 1}`}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          removeTextLayer(index)
                        }}
                        disabled={disabled}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-dim)',
                          cursor: disabled ? 'not-allowed' : 'pointer',
                          fontSize: '0.875rem',
                        }}
                        title="Remove layer"
                      >
                        ×
                      </button>
                    </div>

                    {/* Expanded controls */}
                    {selectedLayerIndex === index && (
                      <div onClick={(e) => e.stopPropagation()}>
                        {/* Text input */}
                        <div style={{ marginBottom: '0.5rem' }}>
                          <label
                            style={{
                              display: 'block',
                              fontSize: '0.625rem',
                              color: 'var(--text-dim)',
                              marginBottom: '0.25rem',
                            }}
                          >
                            Text Content
                          </label>
                          <input
                            type="text"
                            data-testid={`burnins-text-input-${index}`}
                            value={layer.text}
                            onChange={(e) => updateTextLayer(index, { text: e.target.value })}
                            disabled={disabled}
                            placeholder="Enter text or use tokens..."
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
                          {/* Token buttons */}
                          <div
                            style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: '0.25rem',
                              marginTop: '0.25rem',
                            }}
                          >
                            {TEXT_TOKENS.map((t) => (
                              <button
                                key={t.token}
                                onClick={() => insertToken(t.token)}
                                disabled={disabled}
                                title={t.description}
                                style={{
                                  padding: '0.125rem 0.25rem',
                                  fontSize: '0.5625rem',
                                  fontFamily: 'var(--font-mono)',
                                  background: 'rgba(59, 130, 246, 0.1)',
                                  border: '1px solid rgba(59, 130, 246, 0.2)',
                                  borderRadius: 'var(--radius-sm)',
                                  color: 'var(--button-primary-bg)',
                                  cursor: disabled ? 'not-allowed' : 'pointer',
                                }}
                              >
                                {t.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Font and Size */}
                        <div
                          style={{
                            display: 'flex',
                            gap: '0.5rem',
                            marginBottom: '0.5rem',
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <label
                              style={{
                                display: 'block',
                                fontSize: '0.625rem',
                                color: 'var(--text-dim)',
                                marginBottom: '0.25rem',
                              }}
                            >
                              Font
                            </label>
                            <Select
                              value={(layer as any).font || 'Arial'}
                              onChange={(v) => updateTextLayer(index, { ...layer, font: v } as any)}
                              options={FONT_OPTIONS}
                              disabled={disabled}
                              fullWidth
                            />
                          </div>
                          <div style={{ width: '80px' }}>
                            <label
                              style={{
                                display: 'block',
                                fontSize: '0.625rem',
                                color: 'var(--text-dim)',
                                marginBottom: '0.25rem',
                              }}
                            >
                              Size
                            </label>
                            <Select
                              value={String(layer.font_size)}
                              onChange={(v) => updateTextLayer(index, { font_size: parseInt(v) })}
                              options={SIZE_PRESETS.map((p) => ({
                                value: String(p.value),
                                label: String(p.value),
                              }))}
                              disabled={disabled}
                              fullWidth
                            />
                          </div>
                        </div>

                        {/* Position */}
                        <div style={{ marginBottom: '0.5rem' }}>
                          <label
                            style={{
                              display: 'block',
                              fontSize: '0.625rem',
                              color: 'var(--text-dim)',
                              marginBottom: '0.25rem',
                            }}
                          >
                            Anchor
                          </label>
                          <Select
                            value={layer.position}
                            onChange={(v) => updateTextLayer(index, { position: v })}
                            options={POSITION_ANCHORS}
                            disabled={disabled}
                            fullWidth
                          />
                        </div>

                        {/* Opacity */}
                        <div style={{ marginBottom: '0.5rem' }}>
                          <label
                            style={{
                              display: 'block',
                              fontSize: '0.625rem',
                              color: 'var(--text-dim)',
                              marginBottom: '0.25rem',
                            }}
                          >
                            Opacity
                          </label>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                            }}
                          >
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.1"
                              value={layer.opacity}
                              onChange={(e) =>
                                updateTextLayer(index, { opacity: parseFloat(e.target.value) })
                              }
                              disabled={disabled}
                              style={{ flex: 1 }}
                            />
                            <span
                              style={{
                                fontSize: '0.6875rem',
                                color: 'var(--text-muted)',
                                width: '32px',
                              }}
                            >
                              {Math.round(layer.opacity * 100)}%
                            </span>
                          </div>
                        </div>

                        {/* Background toggle */}
                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.375rem',
                            fontSize: '0.6875rem',
                            color: 'var(--text-secondary)',
                            cursor: disabled ? 'not-allowed' : 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={(layer as any).background || false}
                            onChange={(e) =>
                              updateTextLayer(index, { ...layer, background: e.target.checked } as any)
                            }
                            disabled={disabled}
                            style={{ accentColor: 'var(--button-primary-bg)' }}
                          />
                          Background
                        </label>
                      </div>
                    )}
                  </div>
                ))}

                {settings.text_layers.length === 0 && (
                  <div
                    style={{
                      padding: '1.5rem',
                      textAlign: 'center',
                      color: 'var(--text-dim)',
                      fontSize: '0.75rem',
                    }}
                  >
                    No text layers. Click "+ Add Text Layer" to create one.
                  </div>
                )}
              </div>
            )}

            {activeTab === 'image' && (
              <div data-testid="burnins-image-controls">
                {!settings.image_watermark ? (
                  // Upload zone
                  <div
                    data-testid="burnins-image-upload"
                    onDragOver={(e) => {
                      e.preventDefault()
                      setIsDraggingImage(true)
                    }}
                    onDragLeave={() => setIsDraggingImage(false)}
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
                    }}
                  >
                    <div
                      style={{
                        fontSize: '2rem',
                        marginBottom: '0.5rem',
                        opacity: 0.5,
                      }}
                    >
                      🖼️
                    </div>
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: isDraggingImage
                          ? 'var(--button-primary-bg)'
                          : 'var(--text-secondary)',
                        marginBottom: '0.25rem',
                      }}
                    >
                      {isDraggingImage ? 'Drop image here' : 'Drag & drop image here'}
                    </div>
                    <div
                      style={{
                        fontSize: '0.6875rem',
                        color: 'var(--text-dim)',
                      }}
                    >
                      or click to browse • PNG, JPG, TIFF
                    </div>
                  </div>
                ) : (
                  // Image controls
                  <div
                    style={{
                      padding: '0.5rem',
                      border: '1px solid var(--button-primary-bg)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'rgba(59, 130, 246, 0.05)',
                    }}
                  >
                    {/* Header */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        marginBottom: '0.75rem',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={settings.image_watermark.enabled}
                        onChange={() =>
                          updateImageOverlay({ enabled: !settings.image_watermark?.enabled })
                        }
                        disabled={disabled}
                        style={{ accentColor: 'var(--button-primary-bg)' }}
                      />
                      <span
                        style={{
                          flex: 1,
                          fontSize: '0.75rem',
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--text-muted)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {settings.image_watermark.image_name}
                      </span>
                      <button
                        data-testid="burnins-image-remove"
                        onClick={removeImageOverlay}
                        disabled={disabled}
                        style={{
                          padding: '0.25rem 0.5rem',
                          fontSize: '0.6875rem',
                          background: 'transparent',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          borderRadius: 'var(--radius-sm)',
                          color: 'var(--status-failed-fg)',
                          cursor: disabled ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Remove
                      </button>
                    </div>

                    {/* Position (X/Y sliders) */}
                    <div style={{ marginBottom: '0.5rem' }}>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '0.625rem',
                          color: 'var(--text-dim)',
                          marginBottom: '0.25rem',
                        }}
                      >
                        X Position
                      </label>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                        }}
                      >
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={settings.image_watermark.x}
                          onChange={(e) =>
                            updateImageOverlay({ x: parseFloat(e.target.value) })
                          }
                          disabled={disabled}
                          style={{ flex: 1 }}
                        />
                        <span
                          style={{
                            fontSize: '0.6875rem',
                            color: 'var(--text-muted)',
                            width: '32px',
                          }}
                        >
                          {Math.round(settings.image_watermark.x * 100)}%
                        </span>
                      </div>
                    </div>

                    <div style={{ marginBottom: '0.5rem' }}>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '0.625rem',
                          color: 'var(--text-dim)',
                          marginBottom: '0.25rem',
                        }}
                      >
                        Y Position
                      </label>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                        }}
                      >
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={settings.image_watermark.y}
                          onChange={(e) =>
                            updateImageOverlay({ y: parseFloat(e.target.value) })
                          }
                          disabled={disabled}
                          style={{ flex: 1 }}
                        />
                        <span
                          style={{
                            fontSize: '0.6875rem',
                            color: 'var(--text-muted)',
                            width: '32px',
                          }}
                        >
                          {Math.round(settings.image_watermark.y * 100)}%
                        </span>
                      </div>
                    </div>

                    {/* Scale */}
                    <div style={{ marginBottom: '0.5rem' }}>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '0.625rem',
                          color: 'var(--text-dim)',
                          marginBottom: '0.25rem',
                        }}
                      >
                        Scale
                      </label>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                        }}
                      >
                        <input
                          type="range"
                          min="0.25"
                          max="2"
                          step="0.05"
                          value={extendedImageOverlay?.scale || 1.0}
                          onChange={(e) =>
                            updateImageOverlay({ scale: parseFloat(e.target.value) })
                          }
                          disabled={disabled}
                          style={{ flex: 1 }}
                        />
                        <span
                          style={{
                            fontSize: '0.6875rem',
                            color: 'var(--text-muted)',
                            width: '32px',
                          }}
                        >
                          {Math.round((extendedImageOverlay?.scale || 1.0) * 100)}%
                        </span>
                      </div>
                    </div>

                    {/* Opacity */}
                    <div style={{ marginBottom: '0.5rem' }}>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '0.625rem',
                          color: 'var(--text-dim)',
                          marginBottom: '0.25rem',
                        }}
                      >
                        Opacity
                      </label>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                        }}
                      >
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={settings.image_watermark.opacity}
                          onChange={(e) =>
                            updateImageOverlay({ opacity: parseFloat(e.target.value) })
                          }
                          disabled={disabled}
                          style={{ flex: 1 }}
                        />
                        <span
                          style={{
                            fontSize: '0.6875rem',
                            color: 'var(--text-muted)',
                            width: '32px',
                          }}
                        >
                          {Math.round(settings.image_watermark.opacity * 100)}%
                        </span>
                      </div>
                    </div>

                    {/* B&W Toggle */}
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        fontSize: '0.75rem',
                        color: 'var(--text-secondary)',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={extendedImageOverlay?.grayscale || false}
                        onChange={(e) => updateImageOverlay({ grayscale: e.target.checked })}
                        disabled={disabled}
                        style={{ accentColor: 'var(--button-primary-bg)' }}
                      />
                      Black & White
                    </label>
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
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Alpha notice */}
      <div
        style={{
          padding: '0.5rem 1rem',
          borderTop: '1px solid var(--border-primary)',
          backgroundColor: 'rgba(251, 191, 36, 0.05)',
          fontSize: '0.6875rem',
          color: 'var(--text-dim)',
          textAlign: 'center',
        }}
      >
        Alpha: Burn-in execution not yet wired to FFmpeg. Settings are saved to job payload.
      </div>
    </div>
  )
}

export default BurnInsEditor
