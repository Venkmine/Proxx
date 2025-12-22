// Alpha scope defined in docs/ALPHA_REALITY.md.
// Do not add features that contradict it without updating that file first.

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { TitleBar } from './components/TitleBar'
import { Button } from './components/Button'
import { JobGroup } from './components/JobGroup'
import { CreateJobPanel } from './components/CreateJobPanel'
import { SourceMetadataPanel } from './components/SourceMetadataPanel'
import { QueueFilterBar } from './components/QueueFilterBar'
import { DeliverControlPanel, DeliverSettings, SelectionContext } from './components/DeliverControlPanel'
import { VisualPreviewModal } from './components/VisualPreviewModal'
import { VisualPreviewWorkspace } from './components/VisualPreviewWorkspace'
import { WorkspaceLayout } from './components/WorkspaceLayout'
import { PresetEditorHeader } from './components/PresetEditorHeader'
import { AppFooter } from './components/AppFooter'
import { SplashScreen } from './components/SplashScreen'
import { DiscardChangesDialog } from './components/DiscardChangesDialog'
import { UndoToast, useUndoStack } from './components/UndoToast'
import { GlobalDropZone } from './components/GlobalDropZone'
// Alpha: Copilot imports hidden (dev feature)
// import { CopilotPromptWindow, CopilotPromptBackdrop } from './components/CopilotPromptWindow'
import { FEATURE_FLAGS } from './config/featureFlags'
import { usePresets } from './hooks/usePresets'
import { useIngestion } from './hooks/useIngestion'
import { usePresetStore } from './stores/presetStore'
import { useWorkspaceModeStore } from './stores/workspaceModeStore'

