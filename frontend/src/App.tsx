// ============================================================================
// V1 GUARDRAIL
// ============================================================================
// If you are about to add: drag & drop, progress bars, overlay editing,
// retry/requeue, pause/resume, multi-clip jobs, or batch operations —
// STOP and read docs/DECISIONS.md first. These are intentionally absent.
// ============================================================================

// ============================================================================
// V2 THIN CLIENT INVARIANT
// ============================================================================
// INVARIANT: UI compiles JobSpec, backend executes. UI never mutates execution state.
// - UI may compile JobSpecs from user settings
// - UI may submit JobSpecs to backend
// - UI may observe JobExecutionResult (read-only)
// - UI must NEVER control, mutate, or influence execution after submission
// - All execution state shown in UI comes ONLY from JobExecutionResult
// ============================================================================

// Alpha scope defined in docs/ALPHA_REALITY.md.
// Do not add features that contradict it without updating that file first.

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { TitleBar } from './components/TitleBar'
import { Button } from './components/Button'
import { JobGroup } from './components/JobGroup'
import { MediaWorkspace } from './components/MediaWorkspace'
import { QueueFilterBar } from './components/QueueFilterBar'
import { VisualPreviewModal } from './components/VisualPreviewModal'
import { 
  MonitorSurface, 
  MonitorState, 
  SourceMetadata, 
  JobProgress, 
  JobResult,
} from './components/MonitorSurface'
import { WorkspaceLayout } from './components/WorkspaceLayout'
import { AppFooter } from './components/AppFooter'
import { SplashScreen } from './components/SplashScreen'
import { DiscardChangesDialog } from './components/DiscardChangesDialog'
import { PresetPositionConflictDialog } from './components/PresetPositionConflictDialog'
import { UndoToast, useUndoStack } from './components/UndoToast'
import { StatusLog, StatusLogEntry } from './components/StatusLog'
import { InvariantBanner } from './components/InvariantBanner'
import { AuditModeBanner } from './components/AuditModeBanner'
import { assertJobPendingForRender, assertNoSilentPresetOverwrite } from './utils/invariants'
import type { DeliverSettings, SelectionContext } from './components/DeliverControlPanel'
import { normalizeResponseError, createJobError } from './utils/errorNormalize'
import { logStateTransition } from './utils/logger'
import * as statusMessages from './utils/statusMessages'
// Alpha: Copilot imports hidden (dev feature)
// import { CopilotPromptWindow, CopilotPromptBackdrop } from './components/CopilotPromptWindow'
// V1 OBSERVABILITY: Debug panel for UI event log (DEV only)
import { DebugPanel } from './components/DebugPanel'
import { FEATURE_FLAGS } from './config/featureFlags'
import { usePresets } from './hooks/usePresets'
import { useIngestion } from './hooks/useIngestion'
// V2 Step 3: Thin Client JobSpec Compiler
import { useV2Execute } from './hooks/useV2Execute'
import { useV2ModeStore } from './stores/v2ModeStore'
import { V2ResultPanel } from './components/V2ResultPanel'
// REMOVED: Drag & drop completely removed from UI for honesty
// import { useGlobalFileDrop } from './hooks/useGlobalFileDrop'
import { usePresetStore } from './stores/presetStore'
import { useWorkspaceModeStore } from './stores/workspaceModeStore'
// Tiered Preview System: Non-blocking, editor-grade preview model
import { useTieredPreview } from './hooks/useTieredPreview'
// App State Machine: Explicit centralized state derivation
import { type AppMode, deriveAppMode } from './types/appMode'
import { canSubmitWithPreflight, type PreflightCheck } from './components/PreflightSummary'

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
 * - Jobs are reorderable in the queue
 * - Create Job panel persists after job creation
 * 
 * Phase 16: Full operator control with start, pause, delete, global filters.
 */

const BACKEND_URL = 'http://127.0.0.1:8085'

// ============================================================================
// UNIFIED PREVIEW STATE — Single source of truth for preview rendering
// ============================================================================
// This type drives ALL preview-related UI decisions:
// - Whether <video> element exists
// - Whether transport controls are enabled
// - Badge text display
// 
// Components must render based on this state, not duplicate logic.
// ============================================================================
// ROUTING CLEANUP: PreviewState type is now unused after removal of _previewState.
// Retained for reference and potential future use. The actual preview rendering
// is handled by MonitorSurface using tieredPreview.playbackUIState from probe.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type PreviewState =
  | { kind: 'none' }
  | { kind: 'poster'; posterUrl: string }
  | { kind: 'burst'; thumbnails: Array<{ url: string; timestamp: number }> }
  | { kind: 'video-native'; url: string }
  | { kind: 'video-proxy'; url: string }
  | { kind: 'raw-needs-preview' }
  | { kind: 'loading'; message: string }
  | { kind: 'error'; message: string }


// ============================================================================
// TERMINAL STATE INVARIANT
// ============================================================================
// Once a job reaches any of these states, it MUST NOT transition to any other state.
// Polling, refresh, or re-render must never regress a terminal state.
// This invariant is enforced at multiple layers:
//   1. Backend state.py: is_job_terminal() blocks illegal transitions
//   2. Backend engine.py: compute_job_status() returns current status for terminal jobs
//   3. Frontend: fetchJobs() preserves terminal states from prior state
// V1: COMPLETED_WITH_WARNINGS removed - jobs are either COMPLETED or FAILED
// ============================================================================
const TERMINAL_JOB_STATES = new Set(['COMPLETED', 'FAILED', 'CANCELLED'])

function isJobTerminal(status: string): boolean {
  return TERMINAL_JOB_STATES.has(status.toUpperCase())
}

