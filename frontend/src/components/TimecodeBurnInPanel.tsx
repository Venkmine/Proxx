/**
 * TimecodeBurnInPanel — Timecode overlay generator (Resolve-like)
 * 
 * Provides:
 * - Toggle: enabled
 * - Position: same anchor system as existing overlays
 * - Font, size, opacity, background box toggle
 * - TC Source: Record, Source, Custom
 * - Custom TC validation (HH:MM:SS:FF)
 * 
 * Alpha: UI + preview works. Execution wiring is stubbed.
 */

import { useState } from 'react'
import { Select } from './Select'
import type { TimecodeOverlay } from './PreviewViewport16x9'

// ============================================================================
// CONSTANTS
// ============================================================================

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

const FONT_OPTIONS = [
  { value: 'Menlo', label: 'Menlo (Monospace)' },
  { value: 'Courier', label: 'Courier (Monospace)' },
  { value: 'Monaco', label: 'Monaco' },
  { value: 'Arial', label: 'Arial' },
  { value: 'Helvetica', label: 'Helvetica' },
]

const SIZE_PRESETS = [
  { value: '18', label: 'Small (18pt)' },
  { value: '24', label: 'Medium (24pt)' },
  { value: '32', label: 'Large (32pt)' },
  { value: '48', label: 'Extra Large (48pt)' },
]

const TC_SOURCE_OPTIONS = [
  { value: 'record', label: 'Record TC' },
  { value: 'source', label: 'Source TC' },
  { value: 'custom', label: 'Custom TC' },
]

// ============================================================================
// HELPERS
// ============================================================================

// ALPHA: Parse and validate HH:MM:SS:FF format
function parseTimecode(tc: string, fps: number = 24): { valid: boolean; error?: string } {
  const match = tc.match(/^(\d{2}):(\d{2}):(\d{2}):(\d{2})$/)
  if (!match) {
    return { valid: false, error: 'Format must be HH:MM:SS:FF' }
  }
  
  const [, _hh, mm, ss, ff] = match.map(Number)
  void _hh // hours validation not needed (0-99 all valid)
  
  if (mm >= 60) return { valid: false, error: 'Minutes must be 0-59' }
  if (ss >= 60) return { valid: false, error: 'Seconds must be 0-59' }
  if (ff >= fps) return { valid: false, error: `Frames must be 0-${fps - 1} at ${fps}fps` }
  
  return { valid: true }
}

// Extended TimecodeOverlay with source type
interface ExtendedTimecodeOverlay extends TimecodeOverlay {
  tc_source?: 'record' | 'source' | 'custom'
  custom_tc?: string
}

// ============================================================================
// PROPS
// ============================================================================

interface TimecodeBurnInPanelProps {
  overlay: TimecodeOverlay | undefined
  onChange: (overlay: TimecodeOverlay | undefined) => void
  disabled?: boolean
}

// ============================================================================
// COMPONENT
// ============================================================================

