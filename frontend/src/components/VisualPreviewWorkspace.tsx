/**
 * VisualPreviewWorkspace — Full-Bleed Preview Panel
 * 
 * PRESENTATION STATES (v1 REBUILD):
 * This component implements 5 explicit preview states with full-bleed rendering.
 * No video playback, no thumbnails, no progress percentages.
 * 
 * STATE A — No sources selected
 * STATE B — Sources selected, preflight not run
 * STATE C — Preflight complete
 * STATE D — Job running
 * STATE E — Job completed
 * 
 * ============================================================================
 * DESIGN PHILOSOPHY
 * ============================================================================
 * - Full-bleed: No nested cards, no panel-within-panel
 * - Edge-to-edge content with fixed 16:9 aspect container centered vertically
 * - Never shows "Unsupported", empty white/grey space, or debug placeholders
 * - All overlays are visually subtle and non-obstructive
 * - Uses existing design tokens only
 * 
 * See: docs/PREVIEW_AND_PROGRESS_PHILOSOPHY.md
 * ============================================================================
 */

import { useRef, useEffect } from 'react'
import type { OverlaySettings } from './DeliverControlPanel'

// ============================================================================
// TYPES
// ============================================================================
export type PreviewMode = 'view'

/**
 * Preview state definitions:
 * - 'no-source': STATE A — No sources selected
 * - 'awaiting-validation': STATE B — Sources selected, preflight not run
 * - 'preflight-complete': STATE C — Preflight complete, metadata available
 * - 'job-running': STATE D — Job is actively encoding
 * - 'job-completed': STATE E — Job finished
 */
export type PreviewState = 
  | 'no-source'
  | 'awaiting-validation'
  | 'preflight-complete'
  | 'job-running'
  | 'job-completed'

interface SourceMetadata {
  resolution?: string
  fps?: string
  duration?: string
  codec?: string
  timecode_start?: string
  timecode_end?: string
  frames?: number
  container?: string
  audio_codec?: string
  audio_channels?: number | string
  reel_name?: string
  aspect_ratio?: string
}

// Compact output settings for header row
interface OutputSummary {
  codec?: string
  container?: string
  resolution?: string
  fps?: string
  audio_codec?: string
  audio_channels?: number
}

// Job progress info (for STATE D)
interface JobProgressInfo {
  currentClip: number
  totalClips: number
  elapsedSeconds: number
  currentFilename?: string
}

// Job completion info (for STATE E)
interface JobCompletionInfo {
  outputCodec?: string
  outputResolution?: string
  outputDirectory?: string
}

interface VisualPreviewWorkspaceProps {
  /** Source file path for display */
  sourceFilePath?: string
  /** Whether a source is loaded */
  hasSource?: boolean
  /** Backend URL (kept for API compatibility, not used) */
  backendUrl?: string
  /** Overlay settings for rendering (preview-only, non-interactive) */
  overlaySettings?: OverlaySettings
  /** Output summary for compact header row */
  outputSummary?: OutputSummary
  /** Explicit preview state (derived from app state) */
  previewState?: PreviewState
  /** Source metadata (from preflight) */
  sourceMetadata?: SourceMetadata
  /** Job progress info (for running jobs) */
  jobProgress?: JobProgressInfo
  /** Job completion info (for completed jobs) */
  jobCompletion?: JobCompletionInfo
}

// ============================================================================
// HELPER: Format elapsed time as HH:MM:SS
// ============================================================================
function formatElapsedTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

// ============================================================================
// HELPER: Truncate path for display
// ============================================================================
function truncatePath(path: string, maxLength: number = 45): string {
  if (!path || path.length <= maxLength) return path || ''
  return '...' + path.slice(-maxLength + 3)
}

// ============================================================================
// COMPONENT
// ============================================================================

