/**
 * useWatchFolderIntegration — Renderer-side Watch Folder Integration
 * 
 * PURPOSE:
 * Bridges the gap between the main process file watcher and the renderer
 * process job creation system. Listens for file detection events from the
 * main process, performs eligibility checks, builds JobSpecs, and enqueues
 * jobs using the existing FIFO queue system.
 * 
 * ARCHITECTURE:
 * - Main process: File watching via chokidar (has Node.js filesystem access)
 * - IPC: Main notifies renderer via 'watch-folder:file-detected' events
 * - Renderer: This hook receives events, validates, and creates jobs
 * 
 * EXECUTION PIPELINE:
 * 1. Main process detects file → sends 'watch-folder:file-detected' IPC event
 * 2. This hook receives event with {watch_folder_id, file_path}
 * 3. Eligibility checks: Is file already processed? Is watch folder enabled?
 * 4. Resolve preset by preset_id from watch folder config
 * 5. Build JobSpec using buildJobSpec(file_path + preset.settings)
 * 6. Validate JobSpec (basic checks)
 * 7. Enqueue JobSpec to queuedJobSpecs array
 * 8. Mark file as processed to prevent duplicates
 * 9. Log event with job_id and status
 * 
 * QC GUARANTEES:
 * - No execution bypass: Uses existing preset → JobSpec → queue → execution pipeline
 * - FIFO preservation: Jobs added to end of queuedJobSpecs array
 * - Duplicate prevention: isFileProcessed() check before enqueueing
 * - Preset validation: Preset must exist and be valid
 * - JobSpec validation: buildJobSpec() must succeed (throws on invalid settings)
 * 
 * USAGE:
 * ```tsx
 * function App() {
 *   const [queuedJobSpecs, setQueuedJobSpecs] = useState<JobSpec[]>([])
 *   const { watchFolders, events } = useWatchFolders()
 *   const { presets } = usePresets()
 *   
 *   useWatchFolderIntegration({
 *     watchFolders,
 *     presets,
 *     onEnqueueJob: (jobSpec) => {
 *       setQueuedJobSpecs(prev => [...prev, jobSpec])
 *     }
 *   })
 * }
 * ```
 */

import { useEffect, useCallback, useRef } from 'react'
import type { WatchFolder } from '../types/watchFolders'
import type { Preset } from './usePresets'
import type { JobSpec } from '../utils/buildJobSpec'
import { buildJobSpec } from '../utils/buildJobSpec'

// Note: window.electron type is declared in App.tsx to avoid duplicate declarations

export interface UseWatchFolderIntegrationOptions {
  /** Array of watch folders from useWatchFolders */
  watchFolders: WatchFolder[]
  /** Array of presets from usePresets */
  presets: Preset[]
  /** Callback to check if a file has been processed */
  isFileProcessed: (filePath: string) => boolean
  /** Callback to mark a file as processed */
  markFileProcessed: (filePath: string, mtime: number, hash?: string) => void
  /** Callback to log watch folder events */
  logEvent: (event: {
    watch_folder_id: string
    file_path: string
    eligible: boolean
    rejection_reason?: string
    job_id?: string
  }) => void
  /** Callback to enqueue a job (adds to queuedJobSpecs array) */
  onEnqueueJob: (jobSpec: JobSpec) => void
  /** Callback to set watch folder error */
  setWatchFolderError?: (id: string, error: string) => void
  /** Callback to clear watch folder error */
  clearWatchFolderError?: (id: string) => void
}

/**
 * Hook to integrate watch folder file detection with job creation
 */
