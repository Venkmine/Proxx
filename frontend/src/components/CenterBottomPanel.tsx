/**
 * CenterBottomPanel — Vertical Split Below Player in Center Column
 * 
 * PURPOSE:
 * - Hosts OutputTab in the center column, below the player
 * - Provides explicit height allocation so content doesn't collapse
 * - Enables future expansion (tabs, resizing, etc.)
 * 
 * LAYOUT CONSTRAINTS:
 * - Fixed or minimum height (no zero-height collapse)
 * - Scrollable content if needed
 * - No overlap with player above
 * 
 * CURRENT CONTENT:
 * - OutputTab (skeleton, no behavior)
 * 
 * FUTURE EXPANSION:
 * - Tab system (Output, Timeline, etc.)
 * - Resizable divider
 * - Collapsible panel
 */

import { ReactNode } from 'react'

interface CenterBottomPanelProps {
  /** Panel content (OutputTab for now) */
  children: ReactNode
  /** Minimum height in pixels (default: 200) */
  minHeight?: number
}

export function CenterBottomPanel({
  children,
  minHeight = 200,
}: CenterBottomPanelProps) {
  return (
    <div
      data-testid="center-bottom-panel"
      style={{
        minHeight: `${minHeight}px`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderTop: '1px solid var(--border-primary)',
        background: 'rgba(20, 24, 32, 0.95)',
      }}
    >
      {children}
    </div>
  )
}
