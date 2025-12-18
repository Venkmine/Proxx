import { useState, useEffect, useCallback, useMemo } from 'react'
import { TitleBar } from './components/TitleBar'
import { Button } from './components/Button'
import { JobGroup } from './components/JobGroup'
import { CreateJobPanel } from './components/CreateJobPanel'
import { QueueFilterBar } from './components/QueueFilterBar'

/**
 * Proxx Operator Control - Grouped Queue View
 * 
 * STRUCTURAL UI REFACTOR: Operator-first interaction model inspired by DaVinci Resolve's Render Queue.
 * 
 * Core principles:
 * - ALL jobs visible at all times (no inspector-style single job view)
 * - Each job is a GROUP showing its clips by default
 * - Selecting a job changes AVAILABLE CONTROLS, not VISIBILITY
 * - Jobs are reorderable via drag & drop
 * - Create Job panel persists after job creation
 * 
 * Phase 16: Full operator control with start, pause, delete, global filters.
 */

const BACKEND_URL = 'http://127.0.0.1:8085'

// Electron IPC types
declare global {
  interface Window {
    electron?: {
      openFiles: () => Promise<string[]>
      openFolder: () => Promise<string | null>
      showItemInFolder: (filePath: string) => Promise<void>
    }
  }
}

const hasElectron = typeof window !== 'undefined' && window.electron !== undefined

// Types matching backend monitoring models (Phase 16: includes metadata)
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
  // Phase 16: Media metadata
  resolution: string | null
  codec: string | null
  frame_rate: string | null
  duration: string | null
  audio_channels: string | null
  color_space: string | null
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

interface PresetInfo {
  id: string
  name: string
}

// Date filter helper
function matchesDateFilter(dateStr: string, filter: 'all' | 'today' | 'yesterday' | 'week'): boolean {
  if (filter === 'all') return true
  
  const date = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
  
  switch (filter) {
    case 'today':
      return date >= today
    case 'yesterday':
      return date >= yesterday && date < today
    case 'week':
      return date >= weekAgo
    default:
      return true
  }
}

