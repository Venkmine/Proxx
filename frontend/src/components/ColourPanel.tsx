/**
 * ColourPanel — Colour/LUT Controls (Alpha)
 * 
 * ⚠️ ALPHA LIMITATION:
 * LUT application not yet wired to FFmpeg.
 * UI-only for Alpha — settings are saved to job payload.
 * 
 * Features:
 * - Colour mode selection (passthrough, apply LUT, simple transform)
 * - LUT file selector (placeholder)
 * - Simple gamma/contrast sliders
 * - Preview of colour changes (future)
 */

import { Select } from './Select'

// ============================================================================
// TYPES
// ============================================================================

export interface ColourSettings {
  mode: 'passthrough' | 'apply_lut' | 'simple_transform'
  lut_file?: string
  gamma?: number       // 0.5 - 2.0, default 1.0
  contrast?: number    // 0.5 - 2.0, default 1.0
  saturation?: number  // 0.0 - 2.0, default 1.0
}

interface ColourPanelProps {
  settings: ColourSettings
  onChange: (settings: ColourSettings) => void
  availableLuts?: string[]
  disabled?: boolean
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MODE_OPTIONS = [
  { value: 'passthrough', label: 'Passthrough (No change)' },
  { value: 'apply_lut', label: 'Apply LUT' },
  { value: 'simple_transform', label: 'Simple Transform' },
]

// ============================================================================
// COMPONENT
// ============================================================================

export function ColourPanel({
  settings,
  onChange,
  availableLuts = [],
  disabled = false,
}: ColourPanelProps) {
  const updateSettings = (updates: Partial<ColourSettings>) => {
    onChange({ ...settings, ...updates })
  }
  
  return (
    <div
      data-testid="colour-panel"
      style={{
        padding: '0.5rem',
        background: 'var(--card-bg)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-sm)',
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
          Colour
        </span>
        <span style={{
          fontSize: '0.625rem',
          color: 'var(--text-dim)',
          fontStyle: 'italic',
        }}>
          Alpha
        </span>
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
        LUT application not yet wired to FFmpeg.
      </div>
      
      {/* Mode selector */}
      <div style={{ marginBottom: '0.5rem' }}>
        <label style={{
          display: 'block',
          fontSize: '0.625rem',
          color: 'var(--text-dim)',
          marginBottom: '0.25rem',
        }}>
          Mode
        </label>
        <Select
          value={settings.mode}
          onChange={(v) => updateSettings({ mode: v as ColourSettings['mode'] })}
          options={MODE_OPTIONS}
          disabled={disabled}
          fullWidth
        />
      </div>
      
      {/* LUT selector (when apply_lut mode) */}
      {settings.mode === 'apply_lut' && (
        <div style={{ marginBottom: '0.5rem' }}>
          <label style={{
            display: 'block',
            fontSize: '0.625rem',
            color: 'var(--text-dim)',
            marginBottom: '0.25rem',
          }}>
            LUT File
          </label>
          {availableLuts.length > 0 ? (
            <Select
              value={settings.lut_file || ''}
              onChange={(v) => updateSettings({ lut_file: v })}
              options={[
                { value: '', label: 'Select a LUT...' },
                ...availableLuts.map(lut => ({ value: lut, label: lut }))
              ]}
              disabled={disabled}
              fullWidth
            />
          ) : (
            <div style={{
              padding: '0.375rem 0.5rem',
              fontSize: '0.75rem',
              color: 'var(--text-dim)',
              fontStyle: 'italic',
              backgroundColor: 'rgba(51, 65, 85, 0.2)',
              border: '1px solid var(--border-secondary)',
              borderRadius: 'var(--radius-sm)',
            }}>
              No LUTs found. Add .cube files to LUT directory.
            </div>
          )}
        </div>
      )}
      
      {/* Simple transform controls */}
      {settings.mode === 'simple_transform' && (
        <div style={{
          padding: '0.5rem',
          backgroundColor: 'rgba(51, 65, 85, 0.2)',
          border: '1px solid var(--border-secondary)',
          borderRadius: 'var(--radius-sm)',
        }}>
          {/* Gamma */}
          <div style={{ marginBottom: '0.5rem' }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.25rem',
            }}>
              <label style={{
                fontSize: '0.625rem',
                color: 'var(--text-dim)',
              }}>
                Gamma
              </label>
              <span style={{
                fontSize: '0.625rem',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-muted)',
              }}>
                {(settings.gamma ?? 1.0).toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.05"
              value={settings.gamma ?? 1.0}
              onChange={(e) => updateSettings({ gamma: parseFloat(e.target.value) })}
              disabled={disabled}
              style={{ width: '100%' }}
            />
          </div>
          
          {/* Contrast */}
          <div style={{ marginBottom: '0.5rem' }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.25rem',
            }}>
              <label style={{
                fontSize: '0.625rem',
                color: 'var(--text-dim)',
              }}>
                Contrast
              </label>
              <span style={{
                fontSize: '0.625rem',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-muted)',
              }}>
                {(settings.contrast ?? 1.0).toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.05"
              value={settings.contrast ?? 1.0}
              onChange={(e) => updateSettings({ contrast: parseFloat(e.target.value) })}
              disabled={disabled}
              style={{ width: '100%' }}
            />
          </div>
          
          {/* Saturation */}
          <div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.25rem',
            }}>
              <label style={{
                fontSize: '0.625rem',
                color: 'var(--text-dim)',
              }}>
                Saturation
              </label>
              <span style={{
                fontSize: '0.625rem',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-muted)',
              }}>
                {(settings.saturation ?? 1.0).toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min="0.0"
              max="2.0"
              step="0.05"
              value={settings.saturation ?? 1.0}
              onChange={(e) => updateSettings({ saturation: parseFloat(e.target.value) })}
              disabled={disabled}
              style={{ width: '100%' }}
            />
          </div>
          
          {/* Reset button */}
          <button
            onClick={() => updateSettings({
              gamma: 1.0,
              contrast: 1.0,
              saturation: 1.0,
            })}
            disabled={disabled}
            style={{
              marginTop: '0.5rem',
              padding: '0.25rem 0.5rem',
              fontSize: '0.625rem',
              background: 'transparent',
              border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-dim)',
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}
          >
            Reset to defaults
          </button>
        </div>
      )}
      
      {/* Passthrough info */}
      {settings.mode === 'passthrough' && (
        <div style={{
          padding: '0.5rem',
          fontSize: '0.6875rem',
          color: 'var(--text-dim)',
          textAlign: 'center',
          fontStyle: 'italic',
        }}>
          Source colour will be preserved without modification.
        </div>
      )}
    </div>
  )
}

export default ColourPanel
