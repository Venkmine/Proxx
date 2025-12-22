/**
 * TextBurnInPanel — Text Burn-In Settings (Alpha)
 * 
 * ⚠️ ALPHA LIMITATION:
 * Text burn-in execution not yet wired to FFmpeg.
 * UI-only for Alpha — settings are saved to job payload.
 * 
 * Features:
 * - Font dropdown (curated list)
 * - Size, opacity, background toggle
 * - Position anchor (TL, TR, BL, BR, Center)
 * - Token support (same tokens as naming template)
 * - X/Y offset from anchor
 * 
 * NOTE: Tokens are imported from shared constants/tokens.ts
 * Do NOT define tokens locally.
 */

import { Select } from './Select'
import { TEXT_BURNIN_TOKENS } from '../constants/tokens'
import type { TextOverlay } from './DeliverControlPanel'

// ============================================================================
// TYPES
// ============================================================================

interface TextBurnInPanelProps {
  layers: TextOverlay[]
  onChange: (layers: TextOverlay[]) => void
  disabled?: boolean
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Alpha: Curated font list (system font enumeration requires Electron IPC)
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

const POSITION_ANCHORS = [
  { value: 'top_left', label: 'Top Left' },
  { value: 'top_center', label: 'Top Center' },
  { value: 'top_right', label: 'Top Right' },
  { value: 'center', label: 'Center' },
  { value: 'bottom_left', label: 'Bottom Left' },
  { value: 'bottom_center', label: 'Bottom Center' },
  { value: 'bottom_right', label: 'Bottom Right' },
]

const SIZE_PRESETS = [
  { value: 12, label: 'Small (12pt)' },
  { value: 18, label: 'Medium (18pt)' },
  { value: 24, label: 'Large (24pt)' },
  { value: 32, label: 'Extra Large (32pt)' },
  { value: 48, label: 'Huge (48pt)' },
]

// ============================================================================
// COMPONENT
// ============================================================================

export function TextBurnInPanel({
  layers,
  onChange,
  disabled = false,
}: TextBurnInPanelProps) {
  
  const updateLayer = (index: number, updates: Partial<TextOverlay>) => {
    const newLayers = [...layers]
    newLayers[index] = { ...newLayers[index], ...updates }
    onChange(newLayers)
  }
  
  const addLayer = () => {
    onChange([
      ...layers,
      {
        text: '',
        position: 'bottom_left',
        font_size: 24,
        opacity: 1.0,
        enabled: true,
        x: 0,
        y: 0,
      }
    ])
  }
  
  const removeLayer = (index: number) => {
    onChange(layers.filter((_, i) => i !== index))
  }
  
  const toggleLayer = (index: number) => {
    updateLayer(index, { enabled: !layers[index].enabled })
  }
  
  const insertToken = (index: number, token: string) => {
    const layer = layers[index]
    updateLayer(index, { text: layer.text + token })
  }

  return (
    <div data-testid="text-burnin-panel">
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
          Text Burn-In
        </span>
        <button
          data-testid="add-text-burnin-button"
          onClick={addLayer}
          disabled={disabled}
          style={{
            padding: '0.25rem 0.5rem',
            fontSize: '0.6875rem',
            background: 'transparent',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-muted)',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.5 : 1,
          }}
        >
          + Add Text
        </button>
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
        Alpha: Text burn-in execution not yet wired to FFmpeg.
      </div>
      
      {/* Layers */}
      {layers.map((layer, index) => (
        <div
          key={index}
          data-testid={`text-layer-${index}`}
          style={{
            padding: '0.5rem',
            marginBottom: '0.5rem',
            border: layer.enabled 
              ? '1px solid var(--button-primary-bg)' 
              : '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-sm)',
            background: layer.enabled 
              ? 'rgba(59, 130, 246, 0.05)' 
              : 'rgba(51, 65, 85, 0.1)',
            opacity: layer.enabled ? 1 : 0.6,
          }}
        >
          {/* Header row */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '0.5rem',
          }}>
            <input
              type="checkbox"
              checked={layer.enabled}
              onChange={() => toggleLayer(index)}
              disabled={disabled}
              style={{ accentColor: 'var(--button-primary-bg)' }}
            />
            <span style={{
              flex: 1,
              fontSize: '0.6875rem',
              fontWeight: 600,
              color: 'var(--text-secondary)',
            }}>
              Layer {index + 1}
            </span>
            <button
              onClick={() => removeLayer(index)}
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
          
          {/* Text content */}
          <div style={{ marginBottom: '0.5rem' }}>
            <label style={{
              display: 'block',
              fontSize: '0.625rem',
              color: 'var(--text-dim)',
              marginBottom: '0.25rem',
            }}>
              Text Content
            </label>
            <input
              type="text"
              value={layer.text}
              onChange={(e) => updateLayer(index, { text: e.target.value })}
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
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.25rem',
              marginTop: '0.25rem',
            }}>
              {TEXT_BURNIN_TOKENS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => insertToken(index, t.token)}
                  disabled={disabled}
                  title={t.description}
                  style={{
                    padding: '0.125rem 0.375rem',
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
          
          {/* Font and Size row */}
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
                Font
              </label>
              <Select
                value={(layer as any).font || 'Arial'}
                onChange={(v) => updateLayer(index, { ...layer, font: v } as any)}
                options={FONT_OPTIONS}
                disabled={disabled}
                fullWidth
              />
            </div>
            <div style={{ width: '80px' }}>
              <label style={{
                display: 'block',
                fontSize: '0.625rem',
                color: 'var(--text-dim)',
                marginBottom: '0.25rem',
              }}>
                Size
              </label>
              <Select
                value={String(layer.font_size)}
                onChange={(v) => updateLayer(index, { font_size: parseInt(v) })}
                options={SIZE_PRESETS.map(p => ({ value: String(p.value), label: p.label }))}
                disabled={disabled}
                fullWidth
              />
            </div>
          </div>
          
          {/* Position anchor */}
          <div style={{ marginBottom: '0.5rem' }}>
            <label style={{
              display: 'block',
              fontSize: '0.625rem',
              color: 'var(--text-dim)',
              marginBottom: '0.25rem',
            }}>
              Anchor Position
            </label>
            <Select
              value={layer.position}
              onChange={(v) => updateLayer(index, { position: v })}
              options={POSITION_ANCHORS}
              disabled={disabled}
              fullWidth
            />
          </div>
          
          {/* X/Y Offset */}
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
                X Offset (px)
              </label>
              <input
                type="number"
                value={layer.x || 0}
                onChange={(e) => updateLayer(index, { x: parseInt(e.target.value) || 0 })}
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
            <div style={{ flex: 1 }}>
              <label style={{
                display: 'block',
                fontSize: '0.625rem',
                color: 'var(--text-dim)',
                marginBottom: '0.25rem',
              }}>
                Y Offset (px)
              </label>
              <input
                type="number"
                value={layer.y || 0}
                onChange={(e) => updateLayer(index, { y: parseInt(e.target.value) || 0 })}
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
          </div>
          
          {/* Opacity and Background */}
          <div style={{
            display: 'flex',
            gap: '0.5rem',
            alignItems: 'center',
          }}>
            <div style={{ flex: 1 }}>
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
                  step="0.1"
                  value={layer.opacity}
                  onChange={(e) => updateLayer(index, { opacity: parseFloat(e.target.value) })}
                  disabled={disabled}
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', width: '32px' }}>
                  {Math.round(layer.opacity * 100)}%
                </span>
              </div>
            </div>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
              fontSize: '0.6875rem',
              color: 'var(--text-secondary)',
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}>
              <input
                type="checkbox"
                checked={(layer as any).background || false}
                onChange={(e) => updateLayer(index, { ...layer, background: e.target.checked } as any)}
                disabled={disabled}
                style={{ accentColor: 'var(--button-primary-bg)' }}
              />
              Background
            </label>
          </div>
        </div>
      ))}
      
      {/* Empty state */}
      {layers.length === 0 && (
        <div style={{
          padding: '1rem',
          textAlign: 'center',
          color: 'var(--text-dim)',
          fontSize: '0.75rem',
          fontStyle: 'italic',
        }}>
          No text burn-in layers. Click "+ Add Text" to create one.
        </div>
      )}
    </div>
  )
}

export default TextBurnInPanel
