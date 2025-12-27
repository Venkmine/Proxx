import React, { useState, useCallback } from 'react'

/**
 * GlobalDropZone — DEPRECATED (not used in UI)
 * 
 * @deprecated Drag & drop completely removed from UI for honesty.
 * Use explicit "Select Files" and "Select Folder" buttons instead.
 * 
 * This component is kept for reference but is not imported anywhere.
 * 
 * ============================================================================
 * V1 INTENTIONAL OMISSION: No drag & drop for file ingestion
 * ============================================================================
 * Why: Electron's drag & drop path extraction is platform-dependent and
 * failed silently on network drives. The "Select Files" button uses the
 * native dialog which reliably returns absolute paths.
 * 
 * If you are about to reintroduce drag & drop, stop and read DECISIONS.md.
 * ============================================================================
 */

interface GlobalDropZoneProps {
  /** Whether the overlay is visible */
  isVisible: boolean
  /** Callback when files are dropped (adds to source list) */
  onDropFiles: (files: string[]) => void
  /** Callback when a folder is dropped (sets output directory) */
  onDropOutputDirectory: (dir: string) => void
  /** Callback when drag leaves the overlay */
  onDragLeave: (e: React.DragEvent) => void
}

// ============================================================================
// PATH UTILITIES
// ============================================================================

/** Check if a path is absolute */
function isAbsolutePath(p: string): boolean {
  return p.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(p)
}

/** Extract valid absolute paths from a DragEvent's dataTransfer */
function extractPaths(e: React.DragEvent): string[] {
  const paths: string[] = []
  const items = e.dataTransfer.items
  
  if (items) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) {
          const path = (file as any).path
          if (path && isAbsolutePath(path)) {
            paths.push(path)
          }
        }
      }
    }
  } else {
    const files = e.dataTransfer.files
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const path = (file as any).path
      if (path && isAbsolutePath(path)) {
        paths.push(path)
      }
    }
  }
  
  return paths
}

/** Normalize and deduplicate paths */
function normalizePaths(paths: string[]): string[] {
  return [...new Set(paths)].sort()
}

// ============================================================================
// COMPONENT
// ============================================================================

export function GlobalDropZone({
  isVisible,
  onDropFiles,
  onDropOutputDirectory,
  onDragLeave,
}: GlobalDropZoneProps) {
  const [hoverZone, setHoverZone] = useState<'files' | 'output' | null>(null)

  if (!isVisible) return null

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDropFiles = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setHoverZone(null)
    
    const paths = extractPaths(e)
    // Use same normalization as browse selection
    onDropFiles(normalizePaths(paths))
  }, [onDropFiles])

  const handleDropOutput = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setHoverZone(null)
    
    const paths = extractPaths(e)
    // Take first path as output directory (if any)
    if (paths.length > 0) {
      onDropOutputDirectory(paths[0])
    } else {
      // Still need to trigger parent to hide overlay
      onDropFiles([])
    }
  }, [onDropOutputDirectory, onDropFiles])

  const zoneBaseStyle: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
    border: '3px dashed var(--border-primary)',
    borderRadius: 'var(--radius-lg, 12px)',
    backgroundColor: 'rgba(51, 65, 85, 0.1)',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
  }

  const zoneActiveStyle: React.CSSProperties = {
    borderColor: 'var(--button-primary-bg)',
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
  }

  return (
    <div
      data-testid="global-drop-zone"
      onDragOver={handleDragOver}
      onDragLeave={onDragLeave}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
      }}
    >
      <div style={{
        display: 'flex',
        gap: '2rem',
        width: '100%',
        maxWidth: '900px',
        height: '300px',
      }}>
        {/* Source Files Drop Zone */}
        <div
          data-testid="drop-zone-sources"
          onDragOver={(e) => { handleDragOver(e); setHoverZone('files') }}
          onDragLeave={() => setHoverZone(null)}
          onDrop={handleDropFiles}
          style={{
            ...zoneBaseStyle,
            ...(hoverZone === 'files' ? zoneActiveStyle : {}),
          }}
        >
          <div style={{
            fontSize: '3rem',
            marginBottom: '1rem',
            opacity: 0.8,
          }}>
            🎬
          </div>
          <div style={{
            fontSize: '1.125rem',
            fontWeight: 600,
            color: hoverZone === 'files' ? 'var(--button-primary-bg)' : 'var(--text-primary)',
            marginBottom: '0.5rem',
            fontFamily: 'var(--font-sans)',
          }}>
            Drop source media here
          </div>
          <div style={{
            fontSize: '0.8125rem',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-sans)',
            textAlign: 'center',
          }}>
            Video and audio files to transcode
          </div>
        </div>

        {/* Output Directory Drop Zone */}
        <div
          data-testid="drop-zone-output"
          onDragOver={(e) => { handleDragOver(e); setHoverZone('output') }}
          onDragLeave={() => setHoverZone(null)}
          onDrop={handleDropOutput}
          style={{
            ...zoneBaseStyle,
            ...(hoverZone === 'output' ? zoneActiveStyle : {}),
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
            fontSize: '1.125rem',
            fontWeight: 600,
            color: hoverZone === 'output' ? 'var(--button-primary-bg)' : 'var(--text-primary)',
            marginBottom: '0.5rem',
            fontFamily: 'var(--font-sans)',
          }}>
            Drop output folder here
          </div>
          <div style={{
            fontSize: '0.8125rem',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-sans)',
            textAlign: 'center',
          }}>
            Destination for transcoded files
          </div>
        </div>
      </div>
    </div>
  )
}

export default GlobalDropZone