function App() {
  // Job queue state
  const [jobs, setJobs] = useState<JobSummary[]>([])
  const [jobDetails, setJobDetails] = useState<Map<string, JobDetail>>(new Map())
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [jobOrder, setJobOrder] = useState<string[]>([]) // Frontend-only ordering
  const [error, setError] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)

  // Global status filters (Phase 16: applies to job list)
  const [globalStatusFilters, setGlobalStatusFilters] = useState<Set<string>>(new Set())
  
  // Search and date filter
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | 'week'>('all')

  // Per-job clip status filters
  const [activeStatusFilters, setActiveStatusFilters] = useState<Set<string>>(new Set())

  // Clip selection
  const [selectedClipIds, setSelectedClipIds] = useState<Set<string>>(new Set())

  // Create Job panel state
  const [showCreateJobPanel, setShowCreateJobPanel] = useState<boolean>(true) // Visible by default
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const [selectedPresetId, setSelectedPresetId] = useState<string>('')
  const [selectedEngine, setSelectedEngine] = useState<string>('ffmpeg') // Phase 16: Engine selection
  const [outputDirectory, setOutputDirectory] = useState<string>('')
  const [presets, setPresets] = useState<PresetInfo[]>([])
  const [presetError, setPresetError] = useState<string>('')

  // Phase 16: Engine list
  interface EngineInfo {
    type: string
    name: string
    available: boolean
  }
  const [engines, setEngines] = useState<EngineInfo[]>([])

  // Path favorites (localStorage-backed)
  const [pathFavorites, setPathFavorites] = useState<string[]>(() => {
    const saved = localStorage.getItem('proxx_path_favorites')
    return saved ? JSON.parse(saved) : []
  })

  // Drag state for job reordering
  const [draggedJobId, setDraggedJobId] = useState<string | null>(null)

  // ============================================
  // Data Fetching
  // ============================================

  const fetchPresets = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/control/presets`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      setPresets(data.presets)
      setPresetError('')
    } catch (err) {
      const msg = `Failed to load presets: ${err instanceof Error ? err.message : 'Unknown error'}`
      setPresetError(msg)
    }
  }

  // Phase 16: Fetch engines
  const fetchEngines = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/control/engines`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      setEngines(data.engines)
    } catch (err) {
      console.error('Failed to load engines:', err)
      // Default to FFmpeg if fetch fails
      setEngines([{ type: 'ffmpeg', name: 'FFmpeg', available: true }])
    }
  }

  const fetchJobs = async () => {
    try {
      setError('')
      const response = await fetch(`${BACKEND_URL}/monitor/jobs`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      setJobs(data.jobs)

      // Update job order - add new jobs, keep existing order
      setJobOrder(prev => {
        const existingIds = new Set(prev)
        const newIds = data.jobs
          .map((j: JobSummary) => j.id)
          .filter((id: string) => !existingIds.has(id))
        return [...prev.filter(id => data.jobs.some((j: JobSummary) => j.id === id)), ...newIds]
      })
    } catch (err) {
      setError(`Failed to fetch jobs: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const fetchJobDetail = async (jobId: string) => {
    try {
      const response = await fetch(`${BACKEND_URL}/monitor/jobs/${jobId}`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const detail = await response.json()
      setJobDetails(prev => new Map(prev).set(jobId, detail))
    } catch (err) {
      console.error(`Failed to fetch job detail for ${jobId}:`, err)
    }
  }

  // Fetch all job details on mount and when jobs change
  useEffect(() => {
    fetchJobs()
    fetchPresets()
    fetchEngines()  // Phase 16
  }, [])

  useEffect(() => {
    // Fetch details for all jobs
    jobs.forEach(job => {
      if (!jobDetails.has(job.id)) {
        fetchJobDetail(job.id)
      }
    })
  }, [jobs])

  // ============================================
  // Job Actions
  // ============================================

  const confirmAction = (message: string): boolean => window.confirm(message)

  const resumeJob = async (jobId: string) => {
    const message = `Resume job?\n\nThis will continue execution from where it stopped.\nCompleted clips will NOT be re-run.`
    if (!confirmAction(message)) return

    try {
      setLoading(true)
      const response = await fetch(`${BACKEND_URL}/control/jobs/${jobId}/resume`, { method: 'POST' })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }
      await fetchJobDetail(jobId)
      await fetchJobs()
    } catch (err) {
      setError(`Failed to resume job: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const retryFailedClips = async (jobId: string) => {
    const detail = jobDetails.get(jobId)
    if (!detail) return

    const message = `Retry ${detail.failed_count} failed clips?\n\nCOMPLETED clips will NOT be re-run.\nOnly FAILED clips will be retried.`
    if (!confirmAction(message)) return

    try {
      setLoading(true)
      const response = await fetch(`${BACKEND_URL}/control/jobs/${jobId}/retry-failed`, { method: 'POST' })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }
      await fetchJobDetail(jobId)
      await fetchJobs()
    } catch (err) {
      setError(`Failed to retry clips: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const cancelJob = async (jobId: string) => {
    const message = `Cancel job?\n\nRunning clips will finish.\nQueued clips will be marked SKIPPED.\n\nThis operation CANNOT be undone.`
    if (!confirmAction(message)) return

    try {
      setLoading(true)
      const response = await fetch(`${BACKEND_URL}/control/jobs/${jobId}/cancel`, { method: 'POST' })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }
      await fetchJobDetail(jobId)
      await fetchJobs()
    } catch (err) {
      setError(`Failed to cancel job: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const rebindPreset = async (jobId: string) => {
    const presetId = presets.length > 0
      ? prompt(`Enter preset ID:\n\nAvailable presets:\n${presets.map(p => `${p.id} (${p.name})`).join('\n')}`)
      : prompt('Enter new preset ID:')

    if (!presetId) return

    const message = `Rebind job to preset "${presetId}"?\n\nThis will OVERWRITE any existing preset binding.`
    if (!confirmAction(message)) return

    try {
      setLoading(true)
      const response = await fetch(`${BACKEND_URL}/control/jobs/${jobId}/rebind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset_id: presetId }),
      })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }
      await fetchJobDetail(jobId)
    } catch (err) {
      setError(`Failed to rebind preset: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  // ============================================
  // Phase 16: New Job Actions (Start, Pause, Delete)
  // ============================================

  const startJob = async (jobId: string) => {
    const message = `Start rendering job?\n\nThis will begin processing all clips.`
    if (!confirmAction(message)) return

    try {
      setLoading(true)
      const response = await fetch(`${BACKEND_URL}/control/jobs/${jobId}/start`, { method: 'POST' })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }
      await fetchJobDetail(jobId)
      await fetchJobs()
    } catch (err) {
      setError(`Failed to start job: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const pauseJob = async (jobId: string) => {
    const message = `Pause job?\n\nCurrent clip will finish.\nRemaining clips will wait.`
    if (!confirmAction(message)) return

    try {
      setLoading(true)
      const response = await fetch(`${BACKEND_URL}/control/jobs/${jobId}/pause`, { method: 'POST' })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }
      await fetchJobDetail(jobId)
      await fetchJobs()
    } catch (err) {
      setError(`Failed to pause job: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const deleteJob = async (jobId: string) => {
    const message = `Delete this job?\n\nThis will remove it from the queue.\nThis action CANNOT be undone.`
    if (!confirmAction(message)) return

    try {
      setLoading(true)
      const response = await fetch(`${BACKEND_URL}/control/jobs/${jobId}`, { method: 'DELETE' })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }
      // Clear selection if deleted job was selected
      if (selectedJobId === jobId) {
        setSelectedJobId(null)
        setSelectedClipIds(new Set())
      }
      await fetchJobs()
    } catch (err) {
      setError(`Failed to delete job: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const renderAllJobs = async () => {
    const pendingJobs = jobs.filter(j => j.status.toUpperCase() === 'PENDING')
    if (pendingJobs.length === 0) {
      alert('No pending jobs to render.')
      return
    }

    const message = `Render ${pendingJobs.length} pending job(s)?\n\nJobs will be processed in queue order.`
    if (!confirmAction(message)) return

    try {
      setLoading(true)
      // Start jobs in order
      for (const job of pendingJobs) {
        const response = await fetch(`${BACKEND_URL}/control/jobs/${job.id}/start`, { method: 'POST' })
        if (!response.ok) {
          const errorData = await response.json()
          console.error(`Failed to start job ${job.id}:`, errorData.detail)
          // Continue to next job even if one fails
        }
      }
      await fetchJobs()
    } catch (err) {
      setError(`Render all failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  // ============================================
  // Create Job
  // ============================================

  const createManualJob = async () => {
    if (!selectedFiles.length) {
      alert('Please select at least one file')
      return
    }
    if (!selectedPresetId) {
      alert('Please select a preset')
      return
    }

    const engineName = engines.find(e => e.type === selectedEngine)?.name || selectedEngine
    const message = `Create job with ${selectedFiles.length} clip(s)?\n\nPreset: ${selectedPresetId}\nEngine: ${engineName}\n\nJob will be created in PENDING state.`
    if (!confirmAction(message)) return

    try {
      setLoading(true)
      const response = await fetch(`${BACKEND_URL}/control/jobs/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_paths: selectedFiles,
          preset_id: selectedPresetId,
          output_base_dir: outputDirectory || null,
          engine: selectedEngine,  // Phase 16: Include engine
        }),
      })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }
      const result = await response.json()
      alert(`Job created successfully\nJob ID: ${result.job_id}\nEngine: ${engineName}`)

      // Clear form BUT keep panel open (per design requirements)
      setSelectedFiles([])
      setSelectedPresetId('')
      setOutputDirectory('')
      // NOTE: Do NOT hide panel - setShowCreateJobPanel(false)
      await fetchJobs()
    } catch (err) {
      setError(`Failed to create job: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  // ============================================
  // File/Folder Selection (Electron)
  // ============================================

  const selectFiles = async () => {
    if (!hasElectron) {
      alert('File picker requires Electron runtime')
      return
    }
    try {
      const paths = await window.electron!.openFiles()
      if (paths.length > 0) {
        setSelectedFiles(paths)
      }
    } catch (err) {
      setError(`File selection failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const selectOutputFolder = async () => {
    if (!hasElectron) {
      alert('Folder picker requires Electron runtime')
      return
    }
    try {
      const path = await window.electron!.openFolder()
      if (path) {
        setOutputDirectory(path)
      }
    } catch (err) {
      setError(`Folder selection failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const revealInFolder = async (filePath: string) => {
    if (!hasElectron) return
    try {
      await window.electron!.showItemInFolder(filePath)
    } catch (err) {
      setError(`Failed to reveal file: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  // ============================================
  // Path Favorites
  // ============================================

  const addPathFavorite = (path: string) => {
    if (!pathFavorites.includes(path)) {
      const updated = [...pathFavorites, path]
      setPathFavorites(updated)
      localStorage.setItem('proxx_path_favorites', JSON.stringify(updated))
    }
  }

  const removePathFavorite = (path: string) => {
    const updated = pathFavorites.filter(p => p !== path)
    setPathFavorites(updated)
    localStorage.setItem('proxx_path_favorites', JSON.stringify(updated))
  }

  // ============================================
  // Status Filter Toggle (per-job clip filtering)
  // ============================================

  const toggleStatusFilter = useCallback((status: string) => {
    setActiveStatusFilters(prev => {
      const newFilters = new Set(prev)
      if (newFilters.has(status)) {
        newFilters.delete(status)
      } else {
        newFilters.add(status)
      }
      return newFilters
    })
  }, [])

  // ============================================
  // Global Status Filter Toggle (job-level filtering)
  // ============================================

  const toggleGlobalStatusFilter = useCallback((status: string) => {
    setGlobalStatusFilters(prev => {
      const newFilters = new Set(prev)
      if (newFilters.has(status)) {
        newFilters.delete(status)
      } else {
        newFilters.add(status)
      }
      return newFilters
    })
  }, [])

  const clearGlobalStatusFilters = useCallback(() => {
    setGlobalStatusFilters(new Set())
  }, [])

  // ============================================
  // Clip Selection
  // ============================================

  const handleClipClick = useCallback((clipId: string, event: React.MouseEvent) => {
    const currentJobId = selectedJobId
    if (!currentJobId) return
    
    const detail = jobDetails.get(currentJobId)
    if (!detail) return

    if (event.shiftKey && selectedClipIds.size > 0) {
      // Range select
      const clipIds = detail.tasks.map(t => t.id)
      const lastSelectedId = Array.from(selectedClipIds).pop()
      const lastIndex = clipIds.indexOf(lastSelectedId!)
      const currentIndex = clipIds.indexOf(clipId)

      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex)
        const end = Math.max(lastIndex, currentIndex)
        const rangeIds = clipIds.slice(start, end + 1)
        setSelectedClipIds(new Set([...selectedClipIds, ...rangeIds]))
      }
    } else if (event.metaKey || event.ctrlKey) {
      // Toggle select
      const newSelection = new Set(selectedClipIds)
      if (newSelection.has(clipId)) {
        newSelection.delete(clipId)
      } else {
        newSelection.add(clipId)
      }
      setSelectedClipIds(newSelection)
    } else {
      // Single select
      setSelectedClipIds(new Set([clipId]))
    }
  }, [selectedJobId, jobDetails, selectedClipIds])

  // ============================================
  // Job Drag & Drop Reordering
  // ============================================

  const handleJobDragStart = useCallback((jobId: string) => (e: React.DragEvent) => {
    setDraggedJobId(jobId)
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const handleJobDragOver = useCallback((_targetJobId: string) => (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const handleJobDrop = useCallback((targetJobId: string) => (e: React.DragEvent) => {
    e.preventDefault()
    if (!draggedJobId || draggedJobId === targetJobId) {
      setDraggedJobId(null)
      return
    }

    setJobOrder(prev => {
      const newOrder = [...prev]
      const draggedIndex = newOrder.indexOf(draggedJobId)
      const targetIndex = newOrder.indexOf(targetJobId)

      if (draggedIndex === -1 || targetIndex === -1) return prev

      // Remove dragged item and insert at target position
      newOrder.splice(draggedIndex, 1)
      newOrder.splice(targetIndex, 0, draggedJobId)

      // Persist to localStorage for session continuity
      localStorage.setItem('proxx_job_order', JSON.stringify(newOrder))

      return newOrder
    })

    setDraggedJobId(null)
  }, [draggedJobId])

  // ============================================
  // Ordered and Filtered Jobs
  // ============================================

  const orderedJobs = jobOrder
    .map(id => jobs.find(j => j.id === id))
    .filter((j): j is JobSummary => j !== undefined)

  // Include any jobs not in the order list (new jobs)
  const unorderedJobs = jobs.filter(j => !jobOrder.includes(j.id))
  const allOrderedJobs = [...orderedJobs, ...unorderedJobs]

  // Apply global filters and search
  const filteredJobs = useMemo(() => {
    return allOrderedJobs.filter(job => {
      // Status filter
      if (globalStatusFilters.size > 0) {
        const jobStatus = job.status.toUpperCase()
        if (!globalStatusFilters.has(jobStatus)) {
          return false
        }
      }
      
      // Date filter
      if (!matchesDateFilter(job.created_at, dateFilter)) {
        return false
      }
      
      // Search filter (searches clip paths in job details)
      if (searchQuery.trim()) {
        const detail = jobDetails.get(job.id)
        if (detail) {
          const query = searchQuery.toLowerCase()
          const hasMatch = detail.tasks.some(task => 
            task.source_path.toLowerCase().includes(query)
          )
          if (!hasMatch) return false
        }
      }
      
      return true
    })
  }, [allOrderedJobs, globalStatusFilters, dateFilter, searchQuery, jobDetails])

  // Compute status counts for filter bar
  const statusCounts = useMemo(() => {
    const counts = {
      running: 0,
      queued: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
      cancelled: 0,
      pending: 0,
    }
    
    jobs.forEach(job => {
      const status = job.status.toLowerCase()
      if (status === 'running') counts.running++
      else if (status === 'pending') counts.pending++
      else if (status === 'completed') counts.completed++
      else if (status === 'completed_with_warnings') counts.completed++
      else if (status === 'failed') counts.failed++
      else if (status === 'cancelled') counts.cancelled++
      
      // Also count clip-level stats
      counts.queued += job.queued_count
      counts.failed += job.failed_count
      counts.skipped += job.skipped_count
    })
    
    return counts
  }, [jobs])

  // Count pending jobs for Render All button
  const pendingJobCount = jobs.filter(j => j.status.toUpperCase() === 'PENDING').length

  // ============================================
  // Render
  // ============================================

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        margin: 0,
        padding: 0,
        position: 'relative',
      }}
    >
      {/* Background Layers */}
      <div style={{ position: 'fixed', inset: 0, zIndex: -20, background: 'var(--gradient-base)' }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: -10, pointerEvents: 'none', background: 'var(--radial-overlay-2)' }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: -10, pointerEvents: 'none', background: 'var(--radial-overlay-1)' }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: -10, pointerEvents: 'none', background: 'var(--radial-overlay-3)' }} />

      {/* Custom Title Bar (Electron) */}
      {hasElectron && <TitleBar />}

      {/* Header */}
      <header
        style={{
          padding: '0.875rem 1.5rem',
          borderBottom: '1px solid var(--border-primary)',
          background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.6) 0%, rgba(20, 22, 26, 0.95) 100%)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: '1.25rem',
            fontWeight: 600,
            color: 'var(--text-primary)',
            letterSpacing: '-0.02em',
          }}
        >
          Proxx — Operator Control
        </h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {pendingJobCount > 0 && (
            <Button 
              variant="success" 
              size="md" 
              onClick={renderAllJobs}
              loading={loading}
            >
              ▶ Render All ({pendingJobCount})
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={fetchJobs}>
            Refresh
          </Button>
          {!showCreateJobPanel && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowCreateJobPanel(true)}
            >
              + Add to Queue
            </Button>
          )}
        </div>
      </header>

      {/* Error Banner */}
      {error && (
        <div
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: 'var(--error-bg)',
            color: 'var(--error-fg)',
            borderBottom: '1px solid var(--error-border)',
            fontSize: '0.875rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => setError('')}>
            Dismiss
          </Button>
        </div>
      )}

      {/* Create Job Panel - Persists after job creation */}
      <CreateJobPanel
        isVisible={showCreateJobPanel}
        onToggleVisibility={() => setShowCreateJobPanel(false)}
        selectedFiles={selectedFiles}
        onFilesChange={setSelectedFiles}
        onSelectFilesClick={selectFiles}
        presets={presets}
        selectedPresetId={selectedPresetId}
        onPresetChange={setSelectedPresetId}
        presetError={presetError}
        // Phase 16: Engine selection
        engines={engines}
        selectedEngine={selectedEngine}
        onEngineChange={setSelectedEngine}
        outputDirectory={outputDirectory}
        onOutputDirectoryChange={setOutputDirectory}
        onSelectFolderClick={selectOutputFolder}
        pathFavorites={pathFavorites}
        onAddFavorite={addPathFavorite}
        onRemoveFavorite={removePathFavorite}
        onCreateJob={createManualJob}
        onClear={() => {
          setSelectedFiles([])
          setSelectedPresetId('')
          setOutputDirectory('')
        }}
        loading={loading}
        hasElectron={hasElectron}
        backendUrl={BACKEND_URL}
      />

      {/* Main Content - Grouped Queue View */}
      <main
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '0',
        }}
      >
        {/* Global Filter Bar */}
        <QueueFilterBar
          activeStatusFilters={globalStatusFilters}
          onToggleStatusFilter={toggleGlobalStatusFilter}
          onClearStatusFilters={clearGlobalStatusFilters}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          dateFilter={dateFilter}
          onDateFilterChange={setDateFilter}
          statusCounts={statusCounts}
        />

        {/* Queue Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.75rem 1.5rem',
            borderBottom: '1px solid var(--border-secondary)',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: '0.9375rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}
          >
            Render Queue ({filteredJobs.length}{filteredJobs.length !== allOrderedJobs.length ? ` of ${allOrderedJobs.length}` : ''})
          </h2>
          {selectedClipIds.size > 0 && (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {selectedClipIds.size} clip(s) selected
            </span>
          )}
        </div>

        {/* Job Groups */}
        <div style={{ padding: '1rem 1.5rem' }}>
          {filteredJobs.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '3rem',
                color: 'var(--text-muted)',
              }}
            >
              {allOrderedJobs.length === 0 ? (
                <>
                  <div style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>No jobs in queue</div>
                  <div style={{ fontSize: '0.875rem' }}>
                    Add clips using the panel above to get started.
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>No matching jobs</div>
                  <div style={{ fontSize: '0.875rem' }}>
                    Try adjusting your filters or search query.
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => {
                      clearGlobalStatusFilters()
                      setSearchQuery('')
                      setDateFilter('all')
                    }}
                    style={{ marginTop: '1rem' }}
                  >
                    Clear Filters
                  </Button>
                </>
              )}
            </div>
          ) : (
            filteredJobs.map((job, index) => {
              const detail = jobDetails.get(job.id)
              return (
                <JobGroup
                  key={job.id}
                  jobId={job.id}
                  jobNumber={index + 1} // Sequential label: "Job 1", "Job 2", etc.
                  status={job.status}
                  createdAt={job.created_at}
                  startedAt={job.started_at}
                  completedAt={job.completed_at}
                  totalTasks={job.total_tasks}
                  completedCount={job.completed_count}
                  failedCount={job.failed_count}
                  skippedCount={job.skipped_count}
                  runningCount={job.running_count}
                  queuedCount={job.queued_count}
                  warningCount={job.warning_count}
                  tasks={detail?.tasks || []}
                  isSelected={selectedJobId === job.id}
                  onSelect={() => {
                    setSelectedJobId(job.id === selectedJobId ? null : job.id)
                    setSelectedClipIds(new Set())
                    setActiveStatusFilters(new Set())
                  }}
                  onRevealClip={hasElectron ? revealInFolder : undefined}
                  onStart={() => startJob(job.id)}
                  onPause={() => pauseJob(job.id)}
                  onResume={() => resumeJob(job.id)}
                  onRetryFailed={() => retryFailedClips(job.id)}
                  onCancel={() => cancelJob(job.id)}
                  onDelete={() => deleteJob(job.id)}
                  onRebindPreset={() => rebindPreset(job.id)}
                  onDragStart={handleJobDragStart(job.id)}
                  onDragOver={handleJobDragOver(job.id)}
                  onDrop={handleJobDrop(job.id)}
                  isDragging={draggedJobId === job.id}
                  loading={loading}
                  activeStatusFilters={selectedJobId === job.id ? activeStatusFilters : new Set()}
                  onToggleStatusFilter={toggleStatusFilter}
                  selectedClipIds={selectedJobId === job.id ? selectedClipIds : new Set()}
                  onClipClick={handleClipClick}
                />
              )
            })
          )}
        </div>
      </main>
    </div>
  )
}

export default App
