import { useState, useEffect, useCallback, useMemo } from 'react'
import { TitleBar } from './components/TitleBar'
import { Button } from './components/Button'
import { JobGroup } from './components/JobGroup'
import { CreateJobPanel } from './components/CreateJobPanel'
import { QueueFilterBar } from './components/QueueFilterBar'
import { DeliverControlPanel, DeliverSettings, SelectionContext } from './components/DeliverControlPanel'

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
  // Phase 16.1: Output path for reveal
  output_path: string | null
  // Phase 16.4: Progress tracking
  progress_percent: number
  eta_seconds: number | null
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

  // Settings dialog
  const [settingsDialogJobId, setSettingsDialogJobId] = useState<string | null>(null)
  const [settingsForm, setSettingsForm] = useState({
    output_dir: '',
    naming_template: '{source_name}__proxx',
    watermark_enabled: false,
    watermark_text: ''
  })

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
  // Phase 17: DeliverSettings State (Authoritative)
  // ============================================
  
  // Default DeliverSettings - matches backend DeliverCapabilities
  const getDefaultDeliverSettings = (): DeliverSettings => ({
    video: {
      codec: 'h264',
      resolution_policy: 'source',
      frame_rate_policy: 'source',
      pixel_aspect_ratio: 'square',
      quality: 23,
    },
    audio: {
      codec: 'aac',
      layout: 'source',
      sample_rate: 48000,
      passthrough: true,
    },
    file: {
      container: 'mp4',
      naming_template: '{source_name}_proxy',
      overwrite_policy: 'increment',
      preserve_source_dirs: false,
      preserve_dir_levels: 0,
    },
    metadata: {
      strip_all_metadata: false,
      passthrough_all_container_metadata: true,
      passthrough_timecode: true,
      passthrough_reel_name: true,
      passthrough_camera_metadata: true,
      passthrough_color_metadata: true,
    },
    overlay: {
      text_layers: [],
    },
    output_dir: '',
  })
  
  const [deliverSettings, setDeliverSettings] = useState<DeliverSettings>(getDefaultDeliverSettings())
  
  // Track if preset was applied (for UI indicator)
  const [appliedPresetName, setAppliedPresetName] = useState<string | null>(null)
  
  // Derive Deliver panel context from selection state
  const getDeliverContext = (): SelectionContext => {
    if (selectedJobId) {
      const job = jobs.find(j => j.id === selectedJobId)
      if (!job) return { type: 'none' as const }
      const status = job.status.toUpperCase()
      if (status === 'PENDING') return { type: 'job-pending' as const, jobId: selectedJobId }
      if (status === 'RUNNING' || status === 'PAUSED') return { type: 'job-running' as const, jobId: selectedJobId }
      return { type: 'job-completed' as const, jobId: selectedJobId }
    }
    if (selectedFiles.length > 0) {
      return { type: 'pre-job' as const, files: selectedFiles }
    }
    return { type: 'none' as const }
  }
  
  const deliverContext = getDeliverContext()
  const isDeliverReadOnly = deliverContext.type === 'job-running' || deliverContext.type === 'job-completed'

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

  // Phase 17: Fetch DeliverSettings for a preset (populates Deliver panel)
  const fetchPresetDeliverSettings = async (presetId: string): Promise<boolean> => {
    try {
      const response = await fetch(`${BACKEND_URL}/control/presets/${presetId}/deliver-settings`)
      if (!response.ok) {
        // Fallback: preset may not have deliver settings endpoint yet
        console.warn(`Preset ${presetId} deliver-settings not available, using defaults`)
        return false
      }
      const data = await response.json()
      // Apply preset settings to panel (preset is starting point, not authority)
      setDeliverSettings(prev => ({
        ...prev,
        video: { ...prev.video, ...data.video },
        audio: { ...prev.audio, ...data.audio },
        file: { ...prev.file, ...data.file },
        metadata: { ...prev.metadata, ...data.metadata },
        overlay: data.overlay || prev.overlay,
      }))
      // Track applied preset for UI indicator
      const preset = presets.find(p => p.id === presetId)
      setAppliedPresetName(preset?.name || presetId)
      return true
    } catch (err) {
      console.error(`Failed to fetch preset deliver settings: ${err}`)
      return false
    }
  }

  // Phase 17: Fetch DeliverSettings for a job (syncs panel with backend truth)
  const fetchJobDeliverSettings = async (jobId: string) => {
    try {
      const response = await fetch(`${BACKEND_URL}/jobs/${jobId}/deliver-settings`)
      if (!response.ok) {
        // Fallback for older jobs without deliver-settings
        console.warn(`Job ${jobId} deliver-settings not available`)
        return
      }
      const data = await response.json()
      setDeliverSettings({
        video: data.video || getDefaultDeliverSettings().video,
        audio: data.audio || getDefaultDeliverSettings().audio,
        file: data.file || getDefaultDeliverSettings().file,
        metadata: data.metadata || getDefaultDeliverSettings().metadata,
        overlay: data.overlay || getDefaultDeliverSettings().overlay,
        output_dir: data.output_dir || '',
      })
      setAppliedPresetName(null) // Job owns settings, not preset
    } catch (err) {
      console.error(`Failed to fetch job deliver settings: ${err}`)
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

  // Phase 16.1: Auto-refresh job state every 1.5 seconds
  useEffect(() => {
    const refreshInterval = setInterval(() => {
      fetchJobs()
      // Also refresh details for running jobs
      jobs.forEach(job => {
        const status = job.status.toUpperCase()
        if (status === 'RUNNING' || status === 'PAUSED' || status === 'RECOVERY_REQUIRED') {
          fetchJobDetail(job.id)
        }
      })
    }, 1500)
    
    return () => clearInterval(refreshInterval)
  }, [jobs])

  useEffect(() => {
    // Fetch details for all jobs
    jobs.forEach(job => {
      if (!jobDetails.has(job.id)) {
        fetchJobDetail(job.id)
      }
    })
  }, [jobs])

  // Phase 17: Fetch DeliverSettings when a job is selected (sync panel with backend truth)
  useEffect(() => {
    if (selectedJobId) {
      fetchJobDeliverSettings(selectedJobId)
    } else if (selectedFiles.length === 0) {
      // No job or files selected, reset to defaults
      setDeliverSettings(getDefaultDeliverSettings())
      setAppliedPresetName(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJobId])

  // ============================================
  // Job Actions
  // ============================================

  const confirmAction = (message: string): boolean => window.confirm(message)

  const resumeJob = async (jobId: string) => {
    // Phase 16.4: No confirmation for routine actions
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

    // Phase 16.4: No confirmation for routine actions
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

  const openJobSettings = async (jobId: string) => {
    try {
      // Fetch current settings
      const response = await fetch(`${BACKEND_URL}/control/jobs/${jobId}/settings`)
      if (response.ok) {
        const settings = await response.json()
        setSettingsForm({
          output_dir: settings.output_dir || '',
          naming_template: settings.naming_template || '{source_name}__proxx',
          watermark_enabled: settings.watermark_enabled || false,
          watermark_text: settings.watermark_text || ''
        })
      }
      setSettingsDialogJobId(jobId)
    } catch (err) {
      setError(`Failed to load settings: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const saveJobSettings = async () => {
    if (!settingsDialogJobId) return

    try {
      setLoading(true)
      const response = await fetch(`${BACKEND_URL}/control/jobs/${settingsDialogJobId}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsForm),
      })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }
      setSettingsDialogJobId(null)
      await fetchJobDetail(settingsDialogJobId)
    } catch (err) {
      setError(`Failed to save settings: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  // ============================================
  // Phase 16: New Job Actions (Start, Pause, Delete)
  // ============================================

  const startJob = async (jobId: string) => {
    // Phase 16.4: No confirmation for routine actions
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
    // Phase 16.4: No confirmation for routine actions
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
      return  // No pending jobs, silently return
    }

    // Phase 16.4: No confirmation for routine actions
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

    // Phase 17: No confirmation for routine actions
    try {
      setLoading(true)
      
      // Phase 17: Use DeliverSettings from the Deliver panel (not hardcoded defaults)
      // The panel is the source of truth for what the job runs with
      const jobDeliverSettings = {
        output_dir: outputDirectory || deliverSettings.output_dir || null,
        video: deliverSettings.video,
        audio: deliverSettings.audio,
        file: deliverSettings.file,
        metadata: deliverSettings.metadata,
        overlay: deliverSettings.overlay,
      }
      
      const response = await fetch(`${BACKEND_URL}/control/jobs/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_paths: selectedFiles,
          preset_id: selectedPresetId,
          engine: selectedEngine,
          deliver_settings: jobDeliverSettings,
        }),
      })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }
      const result = await response.json()
      
      // Phase 17: Clear form but keep Deliver panel values as starting point for next job
      setSelectedFiles([])
      setSelectedPresetId('')
      setOutputDirectory('')
      setAppliedPresetName(null)
      
      // Fetch jobs and select the newly created one
      await fetchJobs()
      setSelectedJobId(result.job_id)
      
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
  // Phase 17: Preset Selection → Deliver Panel Sync
  // ============================================
  
  const handlePresetChange = async (presetId: string) => {
    setSelectedPresetId(presetId)
    if (presetId) {
      // Fetch preset's deliver settings and populate panel
      // Preset is a one-time initializer, not authority
      await fetchPresetDeliverSettings(presetId)
    } else {
      // No preset selected, clear applied indicator
      setAppliedPresetName(null)
    }
  }
  
  // Handle deliver settings changes from the panel
  const handleDeliverSettingsChange = (updates: Partial<typeof deliverSettings>) => {
    setDeliverSettings(prev => {
      const newSettings = { ...prev }
      if (updates.video) newSettings.video = { ...prev.video, ...updates.video }
      if (updates.audio) newSettings.audio = { ...prev.audio, ...updates.audio }
      if (updates.file) newSettings.file = { ...prev.file, ...updates.file }
      if (updates.metadata) newSettings.metadata = { ...prev.metadata, ...updates.metadata }
      if (updates.overlay) newSettings.overlay = { ...prev.overlay, ...updates.overlay }
      if (updates.output_dir !== undefined) newSettings.output_dir = updates.output_dir
      return newSettings
    })
    // Clear preset indicator on any manual edit
    if (appliedPresetName && deliverContext.type !== 'job-pending') {
      setAppliedPresetName(null)
    }
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
        onPresetChange={handlePresetChange}
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
          setAppliedPresetName(null)
        }}
        loading={loading}
        hasElectron={hasElectron}
        backendUrl={BACKEND_URL}
      />

      {/* Phase 17: Two-Column Layout (Queue + Deliver Panel) */}
      <div style={{
        flex: 1,
        display: 'flex',
        overflow: 'hidden',
      }}>
        {/* Left Column: Queue */}
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
                  onRebindPreset={() => openJobSettings(job.id)}
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
        
        {/* Right Column: Deliver Panel (always visible) */}
        <DeliverControlPanel
          context={deliverContext}
          settings={deliverSettings}
          onSettingsChange={handleDeliverSettingsChange}
          isReadOnly={isDeliverReadOnly}
          backendUrl={BACKEND_URL}
          appliedPresetName={appliedPresetName}
        />
      </div>

      {/* Settings Dialog - DEPRECATED: Remove in Phase 17.1 */}
      {settingsDialogJobId && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setSettingsDialogJobId(null)}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border-primary)',
              borderRadius: '8px',
              padding: '1.5rem',
              minWidth: '500px',
              maxWidth: '600px',
              maxHeight: '80vh',
              overflow: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', fontWeight: 600 }}>
              Job Settings
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Output Directory */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                  Output Directory
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    value={settingsForm.output_dir}
                    onChange={(e) => setSettingsForm({ ...settingsForm, output_dir: e.target.value })}
                    placeholder="Leave empty to use source directory"
                    style={{
                      flex: 1,
                      padding: '0.5rem',
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border-secondary)',
                      borderRadius: '4px',
                      color: 'var(--text-primary)',
                      fontSize: '0.875rem',
                    }}
                  />
                  {hasElectron && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={async () => {
                        const path = await window.electron!.openFolder()
                        if (path) {
                          setSettingsForm({ ...settingsForm, output_dir: path })
                        }
                      }}
                    >
                      Browse
                    </Button>
                  )}
                </div>
              </div>

              {/* Naming Template */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                  Naming Template
                </label>
                <input
                  type="text"
                  value={settingsForm.naming_template}
                  onChange={(e) => setSettingsForm({ ...settingsForm, naming_template: e.target.value })}
                  placeholder="{source_name}__proxx"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-secondary)',
                    borderRadius: '4px',
                    color: 'var(--text-primary)',
                    fontSize: '0.875rem',
                  }}
                />
                <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Available tokens: {'{source_name}'}, {'{width}'}, {'{height}'}, {'{codec}'}, {'{preset}'}
                </div>
              </div>

              {/* Watermark */}
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                  <input
                    type="checkbox"
                    checked={settingsForm.watermark_enabled}
                    onChange={(e) => setSettingsForm({ ...settingsForm, watermark_enabled: e.target.checked })}
                    style={{ width: '16px', height: '16px' }}
                  />
                  Enable Watermark
                </label>
                {settingsForm.watermark_enabled && (
                  <input
                    type="text"
                    value={settingsForm.watermark_text}
                    onChange={(e) => setSettingsForm({ ...settingsForm, watermark_text: e.target.value })}
                    placeholder="Watermark text"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border-secondary)',
                      borderRadius: '4px',
                      color: 'var(--text-primary)',
                      fontSize: '0.875rem',
                    }}
                  />
                )}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => setSettingsDialogJobId(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  onClick={saveJobSettings}
                  disabled={loading}
                >
                  Save Settings
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
