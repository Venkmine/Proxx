/**
 * JobDiagnosticsPanel — Hardening Pass (Alpha-only)
 * 
 * A collapsible, read-only panel that displays diagnostic information for a job.
 * Gated behind ALPHA_DIAGNOSTICS_ENABLED feature flag.
 * 
 * Displays:
 * - Job ID (full)
 * - Execution engine
 * - Output directory
 * - Settings snapshot (collapsed JSON)
 * - Overlay layer summary
 * - Last state transition + timestamp
 * - Last error message (if any)
 * - Preset source info with scope (Phase 7B)
 */

import { useState } from 'react'
import type { DeliverSettings, OverlayLayer } from './DeliverControlPanel'

// ============================================================================
// TYPES
// ============================================================================

// Phase 7B: Preset scope type
type PresetScope = 'user' | 'workspace'

interface JobDiagnosticsData {
  /** Full job ID */
  jobId: string
  /** Selected execution engine (e.g., 'ffmpeg') */
  engine?: string
  /** Output directory path */
  outputDirectory?: string
  /** Full DeliverSettings snapshot */
  settings?: DeliverSettings
  /** Current job status */
  status: string
  /** When the job was created */
  createdAt: string
  /** When the job started (if started) */
  startedAt?: string | null
  /** When the job completed (if completed) */
  completedAt?: string | null
  /** Last error message (if any) */
  lastError?: string | null
  /** Total task count */
  totalTasks: number
  /** Failed task count */
  failedCount: number
  /** Completed task count */
  completedCount: number
  
  // Phase 6: Preset source tracking
  /** ID of preset used at job creation (null = manual config) */
  sourcePresetId?: string | null
  /** Name of preset at creation time */
  sourcePresetName?: string | null
  /** SHA-256 fingerprint of settings snapshot */
  sourcePresetFingerprint?: string | null
  /** Phase 7B: Scope of preset (user or workspace) */
  sourcePresetScope?: PresetScope | null
}

interface JobDiagnosticsPanelProps {
  /** Diagnostic data for the job */
  data: JobDiagnosticsData
  /** Whether to show the panel */
  enabled?: boolean
}

// ============================================================================
// HELPERS
// ============================================================================

function formatTimestamp(isoString: string | null | undefined): string {
  if (!isoString) return '—'
  try {
    const date = new Date(isoString)
    return date.toLocaleString()
  } catch {
    return isoString
  }
}

function getOverlayLayerSummary(layers: OverlayLayer[] | undefined): string {
  if (!layers || layers.length === 0) return 'No layers configured'
  
  const enabledLayers = layers.filter(l => l.enabled)
  if (enabledLayers.length === 0) return `${layers.length} layer(s), all disabled`
  
  // Phase 7A: Include scope (Project vs Clip-level) per Alpha rules
  const details = enabledLayers.map(layer => {
    const typeLabel = layer.type.charAt(0).toUpperCase() + layer.type.slice(1)
    const scopeLabel = layer.scope === 'project' ? 'Project' : 'Clip'
    return `${typeLabel} (${scopeLabel})`
  })
  
  return `${enabledLayers.length} enabled: ${details.join(', ')}`
}

function inferLastTransition(data: JobDiagnosticsData): { state: string; timestamp: string } {
  const status = data.status.toUpperCase()
  
  if (data.completedAt && ['COMPLETED', 'COMPLETED_WITH_WARNINGS', 'FAILED', 'CANCELLED'].includes(status)) {
    return { state: status, timestamp: data.completedAt }
  }
  if (data.startedAt && ['RUNNING', 'PAUSED'].includes(status)) {
    return { state: status, timestamp: data.startedAt }
  }
  return { state: status, timestamp: data.createdAt }
}

// ============================================================================
// COMPONENT
// ============================================================================

