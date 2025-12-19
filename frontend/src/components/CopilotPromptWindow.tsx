import { useState } from 'react'
import { Button } from './Button'

/**
 * CopilotPromptWindow — Dedicated panel for structured Copilot instructions.
 * 
 * Phase 20: Required component.
 * 
 * Purpose:
 * - NOT for logs or output
 * - ONLY for structured Copilot instructions
 * - User manually pastes content here
 * - Provides copy button for easy clipboard access
 * 
 * Design:
 * - Floating window or docked panel
 * - Monospaced font (JetBrains Mono)
 * - Copy button
 * - Resizable textarea
 */

interface CopilotPromptWindowProps {
  isOpen: boolean
  onClose: () => void
}

export function CopilotPromptWindow({ isOpen, onClose }: CopilotPromptWindowProps) {
  const [promptText, setPromptText] = useState('')
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(promptText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleClear = () => {
    setPromptText('')
  }

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '600px',
        maxWidth: '90vw',
        maxHeight: '80vh',
        backgroundColor: 'var(--card-bg-solid, rgba(16, 18, 20, 0.98))',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-lg, 8px)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.75rem 1rem',
          borderBottom: '1px solid var(--border-primary)',
          background: 'linear-gradient(180deg, rgba(26, 32, 44, 0.95) 0%, rgba(20, 24, 32, 0.95) 100%)',
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: '0.875rem',
            fontWeight: 600,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-sans)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <span style={{ fontSize: '1rem' }}>🤖</span>
          Copilot Prompt
        </h3>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '1.25rem',
            padding: '0.25rem',
            lineHeight: 1,
          }}
          title="Close"
        >
          ×
        </button>
      </div>

      {/* Description */}
      <div
        style={{
          padding: '0.75rem 1rem',
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-sans)',
          borderBottom: '1px solid var(--border-secondary)',
          background: 'rgba(51, 65, 85, 0.1)',
        }}
      >
        Paste structured instructions for Copilot here. This is NOT for logs or output.
        <br />
        Use the Copy button to copy content to clipboard.
      </div>

      {/* Textarea */}
      <div style={{ flex: 1, padding: '1rem', overflow: 'hidden' }}>
        <textarea
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
          placeholder="Paste your Copilot prompt here...

Example:
COPILOT — PHASE 21 EXTENSION
TITLE: Next Feature Set

================================
1. FEATURE NAME
================================
- Description
- Requirements
- Constraints
"
          style={{
            width: '100%',
            height: '100%',
            minHeight: '300px',
            resize: 'vertical',
            padding: '0.75rem',
            fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
            fontSize: '0.8125rem',
            lineHeight: 1.6,
            color: 'var(--text-primary)',
            backgroundColor: 'rgba(20, 24, 32, 0.8)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-sm, 4px)',
            outline: 'none',
          }}
        />
      </div>

      {/* Footer with actions */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.75rem 1rem',
          borderTop: '1px solid var(--border-primary)',
          background: 'rgba(20, 24, 32, 0.95)',
        }}
      >
        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
          {promptText.length} characters
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Button variant="ghost" size="sm" onClick={handleClear} disabled={!promptText}>
            Clear
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleCopy}
            disabled={!promptText}
          >
            {copied ? '✓ Copied!' : 'Copy'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// Backdrop overlay component
export function CopilotPromptBackdrop({
  isOpen,
  onClick,
}: {
  isOpen: boolean
  onClick: () => void
}) {
  if (!isOpen) return null

  return (
    <div
      onClick={onClick}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: 999,
      }}
    />
  )
}

export default CopilotPromptWindow
