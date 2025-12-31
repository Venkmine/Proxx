/**
 * Forge Monitor - Read-Only Job Detail View
 * 
 * Displays complete job information including event timeline.
 * No action buttons. No editing. No retry controls.
 * 
 * OBSERVABILITY ONLY.
 */

import { useMemo } from 'react'
import type { MonitorJob } from './JobListReadOnly'

export interface MonitorEvent {
  event_id: string
  event_type: string
  job_id: string
  timestamp: string
  worker_id: string
  payload: Record<string, unknown>
}

interface JobDetailReadOnlyProps {
  job: MonitorJob
  events: MonitorEvent[]
  onClose?: () => void
}

const eventTypeLabels: Record<string, string> = {
  job_created: 'Job Created',
  engine_selected: 'Engine Selected',
  execution_started: 'Execution Started',
  progress_update: 'Progress Update',
  execution_failed: 'Execution Failed',
  execution_completed: 'Execution Completed',
}

const eventTypeColors: Record<string, string> = {
  job_created: '#8888ff',
  engine_selected: '#88aaff',
  execution_started: '#88ccff',
  progress_update: '#aaaaaa',
  execution_failed: '#ff6b6b',
  execution_completed: '#6bff6b',
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function formatRelativeTime(iso: string): string {
  try {
    const date = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffSec = Math.floor(diffMs / 1000)
    const diffMin = Math.floor(diffSec / 60)
    const diffHour = Math.floor(diffMin / 60)
    const diffDay = Math.floor(diffHour / 24)
    
    if (diffDay > 0) return `${diffDay}d ago`
    if (diffHour > 0) return `${diffHour}h ago`
    if (diffMin > 0) return `${diffMin}m ago`
    return `${diffSec}s ago`
  } catch {
    return iso
  }
}

function InfoRow({ label, value, mono = false }: { 
  label: string
  value: string | null | undefined
  mono?: boolean 
}) {
  return (
    <div style={{
      display: 'flex',
      gap: '12px',
      padding: '6px 0',
      borderBottom: '1px solid var(--border-subtle, #2a2a2e)',
    }}>
      <span style={{
        width: '140px',
        flexShrink: 0,
        color: 'var(--text-secondary, #888)',
        fontSize: '12px',
      }}>
        {label}
      </span>
      <span style={{
        color: 'var(--text-primary, #e0e0e0)',
        fontSize: '13px',
        fontFamily: mono ? 'monospace' : 'inherit',
        wordBreak: 'break-all',
      }}>
        {value || '—'}
      </span>
    </div>
  )
}

export function JobDetailReadOnly({ job, events, onClose }: JobDetailReadOnlyProps) {
  // Sort events chronologically
  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )
  }, [events])

  const statusColor = {
    queued: '#a0a0a0',
    running: '#4da6ff',
    failed: '#ff6b6b',
    completed: '#6bff6b',
  }[job.status] || '#888'

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      backgroundColor: 'var(--bg-primary, #121214)',
      color: 'var(--text-primary, #e0e0e0)',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid var(--border-primary, #2a2a2e)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          <div style={{
            fontSize: '11px',
            color: 'var(--text-tertiary, #666)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '4px',
          }}>
            Job Detail (Read-Only)
          </div>
          <div style={{
            fontSize: '14px',
            fontFamily: 'monospace',
            color: 'var(--text-secondary, #888)',
          }}>
            {job.job_id}
          </div>
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <span style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            backgroundColor: statusColor,
          }} />
          <span style={{
            color: statusColor,
            fontWeight: 600,
            textTransform: 'uppercase',
            fontSize: '12px',
          }}>
            {job.status}
          </span>
        </div>
      </div>

      {/* Content */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '20px',
      }}>
        {/* Failure Reason - Prominent if present */}
        {job.failure_reason && (
          <div style={{
            padding: '16px',
            marginBottom: '20px',
            backgroundColor: 'var(--status-failed-bg, #4a1a1a)',
            borderRadius: '6px',
            border: '1px solid var(--status-failed-fg, #ff6b6b)',
          }}>
            <div style={{
              fontSize: '11px',
              color: 'var(--status-failed-fg, #ff6b6b)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: '8px',
            }}>
              Failure Reason
            </div>
            <div style={{
              color: 'var(--text-primary, #e0e0e0)',
              fontSize: '13px',
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {job.failure_reason}
            </div>
          </div>
        )}

        {/* Job Information */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{
            fontSize: '12px',
            color: 'var(--text-tertiary, #666)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '12px',
          }}>
            Job Information
          </div>
          <div style={{
            backgroundColor: 'var(--bg-secondary, #1a1a1e)',
            borderRadius: '6px',
            padding: '12px 16px',
          }}>
            <InfoRow label="Job Type" value={job.job_type} />
            <InfoRow label="Engine" value={job.engine?.toUpperCase()} />
            <InfoRow label="Worker" value={job.worker_id} mono />
            <InfoRow label="Source" value={job.source_path} mono />
            <InfoRow label="Output" value={job.output_path} mono />
            <InfoRow label="Start Time" value={formatTimestamp(job.start_time)} />
            <InfoRow label="End Time" value={job.end_time ? formatTimestamp(job.end_time) : null} />
          </div>
        </div>

        {/* Metadata */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{
            fontSize: '12px',
            color: 'var(--text-tertiary, #666)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '12px',
          }}>
            Burn-In & LUT
          </div>
          <div style={{
            backgroundColor: 'var(--bg-secondary, #1a1a1e)',
            borderRadius: '6px',
            padding: '12px 16px',
          }}>
            <InfoRow label="Burn-In Preset" value={job.burnin_preset_id} mono />
            <InfoRow label="LUT" value={job.lut_id} mono />
            <InfoRow label="Verification Run" value={job.verification_run_id} mono />
          </div>
        </div>

        {/* Event Timeline */}
        <div>
          <div style={{
            fontSize: '12px',
            color: 'var(--text-tertiary, #666)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '12px',
          }}>
            Event Timeline ({events.length} events)
          </div>
          
          {sortedEvents.length === 0 ? (
            <div style={{
              padding: '20px',
              textAlign: 'center',
              color: 'var(--text-secondary, #888)',
              fontSize: '13px',
            }}>
              No events recorded.
            </div>
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
            }}>
              {sortedEvents.map((event, index) => {
                const color = eventTypeColors[event.event_type] || '#888'
                const label = eventTypeLabels[event.event_type] || event.event_type
                
                return (
                  <div
                    key={event.event_id}
                    style={{
                      display: 'flex',
                      gap: '12px',
                      padding: '10px 12px',
                      backgroundColor: 'var(--bg-secondary, #1a1a1e)',
                      borderRadius: '4px',
                      borderLeft: `3px solid ${color}`,
                    }}
                  >
                    {/* Timeline connector */}
                    <div style={{
                      width: '20px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                    }}>
                      <span style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: color,
                      }} />
                      {index < sortedEvents.length - 1 && (
                        <div style={{
                          flex: 1,
                          width: '1px',
                          backgroundColor: 'var(--border-subtle, #2a2a2e)',
                          marginTop: '4px',
                        }} />
                      )}
                    </div>

                    {/* Event content */}
                    <div style={{ flex: 1 }}>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '4px',
                      }}>
                        <span style={{
                          color: color,
                          fontSize: '12px',
                          fontWeight: 500,
                        }}>
                          {label}
                        </span>
                        <span style={{
                          color: 'var(--text-tertiary, #666)',
                          fontSize: '11px',
                        }}>
                          {formatRelativeTime(event.timestamp)}
                        </span>
                      </div>
                      
                      {Object.keys(event.payload).length > 0 && (
                        <div style={{
                          fontSize: '12px',
                          color: 'var(--text-secondary, #888)',
                          fontFamily: 'monospace',
                        }}>
                          {Object.entries(event.payload).map(([key, value]) => (
                            <div key={key}>
                              {key}: {typeof value === 'string' ? value : JSON.stringify(value)}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer - No action buttons */}
      <div style={{
        padding: '12px 20px',
        borderTop: '1px solid var(--border-primary, #2a2a2e)',
        fontSize: '11px',
        color: 'var(--text-tertiary, #666)',
        textAlign: 'center',
      }}>
        Read-only view. No actions available.
      </div>
    </div>
  )
}

export default JobDetailReadOnly
