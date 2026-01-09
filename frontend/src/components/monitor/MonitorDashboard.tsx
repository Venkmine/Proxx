/**
 * Forge Monitor - Read-Only Dashboard
 * 
 * Central monitoring view for Forge job execution.
 * Provides visibility into jobs, workers, and events.
 * 
 * This is OBSERVABILITY ONLY.
 * - No job creation
 * - No job modification
 * - No retry controls
 * - No queue manipulation
 */

import { useState, useEffect, useCallback } from 'react'
import { JobListReadOnly, type MonitorJob } from './JobListReadOnly'
import { JobDetailReadOnly, type MonitorEvent } from './JobDetailReadOnly'

// Default API endpoint - localhost only
const API_BASE = 'http://127.0.0.1:9876'

interface WorkerStatus {
  worker_id: string
  status: 'idle' | 'busy' | 'offline'
  last_seen: string
  current_job_id: string | null
  hostname: string | null
}

interface JobStats {
  queued: number
  running: number
  failed: number
  completed: number
  total: number
}

interface WorkersByStatus {
  idle: WorkerStatus[]
  busy: WorkerStatus[]
  offline: WorkerStatus[]
}

type FilterStatus = 'all' | 'active' | 'failed' | 'completed'

export function MonitorDashboard() {
  const [jobs, setJobs] = useState<MonitorJob[]>([])
  const [workers, setWorkers] = useState<WorkerStatus[]>([])
  const [workersByStatus, setWorkersByStatus] = useState<WorkersByStatus>({ idle: [], busy: [], offline: [] })
  const [stats, setStats] = useState<JobStats>({ queued: 0, running: 0, failed: 0, completed: 0, total: 0 })
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [selectedJob, setSelectedJob] = useState<MonitorJob | null>(null)
  const [selectedJobEvents, setSelectedJobEvents] = useState<MonitorEvent[]>([])
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  // Fetch job statistics
  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/jobs/stats`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      setStats(data)
    } catch (err) {
      console.error('Failed to fetch stats:', err)
    }
  }, [])

  // Fetch jobs based on filter
  const fetchJobs = useCallback(async () => {
    try {
      let url = `${API_BASE}/jobs`
      if (filterStatus === 'active') {
        url = `${API_BASE}/jobs/active`
      } else if (filterStatus === 'failed') {
        url = `${API_BASE}/jobs/failed`
      } else if (filterStatus === 'completed') {
        url = `${API_BASE}/jobs/completed`
      }
      
      const response = await fetch(url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      setJobs(data.jobs || [])
      setError(null)
    } catch (err) {
      setError(`Failed to connect to monitor API at ${API_BASE}`)
      console.error('Failed to fetch jobs:', err)
    }
  }, [filterStatus])

  // Fetch workers
  const fetchWorkers = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/workers`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      setWorkers(data.workers || [])
      setWorkersByStatus(data.by_status || { idle: [], busy: [], offline: [] })
    } catch (err) {
      console.error('Failed to fetch workers:', err)
    }
  }, [])

  // Fetch job detail
  const fetchJobDetail = useCallback(async (jobId: string) => {
    try {
      const response = await fetch(`${API_BASE}/jobs/${jobId}`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      setSelectedJob(data.job)
      setSelectedJobEvents(data.events || [])
    } catch (err) {
      console.error('Failed to fetch job detail:', err)
      setSelectedJob(null)
      setSelectedJobEvents([])
    }
  }, [])

  // Handle job selection
  const handleSelectJob = useCallback((jobId: string) => {
    if (jobId === selectedJobId) {
      setSelectedJobId(null)
      setSelectedJob(null)
      setSelectedJobEvents([])
    } else {
      setSelectedJobId(jobId)
      fetchJobDetail(jobId)
    }
  }, [selectedJobId, fetchJobDetail])

  // Initial load
  useEffect(() => {
    const loadAll = async () => {
      setLoading(true)
      await Promise.all([fetchStats(), fetchJobs(), fetchWorkers()])
      setLoading(false)
      setLastUpdate(new Date())
    }
    loadAll()
  }, [fetchStats, fetchJobs, fetchWorkers])

  // Refresh when filter changes
  useEffect(() => {
    fetchJobs()
  }, [fetchJobs, filterStatus])

  // Auto-refresh every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchStats()
      fetchJobs()
      fetchWorkers()
      setLastUpdate(new Date())
    }, 5000)
    return () => clearInterval(interval)
  }, [fetchStats, fetchJobs, fetchWorkers])

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      backgroundColor: 'var(--bg-primary, #121214)',
      color: 'var(--text-primary, #e0e0e0)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      {/* Header */}
      <header style={{
        padding: '16px 24px',
        borderBottom: '1px solid var(--border-primary, #2a2a2e)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          <h1 style={{
            margin: 0,
            fontSize: '18px',
            fontWeight: 600,
          }}>
            AWAIRE Monitor
          </h1>
          <div style={{
            fontSize: '11px',
            color: 'var(--text-tertiary, #666)',
            marginTop: '2px',
          }}>
            Read-only observability. No job control.
          </div>
        </div>
        <div style={{
          fontSize: '11px',
          color: 'var(--text-tertiary, #666)',
        }}>
          {lastUpdate && `Updated: ${lastUpdate.toLocaleTimeString()}`}
        </div>
      </header>

      {/* Error Banner */}
      {error && (
        <div style={{
          padding: '12px 24px',
          backgroundColor: 'var(--status-failed-bg, #4a1a1a)',
          borderBottom: '1px solid var(--status-failed-fg, #ff6b6b)',
          color: 'var(--status-failed-fg, #ff6b6b)',
          fontSize: '13px',
        }}>
          {error}
        </div>
      )}

      {/* Stats Bar */}
      <div style={{
        display: 'flex',
        gap: '24px',
        padding: '16px 24px',
        borderBottom: '1px solid var(--border-primary, #2a2a2e)',
      }}>
        <StatBox label="Queued" value={stats.queued} color="#a0a0a0" />
        <StatBox label="Running" value={stats.running} color="#4da6ff" />
        <StatBox label="Failed" value={stats.failed} color="#ff6b6b" highlight={stats.failed > 0} />
        <StatBox label="Completed" value={stats.completed} color="#6bff6b" />
        
        <div style={{ flex: 1 }} />
        
        {/* Worker Status */}
        <div style={{
          display: 'flex',
          gap: '16px',
          alignItems: 'center',
          paddingLeft: '16px',
          borderLeft: '1px solid var(--border-primary, #2a2a2e)',
        }}>
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary, #666)' }}>Workers:</div>
          <WorkerBadge label="Idle" count={workersByStatus.idle?.length || 0} color="#6bff6b" />
          <WorkerBadge label="Busy" count={workersByStatus.busy?.length || 0} color="#4da6ff" />
          <WorkerBadge label="Offline" count={workersByStatus.offline?.length || 0} color="#666" />
        </div>
      </div>

      {/* Filter Bar */}
      <div style={{
        display: 'flex',
        gap: '8px',
        padding: '12px 24px',
        borderBottom: '1px solid var(--border-primary, #2a2a2e)',
      }}>
        {(['all', 'active', 'failed', 'completed'] as FilterStatus[]).map((status) => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              backgroundColor: filterStatus === status 
                ? 'var(--bg-selected, #2a2a40)' 
                : 'transparent',
              color: filterStatus === status 
                ? 'var(--text-primary, #e0e0e0)' 
                : 'var(--text-secondary, #888)',
            }}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      {/* Main Content */}
      <div style={{
        flex: 1,
        display: 'flex',
        overflow: 'hidden',
      }}>
        {/* Job List */}
        <div style={{
          flex: selectedJob ? 1 : 2,
          overflow: 'auto',
          borderRight: selectedJob ? '1px solid var(--border-primary, #2a2a2e)' : 'none',
        }}>
          {loading ? (
            <div style={{
              padding: '40px',
              textAlign: 'center',
              color: 'var(--text-secondary, #888)',
            }}>
              Loading...
            </div>
          ) : (
            <JobListReadOnly
              jobs={jobs}
              onSelectJob={handleSelectJob}
              selectedJobId={selectedJobId}
            />
          )}
        </div>

        {/* Job Detail Panel */}
        {selectedJob && (
          <div style={{
            flex: 1,
            overflow: 'auto',
          }}>
            <JobDetailReadOnly
              job={selectedJob}
              events={selectedJobEvents}
            />
          </div>
        )}
      </div>

      {/* Footer */}
      <footer style={{
        padding: '8px 24px',
        borderTop: '1px solid var(--border-primary, #2a2a2e)',
        fontSize: '11px',
        color: 'var(--text-tertiary, #666)',
        textAlign: 'center',
      }}>
        AWAIRE Monitor v1.0.0 — Read-only observability layer
      </footer>
    </div>
  )
}

function StatBox({ 
  label, 
  value, 
  color, 
  highlight = false 
}: { 
  label: string
  value: number
  color: string
  highlight?: boolean 
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: highlight ? '8px 12px' : undefined,
      backgroundColor: highlight ? 'var(--status-failed-bg, #4a1a1a)' : undefined,
      borderRadius: highlight ? '4px' : undefined,
    }}>
      <span style={{
        fontSize: '24px',
        fontWeight: 600,
        color: color,
      }}>
        {value}
      </span>
      <span style={{
        fontSize: '11px',
        color: 'var(--text-secondary, #888)',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
      }}>
        {label}
      </span>
    </div>
  )
}

function WorkerBadge({ 
  label, 
  count, 
  color 
}: { 
  label: string
  count: number
  color: string 
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
    }}>
      <span style={{
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        backgroundColor: color,
      }} />
      <span style={{
        fontSize: '12px',
        color: 'var(--text-secondary, #888)',
      }}>
        {count} {label}
      </span>
    </div>
  )
}

export default MonitorDashboard
