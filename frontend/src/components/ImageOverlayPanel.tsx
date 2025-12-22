/**
 * ImageOverlayPanel — Image Overlay Settings (Alpha)
 * 
 * ⚠️ ALPHA LIMITATION:
 * Image overlay execution not yet wired to FFmpeg.
 * UI-only for Alpha — settings are saved to job payload.
 * 
 * Features:
 * - Drag-and-drop image upload (PNG/JPG/TIFF)
 * - Interactive preview with drag-to-position
 * - Scale slider
 * - Opacity slider
 * - Black & White toggle
 */

import React, { useState, useRef } from 'react'
import { Button } from './Button'
import type { ImageOverlay } from './DeliverControlPanel'

// ============================================================================
// TYPES
// ============================================================================

interface ImageOverlayPanelProps {
  overlay: ImageOverlay | undefined
  onChange: (overlay: ImageOverlay | undefined) => void
  disabled?: boolean
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ImageOverlayPanel({
  overlay,
  onChange,
  disabled = false,
}: ImageOverlayPanelProps) {
  const [isDragging, setIsDragging] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ============================================
  // File Upload
  // ============================================

  const handleFileUpload = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result as string
      onChange({
        enabled: true,
        image_data: base64,
        image_name: file.name,
        x: 0.05,
        y: 0.05,
        opacity: 1.0,
        scale: 1.0,
        grayscale: false,
      } as ImageOverlay & { scale?: number; grayscale?: boolean })
    }
    reader.readAsDataURL(file)
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileUpload(file)
    }
    e.target.value = ''
  }

  // ============================================
  // Drag & Drop
  // ============================================

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
    e.dataTransfer.dropEffect = 'copy'
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    
    const files = e.dataTransfer.files
    if (files.length > 0) {
      const file = files[0]
      const validTypes = ['image/png', 'image/jpeg', 'image/tiff']
      if (validTypes.includes(file.type) || file.name.match(/\.(png|jpg|jpeg|tiff|tif)$/i)) {
        handleFileUpload(file)
      }
    }
  }

  // ============================================
  // Position Drag
  // ============================================

  const handlePreviewClick = (e: React.MouseEvent) => {
    if (disabled || !overlay) return
    
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
    
    onChange({ ...overlay, x, y })
  }

  // ============================================
  // Controls
  // ============================================

  const updateOverlay = (updates: Partial<ImageOverlay & { scale?: number; grayscale?: boolean }>) => {
    if (!overlay) return
    onChange({ ...overlay, ...updates } as ImageOverlay)
  }

  const removeOverlay = () => {
    onChange(undefined)
  }

  const toggleEnabled = () => {
    if (!overlay) return
    onChange({ ...overlay, enabled: !overlay.enabled })
  }

  // Extended overlay type with scale and grayscale
  const extendedOverlay = overlay as (ImageOverlay & { scale?: number; grayscale?: boolean }) | undefined

  // ============================================
  // Render
  // ============================================

  return (
    <div data-testid="image-overlay-panel">
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
          Image Overlay
        </span>
        {overlay && (
          <button
            onClick={removeOverlay}
            disabled={disabled}
            style={{
              padding: '0.25rem 0.5rem',
              fontSize: '0.6875rem',
              background: 'transparent',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--status-failed-fg)',
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.5 : 1,
            }}
          >
            Remove
          </button>
        )}
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
        Alpha: Image overlay execution not yet wired to FFmpeg.
      </div>
      
      {/* Upload Zone (when no overlay) */}
      {!overlay && (
        <div
          data-testid="image-upload-dropzone"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !disabled && fileInputRef.current?.click()}
          style={{
            padding: '1.5rem',
            border: isDragging 
              ? '2px dashed var(--button-primary-bg)' 
              : '2px dashed var(--border-primary)',
            borderRadius: 'var(--radius-sm)',
            background: isDragging 
              ? 'rgba(59, 130, 246, 0.1)' 
              : 'rgba(51, 65, 85, 0.1)',
            textAlign: 'center',
            cursor: disabled ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
          }}
        >
          <div style={{
            fontSize: '1.5rem',
            marginBottom: '0.5rem',
            opacity: 0.5,
          }}>
            🖼️
          </div>
          <div style={{
            fontSize: '0.75rem',
            color: isDragging ? 'var(--button-primary-bg)' : 'var(--text-secondary)',
            marginBottom: '0.25rem',
          }}>
            {isDragging ? 'Drop image here' : 'Drag & drop image here'}
          </div>
          <div style={{
            fontSize: '0.6875rem',
            color: 'var(--text-dim)',
          }}>
            or click to browse • PNG, JPG, TIFF
          </div>
        </div>
      )}
      
      <input
        ref={fileInputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.tiff,.tif"
        onChange={handleFileInput}
        style={{ display: 'none' }}
      />
      
      {/* Overlay Controls (when overlay exists) */}
      {overlay && (
        <div style={{
          padding: '0.5rem',
          border: overlay.enabled 
            ? '1px solid var(--button-primary-bg)' 
            : '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-sm)',
          background: overlay.enabled 
            ? 'rgba(59, 130, 246, 0.05)' 
            : 'rgba(51, 65, 85, 0.1)',
          opacity: overlay.enabled ? 1 : 0.6,
        }}>
          {/* Enable toggle and filename */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '0.5rem',
          }}>
            <input
              type="checkbox"
              checked={overlay.enabled}
              onChange={toggleEnabled}
              disabled={disabled}
              style={{ accentColor: 'var(--button-primary-bg)' }}
            />
            <span style={{
              flex: 1,
              fontSize: '0.75rem',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {overlay.image_name}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
            >
              Change
            </Button>
          </div>
          
          {/* Preview monitor */}
          <div
            ref={previewRef}
            data-testid="image-overlay-preview"
            onClick={handlePreviewClick}
            style={{
              position: 'relative',
              width: '100%',
              height: '120px',
              backgroundColor: 'var(--card-bg)',
              border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-sm)',
              overflow: 'hidden',
              cursor: disabled ? 'default' : 'crosshair',
              marginBottom: '0.5rem',
            }}
          >
            {/* Grid lines */}
            <div style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: 'linear-gradient(to right, var(--border-secondary) 1px, transparent 1px), linear-gradient(to bottom, var(--border-secondary) 1px, transparent 1px)',
              backgroundSize: '25% 25%',
              opacity: 0.5,
            }} />
            {/* Title safe (10% margin) */}
            <div style={{
              position: 'absolute',
              top: '10%',
              left: '10%',
              right: '10%',
              bottom: '10%',
              border: '1px dashed rgba(251, 191, 36, 0.3)',
              borderRadius: '2px',
            }} />
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
            {/* Center crosshair */}
            <div style={{
              position: 'absolute',
              left: '50%',
              top: '0',
              bottom: '0',
              width: '1px',
              backgroundColor: 'rgba(59, 130, 246, 0.2)',
            }} />
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '0',
              right: '0',
              height: '1px',
              backgroundColor: 'rgba(59, 130, 246, 0.2)',
            }} />
            {/* Image overlay */}
            <div
              style={{
                position: 'absolute',
                left: `${overlay.x * 100}%`,
                top: `${overlay.y * 100}%`,
                transform: 'translate(-50%, -50%)',
                transition: 'left 0.1s, top 0.1s',
              }}
            >
              <img
                src={overlay.image_data}
                alt=""
                style={{
                  maxWidth: `${(extendedOverlay?.scale || 1.0) * 50}px`,
                  maxHeight: `${(extendedOverlay?.scale || 1.0) * 35}px`,
                  borderRadius: '2px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
                  opacity: overlay.enabled ? overlay.opacity : 0.3,
                  filter: extendedOverlay?.grayscale ? 'grayscale(100%)' : 'none',
                  pointerEvents: 'none',
                }}
              />
            </div>
            {/* Guide labels */}
            <div style={{
              position: 'absolute',
              top: '2px',
              left: '4px',
              fontSize: '0.5rem',
              color: 'rgba(251, 191, 36, 0.5)',
              fontFamily: 'var(--font-mono)',
            }}>
              TITLE SAFE
            </div>
            <div style={{
              position: 'absolute',
              bottom: '2px',
              right: '4px',
              fontSize: '0.5rem',
              color: 'var(--text-dim)',
              fontFamily: 'var(--font-mono)',
            }}>
              CLICK TO POSITION
            </div>
          </div>
          
          {/* Position controls */}
          <div style={{
            display: 'flex',
            gap: '0.5rem',
            marginBottom: '0.5rem',
          }}>
            <div style={{ flex: 1 }}>
              <label style={{
                display: 'block',
                fontSize: '0.625rem',
                color: 'var(--text-dim)',
                marginBottom: '0.25rem',
              }}>
                X Position
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={overlay.x}
                  onChange={(e) => updateOverlay({ x: parseFloat(e.target.value) })}
                  disabled={disabled}
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', width: '32px' }}>
                  {Math.round(overlay.x * 100)}%
                </span>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{
                display: 'block',
                fontSize: '0.625rem',
                color: 'var(--text-dim)',
                marginBottom: '0.25rem',
              }}>
                Y Position
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={overlay.y}
                  onChange={(e) => updateOverlay({ y: parseFloat(e.target.value) })}
                  disabled={disabled}
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', width: '32px' }}>
                  {Math.round(overlay.y * 100)}%
                </span>
              </div>
            </div>
          </div>
          
          {/* Opacity */}
          <div style={{ marginBottom: '0.5rem' }}>
            <label style={{
              display: 'block',
              fontSize: '0.625rem',
              color: 'var(--text-dim)',
              marginBottom: '0.25rem',
            }}>
              Opacity
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={overlay.opacity}
                onChange={(e) => updateOverlay({ opacity: parseFloat(e.target.value) })}
                disabled={disabled}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', width: '32px' }}>
                {Math.round(overlay.opacity * 100)}%
              </span>
            </div>
          </div>
          
          {/* Scale */}
          <div style={{ marginBottom: '0.5rem' }}>
            <label style={{
              display: 'block',
              fontSize: '0.625rem',
              color: 'var(--text-dim)',
              marginBottom: '0.25rem',
            }}>
              Scale
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="range"
                min="0.25"
                max="2"
                step="0.05"
                value={extendedOverlay?.scale || 1.0}
                onChange={(e) => updateOverlay({ scale: parseFloat(e.target.value) })}
                disabled={disabled}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', width: '32px' }}>
                {Math.round((extendedOverlay?.scale || 1.0) * 100)}%
              </span>
            </div>
          </div>
          
          {/* B&W Toggle and Reset Position */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '0.25rem',
          }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}>
              <input
                type="checkbox"
                checked={extendedOverlay?.grayscale || false}
                onChange={(e) => updateOverlay({ grayscale: e.target.checked })}
                disabled={disabled}
                style={{ accentColor: 'var(--button-primary-bg)' }}
              />
              Black & White
            </label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => updateOverlay({ x: 0.05, y: 0.05 })}
              disabled={disabled}
              title="Reset to top-left corner (5%, 5%)"
            >
              Reset Position
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ImageOverlayPanel
