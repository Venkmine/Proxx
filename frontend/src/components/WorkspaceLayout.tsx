/**
 * WorkspaceLayout — 3-Zone IMMUTABLE Rigid Layout (Phase F: LOCKED FOR V1)
 * 
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │                           HEADER                                     │
 * ├──────────────┬─────────────────────────────────┬────────────────────┤
 * │              │                                 │                    │
 * │   LEFT       │    CENTER (MONITOR SURFACE)    │     RIGHT          │
 * │   352px      │    Full-bleed visual anchor    │     420px          │
 * │   IMMUTABLE  │    Fills remaining space       │   IMMUTABLE        │
 * │   Sources    │    No card/panel borders       │     Queue          │
 * │   Output     │                                 │   (no tabs)        │
 * │   Processing │                                 │                    │
 * │   Create Job │                                 │                    │
 * ├──────────────┴─────────────────────────────────┴────────────────────┤
 * │                           FOOTER                                     │
 * └─────────────────────────────────────────────────────────────────────┘
 * 
 * ╔═══════════════════════════════════════════════════════════════════════╗
 * ║                    PHASE F: V1 LOCKED INVARIANTS                      ║
 * ╠═══════════════════════════════════════════════════════════════════════╣
 * ║  1. LEFT zone is EXACTLY 352px — never resizes                        ║
 * ║  2. RIGHT zone is EXACTLY 420px — never resizes                       ║
 * ║  3. CENTER (Monitor Surface) fills remaining — edge-to-edge           ║
 * ║  4. Queue NEVER resizes Monitor                                       ║
 * ║  5. Monitor NEVER resizes due to jobs                                 ║
 * ║  6. NO animations on layout zones                                     ║
 * ║  7. NO dynamic resizing — zones are rigid                             ║
 * ║  8. StatusLog floats independently (fixed position, not in layout)    ║
 * ║  9. RIGHT panel is Queue ONLY — no tabs, no settings                  ║
 * ║ 10. Settings moved to left panel (Sources/Output/Processing)          ║
 * ╚═══════════════════════════════════════════════════════════════════════╝
 * 
 * Desktop-only layout. Minimum supported width: 1280px (13" laptop).
 */

import { ReactNode } from 'react'

// ============================================================================
// IMMUTABLE ZONE DIMENSIONS
// ============================================================================

/** LEFT zone width - IMMUTABLE, do not change */
const LEFT_ZONE_WIDTH = 400

/** RIGHT zone width - IMMUTABLE, do not change */
const RIGHT_ZONE_WIDTH = 480

// ============================================================================
// TYPES
// ============================================================================

interface WorkspaceLayoutProps {
  /** Left zone content (Sources + Output + Processing + Create Job) */
  leftZone: ReactNode
  /** Center zone content (MonitorSurface ONLY - no settings, no forms) */
  centerZone: ReactNode
  /** Right zone content (Queue ONLY - no settings tab) */
  rightZone: ReactNode
}

// ============================================================================
// COMPONENT
// ============================================================================

export function WorkspaceLayout({
  leftZone,
  centerZone,
  rightZone,
}: WorkspaceLayoutProps) {
  // Phase F: Simplified to queue-only right panel - no tabs needed

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
          /* NOTE: overflow visible to allow preview menu to float above adjacent panels */
          overflow: 'visible',
          position: 'relative',
          /* True black background for monitor surface — no card styling */
          background: '#0a0b0d',
          /* No padding — monitor fills edge-to-edge */
          padding: 0,
        }}
      >
        {centerZone}
      </main>

      {/* RIGHT ZONE — IMMUTABLE 420px, Queue ONLY (Phase F: No tabs) */}
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
        {/* Phase F: Queue always visible, no tabs */}
        {rightZone}
      </aside>
    </div>
  )
}

export default WorkspaceLayout