export function JobDiagnosticsPanel({ data, enabled = true }: JobDiagnosticsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  
  if (!enabled) return null
  
  const lastTransition = inferLastTransition(data)
  const hasFailed = data.failedCount > 0 || data.status.toUpperCase() === 'FAILED'
  
  return (
    <div
      style={{
        marginTop: '0.5rem',
        borderRadius: 'var(--radius-sm, 4px)',
        border: '1px solid var(--border-secondary, #333)',
        backgroundColor: 'rgba(0, 0, 0, 0.15)',
        fontSize: '0.75rem',
        fontFamily: 'var(--font-mono, monospace)',
      }}
    >
      {/* Header — Click to expand */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 0.75rem',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-muted, #888)',
          textAlign: 'left',
        }}
      >
        <span
          style={{
            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s',
          }}
        >
          ▶
        </span>
        <span style={{ fontWeight: 500 }}>Diagnostics</span>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: '0.6875rem',
            opacity: 0.7,
          }}
        >
          {data.jobId.slice(0, 8)}
        </span>
      </button>
      
      {/* Expanded content */}
      {isExpanded && (
        <div
          style={{
            padding: '0.5rem 0.75rem',
            paddingTop: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.375rem',
          }}
        >
          {/* Job ID */}
          <DiagnosticRow label="Job ID" value={data.jobId} mono />
          
          {/* Phase 6/7A/7B: Preset Source with improved layout, scope, and helper text */}
          <div
            style={{
              marginTop: '0.25rem',
              marginBottom: '0.25rem',
              paddingTop: '0.375rem',
              paddingBottom: '0.375rem',
              borderTop: '1px solid var(--border-secondary, #333)',
              borderBottom: '1px solid var(--border-secondary, #333)',
            }}
          >
            {data.sourcePresetId ? (
              <>
                <div
                  style={{
                    display: 'flex',
                    gap: '0.5rem',
                    lineHeight: 1.4,
                    alignItems: 'center',
                  }}
                >
                  <span
                    style={{
                      color: 'var(--text-dim, #666)',
                      minWidth: '85px',
                      flexShrink: 0,
                    }}
                  >
                    Preset Name:
                  </span>
                  <span style={{ color: 'var(--text-secondary, #999)' }}>
                    {data.sourcePresetName || 'Unknown'}
                  </span>
                  {/* Phase 7B: Scope badge */}
                  {data.sourcePresetScope && (
                    <span
                      style={{
                        padding: '0.0625rem 0.25rem',
                        fontSize: '0.5rem',
                        fontWeight: 600,
                        background: data.sourcePresetScope === 'workspace' 
                          ? 'rgba(34, 197, 94, 0.15)' 
                          : 'rgba(59, 130, 246, 0.15)',
                        color: data.sourcePresetScope === 'workspace' 
                          ? 'rgb(34, 197, 94)' 
                          : 'var(--button-primary-bg, #3b82f6)',
                        borderRadius: '2px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.03em',
                        flexShrink: 0,
                      }}
                    >
                      {data.sourcePresetScope}
                    </span>
                  )}
                </div>
                <DiagnosticRow 
                  label="Preset ID" 
                  value={data.sourcePresetId} 
                  mono 
                />
                <DiagnosticRow 
                  label="Fingerprint" 
                  value={(data.sourcePresetFingerprint || 'N/A').slice(0, 16) + '...'} 
                  mono 
                  title="Unique identifier for the settings snapshot used by this job"
                />
              </>
            ) : (
              <DiagnosticRow 
                label="Configuration" 
                value="Manual configuration (no preset)" 
              />
            )}
            {/* Phase 8B: Plain language explanation of preset snapshot semantics */}
            <div
              style={{
                marginTop: '0.25rem',
                fontSize: '0.5625rem',
                color: 'var(--text-dim, #666)',
                fontStyle: 'italic',
                lineHeight: 1.4,
              }}
            >
              This job used a preset snapshot. The preset may have changed since job creation.
            </div>
          </div>
          
          {/* Engine */}
          <DiagnosticRow label="Engine" value={data.engine || 'Not specified'} />
          
          {/* Output Directory */}
          <DiagnosticRow
            label="Output"
            value={data.outputDirectory || 'Not set'}
            truncate
          />
          
          {/* Status & Progress */}
          <DiagnosticRow
            label="Status"
            value={`${data.status.toUpperCase()} (${data.completedCount}/${data.totalTasks} done, ${data.failedCount} failed)`}
            highlight={hasFailed ? 'error' : undefined}
          />
          
          {/* Last State Transition */}
          <DiagnosticRow
            label="Last Transition"
            value={`${lastTransition.state} at ${formatTimestamp(lastTransition.timestamp)}`}
          />
          
          {/* Last Error (if any) */}
          {data.lastError && (
            <DiagnosticRow
              label="Last Error"
              value={data.lastError}
              highlight="error"
            />
          )}
          
          {/* Overlay Layer Summary */}
          <DiagnosticRow
            label="Overlays"
            value={getOverlayLayerSummary(data.settings?.overlay?.layers)}
          />
          
          {/* Settings Snapshot (collapsed) */}
          {data.settings && (
            <div style={{ marginTop: '0.25rem' }}>
              <button
                onClick={() => setShowSettings(!showSettings)}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border-secondary, #333)',
                  borderRadius: 'var(--radius-sm, 4px)',
                  color: 'var(--text-muted, #888)',
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.6875rem',
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'left',
                }}
              >
                {showSettings ? '▼ Hide Settings JSON' : '▶ Show Settings JSON'}
              </button>
              
              {showSettings && (
                <pre
                  style={{
                    margin: 0,
                    marginTop: '0.375rem',
                    padding: '0.5rem',
                    backgroundColor: 'rgba(0, 0, 0, 0.2)',
                    borderRadius: 'var(--radius-sm, 4px)',
                    fontSize: '0.625rem',
                    lineHeight: 1.4,
                    overflow: 'auto',
                    maxHeight: '200px',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                  }}
                >
                  {JSON.stringify(data.settings, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface DiagnosticRowProps {
  label: string
  value: string
  mono?: boolean
  truncate?: boolean
  highlight?: 'error' | 'warning'
  title?: string  // Phase 8B: Tooltip for additional context
}

function DiagnosticRow({ label, value, mono, truncate, highlight, title }: DiagnosticRowProps) {
  return (
    <div
      style={{
        display: 'flex',
        gap: '0.5rem',
        lineHeight: 1.4,
      }}
    >
      <span
        style={{
          color: 'var(--text-dim, #666)',
          minWidth: '85px',
          flexShrink: 0,
        }}
      >
        {label}:
      </span>
      <span
        style={{
          color: highlight === 'error'
            ? 'var(--status-failed-fg, #ef4444)'
            : highlight === 'warning'
              ? 'var(--status-warning-fg, #f59e0b)'
              : 'var(--text-secondary, #999)',
          fontFamily: mono ? 'var(--font-mono, monospace)' : 'inherit',
          overflow: truncate ? 'hidden' : undefined,
          textOverflow: truncate ? 'ellipsis' : undefined,
          whiteSpace: truncate ? 'nowrap' : undefined,
          wordBreak: truncate ? undefined : 'break-word',
        }}
        title={title || (truncate ? value : undefined)}
      >
        {value}
      </span>
    </div>
  )
}

export default JobDiagnosticsPanel
