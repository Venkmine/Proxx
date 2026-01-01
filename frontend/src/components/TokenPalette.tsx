/**
 * TokenPalette — Naming Template Token Builder (Alpha)
 * 
 * ⚠️ VERIFY GUARD:
 * Any change to this component requires Playwright coverage.
 * Run: make verify-ui before committing changes.
 * 
 * Features:
 * - Draggable tokens for building naming templates
 * - Tokens: {source}, {reel}, {tc}, {codec}, {resolution}, {custom}
 * - Live filename preview with validation
 * - Insert tokens at cursor position
 * 
 * Alpha limitation: Drag & drop uses click-to-insert for now.
 * Full drag & drop will be added in future.
 * 
 * NOTE: Tokens are imported from shared constants/tokens.ts
 * Do NOT define tokens locally.
 */

import React, { useState, useRef, useEffect } from 'react'
import { 
  NAMING_TOKENS as AVAILABLE_TOKENS, 
  SEPARATOR_TOKENS, 
  resolveTokens,
} from '../constants/tokens'

// ============================================================================
// TYPES
// ============================================================================

interface TokenPaletteProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  /** Sample source filename for preview */
  sampleSource?: string
  /** Backend URL for validation */
  backendUrl?: string
}

// ============================================================================
// COMPONENT
// ============================================================================

