import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { TitleBar } from './components/TitleBar'
import { Button } from './components/Button'
import { JobGroup } from './components/JobGroup'
import { CreateJobPanel } from './components/CreateJobPanel'
import { QueueFilterBar } from './components/QueueFilterBar'
import { DeliverControlPanel, DeliverSettings, SelectionContext } from './components/DeliverControlPanel'
import { UndoToast, useUndoStack } from './components/UndoToast'
import { GlobalDropZone } from './components/GlobalDropZone'
import { CopilotPromptWindow, CopilotPromptBackdrop } from './components/CopilotPromptWindow'

/**
 * Awaire Proxy Operator Control - Grouped Queue View
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

/**
 * Phase 19: Format error responses to human-readable messages.
 * Prevents [object Object] errors from appearing in the UI.
 */
function formatApiError(err: unknown): string {
  if (err instanceof Error) {
    return err.message
  }
  if (typeof err === 'string') {
    return err
  }
  if (typeof err === 'object' && err !== null) {
    // Handle structured error objects
    const obj = err as Record<string, unknown>
    if (typeof obj.detail === 'string') {
      return obj.detail
    }
    if (typeof obj.message === 'string') {
      return obj.message
    }
    if (obj.detail && typeof obj.detail === 'object') {
      // Handle nested detail objects
      const detail = obj.detail as Record<string, unknown>
      if (typeof detail.msg === 'string') {
        return detail.msg
      }
      if (Array.isArray(detail)) {
        // Handle Pydantic validation errors
        return detail.map((d: any) => d.msg || JSON.stringify(d)).join('; ')
      }
      return JSON.stringify(detail)
    }
    return JSON.stringify(obj)
  }
  return 'Unknown error'
}

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
  // Phase 20: Enhanced progress
  encode_fps: number | null
  phase: string | null  // PREPARING | ENCODING | FINALIZING
  thumbnail: string | null
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

  // Create Job panel state (always visible in left column)
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
    const saved = localStorage.getItem('awaire_proxy_path_favorites')
    return saved ? JSON.parse(saved) : []
  })

  // Drag state for job reordering
  const [draggedJobId, setDraggedJobId] = useState<string | null>(null)
  
  // Drag state for file drop
  const [isDraggingFiles, setIsDraggingFiles] = useState<boolean>(false)

  // Phase 20: Copilot Prompt window state
  const [showCopilotPrompt, setShowCopilotPrompt] = useState<boolean>(false)
  
  // Phase 21: System status indicators (UI visibility)
  const [backendConnected, setBackendConnected] = useState<boolean>(true)

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
      const response = await fetch(`${BACKEND_URL}/control/jobs/${jobId}/deliver-settings`)
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
      setBackendConnected(true)

      // Update job order - add new jobs, keep existing order
      setJobOrder(prev => {
        const existingIds = new Set(prev)
        const newIds = data.jobs
          .map((j: JobSummary) => j.id)
          .filter((id: string) => !existingIds.has(id))
        return [...prev.filter(id => data.jobs.some((j: JobSummary) => j.id === id)), ...newIds]
      })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'
      setError(`Failed to fetch jobs: ${errorMsg}`)
      setBackendConnected(false)
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

  // Phase 20: Global document-level drag/drop handlers for authoritative file intake
  // Ensures drops work EVERYWHERE in the app, not just on specific elements
  useEffect(() => {
    const handleDocumentDragOver = (e: DragEvent) => {
      // Prevent browser default (which would open the file)
      e.preventDefault()
      if (e.dataTransfer?.types.includes('Files')) {
        setIsDraggingFiles(true)
        e.dataTransfer.dropEffect = 'copy'
      }
    }

    const handleDocumentDragLeave = (e: DragEvent) => {
      // Only hide overlay if leaving the window entirely
      if (e.relatedTarget === null) {
        setIsDraggingFiles(false)
      }
    }

    const handleDocumentDrop = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDraggingFiles(false)

      const newPaths: string[] = []
      const files = e.dataTransfer?.files
      if (files) {
        for (let i = 0; i < files.length; i++) {
          const file = files[i]
          const path = (file as any).path
          if (path) {
            newPaths.push(path)
          }
        }
      }

      if (newPaths.length > 0) {
        console.log('Document drop: Adding files to intake:', newPaths)
        setSelectedFiles(prev => [...new Set([...prev, ...newPaths])])
        setSelectedJobId(null)
      }
    }

    document.addEventListener('dragover', handleDocumentDragOver)
    document.addEventListener('dragleave', handleDocumentDragLeave)
    document.addEventListener('drop', handleDocumentDrop)

    return () => {
      document.removeEventListener('dragover', handleDocumentDragOver)
      document.removeEventListener('dragleave', handleDocumentDragLeave)
      document.removeEventListener('drop', handleDocumentDrop)
    }
  }, [])

  // Phase 16.1 + Phase 20: Auto-refresh job state
  // Phase 20: 500ms for active encodes, 1.5s for idle
  useEffect(() => {
    const hasActiveEncode = jobs.some(job => job.status.toUpperCase() === 'RUNNING')
    const intervalMs = hasActiveEncode ? 500 : 1500
    
    const refreshInterval = setInterval(() => {
      fetchJobs()
      // Also refresh details for running jobs
      jobs.forEach(job => {
        const status = job.status.toUpperCase()
        if (status === 'RUNNING' || status === 'PAUSED' || status === 'RECOVERY_REQUIRED') {
          fetchJobDetail(job.id)
        }
      })
    }, intervalMs)
    
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
  // Phase 19: Undo Stack (Memory-only)
  // ============================================
  const undoStack = useUndoStack()
  
  // Ref for keyboard focus
  const appContainerRef = useRef<HTMLDivElement>(null)

  // ============================================
  // Job Actions
  // ============================================

  const resumeJob = async (jobId: string) => {
    // Phase 16.4: No confirmation for routine actions
    try {
      setLoading(true)
      const response = await fetch(`${BACKEND_URL}/control/jobs/${jobId}/resume`, { method: 'POST' })
      if (!response.ok) {
        // Normalize backend error payloads to readable messages
        let errorText = `HTTP ${response.status}`
        try {
          const errorData = await response.json()
          if (errorData) {
            if (typeof errorData.detail === 'string') {
              errorText = errorData.detail
            } else {
              // stringify non-string details (objects/arrays)
              errorText = JSON.stringify(errorData)
            }
          }
        } catch (e) {
          // ignore JSON parse errors and keep generic message
        }
        throw new Error(errorText)
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
        // Normalize backend error payloads to readable messages
        let errorText = `HTTP ${response.status}`
        try {
          const errorData = await response.json()
          if (errorData) {
            if (typeof errorData.detail === 'string') {
              errorText = errorData.detail
            } else {
              errorText = JSON.stringify(errorData)
            }
          }
        } catch (e) {
          // ignore parse errors and keep generic message
        }
        throw new Error(errorText)
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
    // Phase 19: No confirmation prompts - execute immediately
    try {
      setLoading(true)
      const response = await fetch(`${BACKEND_URL}/control/jobs/${jobId}/cancel`, { method: 'POST' })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }
      await fetchJobDetail(jobId)
      await fetchJobs()
      
      // Note: Cancel is not reversible, but we show a toast for feedback
      setError('')
    } catch (err) {
      setError(`Failed to cancel job: ${err instanceof Error ? err.message : 'Unknown error'}`)
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
    // Phase 19: No confirmation prompts - execute immediately with undo
    const jobIndex = jobOrder.indexOf(jobId)
    const jobLabel = `Job ${jobIndex + 1}`
    
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
      
      // Push to undo stack with restore action
      undoStack.push({
        message: `${jobLabel} deleted`,
        doAction: async () => {
          // Re-delete not needed, already done
        },
        undoAction: async () => {
          // Note: Backend would need a restore endpoint for true undo
          // For now, show message that undo recreates the job would need re-creation
          // This is a limitation - we show toast but can't truly restore deleted jobs
          setError('Undo not available for delete - job data has been removed')
        },
      })
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
  // Phase 19: Requeue Job
  // ============================================

  const requeueJob = async (jobId: string) => {
    // Get the job details to recreate with same settings
    const detail = jobDetails.get(jobId)
    if (!detail) {
      setError('Cannot requeue: job details not available')
      return
    }

    try {
      setLoading(true)
      
      // Fetch the job's deliver settings to preserve them
      const settingsResponse = await fetch(`${BACKEND_URL}/control/jobs/${jobId}/deliver-settings`)
      let jobDeliverSettings = null
      if (settingsResponse.ok) {
        jobDeliverSettings = await settingsResponse.json()
      }
      
      // Get source paths from the job's tasks
      const sourcePaths = detail.tasks.map(t => t.source_path)
      
      // Create a new job with the same settings
      const response = await fetch(`${BACKEND_URL}/control/jobs/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_paths: sourcePaths,
          preset_id: selectedPresetId || 'default',
          engine: selectedEngine,
          deliver_settings: jobDeliverSettings,
        }),
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        const errorMessage = typeof errorData.detail === 'string' 
          ? errorData.detail 
          : JSON.stringify(errorData.detail || errorData)
        throw new Error(errorMessage)
      }
      
      const result = await response.json()
      await fetchJobs()
      setSelectedJobId(result.job_id)
      
      // Show success via undo toast (informational, not actually undoable)
      undoStack.push({
        message: 'Job requeued',
        doAction: async () => {},
        undoAction: async () => {
          // Delete the newly created job
          await fetch(`${BACKEND_URL}/control/jobs/${result.job_id}`, { method: 'DELETE' })
          await fetchJobs()
        },
      })
    } catch (err) {
      setError(`Failed to requeue job: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  // ============================================
  // Create Job
  // ============================================

  const createManualJob = async () => {
    // Validation with visible feedback
    if (!selectedFiles.length) {
      setError('Please select at least one source file')
      return
    }
    if (!selectedPresetId) {
      setError('Please select a preset')
      return
    }
    
    // Determine effective output directory
    const effectiveOutputDir = outputDirectory || deliverSettings.output_dir || null
    if (!effectiveOutputDir) {
      setError('Please choose an output directory')
      return
    }

    // Phase 17: No confirmation for routine actions
    try {
      setLoading(true)
      setError('')  // Clear any previous errors
      
      // Proxy v1: Use complete DeliverSettings from the Deliver panel
      // (colour settings intentionally excluded - not supported in v1)
      const jobDeliverSettings = {
        output_dir: effectiveOutputDir,
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
        throw new Error(formatApiError(errorData))
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
      setError(`Failed to create job: ${formatApiError(err)}`)
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
      localStorage.setItem('awaire_proxy_path_favorites', JSON.stringify(updated))
    }
  }

  const removePathFavorite = (path: string) => {
    const updated = pathFavorites.filter(p => p !== path)
    setPathFavorites(updated)
    localStorage.setItem('awaire_proxy_path_favorites', JSON.stringify(updated))
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
  // Phase 19: Keyboard Shortcuts (Finder-style)
  // ============================================

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const key = e.key
    const isMeta = e.metaKey || e.ctrlKey
    const isShift = e.shiftKey
    
    // Don't intercept if typing in an input
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return
    }
    
    // Cmd+Z = Undo
    if (isMeta && !isShift && key === 'z') {
      e.preventDefault()
      undoStack.undo()
      return
    }
    
    // Cmd+Shift+Z = Redo
    if (isMeta && isShift && key === 'z') {
      e.preventDefault()
      undoStack.redo()
      return
    }
    
    // Cmd+A = Select all visible clips in selected job
    if (isMeta && key === 'a') {
      e.preventDefault()
      if (selectedJobId) {
        const detail = jobDetails.get(selectedJobId)
        if (detail) {
          const allClipIds = detail.tasks.map(t => t.id)
          setSelectedClipIds(new Set(allClipIds))
        }
      }
      return
    }
    
    // Escape = Clear selection
    if (key === 'Escape') {
      e.preventDefault()
      setSelectedClipIds(new Set())
      setSelectedJobId(null)
      return
    }
    
    // Backspace/Delete = Remove selected items
    if (key === 'Backspace' || key === 'Delete') {
      e.preventDefault()
      
      // If clips are selected, remove them from source files (pre-job mode)
      if (selectedFiles.length > 0 && selectedClipIds.size > 0) {
        // In pre-job mode, selectedClipIds might map to file indices
        // For now, clear all selected files (simplified)
        const filesToRemove = Array.from(selectedClipIds)
        const remainingFiles = selectedFiles.filter((_, i) => !filesToRemove.includes(String(i)))
        setSelectedFiles(remainingFiles.length > 0 ? remainingFiles : [])
        setSelectedClipIds(new Set())
        return
      }
      
      // If a job is selected, delete the job
      if (selectedJobId && selectedClipIds.size === 0) {
        deleteJob(selectedJobId)
        return
      }
      
      // If clips are selected within a job, we'd need clip-level delete (future)
      // For now, show a message
      if (selectedClipIds.size > 0) {
        setError('Clip-level deletion not yet supported. Delete the entire job instead.')
      }
      return
    }
  }, [selectedJobId, jobDetails, selectedClipIds, selectedFiles, undoStack, deleteJob])

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
      localStorage.setItem('awaire_proxy_job_order', JSON.stringify(newOrder))

      return newOrder
    })

    setDraggedJobId(null)
  }, [draggedJobId])

  // ============================================
  // File Drag & Drop (Global - Phase 19)
  // ============================================

  const handleGlobalDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    // Only show global drop zone if dragging files (not jobs)
    if (e.dataTransfer.types.includes('Files')) {
      setIsDraggingFiles(true)
      e.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  const handleGlobalDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    // Only clear if leaving the viewport entirely
    const relatedTarget = e.relatedTarget as Node | null
    if (!relatedTarget || !document.body.contains(relatedTarget)) {
      setIsDraggingFiles(false)
    }
  }, [])

  const handleGlobalDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingFiles(false)

    const newPaths: string[] = []
    
    // Phase 20: Authoritative drop handler - extract file paths robustly
    // Works in Electron where file.path contains absolute path
    const items = e.dataTransfer.items
    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.kind === 'file') {
          const file = item.getAsFile()
          if (file) {
            // In Electron, file.path contains the absolute path
            const path = (file as any).path
            if (path) {
              newPaths.push(path)
            } else {
              // Fallback: use file name if no absolute path (web context)
              console.warn('Drop: No absolute path available for:', file.name)
            }
          }
        }
      }
    } else {
      // Fallback for files property
      const files = e.dataTransfer.files
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const path = (file as any).path
        if (path) {
          newPaths.push(path)
        }
      }
    }

    console.log('GlobalDrop: Extracted paths:', newPaths)

    if (newPaths.length > 0) {
      // Add dropped files to selected files
      setSelectedFiles(prev => {
        const combined = [...prev, ...newPaths]
        // Deduplicate
        return [...new Set(combined)]
      })
      // Clear any job selection - we're now in "create new job" mode
      setSelectedJobId(null)
      console.log(`GlobalDrop: Added ${newPaths.length} file(s) to intake`)
    } else {
      console.warn('GlobalDrop: No valid file paths extracted from drop')
    }
  }, [])

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h1
            style={{
              margin: 0,
              fontSize: '1.25rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              letterSpacing: '-0.02em',
              fontFamily: 'var(--font-sans)',
            }}
          >
            Awaire Proxy
          </h1>
          
          {/* System Status Indicators — Minimal, textual, low visual weight */}
          <div style={{ 
            display: 'flex', 
            gap: '0.75rem', 
            fontSize: '0.6875rem',
            fontFamily: 'var(--font-sans)',
            color: 'var(--text-dim)',
          }}>
            <span style={{ color: backendConnected ? 'var(--status-completed-fg)' : 'var(--status-failed-fg)' }}>
              {backendConnected ? '● Backend connected' : '○ Backend disconnected'}
            </span>
            <span>
              Engine: {engines.find(e => e.type === selectedEngine)?.name || 'FFmpeg'}
            </span>
            <span>
              Mode: Manual jobs only
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {/* Phase 20: Copilot Prompt button */}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowCopilotPrompt(true)}
            title="Open Copilot Prompt window"
          >
            ✦ Copilot Prompt
          </Button>
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
        </div>
      </header>
      
      {/* Proxy v1: Single module - Proxies only */}
      <nav
        style={{
          display: 'flex',
          gap: '0',
          borderBottom: '1px solid var(--border-primary)',
          background: 'rgba(20, 24, 32, 0.95)',
          paddingLeft: '1rem',
          alignItems: 'stretch',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0.5rem 1rem',
            borderBottom: '2px solid var(--button-primary-bg)',
            cursor: 'pointer',
          }}
        >
          <span
            style={{
              color: 'var(--text-primary)',
              fontSize: '0.8125rem',
              fontWeight: 600,
              fontFamily: 'var(--font-sans)',
            }}
          >
            Proxies
          </span>
        </div>
      </nav>

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

      {/* Phase 20: Three-Column Layout (LEFT: Sources, CENTER: Queue, RIGHT: Deliver) */}
      <div 
        ref={appContainerRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onDragOver={handleGlobalDragOver}
        style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
          outline: 'none', // Remove focus outline
        }}
      >
        {/* Global Drop Zone Overlay */}
        <GlobalDropZone
          isVisible={isDraggingFiles}
          onDrop={handleGlobalDrop}
          onDragLeave={handleGlobalDragLeave}
        />
        
        {/* LEFT Column: Sources (full height) */}
        <aside style={{
          width: '280px',
          minWidth: '260px',
          maxWidth: '320px',
          borderRight: '1px solid var(--border-primary)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'linear-gradient(180deg, rgba(26, 32, 44, 0.95) 0%, rgba(20, 24, 32, 0.95) 100%)',
        }}>
          {/* Source Files + Preset Selection */}
          <CreateJobPanel
            isVisible={true}
            onToggleVisibility={() => {}} // Always visible in new layout
            selectedFiles={selectedFiles}
            onFilesChange={setSelectedFiles}
            onSelectFilesClick={selectFiles}
            presets={presets}
            selectedPresetId={selectedPresetId}
            onPresetChange={handlePresetChange}
            presetError={presetError}
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
        </aside>
        
        {/* CENTER Column: Render Queue (full height, primary interaction) */}
        <main
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '0',
            position: 'relative',
            minWidth: '400px',
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
                  <div style={{ fontSize: '2rem', marginBottom: '1rem', opacity: 0.3 }}>📁</div>
                  <div style={{ fontSize: '1rem', marginBottom: '0.5rem', fontWeight: 600 }}>No jobs in queue</div>
                  <div style={{ fontSize: '0.875rem', lineHeight: 1.6 }}>
                    Drag files into the Sources panel, or click "Select Files" to add media.
                    <br />
                    Then choose a preset and click "Add to Queue" to create a proxy job.
                  </div>
                  <div style={{ 
                    marginTop: '1.5rem', 
                    padding: '1rem', 
                    backgroundColor: 'rgba(51, 65, 85, 0.15)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.75rem',
                    color: 'var(--text-dim)',
                  }}>
                    <strong>What is Awaire Proxy?</strong>
                    <br />
                    A standalone proxy generation app. Add source files, configure deliver settings, and render proxies for editing.
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
                  onRequeue={() => requeueJob(job.id)}
                  onCancel={() => cancelJob(job.id)}
                  onDelete={() => deleteJob(job.id)}
                  onRebindPreset={() => {
                    // Select job to edit its settings in the DeliverControlPanel
                    setSelectedJobId(job.id)
                  }}
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
        
        {/* RIGHT Column: Deliver (full height, scrollable independently) */}
        <aside style={{
          width: '320px',
          minWidth: '280px',
          maxWidth: '380px',
          borderLeft: '1px solid var(--border-primary)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'linear-gradient(180deg, rgba(26, 32, 44, 0.95) 0%, rgba(20, 24, 32, 0.95) 100%)',
        }}>
          <DeliverControlPanel
            context={deliverContext}
            settings={deliverSettings}
            onSettingsChange={handleDeliverSettingsChange}
            isReadOnly={isDeliverReadOnly}
            backendUrl={BACKEND_URL}
            appliedPresetName={appliedPresetName}
          />
        </aside>
      </div>
      
      {/* Undo Toast (Phase 19) */}
      <UndoToast
        action={undoStack.currentToast}
        onDismiss={undoStack.clearToast}
        duration={5000}
      />
      
      {/* Phase 20: Copilot Prompt Window */}
      {showCopilotPrompt && (
        <>
          <CopilotPromptBackdrop isOpen={showCopilotPrompt} onClick={() => setShowCopilotPrompt(false)} />
          <CopilotPromptWindow isOpen={showCopilotPrompt} onClose={() => setShowCopilotPrompt(false)} />
        </>
      )}
    </div>
  )
}

export default App
