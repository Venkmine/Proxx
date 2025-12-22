/**
 * SplitterPanel — Vertical splitter for resizable panel layout
 * 
 * Creates a draggable divider between two vertical sections.
 * Used for Sources (top) / Queue (bottom) split in the right panel.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react'

interface SplitterPanelProps {
  /** Top panel content */
  topContent: React.ReactNode
  /** Bottom panel content */
  bottomContent: React.ReactNode
  /** Initial split ratio (0-1, default 0.45 = 45% top) */
  initialRatio?: number
  /** Minimum top panel height in pixels */
  minTopHeight?: number
  /** Minimum bottom panel height in pixels */
  minBottomHeight?: number
  /** Callback when ratio changes */
  onRatioChange?: (ratio: number) => void
  /** Whether to show the splitter handle */
  showHandle?: boolean
  /** Test ID prefix */
  testIdPrefix?: string
}

export function SplitterPanel({
  topContent,
  bottomContent,
  initialRatio = 0.45,
  minTopHeight = 150,
  minBottomHeight = 220,
  onRatioChange,
  showHandle = true,
  testIdPrefix = 'splitter',
}: SplitterPanelProps) {
  const [ratio, setRatio] = useState(initialRatio)
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !containerRef.current) return
    
    const rect = containerRef.current.getBoundingClientRect()
    const containerHeight = rect.height
    const relativeY = e.clientY - rect.top
    
    // Calculate new ratio with constraints
    let newRatio = relativeY / containerHeight
    
    // Enforce minimum heights
    const minTopRatio = minTopHeight / containerHeight
    const maxTopRatio = 1 - (minBottomHeight / containerHeight)
    
    newRatio = Math.max(minTopRatio, Math.min(maxTopRatio, newRatio))
    
    setRatio(newRatio)
    onRatioChange?.(newRatio)
  }, [isDragging, minTopHeight, minBottomHeight, onRatioChange])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Add global mouse listeners when dragging
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'row-resize'
      document.body.style.userSelect = 'none'
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  return (
    <div
      ref={containerRef}
      data-testid={`${testIdPrefix}-container`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Top Panel */}
      <div
        data-testid={`${testIdPrefix}-top`}
        style={{
          flex: `0 0 ${ratio * 100}%`,
          minHeight: `${minTopHeight}px`,
          overflow: 'auto',
        }}
      >
        {topContent}
      </div>
      
      {/* Splitter Handle */}
      {showHandle && (
        <div
          data-testid={`${testIdPrefix}-handle`}
          onMouseDown={handleMouseDown}
          style={{
            flex: '0 0 6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'row-resize',
            background: isDragging 
              ? 'rgba(59, 130, 246, 0.3)' 
              : 'rgba(51, 65, 85, 0.3)',
            borderTop: '1px solid var(--border-primary)',
            borderBottom: '1px solid var(--border-primary)',
            transition: isDragging ? 'none' : 'background 0.15s',
          }}
        >
          {/* Visual grip indicator */}
          <div
            style={{
              width: '32px',
              height: '3px',
              borderRadius: '2px',
              background: isDragging 
                ? 'var(--button-primary-bg)' 
                : 'var(--border-secondary)',
            }}
          />
        </div>
      )}
      
      {/* Bottom Panel */}
      <div
        data-testid={`${testIdPrefix}-bottom`}
        style={{
          flex: '1 1 auto',
          minHeight: `${minBottomHeight}px`,
          overflow: 'auto',
        }}
      >
        {bottomContent}
      </div>
    </div>
  )
}

export default SplitterPanel
