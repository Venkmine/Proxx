import { useState, useEffect } from 'react'

const BACKEND_URL = 'http://127.0.0.1:8085'

// Types matching backend monitoring models
interface JobSummary {
  id: string
  status: string
  created_at: string
  started_at: string | null
  completed_at: string | null
  total_tasks: number
  completed_count: number
  failed_count: number
  skipped_count: number
  running_count: number
  queued_count: number
  warning_count: number
}

interface ClipTaskDetail {
  id: string
  source_path: string
  status: string
  started_at: string | null
  completed_at: string | null
  failure_reason: string | null
  warnings: string[]
}

interface JobDetail {
  id: string
  status: string
  created_at: string
  started_at: string | null
  completed_at: string | null
  total_tasks: number
  completed_count: number
  failed_count: number
  skipped_count: number
  running_count: number
  queued_count: number
  warning_count: number
  tasks: ClipTaskDetail[]
}

interface ReportReference {
  filename: string
  path: string
  size_bytes: number
  modified_at: number
}

function App() {
  const [jobs, setJobs] = useState<JobSummary[]>([])
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [jobDetail, setJobDetail] = useState<JobDetail | null>(null)
  const [reports, setReports] = useState<ReportReference[]>([])
  const [error, setError] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)

  // Fetch job list
  const fetchJobs = async () => {
    try {
      setError('')
      const response = await fetch(`${BACKEND_URL}/monitor/jobs`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      setJobs(data.jobs)
    } catch (err) {
      setError(`Failed to fetch jobs: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  // Fetch job detail
  const fetchJobDetail = async (jobId: string) => {
    try {
      setError('')
      setLoading(true)
      const [detailResponse, reportsResponse] = await Promise.all([
        fetch(`${BACKEND_URL}/monitor/jobs/${jobId}`),
        fetch(`${BACKEND_URL}/monitor/jobs/${jobId}/reports`)
      ])
      
      if (!detailResponse.ok) throw new Error(`HTTP ${detailResponse.status}`)
      if (!reportsResponse.ok) throw new Error(`HTTP ${reportsResponse.status}`)
      
      const detail = await detailResponse.json()
      const reportsData = await reportsResponse.json()
      
      setJobDetail(detail)
      setReports(reportsData.reports)
    } catch (err) {
      setError(`Failed to fetch job detail: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  // Control operations with confirmation
  const confirmAction = (message: string): boolean => {
    return window.confirm(message)
  }

  const resumeJob = async (jobId: string) => {
    const message = `Resume job ${jobId}?\n\nThis will continue execution from where it stopped.\nCompleted clips will NOT be re-run.`
    if (!confirmAction(message)) return

    try {
      setError('')
      setLoading(true)
      const response = await fetch(`${BACKEND_URL}/control/jobs/${jobId}/resume`, {
        method: 'POST'
      })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }
      alert('Job resumed successfully')
      await fetchJobDetail(jobId)
      await fetchJobs()
    } catch (err) {
      setError(`Failed to resume job: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const retryFailedClips = async (jobId: string) => {
    const job = jobDetail
    if (!job) return
    
    const failedCount = job.failed_count
    const message = `Retry ${failedCount} failed clips in job ${jobId}?\n\nCOMPLETED clips will NOT be re-run.\nOnly FAILED clips will be retried.`
    if (!confirmAction(message)) return

    try {
      setError('')
      setLoading(true)
      const response = await fetch(`${BACKEND_URL}/control/jobs/${jobId}/retry-failed`, {
        method: 'POST'
      })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }
      alert('Failed clips retried successfully')
      await fetchJobDetail(jobId)
      await fetchJobs()
    } catch (err) {
      setError(`Failed to retry clips: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const cancelJob = async (jobId: string) => {
    const message = `Cancel job ${jobId}?\n\nRunning clips will finish.\nQueued clips will be marked SKIPPED.\n\nThis operation CANNOT be undone.`
    if (!confirmAction(message)) return

    try {
      setError('')
      setLoading(true)
      const response = await fetch(`${BACKEND_URL}/control/jobs/${jobId}/cancel`, {
        method: 'POST'
      })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }
      alert('Job cancelled successfully')
      await fetchJobDetail(jobId)
      await fetchJobs()
    } catch (err) {
      setError(`Failed to cancel job: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const rebindPreset = async (jobId: string) => {
    const presetId = prompt('Enter new preset ID:')
    if (!presetId) return

    const message = `Rebind job ${jobId} to preset "${presetId}"?\n\nThis will OVERWRITE any existing preset binding.`
    if (!confirmAction(message)) return

    try {
      setError('')
      setLoading(true)
      const response = await fetch(`${BACKEND_URL}/control/jobs/${jobId}/rebind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset_id: presetId })
      })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }
      alert('Preset rebound successfully')
      await fetchJobDetail(jobId)
    } catch (err) {
      setError(`Failed to rebind preset: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  // Load jobs on mount
  useEffect(() => {
    fetchJobs()
  }, [])

  // Load job detail when selection changes
  useEffect(() => {
    if (selectedJobId) {
      fetchJobDetail(selectedJobId)
    } else {
      setJobDetail(null)
      setReports([])
    }
  }, [selectedJobId])

  return (
    <div style={{
      fontFamily: 'system-ui, -apple-system, sans-serif',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      margin: 0,
      padding: 0,
      position: 'relative'
    }}>
      {/* Background Layers */}
      <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: -20,
        background: 'var(--gradient-base)'
      }} />
      <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: -10,
        pointerEvents: 'none',
        background: 'var(--radial-overlay-2)'
      }} />
      <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: -10,
        pointerEvents: 'none',
        background: 'var(--radial-overlay-1)'
      }} />
      <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: -10,
        pointerEvents: 'none',
        background: 'var(--radial-overlay-3)'
      }} />

      {/* Header */}
      <div style={{
        padding: '1rem 1.5rem',
        borderBottom: '1px solid var(--border-primary)',
        backgroundColor: 'var(--header-bg)'
      }}>
        <h1 style={{ 
          margin: 0, 
          fontSize: '1.5rem', 
          fontWeight: 600,
          color: 'var(--text-primary)'
        }}>
          Proxx — Operator Control
        </h1>
      </div>

      {/* Error Banner */}
      {error && (
        <div style={{
          padding: '1rem 1.5rem',
          backgroundColor: 'var(--error-bg)',
          color: 'var(--error-fg)',
          borderBottom: '1px solid var(--error-border)'
        }}>
          {error}
        </div>
      )}

      {/* Main Content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Job List Panel */}
        <div style={{
          width: '400px',
          borderRight: '1px solid var(--border-primary)',
          overflow: 'auto',
          backgroundColor: 'var(--panel-bg)'
        }}>
          <div style={{
            padding: '1rem 1.5rem',
            borderBottom: '1px solid var(--border-primary)',
            backgroundColor: 'var(--card-bg-solid)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <h2 style={{ 
              margin: 0, 
              fontSize: '1rem', 
              fontWeight: 600,
              color: 'var(--text-primary)'
            }}>
              Jobs ({jobs.length})
            </h2>
            <button
              onClick={fetchJobs}
              style={{
                padding: '0.25rem 0.75rem',
                fontSize: '0.875rem',
                cursor: 'pointer',
                border: '1px solid var(--border-primary)',
                backgroundColor: 'var(--card-bg-solid)',
                color: 'var(--text-secondary)',
                borderRadius: 'var(--radius-sm)'
              }}
            >
              Refresh
            </button>
          </div>
          
          {jobs.length === 0 ? (
            <div style={{ 
              padding: '2rem 1.5rem', 
              color: 'var(--text-muted)', 
              textAlign: 'center' 
            }}>
              No jobs found
            </div>
          ) : (
            <div>
              {jobs.map(job => (
                <div
                  key={job.id}
                  onClick={() => setSelectedJobId(job.id)}
                  style={{
                    padding: '1rem 1.5rem',
                    borderBottom: '1px solid var(--border-secondary)',
                    cursor: 'pointer',
                    backgroundColor: selectedJobId === job.id ? 'var(--card-bg-selected)' : 'var(--card-bg)',
                    transition: 'background-color 0.1s'
                  }}
                  onMouseEnter={(e) => {
                    if (selectedJobId !== job.id) {
                      e.currentTarget.style.backgroundColor = 'var(--card-bg-hover)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedJobId !== job.id) {
                      e.currentTarget.style.backgroundColor = 'var(--card-bg)'
                    }
                  }}
                >
                  <div style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    fontFamily: 'monospace',
                    marginBottom: '0.25rem'
                  }}>
                    {job.id.substring(0, 8)}
                  </div>
                  <div style={{
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    marginBottom: '0.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    color: 'var(--text-primary)'
                  }}>
                    <StatusBadge status={job.status} />
                    <span>{new Date(job.created_at).toLocaleString()}</span>
                  </div>
                  <div style={{ 
                    fontSize: '0.75rem', 
                    color: 'var(--text-secondary)' 
                  }}>
                    {job.total_tasks} clips: {job.completed_count} completed, {job.failed_count} failed, {job.skipped_count} skipped
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Job Detail Panel */}
        <div style={{ 
          flex: 1, 
          overflow: 'auto', 
          backgroundColor: 'transparent' 
        }}>
          {loading ? (
            <div style={{ 
              padding: '2rem', 
              textAlign: 'center', 
              color: 'var(--text-muted)' 
            }}>
              Loading...
            </div>
          ) : !jobDetail ? (
            <div style={{ 
              padding: '2rem', 
              textAlign: 'center', 
              color: 'var(--text-muted)' 
            }}>
              Select a job to view details
            </div>
          ) : (
            <div style={{ padding: '1.5rem' }}>
              {/* Job Header */}
              <div style={{ marginBottom: '2rem' }}>
                <div style={{
                  fontSize: '0.875rem',
                  color: 'var(--text-muted)',
                  fontFamily: 'monospace',
                  marginBottom: '0.5rem'
                }}>
                  Job ID: {jobDetail.id}
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  marginBottom: '1rem'
                }}>
                  <StatusBadge status={jobDetail.status} large />
                  <div style={{ 
                    fontSize: '0.875rem', 
                    color: 'var(--text-secondary)' 
                  }}>
                    {jobDetail.total_tasks} clips total
                  </div>
                </div>
                
                {/* Timestamps */}
                <div style={{
                  fontSize: '0.875rem',
                  color: 'var(--text-secondary)',
                  marginBottom: '1rem',
                  lineHeight: 1.6
                }}>
                  <div>Created: {new Date(jobDetail.created_at).toLocaleString()}</div>
                  {jobDetail.started_at && <div>Started: {new Date(jobDetail.started_at).toLocaleString()}</div>}
                  {jobDetail.completed_at && <div>Completed: {new Date(jobDetail.completed_at).toLocaleString()}</div>}
                </div>

                {/* Progress Summary */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                  gap: '1rem',
                  marginBottom: '1.5rem'
                }}>
                  <StatBox label="Completed" value={jobDetail.completed_count} color="var(--stat-completed)" />
                  <StatBox label="Failed" value={jobDetail.failed_count} color="var(--stat-failed)" />
                  <StatBox label="Skipped" value={jobDetail.skipped_count} color="var(--stat-skipped)" />
                  <StatBox label="Running" value={jobDetail.running_count} color="var(--stat-running)" />
                  <StatBox label="Queued" value={jobDetail.queued_count} color="var(--text-muted)" />
                  <StatBox label="Warnings" value={jobDetail.warning_count} color="var(--stat-warning)" />
                </div>

                {/* Control Buttons */}
                <div style={{
                  display: 'flex',
                  gap: '0.75rem',
                  paddingTop: '1rem',
                  borderTop: '1px solid var(--border-secondary)'
                }}>
                  {(jobDetail.status === 'RECOVERY_REQUIRED' || jobDetail.status === 'PAUSED') && (
                    <button
                      onClick={() => resumeJob(jobDetail.id)}
                      disabled={loading}
                      style={{
                        padding: '0.5rem 1rem',
                        fontSize: '0.875rem',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        border: '1px solid var(--button-primary-border)',
                        backgroundColor: 'var(--button-primary-bg)',
                        color: 'var(--text-primary)',
                        borderRadius: 'var(--radius-sm)',
                        fontWeight: 500
                      }}
                    >
                      Resume Job
                    </button>
                  )}
                  
                  {jobDetail.failed_count > 0 && (
                    <button
                      onClick={() => retryFailedClips(jobDetail.id)}
                      disabled={loading}
                      style={{
                        padding: '0.5rem 1rem',
                        fontSize: '0.875rem',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        border: '1px solid var(--button-warning-border)',
                        backgroundColor: 'var(--button-warning-bg)',
                        color: 'var(--text-primary)',
                        borderRadius: 'var(--radius-sm)',
                        fontWeight: 500
                      }}
                    >
                      Retry Failed Clips
                    </button>
                  )}
                  
                  {!['COMPLETED', 'COMPLETED_WITH_WARNINGS', 'FAILED', 'CANCELLED'].includes(jobDetail.status) && (
                    <button
                      onClick={() => cancelJob(jobDetail.id)}
                      disabled={loading}
                      style={{
                        padding: '0.5rem 1rem',
                        fontSize: '0.875rem',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        border: '1px solid var(--button-danger-border)',
                        backgroundColor: 'var(--button-secondary-bg)',
                        color: 'var(--button-danger-bg)',
                        borderRadius: 'var(--radius-sm)',
                        fontWeight: 500
                      }}
                    >
                      Cancel Job
                    </button>
                  )}
                  
                  {(jobDetail.status === 'PENDING' || jobDetail.status === 'RECOVERY_REQUIRED') && (
                    <button
                      onClick={() => rebindPreset(jobDetail.id)}
                      disabled={loading}
                      style={{
                        padding: '0.5rem 1rem',
                        fontSize: '0.875rem',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        border: '1px solid var(--button-secondary-border)',
                        backgroundColor: 'var(--button-secondary-bg)',
                        color: 'var(--button-secondary-fg)',
                        borderRadius: 'var(--radius-sm)',
                        fontWeight: 500
                      }}
                    >
                      Rebind Preset
                    </button>
                  )}
                </div>
              </div>

              {/* Reports Section */}
              {reports.length > 0 && (
                <div style={{ marginBottom: '2rem' }}>
                  <h3 style={{ 
                    fontSize: '1rem', 
                    fontWeight: 600, 
                    marginBottom: '0.75rem',
                    color: 'var(--text-primary)'
                  }}>
                    Reports
                  </h3>
                  <div style={{
                    border: '1px solid var(--border-primary)',
                    borderRadius: 'var(--radius)',
                    overflow: 'hidden',
                    backgroundColor: 'var(--card-bg)'
                  }}>
                    {reports.map((report, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '0.75rem 1rem',
                          borderBottom: idx < reports.length - 1 ? '1px solid var(--border-secondary)' : 'none',
                          fontSize: '0.875rem',
                          fontFamily: 'monospace',
                          color: 'var(--text-secondary)'
                        }}
                      >
                        {report.filename} ({formatBytes(report.size_bytes)})
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Clip Tasks */}
              <div>
                <h3 style={{ 
                  fontSize: '1rem', 
                  fontWeight: 600, 
                  marginBottom: '0.75rem',
                  color: 'var(--text-primary)'
                }}>
                  Clips ({jobDetail.tasks.length})
                </h3>
                <div style={{
                  border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius)',
                  overflow: 'hidden',
                  backgroundColor: 'var(--card-bg)'
                }}>
                  {jobDetail.tasks.map((task, idx) => (
                    <div
                      key={task.id}
                      style={{
                        padding: '1rem',
                        borderBottom: idx < jobDetail.tasks.length - 1 ? '1px solid var(--border-secondary)' : 'none'
                      }}
                    >
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        marginBottom: '0.5rem'
                      }}>
                        <StatusBadge status={task.status} small />
                        <code style={{
                          fontSize: '0.875rem',
                          color: 'var(--text-secondary)',
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {task.source_path}
                        </code>
                      </div>
                      
                      {task.failure_reason && (
                        <div style={{
                          fontSize: '0.75rem',
                          color: 'var(--status-failed-fg)',
                          marginTop: '0.5rem',
                          paddingLeft: '1.5rem'
                        }}>
                          Error: {task.failure_reason}
                        </div>
                      )}
                      
                      {task.warnings.length > 0 && (
                        <div style={{
                          fontSize: '0.75rem',
                          color: 'var(--status-warning-fg)',
                          marginTop: '0.5rem',
                          paddingLeft: '1.5rem'
                        }}>
                          Warnings: {task.warnings.join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Helper Components
function StatusBadge({ status, large, small }: { status: string, large?: boolean, small?: boolean }) {
  const colors: Record<string, { bg: string, text: string, glow?: string }> = {
    'PENDING': { bg: 'var(--status-pending-bg)', text: 'var(--status-pending-fg)' },
    'RUNNING': { bg: 'var(--status-running-bg)', text: 'var(--status-running-fg)', glow: 'var(--status-running-glow)' },
    'PAUSED': { bg: 'var(--status-paused-bg)', text: 'var(--status-paused-fg)' },
    'COMPLETED': { bg: 'var(--status-completed-bg)', text: 'var(--status-completed-fg)', glow: 'var(--status-completed-glow)' },
    'COMPLETED_WITH_WARNINGS': { bg: 'var(--status-warning-bg)', text: 'var(--status-warning-fg)' },
    'FAILED': { bg: 'var(--status-failed-bg)', text: 'var(--status-failed-fg)', glow: 'var(--status-failed-glow)' },
    'CANCELLED': { bg: 'var(--status-cancelled-bg)', text: 'var(--status-cancelled-fg)' },
    'RECOVERY_REQUIRED': { bg: 'var(--status-recovery-bg)', text: 'var(--status-recovery-fg)', glow: 'var(--status-recovery-glow)' },
    'QUEUED': { bg: 'var(--status-queued-bg)', text: 'var(--status-queued-fg)' },
    'SKIPPED': { bg: 'var(--status-skipped-bg)', text: 'var(--status-skipped-fg)' }
  }
  
  const color = colors[status] || { bg: 'var(--status-pending-bg)', text: 'var(--status-pending-fg)' }
  const fontSize = large ? '0.875rem' : small ? '0.675rem' : '0.75rem'
  const padding = large ? '0.375rem 0.75rem' : small ? '0.125rem 0.375rem' : '0.25rem 0.5rem'
  
  return (
    <span style={{
      display: 'inline-block',
      padding,
      fontSize,
      fontWeight: 600,
      backgroundColor: color.bg,
      color: color.text,
      borderRadius: 'var(--radius-sm)',
      textTransform: 'uppercase',
      letterSpacing: '0.025em',
      boxShadow: color.glow || 'none'
    }}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

function StatBox({ label, value, color }: { label: string, value: number, color: string }) {
  return (
    <div style={{
      padding: '0.75rem',
      border: '1px solid var(--border-primary)',
      borderRadius: 'var(--radius)',
      textAlign: 'center',
      backgroundColor: 'var(--card-bg)'
    }}>
      <div style={{
        fontSize: '1.5rem',
        fontWeight: 700,
        color,
        marginBottom: '0.25rem'
      }}>
        {value}
      </div>
      <div style={{
        fontSize: '0.75rem',
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em'
      }}>
        {label}
      </div>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

export default App
