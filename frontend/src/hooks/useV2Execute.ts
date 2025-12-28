/**
 * useV2Execute — V2 JobSpec Compiler and Executor
 * 
 * V2 Step 3: UI as JobSpec Compiler (Thin Client)
 * 
 * INVARIANT: UI compiles JobSpec, backend executes. UI never mutates execution state.
 * 
 * This hook:
 * 1. Compiles current UI settings into a JobSpec
 * 2. Sends to POST /v2/execute_jobspec
 * 3. Updates the V2 mode store with results (READ-ONLY observation)
 * 
 * The UI is a compiler, not authority.
 * Truth comes from JobExecutionResult.
 * 
 * After submission:
 * - All inputs that contributed to JobSpec are frozen
 * - UI cannot edit, toggle, or recompile
 * - Execution state is read-only from backend result
 */

import { useCallback } from 'react'
import { useV2ModeStore, V2JobResult } from '../stores/v2ModeStore'
import type { DeliverSettings } from '../components/DeliverControlPanel'

const BACKEND_URL = 'http://127.0.0.1:8085'

interface V2ExecuteParams {
  sourcePaths: string[]
  outputDirectory: string
  deliverSettings: DeliverSettings
}

interface JobSpecPayload {
  sources: string[]
  output_directory: string
  codec: string
  container: string
  resolution: string
  naming_template: string
  fps_mode: string
  fps_explicit?: number
}

export function useV2Execute() {
  const { 
    isV2ModeEnabled,
    v2ExecutionStatus,
    startV2Execution, 
    setV2Result, 
    setV2Error 
  } = useV2ModeStore()
  
  /**
   * Build JobSpec from UI settings.
   * 
   * This is the "compiler" function — converts UI state to V2 format.
   * Ensures V2-compliant naming template (includes {index} for multi-clip).
   */
  const buildJobSpec = useCallback((params: V2ExecuteParams): JobSpecPayload => {
    const { sourcePaths, outputDirectory, deliverSettings } = params
    
    // Resolve codec from UI settings
    const codec = deliverSettings.video?.codec || 'prores_proxy'
    
    // Resolve container from file settings
    const container = deliverSettings.file?.container || 'mov'
    
    // Resolve resolution from UI settings
    let resolution = 'same'
    if (deliverSettings.video?.resolution_policy === 'source') {
      resolution = 'same'
    } else if (deliverSettings.video?.resolution_preset) {
      // Map named presets to resolution values
      const presetMap: Record<string, string> = {
        'source': 'same',
        '1080p': '1920x1080',
        '2k': '2048x1080',
        '720p': '1280x720',
        '540p': '960x540',
      }
      resolution = presetMap[deliverSettings.video.resolution_preset] || 'same'
    } else if (deliverSettings.video?.width && deliverSettings.video?.height) {
      resolution = `${deliverSettings.video.width}x${deliverSettings.video.height}`
    }
    
    // Build naming template (ensure V2-compliant with {index} for multi-clip)
    let namingTemplate = deliverSettings.file?.naming_template || '{source_name}_proxy'
    
    // V2 Compliance: Auto-add {index} for multi-clip jobs if not present
    const isMultiClip = sourcePaths.length > 1
    const hasIndexToken = namingTemplate.includes('{index}')
    const hasSourceNameToken = namingTemplate.includes('{source_name}')
    
    if (isMultiClip && !hasIndexToken && !hasSourceNameToken) {
      // Add {index} prefix for uniqueness
      namingTemplate = `{index}_${namingTemplate}`
    }
    
    // FPS mode
    const fpsMode = deliverSettings.video?.frame_rate_policy === 'source' 
      ? 'same-as-source' 
      : 'explicit'
    
    const fpsExplicit = fpsMode === 'explicit' && deliverSettings.video?.frame_rate
      ? parseFloat(deliverSettings.video.frame_rate)
      : undefined
    
    return {
      sources: sourcePaths,
      output_directory: outputDirectory,
      codec,
      container,
      resolution,
      naming_template: namingTemplate,
      fps_mode: fpsMode,
      fps_explicit: fpsExplicit,
    }
  }, [])
  
  /**
   * Execute V2 job.
   * 
   * Compiles JobSpec and sends to backend. Updates store with result.
   */
  const executeV2 = useCallback(async (params: V2ExecuteParams): Promise<boolean> => {
    // Guard: Must be in V2 mode
    if (!isV2ModeEnabled) {
      console.warn('[V2] Attempted V2 execution while V2 mode disabled')
      return false
    }
    
    // Guard: Must have sources
    if (!params.sourcePaths.length) {
      setV2Error('No source files selected')
      return false
    }
    
    // Guard: Must have output directory
    if (!params.outputDirectory) {
      setV2Error('No output directory specified')
      return false
    }
    
    // Start execution (sets status to "encoding")
    startV2Execution()
    
    try {
      // Compile JobSpec
      const jobSpec = buildJobSpec(params)
      
      console.log('[V2] Executing JobSpec:', jobSpec)
      
      // Send to backend
      const response = await fetch(`${BACKEND_URL}/v2/execute_jobspec`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(jobSpec),
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: response.statusText }))
        const errorMessage = typeof errorData.detail === 'string' 
          ? errorData.detail 
          : errorData.detail?.message || 'Execution failed'
        
        setV2Error(errorMessage)
        return false
      }
      
      const result: V2JobResult = await response.json()
      
      console.log('[V2] Execution result:', result)
      
      // Update store with result
      setV2Result(result)
      
      return result.final_status === 'COMPLETED'
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[V2] Execution error:', error)
      setV2Error(`Execution failed: ${errorMessage}`)
      return false
    }
  }, [isV2ModeEnabled, buildJobSpec, startV2Execution, setV2Result, setV2Error])
  
  return {
    isV2ModeEnabled,
    isEncoding: v2ExecutionStatus === 'encoding',
    buildJobSpec,
    executeV2,
  }
}