// Electron IPC types
// INC-003: Added openFilesOrFolders for combined file+folder selection
declare global {
  interface Window {
    electron?: {
      openFiles: () => Promise<string[]>
      openFolder: () => Promise<string | null>
      /** INC-003: Select files AND/OR folders together. Does NOT auto-expand directories. */
      openFilesOrFolders: () => Promise<string[]>
      showItemInFolder: (filePath: string) => Promise<void>
      /** Open a path in the default application (for AttachProxiesInfoPanel) */
      openPath?: (path: string) => void
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
  // RAW folder metadata
  raw_type: string | null  // "R3D", "ARRIRAW", "SONY_RAW", "IMAGE_SEQUENCE", or null for files
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
  // Trust Stabilisation: Settings summary for queue export intent visibility
  settings_summary?: {
    preset_name?: string
    codec?: string
    container?: string
    resolution?: string
  }
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
  
  // DOGFOOD FIX: Idempotency guards for job operations
  // React state updates are async, so rapid clicks can trigger duplicate operations
  // before loading=true has been rendered. Use refs to block immediately.
  const jobOperationInFlight = useRef<Set<string>>(new Set())
  
  // Status log: Track previous job statuses to detect transitions
  const prevJobStatuses = useRef<Map<string, string>>(new Map())
  
  // V1 Demo: Heartbeat tracking for long-running encodes
  const lastHeartbeatTime = useRef<Map<string, number>>(new Map())
  const HEARTBEAT_INTERVAL_MS = 15000 // 15 seconds between heartbeat messages

  // Global status filters (Phase 16: applies to job list)
  const [globalStatusFilters, setGlobalStatusFilters] = useState<Set<string>>(new Set())
  
  // Search and date filter
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | 'week'>('all')

  // Status log entries
  const [statusLogEntries, setStatusLogEntries] = useState<StatusLogEntry[]>([])
  const addStatusLogEntry = useCallback((entry: StatusLogEntry) => {
    setStatusLogEntries(prev => [...prev, entry])
  }, [])

  // Per-job clip status filters
  const [activeStatusFilters, setActiveStatusFilters] = useState<Set<string>>(new Set())

  // Clip selection
  const [selectedClipIds, setSelectedClipIds] = useState<Set<string>>(new Set())

  // Phase 4B: Controlled collapse state for job groups
  // Jobs with >1 clip default to collapsed, single-clip jobs default to expanded
  const [expandedJobIds, setExpandedJobIds] = useState<Set<string>>(new Set())

  // Phase 4B: Track single selected clip for preview (distinct from multi-select for future batch ops)
  const [_previewClipId, setPreviewClipId] = useState<string | null>(null)
  
  // Phase v3: Active clip index for monitor navigation (within current job)
  // This is the clip currently loaded in MonitorSurface
  const [monitorClipIndex, setMonitorClipIndex] = useState<number>(0)

  // Phase F: Removed rightPanelTab - Queue is always visible (no tabs)
  // Highlighted job ID (for brief highlight after creation)
  const [highlightedJobId, setHighlightedJobId] = useState<string | null>(null)

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
  
  // ============================================
  // TIERED PREVIEW SYSTEM
  // ============================================
  // Non-blocking, editor-grade preview model:
  // Tier 1: Poster Frame (mandatory, instant)
  // Tier 2: Burst Thumbnails (recommended, user-initiated)
  // Tier 3: Video Preview (optional, user-initiated ONLY)
  // See: docs/PREVIEW_PIPELINE.md
  const tieredPreview = useTieredPreview(BACKEND_URL)
  
  // Auto-trigger POSTER FRAME ONLY when source files change
  // Video previews are NEVER auto-generated — users must request them
  const currentPreviewSource = useRef<string | null>(null)
  
  useEffect(() => {
    // Only trigger poster for single file selection
    if (selectedFiles.length === 1) {
      const sourcePath = selectedFiles[0]
      
      // Avoid duplicate generation for same source
      if (currentPreviewSource.current !== sourcePath) {
        currentPreviewSource.current = sourcePath
        // Request POSTER ONLY — instant, non-blocking
        tieredPreview.requestPoster(sourcePath)
        // PROBLEM #2 FIX: Probe playback capability to reset transport state
        tieredPreview.probePlayback(sourcePath)
      }
    } else if (selectedFiles.length === 0) {
      // Reset when no files selected
      currentPreviewSource.current = null
      tieredPreview.reset()
    } else {
      // Multiple files - reset preview (no preview for multi-select)
      currentPreviewSource.current = null
      tieredPreview.reset()
    }
  }, [selectedFiles, tieredPreview])
  
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

  // Path favorites (localStorage-backed) - for output directories
  const [pathFavorites, setPathFavorites] = useState<string[]>(() => {
    const saved = localStorage.getItem('awaire_proxy_path_favorites')
    return saved ? JSON.parse(saved) : []
  })
  
  // Folder favorites (Phase 4A) - for directory navigator source browsing
  const [folderFavorites, setFolderFavorites] = useState<string[]>(() => {
    const saved = localStorage.getItem('awaire_proxy_folder_favorites')
    return saved ? JSON.parse(saved) : []
  })

  // Drag state for job reordering (not file drag & drop)
  const [draggedJobId, setDraggedJobId] = useState<string | null>(null)
  
  // ============================================
  // DRAG & DROP REMOVED FOR HONESTY
  // ============================================
  // Drag & drop completely removed from UI.
  // Users must use the explicit "Select Files" and "Select Folder" buttons.
  // This is intentional - honesty over convenience.

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
  
  // Phase 9E: Preset position conflict dialog
  const [positionConflictDialogOpen, setPositionConflictDialogOpen] = useState<boolean>(false)
  const [pendingPresetSettings, setPendingPresetSettings] = useState<DeliverSettings | null>(null)
  
  // REMOVED: Drag & drop completely removed from UI for honesty
  // const [droppedPaths, setDroppedPaths] = useState<string[]>([])
  // const [showDropConfirmation, setShowDropConfirmation] = useState<boolean>(false)

  // ============================================
  // V2 Step 3: Thin Client JobSpec Compiler
  // INVARIANT: UI compiles JobSpec, backend executes. UI never mutates execution state.
  // ============================================
  const { isV2ModeEnabled, toggleV2Mode, v2ExecutionStatus, v2JobSpecSubmitted } = useV2ModeStore()
  const { isEncoding: isV2Encoding, executeV2 } = useV2Execute()

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
      layers: [],  // Phase 5A: Layer-based overlay system
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
  // V1 DOGFOOD FIX: Settings should only be locked while job is RUNNING.
  // Once job is COMPLETED or FAILED, re-enable settings so user can adjust
  // for a new job. Completed jobs are read-only in the queue, but the settings
  // panel shows defaults/presets for the NEXT job, not the completed one.
  const isDeliverReadOnly = deliverContext.type === 'job-running'
  
  // Phase 8B: Queue diagnostics clarity - is any job currently running?
  const hasAnyJobRunning = jobs.some(job => job.status.toUpperCase() === 'RUNNING')

  // ============================================
  // APP MODE — Centralized State Machine
  // ============================================
  // AppMode is THE SINGLE SOURCE OF TRUTH for app-wide state.
  // All components must receive appMode as a prop — never derive it locally.
  // See: types/appMode.ts for derivation rules and principles.
  
  // Compute preflight checks for appMode derivation
  // These are the basic preflight checks computed at the app level
  const appLevelPreflightChecks = useMemo((): PreflightCheck[] => {
    const checks: PreflightCheck[] = []
    
    // Source check
    if (selectedFiles.length === 0) {
      checks.push({
        id: 'sources',
        label: 'Source Files',
        status: 'fail',
        message: 'Select at least one source to continue',
      })
    } else {
      checks.push({
        id: 'sources',
        label: 'Source Files',
        status: 'pass',
        message: `${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''} selected`,
      })
    }
    
    // Output directory check
    if (!outputDirectory) {
      checks.push({
        id: 'output',
        label: 'Output Directory',
        status: 'fail',
        message: 'Set an output directory to continue',
      })
    } else if (!outputDirectory.startsWith('/') && !/^[a-zA-Z]:[\\/]/.test(outputDirectory)) {
      checks.push({
        id: 'output',
        label: 'Output Directory',
        status: 'fail',
        message: 'Output directory must be an absolute path',
      })
    } else {
      checks.push({
        id: 'output',
        label: 'Output Directory',
        status: 'pass',
        message: outputDirectory,
      })
    }
    
    return checks
  }, [selectedFiles, outputDirectory])
  
  // Derive isPreflightValid from checks
  const isPreflightValid = useMemo(() => {
    return canSubmitWithPreflight(appLevelPreflightChecks)
  }, [appLevelPreflightChecks])
  
  // Check for completed jobs
  const hasCompletedJobs = useMemo(() => {
    return jobs.some(job => {
      const status = job.status.toUpperCase()
      return status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED'
    })
  }, [jobs])
  
  // Track whether user has attempted to submit a job (for error gating)
  const [hasSubmitIntent, setHasSubmitIntent] = useState<boolean>(false)
  
  // Reset submit intent and job selection when sources change
  useEffect(() => {
    setHasSubmitIntent(false)
    // PROBLEM #5 FIX: Clear error state when selection changes
    // This prevents "Multi-clip jobs disabled" error from persisting
    // when user changes from multi-select to single-select
    setError('')
    
    // Job lifecycle reset: Clear completed job selection from monitor
    if (selectedFiles.length > 0 && selectedJobId) {
      const job = jobs.find(j => j.id === selectedJobId)
      const isTerminal = job && isJobTerminal(job.status)
      if (isTerminal) {
        // Clear terminal job selection, load new source into monitor
        setSelectedJobId(null)
        setSelectedClipIds(new Set())
        setMonitorClipIndex(0)
      }
    }
  }, [selectedFiles, selectedJobId, jobs])
  
  // Derive AppMode centrally — single source of truth
  const appMode: AppMode = useMemo(() => {
    return deriveAppMode(
      selectedFiles.length > 0,
      isPreflightValid,
      hasAnyJobRunning,
      hasCompletedJobs
    )
  }, [selectedFiles.length, isPreflightValid, hasAnyJobRunning, hasCompletedJobs])

  // ============================================
  // Monitor Surface State Derivation
  // ============================================
  // Phase D4: UI smoothing for fast jobs
  // If a job finishes too fast (<300ms), we still show "Encoding…" for at least 500ms
  // to avoid instant jump to Completed state
  const [forceRunningState, setForceRunningState] = useState(false)
  const runningStateStartTime = useRef<number | null>(null)
  const MIN_ENCODING_DISPLAY_MS = 500
  
  // Track when we enter running state
  useEffect(() => {
    if (selectedJobId) {
      const job = jobs.find(j => j.id === selectedJobId)
      if (job?.status.toUpperCase() === 'RUNNING' || job?.status.toUpperCase() === 'PAUSED') {
        if (runningStateStartTime.current === null) {
          runningStateStartTime.current = Date.now()
          setForceRunningState(false)
        }
      } else if (job?.status.toUpperCase() === 'COMPLETED' || job?.status.toUpperCase() === 'FAILED') {
        // Job completed - check if we need to show extended running state
        if (runningStateStartTime.current !== null) {
          const elapsed = Date.now() - runningStateStartTime.current
          if (elapsed < MIN_ENCODING_DISPLAY_MS) {
            setForceRunningState(true)
            const remaining = MIN_ENCODING_DISPLAY_MS - elapsed
            setTimeout(() => {
              setForceRunningState(false)
              runningStateStartTime.current = null
            }, remaining)
          } else {
            runningStateStartTime.current = null
          }
        }
      }
    } else {
      runningStateStartTime.current = null
      setForceRunningState(false)
    }
  }, [selectedJobId, jobs])
  
  // Derive MonitorSurface state from app/job state
  const monitorState = useMemo((): MonitorState => {
    if (selectedJobId) {
      const job = jobs.find(j => j.id === selectedJobId)
      if (!job) return 'idle'
      const status = job.status.toUpperCase()
      
      // Phase D4: Force running state for UI smoothing
      if (forceRunningState) return 'job-running'
      
      if (status === 'RUNNING' || status === 'PAUSED') return 'job-running'
      if (status === 'COMPLETED' || status === 'FAILED') return 'job-complete'
      // PENDING job with source = source-loaded
      return 'source-loaded'
    }
    if (selectedFiles.length > 0) return 'source-loaded'
    return 'idle'
  }, [selectedJobId, jobs, selectedFiles, forceRunningState])
  
  // ============================================
  // ROUTING CLEANUP: Unified PreviewState block REMOVED
  // ============================================
  // The isRawCodec helper and _previewState computation were dead code that
  // duplicated routing logic. RAW detection now comes from:
  // - Backend: playback probe result (playbackCapability.isRawFormat)
  // - MonitorSurface: already uses tieredPreview.playbackUIState.isRawFormat
  // 
  // See: frontend/src/utils/playbackCapability.ts for canonical implementation
  // See: backend/v2/source_capabilities.py for routing source of truth
  // ============================================

  // Derive source metadata for monitor
  const monitorSourceMetadata = useMemo((): SourceMetadata | undefined => {
    if (monitorState !== 'source-loaded') return undefined
    
    if (selectedJobId) {
      const detail = jobDetails.get(selectedJobId)
      // Use the active clip index for navigation, defaulting to 0
      const clipIndex = Math.min(monitorClipIndex, (detail?.tasks?.length || 1) - 1)
      const task = detail?.tasks?.[clipIndex]
      if (task) {
        return {
          filename: task.source_path?.split('/').pop(),
          codec: task.codec || undefined,
          resolution: task.resolution || undefined,
          fps: task.frame_rate || undefined,
          duration: task.duration || undefined,
          audioChannels: task.audio_channels || undefined,
          filePath: task.source_path || undefined,  // For preview generation
        }
      }
    }
    
    // Fallback to file name for pending files
    if (selectedFiles.length > 0) {
      return {
        filename: selectedFiles[0].split('/').pop(),
        filePath: selectedFiles[0],  // For preview generation
      }
    }
    return undefined
  }, [monitorState, selectedJobId, jobDetails, selectedFiles, monitorClipIndex])

  // Derive job progress for monitor
  const monitorJobProgress = useMemo((): JobProgress | undefined => {
    if (monitorState !== 'job-running' || !selectedJobId) return undefined
    
    const job = jobs.find(j => j.id === selectedJobId)
    const detail = jobDetails.get(selectedJobId)
    if (!job || !detail) return undefined
    
    const runningTask = detail.tasks?.find(t => t.status.toUpperCase() === 'RUNNING')
    const startedAt = job.started_at ? new Date(job.started_at) : new Date()
    const elapsed = Math.floor((Date.now() - startedAt.getTime()) / 1000)
    
    return {
      currentClip: detail.completed_count + 1,
      totalClips: detail.total_tasks,
      elapsedSeconds: elapsed,
      sourceFilename: runningTask?.source_path?.split('/').pop(),
      outputCodec: deliverSettings.video?.codec?.toUpperCase(),
      // Preview proxy URL for encoding overlay (reuse existing video preview if available)
      previewUrl: tieredPreview.video?.previewUrl,
    }
  }, [monitorState, selectedJobId, jobs, jobDetails, deliverSettings.video?.codec, tieredPreview.video?.previewUrl])

  // Derive job result for monitor
  const monitorJobResult = useMemo((): JobResult | undefined => {
    if (monitorState !== 'job-complete' || !selectedJobId) return undefined
    
    const detail = jobDetails.get(selectedJobId)
    if (!detail) return undefined
    
    // Get output info from first completed task
    const completedTask = detail.tasks?.find(t => t.status.toUpperCase() === 'COMPLETED')
    const outputDir = completedTask?.output_path
      ? completedTask.output_path.split('/').slice(0, -1).join('/')
      : undefined
    
    return {
      outputCodec: detail.settings_summary?.codec || deliverSettings.video?.codec?.toUpperCase(),
      outputResolution: detail.settings_summary?.resolution,
      outputDirectory: outputDir,
      totalClips: detail.completed_count,
    }
  }, [monitorState, selectedJobId, jobDetails, deliverSettings.video?.codec])

  // ============================================
  // Clip Navigation (v3 Transport Controls)
  // ============================================
  
  // Derive clip navigation info for MonitorSurface
  const clipNavigationInfo = useMemo(() => {
    if (!selectedJobId) return null
    
    const detail = jobDetails.get(selectedJobId)
    if (!detail?.tasks?.length) return null
    
    // Filter to valid clips (skip failed/missing if desired)
    const validTasks = detail.tasks.filter(t => 
      t.status.toUpperCase() !== 'FAILED' || t.source_path
    )
    
    if (validTasks.length === 0) return null
    
    // Clamp index to valid range
    const clampedIndex = Math.max(0, Math.min(monitorClipIndex, validTasks.length - 1))
    const currentTask = validTasks[clampedIndex]
    
    return {
      currentClip: {
        id: currentTask.id,
        sourcePath: currentTask.source_path,
        index: clampedIndex,
      },
      totalClips: validTasks.length,
      isFirstClip: clampedIndex === 0,
      isLastClip: clampedIndex >= validTasks.length - 1,
      allTasks: validTasks,
    }
  }, [selectedJobId, jobDetails, monitorClipIndex])
  
  // Handler: Navigate to previous clip
  const handlePreviousClip = useCallback(() => {
    if (!clipNavigationInfo || clipNavigationInfo.isFirstClip) return
    
    const newIndex = Math.max(0, monitorClipIndex - 1)
    setMonitorClipIndex(newIndex)
    
    // Update queue selection to match
    const newClip = clipNavigationInfo.allTasks[newIndex]
    if (newClip) {
      setSelectedClipIds(new Set([newClip.id]))
      setPreviewClipId(newClip.id)
    }
    
    // Reset preview for new clip
    tieredPreview.reset()
    if (newClip?.source_path) {
      tieredPreview.requestPoster(newClip.source_path)
    }
  }, [clipNavigationInfo, monitorClipIndex, tieredPreview])
  
  // Handler: Navigate to next clip
  const handleNextClip = useCallback(() => {
    if (!clipNavigationInfo || clipNavigationInfo.isLastClip) return
    
    const newIndex = Math.min(clipNavigationInfo.totalClips - 1, monitorClipIndex + 1)
    setMonitorClipIndex(newIndex)
    
    // Update queue selection to match
    const newClip = clipNavigationInfo.allTasks[newIndex]
    if (newClip) {
      setSelectedClipIds(new Set([newClip.id]))
      setPreviewClipId(newClip.id)
    }
    
    // Reset preview for new clip
    tieredPreview.reset()
    if (newClip?.source_path) {
      tieredPreview.requestPoster(newClip.source_path)
    }
  }, [clipNavigationInfo, monitorClipIndex, tieredPreview])
  
  // Reset clip index when job changes
  useEffect(() => {
    setMonitorClipIndex(0)
  }, [selectedJobId])

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
  // Phase 9E: Guard against silent overwrite of manual preview edits
  const applyPresetSettings = (settings: DeliverSettings, forceApply: boolean = false) => {
    // Phase 9E: Check if any overlay layers have been manually positioned
    const hasManualEdits = deliverSettings.overlay?.layers?.some(
      layer => layer.settings.positionSource === 'manual'
    ) ?? false
    
    // If manual edits exist and not forcing, show confirmation dialog
    if (hasManualEdits && !forceApply) {
      // Store pending settings and show dialog
      setPendingPresetSettings(settings)
      setPositionConflictDialogOpen(true)
      return
    }
    
    // Phase 9E: Assert invariant — confirm no silent overwrite
    assertNoSilentPresetOverwrite(hasManualEdits, forceApply, 'App.applyPresetSettings')
    
    // Apply preset settings with positionSource reset to "preset"
    const settingsWithPresetSource: DeliverSettings = {
      ...settings,
      overlay: {
        ...settings.overlay,
        layers: settings.overlay?.layers?.map(layer => ({
          ...layer,
          settings: {
            ...layer.settings,
            positionSource: 'preset' as const,
          }
        })) ?? [],
      }
    }
    
    setDeliverSettings(settingsWithPresetSource)
    const preset = presetManager.getPreset(presetManager.selectedPresetId || '')
    setAppliedPresetName(preset?.name || null)
  }
  
  // Phase 9E: Handle preset position conflict dialog actions
  const handleKeepManualPosition = () => {
    setPositionConflictDialogOpen(false)
    setPendingPresetSettings(null)
    // Do not apply preset — keep current manual positions
  }
  
  const handleResetToPreset = () => {
    if (pendingPresetSettings) {
      // Force apply the preset (user confirmed)
      applyPresetSettings(pendingPresetSettings, true)
    }
    setPositionConflictDialogOpen(false)
    setPendingPresetSettings(null)
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
      // Trust Stabilisation: Do NOT clear error here
      // Errors must persist until user clicks "Dismiss"
      // Only fetch errors are set/cleared by this function
      const response = await fetch(`${BACKEND_URL}/monitor/jobs`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      
      // TERMINAL STATE INVARIANT: Never regress a terminal state.
      // If frontend knows a job is terminal, preserve that state even if
      // backend response temporarily shows a stale non-terminal state.
      setJobs(prev => {
        const prevTerminalStates = new Map<string, string>()
        for (const job of prev) {
          if (isJobTerminal(job.status)) {
            prevTerminalStates.set(job.id, job.status.toUpperCase())
          }
        }
        
        return (data.jobs as JobSummary[]).map(job => {
          const prevTerminal = prevTerminalStates.get(job.id)
          // If we previously knew this job was terminal, preserve that status
          if (prevTerminal && !isJobTerminal(job.status)) {
            return { ...job, status: prevTerminal }
          }
          return job
        })
      })
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
      const detail = await response.json() as JobDetail
      
      // TERMINAL STATE INVARIANT: Preserve terminal states from prior detail
      setJobDetails(prev => {
        const prevDetail = prev.get(jobId)
        if (prevDetail && isJobTerminal(prevDetail.status) && !isJobTerminal(detail.status)) {
          // Prior state was terminal but new state is not — preserve terminal state
          return new Map(prev).set(jobId, { ...detail, status: prevDetail.status })
        }
        return new Map(prev).set(jobId, detail)
      })
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

  // DRAG & DROP REMOVED: Prevent browser default file opening behavior
  // Drag & drop is completely removed from UI for honesty.
  // Users must use explicit "Select Files" and "Select Folder" buttons.
  useEffect(() => {
    // Prevent browser default (opening files when dropped)
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
  
  // Detect job status transitions for status log
  useEffect(() => {
    jobs.forEach(job => {
      const prevStatus = prevJobStatuses.current.get(job.id)
      const currentStatus = job.status.toUpperCase()
      
      // Only log if status actually changed
      if (prevStatus && prevStatus !== currentStatus) {
        // Check for terminal states
        if (currentStatus === 'COMPLETED') {
          addStatusLogEntry(statusMessages.jobCompleted(
            job.id,
            job.completed_count,
            job.total_tasks
          ))
        } else if (currentStatus === 'FAILED') {
          addStatusLogEntry(statusMessages.jobFailed(job.id))
        }
      }
      
      // Update tracked status
      prevJobStatuses.current.set(job.id, currentStatus)
    })
    
    // Clean up statuses for jobs that no longer exist
    const currentJobIds = new Set(jobs.map(j => j.id))
    Array.from(prevJobStatuses.current.keys()).forEach(jobId => {
      if (!currentJobIds.has(jobId)) {
        prevJobStatuses.current.delete(jobId)
      }
    })
  }, [jobs, addStatusLogEntry])
  
  // V1 Demo: Heartbeat messages for long-running encodes
  // Truthful feedback without fake progress percentages or ETAs
  useEffect(() => {
    const runningJobs = jobs.filter(job => job.status.toUpperCase() === 'RUNNING')
    const now = Date.now()
    
    runningJobs.forEach(job => {
      const lastHeartbeat = lastHeartbeatTime.current.get(job.id) || 0
      
      // Emit heartbeat if enough time has passed
      if (now - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
        addStatusLogEntry(statusMessages.encodingHeartbeat(job.id))
        lastHeartbeatTime.current.set(job.id, now)
      }
    })
    
    // Clean up heartbeat tracking for completed/cancelled jobs
    Array.from(lastHeartbeatTime.current.keys()).forEach(jobId => {
      const job = jobs.find(j => j.id === jobId)
      if (!job || job.status.toUpperCase() !== 'RUNNING') {
        lastHeartbeatTime.current.delete(jobId)
      }
    })
  }, [jobs, addStatusLogEntry])

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
    const job = jobs.find(j => j.id === jobId)
    try {
      setLoading(true)
      const response = await fetch(`${BACKEND_URL}/control/jobs/${jobId}/resume`, { method: 'POST' })
      if (!response.ok) {
        const normalized = await normalizeResponseError(response, '/control/jobs/resume', jobId)
        throw new Error(normalized.message)
      }
      logStateTransition(jobId, job?.status || null, 'RUNNING', 'App.resumeJob')
      addStatusLogEntry(statusMessages.jobResumed(jobId))
      await fetchJobDetail(jobId)
      await fetchJobs()
    } catch (err) {
      setError(createJobError('resume', jobId, err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setLoading(false)
    }
  }

  // REMOVED: retryFailedClips - violates golden path (no retry logic)

  const cancelJob = async (jobId: string) => {
    // Phase 19: No confirmation prompts - execute immediately
    const job = jobs.find(j => j.id === jobId)
    try {
      setLoading(true)
      const response = await fetch(`${BACKEND_URL}/control/jobs/${jobId}/cancel`, { method: 'POST' })
      if (!response.ok) {
        const normalized = await normalizeResponseError(response, '/control/jobs/cancel', jobId)
        throw new Error(normalized.message)
      }
      logStateTransition(jobId, job?.status || null, 'CANCELLED', 'App.cancelJob')
      addStatusLogEntry(statusMessages.jobCancelled(jobId))
      await fetchJobDetail(jobId)
      await fetchJobs()
      
      // Trust Stabilisation: Do NOT clear errors on success
      // Errors persist until user clicks "Dismiss"
    } catch (err) {
      setError(createJobError('cancel', jobId, err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setLoading(false)
    }
  }

  // ============================================
  // Phase 16: New Job Actions (Start, Pause, Delete)
  // ============================================

  const startJob = async (jobId: string) => {
    // DOGFOOD FIX: Idempotency guard — reject duplicate start requests immediately
    if (jobOperationInFlight.current.has(jobId)) {
      console.debug(`[startJob] Blocked duplicate start for ${jobId}`)
      return
    }
    jobOperationInFlight.current.add(jobId)
    
    // Hardening: Validate job is pending before starting
    const job = jobs.find(j => j.id === jobId)
    if (job) {
      const isPending = assertJobPendingForRender(jobId, job.status, 'App.startJob')
      if (!isPending) {
        // Invariant failed but don't block — backend will reject if truly invalid
        // The invariant banner will show the warning
      }
    }
    
    // Phase 16.4: No confirmation for routine actions
    try {
      setLoading(true)
      const response = await fetch(`${BACKEND_URL}/control/jobs/${jobId}/start`, { method: 'POST' })
      if (!response.ok) {
        const normalized = await normalizeResponseError(response, '/control/jobs/start', jobId)
        throw new Error(normalized.message)
      }
      // Log successful state transition
      logStateTransition(jobId, job?.status || null, 'RUNNING', 'App.startJob')
      if (job) {
        addStatusLogEntry(statusMessages.jobStarted(jobId, job.total_tasks))
      }
      await fetchJobDetail(jobId)
      await fetchJobs()
    } catch (err) {
      setError(createJobError('start', jobId, err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setLoading(false)
      jobOperationInFlight.current.delete(jobId)  // DOGFOOD FIX: Reset guard
    }
  }

  const pauseJob = async (jobId: string) => {
    // Phase 16.4: No confirmation for routine actions
    const job = jobs.find(j => j.id === jobId)
    try {
      setLoading(true)
      const response = await fetch(`${BACKEND_URL}/control/jobs/${jobId}/pause`, { method: 'POST' })
      if (!response.ok) {
        const normalized = await normalizeResponseError(response, '/control/jobs/pause', jobId)
        throw new Error(normalized.message)
      }
      logStateTransition(jobId, job?.status || null, 'PAUSED', 'App.pauseJob')
      addStatusLogEntry(statusMessages.jobPaused(jobId))
      await fetchJobDetail(jobId)
      await fetchJobs()
    } catch (err) {
      setError(createJobError('pause', jobId, err instanceof Error ? err.message : 'Unknown error'))
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
        const normalized = await normalizeResponseError(response, '/control/jobs/delete', jobId)
        throw new Error(normalized.message)
      }
      // Clear selection if deleted job was selected
      if (selectedJobId === jobId) {
        setSelectedJobId(null)
        setSelectedClipIds(new Set())
      }
      // V1 Hardening: Clear any error banner when job is successfully deleted
      setError('')
      addStatusLogEntry(statusMessages.jobDeleted(jobId))
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
      setError(createJobError('delete', jobId, err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setLoading(false)
    }
  }

  // V1 Hardening: Clear all completed/failed jobs in one action
  const clearCompletedJobs = async () => {
    const completedStatuses = ['COMPLETED', 'FAILED', 'PARTIAL']
    const completedJobs = jobs.filter(j => completedStatuses.includes(j.status.toUpperCase()))
    if (completedJobs.length === 0) return
    
    try {
      setLoading(true)
      let deletedCount = 0
      for (const job of completedJobs) {
        const response = await fetch(`${BACKEND_URL}/control/jobs/${job.id}`, { method: 'DELETE' })
        if (response.ok) {
          deletedCount++
          // Clear selection if deleted job was selected
          if (selectedJobId === job.id) {
            setSelectedJobId(null)
            setSelectedClipIds(new Set())
          }
        }
      }
      if (deletedCount > 0) {
        addStatusLogEntry({
          id: crypto.randomUUID(),
          timestamp: new Date(),
          level: 'info',
          message: `Cleared ${deletedCount} completed job(s)`,
        })
        await fetchJobs()
      }
    } catch (err) {
      setError(`Failed to clear completed jobs: ${err instanceof Error ? err.message : 'Unknown error'}`)
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

  // REMOVED: requeueJob - violates golden path (no requeue logic)

  // ============================================
  // Create Job — Canonical Ingestion Pipeline
  // ============================================
  // PHASE D3: Job creation is INDEPENDENT of preview state.
  // - Preview availability does NOT block job creation
  // - Preview errors are NOT treated as fatal
  // - Clicking "Generate Proxies" creates a Job regardless of preview state
  // - No preview generation is triggered implicitly
  // - No playback checks are involved

  const createManualJob = async () => {
    // Mark that user has attempted to submit (enables blocking error display)
    setHasSubmitIntent(true)
    
    // Determine effective output directory
    const effectiveOutputDir = outputDirectory || deliverSettings.output_dir || ''
    
    // Use canonical ingestion pipeline
    // NOTE: This does NOT check or require preview state
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
    
    // PROBLEM #6 FIX: DON'T clear selected files - keep monitor source loaded
    // Phase 3: Clear selected files after successful job creation
    // setSelectedFiles([])  -- COMMENTED OUT to keep playback after job queued
    
    // Success: clear preset selection, keep output directory
    presetManager.selectPreset(null)
    setAppliedPresetName(null)
    
    // Fetch jobs and select the newly created one
    await fetchJobs()
    setSelectedJobId(result.jobId)
    
    // Phase F: Queue is always visible, just highlight the new job
    setHighlightedJobId(result.jobId)
    // Clear highlight after 500ms
    setTimeout(() => setHighlightedJobId(null), 500)
  }
  
  // ============================================
  // V2 Step 3: Execute V2 (Thin Client JobSpec)
  // ============================================
  const executeV2Job = async () => {
    // Determine effective output directory
    const effectiveOutputDir = outputDirectory || deliverSettings.output_dir || ''
    
    // Guard: Must have output directory
    if (!effectiveOutputDir) {
      setError('Output directory must be set for V2 execution')
      return
    }
    
    // Guard: Must have source files
    if (!selectedFiles.length) {
      setError('No source files selected for V2 execution')
      return
    }
    
    // Execute V2 job (compiles JobSpec, sends to backend, updates store)
    const success = await executeV2({
      sourcePaths: selectedFiles,
      outputDirectory: effectiveOutputDir,
      deliverSettings: deliverSettings,
    })
    
    if (success) {
      // Clear selected files after successful V2 execution
      setSelectedFiles([])
      addStatusLogEntry({
        id: crypto.randomUUID(),
        timestamp: new Date(),
        level: 'success',
        message: 'V2 execution completed successfully',
      })
    }
  }
  
  /* REMOVED: Drag & drop completely removed from UI for honesty
   * Use explicit "Select Files" and "Select Folder" buttons instead.
   *
  // Phase 4C: Drop confirmation flow handlers
  const handleFilesDropped = useCallback((paths: string[]) => {
    // Check for blocking conditions
    if (workspaceMode === 'design') {
      setError('Cannot ingest files in design mode')
      return
    }
    
    if (ingestion.isIngesting) {
      setError('Cannot drop files while ingestion is in progress')
      return
    }
    
    if (!outputDirectory) {
      setError('Output directory must be set before dropping files')
      return
    }
    
    // Show confirmation dialog
    setDroppedPaths(paths)
    setShowDropConfirmation(true)
  }, [workspaceMode, ingestion.isIngesting, outputDirectory])
  
  const handleDropConfirm = useCallback(async () => {
    setShowDropConfirmation(false)
    
    if (droppedPaths.length === 0) {
      return
    }
    
    // Check if any dropped paths are folders (heuristic: no file extension)
    const folders: string[] = []
    const files: string[] = []
    
    for (const path of droppedPaths) {
      // Simple heuristic: paths without extensions or ending in / are folders
      const hasExtension = /\.[a-zA-Z0-9]+$/.test(path)
      if (!hasExtension || path.endsWith('/')) {
        folders.push(path)
      } else {
        files.push(path)
      }
    }
    
    // If folders are present, enumerate them
    let allFiles = [...files]
    if (folders.length > 0) {
      for (const folder of folders) {
        try {
          const response = await fetch(`${BACKEND_URL}/filesystem/enumerate?path=${encodeURIComponent(folder)}`)
          if (!response.ok) {
            setError(`Failed to enumerate folder: ${folder}`)
            continue
          }
          const data = await response.json()
          if (data.error) {
            setError(`Error enumerating folder ${folder}: ${data.error}`)
            continue
          }
          if (data.files.length === 0) {
            setError(`No valid media files found in folder: ${folder}`)
            continue
          }
          allFiles.push(...data.files)
        } catch (err) {
          setError(`Failed to enumerate folder ${folder}: ${err instanceof Error ? err.message : 'Unknown error'}`)
          continue
        }
      }
    }
    
    // If no valid files after enumeration, don't create job
    if (allFiles.length === 0) {
      setError('No valid media files to ingest')
      setDroppedPaths([])
      return
    }
    
    // Use canonical ingestion pipeline with all enumerated files
    const result = await ingestion.ingest({
      sourcePaths: allFiles,
      outputDir: outputDirectory,
      deliverSettings: deliverSettings,
      engine: selectedEngine,
      presetId: presetManager.selectedPresetId,
    })
    
    if (!result.success) {
      setError(`Failed to ingest dropped files: ${result.error}`)
    } else {
      // Fetch jobs and select the newly created one
      await fetchJobs()
      setSelectedJobId(result.jobId)
    }
    
    // Clear dropped paths
    setDroppedPaths([])
  }, [droppedPaths, outputDirectory, deliverSettings, selectedEngine, presetManager.selectedPresetId, ingestion, fetchJobs])
  
  const handleDropCancel = useCallback(() => {
    setShowDropConfirmation(false)
    setDroppedPaths([])
  }, [])
  */

  // ============================================
  // File/Folder Selection (Electron)
  // ============================================

  // Select files via native OS dialog
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
  // Path Favorites (Output Directories)
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
  // Folder Favorites (Source Browsing) — Phase 4A
  // ============================================

  const addFolderFavorite = (path: string) => {
    if (!folderFavorites.includes(path)) {
      const updated = [...folderFavorites, path]
      setFolderFavorites(updated)
      localStorage.setItem('awaire_proxy_folder_favorites', JSON.stringify(updated))
    }
  }

  const removeFolderFavorite = (path: string) => {
    const updated = folderFavorites.filter(p => p !== path)
    setFolderFavorites(updated)
    localStorage.setItem('awaire_proxy_folder_favorites', JSON.stringify(updated))
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
  // Phase 4B: Expand/Collapse Controls
  // ============================================

  // Toggle a single job's expand state
  const toggleJobExpanded = useCallback((jobId: string) => {
    setExpandedJobIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(jobId)) {
        newSet.delete(jobId)
      } else {
        newSet.add(jobId)
      }
      return newSet
    })
  }, [])

  // Check if a job should be expanded (explicit expand OR single-clip job default)
  // Job Lifecycle Truth: Auto-collapse terminal jobs to reduce visual noise
  const isJobExpanded = useCallback((jobId: string, totalTasks: number, status?: string): boolean => {
    // If user has explicitly toggled, respect that
    if (expandedJobIds.has(jobId)) return true
    
    // Job Lifecycle Truth: Auto-collapse completed/terminal jobs
    // V1: COMPLETED_WITH_WARNINGS removed - only COMPLETED, FAILED, CANCELLED are terminal
    const normalizedStatus = status?.toUpperCase() || ''
    const isTerminal = ['COMPLETED', 'FAILED', 'CANCELLED'].includes(normalizedStatus)
    if (isTerminal) return false
    
    // Default: single-clip jobs are expanded, multi-clip jobs are collapsed
    return totalTasks === 1
  }, [expandedJobIds])

  // Expand all jobs
  const expandAllJobs = useCallback(() => {
    const allJobIds = jobs.map(j => j.id)
    setExpandedJobIds(new Set(allJobIds))
  }, [jobs])

  // Collapse all jobs (clear the expanded set)
  const collapseAllJobs = useCallback(() => {
    setExpandedJobIds(new Set())
  }, [])

  // ============================================
  // Clip Selection
  // ============================================

  const handleClipClick = useCallback((clipId: string, event: React.MouseEvent) => {
    const currentJobId = selectedJobId
    if (!currentJobId) return
    
    const detail = jobDetails.get(currentJobId)
    if (!detail) return

    // Phase 4B: Always update preview to clicked clip
    setPreviewClipId(clipId)
    
    // v3: Sync monitor clip index with clicked clip
    const clipIndex = detail.tasks.findIndex(t => t.id === clipId)
    if (clipIndex !== -1) {
      setMonitorClipIndex(clipIndex)
      
      // Reset preview for the new clip
      const task = detail.tasks[clipIndex]
      if (task?.source_path) {
        tieredPreview.reset()
        tieredPreview.requestPoster(task.source_path)
      }
    }

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
  }, [selectedJobId, jobDetails, selectedClipIds, tieredPreview])

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
  // Job Reordering (internal drag between queue items only)
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
      // V1: COMPLETED_WITH_WARNINGS removed - only COMPLETED or FAILED
      const status = job.status.toLowerCase()
      if (status === 'running') counts.running++
      else if (status === 'pending') counts.pending++
      else if (status === 'completed') counts.completed++
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
      {/* Hardening: Invariant Violation Banner (Alpha diagnostics) */}
      {/* V1 Demo: Suppress in demo mode for cleaner presentations */}
      <InvariantBanner enabled={FEATURE_FLAGS.ALPHA_DIAGNOSTICS_ENABLED && !FEATURE_FLAGS.DEMO_MODE} />
      
      {/* Internal Audit Mode Banner (dev/test-only) */}
      <AuditModeBanner />
      
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
          <img
            src="/branding/awaire-logo.png"
            alt="Awaire"
            style={{
              height: '1.5rem',
              width: 'auto',
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          />
          
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
            
            {/* V2 Mode Toggle (DEV-only) */}
            {!FEATURE_FLAGS.DEMO_MODE && (
              <button
                data-testid="v2-mode-toggle"
                onClick={toggleV2Mode}
                style={{
                  padding: '0.125rem 0.5rem',
                  fontSize: '0.5625rem',
                  fontWeight: 600,
                  color: isV2ModeEnabled ? '#10b981' : 'var(--text-dim)',
                  background: isV2ModeEnabled ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                  border: `1px solid ${isV2ModeEnabled ? 'rgba(16, 185, 129, 0.4)' : 'var(--border-primary)'}`,
                  borderRadius: 'var(--radius-sm)',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                V2 {isV2ModeEnabled ? 'ON' : 'OFF'}
              </button>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {/* V2 Run Button (when V2 mode enabled and files selected) */}
          {isV2ModeEnabled && selectedFiles.length > 0 && (
            <Button
              data-testid="run-v2-button"
              variant="primary"
              size="md"
              onClick={executeV2Job}
              loading={isV2Encoding}
              disabled={isV2Encoding || !outputDirectory}
            >
              {isV2Encoding ? 'Encoding...' : '▶ Run (V2)'}
            </Button>
          )}
          
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

      {/* Error Banner — V1 Demo: Suppress raw backend errors in demo mode */}
      {error && !FEATURE_FLAGS.DEMO_MODE && (
        <div
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: 'var(--error-bg)',
            color: 'var(--error-fg)',
            borderBottom: '1px solid var(--error-border)',
            fontSize: '0.875rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '1rem',
            minHeight: 'fit-content',
            wordWrap: 'break-word',
            overflowWrap: 'break-word',
            overflow: 'visible',
          }}
        >
          <span style={{ flex: 1, lineHeight: 1.5 }}>{error}</span>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setError('')}
            style={{ flexShrink: 0 }}
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* V2 Result Panel — Shows encoding status and results when V2 mode is active */}
      {isV2ModeEnabled && v2ExecutionStatus !== 'idle' && (
        <div style={{ padding: '0 1rem' }}>
          <V2ResultPanel />
        </div>
      )}

      {/* ============================================ */}
      {/* 3-ZONE IMMUTABLE LAYOUT                     */}
      {/* ============================================ */}
      {/* 
        RIGID 3-ZONE LAYOUT — IMMUTABLE STRUCTURE
        
        ┌────────────┬─────────────────┬────────────┐
        │   LEFT     │     CENTER      │   RIGHT    │
        │   352px    │   (Preview)     │   420px    │
        │  IMMUTABLE │  fills remain   │  IMMUTABLE │
        │  Sources   │   Preview ONLY  │  Settings  │
        │            │                 │   /Queue   │
        │            │                 │  [tabbed]  │
        └────────────┴─────────────────┴────────────┘
        
        INVARIANTS:
        1. Queue NEVER resizes Preview
        2. Preview NEVER resizes due to jobs
        3. Left/Right zones are FIXED width
        4. NO animations, NO dynamic resizing
        5. StatusLog floats independently (fixed position)
        
        Desktop-only. Minimum width: 1280px.
      */}
      <div 
        ref={appContainerRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
          outline: 'none',
          minWidth: '1280px',
        }}
      >
        {/* DRAG & DROP REMOVED - Use explicit "Select Files" and "Select Folder" buttons */}
        
        {/* 3-Zone Rigid Layout */}
        <WorkspaceLayout
          leftZone={
            /* LEFT ZONE: MediaWorkspace - Sources + Output + Processing + Create Job */
            <MediaWorkspace
              selectedFiles={selectedFiles}
              onFilesChange={setSelectedFiles}
              onSelectFilesClick={selectFiles}
              engines={engines}
              selectedEngine={selectedEngine}
              onEngineChange={setSelectedEngine}
              settingsPresets={presetManager.presets.map(p => ({
                id: p.id,
                name: p.name,
                description: p.description || undefined,
                fingerprint: p.id, // Use preset ID as fingerprint
                settings_snapshot: p.settings,
              }))}
              selectedSettingsPresetId={presetManager.selectedPresetId}
              onSettingsPresetChange={(id) => presetManager.selectPreset(id)}
              outputDirectory={outputDirectory}
              onOutputDirectoryChange={setOutputDirectory}
              onSelectFolderClick={selectOutputFolder}
              pathFavorites={pathFavorites}
              onAddFavorite={addPathFavorite}
              onRemoveFavorite={removePathFavorite}
              folderFavorites={folderFavorites}
              onAddFolderFavorite={addFolderFavorite}
              onRemoveFolderFavorite={removeFolderFavorite}
              onCreateJob={createManualJob}
              hasSubmitIntent={hasSubmitIntent}
              onClear={() => {
                // PROBLEM #4 FIX: Clear preview state when clearing sources
                ingestion.clearPendingPaths()
                setOutputDirectory('')
                currentPreviewSource.current = null
                tieredPreview.reset()
              }}
              loading={loading || ingestion.isIngesting}
              hasElectron={hasElectron}
              workspaceMode={workspaceMode}
              appMode={appMode}
              v2JobSpecSubmitted={v2JobSpecSubmitted}
            />
          }
          centerZone={
            /* CENTER ZONE: MonitorSurface — Full-bleed state-driven display */
            /* Tiered Preview System: Poster → Burst → Optional Video */
            <MonitorSurface
              state={monitorState}
              sourceMetadata={monitorSourceMetadata}
              jobProgress={monitorJobProgress}
              jobResult={monitorJobResult}
              tieredPreview={tieredPreview}
              currentSourcePath={currentPreviewSource.current}
              // Clip navigation (v3)
              currentClip={clipNavigationInfo?.currentClip}
              totalClips={clipNavigationInfo?.totalClips}
              onPreviousClip={handlePreviousClip}
              onNextClip={handleNextClip}
              isFirstClip={clipNavigationInfo?.isFirstClip ?? true}
              isLastClip={clipNavigationInfo?.isLastClip ?? true}
            />
          }
          rightZone={
            /* RIGHT ZONE: Queue ONLY (Phase F: Settings moved to left panel) */
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
                onExpandAll={expandAllJobs}
                onCollapseAll={collapseAllJobs}
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
                  {/* V1 Hardening: Clear completed jobs button */}
                  {jobs.filter(j => ['COMPLETED', 'FAILED', 'PARTIAL'].includes(j.status.toUpperCase())).length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearCompletedJobs}
                      disabled={loading}
                      data-testid="clear-completed-btn"
                      title="Remove completed, failed, and partial jobs from queue"
                    >
                      Clear Completed
                    </Button>
                  )}
                </div>
              </div>

              {/* Job Groups */}
              <div style={{ padding: '0.5rem', flex: 1, overflow: 'auto', maxHeight: '100%' }}>
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
                        <img
                          src="/branding/awaire-logo.png"
                          alt="Awaire"
                          style={{
                            opacity: 0.1,
                            height: '5rem',
                            width: 'auto',
                            marginBottom: '1rem',
                            userSelect: 'none',
                            pointerEvents: 'none',
                          }}
                        />
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
                    // Trust Stabilisation: Build settings summary for queue export intent visibility
                    const settingsSummary = detail?.settings_summary ? {
                      codec: detail.settings_summary.codec,
                      resolution: detail.settings_summary.resolution,
                      container: detail.settings_summary.container,
                    } : undefined
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
                        settingsSummary={settingsSummary}
                        isSelected={selectedJobId === job.id}
                        isExpanded={isJobExpanded(job.id, job.total_tasks, job.status)}
                        isHighlighted={highlightedJobId === job.id}
                        onToggleExpand={() => toggleJobExpanded(job.id)}
                        onSelect={() => {
                          const isDeselecting = job.id === selectedJobId
                          setSelectedJobId(isDeselecting ? null : job.id)
                          setSelectedClipIds(new Set())
                          setActiveStatusFilters(new Set())
                          // Phase 4B: Set preview to first clip of selected job
                          if (!isDeselecting && detail?.tasks?.[0]) {
                            setPreviewClipId(detail.tasks[0].id)
                          } else {
                            setPreviewClipId(null)
                          }
                        }}
                        onRevealClip={hasElectron ? revealInFolder : undefined}
                        onStart={() => startJob(job.id)}
                        onPause={() => pauseJob(job.id)}
                        onResume={() => resumeJob(job.id)}
                        onCancel={() => cancelJob(job.id)}
                        onDelete={() => deleteJob(job.id)}
                        onRebindPreset={() => setSelectedJobId(job.id)}
                        onDragStart={handleJobDragStart(job.id)}
                        onDragOver={handleJobDragOver(job.id)}
                        onDrop={handleJobDrop(job.id)}
                        isDragging={draggedJobId === job.id}
                        hasOtherJobRunning={hasAnyJobRunning && job.status.toUpperCase() !== 'RUNNING'}
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
      
      {/* Phase 9E: Preset Position Conflict Dialog */}
      <PresetPositionConflictDialog
        isOpen={positionConflictDialogOpen}
        onKeepManual={handleKeepManualPosition}
        onResetToPreset={handleResetToPreset}
      />
      
      {/* REMOVED: Drag & drop completely removed from UI for honesty
      <DropConfirmationDialog
        isOpen={showDropConfirmation}
        paths={droppedPaths}
        onConfirm={handleDropConfirm}
        onCancel={handleDropCancel}
      />
      */}
      
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
      
      {/* Status Log - bottom-left panel with plain English status messages */}
      <StatusLog entries={statusLogEntries} demoMode={FEATURE_FLAGS.DEMO_MODE} />
      
      {/* V1 OBSERVABILITY: Debug panel for UI event log (DEV only, toggle with Cmd+Alt+D) */}
      <DebugPanel />
    </div>
  )
}

export default App
