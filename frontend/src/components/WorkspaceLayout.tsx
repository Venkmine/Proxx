/**
 * WorkspaceLayout — 3-Zone IMMUTABLE Rigid Layout
 * 
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │                           HEADER                                     │
 * ├──────────────┬─────────────────────────────────┬────────────────────┤
 * │              │                                 │                    │
 * │   LEFT       │    CENTER (MONITOR SURFACE)    │     RIGHT          │
 * │   352px      │    Full-bleed visual anchor    │     420px          │
 * │   IMMUTABLE  │    Fills remaining space       │   IMMUTABLE        │
 * │   Sources    │    No card/panel borders       │  Settings/Queue    │
 * │              │                                 │     [tabbed]       │
 * │              │                                 │                    │
 * ├──────────────┴─────────────────────────────────┴────────────────────┤
 * │                           FOOTER                                     │
 * └─────────────────────────────────────────────────────────────────────┘
 * 
 * ╔═══════════════════════════════════════════════════════════════════════╗
 * ║                         IMMUTABLE INVARIANTS                          ║
 * ╠═══════════════════════════════════════════════════════════════════════╣
 * ║  1. LEFT zone is EXACTLY 352px — never resizes                        ║
 * ║  2. RIGHT zone is EXACTLY 420px — never resizes                       ║
 * ║  3. CENTER (Monitor Surface) fills remaining — edge-to-edge           ║
 * ║  4. Queue NEVER resizes Monitor                                       ║
 * ║  5. Monitor NEVER resizes due to jobs                                 ║
 * ║  6. NO animations on layout zones                                     ║
 * ║  7. NO dynamic resizing — zones are rigid                             ║
 * ║  8. StatusLog floats independently (fixed position, not in layout)    ║
 * ╚═══════════════════════════════════════════════════════════════════════╝
 * 
 * Desktop-only layout. Minimum supported width: 1280px.
 */

import { useState, useEffect, ReactNode } from 'react'

// ============================================================================
// IMMUTABLE ZONE DIMENSIONS
// ============================================================================

/** LEFT zone width - IMMUTABLE, do not change */
const LEFT_ZONE_WIDTH = 352

/** RIGHT zone width - IMMUTABLE, do not change */
const RIGHT_ZONE_WIDTH = 420

// ============================================================================
// TYPES
// ============================================================================

export type RightPanelTab = 'settings' | 'queue'

interface WorkspaceLayoutProps {
  /** Left zone content (Sources) */
  leftZone: ReactNode
  /** Center zone content (Preview ONLY) */
  centerZone: ReactNode
  /** Right zone settings content (DeliverControlPanel) */
  rightZoneSettings: ReactNode
  /** Right zone queue content (Queue panel) */
  rightZoneQueue: ReactNode
  /** Phase REBUILD: Controlled active tab (optional, for external control) */
  activeTab?: RightPanelTab
  /** Phase REBUILD: Tab change callback */
  onTabChange?: (tab: RightPanelTab) => void
  /** Phase REBUILD: Job count (to auto-switch to queue when jobs exist) */
  jobCount?: number
}

// ============================================================================
// COMPONENT
// ============================================================================

export function WorkspaceLayout({
  leftZone,
  centerZone,
  rightZoneSettings,
  rightZoneQueue,
  activeTab: controlledTab,
  onTabChange,
  jobCount = 0,
}: WorkspaceLayoutProps) {
  // Use controlled tab if provided, otherwise internal state
  const [internalTab, setInternalTab] = useState<RightPanelTab>('settings')
  const activeTab = controlledTab ?? internalTab
  
  const handleTabChange = (tab: RightPanelTab) => {
    if (onTabChange) {
      onTabChange(tab)
    } else {
      setInternalTab(tab)
    }
  }

  // Phase REBUILD: Auto-switch to Queue tab when jobs exist (on mount only)
  useEffect(() => {
    if (jobCount > 0 && !controlledTab) {
      setInternalTab('queue')
    }
  }, []) // Only on mount

  return (
    <div
      data-testid="workspace-layout"
      style={{
        display: 'flex',
        flex: 1,
        overflow: 'hidden',
        minWidth: '1280px',
      }}
    >
      {/* LEFT ZONE — IMMUTABLE 352px, Sources */}
      <aside
        data-testid="left-zone"
        style={{
          width: `${LEFT_ZONE_WIDTH}px`,
          minWidth: `${LEFT_ZONE_WIDTH}px`,
          maxWidth: `${LEFT_ZONE_WIDTH}px`,
          flexShrink: 0,
          flexGrow: 0,
          borderRight: '1px solid var(--border-primary)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'linear-gradient(180deg, rgba(26, 32, 44, 0.95) 0%, rgba(20, 24, 32, 0.95) 100%)',
        }}
      >
        {leftZone}
      </aside>

      {/* CENTER ZONE — Full-bleed Monitor Surface, fills remaining space */}
      <main
        data-testid="center-zone"
        style={{
          flex: '1 1 auto',
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          /* True black background for monitor surface — no card styling */
          background: '#0a0b0d',
          /* No padding — monitor fills edge-to-edge */
          padding: 0,
        }}
      >
        {centerZone}
      </main>

      {/* RIGHT ZONE — IMMUTABLE 420px, Tabbed (Settings / Queue) */}
      <aside
        data-testid="right-zone"
        style={{
          width: `${RIGHT_ZONE_WIDTH}px`,
          minWidth: `${RIGHT_ZONE_WIDTH}px`,
          maxWidth: `${RIGHT_ZONE_WIDTH}px`,
          flexShrink: 0,
          flexGrow: 0,
          borderLeft: '1px solid var(--border-primary)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'linear-gradient(180deg, rgba(26, 32, 44, 0.95) 0%, rgba(20, 24, 32, 0.95) 100%)',
        }}
      >
        {/* Tab Bar */}
        <div
          data-testid="right-zone-tabs"
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border-primary)',
            background: 'rgba(20, 24, 32, 0.8)',
          }}
        >
          <button
            data-testid="tab-settings"
            onClick={() => handleTabChange('settings')}
            style={{
              flex: 1,
              padding: '0.625rem 1rem',
              border: 'none',
              background: activeTab === 'settings' 
                ? 'rgba(59, 130, 246, 0.1)' 
                : 'transparent',
              color: activeTab === 'settings' 
                ? 'var(--text-primary)' 
                : 'var(--text-muted)',
              fontFamily: 'var(--font-sans)',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              borderBottom: activeTab === 'settings' 
                ? '2px solid var(--button-primary-bg)' 
                : '2px solid transparent',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Settings
          </button>
          <button
            data-testid="tab-queue"
            onClick={() => handleTabChange('queue')}
            style={{
              flex: 1,
              padding: '0.625rem 1rem',
              border: 'none',
              background: activeTab === 'queue' 
                ? 'rgba(59, 130, 246, 0.1)' 
                : 'transparent',
              color: activeTab === 'queue' 
                ? 'var(--text-primary)' 
                : 'var(--text-muted)',
              fontFamily: 'var(--font-sans)',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              borderBottom: activeTab === 'queue' 
                ? '2px solid var(--button-primary-bg)' 
                : '2px solid transparent',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Queue
          </button>
        </div>

        {/* Tab Content */}
        <div
          data-testid="right-zone-content"
          style={{
            flex: 1,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {activeTab === 'settings' && (
            <div style={{ flex: 1, overflow: 'auto' }}>
              {rightZoneSettings}
            </div>
          )}
          {activeTab === 'queue' && (
            <div style={{ flex: 1, overflow: 'auto' }}>
              {rightZoneQueue}
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}

export default WorkspaceLayout
