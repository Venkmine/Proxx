/**
 * WorkspaceLayout — 4-Region Persistent Workspace Layout
 * 
 * Layout structure:
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ Header                                                               │
 * ├──────────────┬─────────────────────────────────┬────────────────────┤
 * │              │         CENTRE TOP              │                    │
 * │   LEFT       │   (VisualPreviewWorkspace)      │     RIGHT          │
 * │   SIDEBAR    ├─────────── ═══════ ─────────────┤     SIDEBAR        │
 * │   (~320px)   │         CENTRE BOTTOM           │     (~380px)       │
 * │              │        (Queue Panel)            │                    │
 * ├──────────────┴─────────────────────────────────┴────────────────────┤
 * │ Footer                                                               │
 * └─────────────────────────────────────────────────────────────────────┘
 * 
 * Desktop-only layout. No responsive collapsing.
 * Minimum supported width: 1280px.
 * 
 * The horizontal splitter between centre-top and centre-bottom is draggable.
 * Splitter ratio persists in localStorage.
 */

import React, { useState, useCallback, useRef, useEffect, ReactNode } from 'react'

// ============================================================================
// CONSTANTS
// ============================================================================

const LEFT_SIDEBAR_WIDTH = 352
const RIGHT_SIDEBAR_WIDTH = 418
const SPLITTER_HEIGHT = 6
const MIN_CENTRE_TOP_HEIGHT = 200
const MIN_CENTRE_BOTTOM_HEIGHT = 150
// Alpha layout fix: Give more space to queue by default (55% preview / 45% queue)
const DEFAULT_SPLITTER_RATIO = 0.55
const STORAGE_KEY = 'awaire_proxy_workspace_splitter_ratio'

// ============================================================================
// TYPES
// ============================================================================

interface WorkspaceLayoutProps {
  /** Left sidebar content (Sources, Volumes, drag-and-drop) */
  leftSidebar: ReactNode
  /** Right sidebar content (DeliverControlPanel, presets, settings) */
  rightSidebar: ReactNode
  /** Centre top content (VisualPreviewWorkspace) */
  centreTop: ReactNode
  /** Centre bottom content (Queue panel) */
  centreBottom: ReactNode
  /** Optional callback when splitter ratio changes */
  onSplitterRatioChange?: (ratio: number) => void
}

// ============================================================================
// COMPONENT
// ============================================================================

export function WorkspaceLayout({
  leftSidebar,
  rightSidebar,
  centreTop,
  centreBottom,
  onSplitterRatioChange,
}: WorkspaceLayoutProps) {
  // Load persisted splitter ratio from localStorage
  const [splitterRatio, setSplitterRatio] = useState<number>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = parseFloat(stored)
      if (!isNaN(parsed) && parsed >= 0.2 && parsed <= 0.9) {
        return parsed
      }
    }
    return DEFAULT_SPLITTER_RATIO
  })

  const [isDragging, setIsDragging] = useState(false)
  const centreContainerRef = useRef<HTMLDivElement>(null)

  // Persist splitter ratio to localStorage
  const persistRatio = useCallback((ratio: number) => {
    localStorage.setItem(STORAGE_KEY, ratio.toString())
    onSplitterRatioChange?.(ratio)
  }, [onSplitterRatioChange])

  // Handle splitter drag start
  const handleSplitterMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  // Handle splitter drag
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !centreContainerRef.current) return

    const rect = centreContainerRef.current.getBoundingClientRect()
    const containerHeight = rect.height
    const relativeY = e.clientY - rect.top

    // Calculate new ratio with constraints
    let newRatio = relativeY / containerHeight

    // Enforce minimum heights
    const minTopRatio = MIN_CENTRE_TOP_HEIGHT / containerHeight
    const maxTopRatio = 1 - (MIN_CENTRE_BOTTOM_HEIGHT / containerHeight)

    newRatio = Math.max(minTopRatio, Math.min(maxTopRatio, newRatio))

    setSplitterRatio(newRatio)
  }, [isDragging])

  // Handle splitter drag end
  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false)
      persistRatio(splitterRatio)
    }
  }, [isDragging, splitterRatio, persistRatio])

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
      data-testid="workspace-layout"
      style={{
        display: 'flex',
        flex: 1,
        overflow: 'hidden',
        minWidth: '1280px', // Desktop-only
      }}
    >
      {/* LEFT SIDEBAR — Fixed width ~320px */}
      <aside
        data-testid="left-sidebar"
        style={{
          width: `${LEFT_SIDEBAR_WIDTH}px`,
          minWidth: `${LEFT_SIDEBAR_WIDTH}px`,
          maxWidth: `${LEFT_SIDEBAR_WIDTH}px`,
          borderRight: '1px solid var(--border-primary)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'linear-gradient(180deg, rgba(26, 32, 44, 0.95) 0%, rgba(20, 24, 32, 0.95) 100%)',
        }}
      >
        {leftSidebar}
      </aside>

      {/* CENTRE REGION — Flexible width, vertically split */}
      <div
        ref={centreContainerRef}
        data-testid="centre-region"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
          background: 'var(--card-bg-solid, rgba(16, 18, 20, 0.98))',
        }}
      >
        {/* CENTRE TOP — VisualPreviewWorkspace */}
        <div
          data-testid="centre-top"
          style={{
            flex: `0 0 ${splitterRatio * 100}%`,
            minHeight: `${MIN_CENTRE_TOP_HEIGHT}px`,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {centreTop}
        </div>

        {/* HORIZONTAL SPLITTER */}
        <div
          data-testid="workspace-splitter"
          onMouseDown={handleSplitterMouseDown}
          style={{
            flex: `0 0 ${SPLITTER_HEIGHT}px`,
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
            zIndex: 10,
          }}
        >
          {/* Visual grip indicator */}
          <div
            style={{
              width: '48px',
              height: '3px',
              borderRadius: '2px',
              background: isDragging
                ? 'var(--button-primary-bg)'
                : 'var(--border-secondary)',
            }}
          />
        </div>

        {/* CENTRE BOTTOM — Queue */}
        <div
          data-testid="centre-bottom"
          style={{
            flex: 1,
            minHeight: `${MIN_CENTRE_BOTTOM_HEIGHT}px`,
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {centreBottom}
        </div>
      </div>

      {/* RIGHT SIDEBAR — Fixed width ~380px */}
      <aside
        data-testid="right-sidebar"
        style={{
          width: `${RIGHT_SIDEBAR_WIDTH}px`,
          minWidth: `${RIGHT_SIDEBAR_WIDTH}px`,
          maxWidth: `${RIGHT_SIDEBAR_WIDTH}px`,
          borderLeft: '1px solid var(--border-primary)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'linear-gradient(180deg, rgba(26, 32, 44, 0.95) 0%, rgba(20, 24, 32, 0.95) 100%)',
        }}
      >
        {rightSidebar}
      </aside>
    </div>
  )
}

export default WorkspaceLayout
