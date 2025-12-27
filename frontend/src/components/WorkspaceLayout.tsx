/**
 * WorkspaceLayout — 3-Zone IMMUTABLE Rigid Layout
 * 
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │                           HEADER                                     │
 * ├──────────────┬─────────────────────────────────┬────────────────────┤
 * │              │                                 │                    │
 * │   LEFT       │           CENTER                │     RIGHT          │
 * │   352px      │       (Preview ONLY)            │     420px          │
 * │   IMMUTABLE  │      fills remaining            │   IMMUTABLE        │
 * │   Sources    │                                 │  Settings/Queue    │
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
 * ║  3. CENTER (Preview) fills remaining — content-agnostic               ║
 * ║  4. Queue NEVER resizes Preview                                       ║
 * ║  5. Preview NEVER resizes due to jobs                                 ║
 * ║  6. NO animations on layout zones                                     ║
 * ║  7. NO dynamic resizing — zones are rigid                             ║
 * ║  8. StatusLog floats independently (fixed position, not in layout)    ║
 * ╚═══════════════════════════════════════════════════════════════════════╝
 * 
 * Desktop-only layout. Minimum supported width: 1280px.
 */

import { useState, ReactNode } from 'react'

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

type RightPanelTab = 'settings' | 'queue'

interface WorkspaceLayoutProps {
  /** Left zone content (Sources) */
  leftZone: ReactNode
  /** Center zone content (Preview ONLY) */
  centerZone: ReactNode
  /** Right zone settings content (DeliverControlPanel) */
  rightZoneSettings: ReactNode
  /** Right zone queue content (Queue panel) */
  rightZoneQueue: ReactNode
}

// ============================================================================
// COMPONENT
// ============================================================================

export function WorkspaceLayout({
  leftZone,
  centerZone,
  rightZoneSettings,
  rightZoneQueue,
}: WorkspaceLayoutProps) {
  const [activeTab, setActiveTab] = useState<RightPanelTab>('settings')

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

      {/* CENTER ZONE — Fills remaining space, Preview ONLY */}
      <main
        data-testid="center-zone"
        style={{
          flex: '1 1 auto',
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'var(--card-bg-solid, rgba(16, 18, 20, 0.98))',
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
            onClick={() => setActiveTab('settings')}
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
            onClick={() => setActiveTab('queue')}
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