/**
 * Awaire Proxy Operator Control - Grouped Queue View
 * 
 * ⚠️ VERIFY GUARD:
 * Any change to this file's UI flow requires Playwright coverage.
 * See: qa/verify/ui/proxy/*.spec.ts
 * Run: make verify-ui before committing changes.
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
  // ============================================
  // WORKSPACE MODE — Authoritative Layout Driver
  // ============================================
  // WorkspaceMode is the SINGLE SOURCE OF TRUTH for layout decisions.
  // All width, visibility, and positioning logic must reference this.
  const { workspaceMode } = useWorkspaceModeStore()
  
  // Visual Preview Modal state (Phase 23)
  const { 
    isVisualPreviewModalOpen, 
    openVisualPreviewModal, 
    closeVisualPreviewModal 
  } = usePresetStore()

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

  // ============================================
  // CANONICAL INGESTION PIPELINE
  // ============================================
  // useIngestion is the SINGLE ENTRY POINT for job creation.
  // pendingPaths = source files staged for ingestion (pre-job)
  // activeJobId = job created after ingestion (post-job)
  const ingestion = useIngestion(BACKEND_URL)
  
  // Alias for backwards compatibility with existing components
  const selectedFiles = ingestion.pendingPaths
  const setSelectedFiles = ingestion.setPendingPaths
  
  const [selectedEngine, setSelectedEngine] = useState<string>('ffmpeg') // Phase 16: Engine selection
  // Output directory - single source of truth, persisted to localStorage
  const [outputDirectory, setOutputDirectory] = useState<string>(() => {
    const saved = localStorage.getItem('awaire_proxy_output_directory')
    return saved || ''
  })
  
  // Alpha: Client-side preset management (localStorage)
  const presetManager = usePresets()
  
  // Legacy: Backend presets (kept for backwards compatibility with existing backend)
  const [backendPresets, setBackendPresets] = useState<PresetInfo[]>([])
  const [_presetError, setPresetError] = useState<string>('')

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

  // Alpha: Copilot Prompt window state (hidden in Alpha, available for dev)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_showCopilotPrompt, _setShowCopilotPrompt] = useState<boolean>(false)
  
  // Phase 21: System status indicators (UI visibility)
  const [backendConnected, setBackendConnected] = useState<boolean>(true)
  
  // Phase 22: Splash screen state (shown on first launch / connectivity delay)
  const [showSplash, setShowSplash] = useState<boolean>(true)
  const [enginesLoaded, setEnginesLoaded] = useState<boolean>(false)
  
  // Phase 22: Discard changes confirmation dialog
  const [discardDialogOpen, setDiscardDialogOpen] = useState<boolean>(false)
  const [pendingPresetSwitch, setPendingPresetSwitch] = useState<(() => void) | null>(null)

  // ============================================
  // Phase 17: DeliverSettings State (Authoritative)
  // ============================================
  
  // Default DeliverSettings - matches backend DeliverCapabilities
  const getDefaultDeliverSettings = (): DeliverSettings => ({
    video: {
      codec: 'prores_proxy',
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
      container: 'mov',
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

  // Legacy: Fetch backend presets for backwards compatibility
  const fetchPresets = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/control/presets`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      setBackendPresets(data.presets)
      setPresetError('')
    } catch (err) {
      // Alpha: Backend presets are optional, client-side presets are primary
      console.warn(`Backend presets unavailable: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setPresetError('')
    }
  }

  // Alpha: Apply client-side preset settings to Deliver panel
  const applyPresetSettings = (settings: DeliverSettings) => {
    setDeliverSettings(settings)
    const preset = presetManager.getPreset(presetManager.selectedPresetId || '')
    setAppliedPresetName(preset?.name || null)
  }

  // Phase 17: Fetch DeliverSettings for a backend preset (legacy support)
  // @ts-ignore - kept for potential future use
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
      const preset = backendPresets.find(p => p.id === presetId)
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
      setEnginesLoaded(true) // Phase 22: Mark engines as loaded for splash
    } catch (err) {
      console.error('Failed to load engines:', err)
      // Default to FFmpeg if fetch fails
      setEngines([{ type: 'ffmpeg', name: 'FFmpeg', available: true }])
      setEnginesLoaded(true) // Phase 22: Still mark as loaded even on error
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

  // Persist outputDirectory to localStorage when it changes
  useEffect(() => {
    if (outputDirectory) {
      localStorage.setItem('awaire_proxy_output_directory', outputDirectory)
    }
  }, [outputDirectory])

  // Phase 20: Global document-level drag/drop handlers for authoritative file intake
  // PHASE 0 STABILIZATION: Disabled behind feature flag to prevent whitescreen crashes
  useEffect(() => {
    // Feature flag gate: skip if drag/drop is disabled
    if (!FEATURE_FLAGS.GLOBAL_DRAG_DROP_ENABLED) {
      // Prevent browser default (opening files) but don't enable our drop handling
      const preventDefaultDrop = (e: DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
      }
      document.addEventListener('dragover', preventDefaultDrop)
      document.addEventListener('drop', preventDefaultDrop)
      return () => {
        document.removeEventListener('dragover', preventDefaultDrop)
        document.removeEventListener('drop', preventDefaultDrop)
      }
    }

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
          // ALPHA BLOCKER FIX: Only use absolute paths from Electron
          const filePath = (file as any).path
          // Validate path is absolute (contains /)
          if (filePath && filePath.includes('/')) {
            newPaths.push(filePath)
          }
        }
      }

      if (newPaths.length > 0) {
        console.log('Document drop: Adding files to intake:', newPaths)
        ingestion.addPendingPaths(newPaths)
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
      // Alpha: preset_id is optional
      const response = await fetch(`${BACKEND_URL}/control/jobs/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_paths: sourcePaths,
          preset_id: presetManager.selectedPresetId || null,
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
  // Create Job — Canonical Ingestion Pipeline
  // ============================================

  const createManualJob = async () => {
    // Determine effective output directory
    const effectiveOutputDir = outputDirectory || deliverSettings.output_dir || ''
    
    // Use canonical ingestion pipeline
    const result = await ingestion.ingest({
      sourcePaths: selectedFiles,
      outputDir: effectiveOutputDir,
      deliverSettings: deliverSettings,
      engine: selectedEngine,
      presetId: presetManager.selectedPresetId,
    })
    
    if (!result.success) {
      setError(`Failed to create job: ${result.error}`)
      return
    }
    
    // Success: clear preset selection, keep output directory
    presetManager.selectPreset(null)
    setAppliedPresetName(null)
    
    // Fetch jobs and select the newly created one
    await fetchJobs()
    setSelectedJobId(result.jobId)
  }

  // ============================================
  // File/Folder Selection (Electron)
  // ============================================

  const selectFiles = async () => {
    console.log('[App] selectFiles called, hasElectron:', hasElectron)
    console.log('[App] window.electron:', window.electron)
    if (!hasElectron) {
      alert('File picker requires Electron runtime')
      return
    }
    try {
      console.log('[App] Calling window.electron.openFiles()...')
      const paths = await window.electron!.openFiles()
      console.log('[App] openFiles returned:', paths)
      if (paths.length > 0) {
        setSelectedFiles(paths)
        console.log('[App] Files selected:', paths)
      }
    } catch (err) {
      console.error('[App] File selection error:', err)
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
  // Alpha: Preset Selection → Deliver Panel Sync
  // ============================================
  
  // Alpha: Handle backend preset selection (legacy compatibility)
  // Disabled for now - uncomment when needed
  // const handlePresetChange = async (presetId: string) => {
  //   if (presetId) {
  //     await fetchPresetDeliverSettings(presetId)
  //   } else {
  //     setAppliedPresetName(null)
  //   }
  // }
  
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
    // Mark preset as dirty when settings are edited
    if (presetManager.editingPresetId) {
      presetManager.markDirty()
    }
    // Clear preset indicator on any manual edit
    if (appliedPresetName && deliverContext.type !== 'job-pending') {
      setAppliedPresetName(null)
    }
  }

  // ============================================
  // Phase 22: Preset Editor Header Callbacks
  // ============================================
  
  // Handle discard changes confirmation
  const handleConfirmDiscardChanges = useCallback((onConfirm: () => void) => {
    if (presetManager.isDirty) {
      setPendingPresetSwitch(() => onConfirm)
      setDiscardDialogOpen(true)
    } else {
      onConfirm()
    }
  }, [presetManager.isDirty])
  
  // Confirm discard and execute pending action
  const handleDiscardConfirmed = useCallback(() => {
    setDiscardDialogOpen(false)
    presetManager.clearDirty()
    if (pendingPresetSwitch) {
      pendingPresetSwitch()
      setPendingPresetSwitch(null)
    }
  }, [pendingPresetSwitch, presetManager])
  
  // Cancel discard
  const handleDiscardCancelled = useCallback(() => {
    setDiscardDialogOpen(false)
    setPendingPresetSwitch(null)
  }, [])
  
  // Save current settings to active preset
  const handleSavePreset = useCallback(() => {
    if (presetManager.selectedPresetId) {
      return presetManager.savePreset(deliverSettings)
    }
    return false
  }, [presetManager, deliverSettings])
  
  // Save As: Create new preset with current settings
  const handleSaveAsPreset = useCallback((name: string) => {
    const result = presetManager.createPreset(name, deliverSettings)
    if ('error' in result) {
      console.error('Failed to create preset:', result.error)
      return
    }
    presetManager.selectPreset(result.id)
    setAppliedPresetName(name)
  }, [presetManager, deliverSettings])
  
  // Duplicate a preset
  const handleDuplicatePreset = useCallback((id: string, newName?: string) => {
    presetManager.duplicatePreset(id, newName)
  }, [presetManager])
  
  // Export all presets (download JSON)
  const handleExportPresets = useCallback(() => {
    const json = presetManager.exportPresets()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'awaire_proxy_presets.json'
    a.click()
    URL.revokeObjectURL(url)
  }, [presetManager])
  
  // Import presets (from file input)
  const handleImportPresets = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        const text = await file.text()
        const result = presetManager.importPresets(text)
        if (!result.success) {
          console.error('Import failed:', result.error)
        }
      }
    }
    input.click()
  }, [presetManager])

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

  // Alpha: Separate handlers for the two drop zones
  const handleDropSourceFiles = useCallback((paths: string[]) => {
    setIsDraggingFiles(false)
    if (paths.length > 0) {
      ingestion.addPendingPaths(paths)
      setSelectedJobId(null)
      console.log(`GlobalDrop: Added ${paths.length} source file(s)`)
    }
  }, [ingestion])

  const handleDropOutputDirectory = useCallback((dir: string) => {
    setIsDraggingFiles(false)
    if (dir) {
      setOutputDirectory(dir)
      console.log(`GlobalDrop: Set output directory to ${dir}`)
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
      data-testid="app-root"
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
        data-testid="app-header"
        style={{
          padding: '0.5rem 1.5rem',
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
            alignItems: 'center',
          }}>
            <span 
              data-testid="backend-status"
              style={{ color: backendConnected ? 'var(--status-completed-fg)' : 'var(--status-failed-fg)' }}
            >
              {backendConnected ? '● Connected' : '○ Disconnected'}
            </span>
            <span style={{
              padding: '0.125rem 0.375rem',
              fontSize: '0.5625rem',
              fontWeight: 600,
              color: 'var(--text-dim)',
              background: 'rgba(251, 191, 36, 0.15)',
              border: '1px solid rgba(251, 191, 36, 0.3)',
              borderRadius: 'var(--radius-sm)',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}>
              Alpha
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {/* Alpha: Copilot Prompt button hidden (dev feature) */}
          {pendingJobCount > 0 && (
            <Button 
              data-testid="render-all-button"
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

      {/* ============================================ */}
      {/* WORKSPACE LAYOUT — 4-Region Persistent Layout */}
      {/* ============================================ */}
      {/* 
        Phase 24: 4-region persistent workspace layout.
        
        LEFT SIDEBAR (fixed ~320px):
        - Sources panel
        - Volumes panel (placeholder)
        - Drag-and-drop ingestion
        
        CENTRE TOP (flexible, 70% default):
        - VisualPreviewWorkspace (always visible)
        - No modal behavior, no close button
        
        CENTRE BOTTOM (flexible, 30% default):
        - Queue panel
        - Horizontal draggable splitter above
        
        RIGHT SIDEBAR (fixed ~380px):
        - DeliverControlPanel
        - Preset selector + CRUD
        - File naming, metadata, video, audio settings
        
        Desktop-only layout. Minimum width: 1280px.
        Splitter ratio persists in localStorage.
      */}
      <div 
        ref={appContainerRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onDragOver={handleGlobalDragOver}
        style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
          outline: 'none',
          minWidth: '1280px',
        }}
      >
        {/* Global Drop Zone Overlay - PHASE 0: Disabled behind feature flag */}
        {FEATURE_FLAGS.GLOBAL_DRAG_DROP_ENABLED && (
          <GlobalDropZone
            isVisible={isDraggingFiles}
            onDropFiles={handleDropSourceFiles}
            onDropOutputDirectory={handleDropOutputDirectory}
            onDragLeave={handleGlobalDragLeave}
          />
        )}
        
        {/* 4-Region Workspace Layout */}
        <WorkspaceLayout
          leftSidebar={
            /* LEFT SIDEBAR: Sources + Metadata */
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
              <CreateJobPanel
                isVisible={true}
                onToggleVisibility={() => {}}
                selectedFiles={selectedFiles}
                onFilesChange={setSelectedFiles}
                onSelectFilesClick={selectFiles}
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
                  ingestion.clearPendingPaths()
                  setOutputDirectory('')
                }}
                loading={loading || ingestion.isIngesting}
                hasElectron={hasElectron}
                workspaceMode={workspaceMode}
              />
              
              {/* Source Metadata Panel */}
              <SourceMetadataPanel
                sourceFilePath={
                  // Show selected job's first task source OR first selected file
                  selectedJobId
                    ? jobDetails.get(selectedJobId)?.tasks?.[0]?.source_path || selectedFiles[0]
                    : selectedFiles[0]
                }
                backendUrl={BACKEND_URL}
                isVisible={selectedFiles.length > 0 || selectedJobId !== null}
              />
            </div>
          }
          rightSidebar={
            /* RIGHT SIDEBAR: DeliverControlPanel + Presets */
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
              {/* Preset Editor Header */}
              <PresetEditorHeader
                presets={presetManager.presets}
                selectedPresetId={presetManager.selectedPresetId}
                isDirty={presetManager.isDirty}
                onSelectPreset={(id) => {
                  if (id) {
                    const preset = presetManager.getPreset(id)
                    if (preset) {
                      applyPresetSettings(preset.settings)
                    }
                  }
                  presetManager.selectPreset(id)
                }}
                onRenamePreset={presetManager.renamePreset}
                onSavePreset={handleSavePreset}
                onSaveAsPreset={handleSaveAsPreset}
                onDeletePreset={presetManager.deletePreset}
                onDuplicatePreset={handleDuplicatePreset}
                onExportPresets={handleExportPresets}
                onImportPresets={handleImportPresets}
                onConfirmDiscardChanges={handleConfirmDiscardChanges}
                disabled={isDeliverReadOnly}
              />
              
              {/* DeliverControlPanel */}
              <DeliverControlPanel
                context={deliverContext}
                settings={deliverSettings}
                onSettingsChange={handleDeliverSettingsChange}
                isReadOnly={isDeliverReadOnly || workspaceMode === 'execute'}
                backendUrl={BACKEND_URL}
                appliedPresetName={appliedPresetName}
                onOpenVisualEditor={openVisualPreviewModal}
                hasQueuedJobSelected={!!selectedJobId && jobs.some(j => j.id === selectedJobId)}
              />
            </div>
          }
          centreTop={
            /* CENTRE TOP: VisualPreviewWorkspace — Single Source of Truth for Preview */
            /* CANONICAL INGESTION PIPELINE: Preview binds to activeJob.tasks[0] when job selected,
               otherwise falls back to pendingPaths[0] for pre-job preview */
            <VisualPreviewWorkspace
              sourceFilePath={
                selectedJobId
                  ? jobDetails.get(selectedJobId)?.tasks?.[0]?.source_path
                  : selectedFiles.length > 0
                    ? selectedFiles[0]
                    : undefined
              }
              hasSource={selectedJobId !== null || selectedFiles.length > 0}
              onOpenVisualEditor={openVisualPreviewModal}
              backendUrl={BACKEND_URL}
              overlaySettings={deliverSettings.overlay}
              onOverlaySettingsChange={(overlay) => handleDeliverSettingsChange({ overlay })}
              outputSummary={{
                codec: deliverSettings.video?.codec?.toUpperCase(),
                container: deliverSettings.file?.container,
                resolution: deliverSettings.video?.resolution_policy === 'source' ? 'Source' : deliverSettings.video?.resolution_policy,
                fps: deliverSettings.video?.frame_rate_policy === 'source' ? 'Source' : deliverSettings.video?.frame_rate_policy,
              }}
            />
          }
          centreBottom={
            /* CENTRE BOTTOM: Queue Panel */
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
              {/* Queue Filter Bar */}
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
                  padding: '0.5rem 0.75rem',
                  borderBottom: '1px solid var(--border-secondary)',
                  background: 'rgba(26, 32, 44, 0.6)',
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                  }}
                >
                  Queue ({filteredJobs.length})
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {selectedClipIds.size > 0 && (
                    <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                      {selectedClipIds.size} clip(s)
                    </span>
                  )}
                  {/* Render Jobs button - starts all pending jobs */}
                  {jobs.filter(j => j.status.toUpperCase() === 'PENDING').length > 0 && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={async () => {
                        // Start all pending jobs
                        const pendingJobs = jobs.filter(j => j.status.toUpperCase() === 'PENDING')
                        for (const job of pendingJobs) {
                          await startJob(job.id)
                        }
                      }}
                      disabled={loading}
                      data-testid="render-jobs-btn"
                    >
                      ▶ Render Jobs ({jobs.filter(j => j.status.toUpperCase() === 'PENDING').length})
                    </Button>
                  )}
                </div>
              </div>

              {/* Job Groups */}
              <div style={{ padding: '0.5rem', flex: 1, overflow: 'auto' }}>
                {filteredJobs.length === 0 ? (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '1.5rem 0.75rem',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {allOrderedJobs.length === 0 ? (
                      <>
                        <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem', opacity: 0.3 }}>📁</div>
                        <div style={{ fontSize: '0.75rem', marginBottom: '0.25rem', fontWeight: 600 }}>No jobs in queue</div>
                        <div style={{ fontSize: '0.6875rem', lineHeight: 1.5 }}>
                          Add files in the left panel and click "Add to Queue"
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: '0.75rem', marginBottom: '0.25rem' }}>No matching jobs</div>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => {
                            clearGlobalStatusFilters()
                            setSearchQuery('')
                            setDateFilter('all')
                          }}
                          style={{ marginTop: '0.5rem' }}
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
                        jobNumber={index + 1}
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
                        onRebindPreset={() => setSelectedJobId(job.id)}
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
            </div>
          }
        />
        
        {/* Visual Preview Modal — unified visual editing workspace */}
        <VisualPreviewModal
          isOpen={isVisualPreviewModalOpen}
          onClose={closeVisualPreviewModal}
          settings={deliverSettings.overlay}
          onChange={(overlay) => {
            handleDeliverSettingsChange({ overlay })
            presetManager.markDirty()
          }}
          sourceClipName={selectedFiles.length > 0 ? selectedFiles[0].split('/').pop() : 'No source selected'}
          disabled={isDeliverReadOnly}
        />
      </div>
      
      {/* Undo Toast (Phase 19) */}
      <UndoToast
        action={undoStack.currentToast}
        onDismiss={undoStack.clearToast}
        duration={5000}
      />
      
      {/* Phase 22: App Footer - visually quiet status bar */}
      <AppFooter
        version="ALPHA"
        tier="Basic"
        engines={{
          ffmpeg: engines.some(e => e.type === 'ffmpeg' && e.available),
          resolve: engines.some(e => e.type === 'resolve' && e.available),
        }}
      />
      
      {/* Phase 22: Discard Changes Confirmation Dialog */}
      <DiscardChangesDialog
        isOpen={discardDialogOpen}
        onDiscard={handleDiscardConfirmed}
        onCancel={handleDiscardCancelled}
        presetName={presetManager.selectedPresetId 
          ? presetManager.getPreset(presetManager.selectedPresetId)?.name 
          : undefined}
      />
      
      {/* Phase 22: Splash Screen - shown during startup/engine detection */}
      {showSplash && (
        <SplashScreen
          isReady={enginesLoaded && backendConnected}
          ffmpegAvailable={engines.some(e => e.type === 'ffmpeg' && e.available)}
          resolveAvailable={engines.some(e => e.type === 'resolve' && e.available)}
          tier="Basic"
          onDismiss={() => setShowSplash(false)}
        />
      )}
      
      {/* Alpha: Copilot Prompt Window hidden (dev feature)
      {showCopilotPrompt && (
        <>
          <CopilotPromptBackdrop isOpen={showCopilotPrompt} onClick={() => setShowCopilotPrompt(false)} />
          <CopilotPromptWindow isOpen={showCopilotPrompt} onClose={() => setShowCopilotPrompt(false)} />
        </>
      )}
      */}
    </div>
  )
}

export default App
