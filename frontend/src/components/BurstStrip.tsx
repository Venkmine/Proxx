/**
 * BurstStrip — Horizontal Thumbnail Scrub Preview
 * 
 * ============================================================================
 * DESIGN PHILOSOPHY
 * ============================================================================
 * This component displays burst thumbnails as a horizontal scrub strip.
 * Users can hover/scrub to preview different frames.
 * 
 * Features:
 * - Horizontal strip below poster/video
 * - Hover/scrub switches displayed frame
 * - No playback controls — static frame preview only
 * - Clear label: "Thumbnail preview"
 * 
 * See: docs/PREVIEW_PIPELINE.md
 * ============================================================================
 */

import React, { useCallback, useState, useRef } from 'react'
import { BurstThumbnail } from '../hooks/useTieredPreview'

// ============================================================================
// TYPES
// ============================================================================

interface BurstStripProps {
  thumbnails: BurstThumbnail[]
  selectedIndex: number
  onSelectIndex: (index: number) => void
  sourceDuration: number | null
}

// ============================================================================
// STYLES
// ============================================================================

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.375rem',
    padding: '0.5rem 0.75rem',
    background: 'rgba(0, 0, 0, 0.6)',
    borderTop: '1px solid rgba(255, 255, 255, 0.1)',
  },
  
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  
  label: {
    fontSize: '0.625rem',
    fontFamily: 'var(--font-sans)',
    color: 'var(--text-dim, #6b7280)',
    letterSpacing: '0.05em',
    textTransform: 'uppercase' as const,
  },
  
  timestamp: {
    fontSize: '0.6875rem',
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-secondary, #9ca3af)',
  },
  
  strip: {
    display: 'flex',
    gap: '4px',
    overflowX: 'auto' as const,
    scrollbarWidth: 'none' as const,
    msOverflowStyle: 'none' as const,
  },
  
  thumbnail: {
    position: 'relative' as const,
    flex: '0 0 auto',
    width: '64px',
    height: '36px',
    borderRadius: '3px',
    overflow: 'hidden',
    cursor: 'pointer',
    transition: 'all 100ms ease',
    border: '2px solid transparent',
  },
  
  thumbnailSelected: {
    border: '2px solid var(--accent-primary, #3b82f6)',
    boxShadow: '0 0 8px rgba(59, 130, 246, 0.4)',
  },
  
  thumbnailHover: {
    border: '2px solid rgba(255, 255, 255, 0.4)',
  },
  
  image: {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
    background: '#1a1a1a',
  },
  
  index: {
    position: 'absolute' as const,
    bottom: '2px',
    right: '2px',
    fontSize: '0.5rem',
    fontFamily: 'var(--font-mono)',
    color: 'white',
    background: 'rgba(0, 0, 0, 0.6)',
    padding: '1px 3px',
    borderRadius: '2px',
  },
}

// ============================================================================
// HELPERS
// ============================================================================

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 100)
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
}

// ============================================================================
// COMPONENT
// ============================================================================

export function BurstStrip({
  thumbnails,
  selectedIndex,
  onSelectIndex,
  sourceDuration,
}: BurstStripProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  
  const handleClick = useCallback((index: number) => {
    onSelectIndex(index)
  }, [onSelectIndex])
  
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!stripRef.current) return
    
    const rect = stripRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left + stripRef.current.scrollLeft
    
    // Calculate which thumbnail is under cursor
    const thumbWidth = 68 // 64px + 4px gap
    const index = Math.floor(x / thumbWidth)
    
    if (index >= 0 && index < thumbnails.length) {
      setHoveredIndex(index)
      onSelectIndex(index)
    }
  }, [thumbnails.length, onSelectIndex])
  
  const handleMouseLeave = useCallback(() => {
    setHoveredIndex(null)
  }, [])
  
  if (thumbnails.length === 0) {
    return null
  }
  
  const currentThumb = thumbnails[selectedIndex]
  
  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.label}>Thumbnail Preview</span>
        {currentThumb && (
          <span style={styles.timestamp}>
            {formatTimestamp(currentThumb.timestamp)}
            {sourceDuration && ` / ${formatTimestamp(sourceDuration)}`}
          </span>
        )}
      </div>
      
      {/* Thumbnail strip */}
      <div 
        ref={stripRef}
        style={styles.strip}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {thumbnails.map((thumb, index) => {
          const isSelected = index === selectedIndex
          const isHovered = index === hoveredIndex && !isSelected
          
          return (
            <div
              key={thumb.index}
              style={{
                ...styles.thumbnail,
                ...(isSelected ? styles.thumbnailSelected : {}),
                ...(isHovered ? styles.thumbnailHover : {}),
              }}
              onClick={() => handleClick(index)}
            >
              <img
                src={thumb.url}
                alt={`Frame at ${formatTimestamp(thumb.timestamp)}`}
                style={styles.image}
                loading="lazy"
              />
              <span style={styles.index}>{index + 1}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default BurstStrip