export function useWatchFolderIntegration(options: UseWatchFolderIntegrationOptions) {
  const {
    watchFolders,
    presets,
    isFileProcessed,
    markFileProcessed,
    logEvent,
    onEnqueueJob,
    setWatchFolderError,
    clearWatchFolderError,
  } = options
  
  // Use refs to avoid re-registering event listeners
  const watchFoldersRef = useRef(watchFolders)
  const presetsRef = useRef(presets)
  const isFileProcessedRef = useRef(isFileProcessed)
  const markFileProcessedRef = useRef(markFileProcessed)
  const logEventRef = useRef(logEvent)
  const onEnqueueJobRef = useRef(onEnqueueJob)
  const setWatchFolderErrorRef = useRef(setWatchFolderError)
  const clearWatchFolderErrorRef = useRef(clearWatchFolderError)
  
  // Update refs when dependencies change
  useEffect(() => {
    watchFoldersRef.current = watchFolders
  }, [watchFolders])
  
  useEffect(() => {
    presetsRef.current = presets
  }, [presets])
  
  useEffect(() => {
    isFileProcessedRef.current = isFileProcessed
  }, [isFileProcessed])
  
  useEffect(() => {
    markFileProcessedRef.current = markFileProcessed
  }, [markFileProcessed])
  
  useEffect(() => {
    logEventRef.current = logEvent
  }, [logEvent])
  
  useEffect(() => {
    setWatchFolderErrorRef.current = setWatchFolderError
  }, [setWatchFolderError])
  
  useEffect(() => {
    clearWatchFolderErrorRef.current = clearWatchFolderError
  }, [clearWatchFolderError])
  
  useEffect(() => {
    onEnqueueJobRef.current = onEnqueueJob
  }, [onEnqueueJob])
  
  /**
   * Handle file detection from main process
   */
  const handleFileDetected = useCallback((event: { watch_folder_id: string; file_path: string }) => {
    const { watch_folder_id, file_path } = event
    
    console.log('[WATCH FOLDER INTEGRATION] File detected:', { watch_folder_id, file_path })
    
    // Find the watch folder configuration
    const watchFolder = watchFoldersRef.current.find(wf => wf.id === watch_folder_id)
    
    if (!watchFolder) {
      console.warn('[WATCH FOLDER INTEGRATION] Watch folder not found:', watch_folder_id)
      logEventRef.current({
        watch_folder_id,
        file_path,
        eligible: false,
        rejection_reason: 'Watch folder configuration not found',
      })
      return
    }
    
    // Check if watch folder is enabled
    if (!watchFolder.enabled) {
      console.warn('[WATCH FOLDER INTEGRATION] Watch folder is disabled:', watch_folder_id)
      logEventRef.current({
        watch_folder_id,
        file_path,
        eligible: false,
        rejection_reason: 'Watch folder is disabled',
      })
      return
    }
    
    // Check if file has already been processed
    if (isFileProcessedRef.current(file_path)) {
      console.warn('[WATCH FOLDER INTEGRATION] File already processed:', file_path)
      logEventRef.current({
        watch_folder_id,
        file_path,
        eligible: false,
        rejection_reason: 'File already processed (duplicate)',
      })
      return
    }
    
    // Find the preset
    const preset = presetsRef.current.find(p => p.id === watchFolder.preset_id)
    
    if (!preset) {
      console.error('[WATCH FOLDER INTEGRATION] Preset not found:', watchFolder.preset_id)
      logEventRef.current({
        watch_folder_id,
        file_path,
        eligible: false,
        rejection_reason: `Preset not found: ${watchFolder.preset_id}`,
      })
      return
    }
    
    try {
      // Build JobSpec from preset settings + file path
      // Map DeliverSettings structure to buildJobSpec's OutputState
      const settings = preset.settings
      
      // Extract codec from video settings
      const codec = settings.video?.codec || 'prores_proxy'
      
      // Extract container from file settings
      const container = settings.file?.container || 'mov'
      
      // Extract resolution from video settings
      let resolution = 'same'
      if (settings.video?.resolution_policy === 'source') {
        resolution = 'same'
      } else if (settings.video?.resolution_preset) {
        const presetMap: Record<string, string> = {
          'source': 'same',
          '1080p': '1920x1080',
          '2k': '2048x1080',
          '720p': '1280x720',
          '540p': '960x540',
        }
        resolution = presetMap[settings.video.resolution_preset] || 'same'
      }
      
      // Extract filename template from file settings
      const filenameTemplate = settings.file?.naming_template || '{source_name}_proxy'
      
      // Extract output directory from preset
      const outputPath = settings.output_dir || ''
      
      // Extract FPS settings from video
      // Map frame_rate_policy to fps_mode
      let fpsMode: 'same-as-source' | 'explicit' = 'same-as-source'
      let fpsExplicit: number | null = null
      
      if (settings.video?.frame_rate_policy === 'explicit' && settings.video?.frame_rate) {
        fpsMode = 'explicit'
        fpsExplicit = parseFloat(settings.video.frame_rate)
      }
      
      // Determine delivery type (proxy or delivery) - default to proxy
      // This could be enhanced to read from preset metadata in the future
      const deliveryType = 'proxy' as const
      
      const jobSpec = buildJobSpec({
        sources: [file_path],
        outputPath,
        containerFormat: container,
        filenameTemplate,
        deliveryType,
        codec,
        resolution,
        fpsMode,
        fpsExplicit: fpsExplicit !== null ? fpsExplicit : undefined,
      })
      
      console.log('[WATCH FOLDER INTEGRATION] JobSpec built successfully:', jobSpec.job_id)
      
      // Enqueue the job (adds to queuedJobSpecs array)
      onEnqueueJobRef.current(jobSpec)
      
      // Mark file as processed (use current time as mtime)
      const mtime = Date.now()
      markFileProcessedRef.current(file_path, mtime)
      
      // Log success event
      logEventRef.current({
        watch_folder_id,
        file_path,
        eligible: true,
        job_id: jobSpec.job_id,
      })
      
      console.log('[WATCH FOLDER INTEGRATION] Job enqueued successfully:', {
        job_id: jobSpec.job_id,
        file_path,
        preset: preset.name,
      })
    } catch (error) {
      console.error('[WATCH FOLDER INTEGRATION] Failed to build JobSpec:', error)
      logEventRef.current({
        watch_folder_id,
        file_path,
        eligible: false,
        rejection_reason: `JobSpec build failed: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }, [])
  
  /**
   * Handle file rejection from main process
   */
  const handleFileRejected = useCallback((event: { watch_folder_id: string; file_path: string; reason: string }) => {
    const { watch_folder_id, file_path, reason } = event
    
    console.log('[WATCH FOLDER INTEGRATION] File rejected:', { watch_folder_id, file_path, reason })
    
    logEventRef.current({
      watch_folder_id,
      file_path,
      eligible: false,
      rejection_reason: reason,
    })
  }, [])
  
  /**
   * Handle watch folder errors from main process
   */
  const handleWatchFolderError = useCallback((event: { watch_folder_id: string; error: string }) => {
    const { watch_folder_id, error } = event
    
    console.error('[WATCH FOLDER INTEGRATION] Watch folder error:', { watch_folder_id, error })
    
    // Log error event (using empty file_path since this is a general error)
    logEventRef.current({
      watch_folder_id,
      file_path: '',
      eligible: false,
      rejection_reason: `Watch folder error: ${error}`,
    })
  }, [])
  
  /**
   * Register IPC event listeners
   */
  useEffect(() => {
    if (!window.electron?.onWatchFolderFileDetected) {
      console.warn('[WATCH FOLDER INTEGRATION] window.electron.onWatchFolderFileDetected not available')
      return
    }
    
    console.log('[WATCH FOLDER INTEGRATION] Registering IPC event listeners')
    
    // Register event listeners
    window.electron.onWatchFolderFileDetected(handleFileDetected)
    
    if (window.electron.onWatchFolderFileRejected) {
      window.electron.onWatchFolderFileRejected(handleFileRejected)
    }
    
    if (window.electron.onWatchFolderError) {
      window.electron.onWatchFolderError(handleWatchFolderError)
    }
    
    console.log('[WATCH FOLDER INTEGRATION] IPC event listeners registered')
    
    // Note: Electron IPC listeners cannot be easily unregistered from renderer side
    // They persist until the window is closed or the main process removes them
    // This is acceptable since we want to listen for the entire app lifecycle
  }, [handleFileDetected, handleFileRejected, handleWatchFolderError])
  
  return {
    // No return values needed - this hook only sets up event listeners
  }
}
