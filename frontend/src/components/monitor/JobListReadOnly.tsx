/**
 * Forge Monitor - Read-Only Job List
 * 
 * Displays jobs in a read-only list format.
 * No action buttons. No editing. No retry controls.
 * 
 * OBSERVABILITY ONLY.
 */

import { useMemo } from 'react'

export interface MonitorJob {
  job_id: string
  job_type: string
  engine: string | null
  status: 'queued' | 'running' | 'failed' | 'completed'
  start_time: string
  end_time: string | null
  failure_reason: string | null
  burnin_preset_id: string | null
  lut_id: string | null
  worker_id: string
  verification_run_id: string | null
  source_path: string | null
  output_path: string | null
}

interface JobListReadOnlyProps {
  jobs: MonitorJob[]
  onSelectJob?: (jobId: string) => void
  selectedJobId?: string | null
}

const statusStyles: Record<string, { bg: string; fg: string; label: string }> = {
  queued: { 
    bg: 'var(--status-pending-bg, #2a2a30)', 
    fg: 'var(--status-pending-fg, #a0a0a0)',
    label: 'Queued'
  },
  running: { 
    bg: 'var(--status-running-bg, #1a3a5c)', 
    fg: 'var(--status-running-fg, #4da6ff)',
    label: 'Running'
  },
  failed: { 
    bg: 'var(--status-failed-bg, #4a1a1a)', 
    fg: 'var(--status-failed-fg, #ff6b6b)',
    label: 'Failed'
  },
  completed: { 
    bg: 'var(--status-completed-bg, #1a3a1a)', 
    fg: 'var(--status-completed-fg, #6bff6b)',
    label: 'Completed'
  },
}

function formatTimestamp(iso: string): string {
  try {
    const date = new Date(iso)
    return date.toLocaleString()
  } catch {
    return iso
  }
}

function formatDuration(startIso: string, endIso: string | null): string {
  if (!endIso) return '—'
  try {
    const start = new Date(startIso).getTime()
    const end = new Date(endIso).getTime()
    const durationMs = end - start
    const seconds = Math.floor(durationMs / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    } else {
      return `${seconds}s`
    }
  } catch {
    return '—'
  }
}

function getSourceFilename(path: string | null): string {
  if (!path) return '—'
  const parts = path.split('/')
  return parts[parts.length - 1] || path
}

export function JobListReadOnly({ 
  jobs, 
  onSelectJob, 
  selectedJobId 
}: JobListReadOnlyProps) {
  // Sort with most recent first, failed jobs prominent
  const sortedJobs = useMemo(() => {
    return [...jobs].sort((a, b) => {
      // Failed jobs first within same status category
      if (a.status === 'failed' && b.status !== 'failed') return -1
      if (b.status === 'failed' && a.status !== 'failed') return 1
      // Then by start time, newest first
      return new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
    })
  }, [jobs])

  if (jobs.length === 0) {
    return (
      <div style={{
        padding: '40px',
        textAlign: 'center',
        color: 'var(--text-secondary, #888)',
        fontSize: '14px'
      }}>
        No jobs recorded.
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '2px',
      padding: '8px',
    }}>
      {sortedJobs.map((job) => {
        const style = statusStyles[job.status] || statusStyles.queued
        const isSelected = selectedJobId === job.job_id
        
        return (
          <div
            key={job.job_id}
            onClick={() => onSelectJob?.(job.job_id)}
            style={{
              display: 'grid',
              gridTemplateColumns: '100px 1fr 120px 100px 80px',
              gap: '12px',
              padding: '10px 12px',
              backgroundColor: isSelected ? 'var(--bg-selected, #2a2a40)' : 'var(--bg-secondary, #1a1a1e)',
              borderRadius: '4px',
              cursor: onSelectJob ? 'pointer' : 'default',
              borderLeft: `3px solid ${style.fg}`,
              alignItems: 'center',
              fontSize: '13px',
            }}
          >
            {/* Status */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}>
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: style.fg,
                animation: job.status === 'running' ? 'pulse 1.5s infinite' : 'none',
              }} />
              <span style={{ 
                color: style.fg,
                fontWeight: 500,
                textTransform: 'uppercase',
                fontSize: '11px',
                letterSpacing: '0.5px',
              }}>
                {style.label}
              </span>
            </div>

            {/* Source */}
            <div style={{
              color: 'var(--text-primary, #e0e0e0)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {getSourceFilename(job.source_path)}
            </div>

            {/* Engine */}
            <div style={{
              color: 'var(--text-secondary, #888)',
              fontSize: '12px',
            }}>
              {job.engine ? job.engine.toUpperCase() : '—'}
            </div>

            {/* Start Time */}
            <div style={{
              color: 'var(--text-tertiary, #666)',
              fontSize: '11px',
            }}>
              {formatTimestamp(job.start_time).split(',')[1] || formatTimestamp(job.start_time)}
            </div>

            {/* Duration */}
            <div style={{
              color: 'var(--text-tertiary, #666)',
              fontSize: '11px',
              textAlign: 'right',
            }}>
              {formatDuration(job.start_time, job.end_time)}
            </div>
          </div>
        )
      })}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}

export default JobListReadOnly
