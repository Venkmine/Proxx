import { useState, useEffect } from 'react'

const BACKEND_URL = 'http://127.0.0.1:8000'

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
      padding: 0
    }}>
      {/* Header */}
      <div style={{
        padding: '1rem 1.5rem',
        borderBottom: '1px solid #ccc',
        backgroundColor: '#f5f5f5'
      }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600 }}>
          Proxx — Operator Control
        </h1>
      </div>

      {/* Error Banner */}
      {error && (
        <div style={{
          padding: '1rem 1.5rem',
          backgroundColor: '#fee',
          color: '#c00',
          borderBottom: '1px solid #fcc'
        }}>
          {error}
        </div>
      )}

      {/* Main Content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Job List Panel */}
        <div style={{
          width: '400px',
          borderRight: '1px solid #ccc',
          overflow: 'auto',
          backgroundColor: '#fafafa'
        }}>
          <div style={{
            padding: '1rem 1.5rem',
            borderBottom: '1px solid #ccc',
            backgroundColor: '#fff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
              Jobs ({jobs.length})
            </h2>
            <button
              onClick={fetchJobs}
              style={{
                padding: '0.25rem 0.75rem',
                fontSize: '0.875rem',
                cursor: 'pointer',
                border: '1px solid #ccc',
                backgroundColor: '#fff',
                borderRadius: '3px'
              }}
            >
              Refresh
            </button>
          </div>
          
          {jobs.length === 0 ? (
            <div style={{ padding: '2rem 1.5rem', color: '#666', textAlign: 'center' }}>
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
                    borderBottom: '1px solid #eee',
                    cursor: 'pointer',
                    backgroundColor: selectedJobId === job.id ? '#e6f2ff' : '#fff',
                    transition: 'background-color 0.1s'
                  }}
                  onMouseEnter={(e) => {
                    if (selectedJobId !== job.id) {
                      e.currentTarget.style.backgroundColor = '#f5f5f5'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedJobId !== job.id) {
                      e.currentTarget.style.backgroundColor = '#fff'
                    }
                  }}
                >
                  <div style={{
                    fontSize: '0.75rem',
                    color: '#666',
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
                    gap: '0.5rem'
                  }}>
                    <StatusBadge status={job.status} />
                    <span>{new Date(job.created_at).toLocaleString()}</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#666' }}>
                    {job.total_tasks} clips: {job.completed_count} completed, {job.failed_count} failed, {job.skipped_count} skipped
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Job Detail Panel */}
        <div style={{ flex: 1, overflow: 'auto', backgroundColor: '#fff' }}>
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
              Loading...
            </div>
          ) : !jobDetail ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
              Select a job to view details
            </div>
          ) : (
            <div style={{ padding: '1.5rem' }}>
              {/* Job Header */}
              <div style={{ marginBottom: '2rem' }}>
                <div style={{
                  fontSize: '0.875rem',
                  color: '#666',
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
                  <div style={{ fontSize: '0.875rem', color: '#666' }}>
                    {jobDetail.total_tasks} clips total
                  </div>
                </div>
                
                {/* Timestamps */}
                <div style={{
                  fontSize: '0.875rem',
                  color: '#666',
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
                  <StatBox label="Completed" value={jobDetail.completed_count} color="#4a4" />
                  <StatBox label="Failed" value={jobDetail.failed_count} color="#c44" />
                  <StatBox label="Skipped" value={jobDetail.skipped_count} color="#888" />
                  <StatBox label="Running" value={jobDetail.running_count} color="#48c" />
                  <StatBox label="Queued" value={jobDetail.queued_count} color="#888" />
                  <StatBox label="Warnings" value={jobDetail.warning_count} color="#f80" />
                </div>

                {/* Control Buttons */}
                <div style={{
                  display: 'flex',
                  gap: '0.75rem',
                  paddingTop: '1rem',
                  borderTop: '1px solid #eee'
                }}>
                  {(jobDetail.status === 'RECOVERY_REQUIRED' || jobDetail.status === 'PAUSED') && (
                    <button
                      onClick={() => resumeJob(jobDetail.id)}
                      disabled={loading}
                      style={{
                        padding: '0.5rem 1rem',
                        fontSize: '0.875rem',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        border: '1px solid #48c',
                        backgroundColor: '#48c',
                        color: '#fff',
                        borderRadius: '3px',
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
                        border: '1px solid #f80',
                        backgroundColor: '#f80',
                        color: '#fff',
                        borderRadius: '3px',
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
                        border: '1px solid #c44',
                        backgroundColor: '#fff',
                        color: '#c44',
                        borderRadius: '3px',
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
                        border: '1px solid #666',
                        backgroundColor: '#fff',
                        color: '#666',
                        borderRadius: '3px',
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
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>
                    Reports
                  </h3>
                  <div style={{
                    border: '1px solid #ddd',
                    borderRadius: '3px',
                    overflow: 'hidden'
                  }}>
                    {reports.map((report, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '0.75rem 1rem',
                          borderBottom: idx < reports.length - 1 ? '1px solid #eee' : 'none',
                          fontSize: '0.875rem',
                          fontFamily: 'monospace'
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
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>
                  Clips ({jobDetail.tasks.length})
                </h3>
                <div style={{
                  border: '1px solid #ddd',
                  borderRadius: '3px',
                  overflow: 'hidden'
                }}>
                  {jobDetail.tasks.map((task, idx) => (
                    <div
                      key={task.id}
                      style={{
                        padding: '1rem',
                        borderBottom: idx < jobDetail.tasks.length - 1 ? '1px solid #eee' : 'none'
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
                          color: '#333',
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
                          color: '#c44',
                          marginTop: '0.5rem',
                          paddingLeft: '1.5rem'
                        }}>
                          Error: {task.failure_reason}
                        </div>
                      )}
                      
                      {task.warnings.length > 0 && (
                        <div style={{
                          fontSize: '0.75rem',
                          color: '#f80',
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
  const colors: Record<string, { bg: string, text: string }> = {
    'PENDING': { bg: '#eee', text: '#666' },
    'RUNNING': { bg: '#d6f0ff', text: '#0066cc' },
    'PAUSED': { bg: '#fff4e6', text: '#cc7a00' },
    'COMPLETED': { bg: '#e6f7e6', text: '#2d7a2d' },
    'COMPLETED_WITH_WARNINGS': { bg: '#fff4e6', text: '#cc7a00' },
    'FAILED': { bg: '#ffe6e6', text: '#cc0000' },
    'CANCELLED': { bg: '#f0f0f0', text: '#666' },
    'RECOVERY_REQUIRED': { bg: '#ffe6e6', text: '#cc0000' },
    'QUEUED': { bg: '#eee', text: '#666' },
    'SKIPPED': { bg: '#f0f0f0', text: '#888' }
  }
  
  const color = colors[status] || { bg: '#eee', text: '#666' }
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
      borderRadius: '3px',
      textTransform: 'uppercase',
      letterSpacing: '0.025em'
    }}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

function StatBox({ label, value, color }: { label: string, value: number, color: string }) {
  return (
    <div style={{
      padding: '0.75rem',
      border: '1px solid #ddd',
      borderRadius: '3px',
      textAlign: 'center'
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
        color: '#666',
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