export function TimecodeBurnInPanel({
  overlay,
  onChange,
  disabled = false,
}: TimecodeBurnInPanelProps) {
  // Local state for custom TC validation
  const [customTcError, setCustomTcError] = useState<string | null>(null)
  
  // Default overlay settings
  const defaultOverlay: ExtendedTimecodeOverlay = {
    enabled: false,
    position: 'bottom_left',
    font: 'Menlo',
    font_size: 24,
    opacity: 1.0,
    background: true,
    x: 0,
    y: 0,
    tc_source: 'source',
    custom_tc: '01:00:00:00',
  }
  
  const currentOverlay = (overlay || defaultOverlay) as ExtendedTimecodeOverlay
  
  const handleToggle = (enabled: boolean) => {
    if (enabled) {
      onChange({ ...defaultOverlay, enabled: true })
    } else {
      onChange(overlay ? { ...overlay, enabled: false } : undefined)
    }
  }
  
  const handleUpdate = (updates: Partial<ExtendedTimecodeOverlay>) => {
    onChange({ ...currentOverlay, ...updates } as TimecodeOverlay)
  }
  
  const handleCustomTcChange = (value: string) => {
    // Allow typing, validate on blur
    handleUpdate({ custom_tc: value } as any)
  }
  
  const validateCustomTc = (value: string) => {
    const result = parseTimecode(value, 25) // Alpha: assume 25fps for validation
    if (!result.valid) {
      setCustomTcError(result.error || 'Invalid timecode')
    } else {
      setCustomTcError(null)
    }
  }

  return (
    <div
      data-testid="timecode-burnin-panel"
      style={{
        padding: '0.75rem',
        background: 'rgba(51, 65, 85, 0.15)',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border-secondary)',
      }}
    >
      {/* Header with Toggle */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: currentOverlay.enabled ? '0.75rem' : 0,
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
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        >
          <input
            type="checkbox"
            data-testid="timecode-enabled"
            checked={currentOverlay.enabled}
            onChange={(e) => handleToggle(e.target.checked)}
            disabled={disabled}
            style={{ accentColor: 'var(--button-primary-bg)' }}
          />
          Timecode Overlay
        </label>
        
        {/* Alpha badge */}
        <span
          style={{
            padding: '0.125rem 0.375rem',
            fontSize: '0.5625rem',
            fontWeight: 600,
            color: 'var(--text-dim)',
            background: 'rgba(251, 191, 36, 0.15)',
            border: '1px solid rgba(251, 191, 36, 0.3)',
            borderRadius: 'var(--radius-sm)',
            textTransform: 'uppercase',
          }}
        >
          Alpha
        </span>
      </div>
      
      {/* Controls (shown when enabled) */}
      {currentOverlay.enabled && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {/* TC Source */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <label style={{ width: '70px', fontSize: '0.6875rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
              TC Source
            </label>
            <Select
              value={currentOverlay.tc_source || 'source'}
              onChange={(val) => handleUpdate({ tc_source: val as 'record' | 'source' | 'custom' })}
              options={TC_SOURCE_OPTIONS}
              disabled={disabled}
              size="sm"
              style={{ flex: 1 }}
            />
          </div>
          
          {/* Custom TC Input (shown when source is custom) */}
          {currentOverlay.tc_source === 'custom' && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
              <label style={{ width: '70px', fontSize: '0.6875rem', color: 'var(--text-secondary)', fontWeight: 500, paddingTop: '0.375rem' }}>
                Start TC
              </label>
              <div style={{ flex: 1 }}>
                <input
                  type="text"
                  value={currentOverlay.custom_tc || '01:00:00:00'}
                  onChange={(e) => handleCustomTcChange(e.target.value)}
                  onBlur={(e) => validateCustomTc(e.target.value)}
                  placeholder="HH:MM:SS:FF"
                  disabled={disabled}
                  style={{
                    width: '100%',
                    padding: '0.375rem 0.5rem',
                    fontSize: '0.75rem',
                    fontFamily: 'var(--font-mono)',
                    backgroundColor: 'var(--input-bg)',
                    border: customTcError ? '1px solid var(--status-failed-fg)' : '1px solid var(--border-primary)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                  }}
                />
                {customTcError && (
                  <div style={{ fontSize: '0.625rem', color: 'var(--status-failed-fg)', marginTop: '0.25rem' }}>
                    {customTcError}
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Position */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <label
              style={{
                width: '70px',
                fontSize: '0.6875rem',
                color: 'var(--text-secondary)',
                fontWeight: 500,
              }}
            >
              Position
            </label>
            <Select
              value={currentOverlay.position}
              onChange={(val) => handleUpdate({ position: val })}
              options={POSITION_ANCHORS}
              disabled={disabled}
              size="sm"
              style={{ flex: 1 }}
            />
          </div>
          
          {/* Font */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <label
              style={{
                width: '70px',
                fontSize: '0.6875rem',
                color: 'var(--text-secondary)',
                fontWeight: 500,
              }}
            >
              Font
            </label>
            <Select
              value={currentOverlay.font || 'Menlo'}
              onChange={(val) => handleUpdate({ font: val })}
              options={FONT_OPTIONS}
              disabled={disabled}
              size="sm"
              style={{ flex: 1 }}
            />
          </div>
          
          {/* Size */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <label
              style={{
                width: '70px',
                fontSize: '0.6875rem',
                color: 'var(--text-secondary)',
                fontWeight: 500,
              }}
            >
              Size
            </label>
            <Select
              value={String(currentOverlay.font_size)}
              onChange={(val) => handleUpdate({ font_size: parseInt(val) || 24 })}
              options={SIZE_PRESETS}
              disabled={disabled}
              size="sm"
              style={{ flex: 1 }}
            />
          </div>
          
          {/* Opacity */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <label
              style={{
                width: '70px',
                fontSize: '0.6875rem',
                color: 'var(--text-secondary)',
                fontWeight: 500,
              }}
            >
              Opacity
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={currentOverlay.opacity}
              onChange={(e) => handleUpdate({ opacity: parseFloat(e.target.value) })}
              disabled={disabled}
              style={{ flex: 1 }}
            />
            <span
              style={{
                width: '40px',
                fontSize: '0.6875rem',
                color: 'var(--text-muted)',
                textAlign: 'right',
              }}
            >
              {Math.round(currentOverlay.opacity * 100)}%
            </span>
          </div>
          
          {/* Background Box */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.6875rem',
                color: 'var(--text-secondary)',
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            >
              <input
                type="checkbox"
                data-testid="timecode-background"
                checked={currentOverlay.background}
                onChange={(e) => handleUpdate({ background: e.target.checked })}
                disabled={disabled}
                style={{ accentColor: 'var(--button-primary-bg)' }}
              />
              Show background box
            </label>
          </div>
          
          {/* Info text */}
          <div
            style={{
              marginTop: '0.25rem',
              fontSize: '0.625rem',
              color: 'var(--text-dim)',
              fontStyle: 'italic',
            }}
          >
            Displays source timecode from metadata. Shows 00:00:00:00 in preview.
          </div>
        </div>
      )}
    </div>
  )
}

export default TimecodeBurnInPanel