export function VisualPreviewWorkspace({
  sourceFilePath,
  hasSource = false,
  backendUrl: _backendUrl = 'http://127.0.0.1:8085',
  overlaySettings: _overlaySettings,
  outputSummary: _outputSummary,
  previewState = 'no-source',
  sourceMetadata,
  jobProgress,
  jobCompletion,
}: VisualPreviewWorkspaceProps) {
  // Extract filename from path
  const fileName = sourceFilePath ? sourceFilePath.split('/').pop() : null
  
  // Refs
  const workspaceRef = useRef<HTMLDivElement>(null)

  // Derive the effective preview state if not explicitly provided
  const effectiveState: PreviewState = (() => {
    if (previewState !== 'no-source') return previewState
    if (!hasSource) return 'no-source'
    if (sourceMetadata?.codec) return 'preflight-complete'
    return 'awaiting-validation'
  })()

  // Reset any state when source changes
  useEffect(() => {
    // No stateful cleanup needed in simplified component
  }, [sourceFilePath])

  // ============================================================================
  // RENDER: Full-Bleed Preview Container
  // ============================================================================
  return (
    <div
      ref={workspaceRef}
      data-testid="visual-preview-workspace"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        background: '#0a0b0d', // True black for full-bleed
        position: 'relative',
      }}
    >
      {/* Full-Bleed Preview Area - Centered 16:9 Container */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          minHeight: 0, // Important for flex shrinking
        }}
      >
        {/* 16:9 Aspect Ratio Container */}
        <div
          data-testid="preview-viewport-container"
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: '100%',
            aspectRatio: '16 / 9',
            background: effectiveState === 'no-source' 
              ? 'transparent'  // Transparent for logo state
              : '#000000',     // True black for all other states
            borderRadius: effectiveState === 'no-source' ? 0 : '2px',
            overflow: 'hidden',
          }}
        >
          {/* ============================================ */}
          {/* STATE A: No sources selected */}
          {/* ============================================ */}
          {effectiveState === 'no-source' && (
            <div
              data-testid="preview-state-no-source"
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '1rem',
              }}
            >
              {/* Awaire / Forge Logo at 15% opacity */}
              <div style={{ opacity: 0.15, marginBottom: '0.5rem' }}>
                <img
                  src="/branding/awaire-logo.png"
                  alt="Forge"
                  style={{
                    height: '3rem',
                    width: 'auto',
                    filter: 'grayscale(100%)',
                  }}
                  onError={(e) => {
                    // Fallback to text if image fails
                    (e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
              </div>
              <span
                style={{
                  fontSize: '0.8125rem',
                  color: 'var(--text-dim)',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                Select files or folders to begin
              </span>
            </div>
          )}

          {/* ============================================ */}
          {/* STATE B: Sources selected, awaiting validation */}
          {/* ============================================ */}
          {effectiveState === 'awaiting-validation' && (
            <div
              data-testid="preview-state-awaiting-validation"
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {/* Black 16:9 rectangle is the container itself */}
              
              {/* Bottom-left overlay */}
              <div
                style={{
                  position: 'absolute',
                  bottom: '0.75rem',
                  left: '0.75rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem',
                }}
              >
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {fileName || 'Unknown file'}
                </span>
                <span
                  style={{
                    fontSize: '0.625rem',
                    fontFamily: 'var(--font-sans)',
                    color: 'var(--text-dim)',
                    fontStyle: 'italic',
                  }}
                >
                  Awaiting validation
                </span>
              </div>

              {/* Disabled scrub bar (visual only) */}
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: '4px',
                  background: 'rgba(255, 255, 255, 0.1)',
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
          {/* STATE C: Preflight complete */}
          {/* ============================================ */}
          {effectiveState === 'preflight-complete' && (
            <div
              data-testid="preview-state-preflight-complete"
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {/* Bottom-left metadata overlay */}
              <div
                style={{
                  position: 'absolute',
                  bottom: '0.75rem',
                  left: '0.75rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem',
                  padding: '0.5rem 0.625rem',
                  background: 'rgba(0, 0, 0, 0.65)',
                  borderRadius: '4px',
                  backdropFilter: 'blur(4px)',
                }}
              >
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-primary)',
                    fontWeight: 500,
                  }}
                >
                  {fileName || 'Unknown file'}
                </span>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.5rem 0.875rem',
                    fontSize: '0.625rem',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-muted)',
                  }}
                >
                  {sourceMetadata?.codec && (
                    <span>{sourceMetadata.codec}</span>
                  )}
                  {sourceMetadata?.resolution && (
                    <span>{sourceMetadata.resolution}</span>
                  )}
                  {sourceMetadata?.fps && (
                    <span>{sourceMetadata.fps}</span>
                  )}
                  {sourceMetadata?.duration && (
                    <span>{sourceMetadata.duration}</span>
                  )}
                  {sourceMetadata?.audio_channels && (
                    <span>{sourceMetadata.audio_channels}ch audio</span>
                  )}
                </div>
              </div>

              {/* Disabled scrub bar (visual only) */}
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: '4px',
                  background: 'rgba(255, 255, 255, 0.1)',
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

              {/* Preview Only label */}
              <div
                style={{
                  position: 'absolute',
                  top: '0.75rem',
                  right: '0.75rem',
                  padding: '0.25rem 0.5rem',
                  background: 'rgba(100, 116, 139, 0.4)',
                  borderRadius: '3px',
                  fontSize: '0.5625rem',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Preview only
              </div>
            </div>
          )}

          {/* ============================================ */}
          {/* STATE D: Job running */}
          {/* ============================================ */}
          {effectiveState === 'job-running' && (
            <div
              data-testid="preview-state-job-running"
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {/* Center encoding indicator with subtle pulse */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.75rem',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.625rem',
                    padding: '0.625rem 1rem',
                    background: 'rgba(59, 130, 246, 0.15)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    borderRadius: '6px',
                    animation: 'pulse 2s ease-in-out infinite',
                  }}
                >
                  {/* Spinner */}
                  <span
                    style={{
                      display: 'inline-block',
                      width: '0.875rem',
                      height: '0.875rem',
                      borderRadius: '50%',
                      border: '2px solid var(--text-muted)',
                      borderTopColor: 'var(--button-primary-bg)',
                      animation: 'spin 1s linear infinite',
                    }}
                  />
                  <span
                    style={{
                      fontSize: '0.8125rem',
                      fontFamily: 'var(--font-sans)',
                      color: 'var(--text-primary)',
                      fontWeight: 500,
                    }}
                  >
                    Encoding clip {jobProgress?.currentClip || 1} of {jobProgress?.totalClips || 1}
                  </span>
                </div>

                {/* Elapsed time */}
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-muted)',
                  }}
                >
                  Elapsed: {formatElapsedTime(jobProgress?.elapsedSeconds || 0)}
                </span>
              </div>

              {/* Current clip filename at bottom */}
              {jobProgress?.currentFilename && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '0.75rem',
                    left: '0.75rem',
                    padding: '0.375rem 0.5rem',
                    background: 'rgba(0, 0, 0, 0.6)',
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
                    {jobProgress.currentFilename}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ============================================ */}
          {/* STATE E: Job completed */}
          {/* ============================================ */}
          {effectiveState === 'job-completed' && (
            <div
              data-testid="preview-state-job-completed"
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {/* Center completion indicator */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 0.875rem',
                    background: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    borderRadius: '6px',
                  }}
                >
                  <span style={{ fontSize: '1rem' }}>✓</span>
                  <span
                    style={{
                      fontSize: '0.8125rem',
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
                    gap: '0.75rem',
                    fontSize: '0.6875rem',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-muted)',
                  }}
                >
                  {jobCompletion?.outputCodec && (
                    <span>{jobCompletion.outputCodec}</span>
                  )}
                  {jobCompletion?.outputResolution && (
                    <span>{jobCompletion.outputResolution}</span>
                  )}
                </div>
              </div>

              {/* Output directory at bottom */}
              {jobCompletion?.outputDirectory && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '0.75rem',
                    left: '0.75rem',
                    right: '0.75rem',
                    padding: '0.375rem 0.5rem',
                    background: 'rgba(0, 0, 0, 0.6)',
                    borderRadius: '4px',
                  }}
                  title={jobCompletion.outputDirectory}
                >
                  <span
                    style={{
                      fontSize: '0.625rem',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-dim)',
                    }}
                  >
                    Output:
                  </span>
                  <span
                    style={{
                      fontSize: '0.625rem',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-secondary)',
                      marginLeft: '0.375rem',
                    }}
                  >
                    {truncatePath(jobCompletion.outputDirectory)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* CSS Keyframes for animations */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.85; }
        }
      `}</style>
    </div>
  )
}

export default VisualPreviewWorkspace
