import React from 'react'

/**
 * GlobalDropZone — Full-viewport drag overlay (Phase 19)
 * 
 * Displays when files are being dragged anywhere over the app.
 * Fully masks underlying content with no bleed-through.
 * Clear drop affordance with visual feedback.
 */

interface GlobalDropZoneProps {
  isVisible: boolean
  onDrop: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
}

export function GlobalDropZone({ isVisible, onDrop, onDragLeave }: GlobalDropZoneProps) {
  if (!isVisible) return null

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        // Solid background to fully mask underlying content
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Drop target area */}
      <div
        style={{
          width: '80%',
          maxWidth: '600px',
          padding: '4rem 2rem',
          border: '3px dashed var(--button-primary-bg)',
          borderRadius: 'var(--radius-lg, 12px)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          textAlign: 'center',
        }}
      >
        <div style={{
          fontSize: '3rem',
          marginBottom: '1rem',
          opacity: 0.8,
        }}>
          📁
        </div>
        <div style={{
          fontSize: '1.25rem',
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: '0.5rem',
          fontFamily: 'var(--font-sans)',
        }}>
          Drop files anywhere
        </div>
        <div style={{
          fontSize: '0.875rem',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-sans)',
        }}>
          Files will be added to the Source & Intake queue
        </div>
      </div>
    </div>
  )
}

export default GlobalDropZone
