/**
 * MonitorSurface — Full-Bleed Monitor Abstraction
 * 
 * ============================================================================
 * DESIGN PHILOSOPHY
 * ============================================================================
 * This component implements a "Monitor" abstraction — a passive display surface
 * that visualizes application state, NOT a media player.
 * 
 * Key principles:
 * - Full-bleed: No card borders, padding, or nested panels
 * - Edge-to-edge with centered 16:9 content area
 * - State-driven: Visual appearance is derived from app/job state
 * - Overlay-driven UI: All text/controls are positioned absolutely
 * - No playback: This is a state indicator, not a video decoder
 * 
 * VISUAL STATES:
 * 1. IDLE        - Dark neutral background + logo at ~12% opacity
 * 2. SOURCE_LOADED - Black 16:9 matte + metadata overlay + disabled scrub bar
 * 3. JOB_RUNNING   - Same matte + encoding progress overlay
 * 4. JOB_COMPLETE  - Same matte + output summary overlay
 * 
 * See: docs/MONITOR_SURFACE.md
 * ============================================================================
 */

import { useRef, useEffect, useState } from 'react'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Monitor visual states derived from app state.
 * These are presentation states, not data states.
 */
export type MonitorState = 
  | 'idle'           // No source, show branding
  | 'source-loaded'  // Source ready, show metadata
  | 'job-running'    // Job executing, show progress
  | 'job-complete'   // Job finished, show summary

export interface SourceMetadata {
  filename?: string
  codec?: string
  resolution?: string
  fps?: string
  duration?: string
  audioChannels?: number | string
}

export interface JobProgress {
  currentClip: number
  totalClips: number
  elapsedSeconds: number
  sourceFilename?: string
  outputCodec?: string
}

export interface JobResult {
  outputCodec?: string
  outputResolution?: string
  outputDirectory?: string
  totalClips?: number
  totalDuration?: string
}

interface MonitorSurfaceProps {
  /** Explicit monitor state — derived from app/job state externally */
  state: MonitorState
  /** Source metadata (for source-loaded state) */
  sourceMetadata?: SourceMetadata
  /** Job progress info (for job-running state) */
  jobProgress?: JobProgress
  /** Job result info (for job-complete state) */
  jobResult?: JobResult
}

// ============================================================================
// HELPERS
// ============================================================================

function formatElapsedTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

function truncatePath(path: string, maxLength: number = 50): string {
  if (!path || path.length <= maxLength) return path || ''
  return '...' + path.slice(-maxLength + 3)
}

// ============================================================================
// COMPONENT
// ============================================================================