export function TokenPalette({
  value,
  onChange,
  disabled = false,
  sampleSource = 'A001_C001_0101AB',
  backendUrl = 'http://127.0.0.1:8085',
}: TokenPaletteProps) {
  const [previewResult, setPreviewResult] = useState<string>('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [isValidating, setIsValidating] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  // ============================================
  // Token Insertion
  // ============================================

  const insertToken = (token: string) => {
    if (disabled) return
    
    const input = inputRef.current
    if (input) {
      const start = input.selectionStart || value.length
      const end = input.selectionEnd || value.length
      const newValue = value.slice(0, start) + token + value.slice(end)
      onChange(newValue)
      
      // Move cursor after inserted token
      setTimeout(() => {
        input.focus()
        const newCursorPos = start + token.length
        input.setSelectionRange(newCursorPos, newCursorPos)
      }, 0)
    } else {
      // Fallback: append to end
      onChange(value + token)
    }
  }

  // ============================================
  // Validation & Preview
  // ============================================

  // Generate local preview from template
  // Uses resolveTokens from shared constants for consistency
  const generateLocalPreview = (template: string): string => {
    // Replace source with custom sample if provided
    let result = template.replace(/{source_name}/g, sampleSource)
    result = result.replace(/{source}/g, sampleSource)
    // Resolve remaining tokens using shared function
    result = resolveTokens(result)
    return result
  }

  useEffect(() => {
    // Debounce validation
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    if (!value.trim()) {
      setPreviewResult('')
      setValidationError(null)
      return
    }

    debounceRef.current = setTimeout(async () => {
      setIsValidating(true)
      try {
        // Generate local preview first
        const preview = generateLocalPreview(value)
        setPreviewResult(preview)
        
        // INC-003: Backend validation endpoint (/control/validate-naming-template)
        // was intentionally removed in v1 to preserve determinism.
        // We use local-only preview without backend validation.
        // This avoids 404 errors in devtools for removed endpoints.
        setValidationError(null)
      } catch {
        // Local preview failed - should not happen in practice
        setValidationError(null)
      } finally {
        setIsValidating(false)
      }
    }, 300)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [value, sampleSource, backendUrl])

  // ============================================
  // Drag & Drop - Full HTML5 Implementation
  // ============================================

  const [isDragging, setIsDragging] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)

  const handleDragStart = (e: React.DragEvent, token: string, label: string) => {
    e.dataTransfer.setData('text/plain', token)
    e.dataTransfer.setData('application/x-token-label', label)
    e.dataTransfer.effectAllowed = 'copy'
    setIsDragging(true)
    
    // Create custom drag image
    const dragImage = document.createElement('div')
    dragImage.textContent = label
    dragImage.style.cssText = `
      padding: 4px 8px;
      background: var(--button-primary-bg, #3b82f6);
      color: white;
      font-size: 12px;
      font-family: system-ui;
      border-radius: 4px;
      position: absolute;
      top: -1000px;
    `
    document.body.appendChild(dragImage)
    e.dataTransfer.setDragImage(dragImage, 20, 12)
    setTimeout(() => document.body.removeChild(dragImage), 0)
  }

  const handleDragEnd = () => {
    setIsDragging(false)
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    
    const token = e.dataTransfer.getData('text/plain')
    if (token) {
      // Get cursor position from drop location
      const input = inputRef.current
      if (input) {
        // Calculate approximate cursor position based on drop X coordinate
        const rect = input.getBoundingClientRect()
        const dropX = e.clientX - rect.left
        const charWidth = 7 // Approximate character width in pixels for mono font
        const approxPos = Math.round(dropX / charWidth)
        const insertPos = Math.min(Math.max(0, approxPos), value.length)
        
        const newValue = value.slice(0, insertPos) + token + value.slice(insertPos)
        onChange(newValue)
        
        // Set cursor after inserted token
        setTimeout(() => {
          input.focus()
          const newCursorPos = insertPos + token.length
          input.setSelectionRange(newCursorPos, newCursorPos)
        }, 0)
      } else {
        insertToken(token)
      }
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    // Only set dragOver to false if leaving the actual drop zone
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    if (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    ) {
      setIsDragOver(false)
    }
  }

  // ============================================
  // Render
  // ============================================

  return (
    <div data-testid="token-palette">
      {/* Token Palette - Metadata Tokens */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.375rem',
          marginBottom: '0.375rem',
        }}
      >
        {AVAILABLE_TOKENS.map((token) => (
          <button
            key={token.id}
            data-testid={`token-chip-${token.id}`}
            onClick={() => insertToken(token.token)}
            onDragStart={(e) => handleDragStart(e, token.token, token.label)}
            onDragEnd={handleDragEnd}
            draggable={!disabled}
            disabled={disabled}
            title={`${token.description}\nClick to insert or drag to template`}
            style={{
              padding: '0.25rem 0.5rem',
              fontSize: '0.6875rem',
              fontFamily: 'var(--font-mono)',
              fontWeight: 500,
              background: isDragging ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--button-primary-bg)',
              cursor: disabled ? 'not-allowed' : 'grab',
              opacity: disabled ? 0.5 : 1,
              transition: 'all 0.15s',
              userSelect: 'none',
            }}
            onMouseEnter={(e) => {
              if (!disabled) {
                e.currentTarget.style.background = 'rgba(59, 130, 246, 0.2)'
                e.currentTarget.style.borderColor = 'var(--button-primary-bg)'
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)'
              e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.3)'
            }}
          >
            {token.label}
          </button>
        ))}
      </div>
      
      {/* Separator Tokens */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.375rem',
          marginBottom: '0.5rem',
        }}
      >
        <span style={{ fontSize: '0.625rem', color: 'var(--text-dim)' }}>Separators:</span>
        {SEPARATOR_TOKENS.map((token) => (
          <button
            key={token.id}
            data-testid={`token-${token.id}`}
            onClick={() => insertToken(token.token)}
            disabled={disabled}
            title={token.description}
            style={{
              padding: '0.25rem 0.375rem',
              fontSize: '0.75rem',
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              background: 'rgba(51, 65, 85, 0.3)',
              border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-muted)',
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.5 : 1,
              minWidth: '24px',
            }}
          >
            {token.label}
          </button>
        ))}
        <button
          data-testid="token-help-toggle"
          onClick={() => setShowHelp(!showHelp)}
          style={{
            marginLeft: 'auto',
            padding: '0.125rem 0.375rem',
            fontSize: '0.625rem',
            background: showHelp ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-muted)',
            cursor: 'pointer',
          }}
        >
          {showHelp ? 'Hide Help' : '? Help'}
        </button>
      </div>
      
      {/* Inline Help */}
      {showHelp && (
        <div
          data-testid="token-help-panel"
          style={{
            padding: '0.5rem',
            marginBottom: '0.5rem',
            fontSize: '0.625rem',
            background: 'rgba(59, 130, 246, 0.05)',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-muted)',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>
            Available Tokens
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem' }}>
            {[...AVAILABLE_TOKENS, ...SEPARATOR_TOKENS].map((token) => (
              <div key={token.id} style={{ display: 'flex', gap: '0.375rem' }}>
                <code style={{ 
                  fontFamily: 'var(--font-mono)', 
                  color: 'var(--button-primary-bg)',
                  fontSize: '0.5625rem',
                }}>
                  {token.token}
                </code>
                <span>{token.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Template Input - Drop Zone */}
      <div
        data-testid="token-drop-zone"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        style={{
          position: 'relative',
          borderRadius: 'var(--radius-sm)',
          transition: 'all 0.15s ease',
          ...(isDragOver && {
            boxShadow: '0 0 0 2px var(--button-primary-bg)',
            background: 'rgba(59, 130, 246, 0.05)',
          }),
        }}
      >
        {/* Drop indicator overlay */}
        {isDragOver && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(59, 130, 246, 0.1)',
              borderRadius: 'var(--radius-sm)',
              pointerEvents: 'none',
              zIndex: 1,
            }}
          >
            <span style={{ 
              fontSize: '0.6875rem', 
              color: 'var(--button-primary-bg)',
              fontWeight: 600,
            }}>
              Drop token here
            </span>
          </div>
        )}
        <input
          ref={inputRef}
          type="text"
          data-testid="naming-template-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="{source_name}_proxy"
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            fontSize: '0.75rem',
            fontFamily: 'var(--font-mono)',
            background: isDragOver ? 'transparent' : 'var(--input-bg)',
            border: validationError 
              ? '1px solid var(--status-failed-fg)'
              : '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-primary)',
            outline: 'none',
          }}
          onFocus={(e) => {
            if (!validationError) {
              e.currentTarget.style.borderColor = 'var(--button-primary-bg)'
            }
          }}
          onBlur={(e) => {
            if (!validationError) {
              e.currentTarget.style.borderColor = 'var(--border-primary)'
            }
          }}
        />
        {isValidating && (
          <span
            style={{
              position: 'absolute',
              right: '0.5rem',
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: '0.625rem',
              color: 'var(--text-dim)',
            }}
          >
            ...
          </span>
        )}
      </div>

      {/* Validation Error */}
      {validationError && (
        <div
          data-testid="naming-validation-error"
          style={{
            marginTop: '0.375rem',
            padding: '0.375rem 0.5rem',
            fontSize: '0.6875rem',
            color: 'var(--status-failed-fg)',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          {validationError}
        </div>
      )}

      {/* Live Preview */}
      {previewResult && !validationError && (
        <div
          data-testid="naming-preview"
          style={{
            marginTop: '0.375rem',
            padding: '0.375rem 0.5rem',
            fontSize: '0.6875rem',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-secondary)',
            background: 'rgba(20, 24, 32, 0.6)',
            border: '1px solid var(--border-secondary)',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-sans)' }}>Preview:</span>
          <span style={{ color: 'var(--status-completed-fg)' }}>{previewResult}.mp4</span>
        </div>
      )}

      {/* Help text */}
      <div
        style={{
          marginTop: '0.375rem',
          fontSize: '0.625rem',
          color: 'var(--text-dim)',
          fontFamily: 'var(--font-sans)',
        }}
      >
        Click tokens above or type directly. Drag tokens to reorder.
      </div>
    </div>
  )
}

export default TokenPalette
