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
 * - Last error message (if any) — humanized for users
 * - Preset source info with scope (Phase 7B)
 * 
 * V1 Hardening:
 * - Failure reasons are mapped to human-readable messages
 * - No stack traces or raw Python errors shown to users
 */

import { useState } from 'react'
import type { DeliverSettings, OverlayLayer } from './DeliverControlPanel'

// ============================================================================
// FAILURE REASON MAPPING
// ============================================================================
// Maps technical error patterns to human-readable messages.
// This prevents raw Python errors from appearing in the UI.
// ============================================================================

function humanizeFailureReason(reason: string | null | undefined): string | null {
  if (!reason) return null
  
  // Normalize for pattern matching
  const normalized = reason.toLowerCase()
  
  // Output file issues
  if (normalized.includes('output file not found') || normalized.includes('output missing')) {
    return 'Output file was not created. Check disk space and permissions.'
  }
  if (normalized.includes('output collision') || normalized.includes('file exists')) {
    return 'Output file already exists. Change naming or enable overwrite.'
  }
  
  // FFmpeg specific
  if (normalized.includes('ffmpeg') && normalized.includes('not found')) {
    return 'FFmpeg is not installed or not in PATH.'
  }
  if (normalized.includes('exit code') || normalized.includes('non-zero')) {
    return 'Encoding failed. Check source file compatibility.'
  }
  
  // Permission issues
  if (normalized.includes('permission denied') || normalized.includes('access denied')) {
    return 'Permission denied. Check file and folder permissions.'
  }
  
  // Source file issues
  if (normalized.includes('source') && (normalized.includes('not found') || normalized.includes('missing'))) {
    return 'Source file not found. File may have been moved or deleted.'
  }
  if (normalized.includes('invalid') && normalized.includes('source')) {
    return 'Source file is invalid or corrupted.'
  }
  
  // Codec issues
  if (normalized.includes('codec') && (normalized.includes('unsupported') || normalized.includes('not supported'))) {
    return 'Unsupported codec. Try a different output format.'
  }
  
  // Generic execution failures - hide technical details
  if (normalized.includes('engine execution failed')) {
    return 'Encoding engine failed. See logs for details.'
  }
  
  // If the reason is short and readable, use it directly
  if (reason.length < 60 && !normalized.includes('traceback') && !normalized.includes('exception')) {
    return reason
  }
  
  // Fallback: truncate long technical messages
  return 'Encoding failed. Check system logs for details.'
}

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
  
  // FFmpeg capabilities (detection only)
  ffmpegCapabilities?: {
    hwaccels?: string[]
    encoders?: {
      gpu?: string[]
      cpu?: string[]
    }
    prores_gpu_supported?: boolean
    error?: string
  } | null
  
  // Execution policy (read-only explanation, V2 only)
  executionPolicy?: {
    execution_class?: string
    primary_engine?: string
    blocking_reasons?: string[]
    capability_summary?: {
      gpu_decode?: boolean
      gpu_encode?: boolean
      prores_gpu_supported?: boolean
    }
    alternatives?: Array<{
      engine?: string
      codec?: string
      tradeoff?: string
    }>
    confidence?: string
    error?: string
  } | null
  
  // Execution outcome (read-only classification)
  executionOutcome?: {
    job_state?: string
    total_clips?: number
    success_clips?: number
    failed_clips?: number
    skipped_clips?: number
    failure_types?: string[]
    summary?: string
    clip_failures?: Array<{
      task_id?: string
      failure_type?: string
      failure_reason?: string
    }> | null
    error?: string
  } | null
  
  // Execution event timeline (QC observability)
  executionEvents?: Array<{
    event_type: string
    timestamp: string
    clip_id?: string | null
    message?: string | null
  }> | null
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
  
  // V1: COMPLETED_WITH_WARNINGS removed - only COMPLETED, FAILED, CANCELLED are terminal
  if (data.completedAt && ['COMPLETED', 'FAILED', 'CANCELLED'].includes(status)) {
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
          
          {/* Last Error (if any) - humanized for user display */}
          {data.lastError && (
            <DiagnosticRow
              label="Last Error"
              value={humanizeFailureReason(data.lastError) || 'Unknown error'}
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
          
          {/* FFmpeg Hardware Capabilities (read-only detection) */}
          {data.ffmpegCapabilities && (
            <div
              style={{
                marginTop: '0.5rem',
                paddingTop: '0.5rem',
                borderTop: '1px solid var(--border-secondary, #333)',
              }}
            >
              <div
                style={{
                  color: 'var(--text-dim, #666)',
                  fontSize: '0.6875rem',
                  marginBottom: '0.375rem',
                  fontWeight: 500,
                }}
              >
                FFmpeg Hardware Capabilities
              </div>
              
              {/* GPU Decode */}
              <DiagnosticRow
                label="GPU Decode"
                value={
                  data.ffmpegCapabilities.hwaccels && data.ffmpegCapabilities.hwaccels.length > 0
                    ? data.ffmpegCapabilities.hwaccels.join(', ')
                    : 'None available'
                }
              />
              
              {/* GPU Encode */}
              <DiagnosticRow
                label="GPU Encode"
                value={
                  data.ffmpegCapabilities.encoders?.gpu && data.ffmpegCapabilities.encoders.gpu.length > 0
                    ? data.ffmpegCapabilities.encoders.gpu.join(', ')
                    : 'None available'
                }
              />
              
              {/* ProRes GPU (always NO) */}
              <DiagnosticRow
                label="ProRes GPU"
                value={
                  data.ffmpegCapabilities.prores_gpu_supported
                    ? '❌ YES (unexpected!)'
                    : '❌ NO (CPU only in FFmpeg)'
                }
              />
              
              {/* Detection error */}
              {data.ffmpegCapabilities.error && (
                <div
                  style={{
                    marginTop: '0.25rem',
                    padding: '0.375rem',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    borderRadius: 'var(--radius-sm, 4px)',
                    fontSize: '0.625rem',
                    color: 'var(--status-failed-fg, #ef4444)',
                  }}
                >
                  Detection Error: {data.ffmpegCapabilities.error}
                </div>
              )}
              
              {/* Informational note */}
              <div
                style={{
                  marginTop: '0.375rem',
                  padding: '0.375rem',
                  backgroundColor: 'rgba(59, 130, 246, 0.1)',
                  borderRadius: 'var(--radius-sm, 4px)',
                  fontSize: '0.625rem',
                  lineHeight: 1.4,
                  color: 'var(--text-muted, #888)',
                }}
              >
                ℹ️ Detection only — does not affect execution behavior.
                <br />
                FFmpeg GPU ≠ Resolve GPU. ProRes always uses CPU in FFmpeg.
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Execution Policy (Read-Only) */}
      {data.executionPolicy && (
        <div
          style={{
            marginTop: '1rem',
            padding: '0.75rem',
            backgroundColor: 'var(--panel-bg-secondary, rgba(255, 255, 255, 0.03))',
            borderRadius: 'var(--radius-md, 8px)',
            border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
          }}
        >
          <h4
            style={{
              margin: 0,
              marginBottom: '0.625rem',
              fontSize: '0.6875rem',
              fontWeight: 600,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: 'var(--text-dim, #666)',
            }}
          >
            Execution Policy (Read-Only)
          </h4>
          
          {data.executionPolicy.error ? (
            <div
              style={{
                padding: '0.375rem',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                borderRadius: 'var(--radius-sm, 4px)',
                fontSize: '0.625rem',
                color: 'var(--status-failed-fg, #ef4444)',
              }}
            >
              Policy derivation failed: {data.executionPolicy.error}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {/* Execution Class Badge */}
              {data.executionPolicy.execution_class && (
                <div style={{ display: 'flex', gap: '0.5rem', lineHeight: 1.4 }}>
                  <span style={{ color: 'var(--text-dim, #666)', minWidth: '85px', flexShrink: 0 }}>
                    Class:
                  </span>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '0.125rem 0.5rem',
                      borderRadius: 'var(--radius-sm, 4px)',
                      fontSize: '0.625rem',
                      fontWeight: 600,
                      backgroundColor:
                        data.executionPolicy.execution_class === 'GPU_ENCODE_AVAILABLE'
                          ? 'rgba(34, 197, 94, 0.15)'
                          : data.executionPolicy.execution_class === 'GPU_DECODE_ONLY'
                            ? 'rgba(251, 191, 36, 0.15)'
                            : 'rgba(156, 163, 175, 0.15)',
                      color:
                        data.executionPolicy.execution_class === 'GPU_ENCODE_AVAILABLE'
                          ? '#22c55e'
                          : data.executionPolicy.execution_class === 'GPU_DECODE_ONLY'
                            ? '#fbbf24'
                            : '#9ca3af',
                    }}
                  >
                    {data.executionPolicy.execution_class}
                  </span>
                </div>
              )}
              
              {/* Primary Engine */}
              {data.executionPolicy.primary_engine && (
                <DiagnosticRow
                  label="Engine"
                  value={data.executionPolicy.primary_engine.toUpperCase()}
                  mono
                />
              )}
              
              {/* Confidence */}
              {data.executionPolicy.confidence && (
                <DiagnosticRow
                  label="Confidence"
                  value={data.executionPolicy.confidence.toUpperCase()}
                />
              )}
              
              {/* Blocking Reasons */}
              {data.executionPolicy.blocking_reasons && data.executionPolicy.blocking_reasons.length > 0 && (
                <div style={{ marginTop: '0.25rem' }}>
                  <div
                    style={{
                      color: 'var(--text-dim, #666)',
                      fontSize: '0.625rem',
                      marginBottom: '0.25rem',
                    }}
                  >
                    Why:
                  </div>
                  <ul
                    style={{
                      margin: 0,
                      paddingLeft: '1.25rem',
                      fontSize: '0.625rem',
                      lineHeight: 1.5,
                      color: 'var(--text-secondary, #999)',
                    }}
                  >
                    {data.executionPolicy.blocking_reasons.map((reason, i) => (
                      <li key={i} style={{ marginBottom: '0.25rem' }}>
                        {reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {/* Capability Summary */}
              {data.executionPolicy.capability_summary && (
                <div
                  style={{
                    marginTop: '0.5rem',
                    padding: '0.375rem',
                    backgroundColor: 'rgba(59, 130, 246, 0.05)',
                    borderRadius: 'var(--radius-sm, 4px)',
                    fontSize: '0.625rem',
                    lineHeight: 1.4,
                  }}
                >
                  <div style={{ color: 'var(--text-dim, #666)', marginBottom: '0.25rem' }}>
                    Capabilities:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
                    <span>
                      GPU Decode: {data.executionPolicy.capability_summary.gpu_decode ? '✅ Yes' : '❌ No'}
                    </span>
                    <span>
                      GPU Encode: {data.executionPolicy.capability_summary.gpu_encode ? '✅ Yes' : '❌ No'}
                    </span>
                    <span>
                      ProRes GPU: {data.executionPolicy.capability_summary.prores_gpu_supported ? '✅ Yes' : '❌ No (CPU only)'}
                    </span>
                  </div>
                </div>
              )}
              
              {/* Alternatives (Collapsed by Default) */}
              {data.executionPolicy.alternatives && data.executionPolicy.alternatives.length > 0 && (
                <details
                  style={{
                    marginTop: '0.5rem',
                    padding: '0.375rem',
                    backgroundColor: 'rgba(156, 163, 175, 0.05)',
                    borderRadius: 'var(--radius-sm, 4px)',
                    fontSize: '0.625rem',
                  }}
                >
                  <summary
                    style={{
                      cursor: 'pointer',
                      color: 'var(--text-dim, #666)',
                      userSelect: 'none',
                    }}
                  >
                    Alternatives ({data.executionPolicy.alternatives.length})
                  </summary>
                  <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {data.executionPolicy.alternatives.map((alt, i) => (
                      <div
                        key={i}
                        style={{
                          padding: '0.375rem',
                          backgroundColor: 'rgba(255, 255, 255, 0.02)',
                          borderRadius: 'var(--radius-sm, 4px)',
                          lineHeight: 1.4,
                        }}
                      >
                        <div style={{ fontWeight: 600, color: 'var(--text-secondary, #999)' }}>
                          {alt.engine?.toUpperCase()} {alt.codec && `— ${alt.codec}`}
                        </div>
                        {alt.tradeoff && (
                          <div style={{ marginTop: '0.25rem', color: 'var(--text-muted, #888)' }}>
                            {alt.tradeoff}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              )}
              
              {/* Informational note */}
              <div
                style={{
                  marginTop: '0.5rem',
                  padding: '0.375rem',
                  backgroundColor: 'rgba(59, 130, 246, 0.1)',
                  borderRadius: 'var(--radius-sm, 4px)',
                  fontSize: '0.625rem',
                  lineHeight: 1.4,
                  color: 'var(--text-muted, #888)',
                }}
              >
                ℹ️ This explains <strong>why</strong> the job executes this way.
                <br />
                It does <strong>not</strong> control or change execution behavior.
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Execution Outcome (Read-Only Classification) */}
      {data.executionOutcome && (
        <div
          style={{
            marginTop: '1rem',
            padding: '0.75rem',
            backgroundColor: 'var(--panel-bg-secondary, rgba(255, 255, 255, 0.03))',
            borderRadius: 'var(--radius-md, 8px)',
            border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
          }}
        >
          <h4
            style={{
              margin: 0,
              marginBottom: '0.625rem',
              fontSize: '0.6875rem',
              fontWeight: 600,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: 'var(--text-dim, #666)',
            }}
          >
            Execution Outcome (Read-Only)
          </h4>
          
          {data.executionOutcome.error ? (
            <div
              style={{
                padding: '0.375rem',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                borderRadius: 'var(--radius-sm, 4px)',
                fontSize: '0.625rem',
                color: 'var(--status-failed-fg, #ef4444)',
              }}
            >
              Outcome derivation failed: {data.executionOutcome.error}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {/* Job State Badge */}
              {data.executionOutcome.job_state && (
                <div style={{ display: 'flex', gap: '0.5rem', lineHeight: 1.4 }}>
                  <span style={{ color: 'var(--text-dim, #666)', minWidth: '85px', flexShrink: 0 }}>
                    Job State:
                  </span>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '0.125rem 0.5rem',
                      borderRadius: 'var(--radius-sm, 4px)',
                      fontSize: '0.625rem',
                      fontWeight: 600,
                      backgroundColor:
                        data.executionOutcome.job_state === 'COMPLETE'
                          ? 'rgba(34, 197, 94, 0.15)'
                          : data.executionOutcome.job_state === 'PARTIAL'
                            ? 'rgba(251, 191, 36, 0.15)'
                            : data.executionOutcome.job_state === 'BLOCKED'
                              ? 'rgba(156, 163, 175, 0.15)'
                              : 'rgba(239, 68, 68, 0.15)',
                      color:
                        data.executionOutcome.job_state === 'COMPLETE'
                          ? '#22c55e'
                          : data.executionOutcome.job_state === 'PARTIAL'
                            ? '#fbbf24'
                            : data.executionOutcome.job_state === 'BLOCKED'
                              ? '#9ca3af'
                              : '#ef4444',
                    }}
                  >
                    {data.executionOutcome.job_state}
                  </span>
                </div>
              )}
              
              {/* Summary */}
              {data.executionOutcome.summary && (
                <DiagnosticRow
                  label="Summary"
                  value={data.executionOutcome.summary}
                />
              )}
              
              {/* Clip Breakdown */}
              <div
                style={{
                  marginTop: '0.5rem',
                  padding: '0.375rem',
                  backgroundColor: 'rgba(59, 130, 246, 0.05)',
                  borderRadius: 'var(--radius-sm, 4px)',
                  fontSize: '0.625rem',
                  lineHeight: 1.4,
                }}
              >
                <div style={{ color: 'var(--text-dim, #666)', marginBottom: '0.25rem' }}>
                  Clip Breakdown:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
                  <span>Total: {data.executionOutcome.total_clips ?? 0}</span>
                  <span style={{ color: '#22c55e' }}>
                    ✅ Success: {data.executionOutcome.success_clips ?? 0}
                  </span>
                  <span style={{ color: '#ef4444' }}>
                    ❌ Failed: {data.executionOutcome.failed_clips ?? 0}
                  </span>
                  <span style={{ color: '#9ca3af' }}>
                    ⏭️ Skipped: {data.executionOutcome.skipped_clips ?? 0}
                  </span>
                </div>
              </div>
              
              {/* Failure Types */}
              {data.executionOutcome.failure_types && data.executionOutcome.failure_types.length > 0 && (
                <div
                  style={{
                    marginTop: '0.5rem',
                    padding: '0.375rem',
                    backgroundColor: 'rgba(239, 68, 68, 0.05)',
                    borderRadius: 'var(--radius-sm, 4px)',
                    fontSize: '0.625rem',
                  }}
                >
                  <div style={{ color: 'var(--text-dim, #666)', marginBottom: '0.25rem' }}>
                    Failure Types:
                  </div>
                  <ul
                    style={{
                      margin: 0,
                      paddingLeft: '1.25rem',
                      fontSize: '0.625rem',
                      lineHeight: 1.5,
                      color: 'var(--text-secondary, #999)',
                    }}
                  >
                    {data.executionOutcome.failure_types.map((type, i) => (
                      <li key={i} style={{ marginBottom: '0.25rem' }}>
                        {type.replace(/_/g, ' ')}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {/* Informational note */}
              <div
                style={{
                  marginTop: '0.5rem',
                  padding: '0.375rem',
                  backgroundColor: 'rgba(59, 130, 246, 0.1)',
                  borderRadius: 'var(--radius-sm, 4px)',
                  fontSize: '0.625rem',
                  lineHeight: 1.4,
                  color: 'var(--text-muted, #888)',
                }}
              >
                ℹ️ This classifies <strong>what happened</strong> after execution.
                <br />
                It does <strong>not</strong> trigger retries or change behavior.
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Execution Event Timeline (QC Observability) */}
      {data.executionEvents && data.executionEvents.length > 0 && (
        <div
          style={{
            marginTop: '1rem',
            padding: '0.75rem',
            backgroundColor: 'var(--panel-bg-secondary, rgba(255, 255, 255, 0.03))',
            borderRadius: 'var(--radius-md, 8px)',
            border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
          }}
        >
          <h4
            style={{
              margin: 0,
              marginBottom: '0.625rem',
              fontSize: '0.6875rem',
              fontWeight: 600,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: 'var(--text-dim, #666)',
            }}
          >
            Execution Timeline
          </h4>
          
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.375rem',
              maxHeight: '300px',
              overflowY: 'auto',
              padding: '0.25rem',
            }}
          >
            {data.executionEvents.map((event, index) => {
              // Format event type for display
              const eventLabel = event.event_type
                .replace(/_/g, ' ')
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ')
              
              // Determine color based on event type
              let eventColor = 'var(--text-secondary, #999)'
              if (event.event_type.includes('FAILED') || event.event_type.includes('ERROR')) {
                eventColor = '#ef4444'
              } else if (event.event_type.includes('COMPLETED') || event.event_type.includes('PASSED')) {
                eventColor = '#22c55e'
              } else if (event.event_type.includes('STARTED') || event.event_type.includes('QUEUED')) {
                eventColor = '#3b82f6'
              } else if (event.event_type.includes('COLLISION') || event.event_type.includes('CANCELLED')) {
                eventColor = '#f59e0b'
              }
              
              return (
                <div
                  key={index}
                  style={{
                    padding: '0.375rem 0.5rem',
                    backgroundColor: 'rgba(255, 255, 255, 0.02)',
                    borderRadius: 'var(--radius-sm, 4px)',
                    borderLeft: `3px solid ${eventColor}`,
                    fontSize: '0.625rem',
                    lineHeight: 1.4,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: '0.5rem',
                      marginBottom: '0.125rem',
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 600,
                        color: eventColor,
                      }}
                    >
                      {eventLabel}
                    </span>
                    <span
                      style={{
                        color: 'var(--text-dim, #666)',
                        fontFamily: 'var(--font-mono, monospace)',
                        fontSize: '0.5625rem',
                        flexShrink: 0,
                      }}
                    >
                      {formatTimestamp(event.timestamp)}
                    </span>
                  </div>
                  
                  {event.clip_id && (
                    <div
                      style={{
                        color: 'var(--text-muted, #888)',
                        fontFamily: 'var(--font-mono, monospace)',
                        fontSize: '0.5625rem',
                        marginBottom: '0.125rem',
                      }}
                    >
                      Clip: {event.clip_id.slice(0, 8)}...
                    </div>
                  )}
                  
                  {event.message && (
                    <div
                      style={{
                        color: 'var(--text-secondary, #999)',
                        fontSize: '0.5625rem',
                      }}
                    >
                      {event.message}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          
          {/* Informational note */}
          <div
            style={{
              marginTop: '0.5rem',
              padding: '0.375rem',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              borderRadius: 'var(--radius-sm, 4px)',
              fontSize: '0.625rem',
              lineHeight: 1.4,
              color: 'var(--text-muted, #888)',
            }}
          >
            ℹ️ This timeline shows <strong>what happened</strong> during execution.
            <br />
            Events are recorded in order. This is not telemetry—it is truth.
          </div>
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