export function MonitorSurface({
  state,
  sourceMetadata,
  jobProgress,
  jobResult,
}: MonitorSurfaceProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [logoError, setLogoError] = useState(false)
  
  // Reset logo error when state changes
  useEffect(() => {
    setLogoError(false)
  }, [state])

  // Determine if we're in a "content" state (not idle)
  const hasContent = state !== 'idle'

  return (
    <div
      ref={containerRef}
      data-testid="monitor-surface"
      style={{
        /* Full-bleed container — fills entire center zone */
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        position: 'relative',
        /* Dark neutral background for idle, true black for content states */
        background: hasContent ? '#000000' : '#0a0b0d',
      }}
    >
      {/* 16:9 Content Area — centered matte */}
      <div
        data-testid="monitor-viewport"
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 'calc((100vh - 120px) * 16 / 9)', // Maintain 16:9, account for header/footer
          aspectRatio: '16 / 9',
          background: hasContent ? '#000000' : 'transparent',
          borderRadius: hasContent ? '2px' : 0,
          overflow: 'hidden',
          /* Subtle shadow for content states to separate from background */
          boxShadow: hasContent ? '0 0 60px rgba(0, 0, 0, 0.5)' : 'none',
        }}
      >
        {/* ============================================ */}
        {/* STATE: IDLE — Logo branding */}
        {/* ============================================ */}
        {state === 'idle' && (
          <div
            data-testid="monitor-state-idle"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {!logoError ? (
              <img
                src="/branding/awaire-logo.png"
                alt=""
                draggable={false}
                style={{
                  height: '4rem',
                  width: 'auto',
                  opacity: 0.12,
                  filter: 'grayscale(100%)',
                  userSelect: 'none',
                  pointerEvents: 'none',
                }}
                onError={() => setLogoError(true)}
              />
            ) : (
              /* Fallback: Text-based logo if image fails */
              <span
                style={{
                  fontSize: '2rem',
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 300,
                  letterSpacing: '0.2em',
                  color: 'var(--text-dim)',
                  opacity: 0.25,
                  textTransform: 'uppercase',
                  userSelect: 'none',
                }}
              >
                Forge
              </span>
            )}
          </div>
        )}

        {/* ============================================ */}
        {/* STATE: SOURCE_LOADED — Metadata overlay */}
        {/* ============================================ */}
        {state === 'source-loaded' && sourceMetadata && (
          <div
            data-testid="monitor-state-source-loaded"
            style={{
              position: 'absolute',
              inset: 0,
            }}
          >
            {/* Bottom-left metadata overlay */}
            <div
              style={{
                position: 'absolute',
                bottom: '1rem',
                left: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.375rem',
                padding: '0.625rem 0.75rem',
                background: 'rgba(0, 0, 0, 0.75)',
                borderRadius: '4px',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              {/* Filename */}
              <span
                style={{
                  fontSize: '0.8125rem',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-primary)',
                  fontWeight: 500,
                }}
              >
                {sourceMetadata.filename || 'Unknown source'}
              </span>
              
              {/* Metadata row */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.5rem 1rem',
                  fontSize: '0.6875rem',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-muted)',
                }}
              >
                {sourceMetadata.codec && <span>{sourceMetadata.codec}</span>}
                {sourceMetadata.resolution && <span>{sourceMetadata.resolution}</span>}
                {sourceMetadata.fps && <span>{sourceMetadata.fps}</span>}
                {sourceMetadata.duration && <span>{sourceMetadata.duration}</span>}
                {sourceMetadata.audioChannels && (
                  <span>{sourceMetadata.audioChannels}ch</span>
                )}
              </div>
            </div>

            {/* Disabled scrub bar (visual affordance) */}
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: '3px',
                background: 'rgba(255, 255, 255, 0.08)',
              }}
            >
              <div
                style={{
                  width: '0%',
                  height: '100%',
                  background: 'var(--text-dim)',
                }}
              />
            </div>
          </div>
        )}

        {/* ============================================ */}
        {/* STATE: JOB_RUNNING — Progress overlay */}
        {/* ============================================ */}
        {state === 'job-running' && (
          <div
            data-testid="monitor-state-job-running"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Center encoding indicator */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '1rem',
              }}
            >
              {/* Encoding badge with pulse */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.75rem 1.25rem',
                  background: 'rgba(14, 116, 144, 0.2)',
                  border: '1px solid rgba(34, 211, 238, 0.35)',
                  borderRadius: '6px',
                  animation: 'monitorPulse 2.5s ease-in-out infinite',
                }}
              >
                {/* Spinner */}
                <span
                  style={{
                    display: 'inline-block',
                    width: '1rem',
                    height: '1rem',
                    borderRadius: '50%',
                    border: '2px solid var(--text-muted)',
                    borderTopColor: 'var(--status-running-fg)',
                    animation: 'monitorSpin 1s linear infinite',
                  }}
                />
                <span
                  style={{
                    fontSize: '0.875rem',
                    fontFamily: 'var(--font-sans)',
                    color: 'var(--text-primary)',
                    fontWeight: 500,
                  }}
                >
                  Encoding clip {jobProgress?.currentClip || 1} of {jobProgress?.totalClips || 1}
                </span>
              </div>

              {/* Transform indicator: source → output */}
              {jobProgress?.outputCodec && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.625rem',
                    fontSize: '0.75rem',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-muted)',
                  }}
                >
                  <span>{jobProgress.sourceFilename || 'source'}</span>
                  <span style={{ color: 'var(--text-dim)' }}>→</span>
                  <span style={{ color: 'var(--status-running-fg)' }}>
                    {jobProgress.outputCodec}
                  </span>
                </div>
              )}

              {/* Elapsed time */}
              <span
                style={{
                  fontSize: '0.8125rem',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-secondary)',
                }}
              >
                {formatElapsedTime(jobProgress?.elapsedSeconds || 0)}
              </span>
            </div>

            {/* Bottom-left: current source filename */}
            {jobProgress?.sourceFilename && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '1rem',
                  left: '1rem',
                  padding: '0.5rem 0.625rem',
                  background: 'rgba(0, 0, 0, 0.7)',
                  borderRadius: '4px',
                }}
              >
                <span
                  style={{
                    fontSize: '0.6875rem',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {jobProgress.sourceFilename}
                </span>
              </div>
            )}
          </div>
        )}

        {/* ============================================ */}
        {/* STATE: JOB_COMPLETE — Result overlay */}
        {/* ============================================ */}
        {state === 'job-complete' && (
          <div
            data-testid="monitor-state-job-complete"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Center completion badge */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.75rem',
              }}
            >
              {/* Success badge */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.625rem 1rem',
                  background: 'rgba(6, 78, 59, 0.25)',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                  borderRadius: '6px',
                }}
              >
                <span
                  style={{
                    fontSize: '1.125rem',
                    color: 'var(--status-completed-fg)',
                  }}
                >
                  ✓
                </span>
                <span
                  style={{
                    fontSize: '0.875rem',
                    fontFamily: 'var(--font-sans)',
                    color: 'var(--status-completed-fg)',
                    fontWeight: 500,
                  }}
                >
                  Completed
                </span>
              </div>

              {/* Output details */}
              <div
                style={{
                  display: 'flex',
                  gap: '1rem',
                  fontSize: '0.75rem',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-muted)',
                }}
              >
                {jobResult?.outputCodec && <span>{jobResult.outputCodec}</span>}
                {jobResult?.outputResolution && <span>{jobResult.outputResolution}</span>}
                {jobResult?.totalClips && (
                  <span>{jobResult.totalClips} clip{jobResult.totalClips > 1 ? 's' : ''}</span>
                )}
              </div>
            </div>

            {/* Bottom-left: output directory */}
            {jobResult?.outputDirectory && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '1rem',
                  left: '1rem',
                  right: '1rem',
                  padding: '0.5rem 0.625rem',
                  background: 'rgba(0, 0, 0, 0.7)',
                  borderRadius: '4px',
                }}
                title={jobResult.outputDirectory}
              >
                <span
                  style={{
                    fontSize: '0.625rem',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-dim)',
                    marginRight: '0.5rem',
                  }}
                >
                  Output:
                </span>
                <span
                  style={{
                    fontSize: '0.625rem',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {truncatePath(jobResult.outputDirectory)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* CSS Keyframes for animations */}
      <style>{`
        @keyframes monitorSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes monitorPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }
      `}</style>
    </div>
  )
}

export default MonitorSurface
